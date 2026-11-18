// Données de démonstration réalistes (inventées) pour les captures et les tests
// visuels. Même format que boulangerie/state, boulangerie/labo et boulangerie/recettes.
'use strict';

function jour(decalage) {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return d.toISOString().slice(0, 10);
}

function donneesDemo() {
  const today = jour(0);
  const produits = [
    { id: 'croissant', name: 'Croissant', emoji: '🥐', stockReel: 64, base: 40, commande: 6, seuil: 20 },
    { id: 'pain_choc', name: 'Pain au chocolat', emoji: '🍫', stockReel: 48, base: 30, commande: 0, seuil: 20 },
    { id: 'viennoise', name: 'Viennoise', emoji: '🥖', stockReel: 22, base: 12, commande: 0, seuil: 15 },
    { id: 'brioche', name: 'Brioche', emoji: '🍞', stockReel: 9, base: 6, commande: 0, seuil: 10 },
    { id: 'pain_raisins', name: 'Pain aux raisins', emoji: '🍇', stockReel: 0, base: 0, commande: 0, seuil: 15 },
  ];
  const histo = [];
  for (let d = 0; d < 7; d++) {
    produits.forEach((p, i) => {
      histo.push({ id: `h_${d}_${i}`, date: jour(-d), type: 'sortie', pid: p.id, name: p.name, emoji: p.emoji, qty: 10 + ((d * 7 + i * 5) % 25) });
      if (d % 3 === 0) histo.push({ id: `hr_${d}_${i}`, date: jour(-d), type: 'recharge', pid: p.id, name: p.name, emoji: p.emoji, qty: 60 });
    });
  }
  const state = {
    products: produits,
    tasks: [
      { id: 't_1', text: 'Préparer le levain pour demain', done: false, auto: false, cat: 'production' },
      { id: 't_2', text: 'Nettoyer le laminoir', done: false, auto: false, cat: 'nettoyage' },
      { id: 't_3', text: 'Commander la farine T65', done: true, auto: false, cat: 'general' },
      { id: 'a_pain_raisins_1', text: 'Réapprovisionner 🍇 Pain aux raisins — congelo vide', done: false, auto: true, pid: 'pain_raisins' },
    ],
    lastDate: today,
    history: histo,
    thermos: [],
    notes: [
      { id: 'n_1', author: 'Léa', text: 'Le four 2 chauffe un peu fort ce matin, baisse de 10 °C.', time: '18 nov. 06:12' },
      { id: 'n_2', author: 'Karim', text: 'Livraison de beurre reçue, rangée en chambre froide.', time: '17 nov. 15:40' },
    ],
    boulangers: ['Léa', 'Karim', 'Sam'],
    freeNotes: 'Penser aux galettes pour janvier.',
    journal: { [today]: { obs: 'Pousse longue ce matin, four à 200 °C.', produits: { croissant: 120, pain_choc: 90 } } },
    histoTaches: [
      { id: 'ht_1', text: 'Commander la farine T65', cat: 'general', date: today, time: '08:30' },
      { id: 'ht_2', text: 'Laminer la pâte à croissant', cat: 'production', date: jour(-1), time: '05:10' },
    ],
    matieres: [
      { id: 'm_1', name: 'Farine T65', emoji: '🌾', unit: 'kg', stock: 120, seuil: 50, conso: 80, dlc: jour(90) },
      { id: 'm_2', name: 'Beurre AOP', emoji: '🧈', unit: 'kg', stock: 8, seuil: 15, conso: 20, dlc: jour(5) },
      { id: 'm_3', name: 'Levure fraîche', emoji: '🧫', unit: 'kg', stock: 1.5, seuil: 1, conso: 2, dlc: jour(2) },
      { id: 'm_4', name: 'Chocolat bâtons', emoji: '🍫', unit: 'kg', stock: 4, seuil: 3, conso: 3, dlc: jour(180) },
    ],
    cmdClients: [
      { id: 'cc_1', nom: 'Café du Marché', adresse: '12 place du Marché, Lyon', date: jour(1), heure: '07:00', detail: '40 croissants, 20 pains au chocolat', status: 'pending', createdAt: today },
      { id: 'cc_2', nom: 'Hôtel des Arts', adresse: '3 rue Mercière, Lyon', date: jour(1), heure: '07:30', detail: '30 viennoises', status: 'sent', createdAt: today },
      { id: 'cc_3', nom: 'École Jean-Macé', adresse: '5 rue de Marseille, Lyon', date: jour(3), heure: '10:00', detail: '2 brioches de 1 kg', status: 'pending', createdAt: today },
    ],
    seuilsCharge: { low: 30, mid: 80 },
  };
  const labo = {
    products: [
      { id: 'lp_1', name: 'Tarte aux fraises', emoji: '🍓', stockReel: 12, base: 6, commande: 2, seuil: 4 },
      { id: 'lp_2', name: 'Éclair au café', emoji: '☕', stockReel: 30, base: 12, commande: 0, seuil: 10 },
      { id: 'lp_3', name: 'Flan pâtissier', emoji: '🍮', stockReel: 3, base: 2, commande: 0, seuil: 4 },
    ],
    tasks: [
      { id: 'lt_1', text: 'Monter la crème pâtissière', done: false, auto: false, cat: 'production' },
      { id: 'lt_2', text: 'Nettoyer le batteur', done: false, auto: false, cat: 'nettoyage' },
    ],
    lastDate: today,
    history: [
      { id: 'lh_1', date: today, type: 'sortie', pid: 'lp_1', name: 'Tarte aux fraises', emoji: '🍓', qty: 6 },
      { id: 'lh_2', date: jour(-1), type: 'recharge', pid: 'lp_2', name: 'Éclair au café', emoji: '☕', qty: 24 },
    ],
    histoTaches: [{ id: 'lht_1', text: 'Tempérer le chocolat', cat: 'production', date: today, time: '09:15' }],
  };
  const ing = (id, name, qtyG) => ({ id, name, qtyG });
  const recettes = [
    { id: 'r_1', name: 'Baguette de tradition', ingredients: [ing('a', 'Farine T65', 1000), ing('b', 'Eau', 720), ing('c', 'Levain liquide', 200), ing('d', 'Sel', 20), ing('e', 'Levure fraîche', 2)], notes: 'Autolyse 1 h\nPointage 2 h avec 2 rabats\nCuisson 25 min à 250 °C', tb: 56 },
    { id: 'r_2', name: 'Brioche Nanterre', ingredients: [ing('a', 'Farine T45', 1000), ing('b', 'Œufs', 600), ing('c', 'Beurre', 500), ing('d', 'Sucre', 120), ing('e', 'Levure fraîche', 40), ing('f', 'Sel', 20)], notes: 'Pétrissage lent, beurre ajouté en fin\nRepos une nuit au froid' },
    { id: 'r_3', name: 'Pain de campagne', ingredients: [ing('a', 'Farine T80', 800), ing('b', 'Farine de seigle T130', 200), ing('c', 'Eau', 700), ing('d', 'Levain liquide', 200), ing('e', 'Sel', 20)], notes: '', tb: 58 },
    { id: 'r_4', name: 'Pâte à pizza', ingredients: [ing('a', 'Farine T00', 1000), ing('b', 'Eau', 650), ing('c', 'Huile d’olive', 30), ing('d', 'Sel', 25), ing('e', 'Levure fraîche', 3)], notes: 'Pointage 24 h au froid' },
  ];
  const calcHistory = [
    { id: 'c_1', timestamp: Date.now() - 3600e3, recipeName: 'Baguette de tradition', label: 'Fournée du matin', targetG: 19420, coefficient: 10, basis: 'farine', breakdown: recettes[0].ingredients.map((i) => ({ name: i.name, grams: i.qtyG * 10 })) },
  ];
  return { state, labo, recettes, calcHistory };
}

module.exports = { donneesDemo };
