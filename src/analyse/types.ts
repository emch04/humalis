/**
 * Types simples des valeurs Humalis, déduits des valeurs initiales.
 * « inconnu » veut dire que l'analyse ne sait pas : elle ne refuse rien
 * dans ce cas, elle ne signale que ce qu'elle sait.
 */
export type TypeValeur =
  | { genre: 'texte' }
  | { genre: 'nombre' }
  | { genre: 'booleen' }
  | { genre: 'liste'; de: TypeValeur }
  /** Un enregistrement d'une donnée du serveur (« produit »). */
  | { genre: 'donnee'; nom: string }
  /** Une fiche écrite dans le programme (« fiche avec nom "Livre" et prix 12 »), avec le type de chaque champ. */
  | { genre: 'fiche'; champs: { nom: string; type: TypeValeur }[]; fichier?: string }
  | { genre: 'inconnu' };

export const TEXTE: TypeValeur = { genre: 'texte' };
export const NOMBRE: TypeValeur = { genre: 'nombre' };
export const BOOLEEN: TypeValeur = { genre: 'booleen' };
export const INCONNU: TypeValeur = { genre: 'inconnu' };

export const listeDe = (de: TypeValeur): TypeValeur => ({ genre: 'liste', de });

/** « un texte », « un nombre »… pour les messages d'erreur. */
export function decrireType(type: TypeValeur): string {
  switch (type.genre) {
    case 'texte':
      return 'un texte';
    case 'nombre':
      return 'un nombre';
    case 'booleen':
      return 'un booléen (vrai ou faux)';
    case 'liste':
      return 'une liste';
    case 'donnee':
      return `une donnée « ${type.nom} »`;
    case 'fiche':
      return 'une fiche';
    case 'inconnu':
      return 'une valeur de type inconnu';
  }
}

/** « une liste de textes » : pour dire ce que contient une liste. */
export function decrireListe(type: TypeValeur): string {
  if (type.genre !== 'liste') return decrireType(type);
  const pluriels: Record<string, string> = {
    texte: 'textes',
    nombre: 'nombres',
    booleen: 'booléens',
    liste: 'listes',
    donnee: 'données',
    fiche: 'fiches',
  };
  const contenu = pluriels[type.de.genre];
  return contenu ? `une liste de ${contenu}` : 'une liste';
}

export const estConnu = (type: TypeValeur) => type.genre !== 'inconnu';

/** Deux types qui peuvent se remplacer : un type inconnu va avec tout. */
export function compatibles(a: TypeValeur, b: TypeValeur): boolean {
  if (!estConnu(a) || !estConnu(b)) return true;
  if (a.genre === 'liste' && b.genre === 'liste') return compatibles(a.de, b.de);
  if (a.genre === 'donnee' && b.genre === 'donnee') return a.nom === b.nom;
  // Deux fiches vont ensemble si elles ont les mêmes champs, de types qui vont ensemble.
  if (a.genre === 'fiche' && b.genre === 'fiche') {
    return (
      a.champs.length === b.champs.length &&
      a.champs.every((c) => {
        const autre = b.champs.find((d) => d.nom === c.nom);
        return autre !== undefined && compatibles(c.type, autre.type);
      })
    );
  }
  return a.genre === b.genre;
}
