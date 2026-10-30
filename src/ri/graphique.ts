/**
 * Un graphique dans la représentation intermédiaire (plan des médias, 4.1) :
 * la forme en ligne devient un bloc à une seule série, les couleurs et les
 * devises prennent leur forme canonique.
 */
import type { Expression, Graphique, LitteralChaine } from '../parser/ast.js';
import { normaliser } from '../lexer/motsCles.js';
import { optionCanonique } from '../analyse/styles.js';
import { DEVISES } from '../cibles/format.js';
import type { GraphiqueRI, TexteEnLangues, Valeur } from './types.js';

const NOMS_GENRES = { courbe: 'Graphique en courbe', barres: 'Graphique en barres', camembert: 'Graphique en camembert' } as const;

/** « montant » devient « Montant » : l'en-tête d'une colonne de la table de données. */
const enTete = (champ: string) => champ.charAt(0).toUpperCase() + champ.slice(1).replace(/_/g, ' ');

/**
 * `langues` donne un texte dans chaque langue du site (rien sans bloc
 * « langues ») : `serie` pour un texte du programme, `message` pour un
 * message intégré (« Graphique en courbe », « Valeur », « Libellé »).
 */
export interface LanguesGraphique {
  serie: (texte: LitteralChaine) => TexteEnLangues | undefined;
  message: (fr: string) => TexteEnLangues | undefined;
}

export function graphiqueDe(g: Graphique, id: string, valeur: (e: Expression) => Valeur, couleursTheme: ReadonlySet<string>, langues?: LanguesGraphique): GraphiqueRI {
  const couleur = (nom: string | undefined) => {
    if (nom === undefined) return {};
    const option = optionCanonique('couleur', nom, couleursTheme);
    return 'erreur' in option ? {} : { couleur: option.valeur };
  };
  // La forme en ligne est un bloc à une seule série, nommée d'après son champ.
  const series = g.series.length > 0
    ? g.series.map((s) => {
        const nomLangues = langues?.serie(s.texteNom ?? { type: 'Chaine', parties: [{ type: 'texte', valeur: s.nom }], ligne: s.ligne });
        return { nom: s.nom, ...(nomLangues ? { nomLangues } : {}), ...(s.valeur ? { valeur: s.valeur.champ } : {}), ...couleur(s.couleur) };
      })
    : [{ nom: g.valeur ? enTete(g.valeur.champ) : 'Valeur', ...(g.valeur ? {} : langues?.message('Valeur') ? { nomLangues: langues.message('Valeur')! } : {}), ...(g.valeur ? { valeur: g.valeur.champ } : {}), ...couleur(g.couleur) }];
  const mot = g.valeur?.devise ?? g.series.find((s) => s.valeur?.devise)?.valeur?.devise;
  const devise = mot !== undefined ? DEVISES[normaliser(mot)] : undefined;
  return {
    type: 'graphique',
    id,
    genre: g.genre,
    liste: valeur(g.liste),
    ...(g.etiquette !== undefined ? { etiquette: g.etiquette } : {}),
    ...(g.etiquettes ? { etiquettes: valeur(g.etiquettes) } : {}),
    nomEtiquettes: g.etiquette !== undefined ? enTete(g.etiquette) : 'Libellé',
    ...(g.etiquette === undefined && langues?.message('Libellé') ? { nomEtiquettesLangues: langues.message('Libellé')! } : {}),
    series,
    ...(devise ? { devise } : {}),
    titre: NOMS_GENRES[g.genre],
    ...(langues?.message(NOMS_GENRES[g.genre]) ? { titreLangues: langues.message(NOMS_GENRES[g.genre])! } : {}),
    description: valeur(g.description ?? { type: 'Chaine', parties: [], ligne: g.ligne }),
    ...(g.proportions ? { proportions: g.proportions } : {}),
    classes: g.classes,
    ligne: g.ligne,
  };
}
