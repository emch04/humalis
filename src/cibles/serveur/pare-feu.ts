/**
 * Les motifs SQL du pare-feu du serveur produit.
 *
 * Le pack `@astratra/security` refuse toute requête où « select », « update »,
 * « delete »… sont suivis plus loin de « from », « into » ou « table » :
 * « Please select a size from the list » était refusé, même écrit en deux
 * champs différents (le pare-feu lit le chemin, la requête et le corps d'un
 * seul tenant). Le stockage passe par des requêtes paramétrées : ces motifs
 * ne sont qu'une seconde barrière. Ils gardent ce qui fait une injection : une
 * apostrophe qui sort d'une chaîne, ou un point-virgule qui ouvre une seconde
 * instruction, suivis d'une vraie instruction SQL ; « union select » partout.
 * Un motif ne déborde pas d'une valeur JSON sur la suivante ([^"]).
 */

/** Un espace, son écriture dans une adresse (%20, +), ou un commentaire SQL (UNION/**\/SELECT). */
const ESPACE = String.raw`(?:\s|%20|\+|\/\*[^"]*?\*\/)+`;
/** L'apostrophe qui ferme une chaîne SQL, telle quelle ou dans une adresse. */
const APOSTROPHE = String.raw`(?:'|%27)`;

/** Les instructions qui écrivent ou détruisent. */
const ECRITURES = [
  String.raw`drop${ESPACE}(?:table|database)`,
  String.raw`delete${ESPACE}from`,
  String.raw`insert${ESPACE}into`,
  String.raw`update${ESPACE}\w+${ESPACE}set${ESPACE}\w+`,
  String.raw`alter${ESPACE}table`,
  String.raw`create${ESPACE}(?:table|database)`,
  String.raw`truncate${ESPACE}table`,
].join('|');

/** Ce qui suit une apostrophe dans une injection : une lecture, une écriture, une attente. */
const APRES_APOSTROPHE = [
  String.raw`union${ESPACE}(?:all${ESPACE})?select`,
  String.raw`select\b[^"]*?\bfrom`,
  ECRITURES,
  String.raw`(?:sleep|pg_sleep|benchmark)\s*\(`,
].join('|');

export const MOTIFS_SQL: readonly RegExp[] = [
  // « ' UNION SELECT … », « ' AND (SELECT COUNT(*) FROM …) », « '||(select … from …) », « '; DROP TABLE … ».
  new RegExp(String.raw`${APOSTROPHE}(?:[\s|()+,;]|%20)*(?:(?<![a-z])(?:or|and)\b[^"]*?)?(?<![a-z])(?:${APRES_APOSTROPHE})\b`, 'gi'),
  // « 1; DROP TABLE produits » : une seconde instruction qui écrit.
  new RegExp(String.raw`;(?:\s|%20|\+)*(?<![a-z])(?:${ECRITURES})\b`, 'gi'),
  // « 1 UNION SELECT … », même sans apostrophe.
  new RegExp(String.raw`(?<![a-z])union${ESPACE}(?:all${ESPACE})?select\b`, 'gi'),
  // « ' or '1'='1 ».
  new RegExp(String.raw`${APOSTROPHE}(?:\s|%20)*(?:or|and)(?:\s|%20)*${APOSTROPHE}[^'"]*${APOSTROPHE}(?:\s|%20)*=(?:\s|%20)*${APOSTROPHE}`, 'gi'),
];

/** Le motif du pack qu'ils remplacent : on le reconnaît à sa liste de mots. */
export const MOTIF_SQL_DU_PACK = 'union|select|insert';

/** Les motifs, écrits en JavaScript dans le serveur produit. */
export const MOTIFS_SQL_CODE = `[${MOTIFS_SQL.map(String).join(', ')}]`;
