import { Token, PartieChaine, ErreurLexicale } from './types.js';
import { formeCanonique, estMotLiaison, estElision, estMotReserve } from './motsCles.js';
import { estFormeConnue } from '../vocabulaire/recherche.js';

/** Le mot (lettres, chiffres, _) qui commence à la position `debut`. */
function lireMot(ligne: string, debut: number): string {
  let fin = debut;
  while (fin < ligne.length && /[\p{L}0-9_]/u.test(ligne[fin])) fin++;
  return ligne.slice(debut, fin);
}

/**
 * « sous-titre » : si le mot est suivi de « -mot » (sans espace) et que
 * l'ensemble, sans ses traits d'union, est un mot du vocabulaire, renvoie
 * l'ensemble tel qu'il est écrit. Sinon null : « prix-remise » reste une
 * soustraction, qu'on écrit plutôt « prix - remise ».
 */
function motColle(ligne: string, debut: number, premier: string): string | null {
  const morceaux = [premier];
  let fin = debut + premier.length;
  while (ligne[fin] === '-' && /\p{L}/u.test(ligne[fin + 1] ?? '')) {
    const suivant = lireMot(ligne, fin + 1);
    morceaux.push(suivant);
    fin += 1 + suivant.length;
  }
  // La tournure la plus longue d'abord.
  for (let n = morceaux.length; n > 1; n--) {
    const ensemble = morceaux.slice(0, n).join('-');
    if (estFormeConnue(ensemble.replace(/-/g, ''))) return ensemble;
  }
  return null;
}

/**
 * Le guillemet qui ferme un {code "…"} ou un {accent "…"} commencé à `debut` : le premier « "} »
 * où les accolades du contenu sont équilibrées ({code "{accent "…"}"}), sinon le premier « "} »
 * ({code "{"}). -1 s'il n'y en a pas.
 */
function finDuMorceau(texte: string, debut: number): number {
  let profondeur = 0;
  for (let j = debut; j < texte.length; j++) {
    if (texte.startsWith('"}', j) && profondeur <= 0) return j;
    if (texte[j] === '{') profondeur++;
    if (texte[j] === '}') profondeur--;
  }
  return texte.indexOf('"}', debut);
}

function decouperChaine(
  valeur: string,
  ligne: number,
  colonne: number,
): PartieChaine[] {
  const parties: PartieChaine[] = [];
  let tampon = '';
  let i = 0;

  while (i < valeur.length) {
    if (valeur[i] === '{') {
      if (tampon !== '') {
        parties.push({ type: 'texte', valeur: tampon });
        tampon = '';
      }
      i++;
      let nomVariable = '';
      // {code "…"} et {accent "…"} : le morceau va jusqu'au premier « "} ».
      const morceau = /^(code|accent)\s*"/.exec(valeur.slice(i));
      const finMorceau = morceau ? finDuMorceau(valeur, i + morceau[0].length) : -1;
      if (finMorceau >= 0) {
        nomVariable = valeur.slice(i, finMorceau + 1);
        i = finMorceau + 1;
      }
      while (i < valeur.length && valeur[i] !== '}') {
        nomVariable += valeur[i];
        i++;
      }
      if (i >= valeur.length) {
        throw new ErreurLexicale(
          'accolade non fermée dans la chaîne : il manque }',
          ligne,
          colonne,
        );
      }
      i++;
      const accent = /^accent\b(.*)$/s.exec(nomVariable.trim());
      if (accent) {
        const contenu = /^\s*"([\s\S]*)"\s*$/.exec(accent[1]);
        if (!contenu) throw new ErreurLexicale('accent attend un texte entre guillemets : {accent "mot"}.', ligne, colonne);
        parties.push({ type: 'accent', valeur: contenu[1] });
      } else if (/^code\s+\S/s.test(nomVariable.trim())) {
        const contenu = /^code\s+"([\s\S]*)"\s*$/.exec(nomVariable.trim());
        if (!contenu) throw new ErreurLexicale('code attend un texte entre guillemets : {code "titre"}.', ligne, colonne);
        parties.push({ type: 'code', valeur: contenu[1] });
      } else parties.push({ type: 'variable', valeur: nomVariable.trim() });
      continue;
    }
    tampon += valeur[i];
    i++;
  }

  if (tampon !== '') {
    parties.push({ type: 'texte', valeur: tampon });
  }

  return parties;
}

export function analyser(source: string): Token[] {
  const tokens: Token[] = [];
  const lignes = source.split('\n');
  const pile: number[] = [0];

  for (let numLigne = 0; numLigne < lignes.length; numLigne++) {
    const ligne = lignes[numLigne];
    let i = 0;

    const codeBrut = /^( *)(code)(?: +([\p{L}][\p{L}0-9_]*))? *: *$/u.exec(ligne);
    if (codeBrut) {
      const contenu: string[] = [];
      const indentation = codeBrut[1].length;
      if (indentation % 4 !== 0) throw new ErreurLexicale('indentation incohérente : un multiple de 4 est attendu', numLigne + 1, 1);
      const niveau = indentation / 4;
      const courant = pile[pile.length - 1];
      if (niveau > courant + 1) throw new ErreurLexicale('indentation incohérente : un seul niveau à la fois', numLigne + 1, 1);
      if (niveau === courant + 1) {
        pile.push(niveau);
        tokens.push({ type: 'INDENT', valeur: '', ligne: numLigne + 1, colonne: 1 });
      } else while (pile.length > 1 && pile[pile.length - 1] > niveau) {
        pile.pop();
        tokens.push({ type: 'DEDENT', valeur: '', ligne: numLigne + 1, colonne: 1 });
      }
      if (pile[pile.length - 1] !== niveau) throw new ErreurLexicale('indentation incohérente : ce niveau ne correspond à aucun bloc ouvert', numLigne + 1, 1);
      while (numLigne + 1 < lignes.length) {
        const suivante = lignes[numLigne + 1];
        const marge = suivante.length - suivante.trimStart().length;
        if (suivante.trim() !== '' && marge <= indentation) break;
        contenu.push(lignes[++numLigne]);
      }
      while (contenu.length && contenu[contenu.length - 1].trim() === '') contenu.pop();
      const marge = Math.min(...contenu.filter((l) => l.trim() !== '').map((l) => l.length - l.trimStart().length));
      const brut = contenu.map((l) => l.slice(Math.min(marge, l.length - l.trimStart().length))).join('\n');
      const ligneDebut = numLigne - contenu.length + 1;
      tokens.push(
        { type: 'MOT_CLE', valeur: 'code', ligne: ligneDebut, colonne: indentation + 1, reserve: false, original: 'code' },
        ...(codeBrut[3] ? [{ type: 'IDENTIFIANT' as const, valeur: codeBrut[3], ligne: ligneDebut, colonne: indentation + 6 }] : []),
        { type: 'PONCTUATION', valeur: ':', ligne: ligneDebut, colonne: ligne.indexOf(':') + 1 },
        { type: 'FIN_LIGNE', valeur: '', ligne: ligneDebut, colonne: ligne.length + 1 },
        { type: 'CODE_BRUT', valeur: brut, ligne: ligneDebut + 1, colonne: 1 },
        { type: 'FIN_LIGNE', valeur: '', ligne: numLigne + 1, colonne: 1 },
      );
      continue;
    }

    // « style : » au début d'une ligne, hors de tout bloc : les lignes
    // indentées qui suivent sont du CSS, recopié tel quel. Il contient des
    // {, des : et des # qui ne doivent pas être lus comme du Humalis.
    if (/^style\s*:\s*$/i.test(ligne)) {
      // Juste après un bloc de haut de fichier (« theme : »), ce bloc se ferme ici.
      while (pile.length > 1) {
        pile.pop();
        tokens.push({ type: 'DEDENT', valeur: '', ligne: numLigne + 1, colonne: 1 });
      }
      const debut = numLigne;
      const contenu: string[] = [];
      while (numLigne + 1 < lignes.length && (lignes[numLigne + 1].trim() === '' || /^\s/.test(lignes[numLigne + 1]))) {
        contenu.push(lignes[++numLigne]);
      }
      while (contenu.length > 0 && contenu[contenu.length - 1].trim() === '') contenu.pop();
      const marge = Math.min(
        ...contenu.filter((l) => l.trim() !== '').map((l) => l.length - l.trimStart().length),
      );
      const css = contenu.map((l) => l.slice(Math.min(marge, l.length - l.trimStart().length))).join('\n');
      const ligneDebut = debut + 1;
      tokens.push(
        { type: 'MOT_CLE', valeur: 'style', ligne: ligneDebut, colonne: 1, reserve: false, original: ligne.trim().split(/\s|:/)[0] },
        { type: 'PONCTUATION', valeur: ':', ligne: ligneDebut, colonne: ligne.indexOf(':') + 1 },
        { type: 'FIN_LIGNE', valeur: '', ligne: ligneDebut, colonne: ligne.length + 1 },
        { type: 'CSS', valeur: css, ligne: ligneDebut + 1, colonne: 1 },
        { type: 'FIN_LIGNE', valeur: '', ligne: numLigne + 1, colonne: 1 },
      );
      continue;
    }

    // Une ligne vide ou qui ne contient qu'un commentaire ne compte pas
    // pour l'indentation.
    if (ligne.trim() === '' || ligne.trim().startsWith('#')) {
      continue;
    }

    if (ligne.startsWith('\t')) {
      throw new ErreurLexicale(
        'tabulation interdite : utilisez 4 espaces par niveau',
        numLigne + 1,
        1,
      );
    }

    const espaces = ligne.length - ligne.trimStart().length;

    if (espaces % 4 !== 0) {
      throw new ErreurLexicale(
        `indentation incohérente : ${espaces} espaces trouvés, un multiple de 4 est attendu`,
        numLigne + 1,
        1,
      );
    }

    const niveau = espaces / 4;
    const niveauCourant = pile[pile.length - 1];

    if (niveau > niveauCourant) {
      if (niveau !== niveauCourant + 1) {
        throw new ErreurLexicale(
          'indentation incohérente : un seul niveau à la fois',
          numLigne + 1,
          1,
        );
      }
      pile.push(niveau);
      tokens.push({
        type: 'INDENT',
        valeur: '',
        ligne: numLigne + 1,
        colonne: 1,
      });
    } else if (niveau < niveauCourant) {
      while (pile.length > 1 && pile[pile.length - 1] > niveau) {
        pile.pop();
        tokens.push({
          type: 'DEDENT',
          valeur: '',
          ligne: numLigne + 1,
          colonne: 1,
        });
      }
      if (pile[pile.length - 1] !== niveau) {
        throw new ErreurLexicale(
          'indentation incohérente : ce niveau ne correspond à aucun bloc ouvert',
          numLigne + 1,
          1,
        );
      }
    }

    while (i < ligne.length) {
      const c = ligne[i];

      if (c === ' ') {
        i++;
        continue;
      }

      // Commentaire : tout ce qui suit # est ignoré, jusqu'à la fin de
      // la ligne. Un # à l'intérieur d'une chaîne est traité plus bas,
      // avec la chaîne.
      if (c === '#') {
        break;
      }

      if (c === '"') {
        const debut = i;
        i++;
        let valeur = '';
        let profondeur = 0;
        while (i < ligne.length && (ligne[i] !== '"' || (profondeur > 0 && ligne.indexOf('}', i + 1) >= 0))) {
          // {code "…"} et {accent "…"} : recopiés tels quels jusqu'au premier « "} »
          // (accolades, guillemets et antislashs compris).
          const morceau = /^\{(code|accent)\s*"/.exec(ligne.slice(i));
          const fin = morceau ? finDuMorceau(ligne, i + morceau[0].length) : -1;
          if (fin >= 0) {
            valeur += ligne.slice(i, fin + 2);
            i = fin + 2;
            continue;
          }
          // \" écrit un guillemet dans le texte ; tout autre antislash reste tel quel
          // (« \\ » aussi, en entier : un texte peut finir par lui, comme avant).
          if (ligne[i] === '\\' && ligne[i + 1] === '\\') {
            valeur += '\\\\';
            i += 2;
            continue;
          }
          if (ligne[i] === '\\' && ligne[i + 1] === '"') i++;
          if (ligne[i] === '{') profondeur++;
          if (ligne[i] === '}' && profondeur > 0) profondeur--;
          valeur += ligne[i];
          i++;
        }
        if (i >= ligne.length) {
          throw new ErreurLexicale(
            'chaîne de caractères non fermée (guillemet manquant)',
            numLigne + 1,
            debut + 1,
          );
        }
        i++;
        tokens.push({
          type: 'CHAINE',
          valeur,
          ligne: numLigne + 1,
          colonne: debut + 1,
          parties: decouperChaine(valeur, numLigne + 1, debut + 1),
        });
        continue;
      }

      if (/[0-9]/.test(c)) {
        const debut = i;
        let valeur = '';
        while (i < ligne.length && /[0-9]/.test(ligne[i])) {
          valeur += ligne[i];
          i++;
        }
        // « 2,5 » ou « 2.5 » (décision L1) : une virgule ou un point collé
        // entre deux chiffres. Dans une liste, la virgule est suivie d'une
        // espace (« [12, 15] ») : elle sépare toujours les éléments.
        if ((ligne[i] === ',' || ligne[i] === '.') && /[0-9]/.test(ligne[i + 1] ?? '')) {
          valeur += '.';
          i++;
          while (i < ligne.length && /[0-9]/.test(ligne[i])) {
            valeur += ligne[i];
            i++;
          }
        }
        tokens.push({
          type: 'NOMBRE',
          valeur,
          ligne: numLigne + 1,
          colonne: debut + 1,
        });
        continue;
      }

      if (/[\p{L}_]/u.test(c)) {
        const debut = i;
        let valeur = lireMot(ligne, i);
        i += valeur.length;

        // Élision : « l'utilisateur » — le déterminant et l'apostrophe sont
        // marqués comme liaison ; le mot qui suit vient au tour suivant.
        if (ligne[i] === "'" && estElision(valeur)) {
          i++;
          tokens.push({
            type: 'LIAISON',
            valeur: `${valeur.toLowerCase()}'`,
            ligne: numLigne + 1,
            colonne: debut + 1,
            original: `${valeur}'`,
          });
          continue;
        }

        // Petit mot sans valeur pour le compilateur : « si le champ » se lit
        // « si champ ». Il est marqué (avec « à » distinct de « a »), et le
        // parser le saute (décision Q3).
        if (estMotLiaison(valeur)) {
          tokens.push({
            type: 'LIAISON',
            valeur: valeur.toLowerCase(),
            ligne: numLigne + 1,
            colonne: debut + 1,
            original: valeur,
          });
          continue;
        }

        // « sous-titre » : un mot du vocabulaire écrit avec des traits
        // d'union est collé (décision Q12). Ailleurs, le - reste un moins.
        const colle = motColle(ligne, debut, valeur);
        const original = colle ?? valeur;
        if (colle) {
          i = debut + colle.length;
          valeur = colle.replace(/-/g, '');
        }

        // Les mots-clés sont stockés sous leur forme canonique (sans
        // accent, au masculin singulier) pour que le parser n'ait qu'une
        // seule orthographe à comparer.
        const canonique = formeCanonique(valeur);
        if (canonique) {
          tokens.push({
            type: 'MOT_CLE',
            valeur: canonique,
            ligne: numLigne + 1,
            colonne: debut + 1,
            reserve: estMotReserve(canonique),
            original,
          });
        } else {
          tokens.push({
            type: 'IDENTIFIANT',
            valeur,
            ligne: numLigne + 1,
            colonne: debut + 1,
            ...(colle ? { original } : {}),
          });
        }
        continue;
      }

      tokens.push({
        type: 'PONCTUATION',
        valeur: c,
        ligne: numLigne + 1,
        colonne: i + 1,
      });
      i++;
    }

    tokens.push({
      type: 'FIN_LIGNE',
      valeur: '',
      ligne: numLigne + 1,
      colonne: ligne.length + 1,
    });
  }

  while (pile.length > 1) {
    pile.pop();
    tokens.push({
      type: 'DEDENT',
      valeur: '',
      ligne: lignes.length,
      colonne: 1,
    });
  }

  tokens.push({
    type: 'FIN_FICHIER',
    valeur: '',
    ligne: lignes.length,
    colonne: 1,
  });

  return tokens;
}
