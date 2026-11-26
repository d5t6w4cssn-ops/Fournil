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

// Mise à jour des noms et des notes : ce que le fichier changerait, sans rien modifier.
// Seules les recettes déjà présentes (même identifiant) sont concernées, et seulement
// si leurs ingrédients sont les mêmes (mêmes identifiants, même ordre, mêmes quantités)
// et leur TB aussi. On ne change alors que le nom de la recette, ses notes et les noms
// de ses ingrédients. Jamais d'ajout, jamais de suppression, jamais de quantité touchée.
function planMiseAJour(current, imported){
  const changes = [], refusees = [];
  let identiques = 0, absentes = 0;
  const parId = new Map(current.map(r => [r.id, r]));
  const nomsPris = new Map(current.map(r => [String(r.name || '').trim().toLowerCase(), r.id]));
  for(const r of imported){
    const c = parId.get(r.id);
    if(!c){ absentes++; continue; }
    const ci = Array.isArray(c.ingredients) ? c.ingredients : [];
    const memes = ci.length === r.ingredients.length
      && ci.every((i, k) => String(i.id) === String(r.ingredients[k].id) && Number(i.qtyG) === r.ingredients[k].qtyG)
      && exTb(c.tb) === exTb(r.tb);
    if(!memes){ refusees.push({ name: c.name, raison: 'ingrédients ou quantités différents' }); continue; }
    const pris = nomsPris.get(r.name.trim().toLowerCase());
    if(pris !== undefined && pris !== c.id){ refusees.push({ name: c.name, raison: `le nom « ${r.name} » est déjà pris` }); continue; }
    const nomChange = c.name !== r.name;
    const notesChange = String(c.notes || '') !== r.notes;
    const ingChanges = r.ingredients.filter((i, k) => ci[k].name !== i.name).length;
    if(!nomChange && !notesChange && !ingChanges){ identiques++; continue; }
    changes.push({ id: c.id, ancienNom: c.name, name: r.name, notes: r.notes, ingNames: r.ingredients.map(i => i.name), nomChange, notesChange, ingChanges });
  }
  return { changes, refusees, identiques, absentes };
}

function sauvegardeFileName(d){
  const p = n => String(n).padStart(2, '0');
  const jour = window.FournilDate ? window.FournilDate.dateParis(d) : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return `fournil-recettes-sauvegarde-${jour}-${p(d.getHours())}h${p(d.getMinutes())}.json`;
}

function telecharger(data, fileName){
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function lireFichierGrigne(file){
  if(file.size > EX_MAX_BYTES) return { erreur: 'Ce fichier est trop gros (5 Mo au plus).' };
  let text;
  try{ text = await readFileText(file); }
  catch(e){ return { erreur: 'Impossible de lire ce fichier.' }; }
  const parsed = parseImport(text);
  if(parsed.error) return { erreur: {
    json: 'Ce fichier n’est pas lisible : ce n’est pas un fichier d’export Grigne.',
    format: 'Ce fichier n’est pas un fichier d’export Grigne.',
    version: 'Ce fichier vient d’une version plus récente de Grigne : Fournil ne sait pas encore le lire.',
  }[parsed.error] };
  if(parsed.recipes.length === 0) return { erreur: 'Ce fichier ne contient aucune recette utilisable.' };
  return { recipes: parsed.recipes };
}

async function onMiseAJourFile(file){
  if(!file) return;
  const lu = await lireFichierGrigne(file);
  if(lu.erreur){ echange = { kind: 'erreur', text: lu.erreur }; rerender(); return; }
  const plan = planMiseAJour(state.recipes, lu.recipes);
  if(plan.changes.length === 0){
    echange = { kind: 'erreur', text: 'Rien à mettre à jour : aucune recette de ce fichier ne correspond à une recette de ta bibliothèque avec les mêmes ingrédients, ou tout est déjà identique.'
      + (plan.refusees.length ? ` ${pl(plan.refusees.length, 'recette refusée', 'recettes refusées')} (ingrédients ou quantités différents, ou nom déjà pris).` : '') };
    rerender(); return;
  }
  echange = { kind: 'apercu-maj', fileName: file.name, imported: lu.recipes, plan };
  rerender();
}

async function confirmMiseAJour(){
  if(!echange || echange.kind !== 'apercu-maj') return;
  const imported = echange.imported;
  echange = { kind: 'info', text: 'Mise à jour en cours…' };
  rerender();
  // Repartir de la version du serveur : la sauvegarde et la mise à jour portent sur elle.
  if(!(await reloadFromServer())){
    echange = { kind: 'erreur', text: 'Impossible de joindre le serveur : rien n’a été mis à jour. Réessaie une fois connecté.' };
    rerender(); return;
  }
  const plan = planMiseAJour(state.recipes, imported);
  if(plan.changes.length === 0){
    echange = { kind: 'bilan', ok: true, text: 'Mise à jour terminée : rien à changer, tout était déjà à jour.' };
    rerender(); return;
  }
  // Sauvegarde complète juste avant : un fichier qu'on peut relire, au format habituel.
  const maintenant = new Date();
  const sauvegarde = sauvegardeFileName(maintenant);
  telecharger(buildExport(state.recipes, maintenant).data, sauvegarde);
  const parId = new Map(plan.changes.map(ch => [ch.id, ch]));
  state.recipes = state.recipes.map(r => {
    const ch = parId.get(r.id);
    if(!ch) return r;
    return { ...r, name: ch.name, notes: ch.notes, ingredients: r.ingredients.map((i, k) => ({ ...i, name: ch.ingNames[k] })) };
  });
  const ok = await saveRecipes();
  echange = {
    kind: 'bilan',
    ok,
    text: `Mise à jour terminée : ${pl(plan.changes.length, 'recette mise à jour', 'recettes mises à jour')} (noms et notes seulement, quantités inchangées).`
      + (plan.refusees.length ? ` ${pl(plan.refusees.length, 'refusée', 'refusées')}.` : '')
      + ` Sauvegarde d’avant : « ${sauvegarde} ».`
      + (ok ? '' : ' Attention : l’envoi vers les autres appareils a échoué, la mise à jour n’est enregistrée que sur celui-ci.'),
  };
  rerender();
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
    <p class="sub">Échange tes recettes avec Grigne, ou garde-en une copie. L’import ajoute des recettes, il n’en remplace jamais. « Mettre à jour » change seulement les noms et les notes des recettes déjà présentes, si leurs ingrédients et quantités sont identiques, après une sauvegarde.</p>
    <div class="rc-echange-actions">
      <button type="button" class="btn-dark rc-export-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
        Exporter mes recettes
      </button>
      <button type="button" class="btn-soft rc-import-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V9M7 14l5-5 5 5M5 3h14"/></svg>
        Importer un fichier Grigne
      </button>
      <button type="button" class="btn-soft rc-maj-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a8 8 0 0 1 14-5.3M20 4v5h-5M20 12a8 8 0 0 1-14 5.3M4 20v-5h5"/></svg>
        Mettre à jour noms et notes
      </button>
      <input type="file" class="rc-import-input" accept=".json,application/json" style="display:none">
      <input type="file" class="rc-maj-input" accept=".json,application/json" style="display:none">
    </div>
    <div class="rc-echange-zone" role="status" aria-live="polite"></div>`;
  const input = card.querySelector('.rc-import-input');
  card.querySelector('.rc-export-btn').onclick = doExport;
  card.querySelector('.rc-import-btn').onclick = () => { input.value = ''; input.click(); };
  input.onchange = () => onImportFile(input.files && input.files[0]);
  const inputMaj = card.querySelector('.rc-maj-input');
  card.querySelector('.rc-maj-btn').onclick = () => { inputMaj.value = ''; inputMaj.click(); };
  inputMaj.onchange = () => onMiseAJourFile(inputMaj.files && inputMaj.files[0]);

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
    } else if(echange.kind === 'apercu-maj'){
      const { plan, fileName } = echange;
      const n = plan.changes.length;
      const detail = ch => [ch.notesChange ? 'notes' : '', ch.ingChanges ? pl(ch.ingChanges, 'nom d’ingrédient', 'noms d’ingrédients') : ''].filter(Boolean).join(', ');
      zone.innerHTML = `
        <div class="dropzone-status ok">Fichier « ${esc(fileName)} » : <strong>${pl(n, 'recette à mettre à jour', 'recettes à mettre à jour')}</strong>${plan.identiques ? `, ${pl(plan.identiques, 'déjà à jour', 'déjà à jour')}` : ''}${plan.absentes ? `, ${pl(plan.absentes, 'absente de ta bibliothèque (ignorée)', 'absentes de ta bibliothèque (ignorées)')}` : ''}. Seuls les noms et les notes changent, jamais les quantités.</div>
        <ul class="rc-maj-liste">${plan.changes.map(ch => `<li>${ch.nomChange ? `${esc(ch.ancienNom)} → <strong>${esc(ch.name)}</strong>` : `<strong>${esc(ch.name)}</strong>`}${detail(ch) ? ` <span class="muet">(${esc(detail(ch))})</span>` : ''}</li>`).join('')}</ul>
        ${plan.refusees.length ? `<div class="dropzone-status warn">Refusées : ${plan.refusees.map(r => `${esc(r.name)} (${esc(r.raison)})`).join(' ; ')}.</div>` : ''}
        <p class="sub">Une sauvegarde complète de tes recettes sera téléchargée juste avant.</p>
        <div class="rc-echange-actions">
          <button type="button" class="btn-dark rc-maj-ok">Sauvegarder puis mettre à jour ${n > 1 ? 'les ' + n + ' recettes' : 'la recette'}</button>
          <button type="button" class="btn-ghost rc-import-cancel">Annuler</button>
        </div>`;
      zone.querySelector('.rc-maj-ok').onclick = confirmMiseAJour;
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
