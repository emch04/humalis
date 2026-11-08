#!/usr/bin/env node
/**
 * La connexion avec Apple contre un vrai serveur Humalis et la vraie vérification d'Astratra.
 * Seules les clés publiques d'Apple sont remplacées : aucun vrai compte Apple n'est utilisé.
 *
 * HUMALIS_ESSAI_APPLE : le dossier de travail.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as attendre } from 'node:timers/promises';

const racine = resolve(import.meta.dirname, '..');
const travail = join(process.env.HUMALIS_ESSAI_APPLE ?? join(tmpdir(), 'humalis-essai-apple'), 'serveur-apple');
const serveur = join(travail, 'serveur');
const PORT = 4981;
const BASE = `http://localhost:${PORT}`;
const ADMIN = 'admin@essai.test';
const AUDIENCE = 'local.humalis.essai';
mkdirSync(travail, { recursive: true });
execFileSync('npm', ['run', 'build'], { cwd: racine, stdio: 'ignore' });
execFileSync('node', [join(racine, 'dist/cli.js'), 'compile', join(racine, 'scripts/essais-apple/connexion-apple.humalis'), '--cible', 'serveur', '--sortie', serveur], { stdio: 'ignore' });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: serveur, stdio: 'ignore' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'ignore' });

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = join(travail, 'jwks.json');
writeFileSync(jwks, JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'essai', alg: 'RS256', use: 'sig' }] }));
const base64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jeton(champs) {
  const maintenant = Math.floor(Date.now() / 1000);
  const corps = `${base64({ alg: 'RS256', kid: 'essai' })}.${base64({ iss: 'https://appleid.apple.com', aud: AUDIENCE, sub: 'sujet-1', email: ADMIN, email_verified: 'true', iat: maintenant, exp: maintenant + 600, nonce: 'n1', ...champs })}`;
  return `${corps}.${createSign('RSA-SHA256').update(corps).sign(privateKey).toString('base64url')}`;
}

const processus = spawn('node', ['--import', join(racine, 'scripts/essais-apple/faux-apple.mjs'), '--env-file-if-exists=.env', 'dist/src/demarrer.js'], {
  cwd: serveur,
  stdio: 'ignore',
  env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: ADMIN, HUMALIS_ADMIN_MOT_DE_PASSE: 'Admin-Essai-2026!', PORT: String(PORT), APPLE_APP_ID: AUDIENCE, HUMALIS_FAUX_JWKS: jwks },
});
let echecs = 0;
const verifier = (ok, phrase) => {
  console.log(`${ok ? '✓' : '✗'} ${phrase}`);
  if (!ok) echecs++;
};
try {
  for (let i = 0; i < 60; i++) {
    if (await fetch(`${BASE}/api/produits`).then((r) => r.ok, () => false)) break;
    await attendre(500);
  }
  // Comme l'application : le jeton CSRF posé par la première lecture repart avec l'envoi.
  const amorce = await fetch(`${BASE}/auth/apple`);
  const csrf = /astratra_csrf=([^;]+)/.exec(amorce.headers.get('set-cookie') ?? '')?.[1] ?? '';
  const envoyer = async (idToken, nonce = 'n1') => {
    const r = await fetch(`${BASE}/auth/apple`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-humalis-mobile': '1', cookie: `astratra_csrf=${csrf}`, 'x-csrf-token': csrf }, body: JSON.stringify({ idToken, nonce }) });
    return { statut: r.status, corps: await r.json().catch(() => null) };
  };
  const bon = await envoyer(jeton({}));
  verifier(bon.statut === 200 && Boolean(bon.corps?.token) && Boolean(bon.corps?.refreshToken), 'un compte connu ouvre sa session, avec le renouvellement pour le téléphone');
  const moi = await fetch(`${BASE}/auth/me`, { headers: { authorization: `Bearer ${bon.corps?.token}`, 'x-humalis-mobile': '1' } }).then((r) => r.json());
  verifier((moi.data?.email ?? moi.email) === ADMIN, 'la session est bien celle du compte');
  verifier((await envoyer(jeton({ aud: 'autre.application' }))).statut === 401, 'un jeton fait pour une autre application est refusé');
  verifier((await envoyer(jeton({}), 'autre-nonce')).statut === 401, 'un nonce différent est refusé');
  const inconnu = await envoyer(jeton({ email: 'inconnu@essai.test', sub: 'sujet-2' }));
  verifier(inconnu.statut === 403 && /pas accès/.test(inconnu.corps?.erreur), 'un compte Apple inconnu du serveur est refusé');
  const autre = await envoyer(jeton({ sub: 'sujet-3' }));
  verifier(autre.statut === 403 && /autre compte Apple/.test(autre.corps?.erreur), 'une adresse déjà liée refuse un autre compte Apple');
} finally {
  processus.kill();
}
console.log(echecs ? `✗ ${echecs} échec(s)` : '✓ connexion Apple');
process.exitCode = echecs ? 1 : 0;
