// État réel de l'enregistrement (bloquant B2 de l'audit).
// - Chaque envoi vers Firestore est suivi jusqu'à ce que le serveur le confirme.
// - Avec la persistance hors ligne (activée dans initFirebase), une saisie faite sans réseau
//   est gardée sur l'appareil et part toute seule au retour du réseau ; Firestore la signale
//   par metadata.hasPendingWrites, même après un rechargement de la page.
// - « Synchronisé » seulement quand plus rien n'attend ; sinon « Pas encore envoyé » ou
//   « Hors ligne » ; bandeau d'erreur clair si le serveur refuse un envoi.
(() => {
  const etat = {
    enCours: 0, // envois partis, pas encore confirmés
    enAttente: {}, // document → true si Firestore a des écritures en attente
    erreur: null, // { quoi, code, message, renvoyer }
    enLigne: navigator.onLine !== false,
    connecte: false, // données reçues au moins une fois
    persistance: 'inconnue',
  };
  const NOMS = { state: 'Fournil', labo: 'Labo', recettes: 'Recettes' };

  function messageErreur(e) {
    const code = (e && e.code) || '';
    const texte = String((e && e.message) || '');
    if (code === 'permission-denied') return "Le serveur a refusé l'enregistrement : ce compte n'a pas le droit d'écrire. Déconnecte-toi, reconnecte-toi avec le compte de Fournil, puis réessaie.";
    if (code === 'unauthenticated') return 'Ta session a expiré. Reconnecte-toi, puis réessaie.';
    if (code === 'resource-exhausted') return "Le serveur a atteint sa limite pour l'instant. Réessaie un peu plus tard.";
    if (code === 'invalid-argument' || /longer than|too large|exceeds the maximum/i.test(texte)) return "Les données sont trop lourdes pour le serveur (plus de 1 Mo). Supprime d'anciens messages vocaux ou de l'historique, puis réessaie.";
    return `L'envoi a échoué${code ? ` (${code})` : ''}. Vérifie la connexion, puis réessaie.`;
  }

  /**
   * Suit un envoi : promesse de set() de Firestore.
   * quoi : 'state' | 'labo' | 'recettes' ; renvoyer : fonction qui renvoie exactement les mêmes données.
   */
  function suivre(promesse, quoi, renvoyer) {
    etat.enCours += 1;
    maj();
    promesse.then(
      () => {
        etat.enCours -= 1;
        if (etat.erreur && etat.erreur.quoi === quoi) etat.erreur = null;
        maj();
      },
      (e) => {
        etat.enCours -= 1;
        etat.erreur = { quoi, code: (e && e.code) || '', message: messageErreur(e), renvoyer };
        maj();
      },
    );
    return promesse;
  }

  // Écritures en attente signalées par Firestore (aussi celles d'avant un rechargement).
  function surveiller(base) {
    if (!base || surveiller.fait) return;
    surveiller.fait = true;
    Object.keys(NOMS).forEach((d) => {
      try {
        base.collection('boulangerie').doc(d).onSnapshot({ includeMetadataChanges: true }, (snap) => {
          etat.enAttente[d] = !!(snap && snap.metadata && snap.metadata.hasPendingWrites);
          maj();
        }, () => {});
      } catch (e) {
        // sans écoute, on se fie au suivi des envois
      }
    });
  }

  function persistance(e) {
    etat.persistance = e ? 'indisponible' : 'active';
    if (e && e.code !== 'failed-precondition') {
      toast('Mode hors ligne indisponible sur ce navigateur : attends « Synchronisé » avant de fermer l’appli.');
    }
    maj();
  }

  function etatActuel() {
    const attente = etat.enCours > 0 || Object.values(etat.enAttente).some(Boolean);
    if (etat.erreur) return { cle: 'erreur', texte: "Erreur d'envoi" };
    if (!etat.enLigne) return { cle: 'hors-ligne', texte: attente ? 'Hors ligne · pas encore envoyé' : 'Hors ligne' };
    if (attente) return { cle: 'attente', texte: 'Pas encore envoyé' };
    if (!etat.connecte) return { cle: 'connexion', texte: 'Connexion…' };
    return { cle: 'ok', texte: 'Synchronisé' };
  }

  const AIDE = {
    ok: 'Tout est enregistré sur le serveur.',
    attente: 'Tes dernières saisies sont gardées sur cet appareil et partent vers le serveur.',
    'hors-ligne': 'Pas de réseau : tes saisies sont gardées sur cet appareil et partiront dès le retour du réseau.',
    erreur: "Le serveur a refusé un envoi : voir le message en haut de l'écran.",
    connexion: 'Connexion au serveur en cours.',
  };

  function maj() {
    const e = etatActuel();
    // pastille dans chaque en-tête de module (créée une fois)
    document.querySelectorAll('.hdr-top').forEach((top) => {
      let p = top.querySelector('.etat-synchro');
      if (!p) {
        p = document.createElement('span');
        p.className = 'etat-synchro';
        p.setAttribute('role', 'status');
        const date = top.querySelector('.hdr-date');
        top.insertBefore(p, date || null);
      }
      p.dataset.etat = e.cle;
      p.textContent = e.texte;
      p.title = AIDE[e.cle];
    });
    // accueil : point et texte existants
    const txt = document.getElementById('syncTxt');
    const dot = document.getElementById('syncDot');
    if (txt) txt.textContent = e.texte;
    if (dot) dot.dataset.etat = e.cle;
    // bandeau d'erreur
    let b = document.getElementById('bandeauSynchro');
    if (etat.erreur) {
      if (!b) {
        b = document.createElement('div');
        b.id = 'bandeauSynchro';
        b.className = 'bandeau-synchro';
        b.setAttribute('role', 'alert');
        document.body.appendChild(b);
      }
      b.innerHTML = `<p><strong>Pas enregistré (${NOMS[etat.erreur.quoi] || 'données'}).</strong> <span class="bandeau-msg"></span></p>
        <div class="bandeau-actions"><button type="button" class="bandeau-reessayer">Réessayer</button><button type="button" class="bandeau-fermer" aria-label="Fermer le message">×</button></div>`;
      b.querySelector('.bandeau-msg').textContent = etat.erreur.message;
      b.querySelector('.bandeau-reessayer').onclick = reessayer;
      b.querySelector('.bandeau-fermer').onclick = () => { b.hidden = true; };
      b.hidden = false;
    } else if (b) {
      b.hidden = true;
    }
  }

  function reessayer() {
    const err = etat.erreur;
    if (!err) return;
    etat.erreur = null;
    if (typeof err.renvoyer === 'function') {
      try {
        suivre(err.renvoyer(), err.quoi, err.renvoyer);
      } catch (e) {
        etat.erreur = { ...err, message: messageErreur(e) };
      }
    }
    maj();
  }

  window.addEventListener('online', () => { etat.enLigne = true; maj(); });
  window.addEventListener('offline', () => { etat.enLigne = false; maj(); });

  window.fournilSynchro = {
    suivre,
    persistance,
    connexion(ok) { if (ok) etat.connecte = true; maj(); },
    surveiller,
    etat: () => ({ ...etatActuel(), enCours: etat.enCours, erreur: etat.erreur && etat.erreur.message }),
    maj,
  };

  // Les écoutes de suivi démarrent dès que la base est prête (après la connexion).
  function brancher() {
    const f = window.initFirebase;
    if (typeof f === 'function') {
      window.initFirebase = function (...args) {
        const r = f.apply(this, args);
        try { surveiller(typeof db !== 'undefined' ? db : null); } catch (e) { /* hors ligne au démarrage */ }
        return r;
      };
    }
    maj();
  }
  // Chargé après le script principal : initFirebase existe déjà.
  brancher();
})();
