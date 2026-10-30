import { estMotLiaison, estMotReserve, formeCanonique, normaliser } from '../../../src/lexer/motsCles';
import { chercher } from '../../../src/vocabulaire/recherche';

export type ClasseSegment =
  | 'reserve'
  | 'contextuel'
  | 'chaine'
  | 'variable'
  | 'nombre'
  | 'commentaire'
  | 'liaison'
  | 'identifiant'
  | 'neutre';

export interface Segment {
  texte: string;
  classe: ClasseSegment;
}

/**
 * Découpe du code Humalis en segments colorés. Les segments recomposent
 * exactement la source (espaces et sauts de ligne compris), même si le
 * programme est faux : on colore pour lire, pas pour vérifier.
 *
 * Les mots viennent du lexer (`motsCles.ts`) : le site et le compilateur
 * raisonnent pareil sur les accents, les accords et les mots de liaison.
 */
export function colorer(source: string): Segment[] {
  const segments: Segment[] = [];
  const ajouter = (texte: string, classe: ClasseSegment) => {
    if (texte === '') return;
    const dernier = segments[segments.length - 1];
    if (dernier && dernier.classe === classe && classe === 'neutre') dernier.texte += texte;
    else segments.push({ texte, classe });
  };

  // Dans un bloc « serveur », les mots de la table propres au serveur (donnee,
  // route, peut, lire, booleen…) sont colorés comme contextuels, à leur place
  // seulement : le lexer ne les réserve pas, ils restent des noms ailleurs.
  let dansServeur = false;
  let bloc: 'donnee' | 'route' | null = null;
  for (const ligne of source.split(/(?<=\n)/)) {
    const indentation = ligne.length - ligne.trimStart().length;
    const premier = normaliser(ligne.trim().split(/[\s:]/)[0] ?? '');
    if (ligne.trim() !== '' && indentation === 0) {
      dansServeur = premier === 'serveur';
      bloc = null;
    }
    let debutDeBloc = false;
    if (dansServeur && indentation > 0 && (premier === 'donnee' || premier === 'route') && /^\s*\S+\s+\S/.test(ligne)) {
      bloc = premier;
      debutDeBloc = true;
    }
    const contexteDuMot = (mot: string, apresDeuxPoints: boolean): boolean => {
      if (!dansServeur || bloc === null) return false;
      if (debutDeBloc) return normaliser(mot) === bloc && !apresDeuxPoints && ligne.trimStart().startsWith(mot);
      if (bloc === 'route') return chercher(mot, 'route') !== undefined;
      return apresDeuxPoints && chercher(mot, 'donnee') !== undefined;
    };
    colorerLigne(ligne, ajouter, contexteDuMot);
  }
  return segments;
}

function colorerLigne(
  ligne: string,
  ajouter: (texte: string, classe: ClasseSegment) => void,
  contexteDuMot: (mot: string, apresDeuxPoints: boolean) => boolean,
): void {
  let apresDeuxPoints = false;
  let i = 0;
  while (i < ligne.length) {
    const c = ligne[i];

    if (c === '#') {
      ajouter(ligne.slice(i), 'commentaire');
      return;
    }

    if (c === '"') {
      let fin = ligne.indexOf('"', i + 1);
      fin = fin === -1 ? ligne.length : fin + 1;
      colorerChaine(ligne.slice(i, fin), ajouter);
      i = fin;
      continue;
    }

    if (/[0-9]/.test(c)) {
      let fin = i;
      while (fin < ligne.length && /[0-9]/.test(ligne[fin])) fin++;
      ajouter(ligne.slice(i, fin), 'nombre');
      i = fin;
      continue;
    }

    if (/[\p{L}_]/u.test(c)) {
      let fin = i;
      while (fin < ligne.length && /[\p{L}0-9_]/u.test(ligne[fin])) fin++;
      const mot = ligne.slice(i, fin);
      i = fin;
      if (formeCanonique(mot)) {
        ajouter(mot, estMotReserve(mot) ? 'reserve' : 'contextuel');
      } else if (contexteDuMot(mot, apresDeuxPoints)) {
        ajouter(mot, 'contextuel');
      } else if (estMotLiaison(mot)) {
        ajouter(mot, 'liaison');
      } else if (ligne[i] === "'" && /^[ldsnjmtc]$/i.test(mot)) {
        // Élision : « l'utilisateur » ; le lexer écarte « l' ».
        ajouter(mot + "'", 'liaison');
        i++;
      } else {
        ajouter(mot, 'identifiant');
      }
      continue;
    }

    if (c === ':') apresDeuxPoints = true;
    ajouter(c, 'neutre');
    i++;
  }
}

/** Une chaîne entre guillemets, avec ses `{variables}` repérées. */
function colorerChaine(chaine: string, ajouter: (texte: string, classe: ClasseSegment) => void): void {
  let reste = chaine;
  while (reste !== '') {
    const debut = reste.indexOf('{');
    const fin = debut === -1 ? -1 : reste.indexOf('}', debut);
    if (debut === -1 || fin === -1) {
      ajouter(reste, 'chaine');
      return;
    }
    ajouter(reste.slice(0, debut), 'chaine');
    ajouter(reste.slice(debut, fin + 1), 'variable');
    reste = reste.slice(fin + 1);
  }
}
