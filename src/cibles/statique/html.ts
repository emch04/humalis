/**
 * L'échappement du HTML écrit par la cible statique. Toute valeur (un
 * texte du programme, un nom de classe, une adresse d'image) passe par
 * ici avant d'entrer dans une page : elle ne peut jamais devenir une
 * balise ni sortir de son attribut.
 */

/** Le texte entre deux balises : `&`, `<` et `>`. */
export function echapperTexte(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** La valeur d'un attribut, entre guillemets : en plus, `"` et `'`. */
export function echapperAttribut(texte: string): string {
  return echapperTexte(texte).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** `nom="valeur"` pour chaque attribut défini, dans l'ordre donné. */
export function attributs(liste: [string, string | undefined][]): string {
  return liste
    .filter((a): a is [string, string] => a[1] !== undefined)
    .map(([nom, valeur]) => ` ${nom}="${echapperAttribut(valeur)}"`)
    .join('');
}
