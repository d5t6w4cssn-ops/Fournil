// Point d'entrée du module Recettes de Fournil : les écrans de Grigne (copiés sans
// modification dans recettes/src/ui) branchés sur boulangerie/recettes par state.js.
// Partagé par le Fournil et le Labo (même section #tab-recettes, mêmes données).
import { state, init, applyRemote, isEditing, onSaveStatus, appliquerCalculs } from './state.js';
import { renderLibrary } from './ui/library.js';
import { renderCalculator } from './ui/calculator.js';
import { renderTB } from './ui/tb.js';
import { renderLevain } from './ui/levain.js';
import { renderHydra } from './ui/hydra.js';
import { renderCroix } from './ui/cross.js';
import { renderEchange } from './echange.js';
import { renderSaisieCalculs } from './saisie-calculs.js';

const TABS = ['library', 'calculator', 'tb', 'levain', 'hydra', 'croix'];
const RENDERERS = {
  library: renderLibrary,
  calculator: renderCalculator,
  tb: renderTB,
  levain: renderLevain,
  hydra: renderHydra,
  croix: renderCroix,
};

const root = document.getElementById('tab-recettes');

function render() {
  if (!root) return;
  root.querySelectorAll('.tabs [role=tab]').forEach((b) => {
    const active = b.dataset.tab === state.tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  TABS.forEach((t) => {
    const panel = document.getElementById(`panel-${t}`);
    if (panel) panel.hidden = t !== state.tab;
  });
  RENDERERS[state.tab]();
  if (state.tab === 'library') renderEchange(render);
  if (state.tab === 'calculator') renderSaisieCalculs(render);
}

function setupTabs() {
  const buttons = [...root.querySelectorAll('.tabs [role=tab]')];
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => {
      state.tab = b.dataset.tab;
      render();
    });
    b.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      let next = null;
      if (e.key in keys) next = (i + keys[e.key] + buttons.length) % buttons.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = buttons.length - 1;
      if (next === null) return;
      e.preventDefault();
      buttons[next].focus();
      buttons[next].click();
    });
  });
}

if (root) {
  onSaveStatus((ok) => {
    const w = document.getElementById('rc-save-warn');
    if (w) w.hidden = ok;
  });
  setupTabs();
  init();
  render();
  // Appelé par le script principal de Fournil à chaque nouvelle version de
  // boulangerie/recettes (écoute temps réel, bouton Actualiser). Pendant la saisie
  // d'une recette, on met les données à jour sans redessiner le formulaire.
  window.rcApplyRemote = (data) => {
    applyRemote(data);
    if (!isEditing()) render();
  };
  // Calculs partagés (rôle « équipe », assets/js/acces.js) : liste reçue, ou null.
  window.rcAppliquerCalculs = (liste) => {
    appliquerCalculs(liste);
    if (!isEditing() && state.tab === 'calculator') render();
  };
  // Pour les autres modules (ex. ouverture de l'onglet) : redessine l'écran en cours.
  window.rcRender = render;
}
