import { describe, expect, it } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { genererProjetMoteur, verifierPourLeMoteur } from '../../src/cibles/moteur/projet.js';
import { MOTEUR_JS } from '../../src/cibles/moteur/execution.js';
import { extraitDeCode } from '../../src/outils/extrait.js';
import { adressePermise, donneesDansLaPage, lecturesPermises } from '../../src/cibles/moteur/lecture-construction.js';

type Boite<T> = { v: T };
type Moteur = {
  signal: <T>(v: T) => Boite<T>;
  calcul: <T>(f: () => T) => () => T;
  effet: (f: () => void) => () => void;
  racine: (f: () => void) => () => void;
  nettoyer: (f: () => void) => void;
  appliquer: () => void;
};
const charger = (): Promise<Moteur> => import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(MOTEUR_JS)}#${Math.random()}`);

function projet(source: string) {
  const { application } = compiler(source);
  if (!application) throw new Error('le programme ne compile pas');
  return genererProjetMoteur(application, { nom: 'essai', source: 'essai.humalis' });
}

describe('le moteur : les boîtes', () => {
  it('une lecture suivie se relance quand la valeur change, une seule fois par lot', async () => {
    const { signal, effet, appliquer } = await charger();
    const a = signal(1);
    const b = signal(2);
    const vus: number[] = [];
    effet(() => vus.push(a.v + b.v));
    a.v = 10;
    b.v = 20;
    appliquer();
    expect(vus).toEqual([3, 30]);
  });

  it('écrire la même valeur ne relance rien', async () => {
    const { signal, effet, appliquer } = await charger();
    const a = signal(1);
    let tours = 0;
    effet(() => {
      void a.v;
      tours++;
    });
    a.v = 1;
    appliquer();
    expect(tours).toBe(1);
  });

  it('un calcul ne se refait que si ce qu’il lit a changé', async () => {
    const { signal, calcul, appliquer } = await charger();
    const a = signal(2);
    let tours = 0;
    const double = calcul(() => {
      tours++;
      return a.v * 2;
    });
    expect([double(), double()]).toEqual([4, 4]);
    expect(tours).toBe(1);
    a.v = 3;
    appliquer();
    expect(double()).toBe(6);
    expect(tours).toBe(2);
  });

  it('les dépendances suivent le chemin réellement lu', async () => {
    const { signal, effet, appliquer } = await charger();
    const choix = signal(true);
    const a = signal(1);
    const b = signal(2);
    const vus: number[] = [];
    effet(() => vus.push(choix.v ? a.v : b.v));
    b.v = 20;
    appliquer();
    expect(vus).toEqual([1]);
    choix.v = false;
    appliquer();
    a.v = 10;
    appliquer();
    expect(vus).toEqual([1, 20]);
  });

  it('une portée arrêtée ne se relance plus et lance son nettoyage', async () => {
    const { signal, effet, racine, nettoyer, appliquer } = await charger();
    const a = signal(1);
    let tours = 0;
    let nettoye = 0;
    const arreter = racine(() => {
      effet(() => {
        void a.v;
        tours++;
      });
      nettoyer(() => nettoye++);
    });
    arreter();
    a.v = 2;
    appliquer();
    expect(tours).toBe(1);
    expect(nettoye).toBe(1);
  });

  it('une boucle sans fin s’arrête avec un message', async () => {
    const { signal, effet, appliquer } = await charger();
    const a = signal(0);
    const erreurs: unknown[] = [];
    const avant = console.error;
    console.error = (e: unknown) => erreurs.push(e);
    effet(() => {
      a.v = a.v + 1;
    });
    appliquer();
    console.error = avant;
    expect(erreurs.length).toBeGreaterThan(0);
  });
});

describe('le moteur : le projet produit', () => {
  const source = `page "accueil" :
    variable n = 2
    titre "Bonjour"
    texte "Total : {n}"
    bouton "Plus"
    quand l'utilisateur clique sur "Plus" :
        changer n par n + 1
    pour chaque x dans ["a", "b"] :
        texte x
`;

  it('écrit le contenu dans le HTML, avec ses repères', () => {
    const html = projet(source).get('index.html')!;
    expect(html).toContain('Bonjour');
    expect(html).toContain('Total\u00a0: 2');
    expect(html).toContain('<!--,-->');
    expect(html).toContain('data-c="0"');
  });

  it('ne dépend pas de React', () => {
    const fichiers = projet(source);
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.dependencies).toBeUndefined();
    expect([...fichiers.values()].some((c) => /from 'react'/.test(c))).toBe(false);
  });

  it('un texte fixe ne porte aucun repère ; un texte qui change en porte un', () => {
    const html = projet(source).get('index.html')!;
    expect(html).toMatch(/<h1[^>]*>Bonjour<\/h1>/);
    expect(html).not.toMatch(/<h1[^>]*data-h=/);
    expect(html).toMatch(/<p[^>]*data-h="\d+"[^>]*>Total\u00a0: 2<\/p>/);
  });

  it('une valeur du programme ne peut pas devenir une balise', () => {
    const html = projet('page "a" :\n    variable n = "<script>x</script>"\n    texte "{n}"\n').get('index.html')!;
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;x');
  });

  it('une variable du programme ne peut pas prendre un nom du moteur', () => {
    const code = projet('page "a" :\n    variable texte = "x"\n    variable r = 1\n    texte "{texte} {r}"\n').get('src/couches/a.js')!;
    expect(code).toContain('const texte_ = signal');
    expect(code).toContain('const r_ = signal');
  });

  it('une adresse à trous qui commence par une variable refuse javascript:', () => {
    const code = projet('page "a" :\n    variable u = "javascript:alert(1)"\n    lien "x" vers "{u}/y"\n').get('src/couches/a.js');
    if (code) expect(code).not.toContain("attribut(r[0], 'href', () => u.v)");
  });

  it('un outil passé en valeur est bien importé', () => {
    const code = projet('page "a" :\n    apres 1 secondes :\n        afficher "x"\n').get('src/couches/a.js')!;
    expect(code).toMatch(/import \{[^}]*afficherMessage[^}]*\} from '\.\.\/humalis\/outils\.js'/);
  });

  it('refuse un secret dans le navigateur, comme la cible web', () => {
    const { application } = compiler('page "a" :\n    variable t = "" avec memorisee en secret\n    texte t\n');
    if (application) expect(verifierPourLeMoteur(application).some((d) => d.gravite === 'erreur')).toBe(true);
  });
});

describe('le moteur : un calcul qui redonne la même valeur', () => {
  it('ne relance pas ce qui le lit', async () => {
    const { signal, calcul, effet, appliquer } = await charger();
    const a = signal(1);
    const pair = calcul(() => a.v % 2 === 0);
    let tours = 0;
    effet(() => {
      void pair();
      tours++;
    });
    a.v = 3;
    appliquer();
    expect(tours).toBe(1);
    a.v = 4;
    appliquer();
    expect(tours).toBe(2);
  });
});

describe('le moteur : lire le serveur à la construction', () => {
  const programme = `serveur "s" :
    donnee produit :
        nom : texte
    donnee secret :
        nom : texte
    route "produits" :
        tout le monde peut lire produit
    route "secrets" :
        seul admin peut lire secret

page "accueil" :
    variable produits = []
    variable secrets = []
    titre "Produits"
    quand la page se charge :
        envoyer requete vers "produits" dans produits
        envoyer requete vers "secrets" dans secrets
    pour chaque p dans produits :
        texte p.nom

page "prive" reservee a admin sinon vers "accueil" :
    variable produits = []
    titre "Privé"
    quand la page se charge :
        envoyer requete vers "produits" dans produits
`;
  const appli = () => compiler(programme).application!;

  it('ne lit rien sans adresse', () => {
    expect(lecturesPermises(appli(), {}).lectures).toEqual([]);
  });

  it('ne lit que les routes publiques des pages publiques', () => {
    const { lectures } = lecturesPermises(appli(), { adresse: 'https://exemple.test' });
    expect(lectures.map((l) => l.url)).toEqual(['https://exemple.test/api/produits']);
    expect(lectures[0].cle).toBe('accueil:produits');
  });

  it('refuse une adresse sans https ou avec un mot de passe', () => {
    expect(lecturesPermises(appli(), { adresse: 'http://exemple.test' }).lectures).toEqual([]);
    expect(lecturesPermises(appli(), { adresse: 'http://exemple.test' }).refus.length).toBe(1);
    expect(adressePermise('https://a:b@exemple.test')).toBe(false);
    expect(adressePermise('file:///etc/passwd')).toBe(false);
    expect(adressePermise('http://localhost:3000')).toBe(true);
  });

  it('une source n’est lue que si le projet la nomme, et jamais avec une clé', () => {
    const avecSource = (entete: string) => compiler(`source "b" :
    adresse "https://api.exemple.test"
    enveloppe "data"
${entete}    route "api/produits" :
        lire une liste de produit dans "produits"
    donnee produit :
        nom : texte

page "accueil" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "api/produits" de la source "b" dans produits
`).application!;
    expect(lecturesPermises(avecSource(''), {}).lectures).toEqual([]);
    const lu = lecturesPermises(avecSource(''), { sources: ['api/produits'] }).lectures;
    expect(lu[0].url).toBe('https://api.exemple.test/api/produits');
    const cle = lecturesPermises(avecSource('    jeton public "abc" dans l\'entete "X-Cle"\n'), { sources: ['api/produits'] });
    expect(cle.refus.length).toBe(1);
    expect(cle.lectures).toEqual([]);
  });

  it('une donnée ne peut ni fermer son bloc, ni devenir une balise', () => {
    expect(donneesDansLaPage({ a: '</script><script>x</script>' })).not.toContain('</script><script>');
    const { application } = compiler(programme);
    const nom = '<img src=x onerror=alert(1)>';
    const fichiers = genererProjetMoteur(application!, { nom: 'e', source: 'e.humalis', donnees: new Map([['accueil:produits', [{ id: '1', nom }]]]) });
    const html = fichiers.get('index.html')!;
    expect(html).toContain('&lt;img src=x');
    expect(html).not.toContain('<img src=x');
    expect(fichiers.get('prive/index.html')).not.toContain('humalis-donnees');
  });
});

describe('le moteur : avec animation', () => {
  it('une liste « avec animation » reçoit son outil, une autre non', () => {
    const avec = projet('page "a" :\n    variable t = ["x"]\n    pour chaque l dans t avec animation :\n        texte l\n').get('src/couches/a.js')!;
    const sans = projet('page "a" :\n    variable t = ["x"]\n    pour chaque l dans t :\n        texte l\n').get('src/couches/a.js')!;
    expect(avec).toContain(', animerListe);');
    expect(sans).not.toContain('animerListe');
  });

  it('se combine avec le déplacement', () => {
    const code = projet('page "a" :\n    variable t = ["x"]\n    pour chaque l dans t avec deplacement et animation :\n        texte l\n').get('src/couches/a.js')!;
    expect(code).toContain('listeDeplacable');
    expect(code).toContain(', animerListe);');
  });
});

describe('le code en cause sous une erreur', () => {
  const source = 'page "a" :\n    variable prix = 3\n    texte "{prixx}"\n';

  it('montre la ligne d’avant, la ligne fautive et le mot', () => {
    expect(extraitDeCode(source, 3, 'la variable « prixx » n’est pas déclarée')).toBe('    2 │     variable prix = 3\n  > 3 │     texte "{prixx}"\n      │             ^^^^^');
  });

  it('sans mot trouvé, pas de trait plutôt qu’un trait faux', () => {
    expect(extraitDeCode(source, 3, 'autre chose')).not.toContain('^');
  });

  it('une ligne hors du fichier ne casse rien', () => {
    expect(extraitDeCode(source, 99, 'x')).toBeUndefined();
  });
});

describe('le temps réel : « en direct »', () => {
  const programme = (ligne: string) => `serveur "s" :
    donnee produit :
        nom : texte
    route "produits" :
        tout le monde peut lire produit
        seul admin peut creer produit

page "accueil" :
    variable produits = []
    titre "Produits"
    quand la page se charge :
        ${ligne}
    pour chaque p dans produits :
        texte p.nom
`;

  it('la route annonce ses changements seulement si une page la lit en direct', () => {
    const avec = compiler(programme('envoyer requete vers "produits" dans produits en direct')).application!;
    const sans = compiler(programme('envoyer requete vers "produits" dans produits')).application!;
    expect(avec.serveurs[0].routes[0].direct).toBe(true);
    expect(sans.serveurs[0].routes[0].direct).toBeUndefined();
  });

  it('la page écoute sa route, et se relit', () => {
    const fichiers = genererProjetMoteur(compiler(programme('envoyer requete vers "produits" dans produits en direct')).application!, { nom: 'e', source: 'e.humalis' });
    const code = fichiers.get('src/couches/accueil.js')!;
    expect(code).toContain('const enDirect = directDeCouche();');
    expect(code).toMatch(/enDirect\('\/api\/produits', \(\) => \$charger1\(true\)\);/);
  });

  it('refuse « en direct » sur un envoi', () => {
    const { diagnostics } = compiler(programme('envoyer requete vers "produits" avec "x" dans produits en direct'));
    expect(diagnostics.some((d) => d.message.includes('en direct'))).toBe(true);
  });
});

describe('les rôles', () => {
  const programme = (route: string, page = '') => `serveur "ecole" :
    roles directeur, enseignant et parent
    emails par brevo
    invitations vers "bienvenue"
    donnee note :
        valeur : nombre
    route "notes" :
        ${route}

page "accueil" :
    titre "Accueil"

page "bienvenue" :
    titre "Bienvenue"
${page}`;

  it('« seul directeur peut » et « seuls … peuvent » deviennent des droits', () => {
    expect(compiler(programme('seul directeur peut lire note')).application!.serveurs[0].routes[0].droits.lire).toBe('role:directeur');
    expect(compiler(programme('seuls directeur et enseignant peuvent lire note')).application!.serveurs[0].routes[0].droits.lire).toBe('role:directeur,enseignant');
  });

  it('un rôle non déclaré est refusé, avec une proposition', () => {
    const { diagnostics } = compiler(programme('seul directrice peut lire note'));
    const erreur = diagnostics.find((d) => d.gravite === 'erreur');
    expect(erreur?.message).toContain('le rôle « directrice » n\'est pas déclaré');
  });

  it('une page réservée à un rôle, et « si utilisateur est … »', () => {
    const page = `
page "profs" reservee a enseignant et directeur sinon vers "accueil" :
    titre "Profs"
    si utilisateur est directeur :
        texte "Direction"
`;
    const { application } = compiler(programme('seul directeur peut lire note', page));
    expect(application!.ecrans.find((e) => e.nom === 'profs')!.reservee!.qui).toBe('role:enseignant,directeur');
    const code = genererProjetMoteur(application!, { nom: 'e', source: 'e.humalis' }).get('src/couches/profs.js')!;
    expect(code).toContain("utilisateur.personne?.role === 'directeur'");
  });

  it('« inviter … comme directeur »', () => {
    const page = `
page "equipe" reservee a admin sinon vers "accueil" :
    titre "Equipe"
    bouton "Inviter"
    quand l'utilisateur clique sur "Inviter" :
        inviter "a@b.cd" comme directeur
`;
    expect(compiler(programme('seul directeur peut lire note', page)).diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  it('« admin » ne peut pas être redéclaré', () => {
    const source = programme('seul directeur peut lire note').replace('roles directeur,', 'roles admin, directeur,');
    expect(compiler(source).diagnostics.some((d) => d.message.includes('existe déjà'))).toBe(true);
  });
});
