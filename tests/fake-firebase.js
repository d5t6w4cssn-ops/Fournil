// Faux Firebase pour les tests : Auth + Firestore en mémoire.
// Aucun appel réseau : la vraie base n'est jamais touchée.
// Simule aussi le hors ligne (écritures gardées « sur l'appareil » puis envoyées au retour
// du réseau), un envoi refusé par le serveur et la persistance hors ligne.
'use strict';

const ADMIN_UID = '7aqnISWywCZKEMiH7sYdsL14DI13';

/**
 * Imitation simple des règles (firebase/firestore-fournil.rules), pour vérifier dans les
 * tests que l'appli de l'équipe ne tente jamais un accès interdit. Les vraies règles sont
 * testées sur l'émulateur (tests/regles/).
 */
function autorise(docs, uid, op, path, data) {
  if (!uid) return false;
  if (uid === ADMIN_UID) return true;
  const fiche = docs.get(`membres/${uid}`);
  const [col, id] = path.split('/');
  if (col === 'membres') return op === 'lire' && id === uid;
  if (!fiche || fiche.role !== 'equipe') return false;
  if (path === 'boulangerie/recettes') return op === 'lire';
  if (path === 'boulangerie/stock') return op === 'lire' || (op === 'ecrire' && docs.has(path));
  if (col === 'calculs') {
    if (op === 'lire') return true;
    if (op === 'ecrire') return !docs.has(path) && data && data.auteurUid === uid && data.auteurPrenom === fiche.prenom;
    if (op === 'supprimer') return (docs.get(path) || {}).auteurUid === uid;
  }
  return false;
}

function createFakeFirebase(initialDocs = {}, { utilisateur } = {}) {
  const docs = new Map(Object.entries(initialDocs).map(([k, v]) => [k, { ...v }]));
  const listeners = new Map(); // chemin → [callback]
  const writes = []; // { path, data, options }
  const reads = []; // { path, options }
  const journal = []; // ordre des appels : 'persistance', 'ecoute:<chemin>'
  const transactions = [];
  const enAttente = []; // écritures faites hors ligne : { path, resolve }
  let failServerGet = false;
  let horsLigne = false;
  let echecs = []; // codes d'erreur des prochains envois refusés
  let persistance = null; // options reçues par enablePersistence
  let echecPersistance = null;

  const refus = []; // accès refusés par les règles imitées : { op, path }
  const collListeners = new Map(); // collection → [callback]
  const user = utilisateur === null ? null : { uid: ADMIN_UID, email: 'test@exemple.fr', ...(utilisateur || {}) };
  const refuser = (op, path) => {
    refus.push({ op, path });
    return Promise.reject(Object.assign(new Error(`permission refusée : ${op} ${path}`), { code: 'permission-denied' }));
  };
  const verifier = (op, path, data) => autorise(docs, user && user.uid, op, path, data);
  const later = (fn) => setTimeout(fn, 0);
  const enAttentePour = (path) => enAttente.some((e) => e.path === path);
  const snapshot = (path) => {
    const data = docs.get(path);
    return {
      exists: data !== undefined,
      data: () => (data ? { ...data } : undefined),
      metadata: { hasPendingWrites: enAttentePour(path), fromCache: horsLigne },
    };
  };
  const collSnapshot = (c) => {
    const liste = [...docs.keys()].filter((k) => k.startsWith(`${c}/`) && k.split('/').length === 2)
      .map((k) => ({ id: k.split('/')[1], exists: true, data: () => ({ ...docs.get(k) }) }));
    return { docs: liste, size: liste.length, empty: !liste.length, forEach: (f) => liste.forEach(f), metadata: { hasPendingWrites: false, fromCache: horsLigne } };
  };
  const notify = (path) => {
    (listeners.get(path) || []).forEach((cb) => later(() => cb(snapshot(path))));
    const c = path.split('/')[0];
    (collListeners.get(c) || []).forEach((cb) => later(() => cb(collSnapshot(c))));
  };
  const notifierTout = () => listeners.forEach((_, path) => notify(path));

  function doc(path) {
    return {
      id: path.split('/')[1],
      path,
      get(options) {
        reads.push({ path, options });
        if (!verifier('lire', path)) return refuser('lire', path);
        if ((failServerGet || horsLigne) && options && options.source === 'server') return Promise.reject(new Error('hors ligne'));
        return Promise.resolve(snapshot(path));
      },
      set(data, options) {
        if (!verifier('ecrire', path, data)) return refuser('ecrire', path);
        writes.push({ path, data: JSON.parse(JSON.stringify(data)), options });
        if (echecs.length) {
          const code = echecs.shift();
          return Promise.reject(Object.assign(new Error(`refusé : ${code}`), { code }));
        }
        const prev = options && options.merge ? docs.get(path) || {} : {};
        docs.set(path, { ...prev, ...data });
        if (horsLigne) {
          return new Promise((resolve) => {
            enAttente.push({ path, resolve });
            notify(path);
          });
        }
        notify(path);
        return Promise.resolve();
      },
      delete() {
        if (!verifier('supprimer', path)) return refuser('supprimer', path);
        writes.push({ path, supprime: true });
        docs.delete(path);
        notify(path);
        return Promise.resolve();
      },
      onSnapshot(a, b, c) {
        const cb = typeof a === 'function' ? a : b;
        const err = typeof a === 'function' ? b : c;
        journal.push(`ecoute:${path}`);
        if (!verifier('lire', path)) {
          refus.push({ op: 'ecouter', path });
          if (typeof err === 'function') later(() => err(Object.assign(new Error('permission refusée'), { code: 'permission-denied' })));
          return () => {};
        }
        if (!listeners.has(path)) listeners.set(path, []);
        listeners.get(path).push(cb);
        later(() => cb(snapshot(path)));
        return () => {};
      },
    };
  }

  let auto = 0;
  function collection(c) {
    const q = {
      doc: (d) => doc(`${c}/${d || `auto${(auto += 1)}`}`),
      orderBy: () => q,
      limit: () => q,
      get() {
        if (!verifier('lire', `${c}/*`)) return refuser('lire', `${c}/*`);
        return Promise.resolve(collSnapshot(c));
      },
      onSnapshot(cb, err) {
        journal.push(`ecoute:${c}`);
        if (!verifier('lire', `${c}/*`)) {
          refus.push({ op: 'ecouter', path: c });
          if (typeof err === 'function') later(() => err(Object.assign(new Error('permission refusée'), { code: 'permission-denied' })));
          return () => {};
        }
        if (!collListeners.has(c)) collListeners.set(c, []);
        collListeners.get(c).push(cb);
        later(() => cb(collSnapshot(c)));
        return () => {};
      },
    };
    return q;
  }
  const firestore = {
    collection,
    batch() {
      const ops = [];
      const lot = {
        set: (ref, data, options) => { ops.push(() => ref.set(data, options)); return lot; },
        delete: (ref) => { ops.push(() => ref.delete()); return lot; },
        commit: async () => { for (const op of ops) await op(); },
      };
      return lot;
    },
    // Transaction : lecture puis écriture d'un seul tenant ; impossible hors ligne.
    async runTransaction(fn) {
      transactions.push('debut');
      if (horsLigne) throw Object.assign(new Error('hors ligne'), { code: 'unavailable' });
      const ecritures = [];
      const tx = { get: (ref) => ref.get(), set: (ref, data, options) => { ecritures.push([ref, data, options]); return tx; } };
      if (transactions.echecsRestants > 0) { transactions.echecsRestants -= 1; throw Object.assign(new Error('transaction refusée'), { code: 'aborted' }); }
      const r = await fn(tx);
      ecritures.forEach(([ref, data, options]) => ref.set(data, options));
      return r;
    },
    enablePersistence(options) {
      journal.push('persistance');
      persistance = options || {};
      return echecPersistance ? Promise.reject(Object.assign(new Error(echecPersistance), { code: echecPersistance })) : Promise.resolve();
    },
  };
  const auth = {
    currentUser: user,
    onAuthStateChanged(cb) { later(() => cb(user)); return () => {}; },
    signInWithEmailAndPassword: () => Promise.resolve({ user }),
    signOut: () => Promise.resolve(),
  };

  const firebase = {
    apps: [],
    initializeApp(config) { firebase.apps.push({ config }); },
    auth: () => auth,
    firestore: () => firestore,
  };

  return {
    firebase,
    docs,
    writes,
    refus,
    user,
    reads,
    journal,
    /** Simule un autre appareil qui écrit dans la base (sans passer par l'appli testée). */
    externalSet(path, data) { docs.set(path, { ...(docs.get(path) || {}), ...data }); },
    /** Nombre d'écoutes temps réel en place (l'appli est prête quand il y en a 3). */
    nbEcoutes() { let n = 0; listeners.forEach((l) => { n += l.length; }); return n; },
    setFailServerGet(v) { failServerGet = v; },
    /** Coupe ou rétablit le réseau : au retour, les écritures en attente arrivent au serveur. */
    setHorsLigne(v) {
      horsLigne = v;
      if (!v) enAttente.splice(0).forEach((e) => e.resolve());
      notifierTout();
    },
    nbEnAttente: () => enAttente.length,
    nbTransactions: () => transactions.length,
    /** Le prochain envoi (ou les n prochains) sera refusé par le serveur avec ce code. */
    refuserProchainEnvoi(code, n = 1) { for (let i = 0; i < n; i++) echecs.push(code); },
    /** enablePersistence échouera avec ce code (ex. 'unimplemented'). */
    setEchecPersistance(code) { echecPersistance = code; },
    persistance: () => persistance,
  };
}

module.exports = { createFakeFirebase, ADMIN_UID };
