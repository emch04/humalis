import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { codeReglagesPostgres } from '../src/cibles/serveur/connexion-postgres.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { compiler } from '../src/compilateur.js';

/**
 * Les adresses des PostgreSQL hébergés : « channel_binding=require » était ignoré sans rien dire, « sslmode=require »
 * dépendait d'un choix de pg qu'il annonce changer, et un relais de connexions en mode transaction coupait les
 * annonces en direct sans que personne le sache.
 */
type Reglages = { connectionString: string; enableChannelBinding?: boolean; Client?: unknown };
const pgFaux = { Client: class {} };
let reglagesPostgresBrut: (adresse: string, pg: unknown) => Reglages;
const reglagesPostgres = (adresse: string): Reglages => reglagesPostgresBrut(adresse, pgFaux);
let relaisDeConnexions: (adresse: string) => boolean;
const BASE = 'postgresql://utilisateur:mot%40passe@base.exemple.fr/boutique';

beforeAll(async () => {
  const module = join(mkdtempSync(join(tmpdir(), 'humalis-postgres-')), 'postgres.mjs');
  writeFileSync(module, codeReglagesPostgres(false, true));
  ({ reglagesPostgres: reglagesPostgresBrut, relaisDeConnexions } = (await import(pathToFileURL(module).href)) as { reglagesPostgres: typeof reglagesPostgresBrut; relaisDeConnexions: typeof relaisDeConnexions });
});

describe('les adresses de PostgreSQL', () => {
  it('sans réglage, pg reçoit l’adresse telle quelle', () => {
    expect(reglagesPostgres(BASE)).toEqual({ connectionString: BASE });
  });

  it('channel_binding=require est obligatoire : un client qui refuse toute authentification sans liaison au canal', () => {
    const lie = reglagesPostgres(BASE + '?sslmode=verify-full&channel_binding=require');
    expect(lie).toMatchObject({ connectionString: BASE + '?sslmode=verify-full', enableChannelBinding: true });
    expect(typeof lie.Client).toBe('function');
    // « prefer » : préférée, pas exigée ; « disable » : retirée.
    expect(reglagesPostgres(BASE + '?channel_binding=prefer')).toEqual({ connectionString: BASE, enableChannelBinding: true });
    expect(reglagesPostgres(BASE + '?channel_binding=disable').enableChannelBinding).toBe(false);
    expect(() => reglagesPostgres(BASE + '?channel_binding=oui')).toThrow('« channel_binding=oui » est inconnu : écrivez require, prefer ou disable.');
  });

  it('channel_binding=require sans chiffrement, ou un réglage donné deux fois : le serveur ne démarre pas', () => {
    expect(() => reglagesPostgres(BASE + '?channel_binding=require')).toThrow('channel_binding=require demande une connexion chiffrée');
    expect(() => reglagesPostgres(BASE + '?channel_binding=require&sslmode=disable')).toThrow('demande une connexion chiffrée');
    expect(() => reglagesPostgres(BASE + '?sslmode=require&channel_binding=prefer&channel_binding=disable')).toThrow('channel_binding est donné deux fois');
    expect(() => reglagesPostgres(BASE + '?sslmode=disable&SSLMODE=require')).toThrow('sslmode est donné deux fois');
  });

  it('SSLMODE en majuscules devient sslmode, le nom que pg lit ; uselibpqcompat ne compte que s’il vaut true', () => {
    expect(reglagesPostgres(BASE + '?SSLMODE=require').connectionString).toBe(BASE + '?sslmode=verify-full');
    expect(reglagesPostgres(BASE + '?uselibpqcompat=false&sslmode=require').connectionString).toBe(BASE + '?uselibpqcompat=false&sslmode=verify-full');
  });

  it('sslmode=require, prefer et verify-ca s’écrivent verify-full : le certificat et le nom restent vérifiés quelle que soit la version de pg', () => {
    for (const mode of ['require', 'prefer', 'verify-ca', 'REQUIRE']) {
      expect(reglagesPostgres(BASE + '?sslmode=' + mode).connectionString, mode).toBe(BASE + '?sslmode=verify-full');
    }
    expect(reglagesPostgres(BASE + '?sslmode=disable').connectionString).toBe(BASE + '?sslmode=disable');
    // Le sens de libpq, demandé exprès, est gardé.
    expect(reglagesPostgres(BASE + '?uselibpqcompat=true&sslmode=require').connectionString).toBe(BASE + '?uselibpqcompat=true&sslmode=require');
  });

  it('une adresse que URL ne lit pas passe telle quelle à pg', () => {
    expect(reglagesPostgres('postgres:///base?host=/var/run/postgresql')).toEqual({ connectionString: 'postgres:///base?host=/var/run/postgresql' });
  });

  it('un relais de connexions se repère à « -pooler » dans le nom ou au port 6543', () => {
    expect(relaisDeConnexions('postgresql://u:p@ep-calme-1234-pooler.eu-central-1.aws.exemple.fr/base?sslmode=require')).toBe(true);
    expect(relaisDeConnexions('postgresql://u:p@relais.exemple.fr:6543/postgres')).toBe(true);
    expect(relaisDeConnexions('postgresql://u:p@ep-calme-1234.eu-central-1.aws.exemple.fr/base')).toBe(false);
    expect(relaisDeConnexions('postgresql://u:p@base.exemple.fr:5432/postgres')).toBe(false);
  });

  it('le serveur produit et ses scripts passent par ces réglages, et le serveur vérifie ses annonces au démarrage', () => {
    const { application } = compiler(readFileSync(new URL('./serveur-attaques-calculs.humalis', import.meta.url), 'utf8'));
    // Une lecture « en direct » : le serveur écoute les annonces de PostgreSQL.
    const serveur = application!.serveurs[0]!;
    const fichiers = genererProjetServeur({ ...serveur, routes: serveur.routes.map((r) => ({ ...r, direct: true })) }, { nom: 'api', source: 'api.humalis' });
    expect(fichiers.get('src/humalis/postgres.ts')).toContain('export function reglagesPostgres(adresse: string, pg: { Client: ClassePg }): Reglages');
    const tout = [...fichiers.values()].join('\n');
    expect(tout).toContain('new pg.Pool(reglagesBase as pg.PoolConfig)');
    expect(tout).toContain('nouveauClientPostgres(url, pg)');
    expect(tout).not.toContain('new pg.Pool({ connectionString');
    expect(tout).not.toContain('new pg.Client({ connectionString: url })');
    expect(tout).toContain("'humalis-essai-' + randomUUID()");
    expect(tout).toContain('relaisDeConnexions(adresseBase!)');
  });
});
