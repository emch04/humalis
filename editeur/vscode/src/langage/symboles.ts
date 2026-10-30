/**
 * Les symboles du document ouvert : le plan que l'éditeur montre (pages,
 * composants, serveur avec ses données et ses routes, variables
 * partagées), chacun avec le bloc qu'il couvre.
 */
import { indentation } from './document.js';
import { principal } from './projet.js';
import type { Lieu } from './definition.js';
import type { Index, Symbole } from './portees.js';

export type GenreSymboleDocument =
  | 'page'
  | 'composant'
  | 'composantReact'
  | 'serveur'
  | 'donnee'
  | 'champ'
  | 'route'
  | 'variable'
  | 'parametre';

export interface SymboleDocument {
  nom: string;
  genre: GenreSymboleDocument;
  /** Première et dernière ligne du bloc (incluses). */
  debut: number;
  fin: number;
  /** La colonne juste après la fin de la dernière ligne. */
  finColonne: number;
  /** Le nom lui-même. */
  selection: Lieu;
  enfants: SymboleDocument[];
}

/** La dernière ligne du bloc ouvert par la ligne `ligne` (elle-même si rien n'est indenté dessous). */
export function finDuBloc(lignes: readonly string[], ligne: number): number {
  const marge = indentation(lignes[ligne - 1] ?? '');
  let fin = ligne;
  for (let k = ligne + 1; k <= lignes.length; k++) {
    const texte = lignes[k - 1];
    if (texte.trim() === '') continue;
    if (indentation(texte) <= marge) break;
    fin = k;
  }
  return fin;
}

export function symbolesDuDocument(index: Index): SymboleDocument[] {
  const { chemin, doc } = principal(index.projet);
  const lignes = doc.lignes;
  const ici = index.symboles.filter((s) => s.fichier === chemin);
  const vers = (s: Symbole, genre: GenreSymboleDocument, enfants: SymboleDocument[] = [], bloc = true): SymboleDocument => {
    const fin = bloc ? finDuBloc(lignes, s.ligne) : s.ligne;
    return {
      nom: s.nom,
      genre,
      debut: s.ligne,
      fin,
      finColonne: (lignes[fin - 1] ?? '').length + 1,
      selection: { ...(s.fichier !== undefined ? { fichier: s.fichier } : {}), ligne: s.ligne, colonne: s.colonne, fin: s.fin },
      enfants,
    };
  };
  const de = (genre: Symbole['genre']) => ici.filter((s) => s.genre === genre);
  const resultat: SymboleDocument[] = [
    ...de('partagee').map((s) => vers(s, 'variable', [], false)),
    ...de('composantReact').map((s) => vers(s, 'composantReact', [], false)),
    ...de('composant').map((c) =>
      vers(
        c,
        'composant',
        ici.filter((s) => s.genre === 'parametreComposant' && s.entete === c.ligne).map((s) => vers(s, 'parametre', [], false)),
      ),
    ),
    ...de('page').map((p) =>
      vers(p, 'page', [
        ...ici.filter((s) => s.genre === 'parametrePage' && s.entete === p.ligne).map((s) => vers(s, 'parametre', [], false)),
        ...ici
          .filter((s) => (s.genre === 'variable' || s.genre === 'calcul') && s.entete === p.ligne)
          .map((s) => vers(s, 'variable', [], false)),
      ]),
    ),
    ...de('serveur').map((serveur) => {
      const fin = finDuBloc(lignes, serveur.ligne);
      const dedans = (s: Symbole) => s.ligne > serveur.ligne && s.ligne <= fin;
      return vers(serveur, 'serveur', [
        ...de('donnee')
          .filter(dedans)
          .map((d) => vers(d, 'donnee', de('champDonnee').filter((c) => c.donnee === d.nom && dedans(c)).map((c) => vers(c, 'champ', [], false)))),
        ...de('route').filter(dedans).map((r) => vers(r, 'route')),
      ]);
    }),
  ];
  const parLigne = (a: SymboleDocument, b: SymboleDocument) => a.debut - b.debut;
  const trier = (liste: SymboleDocument[]): SymboleDocument[] =>
    liste.sort(parLigne).map((s) => ({ ...s, enfants: trier(s.enfants) }));
  return trier(resultat);
}
