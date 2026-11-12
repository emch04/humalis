/**
 * Les limites écrites après le type d'un champ de donnée (phrases validées par le mainteneur le 12 novembre 2026) :
 *
 *   prix : nombre entre 0 et 10000        stock : nombre entier au moins 0     remise : nombre au plus 50
 *   nom : texte de 2 a 80 caracteres      resume : texte de 500 caracteres au plus
 *   contact : texte au format email       statut : texte parmi "a", "b" et "c"
 *   photos : liste de texte de 5 elements au plus
 *
 * Les petits mots (« de », « a », « au ») sont déjà sautés par le flux : on lit « 2 80 caracteres »,
 * « moins 0 », « format email ». L'analyse vérifie ensuite que la limite va avec le type du champ.
 */
import type { BornesChamp } from './ast.js';
import { ErreurSyntaxique } from './erreurs.js';
import type { FluxTokens } from './fluxTokens.js';
import { estLeMot } from './miseEnPage.js';
import { normaliser } from '../vocabulaire/normaliser.js';

const EXEMPLES = {
  entre: 'prix : nombre entre 0 et 10000',
  moins: 'stock : nombre au moins 0',
  caracteres: 'nom : texte de 2 a 80 caracteres, ou resume : texte de 500 caracteres au plus',
  elements: 'photos : liste de texte de 5 elements au plus',
  format: 'contact : texte au format email (ou telephone, ou adresse web)',
  parmi: 'statut : texte parmi "brouillon", "en_vente" et "epuise"',
};

function incomplete(exemple: string, ligne: number): never {
  throw new ErreurSyntaxique(`cette limite n’est pas complète. On écrit par exemple : ${exemple}`, ligne);
}

const estUnNombre = (flux: FluxTokens, decalage: number): boolean =>
  flux.regarder(decalage).type === 'NOMBRE' || (flux.regarder(decalage).type === 'PONCTUATION' && flux.regarder(decalage).valeur === '-' && flux.regarder(decalage + 1).type === 'NOMBRE');

/** Un nombre, avec son signe : « -20 », « 45,5 ». */
function lireNombre(flux: FluxTokens): number {
  const negatif = flux.actuel().type === 'PONCTUATION' && flux.actuel().valeur === '-';
  if (negatif) flux.avancer();
  const valeur = Number(flux.avancer().valeur);
  return negatif ? -valeur : valeur;
}

const motDe = (flux: FluxTokens, decalage: number): string => {
  const jeton = flux.regarder(decalage);
  return jeton.type === 'MOT_CLE' || jeton.type === 'IDENTIFIANT' ? normaliser(jeton.original ?? jeton.valeur) : '';
};
const CARACTERES = ['caractere', 'caracteres'];
const ELEMENTS = ['element', 'elements'];

/** Une limite, s'il y en a une à cet endroit ; undefined sinon (la suite de la ligne est autre chose). */
export function lireBornes(flux: FluxTokens): BornesChamp | undefined {
  const jeton = flux.actuel();
  const ligne = jeton.ligne;

  if (estLeMot(jeton, 'entier')) {
    flux.avancer();
    return { entier: true };
  }
  if (estLeMot(jeton, 'entre')) {
    flux.avancer();
    if (!estUnNombre(flux, 0)) incomplete(EXEMPLES.entre, ligne);
    const min = lireNombre(flux);
    if (!estLeMot(flux.actuel(), 'et')) incomplete(EXEMPLES.entre, ligne);
    flux.avancer();
    if (!estUnNombre(flux, 0)) incomplete(EXEMPLES.entre, ligne);
    return { min, max: lireNombre(flux) };
  }
  if (estLeMot(jeton, 'moins')) {
    flux.avancer();
    if (!estUnNombre(flux, 0)) incomplete(EXEMPLES.moins, ligne);
    return { min: lireNombre(flux) };
  }
  // « au plus 50 » : une limite fixe. « au plus prix de zone par commune » reste la règle qui lit une autre donnée.
  if (estLeMot(jeton, 'plus') && estUnNombre(flux, 1)) {
    flux.avancer();
    return { max: lireNombre(flux) };
  }
  if (estLeMot(jeton, 'format')) {
    flux.avancer();
    const format = motDe(flux, 0);
    if (format === 'email' || format === 'telephone') {
      flux.avancer();
      return { format };
    }
    if (format === 'adresse' && motDe(flux, 1) === 'web') {
      flux.avancer();
      flux.avancer();
      return { format: 'adresse_web' };
    }
    incomplete(EXEMPLES.format, ligne);
  }
  if (estLeMot(jeton, 'parmi')) {
    flux.avancer();
    const parmi: string[] = [];
    while (flux.actuel().type === 'CHAINE') {
      parmi.push(flux.avancer().valeur);
      const suite = flux.actuel();
      const separe = (suite.type === 'PONCTUATION' && suite.valeur === ',') || estLeMot(suite, 'et');
      if (!separe || flux.regarder(1).type !== 'CHAINE') break;
      flux.avancer();
    }
    if (parmi.length === 0) incomplete(EXEMPLES.parmi, ligne);
    return { parmi };
  }
  if (jeton.type === 'NOMBRE') {
    // « de 2 a 80 caracteres »
    if (flux.regarder(1).type === 'NOMBRE' && CARACTERES.includes(motDe(flux, 2))) {
      const longueurMin = lireNombre(flux);
      const longueurMax = lireNombre(flux);
      flux.avancer();
      return { longueurMin, longueurMax };
    }
    const unite = motDe(flux, 1);
    const sens = motDe(flux, 2);
    // « de 500 caracteres au plus », « de 4 caracteres au moins »
    if (CARACTERES.includes(unite)) {
      if (sens !== 'plus' && sens !== 'moins') incomplete(EXEMPLES.caracteres, ligne);
      const nombre = lireNombre(flux);
      flux.avancer();
      flux.avancer();
      return sens === 'plus' ? { longueurMax: nombre } : { longueurMin: nombre };
    }
    // « de 5 elements au plus »
    if (ELEMENTS.includes(unite)) {
      if (sens !== 'plus') incomplete(EXEMPLES.elements, ligne);
      const elementsMax = lireNombre(flux);
      flux.avancer();
      flux.avancer();
      return { elementsMax };
    }
  }
  return undefined;
}
