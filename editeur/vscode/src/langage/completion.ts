/**
 * La complétion selon la place du curseur (plan
 * `2026-10-29-outils-editeur.md`, D4). Les mots viennent de la table de
 * vocabulaire, avec leur fiche ; les noms (variables, pages, routes,
 * éléments…) viennent du projet.
 */
import { VOCABULAIRE } from '../../../../src/vocabulaire/table.js';
import { chercher } from '../../../../src/vocabulaire/recherche.js';
import { normaliser } from '../../../../src/vocabulaire/normaliser.js';
import type { Categorie, Contexte, EntreeVocabulaire } from '../../../../src/vocabulaire/types.js';
import { dansStyle, indentation, jetonsDeLigne, texteJeton } from './document.js';
import { entetes, enteteRacine, genreBloc, premierMot } from './blocs.js';
import { lireProjet, principal, type Lecteur } from './projet.js';
import { elementsDeLaPage, indexer, symbolesDe, variablesVisibles, type Index, type Symbole } from './portees.js';
import { fiche } from './survol.js';

export type GenreProposition =
  | 'motCle'
  | 'variable'
  | 'page'
  | 'composant'
  | 'route'
  | 'element'
  | 'valeur'
  | 'donnee'
  | 'champ'
  | 'evenement'
  | 'parametre';

export interface Proposition {
  libelle: string;
  genre: GenreProposition;
  detail?: string;
  /** En Markdown : la fiche du mot, ou la ligne qui déclare le nom. */
  documentation?: string;
  /** Le texte inséré, s'il diffère du libellé. */
  insertion?: string;
  /** L'insertion est un extrait : « $1 » marque la place du curseur. */
  extrait?: boolean;
  /** Le texte que l'éditeur compare à ce qui est tapé (la forme sans accent du mot). */
  filtre?: string;
}

export interface Completion {
  /** La colonne (à partir de 1) où commence le texte remplacé ; il finit au curseur. */
  debut: number;
  propositions: Proposition[];
}

/** Lit le projet en vidant la ligne du curseur (elle est incomplète), puis complète. */
export function completerSource(
  source: string,
  ligne: number,
  colonne: number,
  chemin?: string,
  lire?: Lecteur,
): Completion {
  return completer(indexer(lireProjet(source, chemin, lire, [ligne])), ligne, colonne);
}

// ─── Les mots de la table ───────────────────────────────────────────────

const supporte = (e: EntreeVocabulaire) => e.statut === 'supporte';
const entree = (mot: string, contexte: Contexte) => chercher(mot, contexte) ?? VOCABULAIRE.find((e) => e.mot === mot);

/** Une proposition pour un mot de la table, avec sa fiche. */
function mot(e: EntreeVocabulaire, plus: Partial<Proposition> = {}): Proposition {
  const forme = e.accentue ?? e.mot;
  return {
    libelle: forme,
    genre: 'motCle',
    detail: e.description,
    documentation: fiche(e),
    ...(forme !== e.mot ? { filtre: e.mot } : {}),
    ...plus,
  };
}

/** Les mots de la table nommés ici, dans cet ordre (ceux qui manquent ou sont prévus sont sautés). */
function mots(liste: readonly string[], contexte: Contexte, plus: (e: EntreeVocabulaire) => Partial<Proposition> = () => ({})) {
  return liste
    .map((m) => entree(m, contexte))
    .filter((e): e is EntreeVocabulaire => e !== undefined && supporte(e))
    .map((e) => mot(e, plus(e)));
}

/** Des mots qui ne commencent jamais une ligne, même s'ils sont réservés partout. */
const JAMAIS_EN_TETE = new Set([
  'chaque', 'dans', 'vers', 'par', 'est', 'ou', 'et', 'avec', 'requete', 'erreur', 'vrai', 'faux', 'rien', 'non',
  'page', 'composant', 'serveur', 'utiliser', 'style',
  // Une série ne s'écrit que dans un graphique en bloc (proposée là, plus bas).
  'serie',
]);

/** Les genres d'un graphique, après « graphique en », et ses options, après « avec » ou « et ». */
const GENRES_GRAPHIQUE = ['courbe', 'barres', 'camembert'];
const OPTIONS_GRAPHIQUE = ['etiquette', 'etiquettes', 'valeur', 'couleur', 'description', 'proportions'];

/** Comment s'écrit chaque élément d'écran en tête de ligne : un texte, une valeur, ou un bloc (sinon « mot : »). */
const INSERTIONS_ECRAN: Record<string, string> = {
  section: 'section "$1" :',
  icone: 'icone "$1"',
  badge: 'badge "$1"',
  avatar: 'avatar "$1"',
  progression: 'progression ${1:valeur}',
  chargement: 'chargement',
  etoiles: 'etoiles ${1:note}',
  compteur: 'compteur ${1:variable}',
  'code qr': 'code qr "$1"',
  selecteur: 'selecteur de langue',
  onglet: 'onglet "$1" :',
  deroulant: 'deroulant "$1" :',
  'fil ariane': "fil d'Ariane :",
  carte: 'carte "$1" avec latitude ${2:-4,3250} et longitude ${3:15,3222} et zoom ${4:15}',
  marqueur: 'marqueur "$1" avec latitude ${2:-4,3250} et longitude ${3:15,3222}',
  graphique: 'graphique en ${1|courbe,barres,camembert|} ${2:liste} avec etiquette ${3:champ} et valeur ${4:champ} et description "$5"',
};

/** Les mots de la table qui peuvent commencer une ligne d'un bloc d'écran. */
/** Vrai si le fichier commence par un bloc « langues : ». */
function declareDesLangues(lignes: readonly string[]): boolean {
  return lignes.some((l) => /^langues\s*:/.test(l));
}

/** Les langues du bloc « langues : », dans l'ordre (sans accent). */
function languesDeclarees(lignes: readonly string[]): string[] {
  const debut = lignes.findIndex((l) => /^langues\s*:/.test(l));
  const langues: string[] = [];
  for (const ligne of lignes.slice(debut + 1)) {
    if (!/^\s+\S/.test(ligne)) break;
    langues.push(normaliser(ligne.trim()));
  }
  return langues;
}

function motsEnTete(dansUnEvenement: boolean): Proposition[] {
  const categories: Categorie[] = dansUnEvenement
    ? ['etat', 'controle', 'action']
    : ['element', 'etat', 'controle', 'evenement', 'action'];
  const enTete = VOCABULAIRE.filter(
    (e) =>
      supporte(e) &&
      categories.includes(e.categorie) &&
      (e.contextes.includes('instruction') || e.contextes.includes('partout') || e.contextes.includes('miseEnPage') || e.contextes.includes('navigation')) &&
      !JAMAIS_EN_TETE.has(e.mot) &&
      !(dansUnEvenement && e.mot === 'calcul'),
  );
  // Un bloc de mise en page s'ouvre sur « : » ; une section a son titre.
  const insertion = (e: (typeof enTete)[number]) =>
    e.contextes.includes('miseEnPage') ? (INSERTIONS_ECRAN[e.mot] ?? `${e.mot} :`) : `${e.mot} "$1"`;
  const propositions = enTete.map((e) => mot(e, e.categorie === 'element' ? { insertion: insertion(e), extrait: true } : {}));
  if (!dansUnEvenement) return propositions;
  // Dans un événement : les opérations sur le serveur et la session.
  return [
    ...propositions,
    ...mots(['supposant'], 'tournure', (e) => ({ libelle: 'en supposant que ça marche :', insertion: 'en supposant que ça marche :', filtre: 'en supposant que ca marche', extrait: true })),
    ...mots(['modifier', 'supprimer'], 'route'),
    ...mots(['connecter', 'deconnecter'], 'session', (e) => ({ libelle: `se ${e.accentue ?? e.mot}`, filtre: `se ${e.mot}` })),
  ];
}

/** Les tournures d'événement : le mot de la table, ce qu'on voit, ce qu'on insère, et le contexte du mot (« evenement » par défaut). */
const EVENEMENTS: readonly [string, string, string, string?][] = [
  ['clique', 'l\'utilisateur clique sur "…" :', 'l\'utilisateur clique sur "$1" :'],
  ['survole', 'l\'utilisateur survole "…" :', 'l\'utilisateur survole "$1" :'],
  ['charge', 'la page se charge :', 'la page se charge :'],
  ['soumis', 'le formulaire "…" est soumis :', 'le formulaire "$1" est soumis :'],
  // Les interactions : des mots contextuels, rangés sous « interaction ».
  ['appuie', 'l\'utilisateur appuie sur "…" :', 'l\'utilisateur appuie sur "$1" :', 'interaction'],
  ['ecrit', 'l\'utilisateur ecrit dans "…" :', 'l\'utilisateur ecrit dans "$1" :', 'interaction'],
  ['arrete ecrire', 'l\'utilisateur arrete d\'ecrire dans "…" :', 'l\'utilisateur arrete d\'ecrire dans "$1" :', 'interaction'],
  ['arrive bas', 'l\'utilisateur arrive en bas de "…" :', 'l\'utilisateur arrive en bas de "$1" :', 'interaction'],
  ['ordre change', 'l\'ordre de … change :', 'l\'ordre de $1 change :', 'interaction'],
];

const STYLES = new Set(['couleur', 'fond', 'texte', 'taille', 'position', 'bordure']);
const OPTIONS_VARIABLE = new Set(['partagee', 'memorisee', 'secret']);
const SUIVIS_DE_A = new Set(['egal', 'inferieur', 'superieur']);
const ACTIONS_ROUTE = ['lire', 'creer', 'modifier', 'supprimer'];

// ─── Les noms du projet ─────────────────────────────────────────────────

const GENRE_DETAIL: Partial<Record<Symbole['genre'], string>> = {
  variable: 'variable',
  calcul: 'calcul',
  partagee: 'variable partagée entre les pages',
  boucle: 'variable de la boucle',
  parametrePage: 'paramètre de la page',
  parametreComposant: 'paramètre du composant',
};

const declaration = (s: Symbole) => `\`\`\`humalis\n${s.texteLigne}\n\`\`\``;

function nom(s: Symbole, genre: GenreProposition, libelle = s.nom, detail = GENRE_DETAIL[s.genre] ?? s.genre): Proposition {
  return { libelle, genre, detail, documentation: declaration(s) };
}

/** Garde la première proposition de chaque libellé. */
function uniques(propositions: Proposition[]): Proposition[] {
  const vus = new Set<string>();
  return propositions.filter((p) => !vus.has(p.libelle) && (vus.add(p.libelle), true));
}

function valeurs(index: Index, ligne: number, marge: number): Proposition[] {
  return [
    ...variablesVisibles(index, ligne, marge).map((s) => nom(s, 'variable')),
    ...mots(['champ'], 'expression', () => ({ insertion: 'champ "$1"', extrait: true })),
    ...mots(['nombre'], 'expression', () => ({ libelle: 'nombre de', insertion: 'nombre de ', filtre: 'nombre de' })),
    ...mots(['vrai', 'faux', 'rien'], 'expression'),
  ];
}

// ─── La place du curseur ────────────────────────────────────────────────

export function completer(index: Index, ligne: number, colonne: number): Completion {
  const { doc } = principal(index.projet);
  const lignes = doc.lignes;
  const texte = lignes[ligne - 1] ?? '';
  const avantCurseur = texte.slice(0, colonne - 1);
  const aucune = { debut: colonne, propositions: [] };
  if (dansStyle(lignes, ligne)) return aucune;
  const marge = indentation(texte);
  const chaine = entetes(lignes, ligne, marge);
  const genre = genreBloc(lignes, chaine);

  // Dans un texte entre guillemets : des noms de pages, de routes, d'éléments.
  const guillemets = (avantCurseur.match(/"/g) ?? []).length;
  if (guillemets % 2 === 1) {
    const ouverture = avantCurseur.lastIndexOf('"');
    const avant = jetonsDeLigne(avantCurseur.slice(0, ouverture), ligne).filter((j) => j.type !== 'LIAISON');
    const motsAvant = avant.map((j) => normaliser(texteJeton(j)));
    const precedent = motsAvant[motsAvant.length - 1];
    const premier = motsAvant[0];
    const debut = ouverture + 2;
    const routes = () => uniques(symbolesDe(index, 'route').map((s) => nom(s, 'route', s.nom, 'route du serveur')));
    if (precedent === 'vers' && motsAvant.includes('requete')) return { debut, propositions: routes() };
    if ((premier === 'modifier' || premier === 'supprimer') && motsAvant.length >= 2) return { debut, propositions: routes() };
    if (precedent === 'vers') {
      return { debut, propositions: uniques(symbolesDe(index, 'page').map((s) => nom(s, 'page', s.nom, 'page'))) };
    }
    if (precedent === 'sur' || precedent === 'survole' || (precedent === 'champ' && motsAvant.length > 1)) {
      const elements = elementsDeLaPage(index, ligne).filter((s) => precedent !== 'champ' || s.element === 'champ');
      return {
        debut,
        propositions: uniques(elements.map((s) => nom(s, 'element', s.nomElement ?? s.libelle ?? s.nom, s.element))),
      };
    }
    return { debut, propositions: [] };
  }

  const prefixe = avantCurseur.match(/[\p{L}_][\p{L}0-9_]*$/u)?.[0] ?? '';
  const debut = colonne - prefixe.length;
  const avantMot = avantCurseur.slice(0, debut - 1);
  const resultat = (propositions: Proposition[]) => ({ debut, propositions });

  // « p.nom » : les champs des données du serveur, et l'identifiant.
  if (/[\p{L}0-9_]\.$/u.test(avantMot)) {
    const champs = symbolesDe(index, 'champDonnee').map((s) => nom(s, 'champ', s.nom, `champ de ${s.donnee}`));
    return resultat(uniques([...champs, { libelle: 'id', genre: 'champ', detail: "l'identifiant de la donnée" }]));
  }

  const jetons = jetonsDeLigne(avantMot, ligne).filter((j) => j.type !== 'LIAISON');
  const motsAvant = jetons.map((j) => (j.type === 'CHAINE' ? '"' : normaliser(texteJeton(j))));
  const premier = motsAvant[0];
  const precedent = motsAvant[motsAvant.length - 1];

  // Un graphique : son genre après « graphique en », ses options après « avec » ou « et », ses séries dans son bloc.
  if (premier === 'graphique' && precedent === 'en' && motsAvant.length === 2) return resultat(mots(GENRES_GRAPHIQUE, 'miseEnPage'));
  if (premier === 'graphique' && (precedent === 'avec' || precedent === 'et')) return resultat(mots(OPTIONS_GRAPHIQUE, 'option'));
  if (motsAvant.length === 0 && chaine.length > 0 && premierMot(lignes[chaine[0] - 1] ?? '') === 'graphique') {
    return resultat(mots(['serie'], 'miseEnPage', () => ({ insertion: 'serie "$1" valeur ${2:champ}', extrait: true })));
  }

  // En début de ligne.
  if (motsAvant.length === 0) {
    switch (genre) {
      case 'fichier':
        return resultat([
          ...mots(['page', 'composant', 'serveur', 'variable', 'utiliser', 'style'], 'partout'),
          // Les langues du site (plan qualité, partie 1) : « langues : », « traductions anglais : ».
          ...mots(['langues'], 'declaration', () => ({ insertion: 'langues :\n    francais\n    anglais', extrait: true })),
          ...mots(['traductions'], 'declaration', () => ({ libelle: 'traductions anglais', insertion: 'traductions anglais :\n    "$1" : "$2"', extrait: true, filtre: 'traductions' })),
        ]);
      case 'serveur':
        return resultat(mots(['donnee', 'route'], 'serveur'));
      case 'route':
        return resultat([
          ...mots(['tout'], 'route', () => ({ libelle: 'tout le monde peut', insertion: 'tout le monde peut ', filtre: 'tout le monde peut' })),
          ...mots(['connecte'], 'route', (e) => ({ libelle: `${e.accentue ?? e.mot} peut`, insertion: `${e.accentue ?? e.mot} peut `, filtre: 'connecte peut' })),
          ...mots(['seul'], 'route', () => ({ libelle: 'seul admin peut', insertion: 'seul admin peut ', filtre: 'seul admin peut' })),
        ]);
      case 'donnee':
      case 'style':
        return resultat([]);
      case 'evenement':
        return resultat(motsEnTete(true));
      case 'vue': {
        const racine = enteteRacine(lignes, chaine);
        const dansComposant = racine !== undefined && premierMot(lignes[racine - 1]) === 'composant';
        const composants = index.symboles
          .filter((s) => s.genre === 'composant' || s.genre === 'composantReact')
          .map((s) => nom(s, 'composant', s.nom, s.genre === 'composant' ? 'composant Humalis' : 'composant React'));
        return resultat(
          uniques([
            ...motsEnTete(false),
            ...(dansComposant && chaine.length === 1 ? mots(['parametre'], 'composant') : []),
            ...composants,
          ]),
        );
      }
    }
  }

  if (premier === 'utiliser' && motsAvant.length === 1) return resultat(mots(['fichier', 'composant', 'style', 'donnees'], 'declaration'));
  if ((premier === 'variable' || premier === 'calcul') && motsAvant.length === 1) return resultat([]);
  if (premier === 'pour' && precedent === 'chaque') return resultat([]);

  if (genre === 'donnee') return resultat(motsAvant.includes(':') ? mots(VOCABULAIRE.filter((e) => e.contextes.includes('donnee')).map((e) => e.mot), 'donnee') : []);
  if (genre === 'serveur' || genre === 'style') return resultat([]);
  if (genre === 'route') {
    if (precedent === 'peut' || precedent === 'et') return resultat(mots(ACTIONS_ROUTE, 'route'));
    if (motsAvant.includes('peut')) return resultat(uniques(symbolesDe(index, 'donnee').map((s) => nom(s, 'donnee', s.nom, 'donnée du serveur'))));
    return resultat(mots(['peut'], 'route'));
  }

  // « quand … » : les tournures d'un événement, qui remplacent tout ce qui suit « quand ».
  if (premier === 'quand' && !motsAvant.includes(':')) {
    const apresQuand = jetons[0].colonne + 'quand'.length + 1;
    return {
      debut: apresQuand,
      propositions: EVENEMENTS.flatMap(([m, libelle, insertion, contexte]) => {
        const e = entree(m, (contexte ?? 'evenement') as Contexte);
        return e && supporte(e) ? [{ ...mot(e), libelle, insertion, extrait: true, genre: 'evenement' as const, filtre: libelle }] : [];
      }),
    };
  }

  if (precedent === 'est') {
    if (motsAvant[motsAvant.length - 2] === 'utilisateur') return resultat(mots(['connecte', 'admin'], 'session'));
    // « si langue est anglais » : les langues du bloc « langues ».
    if (motsAvant[motsAvant.length - 2] === 'langue' && declareDesLangues(lignes)) return resultat(mots(languesDeclarees(lignes), 'tournure'));
    const comparaisons = VOCABULAIRE.filter((e) => supporte(e) && (e.contextes.includes('comparaison') || e.contextes.includes('tournure') && ['plus grand que', 'plus petit que', 'different'].includes(e.mot)) && e.categorie === 'comparaison');
    return resultat([
      ...comparaisons.map((e) =>
        SUIVIS_DE_A.has(e.mot) ? mot(e, { libelle: `${e.accentue ?? e.mot} à`, insertion: `${e.accentue ?? e.mot} à `, filtre: `${e.mot} a` }) : mot(e),
      ),
      ...mots(['vrai', 'faux', 'rien'], 'expression'),
    ]);
  }

  if (motsAvant.includes('avec')) {
    if (premier === 'variable' || premier === 'calcul') {
      return resultat(precedent === 'en' ? mots(['secret'], 'option') : mots(['partagee', 'memorisee'], 'option'));
    }
    if (precedent !== undefined && STYLES.has(precedent) && ['avec', 'et'].includes(motsAvant[motsAvant.length - 2])) {
      const style = precedent;
      return resultat(VOCABULAIRE.filter((e) => supporte(e) && e.valeurDe?.includes(style)).map((e) => mot(e)));
    }
    if (precedent === 'avec' || precedent === 'et') {
      const composant = index.symboles.find((s) => s.genre === 'composant' && s.nom === texteJeton(jetons[0]));
      if (composant) {
        const parametres = index.symboles.filter((s) => s.genre === 'parametreComposant' && s.entete === composant.ligne && s.fichier === composant.fichier);
        return resultat(parametres.map((s) => nom(s, 'parametre')));
      }
      const options = VOCABULAIRE.filter(
        (e) => supporte(e) && e.contextes.includes('option') && ['option', 'style'].includes(e.categorie) && !OPTIONS_VARIABLE.has(e.mot),
      );
      return resultat(uniques(options.map((e) => mot(e))));
    }
  }

  if (precedent === 'rediriger') return resultat(mots(['vers'], 'partout'));
  if (precedent === 'envoyer') return resultat(mots(['requete'], 'instruction'));
  // « changer langue par anglais ».
  if (premier === 'changer' && motsAvant[1] === 'langue' && precedent === 'par' && declareDesLangues(lignes)) return resultat(mots(languesDeclarees(lignes), 'tournure'));
  if (precedent === '"') {
    // Après un texte, sa version dans une autre langue du bloc « langues » : « en anglais "…" ».
    const versions = declareDesLangues(lignes)
      ? languesDeclarees(lignes)
          .slice(1)
          .flatMap((l) => mots(['en'], 'tournure', () => ({ libelle: `en ${l} "…"`, insertion: `en ${l} "$1"`, extrait: true, filtre: `en ${l}` })))
      : [];
    return resultat([...mots(premier === 'lien' ? ['vers', 'avec'] : ['avec'], 'partout'), ...versions]);
  }

  return resultat(uniques(valeurs(index, ligne, marge)));
}
