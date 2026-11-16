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
 * La sauvegarde et la restauration sur un vrai PostgreSQL (16 novembre 2026). Défaut trouvé en essayant un serveur
 * produit pour de vrai : sur une base neuve, même après le premier démarrage conseillé, la restauration échouait,
 * parce que plusieurs tables (jetons fermés, comptes fermés, sessions…) ne sont créées qu'à leur premier usage.
 * La sauvegarde emporte maintenant la forme de chaque table ; la restauration crée celles qui manquent.
 * Tourne quand HUMALIS_ESSAI_POSTGRES donne un serveur PostgreSQL où l'on peut créer des bases.
 */
const ADMIN = process.env.HUMALIS_ESSAI_POSTGRES;
const SOURCE = readFileSync(new URL('./serveur-attaques-calculs.humalis', import.meta.url), 'utf8');
const dossier = join(tmpdir(), 'humalis-sauvegarde-postgres');
const suffixe = `${process.pid}_${Date.now()}`;
const bases = { source: `humalis_essai_source_${suffixe}`, neuve: `humalis_essai_neuve_${suffixe}`, piegee: `humalis_essai_piegee_${suffixe}` };
const adresse = (base: string) => {
  const url = new URL(ADMIN!);
  url.pathname = '/' + base;
  return url.href;
};
const psql = (base: string, requete: string) => execFileSync('psql', [adresse(base), '-Atc', requete], { encoding: 'utf8' }).trim();
const npm = (base: string, ...args: string[]) => {
  try {
    return { ok: true, sortie: execFileSync('npm', ['run', ...args], { cwd: dossier, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, DATABASE_URL: adresse(base) } }) };
  } catch (erreur) {
    const e = erreur as { stdout?: string; stderr?: string };
    return { ok: false, sortie: (e.stdout ?? '') + (e.stderr ?? '') };
  }
};
/** La forme d'une base : chaque colonne, chaque clé et chaque index, pour les comparer. */
const forme = (base: string) =>
  [
    psql(base, "SELECT string_agg(c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull || ' ' || coalesce(pg_get_expr(d.adbin, d.adrelid), ''), E'\\n' ORDER BY c.relname, a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid AND c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.attnum > 0 AND NOT a.attisdropped"),
    psql(base, "SELECT string_agg(indexdef, E'\\n' ORDER BY indexdef) FROM pg_indexes WHERE schemaname = 'public'"),
  ].join('\n');

let fichier = '';

describe.skipIf(!ADMIN)('la sauvegarde et la restauration sur un vrai PostgreSQL', () => {
  beforeAll(async () => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    rmSync(join(dossier, 'src'), { recursive: true, force: true });
    rmSync(join(dossier, 'dist'), { recursive: true, force: true });
    rmSync(join(dossier, 'sauvegardes'), { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'marche', source: 'marche.humalis' })) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    installerSiBesoin(dossier);
    execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
    for (const base of Object.values(bases)) psql('postgres', `CREATE DATABASE ${base}`);

    // Le vrai serveur, sur la base source : il crée ses tables ; une connexion remplit les sessions.
    const port = 4400 + (process.pid % 500);
    const serveur = spawn('node', ['dist/src/demarrer.js'], {
      cwd: dossier,
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: adresse(bases.source), PORT: String(port), JWT_SECRET: 'x'.repeat(40), HUMALIS_ADMIN_EMAIL: 'admin@essai.test', HUMALIS_ADMIN_MOT_DE_PASSE: 'Essai-Solide-2026!' },
    });
    try {
      const base = `http://localhost:${port}`;
      for (let i = 0; i < 60; i++) {
        if (await fetch(base + '/sante').then((r) => r.ok, () => false)) break;
        await new Promise((p) => setTimeout(p, 250));
      }
      const json = { 'content-type': 'application/json' };
      const jeton = (await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@essai.test', password: 'Essai-Solide-2026!' }) })).json()).data.token;
      const A = { ...json, authorization: 'Bearer ' + jeton };
      const tasse = await (await fetch(base + '/api/produits', { method: 'POST', headers: A, body: JSON.stringify({ nom: 'Tasse', prix: 12.5, boutique: 'A' }) })).json();
      await fetch(base + '/api/commandes', { method: 'POST', headers: A, body: JSON.stringify({ refs: [tasse.id], boutique: 'A' }) });
      await fetch(base + '/auth/logout', { method: 'POST', headers: A });
    } finally {
      serveur.kill('SIGTERM');
      await new Promise((p) => serveur.once('exit', p));
    }
    const sauvegarde = npm(bases.source, 'sauvegarde', '--', join(dossier, 'sauvegardes', 'essai.jsonl.gz'));
    expect(sauvegarde.ok, sauvegarde.sortie).toBe(true);
    fichier = join(dossier, 'sauvegardes', 'essai.jsonl.gz');
  }, 300_000);

  afterAll(() => {
    if (!ADMIN) return;
    for (const base of Object.values(bases)) psql('postgres', `DROP DATABASE IF EXISTS ${base} WITH (FORCE)`);
  });

  it('une base neuve, sans rien préparer, reçoit toute la sauvegarde, avec la même forme', () => {
    const restauration = npm(bases.neuve, 'restauration', '--', fichier);
    expect(restauration.ok, restauration.sortie).toBe(true);
    expect(restauration.sortie).toContain('Tables créées d');
    expect(psql(bases.neuve, "SELECT data->>'total' FROM humalis_commande")).toBe('12.5');
    expect(psql(bases.neuve, 'SELECT count(*) FROM astratra_users')).toBe('1');
    expect(forme(bases.neuve)).toBe(forme(bases.source));
    const verification = npm(bases.neuve, 'verification');
    expect(verification.ok, verification.sortie).toBe(true);
  });

  it('une sauvegarde modifiée pour exécuter autre chose est refusée, et rien n’est changé', () => {
    const lignes = gunzipSync(readFileSync(fichier)).toString('utf8').split('\n');
    const entete = JSON.parse(lignes[0]!);
    const colonne = entete.formes.humalis_commande.colonnes.find((c: { defaut: string | null }) => c.defaut === 'now()');
    colonne.defaut = "now()); DROP TABLE astratra_users; --";
    lignes[0] = JSON.stringify(entete);
    const piege = join(dossier, 'sauvegardes', 'piegee.jsonl.gz');
    writeFileSync(piege, gzipSync(lignes.join('\n')));
    const restauration = npm(bases.piegee, 'restauration', '--', piege);
    expect(restauration.ok).toBe(false);
    expect(restauration.sortie).toContain('forme dans la sauvegarde est inattendue');
    expect(psql(bases.piegee, "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")).toBe('0');
  });
});
