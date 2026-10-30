import { ligneLocale } from '../../fichiers.js';
import type { ServeurRI, TypeChamp, QuiPeut } from '../../ri/types.js';
import { simplifier } from '../../analyse/elements.js';
import { pascal, camel } from '../web/noms.js';

export interface OptionsServeur {
  /** Le nom du projet, tiré du fichier Humalis. */
  nom: string;
  /** Le fichier Humalis d'origine, cité dans le LISEZMOI. */
  source: string;
}

/** Versions épinglées des dépendances du serveur produit. */
export const VERSIONS_SERVEUR = {
  saasKit: '2.0.1',
  security: '1.13.0',
  storePostgres: '1.1.0',
  express: '4.22.3',
  pg: '8.23.1',
  typescript: '7.0.2',
  typesNode: '26.2.0',
  typesExpress: '4.17.25',
  typesPg: '8.23.1',
  supertest: '7.3.1',
  typesSupertest: '7.2.1',
  vitest: '4.1.12',
};

export const MARQUE_SERVEUR = '.humalis-projet';

type Action = 'lire' | 'creer' | 'modifier' | 'supprimer';
const ACTIONS: Action[] = ['lire', 'creer', 'modifier', 'supprimer'];

/**
 * Les fichiers d'un serveur Node + TypeScript complet (étape 3). Toute la
 * sécurité (connexion, sessions, droits, CSRF, limites, en-têtes) vient
 * des packs Astratra ; le code produit ne fait que les assembler, décrire
 * les données et vérifier la forme des envois.
 */
export function genererProjetServeur(serveur: ServeurRI, options: OptionsServeur): Map<string, string> {
  const fichiers = new Map<string, string>();
  fichiers.set(MARQUE_SERVEUR, `Projet produit par Humalis depuis ${options.source}.\nLe compilateur réécrit ce dossier à chaque compilation.\n`);
  fichiers.set('package.json', packageJson(options.nom));
  fichiers.set('tsconfig.json', TSCONFIG);
  fichiers.set('.gitignore', 'node_modules\ndist\n.env\n');
  fichiers.set('.env.exemple', ENV_EXEMPLE);
  fichiers.set('LISEZMOI.md', lisezmoi(serveur, options));
  fichiers.set('src/humalis/verifier.ts', VERIFIER);
  fichiers.set('src/humalis/stockage.ts', STOCKAGE);
  fichiers.set('src/donnees.ts', donneesTs(serveur));
  fichiers.set('src/serveur.ts', serveurTs(serveur));
  fichiers.set('src/demarrer.ts', demarrerTs(serveur));
  fichiers.set('tests/regles.test.ts', testsRegles(serveur));
  return fichiers;
}

/** « produit » → « humalis_produit » : un nom de table sûr, fixé à la compilation. */
const nomTable = (donnee: string) => `humalis_${simplifier(donnee) || 'donnee'}`;
const adresseApi = (adresse: string) => `/api/${adresse.replace(/^\/+/, '')}`;

function typeTS(type: TypeChamp): string {
  switch (type.genre) {
    case 'texte':
    case 'date':
      return 'string';
    case 'nombre':
      return 'number';
    case 'booleen':
      return 'boolean';
    case 'liste':
      return `${typeTS(type.de)}[]`;
    case 'donnee':
      // Une donnée imbriquée n'existe que dans une source, jamais dans un serveur.
      return 'unknown';
  }
}

/** Le type d'un champ, tel que le lit src/humalis/verifier.ts. */
function schemaChamp(type: TypeChamp): string {
  return type.genre === 'liste' ? `{ liste: ${schemaChamp(type.de)} }` : `'${type.genre}'`;
}

/** Une valeur valide pour un champ, utilisée par les tests produits. */
function exempleChamp(type: TypeChamp): string {
  switch (type.genre) {
    case 'texte':
      return "'exemple'";
    case 'nombre':
      return '1';
    case 'booleen':
      return 'true';
    case 'date':
      return "'2026-01-01'";
    case 'liste':
      return '[]';
    case 'donnee':
      return 'null';
  }
}

function packageJson(nom: string): string {
  const v = VERSIONS_SERVEUR;
  return JSON.stringify(
    {
      name: `${simplifier(nom).replace(/_/g, '-') || 'serveur'}-serveur`,
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        build: 'tsc',
        start: 'node --env-file-if-exists=.env dist/src/demarrer.js',
        test: 'vitest run --dir tests',
      },
      dependencies: {
        '@astratra/saas-kit': v.saasKit,
        '@astratra/security': v.security,
        '@astratra/store-postgres': v.storePostgres,
        express: v.express,
        pg: v.pg,
      },
      devDependencies: {
        '@types/express': v.typesExpress,
        '@types/node': v.typesNode,
        '@types/pg': v.typesPg,
        '@types/supertest': v.typesSupertest,
        supertest: v.supertest,
        typescript: v.typescript,
        vitest: v.vitest,
      },
    },
    null,
    2,
  ) + '\n';
}

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: true,
      outDir: 'dist',
      types: ['node'],
    },
    include: ['src', 'tests'],
  },
  null,
  2,
) + '\n';

const ENV_EXEMPLE = `# Copie ce fichier en .env et remplis-le. Ne le publie jamais.

# Le secret des sessions : au moins 32 caractères au hasard.
JWT_SECRET=

# Le premier administrateur, créé au premier démarrage s'il n'existe pas.
# Le mot de passe doit être solide : 8 caractères minimum, avec majuscule,
# minuscule, chiffre et caractère spécial.
HUMALIS_ADMIN_EMAIL=
HUMALIS_ADMIN_MOT_DE_PASSE=

# La base PostgreSQL. Sans elle, les données restent en mémoire (développement).
DATABASE_URL=

PORT=3000
`;

const VERIFIER = `/**
 * Produit par Humalis : la vérification de la forme des données reçues.
 * Ce n'est pas de la sécurité (elle vient des packs Astratra) : c'est
 * la description des champs, que seul le programme connaît.
 */
export type TypeChamp = 'texte' | 'nombre' | 'booleen' | 'date' | { liste: TypeChamp };
export type Schema = Record<string, TypeChamp>;

const NOMS: Record<string, string> = {
  texte: 'un texte',
  nombre: 'un nombre',
  booleen: 'vrai ou faux (true ou false)',
  date: 'une date (par exemple 2026-01-31)',
};

function conforme(type: TypeChamp, valeur: unknown): boolean {
  if (typeof type === 'object') return Array.isArray(valeur) && valeur.every((v) => conforme(type.liste, v));
  if (type === 'texte') return typeof valeur === 'string';
  if (type === 'nombre') return typeof valeur === 'number' && Number.isFinite(valeur);
  if (type === 'booleen') return typeof valeur === 'boolean';
  return typeof valeur === 'string' && !Number.isNaN(Date.parse(valeur));
}

const decrire = (type: TypeChamp): string =>
  typeof type === 'object' ? \`une liste dont chaque élément est \${decrire(type.liste)}\` : NOMS[type];

/**
 * \`complet\` : à la création, chaque champ est obligatoire ; à la
 * modification, seuls les champs envoyés sont vérifiés.
 */
export function verifierEnvoi(
  schema: Schema,
  corps: unknown,
  complet: boolean,
): { valeur: Record<string, unknown> } | { erreur: string } {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    return { erreur: 'les données envoyées doivent être un objet JSON' };
  }
  const champs = Object.keys(schema);
  for (const cle of Object.keys(corps)) {
    if (cle === 'id') return { erreur: "l'identifiant est donné par le serveur : ne l'envoie pas" };
    if (!(cle in schema)) return { erreur: \`le champ « \${cle} » n'existe pas. Champs : \${champs.join(', ')}\` };
  }
  const valeur: Record<string, unknown> = {};
  for (const champ of champs) {
    const recu = (corps as Record<string, unknown>)[champ];
    if (recu === undefined) {
      if (complet) return { erreur: \`le champ « \${champ} » manque\` };
      continue;
    }
    if (!conforme(schema[champ], recu)) return { erreur: \`le champ « \${champ} » doit être \${decrire(schema[champ])}\` };
    valeur[champ] = recu;
  }
  return { valeur };
}
`;

const STOCKAGE = `import { randomUUID } from 'node:crypto';

/**
 * Produit par Humalis : le stockage des données de l'application, en
 * mémoire (développement, tests) ou dans PostgreSQL. Il suit le modèle de
 * createPostgresUsersStore (@astratra/store-postgres) : une table par
 * donnée, l'objet complet dans une colonne JSONB, et uniquement des
 * requêtes paramétrées.
 */
export interface Enregistrement {
  id: string;
  [champ: string]: unknown;
}

export interface Stockage {
  lister(): Promise<Enregistrement[]>;
  trouver(id: string): Promise<Enregistrement | null>;
  creer(valeurs: Record<string, unknown>): Promise<Enregistrement>;
  modifier(id: string, valeurs: Record<string, unknown>): Promise<Enregistrement | null>;
  supprimer(id: string): Promise<boolean>;
}

/** Les données sont perdues à l'arrêt du serveur : développement et tests seulement. */
export function creerStockageMemoire(): Stockage {
  const lignes = new Map<string, Enregistrement>();
  return {
    async lister() {
      return [...lignes.values()];
    },
    async trouver(id) {
      return lignes.get(id) ?? null;
    },
    async creer(valeurs) {
      const enregistrement = { ...valeurs, id: randomUUID() };
      lignes.set(enregistrement.id, enregistrement);
      return enregistrement;
    },
    async modifier(id, valeurs) {
      const actuel = lignes.get(id);
      if (!actuel) return null;
      const nouveau = { ...actuel, ...valeurs, id };
      lignes.set(id, nouveau);
      return nouveau;
    },
    async supprimer(id) {
      return lignes.delete(id);
    },
  };
}

/** Ce que le stockage attend d'un Pool de \`pg\`. */
export interface PoolPostgres {
  query(texte: string, valeurs?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

export function creerStockagePostgres(pool: PoolPostgres, table: string): Stockage {
  // Le nom de la table est fixé par le compilateur ; on le vérifie quand même.
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(\`nom de table invalide : \${table}\`);
  let prete: Promise<unknown> | undefined;
  const preparer = () =>
    (prete ??= pool.query(
      \`CREATE TABLE IF NOT EXISTS \${table} (id TEXT PRIMARY KEY, data JSONB NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())\`,
    ));
  const lire = (ligne: Record<string, unknown>): Enregistrement => ({ ...(ligne.data as object), id: String(ligne.id) });

  return {
    async lister() {
      await preparer();
      return (await pool.query(\`SELECT id, data FROM \${table} ORDER BY cree_le\`)).rows.map(lire);
    },
    async trouver(id) {
      await preparer();
      const { rows } = await pool.query(\`SELECT id, data FROM \${table} WHERE id = $1\`, [id]);
      return rows[0] ? lire(rows[0]) : null;
    },
    async creer(valeurs) {
      await preparer();
      const id = randomUUID();
      await pool.query(\`INSERT INTO \${table} (id, data) VALUES ($1, $2)\`, [id, JSON.stringify(valeurs)]);
      return { ...valeurs, id };
    },
    async modifier(id, valeurs) {
      await preparer();
      const { rows } = await pool.query(\`UPDATE \${table} SET data = data || $2::jsonb WHERE id = $1 RETURNING id, data\`, [
        id,
        JSON.stringify(valeurs),
      ]);
      return rows[0] ? lire(rows[0]) : null;
    },
    async supprimer(id) {
      await preparer();
      const resultat = await pool.query(\`DELETE FROM \${table} WHERE id = $1\`, [id]);
      return (resultat.rowCount ?? 0) > 0;
    },
  };
}
`;

function donneesTs(serveur: ServeurRI): string {
  const blocs = serveur.donnees.map((d) => {
    const champs = d.champs.map((c) => `  ${camel(c.nom)}: ${typeTS(c.type)};`).join('\n');
    const schema = d.champs.map((c) => `  ${camel(c.nom)}: ${schemaChamp(c.type)},`).join('\n');
    return `/** La donnée « ${d.nom} ». */
export interface ${pascal(d.nom)} {
  id: string;
${champs}
}

export const SCHEMA_${simplifier(d.nom).toUpperCase()}: Schema = {
${schema}
};`;
  });
  return `// Produit par Humalis : les données du serveur « ${serveur.nom} ».
import type { Schema } from './humalis/verifier.js';

${blocs.join('\n\n')}
`;
}

const GARDES: Record<QuiPeut, string> = {
  tout_le_monde: 'toutLeMonde',
  connecte: 'connecte',
  admin: 'seulAdmin',
};

function decrireDroits(droits: Record<Action, QuiPeut | null>): string {
  const qui = (q: QuiPeut | null) => (q === null ? 'personne' : q === 'tout_le_monde' ? 'tout le monde' : q === 'connecte' ? 'un utilisateur connecté' : 'seul un admin');
  return ACTIONS.map((a) => `${a} : ${qui(droits[a])}`).join(' ; ');
}

function serveurTs(serveur: ServeurRI): string {
  const stockages = serveur.donnees.map((d) => `    ${camel(d.nom)}: Stockage;`).join('\n');
  const routes = serveur.routes
    .map((route) => {
      const donnee = camel(route.donnee);
      const schema = `SCHEMA_${simplifier(route.donnee).toUpperCase()}`;
      const variable = `route${pascal(route.adresse)}`;
      const garde = (a: Action) => (route.droits[a] === null ? 'refuse' : `...acces.${GARDES[route.droits[a]!]}`);
      const csrf = (a: Action) => (route.droits[a] === null ? '' : ', csrfMiddleware');
      return `      // « ${route.adresse} » (ligne ${ligneLocale(route.ligne)}) — ${decrireDroits(route.droits)}.
      const ${variable} = express.Router();
      ${variable}.get('/', ${garde('lire')}, async (_req, res, next) => {
        try {
          res.json(await stockages.${donnee}.lister());
        } catch (erreur) {
          next(erreur);
        }
      });
      ${variable}.get('/:id', ${garde('lire')}, async (req, res, next) => {
        try {
          const trouve = await stockages.${donnee}.trouver(req.params.id);
          if (trouve) res.json(trouve);
          else res.status(404).json({ erreur: introuvable('${route.donnee}') });
        } catch (erreur) {
          next(erreur);
        }
      });
      ${variable}.post('/', ${garde('creer')}${csrf('creer')}, async (req, res, next) => {
        try {
          const envoi = verifierEnvoi(${schema}, req.body, true);
          if ('erreur' in envoi) res.status(400).json({ erreur: envoi.erreur });
          else res.status(201).json(await stockages.${donnee}.creer(envoi.valeur));
        } catch (erreur) {
          next(erreur);
        }
      });
      ${variable}.patch('/:id', ${garde('modifier')}${csrf('modifier')}, async (req, res, next) => {
        try {
          const envoi = verifierEnvoi(${schema}, req.body, false);
          if ('erreur' in envoi) {
            res.status(400).json({ erreur: envoi.erreur });
            return;
          }
          const modifie = await stockages.${donnee}.modifier(req.params.id, envoi.valeur);
          if (modifie) res.json(modifie);
          else res.status(404).json({ erreur: introuvable('${route.donnee}') });
        } catch (erreur) {
          next(erreur);
        }
      });
      ${variable}.delete('/:id', ${garde('supprimer')}${csrf('supprimer')}, async (req, res, next) => {
        try {
          if (await stockages.${donnee}.supprimer(req.params.id)) res.status(204).end();
          else res.status(404).json({ erreur: introuvable('${route.donnee}') });
        } catch (erreur) {
          next(erreur);
        }
      });
      app.use('${adresseApi(route.adresse)}', ${variable});`;
    })
    .join('\n\n');
  const schemas = [...new Set(serveur.routes.map((r) => `SCHEMA_${simplifier(r.donnee).toUpperCase()}`))].join(', ');

  return `// Produit par Humalis : le serveur « ${serveur.nom} », assemblé avec les packs Astratra.
import { createSaasApp, type UsersStore } from '@astratra/saas-kit';
import { verifyPasswordHash } from '@astratra/security';
import express, { type RequestHandler } from 'express';
import { ${schemas} } from './donnees.js';
import type { Stockage } from './humalis/stockage.js';
import { verifierEnvoi } from './humalis/verifier.js';

export interface OptionsDuServeur {
  /** Le secret des sessions (au moins 32 caractères). */
  jwtSecret: string;
  usersStore: UsersStore;
  stockages: {
${stockages}
  };
}

const introuvable = (donnee: string) => \`aucun « \${donnee} » avec cet identifiant\`;

/** Une action sans règle est refusée à tout le monde : la porte est fermée par défaut. */
const refuse: RequestHandler = (_req, res) => {
  res.status(403).json({ erreur: "cette action n'est permise à personne" });
};

/**
 * La connexion (/auth/login), les sessions, les rôles, le CSRF, les
 * limites et les en-têtes de sécurité viennent de createSaasApp. Les
 * routes des données s'ajoutent par extendRoutes, avec les gardes du pack.
 */
export function creerServeur({ jwtSecret, usersStore, stockages }: OptionsDuServeur) {
  return createSaasApp({
    jwtSecret,
    usersStore,
    roles: { adminRoles: ['admin'], ownerRoles: ['admin'] },
    verifyPassword: async (utilisateur, motDePasse) =>
      typeof utilisateur.passwordHash === 'string' && verifyPasswordHash(motDePasse, utilisateur.passwordHash),
    notify: async () => {},
    extendRoutes: (app, contexte) => {
      // Les gardes du pack, telles quelles.
      const authMiddleware = contexte.authMiddleware as unknown as RequestHandler;
      const authorizeAdmin = contexte.authorizeAdmin as unknown as RequestHandler;
      const csrfMiddleware = contexte.csrfMiddleware as unknown as RequestHandler;
      const acces = {
        toutLeMonde: [] as RequestHandler[],
        connecte: [authMiddleware],
        seulAdmin: [authMiddleware, authorizeAdmin],
      };

${routes}
    },
  });
}
`;
}

function demarrerTs(serveur: ServeurRI): string {
  const stockages = serveur.donnees
    .map((d) => `  ${camel(d.nom)}: pool ? creerStockagePostgres(pool, '${nomTable(d.nom)}') : creerStockageMemoire(),`)
    .join('\n');
  const premiere = serveur.routes[0] ? adresseApi(serveur.routes[0].adresse) : '/auth/me';
  return `// Produit par Humalis : lit l'environnement, crée le premier admin, démarre le serveur « ${serveur.nom} ».
import { createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword, isStrongPassword } from '@astratra/security';
import { createPostgresUsersStore } from '@astratra/store-postgres';
import pg from 'pg';
import { creerServeur } from './serveur.js';
import { creerStockageMemoire, creerStockagePostgres } from './humalis/stockage.js';

function arreter(message: string): never {
  console.error(message);
  process.exit(1);
}

const jwtSecret = process.env.JWT_SECRET ?? '';
if (jwtSecret.length < 32) {
  arreter('JWT_SECRET doit contenir au moins 32 caractères au hasard (voir .env.exemple).');
}

const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
if (!pool) {
  console.warn('Sans DATABASE_URL, les données restent en mémoire et sont perdues à l\\'arrêt : développement seulement.');
}

const usersStore = (pool ? createPostgresUsersStore({ pool }) : createMemoryUsersStore()) as UsersStore;
const stockages = {
${stockages}
};

// Le premier administrateur vient de l'environnement : aucun mot de passe
// n'est écrit dans le code.
const email = process.env.HUMALIS_ADMIN_EMAIL;
const motDePasse = process.env.HUMALIS_ADMIN_MOT_DE_PASSE;
if (email && motDePasse && !(await usersStore.findByEmail(email))) {
  if (!isStrongPassword(motDePasse)) {
    arreter('HUMALIS_ADMIN_MOT_DE_PASSE est trop faible : 8 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.');
  }
  await usersStore.create({ email, role: 'admin', passwordHash: await hashPassword(motDePasse) });
  console.log(\`Administrateur créé : \${email}\`);
}

const port = Number(process.env.PORT ?? 3000);
const app = creerServeur({ jwtSecret, usersStore, stockages }) as unknown as { listen(port: number, pret: () => void): unknown };
app.listen(port, () => {
  console.log(\`Serveur « ${serveur.nom} » prêt : http://localhost:\${port}${premiere}\`);
});
`;
}

function testsRegles(serveur: ServeurRI): string {
  const stockages = serveur.donnees.map((d) => `      ${camel(d.nom)}: creerStockageMemoire(),`).join('\n');
  const ok: Record<Action, number> = { lire: 200, creer: 201, modifier: 200, supprimer: 204 };

  const blocs = serveur.routes.map((route) => {
    const donnee = serveur.donnees.find((d) => d.nom === route.donnee)!;
    const exemple = `{ ${donnee.champs.map((c) => `${camel(c.nom)}: ${exempleChamp(c.type)}`).join(', ')} }`;
    const adresse = adresseApi(route.adresse);
    const tests: string[] = [];

    for (const action of ACTIONS) {
      const qui = route.droits[action];
      const appel = (jeton: string) => {
        const avec = jeton === 'visiteur' ? '' : `.set('authorization', \`Bearer \${${jeton}}\`)`;
        switch (action) {
          case 'lire':
            return `request(app).get('${adresse}')${avec}`;
          case 'creer':
            return `${jeton === 'visiteur' ? 'visiteurAvecCsrf' : 'request(app)'}.post('${adresse}')${avec}${jeton === 'visiteur' ? '.set(csrf)' : ''}.send(${exemple})`;
          case 'modifier':
            return `${jeton === 'visiteur' ? 'visiteurAvecCsrf' : 'request(app)'}.patch(\`${adresse}/\${existant.id}\`)${avec}${jeton === 'visiteur' ? '.set(csrf)' : ''}.send({})`;
          case 'supprimer':
            // Un enregistrement neuf à chaque fois : une suppression réussie efface le précédent.
            return `${jeton === 'visiteur' ? 'visiteurAvecCsrf' : 'request(app)'}.delete(\`${adresse}/\${(await stockages.${camel(route.donnee)}.creer(${exemple})).id}\`)${avec}${jeton === 'visiteur' ? '.set(csrf)' : ''}`;
        }
      };
      const attendu = (permis: boolean, refus: number) => (permis ? ok[action] : refus);
      // Visiteur, utilisateur connecté, admin : ce que chacun doit obtenir.
      const visiteur = qui === 'tout_le_monde' ? ok[action] : qui === null ? 403 : 401;
      const utilisateur = attendu(qui === 'tout_le_monde' || qui === 'connecte', 403);
      const admin = attendu(qui !== null, 403);
      tests.push(`    it('${action} : visiteur ${visiteur}, utilisateur ${utilisateur}, admin ${admin}', async () => {
      await ${appel('visiteur')}.expect(${visiteur});
      await ${appel('jetonUtilisateur')}.expect(${utilisateur});
      await ${appel('jetonAdmin')}.expect(${admin});
    });`);
    }

    const createur = route.droits.creer === null ? null : route.droits.creer === 'tout_le_monde' ? 'visiteur' : route.droits.creer === 'connecte' ? 'jetonUtilisateur' : 'jetonAdmin';
    if (createur && donnee.champs.length > 0) {
      const avec = createur === 'visiteur' ? `visiteurAvecCsrf.post('${adresse}').set(csrf)` : `request(app).post('${adresse}').set('authorization', \`Bearer \${${createur}}\`)`;
      tests.push(`    it('refuse un envoi mal formé (400)', async () => {
      const reponse = await ${avec}.send({});
      expect(reponse.status).toBe(400);
      expect(reponse.body.erreur).toContain('manque');
    });`);
    }

    return `  describe('route « ${route.adresse} » (${decrireDroits(route.droits)})', () => {
    let existant: { id: string };
    beforeEach(async () => {
      existant = await stockages.${camel(route.donnee)}.creer(${exemple});
    });

${tests.join('\n\n')}
  });`;
  });

  return `// Produit par Humalis : une vérification par règle d'accès du serveur « ${serveur.nom} ».
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from '../src/serveur.js';
import { creerStockageMemoire } from '../src/humalis/stockage.js';

const MOT_DE_PASSE = 'Essai-Solide-2026!';
const stockages = {
${stockages}
};
let app: Parameters<typeof request>[0];
let jetonAdmin = '';
let jetonUtilisateur = '';
// Un visiteur garde son cookie CSRF, amorcé par une première lecture.
let visiteurAvecCsrf: ReturnType<typeof request.agent>;
let csrf: Record<string, string> = {};

async function connecter(email: string): Promise<string> {
  const reponse = await request(app).post('/auth/login').send({ email, password: MOT_DE_PASSE }).expect(200);
  return reponse.body.data.token;
}

beforeAll(async () => {
  const usersStore = createMemoryUsersStore() as UsersStore;
  const passwordHash = await hashPassword(MOT_DE_PASSE);
  await usersStore.create({ email: 'admin@exemple.cd', role: 'admin', passwordHash });
  await usersStore.create({ email: 'awa@exemple.cd', role: 'utilisateur', passwordHash });
  app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages }) as never;
  jetonAdmin = await connecter('admin@exemple.cd');
  jetonUtilisateur = await connecter('awa@exemple.cd');
  visiteurAvecCsrf = request.agent(app);
  const amorce = await visiteurAvecCsrf.get('/auth/me');
  const cookie = ([] as string[]).concat(amorce.headers['set-cookie'] ?? []).find((c) => c.startsWith('astratra_csrf='));
  // Hors développement, le pack marque ce cookie « Secure » : en http, l'agent
  // ne le renverrait pas. Le visiteur le renvoie donc lui-même, avec l'en-tête.
  const jeton = cookie?.split(';')[0].split('=')[1];
  csrf = jeton ? { 'x-csrf-token': jeton, cookie: \`astratra_csrf=\${jeton}\` } : {};
});

describe('règles d\\'accès', () => {
${blocs.join('\n\n')}
});
`;
}

function lisezmoi(serveur: ServeurRI, options: OptionsServeur): string {
  const routes = serveur.routes
    .map((r) => `| \`${adresseApi(r.adresse)}\` | ${r.donnee} | ${decrireDroits(r.droits)} |`)
    .join('\n');
  return `# Serveur « ${serveur.nom} »

Produit par Humalis depuis \`${options.source}\`. La sécurité (connexion,
sessions, rôles, protection CSRF, limites, en-têtes) vient des packs
Astratra (\`@astratra/saas-kit\`, \`@astratra/security\`) ; le code produit les
assemble, décrit les données et vérifie la forme des envois.

Il faut Node.js 24 (et son npm 11 : avec npm 10, \`npm install\` peut
échouer sur l'erreur « edgesOut », un bug de npm).

\`\`\`sh
npm install
cp .env.exemple .env      # puis remplis JWT_SECRET et l'administrateur
npm test                  # vérifie chaque règle d'accès
npm run build && npm start
\`\`\`

Sans \`DATABASE_URL\`, les données restent en mémoire (développement). Avec,
chaque donnée a sa table PostgreSQL (\`${serveur.donnees.map((d) => nomTable(d.nom)).join('`, `')}\`).

## Les routes

| Adresse | Donnée | Qui peut quoi |
|---|---|---|
${routes}

Chaque adresse accepte \`GET\` (liste), \`GET /:id\`, \`POST\`, \`PATCH /:id\` et
\`DELETE /:id\`. Une action sans règle est refusée à tout le monde (403).
Se connecter : \`POST /auth/login\` avec \`{ "email", "password" }\`.

## La sécurité et ses mises à jour

Toute la sécurité vient des packs Astratra (\`@astratra/saas-kit\`,
\`@astratra/security\`, \`@astratra/store-postgres\`), à des versions
exactes. Pour savoir si ce projet est en retard sur ton Humalis :
\`humalis packs --verifier .\` ; pour passer aux nouvelles versions,
recompile ton programme. Pour les failles connues des autres
dépendances : \`npm audit\`.

Ce dossier est réécrit à chaque compilation Humalis (fichier \`${MARQUE_SERVEUR}\`).
`;
}
