import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { cheminsDesPages, genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { verifierPourLeStatique } from '../src/cibles/statique/projet.js';
import { programme } from './analyse/aide.js';

const SOURCE = programme(
  'serveur "Le Comptoir" :',
  '>emails par brevo',
  '>invitations vers "bienvenue"',
  '>mot de passe oublie vers "bienvenue"',
  '>donnee message :',
  '>>nom : texte',
  '>>email : texte',
  '>route "messages" :',
  '>>seul admin peut lire message',
  '>>connecte peut creer message',
  '>>quand message est cree :',
  '>>>envoyer email aux admins avec sujet "Nouveau message de {message.nom}" et texte "Bonjour"',
  '>>>envoyer email a "contact@exemple.cd" avec sujet "Copie" et texte "{message.nom}"',
  '>>>envoyer email a message.email avec sujet "Bien reçu" et texte "Merci"',
  '>route "equipe" :',
  '>>seul admin peut lire comptes',
  '>>seul admin peut supprimer comptes',
  '',
  'page "accueil" :',
  '>titre "Accueil"',
  '',
  'page "equipe" reservee a admin sinon vers "accueil" :',
  '>titre "Équipe"',
  '>variable membres = []',
  '>quand la page se charge :',
  '>>envoyer requete vers "equipe" dans membres',
  '>champ email "Adresse"',
  '>bouton "Inviter"',
  '>quand l\'utilisateur clique sur "Inviter" :',
  '>>inviter champ "Adresse" comme admin',
  '>pour chaque m dans membres :',
  '>>texte "{m.email} : {m.statut}"',
  '',
  'page "oublie" :',
  '>titre "Oublié"',
  '>champ email "Email"',
  '>bouton "Recevoir"',
  '>quand l\'utilisateur clique sur "Recevoir" :',
  '>>demander un lien de mot de passe pour champ "Email"',
  '',
  'page "bienvenue" a l\'adresse "/compte/bienvenue" :',
  '>titre "Bienvenue"',
  '>champ mot de passe "Nouveau"',
  '>bouton "Valider"',
  '>quand l\'utilisateur clique sur "Valider" :',
  '>>choisir le mot de passe avec champ "Nouveau"',
);

const application = () => {
  const { application, diagnostics } = compiler(SOURCE);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const serveur = () => {
  const app = application();
  return genererProjetServeur(app.serveurs[0], { nom: 'b', source: 'b.humalis', chemins: cheminsDesPages(app) });
};

describe('les e-mails et les comptes — la RI', () => {
  it('sépare la route des comptes des données, et garde les pages des liens', () => {
    const ri = application().serveurs[0];
    expect(ri.donnees.map((d) => d.nom)).toEqual(['message']);
    expect(ri.routes.map((r) => r.adresse)).toEqual(['messages']);
    expect(ri.routeComptes).toMatchObject({ adresse: 'equipe', droits: { lire: 'admin', supprimer: 'admin', creer: null } });
    expect(ri).toMatchObject({ emails: { service: 'brevo' }, invitations: 'bienvenue', motDePasseOublie: 'bienvenue' });
    expect(ri.routes[0].envois).toEqual([
      { destinataire: { genre: 'admins' }, sujet: [{ texte: 'Nouveau message de ' }, { champ: 'nom' }], texte: [{ texte: 'Bonjour' }] },
      { destinataire: { genre: 'adresse', adresse: 'contact@exemple.cd' }, sujet: [{ texte: 'Copie' }], texte: [{ champ: 'nom' }] },
      { destinataire: { genre: 'champ', champ: 'email' }, sujet: [{ texte: 'Bien reçu' }], texte: [{ texte: 'Merci' }] },
    ]);
  });

  it('une donnée écrite « comptes » reste une donnée ordinaire', () => {
    const source = programme('serveur "s" :', '>donnee comptes :', '>>nom : texte', '>route "comptes" :', '>>tout le monde peut lire comptes', '>>seul admin peut modifier comptes');
    const { application: app, diagnostics } = compiler(source);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(app!.serveurs[0].routeComptes).toBeUndefined();
    expect(app!.serveurs[0].routes[0].donnee).toBe('comptes');
  });

  it('« inviter » reste un nom libre : variable et fonction de ce nom', () => {
    const source = programme('fonction inviter :', '>afficher "Bonjour"', '', 'page "p" :', '>titre "P"', '>variable choisir = 1', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>inviter()', '>>changer choisir par 2');
    expect(compiler(source).diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });
});

describe('les e-mails et les comptes — le serveur produit', () => {
  it('écrit ses fichiers, sa dépendance et ses réglages', () => {
    const fichiers = serveur();
    expect(fichiers.has('src/humalis/emails.ts')).toBe(true);
    expect(fichiers.has('src/humalis/comptes.ts')).toBe(true);
    expect(fichiers.has('tests/comptes.test.ts')).toBe(true);
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['@astratra/notify']).toBeDefined();
    for (const variable of ['BREVO_API_KEY=', 'BREVO_EXPEDITEUR=', 'HUMALIS_ADRESSE_SITE=', 'HUMALIS_EMAILS_PAR_HEURE=']) expect(fichiers.get('.env.exemple')).toContain(variable);
    expect(fichiers.get('src/humalis/coffre.ts')).toContain("key: 'BREVO_API_KEY'");
  });

  it('les routes sont gardées, et le pack sert le mot de passe oublié', () => {
    const code = serveur().get('src/serveur.ts')!;
    expect(code).toContain("routeInvitations.post('/', createApiLimiter({ windowMs: 60 * 60 * 1000, max: 30 }) as unknown as RequestHandler, ...acces.seulAdmin, csrfMiddleware, comptes.inviter);");
    expect(code).toContain('routeEquipe.get(\'/\', lecturePrivee, ...acces.seulAdmin, comptes.lister);');
    expect(code).toContain("routeEquipe.delete('/:id', ...acces.seulAdmin, csrfMiddleware, comptes.retirer);");
    expect(code).toContain('passwordReset: { send: comptes.envoyerLienOublie, store: jetons },');
    // Le lien ouvre le chemin choisi, et le pack ne voit plus les comptes retirés.
    expect(code).toContain('pageInvitation: "/compte/bienvenue"');
    expect(code).toContain('const usersStore = sansLesRetires(tousLesComptes);');
    expect(code).toContain("avant.post('/auth/reset-password', express.json({ limit: '16kb' }), refuserMotDePasseFaible);");
  });

  it('un lien ne se fabrique jamais depuis la requête, et le jeton reste dans le fragment', () => {
    const comptes = serveur().get('src/humalis/comptes.ts')!;
    expect(comptes).toContain('env.HUMALIS_ADRESSE_SITE');
    expect(comptes).not.toMatch(/req\.(get|headers|hostname|protocol)/);
    expect(comptes).toContain('#jeton=');
    expect(comptes).toContain('createHash(\'sha256\')');
    expect(comptes).toContain('RETURNING *');
  });

  it('les e-mails partent après la réponse, sans faire échouer la création', () => {
    const code = serveur().get('src/serveur.ts')!;
    expect(code.indexOf('res.status(201).json(cree);')).toBeLessThan(code.indexOf('await emails.envoyer({ a: await adressesDesAdmins()'));
    expect(code).toContain('sujet: "Nouveau message de " + enTexte(fiche["nom"])');
    expect(code).toContain('a: "contact@exemple.cd"');
    expect(code).toContain('a: enTexte(fiche["email"])');
    expect(code).toContain('})().catch(');
  });

  it('une clé ne se retrouve jamais dans un message d’erreur', () => {
    const emails = serveur().get('src/humalis/emails.ts')!;
    expect(emails).toContain('Brevo a refusé l\'envoi (HTTP ${reponse.status})');
    expect(emails).not.toMatch(/console\.\w+\([^)]*\bcle\b/);
  });

  it('sans ces lignes, le serveur ne change pas', () => {
    const app = compiler(programme('serveur "s" :', '>donnee d :', '>>nom : texte', '>route "d" :', '>>tout le monde peut lire d', '>>seul admin peut modifier d')).application!;
    const fichiers = genererProjetServeur(app.serveurs[0], { nom: 'b', source: 'b.humalis' });
    expect(fichiers.has('src/humalis/emails.ts')).toBe(false);
    expect(fichiers.has('src/humalis/comptes.ts')).toBe(false);
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['@astratra/notify']).toBeUndefined();
    expect(fichiers.get('src/serveur.ts')).not.toContain('passwordReset');
    expect(fichiers.get('.env.exemple')).not.toContain('BREVO');
  });
});

describe('les e-mails et les comptes — les pages', () => {
  it('web : les phrases appellent la session, le jeton vient du fragment', () => {
    const fichiers = genererProjetWeb(application(), { nom: 'b', source: 'b.humalis', adresse: 'https://b.cd' });
    expect(fichiers.get('src/pages/Equipe.tsx')).toContain("if (!(await utilisateur.inviter(String(champAdresse), 'admin'))) return;");
    expect(fichiers.get('src/pages/Oublie.tsx')).toContain('if (!(await utilisateur.demanderLienMotDePasse(String(champEmail)))) return;');
    expect(fichiers.get('src/pages/Bienvenue.tsx')).toContain('if (!(await utilisateur.choisirMotDePasse(String(champNouveau)))) return;');
    const session = fichiers.get('src/humalis/session.tsx')!;
    expect(session).toContain("new URLSearchParams(window.location.hash.slice(1)).get('jeton')");
    expect(session).toContain("window.history.replaceState(null, '', window.location.pathname + window.location.search);");
  });

  it('mobile : un message renvoie vers le site', () => {
    const fichiers = genererProjetMobile(application(), { nom: 'b', source: 'b.humalis' });
    expect(fichiers.get('humalis/session.tsx')).toContain("pas encore disponibles dans l'application mobile");
  });

  it('statique : les trois phrases sont refusées à la compilation', () => {
    const messages = verifierPourLeStatique(application()).map((d) => d.message).join('\n');
    expect(messages).toContain('« inviter »');
    expect(messages).toContain('« demander un lien de mot de passe »');
    expect(messages).toContain('« choisir le mot de passe »');
  });
});
