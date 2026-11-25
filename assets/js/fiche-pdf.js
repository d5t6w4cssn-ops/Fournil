// Fiche de présentation d'une feuille de calcul, en PDF, dans le style de la fiche « SB »
// (page blanche, pastille dorée aux initiales en haut, deux grands épis de blé en trait
// beige clair derrière le texte). Le modèle (photo) est gardé hors du dépôt, dans
// reference/ (jamais publié).
// Le PDF est fabriqué ici, sans bibliothèque : texte en polices standard (Helvetica,
// Times), épis en tracés vectoriels. Il est téléchargé sur l'appareil ; rien n'est envoyé
// ni stocké en ligne. Fonctions pures : window.FournilFichePdf, testées par
// tests/test_fiche_pdf.js. Le logo SVG (assets/img/epis.svg) est produit par les mêmes
// tracés (node tools/dessiner-epis.cjs).
(function (racine, fabrique) {
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (racine && racine.document) racine.FournilFichePdf = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COULEURS = {
    epis: [0.886, 0.827, 0.686], // #E2D3AF, beige clair du modèle (logo SVG)
    episFond: [0.93, 0.89, 0.8], // plus clair derrière le texte du PDF, pour la lisibilité
    or: [0.776, 0.635, 0.333], // #C6A255, pastille
    orClair: [1, 0.98, 0.93],
    encre: [0.2, 0.2, 0.22], // initiales et texte
    brun: [0.36, 0.27, 0.18],
    gris: [0.45, 0.42, 0.38],
    trait: [0.85, 0.8, 0.7],
  };
  const INITIALES = 'SB';

  // =====================================================================
  // Logo : deux épis de blé (tracés en courbes de Bézier, repère 400 × 560)
  // =====================================================================
  const r1 = (n) => Math.round(n * 10) / 10;
  function rot(x, y, a) { const c = Math.cos(a); const s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }

  /** Un épi : tige, grains en amande alternés, barbes. Coordonnées locales (base en 0,0, vers le haut = y négatif). */
  function epi() {
    const chemins = [];
    // tige légèrement courbe
    chemins.push({ l: 1, p: [['M', 0, 0], ['C', 4, -60, 2, -120, 0, -190]] });
    const grain = (bx, by, angle, long, large) => {
      // amande : base (bx,by), pointe dans la direction angle (radians, 0 = vers le haut)
      const [dx, dy] = rot(0, -long, angle);
      const [px, py] = rot(large, 0, angle);
      const tx = bx + dx; const ty = by + dy;
      return [
        ['M', bx, by],
        ['C', bx + px * 1.1 + dx * 0.25, by + py * 1.1 + dy * 0.25, tx + px * 0.55 - dx * 0.15, ty + py * 0.55 - dy * 0.15, tx, ty],
        ['C', tx - px * 0.55 - dx * 0.15, ty - py * 0.55 - dy * 0.15, bx - px * 1.1 + dx * 0.25, by - py * 1.1 + dy * 0.25, bx, by],
      ];
    };
    const barbe = (bx, by, angle, long) => {
      const [dx, dy] = rot(0, -long, angle);
      const [cx, cy] = rot(0, -long * 0.6, angle * 0.6);
      return [['M', bx, by], ['C', bx + cx * 0.5, by + cy * 0.5, bx + cx, by + cy, bx + dx, by + dy]];
    };
    const etages = 5;
    for (let i = 0; i < etages; i++) {
      const y = -150 - i * 46;
      const k = 1 - i * 0.09; // grains plus petits vers le haut
      const a = 0.42;
      chemins.push({ l: 2, p: grain(-4, y, -a, 74 * k, 21 * k) });
      chemins.push({ l: 2, p: grain(4, y - 20, a, 74 * k, 21 * k) });
      // barbes depuis la pointe des grains
      const [gx, gy] = rot(0, -74 * k, -a);
      chemins.push({ l: 0.8, p: barbe(-4 + gx, y + gy, -a * 0.5, 38 * k) });
      const [hx, hy] = rot(0, -74 * k, a);
      chemins.push({ l: 0.8, p: barbe(4 + hx, y - 20 + hy, a * 0.5, 38 * k) });
    }
    // grain du sommet et sa barbe
    const ySommet = -150 - etages * 46 + 6;
    chemins.push({ l: 2, p: grain(0, ySommet, 0, 66, 18) });
    chemins.push({ l: 0.8, p: barbe(0, ySommet - 66, 0.08, 70) });
    // tige intérieure jusqu'au sommet
    chemins.push({ l: 1, p: [['M', 0, -190], ['C', -1, -250, 1, -320, 0, ySommet]] });
    return chemins;
  }

  /** Tracés des deux épis dans le repère 400 × 560 (y vers le bas, comme en SVG). */
  function episChemins() {
    const place = (chemins, ox, oy, angle, echelle) => chemins.map((c) => ({
      l: c.l,
      p: c.p.map(([op, ...v]) => {
        const out = [op];
        for (let i = 0; i < v.length; i += 2) {
          const [x, y] = rot(v[i] * echelle, v[i + 1] * echelle, angle);
          out.push(r1(ox + x), r1(oy + y));
        }
        return out;
      }),
    }));
    return [...place(epi(), 140, 545, -0.2, 0.86), ...place(epi(), 262, 475, 0.17, 0.86)];
  }

  /** Le logo en SVG (traits beige, sans remplissage). */
  function episSvg({ couleur = '#E2D3AF', epaisseur = 7 } = {}) {
    const d = (c) => c.p.map(([op, ...v]) => `${op}${v.join(' ')}`).join('');
    const traits = episChemins().map((c) => `<path d="${d(c)}" stroke-width="${r1(epaisseur * (c.l >= 2 ? 1 : c.l >= 1 ? 0.8 : 0.4))}"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560" width="400" height="560" role="img" aria-label="Deux épis de blé"><g fill="none" stroke="${couleur}" stroke-linecap="round" stroke-linejoin="round">${traits}</g></svg>\n`;
  }

  // =====================================================================
  // Texte : encodage WinAnsi et largeurs des polices standard
  // =====================================================================
  const SPECIAUX = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'œ': 0x9c, 'Œ': 0x8c, 'Ÿ': 0x9f, ' ': 0xa0, ' ': 0x20, '−': 0x2d, '×': 0xd7 };
  /** Texte → octets WinAnsi (caractère inconnu → « ? »). */
  function winAnsi(s) {
    const out = [];
    for (const ch of String(s ?? '')) {
      const c = ch.codePointAt(0);
      if (SPECIAUX[ch] !== undefined) out.push(SPECIAUX[ch]);
      else if (c >= 0x20 && c < 0x7f) out.push(c);
      else if (c >= 0xa0 && c <= 0xff) out.push(c);
      else out.push(0x3f);
    }
    return out;
  }
  const hex = (octets) => `<${octets.map((o) => o.toString(16).padStart(2, '0')).join('')}>`;

  // largeurs (millièmes de la taille) des caractères ASCII 32 à 126
  const L_HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const L_HELV_B = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
  const POLICES = { F1: L_HELV, F2: L_HELV_B, F3: L_HELV_B };
  const AUTRES = { 0x80: 556, 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0x9c: 944, 0x8c: 1000, 0xa0: 278, 0xb0: 400, 0xab: 556, 0xbb: 556, 0xd7: 584 };
  const BASES = 'AAAAAAACEEEEIIIIDNOOOOOxOUUUUYPsaaaaaaaceeeeiiiidnooooo/ouuuuypy'; // 0xC0 à 0xFF → lettre de base
  function largeur(texte, police, taille) {
    const t = POLICES[police] || L_HELV;
    let w = 0;
    winAnsi(texte).forEach((o) => {
      if (o >= 32 && o <= 126) w += t[o - 32];
      else if (AUTRES[o] !== undefined) w += AUTRES[o];
      else if (o >= 0xc0) { const b = BASES.charCodeAt(o - 0xc0); w += b >= 32 && b <= 126 ? t[b - 32] : 556; } else w += 556;
    });
    return (w * taille) / 1000;
  }
  /** Coupe un texte en lignes d'au plus `max` points de large. */
  function couper(texte, police, taille, max) {
    const lignes = [];
    String(texte ?? '').split('\n').forEach((para) => {
      let ligne = '';
      para.split(/\s+/).filter(Boolean).forEach((mot) => {
        const essai = ligne ? `${ligne} ${mot}` : mot;
        if (largeur(essai, police, taille) <= max || !ligne) ligne = essai;
        else { lignes.push(ligne); ligne = mot; }
      });
      lignes.push(ligne);
    });
    return lignes;
  }

  // =====================================================================
  // Page
  // =====================================================================
  const A4 = { l: 595.28, h: 841.89 };
  const MARGE = 64;
  const f = (n) => r1(n).toString();

  function dessinerEpis() {
    // logo centré, sur presque toute la hauteur de la page, derrière le texte
    const e = 1.32;
    const ox = (A4.l - 400 * e) / 2;
    const oy = A4.h - 110; // haut du repère du logo (sous la pastille)
    const ops = [`${COULEURS.episFond.join(' ')} RG`, '1 J 1 j'];
    episChemins().forEach((c) => {
      ops.push(`${f((c.l >= 2 ? 5.2 : c.l >= 1 ? 4.2 : 2) * 1)} w`);
      c.p.forEach(([op, ...v]) => {
        const pts = [];
        for (let i = 0; i < v.length; i += 2) pts.push(f(ox + v[i] * e), f(oy - v[i + 1] * e * 1.05 + 30));
        ops.push(`${pts.join(' ')} ${op === 'M' ? 'm' : op === 'L' ? 'l' : 'c'}`);
      });
      ops.push('S');
    });
    return ops;
  }

  function cercle(cx, cy, r) {
    const k = 0.5523 * r;
    return [
      `${f(cx + r)} ${f(cy)} m`,
      `${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c`,
      `${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c`,
      `${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c`,
      `${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c`,
    ];
  }

  function dessinerPastille(initiales) {
    const cx = A4.l / 2;
    const cy = A4.h - 62;
    const r = 34;
    const ops = [`${COULEURS.or.join(' ')} rg`, ...cercle(cx, cy, r), 'f'];
    // reflet clair, comme sur le modèle
    ops.push(`${COULEURS.orClair.join(' ')} RG`, '1.2 w', `${f(cx + r * 0.62)} ${f(cy + r * 0.55)} m ${f(cx + r * 0.85)} ${f(cy + r * 0.2)} ${f(cx + r * 0.85)} ${f(cy - r * 0.2)} ${f(cx + r * 0.6)} ${f(cy - r * 0.6)} c S`);
    const taille = 26;
    const w = largeur(initiales, 'F3', taille) * 0.92;
    ops.push('BT', `${COULEURS.encre.join(' ')} rg`, `/F3 ${taille} Tf`, `1 0 0.2 1 ${f(cx - w / 2)} ${f(cy - taille * 0.33)} Tm`, `${hex(winAnsi(initiales))} Tj`, 'ET');
    return ops;
  }

  const texte = (x, y, s, police, taille, couleur = COULEURS.encre) => ['BT', `${couleur.join(' ')} rg`, `/${police} ${taille} Tf`, `${f(x)} ${f(y)} Td`, `${hex(winAnsi(s))} Tj`, 'ET'];
  const centre = (y, s, police, taille, couleur) => texte((A4.l - largeur(s, police, taille)) / 2, y, s, police, taille, couleur);
  const droite = (xDroite, y, s, police, taille, couleur) => texte(xDroite - largeur(s, police, taille), y, s, police, taille, couleur);
  const trait = (x1, y, x2, couleur = COULEURS.trait, ep = 0.6) => [`${couleur.join(' ')} RG`, `${ep} w`, `${f(x1)} ${f(y)} m ${f(x2)} ${f(y)} l S`];

  /**
   * Construit les pages de la fiche.
   * fiche = { titre, sousTitre, infos: [texte], ingredients: [{ nom, quantite, enPremier }],
   *           total, allergenes: [{ nom, ingredients }], avertissement, notes, pied, initiales }
   * Renvoie une liste de pages, chacune une liste d'opérations PDF.
   */
  function pages(fiche) {
    const tout = [];
    let ops = null;
    let y = 0;
    const nouvellePage = () => {
      ops = [...dessinerEpis(), ...dessinerPastille(fiche.initiales || INITIALES)];
      tout.push(ops);
      y = A4.h - 130;
    };
    const place = (h) => { if (y - h < 70) { nouvellePage(); } };
    nouvellePage();
    const large = A4.l - 2 * MARGE;

    // titre
    couper(fiche.titre || 'Feuille de calcul', 'F2', 24, large).forEach((l) => { place(30); ops.push(...centre(y, l, 'F2', 24, COULEURS.brun)); y -= 30; });
    if (fiche.sousTitre) { ops.push(...centre(y + 4, fiche.sousTitre, 'F1', 12, COULEURS.gris)); y -= 22; }
    (fiche.infos || []).forEach((info) => {
      couper(info, 'F1', 11.5, large).forEach((l) => { place(16); ops.push(...centre(y, l, 'F1', 11.5, COULEURS.encre)); y -= 16; });
    });
    y -= 14;

    // ingrédients
    place(40);
    ops.push(...texte(MARGE, y, 'Ingrédient', 'F2', 11, COULEURS.gris), ...droite(A4.l - MARGE, y, 'Quantité', 'F2', 11, COULEURS.gris));
    y -= 8;
    ops.push(...trait(MARGE, y, A4.l - MARGE, COULEURS.or, 1));
    y -= 20;
    (fiche.ingredients || []).forEach((ing) => {
      const noms = couper(ing.nom, ing.enPremier ? 'F2' : 'F1', 13, large - 150);
      place(noms.length * 17 + 8);
      noms.forEach((l, i) => {
        ops.push(...texte(MARGE, y, l, ing.enPremier ? 'F2' : 'F1', 13));
        if (i === 0) ops.push(...droite(A4.l - MARGE, y, ing.quantite, 'F2', 13));
        y -= 17;
      });
      ops.push(...trait(MARGE, y + 9, A4.l - MARGE));
      y -= 6;
    });
    if (fiche.total) {
      place(30);
      y -= 4;
      ops.push(...texte(MARGE, y, 'Total pâte crue', 'F2', 14, COULEURS.brun), ...droite(A4.l - MARGE, y, fiche.total, 'F2', 14, COULEURS.brun));
      y -= 10;
      ops.push(...trait(MARGE, y, A4.l - MARGE, COULEURS.or, 1));
      y -= 26;
    }

    // allergènes
    place(50);
    ops.push(...texte(MARGE, y, 'Allergènes', 'F2', 13, COULEURS.brun));
    y -= 18;
    const al = fiche.allergenes || [];
    const lignesAl = al.length
      ? al.map((a) => `${a.nom} (${a.ingredients.join(', ')})`)
      : ['Aucun allergène repéré dans les noms des ingrédients.'];
    lignesAl.forEach((l) => {
      couper(`• ${l}`, 'F1', 11.5, large).forEach((x) => { place(15); ops.push(...texte(MARGE, y, x, 'F1', 11.5)); y -= 15; });
    });
    if (fiche.avertissement) {
      y -= 2;
      couper(fiche.avertissement, 'F1', 9.5, large).forEach((x) => { place(13); ops.push(...texte(MARGE, y, x, 'F1', 9.5, COULEURS.gris)); y -= 13; });
    }

    // étapes / notes de la recette
    if (fiche.notes) {
      y -= 14;
      place(40);
      ops.push(...texte(MARGE, y, 'Étapes', 'F2', 13, COULEURS.brun));
      y -= 18;
      couper(fiche.notes, 'F1', 11.5, large).forEach((x) => { place(15); ops.push(...texte(MARGE, y, x, 'F1', 11.5)); y -= 15; });
    }

    // pied de page sur chaque page
    tout.forEach((p, i) => {
      const pied = `${fiche.pied || ''}${tout.length > 1 ? ` · page ${i + 1} / ${tout.length}` : ''}`;
      if (pied) p.push(...centre(36, pied, 'F1', 9, COULEURS.gris));
    });
    return tout;
  }

  /** Assemble le fichier PDF (texte ASCII, donc 1 caractère = 1 octet). */
  function assembler(listePages, { titre = 'Fiche', date = new Date() } = {}) {
    const objets = [];
    const ajouter = (corps) => { objets.push(corps); return objets.length; };
    const catalogue = ajouter(null);
    const racinePages = ajouter(null);
    const polices = {
      F1: ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
      F2: ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
      F3: ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Times-BoldItalic /Encoding /WinAnsiEncoding >>'),
    };
    const ressources = `<< /Font << ${Object.entries(polices).map(([n, i]) => `/${n} ${i} 0 R`).join(' ')} >> >>`;
    const enfants = listePages.map((ops) => {
      const flux = ops.join('\n');
      const contenu = ajouter(`<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`);
      return ajouter(`<< /Type /Page /Parent ${racinePages} 0 R /MediaBox [0 0 ${A4.l} ${A4.h}] /Resources ${ressources} /Contents ${contenu} 0 R >>`);
    });
    objets[catalogue - 1] = `<< /Type /Catalog /Pages ${racinePages} 0 R >>`;
    objets[racinePages - 1] = `<< /Type /Pages /Kids [${enfants.map((i) => `${i} 0 R`).join(' ')}] /Count ${enfants.length} >>`;
    const d = new Date(date);
    const p2 = (n) => String(n).padStart(2, '0');
    const dPdf = `D:${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
    const info = ajouter(`<< /Title ${hex(winAnsi(titre))} /Producer (Fournil) /CreationDate (${dPdf}) >>`);
    let sortie = '%PDF-1.4\n';
    const positions = [];
    objets.forEach((corps, i) => {
      positions.push(sortie.length);
      sortie += `${i + 1} 0 obj\n${corps}\nendobj\n`;
    });
    const xref = sortie.length;
    sortie += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
    sortie += `trailer\n<< /Size ${objets.length + 1} /Root ${catalogue} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return sortie;
  }

  /** Fiche → texte du PDF. */
  function creerPdf(fiche, options = {}) {
    return assembler(pages(fiche), { titre: fiche.titre, ...options });
  }
  /** Texte du PDF → octets (tous les caractères sont ASCII). */
  function octets(pdf) {
    const u = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) u[i] = pdf.charCodeAt(i) & 0xff;
    return u;
  }
  /** Nom de fichier sûr : « fiche-pain-de-campagne-2026-11-26.pdf ». */
  function nomFichier(titre, date) {
    const base = String(titre || 'fiche').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'fiche';
    return `fiche-${base}-${date}.pdf`;
  }

  return { creerPdf, pages, assembler, octets, nomFichier, episChemins, episSvg, winAnsi, largeur, couper, INITIALES };
});
