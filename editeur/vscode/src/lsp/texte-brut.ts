/**
 * Le Markdown du survol en texte brut, pour un éditeur qui n'accepte que le
 * texte (Visual Studio déclare `contentFormat: ["plaintext"]`) : sans cela,
 * il n'en garde qu'un morceau. Les tableaux deviennent des lignes
 * « cible : code », les blocs de code restent tels quels, les marques
 * (**gras**, *italique*, `code`) disparaissent.
 */
export function markdownVersTexte(markdown: string): string {
  const sortie: string[] = [];
  let dansCode = false;
  for (const ligne of markdown.split('\n')) {
    if (/^```/.test(ligne.trim())) {
      dansCode = !dansCode;
      continue;
    }
    if (dansCode) {
      sortie.push(ligne);
      continue;
    }
    const cellules = /^\s*\|(.*)\|\s*$/.exec(ligne);
    if (cellules) {
      // La ligne de séparation « |---|---| » ne porte rien.
      if (/^[\s|:-]+$/.test(ligne)) continue;
      const parts = cellules[1]!.split(/(?<!\\)\|/).map((c) => enLigne(c.trim()));
      sortie.push(parts.length === 2 ? `${parts[0]} : ${parts[1]}` : parts.join(' · '));
      continue;
    }
    sortie.push(enLigne(ligne));
  }
  // Pas plus d'une ligne vide d'affilée.
  return sortie.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Les marques en ligne retirées : gras, italique, code, liens. */
function enLigne(texte: string): string {
  return texte
    .replace(/``\s?(.+?)\s?``/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\\\|/g, '|');
}
