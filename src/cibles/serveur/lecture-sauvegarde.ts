/**
 * Les lignes d'une sauvegarde, lues une à une, chacune plafonnée (revue de sécurité de la 3.0.0, remarque C) : un
 * fichier piégé de quelques kilo-octets, une fois décompressé, ne fait plus garder au script une ligne sans fin en
 * mémoire. Le même code dans les trois scripts de restauration (PostgreSQL, MySQL ou MariaDB, base de documents).
 */
export const LECTURE_SAUVEGARDE = `import { pipeline as enChaine, Transform } from 'node:stream';

/** Une ligne de sauvegarde ne dépasse pas ce plafond (HUMALIS_SAUVEGARDE_LIGNE_MAX, en octets ; 64 Mo par défaut). */
const PLAFOND_LIGNE = Number(process.env.HUMALIS_SAUVEGARDE_LIGNE_MAX) > 0 ? Math.floor(Number(process.env.HUMALIS_SAUVEGARDE_LIGNE_MAX)) : 64 * 1024 * 1024;

/** Le fichier décompressé, prêt pour createInterface ; une ligne trop longue arrête la lecture avec une erreur. */
function sauvegardeLue(fichier) {
  let courante = 0;
  const plafond = new Transform({
    transform(morceau, _codage, suite) {
      let debut = 0;
      for (let fin = morceau.indexOf(10); fin >= 0; fin = morceau.indexOf(10, debut)) {
        courante = 0;
        debut = fin + 1;
      }
      courante += morceau.length - debut;
      if (courante > PLAFOND_LIGNE) suite(new Error('une ligne de la sauvegarde dépasse ' + PLAFOND_LIGNE + ' octets : le fichier est refusé (HUMALIS_SAUVEGARDE_LIGNE_MAX pour un plafond plus haut)'));
      else suite(null, morceau);
    },
  });
  return enChaine(createReadStream(fichier), createGunzip(), plafond, () => undefined);
}
`;
