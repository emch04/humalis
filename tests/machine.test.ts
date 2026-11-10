import { describe, expect, it } from 'vitest';
import { Machine, type ReponseHttp } from '../src/machine/machine.js';
import { programme } from './analyse/aide.js';

/** Un client de la machine : garde les cookies et le jeton CSRF comme un navigateur. */
function navigateur(machine: Machine) {
  const cookies = new Map<string, string>();
  const appeler = async (methode: string, chemin: string, corps?: unknown, entetes: Record<string, string> = {}): Promise<ReponseHttp & { json: unknown }> => {
    const [sansRequete, requete = ''] = chemin.split('?');
    const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const csrf = cookies.get('astratra_csrf');
    const reponse = await machine.traiter({
      methode,
      chemin: sansRequete,
      requete: new URLSearchParams(requete),
      entetes: { ...(cookie ? { cookie } : {}), ...(csrf && methode !== 'GET' ? { 'x-csrf-token': csrf } : {}), ...entetes },
      corps,
    });
    for (const ligne of ([] as string[]).concat(reponse.entetes['set-cookie'] ?? [])) {
      const [paire, ...attrs] = ligne.split('; ');
      const [nom, valeur] = [paire.slice(0, paire.indexOf('=')), paire.slice(paire.indexOf('=') + 1)];
      if (attrs.includes('Max-Age=0')) cookies.delete(nom);
      else cookies.set(nom, valeur);
    }
    const texte = typeof reponse.corps === 'string' ? reponse.corps : '';
    let json: unknown;
    try { json = texte ? JSON.parse(texte) : undefined; } catch { json = undefined; }
    return { ...reponse, json };
  };
  return {
    get: (c: string) => appeler('GET', c),
    post: (c: string, b?: unknown) => appeler('POST', c, b ?? {}),
    patch: (c: string, b?: unknown) => appeler('PATCH', c, b ?? {}),
    delete: (c: string) => appeler('DELETE', c),
    appeler,
    cookies,
    async seConnecter(email: string, motDePasse: string) {
      await appeler('GET', '/auth/me');
      return appeler('POST', '/auth/login', { email, password: motDePasse });
    },
  };
}

async function lancerMachine(source: string, ressources?: ConstructorParameters<typeof Machine>[0]['ressources']) {
  const machine = new Machine({ adresse: () => 'http://localhost:5173', ressources });
  const resultat = await machine.charger(source);
  if (!resultat.ok && !source.startsWith('page "a"') && !source.startsWith('utiliser')) throw new Error(machine.erreurs);
  return { machine, resultat };
}
const motDePasseAdmin = (m: Machine) => m.serveur!.comptesDEssai[0].motDePasse;

const COMMERCE = programme(
  'serveur "commerce" :',
  '>roles gerant et vendeur',
  '>emails par brevo',
  '>donnee produit :',
  '>>nom : texte non vide',
  '>>prix : nombre',
  '>donnee commande :',
  '>>total : nombre',
  '>>statut : texte au depart "ouverte"',
  '>route "produits" :',
  '>>tout le monde peut lire produit',
  '>>seul admin peut creer produit',
  '>>seul admin peut modifier produit',
  '>>seul admin peut supprimer produit',
  '>route "commandes" :',
  '>>seul gerant peut lire commande',
  '>>tout le monde peut creer commande',
  '>>seul gerant peut modifier commande',
  '>>seul gerant peut faire "rembourser" sur commande :',
  '>>>si commande.statut est egal a "remboursee" :',
  '>>>>refuser "Déjà remboursée"',
  '>>>changer commande.statut par "remboursee"',
  '>>>envoyer email a "compta@exemple.fr" avec sujet "Remboursement" et texte "Une commande est remboursée"',
  '>>seul gerant peut lire "resume" de commande ou statut est "ouverte" :',
  '>>>calcul recette = somme de total',
  '>>>calcul combien = nombre de commande',
  '>donnees de depart pour produit :',
  '>>nom "Café", prix 3',
  '>>nom "Thé", prix 2',
  '',
  'page "accueil" :',
  '>variable produits = []',
  '>titre "Boutique"',
  '>quand la page se charge :',
  '>>envoyer requete vers "produits" dans produits',
  '>pour chaque p dans produits :',
  '>>texte p.nom',
);

describe('la machine : compilation en mémoire', () => {
  it('compile, sert la page et le serveur sans rien écrire', async () => {
    const { machine, resultat } = await lancerMachine(COMMERCE);
    expect(resultat.ok).toBe(true);
    const page = await machine.traiter({ methode: 'GET', chemin: '/', requete: new URLSearchParams(), entetes: {} });
    expect(page.statut).toBe(200);
    expect(page.corps).toContain('<title>');
    // Chaque page reçoit le client de la machine et l'import du client de session, avant tout module.
    expect(page.corps).toContain('/__machine/client.js');
    expect(page.corps).toContain('importmap');
    expect(String(page.corps).indexOf('/__machine/client.js')).toBeLessThan(String(page.corps).indexOf('type="module"'));
  });

  it('sert les modules du moteur sans import.meta.env et avec le crochet d\'état', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const serveur = await machine.traiter({ methode: 'GET', chemin: '/src/humalis/serveur.js', requete: new URLSearchParams(), entetes: {} });
    expect(serveur.corps).not.toContain('import.meta.env');
    const moteur = await machine.traiter({ methode: 'GET', chemin: '/src/humalis/moteur.js', requete: new URLSearchParams(), entetes: {} });
    expect(moteur.corps).toContain('globalThis.__machine?.boite(this)');
    const centrale = await machine.traiter({ methode: 'GET', chemin: '/src/humalis/centrale.ts', requete: new URLSearchParams(), entetes: {} });
    expect(centrale.entetes['content-type']).toContain('javascript');
    expect(centrale.corps).not.toContain('import(');
  });

  it('une adresse inconnue donne la page « introuvable » en 404', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const r = await machine.traiter({ methode: 'GET', chemin: '/nexiste-pas', requete: new URLSearchParams(), entetes: {} });
    expect(r.statut).toBe(404);
    expect(r.entetes['content-type']).toContain('html');
  });

  it('une faute donne les erreurs avec leur ligne, jamais une exception', async () => {
    const { machine, resultat } = await lancerMachine('page "a" :\n    titre\n');
    expect(resultat.ok).toBe(false);
    expect(resultat.diagnostics.some((d) => d.gravite === 'erreur' && d.ligne > 0)).toBe(true);
    expect(machine.erreurs).toMatch(/Erreur, ligne \d+ :/);
    // Sans programme, la machine sert quand même une page qui montre les erreurs.
    const page = await machine.traiter({ methode: 'GET', chemin: '/', requete: new URLSearchParams(), entetes: {} });
    expect(page.statut).toBe(200);
    expect(page.corps).toContain('Le programme a des erreurs');
  });

  it('refuse un composant externe (npm) en le disant', async () => {
    const { resultat } = await lancerMachine('utiliser composant "Carte" depuis "./Carte.tsx"\npage "a" :\n    titre "A"\n');
    expect(resultat.ok).toBe(false);
    expect(resultat.diagnostics.map((d) => d.message).join('\n')).toMatch(/npm/);
  });

  it('un fichier de style manquant est une erreur claire', async () => {
    const { resultat } = await lancerMachine('utiliser style "./a.css"\npage "a" :\n    titre "A"\n', { texte: () => undefined, octets: () => undefined });
    expect(resultat.ok).toBe(false);
    expect(resultat.diagnostics.map((d) => d.message).join('\n')).toMatch(/introuvable/);
  });
});

describe('la machine : le serveur en mémoire', () => {
  it('écrit les données de départ une seule fois et les sert avec leurs droits', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const b = navigateur(machine);
    const liste = await b.get('/api/produits');
    expect(liste.statut).toBe(200);
    expect((liste.json as { nom: string }[]).map((p) => p.nom)).toEqual(['Café', 'Thé']);
    // Un visiteur ne crée pas : 401 ; le CSRF d'abord, puis la porte.
    expect((await b.post('/api/produits', { nom: 'X', prix: 1 })).statut).toBe(401);
  });

  it('refuse sans jeton CSRF et accepte avec', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const sans = await machine.traiter({ methode: 'POST', chemin: '/api/commandes', requete: new URLSearchParams(), entetes: {}, corps: { total: 5 } });
    expect(sans.statut).toBe(403);
    const b = navigateur(machine);
    await b.get('/api/produits');
    const avec = await b.post('/api/commandes', { total: 5 });
    expect(avec.statut).toBe(201);
    expect(avec.json).toMatchObject({ total: 5, statut: 'ouverte' });
  });

  it('connecte un compte d\'essai, pose les cookies et garde les droits par rôle', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const mdp = motDePasseAdmin(machine);
    const admin = navigateur(machine);
    expect((await admin.seConnecter('admin@machine.humalis', 'mauvais')).statut).toBe(401);
    const ok = await admin.seConnecter('admin@machine.humalis', mdp);
    expect(ok.statut).toBe(200);
    expect(admin.cookies.has('astratra_session')).toBe(true);
    expect(admin.cookies.has('humalis_renouvellement')).toBe(true);
    expect(((await admin.get('/auth/me')).json as { data: { role: string; passwordHash?: string } }).data).toMatchObject({ role: 'admin' });
    expect(((await admin.get('/auth/me')).json as { data: { passwordHash?: string } }).data.passwordHash).toBeUndefined();
    const cree = await admin.post('/api/produits', { nom: 'Sucre', prix: 1 });
    expect(cree.statut).toBe(201);
    expect((await admin.post('/api/produits', { nom: '   ', prix: 1 })).json).toMatchObject({ erreur: 'le champ « nom » ne doit pas être vide' });
    expect((await admin.post('/api/produits', { nom: 'Sel', prix: 'beaucoup' })).json).toMatchObject({ erreur: 'le champ « prix » doit être un nombre' });
    // Un vendeur ne lit pas les commandes ; un gérant oui.
    const vendeur = navigateur(machine);
    await vendeur.seConnecter('vendeur@machine.humalis', mdp);
    expect((await vendeur.get('/api/commandes')).statut).toBe(403);
    const gerant = navigateur(machine);
    await gerant.seConnecter('gerant@machine.humalis', mdp);
    expect((await gerant.get('/api/commandes')).statut).toBe(200);
  });

  it('joue une action en tout ou rien et garde l\'e-mail dans la boîte au lieu de l\'envoyer', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const mdp = motDePasseAdmin(machine);
    const client = navigateur(machine);
    await client.get('/api/produits');
    const commande = (await client.post('/api/commandes', { total: 12 })).json as { id: string };
    const gerant = navigateur(machine);
    await gerant.seConnecter('gerant@machine.humalis', mdp);
    const resume = await gerant.get('/api/commandes/resume');
    expect(resume.json).toEqual({ recette: 12, combien: 1 });
    const fait = await gerant.patch(`/api/commandes/faire/rembourser/${commande.id}`);
    expect(fait.json).toMatchObject({ statut: 'remboursee' });
    const encore = await gerant.patch(`/api/commandes/faire/rembourser/${commande.id}`);
    expect(encore.statut).toBe(400);
    expect(encore.json).toEqual({ erreur: 'Déjà remboursée' });
    // L'e-mail n'est pas parti : il est dans la boîte de la machine, une fois (la seconde action a été refusée).
    expect(machine.serveur!.boite).toHaveLength(1);
    expect(machine.serveur!.boite[0]).toMatchObject({ genre: 'email', a: 'compta@exemple.fr', sujet: 'Remboursement' });
    expect(machine.serveur!.limites.map((l) => l.fonction).join()).toMatch(/e-mails/);
  });

  it('garde les données et les comptes quand le programme change', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const mdp = motDePasseAdmin(machine);
    const b = navigateur(machine);
    await b.get('/api/produits');
    await b.post('/api/commandes', { total: 7 });
    const resultat = await machine.charger(COMMERCE.replace('titre "Boutique"', 'titre "Boutique v2"'));
    expect(resultat.ok).toBe(true);
    expect(resultat.recharge).toBe(true);
    const gerant = navigateur(machine);
    expect((await gerant.seConnecter('gerant@machine.humalis', mdp)).statut).toBe(200);
    expect((await gerant.get('/api/commandes')).json).toHaveLength(1);
    // Les données de départ ne sont pas réécrites.
    expect((await b.get('/api/produits')).json).toHaveLength(2);
  });

  it('une erreur au rechargement garde l\'ancienne version vivante et le dit à la page', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const evenements: string[] = [];
    machine.abonner((e) => evenements.push(e.type));
    const faux = await machine.charger(COMMERCE.replace('titre "Boutique"', 'titre'));
    expect(faux.ok).toBe(false);
    expect(evenements).toContain('erreurs');
    expect((await navigateur(machine).get('/api/produits')).statut).toBe(200);
    const bon = await machine.charger(COMMERCE);
    expect(bon.ok).toBe(true);
    expect(evenements).toEqual(expect.arrayContaining(['ok', 'recharger']));
  });

  it('ne recharge pas la page si seul le serveur change', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const resultat = await machine.charger(COMMERCE.replace('nom "Thé", prix 2', 'nom "Thé", prix 9'));
    expect(resultat.ok).toBe(true);
    expect(resultat.recharge).toBe(false);
  });

  it('renouvelle la session et ferme toute la famille à la déconnexion', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const b = navigateur(machine);
    await b.seConnecter('admin@machine.humalis', motDePasseAdmin(machine));
    const ancien = b.cookies.get('humalis_renouvellement')!;
    const r = await b.post('/auth/refresh');
    expect(r.statut).toBe(200);
    expect(b.cookies.get('humalis_renouvellement')).not.toBe(ancien);
    expect((await b.post('/auth/logout')).statut).toBe(200);
    expect(b.cookies.has('astratra_session')).toBe(false);
    const rejoue = await b.appeler('POST', '/auth/refresh', {}, { cookie: `humalis_renouvellement=${ancien}`, 'x-csrf-token': 'x' });
    // Le CSRF d'abord : sans lui la requête n'arrive même pas au renouvellement.
    expect([401, 403]).toContain(rejoue.statut);
  });

  it('limite les essais de connexion', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const b = navigateur(machine);
    let dernier = 0;
    for (let i = 0; i < 12; i++) dernier = (await b.seConnecter('admin@machine.humalis', 'faux')).statut;
    expect(dernier).toBe(429);
  });

  it('refuse le panneau sans l\'en-tête de la machine, et crée un compte d\'essai avec', async () => {
    const { machine } = await lancerMachine(COMMERCE);
    const sans = await machine.traiter({ methode: 'POST', chemin: '/__machine/comptes', requete: new URLSearchParams(), entetes: {}, corps: { email: 'a@b.fr', role: 'vendeur' } });
    expect(sans.statut).toBe(403);
    const avec = await machine.traiter({ methode: 'POST', chemin: '/__machine/comptes', requete: new URLSearchParams(), entetes: { 'x-humalis-machine': '1' }, corps: { email: 'nina@exemple.fr', role: 'vendeur' } });
    expect(avec.statut).toBe(200);
    const { motDePasse } = JSON.parse(String(avec.corps)) as { motDePasse: string };
    const b = navigateur(machine);
    expect((await b.seConnecter('nina@exemple.fr', motDePasse)).statut).toBe(200);
  });
});

describe('la machine : séparation, auteur, invitations, temps réel, tâches', () => {
  const ECOLE = programme(
    'serveur "commerce" :',
    '>roles gerant et vendeur',
    '>donnee commande par boutique :',
    '>>total : nombre',
    '>donnee note :',
    '>>texte : texte',
    '>route "commandes" :',
    '>>seuls gerant et vendeur peuvent lire commande',
    '>>seul gerant peut creer commande',
    '>>seul gerant peut modifier commande',
    '>route "notes" :',
    '>>connecte peut lire note',
    '>>connecte peut creer note',
    '>>seul son auteur peut modifier et supprimer note',
    '>invitations vers "bienvenue"',
    '>emails par brevo',
    '>route "equipe" :',
    '>>seul admin peut lire comptes',
    '>>seul admin peut creer comptes',
    '',
    'page "accueil" :',
    '>titre "Accueil"',
    '',
    'page "bienvenue" :',
    '>titre "Bienvenue"',
    '',
    'page "notes" :',
    '>variable notes = []',
    '>titre "Notes"',
    '>quand la page se charge :',
    '>>envoyer requete vers "notes" dans notes en direct',
  );

  it('sépare les fiches par groupe : un autre groupe répond introuvable', async () => {
    const { machine } = await lancerMachine(ECOLE);
    const mdp = motDePasseAdmin(machine);
    await machine.serveur!.creerCompteDEssai('b@x.fr', 'gerant', mdp, { boutique: 'b' });
    const a = navigateur(machine);
    await a.seConnecter('gerant@machine.humalis', mdp);
    const creee = (await a.post('/api/commandes', { total: 1 })).json as { id: string; boutique: string };
    expect(creee.boutique).toBe('essai');
    const autre = navigateur(machine);
    await autre.seConnecter('b@x.fr', mdp);
    expect((await autre.get('/api/commandes')).json).toEqual([]);
    expect((await autre.get(`/api/commandes/${creee.id}`)).statut).toBe(404);
    expect((await a.get(`/api/commandes/${creee.id}`)).statut).toBe(200);
  });

  it('« seul son auteur » : le serveur remplit l\'auteur et personne d\'autre ne modifie', async () => {
    const { machine } = await lancerMachine(ECOLE);
    const mdp = motDePasseAdmin(machine);
    const v = navigateur(machine);
    await v.seConnecter('vendeur@machine.humalis', mdp);
    const note = (await v.post('/api/notes', { texte: 'à moi' })).json as { id: string; auteur: string };
    expect(note.auteur).toBeTruthy();
    expect((await v.post('/api/notes', { texte: 'x', auteur: 'moi' })).statut).toBe(400);
    const g = navigateur(machine);
    await g.seConnecter('gerant@machine.humalis', mdp);
    // Une fiche qu'on n'a pas le droit de toucher répond « introuvable », comme dans le serveur produit.
    expect((await g.patch(`/api/notes/${note.id}`, { texte: 'volé' })).statut).toBe(404);
    expect((await v.patch(`/api/notes/${note.id}`, { texte: 'corrigé' })).statut).toBe(200);
  });

  it('invite : l\'e-mail est capté avec son lien, qui ouvre un mot de passe', async () => {
    const { machine } = await lancerMachine(ECOLE);
    const admin = navigateur(machine);
    await admin.seConnecter('admin@machine.humalis', motDePasseAdmin(machine));
    expect((await admin.post('/auth/invitations', { email: 'nouvelle@exemple.fr', role: 'vendeur' })).json).toEqual({ envoye: true });
    const envoi = machine.serveur!.boite.at(-1)!;
    expect(envoi.a).toBe('nouvelle@exemple.fr');
    expect(envoi.lien).toMatch(/^http:\/\/localhost:5173\/bienvenue#jeton=[0-9a-f]{64}$/);
    const jeton = envoi.lien!.split('=')[1];
    const invite = navigateur(machine);
    await invite.get('/auth/me');
    expect((await invite.post('/auth/reset-password', { token: jeton, password: 'faible' })).statut).toBe(400);
    expect((await invite.post('/auth/reset-password', { token: jeton, password: 'Solide-2026!' })).statut).toBe(200);
    expect((await invite.post('/auth/reset-password', { token: jeton, password: 'Solide-2026!' })).statut).toBe(400);
    expect((await invite.seConnecter('nouvelle@exemple.fr', 'Solide-2026!')).statut).toBe(200);
  });

  it('annonce les changements sur le flux « en direct »', async () => {
    const { machine } = await lancerMachine(ECOLE);
    const b = navigateur(machine);
    await b.seConnecter('vendeur@machine.humalis', motDePasseAdmin(machine));
    const flux = await b.get('/api/notes/direct');
    expect(flux.statut).toBe(200);
    const recu: string[] = [];
    const fin = flux.direct!((t) => recu.push(t));
    await b.post('/api/notes', { texte: 'salut' });
    await new Promise((ok) => setTimeout(ok, 250));
    fin();
    expect(recu.join('')).toContain('data: change');
  });
});

describe('la machine : tâches, paiement et ce qui n\'est pas simulé', () => {
  const TACHES = programme(
    'serveur "commerce" :',
    '>roles gerant',
    '>paiements par stripe',
    '>donnee commande :',
    '>>statut : texte',
    '>route "commandes" :',
    '>>tout le monde peut lire commande',
    '>>tout le monde peut creer commande',
    '>>quand commande est payee :',
    '>>>changer commande.statut par "preparee"',
    '>>>envoyer notification aux gerant avec titre "Payée" et texte "ok"',
    '>tous les jours a 7 h :',
    '>>pour chaque c dans commande ou statut est "nouvelle" :',
    '>>>changer c.statut par "archivee"',
  );

  it('lance une tâche à la demande, et refuse le paiement en le disant', async () => {
    const { machine } = await lancerMachine(TACHES);
    const b = navigateur(machine);
    await b.get('/api/commandes');
    await b.post('/api/commandes', { statut: 'nouvelle' });
    const nom = machine.serveur!.etat().taches[0];
    expect((await machine.serveur!.lancerTache(nom)).ok).toBe(true);
    expect((await b.get('/api/commandes')).json).toMatchObject([{ statut: 'archivee' }]);
    const paiement = machine.serveur!.etat().limites.find((l) => l.fonction.includes('paiement'));
    expect(paiement?.traitement).toBe('refuse');
  });

  it('le paiement à la main joue ce que le programme fait après un paiement', async () => {
    const { machine } = await lancerMachine(TACHES);
    const b = navigateur(machine);
    await b.get('/api/commandes');
    const c = (await b.post('/api/commandes', { statut: 'nouvelle' })).json as { id: string };
    const resultat = await machine.serveur!.marquerPaye('commandes', c.id);
    expect(resultat).toEqual({ ok: true });
    expect((await b.get(`/api/commandes/${c.id}`)).json).toMatchObject({ paye: true, statut: 'preparee' });
    expect(await machine.serveur!.marquerPaye('commandes', c.id)).toEqual({ ok: false, erreur: 'déjà payé' });
  });
});
