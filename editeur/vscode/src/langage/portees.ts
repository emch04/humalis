/**
 * Les noms d'un projet : où chacun est déclaré, et lequel est visible à une
 * ligne donnée. Les portées suivent celles de l'analyse du compilateur
 * (`src/analyse/portees.ts`) : la page, puis un bloc par `si`, `sinon`,
 * `pour chaque` et `quand` ; les variables partagées et les paramètres
 * au-dessus.
 */
import type { Expression, Instruction, NomElement, Programme, Test } from '../../../../src/parser/ast.js';
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

/** La ligne du « sinon : » d'une condition, s'il y en a un. */
function ligneSinon(lignes: readonly string[], ligneSi: number): number | undefined {
  const marge = indentation(lignes[ligneSi - 1] ?? '');
  for (let k = ligneSi + 1; k <= lignes.length; k++) {
    const texte = lignes[k - 1];
    if (texte.trim() === '' || texte.trim().startsWith('#')) continue;
    const i = indentation(texte);
    if (i < marge) return undefined;
    if (i === marge) return premierMot(texte) === 'sinon' ? k : undefined;
  }
  return undefined;
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

  // Une condition en « et » ou en « ou » : ses deux côtés sont eux-mêmes des tests.
  const test = (t: Test): void => {
    if (t.type === 'Combinaison') {
      test(t.gauche);
      test(t.droite);
      return;
    }
    expression(t.gauche);
    expression(t.droite);
  };
  const expression = (e: Expression | undefined): void => {
    if (!e) return;
    switch (e.type) {
      case 'Reference':
        lire(e.nom, e.ligne);
        return;
      case 'Chaine':
        for (const partie of e.parties) if (partie.type === 'variable') lire(baseInterpolation(partie.valeur), e.ligne);
        return;
      case 'Liste':
        e.elements.forEach(expression);
        return;
      case 'Calcul':
        expression(e.gauche);
        expression(e.droite);
        return;
      case 'Compte':
        expression(e.liste);
        return;
      case 'AccesChamp':
        expression(e.objet);
        return;
    }
  };

  /** Parcourt un bloc : `entete` est la ligne qui l'ouvre, `racine` celle de la page ou du composant. */
  const bloc = (instructions: Instruction[], entete: number, racine: number): void => {
    for (const i of instructions) {
      switch (i.type) {
        case 'Variable':
          if (ouvert) ajouter(i.calcul ? 'calcul' : 'variable', i.nom, i.ligne, false, 1, { entete });
          expression(i.valeur);
          break;
        case 'Affectation':
          lire(i.nom, i.ligne);
          expression(i.valeur);
          break;
        case 'ModificationListe':
          expression(i.valeur);
          lire(i.liste, i.ligne);
          break;
        case 'Requete':
          i.donnees.forEach(expression);
          if (i.resultat !== undefined) lire(i.resultat, i.ligne);
          break;
        case 'Suppression':
          expression(i.objet);
          break;
        case 'Modification':
          expression(i.objet);
          for (const c of i.changements) expression(c.valeur);
          break;
        case 'Composant':
          noter(index.composantsPlaces, i.nom, i.ligne);
          for (const p of i.proprietes) expression(p.valeur);
          break;
        case 'Element': {
          expression(i.contenu);
          for (const a of i.arguments ?? []) expression(a.valeur);
          const libelle =
            i.contenu.type === 'Chaine' && i.contenu.parties.every((p) => p.type === 'texte')
              ? i.contenu.parties.map((p) => p.valeur).join('')
              : undefined;
          const nom = i.nom ?? libelle;
          if (ouvert && nom !== undefined) {
            ajouter('element', nom, i.ligne, true, 0, {
              entete: racine,
              element: i.element,
              ...(i.nom !== undefined ? { nomElement: i.nom } : {}),
              ...(libelle !== undefined ? { libelle } : {}),
            });
          }
          break;
        }
        case 'Action':
          i.arguments.forEach(expression);
          for (const a of i.parametres ?? []) expression(a.valeur);
          break;
        case 'Condition': {
          test(i.test);
          bloc(i.alors, i.ligne, racine);
          const sinon = ligneSinon(lignes, i.ligne);
          if (sinon !== undefined) bloc(i.sinon, sinon, racine);
          break;
        }
        case 'Boucle':
          expression(i.liste);
          if (ouvert) ajouter('boucle', i.variable, i.ligne, false, 1, { entete: i.ligne });
          bloc(i.corps, i.ligne, racine);
          break;
        case 'Evenement':
        case 'Formulaire':
        case 'Bloc':
          bloc(i.corps, i.ligne, racine);
          break;
        case 'Connexion':
          expression(i.email);
          expression(i.motDePasse);
          break;
      }
    }
  };

  for (const d of programme.partages) ajouter('partagee', d.nom, d.ligne, false, 1);
  for (const c of programme.composantsReact) ajouter('composantReact', c.nom, c.ligne, true);
  for (const c of programme.composants) {
    ajouter('composant', c.nom, c.ligne, true);
    if (ouvert) for (const p of c.parametres) ajouter('parametreComposant', p.nom, p.ligne, false, 1, { entete: c.ligne });
    bloc(c.corps, c.ligne, c.ligne);
  }
  for (const page of programme.pages) {
    ajouter('page', page.nom, page.ligne, true);
    if (ouvert) for (const p of page.parametres) ajouter('parametrePage', p, page.ligne, false, 1, { entete: page.ligne });
    bloc(page.corps, page.ligne, page.ligne);
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
