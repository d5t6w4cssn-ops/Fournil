// Vérification du code de Fournil (npx eslint .).
// Les fichiers copiés de Grigne (recettes/src), les fichiers générés (recettes/recettes.js)
// et PDF.js (vendor) ne sont pas vérifiés : on ne les modifie jamais à la main.
// Le script principal, écrit dans index.html, n'est pas vérifié non plus (ESLint ne lit pas
// le HTML sans module supplémentaire).
import js from '@eslint/js';
import globals from 'globals';

// Variables et fonctions du script principal de index.html, utilisées par les modules.
const FOURNIL = Object.fromEntries([
  'S', 'L', 'db', 'tab', 'activeModule', 'firebase', 'today', 'esc', 'escJ', 'fmtQ', 'toast',
  'save', 'saveL', 'refresh', 'genAutoTasks', 'render', 'renderLabo', 'renderStock', 'renderLaboStock',
  'renderMatieres', 'renderSettings', 'normalizeState', 'normalizeLabo', 'openModule', 'goHome', 'sw', 'swL',
  'swB', 'openHelp', 'closeHelp', 'doLogout', 'closePdfViewer', 'closeNotesPanel', 'FournilDate', 'laboTab',
  'updateSyncIndicator', 'renderHisto', 'renderNotes', 'envoyer', 'correctId',
].map((n) => [n, 'writable']));
// Fonctions de l'appli appelées dans la page par les tests et les outils (page.evaluate).
const PAGE = Object.fromEntries([
  ...Object.keys(FOURNIL), 'openM', 'openCorrect', 'saveCorrect', 'saveProduct', 'addTask', 'addCmdClient',
  'sendCmdToFournil', 'toggleTask', 'useMatiere', 'adjMatStock', 'lancerTournee', 'dispo',
].map((n) => [n, 'readonly']));
// Règles communes : une erreur volontairement ignorée (catch) n'est pas une variable oubliée ;
// l'espace fine insécable est voulue dans les textes affichés.
const COMMUNES = {
  'no-unused-vars': ['error', { caughtErrors: 'none' }],
  'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipComments: true }],
};

export default [
  { ignores: ['node_modules/', 'vendor/', 'recettes/src/', 'recettes/recettes.js', 'test-results/', 'playwright-report/', 'reference/'] },
  js.configs.recommended,
  {
    // scripts classiques du navigateur, chargés par index.html
    files: ['assets/js/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, ...FOURNIL, module: 'readonly' } },
    rules: { ...COMMUNES, eqeqeq: ['error', 'smart'], 'no-var': 'error', 'no-eval': 'error', 'no-new-func': 'error' },
  },
  {
    // adaptation Fournil des écrans de Grigne (modules ES assemblés par tools/importer-grigne.mjs)
    files: ['recettes/adaptation/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, db: 'readonly', toast: 'readonly' } },
    rules: { ...COMMUNES, eqeqeq: ['error', 'smart'], 'no-var': 'error', 'no-eval': 'error' },
  },
  {
    files: ['tests/**/*.js', 'tools/**/*.cjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser, ...PAGE } },
    rules: COMMUNES,
  },
  {
    files: ['tests/**/*.mjs', 'tools/**/*.mjs', '*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
    rules: COMMUNES,
  },  {
    // l'appli sur l'émulateur : du code exécuté dans la page (page.evaluate)
    files: ['tests/emulateur/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...PAGE } },
  },
];
