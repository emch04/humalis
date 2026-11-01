import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { verifierPourLeStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// « telecharger bon de … » et « fidelite par … de … » (décision d'Emch), de la phrase au code produit qui tourne.
const SERVEUR = [
  'serveur "Maison Awa" :',
  '>donnee commande :',
  '>>nom : texte',
  '>>telephone : texte',
  '>>articles : liste de texte',
  '>>total : nombre',
  '>>statut : texte',
  '>>jour : date',
  '>>photo : image',
  '>route "commandes" :',
  '>>tout le monde peut creer commande',
  '>>seul admin peut lire commande',
  '>>seul admin peut modifier commande',
];
const FIDELITE = ['>fidelite par telephone de commande :', '>>1 tampon par commande livree', '>>apres 5 tampons, recompense "Un maillot offert"'];
const page = (...lignes: string[]) => [
  '',
  'page "connexion" a l\'adresse "/connexion" :',
  '>titre "Connexion"',
  '',
  'page "commandes" a l\'adresse "/" reservee a admin sinon vers "connexion" :',
  '>titre "Commandes"',
  '>variable commandes = []',
  '>variable carte = rien',
  '>quand la page se charge :',
  '>>envoyer requete vers "commandes" dans commandes',
  '>pour chaque c dans commandes :',
  '>>bouton "Bon" avec nom "bon"',
  '>>quand l\'utilisateur clique sur "bon" :',
  '>>>essayer :',
  '>>>>telecharger bon de commande de c',
  '>>>si erreur :',
  '>>>>afficher erreur "Refusé : {raison}"',
  '>>bouton "Carte" avec nom "carte_client"',
  '>>quand l\'utilisateur clique sur "carte_client" :',
  '>>>envoyer requete vers "fidelite" avec id c.telephone dans carte',
  ...lignes,
];
const complet = programme(...SERVEUR, ...FIDELITE, ...page('>si carte n\'est pas rien :', '>>texte "{carte.tampons} sur {carte.objectif}"'));
const options = { nom: 'maison', source: 'maison.humalis' };

describe('la phrase et son sens', () => {
  it('le programme complet passe', () => {
    expect(erreurs(complet)).toEqual([]);
  });

  it('« avec id » seul reste une variable envoyée, et se lit encore dans une page à paramètre', () => {
    const source = programme(...SERVEUR.slice(0, 6), '>route "commandes" :', '>>tout le monde peut lire commande', '>>seul admin peut modifier commande', '', 'page "fiche" avec parametre id :', '>titre "Fiche"', '>variable c = rien', '>quand la page se charge :', '>>envoyer requete vers "commandes" avec id dans c');
    expect(erreurs(source)).toEqual([]);
  });

  it('« avec id c.commande » lit une fiche de la route : son type est connu', () => {
    const source = programme(...SERVEUR.slice(0, 6), '>route "commandes" :', '>>tout le monde peut lire commande', '>>seul admin peut modifier commande', '', 'page "fiche" :', '>titre "Fiche"', '>variable c = rien', '>bouton "Lire"', '>quand l\'utilisateur clique sur "Lire" :', '>>envoyer requete vers "commandes" avec id "abc" dans c', '>si c n\'est pas rien :', '>>texte c.inconnu');
    expect(erreurs(source).join('\n')).toMatch(/le champ « inconnu » n'existe pas dans la donnée « commande »/);
  });

  it('un champ inconnu de la carte est refusé', () => {
    const source = programme(...SERVEUR, ...FIDELITE, ...page('>si carte n\'est pas rien :', '>>texte carte.inconnu'));
    expect(erreurs(source).join('\n')).toMatch(/« inconnu » n'existe pas dans cette fiche/);
  });

  it('sans bloc « fidelite », la route est refusée à la compilation', () => {
    expect(erreurs(programme(...SERVEUR, ...page())).join('\n')).toMatch(/la route « fidelite » n'existe pas/);
  });

  it('l’avertissement « seul un admin » s’applique à la carte', () => {
    const { diagnostics } = compiler(complet);
    expect(diagnostics.some((d) => d.gravite === 'avertissement' && d.message.includes('seul un admin peut lire « fidelite »'))).toBe(true);
  });

  it('les deux lignes de la carte sont vérifiées', () => {
    const avec = (...lignes: string[]) => erreurs(programme(...SERVEUR, ...lignes)).join('\n');
    expect(avec('>fidelite par numero de commande :', ...FIDELITE.slice(1))).toMatch(/champ « numero » de type texte/);
    expect(avec('>fidelite par photo de commande :', ...FIDELITE.slice(1))).toMatch(/champ « photo » de type texte/);
    expect(avec(FIDELITE[0], '>>1 tampon par produit livree', FIDELITE[2])).toMatch(/sur la donnée de l'en-tête/);
    expect(avec(FIDELITE[0], '>>-1 tampon par commande livree', FIDELITE[2])).toMatch(/entier positif/);
    expect(avec(FIDELITE[0], FIDELITE[1], '>>apres 0 tampons, recompense "Un cadeau"')).toMatch(/entier positif/);
    expect(avec(FIDELITE[0], FIDELITE[2])).toMatch(/la ligne qui donne les tampons/);
    expect(avec(FIDELITE[0], FIDELITE[1])).toMatch(/la ligne de la récompense/);
  });
});

describe('ce qui est produit selon la cible', () => {
  const application = compiler(complet).application!;

  it('web : l’événement télécharge, et la raison d’un refus arrive à « si erreur »', () => {
    const fichiers = genererProjetWeb(application, { nom: 'm', adresse: 'https://m.test', source: 'm.humalis' });
    const ecran = fichiers.get('src/pages/Commandes.tsx')!;
    expect(ecran).toContain("await serveur.telecharger('/api/commandes', c.id);");
    expect(ecran).toContain('if (serveur.echecs() > echecsEssai) return serveur.raison();');
    expect(ecran).toContain("await serveur.lireUn('/api/fidelite', c.telephone, carteMaj)");
    const serveur = fichiers.get('src/humalis/serveur.ts')!;
    expect(serveur).toContain('await avecSession(() => fetch(`${BASE}${adresse}/${encodeURIComponent(id)}/bon`');
    expect(serveur).toContain('URL.createObjectURL(await reponse.blob())');
  });

  it('web : sans la phrase, le client n’a pas ce code', () => {
    const sans = compiler(programme(...SERVEUR, '', 'page "a" :', '>titre "A"')).application!;
    expect(genererProjetWeb(sans, { nom: 'm', adresse: 'https://m.test', source: 'm.humalis' }).get('src/humalis/serveur.ts')).not.toContain('telecharger');
  });

  it('mobile : un message clair « pas encore »', () => {
    const fichiers = genererProjetMobile(application, { nom: 'm', source: 'm.humalis' } as never);
    expect(fichiers.get('humalis/serveur.ts')).toContain("Le téléchargement d'un bon n'est pas encore disponible dans l'application mobile.");
  });

  it('site statique : refusé clairement', () => {
    expect(verifierPourLeStatique(application).map((d) => d.message).join('\n')).toMatch(/telecharger bon/);
  });

  it('serveur sans les phrases : ni route, ni pack, ni fichier en plus', () => {
    const sans = compiler(programme(...SERVEUR, '', 'page "a" :', '>titre "A"')).application!;
    const fichiers = genererProjetServeur(sans.serveurs[0], options);
    const paquet = fichiers.get('package.json')!;
    for (const pack of ['@astratra/pdf', '@astratra/loyalty', 'pdfkit']) expect(paquet).not.toContain(pack);
    expect(fichiers.get('src/serveur.ts')).not.toContain('/bon');
    expect(fichiers.get('src/serveur.ts')).not.toContain('/api/fidelite');
    expect(fichiers.has('src/humalis/bon.ts')).toBe(false);
    expect(fichiers.has('src/humalis/fidelite.ts')).toBe(false);
  });

  it('une phrase écrite dans un composant demande aussi la route', () => {
    const source = programme(...SERVEUR, '', 'composant "Ligne" :', '>parametre fiche', '>bouton "Bon"', '>quand l\'utilisateur clique sur "Bon" :', '>>telecharger bon de commande de fiche', ...page());
    const fichiers = genererProjetServeur(compiler(source.replace('envoyer requete vers "fidelite" avec id c.telephone dans carte', 'changer carte par rien')).application!.serveurs[0], options);
    expect(fichiers.get('src/serveur.ts')).toContain("get('/:id/bon'");
  });
});

/**
 * Le code produit qui tourne vraiment : installé une fois (les dépendances exactes font le nom du
 * dossier), compilé, puis interrogé en HTTP. Il faut le réseau au premier passage.
 */
describe('le serveur produit, lancé pour de vrai', () => {
  let resultats: Record<string, any>;

  beforeAll(() => {
    const fichiers = genererProjetServeur(compiler(complet).application!.serveurs[0], options);
    const empreinte = createHash('sha256').update(fichiers.get('package.json')!).digest('hex').slice(0, 16);
    const dossier = join(tmpdir(), `humalis-bon-fidelite-${empreinte}`);
    rmSync(join(dossier, 'src'), { recursive: true, force: true });
    rmSync(join(dossier, 'dist'), { recursive: true, force: true });
    for (const [chemin, contenu] of fichiers) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    writeFileSync(join(dossier, 'essai.mjs'), SCENARIO);
    const lancer = (commande: string, ...args: string[]) => execFileSync(commande, args, { cwd: dossier, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (!existsSync(join(dossier, 'node_modules', 'pdfkit'))) lancer('npm', 'install', '--no-audit', '--no-fund');
    lancer('npx', 'tsc');
    resultats = JSON.parse(lancer('node', 'essai.mjs'));
  }, 300_000);

  it('le bon est un vrai PDF, à télécharger, jamais gardé en cache', () => {
    expect(resultats.bon.debut).toBe('%PDF');
    expect(resultats.bon.type).toBe('application/pdf');
    expect(resultats.bon.fichier).toMatch(/^attachment; filename="bon-de-commande-[a-z0-9]{8}\.pdf"$/);
    expect(resultats.bon.cache).toBe('private, no-store');
  });

  it('le bon garde les mêmes refus que la lecture, et 404 sans fiche', () => {
    expect(resultats.bon.visiteur).toBe(401);
    expect(resultats.bon.utilisateur).toBe(403);
    expect(resultats.bon.inconnue).toBe(404);
  });

  it('les tampons se comptent sur de vraies fiches, quelle que soit l’écriture du numéro', () => {
    // 7 fiches livrées pour ce numéro, écrit de cinq façons, plus une en attente et un autre client.
    expect(resultats.fidelite.ecrit1).toEqual({ tampons: 2, objectif: 5, restant: 3, recompenses: 1, recompense: 'Un maillot offert' });
    expect(resultats.fidelite.ecrit2).toEqual(resultats.fidelite.ecrit1);
    expect(resultats.fidelite.autre).toEqual({ tampons: 1, objectif: 5, restant: 4, recompenses: 0, recompense: 'Un maillot offert' });
    expect(resultats.fidelite.personne).toEqual({ tampons: 0, objectif: 5, restant: 5, recompenses: 0, recompense: 'Un maillot offert' });
  });

  it('la carte est réservée à l’admin, sans liste ni écriture', () => {
    expect(resultats.fidelite.visiteur).toBe(401);
    expect(resultats.fidelite.utilisateur).toBe(403);
    expect(resultats.fidelite.cache).toBe('private, no-store');
    expect(resultats.fidelite.liste).toBe(404);
    for (const statut of resultats.fidelite.ecritures) expect(statut).toBeGreaterThanOrEqual(400);
    expect(resultats.fidelite.vide).toBe(400);
  });
});

/** Joué dans le dossier du projet produit : le serveur écoute sur un port libre, et tout passe par HTTP. */
const SCENARIO = `
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';

const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
await usersStore.create({ email: 'admin@essai.test', role: 'admin', passwordHash });
await usersStore.create({ email: 'awa@essai.test', role: 'utilisateur', passwordHash });
const stockages = { commande: creerStockageMemoire() };
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages });
const ecoute = app.listen(0);
await new Promise((pret) => ecoute.once('listening', pret));
const base = 'http://127.0.0.1:' + ecoute.address().port;

const jeton = async (email) => (await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: secret }) })).json()).data.token;
const admin = { authorization: 'Bearer ' + (await jeton('admin@essai.test')) };
const utilisateur = { authorization: 'Bearer ' + (await jeton('awa@essai.test')) };

const fiche = (telephone, statut) => stockages.commande.creer({ nom: 'Awa', telephone, articles: ['Maillot', 'Écharpe'], total: 1250, statut, jour: '2026-10-30', photo: '' });
const premiere = await fiche('+243 848-000', 'livree');
for (const numero of ['243848000', '+243848000', '243 848 000', '243-848-000', '243848000', '+243 848 000']) await fiche(numero, 'livree');
await fiche('243848000', 'en_attente');
await fiche('999', 'livree');

const carte = async (numero) => (await fetch(base + '/api/fidelite/' + encodeURIComponent(numero), { headers: admin })).json();
const adresseBon = base + '/api/commandes/' + premiere.id + '/bon';
const bon = await fetch(adresseBon, { headers: admin });
const contenu = Buffer.from(await bon.arrayBuffer());
const statut = async (adresse, init) => (await fetch(base + adresse, init)).status;

const resultats = {
  bon: {
    debut: contenu.subarray(0, 4).toString(),
    type: bon.headers.get('content-type'),
    fichier: bon.headers.get('content-disposition'),
    cache: bon.headers.get('cache-control'),
    visiteur: (await fetch(adresseBon)).status,
    utilisateur: (await fetch(adresseBon, { headers: utilisateur })).status,
    inconnue: await statut('/api/commandes/inconnue/bon', { headers: admin }),
  },
  fidelite: {
    ecrit1: await carte('+243 848 000'),
    ecrit2: await carte('243848000'),
    autre: await carte('999'),
    personne: await carte('0000'),
    visiteur: await statut('/api/fidelite/999'),
    utilisateur: await statut('/api/fidelite/999', { headers: utilisateur }),
    cache: (await fetch(base + '/api/fidelite/999', { headers: admin })).headers.get('cache-control'),
    liste: await statut('/api/fidelite', { headers: admin }),
    vide: await statut('/api/fidelite/' + encodeURIComponent('+ -'), { headers: admin }),
    ecritures: await Promise.all(['POST', 'PATCH', 'PUT', 'DELETE'].map((method) => statut('/api/fidelite/999', { method, headers: admin }))),
  },
};
ecoute.close();
process.stdout.write(JSON.stringify(resultats));
process.exit(0);
`;
