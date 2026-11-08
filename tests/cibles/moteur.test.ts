import { describe, expect, it } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { genererProjetMoteur, verifierPourLeMoteur } from '../../src/cibles/moteur/projet.js';
import { MOTEUR_JS } from '../../src/cibles/moteur/execution.js';

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
    expect(html).toContain('Total : 2');
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
    expect(html).toMatch(/<p[^>]*data-h="\d+"[^>]*>Total : 2<\/p>/);
  });

  it('une valeur du programme ne peut pas devenir une balise', () => {
    const html = projet('page "a" :\n    variable n = "<script>x</script>"\n    texte "{n}"\n').get('index.html')!;
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;x');
  });

  it('refuse un secret dans le navigateur, comme la cible web', () => {
    const { application } = compiler('page "a" :\n    variable t = "" avec memorisee en secret\n    texte t\n');
    if (application) expect(verifierPourLeMoteur(application).some((d) => d.gravite === 'erreur')).toBe(true);
  });
});
