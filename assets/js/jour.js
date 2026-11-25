// Passage au jour suivant (bloquant B1 de l'audit).
// Avant : checkDay() ne tournait qu'au chargement, sur l'état par défaut, avant l'arrivée des
// vraies données : les sorties de la veille n'étaient jamais retirées du stock.
// Maintenant : vérifié à chaque arrivée des données (Fournil et Labo), au retour sur l'appli
// et chaque minute (changement de date appli ouverte).
// - 1 jour manqué : comme avant, appliqué tout seul (sorties = base + commandes).
// - Plusieurs jours : plus de question (fenêtre retirée le 26 novembre 2026, demande de
//   l'utilisateur) : un seul jour de sorties est retiré, comme le faisait l'appli d'origine,
//   et un message le dit.
// - En ligne : dans une transaction Firestore, pour ne jamais retirer deux fois les mêmes
//   sorties si deux appareils s'ouvrent en même temps. Hors ligne : sur l'appareil, envoyé
//   au retour du réseau.
(() => {
  const MAX_HISTO = 630;
  let seq = 0;

  // ---------- dates « AAAA-MM-JJ » ----------
  const versUTC = (d) => { const [a, m, j] = String(d).split('-').map(Number); return Date.UTC(a, m - 1, j); };
  const joursEntre = (de, a) => Math.round((versUTC(a) - versUTC(de)) / 86400000);
  const dateMoins = (d, n) => new Date(versUTC(d) - n * 86400000).toISOString().slice(0, 10);

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
      // après la migration « équipe », le stock du Fournil est dans boulangerie/stock
      // (assets/js/acces.js) ; avant, tout est dans boulangerie/state
      nom: 'Fournil', prefixe: 'h_',
      get doc() { return window.fournilAcces ? window.fournilAcces.jour.doc() : 'state'; },
      get: () => (window.fournilAcces ? window.fournilAcces.jour.get() : S),
      set: (v, serveur) => { if (window.fournilAcces) window.fournilAcces.jour.set(v, serveur); else { S = v; normalizeState(); } },
      pret: () => !window.fournilAcces || window.fournilAcces.jour.pret(),
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

  async function appliquer(mod, k, manques) {
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
        m.set(resultat.etat, true);
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
      else if (k === 1 && manques > 1) toast(`${m.nom} : ${manques} jours sans ouverture, un seul jour de sorties retiré du stock ✓`);
      else if (k === 1) toast(`${m.nom} : nouvelle journée, sorties d'hier retirées du stock ✓`);
      else toast(`${m.nom} : ${k} jours de sorties retirés du stock ✓`);
    } finally {
      enCours[mod] = false;
    }
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
    if (m.pret && !m.pret()) return; // équipe avant la migration : rien à faire ici
    let etat;
    try { etat = m.get(); } catch (e) { return; }
    if (!etat) return;
    const auj = today();
    if (etat.lastDate === auj) return;
    if (enCours[mod]) return;
    if (!etat.lastDate) { appliquer(mod, 0); return; }
    const n = joursEntre(etat.lastDate, auj);
    if (n <= 0) return; // date de l'appareil en retard : on ne touche à rien
    appliquer(mod, 1, n);
  }

  window.fournilJour = { verifier, passerJours, joursEntre, appliquer };

  // Changement de date appli ouverte, retour sur l'appli
  const toutVerifier = () => { verifierSiRecu('fournil'); verifierSiRecu('labo'); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') toutVerifier(); });
  setInterval(toutVerifier, 60000);
})();
