import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * Aucun service imposé : le programme dit seulement ce dont il a besoin (« ia », « emails », « paiements ») ;
 * celui qui déploie choisit le service dans le .env, sans rien par défaut. Les anciennes formes compilent encore.
 */
const SERVEUR = (lignes: string[]) => ['serveur "boutique" :', ...lignes.map((l) => `    ${l}`), '    roles gerant', '    donnee resa :', '        total : nombre', '    donnee journal :', '        nom : texte', '    route "resas" :', '        seul gerant peut lire resa', '        seul gerant peut modifier resa', '        quand resa est payee :', '            creer journal avec nom "x"', '    route "journaux" :', '        seul gerant peut lire journal', '        seul gerant peut modifier journal', '', 'page "accueil" :', '    titre "Accueil"', ''].join('\n');
const BESOINS = ['ia', 'seul gerant peut demander a ia', 'emails', 'paiements'];

const diagnostics = (source: string) => compiler(source).diagnostics.map((d) => `${d.gravite} : ${d.message}`);

describe('les besoins du serveur, sans service nommé', () => {
  it('« ia », « emails » et « paiements » seuls : rien à signaler', () => {
    expect(diagnostics(SERVEUR(BESOINS))).toEqual([]);
  });

  it('les anciennes formes compilent encore, et le compilateur dit quoi écrire', () => {
    const messages = diagnostics(SERVEUR(['ia par anthropic', 'seul gerant peut demander a ia', 'emails par brevo', 'paiements par stripe']));
    expect(messages).toEqual([
      "avertissement : « ia par anthropic » s'écrit maintenant « ia » : le service se choisit dans le .env (HUMALIS_IA_ADRESSE, HUMALIS_IA_MODELE).",
      "avertissement : « emails par brevo » s'écrit maintenant « emails » : le serveur d'envoi (SMTP) se choisit dans le .env (HUMALIS_EMAILS_HOTE, HUMALIS_EMAILS_PORT, HUMALIS_EMAILS_EXPEDITEUR).",
      "avertissement : « paiements par stripe » s'écrit maintenant « paiements » : le service de paiement se branche dans le .env (HUMALIS_PAIEMENT_ADRESSE, HUMALIS_PAIEMENT_SECRET).",
    ]);
  });

  it.each([['ia par autre', '« ia » s’écrit seul'], ['emails par poste', '« emails » s’écrit seul'], ['paiements par autre', '« paiements » s’écrit seul'], ['ia anthropic', '« ia » s’écrit seul']])('« %s » est refusé : aucun service ne s’écrit dans le programme', (ligne, motif) => {
    expect(diagnostics(SERVEUR([ligne])).join('\n')).toContain(motif);
  });

  it('le serveur produit ne nomme aucun service, n’en installe aucun et ne règle rien par défaut', () => {
    const fichiers = genererProjetServeur(compiler(SERVEUR(BESOINS)).application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' });
    const paquet = JSON.parse(fichiers.get('package.json')!);
    const dependances = Object.keys({ ...paquet.dependencies, ...paquet.devDependencies });
    expect(dependances.filter((d) => /anthropic|stripe|brevo|openai/i.test(d))).toEqual([]);
    for (const chemin of ['src/humalis/ia.ts', 'src/humalis/emails.ts', 'src/humalis/paiements.ts', '.env.exemple', 'src/humalis/coffre.ts']) {
      expect(fichiers.get(chemin), chemin).not.toMatch(/anthropic|claude|stripe|brevo|openai\.com|gpt-/i);
    }
    const env = fichiers.get('.env.exemple')!;
    for (const variable of ['HUMALIS_IA_ADRESSE', 'HUMALIS_IA_MODELE', 'HUMALIS_IA_CLE', 'HUMALIS_IA_ADRESSE_2', 'HUMALIS_EMAILS_HOTE', 'HUMALIS_EMAILS_PORT', 'HUMALIS_PAIEMENT_ADRESSE', 'HUMALIS_PAIEMENT_SECRET']) {
      expect(env, variable).toMatch(new RegExp(`^${variable}=$`, 'm'));
    }
  });
});

/** Un module produit, chargé tel quel (Vitest lit le TypeScript) ; `remplacer` ôte ce que le test n'a pas (express). */
async function charger(source: string, remplacer: [string, string][] = []): Promise<Record<string, any>> {
  let code = source;
  for (const [avant, apres] of remplacer) code = code.replace(avant, apres);
  const fichier = join(mkdtempSync(join(tmpdir(), 'humalis-fournisseurs-')), 'module.ts');
  writeFileSync(fichier, code);
  return import(/* @vite-ignore */ fichier);
}

/** Une réponse Express réduite : ce que creerIa et le webhook utilisent. */
function fausseReponse() {
  const r = { statut: 200, entetes: {} as Record<string, string>, morceaux: [] as string[], json: undefined as unknown, fini: false, fermeture: [] as (() => void)[] };
  const res = {
    status(s: number) { r.statut = s; return res; },
    json(corps: unknown) { r.json = corps; r.fini = true; return res; },
    writeHead(s: number, entetes: Record<string, string>) { r.statut = s; r.entetes = entetes; return res; },
    write(morceau: string) { r.morceaux.push(morceau); return true; },
    end() { r.fini = true; return res; },
    on(evenement: string, f: () => void) { if (evenement === 'close') r.fermeture.push(f); return res; },
  };
  return { r, res };
}

const textes = (morceaux: string[]) => morceaux.map((m) => JSON.parse(m.replace(/^data: /, '').trim()) as { t?: string; erreur?: string });

describe('le code IA produit, contre de faux services compatibles OpenAI', () => {
  let ia: Record<string, any>;
  let service: Server;
  let adresse = '';
  const recus: { chemin: string; autorisation?: string; corps: Record<string, unknown> }[] = [];
  const comportement: Record<string, (res: ServerResponse) => void> = {};

  beforeAll(async () => {
    const fichiers = genererProjetServeur(compiler(SERVEUR(BESOINS)).application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' });
    ia = await charger(fichiers.get('src/humalis/ia.ts')!);
    service = createServer((req: IncomingMessage, res: ServerResponse) => {
      const m: Buffer[] = [];
      req.on('data', (d: Buffer) => m.push(d));
      req.on('end', () => {
        recus.push({ chemin: req.url ?? '', autorisation: req.headers.authorization, corps: JSON.parse(Buffer.concat(m).toString()) });
        const [, nom] = /^\/([^/]+)\//.exec(req.url ?? '') ?? [];
        comportement[nom ?? '']!(res);
      });
    });
    await new Promise<void>((ok) => service.listen(0, '127.0.0.1', ok));
    adresse = `http://127.0.0.1:${(service.address() as { port: number }).port}`;
    const flux = (morceaux: string[]) => (res: ServerResponse) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const t of morceaux) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t }, finish_reason: null }] })}\n\n`);
      res.end('data: [DONE]\n\n');
    };
    comportement.bon = flux(['<thi', 'nk>je réfléchis</think>', 'Bon', 'jour ', 'à vous']);
    comportement.secours = flux(['Je ', 'reprends']);
    comportement.panne = (res) => { res.writeHead(500); res.end(); };
    comportement.occupe = (res) => { res.writeHead(429); res.end(); };
    comportement.entier = (res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: 'Tout d’un coup' }, finish_reason: 'stop' }] })); };
  });
  afterAll(() => service.close());

  const demander = async (env: Record<string, string>) => {
    const { r, res } = fausseReponse();
    await new Promise<void>((ok, ko) => ia.creerIa(ia.compterMemoire(), env)({ body: { question: 'Bonjour ?' }, user: { id: 7 } }, res, ko).then(ok, ko));
    return r;
  };

  it('sans adresse ni modèle : 503, et le message dit exactement quoi régler', async () => {
    const r = await demander({});
    expect(r.statut).toBe(503);
    expect(r.json).toEqual({ erreur: "l'IA n'est pas réglée sur ce serveur : renseignez HUMALIS_IA_ADRESSE et HUMALIS_IA_MODELE dans le .env" });
    expect((await demander({ HUMALIS_IA_ADRESSE: adresse + '/bon/v1' })).json).toEqual({ erreur: "l'IA n'est pas réglée sur ce serveur : renseignez HUMALIS_IA_MODELE dans le .env" });
    expect((await demander({ HUMALIS_IA_ADRESSE: adresse + '/bon/v1', HUMALIS_IA_MODELE: 'm', HUMALIS_IA_CLE_2: 'k' })).statut).toBe(503);
  });

  it('la réponse part au fil de l’eau, sans la réflexion du modèle ; sans clé, aucun en-tête d’autorisation', async () => {
    const r = await demander({ HUMALIS_IA_ADRESSE: adresse + '/bon/v1/', HUMALIS_IA_MODELE: 'modele-local' });
    expect(r.statut).toBe(200);
    expect(textes(r.morceaux).map((m) => m.t).join('')).toBe('Bonjour à vous');
    expect(r.morceaux.length).toBeGreaterThanOrEqual(3);
    const recu = recus.at(-1)!;
    expect(recu.chemin).toBe('/bon/v1/chat/completions');
    expect(recu.autorisation).toBeUndefined();
    expect(recu.corps).toEqual({ model: 'modele-local', messages: [{ role: 'user', content: 'Bonjour ?' }], stream: true });
  });

  it('avec une clé et une longueur : la clé part en Bearer, la longueur en max_tokens', async () => {
    await demander({ HUMALIS_IA_ADRESSE: adresse + '/bon/v1', HUMALIS_IA_MODELE: 'm', HUMALIS_IA_CLE: 'cle-secrete', HUMALIS_IA_JETONS: '500' });
    expect(recus.at(-1)!.autorisation).toBe('Bearer cle-secrete');
    expect(recus.at(-1)!.corps.max_tokens).toBe(500);
  });

  it('le premier service tombe avant d’écrire : le secours (_2) reprend la question', async () => {
    const r = await demander({ HUMALIS_IA_ADRESSE: adresse + '/panne/v1', HUMALIS_IA_MODELE: 'a', HUMALIS_IA_ADRESSE_2: adresse + '/secours/v1', HUMALIS_IA_MODELE_2: 'b' });
    expect(textes(r.morceaux).map((m) => m.t).join('')).toBe('Je reprends');
    expect(recus.at(-1)!.corps.model).toBe('b');
  });

  it('sans secours, une panne et un service débordé ont chacun leur message, sans la clé dans le journal', async () => {
    const erreur = console.error;
    const journal: unknown[] = [];
    console.error = (...a: unknown[]) => journal.push(a);
    try {
      expect(textes((await demander({ HUMALIS_IA_ADRESSE: adresse + '/panne/v1', HUMALIS_IA_MODELE: 'a', HUMALIS_IA_CLE: 'cle-secrete' })).morceaux)).toEqual([{ erreur: "L'IA n'a pas répondu : réessayez dans un instant." }]);
      expect(textes((await demander({ HUMALIS_IA_ADRESSE: adresse + '/occupe/v1', HUMALIS_IA_MODELE: 'a' })).morceaux)).toEqual([{ erreur: "L'IA est très demandée : réessayez dans un instant." }]);
    } finally {
      console.error = erreur;
    }
    expect(JSON.stringify(journal)).not.toContain('cle-secrete');
  });

  it('un service qui ne répond pas en flux : la réponse entière, d’un coup', async () => {
    expect(textes((await demander({ HUMALIS_IA_ADRESSE: adresse + '/entier/v1', HUMALIS_IA_MODELE: 'a' })).morceaux)).toEqual([{ t: 'Tout d’un coup' }]);
  });
});

describe('le code des paiements produit : le contrat signé du relais', () => {
  const SECRET = 'secret-du-relais-de-paiement-essai-0123456789';
  let module: Record<string, any>;
  let relais: Server;
  let adresse = '';
  const demandes: { signature: string; corps: string }[] = [];
  let reponseRelais = { url: 'https://paiement.essai.test/p/1' } as unknown;

  beforeAll(async () => {
    const fichiers = genererProjetServeur(compiler(SERVEUR(BESOINS)).application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' });
    module = await charger(fichiers.get('src/humalis/paiements.ts')!, [["import express, { type RequestHandler } from 'express';", 'type RequestHandler = any;\nconst express = { raw: () => (_q: unknown, _r: unknown, n: () => void) => n() };']]);
    relais = createServer((req, res) => {
      const m: Buffer[] = [];
      req.on('data', (d: Buffer) => m.push(d));
      req.on('end', () => {
        demandes.push({ signature: String(req.headers['x-humalis-signature']), corps: Buffer.concat(m).toString() });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reponseRelais));
      });
    });
    await new Promise<void>((ok) => relais.listen(0, '127.0.0.1', ok));
    adresse = `http://127.0.0.1:${(relais.address() as { port: number }).port}/relais`;
    process.env.HUMALIS_ADRESSE_SITE = 'https://boutique.essai.test';
  });
  afterAll(() => relais.close());

  const confirmes: unknown[][] = [];
  const paiements = (env: Record<string, string>) => module.creerPaiements({ env, surConfirme: async (...a: unknown[]) => { confirmes.push(a); } });

  it('sans relais ni secret assez long : 503, et le message dit quoi régler', async () => {
    expect(await paiements({}).creer({ donnee: 'resa', champ: 'total', id: '1', centimes: 700, retour: '/' })).toEqual({ statut: 503, erreur: 'les paiements ne sont pas réglés sur ce serveur : renseignez HUMALIS_PAIEMENT_ADRESSE, HUMALIS_PAIEMENT_SECRET (32 caractères au moins) dans le .env' });
    expect((await paiements({ HUMALIS_PAIEMENT_ADRESSE: adresse, HUMALIS_PAIEMENT_SECRET: 'court' }).creer({ donnee: 'resa', champ: 'total', id: '1', centimes: 700, retour: '/' })).statut).toBe(503);
  });

  it('la demande au relais est signée ; il rend la page de paiement, et une adresse non https est refusée', async () => {
    const env = { HUMALIS_PAIEMENT_ADRESSE: adresse, HUMALIS_PAIEMENT_SECRET: SECRET };
    expect(await paiements(env).creer({ donnee: 'resa', champ: 'total', id: '42', centimes: 700, retour: '/mes-resas' })).toEqual({ url: 'https://paiement.essai.test/p/1' });
    const { signature, corps } = demandes.at(-1)!;
    expect(module.signatureValable(SECRET, corps, signature)).toBe(true);
    const lu = JSON.parse(corps);
    expect(lu).toMatchObject({ montant: 700, devise: 'eur', libelle: 'resa', retour: 'https://boutique.essai.test/mes-resas' });
    expect(JSON.parse(Buffer.from(lu.reference, 'base64url').toString())).toEqual(['resa', '42', 'total']);
    reponseRelais = { url: 'javascript:alert(1)' };
    const erreur = console.error;
    console.error = () => {};
    try {
      expect((await paiements(env).creer({ donnee: 'resa', champ: 'total', id: '42', centimes: 700, retour: '/' })).statut).toBe(502);
    } finally {
      console.error = erreur;
      reponseRelais = { url: 'https://paiement.essai.test/p/1' };
    }
  });

  const appelerWebhook = async (env: Record<string, string>, corps: string, signature: string) => {
    const { r, res } = fausseReponse();
    const [, gestion] = paiements(env).webhook;
    await gestion({ body: Buffer.from(corps), headers: { 'x-humalis-signature': signature } }, res);
    return r;
  };
  const signer = (corps: string, secondes = Math.floor(Date.now() / 1000), secret = SECRET) => 't=' + secondes + ',v1=' + createHmac('sha256', secret).update(secondes + '.' + corps).digest('hex');

  it('seule une confirmation signée, récente et dans la bonne devise marque la fiche payée', async () => {
    const env = { HUMALIS_PAIEMENT_ADRESSE: adresse, HUMALIS_PAIEMENT_SECRET: SECRET };
    const reference = Buffer.from(JSON.stringify(['resa', '42', 'total'])).toString('base64url');
    const corps = JSON.stringify({ evenement: 'paye', reference, montant: 700, devise: 'EUR' });
    expect((await appelerWebhook(env, corps, signer(corps, undefined, 'un-autre-secret-de-relais-0123456789'))).statut).toBe(400);
    expect((await appelerWebhook(env, corps, signer(corps, Math.floor(Date.now() / 1000) - 3600))).statut).toBe(400);
    const autreDevise = JSON.stringify({ evenement: 'paye', reference, montant: 700, devise: 'usd' });
    expect((await appelerWebhook(env, autreDevise, signer(autreDevise))).statut).toBe(400);
    expect(confirmes).toEqual([]);
    const r = await appelerWebhook(env, corps, signer(corps));
    expect(r.json).toEqual({ recu: true });
    expect(confirmes).toEqual([['resa', '42', 'total', 700]]);
  });
});
