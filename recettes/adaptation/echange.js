// Mes recettes : exporter / importer, au format d'échange de Grigne (docs/format-export.md).
// Repris tel quel de l'ancienne version de Fournil (mêmes règles, mêmes messages),
// branché sur l'adaptation state.js. Les règles de lecture et de fusion suivent
// celles de Grigne (src/js/core/export.js et sanitize.js).
import { state, saveRecipes, reloadFromServer } from './state.js';
import { esc, uid } from './core/text.js';

// Format décrit dans docs/format-export.md (Grigne, version 2). Les règles de lecture
// et de fusion suivent celles de Grigne (src/js/core/export.js et sanitize.js),
// pour qu'un fichier passe de l'un à l'autre sans surprise.
const EX_APP = 'grigne';
const EX_VERSION = 2;
const EX_MAX_BYTES = 5 * 1024 * 1024;
const EX_MAX_NAME = 200, EX_MAX_NOTES = 10000, EX_MAX_ITEMS = 500;
// État affiché dans la carte : null, ou { kind: 'info'|'erreur'|'apercu'|'bilan', ... }
let echange = null;
let rerender = () => {};

const exNum = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;
const exStr = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
// TB : nombre, ou texte numérique (« 56 », « 56,5 ») ; sinon null.
function exTb(v){
  if(typeof v === 'string' && v.trim() !== '') v = Number(v.replace(',', '.'));
  return exNum(v);
}
const pl = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

function exportFileName(d){
  const p = n => String(n).padStart(2, '0');
  // jour à l'heure de Paris (assets/js/date.js), sinon jour de l'appareil
  if (window.FournilDate) return `fournil-recettes-${window.FournilDate.dateParis(d)}.json`;
  return `fournil-recettes-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

// Recettes de Fournil → objet au format Grigne v2. Une recette sans nom ou sans
// ingrédient valide n'est pas exportée (Grigne l'écarterait de toute façon).
function buildExport(list, date){
  const out = [];
  const ids = new Set();
  let skipped = 0;
  for(const r of list){
    const name = exStr(r && r.name, EX_MAX_NAME).trim();
    const ings = [];
    const ingIds = new Set();
    for(const i of (r && Array.isArray(r.ingredients) ? r.ingredients : []).slice(0, EX_MAX_ITEMS)){
      const iname = exStr(i && i.name, EX_MAX_NAME).trim();
      const q = exNum(typeof i?.qtyG === 'string' ? Number(i.qtyG.replace(',', '.')) : i?.qtyG);
      if(!iname || q === null || q < 0) continue;
      let iid = exStr(String(i.id ?? ''), 64);
      if(!iid || ingIds.has(iid)) iid = 'i' + ings.length + uid();
      ingIds.add(iid);
      ings.push({ id: iid, name: iname, qtyG: q, unit: 'g' });
    }
    if(!name || ings.length === 0){ skipped++; continue; }
    if(out.length >= EX_MAX_ITEMS){ skipped++; continue; }
    let id = exStr(String(r.id ?? ''), 64);
    if(!id || ids.has(id)) id = uid();
    ids.add(id);
    out.push({ id, name, ingredients: ings, notes: exStr(r.notes, EX_MAX_NOTES), tb: exTb(r.tb) });
  }
  return {
    data: {
      app: EX_APP,
      version: EX_VERSION,
      exportedAt: date.toISOString(),
      recipeCount: out.length,
      recipes: out,
      history: [],
    },
    skipped,
  };
}

// Texte d'un fichier Grigne → { recipes } nettoyées, ou { error }.
function parseImport(text){
  let json;
  try{ json = JSON.parse(text); }catch(e){ return { error: 'json' }; }
  if(!json || typeof json !== 'object' || json.app !== EX_APP || !Array.isArray(json.recipes)) return { error: 'format' };
  const version = json.version ?? 1;
  if(typeof version !== 'number' || version > EX_VERSION) return { error: 'version' };
  const out = [];
  const seen = new Set();
  for(const r of json.recipes.slice(0, EX_MAX_ITEMS)){
    if(!r || typeof r !== 'object') continue;
    const name = exStr(r.name, EX_MAX_NAME).trim();
    if(!name || !Array.isArray(r.ingredients)) continue;
    let id = exStr(r.id, 64);
    if(!id || seen.has(id)) id = uid();
    seen.add(id);
    const ingredients = [];
    for(const i of r.ingredients.slice(0, EX_MAX_ITEMS)){
      if(!i || typeof i !== 'object') continue;
      const iname = exStr(i.name, EX_MAX_NAME).trim();
      const qtyG = exNum(i.qtyG);
      if(!iname || qtyG === null || qtyG < 0) continue;
      ingredients.push({ id: exStr(i.id, 64) || ('i' + ingredients.length), name: iname, qtyG });
    }
    if(ingredients.length === 0) continue;
    const rec = { id, name, ingredients, notes: exStr(r.notes, EX_MAX_NOTES) };
    const tb = exNum(r.tb);
    if(tb !== null) rec.tb = tb;
    out.push(rec);
  }
  return { recipes: out };
}

// Empreinte du contenu (nom, ingrédients et quantités, étapes, TB), sans les identifiants.
function fingerprint(r, name){
  return JSON.stringify([
    String(name ?? r.name ?? '').trim().toLowerCase(),
    (r.ingredients || []).map(i => [String(i.name || '').trim().toLowerCase(), Number(i.qtyG)]),
    String(r.notes || '').trim(),
    exTb(r.tb),
  ]);
}

// Ce que l'import ajouterait, sans rien modifier : jamais d'écrasement.
// Doublon identique → ignoré ; id déjà pris → nouvel id ; nom pris → « Nom (importée) ».
// Une recette existante « Nom (importée) » compte aussi comme « Nom » : réimporter
// le même fichier n'ajoute pas « Nom (importée 2) ».
const SUFFIXE_IMPORT = /\s*\(importée(?: \d+)?\)$/;
function planImport(current, imported){
  const prints = new Set();
  for(const r of current){
    prints.add(fingerprint(r));
    const nom = String(r.name || '');
    if(SUFFIXE_IMPORT.test(nom)) prints.add(fingerprint(r, nom.replace(SUFFIXE_IMPORT, '')));
  }
  const ids = new Set(current.map(r => r.id));
  const names = new Set(current.map(r => String(r.name || '').trim().toLowerCase()));
  const toAdd = [];
  let skipped = 0;
  for(const r of imported){
    const print = fingerprint(r);
    if(prints.has(print)){ skipped++; continue; }
    prints.add(print);
    let id = r.id;
    while(ids.has(id)) id = uid();
    ids.add(id);
    let name = r.name;
    if(names.has(name.trim().toLowerCase())){
      const base = `${name} (importée)`;
      name = base;
      for(let n = 2; names.has(name.trim().toLowerCase()); n++) name = `${base.slice(0, -1)} ${n})`;
    }
    names.add(name.trim().toLowerCase());
    toAdd.push({ rec: { ...r, id, name }, renamedFrom: name !== r.name ? r.name : null });
  }
  return { toAdd, skipped };
}

function readFileText(file){
  return new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file, 'utf-8');
  });
}

function doExport(){
  const { data, skipped } = buildExport(state.recipes, new Date());
  if(data.recipeCount === 0){
    echange = { kind: 'erreur', text: "Aucune recette à exporter pour l'instant." };
    rerender();
    return;
  }
  const fileName = exportFileName(new Date());
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  echange = {
    kind: 'info',
    text: `${pl(data.recipeCount, 'recette exportée', 'recettes exportées')} dans « ${fileName} ».`
      + (skipped ? ` ${pl(skipped, 'recette sans nom ou sans ingrédient n’a pas été exportée', 'recettes sans nom ou sans ingrédient n’ont pas été exportées')}.` : '')
      + ' Tu peux l’ouvrir dans Grigne avec « Importer un fichier Grigne ».',
  };
  rerender();
}

async function onImportFile(file){
  if(!file) return;
  if(file.size > EX_MAX_BYTES){
    echange = { kind: 'erreur', text: 'Ce fichier est trop gros (5 Mo au plus).' };
    rerender(); return;
  }
  let text;
  try{ text = await readFileText(file); }
  catch(e){ echange = { kind: 'erreur', text: 'Impossible de lire ce fichier.' }; rerender(); return; }
  const parsed = parseImport(text);
  if(parsed.error){
    const msg = {
      json: 'Ce fichier n’est pas lisible : ce n’est pas un fichier d’export Grigne.',
      format: 'Ce fichier n’est pas un fichier d’export Grigne.',
      version: 'Ce fichier vient d’une version plus récente de Grigne : Fournil ne sait pas encore le lire.',
    }[parsed.error];
    echange = { kind: 'erreur', text: msg };
    rerender(); return;
  }
  if(parsed.recipes.length === 0){
    echange = { kind: 'erreur', text: 'Ce fichier ne contient aucune recette utilisable.' };
    rerender(); return;
  }
  const plan = planImport(state.recipes, parsed.recipes);
  if(plan.toAdd.length === 0){
    echange = { kind: 'info', text: `Rien à ajouter : ${pl(plan.skipped, 'recette déjà présente', 'recettes déjà présentes')} dans ta bibliothèque.` };
    rerender(); return;
  }
  echange = { kind: 'apercu', fileName: file.name, imported: parsed.recipes, plan };
  rerender();
}

async function confirmImport(){
  if(!echange || echange.kind !== 'apercu') return;
  const imported = echange.imported;
  echange = { kind: 'info', text: 'Import en cours…' };
  rerender();
  // Repartir de la version la plus récente sur le serveur, pour n'écraser
  // aucune recette ajoutée entre-temps sur un autre appareil.
  if(!(await reloadFromServer())){
    echange = { kind: 'erreur', text: 'Impossible de joindre le serveur : rien n’a été importé. Réessaie une fois connecté.' };
    rerender(); return;
  }
  const plan = planImport(state.recipes, imported);
  state.recipes = state.recipes.concat(plan.toAdd.map(a => a.rec));
  const ok = plan.toAdd.length ? await saveRecipes() : true;
  const renamed = plan.toAdd.filter(a => a.renamedFrom).length;
  echange = {
    kind: 'bilan',
    ok,
    text: `Import terminé : ${pl(plan.toAdd.length, 'recette ajoutée', 'recettes ajoutées')}`
      + (renamed ? ` (dont ${pl(renamed, 'renommée', 'renommées')} « (importée) »)` : '')
      + `, ${pl(plan.skipped, 'déjà présente (ignorée)', 'déjà présentes (ignorées)')}.`
      + (ok ? '' : ' Attention : l’envoi vers les autres appareils a échoué, elles ne sont enregistrées que sur celui-ci.'),
  };
  rerender();
}

export function renderEchange(onChange){
  if(onChange) rerender = onChange;
  const mount = document.getElementById('rc-echange-view');
  if(!mount) return;
  mount.innerHTML = '';
  mount.appendChild(buildEchangeCard());
}

function buildEchangeCard(){
  const card = document.createElement('div');
  card.className = 'card rc-echange';
  card.innerHTML = `
    <h3>Mes recettes : exporter / importer</h3>
    <p class="sub">Échange tes recettes avec Grigne, ou garde-en une copie. L’import ajoute des recettes, il n’en remplace jamais.</p>
    <div class="rc-echange-actions">
      <button type="button" class="btn-dark rc-export-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
        Exporter mes recettes
      </button>
      <button type="button" class="btn-soft rc-import-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V9M7 14l5-5 5 5M5 3h14"/></svg>
        Importer un fichier Grigne
      </button>
      <input type="file" class="rc-import-input" accept=".json,application/json" style="display:none">
    </div>
    <div class="rc-echange-zone" role="status" aria-live="polite"></div>`;
  const input = card.querySelector('.rc-import-input');
  card.querySelector('.rc-export-btn').onclick = doExport;
  card.querySelector('.rc-import-btn').onclick = () => { input.value = ''; input.click(); };
  input.onchange = () => onImportFile(input.files && input.files[0]);

  const zone = card.querySelector('.rc-echange-zone');
  if(echange){
    if(echange.kind === 'apercu'){
      const { plan, fileName } = echange;
      const n = plan.toAdd.length;
      zone.innerHTML = `
        <div class="dropzone-status ok">Fichier « ${esc(fileName)} » : <strong>${pl(n, 'recette à ajouter', 'recettes à ajouter')}</strong>, ${pl(plan.skipped, 'déjà présente', 'déjà présentes')}.</div>
        <ul>${plan.toAdd.map(a => `<li>${esc(a.rec.name)}${a.renamedFrom ? ` <span class="muet">(nom déjà pris)</span>` : ''}</li>`).join('')}</ul>
        <div class="rc-echange-actions">
          <button type="button" class="btn-dark rc-import-ok">Ajouter ${n > 1 ? 'les ' + n + ' recettes' : 'la recette'}</button>
          <button type="button" class="btn-ghost rc-import-cancel">Annuler</button>
        </div>`;
      zone.querySelector('.rc-import-ok').onclick = confirmImport;
      zone.querySelector('.rc-import-cancel').onclick = () => { echange = null; rerender(); };
    } else {
      const cls = echange.kind === 'erreur' || (echange.kind === 'bilan' && !echange.ok) ? 'warn' : 'ok';
      const div = document.createElement('div');
      div.className = 'dropzone-status ' + cls;
      div.textContent = echange.text;
      zone.appendChild(div);
    }
  }
  return card;
}
