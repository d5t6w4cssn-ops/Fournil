// Faux Firebase pour les tests : Auth + Firestore en mémoire.
// Aucun appel réseau : la vraie base n'est jamais touchée.
'use strict';

function createFakeFirebase(initialDocs = {}) {
  const docs = new Map(Object.entries(initialDocs).map(([k, v]) => [k, { ...v }]));
  const listeners = new Map(); // chemin → [callback]
  const writes = []; // { path, data, options }
  const reads = []; // { path, options }
  let failServerGet = false;

  const later = (fn) => setTimeout(fn, 0);
  const snapshot = (path) => {
    const data = docs.get(path);
    return { exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  };
  const notify = (path) => (listeners.get(path) || []).forEach((cb) => later(() => cb(snapshot(path))));

  function doc(path) {
    return {
      get(options) {
        reads.push({ path, options });
        if (failServerGet && options && options.source === 'server') return Promise.reject(new Error('hors ligne'));
        return Promise.resolve(snapshot(path));
      },
      set(data, options) {
        writes.push({ path, data: JSON.parse(JSON.stringify(data)), options });
        const prev = options && options.merge ? docs.get(path) || {} : {};
        docs.set(path, { ...prev, ...data });
        notify(path);
        return Promise.resolve();
      },
      onSnapshot(cb) {
        if (!listeners.has(path)) listeners.set(path, []);
        listeners.get(path).push(cb);
        later(() => cb(snapshot(path)));
        return () => {};
      },
    };
  }

  const firestore = { collection: (c) => ({ doc: (d) => doc(`${c}/${d}`) }) };
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
    /** Simule un autre appareil qui écrit dans la base (sans passer par l'appli testée). */
    externalSet(path, data) { docs.set(path, { ...(docs.get(path) || {}), ...data }); },
    setFailServerGet(v) { failServerGet = v; },
  };
}

module.exports = { createFakeFirebase };
