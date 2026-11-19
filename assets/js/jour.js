// Passage au jour suivant (bloquant B1 de l'audit).
// Avant : checkDay() ne tournait qu'au chargement, sur l'état par défaut, avant l'arrivée des
// vraies données : les sorties de la veille n'étaient jamais retirées du stock.
// Maintenant : vérifié à chaque arrivée des données (Fournil et Labo), au retour sur l'appli
// et chaque minute (changement de date appli ouverte).
// - 1 jour manqué : comme avant, appliqué tout seul (sorties = base + commandes).
// - Plusieurs jours : on demande combien de jours de sorties retirer (1 proposé par défaut).
// - En ligne : dans une transaction Firestore, pour ne jamais retirer deux fois les mêmes
//   sorties si deux appareils s'ouvrent en même temps. Hors ligne : sur l'appareil, envoyé
//   au retour du réseau.
(() => {
  /* global S, L, db, today, normalizeState, normalizeLabo, render, renderLabo, save, saveL, activeModule, toast, esc */
  const MAX_HISTO = 630;
  let seq = 0;

  // ---------- dates « AAAA-MM-JJ » ----------
  const versUTC = (d) => { const [a, m, j] = String(d).split('-').map(Number); return Date.UTC(a, m - 1, j); };
  const joursEntre = (de, a) => Math.round((versUTC(a) - versUTC(de)) / 86400000);
  const dateMoins = (d, n) => new Date(versUTC(d) - n * 86400000).toISOString().slice(0, 10);
  const lisible = (d) => new Date(versUTC(d)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  /**
   * Retire k jours de sorties. Jour 1 : base + commandes (comme l'ancien checkDay) ;
   * jours suivants : base seulement. Jamais sous 0. Chaque sortie est datée de son jour
   * (k = 1 : datée d'aujourd'hui, comme avant). Puis commandes à 0, date du jour, tâches auto
   * effacées. Renvoie { etat, total } sans modifier l'état reçu.
   */
  function passerJours(etat, k, aujourdhui, prefixe) {
    const e = JSON.parse(JSON.stringify(etat || {}));
    const n = Math.max(0, Math.floor(Number(k) || 0));
    const total = {};
    if (!Array.isArray(e.history)) e.history = [];
    for (let i = 1; i <= n; i++) {
      const date = dateMoins(aujourdhui, n - i);
      (e.products || []).forEach((p) => {
        const voulu = (p.base || 0) + (i === 1 ? p.commande || 0 : 0);
        const s = Math.min(voulu, p.stockReel || 0);
        if (s > 0) {
          seq += 1;
          e.history.unshift({ id: `${prefixe}${Date.now()}_j${seq}`, date, type: 'sortie', pid: p.id, name: p.name, emoji: p.emoji, qty: s });
          p.stockReel = Math.max(0, (p.stockReel || 0) - s);
          total[p.id] = (total[p.id] || 0) + s;
        }
      });
    }
    (e.products || []).forEach((p) => { p.commande = 0; });
    e.lastDate = aujourdhui;
    if (Array.isArray(e.tasks)) e.tasks = e.tasks.filter((t) => !t.auto);
    if (e.history.length > MAX_HISTO) e.history = e.history.slice(0, MAX_HISTO);
    return { etat: e, total };
  }

  const MODULES = {
    fournil: {
      nom: 'Fournil', doc: 'state', prefixe: 'h_',
      get: () => S,
      set: (v) => { S = v; normalizeState(); },
      enregistrer: () => save(),
      afficher: () => { if (activeModule === 'fournil') render(); },
    },
    labo: {
      nom: 'Labo', doc: 'labo', prefixe: 'lh_',
      get: () => L,
      set: (v) => { L = v; normalizeLabo(); },
      enregistrer: () => saveL(),
      afficher: () => { if (activeModule === 'labo') renderLabo(); },
    },
  };
  const enCours = {};
  // Vraies données reçues du serveur (ou du cache de l'appareil) : avant, S et L ne sont que
  // l'état par défaut, et décider de la date sur eux sauterait le vrai passage au jour suivant.
  const recu = {};
  const reporte = {}; // « Plus tard » : on ne redemande pas avant la prochaine ouverture
  const attente = []; // modules qui attendent la fenêtre
  let ouvert = null; // module dont la fenêtre est ouverte

  function resume(total, produits) {
    return (produits || [])
      .filter((p) => total[p.id])
      .map((p) => `${p.name} : −${total[p.id]}`);
  }

  async function appliquer(mod, k) {
    const m = MODULES[mod];
    const auj = today();
    enCours[mod] = true;
    let resultat = null;
    try {
      const base = typeof db !== 'undefined' ? db : null;
      if (base && typeof base.runTransaction === 'function' && navigator.onLine !== false) {
        try {
          resultat = await base.runTransaction(async (tx) => {
            const ref = base.collection('boulangerie').doc(m.doc);
            const snap = await tx.get(ref);
            const distant = snap.exists && snap.data().state ? JSON.parse(snap.data().state) : m.get();
            if (distant.lastDate === auj) return { deja: true, etat: distant };
            const r = passerJours(distant, k, auj, m.prefixe);
            tx.set(ref, { state: JSON.stringify(r.etat) });
            return r;
          });
        } catch (e) {
          resultat = null; // hors ligne ou serveur injoignable : on applique sur l'appareil
        }
      }
      if (resultat) {
        m.set(resultat.etat);
      } else {
        const actuel = m.get();
        if (actuel.lastDate === auj) return;
        resultat = passerJours(actuel, k, auj, m.prefixe);
        m.set(resultat.etat);
        m.enregistrer(); // gardé sur l'appareil, envoyé au retour du réseau
      }
      m.afficher();
      if (resultat.deja) toast(`${m.nom} : la journée a déjà été passée sur un autre appareil ✓`);
      else if (k === 0) toast(`${m.nom} : nouvelle journée, stock inchangé`);
      else if (k === 1) toast(`${m.nom} : nouvelle journée, sorties d'hier retirées du stock ✓`);
      else toast(`${m.nom} : ${k} jours de sorties retirés du stock ✓`);
    } finally {
      enCours[mod] = false;
    }
  }

  // ---------- fenêtre « combien de jours ? » ----------
  function fenetre() {
    let ov = document.getElementById('mJour');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mJour';
      ov.className = 'overlay';
      document.body.appendChild(ov);
    }
    return ov;
  }
  function fermer() {
    const ov = document.getElementById('mJour');
    if (ov) ov.classList.remove('open');
    ouvert = null;
    const suivant = attente.shift();
    if (suivant) setTimeout(() => verifierSiRecu(suivant), 0);
  }

  function demander(mod, n) {
    if (ouvert) {
      if (ouvert !== mod && !attente.includes(mod)) attente.push(mod);
      return;
    }
    ouvert = mod;
    const m = MODULES[mod];
    const etat = m.get();
    const ov = fenetre();
    ov.innerHTML = `
      <div class="modal jour-modal" role="dialog" aria-modal="true" aria-labelledby="jourTitre">
        <div class="modal-title" id="jourTitre">Bonjour ! ${esc(m.nom)} : nouvelle journée</div>
        <p class="stock-texte">L'appli n'a pas été ouverte depuis <strong>${esc(lisible(etat.lastDate))}</strong>, il y a <strong>${n} jours</strong>.</p>
        <p class="stock-texte">Combien de jours de sorties faut-il retirer du stock ? Un jour = la base / jour de chaque produit (plus les commandes du premier jour). Si personne n'a travaillé, mets 0.</p>
        <div class="jour-choix">
          <button type="button" class="stock-pas" data-pas="-1" aria-label="Un jour de moins">−</button>
          <label class="sr-only" for="jourNb">Nombre de jours de sorties à retirer</label>
          <input id="jourNb" class="jour-nb" type="text" inputmode="numeric" value="1">
          <button type="button" class="stock-pas" data-pas="1" aria-label="Un jour de plus">+</button>
          <span class="jour-unite">jour(s) sur ${n}</span>
        </div>
        <div class="jour-apercu" aria-live="polite"></div>
        <div class="mactions">
          <button type="button" class="mbtn mbtn-c" data-action="plus-tard">Plus tard</button>
          <button type="button" class="mbtn mbtn-p" data-action="appliquer"></button>
        </div>
      </div>`;
    const champ = ov.querySelector('#jourNb');
    const lire = () => {
      const v = Math.floor(Number(String(champ.value).replace(',', '.')));
      return Number.isFinite(v) ? Math.min(n, Math.max(0, v)) : 1;
    };
    const maj = () => {
      const k = lire();
      const r = passerJours(m.get(), k, today(), m.prefixe);
      const lignes = resume(r.total, m.get().products);
      ov.querySelector('.jour-apercu').innerHTML = k === 0
        ? '<p class="stock-texte">Rien ne sera retiré : seule la date passe à aujourd’hui.</p>'
        : lignes.length
          ? `<p class="stock-texte">Sera retiré du stock :</p><ul class="stock-liste">${lignes.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
          : '<p class="stock-texte">Aucune sortie prévue (base / jour à 0 ou stock vide) : rien ne sera retiré.</p>';
      ov.querySelector('[data-action=appliquer]').textContent = k === 0 ? 'Ne rien retirer' : `Retirer ${k} jour${k > 1 ? 's' : ''} de sorties`;
    };
    ov.querySelectorAll('[data-pas]').forEach((b) => {
      b.onclick = () => { champ.value = String(Math.min(n, Math.max(0, lire() + Number(b.dataset.pas)))); maj(); };
    });
    champ.oninput = maj;
    ov.querySelector('[data-action=plus-tard]').onclick = () => {
      reporte[mod] = today();
      fermer();
      toast(`${m.nom} : la question reviendra à la prochaine ouverture`);
    };
    ov.querySelector('[data-action=appliquer]').onclick = async () => {
      const k = lire();
      fermer();
      await appliquer(mod, k);
    };
    maj();
    ov.classList.add('open');
    champ.focus();
  }

  /**
   * Appelé à chaque arrivée des données de 'fournil' ou 'labo' (script principal) :
   * vérifie s'il faut passer au jour suivant.
   */
  function verifier(mod) {
    recu[mod] = true;
    verifierSiRecu(mod);
  }
  function verifierSiRecu(mod) {
    if (!recu[mod]) return;
    const m = MODULES[mod];
    let etat;
    try { etat = m.get(); } catch (e) { return; }
    if (!etat) return;
    const auj = today();
    if (etat.lastDate === auj) {
      if (ouvert === mod) { fermer(); toast(`${m.nom} : la journée a déjà été passée sur un autre appareil ✓`); }
      return;
    }
    if (enCours[mod] || reporte[mod] === auj) return;
    if (!etat.lastDate) { appliquer(mod, 0); return; }
    const n = joursEntre(etat.lastDate, auj);
    if (n <= 0) return; // date de l'appareil en retard : on ne touche à rien
    if (n === 1) appliquer(mod, 1);
    else demander(mod, n);
  }

  window.fournilJour = { verifier, passerJours, joursEntre, appliquer };

  // Changement de date appli ouverte, retour sur l'appli
  const toutVerifier = () => { verifierSiRecu('fournil'); verifierSiRecu('labo'); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') toutVerifier(); });
  setInterval(toutVerifier, 60000);
})();
