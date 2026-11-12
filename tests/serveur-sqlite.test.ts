import { describe, it, expect } from 'vitest';
import { stripTypeScriptTypes } from 'node:module';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * SQLite, la seconde base du serveur produit (décidé avec le mainteneur le 12 novembre 2026). Ces tests font tourner
 * le code produit sur un vrai fichier SQLite (le module node:sqlite de Node) : rien n'est simulé.
 */
const SOURCE = 'serveur "boutique" :\n    donnee produit :\n        nom : texte\n        prix : nombre\n    route "produits" :\n        tout le monde peut lire produit\n\npage "a" :\n    titre "A"\n';
const fichiers = genererProjetServeur(compiler(SOURCE).application!.serveurs[0]!, { nom: 'boutique', source: 'boutique.humalis' });

type Fiche = Record<string, unknown> & { id: string };
interface Stockage {
  lister(filtres?: { egal: Record<string, unknown>; limite?: number; depuis?: number; numero?: { champ: string; valeur: string } }): Promise<Fiche[]>;
  trouver(id: string): Promise<Fiche | null>;
  creer(valeurs: Record<string, unknown>): Promise<Fiche>;
  modifier(id: string, valeurs: Record<string, unknown>): Promise<Fiche | null>;
  supprimer(id: string): Promise<boolean>;
}
interface Base {
  query(texte: string, valeurs?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
  transaction<T>(faire: () => Promise<T>): Promise<T>;
  fermer(): void;
}
interface Module {
  ouvrirSqlite(chemin: string): Base;
  creerStockageSqlite(base: Base, table: string, champs?: readonly string[]): Stockage;
}

/** Le stockage et la base produits, chargés comme deux modules qui se voient. */
async function charger(): Promise<Module> {
  const versModule = (code: string) => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(code)).toString('base64')}`;
  const stockage = versModule(fichiers.get('src/humalis/stockage.ts')!);
  return import(versModule(fichiers.get('src/humalis/sqlite.ts')!.replace("'./stockage.js'", JSON.stringify(stockage))));
}

const dossier = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'humalis-sqlite-'));
const { ouvrirSqlite, creerStockageSqlite } = await charger();

describe('le stockage des données dans SQLite', () => {
  it('le projet produit porte le fichier, sans dépendance de plus', () => {
    expect(fichiers.get('src/humalis/sqlite.ts')).toContain("from 'node:sqlite'");
    expect(Object.keys(JSON.parse(fichiers.get('package.json')!).dependencies).some((d) => /sqlite/i.test(d))).toBe(false);
  });

  it('créer, lire, modifier, supprimer : les mêmes réponses que les autres stockages', async () => {
    const base = ouvrirSqlite(':memory:');
    const produits = creerStockageSqlite(base, 'humalis_produit');
    const cree = await produits.creer({ nom: 'Pagne', prix: 25, tailles: ['S', 'M'], actif: true });
    expect(cree).toMatchObject({ nom: 'Pagne', prix: 25, tailles: ['S', 'M'], actif: true });
    expect(cree.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await produits.trouver(cree.id)).toEqual(cree);
    expect(await produits.modifier(cree.id, { prix: 30, note: null })).toEqual({ ...cree, prix: 30, note: null });
    expect(await produits.modifier('inconnu', { prix: 1 })).toBeNull();
    expect(await produits.trouver('inconnu')).toBeNull();
    expect(await produits.supprimer(cree.id)).toBe(true);
    expect(await produits.supprimer(cree.id)).toBe(false);
    expect(await produits.lister()).toEqual([]);
    base.fermer();
  });

  it('la liste suit l’ordre de création, se filtre par valeur exacte et se découpe', async () => {
    const base = ouvrirSqlite(':memory:');
    const s = creerStockageSqlite(base, 'humalis_produit');
    for (let i = 1; i <= 25; i++) await s.creer({ nom: `P${i}`, rayon: i % 2 === 0 ? 'pair' : 'impair', prix: i, promo: i > 20, code: String(i) });
    expect((await s.lister()).map((p) => p.nom)).toEqual(Array.from({ length: 25 }, (_, i) => `P${i + 1}`));
    expect((await s.lister({ egal: { rayon: 'pair' } })).length).toBe(12);
    expect((await s.lister({ egal: { rayon: 'pair' }, limite: 3, depuis: 2 })).map((p) => p.nom)).toEqual(['P6', 'P8', 'P10']);
    expect((await s.lister({ egal: {}, depuis: 23 })).map((p) => p.nom)).toEqual(['P24', 'P25']);
    expect((await s.lister({ egal: { promo: true } })).length).toBe(5);
    expect((await s.lister({ egal: { prix: 7 } })).map((p) => p.nom)).toEqual(['P7']);
    // Les types ne se mélangent pas : le texte « 7 » n'est pas le nombre 7, vrai n'est pas 1.
    expect(await s.lister({ egal: { code: 7 } })).toEqual([]);
    expect(await s.lister({ egal: { prix: '7' } })).toEqual([]);
    expect(await s.lister({ egal: { prix: true } })).toEqual([]);
    expect((await s.lister({ egal: { code: '7' } })).map((p) => p.nom)).toEqual(['P7']);
    base.fermer();
  });

  it('un numéro se retrouve sans ses séparateurs, comme dans les autres stockages', async () => {
    const base = ouvrirSqlite(':memory:');
    const s = creerStockageSqlite(base, 'humalis_client');
    await s.creer({ nom: 'Awa', tel: '+243 848-12' });
    await s.creer({ nom: 'Rey', tel: '0611' });
    expect((await s.lister({ egal: {}, numero: { champ: 'tel', valeur: '24384812' } })).map((c) => c.nom)).toEqual(['Awa']);
    base.fermer();
  });

  it('une valeur hostile reste une valeur : rien ne s’exécute, rien ne casse', async () => {
    const base = ouvrirSqlite(':memory:');
    const s = creerStockageSqlite(base, 'humalis_produit');
    const mechant = "x'); DROP TABLE humalis_produit; --";
    const cree = await s.creer({ nom: mechant, 'cle"étrange': 1 });
    expect((await s.lister({ egal: { nom: mechant } })).map((p) => p.id)).toEqual([cree.id]);
    expect(await s.lister({ egal: { 'cle"étrange': 1 } })).toHaveLength(1);
    expect(await s.lister({ egal: { '$.nom") OR 1=1 --': 'x' } })).toEqual([]);
    expect(await s.trouver("' OR '1'='1")).toBeNull();
    expect(() => creerStockageSqlite(base, 'x; DROP TABLE y')).toThrow(/nom de table invalide/);
    expect(await s.lister()).toHaveLength(1);
    base.fermer();
  });

  it('une lecture ne rend que les champs de la donnée d’aujourd’hui', async () => {
    const base = ouvrirSqlite(':memory:');
    const tout = creerStockageSqlite(base, 'humalis_produit');
    const cree = await tout.creer({ nom: 'Pagne', prix: 25, cout_achat: 9 });
    const servi = creerStockageSqlite(base, 'humalis_produit', ['nom', 'prix']);
    expect(await servi.trouver(cree.id)).toEqual({ id: cree.id, nom: 'Pagne', prix: 25 });
    expect(await servi.lister()).toEqual([{ id: cree.id, nom: 'Pagne', prix: 25 }]);
    expect(await servi.modifier(cree.id, { prix: 30 })).toEqual({ id: cree.id, nom: 'Pagne', prix: 30 });
    // Le champ retiré est toujours dans la base : rien n'est effacé sans le demander.
    expect((await tout.trouver(cree.id))!.cout_achat).toBe(9);
    base.fermer();
  });

  it('les données restent après la fermeture : un fichier, relu à la réouverture', async () => {
    const chemin = join(dossier, 'sous-dossier', 'boutique.sqlite');
    const premiere = ouvrirSqlite(chemin);
    const cree = await creerStockageSqlite(premiere, 'humalis_produit').creer({ nom: 'Pagne' });
    premiere.fermer();
    expect(existsSync(chemin)).toBe(true);
    const seconde = ouvrirSqlite(chemin);
    expect(await creerStockageSqlite(seconde, 'humalis_produit').trouver(cree.id)).toEqual(cree);
    seconde.fermer();
  });
});

describe('les transactions dans SQLite', () => {
  it('tout ou rien : une erreur annule ce qui a été écrit', async () => {
    const base = ouvrirSqlite(':memory:');
    const s = creerStockageSqlite(base, 'humalis_produit');
    await s.creer({ nom: 'avant' });
    await expect(base.transaction(async () => {
      await s.creer({ nom: 'pendant' });
      throw new Error('refusé');
    })).rejects.toThrow('refusé');
    expect((await s.lister()).map((p) => p.nom)).toEqual(['avant']);
    await base.transaction(async () => { await s.creer({ nom: 'apres' }); });
    expect((await s.lister()).map((p) => p.nom)).toEqual(['avant', 'apres']);
    base.fermer();
  });

  it('une écriture venue d’ailleurs attend la fin de la transaction : elle n’y est pas mêlée', async () => {
    const base = ouvrirSqlite(':memory:');
    const s = creerStockageSqlite(base, 'humalis_produit');
    await s.lister();
    const ordre: string[] = [];
    // Une autre requête du serveur veut écrire pendant la transaction : elle est préparée ici, hors d'elle.
    let ecritureDehors: Promise<unknown> | undefined;
    setTimeout(() => { ecritureDehors = s.creer({ nom: 'dehors' }).then(() => ordre.push('dehors écrit')); }, 5);
    const transaction = base.transaction(async () => {
      await s.creer({ nom: 'dedans 1' });
      await new Promise((fin) => setTimeout(fin, 30));
      ordre.push('transaction finie');
      throw new Error('annulée');
    });
    await expect(transaction).rejects.toThrow('annulée');
    await ecritureDehors;
    expect(ordre).toEqual(['transaction finie', 'dehors écrit']);
    // L'écriture du dehors n'a pas été emportée par l'annulation.
    expect((await s.lister()).map((p) => p.nom)).toEqual(['dehors']);
    base.fermer();
  });

  it('deux modifications de la même fiche parties ensemble gardent les deux changements', async () => {
    const base = ouvrirSqlite(':memory:');
    const s = creerStockageSqlite(base, 'humalis_produit');
    const cree = await s.creer({ nom: 'Pagne', prix: 1, stock: 1 });
    await Promise.all([s.modifier(cree.id, { prix: 2 }), s.modifier(cree.id, { stock: 5 })]);
    expect(await s.trouver(cree.id)).toMatchObject({ prix: 2, stock: 5 });
    base.fermer();
    rmSync(dossier, { recursive: true, force: true });
  });
});
