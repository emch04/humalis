import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { installerSiBesoin } from './aide-installation.js';

/**
 * Les bases ajoutées le 17 novembre 2026, essayées pour de vrai : MySQL, MariaDB et une base de documents.
 * Chaque essai tourne quand sa variable donne un serveur où l'on peut créer des bases :
 *   HUMALIS_ESSAI_MYSQL=mysql://root:…@127.0.0.1:3306      HUMALIS_ESSAI_MARIADB=mariadb://root:…@127.0.0.1:3307
 *   HUMALIS_ESSAI_DOCUMENTS=mongodb://127.0.0.1:27017/?directConnection=true   (un jeu de répliques)
 * Pour chacune : tous les magasins rejoués (serveur-bases-magasins.mjs), puis un vrai serveur produit qui démarre,
 * suit un champ renommé et un champ ajouté, se sauvegarde, se restaure dans une base neuve et se vérifie.
 */
const BASES = [
  { genre: 'MySQL', admin: process.env.HUMALIS_ESSAI_MYSQL },
  { genre: 'MariaDB', admin: process.env.HUMALIS_ESSAI_MARIADB },
  { genre: 'documents', admin: process.env.HUMALIS_ESSAI_DOCUMENTS },
].filter((b) => b.admin);

const MAGASINS = readFileSync(new URL('./serveur-bases-magasins.humalis', import.meta.url), 'utf8');
const SCENARIO = readFileSync(new URL('./serveur-bases-magasins.mjs', import.meta.url), 'utf8');
const PROGRAMME = readFileSync(new URL('./serveur-attaques-calculs.humalis', import.meta.url), 'utf8');
// Le même programme, plus tard : « nom » devient « libelle », et « vu » arrive avec sa valeur de départ.
const PROGRAMME_APRES = PROGRAMME.replace('        nom : texte\n        prix : nombre', '        libelle : texte (avant "nom")\n        prix : nombre\n        vu : booleen au depart faux');
const suffixe = `${process.pid}_${Date.now()}`;

function produire(source: string, dossier: string, nom: string): void {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
  for (const sousDossier of ['src', 'dist', 'tests', 'scripts']) rmSync(join(dossier, sousDossier), { recursive: true, force: true });
  for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom, source: `${nom}.humalis` })) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  installerSiBesoin(dossier);
  execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
}

/** L'adresse d'une base de ce serveur ; « nom » la désigne. */
function adresse(admin: string, nom: string): string {
  const url = new URL(admin);
  url.pathname = '/' + nom;
  return url.href;
}

/** Un petit programme lancé dans le dossier du serveur produit, avec ses pilotes de base. */
function lancer(dossier: string, code: string, env: Record<string, string> = {}): string {
  return execFileSync('node', ['--input-type=module', '-e', code], { cwd: dossier, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } }).trim();
}

function creerBase(dossier: string, admin: string, nom: string): string {
  if (!admin.startsWith('mongodb')) lancer(dossier, `import m from 'mysql2/promise'; const c = await m.createConnection(${JSON.stringify(admin.replace(/^mariadb:/, 'mysql:'))}); await c.query('DROP DATABASE IF EXISTS ${nom}'); await c.query('CREATE DATABASE ${nom}'); await c.end();`);
  return adresse(admin, nom);
}

function supprimerBase(dossier: string, admin: string, nom: string): void {
  if (admin.startsWith('mongodb')) lancer(dossier, `import { MongoClient } from 'mongodb'; const c = new MongoClient(${JSON.stringify(adresse(admin, nom))}); await c.db().dropDatabase(); await c.close();`);
  else lancer(dossier, `import m from 'mysql2/promise'; const c = await m.createConnection(${JSON.stringify(admin.replace(/^mariadb:/, 'mysql:'))}); await c.query('DROP DATABASE IF EXISTS ${nom}'); await c.end();`);
}

/** Les fiches d'une donnée, lues directement dans la base. */
function fiches(dossier: string, url: string, table: string): Record<string, unknown>[] {
  if (url.startsWith('mongodb')) {
    return JSON.parse(lancer(dossier, `import { MongoClient } from 'mongodb'; const c = new MongoClient(${JSON.stringify(url)}); const l = await c.db().collection('${table}').find().sort({ ordre: 1 }).toArray(); console.log(JSON.stringify(l.map((d) => d.data))); await c.close();`));
  }
  return JSON.parse(lancer(dossier, `import m from 'mysql2/promise'; const c = await m.createConnection(${JSON.stringify(url.replace(/^mariadb:/, 'mysql:'))}); const [l] = await c.query('SELECT data FROM ${table} ORDER BY ordre'); console.log(JSON.stringify(l.map((x) => typeof x.data === 'string' ? JSON.parse(x.data) : x.data))); await c.end();`));
}

function npm(dossier: string, url: string, ...args: string[]): { ok: boolean; sortie: string } {
  try {
    return { ok: true, sortie: execFileSync('npm', ['run', ...args], { cwd: dossier, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } }) };
  } catch (erreur) {
    const e = erreur as { stdout?: string; stderr?: string };
    return { ok: false, sortie: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

/** Le vrai serveur, le temps de « faire ». */
async function avecServeur(dossier: string, url: string, faire: (adresse: string, entetes: Record<string, string>) => Promise<void>): Promise<string> {
  const port = 4900 + (process.pid % 400) + Math.floor(Math.random() * 50);
  const serveur = spawn('node', ['dist/src/demarrer.js'], {
    cwd: dossier,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url, PORT: String(port), JWT_SECRET: 'x'.repeat(40), HUMALIS_ADMIN_EMAIL: 'admin@essai.test', HUMALIS_ADMIN_MOT_DE_PASSE: 'Essai-Solide-2026!' },
  });
  let journal = '';
  serveur.stdout.on('data', (d) => (journal += d));
  serveur.stderr.on('data', (d) => (journal += d));
  try {
    const base = `http://localhost:${port}`;
    let pret = false;
    for (let i = 0; i < 80 && !pret; i++) {
      pret = await fetch(base + '/sante').then((r) => r.ok, () => false);
      if (!pret) await new Promise((p) => setTimeout(p, 250));
    }
    expect(pret, journal).toBe(true);
    const json = { 'content-type': 'application/json' };
    const connexion = await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@essai.test', password: 'Essai-Solide-2026!' }) })).json();
    await faire(base, { ...json, authorization: 'Bearer ' + connexion.data.token });
  } finally {
    serveur.kill('SIGTERM');
    await new Promise((p) => serveur.once('exit', p));
  }
  return journal;
}

for (const { genre, admin } of BASES) {
  describe(`${genre} pour de vrai`, () => {
    const dossierMagasins = join(tmpdir(), `humalis-bases-magasins-${genre}`);
    const dossier = join(tmpdir(), `humalis-bases-serveur-${genre}`);
    const noms = { magasins: `humalis_magasins_${suffixe}`, source: `humalis_source_${suffixe}`, neuve: `humalis_neuve_${suffixe}`, piegee: `humalis_piegee_${suffixe}`, longue: `humalis_longue_${suffixe}` };
    let sortieMagasins = '';
    let urlSource = '';
    let sauvegarde = '';

    beforeAll(async () => {
      produire(MAGASINS, dossierMagasins, 'tout');
      writeFileSync(join(dossierMagasins, 'magasins.mjs'), SCENARIO);
      try {
        sortieMagasins = execFileSync('node', ['magasins.mjs'], { cwd: dossierMagasins, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, DATABASE_URL: creerBase(dossierMagasins, admin!, noms.magasins) } });
      } catch (erreur) {
        sortieMagasins = String((erreur as { stdout?: unknown }).stdout ?? '') + String((erreur as { stderr?: unknown }).stderr ?? erreur);
      }

      produire(PROGRAMME, dossier, 'marche');
      urlSource = creerBase(dossier, admin!, noms.source);
      await avecServeur(dossier, urlSource, async (base, A) => {
        const tasse = await (await fetch(base + '/api/produits', { method: 'POST', headers: A, body: JSON.stringify({ nom: 'Tasse', prix: 12.5, boutique: 'A' }) })).json();
        await fetch(base + '/api/produits', { method: 'POST', headers: A, body: JSON.stringify({ nom: 'Bol', prix: 4, boutique: 'B' }) });
        const commande = await fetch(base + '/api/commandes', { method: 'POST', headers: A, body: JSON.stringify({ refs: [tasse.id], boutique: 'A' }) });
        expect(commande.status).toBe(201);
        await fetch(base + '/auth/logout', { method: 'POST', headers: A });
      });
    }, 600_000);

    afterAll(() => {
      for (const nom of Object.values(noms)) {
        try {
          supprimerBase(dossier, admin!, nom);
        } catch {
          // Une base jamais créée.
        }
      }
    });

    it('tous les magasins tiennent', () => {
      expect(sortieMagasins, sortieMagasins).toContain('Tous les magasins tiennent sur cette base.');
    });

    it('le serveur produit écrit ses fiches, et calcule le total', () => {
      expect(fiches(dossier, urlSource, 'humalis_produit').map((f) => f.nom)).toEqual(['Tasse', 'Bol']);
      expect(fiches(dossier, urlSource, 'humalis_commande')[0]!.total).toBe(12.5);
    });

    it('un champ renommé garde sa valeur, un champ ajouté reçoit sa valeur de départ', async () => {
      const dossierApres = join(tmpdir(), `humalis-bases-apres-${genre}`);
      produire(PROGRAMME_APRES, dossierApres, 'marche');
      await avecServeur(dossierApres, urlSource, async (base, A) => {
        const produits = (await (await fetch(base + '/api/produits', { headers: A })).json()) as Record<string, unknown>[];
        expect(produits.map((p) => [p.libelle, p.vu, p.nom])).toEqual([['Tasse', false, undefined], ['Bol', false, undefined]]);
        // Une lecture filtrée par groupe, et une modification.
        const filtres = (await (await fetch(base + '/api/produits?boutique=B', { headers: A })).json()) as Record<string, unknown>[];
        expect(filtres.map((p) => p.libelle)).toEqual(['Bol']);
        expect((await fetch(`${base}/api/produits/${String(produits[0]!.id)}`, { method: 'PATCH', headers: A, body: JSON.stringify({ prix: 13 }) })).status).toBe(200);
      });
      expect(fiches(dossier, urlSource, 'humalis_produit').map((f) => [f.libelle, f.vu, f.prix])).toEqual([['Tasse', false, 13], ['Bol', false, 4]]);
    }, 300_000);

    it('la sauvegarde se restaure dans une base neuve, sans rien préparer, et se vérifie', () => {
      sauvegarde = join(dossier, 'sauvegardes', `essai-${suffixe}.jsonl.gz`);
      const ecrite = npm(dossier, urlSource, 'sauvegarde', '--', sauvegarde);
      expect(ecrite.ok, ecrite.sortie).toBe(true);
      const urlNeuve = creerBase(dossier, admin!, noms.neuve);
      const restauree = npm(dossier, urlNeuve, 'restauration', '--', sauvegarde);
      expect(restauree.ok, restauree.sortie).toBe(true);
      expect(fiches(dossier, urlNeuve, 'humalis_commande')[0]!.total).toBe(12.5);
      expect(fiches(dossier, urlNeuve, 'humalis_produit').map((f) => f.prix)).toEqual([13, 4]);
      // Une seconde restauration refuse d'écrire par-dessus, sauf « --remplacer ».
      const encore = npm(dossier, urlNeuve, 'restauration', '--', sauvegarde);
      expect(encore.ok).toBe(false);
      expect(encore.sortie).toContain('--remplacer');
      expect(npm(dossier, urlNeuve, 'restauration', '--', sauvegarde, '--remplacer').ok).toBe(true);
      expect(fiches(dossier, urlNeuve, 'humalis_produit')).toHaveLength(2);
      const verification = npm(dossier, urlNeuve, 'verification');
      expect(verification.ok, verification.sortie).toBe(true);
    });

    it('une sauvegarde modifiée pour faire créer autre chose est refusée, et rien n’est écrit', () => {
      const lignes = gunzipSync(readFileSync(sauvegarde)).toString('utf8').split('\n');
      const entete = JSON.parse(lignes[0]!);
      const premiere = entete.tables[0];
      if (genre === 'documents') entete.formes[premiere].index = [{ nom: 'x', cles: { $where: 'sleep(1)' } }];
      else entete.formes[premiere].colonnes[0].type = 'longtext); DROP DATABASE mysql; --';
      lignes[0] = JSON.stringify(entete);
      const piege = join(dossier, 'sauvegardes', `piegee-${suffixe}.jsonl.gz`);
      writeFileSync(piege, gzipSync(lignes.join('\n')));
      const urlPiegee = creerBase(dossier, admin!, noms.piegee);
      const restauree = npm(dossier, urlPiegee, 'restauration', '--', piege);
      expect(restauree.ok).toBe(false);
      expect(restauree.sortie).toContain('inattendue');
      // Aucune fiche écrite : la table manque (MySQL), ou la collection est vide (documents).
      let ecrites: unknown[] = [];
      try {
        ecrites = fiches(dossier, urlPiegee, 'humalis_produit');
      } catch {
        ecrites = [];
      }
      expect(ecrites).toEqual([]);
    });

    it('une ligne démesurée (un fichier piégé, petit une fois compressé) est refusée sans être gardée en mémoire', () => {
      const lignes = gunzipSync(readFileSync(sauvegarde)).toString('utf8').split('\n');
      // Une seule ligne de 3 Mo, juste après l'en-tête : avec un plafond de 1 Mo, la lecture s'arrête avant sa fin.
      lignes.splice(1, 0, JSON.stringify({ table: 'humalis_produit', ligne: { id: 'x', data: { nom: 'a'.repeat(3 * 1024 * 1024) } } }));
      const piege = join(dossier, 'sauvegardes', `longue-${suffixe}.jsonl.gz`);
      writeFileSync(piege, gzipSync(lignes.join('\n')));
      expect(readFileSync(piege).length).toBeLessThan(64 * 1024);
      const urlLongue = creerBase(dossier, admin!, noms.longue);
      process.env.HUMALIS_SAUVEGARDE_LIGNE_MAX = String(1024 * 1024);
      let restauree: { ok: boolean; sortie: string };
      try {
        restauree = npm(dossier, urlLongue, 'restauration', '--', piege);
      } finally {
        delete process.env.HUMALIS_SAUVEGARDE_LIGNE_MAX;
      }
      expect(restauree.ok).toBe(false);
      expect(restauree.sortie).toContain('une ligne de la sauvegarde dépasse 1048576 octets');
      let ecrites: unknown[] = [];
      try {
        ecrites = fiches(dossier, urlLongue, 'humalis_produit');
      } catch {
        ecrites = [];
      }
      expect(ecrites).toEqual([]);
    });
  });
}

describe.skipIf(BASES.length > 0)('les bases ajoutées', () => {
  it.skip('HUMALIS_ESSAI_MYSQL, HUMALIS_ESSAI_MARIADB ou HUMALIS_ESSAI_DOCUMENTS donnent un serveur où essayer', () => undefined);
});
