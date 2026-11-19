// Faux Firebase pour les tests : Auth + Firestore en mémoire.
// Aucun appel réseau : la vraie base n'est jamais touchée.
// Simule aussi le hors ligne (écritures gardées « sur l'appareil » puis envoyées au retour
// du réseau), un envoi refusé par le serveur et la persistance hors ligne.
'use strict';

function createFakeFirebase(initialDocs = {}) {
  const docs = new Map(Object.entries(initialDocs).map(([k, v]) => [k, { ...v }]));
  const listeners = new Map(); // chemin → [callback]
  const writes = []; // { path, data, options }
  const reads = []; // { path, options }
  const journal = []; // ordre des appels : 'persistance', 'ecoute:<chemin>'
  const enAttente = []; // écritures faites hors ligne : { path, resolve }
  let failServerGet = false;
  let horsLigne = false;
  let echecs = []; // codes d'erreur des prochains envois refusés
  let persistance = null; // options reçues par enablePersistence
  let echecPersistance = null;

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
  const notify = (path) => (listeners.get(path) || []).forEach((cb) => later(() => cb(snapshot(path))));
  const notifierTout = () => listeners.forEach((_, path) => notify(path));

  function doc(path) {
    return {
      get(options) {
        reads.push({ path, options });
        if ((failServerGet || horsLigne) && options && options.source === 'server') return Promise.reject(new Error('hors ligne'));
        return Promise.resolve(snapshot(path));
      },
      set(data, options) {
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
      onSnapshot(a, b) {
        const cb = typeof a === 'function' ? a : b;
        journal.push(`ecoute:${path}`);
        if (!listeners.has(path)) listeners.set(path, []);
        listeners.get(path).push(cb);
        later(() => cb(snapshot(path)));
        return () => {};
      },
    };
  }

  const firestore = {
    collection: (c) => ({ doc: (d) => doc(`${c}/${d}`) }),
    enablePersistence(options) {
      journal.push('persistance');
      persistance = options || {};
      return echecPersistance ? Promise.reject(Object.assign(new Error(echecPersistance), { code: echecPersistance })) : Promise.resolve();
    },
  };
  const user = { uid: 'test', email: 'test@exemple.fr' };
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
    /** Le prochain envoi (ou les n prochains) sera refusé par le serveur avec ce code. */
    refuserProchainEnvoi(code, n = 1) { for (let i = 0; i < n; i++) echecs.push(code); },
    /** enablePersistence échouera avec ce code (ex. 'unimplemented'). */
    setEchecPersistance(code) { echecPersistance = code; },
    persistance: () => persistance,
  };
}

module.exports = { createFakeFirebase };
