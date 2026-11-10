/**
 * Les espaces insécables du français, posés une fois dans la RI : toutes les
 * cibles (web React, moteur Humalis, statique, mobile, bureau, Apple) affichent
 * donc le même texte.
 *
 * Devant « ; ? ! » et à l'intérieur des guillemets « », une espace fine
 * insécable (U+202F) ; devant « : », une espace insécable (U+00A0). Une espace
 * déjà écrite est remplacée ; une espace absente est ajoutée seulement en fin de
 * mot (« Quoi? » → « Quoi ? », « Prix: 12 » → « Prix : 12 »). Restent intacts :
 * les adresses (http://…, www.…), les heures (9:30), le code entre accents
 * graves, et les valeurs lues dans les {variables}.
 *
 * Seuls les textes affichés changent (contenu d'un élément, message) : une
 * valeur envoyée au serveur ou comparée reste telle qu'écrite.
 */
import type { PartiesTexte, Valeur } from './types.js';

const FINE = ' ';
const INSECABLE = ' ';

/** Un mot qui est une adresse : on n'y touche pas. */
const ADRESSE = /(\S*(?::\/\/|www\.)\S*)/;

/** Les règles sur un morceau de texte qui n'est pas une adresse. */
function regles(texte: string, apresVariable: boolean): string {
  let t = texte
    .replace(/[   ]+([;?!])/g, `${FINE}$1`)
    .replace(/[   ]+:/g, `${INSECABLE}:`)
    .replace(/«[   ]+/g, `«${FINE}`)
    .replace(/[   ]+»/g, `${FINE}»`)
    // Une espace absente, en fin de mot seulement : « a?b » ou « 9:30 » ne bougent pas.
    .replace(/([\p{L}\p{N})\]»])([;?!]+)(?=[\s"')\]»]|$)/gu, `$1${FINE}$2`)
    .replace(/(\p{L})(:)(?=\s|$)/gu, `$1${INSECABLE}$2`)
    .replace(/«(?=[^\s  ])/g, `«${FINE}`)
    .replace(/([^\s  ])»/g, `$1${FINE}»`);
  // « {nom}? » : le signe suit directement la valeur d'une variable.
  if (apresVariable) t = t.replace(/^([;?!]+)(?=\s|$)/, `${FINE}$1`).replace(/^:(?=\s|$)/, `${INSECABLE}:`).replace(/^»/, `${FINE}»`);
  return t;
}

/** « Bonjour ! » avec une espace fine insécable ; les adresses restent telles quelles. */
export function espacerEnFrancais(texte: string, apresVariable = false): string {
  return texte
    .split(ADRESSE)
    .map((morceau, i) => (i % 2 === 1 ? morceau : regles(morceau, apresVariable && i === 0)))
    .join('');
}

function espacerParties(parties: PartiesTexte): PartiesTexte {
  return parties.map((partie, i) => {
    if (!('texte' in partie) || partie.code) return partie;
    const precedente = parties[i - 1];
    const apresVariable = precedente !== undefined && 'variable' in precedente;
    // « {x} « … » » : avant une variable, l'ouverture « garde son espace fine.
    const suivante = parties[i + 1];
    let texte = espacerEnFrancais(partie.texte, apresVariable);
    if (suivante && 'variable' in suivante) texte = texte.replace(/«$/, `«${FINE}`);
    return texte === partie.texte ? partie : { ...partie, texte };
  });
}

/** Le texte, espacé dans ses parties en français : la langue de base si c'est le français, et sa version française. */
function espacerValeur(valeur: Valeur, langue: string | undefined): Valeur {
  if (valeur.type !== 'texte') return valeur;
  return {
    ...valeur,
    parties: langue === 'fr' ? espacerParties(valeur.parties) : valeur.parties,
    ...(valeur.versions ? { versions: valeur.versions.map((v) => (v.code === 'fr' ? { ...v, parties: espacerParties(v.parties) } : v)) } : {}),
  };
}

const GENRES_TEXTE = new Set(['titre', 'soustitre', 'texte', 'bouton', 'lien', 'champ']);

type Objet = Record<string, unknown>;

/** « si langue est anglais : » : la langue des textes de chaque branche, quand on la connaît. */
function languesDesBranches(test: unknown, codes: string[]): [string | undefined, string | undefined] | undefined {
  const t = test as { gauche?: Valeur; operateur?: string; droite?: Valeur } | undefined;
  if (!t || t.gauche?.type !== 'variable' || t.gauche.nom !== 'langue' || t.droite?.type !== 'texte') return undefined;
  const [partie] = t.droite.parties;
  if (t.droite.parties.length !== 1 || !partie || !('texte' in partie)) return undefined;
  const code = partie.texte;
  const autre = codes.length === 2 ? codes.find((c) => c !== code) : undefined;
  if (t.operateur === 'egal') return [code, autre];
  if (t.operateur === 'different') return [autre, code];
  return undefined;
}

function parcourir(noeud: unknown, langue: string | undefined, codes: string[]): void {
  if (Array.isArray(noeud)) {
    for (const enfant of noeud) parcourir(enfant, langue, codes);
    return;
  }
  if (noeud === null || typeof noeud !== 'object') return;
  const objet = noeud as Objet;
  if (objet.type === 'element' && GENRES_TEXTE.has(objet.genre as string) && objet.contenu) objet.contenu = espacerValeur(objet.contenu as Valeur, langue);
  if (objet.type === 'message' && objet.texte) objet.texte = espacerValeur(objet.texte as Valeur, langue);
  const branches = 'alors' in objet && 'sinon' in objet ? languesDesBranches(objet.test, codes) : undefined;
  for (const [cle, enfant] of Object.entries(objet)) {
    if (cle === 'serveurs' || cle === 'contenu' || (cle === 'texte' && objet.type === 'message')) continue;
    if (branches && cle === 'alors') parcourir(enfant, branches[0], codes);
    else if (branches && cle === 'sinon') parcourir(enfant, branches[1], codes);
    else parcourir(enfant, langue, codes);
  }
}

/** Pose les espaces insécables dans les textes affichés de l'application, là où ils sont en français. */
export function espacerLesTextes(application: object, langueDeBase: string, codes: string[]): void {
  parcourir(application, langueDeBase, codes);
}
