/**
 * La correction suggérée d'un message, seulement quand le compilateur la connaît avec certitude (décidé avec le mainteneur le
 * 17 novembre 2026) : « remplace » → « par », la première fois que « remplace » paraît sur la ligne du message.
 *
 * Trois cas, et aucun autre :
 * - un nom mal écrit, proche d'un nom connu (« Peut-être « catalogue » ? », donné par proposerNom) ;
 * - l'indentation : une tabulation en tête de ligne, ou un espace de trop ou de moins avant un multiple de 4 ;
 * - une ancienne forme encore acceptée (« ia par anthropic » s'écrit maintenant « ia »).
 * Partout ailleurs, aucune correction : elle n'est jamais devinée.
 */

export interface Correction {
  remplace: string;
  par: string;
}

/** Les noms que proposerNom a rapprochés d'un nom connu : la suggestion « Peut-être « par » ? » et le nom écrit. */
const rapproches = new Map<string, Set<string>>();

export function noterRapprochement(nom: string, proche: string): void {
  // Un compilateur qui tourne longtemps (le serveur de langage) ne garde pas tout.
  if (rapproches.size > 5000) rapproches.clear();
  rapproches.set(proche, (rapproches.get(proche) ?? new Set()).add(nom));
}

export function correctionDe(message: string): Correction | undefined {
  // Une ancienne forme : « ia par anthropic » s'écrit maintenant « ia ».
  const ancienne = /^« ([^»]+) » s'écrit maintenant « ([^»]+) »/.exec(message);
  if (ancienne) return { remplace: ancienne[1]!, par: ancienne[2]! };

  if (message.startsWith('tabulation interdite')) return { remplace: '\t', par: '    ' };
  const indentation = /^indentation incohérente : (\d+) espaces trouvés/.exec(message);
  if (indentation) {
    const espaces = Number(indentation[1]);
    // Un espace de trop ou de moins seulement : à deux espaces d'un multiple de 4, on ne sait pas lequel est voulu.
    if (espaces % 4 === 1) return { remplace: ' '.repeat(espaces), par: ' '.repeat(espaces - 1) };
    if (espaces % 4 === 3) return { remplace: ' '.repeat(espaces), par: ' '.repeat(espaces + 1) };
    return undefined;
  }

  // Un nom mal écrit : le seul nom cité dans le message que proposerNom a rapproché de cette suggestion.
  const suggestion = /^([\s\S]*?) Peut-être « ([^»]+) » \?/.exec(message);
  if (suggestion) {
    const ecrits = rapproches.get(suggestion[2]!);
    const cites = [...suggestion[1]!.matchAll(/« ([^»]+) »/g)].map((m) => m[1]!).filter((nom) => ecrits?.has(nom));
    const uniques = [...new Set(cites)];
    if (uniques.length === 1) return { remplace: uniques[0]!, par: suggestion[2]! };
  }
  return undefined;
}
