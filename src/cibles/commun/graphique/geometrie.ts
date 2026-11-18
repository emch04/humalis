/**
 * La géométrie des graphiques : une seule fonction, `calculerGraphique`, écrite une fois en
 * JavaScript lisible, et reprise telle quelle par chaque cible :
 *
 * - le web et le desktop la reçoivent dans
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

import * as moteurGraphique from './moteur.js';

export { GEOMETRIE_JS, HTML_GRAPHIQUE_JS } from './textes.js';

/** Les types de `graphique-geometrie.js`, pour le web et le desktop (TypeScript). */
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

// Le même code que GEOMETRIE_JS et HTML_GRAPHIQUE_JS, en module (moteur.ts, produit par npm run moteur-graphique) :
// le compilateur n'évalue aucun texte, ce que la politique de contenu d'un site refuse (le bac à sable du site public).
const moteur = moteurGraphique as unknown as {
  calculerGraphique(config: ConfigGraphique, lignes: unknown, formater: Formater, largeur: number): Graphe;
  graduations(min: number, max: number): number[];
  htmlDuGraphique(config: ConfigHtml, lignes: unknown, formater: Formater): string;
  PALETTE_GRAPHIQUE: string[];
};

export const calculerGraphique = moteur.calculerGraphique;
export const graduations = moteur.graduations;
export const htmlDuGraphique = moteur.htmlDuGraphique;
export const PALETTE_GRAPHIQUE: readonly string[] = moteur.PALETTE_GRAPHIQUE;
