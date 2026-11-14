import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BASES } from './aide-sqlite.js';
import { jouer, type Reponse } from './aide-serveur-produit.js';
import { Machine } from '../src/machine/machine.js';

/**
 * « inscription libre comme client vers "confirmation" » sur un vrai serveur produit, en mémoire et dans SQLite :
 * le parcours complet, puis les attaques. Un faux Brevo garde les e-mails ; un faux Google signe des jetons
 * d'identité avec une clé tirée au hasard, servie à la place de celles de Google.
 */
const SOURCE = readFileSync(new URL('./serveur-inscription-libre.humalis', import.meta.url), 'utf8');
/** Le même serveur sans la ligne, et sans les pages qui l'emploient. */
const SANS_INSCRIPTION = SOURCE.split('\npage "inscription"')[0]!.replace('    inscription libre comme client vers "confirmation"\n', '') + SOURCE.slice(SOURCE.indexOf('\npage "nouveau-mot-de-passe"'));

const ENTETE = `
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';
import { creerEmails } from './dist/src/humalis/emails.js';
import { creerMagasinJetons } from './dist/src/humalis/comptes.js';

process.env.HUMALIS_ADRESSE_SITE = 'https://boutique.essai.test';
process.env.HUMALIS_LIMITE_CONNEXION = '1000';
const secret = 'Essai-Solide-2026!';
const JOUR = 24 * 60 * 60 * 1000;

// Le faux Google : une clé à nous, servie à l'adresse des clés de Google ; tout le reste passe.
const ID_GOOGLE = 'id-essai.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'cle-essai', alg: 'RS256', use: 'sig' };
const vraiFetch = globalThis.fetch;
globalThis.fetch = (url, options) => String(url) === 'https://www.googleapis.com/oauth2/v3/certs'
  ? Promise.resolve(new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'content-type': 'application/json' } }))
  : vraiFetch(url, options);
const b64 = (objet) => Buffer.from(JSON.stringify(objet)).toString('base64url');
const jetonGoogle = (email, sub) => {
  const maintenant = Math.floor(Date.now() / 1000);
  const corps = b64({ alg: 'RS256', kid: 'cle-essai', typ: 'JWT' }) + '.' + b64({ iss: 'https://accounts.google.com', aud: ID_GOOGLE, sub, email, email_verified: true, iat: maintenant, exp: maintenant + 600 });
  return corps + '.' + sign('sha256', Buffer.from(corps), privateKey).toString('base64url');
};

// Le faux Brevo.
const boite = [];
const transport = async (_url, options) => {
  boite.push(JSON.parse(options.body));
  return new Response('{}', { status: 201 });
};
const emails = creerEmails({ nom: 'Boutique', env: { BREVO_API_KEY: 'cle-de-test', BREVO_EXPEDITEUR: 'envoi@essai.test' }, transport });
const jetons = creerMagasinJetons(null);

const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
`;

const DEMARRER = (stockages: string[]) => `
const s = () => creerStockageMemoire();
const stockages = { ${stockages.map((n) => `${n}: s()`).join(', ')} };
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages, emails, jetons, googleClientId: ID_GOOGLE });
const ecoute = app.listen(0);
await new Promise((pret) => ecoute.once('listening', pret));
const base = 'http://127.0.0.1:' + ecoute.address().port;
const json = { 'content-type': 'application/json' };
// Un visiteur, comme un navigateur : le cookie CSRF reçu à la première visite, renvoyé dans l'en-tête.
const csrf = /astratra_csrf=([^;]+)/.exec((await fetch(base + '/auth/me')).headers.getSetCookie().join(';'))[1];
const visiteur = { ...json, cookie: 'astratra_csrf=' + csrf, 'x-csrf-token': csrf };
const appel = async (methode, chemin, entetes, corps) => {
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};
const connexion = (email, password = secret) => appel('POST', '/auth/login', json, { email, password });
const google = (email, sub) => appel('POST', '/auth/google', visiteur, { idToken: jetonGoogle(email, sub) });
const r = {};
`;

const scenario = (stockages: string[]) => `${ENTETE}
await usersStore.create({ email: 'awa@essai.test', role: 'client', passwordHash, nom: 'Awa' });
await usersStore.create({ email: 'admin@essai.test', role: 'admin', passwordHash });
// Une inscription jamais confirmée, vieille de huit jours ; une autre d'hier ; une invitation d'un admin, vieille aussi.
const vieux = await usersStore.create({ email: 'vieux@essai.test', role: 'client', invitation: true, inscription: Date.now() - 8 * JOUR, passwordHash, nom: 'Vieux' });
const hier = await usersStore.create({ email: 'hier@essai.test', role: 'client', invitation: true, inscription: Date.now() - JOUR, passwordHash });
const invite = await usersStore.create({ email: 'invite@essai.test', role: 'vendeur', invitation: true });
${DEMARRER(stockages)}
const inscriptions = [];
const inscrire = async (corps) => {
  const reponse = await appel('POST', '/auth/inscription', visiteur, corps);
  inscriptions.push(reponse.statut);
  return reponse;
};
const jetonDe = (email) => /#jeton=([0-9a-f]{64})/.exec(email.textContent)?.[1] ?? null;
const dernierPour = (adresse) => [...boite].reverse().find((e) => e.to.some((t) => t.email === adresse));

r.faible = await inscrire({ email: 'neuf@essai.test', motDePasse: 'faible' });
r.mauvaiseAdresse = await inscrire({ email: 'pas une adresse', motDePasse: secret });
r.champInconnu = await inscrire({ email: 'neuf@essai.test', motDePasse: secret, champs: { age: 3 } });
r.rienAvant = { statut: 0, corps: { boite: boite.length } };

// Le parcours : le rôle envoyé est ignoré ; seul le nom, déclaré dans « compte : », est gardé.
r.neuf = await inscrire({ email: ' Neuf@Essai.test ', motDePasse: secret, role: 'admin', champs: { nom: 'Neuf' }, groupes: { boutique: 'b1' } });
const lienNeuf = dernierPour('neuf@essai.test');
const jetonNeuf = jetonDe(lienNeuf);
r.lienNeuf = { statut: 0, corps: { sujet: lienNeuf?.subject, texte: lienNeuf?.textContent, html: lienNeuf?.htmlContent, jeton: jetonNeuf } };
const compteNeuf = await usersStore.findByEmail('neuf@essai.test');
r.compteNeuf = { statut: 0, corps: { ...compteNeuf, passwordHash: typeof compteNeuf.passwordHash } };
r.connexionAvant = await connexion('neuf@essai.test');
r.empreinteSeule = { statut: 0, corps: { trouve: await jetons.find(jetonNeuf), parReset: (await appel('POST', '/auth/reset-password', json, { token: jetonNeuf, password: 'Autre-Solide-2026!' })).statut } };

// Une adresse déjà inscrite et confirmée : la même réponse, un e-mail qui le dit, aucun changement.
r.existant = await inscrire({ email: 'awa@essai.test', motDePasse: 'Autre-Solide-2026!', champs: { nom: 'Pirate' } });
const lienAwa = dernierPour('awa@essai.test');
r.lienAwa = { statut: 0, corps: { sujet: lienAwa?.subject, texte: lienAwa?.textContent, jeton: lienAwa ? jetonDe(lienAwa) : null } };
r.awaApres = { statut: 0, corps: { ancien: (await connexion('awa@essai.test')).statut, nouveau: (await connexion('awa@essai.test', 'Autre-Solide-2026!')).statut, nom: (await usersStore.findByEmail('awa@essai.test')).nom } };
// Une invitation d'un admin en attente : la même réponse, l'invitation ne change pas.
r.invite = await inscrire({ email: 'invite@essai.test', motDePasse: 'Autre-Solide-2026!' });
r.inviteApres = { statut: 0, corps: await usersStore.findById(String(invite.id)) };
// La même adresse dix minutes après : la même réponse, sans nouvel e-mail.
const avantRedite = boite.length;
r.redite = await inscrire({ email: 'neuf@essai.test', motDePasse: 'Encore-Solide-2026!' });
r.rediteApres = { statut: 0, corps: { emails: boite.length - avantRedite, connexion: (await connexion('neuf@essai.test', 'Encore-Solide-2026!')).statut } };

// La confirmation : un jeton inconnu, puis le bon, puis le même une seconde fois.
r.jetonFaux = await appel('POST', '/auth/confirmation', visiteur, { jeton: 'a'.repeat(64) });
r.sansJeton = await appel('POST', '/auth/confirmation', visiteur, {});
r.confirme = await appel('POST', '/auth/confirmation', visiteur, { jeton: jetonNeuf });
r.reutilise = await appel('POST', '/auth/confirmation', visiteur, { jeton: jetonNeuf });
r.connexionApres = await connexion('neuf@essai.test');
const entreeNeuf = { ...json, authorization: 'Bearer ' + r.connexionApres.corps?.data?.token };
r.monCompte = await appel('GET', '/api/moi', entreeNeuf);
r.compteConfirme = { statut: 0, corps: await usersStore.findByEmail('neuf@essai.test') };

// Un lien de plus de 24 heures : refusé, et le compte reste fermé.
await inscrire({ email: 'tard@essai.test', motDePasse: secret });
const jetonTard = jetonDe(dernierPour('tard@essai.test'));
const empreinte = createHash('sha256').update('confirmation:' + jetonTard).digest('hex');
const lienTard = await jetons.consume(empreinte);
await jetons.save({ ...lienTard, expiresAt: Date.now() - 1000 });
r.perime = await appel('POST', '/auth/confirmation', visiteur, { jeton: jetonTard });
r.connexionPerime = await connexion('tard@essai.test');
r.lienTardTrouve = { statut: 0, corps: { avant: lienTard !== null } };

// Le ménage : l'inscription de huit jours a été vidée à la première inscription ; celle d'hier et l'invitation restent.
r.menage = { statut: 0, corps: {
  vieux: await usersStore.findById(String(vieux.id)),
  vieuxParAdresse: await usersStore.findByEmail('vieux@essai.test'),
  hier: await usersStore.findById(String(hier.id)),
  invite: await usersStore.findById(String(invite.id)),
} };

// Google : une adresse inconnue crée un compte client, déjà confirmé, sans mot de passe.
r.googleNouveau = await google('nouveau.google@essai.test', 'sub-1');
r.compteGoogle = { statut: 0, corps: await usersStore.findByEmail('nouveau.google@essai.test') };
// Quelqu'un inscrit l'adresse d'une autre personne avec son propre mot de passe ; elle entre avec Google :
// le mot de passe choisi par l'autre ne sert plus.
await inscrire({ email: 'cible@essai.test', motDePasse: 'Pirate-Solide-2026!' });
r.googleCible = await google('cible@essai.test', 'sub-2');
r.piratageApres = await connexion('cible@essai.test', 'Pirate-Solide-2026!');
r.compteCible = { statut: 0, corps: await usersStore.findByEmail('cible@essai.test') };

// Dix inscriptions par heure et par adresse IP : la onzième est refusée, quelle que soit l'adresse.
for (let i = 0; inscriptions.length < 13; i++) await inscrire({ email: 'flot' + i + '@essai.test', motDePasse: secret });
r.limite = { statut: 0, corps: { statuts: inscriptions } };
r.journal = { statut: 0, corps: { lignes: journal } };

ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

/** Rien dans les journaux : chaque ligne écrite par le serveur est gardée pour être relue. */
const AVEC_JOURNAL = (code: string) =>
  code.replace(
    "const secret = 'Essai-Solide-2026!';",
    "const secret = 'Essai-Solide-2026!';\nconst journal = [];\nfor (const niveau of ['log', 'info', 'warn', 'error']) { const avant = console[niveau]; console[niveau] = (...morceaux) => { journal.push(morceaux.map(String).join(' ')); if (niveau !== 'log') avant(...morceaux); }; }\nconst ecrire = (texte) => process.stdout.write(texte + '\\n');",
  ).replace('console.log(JSON.stringify(r));', 'ecrire(JSON.stringify(r));');

const scenarioFerme = (stockages: string[]) => `${ENTETE}
${DEMARRER(stockages)}
r.google = await google('inconnu@essai.test', 'sub-9');
r.inscription = await appel('POST', '/auth/inscription', visiteur, { email: 'neuf@essai.test', motDePasse: secret });
r.confirmation = await appel('POST', '/auth/confirmation', visiteur, { jeton: 'a'.repeat(64) });
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

const SUR_SQLITE = (code: string) => code.replace('creerMagasinJetons(null)', 'creerMagasinJetons(BASE_SQLITE)');

let r: Record<string, Reponse>;

describe.each(BASES)('l’inscription libre sur un vrai serveur produit, %s', (_base, sqlite) => {
  beforeAll(() => {
    r = jouer(SOURCE, 'inscription-libre', (s) => AVEC_JOURNAL(scenario(s)), sqlite, SUR_SQLITE);
  }, 300_000);

  it('un mot de passe faible, une adresse mal écrite ou un champ inconnu sont refusés, sans e-mail', () => {
    expect(r.faible!.statut).toBe(400);
    expect(r.faible!.corps.erreur).toContain('trop faible');
    expect(r.mauvaiseAdresse!.statut).toBe(400);
    expect(r.champInconnu!.statut).toBe(400);
    expect(r.rienAvant!.corps.boite).toBe(0);
  });

  it('le compte est créé en attente, au rôle de la phrase : le rôle et le groupe envoyés sont ignorés', () => {
    expect(r.neuf!.statut).toBe(200);
    expect(r.neuf!.corps).toEqual({ envoye: true });
    const compte = r.compteNeuf!.corps;
    expect(compte).toMatchObject({ email: 'neuf@essai.test', role: 'client', invitation: true, nom: 'Neuf', passwordHash: 'string' });
    expect(compte.boutique).toBeUndefined();
    expect(typeof compte.inscription).toBe('number');
  });

  it('le lien de confirmation part par e-mail, vers la page de la phrase ; seule son empreinte est gardée', () => {
    const lien = r.lienNeuf!.corps;
    expect(lien.sujet).toBe('Confirmez votre adresse : boutique');
    expect(lien.texte).toContain('https://boutique.essai.test/confirmation#jeton=');
    expect(lien.texte).toContain('valable 24 heures');
    expect(lien.html).toContain('https://boutique.essai.test/confirmation#jeton=');
    expect(lien.jeton).toMatch(/^[0-9a-f]{64}$/);
    expect(r.empreinteSeule!.corps.trouve).toBeNull();
  });

  it('avant la confirmation, aucune connexion ; le lien ne sert pas à choisir un mot de passe', () => {
    expect(r.connexionAvant!.statut).toBe(401);
    expect(r.empreinteSeule!.corps.parReset).toBe(400);
  });

  it('une adresse déjà inscrite : la même réponse, un e-mail qui le dit, sans lien ni changement', () => {
    expect(r.existant!.statut).toBe(r.neuf!.statut);
    expect(r.existant!.corps).toEqual(r.neuf!.corps);
    expect(r.lienAwa!.corps.sujet).toBe('Votre compte boutique');
    expect(r.lienAwa!.corps.texte).toContain('déjà un compte');
    expect(r.lienAwa!.corps.jeton).toBeNull();
    expect(r.awaApres!.corps).toEqual({ ancien: 200, nouveau: 401, nom: 'Awa' });
  });

  it('une invitation en attente ne change pas', () => {
    expect(r.invite!.corps).toEqual({ envoye: true });
    expect(r.inviteApres!.corps).toMatchObject({ role: 'vendeur', invitation: true });
    expect(r.inviteApres!.corps.passwordHash ?? null).toBeNull();
  });

  it('la même adresse avant dix minutes : la même réponse, sans e-mail ni changement', () => {
    expect(r.redite!.corps).toEqual({ envoye: true });
    expect(r.rediteApres!.corps).toEqual({ emails: 0, connexion: 401 });
  });

  it('un jeton inconnu ou absent est refusé ; le bon confirme une seule fois', () => {
    expect(r.jetonFaux!.statut).toBe(400);
    expect(r.jetonFaux!.corps.erreur).toBe("ce lien de confirmation n'est plus valable : inscrivez-vous de nouveau");
    expect(r.sansJeton!.statut).toBe(400);
    expect(r.confirme!.statut).toBe(200);
    expect(r.confirme!.corps).toEqual({ confirme: true });
    expect(r.reutilise!.statut).toBe(400);
  });

  it('après la confirmation, la personne se connecte avec son mot de passe, au rôle de la phrase', () => {
    expect(r.connexionApres!.statut).toBe(200);
    expect((r.connexionApres!.corps.data as { user: { role: string } }).user.role).toBe('client');
    expect(r.monCompte!.corps).toEqual([expect.objectContaining({ email: 'neuf@essai.test', role: 'client', statut: 'actif', nom: 'Neuf' })]);
    expect(r.compteConfirme!.corps.invitation).toBe(false);
    expect(r.compteConfirme!.corps.inscription ?? null).toBeNull();
  });

  it('un lien de plus de 24 heures est refusé, et le compte reste fermé', () => {
    expect(r.lienTardTrouve!.corps.avant).toBe(true);
    expect(r.perime!.statut).toBe(400);
    expect(r.connexionPerime!.statut).toBe(401);
  });

  it('une inscription jamais confirmée est vidée au bout de sept jours ; une plus récente et une invitation restent', () => {
    const { vieux, vieuxParAdresse, hier, invite } = r.menage!.corps as Record<string, Record<string, unknown> | null>;
    expect(vieuxParAdresse).toBeNull();
    expect(vieux!.role).toBe('supprime');
    expect(vieux!.email).toMatch(/^supprime-.+@supprime\.invalid$/);
    expect(vieux!.passwordHash ?? null).toBeNull();
    expect(vieux!.nom ?? null).toBeNull();
    expect(hier!.email).toBe('hier@essai.test');
    expect(invite!.email).toBe('invite@essai.test');
  });

  it('Google : une adresse inconnue crée un compte client déjà confirmé, sans mot de passe', () => {
    expect(r.googleNouveau!.statut).toBe(200);
    expect(r.compteGoogle!.corps).toMatchObject({ email: 'nouveau.google@essai.test', role: 'client', googleSubject: 'sub-1' });
    expect(r.compteGoogle!.corps.invitation ?? false).toBe(false);
    expect(r.compteGoogle!.corps.passwordHash ?? null).toBeNull();
  });

  it('Google sur une inscription en attente : le compte s’ouvre, et le mot de passe choisi par un autre ne sert plus', () => {
    expect(r.googleCible!.statut).toBe(200);
    expect(r.piratageApres!.statut).toBe(401);
    expect(r.compteCible!.corps).toMatchObject({ invitation: false, googleSubject: 'sub-2' });
    expect(r.compteCible!.corps.passwordHash ?? null).toBeNull();
  });

  it('dix inscriptions par heure et par adresse IP', () => {
    const statuts = r.limite!.corps.statuts as number[];
    expect(statuts.slice(0, 10)).not.toContain(429);
    expect(statuts.slice(10)).toEqual([429, 429, 429]);
  });

  it('rien dans les journaux : ni adresse ni mot de passe', () => {
    const lignes = (r.journal!.corps.lignes as string[]).join('\n');
    expect(lignes).not.toMatch(/@essai\.test/);
    expect(lignes).not.toContain('Solide-2026');
  });
});

describe('sans « inscription libre » sur un vrai serveur produit', () => {
  beforeAll(() => {
    r = jouer(SANS_INSCRIPTION, 'inscription-libre', scenarioFerme, false);
  }, 300_000);

  it('Google refuse une adresse inconnue, et les routes de l’inscription n’existent pas', () => {
    expect(r.google!.statut).toBe(403);
    expect(r.google!.corps.erreur).toBe("ce compte Google n'a pas accès à l'application");
    expect(r.inscription!.statut).toBe(404);
    expect(r.confirmation!.statut).toBe(404);
  });
});

describe('l’inscription libre dans « humalis lancer »', () => {
  it('mêmes règles que le serveur produit, avec le faux e-mail lisible dans la boîte de la machine', async () => {
    const machine = new Machine({ adresse: () => 'http://localhost:5173' });
    const charge = await machine.charger(SOURCE);
    expect(charge.ok, machine.erreurs).toBe(true);
    const serveur = machine.serveur!;
    const mdp = serveur.comptesDEssai[0]!.motDePasse;
    await serveur.creerCompteDEssai('awa@x.fr', 'client', mdp, { nom: 'Awa' });
    const JOUR = 24 * 60 * 60 * 1000;
    const vieux = await serveur.comptes.creer('vieux@x.fr', 'client', mdp, { invitation: true, inscription: Date.now() - 8 * JOUR });
    const hier = await serveur.comptes.creer('hier@x.fr', 'client', mdp, { invitation: true, inscription: Date.now() - JOUR });
    const visiteur = async () => {
      const cookies = new Map<string, string>();
      const appeler = async (methode: string, chemin: string, corps?: unknown) => {
        const jeton = cookies.get('astratra_csrf');
        const reponse = await machine.traiter({ methode, chemin, requete: new URLSearchParams(), entetes: { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...(jeton && methode !== 'GET' ? { 'x-csrf-token': jeton } : {}) }, corps });
        for (const ligne of ([] as string[]).concat(reponse.entetes['set-cookie'] ?? [])) {
          const paire = ligne.split('; ')[0]!;
          cookies.set(paire.slice(0, paire.indexOf('=')), paire.slice(paire.indexOf('=') + 1));
        }
        const texte = typeof reponse.corps === 'string' ? reponse.corps : '';
        return { statut: reponse.statut, json: (texte ? JSON.parse(texte) : undefined) as Record<string, unknown> };
      };
      await appeler('GET', '/auth/me');
      return appeler;
    };
    const V = await visiteur();
    const jetonDe = (lien: string | undefined) => /#jeton=([0-9a-f]{64})$/.exec(lien ?? '')?.[1];
    const dernier = (a: string) => [...serveur.boite].reverse().find((e) => e.a === a);

    expect((await V('POST', '/auth/inscription', { email: 'neuf@x.fr', motDePasse: 'faible' })).statut).toBe(400);
    expect((await V('POST', '/auth/inscription', { email: 'pas une adresse', motDePasse: mdp })).statut).toBe(400);
    expect((await V('POST', '/auth/inscription', { email: 'neuf@x.fr', motDePasse: mdp, champs: { age: 3 } })).statut).toBe(400);
    const neuf = await V('POST', '/auth/inscription', { email: ' Neuf@X.fr ', motDePasse: mdp, role: 'admin', champs: { nom: 'Neuf' } });
    expect([neuf.statut, neuf.json]).toEqual([200, { envoye: true }]);
    expect(serveur.comptes.parEmail('neuf@x.fr')).toMatchObject({ role: 'client', invitation: true, nom: 'Neuf' });
    const lien = dernier('neuf@x.fr')!;
    expect(lien.sujet).toBe('Confirmez votre adresse : boutique');
    expect(lien.lien).toMatch(/^http:\/\/localhost:5173\/confirmation#jeton=[0-9a-f]{64}$/);
    const jeton = jetonDe(lien.lien)!;
    // Le panneau distingue une inscription à confirmer d'une invitation.
    expect(serveur.etat().comptes.find((c) => c.email === 'neuf@x.fr')).toMatchObject({ invitation: true, inscription: true });
    expect(serveur.etat().comptes.find((c) => c.email === 'awa@x.fr')).toMatchObject({ invitation: false, inscription: false });
    expect((await (await visiteur())('POST', '/auth/login', { email: 'neuf@x.fr', password: mdp })).statut).toBe(401);
    // Le lien de confirmation ne choisit pas de mot de passe.
    expect((await V('POST', '/auth/reset-password', { token: jeton, password: 'Autre-Solide-2026!' })).statut).toBe(400);

    // Le ménage : l'inscription de huit jours est vidée ; celle d'hier reste.
    expect(serveur.comptes.comptes.get(vieux.id)).toMatchObject({ role: 'supprime', passwordHash: null });
    expect(serveur.comptes.parEmail('vieux@x.fr')).toBeUndefined();
    expect(serveur.comptes.comptes.get(hier.id)!.email).toBe('hier@x.fr');

    // Une adresse déjà inscrite : la même réponse, un e-mail sans lien, rien ne change.
    const existant = await V('POST', '/auth/inscription', { email: 'awa@x.fr', motDePasse: 'Autre-Solide-2026!' });
    expect([existant.statut, existant.json]).toEqual([neuf.statut, neuf.json]);
    expect(dernier('awa@x.fr')).toMatchObject({ sujet: 'Votre compte boutique' });
    expect(dernier('awa@x.fr')!.lien).toBeUndefined();
    expect((await (await visiteur())('POST', '/auth/login', { email: 'awa@x.fr', password: mdp })).statut).toBe(200);
    // La même adresse avant dix minutes : aucun nouvel e-mail.
    const avant = serveur.boite.length;
    expect((await V('POST', '/auth/inscription', { email: 'neuf@x.fr', motDePasse: 'Encore-Solide-2026!' })).json).toEqual({ envoye: true });
    expect(serveur.boite.length).toBe(avant);

    expect((await V('POST', '/auth/confirmation', { jeton: 'a'.repeat(64) })).statut).toBe(400);
    expect((await V('POST', '/auth/confirmation', { jeton })).json).toEqual({ confirme: true });
    expect((await V('POST', '/auth/confirmation', { jeton })).statut).toBe(400);
    const connexion = await (await visiteur())('POST', '/auth/login', { email: 'neuf@x.fr', password: mdp });
    expect(connexion.statut).toBe(200);
    expect(serveur.comptes.parEmail('neuf@x.fr')).toMatchObject({ invitation: false, inscription: null });

    // Un lien de plus de 24 heures est refusé.
    await V('POST', '/auth/inscription', { email: 'tard@x.fr', motDePasse: mdp });
    const tard = jetonDe(dernier('tard@x.fr')!.lien)!;
    serveur.comptes.liens.get(tard)!.expire = Date.now() - 1000;
    expect((await V('POST', '/auth/confirmation', { jeton: tard })).statut).toBe(400);
    expect((await (await visiteur())('POST', '/auth/login', { email: 'tard@x.fr', password: mdp })).statut).toBe(401);

    // Le panneau dit que les e-mails sont captés.
    expect(serveur.limites.map((l) => l.fonction).join('\n')).toContain('e-mails');
  });
});
