/**
 * Les noms d'un projet : où chacun est déclaré, et lequel est visible à une
 * ligne donnée. Les portées suivent celles de l'analyse du compilateur
 * (`src/analyse/portees.ts`) : la page, puis chaque bloc décalé ; les variables
 * partagées et les paramètres au-dessus.
 */
import type { Expression, Instruction, NomElement, Programme } from '../../../../src/parser/ast.js';
import { indentation, jetonsDeLigne, texteJeton } from './document.js';
import { entetes, enteteRacine, premierMot } from './blocs.js';
import { principal, type FichierProjet, type Projet } from './projet.js';

export type GenreSymbole =
  | 'variable'
  | 'calcul'
  | 'partagee'
  | 'boucle'
  | 'parametrePage'
  | 'parametreComposant'
  | 'parametreFonction'
  | 'fonction'
  | 'page'
  | 'composant'
  | 'composantReact'
  | 'serveur'
  | 'donnee'
  | 'champDonnee'
  | 'route'
  | 'element';

/** Les genres qui se lisent comme une valeur : `texte nom`, `{prix}`. */
export const GENRES_VARIABLE: readonly GenreSymbole[] = [
  'variable',
  'calcul',
  'partagee',
  'boucle',
  'parametrePage',
  'parametreComposant',
  'parametreFonction',
];

export interface Symbole {
  genre: GenreSymbole;
  nom: string;
  /** Le fichier qui le déclare (absent : un document pas encore enregistré). */
  fichier?: string;
  ligne: number;
  colonne: number;
  /** Colonne juste après le nom. */
  fin: number;
  /** Variables et éléments : la ligne d'en-tête du bloc qui les contient. */
  entete?: number;
  /** Un champ de donnée : sa donnée. */
  donnee?: string;
  /** Un élément de page : son genre, son nom (« avec nom "…" ») et son texte écrit. */
  element?: NomElement;
  nomElement?: string;
  libelle?: string;
  /** La ligne de la déclaration, telle qu'elle est écrite. */
  texteLigne: string;
}

export interface Index {
  projet: Projet;
  symboles: Symbole[];
  /** Document ouvert : les noms lus comme une valeur, par ligne. */
  references: Map<number, Set<string>>;
  /** Document ouvert : les composants placés, par ligne. */
  composantsPlaces: Map<number, Set<string>>;
}

/** Place un nom dans sa ligne : le premier jeton (après `apres` jetons) qui l'écrit. */
function placer(lignes: readonly string[], ligne: number, nom: string, chaine: boolean, apres = 0) {
  const texte = lignes[ligne - 1] ?? '';
  const jeton = jetonsDeLigne(texte, ligne)
    .slice(apres)
    .find((j) =>
      chaine ? j.type === 'CHAINE' && j.valeur === nom : j.type !== 'CHAINE' && (j.valeur === nom || texteJeton(j) === nom),
    );
  if (!jeton) return { colonne: indentation(texte) + 1, fin: texte.length + 1, texteLigne: texte.trim() };
  const longueur = chaine ? jeton.valeur.length + 2 : texteJeton(jeton).length;
  return { colonne: jeton.colonne, fin: jeton.colonne + longueur, texteLigne: texte.trim() };
}

/** Le nom lu dans une interpolation : « produit » pour {produit.prix}. */
export const baseInterpolation = (valeur: string) => valeur.split('.')[0].trim();

export function indexer(projet: Projet): Index {
  const index: Index = { projet, symboles: [], references: new Map(), composantsPlaces: new Map() };
  projet.fichiers.forEach((fichier, k) => recenserFichier(index, fichier, k === 0));
  return index;
}

function recenserFichier(index: Index, { chemin, doc }: FichierProjet, ouvert: boolean): void {
  const programme: Programme | undefined = doc.programme;
  if (!programme) return;
  const lignes = doc.lignes;
  const ajouter = (genre: GenreSymbole, nom: string, ligne: number, chaine: boolean, apres = 0, plus: Partial<Symbole> = {}) =>
    index.symboles.push({ genre, nom, fichier: chemin, ligne, ...placer(lignes, ligne, nom, chaine, apres), ...plus });
  const noter = (carte: Map<number, Set<string>>, nom: string, ligne: number) => {
    if (!ouvert) return;
    const noms = carte.get(ligne) ?? new Set<string>();
    noms.add(nom);
    carte.set(ligne, noms);
  };
  const lire = (nom: string, ligne: number) => noter(index.references, nom, ligne);

  /** Le bloc qui contient cette ligne, d'après l'indentation : le même calcul que les variables visibles. */
  const blocDe = (ligne: number) => entetes(lignes, ligne)[0];

  /**
   * Parcourt tout l'arbre du programme, sans liste de blocs à tenir à jour : une référence ou une
   * déclaration est trouvée dans n'importe quel bloc (fenêtre, onglet, « essayer », « selon »…).
   * `racine` : la ligne de la page, du composant ou de la fonction.
   */
  const visiter = (valeur: unknown, racine: number): void => {
    if (Array.isArray(valeur)) {
      for (const v of valeur) visiter(v, racine);
      return;
    }
    if (valeur === null || typeof valeur !== 'object') return;
    const n = valeur as Instruction | Expression | { type?: undefined };
    switch (n.type) {
      case 'Reference':
        lire(n.nom, n.ligne);
        return;
      case 'Chaine':
        for (const partie of n.parties) if (partie.type === 'variable') lire(baseInterpolation(partie.valeur), n.ligne);
        for (const version of n.versions ?? []) for (const partie of version.parties) if (partie.type === 'variable') lire(baseInterpolation(partie.valeur), n.ligne);
        return;
      case 'Variable':
        if (ouvert) ajouter(n.calcul ? 'calcul' : 'variable', n.nom, n.ligne, false, 1, { entete: blocDe(n.ligne) });
        break;
      case 'Affectation':
        lire(n.nom, n.ligne);
        break;
      case 'ModificationListe':
        lire(n.liste, n.ligne);
        break;
      case 'Requete':
        if (n.resultat !== undefined) lire(n.resultat, n.ligne);
        break;
      case 'Rechargement':
        lire(n.variable, n.ligne);
        break;
      case 'Composant':
        noter(index.composantsPlaces, n.nom, n.ligne);
        break;
      case 'Boucle':
        if (ouvert) ajouter('boucle', n.variable, n.ligne, false, 1, { entete: n.ligne });
        break;
      case 'Element': {
        const libelle =
          n.contenu.type === 'Chaine' && n.contenu.parties.every((p) => p.type === 'texte')
            ? n.contenu.parties.map((p) => p.valeur).join('')
            : undefined;
        const nom = n.nom ?? libelle;
        if (ouvert && nom !== undefined) {
          ajouter('element', nom, n.ligne, true, 0, {
            entete: racine,
            element: n.element,
            ...(n.nom !== undefined ? { nomElement: n.nom } : {}),
            ...(libelle !== undefined ? { libelle } : {}),
          });
        }
        break;
      }
    }
    for (const enfant of Object.values(n)) visiter(enfant, racine);
  };

  for (const d of programme.partages) ajouter('partagee', d.nom, d.ligne, false, 1);
  for (const c of programme.composantsReact) ajouter('composantReact', c.nom, c.ligne, true);
  for (const c of programme.composants) {
    ajouter('composant', c.nom, c.ligne, true);
    if (ouvert) for (const p of c.parametres) ajouter('parametreComposant', p.nom, p.ligne, false, 1, { entete: c.ligne });
    visiter(c.corps, c.ligne);
  }
  for (const disposition of [programme.entete, programme.pied]) if (disposition) visiter(disposition.corps, disposition.ligne);
  // Un calcul du haut d'un fichier vaut dans toutes les pages du projet.
  for (const d of programme.calculsPartages ?? []) {
    ajouter('partagee', d.nom, d.ligne, false, 1);
    visiter(d.valeur, d.ligne);
  }
  for (const f of [...programme.fonctions, ...(programme.definitionsActions ?? [])]) {
    ajouter('fonction', f.nom, f.ligne, false, 1);
    if (ouvert) for (const p of f.parametres) ajouter('parametreFonction', p.nom, p.ligne ?? f.ligne, false, 1, { entete: f.ligne });
    visiter(f.corps, f.ligne);
  }
  for (const page of programme.pages) {
    ajouter('page', page.nom, page.ligne, true);
    if (ouvert) for (const p of page.parametres) ajouter('parametrePage', p, page.ligne, false, 1, { entete: page.ligne });
    visiter(page.corps, page.ligne);
    visiter(page.apercu, page.ligne);
  }
  for (const serveur of programme.serveurs) {
    ajouter('serveur', serveur.nom, serveur.ligne, true);
    for (const d of serveur.donnees) {
      ajouter('donnee', d.nom, d.ligne, false, 1);
      for (const c of d.champs) ajouter('champDonnee', c.nom, c.ligne, false, 0, { donnee: d.nom });
    }
    for (const r of serveur.routes) ajouter('route', r.adresse, r.ligne, true);
  }
}

/**
 * Les variables visibles à une ligne du document ouvert, la plus proche
 * d'abord (une variable d'un bloc cache celle de la page qui porte le même
 * nom), puis les variables partagées de tout le projet.
 */
export function variablesVisibles(index: Index, ligne: number, marge?: number): Symbole[] {
  const { chemin, doc } = principal(index.projet);
  const chaine = entetes(doc.lignes, ligne, marge);
  const racine = enteteRacine(doc.lignes, chaine);
  const vus = new Set<string>();
  const resultat: Symbole[] = [];
  const garder = (s: Symbole) => {
    if (vus.has(s.nom)) return;
    vus.add(s.nom);
    resultat.push(s);
  };
  for (const entete of chaine) {
    index.symboles
      .filter(
        (s) =>
          GENRES_VARIABLE.includes(s.genre) &&
          s.fichier === chemin &&
          s.entete === entete &&
          (entete === racine || s.ligne <= ligne),
      )
      .forEach(garder);
  }
  index.symboles.filter((s) => s.genre === 'partagee').forEach(garder);
  return resultat;
}

export function variableVisible(index: Index, nom: string, ligne: number, marge?: number): Symbole | undefined {
  return variablesVisibles(index, ligne, marge).find((s) => s.nom === nom);
}

/** Les symboles d'un genre, dans tout le projet. */
export const symbolesDe = (index: Index, genre: GenreSymbole) => index.symboles.filter((s) => s.genre === genre);

/** Les éléments de la page (ou du composant) qui contient la ligne. */
export function elementsDeLaPage(index: Index, ligne: number): Symbole[] {
  const { chemin, doc } = principal(index.projet);
  const racine = enteteRacine(doc.lignes, entetes(doc.lignes, ligne));
  return index.symboles.filter((s) => s.genre === 'element' && s.fichier === chemin && s.entete === racine);
}
