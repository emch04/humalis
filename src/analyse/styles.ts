import { normaliser } from '../lexer/motsCles.js';
import { VOCABULAIRE } from '../vocabulaire/table.js';
import { proposerNom } from './suggestions.js';

/**
 * Le jeu de styles nommés commun à toutes les cibles (décision W2) :
 * chaque cible traduit ces valeurs à sa façon (classes CSS pour le web,
 * StyleSheet pour Expo plus tard). Les styles, leurs valeurs et leurs
 * accords viennent de la table de vocabulaire (`src/vocabulaire/table.ts`).
 */
interface Option {
  valeurs: string[];
  /** Accords et variantes ramenés à la valeur canonique (« bleue » → « bleu »). */
  accords: Record<string, string>;
}

const styles = VOCABULAIRE.filter((e) => e.categorie === 'style' && e.statut === 'supporte' && e.contextes.includes('option') && e.mot !== 'style');
const valeurs = VOCABULAIRE.filter((e) => e.categorie === 'valeurStyle' && e.statut === 'supporte');

export const OPTIONS: Record<string, Option> = Object.fromEntries(
  styles.map((style) => {
    const siennes = valeurs.filter((v) => v.valeurDe?.includes(style.mot));
    return [
      style.mot,
      {
        valeurs: siennes.map((v) => v.mot),
        accords: Object.fromEntries(siennes.flatMap((v) => v.variantes.map((a) => [a, v.mot]))),
      },
    ];
  }),
);

/** Les éléments sur lesquels certaines options se règlent seulement (`colonnes` : la grille). */
export const SUR_ELEMENTS: Record<string, readonly string[]> = Object.fromEntries(
  styles.filter((e) => e.surElements).map((e) => [e.mot, e.surElements!]),
);

/** Les options dont la valeur est libre : vérifiées avec l'élément (`analyse/ecran.ts`). */
const LIBRES = new Set(styles.filter((e) => e.valeurLibre).map((e) => e.mot));

/** Les directions d'un dégradé ; la diagonale est celle qu'on n'écrit pas. */
const DIRECTIONS_DEGRADE: Record<string, string> = { vertical: 'vertical', verticale: 'vertical', horizontal: 'horizontal', horizontale: 'horizontal', diagonal: 'diagonale', diagonale: 'diagonale' };
export const estDirectionDegrade = (mot: string): boolean => normaliser(mot) in DIRECTIONS_DEGRADE;

/**
 * Dit si l'option se règle sur cet élément (`genre` : `texte`, `bouton`,
 * `grille`, `appareil`…). Renvoie l'erreur à signaler, sinon undefined.
 */
export function erreurSurElement(propriete: string, genre: string): string | undefined {
  const permis = SUR_ELEMENTS[normaliser(propriete)];
  if (!permis || permis.includes(genre)) return undefined;
  return `« ${normaliser(propriete)} » se règle seulement sur : ${permis.join(', ')} (ici, ${genre}).`;
}

/** « nom » et les options d'un champ (obligatoire, indice, minimum, maximum) sont rangées à part par le parser. */
const NOMS_OPTIONS = [...Object.keys(OPTIONS).filter((o) => o !== 'sur'), 'nom', 'obligatoire', 'indice', 'minimum', 'maximum'];

export type ResultatOption =
  | { propriete: string; valeur: string }
  | { erreur: string };

/** La forme canonique d'une option (« Couleur bleue » → couleur bleu), ou l'erreur à signaler. */
export function optionCanonique(propriete: string, valeur: string, couleursTheme: ReadonlySet<string> = new Set()): ResultatOption {
  const nom = normaliser(propriete);
  if (nom === 'degrade') return degrade(valeur, couleursTheme);
  if (LIBRES.has(nom)) return { propriete: nom, valeur };
  const option = OPTIONS[nom];
  if (!option) {
    return {
      erreur: `« ${propriete} » n'est pas une option connue. Options possibles : ${NOMS_OPTIONS.join(', ')}.`,
    };
  }

  const normalisee = normaliser(valeur);
  const canonique = option.accords[normalisee] ?? normalisee;
  // Les couleurs du thème (bloc « theme : ») valent comme les couleurs de base.
  if (['couleur', 'fond', 'texte'].includes(nom) && couleursTheme.has(canonique)) return { propriete: nom, valeur: canonique };
  if (!option.valeurs.includes(canonique)) {
    const themees = ['couleur', 'fond', 'texte'].includes(nom) ? [...couleursTheme] : [];
    if (themees.length > 0) {
      return { erreur: `« ${valeur} » n'est pas une valeur possible pour « ${nom} ». Valeurs possibles : ${option.valeurs.join(', ')}, et les couleurs du thème : ${themees.join(', ')}.${proposerNom(valeur, ['couleur', 'fond', 'texte'].includes(nom) ? [...option.valeurs, ...themees] : [])}` };
    }
    return {
      erreur: `« ${valeur} » n'est pas une valeur possible pour « ${nom} ». Valeurs possibles : ${option.valeurs.join(', ')}.${proposerNom(valeur, ['couleur', 'fond', 'texte'].includes(nom) ? option.valeurs : [])}`,
    };
  }

  return { propriete: nom, valeur: canonique };
}

/**
 * « degrade bleu vers violet vertical » arrive du parser sous la forme
 * « bleu-violet-vertical » (le dernier mot est facultatif). Les couleurs
 * sont celles de base ou du thème ; la direction, vertical, horizontal ou
 * diagonale (par défaut).
 */
function degrade(valeur: string, couleursTheme: ReadonlySet<string>): ResultatOption {
  const [premiere, deuxieme, direction = 'diagonale'] = valeur.split('-');
  const couleur = OPTIONS.couleur;
  const canonique = (c: string | undefined) => (c === undefined ? undefined : (couleur.accords[normaliser(c)] ?? normaliser(c)));
  const a = canonique(premiere);
  const b = canonique(deuxieme);
  const connue = (c: string | undefined) => c !== undefined && (couleur.valeurs.includes(c) || couleursTheme.has(c));
  if (!connue(a) || !connue(b)) {
    const toutes = [...couleur.valeurs, ...couleursTheme].join(', ');
    return { erreur: `un dégradé va d'une couleur à une autre : « degrade bleu vers violet ». Couleurs possibles : ${toutes}.` };
  }
  if (a === b) return { erreur: `un dégradé va d'une couleur à une autre : « ${a} vers ${a} » est une seule couleur. Utilisez « fond ${a} ».` };
  const dir = DIRECTIONS_DEGRADE[normaliser(direction)];
  if (!dir) return { erreur: `« ${direction} » n'est pas une direction de dégradé. Directions possibles : vertical, horizontal (sinon en diagonale).` };
  return { propriete: 'degrade', valeur: `${a}-${b}-${dir}` };
}
