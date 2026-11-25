// Rôle « équipe » : fonctions de données (sans accès à la page).
// Utilisées dans le navigateur (window.FournilEquipe, par assets/js/acces.js), par les tests
// (tests/test_equipe_donnees.js) et par l'outil de migration sur l'émulateur
// (tools/migration-equipe.cjs). Aucune ne touche à la vraie base toute seule.
//
// Nouvelle organisation des données (après la migration) :
//   boulangerie/state     tout le Fournil et le Bureau SAUF le stock     (administrateur seul)
//   boulangerie/stock     { products, history, lastDate } du Fournil    (administrateur + équipe)
//   boulangerie/labo      inchangé                                       (administrateur seul)
//   boulangerie/recettes  inchangé ; l'équipe le lit, seul l'administrateur l'écrit
//   calculs/{id}          un calcul enregistré : { auteurUid, auteurPrenom, timestamp, calcul }
//   membres/{uid}         { prenom, role: 'equipe' } : écrit par l'administrateur seul
//   sauvegardes/{id}      copie des documents avant la migration (administrateur seul)
(function (racine, fabrique) {
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (racine && racine.document) racine.FournilEquipe = api; // navigateur (même si « module » existe)
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ADMIN_UID = '7aqnISWywCZKEMiH7sYdsL14DI13';
  const CHAMPS_STOCK = ['products', 'history', 'lastDate'];
  const MAX_HISTO = 630;
  const copie = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const estAdmin = (uid) => uid === ADMIN_UID;

  // ---------- séparer / assembler l'état du Fournil ----------
  /** Coupe l'état du Fournil en deux : la partie stock et tout le reste. */
  function separer(etat) {
    const e = etat || {};
    const stock = { products: copie(e.products || []), history: copie(e.history || []), lastDate: e.lastDate ?? null };
    const reste = {};
    Object.keys(e).forEach((k) => { if (!CHAMPS_STOCK.includes(k)) reste[k] = copie(e[k]); });
    return { stock, reste };
  }

  /** Recompose l'état complet à partir du reste (peut être vide pour l'équipe) et du stock. */
  function assembler(reste, stock) {
    const e = copie(reste || {});
    const s = stock || {};
    e.products = copie(s.products || []);
    e.history = copie(s.history || []);
    e.lastDate = s.lastDate ?? null;
    return e;
  }

  // ---------- fusion du stock (plusieurs personnes en même temps) ----------
  const NUMERIQUES = ['stockReel'];
  /**
   * Fusion à trois voies, faite dans une transaction au moment d'enregistrer :
   *   base    : dernière version reçue du serveur (avant mes changements)
   *   local   : ma version (avec mes changements)
   *   distant : version actuelle du serveur (avec les changements des autres)
   * Stock de chaque produit : distant + (local − base), jamais sous 0. Autres champs : les
   * miens si je les ai changés, sinon ceux du serveur. Produits ajoutés de part et d'autre :
   * gardés ; supprimés par moi : retirés. Historique : mes nouvelles lignes devant celles du
   * serveur, sans doublon ; mes suppressions de lignes appliquées.
   */
  function fusionnerStock(base, local, distant) {
    const b = base || { products: [], history: [], lastDate: null };
    const l = local || { products: [], history: [], lastDate: null };
    if (!distant) return copie(l);
    const d = distant;
    const parId = (liste) => new Map((liste || []).map((p) => [p.id, p]));
    const B = parId(b.products);
    const D = parId(d.products);
    const L = parId(l.products);
    const produits = [];
    const vus = new Set();
    // ordre : le mien, puis les produits ajoutés par les autres
    (l.products || []).forEach((p) => {
      const pb = B.get(p.id);
      const pd = D.get(p.id);
      vus.add(p.id);
      if (!pb) { produits.push(copie(pd ? { ...pd, ...p } : p)); return; } // ajouté par moi
      if (!pd) return; // supprimé par un autre pendant ce temps : il reste supprimé
      const r = copie(pd);
      Object.keys(p).forEach((k) => {
        if (NUMERIQUES.includes(k)) {
          const delta = (Number(p[k]) || 0) - (Number(pb[k]) || 0);
          if (delta) r[k] = Math.max(0, Math.round(((Number(pd[k]) || 0) + delta) * 1000) / 1000);
        } else if (JSON.stringify(p[k]) !== JSON.stringify(pb[k])) {
          r[k] = copie(p[k]);
        }
      });
      produits.push(r);
    });
    (d.products || []).forEach((p) => {
      if (vus.has(p.id)) return;
      if (B.has(p.id) && !L.has(p.id)) return; // supprimé par moi
      produits.push(copie(p));
    });
    // historique
    const idsBase = new Set((b.history || []).map((h) => h.id));
    const idsLocal = new Set((l.history || []).map((h) => h.id));
    const supprimes = new Set([...idsBase].filter((id) => !idsLocal.has(id)));
    const miennesNouvelles = (l.history || []).filter((h) => !idsBase.has(h.id));
    const localParId = new Map((l.history || []).map((h) => [h.id, h]));
    const reste = (d.history || [])
      .filter((h) => !supprimes.has(h.id) && !miennesNouvelles.some((m) => m.id === h.id))
      // une ligne regroupée (− / + successifs) a pu changer chez moi : ma version gagne
      .map((h) => (idsBase.has(h.id) && localParId.has(h.id) ? copie(localParId.get(h.id)) : copie(h)));
    const history = [...copie(miennesNouvelles), ...reste].slice(0, MAX_HISTO);
    const dates = [l.lastDate, d.lastDate].filter(Boolean).sort();
    return { products: produits, history, lastDate: dates.length ? dates[dates.length - 1] : null };
  }

  // ---------- auteur des lignes d'historique ----------
  /**
   * Ajoute l'auteur (par, uid) et l'heure (t) aux lignes d'historique nouvelles, c'est-à-dire
   * absentes de `idsConnus`. Les lignes reçues des autres ne sont jamais modifiées.
   */
  function signerNouvelles(history, idsConnus, auteur, maintenant) {
    let n = 0;
    (history || []).forEach((h) => {
      // les sorties du passage au jour suivant sont automatiques : pas d'auteur
      if (!h || idsConnus.has(h.id) || h.par || h.type === 'sortie') return;
      if (auteur && auteur.prenom) h.par = auteur.prenom;
      if (auteur && auteur.uid) h.parUid = auteur.uid;
      if (!h.t) h.t = maintenant;
      n += 1;
    });
    return n;
  }

  // ---------- seuils bas ----------
  const dispo = (p) => Math.max(0, (Number(p.stockReel) || 0) - (p.base || 0) - (p.commande || 0));
  /** Même règle que les pastilles du Stock : vide, faible (≤ seuil) ou ok. */
  function statut(p) {
    const d = dispo(p);
    return d <= 0 ? 'empty' : d <= (p.seuil ?? 10) ? 'low' : 'ok';
  }
  /** Produits qui viennent de passer sous leur seuil (ok → faible ou vide). */
  function passagesSousSeuil(avant, apres) {
    const A = new Map((avant || []).map((p) => [p.id, statut(p)]));
    return (apres || []).filter((p) => A.get(p.id) === 'ok' && statut(p) !== 'ok')
      .map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, dispo: dispo(p), seuil: p.seuil ?? 10, statut: statut(p) }));
  }

  // ---------- calculs enregistrés partagés ----------
  const ID_VALIDE = /^[A-Za-z0-9_-]{1,100}$/;
  let seq = 0;
  const nouvelId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${(seq += 1).toString(36)}`;
  /** Un calcul de Grigne { id, timestamp, recipeName, … } → document calculs/{id}. */
  function calculVersDoc(calcul, auteur) {
    const c = copie(calcul);
    if (!c.id || !ID_VALIDE.test(String(c.id))) c.id = nouvelId();
    delete c.auteurUid;
    delete c.auteurPrenom;
    return {
      id: c.id,
      doc: {
        auteurUid: auteur.uid,
        auteurPrenom: String(auteur.prenom || '').slice(0, 40),
        timestamp: Number(c.timestamp) || 0,
        calcul: JSON.stringify(c),
      },
    };
  }
  /** Document calculs/{id} → calcul de Grigne, avec auteurUid et auteurPrenom en plus. */
  function docVersCalcul(id, data) {
    let c = {};
    try { c = JSON.parse((data && data.calcul) || '{}') || {}; } catch (e) { c = {}; }
    return { ...c, id, auteurUid: data && data.auteurUid, auteurPrenom: (data && data.auteurPrenom) || '' };
  }
  /** Qui peut supprimer un calcul : son auteur, ou l'administrateur. */
  const peutSupprimer = (calcul, uid) => !!uid && (estAdmin(uid) || (calcul && calcul.auteurUid === uid));

  // ---------- migration ----------
  /**
   * Prépare la migration (fonction pure) à partir des documents actuels :
   *   state, recettes : contenu des documents boulangerie/state et boulangerie/recettes
   * Renvoie les nouveaux documents. boulangerie/recettes garde son champ calcHistory (copie
   * de secours, plus utilisé après la migration).
   */
  function preparerMigration({ state, labo, recettes }, { maintenant, adminPrenom } = {}) {
    if (!state || typeof state.state !== 'string') throw new Error('boulangerie/state est vide ou illisible : migration impossible.');
    const etat = JSON.parse(state.state);
    const { stock, reste } = separer(etat);
    let calcHistory = [];
    try { calcHistory = recettes && typeof recettes.calcHistory === 'string' ? JSON.parse(recettes.calcHistory) : []; } catch (e) { calcHistory = []; }
    if (!Array.isArray(calcHistory)) calcHistory = [];
    const auteur = { uid: ADMIN_UID, prenom: adminPrenom || '' };
    const calculs = calcHistory.filter((c) => c && typeof c === 'object').map((c) => calculVersDoc(c, auteur));
    const sauvegarde = { date: new Date(maintenant || Date.now()).toISOString(), state: state.state };
    if (labo && typeof labo.state === 'string') sauvegarde.labo = labo.state;
    if (recettes) {
      if (typeof recettes.recipes === 'string') sauvegarde.recipes = recettes.recipes;
      if (typeof recettes.calcHistory === 'string') sauvegarde.calcHistory = recettes.calcHistory;
    }
    return {
      stock: { state: JSON.stringify(stock) },
      state: { state: JSON.stringify(reste), migreEquipe: true },
      calculs,
      sauvegarde,
      resume: { produits: stock.products.length, lignesHistorique: stock.history.length, calculs: calculs.length },
    };
  }

  /**
   * Lance la migration sur une base Firestore (API « compat » : db.collection().doc()…).
   * À n'appeler qu'avec le compte administrateur. Refuse si elle a déjà été faite.
   * Tout est écrit en une seule fois (lot atomique) : soit tout, soit rien.
   */
  async function migrerBase(db, options = {}) {
    const col = db.collection('boulangerie');
    const [sState, sStock, sLabo, sRec] = await Promise.all(
      ['state', 'stock', 'labo', 'recettes'].map((d) => col.doc(d).get(options.source ? { source: options.source } : undefined)),
    );
    if (sStock.exists) return { deja: true };
    if (!sState.exists) throw new Error('boulangerie/state est introuvable : migration impossible.');
    const m = preparerMigration(
      { state: sState.data(), labo: sLabo.exists ? sLabo.data() : null, recettes: sRec.exists ? sRec.data() : null },
      options,
    );
    const lot = db.batch();
    const idSauvegarde = `avant-equipe-${m.sauvegarde.date.replace(/[^0-9]/g, '').slice(0, 14)}`;
    lot.set(db.collection('sauvegardes').doc(idSauvegarde), m.sauvegarde);
    lot.set(col.doc('stock'), m.stock);
    lot.set(col.doc('state'), m.state);
    m.calculs.forEach((c) => lot.set(db.collection('calculs').doc(c.id), c.doc));
    await lot.commit();
    return { deja: false, sauvegarde: idSauvegarde, ...m.resume };
  }

  /**
   * Retour à l'ancien format (au cas où) : remet le stock dans boulangerie/state et supprime
   * boulangerie/stock. Les calculs partagés restent dans calculs/ ; ils sont aussi recopiés
   * dans le champ calcHistory de boulangerie/recettes (20 plus récents, comme avant).
   */
  async function annulerMigration(db) {
    const col = db.collection('boulangerie');
    const [sState, sStock] = await Promise.all([col.doc('state').get(), col.doc('stock').get()]);
    if (!sStock.exists) return { deja: true };
    const reste = sState.exists && sState.data().state ? JSON.parse(sState.data().state) : {};
    const stock = JSON.parse(sStock.data().state || '{}');
    const etat = assembler(reste, stock);
    const sCalculs = await db.collection('calculs').get();
    const calculs = [];
    sCalculs.forEach((d) => {
      const c = docVersCalcul(d.id, d.data());
      delete c.auteurUid;
      delete c.auteurPrenom;
      calculs.push(c);
    });
    calculs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const lot = db.batch();
    lot.set(col.doc('state'), { state: JSON.stringify(etat) });
    lot.set(col.doc('recettes'), { calcHistory: JSON.stringify(calculs.slice(0, 20)) }, { merge: true });
    lot.delete(col.doc('stock'));
    await lot.commit();
    return { deja: false, produits: etat.products.length };
  }

  return {
    ADMIN_UID, CHAMPS_STOCK, estAdmin, separer, assembler, fusionnerStock, signerNouvelles,
    statut, dispo, passagesSousSeuil, calculVersDoc, docVersCalcul, peutSupprimer,
    preparerMigration, migrerBase, annulerMigration,
  };
});
