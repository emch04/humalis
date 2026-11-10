import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { verifierPourLeStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// « connexion google » dans le serveur, « se connecter avec google » dans une page (décision d'Emch).
const source = (avecLigne = true) =>
  programme(
    'serveur "boutique" :',
    ...(avecLigne ? ['>connexion google'] : []),
    '>donnee commande :',
    '>>nom : texte',
    '>route "commandes" :',
    '>>seul admin peut lire commande',
    '',
    'page "connexion" :',
    '>titre "Connexion"',
    '>bouton "Continuer avec Google"',
    '>quand l\'utilisateur clique sur "Continuer avec Google" :',
    '>>essayer :',
    '>>>se connecter avec google',
    '>>>rediriger vers "connexion"',
    '>>si erreur :',
    '>>>afficher erreur "Connexion refusée : {raison}"',
  );

describe('connexion avec Google', () => {
  it('l’analyse accepte les deux lignes, et demande « connexion google » dans le serveur', () => {
    expect(erreurs(source())).toEqual([]);
    expect(erreurs(source(false)).join('\n')).toMatch(/demande la ligne « connexion google » dans le serveur "boutique"/);
  });

  it('après « connexion », le fournisseur est attendu', () => {
    expect(() => erreurs(source().replace('connexion google', 'connexion facebook'))).toThrow(/après « connexion », écrivez le fournisseur : connexion google/);
  });

  it('web : la fenêtre de Google, la page de retour, et la raison d’un refus rendue à « si erreur »', () => {
    const fichiers = genererProjetWeb(compiler(source()).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' });
    const page = fichiers.get('src/pages/Connexion.tsx')!;
    expect(page).toContain('await utilisateur.seConnecterAvecGoogle(true)');
    expect(page).not.toContain('serveur.');
    const session = fichiers.get('src/humalis/session.tsx')!;
    expect(session).toContain('async function seConnecterAvecGoogle(dansUnEssai = false)');
    expect(session).toContain("redirect_uri: window.location.origin + '/auth-google.html'");
    expect(session).toContain("new BroadcastChannel('humalis-google')");
    expect(fichiers.get('public/auth-google.html')).toContain("canal.postMessage({ idToken: reponse.get('id_token'), etat: reponse.get('state') })");
  });

  it('serveur : la route vérifie le jeton avec le pack de sécurité et n’ouvre la session que d’un compte connu', () => {
    const application = compiler(source()).application!;
    const fichiers = genererProjetServeur(application.serveurs[0], { nom: 'b', source: 'b.humalis' } as never);
    const serveur = fichiers.get('src/serveur.ts')!;
    expect(serveur).toContain("import { createGoogleIdTokenVerifier, IdTokenError, createLoginLimiter, hashPassword, isStrongPassword, verifyPasswordHash, WAF_PATTERNS } from '@astratra/security';");
    expect(serveur).toContain("routeGoogle.post('/', createLoginLimiter() as unknown as RequestHandler, csrfMiddleware, async (req, res, next) => {");
    // Le pare-feu du pack, sans le motif des commentaires SQL : « avenue #12 » et « -- » sont de vrais textes.
    expect(serveur).toContain("waf: { patterns: [...WAF_PATTERNS.filter((motif) => !motif.source.includes('--') && !motif.source.includes('union|select|insert')), ...MOTIFS_SQL].map((motif) => new MotifDuPareFeu(motif.source, motif.flags)) },");
    // Comme Tertius et Solvia : le compte est lié au « sub » de Google ; un autre compte Google est refusé.
    expect(serveur).toContain("compte.googleSubject !== profil.subject");
    expect(serveur).toContain("usersStore.update(String(compte.id), { googleSubject: profil.subject })");
    expect(serveur).toContain("app.use('/auth/google', routeGoogle);");
    expect(serveur).toContain('if (!profil.email || !profil.emailVerified)');
    expect(serveur).toContain('const compte = await usersStore.findByEmail(profil.email);');
    expect(serveur).toContain('res.json(await issueSession(res, lie));');
    expect(fichiers.get('src/demarrer.ts')).toContain('googleClientId: () => process.env.GOOGLE_CLIENT_ID || undefined');
    expect(fichiers.get('.env.exemple')).toContain('GOOGLE_CLIENT_ID=');
  });

  it('serveur sans « connexion google » : aucune route Google', () => {
    const sansGoogle = programme('serveur "boutique" :', '>donnee commande :', '>>nom : texte', '>route "commandes" :', '>>seul admin peut lire commande', '', 'page "a" :', '>titre "A"');
    const application = compiler(sansGoogle).application!;
    const serveur = genererProjetServeur(application.serveurs[0], { nom: 'b', source: 'b.humalis' } as never).get('src/serveur.ts')!;
    expect(serveur).not.toContain('/auth/google');
  });

  it('site statique : refusé clairement', () => {
    expect(verifierPourLeStatique(compiler(source()).application!).map((d) => d.message).join('\n')).toMatch(/se connecter avec google/);
  });
});
