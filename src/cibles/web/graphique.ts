/**
 * Les graphiques sur le web et le desktop (plan des médias, 4.1) :
 * le composant `<Graphique>` que les pages écrivent, ses deux versions
 * (React DOM et React Native), la géométrie partagée et le CSS.
 *
 * Aucune bibliothèque de graphiques : le composant habille les formes que
 * calcule `graphique-geometrie.js` (la même fonction pour toutes les cibles).
 */
import { GEOMETRIE_JS, DECLARATIONS_GEOMETRIE } from '../commun/graphique/geometrie.js';
import { COULEURS_CSS } from './styles.js';
import { camel, chaine } from './noms.js';
import type { GraphiqueRI } from '../../ri/types.js';
import { messageEnCode } from '../../i18n/messages.js';

/** Un texte en attribut JSX : entre guillemets si possible, sinon entre accolades. */
const attribut = (texte: string) => (/["\\{}\n]/.test(texte) ? `{${chaine(texte)}}` : `"${texte}"`);

/**
 * La balise `<Graphique … />` d'une page .
 * `valeur` traduit une valeur Humalis en expression ; `texte` rend le texte
 * d'une valeur écrite en clair, sinon undefined.
 */
export function baliseGraphique(noeud: GraphiqueRI, valeur: (v: GraphiqueRI['liste']) => string, texte: (v: GraphiqueRI['liste']) => string | undefined): string {
  const series = noeud.series.map(
    (s) => `{ nom: ${s.nomLangues ? messageEnCode(s.nomLangues, chaine) : chaine(s.nom)}${s.valeur !== undefined ? `, valeur: ${chaine(camel(s.valeur))}` : ''}${s.couleur ? `, couleur: ${chaine(s.couleur)}` : ''} }`,
  );
  const description = texte(noeud.description);
  const proprietes = [
    `genre="${noeud.genre}"`,
    `donnees={${valeur(noeud.liste)}}`,
    ...(noeud.etiquette !== undefined ? [`etiquette="${camel(noeud.etiquette)}"`] : []),
    ...(noeud.etiquettes ? [`etiquettes={${valeur(noeud.etiquettes)}}`] : []),
    `nomEtiquettes=${noeud.nomEtiquettesLangues ? `{${messageEnCode(noeud.nomEtiquettesLangues, chaine)}}` : attribut(noeud.nomEtiquettes)}`,
    `series={[${series.join(', ')}]}`,
    ...(noeud.devise ? [`devise="${noeud.devise}"`] : []),
    ...(noeud.proportions ? [`proportions={[${noeud.proportions.join(', ')}]}`] : []),
    `titre=${noeud.titreLangues ? `{${messageEnCode(noeud.titreLangues, chaine)}}` : attribut(noeud.titre)}`,
    `description=${description !== undefined ? attribut(description) : `{${valeur(noeud.description)}}`}`,
    ...(noeud.classes.length > 0 ? [`className=${attribut(noeud.classes.join(' '))}`] : []),
  ];
  return `<Graphique ${proprietes.join(' ')} />`;
}

/**
 * La lecture d'un graphique, en JavaScript (ES2019) recopié tel quel, comme
 * la géométrie : ce que le doigt, la souris et le clavier peuvent lire. Le
 * web et le desktop la reçoivent dans `graphique-geometrie.js`,
 * le site statique dans `humalis/graphique.js`.
 */
export const LECTURE_JS = String.raw`/**
 * La lecture d'un graphique, écrite par Humalis : à partir de sa géométrie,
 * les points qu'on peut toucher, survoler ou parcourir au clavier (l'étiquette
 * et les valeurs déjà formatées de la table de données), la ligne de données
 * de chaque forme, et si le dessin défile. Une fonction pure, sans mesure.
 */

/**
 * La largeur minimale d'une valeur, en unités du dessin : en dessous, le dessin
 * s'allonge et défile au doigt au lieu de serrer ses barres et ses étiquettes.
 */
const BANDE_MINIMALE = { large: { courbe: 12, barres: 16 }, etroit: { courbe: 20, barres: 26 } };

function axeDuGraphe(graphe) {
  for (const f of graphe.formes) if (f.type === 'ligne' && f.role === 'axe') return f;
  return null;
}

/** Le sommet d'une forme qui montre une valeur (barre ou repère) : son milieu horizontal et son haut. */
function sommetDeForme(f) {
  if (f.type === 'rect') return [f.x + f.largeur / 2, f.y];
  if (f.type === 'cercle') return [f.x, f.y - f.r];
  // « M x y L … » : le premier point d'un triangle ou d'un losange est son sommet.
  const morceaux = f.d.split(' ');
  return [Number(morceaux[1]), Number(morceaux[2])];
}

/**
 * Le graphique d'un dessin de « largeur » unités (640, ou 400 pour les écrans
 * étroits), prêt à lire. « calculer(config, largeur) » donne sa géométrie
 * (calculerGraphique, avec les données et le format du graphique). Trop de
 * valeurs pour la largeur : le dessin est recalculé plus long (la même
 * hauteur), et « defilant » le dit.
 */
function lireGraphique(config, largeur, calculer) {
  const etroit = largeur < 640;
  let graphe = calculer(config, largeur);
  const n = graphe.table.lignes.length;
  let axe = axeDuGraphe(graphe);
  let defilant = false;
  if (!graphe.vide && config.genre !== 'camembert' && axe && n > 0) {
    const minimum = BANDE_MINIMALE[etroit ? 'etroit' : 'large'][config.genre === 'barres' ? 'barres' : 'courbe'];
    if ((axe.x2 - axe.x1) / n < minimum) {
      const proportions = config.proportions || (etroit ? [4, 3] : [16, 9]);
      const hauteur = Math.round((largeur * proportions[1]) / proportions[0]);
      const total = Math.ceil(axe.x1 + n * minimum + 12);
      graphe = calculer(Object.assign({}, config, { proportions: [total, hauteur] }), total);
      axe = axeDuGraphe(graphe);
      defilant = true;
    }
  }
  const lecture = { graphe, points: [], lignesDesFormes: graphe.formes.map(() => -1), gauche: 0, haut: 0, bas: graphe.hauteur, defilant };
  if (graphe.vide) return lecture;
  const table = graphe.table.lignes;
  const entetes = graphe.table.entetes;

  if (config.genre === 'camembert') {
    // Une part par valeur positive, dans l'ordre : la k-ième part est la k-ième ligne qui a une part.
    const avecPart = [];
    table.forEach((ligne, i) => {
      if (ligne[2] !== '—') avecPart.push(i);
    });
    const cx = graphe.largeur / 2;
    const cy = graphe.hauteur / 2;
    let rang = 0;
    graphe.formes.forEach((f, j) => {
      if (f.type !== 'chemin' || f.role !== 'part') return;
      const index = avecPart[rang++];
      if (index === undefined) return;
      lecture.lignesDesFormes[j] = index;
      // Le libellé de la part suit la part : la bulle se pose entre le centre et lui.
      const libelle = graphe.formes[j + 1];
      const lx = libelle && libelle.type === 'texte' ? libelle.x : cx;
      const ly = libelle && libelle.type === 'texte' ? libelle.y - graphe.taille * 0.35 : cy;
      lecture.points.push({ index, x: cx + (lx - cx) * 0.6, y: cy + (ly - cy) * 0.6, libelle: table[index][0], lignes: [entetes[1] + ' : ' + table[index][1] + ' (' + table[index][2] + ')'] });
    });
    return lecture;
  }

  if (!axe) return lecture;
  lecture.gauche = axe.x1;
  const bande = (axe.x2 - axe.x1) / n;
  let haut = Infinity;
  let bas = -Infinity;
  for (const f of graphe.formes) {
    if (f.type === 'ligne' && f.role === 'grille') {
      haut = Math.min(haut, f.y1);
      bas = Math.max(bas, f.y1);
    }
  }
  lecture.haut = haut === Infinity ? 0 : haut;
  lecture.bas = bas === -Infinity ? graphe.hauteur : bas;
  // Chaque barre ou repère appartient à la bande où tombe son milieu.
  const sommets = table.map(() => Infinity);
  graphe.formes.forEach((f, j) => {
    if (!f.titre) return;
    const sommet = sommetDeForme(f);
    const index = Math.min(n - 1, Math.max(0, Math.floor((sommet[0] - axe.x1) / bande)));
    lecture.lignesDesFormes[j] = index;
    sommets[index] = Math.min(sommets[index], sommet[1]);
  });
  table.forEach((ligne, index) => {
    if (sommets[index] === Infinity) return;
    lecture.points.push({ index, x: axe.x1 + (index + 0.5) * bande, y: sommets[index], libelle: ligne[0], lignes: entetes.slice(1).map((entete, k) => entete + ' : ' + ligne[k + 1]) });
  });
  if (defilant) {
    // Un dessin qui défile coupe ce qui dépasse : la première et la dernière étiquette restent dedans.
    graphe.formes = graphe.formes.map((f) => {
      if (f.type !== 'texte' || f.role !== 'etiquette') return f;
      const demi = (f.texte.length * graphe.taille * 0.62) / 2;
      if (f.x - demi < axe.x1) return Object.assign({}, f, { x: axe.x1 + 2, ancre: 'start' });
      if (f.x + demi > graphe.largeur - 2) return Object.assign({}, f, { x: graphe.largeur - 2, ancre: 'end' });
      return f;
    });
  }
  return lecture;
}

/** Ce que dit un point, à voix haute : « 12 oct., Commandes : 4 ». */
function texteDuPoint(point) {
  return point.libelle + ', ' + point.lignes.join(', ');
}
`;

/** Les types de la lecture, ajoutés à `graphique-geometrie.d.ts`. */
const DECLARATIONS_LECTURE = `
/** Un point lisible : sa ligne de données, sa place dans le dessin (en unités) et les lignes de sa bulle. */
export interface PointGraphique {
  index: number;
  x: number;
  y: number;
  libelle: string;
  lignes: string[];
}

export interface LectureGraphique {
  graphe: Graphe;
  points: PointGraphique[];
  /** La ligne de données de chaque forme qui montre une valeur, sinon -1. */
  lignesDesFormes: number[];
  /** Le bord gauche du tracé, et le haut et le bas de la grille (courbe et barres). */
  gauche: number;
  haut: number;
  bas: number;
  /** Trop de valeurs pour la largeur : le dessin est plus long et défile. */
  defilant: boolean;
}

export function lireGraphique(config: ConfigGraphique, largeur: number, calculer: (config: ConfigGraphique, largeur: number) => Graphe): LectureGraphique;

export function texteDuPoint(point: PointGraphique): string;
`;

/** `graphique-geometrie.js` : la géométrie et sa lecture, avec leurs exports. */
export const GEOMETRIE_MODULE = `// Produit par Humalis : la géométrie des graphiques, la même pour toutes les cibles.
${GEOMETRIE_JS}
${LECTURE_JS}
export { PALETTE_GRAPHIQUE, calculerGraphique, repere, lireGraphique, texteDuPoint };
`;

/** Les fichiers des graphiques (dans `src/humalis/`), si une page en dessine. */
export function fichiersGraphique(codes: string[]): Map<string, string> {
  const fichiers = new Map<string, string>();
  if (!codes.some((c) => /<Graphique\b/.test(c))) return fichiers;
  fichiers.set('graphique.tsx', GRAPHIQUE_WEB);
  fichiers.set('graphique-geometrie.js', GEOMETRIE_MODULE);
  fichiers.set('graphique-geometrie.d.ts', DECLARATIONS_GEOMETRIE + DECLARATIONS_LECTURE);
  return fichiers;
}

// ─── Le composant web (React DOM) ────────────────────────────────────────

const GRAPHIQUE_WEB = `// Produit par Humalis : un graphique dessiné en SVG, sans bibliothèque.
// Les formes viennent de graphique-geometrie.js ; le CSS (styles.css) les
// colore en clair et en sombre. Rien n'est mesuré au premier rendu : le HTML
// prérendu est celui du navigateur. Ensuite, le doigt, la souris et le
// clavier lisent les valeurs (une bulle, et la même phrase pour les lecteurs
// d'écran) ; un graphique trop long pour sa largeur défile au doigt.
import { useEffect, useId, useRef, useState, type KeyboardEvent as EvenementClavier, type PointerEvent as EvenementPointeur } from 'react';
import { calculerGraphique, lireGraphique, repere, texteDuPoint, type ConfigGraphique, type Forme, type LectureGraphique, type PointGraphique } from './graphique-geometrie';
import { formaterArgent, formaterNombre } from './outils';

interface Proprietes extends ConfigGraphique {
  donnees: readonly unknown[] | null | undefined;
  /** Le nom du dessin, lu par les lecteurs d'écran (« Graphique en courbe »). */
  titre: string;
  /** Ce que montre le graphique, écrit par l'auteur. */
  description: string;
  devise?: 'FC' | 'EUR' | 'USD';
  className?: string;
}

/** Une forme, en élément SVG : sa classe dit son rôle, sa couleur, et si elle est lue. */
function FormeSvg({ forme, ligne = -1, actif = false }: { forme: Forme; ligne?: number; actif?: boolean }) {
  const className = 'humalis-graphique-' + forme.role + (forme.couleur ? ' humalis-graphique-c-' + forme.couleur : '') + (actif ? ' humalis-graphique-actif' : '');
  const donnee = ligne >= 0 ? { 'data-ligne': ligne } : {};
  switch (forme.type) {
    case 'ligne':
      return <line className={className} x1={forme.x1} y1={forme.y1} x2={forme.x2} y2={forme.y2} />;
    case 'texte':
      return <text className={className} x={forme.x} y={forme.y} textAnchor={forme.ancre}>{forme.texte}</text>;
    case 'rect':
      return <rect className={className} x={forme.x} y={forme.y} width={forme.largeur} height={forme.hauteur} {...donnee} />;
    case 'cercle':
      return <circle className={className} cx={forme.x} cy={forme.y} r={forme.r} {...donnee} />;
    case 'chemin':
      return <path className={className} d={forme.d} {...donnee} />;
  }
}

/** Le mouvement est-il réduit (prefers-reduced-motion) ? Les défilements sautent alors sans glisser. */
function mouvementReduit(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface ProprietesDessin {
  lecture: LectureGraphique;
  genre: ConfigGraphique['genre'];
  id: string;
  classe: string;
  titre: string;
  description: string;
  /** La ligne de données lue (touchée, survolée ou choisie au clavier), partagée par les deux dessins. */
  actif: number | null;
  choisir: (ligne: number | null) => void;
}

/**
 * Un dessin (large ou étroit) qu'on lit au doigt, à la souris et au clavier.
 * Courbe et barres : glisser le doigt de gauche à droite fait suivre la
 * bulle ; un glissement vertical fait défiler la page (touch-action: pan-y).
 * Un dessin qui défile garde le glissement pour défiler : un appui long, puis
 * glisser, fait suivre la bulle. L'axe des valeurs reste en place à gauche.
 */
function Dessin({ lecture, genre, id, classe, titre, description, actif, choisir }: ProprietesDessin) {
  const { graphe, points, defilant } = lecture;
  const zone = useRef<HTMLDivElement>(null);
  const dessin = useRef<SVGSVGElement>(null);
  const defileur = useRef<HTMLDivElement>(null);
  const appui = useRef<{ suit: boolean; bloque: boolean; minuteur: number; x: number; y: number } | null>(null);
  const [bords, setBords] = useState({ debut: true, fin: false });
  const vueX = defilant ? lecture.gauche : 0;
  const vueLargeur = graphe.largeur - vueX;

  // Un appui long sur un dessin qui défile : le glissement suit la bulle au lieu de défiler.
  useEffect(() => {
    const svg = dessin.current;
    if (!svg) return;
    const retenir = (e: TouchEvent) => {
      if (appui.current && appui.current.bloque) e.preventDefault();
    };
    svg.addEventListener('touchmove', retenir, { passive: false });
    return () => svg.removeEventListener('touchmove', retenir);
  }, []);

  // Un dessin qui défile montre d'abord les dernières valeurs, dès qu'il a une largeur.
  useEffect(() => {
    const boite = defileur.current;
    if (!boite) return;
    let place = false;
    const placer = () => {
      if (place || boite.clientWidth === 0) return;
      place = true;
      boite.scrollLeft = boite.scrollWidth;
      mesurerBords();
    };
    placer();
    if (typeof ResizeObserver === 'undefined') return;
    const observateur = new ResizeObserver(placer);
    observateur.observe(boite);
    return () => observateur.disconnect();
  }, [defilant]);

  function mesurerBords() {
    const boite = defileur.current;
    if (!boite) return;
    const debut = boite.scrollLeft <= 1;
    const fin = boite.scrollLeft + boite.clientWidth >= boite.scrollWidth - 1;
    setBords((avant) => (avant.debut === debut && avant.fin === fin ? avant : { debut, fin }));
  }

  function aller(fin: boolean) {
    const boite = defileur.current;
    if (boite) boite.scrollTo({ left: fin ? boite.scrollWidth : 0, behavior: mouvementReduit() ? 'auto' : 'smooth' });
  }

  /** La ligne sous le doigt ou la souris : la part touchée, sinon le point le plus proche en largeur. */
  function ligneSous(clientX: number, clientY: number): number | null {
    if (genre === 'camembert') {
      const element = document.elementFromPoint(clientX, clientY);
      const ligne = element ? element.getAttribute('data-ligne') : null;
      return ligne === null ? null : Number(ligne);
    }
    const svg = dessin.current;
    if (!svg || points.length === 0) return null;
    const boite = svg.getBoundingClientRect();
    if (boite.width === 0) return null;
    const x = vueX + ((clientX - boite.left) / boite.width) * vueLargeur;
    let proche = points[0];
    for (const p of points) if (Math.abs(p.x - x) < Math.abs(proche.x - x)) proche = p;
    return proche.index;
  }

  function surAppui(e: EvenementPointeur<SVGSVGElement>) {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) choisir(ligneSous(e.clientX, e.clientY));
      return;
    }
    choisir(ligneSous(e.clientX, e.clientY));
    const etat = { suit: !defilant, bloque: false, minuteur: 0, x: e.clientX, y: e.clientY };
    if (defilant) {
      etat.minuteur = window.setTimeout(() => {
        etat.suit = true;
        etat.bloque = true;
      }, 300);
    }
    appui.current = etat;
  }

  function surMouvement(e: EvenementPointeur<SVGSVGElement>) {
    if (e.pointerType === 'mouse') {
      const ligne = ligneSous(e.clientX, e.clientY);
      if (ligne !== null || genre === 'camembert') choisir(ligne);
      return;
    }
    const etat = appui.current;
    if (!etat) return;
    if (!etat.suit) {
      // Le doigt bouge avant l'appui long : c'est un défilement, le navigateur s'en charge.
      if (Math.abs(e.clientX - etat.x) + Math.abs(e.clientY - etat.y) > 10) finirAppui();
      return;
    }
    const ligne = ligneSous(e.clientX, e.clientY);
    if (ligne !== null) choisir(ligne);
  }

  function finirAppui() {
    if (appui.current) window.clearTimeout(appui.current.minuteur);
    appui.current = null;
  }

  function surSortie(e: EvenementPointeur<SVGSVGElement>) {
    if (e.pointerType === 'mouse' && document.activeElement !== zone.current) choisir(null);
  }

  /** Fait défiler le dessin jusqu'au point, s'il est caché. */
  function montrer(point: PointGraphique) {
    const boite = defileur.current;
    if (!defilant || !boite) return;
    const x = point.x - vueX;
    if (x < boite.scrollLeft + 24 || x > boite.scrollLeft + boite.clientWidth - 24) boite.scrollLeft = x - boite.clientWidth / 2;
  }

  // Le clavier : flèches gauche et droite d'un point à l'autre, Début et Fin, Échap pour fermer la bulle.
  function surTouche(e: EvenementClavier<HTMLDivElement>) {
    if (e.target !== e.currentTarget || points.length === 0) return;
    const position = points.findIndex((p) => p.index === actif);
    let suivante = -1;
    if (e.key === 'ArrowRight') suivante = position < 0 ? 0 : Math.min(points.length - 1, position + 1);
    else if (e.key === 'ArrowLeft') suivante = position < 0 ? points.length - 1 : Math.max(0, position - 1);
    else if (e.key === 'Home') suivante = 0;
    else if (e.key === 'End') suivante = points.length - 1;
    else if (e.key === 'Escape' && actif !== null) {
      e.preventDefault();
      choisir(null);
      return;
    }
    if (suivante < 0) return;
    e.preventDefault();
    choisir(points[suivante].index);
    montrer(points[suivante]);
  }

  const point = actif === null ? undefined : points.find((p) => p.index === actif);
  let bulle = null;
  if (point) {
    // La bulle se pose du côté où il reste de la place, sans jamais cacher le point lu.
    const boite = defileur.current;
    const aDroite = defilant && boite && boite.clientWidth > 0 ? point.x - vueX - boite.scrollLeft < boite.clientWidth / 2 : point.x - vueX < vueLargeur / 2;
    const gauche = ((point.x - vueX) / vueLargeur) * 100 + '%';
    const decalage = aDroite ? '12px' : 'calc(-100% - 12px)';
    const style = genre === 'camembert'
      ? { left: gauche, top: Math.min(85, Math.max(15, (point.y / graphe.hauteur) * 100)) + '%', transform: 'translate(' + decalage + ', -50%)' }
      : { left: gauche, top: '0.25rem', transform: 'translateX(' + decalage + ')' };
    bulle = (
      <div className="humalis-graphique-bulle" aria-hidden="true" style={style}>
        <strong>{point.libelle}</strong>
        {point.lignes.map((ligne, i) => (
          <span key={i}>{ligne}</span>
        ))}
      </div>
    );
  }

  const svg = (
    <svg ref={dessin} viewBox={vueX + ' 0 ' + vueLargeur + ' ' + graphe.hauteur} fontSize={graphe.taille} role="img" aria-labelledby={id + '-nom ' + id + '-desc'} onPointerDown={surAppui} onPointerMove={surMouvement} onPointerUp={finirAppui} onPointerCancel={finirAppui} onPointerLeave={surSortie}>
      <title id={id + '-nom'}>{titre}</title>
      <desc id={id + '-desc'}>{description}</desc>
      {point && genre !== 'camembert' && <line className="humalis-graphique-guide" x1={point.x} y1={lecture.haut} x2={point.x} y2={lecture.bas} />}
      {graphe.formes.map((forme, i) =>
        defilant && forme.role === 'graduation' ? null : <FormeSvg key={i} forme={forme} ligne={lecture.lignesDesFormes[i]} actif={point !== undefined && lecture.lignesDesFormes[i] === point.index} />,
      )}
    </svg>
  );
  const trace = (
    <div className={'humalis-graphique-trace' + (point ? ' humalis-graphique-lu' : '')} style={defilant ? { width: vueLargeur + 'px' } : undefined}>
      {svg}
      {bulle}
    </div>
  );
  return (
    <div
      ref={zone}
      className={classe + ' humalis-graphique-zone' + (defilant ? ' humalis-graphique-defilant' : '')}
      tabIndex={0}
      role="group"
      aria-label={titre}
      aria-describedby={id + '-consigne'}
      onKeyDown={surTouche}
    >
      <span id={id + '-consigne'} className="humalis-graphique-consigne">
        {defilant ? 'Flèches gauche et droite : lire les valeurs une à une. Le graphique défile ; il montre d’abord les dernières valeurs.' : 'Flèches gauche et droite : lire les valeurs une à une.'}
      </span>
      {defilant ? (
        <>
          <div className="humalis-graphique-cadre">
            <svg className="humalis-graphique-axe-fixe" width={lecture.gauche} height={graphe.hauteur} viewBox={'0 0 ' + lecture.gauche + ' ' + graphe.hauteur} fontSize={graphe.taille} aria-hidden="true">
              {graphe.formes.map((forme, i) => (forme.role === 'graduation' ? <FormeSvg key={i} forme={forme} /> : null))}
            </svg>
            <div className="humalis-graphique-defileur" ref={defileur} onScroll={mesurerBords}>
              {trace}
            </div>
          </div>
          <div className="humalis-graphique-navigation">
            <button type="button" onClick={() => aller(false)} disabled={bords.debut} aria-label="Revenir aux premières valeurs">
              « Début
            </button>
            <button type="button" onClick={() => aller(true)} disabled={bords.fin} aria-label="Aller aux dernières valeurs">
              Fin »
            </button>
          </div>
        </>
      ) : (
        trace
      )}
    </div>
  );
}

/**
 * Le graphique : deux dessins (large, et étroit pour les petits écrans : le
 * CSS montre celui qui convient), la légende, la table « Voir les données »,
 * et une phrase dite poliment aux lecteurs d'écran quand une valeur est lue.
 */
export default function Graphique({ donnees, titre, description, devise, className, ...reglage }: Proprietes) {
  const id = useId();
  const figure = useRef<HTMLElement>(null);
  const [actif, setActif] = useState<number | null>(null);

  // Toucher ailleurs que sur le graphique ferme sa bulle.
  useEffect(() => {
    if (actif === null) return;
    const fermer = (e: PointerEvent) => {
      if (figure.current && e.target instanceof Node && !figure.current.contains(e.target)) setActif(null);
    };
    document.addEventListener('pointerdown', fermer);
    return () => document.removeEventListener('pointerdown', fermer);
  }, [actif]);

  const formater = (valeur: number) => (devise ? formaterArgent(valeur, devise) : formaterNombre(valeur));
  const calculer = (config: ConfigGraphique, largeur: number) => calculerGraphique(config, donnees, formater, largeur);
  const large = lireGraphique(reglage, 640, calculer);
  const classes = className ? 'humalis-graphique ' + className : 'humalis-graphique';
  if (large.graphe.vide) {
    return (
      <figure className={classes}>
        <p className="humalis-graphique-vide" role="status">Aucune donnée à afficher.</p>
      </figure>
    );
  }
  const etroit = lireGraphique(reglage, 400, calculer);
  const point = actif === null ? undefined : large.points.find((p) => p.index === actif);
  const commun = { genre: reglage.genre, titre, description, actif, choisir: setActif };
  return (
    <figure className={classes} ref={figure}>
      <Dessin lecture={large} id={id + '-l'} classe="humalis-graphique-large" {...commun} />
      <Dessin lecture={etroit} id={id + '-e'} classe="humalis-graphique-etroit" {...commun} />
      <p className="humalis-graphique-annonce" aria-live="polite">
        {point ? texteDuPoint(point) : ''}
      </p>
      {large.graphe.legende.length > 0 && (
        <figcaption className="humalis-graphique-legende">
          <ul>
            {large.graphe.legende.map((element, i) => (
              <li key={i}>
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <FormeSvg forme={repere(element.repere, 6, 6, element.couleur)} />
                </svg>
                {element.nom}
              </li>
            ))}
          </ul>
        </figcaption>
      )}
      <details className="humalis-graphique-donnees">
        <summary>Voir les données</summary>
        <table>
          <caption>Les données du graphique</caption>
          <thead>
            <tr>
              {large.graphe.table.entetes.map((entete, i) => (
                <th key={i} scope="col">{entete}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {large.graphe.table.lignes.map((ligne, i) => (
              <tr key={i}>
                <th scope="row">{ligne[0]}</th>
                {ligne.slice(1).map((cellule, j) => (
                  <td key={j}>{cellule}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
`;


// ─── Le CSS (web, desktop, statique) ─────────────────────────────────────

/**
 * Le CSS des graphiques, si une page en dessine : le dessin prend la largeur
 * de son conteneur ; sous 34rem, la version étroite remplace la large (une
 * requête de conteneur, rien n'est mesuré). Une couleur de série par couleur
 * de base ou du thème, qui suit le mode clair ou sombre.
 */
export function cssGraphique(codes: string[], couleursTheme: string[] = []): string {
  if (!codes.some((c) => /humalis-graphique\b|<Graphique\b|humalisGraphique\./.test(c))) return '';
  const couleurs = [...new Set([...Object.keys(COULEURS_CSS), ...couleursTheme])];
  return `
/* Les graphiques : du SVG écrit par Humalis, à la largeur de son conteneur. */
.humalis-graphique { margin: 1rem 0; width: 100%; box-sizing: border-box; container: humalis-graphique / inline-size; }
.humalis-graphique > svg { display: block; width: 100%; height: auto; overflow: visible; }
.humalis-graphique > .humalis-graphique-etroit { display: none; }
@container humalis-graphique (max-width: 34rem) {
  .humalis-graphique > .humalis-graphique-large { display: none; }
  .humalis-graphique > .humalis-graphique-etroit { display: block; }
}
.humalis-graphique text { fill: currentColor; }
.humalis-graphique-grille { stroke: currentColor; stroke-opacity: 0.15; }
.humalis-graphique-axe { stroke: currentColor; stroke-opacity: 0.6; }
.humalis-graphique-courbe { fill: none; stroke: var(--humalis-serie); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.humalis-graphique-barre, .humalis-graphique-repere, path.humalis-graphique-part { fill: var(--humalis-serie); }
path.humalis-graphique-part { stroke: var(--humalis-page); stroke-width: 2; }
${couleurs.map((nom) => `.humalis-graphique-c-${nom} { --humalis-serie: var(--humalis-${nom}); }`).join('\n')}
.humalis-graphique-legende ul { list-style: none; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; padding: 0; margin: 0.5rem 0 0; }
.humalis-graphique-legende li { display: inline-flex; align-items: center; gap: 0.4rem; }
.humalis-graphique-legende svg { width: 0.85rem; height: 0.85rem; }
.humalis-graphique-donnees { margin-top: 0.5rem; }
.humalis-graphique-donnees summary { cursor: pointer; width: fit-content; }
.humalis-graphique-donnees table { border-collapse: collapse; margin-top: 0.5rem; }
.humalis-graphique-donnees caption { text-align: left; font-weight: 600; padding-bottom: 0.25rem; }
.humalis-graphique-donnees th, .humalis-graphique-donnees td { padding: 0.25rem 1rem 0.25rem 0; border-bottom: 1px solid rgb(138 138 144 / 0.35); text-align: left; }
.humalis-graphique-donnees td { text-align: right; font-variant-numeric: tabular-nums; }
.humalis-graphique-vide { margin: 0; padding: 1rem; border: 1px dashed rgb(138 138 144 / 0.6); border-radius: 0.5rem; }
/* Lire au doigt, à la souris et au clavier : une bulle suit le point lu ; un long graphique défile au doigt. */
.humalis-graphique-zone { position: relative; border-radius: 0.5rem; }
.humalis-graphique-zone:focus-visible { outline: 2px solid var(--humalis-bleu); outline-offset: 4px; }
.humalis-graphique-trace { position: relative; touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
.humalis-graphique-trace > svg { display: block; width: 100%; height: auto; overflow: visible; }
.humalis-graphique-cadre { display: flex; align-items: flex-start; }
.humalis-graphique-axe-fixe { flex: none; display: block; overflow: visible; }
.humalis-graphique-defileur { flex: 1 1 auto; min-width: 0; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-width: thin; }
.humalis-graphique-defilant .humalis-graphique-trace { touch-action: pan-x pan-y; }
.humalis-graphique-defilant .humalis-graphique-trace > svg { overflow: hidden; }
.humalis-graphique-guide { stroke: currentColor; stroke-opacity: 0.4; stroke-dasharray: 3 3; pointer-events: none; }
.humalis-graphique-lu .humalis-graphique-barre:not(.humalis-graphique-actif), .humalis-graphique-lu path.humalis-graphique-part:not(.humalis-graphique-actif) { opacity: 0.45; }
.humalis-graphique-repere.humalis-graphique-actif { transform-box: fill-box; transform-origin: center; transform: scale(1.7); stroke: var(--humalis-page); stroke-width: 1.5; }
.humalis-graphique-bulle { position: absolute; z-index: 2; pointer-events: none; width: max-content; max-width: 14rem; padding: 0.4rem 0.6rem; border-radius: 0.5rem; background: var(--humalis-encre); color: var(--humalis-page); font-size: 0.875rem; line-height: 1.35; text-align: left; box-shadow: 0 4px 14px rgb(0 0 0 / 0.2); }
.humalis-graphique-bulle strong { display: block; font-weight: 600; }
.humalis-graphique-bulle span { display: block; font-variant-numeric: tabular-nums; }
.humalis-graphique-navigation { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.25rem; }
.humalis-graphique-navigation button { min-width: 44px; min-height: 44px; margin: 0; padding: 0 0.75rem; border: 1px solid rgb(138 138 144 / 0.45); border-radius: 0.5rem; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.humalis-graphique-navigation button:disabled { opacity: 0.4; cursor: default; }
.humalis-graphique-navigation button:focus-visible { outline: 2px solid var(--humalis-bleu); outline-offset: 2px; }
.humalis-graphique-annonce, .humalis-graphique-consigne { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: no-preference) {
  .humalis-graphique-barre, .humalis-graphique-repere, path.humalis-graphique-part { transition: opacity 0.15s ease, transform 0.15s ease; }
}
`;
}
