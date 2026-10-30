/**
 * La géométrie des graphiques : une seule fonction, `calculerGraphique`, écrite une fois en
 * JavaScript lisible, et reprise telle quelle par chaque cible :
 *
 * - le web, le desktop et le mobile la reçoivent dans
 *   `graphique-geometrie.js` (avec ses types, `graphique-geometrie.d.ts`) ;
 * - le site statique la reçoit dans `humalis/graphique.js`, avec
 *   `htmlDuGraphique`, qui écrit le HTML d'un graphique ;
 * - le compilateur l'exécute lui-même (ce module) pour écrire le HTML de
 *   départ du site statique : le même texte que celui du script.
 *
 * Aucune bibliothèque, aucune mesure à l'exécution : le dessin a une
 * largeur fixe (640 unités, ou 400 pour la version étroite), étiré à la
 * largeur de son conteneur. Les mêmes données donnent les mêmes formes, au
 * prérendu comme dans le navigateur.
 */

/**
 * Le code de la géométrie, en JavaScript (ES2019), sans import ni accent
 * grave : il est recopié tel quel dans les projets produits.
 */
export const GEOMETRIE_JS = String.raw`/**
 * La géométrie d'un graphique, écrite par Humalis sans bibliothèque : à partir
 * de la liste et du réglage du graphique, les formes à dessiner, la légende et
 * la table de données. Une fonction pure : les mêmes données donnent les mêmes
 * formes, au prérendu comme dans le navigateur.
 */

/** Les couleurs des séries, dans l'ordre, quand le programme n'en choisit pas. */
const PALETTE_GRAPHIQUE = ['bleu', 'orange', 'vert', 'violet', 'rose', 'gris'];
/** La forme du repère de chaque série : la couleur n'est jamais seule à distinguer les séries. */
const REPERES_GRAPHIQUE = ['rond', 'carre', 'triangle', 'losange'];
/** La taille du texte, en unités du dessin. */
const TAILLE_TEXTE = 14;
/** La largeur moyenne d'un caractère, en unités du dessin : une estimation fixe, jamais une mesure. */
const LARGEUR_CARACTERE = TAILLE_TEXTE * 0.62;

/** Deux décimales : le même texte partout. */
function arrondir(n) {
  return Math.round(n * 100) / 100;
}

/** Des graduations « jolies » (1, 2 ou 5 fois une puissance de 10, environ cinq) de min à max, avec min ≤ 0 ≤ max. */
function graduations(min, max) {
  if (max === min) max = min + 1;
  const brut = (max - min) / 5;
  const puissance = Math.pow(10, Math.floor(Math.log10(brut)));
  const rapport = brut / puissance;
  const pas = (rapport <= 1 ? 1 : rapport <= 2 ? 2 : rapport <= 5 ? 5 : 10) * puissance;
  const valeurs = [];
  for (let i = Math.floor(min / pas + 1e-9); i <= Math.ceil(max / pas - 1e-9); i++) valeurs.push(Number((i * pas).toPrecision(12)));
  return valeurs;
}

/** Le nombre d'une ligne : la ligne elle-même (liste de nombres) ou l'un de ses champs ; null s'il manque. */
function nombreDe(ligne, champ) {
  const valeur = champ === undefined ? ligne : ligne !== null && typeof ligne === 'object' ? ligne[champ] : undefined;
  return typeof valeur === 'number' && isFinite(valeur) ? valeur : null;
}

/** Le libellé d'une ligne : son champ « etiquette », ou la valeur de « etiquettes », sinon son numéro. */
function libelleDe(config, ligne, i) {
  let valeur;
  if (config.etiquettes) valeur = config.etiquettes[i];
  else if (config.etiquette !== undefined && ligne !== null && typeof ligne === 'object') valeur = ligne[config.etiquette];
  if (typeof valeur === 'number') return valeur.toLocaleString('fr-FR');
  if (typeof valeur === 'string' && valeur !== '') return valeur;
  return String(i + 1);
}

function raccourcir(texte, maximum) {
  return texte.length > maximum ? texte.slice(0, maximum - 1) + '…' : texte;
}

function pourcentage(part) {
  return part.toLocaleString('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
}

function plusLong(textes) {
  let n = 0;
  for (const texte of textes) n = Math.max(n, texte.length);
  return n;
}

/** Le repère d'une série, centré en (x, y) : rond, carré, triangle ou losange. */
function repere(forme, x, y, couleur, titre) {
  if (forme === 'rond') return { type: 'cercle', x: arrondir(x), y: arrondir(y), r: 4.5, couleur, role: 'repere', titre };
  if (forme === 'carre') return { type: 'rect', x: arrondir(x - 4), y: arrondir(y - 4), largeur: 8, hauteur: 8, couleur, role: 'repere', titre };
  const p = (dx, dy) => arrondir(x + dx) + ' ' + arrondir(y + dy);
  const d = forme === 'triangle'
    ? 'M ' + p(0, -5.5) + ' L ' + p(5.5, 4.5) + ' L ' + p(-5.5, 4.5) + ' Z'
    : 'M ' + p(0, -5.5) + ' L ' + p(5.5, 0) + ' L ' + p(0, 5.5) + ' L ' + p(-5.5, 0) + ' Z';
  return { type: 'chemin', d, couleur, role: 'repere', titre };
}

/**
 * Les formes d'un graphique, dans un dessin de « largeur » unités (640, ou
 * 400 pour les écrans étroits). « formater » écrit une valeur (« 120 000 FC »).
 */
function calculerGraphique(config, lignes, formater, largeur) {
  const liste = Array.isArray(lignes) ? lignes : [];
  const proportions = config.proportions || (largeur >= 640 ? [16, 9] : [4, 3]);
  const hauteur = Math.round((largeur * proportions[1]) / proportions[0]);
  const series = config.series.map((s, i) => ({
    nom: s.nom,
    valeur: s.valeur,
    couleur: s.couleur || PALETTE_GRAPHIQUE[i % PALETTE_GRAPHIQUE.length],
    repere: REPERES_GRAPHIQUE[i % REPERES_GRAPHIQUE.length],
  }));
  const libelles = liste.map((ligne, i) => libelleDe(config, ligne, i));
  const valeurs = series.map((s) => liste.map((ligne) => nombreDe(ligne, s.valeur)));
  const resultat = { largeur, hauteur, taille: TAILLE_TEXTE, vide: false, formes: [], legende: [], table: { entetes: [], lignes: [] } };
  const nomEtiquettes = config.nomEtiquettes || 'Libellé';
  if (config.genre === 'camembert') return camembert(resultat, series[0], libelles, valeurs[0] || [], formater, nomEtiquettes);

  resultat.table.entetes = [nomEtiquettes].concat(series.map((s) => s.nom));
  resultat.table.lignes = libelles.map((libelle, i) => [libelle].concat(valeurs.map((v) => (v[i] === null ? '—' : formater(v[i])))));
  let minimum = 0;
  let maximum = 0;
  let utiles = 0;
  for (const serie of valeurs) {
    for (const v of serie) {
      if (v === null) continue;
      minimum = Math.min(minimum, v);
      maximum = Math.max(maximum, v);
      if (v !== 0) utiles++;
    }
  }
  if (utiles === 0) {
    resultat.vide = true;
    return resultat;
  }
  if (series.length > 1) resultat.legende = series.map((s) => ({ nom: s.nom, couleur: s.couleur, repere: s.repere }));

  // Les axes : l'axe des valeurs commence à zéro, jamais tronqué.
  const echelle = graduations(minimum, maximum);
  const textes = echelle.map((v) => formater(v));
  const gauche = plusLong(textes) * LARGEUR_CARACTERE + 14;
  const droite = largeur - 12;
  const haut = 12;
  const bas = hauteur - TAILLE_TEXTE - 16;
  const premiere = echelle[0];
  const derniere = echelle[echelle.length - 1];
  const y = (v) => bas - ((v - premiere) / (derniere - premiere)) * (bas - haut);
  const formes = resultat.formes;
  echelle.forEach((v, i) => {
    formes.push({ type: 'ligne', x1: arrondir(gauche), y1: arrondir(y(v)), x2: arrondir(droite), y2: arrondir(y(v)), role: 'grille' });
    formes.push({ type: 'texte', x: arrondir(gauche - 8), y: arrondir(y(v) + TAILLE_TEXTE * 0.35), texte: textes[i], ancre: 'end', role: 'graduation' });
  });
  formes.push({ type: 'ligne', x1: arrondir(gauche), y1: arrondir(y(0)), x2: arrondir(droite), y2: arrondir(y(0)), role: 'axe' });

  // Les libellés : on en saute selon une règle fixe (la place estimée), jamais selon une mesure.
  const bande = (droite - gauche) / liste.length;
  const x = (i) => gauche + (i + 0.5) * bande;
  const saut = Math.max(1, Math.ceil((Math.min(14, plusLong(libelles)) * LARGEUR_CARACTERE + 10) / bande));
  libelles.forEach((libelle, i) => {
    if (i % saut === 0) formes.push({ type: 'texte', x: arrondir(x(i)), y: hauteur - 8, texte: raccourcir(libelle, 14), ancre: 'middle', role: 'etiquette' });
  });
  const titre = (s, i, v) => (series.length > 1 ? s.nom + ', ' : '') + libelles[i] + ' : ' + formater(v);

  if (config.genre === 'barres') {
    const groupe = bande * 0.7;
    const barre = groupe / series.length;
    const ecart = series.length > 1 ? Math.min(2, barre * 0.1) : 0;
    series.forEach((s, k) => {
      valeurs[k].forEach((v, i) => {
        if (v === null) return;
        const debut = gauche + i * bande + (bande - groupe) / 2 + k * barre;
        const dessus = Math.min(y(v), y(0));
        formes.push({ type: 'rect', x: arrondir(debut + ecart / 2), y: arrondir(dessus), largeur: arrondir(barre - ecart), hauteur: arrondir(Math.abs(y(v) - y(0))), couleur: s.couleur, role: 'barre', titre: titre(s, i, v) });
        if (series.length > 1) formes.push(repere(s.repere, debut + barre / 2, dessus - 9, s.couleur, titre(s, i, v)));
      });
    });
    return resultat;
  }

  // La courbe : un trait par suite de valeurs présentes, et un repère par point.
  series.forEach((s, k) => {
    const morceaux = [[]];
    valeurs[k].forEach((v, i) => {
      if (v === null) morceaux.push([]);
      else morceaux[morceaux.length - 1].push(arrondir(x(i)) + ' ' + arrondir(y(v)));
    });
    for (const points of morceaux) {
      if (points.length > 1) formes.push({ type: 'chemin', d: 'M ' + points.join(' L '), couleur: s.couleur, role: 'courbe' });
    }
    valeurs[k].forEach((v, i) => {
      if (v !== null) formes.push(repere(s.repere, x(i), y(v), s.couleur, titre(s, i, v)));
    });
  });
  return resultat;
}

/** Le camembert : une part par valeur positive, depuis le haut, dans le sens des aiguilles d'une montre. */
function camembert(resultat, serie, libelles, valeurs, formater, nomEtiquettes) {
  let total = 0;
  for (const v of valeurs) if (v !== null && v > 0) total += v;
  resultat.table.entetes = [nomEtiquettes, serie.nom, 'Part'];
  resultat.table.lignes = libelles.map((libelle, i) => {
    const v = valeurs[i];
    return [libelle, v === null ? '—' : formater(v), v !== null && v > 0 ? pourcentage(v / total) : '—'];
  });
  if (total <= 0) {
    resultat.vide = true;
    return resultat;
  }
  const largeur = resultat.largeur;
  const hauteur = resultat.hauteur;
  const cx = largeur / 2;
  const cy = hauteur / 2;
  // La place des libellés (« Transport 5 % »), à gauche et à droite du disque : une estimation
  // plus serrée que celle des axes (un libellé de part n'est jamais aligné avec un autre).
  const libellesParts = libelles.map((libelle, i) => raccourcir(libelle, 12) + ' ' + (valeurs[i] !== null && valeurs[i] > 0 ? pourcentage(valeurs[i] / total) : ''));
  const place = plusLong(libellesParts) * TAILLE_TEXTE * 0.5 + 14;
  const r = arrondir(Math.max(30, Math.min(hauteur / 2 - TAILLE_TEXTE - 6, largeur / 2 - place)));
  const point = (angle, rayon) => arrondir(cx + rayon * Math.cos(angle)) + ' ' + arrondir(cy + rayon * Math.sin(angle));
  let angle = -Math.PI / 2;
  let rang = 0;
  valeurs.forEach((v, i) => {
    if (v === null || v <= 0) return;
    const couleur = PALETTE_GRAPHIQUE[rang % PALETTE_GRAPHIQUE.length];
    rang++;
    const fin = angle + (v / total) * 2 * Math.PI;
    const part = pourcentage(v / total);
    const d = v === total
      ? 'M ' + point(-Math.PI / 2, r) + ' A ' + r + ' ' + r + ' 0 1 1 ' + point(Math.PI / 2, r) + ' A ' + r + ' ' + r + ' 0 1 1 ' + point(-Math.PI / 2, r) + ' Z'
      : 'M ' + arrondir(cx) + ' ' + arrondir(cy) + ' L ' + point(angle, r) + ' A ' + r + ' ' + r + ' 0 ' + (fin - angle > Math.PI ? 1 : 0) + ' 1 ' + point(fin, r) + ' Z';
    resultat.formes.push({ type: 'chemin', d, couleur, role: 'part', titre: libelles[i] + ' : ' + formater(v) + ' (' + part + ')' });
    const milieu = (angle + fin) / 2;
    resultat.formes.push({
      type: 'texte',
      x: arrondir(cx + (r + 10) * Math.cos(milieu)),
      y: arrondir(cy + (r + 10) * Math.sin(milieu) + TAILLE_TEXTE * 0.35),
      texte: raccourcir(libelles[i], 12) + ' ' + part,
      ancre: Math.cos(milieu) >= -1e-9 ? 'start' : 'end',
      role: 'part',
    });
    resultat.legende.push({ nom: libelles[i], couleur, repere: 'carre' });
    angle = fin;
  });
  return resultat;
}
`;

/**
 * L'écriture d'un graphique en HTML, pour le site statique : la même
 * fonction écrit le HTML de départ (à la compilation) et celui que le script
 * redessine. Tout texte venu du programme ou des données est échappé.
 */
export const HTML_GRAPHIQUE_JS = String.raw`/** Un texte du programme ou des données, sans danger dans le HTML. */
function echapperGraphique(texte) {
  return String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Une forme, en balise SVG : sa classe dit son rôle et sa couleur (le CSS les colore, en clair et en sombre). */
function formeHtml(f) {
  const classe = ' class="humalis-graphique-' + f.role + (f.couleur ? ' humalis-graphique-c-' + f.couleur : '') + '"';
  const titre = f.titre ? '<title>' + echapperGraphique(f.titre) + '</title>' : '';
  if (f.type === 'ligne') return '<line' + classe + ' x1="' + f.x1 + '" y1="' + f.y1 + '" x2="' + f.x2 + '" y2="' + f.y2 + '"></line>';
  if (f.type === 'texte') return '<text' + classe + ' x="' + f.x + '" y="' + f.y + '" text-anchor="' + f.ancre + '">' + echapperGraphique(f.texte) + '</text>';
  if (f.type === 'rect') return '<rect' + classe + ' x="' + f.x + '" y="' + f.y + '" width="' + f.largeur + '" height="' + f.hauteur + '">' + titre + '</rect>';
  if (f.type === 'cercle') return '<circle' + classe + ' cx="' + f.x + '" cy="' + f.y + '" r="' + f.r + '">' + titre + '</circle>';
  return '<path' + classe + ' d="' + f.d + '">' + titre + '</path>';
}

/** Un dessin (large ou étroit) : son nom et sa description sont lus par les lecteurs d'écran. */
function dessinHtml(config, g, suffixe, classe) {
  const id = echapperGraphique(config.id + '-' + suffixe);
  return '<svg class="' + classe + '" viewBox="0 0 ' + g.largeur + ' ' + g.hauteur + '" font-size="' + g.taille + '" role="img" aria-labelledby="' + id + '-nom ' + id + '-desc">' +
    '<title id="' + id + '-nom">' + echapperGraphique(config.titre) + '</title><desc id="' + id + '-desc">' + echapperGraphique(config.description) + '</desc>' +
    g.formes.map(formeHtml).join('') + '</svg>';
}

function legendeHtml(legende) {
  if (legende.length === 0) return '';
  const elements = legende.map((l) => '<li><svg viewBox="0 0 12 12" aria-hidden="true">' + formeHtml(repere(l.repere, 6, 6, l.couleur)) + '</svg>' + echapperGraphique(l.nom) + '</li>');
  return '<figcaption class="humalis-graphique-legende"><ul>' + elements.join('') + '</ul></figcaption>';
}

/** La table de données : l'alternative au dessin, toujours écrite, dépliable au clavier. */
function tableHtml(table) {
  const entetes = table.entetes.map((e) => '<th scope="col">' + echapperGraphique(e) + '</th>').join('');
  const lignes = table.lignes.map((l) => '<tr><th scope="row">' + echapperGraphique(l[0]) + '</th>' + l.slice(1).map((c) => '<td>' + echapperGraphique(c) + '</td>').join('') + '</tr>').join('');
  return '<details class="humalis-graphique-donnees"><summary>Voir les données</summary><table><caption>Les données du graphique</caption><thead><tr>' + entetes + '</tr></thead><tbody>' + lignes + '</tbody></table></details>';
}

/** Le HTML complet d'un graphique : la figure, ses deux dessins, sa légende et sa table. */
function htmlDuGraphique(config, lignes, formater) {
  const ouverture = '<figure class="humalis-graphique' + (config.classes ? ' ' + echapperGraphique(config.classes) : '') + '" data-humalis="' + echapperGraphique(config.id) + '">';
  const large = calculerGraphique(config, lignes, formater, 640);
  if (large.vide) return ouverture + '<p class="humalis-graphique-vide" role="status">Aucune donnée à afficher.</p></figure>';
  const etroit = calculerGraphique(config, lignes, formater, 400);
  return ouverture + dessinHtml(config, large, 'l', 'humalis-graphique-large') + dessinHtml(config, etroit, 'e', 'humalis-graphique-etroit') + legendeHtml(large.legende) + tableHtml(large.table) + '</figure>';
}
`;

/** Les types de `graphique-geometrie.js`, pour le web, le desktop et le mobile (TypeScript). */
export const DECLARATIONS_GEOMETRIE = `// Produit par Humalis : les types de graphique-geometrie.js.

export type Role = 'axe' | 'grille' | 'graduation' | 'etiquette' | 'courbe' | 'barre' | 'repere' | 'part';

export type Forme =
  | { type: 'ligne'; x1: number; y1: number; x2: number; y2: number; role: Role; couleur?: undefined; titre?: undefined }
  | { type: 'texte'; x: number; y: number; texte: string; ancre: 'start' | 'middle' | 'end'; role: Role; couleur?: undefined; titre?: undefined }
  | { type: 'rect'; x: number; y: number; largeur: number; hauteur: number; couleur: string; role: Role; titre?: string }
  | { type: 'cercle'; x: number; y: number; r: number; couleur: string; role: Role; titre?: string }
  | { type: 'chemin'; d: string; couleur: string; role: Role; titre?: string };

export interface ConfigGraphique {
  genre: 'courbe' | 'barres' | 'camembert';
  /** Le champ des libellés, dans une liste de fiches ou de données. */
  etiquette?: string;
  /** Les libellés d'une liste de nombres. */
  etiquettes?: readonly unknown[];
  /** L'en-tête de la colonne des libellés, dans la table de données. */
  nomEtiquettes?: string;
  series: readonly { nom: string; valeur?: string; couleur?: string }[];
  proportions?: readonly [number, number];
}

export interface Graphe {
  largeur: number;
  hauteur: number;
  taille: number;
  /** Rien à dessiner : la liste est vide, ou ses valeurs manquent ou valent zéro. */
  vide: boolean;
  formes: Forme[];
  legende: { nom: string; couleur: string; repere: 'rond' | 'carre' | 'triangle' | 'losange' }[];
  table: { entetes: string[]; lignes: string[][] };
}

export const PALETTE_GRAPHIQUE: readonly string[];

export function calculerGraphique(config: ConfigGraphique, lignes: readonly unknown[] | null | undefined, formater: (valeur: number) => string, largeur: number): Graphe;

export function repere(forme: string, x: number, y: number, couleur: string, titre?: string): Forme;
`;

// ─── Les mêmes types, pour le compilateur ───────────────────────────────

export type Role = 'axe' | 'grille' | 'graduation' | 'etiquette' | 'courbe' | 'barre' | 'repere' | 'part';
export type Forme =
  | { type: 'ligne'; x1: number; y1: number; x2: number; y2: number; role: Role }
  | { type: 'texte'; x: number; y: number; texte: string; ancre: 'start' | 'middle' | 'end'; role: Role }
  | { type: 'rect'; x: number; y: number; largeur: number; hauteur: number; couleur: string; role: Role; titre?: string }
  | { type: 'cercle'; x: number; y: number; r: number; couleur: string; role: Role; titre?: string }
  | { type: 'chemin'; d: string; couleur: string; role: Role; titre?: string };

export interface ConfigGraphique {
  genre: 'courbe' | 'barres' | 'camembert';
  etiquette?: string;
  etiquettes?: readonly unknown[];
  nomEtiquettes?: string;
  series: readonly { nom: string; valeur?: string; couleur?: string }[];
  proportions?: readonly [number, number];
}

/** Ce que `htmlDuGraphique` demande en plus : l'identifiant, le nom, la description, les classes. */
export interface ConfigHtml extends ConfigGraphique {
  id: string;
  titre: string;
  description: string;
  classes?: string;
}

export interface Graphe {
  largeur: number;
  hauteur: number;
  taille: number;
  vide: boolean;
  formes: Forme[];
  legende: { nom: string; couleur: string; repere: 'rond' | 'carre' | 'triangle' | 'losange' }[];
  table: { entetes: string[]; lignes: string[][] };
}

type Formater = (valeur: number) => string;

const moteur = new Function(`${GEOMETRIE_JS}\n${HTML_GRAPHIQUE_JS}\nreturn { calculerGraphique, graduations, htmlDuGraphique, PALETTE_GRAPHIQUE };`)() as {
  calculerGraphique(config: ConfigGraphique, lignes: unknown, formater: Formater, largeur: number): Graphe;
  graduations(min: number, max: number): number[];
  htmlDuGraphique(config: ConfigHtml, lignes: unknown, formater: Formater): string;
  PALETTE_GRAPHIQUE: string[];
};

export const calculerGraphique = moteur.calculerGraphique;
export const graduations = moteur.graduations;
export const htmlDuGraphique = moteur.htmlDuGraphique;
export const PALETTE_GRAPHIQUE: readonly string[] = moteur.PALETTE_GRAPHIQUE;
