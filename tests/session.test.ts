import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

const avis = readFileSync('exemples/avis.humalis', 'utf8');
const web = () => {
  const { application } = compiler(avis);
  return genererProjetWeb(application!, { nom: 'avis', adresse: 'https://avis.exemple.cd', source: 'avis.humalis' });
};

const SERVEUR = ['serveur "club" :', '>donnee membre :', '>>nom : texte', '>route "membres" :', '>>tout le monde peut lire membre'];

describe('session — rien ne s’affiche avant de savoir qui est connecté', () => {
  it('la session dit quand elle a lu /auth/me (web et mobile)', () => {
    expect(web().get('src/humalis/session.tsx')).toContain('pret: boolean;');
    expect(web().get('src/humalis/session.tsx')).toContain('setPret(true);');
    const { application } = compiler(avis);
    const mobile = genererProjetMobile(application!, { nom: 'avis', source: 'avis.humalis' });
    expect(mobile.get('humalis/session.tsx')).toContain('setPret(true);');
  });

  it('une condition sur la session attend la réponse du serveur', () => {
    const page = web().get('src/pages/Avis.tsx')!;
    expect(page).toContain('{utilisateur.pret && (utilisateur.connecte ? (');
    expect(page).not.toMatch(/\{utilisateur\.connecte \? \(/);
  });
});

describe('session — le nom « utilisateur »', () => {
  it('refuse une variable « utilisateur » dans une page qui lit la session', () => {
    expect(
      erreurs(programme(...SERVEUR, 'page "accueil" :', '>variable utilisateur = "Emch"', '>si utilisateur est connecte :', '>>texte "Bonjour"')),
    ).toContain(
      '7 : le nom « utilisateur » est pris par la session (« si utilisateur est … », « se connecter ») : donnez un autre nom à cette variable, par exemple « membre ».',
    );
  });

  it('laisse « utilisateur » libre dans une page sans session', () => {
    expect(erreurs(programme('page "accueil" :', '>variable utilisateur = "Emch"', '>texte utilisateur'))).toEqual([]);
  });

  it('refuse aussi une variable partagée « utilisateur », une seule fois', () => {
    const source = programme(
      ...SERVEUR,
      'variable utilisateur = "" avec partagee',
      '',
      'page "accueil" :',
      '>si utilisateur est connecte :',
      '>>texte "Bonjour"',
      'page "profil" :',
      '>si utilisateur est connecte :',
      '>>texte "Profil"',
    );
    expect(erreurs(source)).toEqual([
      '6 : le nom « utilisateur » est pris par la session (« si utilisateur est … », « se connecter ») : donnez un autre nom à cette variable, par exemple « membre ».',
    ]);
  });
});

describe('session — toujours à jour (projet « Le Fleuve »)', () => {
  const ADMIN = [
    'serveur "resto" :',
    '>donnee plat :',
    '>>nom : texte',
    '>route "plats" :',
    '>>seul admin peut lire plat',
    '',
    'page "admin" :',
    '>variable plats = []',
    '>quand la page se charge :',
    '>>si utilisateur est admin :',
    '>>>envoyer requete vers "plats" dans plats',
    '>formulaire "connexion" :',
    '>>champ email "Email"',
    '>>champ mot de passe "Mot de passe"',
    '>>bouton "Se connecter"',
    '>quand le formulaire "connexion" est soumis :',
    '>>se connecter avec champ "Email" et champ "Mot de passe"',
    '>>si utilisateur est admin :',
    '>>>envoyer requete vers "plats" dans plats',
    'page "accueil" :',
    '>titre "Bienvenue"',
  ];
  const projet = (cible: 'web' | 'mobile') => {
    const { application } = compiler(programme(...ADMIN));
    return cible === 'web'
      ? genererProjetWeb(application!, { nom: 'resto', adresse: 'https://resto.exemple.cd', source: 'resto.humalis' })
      : genererProjetMobile(application!, { nom: 'resto', source: 'resto.humalis' });
  };

  it('« connecte » et « admin » lisent la dernière réponse de /auth/me, même dans un événement en cours (web et mobile)', () => {
    for (const session of [projet('web').get('src/humalis/session.tsx')!, projet('mobile').get('humalis/session.tsx')!]) {
      expect(session).toContain('const derniere = useRef<Personne | null>(null);');
      expect(session).toContain("get admin() {\n      return derniere.current?.role === 'admin';");
      expect(session).toContain('get connecte() {\n      return derniere.current !== null;');
    }
  });

  it('seules les pages qui lisent la session demandent /auth/me (pas d’appel au démarrage)', () => {
    for (const session of [projet('web').get('src/humalis/session.tsx')!, projet('mobile').get('humalis/session.tsx')!]) {
      expect(session).not.toContain('useEffect(() => {\n    void relire();\n  }, [relire]);');
      expect(session).toContain('utilisateur.demander();');
    }
    expect(projet('web').get('src/pages/Accueil.tsx')).not.toContain('useUtilisateur');
  });

  it('un chargement qui lit la session attend la réponse de /auth/me', () => {
    const page = projet('web').get('src/pages/Admin.tsx')!;
    expect(page).toContain('    if (!utilisateur.pret) return;');
    expect(page).toContain('  }, [utilisateur.pret]);');
  });

  it('site statique : le chargement attend aussi la réponse de /auth/me', () => {
    const { application } = compiler(programme(...ADMIN));
    const outils = genererProjetStatique(application!, { nom: 'resto', source: 'resto.humalis' }).get('humalis/humalis.js')!;
    expect(outils).toContain('const sessionLue = page.session ? relireSession().then(actualiser) : Promise.resolve();');
    expect(outils).toContain('if (page.auChargement) sessionLue.then(() => executer(page.auChargement));');
  });
});
