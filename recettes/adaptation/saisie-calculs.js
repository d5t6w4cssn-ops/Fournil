// Saisie rapide des calculs, en haut de l'écran Calcul (texte ou dictée), comme celle du
// Stock : « 30 pains sportifs à 400 g, 20 campagnes à 500 g ».
// 1. Aperçu : chaque ligne reconnue ; une recette au nom identique est reprise, une recette
//    ambiguë ou inconnue est DEMANDÉE (liste à choisir), jamais devinée.
// 2. Une feuille de calcul par recette (pas de total global), calculée avec les fonctions
//    de Grigne (computeScaling, mode « pièces × poids »), poids non arrondis.
// 3. Sur chaque feuille : PDF, allergènes, « Enregistrer » (calculs enregistrés, partagés
//    avec l'équipe après la migration).
// Reconnaissance du texte : assets/js/saisie-calculs.js (window.FournilSaisieCalculs).
import { state, saveHistory } from './state.js';
import { esc, uid } from './core/text.js';
import { computeScaling, isFlour } from './core/recipe-math.js';
import { fixed } from './core/units.js';
import { blocAllergenes, telechargerPdf } from './fiche.js';

const S = { texte: '', lignes: [], feuilles: null, enregistrees: new Set() };
let rendreTout = () => {};
const F = () => window.FournilSaisieCalculs;
const message = (t) => { if (typeof toast === 'function') toast(t); };

/** Affiche la carte (appelé à chaque affichage de l'écran Calcul). */
export function renderSaisieCalculs(rendre) {
  rendreTout = rendre || rendreTout;
  const zone = document.getElementById('rc-saisie-calculs');
  if (!zone || !F()) return;
  if (!zone.querySelector('.rc-saisie')) construire(zone);
  dessinerApercu();
  dessinerFeuilles();
}

function construire(zone) {
  const voix = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  zone.innerHTML = `
    <section class="card rc-saisie" aria-labelledby="rcSaisieTitre">
      <h3 class="section-title" id="rcSaisieTitre">Saisie rapide</h3>
      <p class="sub">Écris ou dicte les pièces à faire, par exemple « 30 pains sportifs à 400 g, 20 campagnes à 500 g ». Tu obtiens une feuille de calcul par recette.</p>
      <label class="sr-only" for="rcSaisieTexte">Pièces à calculer</label>
      <div class="rc-saisie-champ">
        <textarea id="rcSaisieTexte" rows="2" placeholder="Ex. 30 pains sportifs à 400 g, 20 campagnes à 500 g"></textarea>
        <button type="button" class="icon-btn rc-saisie-micro" aria-pressed="false" aria-label="Dicter" ${voix ? '' : 'disabled title="La dictée n’est pas disponible sur ce navigateur"'}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
        </button>
      </div>
      <button type="button" class="btn-dark rc-saisie-analyser">Préparer les feuilles</button>
      <div class="rc-saisie-apercu" aria-live="polite"></div>
      <div class="rc-saisie-feuilles"></div>
    </section>`;
  const champ = zone.querySelector('#rcSaisieTexte');
  champ.value = S.texte;
  champ.oninput = () => { S.texte = champ.value; };
  zone.querySelector('.rc-saisie-analyser').onclick = () => analyser(champ.value);
  zone.querySelector('.rc-saisie-micro').onclick = dicter;
}

// ---------- dictée (même principe que la saisie rapide du Stock) ----------
let ecoute = null;
function dicter() {
  const btn = document.querySelector('#rc-saisie-calculs .rc-saisie-micro');
  if (ecoute) { ecoute.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { message('La dictée n’est pas disponible sur ce navigateur'); return; }
  const r = new SR();
  r.lang = 'fr-FR';
  r.continuous = false;
  r.interimResults = false;
  ecoute = r;
  btn.setAttribute('aria-pressed', 'true');
  message('Je t’écoute…');
  r.onresult = (e) => {
    const dit = Array.from(e.results).map((x) => x[0].transcript).join(' ').trim();
    const champ = document.getElementById('rcSaisieTexte');
    champ.value = champ.value.trim() ? `${champ.value.trim()}, ${dit}` : dit;
    S.texte = champ.value;
    champ.focus();
  };
  r.onerror = (e) => message(e && e.error === 'not-allowed' ? 'Autorise le micro pour dicter' : 'Dictée interrompue, réessaie');
  r.onend = () => { ecoute = null; btn.setAttribute('aria-pressed', 'false'); };
  r.start();
}

// ---------- aperçu ----------
let compteur = 0;
function analyser(texte) {
  S.texte = texte;
  S.feuilles = null;
  S.enregistrees = new Set();
  S.lignes = F().analyser(texte).map((l) => {
    const ligne = { ...l, id: ++compteur, recetteId: '', candidats: [], statut: '' };
    if (!l.erreur) {
      const r = F().rapprocher(l.nom, state.recipes);
      ligne.statut = r.statut;
      if (r.statut === 'trouve') ligne.recetteId = r.recette.id;
      else ligne.candidats = r.candidats.map((c) => c.id);
    }
    return ligne;
  });
  if (!S.lignes.length) message('Écris par exemple « 30 pains sportifs à 400 g »');
  dessinerApercu();
  dessinerFeuilles();
}

function probleme(l) {
  if (l.erreur) return F().MESSAGES[l.erreur] || 'Ligne illisible : corrige le texte.';
  if (!l.recetteId) {
    return l.statut === 'ambigu'
      ? `« ${l.nom} » : plusieurs recettes possibles, choisis la bonne.`
      : `« ${l.nom} » : recette inconnue, choisis-la dans la liste ou retire la ligne.`;
  }
  return null;
}

function dessinerApercu() {
  const z = document.querySelector('#rc-saisie-calculs .rc-saisie-apercu');
  if (!z) return;
  if (!S.lignes.length) { z.innerHTML = ''; return; }
  const options = (l) => {
    const proposees = state.recipes.filter((r) => l.candidats.includes(r.id));
    return `<option value="">— choisir la recette —</option>${
      proposees.map((r) => `<option value="${esc(r.id)}" ${r.id === l.recetteId ? 'selected' : ''}>${esc(r.name)} (proposée)</option>`).join('')}${
      state.recipes.filter((r) => !l.candidats.includes(r.id)).map((r) => `<option value="${esc(r.id)}" ${r.id === l.recetteId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}`;
  };
  const bloque = S.lignes.some((l) => probleme(l));
  z.innerHTML = `<ul class="rc-saisie-lignes">${S.lignes.map((l) => {
    const pb = probleme(l);
    return `<li class="rc-saisie-ligne${pb ? ' a-corriger' : ''}" data-ligne="${l.id}">
      <div class="rc-saisie-lu"><strong>${l.nombre ?? '?'}</strong> ${esc(l.nom || l.texte)}${l.poidsG ? ` × ${esc(F().grammes(l.poidsG))}` : ''}</div>
      ${l.erreur ? '' : `<label class="sr-only" for="rcSaisieRec${l.id}">Recette pour « ${esc(l.nom)} »</label>
      <select id="rcSaisieRec${l.id}" class="rc-saisie-recette">${options(l)}</select>`}
      <button type="button" class="icon-btn rc-saisie-retirer" aria-label="Retirer cette ligne">×</button>
      ${pb ? `<p class="rc-saisie-pb">${esc(pb)}</p>` : ''}
    </li>`;
  }).join('')}</ul>
  <button type="button" class="btn-dark rc-saisie-voir" ${bloque ? 'disabled' : ''}>${bloque ? 'Corrige les lignes en rouge' : `Voir ${nbFeuilles() > 1 ? `les ${nbFeuilles()} feuilles` : 'la feuille'}`}</button>`;
  z.querySelectorAll('.rc-saisie-ligne').forEach((li) => {
    const l = S.lignes.find((x) => x.id === Number(li.dataset.ligne));
    const sel = li.querySelector('select');
    if (sel) sel.onchange = () => { l.recetteId = sel.value; S.feuilles = null; dessinerApercu(); dessinerFeuilles(); };
    li.querySelector('.rc-saisie-retirer').onclick = () => {
      S.lignes = S.lignes.filter((x) => x !== l);
      S.feuilles = null;
      dessinerApercu();
      dessinerFeuilles();
    };
  });
  const voir = z.querySelector('.rc-saisie-voir');
  voir.onclick = () => {
    if (S.lignes.some((l) => probleme(l))) return;
    S.feuilles = calculerFeuilles();
    dessinerFeuilles();
    document.querySelector('#rc-saisie-calculs .rc-feuille')?.focus();
  };
}

const nbFeuilles = () => new Set(S.lignes.filter((l) => l.recetteId).map((l) => l.recetteId)).size;

// ---------- feuilles ----------
/** Une feuille par recette : mêmes calculs que l'écran Calcul de Grigne (pièces × poids). */
function calculerFeuilles() {
  return F().feuilles(S.lignes).map((f) => {
    const recette = state.recipes.find((r) => r.id === f.recetteId);
    if (!recette) return null;
    const calc = { mode: 'pieces', pieceRows: f.pieces.map((p) => ({ label: p.label, count: String(p.count), weight: String(p.weight) })) };
    const m = computeScaling(recette, calc);
    return {
      cle: uid(),
      recette,
      calcul: {
        recipeName: recette.name,
        label: null,
        targetG: m.targetG,
        coefficient: m.coefficient,
        basis: m.usesFlourBasis ? 'farine' : 'total',
        breakdown: recette.ingredients.map((ing) => ({ name: ing.name, grams: ing.qtyG * m.factor })),
        pieces: f.pieces,
      },
    };
  }).filter(Boolean);
}

function dessinerFeuilles() {
  const z = document.querySelector('#rc-saisie-calculs .rc-saisie-feuilles');
  if (!z) return;
  if (!S.feuilles || !S.feuilles.length) { z.innerHTML = ''; return; }
  const g = (n) => esc(F().grammes(n));
  z.innerHTML = `${S.feuilles.map((f, i) => {
    const c = f.calcul;
    const lignes = c.breakdown.map((b) => ({ ...b, farine: isFlour(b) }));
    const ordre = [...lignes.filter((l) => l.farine), ...lignes.filter((l) => !l.farine)];
    const fait = S.enregistrees.has(f.cle);
    return `<article class="result-card rc-feuille" tabindex="-1" aria-label="Feuille de calcul ${i + 1} : ${esc(c.recipeName)}" data-feuille="${esc(f.cle)}">
      <p class="result-k">Feuille ${i + 1} sur ${S.feuilles.length}</p>
      <h3 class="result-title">${esc(c.recipeName)}</h3>
      <ul class="rc-feuille-pieces">${c.pieces.map((p) => `<li>${esc(String(p.count))} ${esc(p.label)} × ${g(p.weight)} = <strong>${g(p.count * p.weight)}</strong></li>`).join('')}</ul>
      <ol class="weigh">${ordre.map((l, j) => `<li class="${l.farine ? 'lead' : ''}"><span class="n">${l.farine && j === 0 ? '<span class="lead-k">En premier</span>' : ''}${esc(l.name)}</span><span class="q">${g(l.grams)}</span></li>`).join('')}</ol>
      <div class="ref-line">Total pâte crue : <strong>${g(c.targetG)}</strong>${c.coefficient ? ` · coefficient ×${esc(fixed(c.coefficient, 2))}` : ''}</div>
      ${blocAllergenes(f.recette.ingredients)}
      <div class="rc-feuille-actions">
        <button type="button" class="btn-soft rc-pdf-btn" data-action="pdf">PDF</button>
        <button type="button" class="btn-dark" data-action="enregistrer" ${fait ? 'disabled' : ''}>${fait ? 'Enregistré ✓' : 'Enregistrer ce calcul'}</button>
      </div>
    </article>`;
  }).join('')}
  ${S.feuilles.length > 1 ? `<button type="button" class="btn-dark rc-saisie-tout" ${S.feuilles.every((f) => S.enregistrees.has(f.cle)) ? 'disabled' : ''}>Enregistrer les ${S.feuilles.length} feuilles</button>` : ''}`;
  z.querySelectorAll('.rc-feuille').forEach((art) => {
    const f = S.feuilles.find((x) => x.cle === art.dataset.feuille);
    art.querySelector('[data-action=pdf]').onclick = () => telechargerPdf(f.calcul);
    art.querySelector('[data-action=enregistrer]').onclick = () => enregistrer([f]);
  });
  const tout = z.querySelector('.rc-saisie-tout');
  if (tout) tout.onclick = () => enregistrer(S.feuilles.filter((f) => !S.enregistrees.has(f.cle)));
}

/** Ajoute les feuilles aux calculs enregistrés (même forme que ceux de Grigne, plus pieces). */
function enregistrer(liste) {
  if (!liste.length) return;
  const maintenant = Date.now();
  liste.slice().reverse().forEach((f, i) => {
    state.history.unshift({ id: uid(), timestamp: maintenant + i, ...f.calcul });
    S.enregistrees.add(f.cle);
  });
  state.history = state.history.slice(0, Math.max(20, liste.length));
  saveHistory();
  message(liste.length > 1 ? `${liste.length} calculs enregistrés ✓` : 'Calcul enregistré ✓');
  rendreTout();
}
