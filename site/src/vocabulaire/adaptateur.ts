/**
 * Le site lit la table de vocabulaire du compilateur (`src/vocabulaire/table.ts`).
 *
 * Rien n'est décrit ici : ce fichier ne fait que présenter les entrées de la
 * table pour les pages du site (un identifiant d'ancre, la rubrique de la
 * documentation, les traductions en texte). Un mot ajouté à la table
 * apparaît donc tout seul sur la page du vocabulaire.
 *
 * Les exports (`TABLE`, `EntreeVocabulaire`, `CATEGORIES`) sont ceux de
 * l'ancien adaptateur provisoire, pour ne rien casser dans les pages.
 */
import { VOCABULAIRE } from '../../../src/vocabulaire/table';
import { estReserve } from '../../../src/vocabulaire/recherche';
import type { Cible, EntreeVocabulaire as EntreeTable } from '../../../src/vocabulaire/types';

export type { Cible };

/** Ce que le site lit dans la table de vocabulaire. */
export interface EntreeVocabulaire {
  /** Identifiant unique, pour l'ancre de la fiche : « bouton », « texte-style ». */
  id: string;
  /** Forme canonique du mot : « bouton », « inferieur ». */
  mot: string;
  /** Variantes acceptées : accents, accords (« inférieure »). */
  variantes: string[];
  /** Rubrique de la documentation : « element », « style », « evenement »… (voir CATEGORIES). */
  categorie: string;
  /** La catégorie grammaticale dans la table du compilateur. */
  categorieTable: EntreeTable['categorie'];
  /** L'idée derrière le mot, en une phrase. */
  concept: string;
  /** Traductions par cible (les cibles web et serveur produisent du code aujourd'hui). */
  traductions: Partial<Record<Cible, string>>;
  /** Un petit programme Humalis complet qui utilise le mot. */
  exemple: string;
  /** Le compilateur reconnaît-il le mot aujourd'hui ? */
  disponible: boolean;
  /** Réservé partout (ne peut jamais nommer une variable). */
  reserve: boolean;
  /** Précision honnête, par exemple « reconnu mais sans effet ». */
  note?: string;
}

/** Les rubriques de la documentation, dans l'ordre des pages. */
export const CATEGORIES: Record<string, string> = {
  structure: 'Structure',
  element: 'Éléments',
  style: 'Styles et options',
  evenement: 'Événements',
  action: 'Actions',
  requete: 'Requêtes',
  variable: 'Variables',
  valeur: 'Valeurs',
  condition: 'Conditions',
  boucle: 'Listes et boucles',
  serveur: 'Le serveur',
  liaison: 'Mots de liaison (ignorés)',
};

/**
 * La rubrique d'une entrée vient de la famille de son concept
 * (« liste.ajouter » → listes et boucles), ou à défaut de sa catégorie.
 */
const RUBRIQUES: Record<string, string> = {
  structure: 'structure',
  element: 'element',
  style: 'style',
  option: 'style',
  valeurStyle: 'style',
  evenement: 'evenement',
  action: 'action',
  requete: 'requete',
  etat: 'variable',
  valeur: 'valeur',
  condition: 'condition',
  comparaison: 'condition',
  boucle: 'boucle',
  liste: 'boucle',
  serveur: 'serveur',
  donnee: 'serveur',
  droit: 'serveur',
  composant: 'structure',
  variable: 'variable',
  liaison: 'liaison',
  saisie: 'element',
};

function rubrique(entree: EntreeTable): string {
  return RUBRIQUES[entree.concept.split('.')[0]] ?? RUBRIQUES[entree.categorie] ?? 'structure';
}

function traductions(entree: EntreeTable): Partial<Record<Cible, string>> {
  const resultat: Partial<Record<Cible, string>> = {};
  for (const [cible, traduction] of Object.entries(entree.cibles) as [Cible, EntreeTable['cibles'][Cible]][]) {
    if (traduction) resultat[cible] = traduction.note ? `${traduction.produit} (${traduction.note})` : traduction.produit;
  }
  return resultat;
}

function note(entree: EntreeTable): string | undefined {
  const prevu = entree.statut === 'prevu' ? 'Prévu, pas encore compris par le compilateur.' : undefined;
  const texte = [entree.note, prevu].filter(Boolean).join(' ');
  return texte === '' ? undefined : texte;
}

const doublons = new Set(
  VOCABULAIRE.map((e) => e.mot).filter((mot, i, mots) => mots.indexOf(mot) !== i),
);

// Un même mot peut avoir deux sens dans une même catégorie (« entete » d'une source, « entete : » de la page) :
// le début du concept les sépare alors.
const doublonsCategorie = new Set(
  VOCABULAIRE.map((e) => `${e.mot}-${e.categorie}`).filter((cle, i, cles) => cles.indexOf(cle) !== i),
);

function identifiant(entree: EntreeTable): string {
  if (!doublons.has(entree.mot)) return entree.mot;
  const cle = `${entree.mot}-${entree.categorie}`;
  return doublonsCategorie.has(cle) ? `${entree.mot}-${entree.concept.split('.')[0]}` : cle;
}

export const TABLE: readonly EntreeVocabulaire[] = VOCABULAIRE.map((entree) => {
  const texteNote = note(entree);
  const variantes = [...new Set([entree.accentue, ...entree.variantes].filter((v): v is string => !!v && v !== entree.mot))];
  return {
    id: identifiant(entree),
    mot: entree.mot,
    variantes,
    categorie: rubrique(entree),
    categorieTable: entree.categorie,
    concept: entree.description,
    traductions: traductions(entree),
    exemple: entree.exemple,
    disponible: entree.statut === 'supporte',
    reserve: estReserve(entree),
    ...(texteNote ? { note: texteNote } : {}),
  };
});
