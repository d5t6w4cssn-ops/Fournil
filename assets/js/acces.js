// Accès selon le rôle (administrateur ou équipe), lecture et enregistrement des données.
// Remplace les écoutes temps réel et l'enregistrement du Fournil du script principal
// (initFirebase, save, actualiserApp lui délèguent leur travail).
//
// - Administrateur (UID fixé dans equipe-donnees.js) : tout, comme avant.
// - Équipe (fiche membres/{uid} avec role 'equipe') : Stock (ajouter / retirer), Historique
//   du stock, Recettes en consultation et tous les calculs. Tâches, Labo, Bureau, Magasin,
//   Calendrier et Réglages sont cachés ici ET refusés par les règles Firestore.
// - Avant la migration (boulangerie/stock absent), tout fonctionne exactement comme avant
//   pour l'administrateur ; l'équipe voit un message d'attente.
// - Stock : enregistré dans une transaction qui fusionne mes changements avec ceux des
//   autres (equipe-donnees.js, fusionnerStock) ; hors ligne, gardé sur l'appareil.
(() => {
  const E = window.FournilEquipe;
  const copie = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const PRENOM_ADMIN_DEFAUT = 'Responsable';
  const ONGLETS_INTERDITS = ['magasin', 'tasks', 'calendrier', 'settings', 'notes'];

  const a = {
    role: 'inconnu', // 'admin' | 'equipe' | 'aucun' | 'inconnu'
    uid: null,
    prenom: '',
    mode: null, // null : données pas encore reçues ; 'ancien' : avant migration ; 'separe' : après
  };
  let base = null; // Firestore
  const recu = { state: undefined, stock: undefined }; // undefined : pas encore reçu ; null : absent
  let baseStock = null; // dernière version du stock connue du serveur (mode séparé)
  let texteResteConnu = null; // dernier texte du reste (administrateur, mode séparé)
  let occupe = false; // un envoi du stock est en cours
  let aRefaire = false;
  let manque = false; // une version du stock est arrivée pendant l'envoi
  let fileStock = Promise.resolve();
  let produitsVus = null; // pour les alertes de seuil
  let calculs = null; // calculs partagés reçus (mode séparé)
  let membres = []; // fiches de l'équipe (administrateur)
  let premier = true;

  const col = () => base.collection('boulangerie');
  const moi = () => ({ uid: a.uid, prenom: a.prenom || (a.role === 'admin' ? PRENOM_ADMIN_DEFAUT : '') });

  // =====================================================================
  // Démarrage : rôle puis écoutes
  // =====================================================================
  async function demarrer(db) {
    base = db;
    const user = firebase.auth().currentUser;
    a.uid = user ? user.uid : null;
    if (E.estAdmin(a.uid)) {
      a.role = 'admin';
      appliquerRole();
      brancherAdmin();
      return;
    }
    let fiche = null;
    try {
      const snap = await base.collection('membres').doc(a.uid).get();
      fiche = snap.exists ? snap.data() : null;
    } catch (e) {
      if (!e || e.code !== 'permission-denied') {
        a.role = 'inconnu';
        appliquerRole();
        ecranMessage('Impossible de vérifier ton accès', 'Vérifie la connexion internet, puis touche « Réessayer ».', true);
        return;
      }
    }
    if (fiche && fiche.role === 'equipe') {
      a.role = 'equipe';
      a.prenom = String(fiche.prenom || '');
      appliquerRole();
      brancherEquipe();
    } else {
      a.role = 'aucun';
      appliquerRole();
      ecranMessage('Ce compte n’a pas encore accès à Fournil', 'Demande au responsable de la boulangerie de t’ajouter à l’équipe, puis reconnecte-toi.', false);
    }
  }

  function ecouter(ref, ok) {
    ref.onSnapshot(ok, (err) => { console.warn('Firestore erreur', err); updateSyncIndicator(false); });
  }

  function brancherAdmin() {
    ecouter(col().doc('state'), (snap) => { recevoirState(snap); updateSyncIndicator(true); });
    ecouter(col().doc('stock'), recevoirStock);
    ecouter(col().doc('labo'), recevoirLabo);
    ecouter(col().doc('recettes'), recevoirRecettes);
    ecouter(base.collection('calculs'), recevoirCalculs);
    ecouter(base.collection('membres'), (snap) => {
      membres = [];
      snap.forEach((d) => membres.push({ uid: d.id, ...d.data() }));
      const f = membres.find((m) => m.uid === a.uid);
      if (f && f.prenom) a.prenom = String(f.prenom);
      if (typeof tab !== 'undefined' && tab === 'settings' && activeModule === 'fournil') carteEquipe();
    });
    if (window.fournilSynchro) window.fournilSynchro.surveiller(base, ['state', 'stock', 'labo', 'recettes']);
  }

  function brancherEquipe() {
    ecouter(col().doc('stock'), (snap) => { recevoirStock(snap); updateSyncIndicator(true); });
    ecouter(col().doc('recettes'), recevoirRecettes);
    ecouter(base.collection('calculs'), recevoirCalculs);
    if (window.fournilSynchro) window.fournilSynchro.surveiller(base, ['stock', 'recettes']);
  }

  // =====================================================================
  // Réception des données
  // =====================================================================
  const lire = (snap) => (snap && snap.exists && snap.data().state ? JSON.parse(snap.data().state) : null);

  function recevoirState(snap) {
    recu.state = lire(snap);
    composer('state');
  }
  function recevoirStock(snap) {
    if (occupe && a.mode === 'separe') { manque = true; return; } // traitée après l'envoi
    recu.stock = lire(snap);
    composer('stock');
  }
  function recevoirLabo(snap) {
    const l = lire(snap);
    if (!l) return;
    L = l;
    normalizeLabo();
    if (activeModule === 'labo') renderLabo();
    if (window.fournilJour) window.fournilJour.verifier('labo');
  }
  function recevoirRecettes(snap) {
    if (snap.exists && window.rcApplyRemote) window.rcApplyRemote(snap.data());
  }
  function recevoirCalculs(snap) {
    const liste = [];
    snap.forEach((d) => liste.push(E.docVersCalcul(d.id, d.data())));
    liste.sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0));
    calculs = liste;
    if (a.mode === 'separe' && window.rcAppliquerCalculs) window.rcAppliquerCalculs(calculs);
  }

  /** Recompose l'état du Fournil (S) à partir de ce qui a été reçu. */
  function composer(source) {
    if (a.role === 'admin' && (recu.state === undefined || recu.stock === undefined)) return;
    if (a.role === 'equipe' && recu.stock === undefined) return;
    if (a.role !== 'admin' && a.role !== 'equipe') return;
    const ancienMode = a.mode;
    const nouveauMode = recu.stock ? 'separe' : 'ancien';
    if (nouveauMode === 'ancien') {
      a.mode = 'ancien';
      baseStock = null;
      if (a.role === 'equipe') {
        ecranMessage('Fournil n’est pas encore prêt pour l’équipe', 'Le responsable doit d’abord préparer les données (Réglages → Équipe). Reviens un peu plus tard.', false);
        return;
      }
      if (!recu.state) { apresComposition(); return; } // document vide : on garde l'état par défaut, comme avant
      S = copie(recu.state);
      normalizeState();
    } else {
      // baseStock = version du serveur sur laquelle repose le stock affiché ; elle ne change
      // qu'à l'arrivée d'une nouvelle version du stock (pas à celle des tâches)
      let stock;
      if (ancienMode !== 'separe' || !baseStock) {
        stock = copie(recu.stock);
        baseStock = copie(recu.stock);
      } else if (source === 'stock') {
        stock = E.fusionnerStock(baseStock, E.separer(S).stock, recu.stock);
        baseStock = copie(recu.stock);
      } else {
        stock = E.separer(S).stock;
      }
      const reste = a.role === 'admin' && recu.state ? E.separer(recu.state).reste : (a.role === 'admin' ? E.separer(S).reste : {});
      if (a.role === 'admin' && source === 'state') texteResteConnu = JSON.stringify(reste);
      S = E.assembler(reste, stock);
      normalizeState();
      if (a.role === 'admin' && texteResteConnu === null) texteResteConnu = JSON.stringify(E.separer(S).reste);
      a.mode = 'separe';
    }
    if (ancienMode !== a.mode) {
      document.body.classList.toggle('donnees-separees', a.mode === 'separe');
      if (window.rcAppliquerCalculs) window.rcAppliquerCalculs(a.mode === 'separe' ? (calculs || []) : null);
      if (a.role === 'equipe') ecranMessage(null);
    }
    apresComposition();
  }

  function apresComposition() {
    if (activeModule === 'fournil') render();
    if (typeof tab !== 'undefined' && tab === 'histo' && activeModule === 'fournil') renderHisto();
    if (typeof tab !== 'undefined' && tab === 'notes') renderNotes();
    verifierSeuils();
    if (window.fournilJour) window.fournilJour.verifier('fournil');
    if (premier) {
      premier = false;
      if (a.role === 'equipe' && !activeModule) openModule('fournil');
    }
  }

  // =====================================================================
  // Enregistrement
  // =====================================================================
  /** Remplace save() du script principal. */
  function enregistrerFournil() {
    if (!base || !a.mode) return Promise.resolve(); // données pas encore reçues : on n'écrase rien
    const connues = a.mode === 'separe' ? (baseStock || {}).history : (recu.state || {}).history;
    E.signerNouvelles(S.history, new Set((connues || []).map((h) => h.id)), moi(), Date.now());
    verifierSeuils();
    if (a.mode === 'ancien') {
      if (a.role !== 'admin') return Promise.resolve();
      return envoyer('state', { state: JSON.stringify(S) });
    }
    if (a.role === 'admin') {
      const reste = JSON.stringify(E.separer(S).reste);
      if (reste !== texteResteConnu) {
        texteResteConnu = reste;
        envoyer('state', { state: reste, migreEquipe: true });
      }
    }
    return planifierStock();
  }

  function planifierStock() {
    if (occupe) { aRefaire = true; return fileStock; }
    occupe = true;
    fileStock = (async () => {
      try {
        do {
          aRefaire = false;
          await envoyerStock();
        } while (aRefaire);
      } finally {
        occupe = false;
        if (manque) { manque = false; relireStock(); }
      }
    })();
    return fileStock;
  }

  async function relireStock() {
    try { recevoirStock(await col().doc('stock').get()); } catch (e) { /* hors ligne : la prochaine version arrivera */ }
  }

  const ERREURS_DEFINITIVES = ['permission-denied', 'unauthenticated', 'invalid-argument', 'resource-exhausted', 'not-found', 'failed-precondition'];

  async function envoyerStock() {
    const capture = E.separer(S).stock;
    if (JSON.stringify(capture) === JSON.stringify(baseStock)) return;
    const ref = col().doc('stock');
    const sansReseau = navigator.onLine === false || typeof base.runTransaction !== 'function';
    if (!sansReseau) {
      const envoi = base.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const distant = lire(snap);
        if (!distant) throw Object.assign(new Error('Le stock n’existe plus sur le serveur.'), { code: 'not-found' });
        const r = E.fusionnerStock(baseStock, capture, distant);
        tx.set(ref, { state: JSON.stringify(r) });
        return r;
      });
      try {
        const r = await envoi;
        if (window.fournilSynchro) window.fournilSynchro.suivre(Promise.resolve(), 'stock', () => planifierStock());
        // mes changements faits pendant l'envoi sont gardés par-dessus la version enregistrée
        const enCours = E.fusionnerStock(capture, E.separer(S).stock, r);
        baseStock = copie(r);
        const avant = JSON.stringify(E.separer(S).stock);
        S.products = enCours.products;
        S.history = enCours.history;
        S.lastDate = enCours.lastDate;
        if (JSON.stringify(enCours) !== avant) apresEnvoi();
        return;
      } catch (e) {
        if (e && ERREURS_DEFINITIVES.includes(e.code)) {
          if (window.fournilSynchro) window.fournilSynchro.suivre(Promise.reject(e), 'stock', () => planifierStock());
          else console.warn('Envoi du stock refusé', e);
          return;
        }
        // serveur injoignable : gardé sur l'appareil, envoyé au retour du réseau
      }
    }
    baseStock = copie(capture);
    envoyerSimple(ref, { state: JSON.stringify(capture) });
  }

  function envoyerSimple(ref, donnees) {
    const renvoyer = () => ref.set(donnees);
    const envoi = renvoyer();
    if (window.fournilSynchro) window.fournilSynchro.suivre(envoi, 'stock', renvoyer);
    else envoi.catch((e) => console.warn('Envoi refusé', e));
  }

  function apresEnvoi() {
    if (activeModule === 'fournil') render();
    if (typeof tab !== 'undefined' && tab === 'histo' && activeModule === 'fournil') renderHisto();
    verifierSeuils();
  }

  /** Bouton Actualiser : relit tout depuis le serveur. */
  async function actualiser() {
    const docs = a.role === 'admin' ? ['state', 'stock', 'labo', 'recettes'] : ['stock', 'recettes'];
    const snaps = await Promise.all(docs.map((d) => col().doc(d).get({ source: 'server' })));
    docs.forEach((d, i) => {
      if (d === 'state') { recu.state = lire(snaps[i]); }
      if (d === 'stock') { recu.stock = lire(snaps[i]); if (a.mode === 'separe') baseStock = null; }
      if (d === 'labo') recevoirLabo(snaps[i]);
      if (d === 'recettes') recevoirRecettes(snaps[i]);
    });
    composer('actualiser');
    if (window.fournilJour) window.fournilJour.verifier('labo');
  }

  // ---------- passage au jour suivant (assets/js/jour.js) ----------
  const jour = {
    doc: () => (a.mode === 'separe' ? 'stock' : 'state'),
    get: () => (a.mode === 'separe' ? E.separer(S).stock : S),
    /** serveur : vrai si v vient d'être écrit sur le serveur (transaction). */
    set(v, serveur) {
      if (a.mode === 'separe') {
        S.products = copie(v.products || []);
        S.history = copie(v.history || []);
        S.lastDate = v.lastDate ?? null;
        if (serveur) baseStock = copie({ products: v.products || [], history: v.history || [], lastDate: v.lastDate ?? null });
      } else {
        S = v;
      }
      normalizeState();
      verifierSeuils();
    },
    pret: () => a.mode === 'separe' || (a.mode === 'ancien' && a.role === 'admin'),
  };

  // =====================================================================
  // Alertes de seuil bas
  // =====================================================================
  function verifierSeuils() {
    const actuels = copie(S.products || []);
    if (produitsVus === null || !a.mode) { produitsVus = actuels; return; }
    const passages = E.passagesSousSeuil(produitsVus, actuels);
    produitsVus = actuels;
    if (passages.length) alerterSeuil(passages);
  }

  const alertes = new Map();
  function alerterSeuil(passages) {
    passages.forEach((p) => alertes.set(p.id, p));
    const texte = passages.map((p) => `${p.name} ${p.statut === 'empty' ? 'vide' : `sous le seuil (${p.dispo} dispo, seuil ${p.seuil})`}`).join(', ');
    toast(`⚠️ ${texte}`);
    afficherAlertes();
  }
  function afficherAlertes() {
    const sec = document.getElementById('tab-stock');
    if (!sec) return;
    let b = document.getElementById('alerteSeuil');
    if (!alertes.size) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('div');
      b.id = 'alerteSeuil';
      b.className = 'alerte-seuil';
      b.setAttribute('role', 'alert');
      sec.insertBefore(b, sec.firstChild);
    }
    b.innerHTML = `<div><strong>Stock bas</strong><ul>${[...alertes.values()].map((p) => `<li>${esc(p.emoji || '')} ${esc(p.name)} : ${p.statut === 'empty' ? 'vide' : `${p.dispo} dispo (seuil ${p.seuil})`}</li>`).join('')}</ul></div>
      <button type="button" class="alerte-fermer" aria-label="Fermer l’alerte">×</button>`;
    b.querySelector('.alerte-fermer').onclick = () => { alertes.clear(); afficherAlertes(); };
  }

  // =====================================================================
  // Calculs partagés (appelé par recettes/adaptation/state.js)
  // =====================================================================
  function creerCalcul(c) {
    const { id, doc } = E.calculVersDoc(c, moi());
    c.id = id;
    c.auteurUid = doc.auteurUid;
    c.auteurPrenom = doc.auteurPrenom;
    const ref = base.collection('calculs').doc(id);
    const renvoyer = () => ref.set(doc);
    const envoi = renvoyer();
    if (window.fournilSynchro) window.fournilSynchro.suivre(envoi, 'calculs', renvoyer);
    return envoi;
  }
  function supprimerCalcul(c) {
    if (!E.peutSupprimer(c, a.uid)) return false;
    const ref = base.collection('calculs').doc(c.id);
    const renvoyer = () => ref.delete();
    const envoi = renvoyer();
    if (window.fournilSynchro) window.fournilSynchro.suivre(envoi, 'calculs', renvoyer);
    return true;
  }

  // =====================================================================
  // Écrans selon le rôle
  // =====================================================================
  function appliquerRole() {
    document.body.classList.toggle('role-equipe', a.role === 'equipe');
    document.body.classList.toggle('role-admin', a.role === 'admin');
    document.body.classList.toggle('role-aucun', a.role === 'aucun' || a.role === 'inconnu');
  }
  const estEquipe = () => a.role === 'equipe';
  const refuse = () => a.role !== 'admin';

  /** Message plein écran (compte sans accès, données pas prêtes) ; null pour l'enlever. */
  function ecranMessage(titre, texte, reessayer) {
    let m = document.getElementById('accesMessage');
    if (!titre) { if (m) m.remove(); document.body.classList.remove('acces-bloque'); return; }
    if (!m) {
      m = document.createElement('div');
      m.id = 'accesMessage';
      m.className = 'acces-message';
      m.setAttribute('role', 'alert');
      document.body.appendChild(m);
    }
    document.body.classList.add('acces-bloque');
    m.innerHTML = `<div class="acces-carte"><h2>${esc(titre)}</h2><p>${esc(texte)}</p>
      <div class="acces-actions">${reessayer ? '<button type="button" class="mbtn mbtn-p" data-acces="reessayer">Réessayer</button>' : ''}
      <button type="button" class="mbtn mbtn-c" data-acces="sortie">Se déconnecter</button></div></div>`;
    const r = m.querySelector('[data-acces=reessayer]');
    if (r) r.onclick = () => { ecranMessage(null); demarrer(base); };
    m.querySelector('[data-acces=sortie]').onclick = () => doLogout();
  }

  // Gardes : l'équipe ne peut pas ouvrir les écrans interdits (cachés aussi par le style).
  function garder(nom, fn) {
    const f = window[nom];
    if (typeof f !== 'function') return;
    window[nom] = function (...args) {
      const r = fn(args);
      if (r === false) return undefined;
      return f.apply(this, r || args);
    };
  }
  garder('openModule', ([m]) => {
    if (estEquipe() && m !== 'fournil') { toast('Le Labo et le Bureau sont réservés au responsable'); return ['fournil']; }
    // compte sans accès, ou rôle pas encore connu (sauf sans Firebase du tout : mode dégradé d'origine)
    if (a.role === 'aucun' || (a.role === 'inconnu' && typeof firebase !== 'undefined')) return false;
    return undefined;
  });
  garder('sw', ([t]) => (estEquipe() && ONGLETS_INTERDITS.includes(t) ? ['stock'] : undefined));
  garder('swL', () => (refuse() ? false : undefined));
  garder('swB', () => (refuse() ? false : undefined));
  ['delHistoEntry', 'clearHisto', 'delProduct', 'openEditProduct', 'saveProduct', 'moveProduct', 'addTask', 'openNotesPanel', 'saveL'].forEach((nom) => {
    garder(nom, () => (estEquipe() ? false : undefined));
  });
  // ✏️ du Stock : l'équipe ajoute une production, mais ne change pas le seuil (réglage du responsable)
  garder('saveCorrect', () => {
    if (!estEquipe()) return undefined;
    const p = (S.products || []).find((x) => x.id === correctId);
    const champ = document.getElementById('mc-seuil');
    if (p && champ) champ.value = String(p.seuil ?? '');
    return undefined;
  });
  // Déconnexion : la page est rechargée pour ne rien garder du compte précédent en mémoire.
  garder('doLogout', () => {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      Promise.resolve(firebase.auth().signOut()).then(() => { if (a.uid) try { location.reload(); } catch (e) { /* tests */ } });
    }
    return false;
  });

  // =====================================================================
  // Réglages → Équipe (administrateur)
  // =====================================================================
  function carteEquipe() {
    const el = document.getElementById('settingsList');
    if (!el || a.role !== 'admin') return;
    let c = el.querySelector('.carte-equipe');
    if (!c) {
      c = document.createElement('div');
      c.className = 'carte-equipe';
      el.appendChild(c);
    }
    const pret = a.mode === 'separe';
    c.innerHTML = `
      <div class="sec-title" id="equipeTitre">Équipe</div>
      <div class="stock-raz-carte" role="group" aria-labelledby="equipeTitre">
        <p class="stock-texte">Les membres de l'équipe voient le Stock (ajouter / retirer), l'Historique du stock et les Recettes (consultation et calculs). Ils ne voient ni les tâches, ni le Labo, ni le Bureau.</p>
        <label class="stock-texte" for="equipeMonPrenom">Ton prénom (affiché sur tes calculs et dans l'historique)</label>
        <div class="equipe-ligne"><input id="equipeMonPrenom" class="minput" maxlength="40" value="${esc(a.prenom || '')}" placeholder="${PRENOM_ADMIN_DEFAUT}"><button type="button" class="mbtn mbtn-p" data-equipe="mon-prenom">Enregistrer</button></div>
        <p class="stock-texte"><strong>Membres</strong></p>
        <ul class="equipe-liste">${membres.filter((m) => m.role === 'equipe').map((m) => `<li><span>${esc(m.prenom || '?')} <small>${esc(m.uid.slice(0, 8))}…</small></span><button type="button" class="sdel" data-equipe-retirer="${esc(m.uid)}">Retirer</button></li>`).join('') || '<li class="stock-texte">Personne pour l’instant.</li>'}</ul>
        <p class="stock-texte">Ajouter : crée d'abord le compte dans la console Firebase (Authentication), puis colle ici son identifiant (UID).</p>
        <label class="sr-only" for="equipeUid">Identifiant (UID) du compte</label>
        <input id="equipeUid" class="minput" maxlength="128" placeholder="Identifiant (UID) du compte" autocomplete="off">
        <label class="sr-only" for="equipePrenom">Prénom</label>
        <div class="equipe-ligne"><input id="equipePrenom" class="minput" maxlength="40" placeholder="Prénom"><button type="button" class="mbtn mbtn-p" data-equipe="ajouter">Ajouter</button></div>
        <p class="stock-texte"><strong>Données</strong> : ${pret ? 'prêtes pour l’équipe ✓ (stock et calculs séparés).' : 'pas encore préparées. L’équipe ne peut rien voir tant que ce n’est pas fait.'}</p>
        ${pret
          ? '<button type="button" class="mbtn mbtn-c" data-equipe="annuler">Revenir à l’ancien format…</button>'
          : '<button type="button" class="mbtn mbtn-p" data-equipe="migrer">Préparer les données pour l’équipe…</button>'}
      </div>`;
    c.querySelector('[data-equipe=mon-prenom]').onclick = () => {
      const p = c.querySelector('#equipeMonPrenom').value.trim();
      if (!p) { toast('Écris ton prénom'); return; }
      base.collection('membres').doc(a.uid).set({ prenom: p, role: 'admin' }).then(() => toast('Prénom enregistré ✓'), () => toast('Prénom non enregistré : réessaie'));
      a.prenom = p;
    };
    c.querySelector('[data-equipe=ajouter]').onclick = () => {
      const uid = c.querySelector('#equipeUid').value.trim();
      const prenom = c.querySelector('#equipePrenom').value.trim();
      if (!/^[A-Za-z0-9]{10,128}$/.test(uid)) { toast('Identifiant (UID) invalide : copie-le depuis la console Firebase'); return; }
      if (E.estAdmin(uid)) { toast('C’est ton propre compte'); return; }
      if (!prenom) { toast('Écris le prénom'); return; }
      // Un UID déjà présent n'est jamais écrasé : avant, coller deux fois le même UID
      // remplaçait le premier membre par le second, sans rien dire.
      const deja = membres.find((m) => m.uid === uid);
      if (deja) { toast(`Cet identifiant (UID) est déjà utilisé pour ${deja.prenom || 'un autre membre'} : vérifie que tu as bien copié celui du nouveau compte`); return; }
      base.collection('membres').doc(uid).set({ prenom, role: 'equipe' }).then(() => toast(`${prenom} ajouté·e à l’équipe ✓`), () => toast('Ajout refusé : réessaie'));
    };
    c.querySelectorAll('[data-equipe-retirer]').forEach((b) => {
      b.onclick = () => {
        const m = membres.find((x) => x.uid === b.dataset.equipeRetirer);
        if (!m || !confirm(`Retirer ${m.prenom} de l’équipe ? Son compte n’aura plus accès à Fournil.`)) return;
        base.collection('membres').doc(m.uid).delete().then(() => toast('Retiré·e de l’équipe'), () => toast('Échec : réessaie'));
      };
    });
    const migrer = c.querySelector('[data-equipe=migrer]');
    if (migrer) {
      migrer.onclick = async () => {
        if (!confirm('Préparer les données pour l’équipe ?\n\nLe stock est rangé à part (pour que l’équipe y ait accès sans voir le reste) et les calculs enregistrés deviennent partagés. Une copie complète de tes données est faite avant (sauvegardes/avant-equipe-…).\n\nFerme Fournil sur tes autres appareils avant de continuer, puis recharge-les ensuite.')) return;
        migrer.disabled = true;
        try {
          const r = await E.migrerBase(base, { source: 'server', adminPrenom: a.prenom });
          toast(r.deja ? 'Déjà fait ✓' : `Données prêtes ✓ (${r.produits} produits, ${r.calculs} calculs)`);
        } catch (e) {
          console.warn('Migration', e);
          toast('La préparation a échoué : rien n’a été changé. Vérifie la connexion et réessaie.');
          migrer.disabled = false;
        }
      };
    }
    const annuler = c.querySelector('[data-equipe=annuler]');
    if (annuler) {
      annuler.onclick = async () => {
        if (!confirm('Revenir à l’ancien format ?\n\nLe stock est remis avec le reste de tes données et l’équipe n’aura plus accès. Les calculs partagés restent enregistrés.')) return;
        annuler.disabled = true;
        try {
          await E.annulerMigration(base);
          toast('Ancien format rétabli ✓');
        } catch (e) {
          toast('Échec : rien n’a été changé. Réessaie.');
          annuler.disabled = false;
        }
      };
    }
  }

  // Réglages : la carte Équipe s'ajoute après les cartes existantes.
  const rs = window.renderSettings;
  if (typeof rs === 'function') {
    window.renderSettings = function (...args) {
      const r = rs.apply(this, args);
      try { carteEquipe(); } catch (e) { console.warn('acces.js', e); }
      return r;
    };
  }
  // Le bandeau d'alerte reste en haut du Stock quand le Stock est redessiné.
  const rst = window.renderStock;
  if (typeof rst === 'function') {
    window.renderStock = function (...args) {
      const r = rst.apply(this, args);
      try { afficherAlertes(); } catch (e) { /* rien */ }
      return r;
    };
  }

  window.fournilAcces = {
    demarrer, enregistrerFournil, actualiser, jour, creerCalcul, supprimerCalcul,
    role: () => a.role,
    mode: () => a.mode,
    utilisateur: () => moi(),
    estDeMoi: (h) => !h || !h.parUid || h.parUid === a.uid,
    peutSupprimerCalcul: (c) => E.peutSupprimer(c, a.uid),
    peutModifierRecettes: () => a.role === 'admin',
    peutCreerProduit: () => a.role === 'admin',
  };
  // Connexion déjà faite avant le chargement de ce fichier (initFirebase l'a notée)
  if (window.fournilAccesEnAttente) {
    const d = window.fournilAccesEnAttente;
    window.fournilAccesEnAttente = null;
    demarrer(d);
  }
})();
