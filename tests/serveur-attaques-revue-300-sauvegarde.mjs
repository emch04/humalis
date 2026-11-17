// La revue de sécurité de la 3.0.0 (17 novembre 2026) : une sauvegarde d'une base de documents, modifiée à la main pour
// qu'une collection de données gagne un index à expiration. La restauration ne doit pas l'accepter.
//   node serveur-attaques-revue-300-sauvegarde.mjs <dossier du serveur produit> <adresse du serveur de documents>
// La dernière ligne écrite est un relevé JSON.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
const [dossier, admin] = process.argv.slice(2);
const adresse = (nom) => { const u = new URL(admin); u.pathname = '/' + nom; return u.href; };
const suffixe = process.pid + '_' + Date.now();
const source = adresse('revue300_source_' + suffixe), neuve = adresse('revue300_neuve_' + suffixe);
const { NODE_ENV, ...env } = process.env;
const port = 5900 + (process.pid % 90);
const s = spawn('node', ['dist/src/demarrer.js'], { cwd: dossier, env: { ...env, DATABASE_URL: source, PORT: String(port), JWT_SECRET: 'x'.repeat(40), HUMALIS_ADMIN_EMAIL: 'admin@essai.test', HUMALIS_ADMIN_MOT_DE_PASSE: 'Essai-Solide-2026!' } });
const base = 'http://127.0.0.1:' + port; const json = { 'content-type': 'application/json' };
for (let i = 0; i < 100; i++) { if (await fetch(base + '/sante').then((r) => r.ok, () => false)) break; await new Promise((p) => setTimeout(p, 200)); }
const A = { ...json, authorization: 'Bearer ' + (await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@essai.test', password: 'Essai-Solide-2026!' }) })).json()).data.token };
for (let i = 0; i < 3; i++) await fetch(base + '/api/evenements', { method: 'POST', headers: A, body: JSON.stringify({ nom: 'Atelier ' + i, places: 5 }) });
s.kill('SIGTERM'); await new Promise((p) => s.once('exit', p));
const npm = (url, ...args) => { try { return execFileSync('npm', ['run', ...args], { cwd: dossier, encoding: 'utf8', stdio: 'pipe', env: { ...env, DATABASE_URL: url } }); } catch (e) { return 'ÉCHEC ' + (e.stdout ?? '') + (e.stderr ?? ''); } };
const fichier = dossier + '/sauvegardes/revue300-' + suffixe + '.jsonl.gz';
npm(source, 'sauvegarde', '--', fichier);
const lignes = gunzipSync(readFileSync(fichier)).toString('utf8').split('\n');
const entete = JSON.parse(lignes[0]);
entete.formes.humalis_evenement.index.push({ nom: 'menage', cles: { cree_le: 1 }, expireAfterSeconds: 0 });
lignes[0] = JSON.stringify(entete);
const piege = fichier.replace('revue300-', 'revue300-piege-');
writeFileSync(piege, gzipSync(lignes.join('\n')));
const sortie = npm(neuve, 'restauration', '--', piege);
const { MongoClient } = await import(dossier + '/node_modules/mongodb/lib/index.js');
const c = new MongoClient(neuve); await c.connect();
const compter = () => c.db().collection('humalis_evenement').countDocuments();
const r = { restauration: sortie.includes('Restauration faite') ? 'acceptée' : sortie.slice(-300), fichesApresRestauration: await compter() };
for (let i = 0; i < 30 && (await compter()) > 0; i++) await new Promise((p) => setTimeout(p, 5000));
r.fichesPlusTard = await compter();
// D'autres index piégés, chacun dans une base neuve : refusés, et rien n'est écrit. Le témoin, le fichier tel quel, passe.
const variantes = {
  uniqueSurUneDonnee: (e) => e.formes.humalis_evenement.index.push({ nom: 'un_seul', cles: { 'data.places': 1 }, unique: true }),
  uniqueSurLeRole: (e) => e.formes.astratra_users.index.push({ nom: 'un_admin', cles: { role: 1 }, unique: true }),
  partielDetourne: (e) => e.formes.astratra_users.index.push({ nom: 'partiel', cles: { role: 1 }, unique: true, partialFilterExpression: { role: { $type: 'string' } } }),
  expirationSurLesComptes: (e) => e.formes.astratra_users.index.push({ nom: 'menage', cles: { email: -1 }, expireAfterSeconds: 1 }),
  temoin: () => undefined,
};
r.variantes = {};
for (const [nom, changer] of Object.entries(variantes)) {
  const e = JSON.parse(gunzipSync(readFileSync(fichier)).toString('utf8').split('\n')[0]);
  changer(e);
  const autres = gunzipSync(readFileSync(fichier)).toString('utf8').split('\n');
  autres[0] = JSON.stringify(e);
  const f = fichier.replace('revue300-', 'revue300-' + nom + '-');
  writeFileSync(f, gzipSync(autres.join('\n')));
  const cible = adresse('revue300_' + nom.toLowerCase() + '_' + suffixe);
  const dite = npm(cible, 'restauration', '--', f);
  const d = new MongoClient(cible); await d.connect();
  r.variantes[nom] = { refusee: dite.includes('ne crée pas') || dite.includes('inattendue'), fiches: await d.db().collection('humalis_evenement').countDocuments() };
  await d.db().dropDatabase(); await d.close();
  rmSync(f, { force: true });
}
await c.db().dropDatabase(); await c.db('revue300_source_' + suffixe).dropDatabase(); await c.close();
rmSync(fichier, { force: true }); rmSync(piege, { force: true });
console.log(JSON.stringify(r));
