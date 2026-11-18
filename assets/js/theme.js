// Préférences d'affichage, mémorisées sur cet appareil (adapté de src/js/theme.js de Grigne) :
// - thème clair / sombre : suit le téléphone par défaut ; un bouton lune / soleil impose un choix ;
// - « Lecture facile » : police OpenDyslexic et espacements plus grands.
// Script classique chargé dans <head> (sans defer) : le bon affichage est posé avant le premier
// rendu. Différences avec Grigne : clés fournil-theme / fournil-lecture, et plusieurs boutons
// possibles ([data-theme-toggle], [data-read-toggle]), y compris ajoutés après le chargement.
(() => {
  const THEME_KEY = 'fournil-theme';
  const READ_KEY = 'fournil-lecture';
  const COLORS = { light: '#F5F0E6', dark: '#17130F' };
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // le choix vaut au moins jusqu'au rechargement
    }
  };

  const savedTheme = read(THEME_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') root.dataset.theme = savedTheme;
  if (read(READ_KEY) === 'facile') root.dataset.lecture = 'facile';

  const current = () => root.dataset.theme || (media.matches ? 'dark' : 'light');

  function sync() {
    const theme = current();
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
      b.setAttribute('aria-pressed', String(theme === 'dark'));
      b.setAttribute('aria-label', theme === 'dark' ? 'Mode sombre activé' : 'Mode sombre');
    });
    document.querySelectorAll('[data-read-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(root.dataset.lecture === 'facile')));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COLORS[theme]);
  }
  window.fournilSyncTheme = sync;

  media.addEventListener('change', sync);
  document.addEventListener('click', (e) => {
    const themeBtn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (themeBtn) {
      const next = current() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      write(THEME_KEY, next);
      sync();
      return;
    }
    const readBtn = e.target.closest && e.target.closest('[data-read-toggle]');
    if (readBtn) {
      const on = root.dataset.lecture !== 'facile';
      if (on) root.dataset.lecture = 'facile';
      else delete root.dataset.lecture;
      write(READ_KEY, on ? 'facile' : 'standard');
      sync();
    }
  });
  document.addEventListener('DOMContentLoaded', sync);
})();
