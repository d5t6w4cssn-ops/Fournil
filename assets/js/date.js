// Dates de Fournil, toujours à l'heure de Paris (Europe/Paris), même entre minuit et 2 h
// et au changement d'heure (correction G8 de l'audit). Avant, « aujourd'hui » était calculé
// en heure universelle : entre minuit et 1 h (2 h en été), l'appli croyait être la veille.
// Les jours sont des textes « AAAA-MM-JJ » (format déjà utilisé dans les données).
// Script classique chargé dans <head> (window.FournilDate), testé par tests/test_date.js.
(function (racine, fabrique) {
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.FournilDate = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FUSEAU = 'Europe/Paris';
  const formatJour = new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' });

  /** Jour « AAAA-MM-JJ » à Paris pour un instant donné (maintenant par défaut). */
  function dateParis(instant) {
    return formatJour.format(instant === undefined ? new Date() : new Date(instant));
  }

  /** Jour « AAAA-MM-JJ » décalé de n jours (n négatif : jours d'avant). Sans heure : pas de piège du changement d'heure. */
  function decalerJour(jour, n) {
    const [a, m, j] = String(jour).split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
  }

  /** Date du jour en toutes lettres à Paris (« jeudi 19 novembre »), pour les en-têtes. */
  function aujourdhuiEnLettres(options) {
    return new Date().toLocaleDateString('fr-FR', { ...(options || { weekday: 'long', day: 'numeric', month: 'long' }), timeZone: FUSEAU });
  }

  return { FUSEAU, dateParis, decalerJour, aujourdhuiEnLettres };
});
