import { SQLITE, SYNCHRO_SQLITE } from './sqlite.js';
import { MYSQL, SYNCHRO_MYSQL } from './mysql.js';
import { EXPLOITATION_DOCUMENTS, EXPLOITATION_MYSQL } from './exploitation-bases.js';
import { documentsTs, SYNCHRO_DOCUMENTS } from './documents.js';
import { servicesTs, variableDuService } from './services.js';
import { champsRendus, DEFAUTS_TS, LISEZMOI_EVOLUTION, verifierDonneesMjs } from './evolution.js';
import { CODE_SANTE, CODE_SANTE_DEMARRAGE, codeArret, fichiersDeploiement, lisezmoiExploitation, restaurerMjs, sauvegarderMjs } from './exploitation.js';
import { BORNES_TS, exempleDansLesBornes } from './bornes.js';
import { testsAttaques } from './attaques.js';
import { LIGNES_SERVEUR_TS } from './lignes.js';
import { COMPOSER_CARTES_JS } from '../lignes-humalis.js';
import { codeEffacerLesDonnees } from './suppression.js';
import { avecComptes, avecEmails, CLES_EMAILS, codeCreationComptes, codeEnvois, codeRoutesComptes, COMPTES, EMAILS, ENV_EMAILS, ENV_LIENS, testsComptes } from './comptes.js';
import { codeFicheVisible, codePortee, compteRelu, conditionsDe, constantesSeparation, estSeparee, SEPARATION, testsSeparee } from './separation.js';
import { avecIa, ENV_IA, IA, routeIa } from './ia.js';
import { ENVOIS } from './envois.js';
import { MOTIF_SQL_DU_PACK, MOTIFS_SQL_CODE } from './pare-feu.js';
import { codeResumes, avecPaiements, codePaiements, codeSurPaiement, ENV_PAIEMENTS, PAIEMENTS, avecLogique, avecNotifications, codeActions, codeDocuments, codeNotificationsCreation, codeReceveurs, codeTaches, DOCUMENT, employe, LOGIQUE, avecAnnonces, NOTIFICATIONS, ROUTES_APPAREILS } from './logique.js';
import { champsDuServeur, codeCompleter, codeEcritureModification, codeCreation, codePlafondsModification, noms as nomsVerifier, reglesEnvoi } from './regles.js';
import { avecSynchro, codeAvantSynchro, codeCreationSynchro, codeSynchroRoute, ENV_SYNCHRO, SYNCHRO, tablesSynchro, testsSynchro } from './synchro.js';
import { avecSecurite, codeAvantSecurite, codeCreationSecurite, codeRoutesSecurite, envSecurite, SECURITE, testsSecurite } from './securite.js';
import { ligneLocale } from '../../fichiers.js';
import { avecLiveKit, avecTempsReel, codeMontageTempsReel, ENV_TEMPS_REEL, IMPORT_TEMPS_REEL, serveurOrdinaire, tempsReelTs, VERSION_LIVEKIT_SERVEUR } from './temps-reel.js';
import type { ServeurRI, TypeChamp, QuiPeut } from '../../ri/types.js';
import { simplifier } from '../../analyse/elements.js';
import { pascal, camel } from '../web/noms.js';
import { codeCaptureErreurs, codeRelaisErreurs, variablesCapture } from './capture-erreurs.js';
import { codeReglagesPostgres } from './connexion-postgres.js';
import { CACHE } from './cache.js';

export interface OptionsServeur {
  /** Le nom du projet, tiré du fichier Humalis. */
  nom: string;
  /** Le fichier Humalis d'origine, cité dans le LISEZMOI. */
  source: string;
  /** Le chemin de chaque page : celui qu'ouvre un lien envoyé par e-mail. */
  chemins?: Map<string, string>;
}

/** Versions épinglées des dépendances du serveur produit. */
export const VERSIONS_SERVEUR = {
  notify: '1.3.0',
  saasKit: '2.1.1',
  security: '1.15.1',
  storePostgres: '1.2.0',
  credentials: '1.2.1',
  tooling: '1.7.1',
  pdf: '1.1.0',
  pdfkit: '0.18.0',
  typesPdfkit: '0.17.7',
  loyalty: '1.1.0',
  express: '5.3.0',
  pg: '8.23.1',
  mysql2: '3.24.6',
  mongodb: '7.8.0',
  redis: '6.3.1',
  typescript: '7.0.2',
  typesNode: '26.2.0',
  typesExpress: '5.0.6',
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
/** Le canal « en direct » sert aussi au temps réel. */
const avecDirect = (serveur: ServeurRI & { tempsReel?: boolean }): boolean => serveur.tempsReel === true || avecAnnonces(serveur);
/** « en cache pendant … » dans une route ou une source relayée : le module du cache, et les annonces qui le vident partout. */
const avecCache = (serveur: ServeurRI): boolean => serveur.routes.some((r) => r.cache !== undefined) || (serveur.passerelles ?? []).some((p) => p.cache !== undefined);
/** Le module du cache sert aussi de relais Redis aux annonces en direct. */
const avecModuleCache = (_serveur: ServeurRI): boolean => true;

export function genererProjetServeur(complet: ServeurRI, options: OptionsServeur): Map<string, string> {
  // Les routes du temps réel sont servies à part : le reste du générateur ne les voit pas.
  const serveur = serveurOrdinaire(complet);
  const fichiers = new Map<string, string>();
  if (avecTempsReel(complet)) fichiers.set('src/humalis/temps-reel.ts', tempsReelTs(complet));
  fichiers.set(MARQUE_SERVEUR, `Projet produit par Humalis depuis ${options.source}.\nLe compilateur réécrit ce dossier à chaque compilation.\n`);
  fichiers.set('package.json', packageJson(options.nom, serveur, avecLiveKit(complet)));
  fichiers.set('tsconfig.json', TSCONFIG);
  fichiers.set('.gitignore', 'node_modules\ndist\n.env\nsauvegardes\n');
  // L'exploitation : sauvegarde, restauration, exemples de déploiement.
  fichiers.set('scripts/sauvegarder.mjs', sauvegarderMjs(serveur));
  fichiers.set('scripts/verifier-donnees.mjs', verifierDonneesMjs(serveur, { camel, table: nomTable, schema: (donnee) => `SCHEMA_${simplifier(donnee).toUpperCase()}` }));
  fichiers.set('scripts/restaurer.mjs', restaurerMjs(serveur));
  fichiers.set('scripts/bases/mysql.mjs', EXPLOITATION_MYSQL);
  if (serveur.projet && serveur.projet.comptes === serveur.nom) fichiers.set('scripts/cles-comptes.mjs', CLES_COMPTES);
  if (serveur.projet) fichiers.set('scripts/cle-service.mjs', cleService(serveur.nom));
  fichiers.set('scripts/bases/documents.mjs', EXPLOITATION_DOCUMENTS);
  for (const [chemin, contenu] of fichiersDeploiement(serveur)) fichiers.set(chemin, contenu);
  fichiers.set('.env.exemple', envExemple(serveur));
  fichiers.set('LISEZMOI.md', lisezmoi(serveur, options));
  fichiers.set('src/humalis/verifier.ts', VERIFIER);
  fichiers.set('src/humalis/stockage.ts', STOCKAGE);
  fichiers.set('src/humalis/sqlite.ts', SQLITE);
  fichiers.set('src/humalis/mysql.ts', MYSQL);
  fichiers.set('src/humalis/postgres.ts', codeReglagesPostgres(true));
  if (serveur.projet) fichiers.set('src/humalis/services.ts', servicesTs(serveur));
  fichiers.set('src/humalis/documents.ts', documentsTs({ securite: avecSecurite(serveur), comptes: avecComptes(serveur), taches: Boolean(serveur.taches?.length), ia: avecIa(serveur) }));
  fichiers.set('src/humalis/envois.ts', ENVOIS);
  fichiers.set('src/humalis/compresser.ts', COMPRESSER);
  fichiers.set('src/humalis/renouvellements.ts', RENOUVELLEMENTS);
  fichiers.set('src/humalis/sessions.ts', SESSIONS);
  if (serveur.captureErreurs) fichiers.set('src/humalis/capture-erreurs.ts', codeCaptureErreurs(serveur));
  if (serveur.relaisErreurs?.length) fichiers.set('src/humalis/relais-erreurs.ts', codeRelaisErreurs(serveur.relaisErreurs));
  // Les lignes Humalis : les erreurs du journal et de la capture nomment le fichier .humalis et sa ligne.
  fichiers.set('src/humalis/lignes.ts', LIGNES_SERVEUR_TS);
  fichiers.set('humalis-cartes.mjs', COMPOSER_CARTES_JS);
  fichiers.set('src/humalis/coffre.ts', coffreTs(serveur));
  fichiers.set('src/donnees.ts', donneesTs(serveur));
  if (avecSynchro(serveur)) {
    fichiers.set('src/humalis/synchro.ts', SYNCHRO);
    fichiers.set('src/humalis/synchro-sqlite.ts', SYNCHRO_SQLITE);
    fichiers.set('src/humalis/synchro-mysql.ts', SYNCHRO_MYSQL);
    fichiers.set('src/humalis/synchro-documents.ts', SYNCHRO_DOCUMENTS);
    const route = serveur.routes.find((r) => r.synchronisee)!;
    const exemple = serveur.donnees.find((d) => d.nom === route.donnee)!.champs.filter((c) => !champsDuServeur(serveur.donnees.find((d) => d.nom === route.donnee)!, route).includes(camel(c.nom))).map((c) => `${camel(c.nom)}: ${exempleChamp(c.type)}`).join(', ');
    fichiers.set('tests/synchro.test.ts', testsSynchro(serveur, serveur.donnees.map((d) => `    ${camel(d.nom)}: creerStockageMemoire(),`).join('\n'), route, `{ ${exemple} }`));
    // Les mêmes essais sur SQLite : le journal y est écrit par le serveur, pas par des déclencheurs.
    fichiers.set(
      'tests/synchro-sqlite.test.ts',
      testsSynchro(serveur, serveur.donnees.map((d) => `    ${camel(d.nom)}: creerStockageSqlite(base, '${nomTable(d.nom)}'),`).join('\n'), route, `{ ${exemple} }`)
        .replace('// Produit par Humalis : la synchronisation, de bout en bout, sur le vrai serveur.', '// Produit par Humalis : la synchronisation, de bout en bout, sur le vrai serveur et une vraie base SQLite.')
        .replace("import { creerStockageMemoire } from '../src/humalis/stockage.js';", "import { creerStockageSqlite, ouvrirSqlite } from '../src/humalis/sqlite.js';\nimport { creerJournalSqlite } from '../src/humalis/synchro-sqlite.js';")
        .replace('  const stockages = {', "  const base = ouvrirSqlite(':memory:');\n  const stockages = {")
        .replace('usersStore, stockages })', `usersStore, stockages, journalSynchro: creerJournalSqlite(base, ${tablesSynchro(serveur, nomTable)}) })`),
    );
  }
  if (avecSecurite(serveur)) {
    fichiers.set('src/humalis/securite.ts', SECURITE);
    fichiers.set('tests/securite.test.ts', testsSecurite(serveur, serveur.donnees.map((d) => `    ${camel(d.nom)}: creerStockageMemoire(),`).join('\n')));
  }
  if (avecEmails(serveur)) fichiers.set('src/humalis/emails.ts', EMAILS);
  if (avecComptes(serveur)) fichiers.set('src/humalis/comptes.ts', COMPTES);
  if (serveur.invitations || serveur.inscriptionLibre || serveur.motDePasseOublie || serveur.routeComptes) {
    fichiers.set('tests/comptes.test.ts', testsComptes(serveur, serveur.donnees.map((d) => `    ${camel(d.nom)}: creerStockageMemoire(),`).join('\n')));
  }
  fichiers.set('src/serveur.ts', serveurTs(serveur, options.chemins, avecTempsReel(complet) ? codeMontageTempsReel(complet) : ''));
  fichiers.set('src/demarrer.ts', demarrerTs(serveur));
  fichiers.set('tests/regles.test.ts', testsRegles(serveur));
  // Les tests négatifs : ce qu'un attaquant essaie sur chaque route de ce programme.
  const attaques = testsAttaques(serveur);
  if (attaques) fichiers.set('tests/attaques.test.ts', attaques);
  fichiers.set('tests/sessions.test.ts', testsSessions(serveur));
  if (avecDirect(serveur)) fichiers.set('src/humalis/direct.ts', DIRECT);
  if (avecModuleCache(serveur)) fichiers.set('src/humalis/cache.ts', CACHE);
  if (compteRelu(serveur) || serveur.routes.some((r) => r.actions?.length && serveur.donnees.find((d) => d.nom === r.donnee)?.par)) fichiers.set('src/humalis/separation.ts', SEPARATION);
  if (avecLogique(serveur)) fichiers.set('src/humalis/logique.ts', LOGIQUE);
  if (serveur.documents?.length) fichiers.set('src/humalis/document.ts', DOCUMENT);
  if (avecNotifications(serveur)) fichiers.set('src/humalis/notifications.ts', NOTIFICATIONS);
  if (avecIa(serveur)) fichiers.set('src/humalis/ia.ts', IA);
  if (avecPaiements(serveur)) fichiers.set('src/humalis/paiements.ts', PAIEMENTS);
  if (serveur.routes.some((r) => r.bon)) {
    fichiers.set('src/humalis/bon.ts', BON);
    fichiers.set('tests/bon.test.ts', testsBon(serveur));
  }
  if (serveur.fidelite) {
    fichiers.set('src/humalis/fidelite.ts', FIDELITE);
    fichiers.set('tests/fidelite.test.ts', testsFidelite(serveur));
  }
  // Un service qui prend ses comptes ailleurs : ni connexion ni session ici. Ses essais fabriquent les jetons comme le
  // service des comptes (ES256, une clé d'essai), et les essais de la session restent à ce service-là.
  if (serveur.projet && serveur.projet.comptes !== serveur.nom) {
    fichiers.delete('tests/sessions.test.ts');
    for (const [chemin, contenu] of fichiers) if (chemin.startsWith('tests/') && chemin.endsWith('.ts')) fichiers.set(chemin, essaisSansComptes(contenu));
  }
  return fichiers;
}

/** Les essais d'un service sans comptes : le jeton de chaque compte d'essai est signé ici, avec une clé d'essai. */
function essaisSansComptes(texte: string): string {
  if (!texte.includes("post('/auth/login')")) return texte;
  const corps = texte
    .replaceAll("request(app).post('/auth/login').send({ email, password: MOT_DE_PASSE }).expect(200)", '(async () => ({ body: { data: { token: await jetonDuTest(email) } } }))()')
    .replaceAll("creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore,", 'creerServeur({ jwtSecret: CLES_DU_TEST.publicKey, cleDesJetons: CLES_DU_TEST.publicKey, usersStore: (comptesDuTest.store = usersStore),')
    .replaceAll(".get('/auth/me')", ".get('/humalis-amorce')");
  const [premiere, ...reste] = corps.split('\n');
  return [
    premiere,
    "import { generateKeyPairSync, randomUUID, sign as signerJeton } from 'node:crypto';",
    ...reste,
    `
// Ce service prend ses comptes chez un autre : le jeton est fabriqué comme le service des comptes le fait (ES256).
const CLES_DU_TEST = generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const comptesDuTest: { store?: { findByEmail(email: string): unknown } } = {};
const jetonsSignes = new Map<string, string>();
async function jetonDeCompte(email: string): Promise<string> {
  const compte = (await comptesDuTest.store!.findByEmail(email)) as Record<string, unknown>;
  const { passwordHash: _cache, ...publique } = compte;
  void _cache;
  const b64 = (valeur: unknown) => Buffer.from(JSON.stringify(valeur)).toString('base64url');
  const maintenant = Math.floor(Date.now() / 1000);
  const debut = b64({ alg: 'ES256', typ: 'JWT' }) + '.' + b64({ ...publique, jti: randomUUID(), iat: maintenant, exp: maintenant + 900 });
  return debut + '.' + signerJeton('sha256', Buffer.from(debut), { key: CLES_DU_TEST.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}
function jetonDuTest(email: string): Promise<string> {
  return jetonDeCompte(email).then((jeton) => {
    jetonsSignes.set(email, jeton);
    return jeton;
  });
}
`,
  ].join('\n');
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
  if (type.genre === 'texte' && type.image) return "'image'";
  return type.genre === 'liste' ? `{ liste: ${schemaChamp(type.de)} }` : `'${type.genre}'`;
}

/** Une valeur valide pour un champ, utilisée par les tests produits. */
function exempleChamp(type: TypeChamp): string {
  switch (type.genre) {
    case 'texte':
      return type.image ? "''" : "'exemple'";
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

function packageJson(nom: string, serveur: ServeurRI, livekit = false): string {
  const v = VERSIONS_SERVEUR;
  const bon = serveur.routes.some((r) => r.bon) || Boolean(serveur.documents?.length);
  return JSON.stringify(
    {
      name: `${simplifier(nom).replace(/_/g, '-') || 'serveur'}-serveur`,
      version: '1.0.0',
      private: true,
      type: 'module',
      // Les packs Astratra demandent Node 22 ; --env-file-if-exists (scripts plus bas) existe depuis Node 22.9.
      engines: { node: '>=22.9' },
      scripts: {
        // Après tsc, les cartes de sources sont reliées aux fichiers Humalis : les piles d'erreurs nomment leurs lignes.
        build: 'tsc && node humalis-cartes.mjs',
        start: 'node --enable-source-maps --env-file-if-exists=.env dist/src/demarrer.js',
        test: 'vitest run --dir tests',
        sauvegarde: 'node --env-file-if-exists=.env scripts/sauvegarder.mjs',
        verification: 'node --env-file-if-exists=.env scripts/verifier-donnees.mjs',
        restauration: 'node --env-file-if-exists=.env scripts/restaurer.mjs',
        ...(serveur.projet && serveur.projet.comptes === serveur.nom ? { cles: 'node scripts/cles-comptes.mjs' } : {}),
        ...(serveur.projet ? { 'cle-service': 'node scripts/cle-service.mjs' } : {}),
        // Les failles connues des dépendances, et les secrets écrits en dur dans un journal ou une réponse.
        'audit:deps': 'astratra audit:deps',
        'audit:secrets': 'astratra audit:secrets',
      },
      dependencies: {
        '@astratra/credentials': v.credentials,
        ...(serveur.fidelite ? { '@astratra/loyalty': v.loyalty } : {}),
        // @astratra/notify : les e-mails, et les notifications web (Web Push écrit dans le paquet, sans web-push).
        ...(avecEmails(serveur) || avecNotifications(serveur) ? { '@astratra/notify': v.notify } : {}),
        ...(avecEmails(serveur) ? { nodemailer: '10.3.1' } : {}),
        ...(bon ? { '@astratra/pdf': v.pdf } : {}),
        '@astratra/saas-kit': v.saasKit,
        '@astratra/security': v.security,
        '@astratra/store-postgres': v.storePostgres,
        express: v.express,
        ...(bon ? { pdfkit: v.pdfkit } : {}),
        ...(livekit ? { 'livekit-server-sdk': VERSION_LIVEKIT_SERVEUR } : {}),
        mongodb: v.mongodb,
        mysql2: v.mysql2,
        pg: v.pg,
        // HUMALIS_CACHE_ADRESSE : le cache, les annonces et les limites de requêtes partagés par tous les exemplaires.
        redis: v.redis,
      },
      devDependencies: {
        '@astratra/tooling': v.tooling,
        '@types/express': v.typesExpress,
        '@types/node': v.typesNode,
        ...(bon ? { '@types/pdfkit': v.typesPdfkit } : {}),
        ...(avecEmails(serveur) ? { '@types/nodemailer': '8.0.2' } : {}),
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
      sourceMap: true,
      types: ['node'],
    },
    include: ['src', 'tests'],
  },
  null,
  2,
) + '\n';

/** « connexion apple » : les identifiants publics donnés par Apple (pas des secrets). */
const ENV_APPLE = `# La connexion avec Apple (« connexion apple »). Ce ne sont pas des secrets.
# APPLE_APP_ID : l'identifiant de l'application iPhone, iPad et Mac (dev.exemple.boutique).
# APPLE_SERVICE_ID : l'identifiant de services créé chez Apple, pour le site.
APPLE_APP_ID=
APPLE_SERVICE_ID=
# APPLE_RETOUR_ANDROID : le lien profond de l'application Android (magasin://connexion-apple).
# Apple renvoie la personne sur /auth/apple/retour, puis le serveur la renvoie dans l'application.
APPLE_RETOUR_ANDROID=
`;

/** « connexion google » : l'ID client OAuth de Google (pas un secret). */
const ENV_GOOGLE = `# La connexion avec Google (« connexion google ») : l'ID client OAuth d'une
# application Web, créé dans la Google Cloud Console (ce n'est pas un secret).
# Adresses de redirection autorisées : https://ton-site/auth-google.html
GOOGLE_CLIENT_ID=
# L'ID client de type « iOS » (com.xxx.apps.googleusercontent.com), pour l'application iPhone, iPad et Mac.
GOOGLE_CLIENT_ID_APPLE=
`;

const ENV_EXEMPLE = `# Copie ce fichier en .env et remplis-le. Ne le publie jamais.

# Le secret des sessions : au moins 32 caractères au hasard.
JWT_SECRET=

# Le premier administrateur, créé au premier démarrage s'il n'existe pas.
# Le mot de passe doit être solide : 8 caractères minimum, avec majuscule,
# minuscule, chiffre et caractère spécial.
HUMALIS_ADMIN_EMAIL=
HUMALIS_ADMIN_MOT_DE_PASSE=

# La base, au choix : rien n'est choisi d'avance. Sans base, les données restent en mémoire (développement).
# DATABASE_URL : la base se reconnaît au début de l'adresse. Plusieurs exemplaires du serveur peuvent la partager.
#   postgres://utilisateur:mot-de-passe@hote:5432/base     PostgreSQL
#   mysql://utilisateur:mot-de-passe@hote:3306/base        MySQL (mariadb://… pour MariaDB)
#   mongodb://hote:27017/base?replicaSet=nom               une base de documents, avec transactions (jeu de répliques)
# Une base sur une autre machine se chiffre (TLS), le certificat du serveur vérifié :
#   PostgreSQL : ?sslmode=require (ou verify-full), et &sslrootcert=/chemin/ca.pem pour l'autorité de l'hébergeur ;
#     &channel_binding=require lie la connexion au canal chiffré. Donnez l'adresse directe, pas celle d'un relais
#     de connexions (« -pooler », port 6543) : il couperait les annonces en direct et les verrous
#   MySQL, MariaDB : ?ssl-mode=REQUIRED (ou VERIFY_IDENTITY), et &ssl-ca=/chemin/ca.pem ; VERIFY_CA ne vérifie pas le nom
#   documents : ?tls=true, ou une adresse mongodb+srv://… (chiffrée d'office), et &tlsCAFile=/chemin/ca.pem
DATABASE_URL=
# SQLite : un seul fichier, rien à installer (Node 24 ou plus récent). Un seul exemplaire du serveur par fichier.
# Exemple : HUMALIS_BASE=donnees/base.sqlite
HUMALIS_BASE=

# Le cache (facultatif) : Redis, Valkey ou un serveur compatible. redis://hote:6379, ou rediss://… (chiffré, certificat
# vérifié ; NODE_EXTRA_CA_CERTS=/chemin/ca.pem pour l'autorité d'un hébergeur). Il garde les lectures « en cache »,
# porte les annonces en direct et compte les limites de requêtes pour tous les exemplaires. Sans lui : la mémoire de
# chaque serveur. La base reste la seule mémoire de référence.
HUMALIS_CACHE_ADRESSE=

# La session : elle se renouvelle tant que la personne revient.
# HUMALIS_SESSION : après ce temps sans venir, il faut se reconnecter (« 3d », « 12h » ; 3 jours par défaut).
# HUMALIS_SESSION_MAX : après ce temps depuis la connexion, il faut se reconnecter, même en revenant chaque jour (30 jours par défaut).
HUMALIS_SESSION=
HUMALIS_SESSION_MAX=

# Le nombre de relais devant le serveur (nginx : 1). Sans lui, les limites de requêtes comptent le relais, pas chaque visiteur.
HUMALIS_RELAIS=
# L'adresse d'écoute. Derrière un relais sur la même machine : 127.0.0.1, le serveur n'est alors joignable que par lui. Sans elle, toutes les adresses.
HUMALIS_ECOUTE=

# Le coffre des clés de service, chiffrées en base et modifiables sans redémarrer (/auth/cles, réservé à l'admin).
# 32 octets au hasard : openssl rand -base64 32. Sans elle, le coffre reste fermé et le .env sert seul.
# La perdre rend illisibles les clés déjà rangées : garde-la hors de la base.
ENCRYPTION_KEY=

PORT=3000
`;

function envExemple(serveur: ServeurRI): string {
  const enPlus = [
    ...(serveur.connexionGoogle ? [ENV_GOOGLE] : []),
    ...(serveur.connexionApple ? [ENV_APPLE] : []),
    ...(serveur.emails ? [ENV_EMAILS] : []),
    ...(avecSynchro(serveur) ? [ENV_SYNCHRO] : []),
    ...(avecSecurite(serveur) ? [envSecurite(serveur)] : []),
    `# Le plus grand nombre de fiches qu'une lecture de liste renvoie (1000 par défaut). La suite se lit avec ?depuis=1000.\nHUMALIS_LISTE_MAX=`,
    `# Le pare-feu. « strict » (par défaut) refuse aussi un texte envoyé qui contient une balise de script, « javascript: »,\n# « \${…} », « ../../../ » ou « eval( ». « adresses » ne lit que l'adresse pour ces motifs : à choisir pour un cours\n# d'informatique, un forum technique, un support où l'on colle du code. Les injections SQL restent refusées partout.\nHUMALIS_PARE_FEU=`,
    `# Requêtes par adresse et par 15 minutes (300 par défaut), tentatives de connexion (10 par défaut). À monter si beaucoup de personnes partagent une même adresse.\nHUMALIS_LIMITE_API=\nHUMALIS_LIMITE_CONNEXION=\n`,
    ...(avecIa(serveur) ? [ENV_IA] : []),
    ...((serveur as { tempsReel?: boolean }).tempsReel ? [ENV_TEMPS_REEL] : []),
    ...(avecPaiements(serveur) ? [ENV_PAIEMENTS] : []),
    ...(serveur.invitations || serveur.inscriptionLibre || serveur.motDePasseOublie || serveur.donnees.some((d) => d.champs.some((c) => c.regle?.genre === 'site')) ? [ENV_LIENS] : []),
    // Les secrets des sources : seulement leur nom ; la valeur se met ici, sur le serveur, jamais dans le fichier Humalis.
    ...(serveur.passerelles ?? []).map((p) => `# Le secret de la source « ${p.source} » (jeton secret depuis l'environnement).\n${p.variable}=\n`),
    // « quand une erreur arrive » : l'adresse et la clé du système de suivi choisi. Sans elles, rien ne part.
    ...(() => {
      const requetes = (serveur.captureErreurs ?? []).flatMap((i) => (i.type === 'requete' ? [{ adresse: i.adresse, ...(i.adresseEnvironnement ? { adresseEnvironnement: i.adresseEnvironnement } : {}), ...(serveur.jetonErreurs ? { jeton: serveur.jetonErreurs } : {}) }] : []));
      const variables = variablesCapture([...requetes, ...(serveur.relaisErreurs ?? [])]);
      return variables.length ? [`# « quand une erreur arrive » : l'adresse et la clé du système de suivi des erreurs choisi. Sans elles, aucun rapport ne part.\n${variables.map((v) => `${v}=`).join('\n')}\n`] : [];
    })(),
  ];
  const exemple = ENV_EXEMPLE.replace('\nPORT=3000', [...enPlus, ...(serveur.projet ? [envServices(serveur)] : [])].join('\n') + '\nPORT=3000');
  // Un service sans comptes : ni secret des sessions ni administrateur ici, ils sont au service des comptes.
  return serveur.projet && serveur.projet.comptes !== serveur.nom
    ? exemple.replace(/# Le secret des sessions[\s\S]*?HUMALIS_ADMIN_MOT_DE_PASSE=\n\n/, '')
    : exemple;
}

/** Le .env d'un service du projet : le secret partagé, les adresses des services joints, la clé des jetons. */
function envServices(serveur: ServeurRI): string {
  const projet = serveur.projet!;
  const gardien = projet.comptes === serveur.nom;
  return `# Les services du projet (${projet.services.map((n) => `« ${n} »`).join(', ')}).
# Chaque service signe ses appels et ses messages avec sa propre clé : « npm run cle-service » écrit sa clé privée (ici)
# et sa clé publique (à donner aux autres services).
HUMALIS_SERVICE_CLE_PRIVEE=
# La clé publique de chaque autre service (« npm run cle-service » dans ce service-là).
${projet.services.filter((n) => n !== serveur.nom).map((n) => `${variableDuService(n)}_CLE=`).join('\n')}
${projet.joints.length ? `# L'adresse de chaque service que celui-ci appelle ou prévient, sans / à la fin (par exemple http://127.0.0.1:3002).
${projet.joints.map((j) => `${variableDuService(j)}=`).join('\n')}
` : ''}${gardien ? `# Ce service garde les comptes du projet et signe leurs jetons : sa clé privée. « npm run cles » écrit
# cette ligne, et la clé publique à donner aux autres services.
HUMALIS_COMPTES_CLE_PRIVEE=` : `# Ce service prend ses comptes chez « ${projet.comptes} » : la clé publique de ses jetons
# (« npm run cles » dans le service « ${projet.comptes} » la donne).
HUMALIS_COMPTES_CLE_PUBLIQUE=`}
# Derrière le relais « entree » : HUMALIS_RELAIS=1, pour que les limites comptent chaque visiteur.
`;
}

/**
 * Le magasin des renouvellements de session : l'empreinte de chaque jeton, jamais le jeton, en
 * mémoire ou dans PostgreSQL. Le service de @astratra/security fait la rotation et révoque toute la
 * famille d'un jeton rejoué ; `plafonner` ajoute le plafond absolu depuis la connexion.
 */
const RENOUVELLEMENTS = `import type { RefreshTokenRecord, RefreshTokenStore } from '@astratra/security';
import type { PoolPostgres } from './stockage.js';

/**
 * Produit par Humalis. \`familyStartedAt\` : la connexion d'origine, recopiée à chaque rotation
 * (le ménage efface les vieilles lignes d'une famille, jamais la dernière).
 */
export type LigneRenouvellement = RefreshTokenRecord & { familyStartedAt?: number };

export interface MagasinRenouvellements extends RefreshTokenStore {
  debutDeFamille(familyId: string): Promise<number | null>;
}

/** Perdu à l'arrêt du serveur : développement et tests seulement. */
export function creerMagasinMemoire(): MagasinRenouvellements {
  const lignes = new Map<string, LigneRenouvellement>();
  const deLaFamille = (familyId: string) => [...lignes.values()].filter((l) => l.familyId === familyId);
  return {
    async save(ligne) {
      lignes.set(ligne.id, { ...ligne });
    },
    async findByHash(hash) {
      const ligne = [...lignes.values()].find((l) => l.hash === hash);
      return ligne ? { ...ligne } : null;
    },
    async markConsumed(id, at) {
      const ligne = lignes.get(id);
      if (ligne) ligne.consumedAt = at;
    },
    async revokeFamily(familyId, at) {
      for (const ligne of deLaFamille(familyId)) ligne.revokedAt ??= at;
    },
    async revokeAllForUser(userId, at) {
      for (const ligne of lignes.values()) if (ligne.userId === userId) ligne.revokedAt ??= at;
    },
    async deleteExpired(before) {
      let retirees = 0;
      for (const [id, ligne] of lignes) {
        if (ligne.expiresAt <= before) retirees += Number(lignes.delete(id));
      }
      return retirees;
    },
    async debutDeFamille(familyId) {
      const debuts = deLaFamille(familyId).map((l) => l.familyStartedAt ?? l.createdAt);
      return debuts.length > 0 ? Math.min(...debuts) : null;
    },
  };
}

/**
 * Les jetons fermés avant leur fin, dans PostgreSQL : une déconnexion ou un compte retiré valent sur tous les
 * exemplaires du serveur, et après un redémarrage. Un jeton d'accès dure quinze minutes : les lignes passées sont effacées.
 */
export function creerRevocationsPostgres(pool: PoolPostgres): { revoke(jti: string, expiresAt: number): Promise<void>; isRevoked(jti?: string): Promise<boolean>; revokeAllForUser(userId: string, revokedBeforeMs: number): Promise<void>; isRevokedForUser(userId: string, issuedAtSeconds: number): Promise<boolean> } {
  let prete: Promise<unknown> | undefined;
  const preparer = () =>
    (prete ??= pool
      .query(
        'CREATE TABLE IF NOT EXISTS jetons_fermes (jti TEXT PRIMARY KEY, expire_le BIGINT NOT NULL);' +
          ' CREATE TABLE IF NOT EXISTS comptes_fermes (utilisateur TEXT PRIMARY KEY, avant BIGINT NOT NULL);',
      )
      .catch((erreur: unknown) => {
        prete = undefined;
        throw erreur;
      }));
  return {
    async revoke(jti, expiresAt) {
      if (!jti) return;
      await preparer();
      const fin = Number(expiresAt);
      await pool.query('DELETE FROM jetons_fermes WHERE expire_le < $1', [Date.now()]);
      await pool.query('INSERT INTO jetons_fermes (jti, expire_le) VALUES ($1, $2) ON CONFLICT (jti) DO UPDATE SET expire_le = EXCLUDED.expire_le', [jti, Number.isFinite(fin) ? fin : Date.now()]);
    },
    async isRevoked(jti) {
      if (!jti) return false;
      await preparer();
      return (await pool.query('SELECT 1 FROM jetons_fermes WHERE jti = $1 AND expire_le >= $2', [jti, Date.now()])).rows.length > 0;
    },
    async revokeAllForUser(userId, revokedBeforeMs) {
      if (!userId) return;
      await preparer();
      const avant = Number(revokedBeforeMs);
      await pool.query('INSERT INTO comptes_fermes (utilisateur, avant) VALUES ($1, $2) ON CONFLICT (utilisateur) DO UPDATE SET avant = GREATEST(comptes_fermes.avant, EXCLUDED.avant)', [userId, Number.isFinite(avant) ? avant : Date.now()]);
    },
    async isRevokedForUser(userId, issuedAtSeconds) {
      if (!userId) return false;
      const emis = Number(issuedAtSeconds) * 1000;
      if (!Number.isFinite(emis)) return false;
      await preparer();
      const { rows } = await pool.query('SELECT avant FROM comptes_fermes WHERE utilisateur = $1', [userId]);
      return rows.length > 0 && emis <= Number(rows[0]!.avant);
    },
  };
}

/** Requêtes paramétrées ; un redémarrage du serveur ne déconnecte personne. */
export function creerMagasinPostgres(pool: PoolPostgres): MagasinRenouvellements {
  let prete: Promise<unknown> | undefined;
  const preparer = () =>
    (prete ??= pool
      .query(
        'CREATE TABLE IF NOT EXISTS sessions_renouvellement (id TEXT PRIMARY KEY, famille TEXT NOT NULL, utilisateur TEXT NOT NULL, empreinte TEXT NOT NULL UNIQUE, cree_le BIGINT NOT NULL, debut BIGINT NOT NULL, expire_le BIGINT NOT NULL, consomme_le BIGINT, revoque_le BIGINT);' +
          ' CREATE INDEX IF NOT EXISTS sessions_renouvellement_famille ON sessions_renouvellement (famille);' +
          ' CREATE INDEX IF NOT EXISTS sessions_renouvellement_utilisateur ON sessions_renouvellement (utilisateur);',
      )
      .catch((erreur: unknown) => {
        // La base revient : on réessaiera au prochain appel.
        prete = undefined;
        throw erreur;
      }));
  const nombre = (valeur: unknown) => (valeur === null || valeur === undefined ? null : Number(valeur));
  const lire = (l: Record<string, unknown>): LigneRenouvellement => ({
    id: String(l.id),
    familyId: String(l.famille),
    userId: String(l.utilisateur),
    hash: String(l.empreinte),
    createdAt: Number(l.cree_le),
    familyStartedAt: Number(l.debut),
    expiresAt: Number(l.expire_le),
    consumedAt: nombre(l.consomme_le),
    revokedAt: nombre(l.revoque_le),
  });
  return {
    async save(ligne) {
      await preparer();
      const l = ligne as LigneRenouvellement;
      await pool.query(
        'INSERT INTO sessions_renouvellement (id, famille, utilisateur, empreinte, cree_le, debut, expire_le, consomme_le, revoque_le) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [l.id, l.familyId, l.userId, l.hash, l.createdAt, l.familyStartedAt ?? l.createdAt, l.expiresAt, l.consumedAt, l.revokedAt],
      );
    },
    async findByHash(hash) {
      await preparer();
      const { rows } = await pool.query('SELECT * FROM sessions_renouvellement WHERE empreinte = $1', [hash]);
      return rows[0] ? lire(rows[0]) : null;
    },
    async markConsumed(id, at) {
      await preparer();
      await pool.query('UPDATE sessions_renouvellement SET consomme_le = $2 WHERE id = $1', [id, at]);
    },
    async revokeFamily(familyId, at) {
      await preparer();
      await pool.query('UPDATE sessions_renouvellement SET revoque_le = COALESCE(revoque_le, $2) WHERE famille = $1', [familyId, at]);
    },
    async revokeAllForUser(userId, at) {
      await preparer();
      await pool.query('UPDATE sessions_renouvellement SET revoque_le = COALESCE(revoque_le, $2) WHERE utilisateur = $1', [userId, at]);
    },
    async deleteExpired(before) {
      await preparer();
      const resultat = await pool.query('DELETE FROM sessions_renouvellement WHERE expire_le <= $1', [before]);
      return resultat.rowCount ?? 0;
    },
    async debutDeFamille(familyId) {
      await preparer();
      const { rows } = await pool.query('SELECT MIN(debut) AS debut FROM sessions_renouvellement WHERE famille = $1', [familyId]);
      return nombre(rows[0]?.debut);
    },
  };
}

/**
 * La borne que seul le serveur vérifie : un jeton renouvelé n'expire jamais après connexion + maximum,
 * même si la personne revient chaque jour.
 *
 * Deux onglets qui renouvellent au même instant présentent le même jeton : le service y verrait
 * un vol et fermerait la session. Pendant \`graceMs\`, un jeton déjà utilisé reste donc accepté ;
 * passé ce délai, le rejeu révoque toute la famille.
 */
export function plafonner(
  magasin: MagasinRenouvellements,
  { maximumMs, horloge = Date.now, graceMs = 10_000 }: { maximumMs: number; horloge?: () => number; graceMs?: number },
): RefreshTokenStore {
  const dejaConsommes = new Set<string>();
  return {
    ...magasin,
    async save(ligne) {
      const debut = (await magasin.debutDeFamille(ligne.familyId)) ?? ligne.createdAt;
      const bornee: LigneRenouvellement = { ...ligne, familyStartedAt: debut, expiresAt: Math.min(ligne.expiresAt, debut + maximumMs) };
      return magasin.save(bornee);
    },
    async findByHash(hash) {
      const ligne = await magasin.findByHash(hash);
      if (ligne?.consumedAt && !ligne.revokedAt && horloge() - ligne.consumedAt <= graceMs) {
        dejaConsommes.add(ligne.id);
        return { ...ligne, consumedAt: null };
      }
      return ligne;
    },
    async markConsumed(id, at) {
      // Le délai de grâce compte depuis le premier usage : il ne s'allonge pas à chaque rejeu.
      if (!dejaConsommes.delete(id)) await magasin.markConsumed(id, at);
    },
  };
}
`;

/**
 * La session glissante : un jeton d'accès court (cookie HttpOnly du pack) et un jeton de
 * renouvellement dans un autre cookie HttpOnly, limité à /auth. Le navigateur ne le voit jamais ;
 * le téléphone, qui n'a pas de cookie sûr, le garde dans son coffre.
 */
const SESSIONS = `import { clearSessionCookie, createRefreshTokenService, parseCookieHeader, setSessionCookie, type RefreshTokenService } from '@astratra/security';
import type { RequestHandler } from 'express';
import { creerMagasinMemoire, plafonner, type MagasinRenouvellements } from './renouvellements.js';

/** Produit par Humalis. Le jeton d'accès est court : c'est lui qui limite les dégâts d'un vol. */
const DUREE_JETON = '15m';
const COOKIE = { name: 'humalis_renouvellement', path: '/auth' };
const UNITES: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export interface ReglagesSession {
  /** La durée du jeton d'accès (« 15m »). */
  jeton: string;
  /** Sans venir pendant ce temps, il faut se reconnecter. */
  dureeMs: number;
  /** Depuis la connexion, jamais plus que ce temps. */
  maximumMs: number;
  magasin: MagasinRenouvellements;
  horloge?: () => number;
}

/** « 3d », « 12h », « 45m » : refuse le reste, avec une phrase qui dit quoi écrire. */
export function lireDuree(valeur: string | undefined, defaut: string, nom: string): number {
  const texte = valeur?.trim() || defaut;
  const morceaux = /^(\\d+)([smhd])$/.exec(texte);
  if (!morceaux || Number(morceaux[1]) === 0) throw new Error(nom + ' doit être une durée comme 3d, 12h ou 45m.');
  return Number(morceaux[1]) * UNITES[morceaux[2]];
}

export function reglagesDeSession(env: Record<string, string | undefined>, magasin: MagasinRenouvellements = creerMagasinMemoire()): ReglagesSession {
  return {
    jeton: DUREE_JETON,
    dureeMs: lireDuree(env.HUMALIS_SESSION, '3d', 'HUMALIS_SESSION'),
    maximumMs: lireDuree(env.HUMALIS_SESSION_MAX, '30d', 'HUMALIS_SESSION_MAX'),
    magasin,
  };
}

export function creerRenouvellement({ magasin, dureeMs, maximumMs, horloge }: ReglagesSession): RefreshTokenService {
  const service = createRefreshTokenService({
    store: plafonner(magasin, { maximumMs, horloge }),
    ttlMs: dureeMs,
    ...(horloge ? { now: horloge } : {}),
  });
  // Le ménage : les jetons expirés quittent la table. Cette minuterie ne retient jamais le serveur.
  setInterval(() => void service.prune().catch(() => {}), 6 * 3_600_000).unref();
  return service;
}

const CHEMINS = new Set(['/auth/login', '/auth/refresh', '/auth/logout', '/auth/suppression-compte', '/auth/google', '/auth/apple', '/auth/mot-de-passe', '/auth/double/verifier', '/auth/cle-acces/connexion/verifier']);

/**
 * Autour des routes de session du pack : le jeton de renouvellement part dans le cookie HttpOnly et
 * disparaît de la réponse. Seul un téléphone (x-humalis-mobile) le reçoit en JSON à la connexion ;
 * un jeton venu d'un cookie ne ressort jamais en JSON, quel que soit l'en-tête : une page piégée ne peut pas le lire.
 */
export function renouvellementEnCookie(dureeMs: number): RequestHandler {
  const reglages = { ...COOKIE, maxAgeMs: dureeMs };
  return (req, res, next) => {
    if (req.method !== 'POST' || !CHEMINS.has(req.path)) {
      next();
      return;
    }
    const recu = parseCookieHeader(req.headers.cookie)[COOKIE.name];
    // Lus tout de suite : plus loin, les routeurs du pack raccourcissent req.path.
    const renouveler = req.path === '/auth/refresh';
    // Déconnecté, ou compte supprimé : la session s'en va de la même façon.
    const sortie = req.path === '/auth/logout' || req.path === '/auth/suppression-compte';
    if (renouveler && recu) {
      req.body = { refreshToken: recu };
      (req as unknown as { _body: boolean })._body = true;
    }
    const parCookie = renouveler ? Boolean(recu) : req.headers['x-humalis-mobile'] !== '1';
    const repondre = res.json.bind(res);
    res.json = ((corps: unknown) => repondre(parCookie ? sansJeton(corps, (jeton) => setSessionCookie(res, jeton, reglages)) : corps)) as typeof res.json;
    // Déconnecté, ou renouvellement refusé : le cookie s'en va, juste avant que les en-têtes partent.
    const finir = res.end.bind(res) as (...valeurs: unknown[]) => typeof res;
    res.end = ((...valeurs: unknown[]) => {
      const fermee = sortie ? res.statusCode < 300 : renouveler && res.statusCode === 401;
      if (fermee && !res.headersSent) clearSessionCookie(res, reglages);
      return finir(...valeurs);
    }) as typeof res.end;
    next();
  };
}

/** La réponse sans son jeton de renouvellement (à la racine, ou dans « data » pour les routes du pack). */
function sansJeton(corps: unknown, poser: (jeton: string) => void): unknown {
  if (typeof corps !== 'object' || corps === null) return corps;
  const { refreshToken, ...reste } = corps as Record<string, unknown>;
  if (typeof refreshToken === 'string') {
    poser(refreshToken);
    return reste;
  }
  return 'data' in reste ? { ...reste, data: sansJeton(reste.data, poser) } : corps;
}
`;

/** Les clés que l'admin peut gérer : celles que ce serveur lit vraiment. Une ligne de plus suffira pour l'e-mail. */
function coffreTs(serveur: ServeurRI): string {
  const clesGoogle = serveur.connexionGoogle
    ? `      {
        key: 'GOOGLE_CLIENT_ID',
        label: 'Connexion avec Google',
        help: "L'ID client OAuth de l'application Web. Sans lui, la connexion avec Google reste fermée.",
        where: 'Google Cloud Console, API et services, Identifiants',
      },
      {
        key: 'GOOGLE_CLIENT_ID_APPLE',
        label: 'Connexion avec Google (application Apple)',
        help: "L'ID client de type iOS. Sans lui, l'application iPhone, iPad et Mac ne peut pas se connecter avec Google.",
        where: 'Google Cloud Console, API et services, Identifiants',
      },
`
    : '';
  const clesApple = serveur.connexionApple
    ? `      {
        key: 'APPLE_APP_ID',
        label: 'Connexion avec Apple (application)',
        help: "L'identifiant de l'application iPhone, iPad et Mac. Sans lui, l'application ne peut pas se connecter avec Apple.",
        where: 'Apple Developer, Certificates, Identifiers & Profiles, Identifiers',
      },
      {
        key: 'APPLE_SERVICE_ID',
        label: 'Connexion avec Apple (site)',
        help: "L'identifiant de services du site. Sans lui, le site ne peut pas se connecter avec Apple.",
        where: 'Apple Developer, Certificates, Identifiers & Profiles, Identifiers, Services IDs',
      },
`
    : '';
  const cles = clesGoogle + clesApple + (serveur.emails ? CLES_EMAILS : '');
  return `import type { RequestHandler, Router } from 'express';
import type { PoolPostgres } from './stockage.js';

/**
 * Produit par Humalis : le coffre des clés de service (@astratra/credentials). Les valeurs sont
 * chiffrées avant d'arriver ici : ce magasin ne voit jamais un secret en clair, et process.env
 * reste à jour sans redémarrer. Sans valeur dans le coffre, le .env sert, comme avant.
 */
export interface LigneCle {
  key: string;
  value: string;
  secret: boolean;
  updatedAt?: Date | string | number | null;
  updatedBy?: string | null;
}

/** Une ligne par clé, avec des requêtes paramétrées, comme creerStockagePostgres. */
export function creerMagasinCles(pool: PoolPostgres) {
  let prete: Promise<unknown> | undefined;
  const preparer = () =>
    (prete ??= pool
      .query('CREATE TABLE IF NOT EXISTS coffre_cles (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, secret BOOLEAN NOT NULL, modifie_le TIMESTAMPTZ NOT NULL DEFAULT now(), modifie_par TEXT)')
      .catch((erreur: unknown) => {
        prete = undefined;
        throw erreur;
      }));
  return {
    async findAll(): Promise<LigneCle[]> {
      await preparer();
      const { rows } = await pool.query('SELECT cle, valeur, secret, modifie_le, modifie_par FROM coffre_cles');
      return rows.map((l) => ({ key: String(l.cle), value: String(l.valeur), secret: l.secret === true, updatedAt: l.modifie_le as Date, updatedBy: l.modifie_par === null ? null : String(l.modifie_par) }));
    },
    async upsert(ligne: LigneCle): Promise<void> {
      await preparer();
      await pool.query(
        'INSERT INTO coffre_cles (cle, valeur, secret, modifie_par) VALUES ($1, $2, $3, $4) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, secret = EXCLUDED.secret, modifie_le = now(), modifie_par = EXCLUDED.modifie_par',
        [ligne.key, ligne.value, ligne.secret, ligne.updatedBy ?? null],
      );
    },
  };
}

const ESPACES: { id: string; label: string; keys: { key: string; label: string; help: string; where: string }[] }[] = [
  {
    id: 'services',
    label: 'Services',
    keys: [
${cles}    ],
  },
];

export interface Coffre {
  routes(garde: RequestHandler): Router;
}

/** Sans ENCRYPTION_KEY : le coffre reste fermé, rien n'est chargé, et le .env sert seul. */
export async function ouvrirCoffre(pool: PoolPostgres | null, env: NodeJS.ProcessEnv = process.env, magasin?: ReturnType<typeof creerMagasinCles>): Promise<Coffre | null> {
  const noms = ESPACES.flatMap((espace) => espace.keys.map((cle) => cle.key));
  if (noms.length === 0) return null;
  const cle = env.ENCRYPTION_KEY?.trim();
  if (!cle) {
    console.log('Coffre des clés fermé : ENCRYPTION_KEY n\\'est pas réglée (voir .env.exemple). Le .env sert seul.');
    return null;
  }
  const { createFieldCipher } = await import('@astratra/security');
  const { createCredentialCatalog, createCredentialsRoutes, createCredentialVault, createEnvHydrator, createMemoryCredentialStore } = await import('@astratra/credentials');
  let cipher: ReturnType<typeof createFieldCipher>;
  try {
    cipher = createFieldCipher({ key: cle });
  } catch {
    console.error('Coffre des clés fermé : ENCRYPTION_KEY doit faire 32 octets, en base64 ou en hexadécimal (openssl rand -base64 32).');
    return null;
  }
  const catalog = createCredentialCatalog({
    spaces: ESPACES,
    // La serrure ne se range pas dans le coffre qu'elle ferme.
    reservedKeys: ['ENCRYPTION_KEY', 'JWT_SECRET', 'DATABASE_URL', 'HUMALIS_ADMIN_MOT_DE_PASSE'],
  });
  const store = magasin ?? (pool ? creerMagasinCles(pool) : createMemoryCredentialStore());
  const vault = createCredentialVault({
    store: store as Parameters<typeof createCredentialVault>[0]['store'],
    catalog,
    cipher,
    env,
    // Une clé enregistrée sert tout de suite, pas à la minute suivante.
    onChange: async () => {
      await hydrator.hydrate(noms);
    },
  });
  const hydrator = createEnvHydrator({ vault, env });
  await hydrator.hydrate(noms);
  hydrator.startRefresh(noms, { intervalMs: 60_000 });
  console.log('Coffre des clés ouvert (/auth/cles, réservé à l\\'admin).');
  return { routes: (garde) => createCredentialsRoutes({ vault, authorize: garde as never }) as unknown as Router };
}
`;
}

const VERIFIER = `/**
 * Produit par Humalis : la vérification de la forme des données reçues.
 * Ce n'est pas de la sécurité (elle vient des packs Astratra) : c'est
 * la description des champs, que seul le programme connaît.
 */
import type { Filtres } from './stockage.js';

export type TypeChamp = 'texte' | 'nombre' | 'booleen' | 'date' | 'image' | { liste: TypeChamp };
export type Schema = Record<string, TypeChamp>;

const NOMS: Record<string, string> = {
  texte: 'un texte',
  nombre: 'un nombre',
  booleen: 'vrai ou faux (true ou false)',
  date: 'une date (par exemple 2026-01-31)',
  image: 'une image PNG, JPEG ou WebP de moins de 70 Ko (choisie dans la page), une adresse https://…, ou vide',
};

/** Une image reçue : réduite par la page, gardée telle quelle (data:…;base64), ou l'adresse d'une image en ligne. */
const IMAGE = /^data:image\\/(png|jpeg|webp);base64,[A-Za-z0-9+\\/]+=*$/;
const TAILLE_IMAGE = 95_000;

function conforme(type: TypeChamp, valeur: unknown): boolean {
  if (typeof type === 'object') return Array.isArray(valeur) && valeur.every((v) => conforme(type.liste, v));
  if (type === 'texte') return typeof valeur === 'string';
  if (type === 'image') {
    // Pas de photo choisie : la page envoie null, gardé comme un champ vide.
    if (valeur === null) return true;
    if (typeof valeur !== 'string') return false;
    return valeur === '' || /^https:\\/\\/[^\\s"<>]+$/.test(valeur) || (valeur.length <= TAILLE_IMAGE && IMAGE.test(valeur));
  }
  if (type === 'nombre') return typeof valeur === 'number' && Number.isFinite(valeur);
  if (type === 'booleen') return typeof valeur === 'boolean';
  return typeof valeur === 'string' && !Number.isNaN(Date.parse(valeur));
}

const decrire = (type: TypeChamp): string =>
  typeof type === 'object' ? \`une liste dont chaque élément est \${decrire(type.liste)}\` : NOMS[type];

/** « du site » : un chemin de ce site, son adresse (HUMALIS_ADRESSE_SITE), une image choisie dans la page, ou rien. */
export function estDuSite(valeur: unknown, adresseDuSite = process.env.HUMALIS_ADRESSE_SITE): boolean {
  if (Array.isArray(valeur)) return valeur.every((v) => estDuSite(v, adresseDuSite));
  if (valeur === null || valeur === '') return true;
  if (typeof valeur !== 'string' || /[\\s"<>\\\\]/.test(valeur)) return false;
  if (/^\\/(?!\\/)/.test(valeur)) return true;
  if (valeur.length <= TAILLE_IMAGE && IMAGE.test(valeur)) return true;
  const site = (adresseDuSite ?? '').trim().replace(/\\/+$/, '');
  return site !== '' && valeur.startsWith(site + '/');
}

/** « calcule somme prix de produit par refs » : le prix relu pour chaque identifiant ; un texte dit ce qui ne va pas. */
export async function sommeDesPrix(stockage: { trouver(id: string): Promise<Record<string, unknown> | null> }, liste: unknown, champ: string, voit?: (fiche: Record<string, unknown>) => boolean): Promise<number | string> {
  const ids = Array.isArray(liste) ? liste.map(String) : [];
  const differents = new Set(ids);
  if (differents.size > 200) return 'la liste est trop longue';
  const prix = new Map<string, number>();
  for (const id of differents) {
    const fiche = await stockage.trouver(id);
    // Une fiche que cette personne ne pourrait pas lire (autre boutique, « seul son auteur », « si … ») n'existe pas pour elle.
    if (!fiche || (voit && !voit(fiche))) return \`« \${id} » n'existe pas\`;
    prix.set(id, Number(fiche[champ]) || 0);
  }
  return ids.reduce((total, id) => total + prix.get(id)!, 0);
}

/** « au plus prix de zone par commune » : le prix de la fiche dont le champ est égal ; 0 si aucune, ce qui laisse passer 0. */
export async function plafondDe(stockage: { lister(filtres: Filtres): Promise<Record<string, unknown>[]> }, par: string, valeur: unknown, champ: string, voit?: (fiche: Record<string, unknown>) => boolean): Promise<number> {
  if (typeof valeur !== 'string' && typeof valeur !== 'number') return 0;
  const fiche = (await stockage.lister({ egal: { [par]: valeur } })).find((f) => !voit || voit(f));
  return fiche ? Number(fiche[champ]) || 0 : 0;
}

${BORNES_TS}
${DEFAUTS_TS}
/** Un texte qui n'est pas de l'Unicode bien formé (un demi-caractère, seul), où qu'il soit dans ce qui est envoyé. */
export function texteMalForme(valeur: unknown, profondeur = 0): boolean {
  if (typeof valeur === 'string') return /\\p{Surrogate}/u.test(valeur);
  if (profondeur > 32 || valeur === null || typeof valeur !== 'object') return false;
  for (const [cle, element] of Object.entries(valeur)) if (texteMalForme(cle, profondeur + 1) || texteMalForme(element, profondeur + 1)) return true;
  return false;
}

/**
 * \`complet\` : à la création, chaque champ est obligatoire ; à la
 * modification, seuls les champs envoyés sont vérifiés.
 */
export function verifierEnvoi(
  schema: Schema,
  corps: unknown,
  complet: boolean,
  regles: { duServeur?: string[]; duSite?: string[]; nonVides?: string[]; fixes?: string[]; bornes?: Record<string, Bornes> } = {},
): { valeur: Record<string, unknown> } | { erreur: string } {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    return { erreur: 'les données envoyées doivent être un objet JSON' };
  }
  const champs = Object.keys(schema);
  for (const cle of Object.keys(corps)) {
    if (cle === 'id') return { erreur: "l'identifiant est donné par le serveur : ne l'envoie pas" };
    if ((complet && regles.duServeur?.includes(cle)) || regles.fixes?.includes(cle)) return { erreur: \`le champ « \${cle} » est donné par le serveur : ne l'envoie pas\` };
    if (!Object.hasOwn(schema, cle)) return { erreur: \`le champ « \${cle} » n'existe pas. Champs : \${champs.join(', ')}\` };
  }
  const valeur: Record<string, unknown> = {};
  for (const champ of champs) {
    const recu = (corps as Record<string, unknown>)[champ];
    if (recu === undefined) {
      if (complet && !regles.duServeur?.includes(champ)) return { erreur: \`le champ « \${champ} » manque\` };
      continue;
    }
    // Une image « du site » peut aussi être un chemin de ce site (/images/photo.jpg), en plus de ce qu'accepte une image.
    const chemin = schema[champ] === 'image' && regles.duSite?.includes(champ) && estDuSite(recu);
    if (!chemin && !conforme(schema[champ], recu)) return { erreur: \`le champ « \${champ} » doit être \${decrire(schema[champ])}\` };
    if (regles.nonVides?.includes(champ) && (Array.isArray(recu) ? recu.length === 0 : typeof recu === 'string' && recu.trim() === '')) {
      return { erreur: \`le champ « \${champ} » ne doit pas être vide\` };
    }
    if (regles.duSite?.includes(champ) && !estDuSite(recu)) return { erreur: \`le champ « \${champ} » doit être une adresse de ce site (/images/photo.jpg)\` };
    // Les limites du champ (« entre 0 et 100 », « de 2 a 80 caracteres »…), et celles par défaut. Un chemin du site n'en a pas d'autre.
    const faute = horsBornes(recu, regles.bornes?.[champ]);
    if (faute && !chemin) return { erreur: \`le champ « \${champ} » \${faute}\` };
    valeur[champ] = recu;
  }
  return { valeur };
}

/** Le texte d'un paramètre d'adresse, s'il n'y en a qu'un. */
const seul = (valeur: unknown): string | undefined => (typeof valeur === 'string' ? valeur : undefined);

/** Un entier positif (ou nul) écrit dans l'adresse ; sinon rien. */
function entier(valeur: unknown): number | undefined {
  const texte = seul(valeur);
  return texte !== undefined && /^\\d{1,9}$/.test(texte) ? Number(texte) : undefined;
}

/**
 * Les filtres d'une lecture de liste : « GET /api/photos?produit=abc » ne
 * renvoie que les photos de ce produit. Seuls les champs de la donnée (texte,
 * nombre, vrai ou faux, date) comptent, comparés par égalité ; une autre clé
 * est ignorée. Une valeur qui ne peut pas être celle du champ (« ?prix=abc »)
 * ne trouve rien : la réponse est \`null\`. « limite » et « depuis » découpent
 * la liste (« ?limite=20&depuis=40 »), sauf si la donnée a un champ de ce nom.
 */
/**
 * Le plus grand nombre de fiches qu'une lecture de liste renvoie : 1 000, ou HUMALIS_LISTE_MAX. Sans plafond,
 * une seule requête sur une grande table remplit la mémoire du serveur. Pour lire la suite : « ?depuis=1000 ».
 */
export function plafondDesListes(env: Record<string, string | undefined> = process.env): number {
  const regle = Number(env.HUMALIS_LISTE_MAX);
  return Number.isInteger(regle) && regle > 0 ? regle : 1000;
}

export function lireFiltres(schema: Schema, requete: Record<string, unknown>): Filtres | null {
  const filtres: Filtres = { egal: {} };
  for (const [cle, brut] of Object.entries(requete)) {
    const type = Object.hasOwn(schema, cle) ? schema[cle] : undefined;
    if (type === undefined) {
      if (cle === 'limite') filtres.limite = entier(brut);
      if (cle === 'depuis') filtres.depuis = entier(brut);
      continue;
    }
    // Une image ou une liste ne se compare pas dans une adresse.
    if (typeof type === 'object' || type === 'image') continue;
    const texte = seul(brut);
    if (texte === undefined) return null;
    if (type === 'nombre') {
      const nombre = texte.trim() === '' ? Number.NaN : Number(texte);
      if (!Number.isFinite(nombre)) return null;
      filtres.egal[cle] = nombre;
    } else if (type === 'booleen') {
      if (!['true', 'false', 'vrai', 'faux'].includes(texte)) return null;
      filtres.egal[cle] = texte === 'true' || texte === 'vrai';
    } else {
      filtres.egal[cle] = texte;
    }
  }
  const plafond = plafondDesListes();
  if (filtres.limite === undefined || filtres.limite > plafond) filtres.limite = plafond;
  return filtres;
}
`;

const COMPRESSER = `import type { RequestHandler } from 'express';
import { brotliCompress, constants, gzip } from 'node:zlib';

/**
 * Produit par Humalis : les réponses compressées (brotli, sinon gzip), avec
 * le zlib de Node, sans dépendance. Une réponse envoyée d'un coup (res.json)
 * de plus de 1 Ko, d'un type texte, l'est ; un flux (res.write, événements
 * du serveur) part tel quel, sans attendre. La compression se fait hors du
 * fil principal : le serveur continue de répondre aux autres pendant ce temps.
 */
const MINIMUM = 1024;
const COMPRESSIBLE = /^(text\\/|application\\/([\\w.+-]*\\+)?(json|javascript|xml)\\b|image\\/svg\\+xml)/i;

/** « br;q=0 » refuse brotli : seul un codage accepté avec un poids positif compte. */
function accepte(entete: string, codage: string): boolean {
  return entete.split(',').some((partie) => {
    const [nom, ...reglages] = partie.trim().toLowerCase().split(';');
    const poids = reglages.map((r) => r.trim()).find((r) => r.startsWith('q='));
    return (nom === codage || nom === '*') && (poids === undefined || Number(poids.slice(2)) > 0);
  });
}

type Fin = (corps?: unknown, codage?: unknown, rappel?: unknown) => unknown;

export const compresser: RequestHandler = (req, res, next) => {
  const entete = String(req.headers['accept-encoding'] ?? '');
  const codage = accepte(entete, 'br') ? 'br' : accepte(entete, 'gzip') ? 'gzip' : undefined;
  // La réponse dépend de ce que le navigateur accepte : un relais garde les deux versions.
  res.vary('Accept-Encoding');
  if (codage === undefined || req.method === 'HEAD') {
    next();
    return;
  }
  const ecrire = res.write.bind(res) as (...valeurs: unknown[]) => boolean;
  const finir = res.end.bind(res) as Fin;
  let enFlux = false;
  res.write = ((...valeurs: unknown[]) => {
    enFlux = true;
    return ecrire(...valeurs);
  }) as typeof res.write;
  res.end = ((corps?: unknown, codageDuCorps?: unknown, rappel?: unknown) => {
    const type = String(res.getHeader('Content-Type') ?? '');
    const garde =
      enFlux ||
      res.headersSent ||
      (typeof corps !== 'string' && !Buffer.isBuffer(corps)) ||
      res.statusCode === 204 ||
      res.statusCode === 304 ||
      res.getHeader('Content-Encoding') !== undefined ||
      /no-transform/.test(String(res.getHeader('Cache-Control') ?? '')) ||
      !COMPRESSIBLE.test(type);
    if (garde) return finir(corps, codageDuCorps, rappel);
    const brut = Buffer.isBuffer(corps) ? corps : Buffer.from(corps as string, typeof codageDuCorps === 'string' ? (codageDuCorps as BufferEncoding) : 'utf8');
    if (brut.length < MINIMUM) return finir(corps, codageDuCorps, rappel);
    const fin = typeof codageDuCorps === 'function' ? codageDuCorps : rappel;
    const envoyer = (erreur: Error | null, compresse: Buffer) => {
      // Une compression ratée : la réponse part telle quelle, jamais perdue.
      if (erreur) {
        finir(brut, fin);
        return;
      }
      res.setHeader('Content-Encoding', codage);
      res.setHeader('Content-Length', compresse.length);
      finir(compresse, fin);
    };
    if (codage === 'br') {
      // Qualité 5 : presque aussi petit que le maximum, beaucoup plus rapide (le maximum, 11, est fait pour les fichiers figés).
      brotliCompress(brut, { params: { [constants.BROTLI_PARAM_QUALITY]: 5, [constants.BROTLI_PARAM_SIZE_HINT]: brut.length } }, envoyer);
    } else {
      gzip(brut, { level: 6 }, envoyer);
    }
    return res;
  }) as typeof res.end;
  next();
};
`;

const STOCKAGE = `import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

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

/** « ?produit=abc&limite=20&depuis=40 » : les champs égaux à ces valeurs, puis une tranche de la liste. */
export interface Filtres {
  egal: Record<string, string | number | boolean>;
  limite?: number;
  depuis?: number;
  /** Ce champ, sans espaces, tirets ni « + », vaut cette valeur : « +243 848 » et « 243848 » désignent le même numéro. */
  numero?: { champ: string; valeur: string };
  /** Dans une transaction, les fiches lues restent à celui qui les lit jusqu'à la fin (« pour chaque … changer »). */
  retenir?: boolean;
}

/** Un numéro sans ses séparateurs, pour comparer deux écritures du même numéro. */
export const sansSeparateurs = (valeur: unknown): string => (typeof valeur === 'string' ? valeur.replace(/[\\s+-]/g, '') : '');

/** La tranche demandée d'une liste déjà filtrée. */
function trancher<T>(liste: T[], filtres?: Filtres): T[] {
  const debut = filtres?.depuis ?? 0;
  return filtres?.limite === undefined ? liste.slice(debut) : liste.slice(debut, debut + filtres.limite);
}

/**
 * En mémoire, une transaction note de quoi défaire chacune de SES écritures (et seulement les siennes) : annulée,
 * elle les défait une à une, sans toucher à ce qu'une autre requête a écrit pendant ce temps (revue Codex).
 */
export const journalMemoire = new AsyncLocalStorage<(() => void)[]>();

/** La synchronisation : la fiche créée garde l'identifiant choisi par l'appareil, le temps d'un seul « creer ». */
export const idImpose = new AsyncLocalStorage<{ id: string; pris: boolean }>();
export const nouvelId = () => {
  const impose = idImpose.getStore();
  if (!impose || impose.pris) return randomUUID();
  impose.pris = true;
  return impose.id;
};

export interface Stockage {
  lister(filtres?: Filtres): Promise<Enregistrement[]>;
  /** « pourEcrire » : dans une transaction, la fiche reste à celui qui la lit jusqu'à la fin. */
  trouver(id: string, pourEcrire?: boolean): Promise<Enregistrement | null>;
  /** En mémoire seulement : une photo des données, et de quoi y revenir. */
  instantane?(): () => void;
  creer(valeurs: Record<string, unknown>): Promise<Enregistrement>;
  modifier(id: string, valeurs: Record<string, unknown>): Promise<Enregistrement | null>;
  supprimer(id: string): Promise<boolean>;
}

/** Les données sont perdues à l'arrêt du serveur : développement et tests seulement. */
export function creerStockageMemoire(): Stockage {
  const lignes = new Map<string, Enregistrement>();
  return {
    async lister(filtres) {
      const egal = Object.entries(filtres?.egal ?? {});
      const numero = filtres?.numero;
      return trancher(
        [...lignes.values()].filter((ligne) => egal.every(([champ, valeur]) => ligne[champ] === valeur) && (!numero || sansSeparateurs(ligne[numero.champ]) === numero.valeur)),
        filtres,
      ).map((ligne) => ({ ...ligne }));
    },
    // Une copie, jamais la fiche gardée : « changer » sur la fiche lue ne touchait sinon à ce qu'une transaction
    // annulée remet en place (revue Codex).
    async trouver(id) {
      const ligne = lignes.get(id);
      return ligne ? { ...ligne } : null;
    },
    instantane() {
      const photo = new Map([...lignes].map(([id, ligne]) => [id, { ...ligne }]));
      return () => {
        lignes.clear();
        for (const [id, ligne] of photo) lignes.set(id, ligne);
      };
    },
    async creer(valeurs) {
      const enregistrement = { ...valeurs, id: nouvelId() };
      lignes.set(enregistrement.id, enregistrement);
      journalMemoire.getStore()?.push(() => lignes.delete(enregistrement.id));
      return { ...enregistrement };
    },
    async modifier(id, valeurs) {
      const actuel = lignes.get(id);
      if (!actuel) return null;
      const nouveau = { ...actuel, ...valeurs, id };
      lignes.set(id, nouveau);
      journalMemoire.getStore()?.push(() => lignes.set(id, actuel));
      return { ...nouveau };
    },
    async supprimer(id) {
      const actuel = lignes.get(id);
      const fait = lignes.delete(id);
      if (fait && actuel) journalMemoire.getStore()?.push(() => lignes.set(id, actuel));
      return fait;
    },
  };
}

/** Les séparateurs d'un numéro, pour PostgreSQL : les mêmes que sansSeparateurs. */
const SEPARATEURS = '[[:space:]\\\\u00a0\\\\u2000-\\\\u200a\\\\u202f\\\\u205f\\\\u3000+-]';

/** Ce que le stockage attend d'un Pool de \`pg\`. */
export interface PoolPostgres {
  query(texte: string, valeurs?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

/**
 * \`champs\` : les champs de la donnée d'aujourd'hui. Une fiche est rendue à cette forme : un champ retiré du
 * programme reste dans la base, il n'en sort plus. Sans liste (les données du temps réel), la fiche revient telle quelle.
 */
export function creerStockagePostgres(pool: PoolPostgres, table: string, champs?: readonly string[]): Stockage {
  // Le nom de la table est fixé par le compilateur ; on le vérifie quand même.
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(\`nom de table invalide : \${table}\`);
  let prete: Promise<unknown> | undefined;
  const preparer = () =>
    (prete ??= pool.query(
      \`CREATE TABLE IF NOT EXISTS \${table} (id TEXT PRIMARY KEY, data JSONB NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())\`,
    ));
  const lire = (ligne: Record<string, unknown>): Enregistrement => {
    const donnees = (ligne.data ?? {}) as Record<string, unknown>;
    if (!champs) return { ...donnees, id: String(ligne.id) };
    const fiche: Enregistrement = { id: String(ligne.id) };
    for (const champ of champs) if (champ !== 'id' && Object.hasOwn(donnees, champ)) fiche[champ] = donnees[champ];
    return fiche;
  };

  return {
    async lister(filtres) {
      await preparer();
      // « data @> {...} » : l'objet contient ces champs avec ces valeurs exactes (texte, nombre, vrai ou faux).
      const valeurs: unknown[] = [];
      const conditions: string[] = [];
      if (filtres && Object.keys(filtres.egal).length > 0) {
        valeurs.push(JSON.stringify(filtres.egal));
        conditions.push(\`data @> $\${valeurs.length}::jsonb\`);
      }
      if (filtres?.numero) {
        // La même comparaison que sansSeparateurs, faite par la base : seules les bonnes lignes reviennent.
        valeurs.push(filtres.numero.champ, SEPARATEURS, filtres.numero.valeur);
        conditions.push(\`regexp_replace(data->>$\${valeurs.length - 2}, $\${valeurs.length - 1}, '', 'g') = $\${valeurs.length}\`);
      }
      let texte = \`SELECT id, data FROM \${table}\`;
      if (conditions.length > 0) texte += \` WHERE \${conditions.join(' AND ')}\`;
      // L'identifiant départage deux fiches créées au même instant : d'un morceau à l'autre, l'ordre ne bouge pas.
      texte += ' ORDER BY cree_le, id';
      if (filtres?.limite !== undefined) {
        valeurs.push(filtres.limite);
        texte += \` LIMIT $\${valeurs.length}\`;
      }
      if (filtres?.depuis !== undefined) {
        valeurs.push(filtres.depuis);
        texte += \` OFFSET $\${valeurs.length}\`;
      }
      if (filtres?.retenir) texte += ' FOR UPDATE';
      return (await pool.query(texte, valeurs)).rows.map(lire);
    },
    async trouver(id, pourEcrire) {
      await preparer();
      const { rows } = await pool.query(\`SELECT id, data FROM \${table} WHERE id = $1\${pourEcrire ? ' FOR UPDATE' : ''}\`, [id]);
      return rows[0] ? lire(rows[0]) : null;
    },
    async creer(valeurs) {
      await preparer();
      const id = nouvelId();
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

/** Le rôle et les groupes viennent du compte relu : un changement compte tout de suite, sur chaque serveur. */
const COMPTE_RELU = `      const compteRelu: RequestHandler = async (req, res, next) => {
        try {
          const session = req as unknown as { user?: Record<string, unknown> };
          const compte = await usersStore.findById(String(session.user?.id));
          if (!compte) {
            res.status(401).json({ erreur: "ce compte n'existe plus" });
            return;
          }
          session.user = { ...compte, ...session.user, role: compte.role, id: String(compte.id) };
          next();
        } catch (erreur) {
          next(erreur);
        }
      };
`;

/** Dans creerServeur : les autres services du projet (appels, boîte d'envoi, messages reçus, jetons fermés). */
function codeCreationServices(serveur: ServeurRI): string {
  const projet = serveur.projet!;
  const gardien = projet.comptes === serveur.nom;
  const autres = projet.services.filter((n) => n !== serveur.nom);
  const droits = Object.fromEntries(serveur.routes.filter((r) => r.droitsServices?.length).map((r) => [adresseApi(r.adresse), r.droitsServices!]));
  return `  // Plusieurs services : appels signés, boîte d'envoi et messages reçus (voir src/humalis/services.ts).
  stockages.humalisBoite ??= creerStockageMemoire();
  stockages.humalisRecus ??= creerStockageMemoire();
  const receveurs: Record<string, (corps: Record<string, unknown>, id: string) => Promise<void>> = {
${codeReceveurs(serveur)}  };
  const services: Services | undefined = reglagesServices
    ? creerServices({
        ...reglagesServices,
        envois,
        boite: stockages.humalisBoite,
        recus: stockages.humalisRecus,
        transaction: transaction as unknown as Parameters<typeof creerServices>[0]['transaction'],
        receveurs,
        autres: ${JSON.stringify(autres)},${gardien ? '' : `
        // Le service des comptes annonce chaque jeton et chaque compte fermés : ils le sont aussi ici.
        messagesHumalis: {
          'humalis:jeton-ferme': async (corps) => {
            await revocationsLocales.revoke(String(corps.jti), Number(corps.expire));
          },
          'humalis:compte-ferme': async (corps) => {
            await revocationsLocales.revokeAllForUser?.(String(corps.utilisateur), Number(corps.avant));
          },
        },`}
      })
    : undefined;
${gardien ? `  // Un jeton ou un compte fermé ici l'est aussi dans les autres services, dès que l'annonce leur arrive.
  const revocations: RevocationStore = services
    ? {
        revoke: async (jti, fin) => {
          await revocationsLocales.revoke(jti, fin);
          await services.prevenirTous('humalis:jeton-ferme', { jti, expire: fin });
        },
        isRevoked: (jti) => revocationsLocales.isRevoked(jti),
        revokeAllForUser: async (utilisateur, avant) => {
          await revocationsLocales.revokeAllForUser?.(utilisateur, avant);
          await services.prevenirTous('humalis:compte-ferme', { utilisateur, avant });
        },
        isRevokedForUser: async (utilisateur, emis) => (await revocationsLocales.isRevokedForUser?.(utilisateur, emis)) ?? false,
      }
    : revocationsLocales;
` : '  const revocations = revocationsLocales;\n'}  /** Un refus de l'autre service (400, 403, 404) devient un refus ici, avec son message ; une panne reste une panne. */
  const refusDistant = (erreur: unknown): never => {
    throw erreur instanceof RefusDuService ? new Refus(erreur.message) : erreur;
  };
  void refusDistant;
  /** Les droits des autres services, route par route (« le serveur "x" peut … »). */
  const DROITS_DES_SERVICES: Record<string, { serveur: string; actions: string[]; faire?: string }[]> = ${JSON.stringify(droits)};
  void DROITS_DES_SERVICES;
`;
}

/** scripts/cles-comptes.mjs : « npm run cles » écrit la paire de clés des jetons du projet. */
const CLES_COMPTES = `// Produit par Humalis : la paire de clés des jetons d'accès du projet (ES256, courbe P-256).
// La clé privée reste dans ce service, qui garde les comptes ; la clé publique va dans les autres services.
import { generateKeyPairSync } from 'node:crypto';
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const ligne = (texte) => Buffer.from(texte).toString('base64');
console.log('# Dans le .env de ce service (ne la donne à personne) :');
console.log('HUMALIS_COMPTES_CLE_PRIVEE=' + ligne(privateKey));
console.log('');
console.log('# Dans le .env de chaque autre service du projet :');
console.log('HUMALIS_COMPTES_CLE_PUBLIQUE=' + ligne(publicKey));
`;

/** scripts/cle-service.mjs : « npm run cle-service » écrit la paire de clés avec laquelle ce service signe ses appels. */
const cleService = (nom: string): string => `// Produit par Humalis : la paire de clés de ce service (« ${nom.replace(/[`$\\]/g, '')} »), ES256, courbe P-256.
// La clé privée reste dans ce service : il signe ses appels et ses messages. La clé publique va dans chaque autre service.
import { generateKeyPairSync } from 'node:crypto';
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const ligne = (texte) => Buffer.from(texte).toString('base64');
console.log('# Dans le .env de ce service (ne la donne à personne) :');
console.log('HUMALIS_SERVICE_CLE_PRIVEE=' + ligne(privateKey));
console.log('');
console.log('# Dans le .env de chaque autre service du projet :');
console.log(${JSON.stringify(variableDuService(nom) + '_CLE=')} + ligne(publicKey));
`;

/** Dans demarrer.ts : la clé des jetons (privée ici si ce service garde les comptes, publique sinon) et le secret des services. */
function codeSecretsServices(serveur: ServeurRI): string {
  const projet = serveur.projet!;
  const gardien = projet.comptes === serveur.nom;
  return `/**
 * Une clé lue dans le .env : le texte PEM (les retours à la ligne écrits \\n), ou ce texte en base64 sur une ligne.
 * \`npm run cles\` dans le service des comptes écrit les deux lignes à recopier.
 */
function cleDuService(nom: string, genre: 'privee' | 'publique'): string {
  const brute = process.env[nom]?.trim();
  if (!brute) arreter(nom + ' manque (voir .env.exemple : ' + (genre === 'privee' ? 'npm run cles' : 'la clé publique donnée par npm run cles dans le service des comptes') + ').');
  const pem = brute.includes('-----BEGIN') ? brute.replace(/\\\\n/g, '\\n') : Buffer.from(brute, 'base64').toString('utf8');
  try {
    const cle = genre === 'privee' ? createPrivateKey(pem) : createPublicKey(pem);
    if (cle.asymmetricKeyType !== 'ec') throw new Error('une clé EC P-256 est attendue');
  } catch (erreur) {
    arreter(nom + " n'est pas une clé " + (genre === 'privee' ? 'privée' : 'publique') + ' lisible : ' + (erreur instanceof Error ? erreur.message : String(erreur)));
  }
  return pem;
}
${gardien ? `const jwtSecret = process.env.JWT_SECRET ?? '';
if (jwtSecret.length < 32) {
  arreter('JWT_SECRET doit contenir au moins 32 caractères au hasard (voir .env.exemple).');
}
// Ce service garde les comptes du projet : il signe les jetons d'accès avec sa clé privée (ES256).
const cleDesJetons = cleDuService('HUMALIS_COMPTES_CLE_PRIVEE', 'privee');` : `// Ce service prend ses comptes chez le serveur « ${projet.comptes.replace(/[\\'\`$]/g, '')} » : il vérifie ses jetons avec la clé publique, sans pouvoir en fabriquer.
const cleDesJetons = cleDuService('HUMALIS_COMPTES_CLE_PUBLIQUE', 'publique');
const jwtSecret = cleDesJetons;`}
// Chaque service signe ses appels et ses messages avec sa propre clé privée ; il vérifie ceux des autres avec leur clé
// publique. « npm run cle-service » écrit la paire d'un service.
const cleDuServiceIci = cleDuService('HUMALIS_SERVICE_CLE_PRIVEE', 'privee');
const clesDesServices: Record<string, string | undefined> = {};
for (const service of ${JSON.stringify(projet.services.filter((s) => s !== serveur.nom))}) {
  const nom = ${JSON.stringify('HUMALIS_SERVICE_')} + service.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_CLE';
  if (process.env[nom]?.trim()) clesDesServices[service] = cleDuService(nom, 'publique');
  else console.warn(nom + " n'est pas réglée : les appels et les messages du serveur « " + service + " » seront refusés (« npm run cle-service » dans ce service donne sa clé publique).");
}
for (const [service, adresse] of Object.entries(adressesDesServices())) {
  if (!adresse) console.warn("L'adresse du serveur « " + service + " » n'est pas réglée (" + ${JSON.stringify('HUMALIS_SERVICE_')} + service.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_') + ') : ses appels et ses messages attendront.');
}`;
}

/** Dans « avant » : une requête signée par un autre service, les messages reçus, et les comptes tenus ailleurs. */
function codeAvantServices(serveur: ServeurRI): string {
  const projet = serveur.projet!;
  const gardien = projet.comptes === serveur.nom;
  return `
  // Une requête signée par un autre service du projet est vérifiée avant tout (signature, rejeu), puis traitée comme les autres.
  if (services) {
    avant.use(services.verifier);
    avant.post('/humalis/messages', express.json({ limit: '1mb' }), services.recevoir);
  }${gardien ? '' : `
  // Les comptes sont tenus par le serveur « ${projet.comptes.replace(/[\\'\`$]/g, '')} » : ni connexion ni comptes ici (le coffre des clés et l'IA restent).
  avant.use('/auth', (req, res, next) => {
    if (req.path.startsWith('/cles') || req.path.startsWith('/ia')) next();
    else res.status(404).json({ erreur: ${JSON.stringify(`les comptes sont tenus par le serveur « ${projet.comptes} »`)} });
  });
  avant.use(['/users', '/settings'], (_req, res) => {
    res.status(404).json({ erreur: ${JSON.stringify(`les comptes sont tenus par le serveur « ${projet.comptes} »`)} });
  });`}`;
}

/**
 * Un service qui ne garde pas les comptes : le jeton, signé par le service des comptes, dit qui est la personne et son
 * rôle. Un changement de rôle compte à son prochain jeton (quinze minutes au plus) ; un jeton ou un compte fermé est
 * annoncé par le service des comptes, et refusé ici dès que l'annonce arrive.
 */
const COMPTE_RELU_DISTANT = `      const compteRelu: RequestHandler = (_req, _res, next) => next();
`;

const GARDES: Record<'tout_le_monde' | 'connecte' | 'admin', string> = {
  tout_le_monde: 'toutLeMonde',
  connecte: 'connecte',
  admin: 'seulAdmin',
};

/** Les intergiciels d'accès d'un droit : un rôle déclaré passe par acces.roles, un admin passe toujours. */
export function gardeDe(qui: QuiPeut): string {
  return qui.startsWith('role:') ? `roles(${JSON.stringify(qui.slice(5).split(','))})` : GARDES[qui as keyof typeof GARDES];
}

function decrireDroits(droits: Record<Action, QuiPeut | null>, conditions?: Record<string, unknown[]>): string {
  const qui = (q: QuiPeut | null) => (q === null ? 'personne' : q === 'tout_le_monde' ? 'tout le monde' : q === 'connecte' ? 'un utilisateur connecté' : q === 'admin' ? 'seul un admin' : `les rôles ${q.slice(5).split(',').join(', ')}`);
  return ACTIONS.map((a) => `${a} : ${droits[a] === null && conditions?.[a]?.length ? 'un utilisateur connecté, selon une condition' : qui(droits[a])}`).join(' ; ');
}

function serveurTs(serveur: ServeurRI, chemins?: Map<string, string>, montageTempsReel = ''): string {
  const stockages = serveur.donnees.map((d) => `    ${camel(d.nom)}: Stockage;`).join('\n') + (serveur.projet ? `\n    /** La boîte d'envoi des messages aux autres services, et les messages reçus (par défaut, en mémoire). */\n    humalisBoite?: Stockage;\n    humalisRecus?: Stockage;` : '');
  const routes = serveur.routes
    .map((route) => {
      const donnee = camel(route.donnee);
      const schema = `SCHEMA_${simplifier(route.donnee).toUpperCase()}`;
      const variable = `route${pascal(route.adresse)}`;
      const donneeRoute = serveur.donnees.find((d) => d.nom === route.donnee)!;
      const separee = estSeparee(donneeRoute, route);
      // Une règle avec « si » regarde qui est connecté : la porte s'ouvre aux comptes, la fiche décide ensuite.
      // « le serveur "x" peut lire produit » sur une action fermée aux personnes : seul ce service passe.
      const pourServices = (a: Action) => (route.droitsServices ?? []).some((d) => d.actions.includes(a));
      const garde = (a: Action) => (route.droits[a] === null ? (conditionsDe(route, a).length ? '...acces.connecte' : pourServices(a) ? '...acces.seulServices' : 'refuse') : `...acces.${conditionsDe(route, a).length && route.droits[a] !== 'tout_le_monde' ? 'connecte' : gardeDe(route.droits[a]!)}`);
      const csrf = (a: Action) => (route.droits[a] === null && !conditionsDe(route, a).length && !pourServices(a) ? '' : ', csrfMiddleware');
      const voir = (a: Action) => (separee ? codeFicheVisible(variable, donnee, route.donnee, a, donneeRoute.par) : '');
      // Ce que tout le monde peut lire se garde un peu (navigateur, relais) ; une lecture réservée, jamais.
      const cache = route.droits.lire === 'tout_le_monde' ? 'lecturePublique' : 'lecturePrivee';
      // « en cache pendant … » : après la garde des droits ; une copie par compte quand la réponse dépend de la personne.
      const parPersonne = separee || conditionsDe(route, 'lire').length > 0 || route.droits.lire === null;
      const enCache = route.cache !== undefined ? `, cacheHumalis.lecture(${JSON.stringify(route.donnee)}, ${route.cache}, ${parPersonne ? 'personneDuCache' : 'undefined'})` : '';
      // Une liste ne garde que les paramètres qu'elle comprend : ses champs, « limite » et « depuis ».
      const parametresListe = [...donneeRoute.champs.map((c) => camel(c.nom)), 'limite', 'depuis'];
      const enCacheListe = route.cache !== undefined ? `, cacheHumalis.lecture(${JSON.stringify(route.donnee)}, ${route.cache}, ${parPersonne ? 'personneDuCache' : 'undefined'}, ${JSON.stringify(parametresListe)})` : '';
      // Une écriture réussie vide, avant de répondre, les copies des données qu'elle change.
      const videes = [...new Set([route.donnee, ...(route.creations ?? []).map((c) => c.donnee)])].filter((d) => donneesEnCache(serveur).has(d));
      return `      // « ${route.adresse} » (ligne ${ligneLocale(route.ligne)}) — ${decrireDroits(route.droits)}.
      const ${variable} = express.Router();
${clesAnnoncees(serveur, route).length ? `      ${variable}.use(direct.apres(${JSON.stringify(clesAnnoncees(serveur, route))}));
` : ''}${videes.length ? `      ${variable}.use(cacheHumalis.ecriture(${JSON.stringify(videes)}));
` : ''}${separee ? constantesSeparation(variable, donneeRoute, route) : ''}${route.synchronisee ? codeSynchroRoute(route, donneeRoute, variable, garde, separee ? codePortee(variable, 'lire') : '') : ''}${codeResumes(route, variable, separee, enCache)}${route.direct ? routeDirect(variable, garde('lire'), route.donnee, separee ? { separation: `separation${variable}`, regles: `regles${variable}.lire` } : undefined) : ''}      ${variable}.get('/', ${cache}, ${garde('lire')}${enCacheListe}, async (req, res, next) => {
        try {
${separee ? codePortee(variable, 'lire') : ''}          // « ?produit=… » : seulement ce qui est demandé, pas toute la liste.
          const filtres = lireFiltres(${schema}, req.query as Record<string, unknown>);
          res.json(filtres ? await ${separee ? `listerDans(stockages.${donnee}, filtres, portee)` : `stockages.${donnee}.lister(filtres)`} : []);
        } catch (erreur) {
          sansCache(res);
          next(erreur);
        }
      });
      ${variable}.get('/:id', ${route.droits.lireUn ? `lecturePrivee, ...acces.${gardeDe(route.droits.lireUn)}` : `${cache}, ${garde('lire')}${enCache}`}, async (req, res, next) => {
        try {
${voir('lire')}          const trouve = ${separee ? 'visible' : `await stockages.${donnee}.trouver(String(req.params.id))`};
          if (trouve) res.json(trouve);
          else sansCache(res).status(404).json({ erreur: introuvable('${route.donnee}') });
        } catch (erreur) {
          sansCache(res);
          next(erreur);
        }
      });
${route.bon ? routeBon(variable, route, garde('lire'), schema, donnee, separee) : ''}      ${variable}.post('/', ${garde('creer')}${csrf('creer')}, async (req, res, next) => {
        try {
${codeCreation(serveur, route, donneeRoute, schema, [route.envois?.length ? codeEnvois(serveur, route) : '', codeNotificationsCreation(route)].filter(Boolean).join('\n'), separee ? variable : undefined)}
        } catch (erreur) {
          next(erreur);
        }
      });
      ${variable}.patch('/:id', ${garde('modifier')}${csrf('modifier')}, async (req, res, next) => {
        try {
${voir('modifier')}          const envoi = verifierEnvoi(${schema}, req.body, false${reglesEnvoi(donneeRoute, route, true)});
          if ('erreur' in envoi) {
            res.status(400).json({ erreur: envoi.erreur });
            return;
          }
${codePlafondsModification(donneeRoute, serveur)}${codeEcritureModification(donneeRoute, route, avecLogique(serveur), serveur)}
          if (modifie) res.json(modifie);
          else res.status(404).json({ erreur: introuvable('${route.donnee}') });
        } catch (erreur) {
          next(erreur);
        }
      });
      ${variable}.delete('/:id', ${garde('supprimer')}${csrf('supprimer')}, async (req, res, next) => {
        try {
${voir('supprimer')}          if (await stockages.${donnee}.supprimer(String(req.params.id))) res.status(204).end();
          else res.status(404).json({ erreur: introuvable('${route.donnee}') });
        } catch (erreur) {
          next(erreur);
        }
      });
${codePaiements(route, variable, garde('lire'), voir('lire'), separee, donnee)}${codeDocuments(serveur, route, variable, garde('lire'), separee, voir('lire'))}${codeActions(serveur, route, variable)}      app.use('${adresseApi(route.adresse)}', ${variable});`;
    })
    .join('\n\n');
  const schemas = [...new Set(serveur.routes.map((r) => `SCHEMA_${simplifier(r.donnee).toUpperCase()}`))].join(', ');
  const google = avecInscriptionParFournisseur(serveur, (serveur.connexionGoogle ? ROUTE_GOOGLE : '') + (serveur.connexionApple ? ROUTE_APPLE : '')) + ROUTE_MOT_DE_PASSE;
  const boutique = JSON.stringify(serveur.nom);
  const fidelite = serveur.fidelite ? routeFidelite(serveur.fidelite) : '';
  const avecBon = serveur.routes.some((r) => r.bon);
  const comptes = avecComptes(serveur);
  const envoisDansRoutes = serveur.routes.some((r) => r.envois?.length);

  return `// Produit par Humalis : le serveur « ${serveur.nom} », assemblé avec les packs Astratra.
import { createSaasApp, ${comptes ? 'createMemoryPasswordResetStore, type PasswordResetStore, ' : ''}type UsersStore } from '@astratra/saas-kit';
import { ${[...(serveur.connexionGoogle ? ['createGoogleIdTokenVerifier'] : []), ...(serveur.connexionApple ? ['createAppleIdTokenVerifier'] : []), ...(serveur.connexionGoogle || serveur.connexionApple ? ['IdTokenError'] : []), ...(serveur.invitations || serveur.inscriptionLibre ? ['createApiLimiter'] : []), ].map((n) => n + ', ').join('')}createMemoryRevocationStore, type RevocationStore, createLoginLimiter, hashPassword, isStrongPassword, verifyPasswordHash, WAF_PATTERNS } from '@astratra/security';
import express, { type RequestHandler, type Response } from 'express';
import { cacheHumalis } from './humalis/cache.js';
${montageTempsReel ? IMPORT_TEMPS_REEL : ''}import { erreurDuJournal, journaliserErreur, noterHumalis } from './humalis/lignes.js';
${serveur.captureErreurs ? "import { brancherErreursProcessus, rapporterErreur } from './humalis/capture-erreurs.js';\n" : ''}${serveur.relaisErreurs?.length ? "import { relaisErreurs } from './humalis/relais-erreurs.js';\n" : ''}
${avecAnnonces(serveur) ? "import { direct } from './humalis/direct.js';\n" : ''}import { ${schemas} } from './donnees.js';${avecCache(serveur) ? `

// Le cache suit les annonces : une écriture faite ici (action, tâche) le vide partout, une annonce reçue le vide ici.
direct.suivre(cacheHumalis.annonceLocale, cacheHumalis.annonceDistante);
cacheHumalis.relierAnnonces(direct.annonce);
/** Ce qui sépare les copies d'une lecture qui dépend de la personne : son compte, ou le service qui appelle. */
const personneDuCache = (req: unknown): string => {
  const moi = (req as { user?: Record<string, unknown> }).user;
  const service = (req as { humalisService?: unknown }).humalisService;
  if (!moi) return service === undefined ? '' : 'service:' + String(service);
  // Son compte, son rôle et ses groupes : un changement de rôle ou de boutique donne une autre copie.
  const stable = Object.entries(moi).filter(([nom]) => !['iat', 'exp', 'nbf', 'jti', 'sid'].includes(nom)).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify(stable);
};` : ''}
import type { Coffre } from './humalis/coffre.js';
${comptes ? "import { creerComptes, refuserMotDePasseFaible, sansLesRetires } from './humalis/comptes.js';\n" : ''}${avecEmails(serveur) ? `import { creerEmails, ${envoisDansRoutes ? 'enTexte, ' : ''}type Emails } from './humalis/emails.js';\n` : ''}import { compresser } from './humalis/compresser.js';
import { creerEnvoisMemoire, creerUnSeulEnvoi, type MagasinEnvois } from './humalis/envois.js';${avecSynchro(serveur) ? "\nimport { creerJournalMemoire, creerSynchro, type JournalSynchro } from './humalis/synchro.js';" : ''}${avecSecurite(serveur) ? "\nimport { creerMagasinSecuriteMemoire, creerSecurite, oublierCompte, type MagasinSecurite } from './humalis/securite.js';" : ''}${avecPaiements(serveur) ? "\nimport { creerPaiements, type SurPaiement } from './humalis/paiements.js';" : ''}${avecIa(serveur) ? "\nimport { compterMemoire, creerIa, type Compter } from './humalis/ia.js';" : ''}${avecNotifications(serveur) ? "\nimport { creerNotifications } from './humalis/notifications.js';" : ''}${serveur.documents?.length ? "\nimport { creerDocument } from './humalis/document.js';" : ''}${avecBon ? "\nimport { creerBon } from './humalis/bon.js';" : ''}${serveur.fidelite ? "\nimport { carteDeFidelite } from './humalis/fidelite.js';" : ''}
${avecLogique(serveur) ? `import { ${['Refus', 'agreger', 'resumer', 'enTexte', 'estVide', 'contient', 'noter', 'nouveauTravail', 'recommencer', 'terminer', 'transactionMemoire', ...(serveur.taches?.length ? ['lancerTaches', 'type Reclamer'] : []), 'type Transaction'].join(', ')} } from './humalis/logique.js';\n` : ''}import { creerRenouvellement, reglagesDeSession, renouvellementEnCookie, type ReglagesSession } from './humalis/sessions.js';
import { ${avecNotifications(serveur) || serveur.projet ? 'creerStockageMemoire, ' : ''}${serveur.fidelite ? 'sansSeparateurs, ' : ''}type Stockage } from './humalis/stockage.js';${serveur.projet ? "\nimport { creerServices, droitDuService, noterRecu, RefusDuService, type Services } from './humalis/services.js';" : ''}
${compteRelu(serveur) ? (serveur.routes.some((r) => estSeparee(serveur.donnees.find((d) => d.nom === r.donnee)!, r)) ? "import { dansPortee, groupeACreer, listerDans, moiDe, porteeDe, REFUS_FICHES, type RegleAcces, type Separation } from './humalis/separation.js';\n" : '') : ''}import { lireFiltres, ${nomsVerifier(serveur).map((n) => n + ', ').join('')}texteMalForme, verifierEnvoi } from './humalis/verifier.js';

export interface OptionsDuServeur {
  /** Le secret des sessions (au moins 32 caractères). */
  jwtSecret: string;
  usersStore: UsersStore;
  stockages: {
${stockages}
  };${serveur.connexionGoogle ? '\n  /** L\'ID client OAuth de Google (« connexion google »), relu à chaque demande ; sans lui, la connexion avec Google est fermée. */\n  googleClientId?: string | (() => string | undefined);\n  /** L\'ID client de type iOS, pour l\'application Apple. */\n  googleClientIdApple?: () => string | undefined;' : ''}${serveur.connexionApple ? '\n  /** Les identifiants Apple (« connexion apple »), relus à chaque demande. */\n  identifiantsApple?: () => { application?: string; site?: string };' : ''}
${avecLogique(serveur) ? `  /** Comment écrire tout ou rien ; par défaut, en mémoire. */
  transaction?: Transaction<OptionsDuServeur['stockages']>;
` : ''}${serveur.taches?.length ? `  /** Donné par demarrer.ts : sans lui, aucune tâche ne tourne. */
  reclamerTache?: Reclamer;
` : ''}${avecIa(serveur) ? `  /** Le compteur des questions à l'IA ; par défaut, en mémoire. */
  compterIa?: Compter;
` : ''}${avecNotifications(serveur) ? `  /** Les appareils inscrits ; par défaut, en mémoire. */
  appareils?: Stockage;
` : ''}${avecSynchro(serveur) ? `  /** Le journal de la synchronisation ; par défaut, en mémoire. */
  journalSynchro?: JournalSynchro;
` : ''}${avecSecurite(serveur) ? `  /** Les clés d'accès et les secrets du code à six chiffres ; par défaut, en mémoire. */
  magasinSecurite?: MagasinSecurite;
  /** L'horloge du code à six chiffres (les tests la règlent). */
  horlogeSecurite?: () => number;
` : ''}  /** Les envois déjà faits (en-tête X-Humalis-Envoi) ; par défaut, en mémoire. */
  envois?: MagasinEnvois;
  /** La durée de la session et où garder ses renouvellements ; par défaut, HUMALIS_SESSION et HUMALIS_SESSION_MAX, en mémoire. */
  session?: ReglagesSession;
  /** Les jetons fermés avant leur fin (déconnexion, compte retiré) ; par défaut, en mémoire. */
  revocations?: RevocationStore;
  /** Ce que GET /sante vérifie (la base répond, le serveur ne s'arrête pas) ; par défaut, toujours prêt. */
  sante?: () => Promise<boolean>;${avecEmails(serveur) ? `
  /** Les e-mails ; par défaut, SMTP vers le serveur d'envoi du .env (HUMALIS_EMAILS_HOTE, HUMALIS_EMAILS_PORT, HUMALIS_EMAILS_EXPEDITEUR). */
  emails?: Emails;` : ''}${comptes ? `
  /** Les empreintes des liens envoyés par e-mail ; par défaut, en mémoire. */
  jetons?: PasswordResetStore;` : ''}
${serveur.projet ? `
  /** Les autres services du projet : la clé privée de ce service, la clé publique de chacun des autres, leurs adresses. */
  services?: { clePrivee: string; clesPubliques: Record<string, string | undefined>; adresses?: Record<string, string | undefined>; horloge?: () => number };
  /** La clé des jetons d'accès (ES256) : privée dans le service des comptes, publique ailleurs ; sans elle, jwtSecret (HS256). */
  cleDesJetons?: string;` : ''}
  /** Le coffre des clés de service, si ENCRYPTION_KEY est réglée. */
  coffre?: Coffre | null;
}

const introuvable = (donnee: string) => \`aucun « \${donnee} » avec cet identifiant\`;${avecBon ? `

/** Le nom écrit en tête de chaque bon : celui du serveur, tel qu'il est écrit dans le programme. */
const BOUTIQUE = ${boutique};` : ''}

/** Une action sans règle est refusée à tout le monde : la porte est fermée par défaut. */
const refuse: RequestHandler = (_req, res) => {
  res.status(403).json({ erreur: "cette action n'est permise à personne" });
};

/**
 * Une lecture que tout le monde peut faire : le navigateur (ou un relais) la
 * garde 30 secondes, puis la ressert encore 5 minutes le temps de la relire
 * en arrière-plan. L'ETag d'Express rend la relecture légère (304). Une
 * réponse qui pose un cookie (le premier jeton CSRF du visiteur) n'est gardée
 * que par son navigateur : un relais ne doit jamais donner ce cookie à un autre.
 */
const lecturePublique: RequestHandler = (_req, res, next) => {
  const cookie = res.getHeader('Set-Cookie') !== undefined;
  res.set('Cache-Control', \`\${cookie ? 'private' : 'public'}, max-age=30, stale-while-revalidate=300\`);
  next();
};

/** Une lecture réservée (connecté, admin) ou refusée : jamais gardée, ni partagée. */
const lecturePrivee: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
};

/**
 * Le pare-feu du pack lit d'un seul tenant l'adresse, ses paramètres et le corps de la requête. Ici :
 * - les mots de passe ne sont pas lus : hachés, jamais interprétés, ils peuvent contenir « -- » ou « /* » ;
 * - un refus dit en français ce qui est refusé, et dans quel champ ;
 * - HUMALIS_PARE_FEU=adresses : les motifs qui ne visent qu'un texte affiché ou exécuté tel quel (balise de
 *   script, « javascript: », « \${…} », « ../../../ », « eval( ») ne lisent plus le corps. Les pages affichent
 *   toujours un texte comme un texte : un cours d'informatique ou un forum technique peut alors les enregistrer.
 *   Les injections SQL restent refusées partout, et l'adresse reste lue en entier.
 */
const dernierRefus = { erreur: '' };
/** La réponse d'un refus : le pack l'envoie telle quelle, elle se lit au moment de l'envoi. */
const REFUS_DU_PARE_FEU = { toJSON: () => ({ erreur: dernierRefus.erreur }) };

/** Sépare ce que le pack lit d'un seul tenant : l'adresse et ses paramètres (une valeur JSON) d'un côté, le corps de l'autre. */
export function partagerCibles(cibles: string): { adresse: string; corps: string } {
  const debut = cibles.indexOf(' ');
  if (debut < 0) return { adresse: cibles, corps: '' };
  let i = debut + 1;
  let profondeur = 0;
  let chaine = false;
  for (; i < cibles.length; i++) {
    const c = cibles[i];
    if (chaine) {
      if (c === '\\\\') i++;
      else if (c === '"') chaine = false;
    } else if (c === '"') chaine = true;
    else if (c === '{' || c === '[') profondeur++;
    else if ((c === '}' || c === ']') && --profondeur === 0) {
      i++;
      break;
    }
  }
  return { adresse: cibles.slice(0, i), corps: cibles.slice(i + 1) };
}

/** Ce qui a été reconnu, sans déborder sur la suite du JSON : vingt-quatre caractères au plus. */
const extrait = (trouve: string) => trouve.split('"')[0]!.slice(0, 24);

export class MotifDuPareFeu extends RegExp {
  /** « affichage » : ce motif ne vise qu'un texte affiché ou exécuté tel quel ; « corpsLibre » : HUMALIS_PARE_FEU=adresses. */
  constructor(source: string, flags: string, private readonly affichage = false, private readonly corpsLibre = false) {
    super(source, flags);
  }

  override test(cibles: string): boolean {
    const lisible = cibles.replace(/"(password|actuel|nouveau)":"(?:[^"\\\\\\\\]|\\\\\\\\.)*"/g, '""');
    const { adresse, corps } = partagerCibles(lisible);
    const seul = new RegExp(this.source, this.flags.replace('g', ''));
    const dansLAdresse = seul.exec(adresse);
    if (dansLAdresse) {
      dernierRefus.erreur = 'cette adresse est refusée par sécurité : elle contient « ' + extrait(dansLAdresse[0]) + ' »';
      return true;
    }
    if (this.affichage && this.corpsLibre) return false;
    const dansLeCorps = seul.exec(corps);
    if (!dansLeCorps) return false;
    // Le champ en cause, pour que la personne sache quoi changer.
    let champ: string | undefined;
    try {
      const envoi: unknown = JSON.parse(corps);
      if (envoi !== null && typeof envoi === 'object') champ = Object.entries(envoi).find(([cle, valeur]) => seul.test(JSON.stringify({ [cle]: valeur })))?.[0];
    } catch {
      // Un corps qui n'est pas du JSON : le refus reste, sans nom de champ.
    }
    dernierRefus.erreur = (champ === undefined ? 'cet envoi' : 'le champ « ' + champ + ' »') + ' contient « ' + extrait(dansLeCorps[0]) + ' », que le serveur refuse par sécurité';
    return true;
  }
}

/**
 * Les motifs SQL, plus étroits que celui du pack : « Please select a size from the list » passe,
 * « ' UNION SELECT … », « '; DROP TABLE … » et « 1 UNION SELECT … » restent refusés (src/cibles/serveur/pare-feu.ts du compilateur).
 */
const MOTIFS_SQL: RegExp[] = ${MOTIFS_SQL_CODE};

/** Une erreur ou un « introuvable » ne se garde pas, même sur une route publique. */
const sansCache = (res: Response) => res.set('Cache-Control', 'no-store');

${serveur.routeMonCompte?.supprimer ? codeEffacerLesDonnees(serveur) : ''}/**
 * La connexion (/auth/login), les sessions, les rôles, le CSRF, les
 * limites et les en-têtes de sécurité viennent de createSaasApp. Les
 * routes des données s'ajoutent par extendRoutes, avec les gardes du pack.
 */
export function creerServeur({ ${avecSynchro(serveur) ? 'journalSynchro = creerJournalMemoire(), ' : ''}${avecSecurite(serveur) ? 'magasinSecurite = creerMagasinSecuriteMemoire(), horlogeSecurite = Date.now, ' : ''}envois = creerEnvoisMemoire(), jwtSecret, usersStore${comptes ? ': tousLesComptes' : ''}, stockages${avecLogique(serveur) ? ', transaction = transactionMemoire(stockages)' : ''}${serveur.taches?.length ? ', reclamerTache' : ''}${avecNotifications(serveur) ? ', appareils = creerStockageMemoire()' : ''}${avecIa(serveur) ? ', compterIa = compterMemoire()' : ''}${serveur.connexionGoogle ? ', googleClientId, googleClientIdApple = () => undefined' : ''}${serveur.connexionApple ? ', identifiantsApple = () => ({})' : ''}, session = reglagesDeSession(process.env), coffre${avecEmails(serveur) ? `, emails = creerEmails({ nom: ${boutique} })` : ''}${comptes ? ', jetons = createMemoryPasswordResetStore()' : ''}${serveur.projet ? ', revocations: revocationsLocales = createMemoryRevocationStore(), services: reglagesServices, cleDesJetons' : ', revocations = createMemoryRevocationStore()'}, sante = async () => true }: OptionsDuServeur) {
${serveur.projet ? codeCreationServices(serveur) : ''}
${serveur.captureErreurs ? '  brancherErreursProcessus();\n' : ''}
  const renouvellement = creerRenouvellement(session);
  // Le pare-feu : « strict » (par défaut) lit aussi les textes envoyés ; « adresses » ne lit que l'adresse pour les motifs d'affichage.
  const reglagePareFeu = (process.env.HUMALIS_PARE_FEU ?? 'strict').trim().toLowerCase();
  if (reglagePareFeu !== 'strict' && reglagePareFeu !== 'adresses') console.warn('HUMALIS_PARE_FEU vaut « ' + reglagePareFeu + ' » : seuls « strict » et « adresses » sont connus ; le pare-feu reste strict.');
  const corpsLibre = reglagePareFeu === 'adresses';
${comptes ? codeCreationComptes(serveur, chemins).replace('usersStore,', 'usersStore: tousLesComptes,') + '  // Pour les packs, un compte retiré n\'existe plus.\n  const usersStore = sansLesRetires(tousLesComptes);\n' : ''}${envoisDansRoutes || employe(serveur, (i) => i.type === 'email' && i.a.genre === 'admins') ? `  const adressesDesAdmins = async () => (await usersStore.list({ role: 'admin', limit: 100 })).map((compte) => String(compte.email)).filter(Boolean);\n` : ''}${avecNotifications(serveur) ? '  const notifications = creerNotifications({ usersStore, appareils });\n' : ''}${avecPaiements(serveur) ? `  let surPaiement: SurPaiement<ReturnType<typeof nouveauTravail>, OptionsDuServeur['stockages']> = {};
  const paiements = creerPaiements({
${serveur.captureErreurs ? `    // Un paiement reçu mais non enregistré part aussi à « quand une erreur arrive », pour que quelqu'un le voie.
    surErreur: (erreur) => void rapporterErreur(erreur, '/paiements/webhook'),` : ''}
    surConfirme: async (donnee, id, champ, montant) => {
      const travail = nouveauTravail();
      await transaction((s) => {
        recommencer(travail);
        return surPaiement[donnee]?.(travail, s, id, champ, montant) ?? Promise.resolve();
      });
      terminer(travail${avecAnnonces(serveur) ? ', direct.annonce' : ''});
    },
  });
` : ''}${avecSynchro(serveur) ? codeCreationSynchro(serveur) : ''}${avecSecurite(serveur) ? codeCreationSecurite(serveur).replace('jwtSecret,', 'jwtSecret,\n    horloge: horlogeSecurite,') : ''}  const serveur = createSaasApp({
    jwtSecret${serveur.projet ? ": cleDesJetons ?? jwtSecret,\n    // Plusieurs services : le service des comptes signe les jetons avec sa clé privée, les autres les vérifient avec la publique.\n    ...(cleDesJetons ? { jwtAlgorithms: ['ES256'] } : {})" : ''},
    // Le pare-feu du pack, sans son motif des commentaires SQL : le stockage passe par des requêtes paramétrées,
    // et « avenue #12 » ou « appeler -- après 18h » sont de vrais textes. Son motif « select … from » est remplacé
    // par MOTIFS_SQL : une phrase anglaise passe, une injection non. Les autres motifs restent.
    // HUMALIS_PARE_FEU=adresses : les textes du corps ne sont plus lus pour les motifs d'affichage (voir MotifDuPareFeu).
    waf: {
      message: REFUS_DU_PARE_FEU as unknown as Record<string, unknown>,
      patterns: [
        ...WAF_PATTERNS.filter((motif) => !motif.source.includes('--') && !motif.source.includes('${MOTIF_SQL_DU_PACK}')).map((motif) => new MotifDuPareFeu(motif.source, motif.flags, !motif.source.includes('(or|and)'), corpsLibre)),
        ...MOTIFS_SQL.map((motif) => new MotifDuPareFeu(motif.source, motif.flags)),
      ],
    },
    // Les limites par adresse : un établissement entier peut sortir par une seule adresse.
${serveur.projet ? `    // Une requête signée par un autre service du projet ne compte pas dans les limites : elle vient d'une seule adresse.
    apiRateLimit: {
      ...(process.env.HUMALIS_LIMITE_API ? { max: Number(process.env.HUMALIS_LIMITE_API) } : {}),
      store: cacheHumalis.limites('api'),
      // Seule une requête signée par un autre service passe ; une requête de la machine compte (un relais local en est une).
      skip: (req: { ip?: string }) => Boolean((req as unknown as { humalisService?: string }).humalisService),
    },` : `    // Avec HUMALIS_CACHE_ADRESSE, les limites se comptent dans Redis : les mêmes pour tous les exemplaires.
    apiRateLimit: {
      ...(process.env.HUMALIS_LIMITE_API ? { max: Number(process.env.HUMALIS_LIMITE_API) } : {}),
      store: cacheHumalis.limites('api'),
    },`}
    loginRateLimit: {
      ...(process.env.HUMALIS_LIMITE_CONNEXION ? { max: Number(process.env.HUMALIS_LIMITE_CONNEXION) } : {}),
      store: cacheHumalis.limites('connexion'),
    },
    // Derrière un relais (nginx) : son nombre, pour que les limites comptent chaque visiteur et non le relais.
    ...(process.env.HUMALIS_RELAIS ? { trustProxy: Number(process.env.HUMALIS_RELAIS) } : {}),
    // Un jeton d'accès court, renouvelé tant que la personne revient : voir src/humalis/sessions.ts.
    jwtExpiresIn: session.jeton,
    refreshTokens: { enabled: true, service: renouvellement },
    usersStore,
    roles: { adminRoles: ['admin'], ownerRoles: ['admin'] },
    // Un compte invité, ou une inscription pas encore confirmée, n'ouvre aucune session par mot de passe.
    verifyPassword: async (utilisateur, motDePasse) =>
      typeof utilisateur.passwordHash === 'string' && (utilisateur as { invitation?: unknown }).invitation !== true && verifyPasswordHash(motDePasse, utilisateur.passwordHash),
    notify: async () => {},
    // Un jeton fermé (déconnexion, compte retiré) le reste sur tous les exemplaires du serveur, et après un redémarrage.
    revocationStore: revocations,${comptes ? `
    // Le mot de passe oublié et la consommation d'un lien (invitation comprise) : les routes du pack, jeton haché et usage unique.
    hashPassword,
    passwordReset: { send: comptes.envoyerLienOublie, store: jetons },` : ''}
    extendRoutes: (app, contexte) => {
      // Les gardes du pack, telles quelles.
${serveur.projet ? `      const authDuPack = contexte.authMiddleware as unknown as RequestHandler;
      // Un autre service du projet, sans personne connectée : seulement ce que « le serveur "x" peut … » lui donne ici.
      const authMiddleware: RequestHandler = (req, res, next) => {
        const r = req as unknown as { humalisService?: string; humalisSansPersonne?: boolean; user?: Record<string, unknown> };
        if (!r.humalisSansPersonne) {
          authDuPack(req, res, next);
          return;
        }
        if (!droitDuService(DROITS_DES_SERVICES[req.baseUrl], r.humalisService!, req.method, req.path)) {
          res.status(403).json({ erreur: 'le serveur « ' + r.humalisService + ' » n\\'a pas ce droit ici' });
          return;
        }
        r.user = { id: 'service:' + r.humalisService, role: 'admin', email: '' };
        next();
      };` : '      const authMiddleware = contexte.authMiddleware as unknown as RequestHandler;'}
      const authorizeAdmin = contexte.authorizeAdmin as unknown as RequestHandler;
      const authorizeRoles = contexte.authorizeRoles as unknown as (...roles: string[]) => RequestHandler;
      const csrfMiddleware = contexte.csrfMiddleware as unknown as RequestHandler;
      const issueSession = (contexte as unknown as { issueSession: (res: unknown, compte: unknown) => Promise<object> }).issueSession;
      // Un demi-caractère Unicode, seul, est refusé à l'entrée : MySQL le refuserait (erreur 500), d'autres bases l'écriraient autrement.
      app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (texteMalForme(req.body)) {
          res.status(400).json({ erreur: 'un texte envoyé est mal formé (un caractère Unicode coupé en deux)' });
          return;
        }
        next();
      });
${compteRelu(serveur) ? (serveur.projet && serveur.projet.comptes !== serveur.nom ? COMPTE_RELU_DISTANT : serveur.projet ? COMPTE_RELU.replace('        try {\n', "        try {\n          // Un autre service du projet, sans personne : il n'a pas de compte à relire.\n          if (String((req as unknown as { user?: Record<string, unknown> }).user?.id ?? '').startsWith('service:')) {\n            next();\n            return;\n          }\n") : COMPTE_RELU) : ''}      const unSeulEnvoi = creerUnSeulEnvoi(envois);
      const acces = {
        toutLeMonde: [unSeulEnvoi] as RequestHandler[],
        connecte: [authMiddleware${compteRelu(serveur) ? ', compteRelu' : ''}, unSeulEnvoi],
        seulAdmin: [authMiddleware${compteRelu(serveur) ? ', compteRelu' : ''}, authorizeAdmin, unSeulEnvoi],
        // « seul directeur peut … » : le rôle vient de la session, vérifié par le pack de sécurité. Un admin passe toujours.
        roles: (permis: string[]): RequestHandler[] => [authMiddleware${compteRelu(serveur) ? ', compteRelu' : ''}, authorizeRoles('admin', ...permis), unSeulEnvoi],${serveur.projet ? `
        // « le serveur "x" peut … » sur une action fermée aux personnes : seul un service, avec ce droit.
        seulServices: [(req, res, next) => ((req as unknown as { humalisSansPersonne?: boolean }).humalisSansPersonne ? authMiddleware(req, res, next) : refuse(req, res, next)), unSeulEnvoi] as RequestHandler[],` : ''}
      };
      // Les réponses des routes ci-dessous partent compressées (brotli ou gzip) quand le navigateur l'accepte.
      app.use(compresser);
${google}${avecSecurite(serveur) ? codeRoutesSecurite(serveur) : ''}
      // Le coffre des clés de service : admin seulement, et le CSRF garde les écritures.
      const coffreFerme: RequestHandler = (_req, res) => {
        res.status(503).json({ erreur: "le coffre des clés n'est pas ouvert sur ce serveur (ENCRYPTION_KEY)" });
      };
      app.use('/auth/cles', authMiddleware, authorizeAdmin, csrfMiddleware, coffre ? coffre.routes(authorizeAdmin) : coffreFerme);

${avecCache(serveur) ? "      // Une écriture (action, paiement, message d'un autre service) attend, avant de répondre, les vidages du cache qu'elle a lancés.\n      app.use(cacheHumalis.ecriture());\n" : ''}${avecIa(serveur) ? routeIa(serveur) : ''}${avecNotifications(serveur) ? ROUTES_APPAREILS : ''}${codeCompleter(serveur)}${comptes ? codeRoutesComptes(serveur, adresseApi, (a) => `route${pascal(a)}`) : ''}${routes}${codePasserelles(serveur)}
${fidelite}${avecPaiements(serveur) ? codeSurPaiement(serveur) : ''}${codeTaches(serveur)}${montageTempsReel}      // Une erreur venue d'une ligne Humalis est écrite avec cette ligne dans le journal.
      app.use((erreur: unknown, req: express.Request, _res: express.Response, next: express.NextFunction) => { journaliserErreur(erreur, \`\${req.method} \${req.path}\`); next(erreur); });
${serveur.captureErreurs ? "      app.use((erreur: unknown, req: express.Request, _res: express.Response, next: express.NextFunction) => { void rapporterErreur(erreur, req.path); next(erreur); });\n" : ''}      // Le dernier avant la réponse d'erreur.
      // La réponse d'erreur, écrite ici plutôt que par le pack : jamais la pile ni le message interne
      // d'une erreur 500, même hors production (chemins du disque, requêtes SQL). Le détail reste
      // dans le journal du serveur.
      app.use((erreur: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (res.headersSent) return next(erreur);
        const e = (erreur ?? {}) as { statusCode?: unknown; status?: unknown; message?: unknown };
        const brut = Number(e.statusCode ?? e.status);
        const statut = Number.isInteger(brut) && brut >= 400 && brut < 600 ? brut : 500;
        if (statut >= 500) console.error(\`[requestId=\${(req as { requestId?: string }).requestId ?? 'n/a'}]\`, erreurDuJournal(erreur));
        const message = statut >= 500 ? 'Erreur interne du serveur.' : typeof e.message === 'string' && e.message ? e.message : 'Requête refusée.';
        res.status(statut).json({ success: false, message, data: null, timestamp: new Date().toISOString(), error: message });
      });
    },
  });
  // Express s'annonce par défaut : l'application du pack ne le fait plus.
  (serveur as unknown as express.Application).disable('x-powered-by');
  // En tête de tout : le jeton de renouvellement passe par son cookie.
  const avant = express().disable('x-powered-by');
  // Derrière un relais, ce qui est monté ici (le relais des rapports d'erreur) compte aussi chaque visiteur, pas le relais.
  if (process.env.HUMALIS_RELAIS) avant.set('trust proxy', Number(process.env.HUMALIS_RELAIS));
  // Toute réponse, routes de tête comprises (/sante, paiements, relais) : le navigateur ne devine pas le type, et une
  // page d'une autre origine ne charge pas une réponse sans passer par CORS (fetch, téléchargements restent permis).
  avant.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });
${CODE_SANTE}${avecPaiements(serveur) ? "  avant.post('/paiements/webhook', ...paiements.webhook);\n" : ''}${serveur.relaisErreurs?.length ? "  // Les rapports d'erreur des pages et des applications : ce serveur y ajoute la clé et l'adresse du .env.\n  avant.post('/humalis/erreurs', ...relaisErreurs);\n" : ''}${serveur.projet ? codeAvantServices(serveur) : ''}${codeAvantSecurite(serveur)}${codeAvantSynchro(serveur, adresseApi)}${comptes ? "\n  avant.post('/auth/reset-password', express.json({ limit: '16kb' }), refuserMotDePasseFaible);" : ''}
  return avant.use(renouvellementEnCookie(session.dureeMs)).use(serveur as unknown as express.Application);
}
`;
}

/** « , ["nom","prix"] » : les champs qu'une lecture rend ; rien pour une donnée du temps réel. */
function listeDesChamps(serveur: ServeurRI, donnee: ServeurRI['donnees'][number]): string {
  const champs = champsRendus(serveur, donnee, camel);
  return champs ? `, ${JSON.stringify(champs)}` : '';
}

function demarrerTs(serveur: ServeurRI): string {
  const comptes = avecComptes(serveur);
  const stockages = serveur.donnees
    .map((d) => `  ${camel(d.nom)}: pool ? creerStockagePostgres(pool, '${nomTable(d.nom)}'${listeDesChamps(serveur, d)}) : sqlite ? creerStockageSqlite(sqlite, '${nomTable(d.nom)}'${listeDesChamps(serveur, d)}) : mysql ? creerStockageMysql(mysql, '${nomTable(d.nom)}'${listeDesChamps(serveur, d)}) : documents ? creerStockageDocuments(documents, '${nomTable(d.nom)}'${listeDesChamps(serveur, d)}) : creerStockageMemoire(),`)
    .join('\n') + (serveur.projet ? '\n' + ([['humalisBoite', 'humalis_boite_envoi'], ['humalisRecus', 'humalis_messages_recus']] as const).map(([nom, table]) => `  ${nom}: pool ? creerStockagePostgres(pool, '${table}') : sqlite ? creerStockageSqlite(sqlite, '${table}') : mysql ? creerStockageMysql(mysql, '${table}') : documents ? creerStockageDocuments(documents, '${table}') : creerStockageMemoire(),`).join('\n') : '');
  const premiere = serveur.routes[0] ? adresseApi(serveur.routes[0].adresse) : '/auth/me';
  return `// Produit par Humalis : lit l'environnement, crée le premier admin, démarre le serveur « ${serveur.nom} ».
import { createServer, type RequestListener } from 'node:http';
import { createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword, isStrongPassword } from '@astratra/security';
import { createPostgresUsersStore } from '@astratra/store-postgres';
import pg from 'pg';
import { reglagesPostgres, relaisDeConnexions } from './humalis/postgres.js';${serveur.projet ? "\nimport { createPrivateKey, createPublicKey } from 'node:crypto';\nimport { adressesDesServices } from './humalis/services.js';" : ''}
import { creerServeur } from './serveur.js';
${avecDirect(serveur) ? "import { direct } from './humalis/direct.js';\n" : ''}${avecModuleCache(serveur) ? "import { cacheHumalis } from './humalis/cache.js';\n" : ''}${avecIa(serveur) ? "import { compterPostgres } from './humalis/ia.js';\n" : ''}${avecLogique(serveur) ? `import { transactionPostgres${serveur.taches?.length ? ', reclamerMemoire, reclamerPostgres' : ''} } from './humalis/logique.js';\n` : ''}import { creerEnvoisPostgres } from './humalis/envois.js';
import { ouvrirCoffre } from './humalis/coffre.js';${avecSynchro(serveur) ? "\nimport { creerJournalPostgres } from './humalis/synchro.js';" : ''}${avecSecurite(serveur) ? "\nimport { creerMagasinSecuritePostgres } from './humalis/securite.js';" : ''}${comptes ? "\nimport { creerMagasinJetons } from './humalis/comptes.js';" : ''}
import { creerMagasinMemoire, creerMagasinPostgres, creerRevocationsPostgres } from './humalis/renouvellements.js';
import { reglagesDeSession, type ReglagesSession } from './humalis/sessions.js';
import { creerStockageMemoire, creerStockagePostgres } from './humalis/stockage.js';
import { creerStockageSqlite, ouvrirSqlite, preparerTableSqlite, transactionSqlite, type BaseSqlite } from './humalis/sqlite.js';${avecSynchro(serveur) ? "\nimport { creerJournalSqlite } from './humalis/synchro-sqlite.js';\nimport { creerJournalMysql } from './humalis/synchro-mysql.js';" : ''}
import { canalMysql, cheminJson, connexionMysql, creerStockageMysql, ouvrirMysql, preparerTableMysql, transactionMysql, type BaseMysql } from './humalis/mysql.js';
import { canalDocuments, creerClesDocuments, creerComptesDocuments, creerEnvoisDocuments, creerRevocationsDocuments, creerSessionsDocuments, creerStockageDocuments, ouvrirDocuments, preparerCollection, transactionDocuments, type BaseDocuments${avecSecurite(serveur) ? ', creerSecuriteDocuments' : ''}${comptes ? ', creerJetonsDocuments' : ''}${serveur.taches?.length ? ', reclamerDocuments' : ''}${avecIa(serveur) ? ', compterDocuments' : ''} } from './humalis/documents.js';${avecSynchro(serveur) ? "\nimport { creerJournalDocuments } from './humalis/synchro-documents.js';" : ''}

function arreter(message: string): never {
  console.error(message);
  process.exit(1);
}


${serveur.projet ? codeSecretsServices(serveur) : `const jwtSecret = process.env.JWT_SECRET ?? '';
if (jwtSecret.length < 32) {
  arreter('JWT_SECRET doit contenir au moins 32 caractères au hasard (voir .env.exemple).');
}`}

// DATABASE_URL : la base choisie par celui qui déploie, d'après le début de l'adresse. Le programme n'en nomme aucune.
const adresseBase = process.env.DATABASE_URL?.trim() || null;
const genreBase = adresseBase === null ? null : /^postgres(ql)?:\\/\\//i.test(adresseBase) ? 'postgres' : /^(mysql|mariadb):\\/\\//i.test(adresseBase) ? 'mysql' : /^mongodb(\\+srv)?:\\/\\//i.test(adresseBase) ? 'documents' : null;
if (adresseBase !== null && genreBase === null) {
  arreter('DATABASE_URL doit commencer par postgres://, mysql://, mariadb:// ou mongodb:// (ici : « ' + adresseBase.split(':')[0] + ' »).');
}
let reglagesBase: ReturnType<typeof reglagesPostgres> | null = null;
if (genreBase === 'postgres') {
  try {
    reglagesBase = reglagesPostgres(adresseBase!, pg as never);
  } catch (erreur) {
    arreter('DATABASE_URL : ' + (erreur instanceof Error ? erreur.message : String(erreur)));
  }
  if (relaisDeConnexions(adresseBase!)) {
    console.warn("DATABASE_URL passe par un relais de connexions (« -pooler » ou port 6543) : en mode transaction, il coupe les annonces en direct entre exemplaires et les verrous. Donnez l'adresse directe de la base.");
  }
}
const pool = reglagesBase ? new pg.Pool(reglagesBase as pg.PoolConfig) : null;
// Quand la base redémarre, elle coupe les connexions au repos : sans cette écoute, l'erreur ferait tomber le serveur.
// Le pool en rouvre une à la requête suivante ; pendant la coupure, /sante répond 503 et les requêtes, 500.
pool?.on('error', (erreur) => console.error('La base a coupé une connexion au repos : le serveur continue.', erreur.message));
// HUMALIS_BASE : un fichier SQLite, pour un serveur seul (un fichier ne se partage pas entre plusieurs exemplaires).
const fichierSqlite = process.env.HUMALIS_BASE?.trim() || null;
if (adresseBase && fichierSqlite) {
  arreter('DATABASE_URL et HUMALIS_BASE (SQLite) sont réglées toutes les deux : gardez-en une seule.');
}
let mysql: BaseMysql | null = null;
if (genreBase === 'mysql') {
  // Un chiffrement mal écrit arrête ici, avant toute connexion : jamais de repli en clair.
  try {
    connexionMysql(adresseBase!);
  } catch (erreur) {
    arreter('DATABASE_URL : ' + (erreur instanceof Error ? erreur.message : String(erreur)));
  }
  try {
    mysql = await ouvrirMysql(adresseBase!);
  } catch (erreur) {
    arreter('La base MySQL ou MariaDB ne répond pas : ' + (erreur instanceof Error ? erreur.message : String(erreur)));
  }
  console.log('Base ' + (mysql.mariadb ? 'MariaDB' : 'MySQL') + ' : plusieurs exemplaires du serveur peuvent la partager.');
}
let documents: BaseDocuments | null = null;
if (genreBase === 'documents') {
  try {
    documents = await ouvrirDocuments(adresseBase!);
  } catch (erreur) {
    arreter('La base de documents ne convient pas : ' + (erreur instanceof Error ? erreur.message : String(erreur)));
  }
  console.log('Base de documents : « ' + documents.db.databaseName + ' », avec transactions.');
}
let sqlite: BaseSqlite | null = null;
try {
  sqlite = fichierSqlite ? ouvrirSqlite(fichierSqlite) : null;
} catch (erreur) {
  arreter('La base SQLite « ' + fichierSqlite + ' » ne s\\'ouvre pas : ' + (erreur instanceof Error ? erreur.message : String(erreur)));
}
if (sqlite) console.log('Base SQLite : ' + fichierSqlite + ' (un seul exemplaire du serveur par fichier).');
if (!pool && !sqlite && !mysql && !documents) {
  console.warn('Sans DATABASE_URL ni HUMALIS_BASE, les données restent en mémoire et sont perdues à l\\'arrêt : développement seulement.');
}
// Les magasins du serveur (comptes, sessions, envois, coffre…) écrivent leurs requêtes une fois ; SQLite les
// reçoit par la même porte, et traduit les quelques tournures qui lui manquent (versSqlite).
const sql = (pool ?? sqlite ?? mysql) as unknown as pg.Pool | null;

${avecModuleCache(serveur) ? `// HUMALIS_CACHE_ADRESSE : Redis (ou Valkey) garde le cache et porte les annonces de tous les exemplaires.
try {
  const genreCache = await cacheHumalis.brancher(process.env.HUMALIS_CACHE_ADRESSE?.trim() || undefined, ${JSON.stringify(simplifier(serveur.nom))}, process.env.DATABASE_URL ?? process.env.HUMALIS_BASE ?? '');
  if (genreCache === 'memoire') console.log('Cache : en mémoire de ce serveur (HUMALIS_CACHE_ADRESSE pour le partager).');
  else if (cacheHumalis.pret()) console.log('Cache : Redis, partagé par tous les exemplaires.');
} catch (erreur) {
  arreter('HUMALIS_CACHE_ADRESSE : ' + (erreur instanceof Error ? erreur.message : String(erreur)));
}
` : ''}${avecDirect(serveur) ? "if (pool) await direct.brancher(pool);\nelse if (mysql) direct.sonder(canalMysql(mysql));\nelse if (documents) direct.sonder(canalDocuments(documents));\ndirect.relayer(cacheHumalis);\n" : ''}const usersStore = (${serveur.projet && serveur.projet.comptes !== serveur.nom ? "createMemoryUsersStore()" : "documents ? creerComptesDocuments(documents) : sql ? createPostgresUsersStore({ pool: sql }) : createMemoryUsersStore()"}) as UsersStore;
const stockages = {
${stockages}
};
// Les index, créés une fois au démarrage : sans eux, chaque lecture filtrée ou triée parcourt toute la table.
// L'index des données sert les filtres (« ?produit=… ») et la séparation par groupe ; l'autre, l'ordre de création.
if (pool) {
  for (const table of [${serveur.donnees.map((d) => `'${nomTable(d.nom)}'`).join(', ')}]) {
    await pool.query(\`CREATE TABLE IF NOT EXISTS \${table} (id TEXT PRIMARY KEY, data JSONB NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())\`);
    await pool.query(\`CREATE INDEX IF NOT EXISTS \${table}_donnees ON \${table} USING GIN (data jsonb_path_ops)\`);
    await pool.query(\`CREATE INDEX IF NOT EXISTS \${table}_cree_le ON \${table} (cree_le)\`);
  }
}
${codeEvolutionEtDeparts(serveur)}
// Le premier administrateur vient de l'environnement : aucun mot de passe
// n'est écrit dans le code.
${serveur.projet && serveur.projet.comptes !== serveur.nom ? '// Les comptes sont tenus par le serveur « ' + serveur.projet.comptes.replace(/[\\'`$]/g, '') + ' » : aucun administrateur ici.\nconst email: string | undefined = undefined;\nconst motDePasse: string | undefined = undefined;' : `const email = process.env.HUMALIS_ADMIN_EMAIL;
const motDePasse = process.env.HUMALIS_ADMIN_MOT_DE_PASSE;`}
if (email && motDePasse && !(await usersStore.findByEmail(email))) {
  if (!isStrongPassword(motDePasse)) {
    arreter('HUMALIS_ADMIN_MOT_DE_PASSE est trop faible : 8 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.');
  }
  await usersStore.create({ email, role: 'admin', passwordHash: await hashPassword(motDePasse) });
  console.log(\`Administrateur créé : \${email}\`);
}

let session: ReglagesSession;
try {
  // Dans PostgreSQL, un redémarrage ne déconnecte personne.
  session = reglagesDeSession(process.env, documents ? creerSessionsDocuments(documents) : sql ? creerMagasinPostgres(sql) : creerMagasinMemoire());
} catch (erreur) {
  arreter(erreur instanceof Error ? erreur.message : String(erreur));
}

// Le coffre garde process.env à jour : les clés qu'il gère y sont relues à chaud.
const coffre = await ouvrirCoffre(sql, process.env, documents ? creerClesDocuments(documents) : undefined);

${CODE_SANTE_DEMARRAGE}
const port = Number(process.env.PORT ?? 3000);
const app = creerServeur({ sante, ...(documents ? { envois: creerEnvoisDocuments(documents), revocations: creerRevocationsDocuments(documents)${avecSecurite(serveur) ? ', magasinSecurite: creerSecuriteDocuments(documents)' : ''} } : sql ? { envois: creerEnvoisPostgres(sql), revocations: creerRevocationsPostgres(sql)${avecSecurite(serveur) ? ', magasinSecurite: creerMagasinSecuritePostgres(sql)' : ''} } : {})${avecSynchro(serveur) ? `, ...(pool ? { journalSynchro: creerJournalPostgres(pool, ${tablesSynchro(serveur, nomTable)}) } : sqlite ? { journalSynchro: creerJournalSqlite(sqlite, ${tablesSynchro(serveur, nomTable)}) } : mysql ? { journalSynchro: creerJournalMysql(mysql, ${tablesSynchro(serveur, nomTable)}) } : documents ? { journalSynchro: creerJournalDocuments(documents, ${tablesSynchro(serveur, nomTable)}) } : {})` : ''}, jwtSecret, usersStore, stockages${avecLogique(serveur) ? `, ...(pool ? { transaction: transactionPostgres(pool, (client) => ({ ${[...serveur.donnees.map((d) => `${camel(d.nom)}: creerStockagePostgres(client, '${nomTable(d.nom)}'${listeDesChamps(serveur, d)})`), ...(serveur.projet ? ["humalisBoite: creerStockagePostgres(client, 'humalis_boite_envoi')", "humalisRecus: creerStockagePostgres(client, 'humalis_messages_recus')"] : [])].join(', ')} })) } : sqlite ? { transaction: transactionSqlite(sqlite, stockages) } : mysql ? { transaction: transactionMysql(mysql, stockages) } : documents ? { transaction: transactionDocuments(documents, stockages) } : {})` : ''}${serveur.taches?.length ? ', reclamerTache: documents ? reclamerDocuments(documents) : sql ? reclamerPostgres(sql) : reclamerMemoire()' : ''}${avecNotifications(serveur) ? ", ...(pool ? { appareils: creerStockagePostgres(pool, 'humalis_appareils') } : sqlite ? { appareils: creerStockageSqlite(sqlite, 'humalis_appareils') } : mysql ? { appareils: creerStockageMysql(mysql, 'humalis_appareils') } : documents ? { appareils: creerStockageDocuments(documents, 'humalis_appareils') } : {})" : ''}${avecIa(serveur) ? ', ...(documents ? { compterIa: compterDocuments(documents) } : sql ? { compterIa: compterPostgres(sql) } : {})' : ''}${serveur.connexionGoogle ? ', googleClientId: () => process.env.GOOGLE_CLIENT_ID || undefined, googleClientIdApple: () => process.env.GOOGLE_CLIENT_ID_APPLE || undefined' : ''}${serveur.connexionApple ? ', identifiantsApple: () => ({ application: process.env.APPLE_APP_ID || undefined, site: process.env.APPLE_SERVICE_ID || undefined })' : ''}${comptes ? ', jetons: documents ? creerJetonsDocuments(documents) : creerMagasinJetons(sql)' : ''}, session, coffre${serveur.projet ? ', services: { clePrivee: cleDuServiceIci, clesPubliques: clesDesServices }, cleDesJetons' : ''} }) as unknown as { listen(port: number, pret: () => void): unknown };
// HUMALIS_ECOUTE : l'adresse d'écoute (127.0.0.1 derrière un relais) ; sans elle, toutes les adresses.
const pret = () => console.log(\`Serveur « ${serveur.nom} » prêt : http://localhost:\${port}${premiere}\`);
const ecoute = process.env.HUMALIS_ECOUTE?.trim();
const auditeur = createServer(app as unknown as RequestListener);
if (ecoute) auditeur.listen(port, ecoute, pret);
else auditeur.listen(port, pret);
${codeArret()}`;
}

function testsRegles(serveur: ServeurRI): string {
  const stockages = serveur.donnees.map((d) => `      ${camel(d.nom)}: creerStockageMemoire(),`).join('\n');
  const ok: Record<Action, number> = { lire: 200, creer: 201, modifier: 200, supprimer: 204 };

  const blocs = serveur.routes.map((route) => {
    const donnee = serveur.donnees.find((d) => d.nom === route.donnee)!;
    // Les champs à règle ont des exemples qui les respectent ; un envoi laisse de côté ce que le serveur décide.
    // Une liste non vide lue par une somme contient une vraie référence, créée à la volée.
    const lueParSomme = (c: (typeof donnee.champs)[number]) => donnee.champs.flatMap((x) => (x.regle?.genre === 'somme' && x.regle.liste === c.nom ? [x.regle.donnee] : []))[0];
    const exempleDe = (c: (typeof donnee.champs)[number]) => {
      if (c.regle?.genre === 'site') return c.type.genre === 'liste' ? "['/a.png']" : "'/a.png'";
      if (c.regle?.genre === 'auPlus') return '0';
      if (c.nonVide && c.type.genre === 'liste') {
        const lue = lueParSomme(c);
        return lue ? `[(await stockages.${camel(lue)}.creer(${ficheExemple(serveur, lue)})).id]` : "['exemple']";
      }
      return exempleDansLesBornes(c.type, c.bornes) ?? exempleChamp(c.type);
    };
    const duServeur = champsDuServeur(donnee, route);
    const exemple = `{ ${donnee.champs.map((c) => `${camel(c.nom)}: ${exempleDe(c)}`).join(', ')} }`;
    const envoiExemple = `{ ${donnee.champs.filter((c) => !duServeur.includes(camel(c.nom))).map((c) => `${camel(c.nom)}: ${exempleDe(c)}`).join(', ')} }`;
    const adresse = adresseApi(route.adresse);
    if (estSeparee(donnee, route)) return testsSeparee(serveur, route, donnee, adresse, exemple, envoiExemple);
    const tests: string[] = [];

    for (const action of ACTIONS) {
      const qui = route.droits[action];
      const appel = (jeton: string) => {
        const avec = jeton === 'visiteur' ? '' : `.set('authorization', \`Bearer \${${jeton}}\`)`;
        switch (action) {
          case 'lire':
            return `request(app).get('${adresse}')${avec}`;
          case 'creer':
            return `${jeton === 'visiteur' ? 'visiteurAvecCsrf' : 'request(app)'}.post('${adresse}')${avec}${jeton === 'visiteur' ? '.set(csrf)' : ''}.send(${envoiExemple})`;
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
    if (createur && donnee.champs.length > duServeur.length) {
      const avec = createur === 'visiteur' ? `visiteurAvecCsrf.post('${adresse}').set(csrf)` : `request(app).post('${adresse}').set('authorization', \`Bearer \${${createur}}\`)`;
      tests.push(`    it('refuse un envoi mal formé (400)', async () => {
      const reponse = await ${avec}.send({});
      expect(reponse.status).toBe(400);
      expect(reponse.body.erreur).toContain('manque');
    });`);
    }

    if (createur && duServeur.length > 0) {
      const avec = createur === 'visiteur' ? `visiteurAvecCsrf.post('${adresse}').set(csrf)` : `request(app).post('${adresse}').set('authorization', \`Bearer \${${createur}}\`)`;
      tests.push(`    it('ce que le serveur décide est refusé à l\\'envoi : ${duServeur.join(', ')}', async () => {
${duServeur.map((c) => `      expect((await ${avec}.send({ ...${envoiExemple}, ${c}: ${exempleChamp(donnee.champs.find((x) => camel(x.nom) === c)!.type)} })).body.erreur).toContain('donné par le serveur');`).join('\n')}
    });`);
    }
    const somme = donnee.champs.find((c) => c.regle?.genre === 'somme');
    if (createur && somme?.regle?.genre === 'somme') {
      const { donnee: lue, prix, liste } = somme.regle;
      // Le calcul ne lit qu'une fiche que la personne pourrait lire par sa route : si la fiche lue est
      // réservée à son auteur, l'essai se fait avec un compte neuf, auteur de la fiche. Un visiteur
      // n'est l'auteur de rien : il n'y a alors rien à essayer.
      const champAuteur = serveur.donnees.find((d) => d.nom === lue)?.champs.find((c) => c.regle?.genre === 'auteur');
      const reserveeASonAuteur = champAuteur !== undefined && serveur.routes.some((r) => r.donnee === lue && r.interne === undefined && r.droits.lire === null
        && (r.conditions?.lire ?? []).some((c) => c.gauche.genre === 'fiche' && c.gauche.champ === champAuteur.nom && c.droite.genre === 'utilisateur' && c.droite.champ === 'id'));
      const parSonAuteur = reserveeASonAuteur && createur !== 'visiteur';
      const avec = createur === 'visiteur' ? `visiteurAvecCsrf.post('${adresse}').set(csrf)` : `request(app).post('${adresse}').set('authorization', \`Bearer \${${parSonAuteur ? 'auteur.jeton' : createur}}\`)`;
      const liees = (route.creations ?? []).filter((c) => c.dans !== undefined);
      if (!reserveeASonAuteur || parSonAuteur) tests.push(`    it('« ${somme.nom} » est recalculé depuis « ${lue} », et une référence inconnue est refusée', async () => {
${parSonAuteur ? `      const auteur = await nouveauCompte('${createur === 'jetonAdmin' ? 'admin' : 'utilisateur'}');\n` : ''}      const fiche = await stockages.${camel(lue)}.creer({ ...${ficheExemple(serveur, lue)}, ${camel(prix)}: 7${parSonAuteur ? `, ${camel(champAuteur!.nom)}: auteur.id` : ''} });
      const reponse = await ${avec}.send({ ...${envoiExemple}, ${camel(liste)}: [fiche.id, fiche.id] }).expect(201);
      expect(reponse.body.${camel(somme.nom)}).toBe(14);
${liees.map((c) => `      expect(await stockages.${camel(c.donnee)}.trouver(reponse.body.${camel(c.dans!)})).not.toBeNull();`).join('\n')}
      expect((await ${avec}.send({ ...${envoiExemple}, ${camel(liste)}: ['inconnue'] })).status).toBe(400);
    });`);
    }
    const champNonVide = donnee.champs.find((c) => c.nonVide);
    if (createur && champNonVide) {
      const avec = createur === 'visiteur' ? `visiteurAvecCsrf.post('${adresse}').set(csrf)` : `request(app).post('${adresse}').set('authorization', \`Bearer \${${createur}}\`)`;
      tests.push(`    it('« ${champNonVide.nom} » refuse une valeur vide', async () => {
      const reponse = await ${avec}.send({ ...${envoiExemple}, ${camel(champNonVide.nom)}: ${champNonVide.type.genre === 'liste' ? '[]' : "'  '"} });
      expect(reponse.status).toBe(400);
      expect(reponse.body.erreur).toContain('ne doit pas être vide');
    });`);
    }
    const champSite = donnee.champs.find((c) => c.regle?.genre === 'site');
    if (createur && champSite) {
      const avec = createur === 'visiteur' ? `visiteurAvecCsrf.post('${adresse}').set(csrf)` : `request(app).post('${adresse}').set('authorization', \`Bearer \${${createur}}\`)`;
      const mauvais = champSite.type.genre === 'liste' ? "['https://ailleurs.example/a.png']" : "'https://ailleurs.example/a.png'";
      tests.push(`    it('« ${champSite.nom} » refuse une adresse d\\'un autre site', async () => {
      const reponse = await ${avec}.send({ ...${envoiExemple}, ${camel(champSite.nom)}: ${mauvais} });
      expect(reponse.status).toBe(400);
      expect(reponse.body.erreur).toContain('adresse de ce site');
    });`);
    }
    if (route.droits.lireUn) {
      const qui = route.droits.lireUn;
      const visiteur = qui === 'tout_le_monde' ? 200 : 401;
      tests.push(`    it('une fiche par son identifiant : visiteur ${visiteur}, jamais gardée', async () => {
      const fiche = await stockages.${camel(route.donnee)}.creer(${exemple});
      const reponse = await request(app).get(\`${adresse}/\${fiche.id}\`).expect(${visiteur});
      expect(reponse.headers['cache-control']).toBe('private, no-store');
    });`);
    }

    // Le cache : public pour ce que tout le monde lit, jamais pour une lecture réservée.
    const publique = route.droits.lire === 'tout_le_monde';
    const enTete = publique ? 'public, max-age=30, stale-while-revalidate=300' : 'private, no-store';
    tests.push(`    it('lecture : Cache-Control « ${enTete} »', async () => {
      const reponse = await request(app).get('${adresse}').set(csrf).set('authorization', \`Bearer \${jetonAdmin}\`);
      expect(reponse.headers['cache-control']).toBe('${enTete}');${
        publique
          ? `
      // La première lecture d'un visiteur pose son jeton CSRF : seul son navigateur la garde, jamais un relais.
      const premiere = await request(app).get('${adresse}');
      expect(premiere.headers['cache-control']).toBe('private, max-age=30, stale-while-revalidate=300');`
          : ''
      }
    });`);
    const texte = donnee.champs.find((c) => c.type.genre === 'texte' && !c.type.image);
    if (route.droits.lire !== null && texte) {
      const champ = camel(texte.nom);
      tests.push(`    it('lecture filtrée : ?${champ}=… ne renvoie que les éléments de ce ${champ}', async () => {
      await stockages.${camel(route.donnee)}.creer({ ...${exemple}, ${champ}: 'filtre-a' });
      await stockages.${camel(route.donnee)}.creer({ ...${exemple}, ${champ}: 'filtre-b' });
      const reponse = await request(app).get('${adresse}?${champ}=filtre-a&inconnu=1').set('authorization', \`Bearer \${jetonAdmin}\`).expect(200);
      expect(reponse.body.length).toBeGreaterThan(0);
      expect(reponse.body.every((e: Record<string, unknown>) => e.${champ} === 'filtre-a')).toBe(true);
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
let comptesCrees = 0;
let nouveauCompte: (role: string, groupes?: Record<string, string>) => Promise<{ id: string; jeton: string }>;

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
  nouveauCompte = async (role, groupes = {}) => {
    const email = \`compte\${++comptesCrees}@exemple.cd\`;
    const compte = await usersStore.create({ email, role, passwordHash, ...groupes });
    return { id: String(compte.id), jeton: await connecter(email) };
  };
  visiteurAvecCsrf = request.agent(app);
  const amorce = await visiteurAvecCsrf.get('/auth/me');
  const cookie = ([] as string[]).concat(amorce.headers['set-cookie'] ?? []).find((c) => c.startsWith('astratra_csrf='));
  // Hors développement, le pack marque ce cookie « Secure » : en http, l'agent
  // ne le renverrait pas. Le visiteur le renvoie donc lui-même, avec l'en-tête.
  const jeton = cookie?.split(';')[0].split('=')[1];
  csrf = jeton ? { 'x-csrf-token': jeton, cookie: \`astratra_csrf=\${jeton}\` } : {};
});

describe('règles d\\'accès', () => {
  it('le serveur ne dit pas qu\\'il tourne sous Express', async () => {
    const reponse = await request(app).get('/auth/me');
    expect(reponse.headers['x-powered-by']).toBeUndefined();
  });

${blocs.join('\n\n')}
});
`;
}

/** Les tests produits de la session et du coffre, avec les vrais packs et une horloge injectée. */
function testsSessions(serveur: ServeurRI): string {
  // La panne est provoquée par une lecture : il faut une route que l'admin peut lire (une route sans règle de lecture répond 403 avant de lire).
  const routeLue = serveur.routes.find((r) => r.droits.lire !== null);
  const stockages = serveur.donnees.map((d) => `      ${camel(d.nom)}: creerStockageMemoire(),`).join('\n');
  return `// Produit par Humalis : la session glissante, sa borne de 30 jours et le coffre des clés.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from '../src/serveur.js';
import { creerMagasinMemoire } from '../src/humalis/renouvellements.js';
import { lireDuree, type ReglagesSession } from '../src/humalis/sessions.js';
import { creerStockageMemoire } from '../src/humalis/stockage.js';
import { ouvrirCoffre } from '../src/humalis/coffre.js';

const JOUR = 86_400_000;
const MOT_DE_PASSE = 'Essai-Solide-2026!';
const stockages = () => ({
${stockages}
});
let usersStore: UsersStore;
let maintenant = 0;

const reglages = (): ReglagesSession => ({ jeton: '15m', dureeMs: 3 * JOUR, maximumMs: 30 * JOUR, magasin: creerMagasinMemoire(), horloge: () => maintenant });
const leServeur = (plus: object = {}) => creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages: stockages(), session: reglages(), ...plus }) as never;

/** Le cookie de renouvellement posé par une réponse (hors développement il est « Secure » : le test le renvoie lui-même). */
function cookieDe(reponse: request.Response): string | undefined {
  const lignes = ([] as string[]).concat(reponse.headers['set-cookie'] ?? []);
  return lignes.find((l) => l.startsWith('humalis_renouvellement='))?.split(';')[0];
}
const connecter = (app: never, email = 'admin@exemple.cd', entetes: Record<string, string> = {}) =>
  request(app).post('/auth/login').set(entetes).send({ email, password: MOT_DE_PASSE }).expect(200);
const renouveler = (app: never, cookie: string) => request(app).post('/auth/refresh').set('cookie', cookie);

beforeAll(async () => {
  usersStore = createMemoryUsersStore() as UsersStore;
  const passwordHash = await hashPassword(MOT_DE_PASSE);
  await usersStore.create({ email: 'admin@exemple.cd', role: 'admin', passwordHash });
  await usersStore.create({ email: 'awa@exemple.cd', role: 'utilisateur', passwordHash });
});

beforeEach(() => {
  maintenant = Date.UTC(2026, 0, 1);
});

describe('la session', () => {
  it('le jeton de renouvellement reste dans un cookie HttpOnly, jamais dans la réponse du navigateur', async () => {
    const reponse = await connecter(leServeur());
    expect(reponse.body.data.refreshToken).toBeUndefined();
    const ligne = ([] as string[]).concat(reponse.headers['set-cookie']).find((l) => l.startsWith('humalis_renouvellement='))!;
    expect(ligne).toContain('HttpOnly');
    expect(ligne).toContain('Path=/auth');
    expect(ligne).toContain('Max-Age=' + 3 * 86_400);
    // Une page piégée qui se fait passer pour un téléphone n'y gagne rien : un jeton venu d'un cookie ne ressort jamais.
    const piege = await renouveler(leServeur(), cookieDe(reponse)!).set('x-humalis-mobile', '1');
    expect(piege.body.data?.refreshToken).toBeUndefined();
  });

  it('se renouvelle avant 3 jours, et le renouvellement rouvre 3 jours', async () => {
    const app = leServeur();
    let cookie = cookieDe(await connecter(app))!;
    for (let i = 0; i < 4; i++) {
      maintenant += 2 * JOUR;
      const reponse = await renouveler(app, cookie).expect(200);
      expect(reponse.body.data.token).toBeTruthy();
      expect(reponse.body.data.refreshToken).toBeUndefined();
      cookie = cookieDe(reponse)!;
    }
    // Le jeton d'accès neuf ouvre bien /auth/me.
    const jeton = (await renouveler(app, cookie).expect(200)).body.data.token;
    await request(app).get('/auth/me').set('authorization', 'Bearer ' + jeton).expect(200);
  });

  it('refuse après 3 jours sans venir, et efface le cookie', async () => {
    const app = leServeur();
    const cookie = cookieDe(await connecter(app))!;
    maintenant += 3 * JOUR + 1000;
    const reponse = await renouveler(app, cookie).expect(401);
    expect(cookieDe(reponse)).toBe('humalis_renouvellement=');
  });

  it('refuse après 30 jours malgré des retours réguliers', async () => {
    const app = leServeur();
    let cookie = cookieDe(await connecter(app))!;
    const debut = maintenant;
    // Chaque jour : toujours bon jusqu'au 29e.
    for (let jour = 1; jour <= 29; jour++) {
      maintenant = debut + jour * JOUR;
      cookie = cookieDe(await renouveler(app, cookie).expect(200))!;
    }
    maintenant = debut + 30 * JOUR;
    await renouveler(app, cookie).expect(401);
  });

  it('un jeton rejoué après le délai de grâce ferme toute la famille ; deux onglets au même instant passent', async () => {
    const app = leServeur();
    const premier = cookieDe(await connecter(app))!;
    const suivant = cookieDe(await renouveler(app, premier).expect(200))!;
    // Le second onglet, le même instant : accepté.
    await renouveler(app, premier).expect(200);
    maintenant += 11_000;
    await renouveler(app, premier).expect(401);
    await renouveler(app, suivant).expect(401);
  });

  it('la déconnexion ferme la famille et efface le cookie', async () => {
    const app = leServeur();
    const connexion = await connecter(app);
    const cookie = cookieDe(connexion)!;
    const sortie = await request(app).post('/auth/logout').set('authorization', 'Bearer ' + connexion.body.data.token).expect(200);
    expect(cookieDe(sortie)).toBe('humalis_renouvellement=');
    await renouveler(app, cookie).expect(401);
  });

  it('changer le mot de passe ferme les autres sessions, celle-ci repart', async () => {
    const app = leServeur();
    const ailleurs = cookieDe(await connecter(app, 'awa@exemple.cd'))!;
    const ici = await connecter(app, 'awa@exemple.cd');
    const change = await request(app)
      .post('/auth/mot-de-passe')
      .set('authorization', 'Bearer ' + ici.body.data.token)
      .send({ actuel: MOT_DE_PASSE, nouveau: MOT_DE_PASSE })
      .expect(200);
    expect(change.body.change).toBe(true);
    expect(change.body.refreshToken).toBeUndefined();
    await renouveler(app, ailleurs).expect(401);
    await renouveler(app, cookieDe(ici)!).expect(401);
    await renouveler(app, cookieDe(change)!).expect(200);
  });

  it('un téléphone reçoit son jeton en JSON et le présente dans le corps', async () => {
    const app = leServeur();
    const connexion = await connecter(app, 'awa@exemple.cd', { 'x-humalis-mobile': '1' });
    expect(connexion.body.data.refreshToken).toBeTruthy();
    expect(cookieDe(connexion)).toBeUndefined();
    const suite = await request(app).post('/auth/refresh').set('x-humalis-mobile', '1').send({ refreshToken: connexion.body.data.refreshToken }).expect(200);
    expect(suite.body.data.refreshToken).toBeTruthy();
    expect(suite.body.data.refreshToken).not.toBe(connexion.body.data.refreshToken);
  });

  it('refuse une durée illisible avec une phrase claire', () => {
    expect(lireDuree(undefined, '3d', 'HUMALIS_SESSION')).toBe(3 * JOUR);
    expect(lireDuree('12h', '3d', 'HUMALIS_SESSION')).toBe(JOUR / 2);
    expect(() => lireDuree('trois jours', '3d', 'HUMALIS_SESSION')).toThrow('HUMALIS_SESSION doit être une durée');
  });
});

describe('le coffre des clés', () => {
  it('sans ENCRYPTION_KEY, fermé : le serveur marche, /auth/cles répond 503 à un admin et 401 à un visiteur', async () => {
    const coffre = await ouvrirCoffre(null, { ENCRYPTION_KEY: '' });
    expect(coffre).toBeNull();
    const app = leServeur({ coffre });
    await request(app).get('/auth/cles').expect(401);
    const jeton = (await connecter(app)).body.data.token;
    await request(app).get('/auth/cles').set('authorization', 'Bearer ' + jeton).expect(503);
  });

  it('une ENCRYPTION_KEY de mauvaise taille laisse le coffre fermé, sans arrêter le serveur', async () => {
    expect(await ouvrirCoffre(null, { ENCRYPTION_KEY: 'trop-courte' })).toBeNull();
  });${serveur.connexionGoogle ? `

  it('une clé enregistrée sert tout de suite, sans redémarrer ; rien ne ressort en clair ; débranchée, elle se tait', async () => {
    const env: NodeJS.ProcessEnv = { ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
    const coffre = await ouvrirCoffre(null, env);
    const app = leServeur({ coffre, googleClientId: () => env.GOOGLE_CLIENT_ID });
    const admin = (await connecter(app)).body.data.token;
    const utilisateur = (await connecter(app, 'awa@exemple.cd')).body.data.token;
    const avecJeton = (jeton: string) => ({ authorization: 'Bearer ' + jeton });
    expect((await request(app).get('/auth/google').expect(200)).body.clientId).toBeNull();
    await request(app).put('/auth/cles/GOOGLE_CLIENT_ID').set(avecJeton(utilisateur)).send({ value: 'id-de-test' }).expect(403);
    await request(app).put('/auth/cles/GOOGLE_CLIENT_ID').send({ value: 'id-de-test' }).expect(401);
    await request(app).put('/auth/cles/JWT_SECRET').set(avecJeton(admin)).send({ value: 'non' }).expect(400);
    await request(app).put('/auth/cles/GOOGLE_CLIENT_ID').set(avecJeton(admin)).send({ value: 'id-de-test-abcd' }).expect(200);
    expect((await request(app).get('/auth/google').expect(200)).body.clientId).toBe('id-de-test-abcd');
    const etat = await request(app).get('/auth/cles').set(avecJeton(admin)).expect(200);
    expect(JSON.stringify(etat.body)).not.toContain('id-de-test-abcd');
    await request(app).delete('/auth/cles/GOOGLE_CLIENT_ID').set(avecJeton(admin)).expect(200);
    expect((await request(app).get('/auth/google').expect(200)).body.clientId).toBeNull();
  });

  it('un envoi depuis une page sans jeton CSRF est refusé', async () => {
    const coffre = await ouvrirCoffre(null, { ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') });
    const app = leServeur({ coffre });
    const cookies = ([] as string[]).concat((await connecter(app)).headers['set-cookie']);
    const session = cookies.find((c) => c.startsWith('astratra_session='))!.split(';')[0];
    await request(app).put('/auth/cles/GOOGLE_CLIENT_ID').set('cookie', session).send({ value: 'id' }).expect(403);
  });` : ''}
});

`;
}

/** Ce que le LISEZMOI ajoute pour « telecharger bon de … » et « fidelite … ». */
function lisezmoiEnPlus(serveur: ServeurRI): string {
  const bons = serveur.routes.filter((r) => r.bon).map((r) => `\`GET ${adresseApi(r.adresse)}/:id/bon\``);
  const lignes: string[] = [
    ...(bons.length > 0 ? [`\nLe bon d'une fiche, en PDF, avec les mêmes droits que sa lecture et jamais gardé en cache : ${bons.join(', ')}.`] : []),
    ...(serveur.fidelite
      ? [`\nLa carte de fidélité d'un client, calculée sur les fiches, réservée à l'admin et sans écriture : \`GET /api/fidelite/<${serveur.fidelite.champ}>\` rend \`{ tampons, objectif, restant, recompenses, recompense }\`. Les récompenses données ne sont pas enregistrées : \`recompenses\` compte celles qui ont été gagnées.`]
      : []),
  ];
  if (serveur.inscriptionLibre) {
    lignes.push(`\nL'inscription libre : \`POST /auth/inscription\` (\`{ email, motDePasse, champs }\`, dix par heure et par adresse IP) crée un compte au rôle « ${serveur.inscriptionLibre.role} », qui ne se connecte qu'après \`POST /auth/confirmation\` (\`{ jeton }\`, le jeton du lien, valable 24 heures). La réponse est la même que l'adresse ait déjà un compte ou non ; une inscription jamais confirmée est vidée au bout de sept jours.`);
  }
  if (serveur.invitations || serveur.inscriptionLibre || serveur.motDePasseOublie) {
    lignes.push(`\nLes liens envoyés par e-mail ont besoin du serveur d'envoi (\`HUMALIS_EMAILS_HOTE\`, \`HUMALIS_EMAILS_PORT\`, \`HUMALIS_EMAILS_EXPEDITEUR\`) et de \`HUMALIS_ADRESSE_SITE\`. Le jeton est dans le fragment de l'adresse, le serveur n'en garde que l'empreinte, et il ne sert qu'une fois (\`src/humalis/comptes.ts\`).`);
  } else if (serveur.emails) {
    lignes.push(`\nLes e-mails partent par SMTP, vers le serveur d'envoi choisi dans le \`.env\` : \`HUMALIS_EMAILS_HOTE\`, \`HUMALIS_EMAILS_PORT\`, \`HUMALIS_EMAILS_EXPEDITEUR\`, et si besoin \`HUMALIS_EMAILS_UTILISATEUR\` et \`HUMALIS_EMAILS_MOT_DE_PASSE\` (\`src/humalis/emails.ts\`).`);
  }
  return lignes.length > 0 ? lignes.join('\n') + '\n' : '';
}

function lisezmoi(serveur: ServeurRI, options: OptionsServeur): string {
  const routes = serveur.routes
    .map((r) => `| \`${adresseApi(r.adresse)}\` | ${r.donnee} | ${decrireDroits(r.droits, r.conditions)} |`)
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
chaque donnée a sa table, ou sa collection dans une base de documents (\`${serveur.donnees.map((d) => nomTable(d.nom)).join('`, `')}\`).

## Les routes

| Adresse | Donnée | Qui peut quoi |
|---|---|---|
${routes}

Chaque adresse accepte \`GET\` (liste), \`GET /:id\`, \`POST\`, \`PATCH /:id\` et
\`DELETE /:id\`. Une action sans règle est refusée à tout le monde (403).

La liste se filtre par les champs de la donnée, comparés par égalité :
\`GET /api/…?champ=valeur\` (une autre clé est ignorée), et se découpe avec
\`?limite=20&depuis=40\`. Une lecture que tout le monde peut faire est gardée
30 secondes par le navigateur (\`Cache-Control: public\`, avec ETag) ; une
lecture réservée ne l'est jamais (\`private, no-store\`). Les réponses de plus
de 1 Ko partent compressées (brotli ou gzip).
Se connecter : \`POST /auth/login\` avec \`{ "email", "password" }\`.
${lisezmoiEnPlus(serveur)}${lisezmoiExploitation(serveur)}${LISEZMOI_EVOLUTION}
## La sécurité et ses mises à jour

Toute la sécurité vient des packs Astratra (\`@astratra/saas-kit\`,
\`@astratra/security\`, \`@astratra/store-postgres\`), à des versions
exactes. Pour savoir si ce projet est en retard sur ton Humalis :
\`humalis packs --verifier .\` ; pour passer aux nouvelles versions,
recompile ton programme. Pour les failles connues des autres
dépendances : \`npm audit\`.

\`npm run audit:deps\` (failles connues, il faut le package-lock.json) et
\`npm run audit:secrets\` (secrets écrits en dur dans un journal ou une réponse)
le disent aussi, avec un code de sortie pour une chaîne d'intégration.

## La session

Elle se renouvelle tant que la personne revient : sans venir pendant
\`HUMALIS_SESSION\` (3 jours), ou \`HUMALIS_SESSION_MAX\` (30 jours) après la
connexion même en revenant chaque jour, il faut se reconnecter. Le serveur vérifie
ces deux bornes (un jeton d'accès déjà délivré vit encore 15 minutes au plus).
Les jetons de renouvellement tournent à chaque usage : un jeton rejoué, la
déconnexion ou un changement de mot de passe ferment la session. Le navigateur les
reçoit dans un cookie HttpOnly limité à \`/auth\` ; la table
\`sessions_renouvellement\` n'en garde que l'empreinte.

## Facultatif : le coffre des clés

Sans cette variable, rien n'est chargé et le serveur marche pareil (\`.env.exemple\`).

- \`ENCRYPTION_KEY\` : les clés de service se rangent chiffrées dans la table
  \`coffre_cles\` (en mémoire sans \`DATABASE_URL\`) et se modifient sans redémarrer.
  Routes réservées à l'admin, avec le jeton CSRF : \`GET /auth/cles\` (jamais une valeur
  secrète, seulement ses 4 derniers caractères), \`PUT /auth/cles/:cle\` avec
  \`{ "value": "…" }\`, \`DELETE /auth/cles/:cle\`. La valeur du coffre passe avant le \`.env\`.

Ce dossier est réécrit à chaque compilation Humalis (fichier \`${MARQUE_SERVEUR}\`).
`;
}

/**
 * « connexion google » : la fenêtre de Google rend un jeton d'identité ; le pack de sécurité le
 * vérifie (signature, émetteur, destinataire, nonce). Seul un compte déjà connu du serveur, dont
 * Google confirme l'adresse, ouvre sa session — la même que /auth/login (issueSession).
 */
/** « changer le mot de passe » : celui du compte connecté, après vérification de l'actuel. */
const ROUTE_MOT_DE_PASSE = `
      // « changer le mot de passe » : le compte connecté donne l'actuel ; un nouveau trop faible est refusé.
      // Le limiteur compte les essais comme pour la connexion : on devine un secret.
      const routeMotDePasse = express.Router();
      routeMotDePasse.post('/', createLoginLimiter() as unknown as RequestHandler, authMiddleware, csrfMiddleware, async (req, res, next) => {
        try {
          const corps = (req.body ?? {}) as { actuel?: unknown; nouveau?: unknown };
          const actuel = typeof corps.actuel === 'string' ? corps.actuel : '';
          const nouveau = typeof corps.nouveau === 'string' ? corps.nouveau : '';
          const id = (req as unknown as { user?: { id?: unknown } }).user?.id;
          const compte = typeof id === 'string' ? await usersStore.findById(id) : null;
          if (!compte) {
            res.status(401).json({ erreur: 'connecte-toi de nouveau' });
            return;
          }
          if (typeof compte.passwordHash !== 'string' || !(await verifyPasswordHash(actuel, compte.passwordHash))) {
            res.status(403).json({ erreur: 'le mot de passe actuel est incorrect' });
            return;
          }
          if (!isStrongPassword(nouveau)) {
            res.status(400).json({ erreur: 'le nouveau mot de passe est trop faible : au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un signe' });
            return;
          }
          await usersStore.update(String(compte.id), { passwordHash: await hashPassword(nouveau) });
          // Celui qui change son mot de passe ferme peut-être la porte à un voleur : toutes les sessions de ce compte s'arrêtent, celle-ci repart.
          await renouvellement.revokeAllForUser(String(compte.id));
          res.json({ change: true, ...(await issueSession(res, compte)) });
        } catch (erreur) {
          next(erreur);
        }
      });
      app.use('/auth/mot-de-passe', routeMotDePasse);
`;

/**
 * « telecharger bon de … » : les mêmes gardes que la lecture de la route, et jamais gardé en cache,
 * même sur une route publique : c'est un fichier nominatif.
 */
/**
 * Le temps réel : une page qui lit une route « en direct » apprend qu'elle a changé.
 * Aucune donnée ne passe par ce canal : la page relit par la route normale, avec ses droits.
 */
function routeDirect(variable: string, garde: string, cle: string, separee?: { separation: string; regles: string }): string {
  // Une donnée séparée : chacun n'écoute que son groupe ; un admin écoute tout.
  if (separee) {
    return `      ${variable}.get('/direct', ${garde}, (req, res) => {
        const portee = porteeDe(moiDe(req), ${separee.separation}, ${separee.regles});
        if (!portee) {
          res.status(403).json({ erreur: REFUS_FICHES });
          return;
        }
        const groupe = ${separee.separation} ? portee.egal[${separee.separation}.champ] : undefined;
        direct.ecouter(groupe === undefined ? ${JSON.stringify(cle)} : ${JSON.stringify(cle + '|')} + groupe, req, res);
      });
`;
  }
  return `      ${variable}.get('/direct', ${garde}, (req, res) => direct.ecouter(${JSON.stringify(cle)}, req, res));
`;
}

/** Les données dont une route est « en cache » : leurs écritures vident les copies. */
const donneesEnCache = (serveur: ServeurRI): Set<string> => new Set(serveur.routes.filter((r) => r.cache !== undefined).map((r) => r.donnee));

/** Ce qu'un envoi réussi sur cette route doit annoncer : sa donnée, et celles qu'elle crée au passage. */
function clesAnnoncees(serveur: ServeurRI, route: ServeurRI['routes'][number]): string[] {
  const ecoutees = new Set(serveur.routes.filter((r) => r.direct || r.cache !== undefined).map((r) => r.donnee));
  return [...new Set([route.donnee, ...(route.creations ?? []).map((c) => c.donnee)])].filter((d) => ecoutees.has(d));
}

/** humalis/direct.ts : un seul serveur en mémoire, plusieurs serveurs par PostgreSQL. */
const DIRECT = String.raw`import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import type pg from 'pg';

/**
 * Produit par Humalis : le temps réel des pages qui lisent « en direct ».
 * Ce canal annonce seulement qu'une donnée a changé ; la page relit ensuite la route
 * normale, avec ses droits. Avec DATABASE_URL, l'annonce passe par PostgreSQL
 * (NOTIFY) : tous les exemplaires du serveur la reçoivent.
 */
const CANAL = 'humalis_direct';
const MAXIMUM = Number(process.env.HUMALIS_DIRECT_MAX ?? 10000);
const TAMPON = 64 * 1024;

const ecoutes = new Map<string, Set<Response>>();
let total = 0;
let pool: pg.Pool | null = null;
const enAttente = new Set<string>();
let minuteur: ReturnType<typeof setTimeout> | undefined;

/** Un client trop lent est fermé plutôt que de gonfler la mémoire : il se reconnectera et relira. */
function ecrire(res: Response, texte: string): void {
  if (res.writableLength > TAMPON) res.end();
  else res.write(texte);
}

/** Ce qui suit les annonces : le cache se vide (ici tout de suite, puis à la réception chez chacun). */
const suiveurs: { local: (cle: string) => void; distant: (cle: string) => void }[] = [];

function diffuser(cle: string): void {
  for (const suiveur of suiveurs) suiveur.distant(cle);
  for (const res of ecoutes.get(cle) ?? []) ecrire(res, 'data: change\n\n');
}

/** HUMALIS_CACHE_ADRESSE : Redis porte les annonces à tous les exemplaires ; s'il manque, la base reprend. */
let relais: { pret(): boolean; publier(canal: string, message: string): Promise<void> } | null = null;

function publier(): void {
  minuteur = undefined;
  const cles = [...enAttente];
  enAttente.clear();
  for (const cle of cles) {
    if (relais?.pret()) relais.publier(CANAL, cle).catch(() => (pool ? pool.query('SELECT pg_notify($1, $2)', [CANAL, cle]).catch(() => diffuser(cle)) : diffuser(cle)));
    else if (pool) pool.query('SELECT pg_notify($1, $2)', [CANAL, cle]).catch(() => diffuser(cle));
    else if (sonde) {
      // Ici tout de suite ; les autres exemplaires l'apprennent par la base, à leur prochain coup d'œil.
      diffuser(cle);
      sonde.publier(cle).catch(() => undefined);
    } else diffuser(cle);
  }
}

/** Une base sans écoute (MySQL, MariaDB, documents) : les annonces y sont écrites, et chacun les relit chaque seconde. */
export interface CanalSonde {
  publier(cle: string): Promise<void>;
  /** Les annonces des dernières secondes, chacune avec un numéro unique. */
  recentes(): Promise<{ numero: string; cle: string }[]>;
}
let sonde: CanalSonde | null = null;

/** Plusieurs envois rapprochés ne font qu'une annonce. */
function annoncer(cle: string): void {
  for (const suiveur of suiveurs) suiveur.local(cle);
  enAttente.add(cle);
  minuteur ??= setTimeout(publier, 100);
}

// Un seul battement pour tout le monde : le navigateur sait ainsi que la liaison vit encore.
setInterval(() => {
  for (const liste of ecoutes.values()) for (const res of liste) ecrire(res, 'event: present\ndata: 1\n\n');
}, 25000).unref();

export const direct = {
  /** Une écriture faite ailleurs qu'une route (action, tâche). */
  annonce: annoncer,

  /** Le cache suit les annonces : « local » pour celles faites ici, « distant » pour toutes celles reçues. */
  suivre(local: (cle: string) => void, distant: (cle: string) => void): void {
    suiveurs.push({ local, distant });
  },

  /** Redis (HUMALIS_CACHE_ADRESSE) : les annonces passent par lui, et celles qu'il apporte sont diffusées ici. */
  relayer(par: { pret(): boolean; publier(canal: string, message: string): Promise<void>; abonner(canal: string, faire: (message: string) => void): void }): void {
    relais = par;
    par.abonner(CANAL, diffuser);
  },

  ecouter(cle: string, req: Request, res: Response): void {
    if (total >= MAXIMUM) {
      res.status(503).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    res.write(': ouvert\n\n');
    const liste = ecoutes.get(cle) ?? new Set<Response>();
    ecoutes.set(cle, liste);
    liste.add(res);
    total++;
    req.on('close', () => {
      if (liste.delete(res)) total--;
      // Une clé par groupe : sans cela, chaque groupe déjà écouté laisserait une liste vide.
      if (liste.size === 0 && ecoutes.get(cle) === liste) ecoutes.delete(cle);
    });
  },

  /** Après un envoi réussi, annonce ces données. */
  apres(cles: string[]): RequestHandler {
    return (req, res, next) => {
      if (req.method !== 'GET') {
        res.on('finish', () => {
          if (res.statusCode >= 400) return;
          // Une donnée séparée : l'annonce va à son groupe et aux admins, jamais aux autres groupes.
          const groupe = res.locals.groupeDirect;
          for (const cle of cles) annoncer(typeof groupe === 'string' ? cle + '|' + groupe : cle);
          if (typeof groupe === 'string') for (const cle of cles) annoncer(cle);
        });
      }
      next();
    };
  },

  /** Plusieurs exemplaires du serveur : chacun écoute PostgreSQL. Une coupure fait relire tout le monde. */
  async brancher(base: pg.Pool): Promise<void> {
    pool = base;
    let dejaBranche = false;
    let essai: { jeton: string; recu: () => void } | null = null;
    const ecouterBase = async (): Promise<void> => {
      try {
        const client = await base.connect();
        client.on('notification', (message) => {
          if (essai !== null && message.payload === essai.jeton) return essai.recu();
          if (message.payload) diffuser(message.payload);
        });
        client.once('error', () => {
          client.release(true);
          setTimeout(() => void ecouterBase(), 2000);
        });
        await client.query('LISTEN ' + CANAL);
        if (dejaBranche) for (const cle of ecoutes.keys()) diffuser(cle);
        dejaBranche = true;
      } catch {
        setTimeout(() => void ecouterBase(), 2000);
      }
    };
    await ecouterBase();
    // Une annonce d'essai, sans retarder le démarrage : un relais de connexions en mode transaction l'avale sans
    // rien dire, et les autres exemplaires ne verraient jamais les changements.
    void (async () => {
      const jeton = 'humalis-essai-' + randomUUID();
      const revenue = await new Promise<boolean>((resoudre) => {
        const delai = setTimeout(() => resoudre(false), 5000);
        essai = { jeton, recu: () => { clearTimeout(delai); resoudre(true); } };
        base.query('SELECT pg_notify($1, $2)', [CANAL, jeton]).catch(() => { clearTimeout(delai); resoudre(false); });
      });
      essai = null;
      if (!revenue) {
        console.warn("Les annonces en direct ne reviennent pas de PostgreSQL : DATABASE_URL passe sans doute par un relais de connexions en mode transaction. Les autres exemplaires du serveur ne verront pas les changements en direct : donnez l'adresse directe de la base.");
      }
    })();
  },

  /** Plusieurs exemplaires sur une base sans écoute : chaque seconde, les annonces récentes sont relues. */
  sonder(canal: CanalSonde): void {
    sonde = canal;
    const vues = new Map<string, number>();
    const regarder = async (): Promise<void> => {
      try {
        const maintenant = Date.now();
        for (const { numero, cle } of await canal.recentes()) {
          if (vues.has(numero)) continue;
          vues.set(numero, maintenant);
          // Les annonces d'avant le démarrage ne concernent personne ici.
          if (premier) continue;
          diffuser(cle);
        }
        for (const [numero, quand] of vues) if (maintenant - quand > 60_000) vues.delete(numero);
        premier = false;
      } catch {
        // La base revient : on regardera au prochain coup.
      }
    };
    let premier = true;
    setInterval(() => void regarder(), 1000).unref();
    void regarder();
  },
};
`;

function routeBon(variable: string, route: ServeurRI['routes'][number], garde: string, schema: string, donnee: string, separee = false): string {
  const fichier = simplifier(route.donnee).replace(/_/g, '-');
  return `      ${variable}.get('/:id/bon', lecturePrivee, ${garde}, async (req, res, next) => {
        try {
${separee ? codeFicheVisible(variable, donnee, route.donnee, 'lire') : ''}          const trouve = ${separee ? 'visible' : `await stockages.${donnee}.trouver(String(req.params.id))`};
          if (!trouve) {
            res.status(404).json({ erreur: introuvable('${route.donnee}') });
            return;
          }
          const fichier = await creerBon({ boutique: BOUTIQUE, donnee: '${route.donnee}', schema: ${schema}, fiche: trouve });
          // L'identifiant vient de la base : ses seuls lettres et chiffres vont dans le nom du fichier.
          const court = String(trouve.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
          res.set('Content-Type', 'application/pdf');
          res.set('Content-Disposition', \`attachment; filename="bon-de-${fichier}-\${court}.pdf"\`);
          res.send(fichier);
        } catch (erreur) {
          next(erreur);
        }
      });
`;
}

/**
 * « fidelite par telephone de commande » : une lecture réservée à l'admin, car la valeur est un numéro
 * de téléphone. Aucune écriture : seul GET existe, et sans valeur il n'y a pas de liste.
 */
function routeFidelite(fidelite: NonNullable<ServeurRI['fidelite']>): string {
  const egal = `{ ${camel('statut')}: ${JSON.stringify(fidelite.statut)} }`;
  return `      // « fidelite par ${fidelite.champ} de ${fidelite.donnee} » : seul l'admin lit une carte ; personne n'y écrit.
      const routeFidelite = express.Router();
      routeFidelite.get('/:valeur', lecturePrivee, ...acces.seulAdmin, async (req, res, next) => {
        try {
          const numero = sansSeparateurs(String(req.params.valeur));
          if (numero === '') {
            res.status(400).json({ erreur: 'la valeur « ${fidelite.champ} » est vide' });
            return;
          }
          // Le stockage filtre lui-même : seules les fiches de ce client avec ce statut reviennent.
          const fiches = await stockages.${camel(fidelite.donnee)}.lister({ egal: ${egal}, numero: { champ: ${JSON.stringify(camel(fidelite.champ))}, valeur: numero } });
          res.json(carteDeFidelite(fiches.length, { parFiche: ${fidelite.tampons}, objectif: ${fidelite.objectif}, recompense: ${JSON.stringify(fidelite.recompense)} }));
        } catch (erreur) {
          next(erreur);
        }
      });
      app.use('/api/fidelite', routeFidelite);

`;
}

/**
 * Le PDF d'une fiche : le nom de la boutique, le titre, puis chaque champ en clair (sauf les images),
 * dans un tableau du pack @astratra/pdf qui ne coupe jamais une rangée entre deux pages.
 */
const BON = `import { drawTable, line, type PdfDocumentLike } from '@astratra/pdf';
import PDFDocument from 'pdfkit';
import type { Enregistrement } from './stockage.js';
import type { Schema, TypeChamp } from './verifier.js';

const MOIS_LONG = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });
const INSTANT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
/** Les polices de base du PDF n'ont pas les espaces fines de la mise en forme française. */
const espaces = (texte: string) => texte.replace(/[\\u00a0\\u202f]/g, ' ');

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);
/** « prix_avant » → « Prix avant » ; « prixAvant » (le nom gardé par le serveur) → pareil. */
const libelle = (nom: string) => majuscule(nom.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => \`\${a} \${b.toLowerCase()}\`));

function dateEnClair(valeur: string): string {
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return valeur;
  // Un jour sans heure reste ce jour-là, quel que soit le fuseau du serveur.
  return espaces(/^\\d{4}-\\d{2}-\\d{2}$/.test(valeur) ? MOIS_LONG.format(date) : INSTANT.format(date));
}

/** Une valeur lisible sur le papier ; une liste, une ligne par élément. */
export function enClair(type: TypeChamp, valeur: unknown): string {
  if (valeur === null || valeur === undefined || valeur === '') return '-';
  if (typeof type === 'object') return Array.isArray(valeur) && valeur.length > 0 ? valeur.map((v) => enClair(type.liste, v)).join('\\n') : '-';
  if (type === 'booleen') return valeur === true ? 'Oui' : 'Non';
  if (type === 'nombre' && typeof valeur === 'number') return espaces(valeur.toLocaleString('fr-FR'));
  if (type === 'date' && typeof valeur === 'string') return dateEnClair(valeur);
  return String(valeur);
}

const estImage = (type: TypeChamp): boolean => (typeof type === 'object' ? estImage(type.liste) : type === 'image');

/** Le document complet, en mémoire : une fiche tient en quelques pages. */
export function creerBon({ boutique, donnee, schema, fiche }: { boutique: string; donnee: string; schema: Schema; fiche: Enregistrement }): Promise<Buffer> {
  return new Promise((resoudre, rejeter) => {
    const titre = \`Bon de \${libelle(donnee).toLowerCase()}\`;
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: titre, Author: boutique } });
    const morceaux: Buffer[] = [];
    doc.on('data', (morceau: Buffer) => morceaux.push(morceau));
    doc.on('end', () => resoudre(Buffer.concat(morceaux)));
    doc.on('error', rejeter);

    const papier = doc as unknown as PdfDocumentLike;
    const largeur = doc.page.width - 100;
    doc.font('Helvetica').fontSize(11).fillColor('#555555');
    line(papier, boutique, 50, 50, largeur);
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111');
    line(papier, titre, 50, 68, largeur);
    doc.font('Helvetica').fontSize(10).fillColor('#555555');
    line(papier, \`N° \${String(fiche.id).slice(0, 8)}\`, 50, 96, largeur);

    const rangees = Object.entries(schema)
      .filter(([, type]) => !estImage(type))
      .map(([champ, type]) => ({ champ: libelle(champ), valeur: enClair(type, fiche[champ]) }));
    drawTable(papier, {
      x: 50,
      y: 122,
      width: largeur,
      columns: [
        { key: 'champ', label: 'Champ', width: 150 },
        { key: 'valeur', label: 'Valeur', wrap: true },
      ],
      rows: rangees,
      fontSize: 10,
      headerFontSize: 9,
      zebra: '#F7F7F7',
    });
    doc.end();
  });
}
`;

/**
 * La carte à tampons : le pack @astratra/loyalty compte le cycle en cours. La phrase ne fixe aucune durée :
 * aucun tampon ne se perd, tous les tampons du cycle portent donc le même jour.
 */
const FIDELITE = `import { createStampCard } from '@astratra/loyalty';

/** Produit par Humalis : la carte d'un client, recalculée à chaque lecture depuis ses fiches ; rien n'est stocké. */
const SANS_DUREE = '2000-01-01';

export interface RegleFidelite {
  parFiche: number;
  objectif: number;
  recompense: string;
}

export function carteDeFidelite(fiches: number, { parFiche, objectif, recompense }: RegleFidelite) {
  const total = fiches * parFiche;
  // Chaque récompense gagnée ferme un cycle : seul le reste compte sur la carte en cours.
  const reste = total % objectif;
  const etat = createStampCard({ threshold: objectif }).evaluate({ visits: Array.from({ length: reste }, () => ({ date: SANS_DUREE })) });
  return { tampons: etat.count, objectif, restant: etat.remaining, recompenses: Math.floor(total / objectif), recompense };
}
`;

/** Une fiche d'exemple, avec les valeurs valides de chaque champ. */
function ficheExemple(serveur: ServeurRI, nom: string): string {
  const donnee = serveur.donnees.find((d) => d.nom === nom)!;
  return `{ ${donnee.champs.map((c) => `${camel(c.nom)}: ${exempleDansLesBornes(c.type, c.bornes) ?? exempleChamp(c.type)}`).join(', ')} }`;
}

const ENTETE_TESTS = (stockages: string) => `import { beforeAll, describe, expect, it } from 'vitest';
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
const avec = (jeton: string) => ({ authorization: \`Bearer \${jeton}\` });

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
});
`;

/** Les tests produits du bon : les mêmes refus que la lecture de sa route, un vrai PDF, et un 404. */
function testsBon(serveur: ServeurRI): string {
  const stockages = serveur.donnees.map((d) => `  ${camel(d.nom)}: creerStockageMemoire(),`).join('\n');
  const blocs = serveur.routes.filter((r) => r.bon).map((route) => {
    const adresse = adresseApi(route.adresse);
    const refus = route.droits.lire === 'admin' || route.droits.lire?.startsWith('role:') ? [401, 403] : route.droits.lire === 'connecte' ? [401, 200] : [200, 200];
    return `describe('le bon de « ${route.donnee} »', () => {
  it('suit les droits de la lecture : visiteur ${refus[0]}, utilisateur ${refus[1]}', async () => {
    const fiche = await stockages.${camel(route.donnee)}.creer(${ficheExemple(serveur, route.donnee)});
    await request(app).get(\`${adresse}/\${fiche.id}/bon\`).expect(${refus[0]});
    await request(app).get(\`${adresse}/\${fiche.id}/bon\`).set(avec(jetonUtilisateur)).expect(${refus[1]});
  });

  it('rend un PDF à télécharger, jamais gardé en cache', async () => {
    const fiche = await stockages.${camel(route.donnee)}.creer(${ficheExemple(serveur, route.donnee)});
    const reponse = await request(app).get(\`${adresse}/\${fiche.id}/bon\`).set(avec(jetonAdmin)).buffer(true).parse((res, fin) => {
      const morceaux: Buffer[] = [];
      res.on('data', (m: Buffer) => morceaux.push(m));
      res.on('end', () => fin(null, Buffer.concat(morceaux)));
    }).expect(200);
    expect((reponse.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect(reponse.headers['content-type']).toContain('application/pdf');
    expect(reponse.headers['content-disposition']).toMatch(/^attachment; filename="bon-de-[a-z0-9-]+-[A-Za-z0-9]{1,8}\\.pdf"$/);
    expect(reponse.headers['cache-control']).toBe('private, no-store');
  });

  it('404 pour une fiche qui n\\'existe pas', async () => {
    await request(app).get('${adresse}/inconnue/bon').set(avec(jetonAdmin)).expect(404);
  });
});`;
  });
  return `// Produit par Humalis : « telecharger bon de … » du serveur « ${serveur.nom} ».
${ENTETE_TESTS(stockages)}
${blocs.join('\n\n')}
`;
}

/** Les tests produits de la carte : lecture réservée à l'admin, écritures impossibles, calcul sur de vraies fiches. */
function testsFidelite(serveur: ServeurRI): string {
  const fidelite = serveur.fidelite!;
  const stockages = serveur.donnees.map((d) => `  ${camel(d.nom)}: creerStockageMemoire(),`).join('\n');
  const stockage = `stockages.${camel(fidelite.donnee)}`;
  const fiche = (numero: string, statut: string) => `{ ...${ficheExemple(serveur, fidelite.donnee)}, ${camel(fidelite.champ)}: ${JSON.stringify(numero)}, statut: ${JSON.stringify(statut)} }`;
  const compte = fidelite.tampons * 2;
  const reste = compte % fidelite.objectif;
  return `// Produit par Humalis : « fidelite par ${fidelite.champ} de ${fidelite.donnee} » du serveur « ${serveur.nom} ».
${ENTETE_TESTS(stockages)}
describe('la carte de fidélité', () => {
  it('seul l\\'admin la lit : visiteur 401, utilisateur 403', async () => {
    await request(app).get('/api/fidelite/111').expect(401);
    await request(app).get('/api/fidelite/111').set(avec(jetonUtilisateur)).expect(403);
    await request(app).get('/api/fidelite/111').set(avec(jetonAdmin)).expect(200);
  });

  it('jamais gardée en cache, et personne n\\'y écrit', async () => {
    const reponse = await request(app).get('/api/fidelite/111').set(avec(jetonAdmin));
    expect(reponse.headers['cache-control']).toBe('private, no-store');
    for (const methode of ['post', 'patch', 'put', 'delete'] as const) {
      const ecriture = await request(app)[methode]('/api/fidelite/111').set(avec(jetonAdmin)).send({});
      expect(ecriture.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('compte les fiches de ce statut, quelle que soit l\\'écriture du numéro', async () => {
    await ${stockage}.creer(${fiche('+243 848-000', fidelite.statut)});
    await ${stockage}.creer(${fiche('243848000', fidelite.statut)});
    await ${stockage}.creer(${fiche('243848000', `pas-${fidelite.statut}`)});
    await ${stockage}.creer(${fiche('999', fidelite.statut)});
    const reponse = await request(app).get('/api/fidelite/' + encodeURIComponent('+243 848 000')).set(avec(jetonAdmin)).expect(200);
    expect(reponse.body).toEqual({
      tampons: ${reste},
      objectif: ${fidelite.objectif},
      restant: ${fidelite.objectif - reste},
      recompenses: ${Math.floor(compte / fidelite.objectif)},
      recompense: ${JSON.stringify(fidelite.recompense)},
    });
  });
});
`;
}

const ROUTE_APPLE = `
      // « connexion apple » : un compte déjà connu du serveur, dont Apple confirme l'adresse, ouvre sa session.
      // La première connexion lie le compte à cet identifiant Apple ; un autre compte Apple portant la même adresse est refusé.
      let verificateurApple: { cle: string; verifier: ReturnType<typeof createAppleIdTokenVerifier> } | null = null;
      const appleDuServeur = () => {
        const { application, site } = identifiantsApple();
        const audiences = [application, site].filter((id): id is string => Boolean(id));
        if (audiences.length === 0) return null;
        const cle = audiences.join('|');
        if (verificateurApple?.cle !== cle) verificateurApple = { cle, verifier: createAppleIdTokenVerifier({ audiences }) };
        return verificateurApple.verifier;
      };
      const routeApple = express.Router();
      routeApple.get('/', (_req, res) => {
        res.json({ clientId: identifiantsApple().site ?? null });
      });
      // Sur Android, Apple renvoie la personne ici (« form_post ») ; le serveur la renvoie dans l'application
      // par son lien profond, réglé dans APPLE_RETOUR_ANDROID. Rien n'est ouvert ici : l'application vérifie
      // son « state », puis envoie le jeton à POST /auth/apple, qui le vérifie comme les autres.
      routeApple.post('/retour', express.urlencoded({ extended: false, limit: '16kb' }) as unknown as RequestHandler, (req, res) => {
        const retour = process.env.APPLE_RETOUR_ANDROID ?? '';
        const schema = retour.split(':')[0] ?? '';
        if (!/^[a-z][a-z0-9+.-]*$/i.test(schema) || retour !== schema + '://connexion-apple' || /^(https?|javascript|data|file|content|intent)$/i.test(schema)) {
          res.status(404).json({ erreur: "le retour vers l'application Android n'est pas réglé sur ce serveur (APPLE_RETOUR_ANDROID)" });
          return;
        }
        const corps = (req.body ?? {}) as { id_token?: unknown; state?: unknown };
        const etat = typeof corps.state === 'string' ? corps.state.slice(0, 200) : '';
        const jeton = typeof corps.id_token === 'string' ? corps.id_token.slice(0, 8000) : '';
        res.redirect(303, retour + '?etat=' + encodeURIComponent(etat) + '#jeton=' + encodeURIComponent(jeton));
      });
      routeApple.post('/', createLoginLimiter() as unknown as RequestHandler, csrfMiddleware, async (req, res, next) => {
        const apple = appleDuServeur();
        if (!apple) {
          res.status(503).json({ erreur: "la connexion avec Apple n'est pas réglée sur ce serveur (APPLE_APP_ID ou APPLE_SERVICE_ID)" });
          return;
        }
        try {
          const corps = (req.body ?? {}) as { idToken?: unknown; nonce?: unknown };
          const profil = await apple(String(corps.idToken ?? ''), typeof corps.nonce === 'string' ? { nonce: corps.nonce } : undefined);
          if (!profil.email || !profil.emailVerified) {
            res.status(403).json({ erreur: "Apple n'a pas confirmé l'adresse de ce compte" });
            return;
          }
          const compte = await usersStore.findByEmail(profil.email);
          if (!compte) {
            res.status(403).json({ erreur: profil.relayEmail ? "Apple a masqué votre adresse : reconnectez-vous en partageant votre adresse réelle" : "ce compte Apple n'a pas accès à l'application" });
            return;
          }
          const lieA = (compte as Record<string, unknown>).appleSubject;
          if (typeof lieA === 'string' && lieA !== profil.subject) {
            res.status(403).json({ erreur: 'cette adresse est déjà liée à un autre compte Apple' });
            return;
          }
          const lie = lieA === profil.subject ? compte : ((await usersStore.update(String(compte.id), { appleSubject: profil.subject } as never)) ?? compte);
          res.json(await issueSession(res, lie));
        } catch (erreur) {
          if (erreur instanceof IdTokenError) {
            res.status(401).json({ erreur: "la connexion avec Apple n'a pas pu être vérifiée" });
            return;
          }
          next(erreur);
        }
      });
      app.use('/auth/apple', routeApple);
`;

/**
 * « inscription libre » avec « connexion google » ou « connexion apple » : une adresse inconnue que le fournisseur
 * confirme crée un compte au rôle de la phrase ; une inscription en attente s'ouvre, sans le mot de passe choisi.
 */
function avecInscriptionParFournisseur(serveur: ServeurRI, code: string): string {
  if (!serveur.inscriptionLibre || !code) return code;
  let resultat = code;
  for (const [fournisseur, lien] of [['Google', 'googleSubject'], ['Apple', 'appleSubject']] as const) {
    const lecture = `          const compte = await usersStore.findByEmail(profil.email);\n          if (!compte) {\n            res.status(403).json({ erreur: ${fournisseur === 'Google' ? '"ce compte Google' : 'profil.relayEmail'}`;
    if (!resultat.includes(lecture)) continue;
    resultat = resultat.replace(lecture, lecture.replace('const compte = await usersStore.findByEmail(profil.email);', `const trouve = (await usersStore.findByEmail(profil.email)) ?? (await comptes.compteParFournisseur(profil.email, '${lien}', profil.subject));\n          const compte = trouve ? await comptes.ouvrirParFournisseur(trouve) : null;`));
  }
  return resultat;
}

const ROUTE_GOOGLE = `
      // « connexion google » : un compte déjà connu du serveur, dont Google confirme l'adresse, ouvre sa session.
      // La première connexion lie le compte à cet identifiant Google (le « sub »),
      // et un autre compte Google portant la même adresse est ensuite refusé.
      // L'ID client se relit à chaque demande : le changer dans le coffre sert aussitôt, sans redémarrer.
      const idGoogle = () => (typeof googleClientId === 'function' ? googleClientId() : googleClientId) || null;
      let verificateur: { id: string; verifier: ReturnType<typeof createGoogleIdTokenVerifier> } | null = null;
      const verificateurGoogle = () => {
        const audiences = [idGoogle(), googleClientIdApple()].filter((id): id is string => Boolean(id));
        if (audiences.length === 0) return null;
        const id = audiences.join('|');
        if (verificateur?.id !== id) verificateur = { id, verifier: createGoogleIdTokenVerifier({ audiences }) };
        return verificateur.verifier;
      };
      const routeGoogle = express.Router();
      routeGoogle.get('/', (_req, res) => {
        res.json({ clientId: idGoogle(), clientIdApple: googleClientIdApple() ?? null });
      });
      routeGoogle.post('/', createLoginLimiter() as unknown as RequestHandler, csrfMiddleware, async (req, res, next) => {
        const google = verificateurGoogle();
        if (!google) {
          res.status(503).json({ erreur: "la connexion avec Google n'est pas réglée sur ce serveur (GOOGLE_CLIENT_ID)" });
          return;
        }
        try {
          const corps = (req.body ?? {}) as { idToken?: unknown; nonce?: unknown };
          const profil = await google(String(corps.idToken ?? ''), typeof corps.nonce === 'string' ? { nonce: corps.nonce } : undefined);
          if (!profil.email || !profil.emailVerified) {
            res.status(403).json({ erreur: "Google n'a pas confirmé l'adresse de ce compte" });
            return;
          }
          const compte = await usersStore.findByEmail(profil.email);
          if (!compte) {
            res.status(403).json({ erreur: "ce compte Google n'a pas accès à l'application" });
            return;
          }
          if (typeof compte.googleSubject === 'string' && compte.googleSubject !== profil.subject) {
            res.status(403).json({ erreur: 'cette adresse est déjà liée à un autre compte Google' });
            return;
          }
          const lie = compte.googleSubject === profil.subject ? compte : ((await usersStore.update(String(compte.id), { googleSubject: profil.subject })) ?? compte);
          res.json(await issueSession(res, lie));
        } catch (erreur) {
          if (erreur instanceof IdTokenError) {
            res.status(401).json({ erreur: "la connexion avec Google n'a pas pu être vérifiée" });
            return;
          }
          next(erreur);
        }
      });
      app.use('/auth/google', routeGoogle);
`;

/**
 * Les passerelles des sources à jeton secret : le navigateur appelle « /api/passerelle/<source>/… »,
 * le serveur vérifie qui peut, ajoute le secret lu dans l'environnement, puis appelle l'API.
 * Le secret n'est écrit nulle part dans le code produit.
 */
function codePasserelles(serveur: ServeurRI): string {
  const passerelles = serveur.passerelles ?? [];
  if (passerelles.length === 0) return '';
  const blocs = passerelles.map((p) => {
    const variable = `passerelle${pascal(p.source)}`;
    const relais = `relais${pascal(p.source)}`;
    const base = `process.env.HUMALIS_SOURCE_${simplifier(p.source).toUpperCase()} ?? ${JSON.stringify(p.adresse.replace(/\/+$/, ''))}`;
    const garde = (qui: QuiPeut | null) => (qui === null ? 'refuse' : `...acces.${gardeDe(qui)}`);
    const lignes = p.routes.flatMap((r) => {
      const chemin = `/${r.adresse.replace(/^\/+/, '')}`;
      const avecId = chemin.includes(':id') ? chemin : `${chemin.replace(/\/+$/, '')}/:id`;
      const sansId = chemin.replace(/\/:id$/, '');
      return [
        `      ${variable}.get(${JSON.stringify(sansId)}, lecturePrivee, ${garde(r.droits.lire)}, ${relais});`,
        `      ${variable}.get(${JSON.stringify(avecId)}, lecturePrivee, ${garde(r.droits.lire)}, ${relais});`,
        `      ${variable}.post(${JSON.stringify(sansId)}, ${garde(r.droits.creer)}, csrfMiddleware, ${relais});`,
        `      ${variable}.${r.remplacement ? 'put' : 'patch'}(${JSON.stringify(avecId)}, ${garde(r.droits.modifier)}, csrfMiddleware, ${relais});`,
        `      ${variable}.delete(${JSON.stringify(avecId)}, ${garde(r.droits.supprimer)}, csrfMiddleware, ${relais});`,
      ];
    });
    return `      // La passerelle de la source « ${p.source} » : le secret ${p.variable} reste sur le serveur.
      const ${variable} = express.Router();
      const ${relais} = relayerVersSource({ base: ${base}, variable: ${JSON.stringify(p.variable)}, place: ${JSON.stringify(p.place)}, entetes: ${JSON.stringify(Object.fromEntries(p.entetes.map((e) => [e.nom, e.valeur])))}${p.cache !== undefined ? `, cache: { espace: ${JSON.stringify('source:' + p.source)}, secondes: ${p.cache} }` : ''} });
${lignes.join('\n')}
      app.use(${JSON.stringify(`/api/passerelle/${encodeURIComponent(p.source)}`)}, ${variable});`;
  });
  return `
      // Relaie un appel vers une API, avec le secret lu dans l'environnement du serveur.
      function relayerVersSource(config: { base: string; variable: string; place: { genre: 'autorisation' } | { genre: 'entete' | 'parametre'; nom: string }; entetes: Record<string, string>${passerelles.some((p) => p.cache !== undefined) ? '; cache?: { espace: string; secondes: number }' : ''} }): RequestHandler {
        return async (req, res, next) => {
          try {${passerelles.some((p) => p.cache !== undefined) ? `
            // « en cache pendant … » : une lecture déjà faite pour quelqu'un sert à tout le monde ; l'API n'est pas rappelée.
            const lecture = config.cache && req.method === 'GET' ? await cacheHumalis.relire(config.cache.espace, req.originalUrl) : undefined;
            if (lecture?.copie !== undefined) {
              const copie = JSON.parse(lecture.copie) as { type: string; corps: string };
              res.status(200).set('X-Humalis-Cache', 'garde').type(copie.type).send(copie.corps);
              return;
            }` : ''}
            const secret = process.env[config.variable];
            if (!secret) {
              res.status(503).json({ erreur: "Ce service n'est pas encore réglé sur le serveur." });
              return;
            }
            const url = new URL(config.base + req.path);
            for (const [cle, valeur] of Object.entries(req.query)) if (typeof valeur === 'string') url.searchParams.set(cle, valeur);
            const entetes = new Headers({ accept: 'application/json', ...config.entetes });
            if (config.place.genre === 'autorisation') entetes.set('authorization', \`Bearer \${secret}\`);
            else if (config.place.genre === 'entete') entetes.set(config.place.nom, secret);
            else url.searchParams.set(config.place.nom, secret);
            const avecCorps = !['GET', 'HEAD', 'DELETE'].includes(req.method);
            if (avecCorps) entetes.set('content-type', 'application/json');
            const reponse = await fetch(url, { method: req.method, headers: entetes, body: avecCorps ? JSON.stringify(req.body ?? {}) : undefined, redirect: 'follow', signal: AbortSignal.timeout(15000) });
            const texte = await reponse.text();
            // Une API qui renvoie sa clé dans sa réponse : la réponse ne part pas, et ne se garde pas.
            if (secret.length >= 8 && texte.includes(secret)) {
              res.status(502).json({ erreur: "La réponse de l'API contenait sa clé : elle n'est pas transmise." });
              return;
            }${passerelles.some((p) => p.cache !== undefined) ? `
            if (config.cache && lecture?.lue && reponse.status === 200) void cacheHumalis.garder(config.cache.espace, req.originalUrl, JSON.stringify({ type: reponse.headers.get('content-type') ?? 'application/json', corps: texte }), config.cache.secondes, lecture.lue);
            // Une écriture par la passerelle : les lectures gardées de la source ne servent plus, ici et ailleurs.
            if (config.cache && req.method !== 'GET') await cacheHumalis.viderPartout(config.cache.espace);` : ''}
            res.status(reponse.status).type(reponse.headers.get('content-type') ?? 'application/json').send(texte);
          } catch (erreur) {
            next(erreur);
          }
        };
      }

${blocs.join('\n\n')}
`;
}

/**
 * Au démarrage : les fiches déjà écrites suivent la donnée telle qu'elle est déclarée aujourd'hui
 * (un champ ajouté reçoit sa valeur « au depart », un champ renommé garde sa valeur), puis
 * « donnees de depart pour … » remplit une table vide. Rien n'est jamais effacé.
 */
function codeEvolutionEtDeparts(serveur: ServeurRI): string {
  const lignes: string[] = [];
  for (const d of serveur.donnees) {
    const table = nomTable(d.nom);
    const renommes = d.champs.filter((c) => c.avant !== undefined).map((c) => [camel(c.nom), camel(c.avant!)] as const);
    const defauts = d.champs.flatMap((c) => (c.regle?.genre === 'depart' && c.regle.valeur.genre === 'valeur' ? [[camel(c.nom), c.regle.valeur.valeur] as const] : []));
    if (renommes.length === 0 && defauts.length === 0) continue;
    const requetes = [
      `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data JSONB NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())`,
      ...renommes.map(([nouveau, ancien]) => `UPDATE ${table} SET data = (data - '${ancien}') || jsonb_build_object('${nouveau}', data->'${ancien}') WHERE data ? '${ancien}' AND NOT data ? '${nouveau}'`),
      ...defauts.map(([champ, valeur]) => `UPDATE ${table} SET data = data || '${JSON.stringify({ [champ]: valeur }).replace(/'/g, "''")}'::jsonb WHERE NOT data ? '${champ}'`),
    ];
    const chemin = (champ: string) => `'$."${champ.replace(/["'\\]/g, '')}"'`;
    const pourSqlite = [
      ...renommes.map(([nouveau, ancien]) => `  await sqlite.query(${JSON.stringify(`UPDATE ${table} SET data = json_remove(json_set(data, ${chemin(nouveau)}, json(data -> ${chemin(ancien)})), ${chemin(ancien)}) WHERE json_type(data, ${chemin(ancien)}) IS NOT NULL AND json_type(data, ${chemin(nouveau)}) IS NULL`)});`),
      ...defauts.map(([champ, valeur]) => `  await sqlite.query(${JSON.stringify(`UPDATE ${table} SET data = json_set(data, ${chemin(champ)}, json($1)) WHERE json_type(data, ${chemin(champ)}) IS NULL`)}, [${JSON.stringify(JSON.stringify(valeur))}]);`),
    ];
    // MySQL et MariaDB : JSON_SET reçoit la valeur lue (ou donnée) en JSON, jamais en texte.
    const pourMysql = [
      ...renommes.map(([nouveau, ancien]) => `  await mysql.natif(${JSON.stringify(`UPDATE ${table} SET data = JSON_REMOVE(JSON_SET(data, ?, JSON_EXTRACT(data, ?)), ?) WHERE JSON_CONTAINS_PATH(data, 'one', ?) AND NOT JSON_CONTAINS_PATH(data, 'one', ?)`)}, [cheminJson(${JSON.stringify(nouveau)}), cheminJson(${JSON.stringify(ancien)}), cheminJson(${JSON.stringify(ancien)}), cheminJson(${JSON.stringify(ancien)}), cheminJson(${JSON.stringify(nouveau)})]);`),
      ...defauts.map(([champ, valeur]) => `  await mysql.natif(${JSON.stringify(`UPDATE ${table} SET data = JSON_SET(data, ?, JSON_EXTRACT(?, '$')) WHERE NOT JSON_CONTAINS_PATH(data, 'one', ?)`)}, [cheminJson(${JSON.stringify(champ)}), ${JSON.stringify(JSON.stringify(valeur))}, cheminJson(${JSON.stringify(champ)})]);`),
    ];
    // Une base de documents : $rename garde la valeur telle quelle, $set donne la valeur de départ aux fiches qui n'ont pas le champ.
    const pourDocuments = [
      ...renommes.map(([nouveau, ancien]) => `  await documents.collection('${table}').updateMany(${JSON.stringify({ [`data.${ancien}`]: { $exists: true }, [`data.${nouveau}`]: { $exists: false } })}, ${JSON.stringify({ $rename: { [`data.${ancien}`]: `data.${nouveau}` } })});`),
      ...defauts.map(([champ, valeur]) => `  await documents.collection('${table}').updateMany(${JSON.stringify({ [`data.${champ}`]: { $exists: false } })}, ${JSON.stringify({ $set: { [`data.${champ}`]: valeur } })});`),
    ];
    lignes.push(`// « ${d.nom} » : les fiches déjà écrites suivent la donnée d'aujourd'hui (champ renommé, champ ajouté).
if (pool) {
${requetes.map((r) => `  await pool.query(${JSON.stringify(r)});`).join('\n')}
} else if (sqlite) {
  await preparerTableSqlite(sqlite, '${table}');
${pourSqlite.join('\n')}
} else if (mysql) {
  await preparerTableMysql(mysql, '${table}');
${pourMysql.join('\n')}
} else if (documents) {
  await preparerCollection(documents, '${table}')();
${pourDocuments.join('\n')}
}`);
  }
  for (const depart of serveur.departs ?? []) {
    // Les champs « au depart » non donnés prennent leur valeur de départ, comme à une création.
    const donnee = serveur.donnees.find((d) => d.nom === depart.donnee);
    const defauts = Object.fromEntries((donnee?.champs ?? []).flatMap((c) => (c.regle?.genre === 'depart' && c.regle.valeur.genre === 'valeur' ? [[camel(c.nom), c.regle.valeur.valeur]] : [])));
    const fiches = depart.fiches.map((f) => ({ ...defauts, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [camel(k), v])) }));
    lignes.push(`// « donnees de depart pour ${depart.donnee} » : seulement si la table est vide.
if ((await stockages.${camel(depart.donnee)}.lister({ egal: {}, limite: 1 })).length === 0) {
  for (const fiche of ${JSON.stringify(fiches)}) await stockages.${camel(depart.donnee)}.creer(fiche);
}`);
  }
  return lignes.length ? `\n${lignes.join('\n\n')}\n` : '';
}
