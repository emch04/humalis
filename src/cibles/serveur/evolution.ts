/**
 * Quand la donnée change dans le programme, les fiches déjà enregistrées restent telles qu'elles ont été
 * écrites. Le serveur produit fait le reste :
 *
 * - au démarrage, un champ renommé garde sa valeur et un champ ajouté reçoit sa valeur « au depart »
 *   (codeEvolutionEtDeparts, dans projet.ts) ;
 * - une lecture ne rend que les champs de la donnée d'aujourd'hui : un champ retiré du programme reste
 *   dans la base, il n'en sort plus (le troisième argument de creerStockagePostgres) ;
 * - « npm run verification » lit toutes les fiches et dit lesquelles ne suivent plus la donnée ;
 *   « --nettoyer » efface de la base les champs retirés.
 */
import type { ServeurRI } from '../../ri/types.js';

type Donnee = ServeurRI['donnees'][number];

/**
 * Les données que le programme sert par ses propres routes. Celles du temps réel (discussions, salles,
 * présence) sont écrites et relues par le serveur lui-même : elles ne passent pas par ici.
 */
export const donneesServies = (serveur: ServeurRI): Donnee[] => serveur.donnees.filter((d) => serveur.routes.some((r) => r.donnee === d.nom && !r.interne));

/** Les champs qu'une lecture rend, tels qu'ils sont écrits dans la base ; rien pour une donnée du temps réel. */
export function champsRendus(serveur: ServeurRI, donnee: Donnee, camel: (nom: string) => string): string[] | undefined {
  return donneesServies(serveur).includes(donnee) ? donnee.champs.map((c) => camel(c.nom)) : undefined;
}

/** Dans src/humalis/verifier.ts : ce qui ne va plus dans une fiche déjà enregistrée. */
export const DEFAUTS_TS = `/** Un défaut d'une fiche déjà enregistrée, au regard de la donnée d'aujourd'hui. */
export interface DefautFiche {
  champ: string;
  /** « retire » : le champ n'est plus dans la donnée ; « absent » : la fiche ne l'a pas ; « type » et « limite » : sa valeur ne serait plus acceptée. */
  genre: 'retire' | 'absent' | 'type' | 'limite';
  detail: string;
}

/**
 * Ce qui ne va plus dans une fiche déjà enregistrée : les mêmes vérifications qu'à une création, sans rien
 * changer. « npm run verification » s'en sert sur toutes les fiches.
 */
export function defautsDeLaFiche(
  schema: Schema,
  fiche: Record<string, unknown>,
  regles: { duSite?: string[]; nonVides?: string[]; bornes?: Record<string, Bornes> } = {},
): DefautFiche[] {
  const defauts: DefautFiche[] = [];
  for (const cle of Object.keys(fiche)) {
    if (cle !== 'id' && !Object.hasOwn(schema, cle)) defauts.push({ champ: cle, genre: 'retire', detail: "n'est plus dans la donnée" });
  }
  for (const champ of Object.keys(schema)) {
    const valeur = Object.hasOwn(fiche, champ) ? fiche[champ] : undefined;
    if (valeur === undefined) {
      defauts.push({ champ, genre: 'absent', detail: "n'a pas de valeur" });
      continue;
    }
    const chemin = schema[champ] === 'image' && regles.duSite?.includes(champ) === true && estDuSite(valeur);
    if (!chemin && !conforme(schema[champ], valeur)) {
      defauts.push({ champ, genre: 'type', detail: \`doit être \${decrire(schema[champ])}\` });
      continue;
    }
    if (regles.nonVides?.includes(champ) && (Array.isArray(valeur) ? valeur.length === 0 : typeof valeur === 'string' && valeur.trim() === '')) {
      defauts.push({ champ, genre: 'limite', detail: 'ne doit pas être vide' });
      continue;
    }
    const faute = chemin ? undefined : horsBornes(valeur, regles.bornes?.[champ]);
    if (faute) defauts.push({ champ, genre: 'limite', detail: faute });
  }
  return defauts;
}
`;

interface Noms {
  camel(nom: string): string;
  table(donnee: string): string;
  schema(donnee: string): string;
}

/** Les règles d'une donnée, comme le serveur les applique à une création (limites, champs non vides, images du site). */
function reglesDe(donnee: Donnee, camel: (nom: string) => string): { duSite?: string[]; nonVides?: string[]; bornes?: Record<string, unknown> } {
  const duSite = donnee.champs.filter((c) => c.regle?.genre === 'site').map((c) => camel(c.nom));
  const nonVides = donnee.champs.filter((c) => c.nonVide).map((c) => camel(c.nom));
  const bornes = Object.fromEntries(donnee.champs.filter((c) => c.bornes !== undefined).map((c) => [camel(c.nom), c.bornes]));
  return { ...(duSite.length ? { duSite } : {}), ...(nonVides.length ? { nonVides } : {}), ...(Object.keys(bornes).length ? { bornes } : {}) };
}

/** scripts/verifier-donnees.mjs : « npm run verification ». */
export function verifierDonneesMjs(serveur: ServeurRI, noms: Noms): string {
  const donnees = donneesServies(serveur).map((d) => ({
    nom: d.nom,
    table: noms.table(d.nom),
    schema: noms.schema(d.nom),
    regles: reglesDe(d, noms.camel),
    // « telephone : texte (avant "tel") » : l'ancien nom n'est pas un champ retiré, le serveur le reprend à son démarrage.
    anciens: d.champs.flatMap((c) => (c.avant !== undefined ? [noms.camel(c.avant)] : [])),
  }));
  return `// Produit par Humalis : vérifie que les fiches déjà enregistrées suivent la donnée d'aujourd'hui (serveur « ${serveur.nom.replace(/[\\`$]/g, '')} »).
//
//   npm run verification                 → ce qui ne va plus, donnée par donnée ; rien n'est changé
//   npm run verification -- --detail     → avec l'identifiant des fiches (20 au plus par ligne)
//   npm run verification -- --nettoyer   → efface des fiches les champs retirés du programme (sauvegarde d'abord)
//
// À lancer après « npm run build », quand le programme a changé ses données : avant de démarrer le nouveau
// serveur, puis après. Une lecture ne rend déjà que les champs de la donnée d'aujourd'hui : un champ retiré
// ne sort plus du serveur, mais il reste dans la base tant que « --nettoyer » ne l'a pas effacé.
// Le script rend 1 quand une valeur n'est plus du bon type ou sort de ses limites, 0 sinon.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DONNEES = ${JSON.stringify(donnees)};

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manque : sans base PostgreSQL, les données sont en mémoire et il n\\'y a rien à vérifier.');
  process.exit(1);
}
if (!existsSync(fileURLToPath(new URL('../dist/src/humalis/verifier.js', import.meta.url)))) {
  console.error('Le serveur n\\'est pas construit : lance d\\'abord « npm run build ».');
  process.exit(1);
}
const { defautsDeLaFiche } = await import('../dist/src/humalis/verifier.js');
const schemas = await import('../dist/src/donnees.js');
const nettoyer = process.argv.includes('--nettoyer');
const detail = process.argv.includes('--detail');

const TITRES = { type: 'du mauvais type', limite: 'hors de ses limites', absent: 'sans valeur', retire: 'retiré du programme, encore dans la base', renomme: 'renommé, repris au prochain démarrage du serveur' };
const pluriel = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');
const client = new pg.Client({ connectionString: url });
await client.connect();
let fautes = 0;
/** Les champs retirés trouvés dans chaque table. */
const retires = new Map();
try {
  // Toutes les tables au même instant, en lecture seule : le serveur peut continuer de tourner.
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  for (const donnee of DONNEES) {
    const existe = (await client.query('SELECT to_regclass($1) AS t', [donnee.table])).rows[0].t !== null;
    if (!existe) {
      console.log('« ' + donnee.nom + ' » : pas encore de table (le serveur la crée à son premier démarrage).');
      continue;
    }
    const curseur = 'verification_' + donnee.table;
    await client.query('DECLARE ' + curseur + ' NO SCROLL CURSOR FOR SELECT id, data FROM ' + donnee.table + ' ORDER BY cree_le, id');
    let total = 0;
    let saines = 0;
    /** Un défaut (genre, champ, détail) → combien de fiches, et les premières. */
    const trouves = new Map();
    for (;;) {
      const { rows } = await client.query('FETCH 500 FROM ' + curseur);
      if (rows.length === 0) break;
      for (const ligne of rows) {
        total++;
        const defauts = defautsDeLaFiche(schemas[donnee.schema], ligne.data ?? {}, donnee.regles);
        if (defauts.length === 0) saines++;
        for (const defaut of defauts) {
          const genre = defaut.genre === 'retire' && donnee.anciens.includes(defaut.champ) ? 'renomme' : defaut.genre;
          const cle = JSON.stringify([genre, defaut.champ, genre === 'type' || genre === 'limite' ? defaut.detail : '']);
          const entree = trouves.get(cle) ?? { nombre: 0, ids: [] };
          entree.nombre++;
          if (entree.ids.length < 20) entree.ids.push(String(ligne.id));
          trouves.set(cle, entree);
          if (genre === 'type' || genre === 'limite') fautes++;
          if (genre === 'retire') retires.set(donnee.table, (retires.get(donnee.table) ?? new Set()).add(defaut.champ));
        }
      }
    }
    await client.query('CLOSE ' + curseur);
    console.log('« ' + donnee.nom + ' » : ' + pluriel(total, 'fiche') + ', ' + (saines === total ? 'toutes suivent la donnée.' : saines === 0 ? 'aucune ne suit la donnée.' : saines + (saines > 1 ? ' suivent' : ' suit') + ' la donnée.'));
    for (const genre of ['type', 'limite', 'absent', 'renomme', 'retire']) {
      for (const [cle, entree] of trouves) {
        const [g, champ, precision] = JSON.parse(cle);
        if (g !== genre) continue;
        console.log('  - « ' + champ + ' » ' + TITRES[g] + (precision ? ' (' + precision + ')' : '') + ' : ' + pluriel(entree.nombre, 'fiche'));
        if (detail) console.log('      ' + entree.ids.join(', ') + (entree.nombre > entree.ids.length ? ', …' : ''));
      }
    }
  }
  await client.query('COMMIT');

  if (retires.size > 0 && !nettoyer) {
    console.log('\\nLes champs retirés ne sortent plus du serveur. Pour les effacer de la base : npm run sauvegarde, puis npm run verification -- --nettoyer');
  }
  if (nettoyer && retires.size > 0) {
    // Tout ou rien : une table qui échoue, et aucune n'est changée.
    await client.query('BEGIN');
    try {
      for (const [table, champs] of retires) {
        const noms = [...champs];
        const resultat = await client.query('UPDATE ' + table + ' SET data = data - $1::text[] WHERE data ?| $1::text[]', [noms]);
        console.log('\\n' + table + ' : ' + noms.map((n) => '« ' + n + ' »').join(', ') + ' effacé' + (noms.length > 1 ? 's' : '') + ' de ' + pluriel(resultat.rowCount ?? 0, 'fiche') + '.');
      }
      await client.query('COMMIT');
    } catch (erreur) {
      await client.query('ROLLBACK');
      throw erreur;
    }
  } else if (nettoyer) console.log('\\nAucun champ retiré à effacer.');
  if (fautes > 0) console.log('\\n' + pluriel(fautes, 'valeur') + " ne " + (fautes > 1 ? 'seraient' : 'serait') + ' plus acceptée' + (fautes > 1 ? 's' : '') + " aujourd'hui : corrige " + (fautes > 1 ? 'ces fiches' : 'cette fiche') + " (une modification par un admin), ou élargis la limite dans le programme.");
} catch (erreur) {
  console.error('La vérification a échoué : ' + (erreur instanceof Error ? erreur.message : String(erreur)));
  process.exitCode = 1;
} finally {
  await client.end();
}
if (fautes > 0) process.exitCode = 1;
process.exit(process.exitCode ?? 0);
`;
}

/** Dans le LISEZMOI du serveur produit, à la suite de « En production ». */
export const LISEZMOI_EVOLUTION = `- **Changer les données** : une lecture ne rend que les champs de la donnée d'aujourd'hui ; un champ retiré du programme reste dans la base mais n'en sort plus. \`npm run verification\` (après \`npm run build\`) lit toutes les fiches et dit lesquelles ne suivent plus la donnée : champ retiré, champ sans valeur, mauvais type, valeur hors de ses limites ; \`-- --detail\` donne les identifiants. Rien n'est changé. \`npm run verification -- --nettoyer\` efface de la base les champs retirés : fais une sauvegarde avant, c'est sans retour.
`;
