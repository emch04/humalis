/**
 * Le code stable d'un message (« HUM-0142 »), pour « humalis verifier --json » et le serveur de langage
 * (décidé avec le mainteneur le 17 novembre 2026). Les codes sont écrits dans catalogue/codes.ts.
 *
 * Un message se reconnaît à son gabarit : le message sans ce qui change d'un programme à l'autre (les noms entre
 * « », les textes entre guillemets, les nombres, les listes de noms connus, la suggestion « Peut-être … »). Deux
 * messages du même gabarit ont le même code ; deux gabarits différents, jamais. La table vient du catalogue
 * (scripts/generer-codes.mjs) ; un message que le gabarit ne retrouve pas est reconnu à son motif.
 */
import { CODES_DES_GABARITS, CODES_DES_MOTIFS } from './codes-erreurs.js';

const LISTES = /\b(Données|Champs|Sources|Routes|Valeurs connues|Valeurs attendues|Serveurs|Actions|Rôles|Pages|Écrans|Composants)( possibles| connues)? : [^.]*/g;

export function gabaritDuMessage(message: string): string {
  return message
    .replace(/ Peut-être «[^»]*» \?.*$/s, '')
    .replace(/ de [^\s«»]+\.humalis\b/g, '')
    .replace(LISTES, '$1$2 : …')
    .replace(/«[^»]*»/g, '«…»')
    .replace(/"[^"]*"/g, '"…"')
    .replace(/\{[^}]*\}/g, '{…}')
    .replace(/-?\d+([,.]\d+)?/g, '0')
    .trim();
}

const parGabarit = new Map(CODES_DES_GABARITS);

export function codeDuMessage(message: string): string | undefined {
  const exact = parGabarit.get(gabaritDuMessage(message));
  if (exact) return exact;
  for (const [motif, code] of CODES_DES_MOTIFS) if (message.includes(motif)) return code;
  return undefined;
}
