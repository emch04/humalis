import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stripTypeScriptTypes } from 'node:module';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur, VERSIONS_SERVEUR } from '../src/cibles/serveur/projet.js';
import { genererProjetWeb, VERSIONS } from '../src/cibles/web/projet.js';
import { genererProjetMobile, VERSIONS_MOBILE } from '../src/cibles/mobile/projet.js';
import { programme } from './analyse/aide.js';

// Les packs @astratra branchés sur ce que Humalis produit : tout s'active par variables d'environnement.
const SERVEUR = [
  'serveur "boutique" :',
  '>connexion google',
  '>donnee produit :',
  '>>nom : texte',
  '>route "produits" :',
  '>>tout le monde peut lire produit',
  '>>seul admin peut creer produit',
  '',
];

const ADMIN = programme(
  ...SERVEUR,
  'page "connexion" :',
  '>titre "Connexion"',
  '',
  'page "commandes" reservee a admin sinon vers "connexion" :',
  '>titre "Produits"',
  '>variable produits = []',
  '>quand la page se charge :',
  '>>envoyer requete vers "produits" dans produits',
  '>pour chaque p dans produits :',
  '>>texte p.nom',
);

const VITRINE = programme(
  ...SERVEUR,
  'page "accueil" :',
  '>titre "Accueil"',
  '>variable produits = []',
  '>quand la page se charge :',
  '>>envoyer requete vers "produits" dans produits',
);

const STATIQUE = programme('page "accueil" :', '>titre "Accueil"');

const application = (source: string) => {
  const resultat = compiler(source);
  expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return resultat.application!;
};
const serveurDe = (source: string) => genererProjetServeur(application(source).serveurs[0], { nom: 'boutique', source: 'boutique.humalis' });
const webDe = (source: string) => genererProjetWeb(application(source), { nom: 'boutique', source: 'boutique.humalis' });

/** Exécute un fichier produit sans dépendance : ses types retirés, chargé comme un module. */
async function executer<T>(code: string): Promise<T> {
  // Un module neuf à chaque fois : son état ne passe pas d'un essai à l'autre.
  const js = `${stripTypeScriptTypes(code, { mode: 'transform' })}\n// ${Math.random()}\n`;
  return (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)) as T;
}

/** Une fausse base : garde les requêtes, répond ce que dit le test. */
function fauxPool(repondre: (texte: string, valeurs?: unknown[]) => Record<string, unknown>[] = () => []) {
  const requetes: { texte: string; valeurs?: unknown[] }[] = [];
  return {
    requetes,
    query: async (texte: string, valeurs?: unknown[]) => {
      requetes.push({ texte, valeurs });
      return { rows: repondre(texte, valeurs), rowCount: 0 };
    },
  };
}

describe('le serveur produit, sans variable', () => {
  const fichiers = serveurDe(ADMIN);

  it('épingle les packs à leur version exacte', () => {
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.dependencies['@astratra/centrale']).toBe(VERSIONS_SERVEUR.centrale);
    expect(paquet.dependencies['@astratra/credentials']).toBe(VERSIONS_SERVEUR.credentials);
    expect(paquet.devDependencies['@astratra/tooling']).toBe(VERSIONS_SERVEUR.tooling);
    expect(paquet.scripts['audit:deps']).toBe('astratra audit:deps');
    expect(paquet.scripts['audit:secrets']).toBe('astratra audit:secrets');
    // Pas de dépendance gratuite : la résilience n'apporte rien à une instance unique.
    expect(paquet.dependencies['@astratra/resilience']).toBeUndefined();
    expect(paquet.dependencies.undici).toBeUndefined();
  });

  it('.env.exemple dit chaque variable, sans aucune valeur', () => {
    const env = fichiers.get('.env.exemple')!;
    for (const nom of ['HUMALIS_SESSION', 'HUMALIS_SESSION_MAX', 'CENTRALE_ADRESSE', 'CENTRALE_CLE', 'ENCRYPTION_KEY', 'GOOGLE_CLIENT_ID']) {
      expect(env).toContain(`\n${nom}=\n`);
    }
  });

  it('ne charge les packs facultatifs qu’à la demande', () => {
    expect(fichiers.get('src/humalis/centrale.ts')).toContain("await import('@astratra/centrale/node')");
    expect(fichiers.get('src/humalis/coffre.ts')).toContain("await import('@astratra/credentials')");
    for (const nom of ['src/humalis/centrale.ts', 'src/humalis/coffre.ts']) {
      expect(fichiers.get(nom)).not.toMatch(/^import \{.*from '@astratra/m);
    }
  });

  it('les routes du coffre sont gardées : connecté, admin, puis CSRF', () => {
    expect(fichiers.get('src/serveur.ts')).toContain("app.use('/auth/cles', authMiddleware, authorizeAdmin, csrfMiddleware, coffre ? coffre.routes(authorizeAdmin) : coffreFerme);");
  });

  it('relit GOOGLE_CLIENT_ID à chaque demande', () => {
    expect(fichiers.get('src/demarrer.ts')).toContain('googleClientId: () => process.env.GOOGLE_CLIENT_ID || undefined');
    expect(fichiers.get('src/serveur.ts')).toContain('const google = verificateurGoogle();');
  });

  it('un serveur sans clé à gérer garde son coffre fermé, sans lire ENCRYPTION_KEY', () => {
    const sansGoogle = serveurDe(programme('serveur "b" :', '>donnee produit :', '>>nom : texte', '>route "produits" :', '>>tout le monde peut lire produit'));
    expect(sansGoogle.get('src/humalis/coffre.ts')).not.toContain('GOOGLE_CLIENT_ID');
    expect(sansGoogle.get('src/demarrer.ts')).not.toContain('GOOGLE_CLIENT_ID');
  });
});

describe('le magasin des clés', () => {
  it('écrit des requêtes paramétrées : la valeur chiffrée passe en paramètre, jamais dans le texte', async () => {
    const { creerMagasinCles } = await executer<{ creerMagasinCles: (pool: unknown) => { upsert: (l: object) => Promise<void>; findAll: () => Promise<{ key: string; value: string; secret: boolean }[]> } }>(serveurDe(ADMIN).get('src/humalis/coffre.ts')!);
    const pool = fauxPool((texte) => (texte.startsWith('SELECT') ? [{ cle: 'GOOGLE_CLIENT_ID', valeur: 'chiffre', secret: true, modifie_le: new Date(0), modifie_par: null }] : []));
    const magasin = creerMagasinCles(pool);
    await magasin.upsert({ key: 'GOOGLE_CLIENT_ID', value: 'iv.tag.chiffre', secret: true, updatedBy: 'admin-1' });
    const insertion = pool.requetes.find((r) => r.texte.startsWith('INSERT'))!;
    expect(insertion.valeurs).toEqual(['GOOGLE_CLIENT_ID', 'iv.tag.chiffre', true, 'admin-1']);
    expect(insertion.texte).not.toContain('iv.tag.chiffre');
    expect(await magasin.findAll()).toMatchObject([{ key: 'GOOGLE_CLIENT_ID', value: 'chiffre', secret: true }]);
    // La table n'est créée qu'une fois.
    expect(pool.requetes.filter((r) => r.texte.startsWith('CREATE')).length).toBe(1);
  });

  it('une base absente au premier appel est réessayée, pas oubliée pour toujours', async () => {
    const { creerMagasinCles } = await executer<{ creerMagasinCles: (pool: unknown) => { findAll: () => Promise<unknown[]> } }>(serveurDe(ADMIN).get('src/humalis/coffre.ts')!);
    let panne = true;
    const magasin = creerMagasinCles({
      query: async () => {
        if (panne) throw new Error('base injoignable');
        return { rows: [] };
      },
    });
    await expect(magasin.findAll()).rejects.toThrow('base injoignable');
    panne = false;
    await expect(magasin.findAll()).resolves.toEqual([]);
  });
});

interface Magasin {
  save(l: Record<string, unknown>): Promise<unknown>;
  findByHash(h: string): Promise<Record<string, unknown> | null>;
  markConsumed(id: string, at: number): Promise<unknown>;
  revokeFamily(f: string, at: number): Promise<unknown>;
  debutDeFamille(f: string): Promise<number | null>;
}

describe('la borne absolue de la session', () => {
  const JOUR = 86_400_000;
  const ligne = (id: string, familyId: string, createdAt: number) => ({ id, familyId, userId: 'u1', hash: `h-${id}`, createdAt, expiresAt: createdAt + 3 * JOUR, consumedAt: null, revokedAt: null });
  const charger = () =>
    executer<{ creerMagasinMemoire: () => Magasin; creerMagasinPostgres: (pool: unknown) => Magasin; plafonner: (m: Magasin, o: object) => Magasin }>(serveurDe(ADMIN).get('src/humalis/renouvellements.ts')!);

  it('un jeton renouvelé n’expire jamais après connexion + maximum', async () => {
    const { creerMagasinMemoire, plafonner } = await charger();
    let maintenant = 0;
    const magasin = plafonner(creerMagasinMemoire(), { maximumMs: 30 * JOUR, horloge: () => maintenant });
    await magasin.save(ligne('a', 'f1', 0));
    expect((await magasin.findByHash('h-a'))!.expiresAt).toBe(3 * JOUR);
    await magasin.save(ligne('b', 'f1', 20 * JOUR));
    expect((await magasin.findByHash('h-b'))!.expiresAt).toBe(23 * JOUR);
    await magasin.save(ligne('c', 'f1', 29 * JOUR));
    // 29 + 3 jours dépasseraient : la borne reste à 30, depuis la toute première connexion.
    expect((await magasin.findByHash('h-c'))!.expiresAt).toBe(30 * JOUR);
    // Une autre connexion est une autre famille, avec sa propre borne.
    await magasin.save(ligne('d', 'f2', 29 * JOUR));
    expect((await magasin.findByHash('h-d'))!.expiresAt).toBe(32 * JOUR);
    maintenant = 0;
  });

  it('deux onglets au même instant passent ; après le délai de grâce, le rejeu reste un rejeu', async () => {
    const { creerMagasinMemoire, plafonner } = await charger();
    let maintenant = 1000;
    const magasin = plafonner(creerMagasinMemoire(), { maximumMs: 30 * JOUR, horloge: () => maintenant, graceMs: 10_000 });
    await magasin.save(ligne('a', 'f1', 0));
    await magasin.markConsumed('a', maintenant);
    maintenant += 5000;
    expect((await magasin.findByHash('h-a'))!.consumedAt).toBeNull();
    // Le second usage n'allonge pas le délai : le premier compte.
    await magasin.markConsumed('a', maintenant);
    maintenant += 6000;
    expect((await magasin.findByHash('h-a'))!.consumedAt).toBe(1000);
  });

  it('la révocation passe avant le délai de grâce', async () => {
    const { creerMagasinMemoire, plafonner } = await charger();
    const magasin = plafonner(creerMagasinMemoire(), { maximumMs: 30 * JOUR, horloge: () => 1000 });
    await magasin.save(ligne('a', 'f1', 0));
    await magasin.markConsumed('a', 1000);
    await magasin.revokeFamily('f1', 1000);
    expect((await magasin.findByHash('h-a'))!.consumedAt).toBe(1000);
  });

  it('dans PostgreSQL : l’empreinte seule, en paramètres, et le début de famille survit aux rotations', async () => {
    const { creerMagasinPostgres, plafonner } = await charger();
    const pool = fauxPool((texte) => (texte.includes('MIN(debut)') ? [{ debut: '1000' }] : []));
    const magasin = plafonner(creerMagasinPostgres(pool), { maximumMs: 30 * JOUR, horloge: () => 0 });
    await magasin.save(ligne('b', 'f1', 2 * JOUR));
    const insertion = pool.requetes.find((r) => r.texte.startsWith('INSERT'))!;
    expect(insertion.valeurs).toEqual(['b', 'f1', 'u1', 'h-b', 2 * JOUR, 1000, 5 * JOUR, null, null]);
    expect(insertion.texte).toContain('VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)');
    expect(pool.requetes.map((r) => r.texte).join(' ')).not.toContain('jeton');
  });
});

describe('la surveillance côté serveur', () => {
  it('sans ses deux variables, rien : pas de paquet chargé', async () => {
    const { demarrerCentrale } = await executer<{ demarrerCentrale: (env: object) => Promise<unknown> }>(serveurDe(ADMIN).get('src/humalis/centrale.ts')!);
    expect(await demarrerCentrale({})).toBeNull();
    expect(await demarrerCentrale({ CENTRALE_CLE: 'clj_pub_essai' })).toBeNull();
    expect(await demarrerCentrale({ CENTRALE_ADRESSE: 'https://exemple.fr', CENTRALE_CLE: '  ' })).toBeNull();
  });

  it('ne laisse partir d’une erreur de base que son code', async () => {
    const { assainir } = await executer<{ assainir: (e: unknown) => Error }>(serveurDe(ADMIN).get('src/humalis/centrale.ts')!);
    const erreur = Object.assign(new Error('la valeur a@exemple.fr est refusée'), { severity: 'ERROR', code: '23505' });
    expect(assainir(erreur).message).toBe('Erreur PostgreSQL 23505');
    expect(assainir(erreur).stack).not.toContain('a@exemple.fr');
  });

  it('refuse d’envoyer un refus ordinaire : seulement les pannes', () => {
    expect(serveurDe(ADMIN).get('src/humalis/centrale.ts')).toContain('if (statutDe(erreur, res.statusCode) < 500) next(erreur);');
  });
});

describe('le site produit', () => {
  it('une application avec serveur a sa surveillance, chargée seulement si les variables sont réglées', () => {
    const fichiers = webDe(VITRINE);
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['@astratra/centrale']).toBe(VERSIONS.centrale);
    const centrale = fichiers.get('src/humalis/centrale.ts')!;
    expect(centrale).toContain('if (adresse && cle) {');
    expect(centrale).toContain("import('@astratra/centrale/navigateur')");
    expect(centrale).not.toContain('robots');
    expect(fichiers.get('src/main.tsx')).toContain("import './humalis/centrale';");
    expect(fichiers.get('LISEZMOI.md')).toContain('VITE_CENTRALE_ADRESSE');
  });

  it('un site statique n’a ni surveillance ni renouvellement : aucune dépendance en plus', () => {
    const fichiers = webDe(STATIQUE);
    const dependances = JSON.parse(fichiers.get('package.json')!).dependencies;
    expect(dependances['@astratra/centrale']).toBeUndefined();
    expect(dependances['@astratra/client']).toBeUndefined();
    expect(fichiers.has('src/humalis/centrale.ts')).toBe(false);
    expect(fichiers.has('src/humalis/renouveler.ts')).toBe(false);
    expect(fichiers.get('src/main.tsx')).not.toContain('centrale');
    expect(fichiers.get('LISEZMOI.md')).not.toContain('VITE_CENTRALE');
  });

  it('un site sans session n’a pas le renouvellement, et dit « connectez-vous » sur un 401', () => {
    const fichiers = webDe(VITRINE);
    expect(fichiers.has('src/humalis/renouveler.ts')).toBe(false);
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['@astratra/client']).toBeUndefined();
    expect(fichiers.get('src/humalis/serveur.ts')).toContain("if (reponse.status === 401) throw new Error('Connectez-vous pour continuer.');");
  });

  it('un site avec une session passe chaque appel par le renouvellement', () => {
    const fichiers = webDe(ADMIN);
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['@astratra/client']).toBe(VERSIONS.client);
    const serveur = fichiers.get('src/humalis/serveur.ts')!;
    expect(serveur).toContain('const reponse = await avecSession(() => (lecture ?');
    const session = fichiers.get('src/humalis/session.tsx')!;
    expect(session).toContain("avecSession(() => fetch(BASE + '/auth/me'");
    expect(session).toContain('surFinDeSession(');
    // Aucun jeton dans la page : le cookie HttpOnly fait tout.
    expect(fichiers.get('src/humalis/renouveler.ts')).not.toContain('refreshToken');
    // La garde d'une page réservée renvoie vers la connexion dès que la session tombe.
    expect(fichiers.get('src/humalis/reservee.tsx')).toContain('<Navigate to={sinon} replace');
  });
});

/** Le double du pack @astratra/client, pour exécuter renouveler.ts ici : vol unique, relecture une fois, seul un refus ferme. */
const DOUBLE_DU_PACK = `
class SessionExpiredError extends Error {}
function createSessionClient({ request, refresh }) {
  let enCours = null;
  return {
    async call(chemin, init) {
      try {
        return await request(chemin, init);
      } catch (erreur) {
        if (erreur.status !== 401) throw erreur;
        enCours ??= Promise.resolve().then(refresh).finally(() => { enCours = null; });
        try {
          await enCours;
        } catch (refus) {
          if (![400, 401, 403].includes(refus.status)) throw refus;
          throw new SessionExpiredError();
        }
        return request(chemin, init);
      }
    },
  };
}
`;

describe('le renouvellement dans la page', () => {
  interface Module {
    avecSession: (lancer: () => Promise<Response>) => Promise<Response>;
    tracer: (oui: boolean) => void;
    surFinDeSession: (rappel: () => void) => () => void;
    SessionFinie: new (...a: unknown[]) => Error & { expiree: boolean; dejaDite: boolean };
  }
  let stockage: Map<string, string>;

  const charger = async (): Promise<Module> => {
    const code = webDe(ADMIN)
      .get('src/humalis/renouveler.ts')!
      .replace("import { createSessionClient, SessionExpiredError } from '@astratra/client';", DOUBLE_DU_PACK)
      .replace("import.meta.env.VITE_HUMALIS_SERVEUR ?? ''", "''");
    return executer<Module>(code);
  };

  beforeEach(() => {
    stockage = new Map();
    vi.stubGlobal('localStorage', { getItem: (c: string) => stockage.get(c) ?? null, setItem: (c: string, v: string) => stockage.set(c, v), removeItem: (c: string) => stockage.delete(c) });
  });

  it('renouvelle puis relance une fois ; plusieurs requêtes refusées, un seul renouvellement', async () => {
    const { avecSession } = await charger();
    let valide = false;
    const renouvellements = vi.fn(async () => {
      valide = true;
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', renouvellements);
    const lancer = async () => new Response(valide ? 'ok' : '', { status: valide ? 200 : 401 });
    const reponses = await Promise.all([avecSession(lancer), avecSession(lancer), avecSession(lancer)]);
    expect(reponses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(renouvellements).toHaveBeenCalledTimes(1);
    expect(renouvellements).toHaveBeenCalledWith('/auth/refresh', { method: 'POST', credentials: 'same-origin' });
  });

  it('session expirée : le message clair une seule fois, la page prévenue, la trace effacée', async () => {
    const { avecSession, tracer, surFinDeSession, SessionFinie } = await charger();
    tracer(true);
    vi.stubGlobal('fetch', async () => new Response('', { status: 401 }));
    const prevenue = vi.fn();
    surFinDeSession(prevenue);
    const lancer = async () => new Response('', { status: 401 });
    const erreurs = await Promise.all([avecSession(lancer).catch((e) => e), avecSession(lancer).catch((e) => e)]);
    expect(erreurs[0]).toBeInstanceOf(SessionFinie);
    expect(erreurs[0].message).toBe('Votre session a expiré. Connectez-vous de nouveau.');
    expect(erreurs[0].expiree).toBe(true);
    // La seconde requête du même instant ne répète pas le message.
    expect(erreurs[1].dejaDite).toBe(true);
    expect(prevenue).toHaveBeenCalled();
    expect(stockage.size).toBe(0);
  });

  it('un visiteur qui ne s’est jamais connecté : « connectez-vous », pas « expirée »', async () => {
    const { avecSession } = await charger();
    vi.stubGlobal('fetch', async () => new Response('', { status: 401 }));
    const erreur = await avecSession(async () => new Response('', { status: 401 })).catch((e) => e);
    expect(erreur.message).toBe('Connectez-vous pour continuer.');
    expect(erreur.expiree).toBe(false);
  });

  it('une coupure du réseau ne ferme pas la session', async () => {
    const { avecSession, tracer, surFinDeSession, SessionFinie } = await charger();
    tracer(true);
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('réseau coupé');
    });
    const prevenue = vi.fn();
    surFinDeSession(prevenue);
    const erreur = await avecSession(async () => new Response('', { status: 401 })).catch((e) => e);
    expect(erreur).not.toBeInstanceOf(SessionFinie);
    expect(prevenue).not.toHaveBeenCalled();
    expect(stockage.size).toBe(1);
  });

  it('une limite atteinte (429) ne ferme pas la session non plus, et ne montre pas un mot technique', async () => {
    const { avecSession, tracer, SessionFinie } = await charger();
    tracer(true);
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    const erreur = await avecSession(async () => new Response('', { status: 401 })).catch((e) => e);
    expect(erreur).not.toBeInstanceOf(SessionFinie);
    expect(erreur.message).toBe("Le serveur n'a pas répondu.");
  });
});

describe('le mobile produit', () => {
  const MOBILE = programme(
    ...SERVEUR.filter((l) => l !== '>connexion google'),
    'page "accueil" :',
    '>titre "Accueil"',
    '>si utilisateur est connecte :',
    '>>texte "Bonjour"',
  );
  const fichiers = genererProjetMobile(application(MOBILE), { nom: 'boutique', source: 'boutique.humalis' });

  it('range ses jetons dans le coffre, et relit le jeton à chaque essai', () => {
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['@astratra/client']).toBe(VERSIONS_MOBILE.client);
    const renouveler = fichiers.get('humalis/renouveler.ts')!;
    expect(renouveler).toContain('SecureStore.setItemAsync(CLE_RENOUVELLEMENT, corps.refreshToken)');
    expect(renouveler).toContain("'x-humalis-mobile': '1'");
    const serveur = fichiers.get('humalis/serveur.ts')!;
    expect(serveur).toContain("await securiser(entetes, options.method ?? 'GET');\n        return lecture ?");
    expect(fichiers.get('humalis/session.tsx')).toContain("entetes.set('x-humalis-mobile', '1')");
  });
});
