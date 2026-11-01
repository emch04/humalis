import { describe, it, expect, vi } from 'vitest';
import { stripTypeScriptTypes } from 'node:module';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { lecturesTs, PRECHARGEMENT } from '../src/cibles/web/lectures.js';
import { programme, erreurs } from './analyse/aide.js';

// « Les serveurs doivent servir ce qui est demandé ; certaines choses déjà en avance, d'autres en arrière-plan » (Emch).
const SERVEUR = [
  'serveur "boutique" :',
  '>donnee produit :',
  '>>nom : texte',
  '>>prix : nombre',
  '>>visible : booleen',
  '>donnee photo_produit :',
  '>>produit : texte',
  '>>image : image',
  '>>ordre : nombre',
  '>donnee commande :',
  '>>nom : texte',
  '>route "produits" :',
  '>>tout le monde peut lire produit',
  '>>seul admin peut modifier produit',
  '>route "photos" :',
  '>>tout le monde peut lire photo_produit',
  '>>seul admin peut modifier photo_produit',
  '>route "commandes" :',
  '>>tout le monde peut creer commande',
  '>>seul admin peut lire commande',
  '',
];

/** La fiche d'un produit, comme celle de Rey Store : toutes les photos lues, une seule montrée. */
const fiche = (...calculs: string[]) =>
  programme(
    ...SERVEUR,
    'page "accueil" :',
    '>titre "Boutique"',
    '>variable produits = []',
    '>variable commandes = []',
    '>quand la page se charge :',
    '>>envoyer requete vers "produits" dans produits',
    '>>envoyer requete vers "commandes" dans commandes',
    '>pour chaque p dans produits :',
    '>>lien p.nom vers "produit" avec id p.id',
    '',
    'page "produit" avec parametre id :',
    '>variable produit = rien',
    '>variable photos = []',
    '>quand la page se charge :',
    '>>envoyer requete vers "produits" avec id dans produit',
    '>>envoyer requete vers "photos" dans photos',
    ...(calculs.length > 0 ? calculs : ['>calcul ses_photos = photos dont produit est egal a id']),
    '>calcul galerie = trier ses_photos par ordre',
    '>titre "{produit.nom}"',
    '>pour chaque ph dans galerie :',
    '>>image ph.image avec description "Une vue"',
  );

const options = { nom: 'boutique', adresse: 'https://boutique.exemple', source: 'b.humalis' };
const application = (texte: string) => {
  const { application, diagnostics } = compiler(texte);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const web = (texte: string) => genererProjetWeb(application(texte), options);
const serveur = () => genererProjetServeur(application(fiche()).serveurs[0], { nom: 'boutique', source: 'b.humalis' });

/** Un module TypeScript produit, exécuté tel quel (ses imports de types disparaissent). */
async function charger<T>(code: string, remplacements: [string, string][] = []): Promise<T> {
  let texte = code;
  for (const [avant, apres] of remplacements) {
    expect(texte).toContain(avant);
    texte = texte.replace(avant, apres);
  }
  // Un module neuf à chaque fois : son état (sa mémoire) ne passe pas d'un essai à l'autre.
  const unique = `\n// ${Math.random()}\n`;
  return import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(texte) + unique).toString('base64')}`);
}

describe('performance — le programme de départ', () => {
  it('l’analyse accepte la fiche produit', () => {
    expect(erreurs(fiche())).toEqual([]);
  });
});

describe('performance — 1. le serveur compresse ses réponses', () => {
  type Reponse = {
    statusCode: number;
    headersSent: boolean;
    entetes: Map<string, unknown>;
    envoye: unknown;
    ecrit: boolean;
    vary(nom: string): void;
    getHeader(nom: string): unknown;
    setHeader(nom: string, valeur: unknown): void;
    write(...valeurs: unknown[]): boolean;
    end(corps?: unknown): unknown;
  };
  const fausseReponse = (type: string): Reponse => {
    const reponse: Reponse = {
      statusCode: 200,
      headersSent: false,
      entetes: new Map<string, unknown>([['content-type', type]]),
      envoye: undefined,
      ecrit: false,
      vary(nom) {
        reponse.entetes.set('vary', nom);
      },
      getHeader: (nom) => reponse.entetes.get(nom.toLowerCase()),
      setHeader: (nom, valeur) => void reponse.entetes.set(nom.toLowerCase(), valeur),
      write: () => (reponse.ecrit = true),
      end(corps) {
        reponse.envoye = corps;
        return reponse;
      },
    };
    return reponse;
  };
  async function compresser(accepte: string, corps: string, type = 'application/json; charset=utf-8', avant?: (r: Reponse) => void) {
    const { compresser } = await charger<{ compresser: (req: unknown, res: unknown, next: () => void) => void }>(serveur().get('src/humalis/compresser.ts')!);
    const reponse = fausseReponse(type);
    compresser({ method: 'GET', headers: { 'accept-encoding': accepte } }, reponse, () => {});
    avant?.(reponse);
    reponse.end(corps);
    await vi.waitFor(() => expect(reponse.envoye).toBeDefined());
    return reponse;
  }
  const grand = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: String(i), nom: 'Maillot domicile', prix: 25 })));

  it('écrit un petit intergiciel, sans dépendance, monté avant les routes des données', () => {
    const fichiers = serveur();
    expect(fichiers.get('src/humalis/compresser.ts')).toContain("import { brotliCompress, constants, gzip } from 'node:zlib';");
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(Object.keys(paquet.dependencies)).not.toContain('compression');
    const code = fichiers.get('src/serveur.ts')!;
    // Dans extendRoutes : après les en-têtes de sécurité du pack, avant les routes (et leur 404 final).
    expect(code.indexOf('app.use(compresser);')).toBeGreaterThan(code.indexOf('extendRoutes: (app, contexte) => {'));
    expect(code.indexOf('app.use(compresser);')).toBeLessThan(code.indexOf("app.use('/api/produits', routeProduits);"));
  });

  it('brotli quand le navigateur l’accepte, sinon gzip ; « q=0 » refuse un codage', async () => {
    const br = await compresser('gzip, deflate, br', grand);
    expect(br.entetes.get('content-encoding')).toBe('br');
    expect(brotliDecompressSync(br.envoye as Buffer).toString()).toBe(grand);
    expect(br.entetes.get('content-length')).toBe((br.envoye as Buffer).length);
    expect(br.entetes.get('vary')).toBe('Accept-Encoding');
    const gz = await compresser('gzip, br;q=0', grand);
    expect(gz.entetes.get('content-encoding')).toBe('gzip');
    expect(gunzipSync(gz.envoye as Buffer).toString()).toBe(grand);
  });

  it('laisse tel quel : une petite réponse, un type non textuel, sans codage accepté, un flux', async () => {
    expect((await compresser('br', '{"a":1}')).entetes.get('content-encoding')).toBeUndefined();
    expect((await compresser('br', grand, 'image/png')).entetes.get('content-encoding')).toBeUndefined();
    expect((await compresser('identity', grand)).entetes.get('content-encoding')).toBeUndefined();
    // Un flux (événements du serveur) : rien n'est retenu ni compressé.
    const flux = await compresser('br', grand, 'text/event-stream', (r) => r.write('data: 1\n\n'));
    expect(flux.entetes.get('content-encoding')).toBeUndefined();
    expect(flux.envoye).toBe(grand);
  });
});

describe('performance — 2. le cache HTTP des lectures', () => {
  const code = serveur().get('src/serveur.ts')!;

  it('ce que tout le monde peut lire : court, puis resservi pendant la relecture ; ETag d’Express gardé', () => {
    expect(code).toContain("res.set('Cache-Control', `${cookie ? 'private' : 'public'}, max-age=30, stale-while-revalidate=300`);");
    // Un relais ne garde jamais une réponse qui pose un cookie (le premier jeton CSRF d'un visiteur).
    expect(code).toContain("const cookie = res.getHeader('Set-Cookie') !== undefined;");
    expect(code).toContain("routeProduits.get('/', lecturePublique, ...acces.toutLeMonde,");
    expect(code).toContain("routeProduits.get('/:id', lecturePublique, ...acces.toutLeMonde,");
    // Rien ne coupe l'ETag d'Express (il est faible par défaut) : la relecture répond 304.
    expect(code).not.toMatch(/set\('etag'|disable\('etag'\)/);
  });

  it('une lecture réservée ou une erreur ne se garde jamais', () => {
    expect(code).toContain("res.set('Cache-Control', 'private, no-store');");
    expect(code).toContain("routeCommandes.get('/', lecturePrivee, ...acces.seulAdmin,");
    expect(code).toContain("else sansCache(res).status(404).json({ erreur: introuvable('produit') });");
    // Les tests produits vérifient l'en-tête sur le vrai serveur.
    const tests = serveur().get('tests/regles.test.ts')!;
    expect(tests).toContain("expect(reponse.headers['cache-control']).toBe('public, max-age=30, stale-while-revalidate=300');");
    expect(tests).toContain("expect(reponse.headers['cache-control']).toBe('private, no-store');");
  });
});

describe('performance — 3. ce qui est déjà connu s’affiche tout de suite (web)', () => {
  type Lectures = {
    lectureGardee<T>(adresse: string, initiale: T): T;
    garder(adresse: string, valeur: unknown, texte: string): void;
    oublier(adresse: string, methode: string): void;
    seGarde(reponse: Response): boolean;
    lireEnCommun(adresse: string, url: string, options: RequestInit): Promise<Response>;
    prelire(adresse: string): void;
  };
  function fauxStockage(depart: Record<string, string> = {}) {
    const valeurs = new Map(Object.entries(depart));
    return { getItem: (cle: string) => valeurs.get(cle) ?? null, setItem: (cle: string, valeur: string) => void valeurs.set(cle, valeur), valeurs };
  }
  const reponse = (corps: unknown, cache = 'public, max-age=30') => new Response(JSON.stringify(corps), { headers: { 'Cache-Control': cache } });

  it('la page part de la dernière réponse, puis relit le serveur', () => {
    const page = web(fiche()).get('src/pages/Produit.tsx')!;
    expect(page).toContain("import { lectureGardee } from '../humalis/lectures';");
    expect(page).toContain("const [produit, setProduit] = useState<Produit | null>(() => lectureGardee(`/api/produits/${encodeURIComponent(id)}`, null));");
    expect(page).toContain("setProduit(await serveur.lireUn('/api/produits', id, produit));");
  });

  it('garde la réponse d’une lecture publique, la rend, et la range dans l’onglet', async () => {
    const stockage = fauxStockage();
    vi.stubGlobal('sessionStorage', stockage);
    const lectures = await charger<Lectures>(lecturesTs('web'));
    expect(lectures.lectureGardee('/api/produits', [])).toEqual([]);
    lectures.garder('/api/produits', [{ id: '1' }], '[{"id":"1"}]');
    expect(lectures.lectureGardee('/api/produits', [])).toEqual([{ id: '1' }]);
    // Une liste attendue reste une liste.
    lectures.garder('/api/reglages', { erreur: 'x' }, '{"erreur":"x"}');
    expect(lectures.lectureGardee('/api/reglages', [])).toEqual([]);
    expect(JSON.parse(stockage.valeurs.get('humalis:lectures')!)['/api/produits']).toBe('[{"id":"1"}]');
    // Au rechargement de l'onglet, elle est retrouvée.
    const relue = await charger<Lectures>(lecturesTs('web'));
    expect(relue.lectureGardee('/api/produits', [])).toEqual([{ id: '1' }]);
    vi.unstubAllGlobals();
  });

  it('une réponse de plus de 200 000 caractères (des photos) reste en mémoire, pas dans l’onglet', async () => {
    const stockage = fauxStockage();
    vi.stubGlobal('sessionStorage', stockage);
    const lectures = await charger<Lectures>(lecturesTs('web'));
    const photos = 'x'.repeat(250_000);
    lectures.garder('/api/photos', [photos], JSON.stringify([photos]));
    expect(lectures.lectureGardee('/api/photos', [])).toEqual([photos]);
    expect(JSON.parse(stockage.valeurs.get('humalis:lectures')!)).toEqual({});
    vi.unstubAllGlobals();
  });

  it('seule une lecture publique est gardée : jamais celle d’une route réservée', async () => {
    const lectures = await charger<Lectures>(lecturesTs('web'));
    expect(lectures.seGarde(reponse([], 'public, max-age=30, stale-while-revalidate=300'))).toBe(true);
    // La première lecture d'un visiteur pose son cookie CSRF : gardée par son navigateur seulement.
    expect(lectures.seGarde(reponse([], 'private, max-age=30, stale-while-revalidate=300'))).toBe(true);
    expect(lectures.seGarde(reponse([], 'private, no-store'))).toBe(false);
    expect(lectures.seGarde(reponse([], 'no-store'))).toBe(false);
    expect(lectures.seGarde(new Response('[]'))).toBe(false);
    const serveurTs = web(fiche()).get('src/humalis/serveur.ts')!;
    expect(serveurTs).toContain('if (lecture && seGarde(reponse)) garder(adresse, valeur, texte);');
  });

  it('deux lectures de la même adresse en même temps ne font qu’un appel', async () => {
    const appels: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => (appels.push(url), reponse([{ id: '1' }])));
    const lectures = await charger<Lectures>(lecturesTs('web'));
    const [a, b] = await Promise.all([lectures.lireEnCommun('/api/produits', '/api/produits', {}), lectures.lireEnCommun('/api/produits', '/api/produits', {})]);
    expect(await a.json()).toEqual([{ id: '1' }]);
    expect(await b.json()).toEqual([{ id: '1' }]);
    expect(appels).toEqual(['/api/produits']);
    vi.unstubAllGlobals();
  });

  it('un envoi vers une route oublie ses lectures, qui passent ensuite par le serveur (pas le cache du navigateur)', async () => {
    const options: RequestInit[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => (options.push(init), reponse([])));
    const lectures = await charger<Lectures>(lecturesTs('web'));
    lectures.garder('/api/photos?produit=a', [1], '[1]');
    lectures.garder('/api/photos/12', { id: '12' }, '{"id":"12"}');
    lectures.garder('/api/produits', [2], '[2]');
    lectures.oublier('/api/photos/12', 'PATCH');
    expect(lectures.lectureGardee('/api/photos?produit=a', [])).toEqual([]);
    expect(lectures.lectureGardee('/api/photos/12', null)).toBeNull();
    expect(lectures.lectureGardee('/api/produits', [])).toEqual([2]);
    await lectures.lireEnCommun('/api/photos?produit=a', '/api/photos?produit=a', {});
    await lectures.lireEnCommun('/api/produits', '/api/produits', {});
    expect(options.map((o) => o.cache)).toEqual(['no-cache', undefined]);
    // Le modèle du serveur appelle « oublier » après chaque envoi réussi.
    expect(web(fiche()).get('src/humalis/serveur.ts')).toContain("if (!lecture) oublier(adresse, options.method ?? 'POST');");
    vi.unstubAllGlobals();
  });

  it('les transformations du modèle tiennent : formulaires (avecEchecs) et sources', () => {
    const avecFormulaire = web(
      programme(...SERVEUR, 'page "a" :', '>titre "A"', '>variable nom = "Awa"', '>formulaire "f" :', '>>champ "Nom"', '>>bouton "Commander"', '>quand le formulaire "f" est soumis :', '>>envoyer requete vers "commandes" avec nom'),
    ).get('src/humalis/serveur.ts')!;
    expect(avecFormulaire).toContain('echecs: () => echecs.current');
    expect(avecFormulaire).toContain("import { seGarde, garder, lireEnCommun, oublier } from './lectures';");
    // Un seul « catch » compte les échecs : celui des requêtes, pas un autre ajouté par le cache.
    expect(avecFormulaire.match(/echecs\.current \+= 1/g)).toHaveLength(1);
  });

  it('le mobile fait de même, en mémoire', () => {
    const fichiers = genererProjetMobile(application(fiche()), { nom: 'boutique', source: 'b.humalis' });
    expect(fichiers.get('humalis/lectures.ts')).toContain('export function lectureGardee<T>');
    expect(fichiers.get('humalis/lectures.ts')).not.toContain('sessionStorage');
    expect(fichiers.get('humalis/serveur.ts')).toContain('if (lecture && seGarde(reponse)) garder(adresse, valeur, texte);');
    const page = [...fichiers].find(([nom]) => /produit/i.test(nom) && nom.startsWith('app/'))![1];
    expect(page).toMatch(/import \{ lectureGardee \} from '(\.\.\/)+humalis\/lectures';/);
    expect(page).toContain('lectureGardee(`/api/photos?produit=${encodeURIComponent(id)}`, [])');
  });
});

describe('performance — 4. charger en avance la page qu’un lien ouvre', () => {
  const fichiers = web(fiche());

  it('le lien prépare la page : visible, son code ; survolé, touché ou atteint au clavier, ses données', () => {
    const navigation = fichiers.get('src/humalis/navigation.tsx')!;
    expect(navigation).toContain("import { observerLien, precharger } from './prechargement';");
    expect(navigation).toContain('useEffect(() => (lien.current ? observerLien(lien.current, vers) : undefined), [vers]);');
    for (const evenement of ['onPointerEnter', 'onPointerDown', 'onFocus']) expect(navigation).toContain(`${evenement}={(evenement) => {\n        precharger(vers, true);`);
  });

  it('main.tsx fait connaître les pages, leur code et leurs lectures publiques (jamais une route réservée)', () => {
    const main = fichiers.get('src/main.tsx')!;
    expect(main).toContain("import { connaitreLesPages } from './humalis/prechargement';");
    expect(main).toContain('Produit: ["/api/produits/:id","/api/photos?produit=:id"],');
    expect(main).toContain('Accueil: ["/api/produits"],');
    expect(main).not.toContain('/api/commandes');
    expect(main).toContain('connaitreLesPages(adresses.map(([nom, chemin, parent]) => ({ chemin, parent, charger: chargeurs[nom], lectures: lectures[nom] ?? [] })));');
  });

  it('precharger charge le morceau une seule fois et prépare les lectures avec le paramètre du lien', async () => {
    const preparees: string[] = [];
    const chargements: string[] = [];
    // Un matchPath réduit à « /produit/:id », et un prelire qui note.
    (globalThis as Record<string, unknown>).__essai = {
      matchPath: ({ path }: { path: string }, chemin: string) => {
        const motif = new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
        const trouve = motif.exec(chemin);
        return trouve ? { params: Object.fromEntries(Object.entries(trouve.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)])) } : null;
      },
      prelire: (adresse: string) => preparees.push(adresse),
    };
    const module = await charger<{ connaitreLesPages(l: unknown[]): void; precharger(a: string, d: boolean): void }>(PRECHARGEMENT, [
      ["import { matchPath } from 'react-router';", 'const { matchPath } = globalThis.__essai;'],
      ["import { prelire } from './lectures';", 'const { prelire } = globalThis.__essai;'],
    ]);
    module.connaitreLesPages([
      { chemin: '/produit/:id', parent: false, charger: async () => chargements.push('Produit'), lectures: ['/api/produits/:id', '/api/photos?produit=:id'] },
      { chemin: '/', parent: false, charger: async () => chargements.push('Accueil'), lectures: ['/api/produits'] },
    ]);
    module.precharger('/produit/maillot%20bleu', false);
    module.precharger('/produit/maillot%20bleu?taille=M', true);
    expect(chargements).toEqual(['Produit']);
    expect(preparees).toEqual(['/api/produits/maillot%20bleu', '/api/photos?produit=maillot%20bleu']);
  });
});

describe('performance — 5. ne pas tout télécharger', () => {
  it('« calcul … = photos dont produit est egal a id » : la lecture ne demande que les photos du produit', () => {
    const page = web(fiche()).get('src/pages/Produit.tsx')!;
    expect(page).toContain('setPhotos(await serveur.lire(`/api/photos?produit=${encodeURIComponent(id)}`, photos));');
    // Le filtre de la page reste : le même résultat, même avec un serveur qui ignorerait la demande.
    expect(page).toContain('photos.filter((element) => element.produit === id)');
  });

  it('pas de filtre déduit si la liste sert ailleurs, ou si la valeur n’est pas un paramètre de la page', () => {
    const ailleurs = web(fiche('>calcul ses_photos = photos dont produit est egal a id', '>calcul toutes = nombre de photos')).get('src/pages/Produit.tsx')!;
    expect(ailleurs).toContain("setPhotos(await serveur.lire('/api/photos', photos));");
    const variable = web(
      fiche('>variable choisi = ""', '>calcul ses_photos = photos dont produit est egal a choisi'),
    ).get('src/pages/Produit.tsx')!;
    expect(variable).toContain("setPhotos(await serveur.lire('/api/photos', photos));");
  });

  it('le serveur filtre par les champs de la donnée, ignore les autres clés, et découpe avec limite et depuis', async () => {
    const fichiers = serveur();
    const { lireFiltres } = await charger<{ lireFiltres(s: Record<string, unknown>, r: Record<string, unknown>): unknown }>(fichiers.get('src/humalis/verifier.ts')!);
    const schema = { produit: 'texte', ordre: 'nombre', visible: 'booleen', image: 'image' };
    expect(lireFiltres(schema, { produit: 'a', inconnu: 'x', image: 'y' })).toEqual({ egal: { produit: 'a' } });
    expect(lireFiltres(schema, { ordre: '2', visible: 'vrai', limite: '10', depuis: '20' })).toEqual({ egal: { ordre: 2, visible: true }, limite: 10, depuis: 20 });
    // Une valeur qui ne peut pas être celle du champ ne trouve rien ; une tranche mal écrite est ignorée.
    expect(lireFiltres(schema, { ordre: 'deux' })).toBeNull();
    expect(lireFiltres(schema, { produit: ['a', 'b'] })).toBeNull();
    expect(lireFiltres(schema, { limite: '-1' })).toEqual({ egal: {} });
    expect(fichiers.get('src/serveur.ts')).toContain('res.json(filtres ? await stockages.photoProduit.lister(filtres) : []);');
  });

  it('le stockage applique les filtres : en mémoire, et dans PostgreSQL par une requête paramétrée', async () => {
    const stockage = serveur().get('src/humalis/stockage.ts')!;
    const { creerStockageMemoire, creerStockagePostgres } = await charger<{
      creerStockageMemoire(): { creer(v: Record<string, unknown>): Promise<unknown>; lister(f?: unknown): Promise<Record<string, unknown>[]> };
      creerStockagePostgres(pool: unknown, table: string): { lister(f?: unknown): Promise<unknown> };
    }>(stockage);
    const memoire = creerStockageMemoire();
    for (const [produit, ordre] of [['a', 1], ['b', 2], ['a', 3], ['a', 4]] as const) await memoire.creer({ produit, ordre });
    expect((await memoire.lister({ egal: { produit: 'a' } })).map((p) => p.ordre)).toEqual([1, 3, 4]);
    expect((await memoire.lister({ egal: { produit: 'a' }, limite: 1, depuis: 1 })).map((p) => p.ordre)).toEqual([3]);
    expect(await memoire.lister()).toHaveLength(4);
    const requetes: [string, unknown[] | undefined][] = [];
    const pool = { query: async (texte: string, valeurs?: unknown[]) => (requetes.push([texte, valeurs]), { rows: [] }) };
    await creerStockagePostgres(pool, 'humalis_photo').lister({ egal: { produit: 'a' }, limite: 20, depuis: 40 });
    expect(requetes.at(-1)).toEqual(['SELECT id, data FROM humalis_photo WHERE data @> $1::jsonb ORDER BY cree_le LIMIT $2 OFFSET $3', ['{"produit":"a"}', 20, 40]]);
  });
});
