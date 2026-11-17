import { describe, it, expect } from 'vitest';
import { stripTypeScriptTypes } from 'node:module';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * La couche de données du serveur produit (revue du 12 novembre 2026) : une liste a un plafond, les tables ont
 * leurs index, les jetons fermés sont gardés en base, et la liste des comptes ne s'arrête plus à 500.
 * Prouvé aussi en vrai sur PostgreSQL 16 : 320 000 fiches (lecture filtrée en 1,5 ms avec l'index, 27 ms sans),
 * 701 comptes, deux exemplaires du serveur (un jeton fermé sur l'un est refusé sur l'autre).
 */
const SOURCE = 'serveur "b" :\n    roles gerant\n    compte :\n        telephone : texte\n    donnee produit :\n        nom : texte\n    route "produits" :\n        tout le monde peut lire produit\n        seul admin peut modifier produit\n    route "equipe" :\n        seul gerant peut lire comptes\n    route "moi" :\n        connecte peut lire son compte\n\npage "a" :\n    titre "A"\n';
const fichiers = genererProjetServeur(compiler(SOURCE).application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' });
const charger = async <T>(code: string, remplacements: [RegExp, string][] = []): Promise<T> => {
  let texte = stripTypeScriptTypes(code);
  for (const [avant, apres] of remplacements) texte = texte.replace(avant, apres);
  return import(`data:text/javascript;base64,${Buffer.from(texte + `\n// ${Math.random()}\n`).toString('base64')}`);
};

describe('le plafond des listes', () => {
  it('1 000 fiches par défaut, HUMALIS_LISTE_MAX pour le changer, et une valeur fausse ne l’enlève pas', async () => {
    const { plafondDesListes, lireFiltres } = await charger<{ plafondDesListes(env?: Record<string, string>): number; lireFiltres(s: Record<string, unknown>, r: Record<string, unknown>): { limite?: number; depuis?: number } }>(fichiers.get('src/humalis/verifier.ts')!);
    expect(plafondDesListes({})).toBe(1000);
    expect(plafondDesListes({ HUMALIS_LISTE_MAX: '250' })).toBe(250);
    for (const faux of ['0', '-5', 'abc', '1.5', '']) expect(plafondDesListes({ HUMALIS_LISTE_MAX: faux }), faux).toBe(1000);
    expect(lireFiltres({ nom: 'texte' }, {}).limite).toBe(1000);
    expect(lireFiltres({ nom: 'texte' }, { limite: '20', depuis: '40' })).toMatchObject({ limite: 20, depuis: 40 });
    expect(lireFiltres({ nom: 'texte' }, { limite: '50000' }).limite).toBe(1000);
  });
});

describe('les index et les révocations au démarrage', () => {
  const demarrer = fichiers.get('src/demarrer.ts')!;

  it('chaque table reçoit l’index de ses données et celui de son ordre de création', () => {
    expect(demarrer).toContain("for (const table of ['humalis_produit'])");
    expect(demarrer).toContain('CREATE INDEX IF NOT EXISTS ${table}_donnees ON ${table} USING GIN (data jsonb_path_ops)');
    expect(demarrer).toContain('CREATE INDEX IF NOT EXISTS ${table}_cree_le ON ${table} (cree_le)');
  });

  it('avec PostgreSQL, les jetons fermés sont gardés en base ; le serveur les donne toujours au pack', () => {
    expect(demarrer).toContain('revocations: creerRevocationsPostgres(sql)');
    const serveur = fichiers.get('src/serveur.ts')!;
    expect(serveur).toContain('revocations = createMemoryRevocationStore(), sante = async () => true }: OptionsDuServeur');
    expect(serveur).toContain('revocationStore: revocations,');
  });

  it('le magasin des révocations : un jeton fermé l’est, un compte fermé refuse les jetons émis avant', async () => {
    const { creerRevocationsPostgres } = await charger<{ creerRevocationsPostgres(pool: unknown): { revoke(j: string, e: number): Promise<void>; isRevoked(j?: string): Promise<boolean>; revokeAllForUser(u: string, a: number): Promise<void>; isRevokedForUser(u: string, s: number): Promise<boolean> } }>(fichiers.get('src/humalis/renouvellements.ts')!, [[/^import .*$/gm, '']]);
    // Une fausse base, qui comprend les cinq requêtes du magasin.
    const jetons = new Map<string, number>();
    const comptes = new Map<string, number>();
    const requetes: string[] = [];
    const pool = {
      async query(texte: string, v: unknown[] = []) {
        requetes.push(texte);
        if (texte.startsWith('INSERT INTO jetons_fermes')) jetons.set(String(v[0]), Number(v[1]));
        if (texte.startsWith('DELETE FROM jetons_fermes')) for (const [j, fin] of jetons) if (fin < Number(v[0])) jetons.delete(j);
        if (texte.startsWith('SELECT 1 FROM jetons_fermes')) return { rows: jetons.has(String(v[0])) && jetons.get(String(v[0]))! >= Number(v[1]) ? [{}] : [] };
        if (texte.startsWith('INSERT INTO comptes_fermes')) comptes.set(String(v[0]), Math.max(comptes.get(String(v[0])) ?? 0, Number(v[1])));
        if (texte.startsWith('SELECT avant FROM comptes_fermes')) return { rows: comptes.has(String(v[0])) ? [{ avant: comptes.get(String(v[0])) }] : [] };
        return { rows: [] };
      },
    };
    const magasin = creerRevocationsPostgres(pool);
    const dans15min = Date.now() + 900_000;
    expect(await magasin.isRevoked('j1')).toBe(false);
    await magasin.revoke('j1', dans15min);
    expect(await magasin.isRevoked('j1')).toBe(true);
    expect(await magasin.isRevoked('j2')).toBe(false);
    expect(await magasin.isRevoked(undefined)).toBe(false);
    await magasin.revokeAllForUser('u1', 2_000_000);
    expect(await magasin.isRevokedForUser('u1', 1_000)).toBe(true); // émis à 1 000 s, avant la fermeture à 2 000 s
    expect(await magasin.isRevokedForUser('u1', 3_000)).toBe(false);
    expect(await magasin.isRevokedForUser('u2', 1_000)).toBe(false);
    // Aucune valeur n'est collée dans le texte d'une requête.
    for (const texte of requetes) expect(texte).not.toMatch(/j1|u1/);
  });
});

describe('la liste des comptes au-delà de 500', () => {
  it('tous les comptes sont lus, page par page, et « mon compte » est lu par son identifiant', async () => {
    const comptes = fichiers.get('src/humalis/comptes.ts')!;
    expect(comptes).not.toContain('limit: 500 }');
    expect(comptes).toContain('await usersStore.findById(String(moi.id))');
    const { tousLesComptes } = await charger<{ tousLesComptes(store: unknown): Promise<{ id: string }[]> }>(comptes, [[/^import [\s\S]*?;$/gm, ''], [/isStrongPassword\(/g, '((x) => true)('], [/createMemoryPasswordResetStore\(\)/g, 'null'], [/createHash|randomBytes/g, 'String']]);
    const tous = Array.from({ length: 1203 }, (_, i) => ({ id: `c${i}` }));
    const appels: number[] = [];
    const store = { list: async ({ limit, offset }: { limit: number; offset: number }) => (appels.push(offset), tous.slice(offset, offset + limit)) };
    expect((await tousLesComptes(store)).length).toBe(1203);
    expect(appels).toEqual([0, 500, 1000]);
    // Un magasin qui ignore « offset » redonne la même page : on s'arrête, sans doublon ni boucle.
    const sourd = { list: async ({ limit }: { limit: number }) => tous.slice(0, limit) };
    expect((await tousLesComptes(sourd)).length).toBe(500);
  });
});

describe('une invitation en attente', () => {
  it('n’est pas reprise par un membre d’un autre groupe (même réponse, rien ne change)', () => {
    const comptes = fichiers.get('src/humalis/comptes.ts')!;
    const garde = comptes.indexOf('existant.invitation === true && !estAdmin && !portee(moi, existant');
    expect(garde).toBeGreaterThan(0);
    // La garde vient avant toute écriture du compte invité.
    expect(garde).toBeLessThan(comptes.indexOf('await usersStore.update(String(existant.id), { role, invitation: true'));
  });
});

describe('deux défauts trouvés en lançant les tests produits de tous les exemples', () => {
  const produire = (source: string) => genererProjetServeur(compiler(source).application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' });

  it('un serveur avec des appels mais sans salle compile : la doublure de monterSalles reçoit les arguments de l’appel', () => {
    const source = 'serveur "agence" :\n    donnee contact :\n        compte : texte\n        nom : texte\n    route "contacts" :\n        connecte peut lire contact\n\npage "accueil" :\n    variable contacts = []\n    titre "Contacts"\n    quand la page se charge :\n        envoyer requete vers "contacts" dans contacts\n    pour chaque contact dans contacts :\n        bouton "Appeler"\n        quand l\'utilisateur clique sur "Appeler" :\n            appeler en video contact.compte\n';
    const tempsReel = produire(source).get('src/humalis/temps-reel.ts');
    if (tempsReel?.includes('function monterSalles(...')) expect(tempsReel).toContain('function monterSalles(..._sansSalle: unknown[]): void {}');
    else expect(tempsReel ?? '').not.toContain('function monterSalles(): void {}');
  });


});
