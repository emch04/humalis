import { describe, it, expect } from 'vitest';
import { stripTypeScriptTypes } from 'node:module';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * Quand la donnée change dans le programme, les fiches déjà enregistrées restent telles qu'elles ont été
 * écrites. Deux garde-fous (revue du 12 novembre 2026, T4 et « la couche de données ») :
 *
 * - une lecture ne rend que les champs de la donnée d'aujourd'hui : un champ retiré du programme n'est plus
 *   renvoyé, même s'il est encore dans la base ;
 * - « npm run verification » lit toutes les fiches et dit lesquelles ne suivent plus la donnée (champ retiré,
 *   champ absent, mauvais type, valeur hors de ses limites) ; « --nettoyer » efface les champs retirés.
 */
const SOURCE = [
  'serveur "boutique" :',
  '    donnee produit :',
  '        nom : texte de 2 a 40 caracteres non vide',
  '        prix : nombre entre 0 et 10000',
  '        photos : liste de texte de 3 elements au plus',
  '        en_vente : booleen au depart vrai',
  '    donnee note par compte :',
  '        texte : texte',
  '    discussion "support" entre client et admin',
  '    roles client',
  '    route "produits" :',
  '        tout le monde peut lire produit',
  '        seul admin peut creer produit',
  '        seul admin peut modifier produit',
  '        seul admin peut faire "retirer" sur produit :',
  '            changer produit.en_vente par faux',
  '    route "notes" :',
  '        connecte peut lire note',
  '        connecte peut creer note',
  '',
  'page "a" :',
  '    titre "A"',
  '',
].join('\n');

const produire = (source = SOURCE) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
  return genererProjetServeur(application!.serveurs[0]!, { nom: 'boutique', source: 'boutique.humalis' });
};
const fichiers = produire();

let numero = 0;
/** Le code produit, sans ses types, chargé comme un module. */
async function charger<T>(code: string, remplacements: [string | RegExp, string][] = []): Promise<T> {
  let texte = code;
  for (const [de, par] of remplacements) texte = texte.replace(de, par);
  return import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(texte) + `\n// ${++numero}`).toString('base64')}`);
}

interface Stockage {
  lister(filtres?: unknown): Promise<Record<string, unknown>[]>;
  trouver(id: string): Promise<Record<string, unknown> | null>;
  creer(valeurs: Record<string, unknown>): Promise<Record<string, unknown>>;
  modifier(id: string, valeurs: Record<string, unknown>): Promise<Record<string, unknown> | null>;
}

describe('une lecture ne rend que les champs de la donnée d’aujourd’hui', () => {
  const ANCIENNE = { id: 'p1', data: { nom: 'Pagne', prix: 25, photos: [], en_vente: true, cout_achat: 9, note_interne: 'marge 60 %' } };
  const base = () => {
    const requetes: string[] = [];
    const pool = {
      query: async (texte: string) => {
        requetes.push(texte);
        return { rows: /^(SELECT|UPDATE|INSERT)/.test(texte) && !texte.startsWith('INSERT') ? [ANCIENNE] : [], rowCount: 1 };
      },
    };
    return { pool, requetes };
  };
  const stockages = () => charger<{ creerStockagePostgres(pool: unknown, table: string, champs?: readonly string[]): Stockage }>(fichiers.get('src/humalis/stockage.ts')!);

  it('la liste, la fiche seule et la réponse d’une modification n’ont plus le champ retiré', async () => {
    const { creerStockagePostgres } = await stockages();
    const produits = creerStockagePostgres(base().pool, 'humalis_produit', ['nom', 'prix', 'photos', 'en_vente']);
    const attendue = { id: 'p1', nom: 'Pagne', prix: 25, photos: [], en_vente: true };
    expect(await produits.lister()).toEqual([attendue]);
    expect(await produits.trouver('p1')).toEqual(attendue);
    expect(await produits.modifier('p1', { prix: 30 })).toEqual(attendue);
  });

  it('un champ absent d’une ancienne fiche reste absent, et « id » ne se laisse pas remplacer par un champ', async () => {
    const { creerStockagePostgres } = await stockages();
    const pool = { query: async () => ({ rows: [{ id: 'p2', data: { nom: 'Robe', id: 'faux', __proto__: { pirate: true } } }] }) };
    const [fiche] = await creerStockagePostgres(pool, 'humalis_produit', ['nom', 'prix']).lister();
    expect(fiche).toEqual({ id: 'p2', nom: 'Robe' });
    expect(Object.keys(fiche!)).toEqual(['id', 'nom']);
  });

  it('sans liste de champs (les données du temps réel), la fiche revient telle quelle', async () => {
    const { creerStockagePostgres } = await stockages();
    expect(await creerStockagePostgres(base().pool, 'humalis_message_support').trouver('p1')).toEqual({ id: 'p1', ...ANCIENNE.data });
  });

  it('au démarrage, chaque donnée du programme donne ses champs à son stockage, dans une transaction aussi ; les données du temps réel gardent tout', () => {
    const demarrer = fichiers.get('src/demarrer.ts')!;
    // Chaque base reçoit la même liste de champs.
    expect(demarrer).toContain(`produit: pool ? creerStockagePostgres(pool, 'humalis_produit', ["nom","prix","photos","enVente"]) : sqlite ? creerStockageSqlite(sqlite, 'humalis_produit', ["nom","prix","photos","enVente"]) : mysql ? creerStockageMysql(mysql, 'humalis_produit', ["nom","prix","photos","enVente"]) : documents ? creerStockageDocuments(documents, 'humalis_produit', ["nom","prix","photos","enVente"]) : creerStockageMemoire(),`);
    expect(demarrer).toContain(`note: pool ? creerStockagePostgres(pool, 'humalis_note', ["texte","compte"]) : sqlite ? creerStockageSqlite(sqlite, 'humalis_note', ["texte","compte"]) : mysql ? creerStockageMysql(mysql, 'humalis_note', ["texte","compte"]) : documents ? creerStockageDocuments(documents, 'humalis_note', ["texte","compte"]) : creerStockageMemoire(),`);
    expect(demarrer).toContain(`messageSupport: pool ? creerStockagePostgres(pool, 'humalis_message_support') : sqlite ? creerStockageSqlite(sqlite, 'humalis_message_support') : mysql ? creerStockageMysql(mysql, 'humalis_message_support') : documents ? creerStockageDocuments(documents, 'humalis_message_support') : creerStockageMemoire(),`);
    expect(demarrer).toContain(`produit: creerStockagePostgres(client, 'humalis_produit', ["nom","prix","photos","enVente"])`);
  });
});

describe('ce qui ne va plus dans une fiche déjà enregistrée', () => {
  type Defaut = { champ: string; genre: 'retire' | 'absent' | 'type' | 'limite'; detail: string };
  const verifier = () =>
    charger<{ defautsDeLaFiche(schema: Record<string, unknown>, fiche: Record<string, unknown>, regles?: { nonVides?: string[]; bornes?: Record<string, unknown> }): Defaut[] }>(fichiers.get('src/humalis/verifier.ts')!, [[/^import type .*\n/m, '']]);
  const SCHEMA = { nom: 'texte', prix: 'nombre', photos: { liste: 'texte' }, enVente: 'booleen' };
  const REGLES = { nonVides: ['nom'], bornes: { nom: { longueurMin: 2, longueurMax: 40 }, prix: { min: 0, max: 10000 }, photos: { elementsMax: 3 } } };

  it('une fiche qui suit la donnée n’a aucun défaut', async () => {
    const { defautsDeLaFiche } = await verifier();
    expect(defautsDeLaFiche(SCHEMA, { id: 'p1', nom: 'Pagne', prix: 25, photos: ['a'], enVente: true }, REGLES)).toEqual([]);
  });

  it('champ retiré, champ absent, mauvais type, valeur hors limites, champ vide : chacun est nommé', async () => {
    const { defautsDeLaFiche } = await verifier();
    const defauts = defautsDeLaFiche(SCHEMA, { id: 'p1', nom: ' ', prix: '25', photos: ['a', 'b', 'c', 'd'], cout_achat: 9 }, REGLES);
    expect(defauts.map((d) => [d.champ, d.genre])).toEqual([
      ['cout_achat', 'retire'],
      ['nom', 'limite'],
      ['prix', 'type'],
      ['photos', 'limite'],
      ['enVente', 'absent'],
    ]);
    expect(defauts.find((d) => d.champ === 'prix')!.detail).toMatch(/un nombre/);
    expect(defauts.find((d) => d.champ === 'photos')!.detail).toMatch(/3 éléments/);
  });

  it('une limite plus stricte qu’avant : l’ancienne valeur est signalée, sans être changée', async () => {
    const { defautsDeLaFiche } = await verifier();
    const fiche = { id: 'p1', nom: 'Pagne', prix: 25000, photos: [], enVente: false };
    expect(defautsDeLaFiche(SCHEMA, fiche, REGLES).map((d) => [d.champ, d.genre])).toEqual([['prix', 'limite']]);
    expect(fiche.prix).toBe(25000);
  });
});

describe('npm run verification', () => {
  const script = fichiers.get('scripts/verifier-donnees.mjs')!;

  it('le projet porte le script et sa commande', () => {
    expect(script).toBeDefined();
    expect(JSON.parse(fichiers.get('package.json')!).scripts.verification).toBe('node --env-file-if-exists=.env scripts/verifier-donnees.mjs');
  });

  it('il connaît chaque donnée du programme, ses limites et ses champs non vides ; pas les données du temps réel', () => {
    expect(script).toContain('"table":"humalis_produit"');
    expect(script).toContain('"table":"humalis_note"');
    expect(script).not.toContain('humalis_message_support');
    expect(script).toContain('"nonVides":["nom"]');
    expect(script).toContain('"prix":{"min":0,"max":10000}');
    expect(script).toContain('"schema":"SCHEMA_PRODUIT"');
  });

  it('il lit sans rien changer, toutes les tables au même instant, par lots', () => {
    expect(script).toContain("'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'");
    expect(script).toContain('FETCH 500 FROM');
    expect(script).toContain("import('../dist/src/humalis/verifier.js')");
  });

  it('« --nettoyer » efface les champs retirés, dans une seule transaction, et seulement eux', () => {
    expect(script).toContain("process.argv.includes('--nettoyer')");
    expect(script).toContain('SET data = data - $1::text[] WHERE data ?| $1::text[]');
    expect(script.indexOf("'BEGIN'")).toBeGreaterThan(0);
    expect(script).toContain("'ROLLBACK'");
  });

  it('le script est du JavaScript valide', async () => {
    const { Script } = await import('node:vm');
    // Un module ES : on vérifie sa syntaxe sans l'exécuter, imports de tête retirés.
    const corps = script.replace(/^import .*$/gm, '').replace('import.meta.url', '"file:///x/scripts/y.mjs"');
    expect(() => new Script(`(async () => {\n${corps}\n})`)).not.toThrow();
  });

  it('le LISEZMOI dit quand s’en servir', () => {
    const lisezmoi = fichiers.get('LISEZMOI.md')!;
    expect(lisezmoi).toContain('npm run verification');
    expect(lisezmoi).toContain('--nettoyer');
  });
});

describe('une liste séparée par une règle « si » se lit par lots', () => {
  const SEPAREE = [
    'serveur "atelier" :',
    '    donnee commande par compte :',
    '        client : texte',
    '        statut : texte',
    '    route "commandes" :',
    '        connecte peut lire commande',
    '        connecte peut creer commande',
    '',
    'page "a" :',
    '    titre "A"',
    '',
  ].join('\n');
  type Fiche = Record<string, unknown> & { id: string };
  type Filtres = { egal: Record<string, unknown>; limite?: number; depuis?: number };
  const charge = () =>
    charger<{ listerDans(stockage: { lister(f: Filtres): Promise<Fiche[]> }, filtres: Filtres, portee: { egal: Record<string, string>; test?: (f: Fiche) => boolean }): Promise<Fiche[]> }>(produire(SEPAREE).get('src/humalis/separation.ts')!);
  /** 1 200 fiches ; une sur deux est « ouverte ». Le stockage note chaque demande. */
  const table = () => {
    const fiches: Fiche[] = Array.from({ length: 1200 }, (_, i) => ({ id: `c${i}`, statut: i % 2 === 0 ? 'ouverte' : 'fermee', boutique: 'b1' }));
    const demandes: Filtres[] = [];
    const stockage = {
      lister: async (f: Filtres) => {
        demandes.push(f);
        const debut = f.depuis ?? 0;
        return f.limite === undefined ? fiches.slice(debut) : fiches.slice(debut, debut + f.limite);
      },
    };
    return { stockage, demandes, fiches };
  };
  const ouverte = (f: Fiche) => f.statut === 'ouverte';

  it('la tranche demandée est la même qu’avant, et la table n’est jamais lue d’un coup', async () => {
    const { listerDans } = await charge();
    const { stockage, demandes, fiches } = table();
    const vues = await listerDans(stockage, { egal: {}, limite: 20, depuis: 10 }, { egal: { boutique: 'b1' }, test: ouverte });
    expect(vues.map((f) => f.id)).toEqual(fiches.filter(ouverte).slice(10, 30).map((f) => f.id));
    // Un seul lot a suffi : 60 fiches lues pour 30 visibles, pas 1 200.
    expect(demandes).toEqual([{ egal: { boutique: 'b1' }, limite: 500, depuis: 0 }]);
  });

  it('quand peu de fiches passent la règle, les lots se suivent jusqu’au bout, sans doublon ni trou', async () => {
    const { listerDans } = await charge();
    const { stockage, demandes, fiches } = table();
    const rares = (f: Fiche) => Number(f.id.slice(1)) % 400 === 399;
    const vues = await listerDans(stockage, { egal: {}, limite: 1000 }, { egal: {}, test: rares });
    expect(vues.map((f) => f.id)).toEqual(fiches.filter(rares).map((f) => f.id));
    expect(demandes.map((d) => [d.limite, d.depuis])).toEqual([[500, 0], [500, 500], [500, 1000]]);
  });

  it('sans règle « si », la base fait tout : une seule demande, avec sa tranche', async () => {
    const { listerDans } = await charge();
    const { stockage, demandes } = table();
    await listerDans(stockage, { egal: { client: 'a' }, limite: 20, depuis: 40 }, { egal: { boutique: 'b1' } });
    expect(demandes).toEqual([{ egal: { client: 'a', boutique: 'b1' }, limite: 20, depuis: 40 }]);
  });

  it('sans limite demandée (un appel du serveur lui-même), toutes les fiches visibles reviennent', async () => {
    const { listerDans } = await charge();
    const { stockage, fiches } = table();
    expect(await listerDans(stockage, { egal: {} }, { egal: {}, test: ouverte })).toHaveLength(fiches.filter(ouverte).length);
  });
});
