import type { Valeur } from '../../ri/types.js';

/**
 * Deux phrases que chaque cible écrit de la même façon :
 * - « lien "Notre site" vers site » : l'adresse est lue dans une variable, au moment d'afficher ;
 * - « champ "Nom" avec valeur nom » : ce que le champ contient au départ.
 */

/**
 * L'adresse d'un « lien … vers variable », en JavaScript. Une adresse http(s)://, mailto: ou tel: sort
 * du site, telle quelle ; un autre schéma (javascript:, data:…) n'a pas d'adresse (undefined) ; le
 * reste est une adresse du site, donnée à `interne` sans les / et \ du début (« //ailleurs.fr » ne
 * sort pas du site). Les espaces autour et les retours à la ligne dedans sont retirés d'abord, comme
 * le fait le navigateur : « java⇥script: » est donc bien refusé.
 */
export function adresseDuLienJs(nom: string, interne: (chemin: string) => string, typer = false): string {
  const t = (type: string) => (typer ? `: ${type}` : '');
  return String.raw`function ${nom}(valeur${t('unknown')})${t('string | undefined')} {
  const adresse = String(valeur ?? '').replace(/^[\u0000- ]+|[\u0000- ]+$|[\t\n\r]/g, '');
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(adresse)?.[1]?.toLowerCase();
  if (schema !== undefined) return ['http', 'https', 'mailto', 'tel'].includes(schema) ? adresse : undefined;
  return ${interne(String.raw`adresse.replace(/^[\/\\]+/, '')`)};
}
`;
}

/** La même lecture, à la compilation : pour le HTML de départ d'un site statique. */
export function adresseDuLien(valeur: unknown, interne: (chemin: string) => string): string | undefined {
  const adresse = String(valeur ?? '').replace(/^[\u0000- ]+|[\u0000- ]+$|[\t\n\r]/g, '');
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(adresse)?.[1]?.toLowerCase();
  if (schema !== undefined) return ['http', 'https', 'mailto', 'tel'].includes(schema) ? adresse : undefined;
  return interne(adresse.replace(/^[/\\]+/, ''));
}

/** Les valeurs qui sont toujours un nombre ou une date (jamais rien) : converties sans « ?? ». */
const JAMAIS_RIEN = new Set(['calcul', 'compte', 'agregat', 'arrondi', 'hasard', 'joursEntre', 'dateDuJour', 'dateDecalee']);

/**
 * Ce que contient un champ « avec valeur … », en JavaScript : vrai ou faux pour une case à cocher,
 * un texte sinon (un nombre écrit tel quel, une date coupée à AAAA-MM-JJ comme l'attend le champ).
 * `code` est la valeur déjà traduite par la cible.
 */
export function departDuChampJs(valeur: Valeur, code: string, sorte: string | undefined): string {
  if (valeur.type === 'nombre' || valeur.type === 'booleen') return JSON.stringify(departDuChamp(valeur.valeur, sorte));
  if (sorte === 'case') return `Boolean(${code})`;
  const texte = valeur.type === 'texte' ? code : JAMAIS_RIEN.has(valeur.type) ? `String(${code})` : `String(${code} ?? '')`;
  return sorte === 'date' ? `${texte}.slice(0, 10)` : texte;
}

/** La même valeur, à la compilation (HTML de départ). */
export function departDuChamp(valeur: unknown, sorte: string | undefined): string | boolean {
  if (sorte === 'case') return Boolean(valeur);
  const texte = String(valeur ?? '');
  return sorte === 'date' ? texte.slice(0, 10) : texte;
}
