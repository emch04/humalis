/**
 * Le petit programme qui part dans le navigateur : `humalis/moteur.js`.
 *
 * Il sait trois choses : des boîtes qui retiennent qui les lit, des liaisons
 * qui posent une valeur dans la page sans rien reconstruire autour, et la
 * reprise d'une page déjà écrite. Créer une ligne et reprendre une ligne
 * écrite passent par le même code : on repère les endroits à relier, dans
 * un gabarit cloné ou dans le HTML déjà affiché.
 *
 * Les repères écrits dans le HTML :
 *   data-h="3"     un élément à relier
 *   <!--[3-->      le début d'une condition, d'une liste ou d'une zone
 *   <!--[3:1-->    le début d'une condition déjà écrite, avec sa branche
 *   <!--]-->       la fin
 *   <!--,-->       le début d'une ligne de liste
 *   <!--#3-->      juste avant un texte qui change
 *   data-c="1"     l'emplacement d'une sous-couche : la couche du dessus n'y entre pas
 */
export const MOTEUR_JS = `// Produit par Humalis : le moteur de rendu, écrit en clair et sans bibliothèque.

let observateur = null;
let portee = null;
let rang = 0;
let prevu = false;
const file = new Set();

// ─── Les boîtes ─────────────────────────────────────────────────────────────

class Boite {
  constructor(valeur) {
    this.x = valeur;
    this.o = new Set();
  }
  get v() {
    suivre(this);
    return this.x;
  }
  set v(valeur) {
    if (Object.is(valeur, this.x)) return;
    this.x = valeur;
    prevenir(this);
  }
}

function suivre(source) {
  if (observateur && !observateur.d.has(source)) {
    observateur.d.add(source);
    source.o.add(observateur);
  }
}

function prevenir(source) {
  for (const n of source.o) marquer(n);
}

function marquer(n) {
  if (n.sale) return;
  n.sale = true;
  if (n.o) return prevenir(n);
  file.add(n);
  if (!prevu) {
    prevu = true;
    queueMicrotask(appliquer);
  }
}

function noeud(f, o) {
  const n = { f, o, d: new Set(), sale: false, x: undefined, n: ++rang, e: null, c: null, p: portee, mort: false };
  if (portee) (portee.e ??= new Set()).add(n);
  return n;
}

function delier(n) {
  for (const s of n.d) s.o.delete(n);
  n.d.clear();
}

function viderNoeud(n) {
  if (n.e) {
    for (const e of n.e) fermer(e);
    n.e = null;
  }
  if (n.c) {
    for (const f of n.c) {
      try {
        f();
      } catch (erreur) {
        console.error(erreur);
      }
    }
    n.c = null;
  }
}

function fermer(n) {
  if (n.mort) return;
  n.mort = true;
  file.delete(n);
  viderNoeud(n);
  delier(n);
  n.p?.e?.delete(n);
}

function tourner(n) {
  const avant = [observateur, portee];
  observateur = n;
  portee = n;
  viderNoeud(n);
  delier(n);
  n.sale = false;
  try {
    n.x = n.f();
  } catch (erreur) {
    console.error(erreur);
  } finally {
    [observateur, portee] = avant;
  }
}

/** Une variable : on la lit et on l'écrit par .v. */
export function signal(valeur) {
  return new Boite(valeur);
}

/** Une valeur recalculée seulement quand ce qu'elle lit a changé. */
export function calcul(f) {
  const n = noeud(f, new Set());
  n.sale = true;
  return () => {
    if (n.sale && !n.mort) tourner(n);
    suivre(n);
    return n.x;
  };
}

/** Une valeur qu'on lit par .v, comme une variable, mais qui se calcule à chaque lecture. */
export function lecture(f) {
  return {
    get v() {
      return f();
    },
  };
}

/** Lance f tout de suite, puis chaque fois que ce qu'elle a lu change. */
export function effet(f) {
  const n = noeud(f, null);
  tourner(n);
  return () => fermer(n);
}

/** Une portée à part : ce qui y est créé s'arrête d'un coup. */
function sous(proprietaire, f) {
  const avant = [observateur, portee];
  observateur = null;
  portee = proprietaire;
  const n = noeud(null, null);
  portee = n;
  try {
    f();
  } catch (erreur) {
    console.error(erreur);
  } finally {
    [observateur, portee] = avant;
  }
  return n;
}

export function racine(f) {
  const n = sous(null, f);
  return () => fermer(n);
}

/** Ce qu'il faut faire quand la portée s'arrête. */
export function nettoyer(f) {
  if (portee) (portee.c ??= []).push(f);
}

/** Applique tout de suite les changements en attente. */
export function appliquer() {
  prevu = false;
  for (let tours = 0; file.size > 0; tours++) {
    if (tours > 100) {
      console.error('Humalis : des variables se modifient sans fin ; arrêt de la mise à jour.');
      file.clear();
      break;
    }
    const liste = [...file].sort((a, b) => a.n - b.n);
    file.clear();
    for (const n of liste) if (!n.mort && n.sale) tourner(n);
  }
}

/** Lit sans s'abonner. */
export function sansSuivi(f) {
  const avant = observateur;
  observateur = null;
  try {
    return f();
  } finally {
    observateur = avant;
  }
}

/** Un événement : une erreur est écrite dans la console, jamais perdue. */
export async function executer(f, valeur) {
  try {
    return await f(valeur);
  } catch (erreur) {
    console.error(erreur);
  }
}

// ─── Les repères ────────────────────────────────────────────────────────────

/** Range dans r les éléments et les emplacements de ce niveau, sans entrer dans les blocs ni les sous-couches. */
export function parcourir(n, fin, r) {
  let profondeur = 0;
  for (; n && n !== fin; n = n.nextSibling) {
    if (n.nodeType === 8) {
      const c = n.data[0];
      if (c === '[') {
        if (profondeur === 0) r[parseInt(n.data.slice(1), 10)] = n;
        profondeur++;
      } else if (c === ']') profondeur--;
      else if (c === '#' && profondeur === 0) r[parseInt(n.data.slice(1), 10)] = n;
    } else if (n.nodeType === 1 && profondeur === 0) {
      const h = n.getAttribute('data-h');
      if (h !== null) r[parseInt(h, 10)] = n;
      if (n.firstChild && n.getAttribute('data-c') === null) parcourir(n.firstChild, null, r);
    }
  }
  return r;
}

function finDe(debut) {
  let profondeur = 0;
  for (let n = debut.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType !== 8) continue;
    if (n.data[0] === '[') profondeur++;
    else if (n.data[0] === ']') {
      if (profondeur === 0) return n;
      profondeur--;
    }
  }
  throw new Error('Humalis : un repère de fin manque dans la page.');
}

function effacer(debut, fin) {
  while (debut.nextSibling !== fin) debut.nextSibling.remove();
}

/** Un morceau de page prêt à être cloné. */
export function gabarit(html) {
  let modele;
  return () => {
    if (!modele) {
      modele = document.createElement('template');
      modele.innerHTML = html;
    }
    return modele.content.cloneNode(true);
  };
}

function ouvrir(proprietaire, g, lier, fin, ...valeurs) {
  const fragment = g();
  const r = parcourir(fragment.firstChild, null, []);
  const p = sous(proprietaire, () => lier(r, ...valeurs));
  fin.parentNode.insertBefore(fragment, fin);
  return p;
}

// ─── Les liaisons ───────────────────────────────────────────────────────────

/** Un texte qui change : le seul contenu d'un élément, ou juste après un repère. */
export function texte(n, f) {
  let t;
  if (n.nodeType === 1) {
    t = n.firstChild;
    if (!t || t.nodeType !== 3) t = n.insertBefore(document.createTextNode(''), t);
  } else {
    t = n.nextSibling;
    if (!t || t.nodeType !== 3) t = n.parentNode.insertBefore(document.createTextNode(''), t);
  }
  effet(() => {
    const v = f();
    const lu = v === null || v === undefined ? '' : String(v);
    if (t.data !== lu) t.data = lu;
  });
}

function poser(el, nom, v) {
  if (nom === 'value' || nom === 'checked' || nom === 'selected') {
    const voulu = nom === 'value' ? (v === null || v === undefined ? '' : String(v)) : Boolean(v);
    if (el[nom] !== voulu) el[nom] = voulu;
    if (nom !== 'value' || el.tagName === 'OPTION') {
      if (voulu === false) el.removeAttribute(nom);
    }
    return;
  }
  if (v === false || v === null || v === undefined) {
    if (el.hasAttribute(nom)) el.removeAttribute(nom);
    return;
  }
  const lu = String(v);
  if (el.getAttribute(nom) !== lu) el.setAttribute(nom, lu);
}

export function attribut(el, nom, f) {
  effet(() => poser(el, nom, f()));
}

export function ecouter(el, nom, f) {
  el.addEventListener(nom, (evenement) => executer(f, evenement));
}

export function soumettre(el, f) {
  el.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    executer(f);
  });
}

/** « arrete d'ecrire dans » : quand rien n'a été tapé pendant la pause ; la touche Entrée n'attend pas. */
export function ecouterLaPause(el, { faire, millisecondes }) {
  let attente;
  el.addEventListener('input', () => {
    clearTimeout(attente);
    attente = setTimeout(() => executer(faire), millisecondes);
  });
  el.addEventListener('keydown', (evenement) => {
    if (evenement.key !== 'Enter') return;
    clearTimeout(attente);
    executer(faire);
  });
  nettoyer(() => clearTimeout(attente));
}

/**
 * Un champ relié à sa variable. Ce qui a été tapé avant la reprise de la page
 * (ou remis par le navigateur) n'est pas perdu.
 */
export function modele(el, boite, propriete = 'value') {
  const deja = el[propriete];
  if (deja && deja !== boite.x) boite.v = deja;
  el.addEventListener('input', () => {
    boite.v = el[propriete];
  });
  effet(() => {
    const v = boite.v;
    if (el[propriete] !== v) el[propriete] = v;
  });
}

/** Une condition : test rend le numéro de la branche à montrer, ou -1. blocs : [gabarit, liaisons]. */
export function si(debut, test, blocs) {
  const fin = finDe(debut);
  const proprietaire = portee;
  const deuxPoints = debut.data.indexOf(':');
  const ecrite = deuxPoints === -1 ? -1 : parseInt(debut.data.slice(deuxPoints + 1), 10);
  let actuelle = ecrite;
  let p = null;
  let premiere = true;
  effet(() => {
    const voulue = test();
    if (premiere && voulue === ecrite && ecrite >= 0) {
      premiere = false;
      const r = parcourir(debut.nextSibling, fin, []);
      p = sous(proprietaire, () => blocs[ecrite][1](r));
      return;
    }
    premiere = false;
    if (voulue === actuelle) return;
    actuelle = voulue;
    if (p) fermer(p);
    p = null;
    effacer(debut, fin);
    if (voulue >= 0) p = ouvrir(proprietaire, blocs[voulue][0], blocs[voulue][1], fin);
  });
}

const numerosObjets = new WeakMap();
let dernierObjet = 0;

/** L'identité d'une ligne : l'id de la fiche, sinon la fiche, sinon la valeur et son rang. */
function clefs(valeurs) {
  const vues = new Map();
  return valeurs.map((v) => {
    let c;
    if (v !== null && typeof v === 'object') {
      if (v.id !== undefined && v.id !== null) c = 'i' + typeof v.id + ':' + v.id;
      else {
        if (!numerosObjets.has(v)) numerosObjets.set(v, ++dernierObjet);
        c = 'o' + numerosObjets.get(v);
      }
    } else c = 'p' + typeof v + ':' + v;
    const n = vues.get(c) ?? 0;
    vues.set(c, n + 1);
    return n === 0 ? c : c + '#' + n;
  });
}

/** Les positions de la plus longue suite croissante : ces lignes-là ne bougent pas. */
function suiteCroissante(a) {
  const precedent = a.slice();
  const fins = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] < 0) continue;
    let bas = 0;
    let haut = fins.length;
    while (bas < haut) {
      const milieu = (bas + haut) >> 1;
      if (a[fins[milieu]] < a[i]) bas = milieu + 1;
      else haut = milieu;
    }
    precedent[i] = bas > 0 ? fins[bas - 1] : -1;
    fins[bas] = i;
  }
  const garde = new Set();
  for (let k = fins.length ? fins[fins.length - 1] : -1; k >= 0; k = precedent[k]) garde.add(k);
  return garde;
}

function noeudsDe(debut, fin) {
  const liste = [];
  for (let n = debut; n !== fin; n = n.nextSibling) liste.push(n);
  return liste;
}

function placer(parent, n, avant) {
  if (parent.moveBefore && n.isConnected && parent.isConnected) {
    try {
      parent.moveBefore(n, avant);
      return;
    } catch {
      // Le navigateur refuse ce déplacement : on passe par insertBefore.
    }
  }
  parent.insertBefore(n, avant);
}

/** Une liste : seules les lignes ajoutées, retirées ou déplacées touchent la page. */
export function chaque(debut, liste, g, lier) {
  const fin = finDe(debut);
  const proprietaire = portee;
  let lignes = [];
  let premiere = true;

  function creerLigne(cle, valeur, avant) {
    const boite = signal(valeur);
    const marque = document.createComment(',');
    avant.parentNode.insertBefore(marque, avant);
    const l = { k: cle, s: boite, d: marque, p: null };
    l.p = ouvrir(proprietaire, g, lier, avant, boite);
    return l;
  }

  function reprendre(valeurs, cles) {
    const marques = [];
    let profondeur = 0;
    for (let n = debut.nextSibling; n !== fin; n = n.nextSibling) {
      if (n.nodeType !== 8) continue;
      if (n.data[0] === '[') profondeur++;
      else if (n.data[0] === ']') profondeur--;
      else if (n.data === ',' && profondeur === 0) marques.push(n);
    }
    const nouvelles = [];
    for (let i = 0; i < marques.length && i < valeurs.length; i++) {
      const boite = signal(valeurs[i]);
      const suivante = marques[i + 1] ?? fin;
      const r = parcourir(marques[i].nextSibling, suivante, []);
      nouvelles.push({ k: cles[i], s: boite, d: marques[i], p: sous(proprietaire, () => lier(r, boite)) });
    }
    // Le HTML écrit à l'avance n'a pas le même nombre de lignes : on corrige seulement ce qui dépasse.
    if (marques.length > valeurs.length) {
      const depart = marques[valeurs.length];
      while (depart.nextSibling !== fin) depart.nextSibling.remove();
      depart.remove();
    }
    for (let i = marques.length; i < valeurs.length; i++) nouvelles.push(creerLigne(cles[i], valeurs[i], fin));
    lignes = nouvelles;
  }

  function accorder(valeurs, cles) {
    const parCle = new Map(lignes.map((l) => [l.k, l]));
    const gardees = new Set();
    const anciens = new Map(lignes.map((l, i) => [l, i]));
    const suite = cles.map((cle, i) => {
      const l = parCle.get(cle);
      if (l) {
        gardees.add(l);
        return l;
      }
      return { k: cle, nouvelle: valeurs[i] };
    });
    const actif = document.activeElement;

    // Retirer d'abord : chaque ligne s'arrête à la marque de la suivante, retirée ou non.
    lignes.forEach((l, i) => {
      l.f = lignes[i + 1]?.d ?? fin;
    });
    for (const l of lignes) {
      if (gardees.has(l)) continue;
      fermer(l.p);
      for (const n of noeudsDe(l.d, l.f)) n.remove();
    }
    const restantes = lignes.filter((l) => gardees.has(l));
    restantes.forEach((l, i) => {
      l.f = restantes[i + 1]?.d ?? fin;
    });

    const fixes = suiteCroissante(suite.map((l) => (l.nouvelle === undefined && gardees.has(l) ? anciens.get(l) : -1)));
    const aDeplacer = new Map();
    suite.forEach((l, i) => {
      if (gardees.has(l) && !fixes.has(i)) aDeplacer.set(l, noeudsDe(l.d, l.f));
    });

    const parent = fin.parentNode;
    let avant = fin;
    for (let i = suite.length - 1; i >= 0; i--) {
      let l = suite[i];
      if (gardees.has(l)) {
        l.s.v = valeurs[i];
        const noeuds = aDeplacer.get(l);
        if (noeuds) for (const n of noeuds) placer(parent, n, avant);
      } else {
        l = creerLigne(l.k, valeurs[i], avant);
        suite[i] = l;
      }
      avant = l.d;
    }
    lignes = suite;
    if (actif && actif !== document.activeElement && actif.isConnected) actif.focus({ preventScroll: true });
  }

  effet(() => {
    const lu = liste();
    const valeurs = Array.isArray(lu) ? lu : [];
    sansSuivi(() => {
      const cles = clefs(valeurs);
      if (premiere) {
        premiere = false;
        reprendre(valeurs, cles);
      } else accorder(valeurs, cles);
    });
  });
}

/** Une zone dessinée d'un bloc : une carte, un graphique, un code QR. Seules ses propres lectures la refont. */
export function zone(debut, f) {
  const fin = finDe(debut);
  effet(() => {
    const noeuds = f();
    effacer(debut, fin);
    for (const n of noeuds) fin.parentNode.insertBefore(n instanceof Node ? n : document.createTextNode(String(n)), fin);
  });
}

/** Le contenu d'un élément, refait d'un bloc : un texte avec accents dans plusieurs langues. */
export function contenu(el, f) {
  effet(() => el.replaceChildren(...f()));
}
`;
