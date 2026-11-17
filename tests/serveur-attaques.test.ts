import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { BASES, surBase } from './aide-bases.js';
import { installerSiBesoin } from './aide-installation.js';

/**
 * Des attaques rejouées sur un VRAI serveur produit (revue du 12 novembre 2026) : chaque champ que seul le serveur
 * écrit reste hors d'atteinte d'une requête, à la création comme à la modification, sans casser les usages permis
 * (un admin corrige un total, un gérant encaisse une facture à la main, le webhook marque payé).
 */
const SOURCE = readFileSync(new URL('./serveur-attaques.humalis', import.meta.url), 'utf8');

const SCENARIO = `
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';

process.env.HUMALIS_PAIEMENT_ADRESSE ??= 'http://127.0.0.1:9/relais';
process.env.HUMALIS_PAIEMENT_SECRET ??= 'secret-du-relais-de-paiement-essai-0123456789';
process.env.HUMALIS_ADRESSE_SITE ??= 'https://essai.test';
const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
await usersStore.create({ email: 'admin@essai.test', role: 'admin', passwordHash });
const awa = await usersStore.create({ email: 'awa@essai.test', role: 'user', passwordHash });
const bob = await usersStore.create({ email: 'bob@essai.test', role: 'user', passwordHash });
await usersStore.create({ email: 'gerant@essai.test', role: 'gerant', passwordHash });
const stockages = { produit: creerStockageMemoire(), secret: creerStockageMemoire(), facture: creerStockageMemoire(), reservation: creerStockageMemoire(), journal: creerStockageMemoire(), article: creerStockageMemoire() };
// Ce que le serveur écrit dans son journal (un paiement reçu mais non enregistré y est dit).
const signalees = [];
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages });
const ecoute = app.listen(0);
await new Promise((pret) => ecoute.once('listening', pret));
const base = 'http://127.0.0.1:' + ecoute.address().port;
const json = { 'content-type': 'application/json' };
const jeton = async (email) => (await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email, password: secret }) })).json()).data.token;
const qui = async (email) => ({ ...json, authorization: 'Bearer ' + (await jeton(email)) });
const [admin, a, b, gerant] = [await qui('admin@essai.test'), await qui('awa@essai.test'), await qui('bob@essai.test'), await qui('gerant@essai.test')];
const envoyer = async (methode, chemin, entetes, corps) => {
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};
await stockages.produit.creer({ nom: 'coupe', prix: 20 });
const secretAwa = await envoyer('POST', '/api/secrets', a, { texte: 'à Awa' });
const resa = await envoyer('POST', '/api/reservations', a, { nom: 'coupe', refs: [], frais: 5 });
const facture = await envoyer('POST', '/api/factures', gerant, { montant: 30 });
const r = {
  secretAwa, resa, facture,
  deplacerSecret: await envoyer('PATCH', '/api/secrets/' + secretAwa.corps.id, a, { compte: String(bob.id) }),
  secretsDeBob: await envoyer('GET', '/api/secrets', b),
  payerSansPayer: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { paye: true }),
  adminPayerSansPayer: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, admin, { paye: true }),
  totalParAuteur: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { total: 0 }),
  totalParAdmin: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, admin, { total: 7 }),
  auteurChange: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { auteur: String(bob.id) }),
  fraisTropHauts: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { frais: 5000 }),
  fraisNegatifs: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { frais: -5000 }),
  fraisPermis: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { frais: 15 }),
  factureEncaissee: await envoyer('PATCH', '/api/factures/' + facture.corps.id, gerant, { paye: true }),
  champHerite: await envoyer('POST', '/api/secrets', a, { texte: 'x', toString: 'y' }),
  champConstructeur: await envoyer('PATCH', '/api/secrets/' + secretAwa.corps.id, a, { hasOwnProperty: 1 }),
  jsonCasse: await (async () => { const reponse = await fetch(base + '/api/secrets', { method: 'POST', headers: a, body: '{"texte":' }); return { statut: reponse.status, corps: await reponse.json().catch(() => null) }; })(),
};
// Le pare-feu (S12) : un refus dit quoi et où ; « adresses » laisse passer les textes, jamais les injections SQL.
r.scriptRefuse = await envoyer('POST', '/api/secrets', a, { texte: 'Voici <script>alert(1)</script>' });
r.gabaritRefuse = await envoyer('POST', '/api/secrets', a, { texte: 'prix : \${7*7}' });
r.adresseRefusee = await envoyer('GET', '/api/secrets?x=../../../../etc/passwd', a);
r.sqlRefuse = await envoyer('POST', '/api/secrets', a, { texte: "x' UNION SELECT password FROM users" });
process.env.HUMALIS_PARE_FEU = 'adresses';
const ecouteLibre = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages }).listen(0);
await new Promise((pret) => ecouteLibre.once('listening', pret));
delete process.env.HUMALIS_PARE_FEU;
const versLibre = async (methode, chemin, corps) => {
  const reponse = await fetch('http://127.0.0.1:' + ecouteLibre.address().port + chemin, { method: methode, headers: a, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};
r.scriptLibre = await versLibre('POST', '/api/secrets', { texte: 'Voici <script>alert(1)</script> et \${7*7}, ../../../../etc/passwd, eval(x)' });
r.sqlToujoursRefuse = await versLibre('POST', '/api/secrets', { texte: "x' UNION SELECT password FROM users" });
r.adresseToujoursRefusee = await versLibre('GET', '/api/secrets?x=<script>alert(1)</script>');
ecouteLibre.close();
// La santé : sans session, sans cache, et rien d'autre que l'état.
const sante = await fetch(base + '/sante');
r.sante = { statut: sante.status, corps: { ...(await sante.json()), cache: sante.headers.get('cache-control') } };
// Les limites sur les valeurs (S7) : à la création, à la modification, et celles par défaut.
const bon = { nom: 'Stylo', prix: 3, stock: 10, contact: 'a@essai.test', statut: 'brouillon', photos: ['/a.png'], note: 'ok' };
const article = await envoyer('POST', '/api/articles', a, bon);
const refuse = async (changement) => (await envoyer('POST', '/api/articles', a, { ...bon, ...changement }));
r.article = article;
r.limitesALaCreation = { statut: 0, corps: {
  prixNegatif: await refuse({ prix: -1 }), prixTropHaut: await refuse({ prix: 1001 }), stockAVirgule: await refuse({ stock: 1.5 }), stockNegatif: await refuse({ stock: -1 }),
  nomCourt: await refuse({ nom: 'S' }), nomLong: await refuse({ nom: 'S'.repeat(21) }), contactFaux: await refuse({ contact: 'pas une adresse' }), statutInconnu: await refuse({ statut: 'vole' }),
  tropDePhotos: await refuse({ photos: ['/a.png', '/b.png', '/c.png'] }), noteImmense: await refuse({ note: 'n'.repeat(10001) }),
} };
r.limitesExactes = { statut: 0, corps: { bas: (await refuse({ prix: 0, nom: 'St', stock: 0 })).statut, haut: (await refuse({ prix: 1000, nom: 'S'.repeat(20), note: 'n'.repeat(10000) })).statut } };
r.limitesALaModification = { statut: 0, corps: {
  prixNegatif: await envoyer('PATCH', '/api/articles/' + article.corps.id, a, { prix: -1 }),
  statutInconnu: await envoyer('PATCH', '/api/articles/' + article.corps.id, a, { statut: 'vole' }),
  noteImmense: await envoyer('PATCH', '/api/articles/' + article.corps.id, a, { note: 'n'.repeat(10001) }),
  permis: await envoyer('PATCH', '/api/articles/' + article.corps.id, a, { prix: 4, statut: 'en_vente' }),
} };
// Un paiement confirmé par le relais dont le montant n'est pas celui de la fiche : jamais passé sous silence.
const { createHmac } = await import('node:crypto');
const webhook = async (montant) => {
  const corps = JSON.stringify({ evenement: 'paye', reference: Buffer.from(JSON.stringify(['reservation', String(resa.corps.id), 'total'])).toString('base64url'), montant: montant, devise: 'eur' });
  const t = Math.floor(Date.now() / 1000);
  const reponse = await fetch(base + '/paiements/webhook', { method: 'POST', headers: { ...json, 'x-humalis-signature': 't=' + t + ',v1=' + createHmac('sha256', process.env.HUMALIS_PAIEMENT_SECRET).update(t + '.' + corps).digest('hex') }, body: corps });
  return { statut: reponse.status, corps: { ...(await stockages.reservation.trouver(resa.corps.id)) } };
};
const silence = console.error; console.error = (...morceaux) => { const ligne = morceaux.map(String).join(' '); if (ligne.includes('paiement de')) signalees.push(ligne); };
r.paiementMauvaisMontant = await webhook(500);
r.paiementBonMontant = await webhook(700);
r.paiementRejoue = await webhook(700);
console.error = silence;
r.journalApresPaiement = { statut: 0, corps: { lignes: (await stockages.journal.lister()).length } };
r.paiementSignale = { statut: 0, corps: { signalees } };
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

type Reponse = { statut: number; corps: Record<string, unknown> };
let r: Record<string, Reponse>;
let produits = '';

describe.each(BASES)('des attaques sur un vrai serveur produit, %s', (_nom, base) => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const dossier = join(tmpdir(), 'humalis-attaques');
    rmSync(join(dossier, 'src'), { recursive: true, force: true });
    rmSync(join(dossier, 'dist'), { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'attaques', source: 'attaques.humalis' })) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    // Les mêmes attaques sur les deux bases : en mémoire, puis dans SQLite.
    writeFileSync(join(dossier, 'scenario.mjs'), surBase(SCENARIO, base));
    installerSiBesoin(dossier);
    execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
    r = JSON.parse(execFileSync('node', ['scenario.mjs'], { cwd: dossier, encoding: 'utf8' }).trim().split('\n').at(-1)!);
    // Les tests que le compilateur écrit dans le serveur (règles, sessions, attaques) : lancés pour de vrai.
    try {
      // Dans l'intégration continue, la sortie est en couleurs : on les retire avant de la relire.
      produits = execFileSync('npx', ['vitest', 'run', '--dir', 'tests'], { cwd: dossier, encoding: 'utf8', stdio: 'pipe' }).replace(/\u001b\[[0-9;]*m/g, '');
    } catch (erreur) {
      produits = String((erreur as { stdout?: unknown }).stdout ?? erreur);
    }
  }, 300_000);

  it('le pare-feu dit en français ce qu’il refuse, et dans quel champ (S12)', () => {
    expect(r.scriptRefuse!.statut).toBe(403);
    expect(String(r.scriptRefuse!.corps.erreur)).toBe('le champ « texte » contient « <script> », que le serveur refuse par sécurité');
    expect(r.gabaritRefuse!.statut).toBe(403);
    expect(String(r.gabaritRefuse!.corps.erreur)).toMatch(/^le champ « texte » contient « \$\{7\*7\} »/);
    expect(r.adresseRefusee!.statut).toBe(403);
    expect(String(r.adresseRefusee!.corps.erreur)).toMatch(/^cette adresse est refusée par sécurité/);
    expect(r.sqlRefuse!.statut).toBe(403);
    expect(String(r.sqlRefuse!.corps.erreur)).toMatch(/^le champ « texte » contient « ' UNION SELECT/);
  });

  it('HUMALIS_PARE_FEU=adresses : un texte de code s’enregistre ; l’injection SQL et l’adresse restent refusées', () => {
    expect(r.scriptLibre!.statut).toBe(201);
    expect(String(r.scriptLibre!.corps.texte)).toContain('<script>alert(1)</script>');
    expect(r.sqlToujoursRefuse!.statut).toBe(403);
    expect(r.adresseToujoursRefusee!.statut).toBe(403);
  });

  it('les tests écrits dans le serveur produit passent tous : règles, sessions et attaques', () => {
    expect(produits).not.toMatch(/\bfailed\b/);
    expect(produits).toMatch(/Test Files\s+3 passed/);
    expect(Number(/Tests\s+(\d+) passed/.exec(produits)?.[1])).toBeGreaterThan(50);
  });
  it('les fiches de départ sont créées', () => {
    expect([r.secretAwa!.statut, r.resa!.statut, r.facture!.statut]).toEqual([201, 201, 201]);
  });
  it('un compte ne déplace pas sa fiche chez un autre', () => {
    expect(r.deplacerSecret!.statut).toBe(400);
    expect(JSON.stringify(r.secretsDeBob!.corps)).not.toContain('à Awa');
  });
  it('personne ne marque une fiche payée sans payer, pas même un admin', () => {
    expect([r.payerSansPayer!.statut, r.adminPayerSansPayer!.statut]).toEqual([400, 400]);
  });
  it('un total calculé ne change que par un admin', () => {
    expect([r.totalParAuteur!.statut, r.totalParAdmin!.statut]).toEqual([400, 200]);
  });
  it('l’auteur ne change pas', () => {
    expect(r.auteurChange!.statut).toBe(400);
  });
  it('« au plus » vaut aussi dans une modification', () => {
    expect([r.fraisTropHauts!.statut, r.fraisNegatifs!.statut, r.fraisPermis!.statut]).toEqual([400, 400, 200]);
  });
  it('un nom hérité des objets JavaScript (toString, hasOwnProperty) est un champ inconnu comme un autre', () => {
    expect([r.champHerite!.statut, r.champConstructeur!.statut]).toEqual([400, 400]);
    expect(String(r.champHerite!.corps.erreur)).toContain("n'existe pas");
  });
  it('un corps illisible reste une erreur 400', () => {
    expect(r.jsonCasse!.statut).toBe(400);
  });
  it('un paiement confirmé au mauvais montant : 500, fiche impayée ; le relais rappelle, et le bon montant l’enregistre une seule fois', () => {
    expect(r.paiementMauvaisMontant!.statut).toBe(500);
    expect(r.paiementMauvaisMontant!.corps.paye).toBe(false);
    expect(r.paiementBonMontant!.statut).toBe(200);
    expect(r.paiementBonMontant!.corps.paye).toBe(true);
    expect(r.paiementRejoue!.statut).toBe(200);
    expect(r.journalApresPaiement!.corps.lignes).toBe(1);
  });
  it('ce paiement non enregistré est écrit au journal du serveur, une fois, avec le montant reçu et le montant attendu', () => {
    const signalees = r.paiementSignale!.corps.signalees as string[];
    expect(signalees).toHaveLength(1);
    expect(signalees[0]).toContain('paiement de 5 reçu pour « reservation »');
    expect(signalees[0]).toContain('mais la fiche demande 7');
  });
  it('GET /sante répond 200 sans session, sans cache, et ne dit rien d’autre que l’état', () => {
    expect(r.sante!.statut).toBe(200);
    expect(r.sante!.corps).toEqual({ etat: 'pret', cache: 'no-store' });
  });
  it('une valeur hors de ses limites est refusée à la création, avec une phrase qui dit pourquoi (S7)', () => {
    const essais = r.limitesALaCreation!.corps as Record<string, Reponse>;
    expect(r.article!.statut).toBe(201);
    expect(Object.values(essais).map((e) => e.statut)).toEqual(Array(10).fill(400));
    expect(essais.prixNegatif!.corps.erreur).toBe('le champ « prix » doit être entre 0 et 1000');
    expect(essais.stockAVirgule!.corps.erreur).toBe('le champ « stock » doit être un nombre entier');
    expect(essais.stockNegatif!.corps.erreur).toBe('le champ « stock » doit être au moins 0');
    expect(essais.nomCourt!.corps.erreur).toBe('le champ « nom » doit avoir entre 2 et 20 caractères');
    expect(essais.contactFaux!.corps.erreur).toBe('le champ « contact » doit être une adresse e-mail');
    expect(essais.statutInconnu!.corps.erreur).toBe('le champ « statut » doit être l’une de ces valeurs : brouillon, en_vente');
    expect(essais.tropDePhotos!.corps.erreur).toBe('le champ « photos » doit avoir au plus 2 éléments');
    expect(essais.noteImmense!.corps.erreur).toBe('le champ « note » doit avoir au plus 10000 caractères');
  });
  it('les valeurs posées exactement sur les limites passent', () => {
    expect(r.limitesExactes!.corps).toEqual({ bas: 201, haut: 201 });
  });
  it('les limites valent aussi dans une modification, et une modification permise passe', () => {
    const essais = r.limitesALaModification!.corps as Record<string, Reponse>;
    expect([essais.prixNegatif!.statut, essais.statutInconnu!.statut, essais.noteImmense!.statut, essais.permis!.statut]).toEqual([400, 400, 400, 200]);
    expect(essais.permis!.corps).toMatchObject({ prix: 4, statut: 'en_vente', nom: 'Stylo' });
  });
  it('un « paye » ordinaire, sans « paiements », s’encaisse à la main', () => {
    expect(r.factureEncaissee!.statut).toBe(200);
    expect(r.factureEncaissee!.corps.paye).toBe(true);
  });
});
