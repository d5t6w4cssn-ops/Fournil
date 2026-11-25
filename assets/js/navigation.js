// Navigation de Fournil, dans le style de Grigne :
// - mobile : barre en bas avec les modules principaux et « Plus » (feuille avec le reste) ;
// - ordinateur (≥ 860 px) : barre latérale avec tout.
// Elle n'invente aucun écran : chaque entrée appelle les fonctions existantes
// (openModule, sw, swL, swB, goHome), et l'entrée active est déduite de l'écran affiché.
(() => {
  const svg = (d) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
  const I = {
    accueil: svg('<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>'),
    stock: svg('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5"/>'),
    magasin: svg('<path d="M4 9h16l-1.2-4.2A1 1 0 0 0 17.8 4H6.2a1 1 0 0 0-1 .8z"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>'),
    recettes: svg('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M8 7h7M8 10.5h5"/>'),
    taches: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.3 2.3 4.7-5"/>'),
    historique: svg('<path d="M4 19h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>'),
    calendrier: svg('<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
    labo: svg('<path d="M4 15h16"/><path d="M6 15c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M12 9V6M10 4.5h4"/><path d="M5 15l1 5h12l1-5"/>'),
    matieres: svg('<path d="M12 22V7"/><path d="M12 11.5c-2.6 0-4.2-1.6-4.6-4 2.6 0 4.2 1.5 4.6 4zM12 11.5c2.6 0 4.2-1.6 4.6-4-2.6 0-4.2 1.5-4.6 4z"/><path d="M12 16.5c-2.6 0-4.2-1.6-4.6-4 2.6 0 4.2 1.5 4.6 4zM12 16.5c2.6 0 4.2-1.6 4.6-4-2.6 0-4.2 1.5-4.6 4z"/>'),
    fournisseurs: svg('<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'),
    tournee: svg('<path d="M3 16V7h11v9"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'),
    journal: svg('<path d="M6 3h10l3 3v15H6z"/><path d="M9 9h7M9 13h7M9 17h4"/>'),
    stats: svg('<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'),
    reglages: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
    plus: svg('<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>'),
    guide: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7"/><path d="M12 17h.01"/>'),
    sortie: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h10"/>'),
    lune: '<svg class="ic-moon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg><svg class="ic-sun" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  };

  // principal : visible dans la barre du bas (mobile). Les autres vont dans « Plus ».
  // Dans le Labo (audit G7), Stock, Recettes et Tâches ouvrent les écrans du Labo, et le
  // bouton Labo devient « Fournil » pour revenir au Fournil.
  const dansLabo = () => typeof activeModule !== 'undefined' && activeModule === 'labo';
  const ONGLET_LABO = { stock: 'lstock', recettes: 'recettes', taches: 'ltasks' };
  const ENTREE_LABO = { lstock: 'stock', recettes: 'recettes', ltasks: 'taches' };
  const ENTREES = [
    { id: 'accueil', label: 'Accueil', go: () => goHome() },
    { id: 'stock', label: 'Stock', principal: true, groupe: 'Fournil', go: () => { if (dansLabo()) swL('lstock'); else { openModule('fournil'); sw('stock'); } } },
    { id: 'magasin', label: 'Magasin', groupe: 'Fournil', go: () => { openModule('fournil'); sw('magasin'); } },
    { id: 'recettes', label: 'Recettes', principal: true, groupe: 'Fournil', go: () => { if (dansLabo()) swL('recettes'); else { openModule('fournil'); sw('recettes'); } } },
    { id: 'taches', label: 'Tâches', principal: true, groupe: 'Fournil', badge: 'taskBadge', badgeLabo: 'laboTaskBadge', go: () => { if (dansLabo()) swL('ltasks'); else { openModule('fournil'); sw('tasks'); } } },
    { id: 'historique', label: 'Historique', groupe: 'Fournil', go: () => { openModule('fournil'); sw('histo'); } },
    { id: 'calendrier', label: 'Calendrier', groupe: 'Fournil', go: () => { openModule('fournil'); sw('calendrier'); } },
    { id: 'labo', label: 'Labo', principal: true, groupe: 'Labo', go: () => { if (dansLabo()) { openModule('fournil'); sw('stock'); } else openModule('labo'); } },
    { id: 'matieres', label: 'Matières', groupe: 'Bureau', go: () => { openModule('bureau'); swB('matieres'); } },
    { id: 'fournisseurs', label: 'Fournisseurs', groupe: 'Bureau', go: () => { openModule('bureau'); swB('cmd-fournisseur'); } },
    { id: 'tournee', label: 'Tournée', groupe: 'Bureau', go: () => { openModule('bureau'); swB('cmd-clients'); } },
    { id: 'journal', label: 'Journal', groupe: 'Bureau', go: () => { openModule('bureau'); swB('journal'); } },
    { id: 'stats', label: 'Stats', groupe: 'Bureau', go: () => { openModule('bureau'); swB('stats'); } },
    { id: 'reglages', label: 'Réglages', groupe: 'Fournil', go: () => { openModule('fournil'); sw('settings'); } },
  ];
  const ONGLET_FOURNIL = { stock: 'stock', magasin: 'magasin', recettes: 'recettes', tasks: 'taches', histo: 'historique', calendrier: 'calendrier', settings: 'reglages' };
  const ONGLET_BUREAU = { matieres: 'matieres', 'cmd-fournisseur': 'fournisseurs', 'cmd-clients': 'tournee', journal: 'journal', stats: 'stats' };

  const bouton = (e, cls) =>
    `<button type="button" class="${cls}" data-nav="${e.id}">${I[e.id]}<span class="nav-label">${e.label}</span>${e.badge ? `<span class="nav-badge" data-badge-de="${e.badge}" hidden></span>` : ''}</button>`;
  const reglagesAffichage = `
    <div class="nav-prefs">
      <button type="button" class="theme-btn read-btn" data-read-toggle aria-pressed="false" aria-label="Lecture facile"><span aria-hidden="true">Aa</span></button>
      <button type="button" class="theme-btn" data-theme-toggle aria-pressed="false" aria-label="Mode sombre">${I.lune}</button>
      <button type="button" class="theme-btn" data-nav-action="guide" aria-label="Guide d'utilisation">${I.guide}</button>
      <button type="button" class="theme-btn" data-nav-action="sortie" aria-label="Se déconnecter">${I.sortie}</button>
    </div>`;

  function construire() {
    const nav = document.createElement('nav');
    nav.id = 'appNav';
    nav.className = 'app-nav';
    nav.setAttribute('aria-label', 'Navigation principale');
    nav.hidden = true;
    let groupe = null;
    let html = '<div class="nav-marque" aria-hidden="true">Fournil</div><div class="nav-liste">';
    ENTREES.forEach((e) => {
      if (e.groupe && e.groupe !== groupe && e.groupe === 'Bureau') html += '<p class="nav-groupe">Bureau</p>';
      groupe = e.groupe;
      html += bouton(e, `nav-item${e.principal ? ' nav-principal' : ''}`);
    });
    html += `<button type="button" class="nav-item nav-plus" aria-expanded="false" aria-controls="navPlus">${I.plus}<span class="nav-label">Plus</span></button></div>${reglagesAffichage}`;
    nav.innerHTML = html;
    document.body.appendChild(nav);

    const feuille = document.createElement('div');
    feuille.id = 'navPlus';
    feuille.className = 'nav-feuille';
    feuille.hidden = true;
    feuille.innerHTML = `
      <div class="nav-feuille-fond" data-fermer></div>
      <div class="nav-feuille-corps" role="dialog" aria-modal="true" aria-label="Plus">
        <div class="nav-feuille-tete"><h2>Plus</h2><button type="button" class="nav-fermer" data-fermer aria-label="Fermer">×</button></div>
        <div class="nav-feuille-grille">${ENTREES.filter((e) => !e.principal).map((e) => bouton(e, 'nav-tuile')).join('')}</div>
        ${reglagesAffichage}
      </div>`;
    document.body.appendChild(feuille);

    const fermer = () => {
      feuille.hidden = true;
      nav.querySelector('.nav-plus').setAttribute('aria-expanded', 'false');
    };
    document.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('[data-nav], [data-nav-action], .nav-plus, [data-fermer]');
      if (!t) return;
      if (t.classList.contains('nav-plus')) {
        feuille.hidden = !feuille.hidden;
        t.setAttribute('aria-expanded', String(!feuille.hidden));
        if (!feuille.hidden) feuille.querySelector('.nav-tuile')?.focus();
        return;
      }
      if (t.hasAttribute('data-fermer')) return fermer();
      if (t.dataset.navAction === 'guide') { fermer(); openHelp(); return; }
      if (t.dataset.navAction === 'sortie') { fermer(); doLogout(); return; }
      const e = ENTREES.find((x) => x.id === t.dataset.nav);
      if (!e) return;
      fermer();
      e.go();
      window.scrollTo(0, 0);
      majNav();
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !feuille.hidden) fermer(); });
    if (window.fournilSyncTheme) window.fournilSyncTheme();
  }

  function entreeActive() {
    if (typeof activeModule === 'undefined' || !activeModule) return 'accueil';
    if (activeModule === 'labo') return (typeof laboTab !== 'undefined' && ENTREE_LABO[laboTab]) || 'labo-autre';
    if (activeModule === 'fournil') return ONGLET_FOURNIL[tab] || 'stock';
    const sec = document.querySelector('#bureauModule .bur-section.active');
    return (sec && ONGLET_BUREAU[sec.id.replace(/^bur-/, '')]) || 'matieres';
  }

  function majNav() {
    const nav = document.getElementById('appNav');
    if (!nav) return;
    const login = document.getElementById('loginScreen');
    const connecte = !login || getComputedStyle(login).display === 'none';
    nav.hidden = !connecte;
    document.body.classList.toggle('avec-nav', connecte);
    const actif = entreeActive();
    document.querySelectorAll('[data-nav]').forEach((b) => {
      const oui = b.dataset.nav === actif;
      b.classList.toggle('actif', oui);
      if (oui) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    const bascule = nav.querySelector('.nav-item[data-nav="labo"]');
    if (bascule) {
      const versFournil = dansLabo();
      if (bascule.dataset.vers !== (versFournil ? 'fournil' : 'labo')) {
        bascule.dataset.vers = versFournil ? 'fournil' : 'labo';
        bascule.innerHTML = `${versFournil ? I.magasin : I.labo}<span class="nav-label">${versFournil ? 'Fournil' : 'Labo'}</span>`;
        bascule.setAttribute('aria-label', versFournil ? 'Revenir au Fournil' : 'Ouvrir le Labo');
      }
    }
    majPastilles();
    const plus = nav.querySelector('.nav-plus');
    const dansPlus = actif !== 'labo-autre' && !ENTREES.find((e) => e.id === actif)?.principal;
    if (plus) plus.classList.toggle('actif', dansPlus);
    // Bouton retour du téléphone (audit G5) : chaque changement d'écran crée une étape.
    if (connecte && !enRetour && actif !== dernierEcran) {
      dernierEcran = actif;
      try { history.pushState({ fournil: actif, module: dansLabo() ? 'labo' : null }, ''); } catch (e) { /* historique indisponible */ }
    }
  }

  // ---------- retour du téléphone (audit G5) ----------
  let enRetour = false;
  let dernierEcran = null;
  // Ferme la fenêtre ouverte, s'il y en a une.
  function fermerFenetre() {
    const feuille = document.getElementById('navPlus');
    if (feuille && !feuille.hidden) { feuille.hidden = true; return true; }
    const ouverte = document.querySelector('.overlay.open');
    if (ouverte) { ouverte.classList.remove('open'); return true; }
    const aide = document.getElementById('helpOverlay');
    if (aide && aide.style.display === 'flex') { closeHelp(); return true; }
    const pdf = document.getElementById('pdfViewer');
    if (pdf && pdf.classList.contains('open')) { closePdfViewer(); return true; }
    const notes = document.querySelector('.notes-panel-overlay.open');
    if (notes && typeof closeNotesPanel === 'function') { closeNotesPanel(); return true; }
    return false;
  }
  window.addEventListener('popstate', (ev) => {
    if (fermerFenetre()) {
      try { history.pushState({ fournil: dernierEcran }, ''); } catch (e) { /* rien */ }
      return;
    }
    const cible = ev.state && ev.state.fournil;
    const e = ENTREES.find((x) => x.id === cible);
    if (!e && cible !== 'labo-autre') return; // avant le premier écran de Fournil : le navigateur s'en charge
    enRetour = true;
    try {
      if (ev.state.module === 'labo') { openModule('labo'); swL(ONGLET_LABO[cible] || 'lstock'); }
      else { if (dansLabo()) openModule('fournil'); e.go(); }
      window.scrollTo(0, 0);
    } finally { enRetour = false; }
    dernierEcran = cible;
    majNav();
  });
  window.fournilMajNav = majNav;

  // Pastilles (ex. tâches à faire) : recopie du texte des pastilles existantes.
  function majPastilles() {
    document.querySelectorAll('[data-badge-de]').forEach((p) => {
      const e = ENTREES.find((x) => x.badge === p.dataset.badgeDe);
      const src = document.getElementById(dansLabo() && e && e.badgeLabo ? e.badgeLabo : p.dataset.badgeDe);
      const visible = src && src.style.display !== 'none' && src.textContent.trim() !== '';
      p.hidden = !visible;
      p.textContent = visible ? src.textContent : '';
    });
  }

  // Après chaque changement d'écran fait par l'application, on remet la navigation à jour.
  function surveiller(nom) {
    const f = window[nom];
    if (typeof f !== 'function') return;
    window[nom] = function (...args) {
      const r = f.apply(this, args);
      majNav();
      return r;
    };
  }

  function demarrer() {
    construire();
    ['openModule', 'goHome', 'sw', 'swL', 'swB', 'showLogin', 'hideLogin'].forEach(surveiller);
    const obs = new MutationObserver(() => { majNav(); majPastilles(); });
    ['loginScreen', 'homeScreen', 'taskBadge', 'laboTaskBadge'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el, { attributes: true, attributeFilter: ['style', 'class'], childList: true, characterData: true, subtree: true });
    });
    dernierEcran = entreeActive();
    try { history.replaceState({ fournil: dernierEcran }, ''); } catch (e) { /* rien */ }
    majNav();
    majPastilles();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
