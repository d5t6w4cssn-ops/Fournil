// Module Recettes de Fournil = les écrans de Grigne.
//
//   node tools/importer-grigne.mjs            copie depuis ~/grigne (lecture seule) puis construit
//   node tools/importer-grigne.mjs --construire   construit seulement, à partir de recettes/src
//   node tools/importer-grigne.mjs --verifier     vérifie que recettes.js et recettes.css sont à jour (n'écrit rien)
//
// 1. Copie SANS MODIFICATION les fichiers de Grigne listés dans COPIES vers recettes/src
//    (et les polices / images vers assets/). Rien n'est jamais écrit dans ~/grigne.
// 2. Assemble recettes/src + recettes/adaptation en un seul script classique,
//    recettes/recettes.js (chaque module garde sa portée ; pas d'étape de construction
//    à l'exécution, et le script tourne aussi dans jsdom pour les tests).
// 3. Produit recettes/recettes.css : base.css et app.css de Grigne, chaque règle limitée
//    à #tab-recettes, puis les ajustements Fournil (recettes/adaptation/fournil.css).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRIGNE = process.env.GRIGNE_DIR || path.join(os.homedir(), 'grigne');
const SRC = path.join(RACINE, 'recettes', 'src');
const ADAPT = path.join(RACINE, 'recettes', 'adaptation');

const JS_COPIES = [
  'core/text.js', 'core/units.js', 'core/recipe-math.js', 'core/parse.js', 'core/examples.js',
  'core/levain.js', 'core/simple-calcs.js', 'core/export.js', 'core/sanitize.js',
  'ui/dom.js', 'ui/library.js', 'ui/calculator.js', 'ui/tb.js', 'ui/levain.js', 'ui/hydra.js', 'ui/cross.js',
];
const AUTRES_COPIES = [
  ['assets/css/base.css', 'recettes/src/css/base.css'],
  ['assets/css/app.css', 'recettes/src/css/app.css'],
  ['assets/css/fonts.css', 'assets/css/fonts.css'],
  ['assets/img/encre.svg', 'assets/img/encre.svg'],
  ['assets/img/encre-legere.svg', 'assets/img/encre-legere.svg'],
];
// Fichiers de Grigne remplacés par une adaptation Fournil (même interface).
const ADAPTATIONS = ['state.js', 'pdf.js', 'echange.js', 'app.js'];
const VERIFIER = process.argv.includes('--verifier');
let differences = 0;
function ecrireSortie(relatif, contenu) {
  const cible = path.join(RACINE, relatif);
  if (VERIFIER) {
    const actuel = fs.existsSync(cible) ? fs.readFileSync(cible, 'utf8') : null;
    if (actuel !== contenu) {
      differences++;
      console.log(`${relatif} n'est pas à jour : lance node tools/importer-grigne.mjs --construire`);
    }
    return;
  }
  fs.writeFileSync(cible, contenu);
}

function copier() {
  if (!fs.existsSync(path.join(GRIGNE, 'src', 'js'))) throw new Error(`Grigne introuvable : ${GRIGNE}`);
  const paires = [
    ...JS_COPIES.map((f) => [`src/js/${f}`, `recettes/src/${f}`]),
    ...AUTRES_COPIES,
    ...fs.readdirSync(path.join(GRIGNE, 'assets', 'fonts')).map((f) => [`assets/fonts/${f}`, `assets/fonts/${f}`]),
  ];
  for (const [de, vers] of paires) {
    const cible = path.join(RACINE, vers);
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.copyFileSync(path.join(GRIGNE, de), cible);
  }
  console.log(`${paires.length} fichiers copiés depuis ${GRIGNE}`);
}

// ---------- assemblage des modules ----------
function sourceDe(nom) {
  if (ADAPTATIONS.includes(nom)) return fs.readFileSync(path.join(ADAPT, nom), 'utf8');
  return fs.readFileSync(path.join(SRC, nom), 'utf8');
}
const resoudre = (depuis, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(depuis), spec));

function convertir(nom) {
  const code = sourceDe(nom);
  const deps = [];
  const exports = [];
  const lignes = code.split('\n').map((ligne) => {
    const imp = ligne.match(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';\s*$/);
    if (imp) {
      const cible = resoudre(nom, imp[2]);
      deps.push(cible);
      const noms = imp[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': '));
      return `const { ${noms.join(', ')} } = __modules[${JSON.stringify(cible)}];`;
    }
    if (/^import\s/.test(ligne)) throw new Error(`${nom} : import non pris en charge : ${ligne}`);
    const exp = ligne.match(/^export\s+(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|class\s+)([A-Za-z_$][\w$]*)/);
    if (exp) {
      exports.push(exp[1]);
      return ligne.replace(/^export\s+/, '');
    }
    if (/^export\s/.test(ligne)) throw new Error(`${nom} : export non pris en charge : ${ligne}`);
    return ligne;
  });
  return { deps, exports, corps: lignes.join('\n') };
}

function construire() {
  const ordre = [];
  const vus = new Map();
  const visiter = (nom, pile = []) => {
    if (vus.get(nom) === 'fait') return;
    if (pile.includes(nom)) throw new Error(`Dépendance circulaire : ${[...pile, nom].join(' → ')}`);
    const m = convertir(nom);
    m.deps.forEach((d) => visiter(d, [...pile, nom]));
    vus.set(nom, 'fait');
    ordre.push([nom, m]);
  };
  visiter('app.js');
  const morceaux = ordre.map(([nom, m]) => {
    const origine = ADAPTATIONS.includes(nom) ? `recettes/adaptation/${nom}` : `recettes/src/${nom} (copie de Grigne)`;
    return `// ===== ${origine} =====\n__modules[${JSON.stringify(nom)}] = (function () {\n${m.corps.trimEnd()}\nreturn { ${m.exports.join(', ')} };\n})();`;
  });
  const sortie = `/* Fichier GÉNÉRÉ par tools/importer-grigne.mjs : ne pas le modifier à la main.
   Écrans de Grigne (recettes/src, copiés sans modification) + adaptation Fournil
   (recettes/adaptation). Pour le reconstruire : node tools/importer-grigne.mjs --construire */
(function () {
'use strict';
const __modules = {};
${morceaux.join('\n\n')}
})();
`;
  ecrireSortie('recettes/recettes.js', sortie);
  if (!VERIFIER) console.log(`recettes/recettes.js : ${ordre.length} modules (${ordre.map(([n]) => n).join(', ')})`);
}

// ---------- styles limités à #tab-recettes ----------
const PORTEE = '#tab-recettes';

function decouperVirgules(sel) {
  const parts = [];
  let prof = 0;
  let cur = '';
  for (const c of sel) {
    if (c === '(' || c === '[') prof++;
    if (c === ')' || c === ']') prof--;
    if (c === ',' && prof === 0) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}

function limiterSelecteur(s) {
  const racine = s.match(/^(:root|html)((?:\[[^\]]*\]|:not\([^)]*\)|:has\((?:[^()]|\([^)]*\))*\))*)/);
  if (racine) {
    // :root[…] X  →  :root[…] #tab-recettes X ; :root[…] body X → :root[…] #tab-recettes X
    let reste = s.slice(racine[0].length).trim();
    if (/^body\b/.test(reste)) return `${racine[0]} ${PORTEE}${reste.slice(4)}`;
    return reste ? `${racine[0]} ${PORTEE} ${reste}` : `${racine[0]} ${PORTEE}`;
  }
  // body:has(…) → #tab-recettes:has(…) ; body X → #tab-recettes X
  if (/^body\b/.test(s)) return PORTEE + s.slice(4);
  return `${PORTEE} ${s}`;
}

function limiterCss(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const ws = css.slice(i).match(/^\s+/);
    if (ws) {
      out += ws[0];
      i += ws[0].length;
      continue;
    }
    if (css.startsWith('/*', i)) {
      const j = css.indexOf('*/', i) + 2;
      out += css.slice(i, j);
      i = j;
      continue;
    }
    const ouvre = css.indexOf('{', i);
    if (ouvre < 0) {
      out += css.slice(i);
      break;
    }
    const tete = css.slice(i, ouvre);
    // fin du bloc (accolades équilibrées)
    let prof = 1;
    let j = ouvre + 1;
    while (prof && j < css.length) {
      if (css[j] === '{') prof++;
      else if (css[j] === '}') prof--;
      j++;
    }
    const corps = css.slice(ouvre + 1, j - 1);
    const t = tete.trim();
    const blanc = tete.slice(0, tete.length - tete.trimStart().length);
    if (/^@(media|supports|layer)\b/.test(t)) out += `${blanc}${t} {${limiterCss(corps)}}`;
    else if (t.startsWith('@')) out += `${blanc}${t} {${corps}}`; // @keyframes, @font-face : tels quels
    else out += `${blanc}${decouperVirgules(t).map(limiterSelecteur).join(', ')} {${corps}}`;
    i = j;
  }
  return out;
}

function styles() {
  const lire = (f) => fs.readFileSync(path.join(SRC, 'css', f), 'utf8').replaceAll("url('../img/", "url('../assets/img/");
  const sortie = `/* Fichier GÉNÉRÉ par tools/importer-grigne.mjs : ne pas le modifier à la main.
   base.css et app.css de Grigne (recettes/src/css), chaque règle limitée à ${PORTEE},
   puis les ajustements propres à Fournil (recettes/adaptation/fournil.css). */
${limiterCss(lire('base.css'))}
${limiterCss(lire('app.css'))}
/* ===== Ajustements Fournil ===== */
${fs.readFileSync(path.join(ADAPT, 'fournil.css'), 'utf8')}`;
  ecrireSortie('recettes/recettes.css', sortie);
  if (!VERIFIER) console.log('recettes/recettes.css écrit');
}

if (!process.argv.includes('--construire') && !VERIFIER) copier();
construire();
styles();
if (VERIFIER) {
  if (differences) process.exit(1);
  console.log('recettes.js et recettes.css sont à jour');
}
