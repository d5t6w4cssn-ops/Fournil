// Logo des épis de Fournil : écrit assets/img/epis.svg à partir des tracés de
// assets/js/fiche-pdf.js (les mêmes que dans le PDF).
//   node tools/dessiner-epis.cjs             écrit le fichier
//   node tools/dessiner-epis.cjs --verifier  vérifie qu'il est à jour (n'écrit rien)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { episSvg } = require('../assets/js/fiche-pdf.js');

const cible = path.join(__dirname, '..', 'assets', 'img', 'epis.svg');
const svg = episSvg();
if (process.argv.includes('--verifier')) {
  const actuel = fs.existsSync(cible) ? fs.readFileSync(cible, 'utf8') : '';
  if (actuel !== svg) { console.log('assets/img/epis.svg n’est pas à jour : lance node tools/dessiner-epis.cjs'); process.exit(1); }
  console.log('assets/img/epis.svg est à jour');
} else {
  fs.writeFileSync(cible, svg);
  console.log(`assets/img/epis.svg écrit (${svg.length} octets)`);
}
