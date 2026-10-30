import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb, genererComposantsWeb } from '../src/cibles/web/projet.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

// Six lignes : la page commence ligne 7.
const SERVEUR = [
  'serveur "avis" :',
  '>donnee avis :',
  '>>commentaire : texte',
  '>route "avis" :',
  '>>tout le monde peut lire avis',
  '>>connecte peut creer avis',
];

const corpsDe = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;

/** Une page de connexion : champs ligne 8 et 9, bouton 10, événement 11, action 12. */
const connexion = (...suite: string[]) =>
  programme(
    ...SERVEUR,
    'page "connexion" :',
    '>champ "email"',
    '>champ "mot de passe"',
    '>bouton "Se connecter"',
    '>quand l\'utilisateur clique sur "Se connecter" :',
    '>>se connecter avec champ "email" et champ "mot de passe"',
    ...suite,
  );

describe('connexion — parser', () => {
  it('lit « se connecter avec champ … et champ … »', () => {
    const evenement = corpsDe(connexion())[3];
    expect(evenement).toMatchObject({
      type: 'Evenement',
      corps: [
        {
          type: 'Connexion',
          email: { type: 'Champ', nom: 'email' },
          motDePasse: { type: 'Champ', nom: 'mot de passe' },
          ligne: 12,
        },
      ],
    });
  });

  it('lit « se deconnecter », avec ou sans accent', () => {
    for (const mot of ['se deconnecter', 'se déconnecter']) {
      const corps = corpsDe(programme('page "a" :', '>bouton "Sortir"', '>quand l\'utilisateur clique sur "Sortir" :', `>>${mot}`));
      expect(corps[1]).toMatchObject({ corps: [{ type: 'Deconnexion', ligne: 4 }] });
    }
  });

  it('lit « si utilisateur est connecte » et « si utilisateur est admin »', () => {
    for (const [mot, etat] of [['connecte', 'connecte'], ['connecté', 'connecte'], ['admin', 'admin']]) {
      const corps = corpsDe(programme('page "a" :', `>si utilisateur est ${mot} :`, '>>texte "Bonjour"'));
      expect(corps[0]).toMatchObject({
        type: 'Condition',
        test: { gauche: { type: 'EtatUtilisateur', etat }, operateur: 'vrai' },
        alors: [{ type: 'Element' }],
      });
    }
  });

  it('une variable « utilisateur » se compare toujours', () => {
    const corps = corpsDe(programme('page "a" :', '>variable utilisateur = ""', '>si utilisateur est vide :', '>>texte "?"'));
    expect(corps[1]).toMatchObject({ test: { gauche: { type: 'Reference', nom: 'utilisateur' }, operateur: 'vide' } });
  });

  it('demande « avec » et deux champs', () => {
    expect(compiler(programme('page "a" :', '>quand la page se charge :', '>>se connecter')).diagnostics[0].message).toBe(
      'il manque « avec champ "email" et champ "mot de passe" » après « se connecter » : à la place, on trouve la fin de la ligne',
    );
    expect(compiler(programme('page "a" :', '>champ "email"', '>quand la page se charge :', '>>se connecter avec champ "email"')).diagnostics[0].message).toBe(
      'il manque « et » suivi du champ du mot de passe : à la place, on trouve la fin de la ligne',
    );
  });
});

describe('connexion — analyse', () => {
  it('accepte une connexion vers le serveur du fichier', () => {
    expect(erreurs(connexion())).toEqual([]);
  });

  it('refuse la connexion sans serveur dans le fichier', () => {
    const source = connexion().split('\n').slice(SERVEUR.length).join('\n');
    expect(erreurs(source)).toEqual([
      '6 : « se connecter » demande un serveur dans le même fichier : la connexion passe par ses packs Astratra. Ajoutez un bloc serveur "…" :',
    ]);
    expect(erreurs(programme('page "a" :', '>si utilisateur est connecte :', '>>texte "Bonjour"'))).toEqual([
      '2 : « utilisateur est connecte » demande un serveur dans le même fichier : la connexion passe par ses packs Astratra. Ajoutez un bloc serveur "…" :',
    ]);
    expect(erreurs(programme('page "a" :', '>bouton "Sortir"', '>quand l\'utilisateur clique sur "Sortir" :', '>>se deconnecter'))).toEqual([
      '4 : « se deconnecter » demande un serveur dans le même fichier : la connexion passe par ses packs Astratra. Ajoutez un bloc serveur "…" :',
    ]);
  });

  it('refuse « se connecter » et « se deconnecter » hors d’un événement', () => {
    expect(erreurs(programme(...SERVEUR, 'page "a" :', '>champ "email"', '>champ "mot de passe"', '>se connecter avec champ "email" et champ "mot de passe"'))).toEqual([
      '10 : « se connecter » ne s\'utilise que dans un événement (quand …).',
    ]);
    expect(erreurs(programme(...SERVEUR, 'page "a" :', '>se deconnecter'))).toEqual([
      '8 : « se deconnecter » ne s\'utilise que dans un événement (quand …).',
    ]);
  });

  it('vérifie les deux champs', () => {
    expect(erreurs(connexion().replace('champ "mot de passe"\n', 'champ "mdp"\n'))).toEqual([
      '12 : aucun champ « mot de passe » dans la page « connexion ».',
    ]);
    expect(erreurs(connexion().replace('et champ "mot de passe"', 'et "secret"'))).toEqual([
      '12 : « se connecter » attend deux champs de la page : se connecter avec champ "email" et champ "mot de passe"',
    ]);
    expect(erreurs(connexion().replace('et champ "mot de passe"', 'et champ "email"'))).toEqual([
      '12 : « se connecter » attend deux champs différents : l’email, puis le mot de passe.',
    ]);
  });

  it('« utilisateur est connecte » est un booléen', () => {
    expect(erreurs(programme(...SERVEUR, 'page "a" :', '>si utilisateur est admin :', '>>texte "Admin"', '>sinon :', '>>texte "Visiteur"'))).toEqual([]);
  });

  const avis = (garde: 'vue' | 'evenement' | 'aucune') =>
    programme(
      ...SERVEUR,
      'page "avis" :',
      ...(garde === 'vue' ? ['>si utilisateur est connecte :', '>>champ "commentaire"', '>>bouton "Publier"'] : ['>champ "commentaire"', '>bouton "Publier"']),
      '>quand l\'utilisateur clique sur "Publier" :',
      ...(garde === 'evenement'
        ? ['>>si utilisateur est connecte :', '>>>envoyer requete vers "avis" avec champ "commentaire"']
        : ['>>envoyer requete vers "avis" avec champ "commentaire"']),
    );

  it('ne prévient plus d’un refus quand la requête est gardée', () => {
    expect(avertissements(avis('aucune'))).toContain(
      '11 : il faut être connecté pour créer « avis » : cette requête sera refusée à un visiteur.',
    );
    expect(avertissements(avis('vue')).filter((a) => a.includes('visiteur'))).toEqual([]);
    expect(avertissements(avis('evenement')).filter((a) => a.includes('visiteur'))).toEqual([]);
    expect(erreurs(avis('vue'))).toEqual([]);
  });

  it('« connecte » ne suffit pas pour une règle « seul admin »', () => {
    const source = avis('evenement').replace('connecte peut creer avis', 'seul admin peut creer avis');
    expect(avertissements(source)).toContain('12 : seul un admin peut créer « avis » : cette requête sera refusée à un visiteur.');
    expect(avertissements(source.replace('si utilisateur est connecte', 'si utilisateur est admin')).filter((a) => a.includes('visiteur'))).toEqual([]);
  });
});

describe('connexion — représentation intermédiaire', () => {
  it('produit les actions et la valeur neutres', () => {
    const application = compiler(
      connexion('>>afficher "Bienvenue"', '>bouton "Sortir"', '>quand l\'utilisateur clique sur "Sortir" :', '>>se deconnecter', '>si utilisateur est connecte :', '>>texte "Connecté"'),
    ).application!;
    const ecran = application.ecrans[0];
    expect(ecran.gestionnaires[0].actions).toEqual([
      { type: 'connexion', email: { type: 'champ', id: 'champ_email' }, motDePasse: { type: 'champ', id: 'champ_mot_de_passe' } },
      { type: 'message', genre: 'info', texte: { type: 'texte', parties: [{ texte: 'Bienvenue' }] } },
    ]);
    expect(ecran.gestionnaires[1].actions).toEqual([{ type: 'deconnexion' }]);
    expect(ecran.vue.at(-1)).toMatchObject({ type: 'condition', test: { gauche: { type: 'utilisateur', etat: 'connecte' }, operateur: 'vrai' } });
  });
});

describe('connexion — cible web', () => {
  const source = connexion(
    '>>afficher "Bienvenue"',
    '>bouton "Sortir"',
    '>quand l\'utilisateur clique sur "Sortir" :',
    '>>se deconnecter',
    '>si utilisateur est connecte :',
    '>>texte "Connecté"',
    '>si utilisateur est admin :',
    '>>texte "Admin"',
  );
  const options = { nom: 'avis', adresse: 'http://localhost', source: 'avis.humalis' };
  const fichiers = genererProjetWeb(compiler(source).application!, options);
  const page = fichiers.get('src/pages/Connexion.tsx')!;
  const session = fichiers.get('src/humalis/session.tsx')!;

  it('le champ du mot de passe est un champ caché, celui de l’email un champ email', () => {
    expect(page).toContain('<input data-humalis="champ_mot_de_passe" type="password" autoComplete="current-password"');
    expect(page).toContain('<input data-humalis="champ_email" type="email" autoComplete="username"');
  });

  it('se connecte par le fournisseur de session, efface le mot de passe, et s’arrête en cas d’échec', () => {
    expect(page).toContain("import { useUtilisateur } from '../humalis/session';");
    expect(page).toContain('const utilisateur = useUtilisateur();');
    expect(page).toContain("setChampMotDePasse('');\n    if (!(await utilisateur.seConnecter(champEmail, champMotDePasse))) return;\n    afficherMessage('Bienvenue', 'info');");
    expect(page).toContain('await utilisateur.seDeconnecter();');
    expect(page).toContain('{utilisateur.pret && utilisateur.connecte && (');
    expect(page).toContain('{utilisateur.pret && utilisateur.admin && (');
  });

  it('la session vient de /auth/me, la connexion de /auth/login, la déconnexion de /auth/logout', () => {
    expect(session).toContain("'/auth/me'");
    expect(session).toContain("'/auth/login'");
    expect(session).toContain("'/auth/logout'");
    expect(session).toContain("'x-csrf-token'");
    expect(session).toContain('Email ou mot de passe incorrect.');
    // Le jeton de la réponse n'est jamais gardé : la session est le cookie HttpOnly du pack.
    expect(session).not.toMatch(/localStorage|sessionStorage|\.token\b|console\./);
  });

  it('place le fournisseur autour des pages', () => {
    expect(fichiers.get('src/main.tsx')).toContain('<Session>');
    expect(genererComposantsWeb(compiler(source).application!, options).get('humalis/racine.tsx')).toContain('<Session>');
  });

  it('neutralise /auth/me pendant le prérendu', () => {
    expect(fichiers.get('astratra.prerender.config.cjs')).toContain('"**/auth/me"');
  });

  it('n’ajoute rien à une application sans connexion', () => {
    const sans = genererProjetWeb(compiler(programme(...SERVEUR, 'page "a" :', '>texte "Bonjour"')).application!, options);
    expect(sans.has('src/humalis/session.tsx')).toBe(false);
    expect(sans.get('src/main.tsx')).not.toContain('Session');
  });
});
