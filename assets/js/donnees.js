// Réglages → « Place occupée » : taille des documents Firestore par rapport à la limite de
// 1 Mo, et place prise par les anciens messages vocaux enregistrés avec leur son (avant le
// passage au texte seul). Lecture seule : rien n'est supprimé ni modifié.
(() => {
  const LIMITE = 1024 * 1024;
  const octets = (texte) => new Blob([texte]).size;
  const ko = (n) => `${Math.round(n / 1024).toLocaleString('fr-FR')} Ko`;

  /** Mesures sur l'état en mémoire (le même texte que celui envoyé à Firestore). */
  function mesurer() {
    const fournil = octets(JSON.stringify(S));
    const labo = octets(JSON.stringify(L));
    const vocaux = (S.notes || []).filter((n) => n && typeof n.audioUrl === 'string' && n.audioUrl);
    const sons = vocaux.reduce((t, n) => t + octets(n.audioUrl), 0);
    return { fournil, labo, nbSons: vocaux.length, sons };
  }

  function ligne(nom, taille) {
    const part = Math.min(100, Math.round((taille / LIMITE) * 100));
    return `<div class="place-ligne"><span>${nom}</span><span><strong>${ko(taille)}</strong> sur 1 024 Ko (${part} %)</span></div>
      <div class="place-barre" role="img" aria-label="${nom} : ${part} % de la limite"><span style="width:${part}%"></span></div>`;
  }

  function carte() {
    const el = document.getElementById('settingsList');
    if (!el) return;
    el.querySelector('.place-occupee')?.remove();
    const m = mesurer();
    const c = document.createElement('div');
    c.className = 'place-occupee';
    c.innerHTML = `
      <div class="sec-title">Place occupée</div>
      <div class="stock-raz-carte">
        ${ligne('Fournil et Bureau', m.fournil)}
        ${ligne('Labo', m.labo)}
        <p class="stock-texte place-sons">${m.nbSons
          ? `Anciens messages vocaux avec leur son : <strong>${m.nbSons}</strong>, soit <strong>${ko(m.sons)}</strong> (${Math.round((m.sons / Math.max(1, m.fournil)) * 100)} % du Fournil). Ils sont gardés tels quels.`
          : 'Aucun ancien message vocal avec son : les nouveaux messages vocaux sont enregistrés en texte.'}</p>
      </div>`;
    el.appendChild(c);
  }

  window.fournilPlace = { mesurer };
  const f = window.renderSettings;
  if (typeof f === 'function') {
    window.renderSettings = function (...args) {
      const r = f.apply(this, args);
      try { carte(); } catch (e) { console.warn('donnees.js', e); }
      return r;
    };
  }
})();
