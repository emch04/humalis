import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { codeConnexionMysql } from '../src/cibles/serveur/chiffrement-mysql.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { compiler } from '../src/compilateur.js';

/**
 * Le chiffrement d'une base MySQL ou MariaDB, lu dans DATABASE_URL. mysql2 ignorait « ssl-mode=REQUIRED » et
 * « sslmode=require » (un avertissement) et se connectait en clair : chaque forme d'adresse est essayée ici, sur le
 * code produit pour les scripts d'exploitation (le même que celui du serveur, sans les types).
 */
type Connexion = { uri: string; ssl?: string | Record<string, unknown> };
let connexionMysql: (adresse: string) => Connexion;
let dossier: string;
const BASE = 'mysql://utilisateur:mot%40passe@base.exemple.fr:3306/boutique';

beforeAll(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'humalis-chiffrement-mysql-'));
  const module = join(dossier, 'connexion.mjs');
  writeFileSync(module, "import { readFileSync } from 'node:fs';\n" + codeConnexionMysql(false));
  ({ connexionMysql } = (await import(pathToFileURL(module).href)) as { connexionMysql: typeof connexionMysql });
});

const verifie = { rejectUnauthorized: true, verifyIdentity: true };

describe('le chiffrement de MySQL et MariaDB, lu dans DATABASE_URL', () => {
  it('sans réglage, rien ne change : mysql2 reçoit l’adresse telle quelle', () => {
    expect(connexionMysql(BASE)).toEqual({ uri: BASE });
  });

  it('les écritures des hébergeurs chiffrent, le certificat et le nom du serveur vérifiés', () => {
    for (const reglage of ['ssl-mode=REQUIRED', 'ssl-mode=required', 'sslmode=require', 'ssl_mode=REQUIRED', 'ssl-mode=VERIFY_IDENTITY', 'sslmode=verify-full', 'ssl=true', 'ssl=1']) {
      expect(connexionMysql(BASE + '?' + reglage), reglage).toEqual({ uri: BASE, ssl: verifie });
    }
  });

  it('VERIFY_CA vérifie le certificat, pas le nom du serveur', () => {
    expect(connexionMysql(BASE + '?ssl-mode=VERIFY_CA').ssl).toEqual({ rejectUnauthorized: true, verifyIdentity: false });
    expect(connexionMysql(BASE + '?sslmode=verify-ca').ssl).toEqual({ rejectUnauthorized: true, verifyIdentity: false });
  });

  it('DISABLED et ssl=false se connectent en clair, sans réglage TLS', () => {
    for (const reglage of ['ssl-mode=DISABLED', 'sslmode=disable', 'ssl=false']) expect(connexionMysql(BASE + '?' + reglage), reglage).toEqual({ uri: BASE });
  });

  it('PREFERRED est refusé : il se connecterait en clair, sans le dire, si la base ne chiffre pas', () => {
    expect(() => connexionMysql(BASE + '?ssl-mode=PREFERRED')).toThrow(/en clair, sans le dire.*ssl-mode=REQUIRED/);
    expect(() => connexionMysql(BASE + '?sslmode=prefer')).toThrow(/en clair/);
  });

  it('une valeur inconnue, ou deux réglages à la fois, arrêtent au lieu de se connecter en clair', () => {
    expect(() => connexionMysql(BASE + '?ssl-mode=OUI')).toThrow('« ssl-mode=OUI » est inconnu : écrivez REQUIRED, VERIFY_CA, VERIFY_IDENTITY ou DISABLED.');
    expect(() => connexionMysql(BASE + '?ssl-mode=REQUIRED&ssl=true')).toThrow('gardez-en un seul');
    expect(() => connexionMysql(BASE + '?ssl={pas du json')).toThrow('n’est pas un objet JSON valide');
    // Deux écritures du même réglage, même contradictoires (revue Codex) : refusées, jamais la première prise en silence.
    expect(() => connexionMysql(BASE + '?ssl-mode=DISABLED&sslmode=REQUIRED')).toThrow('un seul réglage du chiffrement, une seule fois');
    expect(() => connexionMysql(BASE + '?ssl=false&SSL=true')).toThrow('une seule fois');
    expect(() => connexionMysql(BASE + '?ssl-mode=REQUIRED&ssl-ca=/a.pem&sslrootcert=/b.pem')).toThrow('une seule fois');
  });

  it('ssl-ca (ou sslrootcert) donne l’autorité de l’hébergeur, lue dans son fichier', () => {
    const fichier = join(dossier, 'ca.pem');
    writeFileSync(fichier, '-----BEGIN CERTIFICATE-----\nessai\n-----END CERTIFICATE-----\n');
    const ca = '-----BEGIN CERTIFICATE-----\nessai\n-----END CERTIFICATE-----\n';
    expect(connexionMysql(BASE + '?ssl-mode=REQUIRED&ssl-ca=' + encodeURIComponent(fichier))).toEqual({ uri: BASE, ssl: { ...verifie, ca } });
    // Seule, l'autorité demande le chiffrement.
    expect(connexionMysql(BASE + '?sslrootcert=' + encodeURIComponent(fichier))).toEqual({ uri: BASE, ssl: { ...verifie, ca } });
    expect(() => connexionMysql(BASE + '?ssl-mode=REQUIRED&ssl-ca=/introuvable/ca.pem')).toThrow('ssl-ca : le fichier « /introuvable/ca.pem » ne se lit pas.');
    expect(() => connexionMysql(BASE + '?ssl-mode=DISABLED&ssl-ca=' + encodeURIComponent(fichier))).toThrow('désactive le chiffrement');
  });

  it('ssl={…} passe tel quel à mysql2, et reçoit l’autorité donnée à part', () => {
    expect(connexionMysql(BASE + '?ssl={"rejectUnauthorized":true,"minVersion":"TLSv1.3"}').ssl).toEqual({ rejectUnauthorized: true, minVersion: 'TLSv1.3' });
    const fichier = join(dossier, 'autorite.pem');
    writeFileSync(fichier, 'AUTORITE');
    expect(connexionMysql(BASE + '?ssl={"minVersion":"TLSv1.3"}&ssl-ca=' + encodeURIComponent(fichier)).ssl).toEqual({ minVersion: 'TLSv1.3', ca: 'AUTORITE' });
  });

  it('les autres réglages de l’adresse restent, et mariadb:// devient mysql:// pour mysql2', () => {
    expect(connexionMysql(BASE + '?connectTimeout=5000&ssl-mode=REQUIRED')).toEqual({ uri: BASE + '?connectTimeout=5000', ssl: verifie });
    expect(connexionMysql('mariadb://u:p@h:3307/b?ssl-mode=REQUIRED')).toEqual({ uri: 'mysql://u:p@h:3307/b', ssl: verifie });
  });

  it('le serveur produit et ses scripts lisent le chiffrement ; le .env.exemple dit comment l’écrire pour chaque base', () => {
    const { application } = compiler('serveur "api" :\n    donnee note :\n        texte : texte\n');
    const fichiers = genererProjetServeur(application!.serveurs[0]!, { nom: 'api', source: 'api.humalis' });
    expect(fichiers.get('src/humalis/mysql.ts')).toContain('...connexionMysql(adresse),');
    expect(fichiers.get('src/humalis/mysql.ts')).toContain('export function connexionMysql(adresse: string): { uri: string;');
    expect(fichiers.get('scripts/bases/mysql.mjs')).toContain('...connexionMysql(url),');
    expect(fichiers.get('src/demarrer.ts') ?? [...fichiers.values()].find((c) => c.includes('connexionMysql(adresseBase!)'))).toContain("arreter('DATABASE_URL : '");
    const env = fichiers.get('.env.exemple')!;
    expect(env).toContain('?sslmode=require');
    expect(env).toContain('?ssl-mode=REQUIRED');
    expect(env).toContain('?tls=true');
  });
});
