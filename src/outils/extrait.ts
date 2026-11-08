/**
 * Le morceau de code fautif, sous le message d'une erreur : la ligne d'avant,
 * la ligne en cause, et un trait sous le mot quand le message le nomme.
 */
export function extraitDeCode(source: string, ligne: number, message: string): string | undefined {
  const lignes = source.split('\n');
  const texte = lignes[ligne - 1];
  if (ligne < 1 || texte === undefined || texte.trim() === '') return undefined;
  const largeur = String(ligne).length;
  const marge = (n: number | '') => String(n).padStart(largeur);
  const sortie: string[] = [];
  const avant = lignes[ligne - 2];
  if (avant !== undefined && avant.trim() !== '') sortie.push(`    ${marge(ligne - 1)} │ ${avant}`);
  sortie.push(`  > ${marge(ligne)} │ ${texte}`);
  // Le premier mot cité par le message et présent sur la ligne ; sinon, pas de trait plutôt qu'un trait faux.
  for (const [, mot] of message.matchAll(/«\s*([^»]+?)\s*»/gu)) {
    const place = texte.indexOf(mot);
    if (place === -1) continue;
    sortie.push(`    ${marge('')} │ ${' '.repeat(place)}${'^'.repeat(mot.length)}`);
    break;
  }
  return sortie.join('\n');
}
