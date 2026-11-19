// Stock de Fournil : fonctions ajoutées au module Stock (sans toucher au reste du code).
// 1. Réglages → « Remettre tout le stock à zéro » (Fournil, Labo, matières premières).
// 2. Sur chaque produit (Fournil, Labo, matières) : boutons − / + rapides et « Retrait avec motif ».
// 3. Saisie rapide en haut du Stock (voir saisie-rapide.js pour la reconnaissance du texte).
// Les données gardent leur format ; l'historique reçoit des lignes de types ajustement,
// retrait, raz et saisie (affichées par histoLibelle / histoQuantite du script principal).
(() => {
  /* global S, L, save, saveL, today, refresh, genAutoTasks, renderStock, renderLaboStock, renderMatieres, renderSettings, toast, esc */
  const CATEGORIES = {
    fournil: {
      nom: 'Fournil',
      liste: () => S.products || [],
      champ: 'stockReel',
      histo: () => { if (!S.history) S.history = []; return S.history; },
      enregistrer: () => save(),
      carte: (id) => `pc-${id}`,
      unite: () => '',
      entier: true,
      majAffichage: (p) => { refresh(p); if (typeof genAutoTasks === 'function') genAutoTasks(); },
    },
    labo: {
      nom: 'Labo',
      liste: () => L.products || [],
      champ: 'stockReel',
      histo: () => { if (!L.history) L.history = []; return L.history; },
      enregistrer: () => saveL(),
      carte: (id) => `lpc-${id}`,
      unite: () => '',
      entier: true,
      majAffichage: () => renderLaboStock(),
    },
    matieres: {
      nom: 'Matières premières',
      liste: () => S.matieres || [],
      champ: 'stock',
      histo: () => { if (!S.history) S.history = []; return S.history; },
      enregistrer: () => save(),
      carte: (id) => `mpc-${id}`,
      unite: (m) => m.unit || '',
      entier: false,
      majAffichage: () => renderMatieres(),
    },
  };
  const MAX_HISTO = 630;
  const arrondi = (n) => Math.round(n * 1000) / 1000;
  const fq = (n) => String(arrondi(n)).replace('.', ',');
  const avecUnite = (n, u) => (u ? `${fq(n)} ${u}` : fq(n));

  function ajouterHisto(cat, entree) {
    const h = CATEGORIES[cat].histo();
    h.unshift({ id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, date: today(), ...entree });
    if (h.length > MAX_HISTO) h.length = MAX_HISTO;
  }

  // ---------- petite fenêtre (même style que les fenêtres de Fournil) ----------
  function fenetre(html) {
    let ov = document.getElementById('mStockFenetre');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mStockFenetre';
      ov.className = 'overlay';
      ov.addEventListener('click', (e) => { if (e.target === ov) fermer(); });
      document.body.appendChild(ov);
    }
    ov.innerHTML = `<div class="modal stock-modal" role="dialog" aria-modal="true">${html}</div>`;
    ov.classList.add('open');
    const premier = ov.querySelector('input, select, button.mbtn-p');
    if (premier) premier.focus();
    return ov;
  }
  function fermer() {
    const ov = document.getElementById('mStockFenetre');
    if (ov) ov.classList.remove('open');
  }

  // =====================================================================
  // 1. Remise à zéro de tout le stock
  // =====================================================================
  function compter() {
    return {
      fournil: (S.products || []).length,
      labo: (L.products || []).length,
      matieres: (S.matieres || []).length,
    };
  }
  function demanderRemiseAZero() {
    const n = compter();
    const ov = fenetre(`
      <div class="modal-title">Remettre tout le stock à zéro ?</div>
      <p class="stock-texte">Les quantités en stock passeront à <strong>0</strong> :</p>
      <ul class="stock-liste">
        <li>${n.fournil} produit${n.fournil > 1 ? 's' : ''} du Fournil</li>
        <li>${n.labo} produit${n.labo > 1 ? 's' : ''} du Labo</li>
        <li>${n.matieres} matière${n.matieres > 1 ? 's' : ''} première${n.matieres > 1 ? 's' : ''}</li>
      </ul>
      <p class="stock-texte">Restent comme avant : les produits et leurs réglages (seuil, base / jour, commandes), les catégories, les recettes et l'historique.</p>
      <p class="stock-alerte">Cette action ne peut pas être annulée.</p>
      <div class="mactions">
        <button type="button" class="mbtn mbtn-c" data-action="annuler">Annuler</button>
        <button type="button" class="mbtn stock-danger" data-action="raz">Oui, tout remettre à zéro</button>
      </div>`);
    ov.querySelector('[data-action=annuler]').onclick = fermer;
    ov.querySelector('[data-action=raz]').onclick = () => {
      remettreAZero();
      fermer();
    };
  }
  function remettreAZero() {
    (S.products || []).forEach((p) => { p.stockReel = 0; });
    (S.matieres || []).forEach((m) => { m.stock = 0; });
    (L.products || []).forEach((p) => { p.stockReel = 0; });
    ajouterHisto('fournil', { type: 'raz', pid: '', name: 'Tout le stock (Fournil et matières premières)', emoji: '0️⃣', qty: 0 });
    ajouterHisto('labo', { type: 'raz', pid: '', name: 'Tout le stock du Labo', emoji: '0️⃣', qty: 0 });
    save();
    saveL();
    if (typeof genAutoTasks === 'function') genAutoTasks();
    renderStock();
    renderLaboStock();
    renderMatieres();
    renderSettings();
    toast('Stock remis à zéro ✓');
  }
  function carteRemiseAZero() {
    const el = document.getElementById('settingsList');
    if (!el || el.querySelector('.stock-raz')) return;
    const c = document.createElement('div');
    c.className = 'stock-raz';
    c.innerHTML = `
      <div class="sec-title">Stock</div>
      <div class="stock-raz-carte">
        <p class="stock-texte">Met à 0 les quantités en stock du Fournil, du Labo et des matières premières. Les produits, catégories et recettes restent.</p>
        <button type="button" class="stock-danger stock-raz-btn">Remettre tout le stock à zéro</button>
      </div>`;
    c.querySelector('.stock-raz-btn').onclick = demanderRemiseAZero;
    el.appendChild(c);
  }

  // =====================================================================
  // 2. Boutons − / + et retrait avec motif, sur chaque produit
  // =====================================================================
  function trouver(cat, id) {
    return CATEGORIES[cat].liste().find((x) => x.id === id);
  }

  // Ajustement rapide : enregistré tout de suite ; les appuis successifs sur le même produit
  // (2 minutes au plus) sont regroupés en une seule ligne d'historique.
  function ajuster(cat, id, sens) {
    const c = CATEGORIES[cat];
    const p = trouver(cat, id);
    if (!p) return;
    const actuel = Number(p[c.champ]) || 0;
    if (sens < 0 && actuel <= 0) {
      toast(`${p.name} : le stock est déjà à 0`);
      return;
    }
    const pas = sens < 0 ? -Math.min(1, actuel) : 1;
    p[c.champ] = arrondi(actuel + pas);
    const h = c.histo();
    const dernier = h[0];
    if (dernier && dernier.type === 'ajustement' && dernier.pid === id && dernier.cat === cat && dernier.date === today() && Date.now() - (dernier.t || 0) < 120000) {
      dernier.delta = arrondi((dernier.delta || 0) + pas);
      dernier.qty = Math.abs(dernier.delta);
      dernier.t = Date.now();
      if (dernier.delta === 0) h.shift();
    } else {
      ajouterHisto(cat, { type: 'ajustement', cat, pid: id, name: p.name, emoji: p.emoji || '📦', delta: pas, qty: Math.abs(pas), unit: c.unite(p) || undefined, t: Date.now() });
    }
    c.enregistrer();
    c.majAffichage(p);
    majValeur(cat, id);
  }

  function retirerAvecMotif(cat, id) {
    const c = CATEGORIES[cat];
    const p = trouver(cat, id);
    if (!p) return;
    const u = c.unite(p);
    const ov = fenetre(`
      <div class="modal-title">Retirer du stock</div>
      <p class="stock-texte">${esc(p.emoji || '')} <strong>${esc(p.name)}</strong> · en stock : ${esc(avecUnite(Number(p[c.champ]) || 0, u))}</p>
      <div class="mgroup"><label for="srQte">Quantité à retirer${u ? ` (${esc(u)})` : ''}</label>
        <input class="minput" id="srQte" type="text" inputmode="decimal" autocomplete="off" placeholder="${c.entier ? 'ex. 3' : 'ex. 2,5'}"></div>
      <div class="mgroup"><label for="srMotif">Motif</label>
        <select class="minput" id="srMotif">
          <option value="perte">Perte</option><option value="casse">Casse</option><option value="don">Don</option>
          <option value="degustation">Dégustation</option><option value="autre">Autre</option>
        </select></div>
      <div class="mgroup"><label for="srNote">Précision (facultatif)</label><input class="minput" id="srNote" maxlength="120"></div>
      <p class="stock-alerte" id="srMsg" role="alert"></p>
      <div class="mactions">
        <button type="button" class="mbtn mbtn-c" data-action="annuler">Annuler</button>
        <button type="button" class="mbtn mbtn-p" data-action="retirer">Retirer</button>
      </div>`);
    const msg = ov.querySelector('#srMsg');
    const bouton = ov.querySelector('[data-action=retirer]');
    let confirmeSousZero = false;
    ov.querySelector('#srQte').oninput = () => { confirmeSousZero = false; bouton.textContent = 'Retirer'; msg.textContent = ''; };
    ov.querySelector('[data-action=annuler]').onclick = fermer;
    bouton.onclick = () => {
      const brut = String(ov.querySelector('#srQte').value).replace(',', '.');
      const qte = Number(brut);
      if (!brut || !Number.isFinite(qte) || qte <= 0) {
        msg.textContent = 'Indique une quantité supérieure à 0.';
        ov.querySelector('#srQte').focus();
        return;
      }
      if (c.entier && !Number.isInteger(qte)) {
        msg.textContent = 'Indique un nombre entier de pièces.';
        return;
      }
      const actuel = Number(p[c.champ]) || 0;
      if (qte > actuel && !confirmeSousZero) {
        msg.textContent = `Il n'y a que ${avecUnite(actuel, u)} en stock : le stock passera à 0, pas en dessous. Appuie encore pour confirmer.`;
        bouton.textContent = 'Retirer quand même (stock à 0)';
        confirmeSousZero = true;
        return;
      }
      const retire = Math.min(qte, actuel);
      p[c.champ] = arrondi(Math.max(0, actuel - qte));
      const note = ov.querySelector('#srNote').value.trim();
      ajouterHisto(cat, { type: 'retrait', cat, pid: id, name: p.name, emoji: p.emoji || '📦', qty: arrondi(retire), demande: qte !== retire ? arrondi(qte) : undefined, motif: ov.querySelector('#srMotif').value, note: note || undefined, unit: u || undefined });
      c.enregistrer();
      fermer();
      c.majAffichage(p);
      majValeur(cat, id);
      toast(`− ${avecUnite(retire, u)} ${p.name} ✓`);
    };
  }

  function majValeur(cat, id) {
    const p = trouver(cat, id);
    const v = document.querySelector(`.stock-rapide[data-cat="${cat}"][data-id="${CSS.escape(id)}"] .stock-rapide-val`);
    if (p && v) v.textContent = avecUnite(Number(p[CATEGORIES[cat].champ]) || 0, CATEGORIES[cat].unite(p));
  }

  // Ajoute la rangée « − stock + · Retrait avec motif » sous chaque carte affichée.
  function ajouterBoutons(cat) {
    const c = CATEGORIES[cat];
    c.liste().forEach((p) => {
      const carte = document.getElementById(c.carte(p.id));
      if (!carte || carte.querySelector('.stock-rapide')) return;
      const r = document.createElement('div');
      r.className = 'stock-rapide';
      r.dataset.cat = cat;
      r.dataset.id = p.id;
      r.innerHTML = `
        <button type="button" class="stock-pas" data-sens="-1" aria-label="Retirer 1 ${c.entier ? 'pièce' : esc(c.unite(p) || 'unité')} de ${esc(p.name)}">−</button>
        <span class="stock-rapide-val" aria-live="polite"></span>
        <button type="button" class="stock-pas" data-sens="1" aria-label="Ajouter 1 ${c.entier ? 'pièce' : esc(c.unite(p) || 'unité')} à ${esc(p.name)}">+</button>
        <button type="button" class="stock-motif">Retrait avec motif</button>`;
      r.querySelectorAll('.stock-pas').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); ajuster(cat, p.id, Number(b.dataset.sens)); }; });
      r.querySelector('.stock-motif').onclick = (e) => { e.stopPropagation(); retirerAvecMotif(cat, p.id); };
      carte.appendChild(r);
      majValeur(cat, p.id);
    });
  }

  // ---------- branchement sur les fonctions d'affichage existantes ----------
  function apres(nom, fn) {
    const f = window[nom];
    if (typeof f !== 'function') return;
    window[nom] = function (...args) {
      const r = f.apply(this, args);
      try { fn(); } catch (e) { console.warn('stock.js', e); }
      return r;
    };
  }

  window.FournilStock = { remettreAZero, demanderRemiseAZero, ajuster, retirerAvecMotif, CATEGORIES };

  function demarrer() {
    apres('renderStock', () => ajouterBoutons('fournil'));
    apres('renderLaboStock', () => ajouterBoutons('labo'));
    apres('renderMatieres', () => ajouterBoutons('matieres'));
    apres('renderSettings', carteRemiseAZero);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})();
