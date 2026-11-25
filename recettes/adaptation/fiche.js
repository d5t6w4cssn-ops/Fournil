// Ajouts de Fournil sur les écrans de Grigne, sans modifier les fichiers copiés :
// tools/importer-grigne.mjs insère quelques appels dans ui/calculator.js et ui/library.js.
//   decorerCalcul(ligne, calcul)  : chaque calcul enregistré (auteur, droit de suppression,
//                                   allergènes, bouton PDF)
//   decorerResultat(zone, recette, mise, calc) : la feuille en cours (allergènes, bouton PDF)
//   decorerRecette(ligne, recette) : chaque recette de la Bibliothèque (allergènes)
// Les allergènes viennent de assets/js/allergenes.js, le PDF de assets/js/fiche-pdf.js :
// il est fabriqué et téléchargé sur l'appareil, rien n'est envoyé en ligne.
import { state } from './state.js';
import { esc } from './core/text.js';
import { isFlour } from './core/recipe-math.js';
import { fixed } from './core/units.js';

const acces = () => window.fournilAcces || null;
const allergenes = (ingredients) => (window.FournilAllergenes ? window.FournilAllergenes.allergenes(ingredients) : []);
const grammes = (g) => (window.FournilSaisieCalculs ? window.FournilSaisieCalculs.grammes(g) : `${g} g`);

// ---------- allergènes ----------
/** Bloc HTML des allergènes d'une liste d'ingrédients ({ name }). */
export function blocAllergenes(ingredients, compact = false) {
  const liste = allergenes(ingredients);
  const avert = window.FournilAllergenes ? window.FournilAllergenes.AVERTISSEMENT : '';
  return `<div class="rc-allergenes" role="note">
    <span class="rc-allergenes-k">Allergènes</span>
    ${liste.length
      ? `<ul class="rc-allergenes-liste">${liste.map((a) => `<li title="${esc(a.ingredients.join(', '))}">${esc(a.nom)}</li>`).join('')}</ul>`
      : '<span class="rc-allergenes-aucun">aucun repéré</span>'}
    ${compact ? '' : `<p class="rc-allergenes-avert">${esc(avert)}</p>`}
  </div>`;
}

// ---------- PDF ----------
const dateLisible = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
const dateFichier = () => (window.FournilDate ? window.FournilDate.dateParis() : new Date().toISOString().slice(0, 10));

/**
 * Données de la fiche à partir d'un calcul (même forme que les calculs enregistrés) :
 * { recipeName, label, targetG, coefficient, basis, breakdown: [{ name, grams }], pieces? }
 */
export function ficheDepuisCalcul(c) {
  const recette = state.recipes.find((r) => r.name === c.recipeName) || null;
  const lignes = (c.breakdown || []).map((b) => ({ name: b.name, grams: b.grams }));
  const farines = lignes.filter((l) => isFlour(l));
  const autres = lignes.filter((l) => !isFlour(l));
  const infos = [];
  if (Array.isArray(c.pieces) && c.pieces.length) {
    c.pieces.forEach((p) => infos.push(`${p.count} ${p.label || 'pièce(s)'} × ${grammes(p.weight)} = ${grammes(p.count * p.weight)}`));
  }
  if (c.coefficient) infos.push(`Coefficient ×${fixed(c.coefficient, 2)}${c.basis === 'farine' ? ` (${grammes(c.coefficient * 1000)} de farine)` : ''}`);
  const a = acces();
  const qui = (c.auteurPrenom || (a && a.utilisateur().prenom) || '').trim();
  return {
    titre: c.recipeName || 'Feuille de calcul',
    sousTitre: `${c.label ? `${c.label} · ` : ''}Feuille de calcul · ${dateLisible()}`,
    infos,
    ingredients: [...farines.map((l) => ({ nom: l.name, quantite: grammes(l.grams), enPremier: true })), ...autres.map((l) => ({ nom: l.name, quantite: grammes(l.grams) }))],
    total: c.targetG ? grammes(c.targetG) : '',
    allergenes: allergenes((recette ? recette.ingredients : lignes)),
    avertissement: window.FournilAllergenes ? window.FournilAllergenes.AVERTISSEMENT : '',
    notes: recette && recette.notes ? recette.notes : '',
    pied: ['Fournil', qui, new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })].filter(Boolean).join(' · '),
  };
}

/** Fabrique le PDF d'un calcul et le télécharge sur l'appareil. */
export function telechargerPdf(calcul) {
  const P = window.FournilFichePdf;
  if (!P) return false;
  const fiche = ficheDepuisCalcul(calcul);
  const octets = P.octets(P.creerPdf(fiche));
  const blob = new Blob([octets], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = P.nomFichier(fiche.titre, dateFichier());
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  if (typeof toast === 'function') toast('Fiche PDF téléchargée ✓');
  return true;
}

const boutonPdf = (titre) => `<button type="button" class="btn-soft rc-pdf-btn" aria-label="Fiche PDF de ${esc(titre)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13v5M10 13h1.5a1.5 1.5 0 0 1 0 3H10"/></svg> PDF</button>`;

// ---------- décorations ----------
/** Calcul enregistré : auteur, Supprimer seulement si permis, allergènes et PDF dans le détail. */
export function decorerCalcul(ligne, calcul) {
  const a = acces();
  if (calcul && calcul.auteurPrenom) {
    const meta = ligne.querySelector('.meta');
    if (meta) meta.insertAdjacentHTML('beforeend', ` · <span class="rc-auteur">par ${esc(calcul.auteurPrenom)}</span>`);
  }
  if (a && calcul && calcul.auteurUid && !a.peutSupprimerCalcul(calcul)) {
    const del = ligne.querySelector('.del-btn');
    if (del) del.remove();
  }
  const detail = ligne.querySelector('.calc-detail');
  if (detail && calcul) {
    const recette = state.recipes.find((r) => r.name === calcul.recipeName);
    detail.insertAdjacentHTML('beforeend', `${blocAllergenes(recette ? recette.ingredients : calcul.breakdown)}<div class="rc-pdf-ligne">${boutonPdf(calcul.label || calcul.recipeName)}</div>`);
    detail.querySelector('.rc-pdf-btn').onclick = (e) => { e.stopPropagation(); telechargerPdf(calcul); };
  }
}

/** Feuille en cours (résultat du calcul de Grigne). */
export function decorerResultat(zone, recette, mise, calc) {
  const carte = zone.querySelector('.result-card');
  if (!carte || !recette) return;
  const ref = carte.querySelector('.ref-line');
  const html = blocAllergenes(recette.ingredients);
  if (ref) ref.insertAdjacentHTML('beforebegin', html);
  else carte.insertAdjacentHTML('beforeend', html);
  if (!mise || !mise.factor) return;
  const pieces = calc && calc.mode === 'pieces'
    ? (calc.pieceRows || []).filter((p) => parseFloat(p.count) > 0 && parseFloat(p.weight) > 0)
      .map((p) => ({ label: p.label, count: Number(String(p.count).replace(',', '.')), weight: Number(String(p.weight).replace(',', '.')) }))
    : null;
  const calcul = {
    recipeName: recette.name,
    label: null,
    targetG: mise.targetG,
    coefficient: mise.coefficient,
    basis: mise.usesFlourBasis ? 'farine' : 'total',
    breakdown: recette.ingredients.map((ing) => ({ name: ing.name, grams: ing.qtyG * mise.factor })),
    pieces,
  };
  const rangee = carte.querySelector('.save-calc-row');
  const bouton = document.createElement('div');
  bouton.className = 'rc-pdf-ligne';
  bouton.innerHTML = boutonPdf(recette.name);
  bouton.querySelector('button').onclick = () => {
    const nom = carte.querySelector('.calc-label-input');
    telechargerPdf({ ...calcul, label: nom && nom.value.trim() ? nom.value.trim() : null });
  };
  if (rangee) rangee.insertAdjacentElement('afterend', bouton);
  else carte.appendChild(bouton);
}

/** Recette de la Bibliothèque : allergènes sous les pastilles. */
export function decorerRecette(ligne, recette) {
  const chips = ligne.querySelector('.meta.chips');
  if (chips && recette) chips.insertAdjacentHTML('afterend', blocAllergenes(recette.ingredients, true));
}
