import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * Le défaut de serveur de la cinquième revue (14 novembre 2026), rejoué sur un VRAI serveur produit : un gérant sans
 * boutique voyait et retirait tous les comptes sans boutique (« undefined === undefined »).
 */
const SOURCE = readFileSync(new URL('./serveur-attaques-revue-5.humalis', import.meta.url), 'utf8');

const SCENARIO = `
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';

const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
const cree = {};
for (const [email, role, plus] of [
  ['gerant.a@essai.test', 'gerant', { boutique: 'A' }],
  ['gerant.sans@essai.test', 'gerant', {}],
  ['client.sans@essai.test', 'client', { telephone: '0611111111' }],
  ['client.a@essai.test', 'client', { boutique: 'A' }],
]) cree[email] = await usersStore.create({ email, role, passwordHash, ...plus });
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages: { facture: creerStockageMemoire() } });
const ecoute = app.listen(0);
await new Promise((pret) => ecoute.once('listening', pret));
const base = 'http://127.0.0.1:' + ecoute.address().port;
const json = { 'content-type': 'application/json' };
const qui = async (email) => ({ ...json, authorization: 'Bearer ' + (await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email, password: secret }) })).json()).data.token });
const appel = async (methode, chemin, entetes) => {
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};
const [gA, gSans] = [await qui('gerant.a@essai.test'), await qui('gerant.sans@essai.test')];
const emails = (reponse) => (Array.isArray(reponse.corps) ? reponse.corps : reponse.corps?.data ?? []).map((c) => c.email).sort();
const r = {};
r.equipeSans = emails(await appel('GET', '/api/equipe', gSans));
r.equipeA = emails(await appel('GET', '/api/equipe', gA));
r.retraitSans = (await appel('DELETE', '/api/equipe/' + cree['client.sans@essai.test'].id, gSans)).statut;
r.clientSansEncore = (await usersStore.findByEmail?.('client.sans@essai.test'))?.role ?? null;
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

let r: Record<string, unknown>;

describe('la cinquième revue, sur un vrai serveur produit', () => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const dossier = join(tmpdir(), 'humalis-attaques-revue-5');
    rmSync(join(dossier, 'src'), { recursive: true, force: true });
    rmSync(join(dossier, 'dist'), { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'commerce', source: 'commerce.humalis' })) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    writeFileSync(join(dossier, 'scenario.mjs'), SCENARIO);
    if (!existsSync(join(dossier, 'node_modules', 'typescript'))) execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'pipe' });
    execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
    r = JSON.parse(execFileSync('node', ['scenario.mjs'], { cwd: dossier, encoding: 'utf8' }).trim().split('\n').at(-1)!);
  }, 300_000);

  it('un gérant sans boutique ne voit ni ne retire les comptes sans boutique', () => {
    expect(r.equipeSans).toEqual([]);
    expect([403, 404]).toContain(r.retraitSans);
  });
  it('un gérant de la boutique A voit les comptes de sa boutique, et eux seuls', () => {
    expect(r.equipeA).toEqual(['client.a@essai.test', 'gerant.a@essai.test']);
  });
});
