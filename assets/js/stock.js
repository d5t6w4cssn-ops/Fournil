// Stock de Fournil : fonctions ajoutées au module Stock (sans toucher au reste du code).
// 1. Réglages → « Remettre tout le stock à zéro » (Fournil, Labo, matières premières).
// 2. Sur chaque produit (Fournil, Labo, matières) : boutons − / + rapides et « Retrait avec motif ».
// 3. Saisie rapide en haut du Stock (voir saisie-rapide.js pour la reconnaissance du texte).
// Les données gardent leur format ; l'historique reçoit des lignes de types ajustement,
// retrait, raz et saisie (affichées par histoLibelle / histoQuantite du script principal).
(() => {
  const CATEGORIES = {
    fournil: {
      nom: 'Fournil',
      liste: () => S.products || [],
      champ: 'stockReel',
      histo: () => { if (!S.history) S.history = []; return S.history; },
      // genAutoTasks met à jour les tâches « stock bas » puis enregistre : une seule écriture.
      enregistrer: () => enregistrerFournil(),
      carte: (id) => `pc-${id}`,
      unite: () => '',
      entier: true,
      majAffichage: (p) => refresh(p),
    },
    labo: {
      nom: 'Labo',
      liste: () => L.products || [],
      champ: 'stockReel',
      histo: () => { if (!L.history) L.history = []; return L.history; },
      enregistrer: () => saveL(),
      carte: (id) => `lpc-${id}`,
      unite: () => '',
      entier: true,
      majAffichage: () => renderLaboStock(),
    },
    matieres: {
      nom: 'Matières premières',
      liste: () => S.matieres || [],
      champ: 'stock',
      histo: () => { if (!S.history) S.history = []; return S.history; },
      enregistrer: () => save(),
      carte: (id) => `mpc-${id}`,
      unite: (m) => m.unit || '',
      entier: false,
      majAffichage: () => renderMatieres(),
    },
  };
  const MAX_HISTO = 630;
  function enregistrerFournil() {
    if (typeof genAutoTasks === 'function') genAutoTasks();
    else save();
  }
  const arrondi = (n) => Math.round(n * 1000) / 1000;
  const fq = (n) => String(arrondi(n)).replace('.', ',');
  const avecUnite = (n, u) => (u ? `${fq(n)} ${u}` : fq(n));

  function ajouterHisto(cat, entree) {
    const h = CATEGORIES[cat].histo();
    h.unshift({ id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, date: today(), ...entree });
    if (h.length > MAX_HISTO) h.length = MAX_HISTO;
  }

  // ---------- petite fenêtre (même style que les fenêtres de Fournil) ----------
  function fenetre(html) {
    let ov = document.getElementById('mStockFenetre');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mStockFenetre';
      ov.className = 'overlay';
      ov.addEventListener('click', (e) => { if (e.target === ov) fermer(); });
      document.body.appendChild(ov);
    }
    ov.innerHTML = `<div class="modal stock-modal" role="dialog" aria-modal="true">${html}</div>`;
    ov.classList.add('open');
    const premier = ov.querySelector('input, select, button.mbtn-p');
    if (premier) premier.focus();
    return ov;
  }
  function fermer() {
    const ov = document.getElementById('mStockFenetre');
    if (ov) ov.classList.remove('open');
  }

  // =====================================================================
  // 1. Remise à zéro de tout le stock
  // =====================================================================
  function compter() {
    return {
      fournil: (S.products || []).length,
      labo: (L.products || []).length,
      matieres: (S.matieres || []).length,
    };
  }
  function demanderRemiseAZero() {
    const n = compter();
    const ov = fenetre(`
      <div class="modal-title">Remettre tout le stock à zéro ?</div>
      <p class="stock-texte">Les quantités en stock passeront à <strong>0</strong> :</p>
      <ul class="stock-liste">
        <li>${n.fournil} produit${n.fournil > 1 ? 's' : ''} du Fournil</li>
        <li>${n.labo} produit${n.labo > 1 ? 's' : ''} du Labo</li>
        <li>${n.matieres} matière${n.matieres > 1 ? 's' : ''} première${n.matieres > 1 ? 's' : ''}</li>
      </ul>
      <p class="stock-texte">Restent comme avant : les produits et leurs réglages (seuil, base / jour, commandes), les catégories, les recettes et l'historique.</p>
      <p class="stock-alerte">Cette action ne peut pas être annulée.</p>
      <div class="mactions">
        <button type="button" class="mbtn mbtn-c" data-action="annuler">Annuler</button>
        <button type="button" class="mbtn stock-danger" data-action="raz">Oui, tout remettre à zéro</button>
      </div>`);
    ov.querySelector('[data-action=annuler]').onclick = fermer;
    ov.querySelector('[data-action=raz]').onclick = () => {
      remettreAZero();
      fermer();
    };
  }
  function remettreAZero() {
    (S.products || []).forEach((p) => { p.stockReel = 0; });
    (S.matieres || []).forEach((m) => { m.stock = 0; });
    (L.products || []).forEach((p) => { p.stockReel = 0; });
    ajouterHisto('fournil', { type: 'raz', pid: '', name: 'Tout le stock (Fournil et matières premières)', emoji: '0️⃣', qty: 0 });
    ajouterHisto('labo', { type: 'raz', pid: '', name: 'Tout le stock du Labo', emoji: '0️⃣', qty: 0 });
    enregistrerFournil();
    saveL();
    renderStock();
    renderLaboStock();
    renderMatieres();
    renderSettings();
    toast('Stock remis à zéro ✓');
  }
  function carteRemiseAZero() {
    const el = document.getElementById('settingsList');
    if (!el || el.querySelector('.stock-raz')) return;
    const c = document.createElement('div');
    c.className = 'stock-raz';
    c.innerHTML = `
      <div class="sec-title">Stock</div>
      <div class="stock-raz-carte">
        <p class="stock-texte">Met à 0 les quantités en stock du Fournil, du Labo et des matières premières. Les produits, catégories et recettes restent.</p>
        <button type="button" class="stock-danger stock-raz-btn">Remettre tout le stock à zéro</button>
      </div>`;
    c.querySelector('.stock-raz-btn').onclick = demanderRemiseAZero;
    el.appendChild(c);
  }

  // =====================================================================
  // 2. Boutons − / + et retrait avec motif, sur chaque produit
  // =====================================================================
  function trouver(cat, id) {
    return CATEGORIES[cat].liste().find((x) => x.id === id);
  }

  // Ajustement rapide : enregistré tout de suite ; les appuis successifs sur le même produit
  // (2 minutes au plus) sont regroupés en une seule ligne d'historique.
  function ajuster(cat, id, sens) {
    const c = CATEGORIES[cat];
    const p = trouver(cat, id);
    if (!p) return;
    const actuel = Number(p[c.champ]) || 0;
    if (sens < 0 && actuel <= 0) {
      toast(`${p.name} : le stock est déjà à 0`);
      return;
    }
    const pas = sens < 0 ? -Math.min(1, actuel) : 1;
    p[c.champ] = arrondi(actuel + pas);
    const h = c.histo();
    const dernier = h[0];
    if (dernier && dernier.type === 'ajustement' && dernier.pid === id && dernier.cat === cat && dernier.date === today() && Date.now() - (dernier.t || 0) < 120000) {
      dernier.delta = arrondi((dernier.delta || 0) + pas);
      dernier.qty = Math.abs(dernier.delta);
      dernier.t = Date.now();
      if (dernier.delta === 0) h.shift();
    } else {
      ajouterHisto(cat, { type: 'ajustement', cat, pid: id, name: p.name, emoji: p.emoji || '📦', delta: pas, qty: Math.abs(pas), unit: c.unite(p) || undefined, t: Date.now() });
    }
    c.enregistrer();
    c.majAffichage(p);
    majValeur(cat, id);
  }

  function retirerAvecMotif(cat, id) {
    const c = CATEGORIES[cat];
    const p = trouver(cat, id);
    if (!p) return;
    const u = c.unite(p);
    const ov = fenetre(`
      <div class="modal-title">Retirer du stock</div>
      <p class="stock-texte">${esc(p.emoji || '')} <strong>${esc(p.name)}</strong> · en stock : ${esc(avecUnite(Number(p[c.champ]) || 0, u))}</p>
      <div class="mgroup"><label for="srQte">Quantité à retirer${u ? ` (${esc(u)})` : ''}</label>
        <input class="minput" id="srQte" type="text" inputmode="decimal" autocomplete="off" placeholder="${c.entier ? 'ex. 3' : 'ex. 2,5'}"></div>
      <div class="mgroup"><label for="srMotif">Motif</label>
        <select class="minput" id="srMotif">
          <option value="perte">Perte</option><option value="casse">Casse</option><option value="don">Don</option>
          <option value="degustation">Dégustation</option><option value="autre">Autre</option>
        </select></div>
      <div class="mgroup"><label for="srNote">Précision (facultatif)</label><input class="minput" id="srNote" maxlength="120"></div>
      <p class="stock-alerte" id="srMsg" role="alert"></p>
      <div class="mactions">
        <button type="button" class="mbtn mbtn-c" data-action="annuler">Annuler</button>
        <button type="button" class="mbtn mbtn-p" data-action="retirer">Retirer</button>
      </div>`);
    const msg = ov.querySelector('#srMsg');
    const bouton = ov.querySelector('[data-action=retirer]');
    let confirmeSousZero = false;
    let confirmeGrand = null;
    ov.querySelector('#srQte').oninput = () => { confirmeSousZero = false; bouton.textContent = 'Retirer'; msg.textContent = ''; };
    ov.querySelector('[data-action=annuler]').onclick = fermer;
    bouton.onclick = () => {
      const brut = String(ov.querySelector('#srQte').value).replace(',', '.');
      const qte = Number(brut);
      if (!brut || !Number.isFinite(qte) || qte <= 0) {
        msg.textContent = 'Indique une quantité supérieure à 0.';
        ov.querySelector('#srQte').focus();
        return;
      }
      if (c.entier && !Number.isInteger(qte)) {
        msg.textContent = 'Indique un nombre entier de pièces.';
        return;
      }
      if (c.entier && qte > 1000 && confirmeGrand !== qte) {
        confirmeGrand = qte;
        msg.textContent = 'Plus de 1\u202f000 pièces : appuie encore sur « Retirer » pour confirmer.';
        return;
      }
      const actuel = Number(p[c.champ]) || 0;
      if (qte > actuel && !confirmeSousZero) {
        msg.textContent = `Il n'y a que ${avecUnite(actuel, u)} en stock : le stock passera à 0, pas en dessous. Appuie encore pour confirmer.`;
        bouton.textContent = 'Retirer quand même (stock à 0)';
        confirmeSousZero = true;
        return;
      }
      const retire = Math.min(qte, actuel);
      p[c.champ] = arrondi(Math.max(0, actuel - qte));
      const note = ov.querySelector('#srNote').value.trim();
      ajouterHisto(cat, { type: 'retrait', cat, pid: id, name: p.name, emoji: p.emoji || '📦', qty: arrondi(retire), demande: qte !== retire ? arrondi(qte) : undefined, motif: ov.querySelector('#srMotif').value, note: note || undefined, unit: u || undefined });
      c.enregistrer();
      fermer();
      c.majAffichage(p);
      majValeur(cat, id);
      toast(`− ${avecUnite(retire, u)} ${p.name} ✓`);
    };
  }

  function majValeur(cat, id) {
    const p = trouver(cat, id);
    const v = document.querySelector(`.stock-rapide[data-cat="${cat}"][data-id="${CSS.escape(id)}"] .stock-rapide-val`);
    if (p && v) v.textContent = avecUnite(Number(p[CATEGORIES[cat].champ]) || 0, CATEGORIES[cat].unite(p));
  }

  // Ajoute la rangée « − stock + · Retrait avec motif » sous chaque carte affichée.
  function ajouterBoutons(cat) {
    const c = CATEGORIES[cat];
    c.liste().forEach((p) => {
      const carte = document.getElementById(c.carte(p.id));
      if (!carte || carte.querySelector('.stock-rapide')) return;
      const r = document.createElement('div');
      r.className = 'stock-rapide';
      r.dataset.cat = cat;
      r.dataset.id = p.id;
      r.innerHTML = `
        <button type="button" class="stock-pas" data-sens="-1" aria-label="Retirer 1 ${c.entier ? 'pièce' : esc(c.unite(p) || 'unité')} de ${esc(p.name)}">−</button>
        <span class="stock-rapide-val" aria-live="polite"></span>
        <button type="button" class="stock-pas" data-sens="1" aria-label="Ajouter 1 ${c.entier ? 'pièce' : esc(c.unite(p) || 'unité')} à ${esc(p.name)}">+</button>
        <button type="button" class="stock-motif">Retrait avec motif</button>`;
      r.querySelectorAll('.stock-pas').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); ajuster(cat, p.id, Number(b.dataset.sens)); }; });
      r.querySelector('.stock-motif').onclick = (e) => { e.stopPropagation(); retirerAvecMotif(cat, p.id); };
      carte.appendChild(r);
      majValeur(cat, p.id);
    });
  }

  // ---------- branchement sur les fonctions d'affichage existantes ----------
  function apres(nom, fn) {
    const f = window[nom];
    if (typeof f !== 'function') return;
    window[nom] = function (...args) {
      const r = f.apply(this, args);
      try { fn(); } catch (e) { console.warn('stock.js', e); }
      return r;
    };
  }

  // =====================================================================
  // 3. Saisie rapide (texte ou voix) en haut du Stock du Fournil
  // =====================================================================
  const saisie = { mode: 'ajouter', lignes: [], texte: '', confirme: false };
  // Au-delà de 1 000 pièces sur une ligne, on demande une confirmation (audit D1).
  const GRAND = 1000;
  const quantiteLigne = (l) => Number(String(l.quantite ?? '').replace(',', '.'));
  let compteurLigne = 0;
  const NOUVEAU = '__nouveau__';

  function carteSaisie() {
    const sec = document.getElementById('tab-stock');
    if (!sec || document.getElementById('saisieRapide')) return;
    const c = document.createElement('section');
    c.id = 'saisieRapide';
    c.className = 'saisie-carte';
    c.setAttribute('aria-labelledby', 'saisieTitre');
    const voix = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    c.innerHTML = `
      <h2 class="saisie-titre" id="saisieTitre">Saisie rapide</h2>
      <div class="saisie-modes" role="group" aria-label="Ajouter ou retirer">
        <button type="button" class="saisie-mode" data-mode="ajouter" aria-pressed="true">＋ AJOUTER</button>
        <button type="button" class="saisie-mode" data-mode="retirer" aria-pressed="false">− RETIRER</button>
      </div>
      <label class="sr-only" for="saisieTexte">Texte de la saisie rapide</label>
      <div class="saisie-champ">
        <textarea id="saisieTexte" rows="2" placeholder="Ex. 40 viennoises, 50 chaussons, 200 pains au chocolat, 300 croissants"></textarea>
        <button type="button" class="saisie-micro" aria-pressed="false" ${voix ? '' : 'disabled title="La dictée n’est pas disponible sur ce navigateur"'} aria-label="Dicter">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
        </button>
      </div>
      <p class="saisie-aide">Un signe moins (« -20 croissants ») retire cette ligne même en mode Ajouter.</p>
      <button type="button" class="saisie-apercu-btn">Voir l'aperçu</button>
      <div class="saisie-apercu" aria-live="polite"></div>`;
    sec.insertBefore(c, sec.firstChild);
    c.querySelectorAll('.saisie-mode').forEach((b) => {
      b.onclick = () => {
        saisie.mode = b.dataset.mode;
        c.querySelectorAll('.saisie-mode').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        saisie.lignes.forEach((l) => { if (!l.signe) l.sens = saisie.mode; });
        rendreApercu();
      };
    });
    c.querySelector('.saisie-apercu-btn').onclick = construireApercu;
    c.querySelector('.saisie-micro').onclick = dicter;
  }

  // Dictée : même reconnaissance que le journal vocal (Web Speech API, français).
  let ecoute = null;
  function dicter() {
    const btn = document.querySelector('#saisieRapide .saisie-micro');
    if (ecoute) { ecoute.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('La dictée n’est pas disponible sur ce navigateur'); return; }
    const r = new SR();
    r.lang = 'fr-FR';
    r.continuous = false;
    r.interimResults = false;
    ecoute = r;
    btn.setAttribute('aria-pressed', 'true');
    btn.classList.add('ecoute');
    toast('Je t’écoute…');
    r.onresult = (e) => {
      const dit = Array.from(e.results).map((x) => x[0].transcript).join(' ').trim();
      const champ = document.getElementById('saisieTexte');
      champ.value = champ.value.trim() ? `${champ.value.trim()}, ${dit}` : dit;
      champ.focus();
    };
    r.onerror = (e) => {
      toast(e && e.error === 'not-allowed' ? 'Autorise le micro pour dicter' : 'Dictée interrompue, réessaie');
    };
    r.onend = () => {
      ecoute = null;
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('ecoute');
    };
    r.start();
  }

  function construireApercu() {
    const texte = document.getElementById('saisieTexte').value;
    saisie.texte = texte.trim();
    const F = window.FournilSaisie;
    saisie.lignes = F.analyser(texte).map((l) => {
      const ligne = { id: ++compteurLigne, texte: l.texte, quantite: l.quantite, signe: l.signe, sens: l.signe === '-' ? 'retirer' : l.signe === '+' ? 'ajouter' : saisie.mode, erreur: l.erreur, produitId: '', nouveauNom: '', candidats: [] };
      if (l.nom && l.erreur !== 'sans-quantite') {
        const r = F.rapprocher(l.nom, S.products || []);
        if (r.statut === 'trouve') ligne.produitId = r.produit.id;
        else if (r.statut === 'nouveau') { ligne.produitId = NOUVEAU; ligne.nouveauNom = F.nomProduit(l.nom); }
        else { ligne.candidats = r.candidats.map((c) => c.produit.id); ligne.ambigu = true; }
      }
      if (l.erreur === 'sans-quantite') ligne.nouveauNom = F.nomProduit(l.nom);
      return ligne;
    });
    saisie.confirme = false;
    if (!saisie.lignes.length) {
      zone().innerHTML = '<p class="saisie-msg">Écris par exemple « 40 viennoises, 300 croissants », puis appuie sur « Voir l’aperçu ».</p>';
      return;
    }
    rendreApercu();
  }

  const zone = () => document.querySelector('#saisieRapide .saisie-apercu');

  // Problème d'une ligne (null si elle peut être enregistrée).
  function probleme(l) {
    const q = Number(String(l.quantite ?? '').replace(',', '.'));
    if (l.quantite === null || l.quantite === '' || !Number.isFinite(q)) return 'Quantité manquante : indique un nombre ou retire la ligne.';
    if (q <= 0) return 'La quantité doit être supérieure à 0.';
    if (!Number.isInteger(q)) return 'Indique un nombre entier de pièces.';
    if (!l.produitId) return l.ambigu ? 'Plusieurs produits possibles : choisis le bon.' : 'Nombre sans produit : choisis le produit ou retire la ligne.';
    if (l.produitId === NOUVEAU && !String(l.nouveauNom || '').trim()) return 'Donne un nom au nouveau produit.';
    return null;
  }

  function stockAvant(l) {
    if (l.produitId === NOUVEAU || !l.produitId) return 0;
    const p = (S.products || []).find((x) => x.id === l.produitId);
    return p ? Number(p.stockReel) || 0 : 0;
  }

  function rendreApercu() {
    const z = zone();
    if (!z) return;
    if (!saisie.lignes.length) { z.innerHTML = ''; return; }
    // stock prévu, ligne après ligne (deux lignes sur le même produit s'additionnent)
    const prevu = {};
    const options = (S.products || []).map((p) => ({ id: p.id, label: `${p.emoji || ''} ${p.name}`.trim() }));
    let html = `<p class="saisie-apercu-titre">Aperçu : vérifie, corrige ou retire une ligne, puis enregistre.</p><ul class="saisie-lignes">`;
    saisie.lignes.forEach((l) => {
      const pb = probleme(l);
      const cleP = l.produitId === NOUVEAU ? `n:${String(l.nouveauNom).trim().toLowerCase()}` : l.produitId;
      const avant = cleP in prevu ? prevu[cleP] : stockAvant(l);
      const q = pb ? 0 : Number(String(l.quantite).replace(',', '.'));
      const brut = l.sens === 'retirer' ? avant - q : avant + q;
      const apres = Math.max(0, brut);
      if (!pb && cleP) prevu[cleP] = apres;
      const opts = [`<option value="">— choisir un produit —</option>`]
        .concat((l.ambigu ? options.filter((o) => l.candidats.includes(o.id)) : []).map((o) => `<option value="${esc(o.id)}" ${o.id === l.produitId ? 'selected' : ''}>${esc(o.label)} (proposé)</option>`))
        .concat(options.map((o) => `<option value="${esc(o.id)}" ${o.id === l.produitId ? 'selected' : ''}>${esc(o.label)}</option>`))
        .concat([`<option value="${NOUVEAU}" ${l.produitId === NOUVEAU ? 'selected' : ''}>＋ Nouveau produit…</option>`]);
      html += `
        <li class="saisie-ligne${pb ? ' a-corriger' : ''}" data-ligne="${l.id}">
          <p class="saisie-origine">« ${esc(l.texte)} »</p>
          <div class="saisie-ligne-corps">
            <button type="button" class="saisie-sens ${l.sens === 'retirer' ? 'retirer' : 'ajouter'}" data-champ="sens" aria-label="${l.sens === 'retirer' ? 'Retirer (appuie pour ajouter)' : 'Ajouter (appuie pour retirer)'}">${l.sens === 'retirer' ? '−' : '+'}</button>
            <input class="saisie-qte" data-champ="quantite" type="text" inputmode="numeric" aria-label="Quantité" value="${esc(l.quantite ?? '')}">
            <select class="saisie-produit" data-champ="produitId" aria-label="Produit">${opts.join('')}</select>
            <button type="button" class="saisie-retirer" data-champ="supprimer" aria-label="Retirer cette ligne">×</button>
          </div>
          ${l.produitId === NOUVEAU ? `<div class="saisie-nouveau"><span class="saisie-badge">nouveau produit</span><input class="saisie-nom" data-champ="nouveauNom" aria-label="Nom du nouveau produit" value="${esc(l.nouveauNom)}"></div>` : ''}
          ${!pb && q > GRAND ? `<p class="saisie-alerte saisie-grand">Plus de 1\u202f000 pièces : vérifie la quantité.</p>` : ''}
          ${pb ? `<p class="saisie-erreur">${esc(pb)}</p>` : `<p class="saisie-stock">Stock : ${avant} → <strong>${apres}</strong>${brut < 0 ? ` <span class="saisie-alerte">(il n'y en a que ${avant} : le stock passera à 0, pas en dessous)</span>` : ''}</p>`}
        </li>`;
    });
    const valides = saisie.lignes.filter((l) => !probleme(l)).length;
    const bloque = saisie.lignes.some((l) => probleme(l));
    const grands = saisie.lignes.filter((l) => !probleme(l) && quantiteLigne(l) > GRAND).length;
    const libelle = saisie.confirme && grands
      ? `Oui, enregistrer (plus de 1\u202f000 pièces)`
      : `Enregistrer ${valides} ligne${valides > 1 ? 's' : ''}`;
    html += `</ul>
      <div class="saisie-actions">
        <button type="button" class="mbtn mbtn-c" data-action="annuler">Annuler</button>
        <button type="button" class="mbtn mbtn-p saisie-valider" data-action="valider" ${bloque ? 'disabled' : ''}>${libelle}</button>
      </div>
      ${bloque ? '<p class="saisie-erreur">Corrige ou retire les lignes signalées pour pouvoir enregistrer.</p>' : ''}
      ${!bloque && saisie.confirme && grands ? '<p class="saisie-alerte" role="alert">Une ligne dépasse 1\u202f000 pièces : appuie encore pour confirmer.</p>' : ''}`;
    z.innerHTML = html;
    z.querySelectorAll('.saisie-ligne').forEach((li) => {
      const l = saisie.lignes.find((x) => String(x.id) === li.dataset.ligne);
      li.querySelector('[data-champ=sens]').onclick = () => { l.sens = l.sens === 'retirer' ? 'ajouter' : 'retirer'; l.signe = l.sens === 'retirer' ? '-' : '+'; saisie.confirme = false; rendreApercu(); };
      li.querySelector('[data-champ=quantite]').onchange = (e) => { l.quantite = e.target.value.trim(); saisie.confirme = false; rendreApercu(); };
      li.querySelector('[data-champ=produitId]').onchange = (e) => {
        l.produitId = e.target.value;
        if (l.produitId === NOUVEAU && !l.nouveauNom) l.nouveauNom = '';
        rendreApercu();
      };
      li.querySelector('[data-champ=supprimer]').onclick = () => { saisie.lignes = saisie.lignes.filter((x) => x !== l); saisie.confirme = false; rendreApercu(); };
      const nom = li.querySelector('[data-champ=nouveauNom]');
      if (nom) nom.onchange = (e) => { l.nouveauNom = e.target.value; saisie.confirme = false; rendreApercu(); };
    });
    z.querySelector('[data-action=annuler]').onclick = () => { saisie.lignes = []; saisie.confirme = false; rendreApercu(); };
    z.querySelector('[data-action=valider]').onclick = valider;
  }

  // Tout est appliqué puis enregistré en une seule fois, avec une seule ligne d'historique.
  function valider() {
    if (!saisie.lignes.length || saisie.lignes.some((l) => probleme(l))) return;
    if (!saisie.confirme && saisie.lignes.some((l) => quantiteLigne(l) > GRAND)) {
      saisie.confirme = true;
      rendreApercu();
      return;
    }
    const crees = {};
    const detail = [];
    let total = 0;
    saisie.lignes.forEach((l, i) => {
      const q = Number(String(l.quantite).replace(',', '.'));
      let p;
      let nouveau = false;
      if (l.produitId === NOUVEAU) {
        const nom = String(l.nouveauNom).trim();
        const cleNom = nom.toLowerCase();
        p = crees[cleNom] || (S.products || []).find((x) => String(x.name).trim().toLowerCase() === cleNom);
        if (!p) {
          p = { id: `p_${Date.now()}_${i}`, name: nom, emoji: '📦', stockReel: 0, base: 0, commande: 0, seuil: 10, recipeUrl: null };
          S.products.push(p);
          crees[cleNom] = p;
          nouveau = true;
        }
      } else {
        p = S.products.find((x) => x.id === l.produitId);
      }
      if (!p) return;
      const avant = Number(p.stockReel) || 0;
      const apres = l.sens === 'retirer' ? Math.max(0, avant - q) : avant + q;
      p.stockReel = apres;
      const delta = apres - avant;
      total += Math.abs(delta);
      detail.push({ pid: p.id, name: p.name, emoji: p.emoji || '📦', delta, demande: l.sens === 'retirer' ? -q : q, nouveau: nouveau || undefined });
    });
    ajouterHisto('fournil', { type: 'saisie', pid: '', name: 'Saisie rapide', emoji: '⚡', qty: total, lignes: detail, texte: saisie.texte || undefined });
    enregistrerFournil();
    renderStock();
    const n = detail.length;
    saisie.lignes = [];
    document.getElementById('saisieTexte').value = '';
    zone().innerHTML = `<p class="saisie-msg ok">Saisie enregistrée : ${n} produit${n > 1 ? 's' : ''} mis à jour ✓</p>`;
    toast(`Saisie enregistrée : ${n} produit${n > 1 ? 's' : ''} ✓`);
  }

  window.FournilStock = { remettreAZero, demanderRemiseAZero, ajuster, retirerAvecMotif, construireApercu, valider, CATEGORIES };

  function demarrer() {
    apres('renderStock', () => ajouterBoutons('fournil'));
    apres('renderLaboStock', () => ajouterBoutons('labo'));
    apres('renderMatieres', () => ajouterBoutons('matieres'));
    apres('renderSettings', carteRemiseAZero);
    carteSaisie();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
