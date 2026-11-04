import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { programme } from './analyse/aide.js';

const SERVEUR = [
  'serveur "boutique" :',
  '>donnee produit :',
  '>>prix : nombre',
  '>donnee suivi :',
  '>>etape : texte',
  '>donnee alerte :',
  '>>nom : texte',
  '>>prevenu : booleen au depart faux',
  '>donnee commande :',
  '>>refs : liste de texte',
  '>>photos : liste de texte du site',
  '>>total : nombre calcule somme prix de produit par refs',
  '>>statut : texte au depart "en_attente"',
  '>route "produits" :',
  '>>tout le monde peut lire produit',
  '>>seul admin peut modifier produit',
  '>route "suivis" :',
  '>>tout le monde peut lire suivi par identifiant',
  '>>seul admin peut lire suivi',
  '>>seul admin peut modifier suivi',
  '>route "alertes" :',
  '>>tout le monde peut creer alerte',
  '>>seul admin peut lire alerte',
  '>>seul admin peut modifier alerte',
  '>route "commandes" :',
  '>>tout le monde peut creer commande',
  '>>seul admin peut lire commande',
  '>>seul admin peut modifier commande',
];

const SOURCE = programme(
  ...SERVEUR,
  '',
  'page "accueil" :',
  '>titre "Accueil"',
  '>variable ids = ["abc"]',
  '>variable lu = rien',
  '>bouton "Relire"',
  '>quand l\'utilisateur clique sur "Relire" :',
  '>>pour chaque id_lu dans ids :',
  '>>>envoyer requete vers "suivis" avec id id_lu dans lu',
  '',
  'page "admin" reservee a admin sinon vers "accueil" :',
  '>titre "Admin"',
  '>variable commandes = []',
  '>variable alertes = []',
  '>quand la page se charge :',
  '>>envoyer requete vers "commandes" dans commandes',
  '>>envoyer requete vers "alertes" dans alertes',
  '>pour chaque c dans commandes :',
  '>>bouton "Confirmer"',
  '>>quand l\'utilisateur clique sur "Confirmer" :',
  '>>>modifier c dans "commandes" avec statut = "confirmee"',
  '>>bouton "Corriger"',
  '>>quand l\'utilisateur clique sur "Corriger" :',
  '>>>modifier c dans "commandes" avec total = 3',
  '>pour chaque al dans alertes :',
  '>>bouton "Prévenu"',
  '>>quand l\'utilisateur clique sur "Prévenu" :',
  '>>>modifier al dans "alertes" avec prevenu = vrai',
);

const compile = (source: string) => compiler(source);
const erreurs = (source: string) => compile(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);

/** Une page avec un bouton, et ses actions. */
const pageAvec = (...actions: string[]) =>
  programme(...SERVEUR, '', 'page "accueil" :', '>titre "A"', '>variable lu = rien', '>variable ids = ["a"]', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', ...actions.map((a) => `>>${a}`));

/** Écrit un projet produit, installe ses dépendances une fois, et lance tsc ; rend les erreurs de tsc. */
function construire(nom: string, fichiers: Map<string, string>, enPlus: Record<string, string> = {}): { dossier: string; erreurs: string } {
  const dossier = join(tmpdir(), `humalis-modifier-${nom}`);
  rmSync(join(dossier, 'src'), { recursive: true, force: true });
  rmSync(join(dossier, 'dist'), { recursive: true, force: true });
  for (const [chemin, contenu] of [...fichiers, ...Object.entries(enPlus)]) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  if (!existsSync(join(dossier, 'node_modules', 'typescript'))) execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'pipe' });
  try {
    execFileSync('npx', ['tsc'].concat(nom === 'site' ? ['--noEmit'] : []), { cwd: dossier, encoding: 'utf8', stdio: 'pipe' });
    return { dossier, erreurs: '' };
  } catch (erreur) {
    return { dossier, erreurs: String((erreur as { stdout?: unknown }).stdout) };
  }
}

/** Le vrai serveur, en HTTP : ce qu'un visiteur, un compte et un admin obtiennent. */
const SCENARIO = `
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';

const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
await usersStore.create({ email: 'admin@essai.test', role: 'admin', passwordHash });
await usersStore.create({ email: 'awa@essai.test', role: 'user', passwordHash });
const stockages = { produit: creerStockageMemoire(), suivi: creerStockageMemoire(), alerte: creerStockageMemoire(), commande: creerStockageMemoire() };
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages });
const ecoute = app.listen(0);
await new Promise((pret) => ecoute.once('listening', pret));
const base = 'http://127.0.0.1:' + ecoute.address().port;

const json = { 'content-type': 'application/json' };
const jeton = async (email) => (await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email, password: secret }) })).json()).data.token;
const admin = { ...json, authorization: 'Bearer ' + (await jeton('admin@essai.test')) };
const compte = { ...json, authorization: 'Bearer ' + (await jeton('awa@essai.test')) };
const csrf = (await fetch(base + '/auth/me')).headers.getSetCookie().find((c) => c.startsWith('astratra_csrf=')).split(';')[0].split('=')[1];
const visiteur = { ...json, 'x-csrf-token': csrf, cookie: 'astratra_csrf=' + csrf };

const envoyer = async (methode, chemin, entetes, corps) => {
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes, body: JSON.stringify(corps) });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};

const produit = await stockages.produit.creer({ prix: 15 });
const creation = await envoyer('POST', '/api/commandes', visiteur, { refs: [produit.id], photos: ['/a.png'] });
const chemin = '/api/commandes/' + creation.corps.id;
const alerte = await envoyer('POST', '/api/alertes', visiteur, { nom: 'Awa' });
const resultats = {
  creation,
  alerte,
  creationStatut: await envoyer('POST', '/api/commandes', visiteur, { refs: [], photos: [], statut: 'livree' }),
  creationTotal: await envoyer('POST', '/api/commandes', visiteur, { refs: [], photos: [], total: 1 }),
  visiteurStatut: await envoyer('PATCH', chemin, visiteur, { statut: 'livree' }),
  compteStatut: await envoyer('PATCH', chemin, compte, { statut: 'livree' }),
  adminStatut: await envoyer('PATCH', chemin, admin, { statut: 'confirmee' }),
  visiteurTotal: await envoyer('PATCH', chemin, visiteur, { total: 1 }),
  adminTotal: await envoyer('PATCH', chemin, admin, { total: 3 }),
  adminPhotoAilleurs: await envoyer('PATCH', chemin, admin, { photos: ['https://ailleurs.example/a.png'] }),
  adminPrevenu: await envoyer('PATCH', '/api/alertes/' + alerte.corps.id, admin, { prevenu: true }),
  relue: await stockages.commande.trouver(creation.corps.id),
};
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(resultats));
`;

describe('modifier un champ que le serveur décide à la création', () => {
  it('la compilation accepte modifier, et refuse toujours l\'envoi à la création', () => {
    expect(erreurs(SOURCE)).toEqual([]);
    expect(erreurs(pageAvec('envoyer requete vers "commandes" avec statut = "livree"'))[0]).toContain('le serveur décide lui-même du champ « statut »');
    expect(erreurs(pageAvec('envoyer requete vers "commandes" avec total = 1'))[0]).toContain('le serveur décide lui-même du champ « total »');
  });

  it('modifier vérifie encore les champs : un champ inconnu reste refusé', () => {
    const avec = (ligne: string) =>
      programme(...SERVEUR, '', 'page "accueil" :', '>titre "A"', '>variable commandes = []', '>quand la page se charge :', '>>envoyer requete vers "commandes" dans commandes', '>pour chaque c dans commandes :', '>>bouton "Go"', '>>quand l\'utilisateur clique sur "Go" :', `>>>${ligne}`);
    expect(erreurs(avec('modifier c dans "commandes" avec statuts = "a"'))[0]).toContain('n\'a pas de champ « statuts »');
  });

  it('lire une fiche : « avec id valeur », et « avec id = … » dit la bonne forme', () => {
    expect(erreurs(pageAvec('pour chaque id_lu dans ids :', '>envoyer requete vers "suivis" avec id id_lu dans lu'))).toEqual([]);
    expect(erreurs(pageAvec('pour chaque id_lu dans ids :', '>envoyer requete vers "suivis" avec id = id_lu dans lu'))[0]).toContain('écrivez : avec id valeur dans fiche');
    // Une simple variable nommée id ne suffit pas : seul un paramètre de la page donne ce sens à « avec id ».
    expect(erreurs(pageAvec('pour chaque m dans ids :', '>envoyer requete vers "suivis" avec id m dans lu'))).toEqual([]);
  });
});

describe('le code produit : tsc, puis un vrai serveur', () => {
  let tscSite = '';
  let tscServeur = '';
  let r: Record<string, { statut: number; corps: Record<string, unknown> }> & { relue: Record<string, unknown> };

  beforeAll(() => {
    const { application } = compile(SOURCE);
    tscSite = construire('site', genererProjetWeb(application!, { nom: 'b', source: 'b.humalis', adresse: 'https://b.cd' })).erreurs;
    const serveur = construire('serveur', genererProjetServeur(application!.serveurs[0], { nom: 'b', source: 'b.humalis' }), { 'essai.mjs': SCENARIO });
    tscServeur = serveur.erreurs;
    r = JSON.parse(execFileSync('node', ['essai.mjs'], { cwd: serveur.dossier, encoding: 'utf8', stdio: 'pipe' }));
  }, 300_000);

  it('tsc passe sur le site et sur le serveur', () => {
    expect(tscSite).toBe('');
    expect(tscServeur).toBe('');
  });

  it('un visiteur crée sans choisir ces champs', () => {
    expect(r.creation.statut).toBe(201);
    expect(r.creation.corps).toMatchObject({ statut: 'en_attente', total: 15 });
    expect(r.alerte.corps).toMatchObject({ prevenu: false });
    expect(r.creationStatut.statut).toBe(400);
    expect(r.creationTotal.statut).toBe(400);
  });

  it('un visiteur et un simple compte ne modifient rien', () => {
    expect(r.visiteurStatut.statut).toBe(401);
    expect(r.visiteurTotal.statut).toBe(401);
    expect(r.compteStatut.statut).toBe(403);
  });

  it('un admin modifie le statut, le total et « prevenu »', () => {
    expect(r.adminStatut.statut).toBe(200);
    expect(r.adminStatut.corps.statut).toBe('confirmee');
    expect(r.adminTotal.statut).toBe(200);
    expect(r.adminTotal.corps.total).toBe(3);
    expect(r.adminPrevenu.statut).toBe(200);
    expect(r.adminPrevenu.corps.prevenu).toBe(true);
    expect(r.relue).toMatchObject({ statut: 'confirmee', total: 3 });
  });

  it('« du site » vaut aussi pour un admin qui modifie', () => {
    expect(r.adminPhotoAilleurs.statut).toBe(400);
  });
});
