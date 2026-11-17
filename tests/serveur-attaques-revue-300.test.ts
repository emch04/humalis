import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { fichiersEntree } from '../src/cibles/serveur/entree.js';
import { installerSiBesoin } from './aide-installation.js';

/**
 * La revue de sécurité de ce qui est entré dans la 3.0.0 (17 novembre 2026), rejouée sur de VRAIS serveurs produits :
 * trois services qui se parlent (avec leur relais « entree »), puis un serveur seul. Chaque essai dit ce que le
 * serveur doit faire ; le relevé de chaque scénario (serveur-attaques-revue-300*.mjs) dit ce qu'il fait.
 *
 * Tout tourne en mémoire. HUMALIS_ESSAI_DOCUMENTS=mongodb://127.0.0.1:27017/?directConnection=true (un jeu de
 * répliques) rejoue en plus les deux essais de simultanéité sur une vraie base de documents.
 */
const DOCUMENTS = process.env.HUMALIS_ESSAI_DOCUMENTS;
const suffixe = `_${process.pid}_${Date.now()}`;
const depart = 6200 + (process.pid % 150) * 20;

type Releve = Record<string, unknown>;

/** Lance un scénario et rend son relevé : la dernière ligne qu'il écrit. */
function jouer(scenario: string, dossier: string, port: number, env: Record<string, string> = {}): Releve {
  let sortie: string;
  try {
    sortie = execFileSync('node', [new URL(scenario, import.meta.url).pathname, dossier, String(port)], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } });
  } catch (erreur) {
    sortie = String((erreur as { stdout?: unknown }).stdout ?? '');
    const releve = JSON.parse(sortie.trim().split('\n').at(-1) || '{}') as Releve;
    throw new Error(String(releve.erreur ?? (erreur as { stderr?: unknown }).stderr ?? erreur));
  }
  return JSON.parse(sortie.trim().split('\n').at(-1)!) as Releve;
}

/** L'adresse d'une base de documents de ce serveur ; « nom » la désigne. */
function adresseDocuments(nom: string): string {
  const url = new URL(DOCUMENTS!);
  url.pathname = '/' + nom;
  return url.href;
}

/** Les bases d'essai créées sur la base de documents sont effacées à la fin. */
function effacerBases(dossier: string): void {
  if (!DOCUMENTS) return;
  const code = `import { MongoClient } from 'mongodb'; const c = new MongoClient(${JSON.stringify(DOCUMENTS)}); await c.connect();
for (const { name } of (await c.db().admin().listDatabases()).databases) if (name.startsWith('revue300_') && name.endsWith(${JSON.stringify(suffixe)})) await c.db(name).dropDatabase();
await c.close();`;
  try {
    execFileSync('node', ['--input-type=module', '-e', code], { cwd: dossier, stdio: 'pipe' });
  } catch {
    // Une base restée après une erreur porte le préfixe revue300_.
  }
}

describe('la revue de sécurité de la 3.0.0, sur trois services produits', () => {
  const dossier = join(tmpdir(), 'humalis-revue-300');
  let r: Releve;
  let documents: Releve | undefined;

  beforeAll(() => {
    const { application, diagnostics } = compiler(readFileSync(new URL('./serveur-attaques-revue-300.humalis', import.meta.url), 'utf8'));
    expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
    const serveurs = application!.serveurs;
    for (const s of serveurs) {
      const ici = join(dossier, s.nom);
      for (const sous of ['src', 'dist', 'tests', 'scripts']) rmSync(join(ici, sous), { recursive: true, force: true });
      for (const [chemin, contenu] of genererProjetServeur(s, { nom: s.nom, source: 'boutique.humalis' })) {
        mkdirSync(dirname(join(ici, chemin)), { recursive: true });
        writeFileSync(join(ici, chemin), contenu);
      }
    }
    for (const [chemin, contenu] of fichiersEntree(serveurs)) {
      mkdirSync(dirname(join(dossier, 'entree', chemin)), { recursive: true });
      writeFileSync(join(dossier, 'entree', chemin), contenu);
    }
    // Les trois services ont les mêmes paquets : une installation, partagée.
    installerSiBesoin(join(dossier, 'comptes'));
    for (const s of ['catalogue', 'commandes']) if (!existsSync(join(dossier, s, 'node_modules'))) symlinkSync(join(dossier, 'comptes', 'node_modules'), join(dossier, s, 'node_modules'));
    for (const s of serveurs) execFileSync('npx', ['tsc'], { cwd: join(dossier, s.nom), stdio: 'pipe' });
    r = jouer('./serveur-attaques-revue-300.mjs', dossier, depart);
    if (DOCUMENTS) documents = jouer('./serveur-attaques-revue-300.mjs', dossier, depart + 6, { BASE: adresseDocuments('humalisnombase').replace('humalisnombase', '{nom}'), SUFFIXE: suffixe });
  }, 900_000);

  afterAll(() => effacerBases(join(dossier, 'comptes')));

  it('par le relais « entree », une demande de changement de protocole ne contourne pas la limite des connexions', () => {
    // Le témoin : par le chemin ordinaire, la quatrième connexion ratée est refusée, quelle que soit l'adresse d'origine écrite par le client.
    expect(r.connexionsOrdinaires).toEqual([401, 401, 401, 429, 429, 429]);
    // Par le chemin du changement de protocole, le mot de passe ne doit plus être essayé non plus.
    expect(r.connexionsDetournees).not.toContain(401);
  });

  it('cent messages en attente pour un service en panne ne retiennent pas ceux des autres : une déconnexion ferme le jeton partout', () => {
    expect(r.deconnexionAvantLaPanne).toBe(401);
    expect(r.temoinApresDeconnexion).toBe(401);
  });

  it('un service qui peut « modifier » un produit ne lance pas une action réservée, même par un chemin en majuscules', () => {
    expect(r.solderParService).toBe(403);
    expect([403, 404]).toContain(r.solderParMajuscules);
    expect(r.stockApresSolder).toBe(5);
  });

  it('le secret que porte un service ne suffit pas pour agir au nom d’un autre (conception)', () => {
    // Le service des comptes n'a aucun droit sur les produits…
    expect(r.reserverParComptes).toBe(403);
    // … et, avec ce que porte son .env, il ne doit pas pouvoir signer « de : commandes ».
    expect([401, 403]).toContain(r.reserverAuNomDeCommandes);
    expect(r.stockApresReserver).toBe(5);
  });

  it('une signature de service falsifiée (destinataire, heure, méthode, chemin, corps, encodage, service) est refusée, sans erreur 500', () => {
    const statuts = r.signaturesFalsifiees as Record<string, number>;
    for (const [cas, statut] of Object.entries(statuts)) expect(statut, cas).toBe(401);
    expect(Object.keys(statuts)).toHaveLength(14);
    expect(r.stockApresFalsifications).toBe(5);
    expect(r.stockAutreApresFalsifications).toBe(5);
  });

  it('une annonce « compte fermé » ne vient que du service des comptes, signée par lui, pour ce service, à l’heure', () => {
    const statuts = r.messagesFalsifies as Record<string, number>;
    expect(statuts.compteFermeParCommandes).toBe(403);
    for (const cas of ['compteFermeAuNomDesComptes', 'compteFermePerime', 'compteFermePourUnAutre', 'enveloppeVide']) expect(statuts[cas], cas).toBe(401);
  });

  it('derrière un relais, le relais des rapports d’erreur compte chaque visiteur', () => {
    expect(r.rapportsDuPremier).toEqual([30, 1]);
    expect(r.rapportDunAutreVisiteur).toBe(204);
  });

  it('lancé par « npm start », un service limite aussi les requêtes venues de sa machine (un relais local)', () => {
    expect(r.limiteLocale).toBeGreaterThan(0);
  });

  it('deux validations en même temps ne réservent le produit qu’une fois', () => {
    expect(r.validations).toEqual([200, 400, 400, 400]);
    expect(r.stockApresValidations).toBe(7);
  });

  it.skipIf(!DOCUMENTS)('sur une base de documents aussi, deux validations en même temps ne réservent le produit qu’une fois', () => {
    expect(documents!.stockApresValidations).toBe(7);
  });
});

describe('la revue de sécurité de la 3.0.0, sur un serveur seul', () => {
  const dossier = join(tmpdir(), 'humalis-revue-300-seul');
  let r: Releve;
  let documents: Releve | undefined;

  beforeAll(() => {
    const { application, diagnostics } = compiler(readFileSync(new URL('./serveur-attaques-revue-300-seul.humalis', import.meta.url), 'utf8'));
    expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
    for (const sous of ['src', 'dist', 'tests', 'scripts']) rmSync(join(dossier, sous), { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'salle', source: 'salle.humalis' })) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    installerSiBesoin(dossier);
    execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
    r = jouer('./serveur-attaques-revue-300-seul.mjs', dossier, depart + 12);
    if (DOCUMENTS) documents = jouer('./serveur-attaques-revue-300-seul.mjs', dossier, depart + 15, { DATABASE_URL: adresseDocuments('revue300_seul' + suffixe) });
  }, 900_000);

  afterAll(() => effacerBases(dossier));

  it('un admin de l’application qui change l’hôte du serveur d’envoi ne reçoit pas le mot de passe SMTP du .env', () => {
    // Le coffre ne rend jamais le mot de passe…
    expect(r.coffreLu).toBe(false);
    // … mais l'hôte changé, le serveur ne doit pas le présenter au nouvel hôte.
    expect(r.motDePasseSmtpPresente).toBe(false);
  });

  it('une seule place : une seule inscription, même avec dix demandes en même temps', () => {
    expect(r.courses).toEqual([1, 1, 1]);
  });

  it.skipIf(!DOCUMENTS)('sur une base de documents aussi, une seule place donne une seule inscription', () => {
    expect(documents!.courses).toEqual([1, 1, 1]);
  });

  it.skipIf(!DOCUMENTS)('une sauvegarde modifiée pour ajouter un index à expiration sur une donnée est refusée', () => {
    // La sauvegarde de trois événements, restaurée dans une base neuve : avec l'index ajouté à la main, la base
    // efface d'elle-même toutes les fiches en une minute, et toutes celles qui suivront.
    const releve = JSON.parse(execFileSync('node', [new URL('./serveur-attaques-revue-300-sauvegarde.mjs', import.meta.url).pathname, dossier, DOCUMENTS!], { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n').at(-1)!) as Releve;
    expect(releve.restauration).not.toBe('acceptée');
    expect(releve.fichesPlusTard).toBe(releve.fichesApresRestauration);
    // Un index unique ou partiel ajouté, une expiration sur les comptes : refusés, rien d'écrit ; le fichier intact passe.
    const variantes = releve.variantes as Record<string, { refusee: boolean; fiches: number }>;
    for (const nom of ['uniqueSurUneDonnee', 'uniqueSurLeRole', 'partielDetourne', 'expirationSurLesComptes']) expect(variantes[nom], nom).toEqual({ refusee: true, fiches: 0 });
    expect(variantes.temoin).toEqual({ refusee: false, fiches: 3 });
  }, 300_000);

  it('le témoin : un serveur seul limite les requêtes venues de sa machine', () => {
    expect(r.limiteLocaleServeurSeul).toBeGreaterThan(0);
  });
});
