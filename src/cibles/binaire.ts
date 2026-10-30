/**
 * Un fichier binaire (une image) dans les fichiers produits : les cibles
 * rendent du texte, alors l'octet passe en base 64, derrière ce préfixe. La
 * commande le reconnaît et écrit les octets eux-mêmes.
 */
export const BINAIRE = 'humalis-base64:';

/** Le contenu d'un fichier binaire, à mettre dans la carte des fichiers produits. */
export function contenuBinaire(base64: string): string {
  return BINAIRE + base64;
}

/** Ce qu'il faut écrire sur le disque : les octets d'un fichier binaire, ou le texte tel quel. */
export function octetsAEcrire(contenu: string): string | Uint8Array {
  return contenu.startsWith(BINAIRE) ? Uint8Array.from(atob(contenu.slice(BINAIRE.length)), (c) => c.charCodeAt(0)) : contenu;
}
