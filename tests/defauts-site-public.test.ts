import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

// Les défauts trouvés en construisant le site public de Humalis.

const web = (source: string) => genererProjetWeb(compiler(source).application!, { nom: 'site', adresse: 'http://localhost', source: 's.humalis' });
const statique = (source: string) => genererProjetStatique(compiler(source).application!, { nom: 'site', source: 's.humalis' });

describe('les ancres de l’en-tête et du pied', () => {
  const PAGES = [
    'page "accueil" :',
    '>titre "Accueil"',
    'page "carte" :',
    '>section "Desserts" avec ancre "desserts" :',
    '>>texte "Beignets"',
  ];

  it('refuse un lien de l’en-tête vers une ancre qui n’existe pas dans sa page', () => {
    const e = erreurs(programme('entete :', '>lien "Desserts" vers "carte#dessert"', '', ...PAGES)).join('\n');
    expect(e).toMatch(/l'ancre « dessert » n'existe pas dans la page « carte »\. Ancres : desserts\./);
  });

  it('refuse un lien du pied vers une ancre qui n’existe dans aucune page', () => {
    const e = erreurs(programme('pied :', '>lien "Haut" vers "#haut"', '', ...PAGES)).join('\n');
    expect(e).toMatch(/l'ancre « haut » du pied de page n'existe dans aucune page/);
  });

  it('accepte les liens de l’en-tête vers des ancres qui existent', () => {
    expect(erreurs(programme('entete :', '>lien "Desserts" vers "carte#desserts"', '>lien "Suite" vers "#desserts"', '', ...PAGES))).toEqual([]);
  });
});

describe('une page et un composant qui auraient le même nom produit', () => {
  it('refuse une page « bac_a_sable » et un composant « BacASable »', () => {
    const e = erreurs(programme('utiliser composant "BacASable" depuis "./composants/BacASable"', '', 'page "bac_a_sable" :', '>titre "Bac"', '>BacASable')).join('\n');
    expect(e).toMatch(/la page « bac_a_sable » et le composant « BacASable » auraient le même nom dans le code produit \(BacASable\)/);
  });

  it('refuse aussi un composant écrit en Humalis', () => {
    const e = erreurs(programme('composant "Carte" :', '>texte "x"', '', 'page "carte" :', '>titre "Carte"', '>Carte')).join('\n');
    expect(e).toMatch(/la page « carte » et le composant « Carte »/);
  });

  it('accepte des noms distincts', () => {
    expect(erreurs(programme('composant "CarteMenu" :', '>texte "x"', '', 'page "carte" :', '>titre "Carte"', '>CarteMenu'))).toEqual([]);
  });
});

describe('la description d’une page écrite dans des branches de langue', () => {
  const SITE = programme(
    'site :',
    '>nom "Le Comptoir" en anglais "The Counter"',
    '>description "Une cuisine de saison au cœur de la ville, ouverte du lundi au samedi." en anglais "A seasonal kitchen in the heart of the city, open Monday to Saturday."',
    '>logo "./logo.svg"',
    '>adresse "https://exemple.fr"',
    '',
    'langues :',
    '>francais',
    '>anglais',
    '',
    'page "accueil" :',
    '>selecteur de langue',
    '>si langue est anglais :',
    '>>titre "Welcome to the bistro"',
    '>>texte "Seasonal dishes, natural wines and a terrace in the old town."',
    '>sinon :',
    '>>titre "Bienvenue au bistrot"',
    '>>texte "Des plats de saison, des vins nature et une terrasse en vieille ville."',
  );

  it('ne signale pas de page sans description', () => {
    expect(avertissements(SITE).join('\n')).not.toMatch(/n'a pas de description/);
  });

  it('web : le titre et la description suivent la langue', () => {
    const page = web(SITE).get('src/pages/Accueil.tsx')!;
    expect(page).toContain("en: 'Seasonal dishes, natural wines and a terrace in the old town.'");
    expect(page).toContain("fr: 'Des plats de saison, des vins nature et une terrasse en vieille ville.'");
    expect(page).toContain("en: 'Welcome to the bistro'");
  });

  it('statique : le HTML de départ porte la description de la langue de base', () => {
    const html = statique(SITE).get('index.html')!;
    expect(html).toContain('<meta name="description" content="Des plats de saison, des vins nature et une terrasse en vieille ville.">');
    expect(html).toContain('<title>Bienvenue au bistrot | Le Comptoir</title>');
  });
});

describe('statique : le bouton « Copier » d’un bloc de code', () => {
  const code = (...langues: string[]) =>
    programme(...(langues.length ? ['langues :', ...langues.map((l) => `>${l}`), ''] : []), 'page "accueil" :', '>titre "Accueil"', '>code humalis :', '>>titre "Bonjour"');

  it('est écrit dans la langue de base du site, comme les autres textes', () => {
    expect(statique(code()).get('index.html')).toContain('<button type="button">Copier</button>');
    expect(statique(code('francais', 'anglais')).get('index.html')).toContain('<button type="button">Copier</button>');
    expect(statique(code('anglais', 'francais')).get('index.html')).toContain('<button type="button">Copy</button>');
  });

  it('se traduit dans le JavaScript avec t(), comme les autres messages', () => {
    const js = [...statique(code('francais', 'anglais'))].find(([f]) => f.startsWith('pages/') && f.endsWith('.js'))![1];
    expect(js).toContain("t({ fr: 'Copier', en: 'Copy' })");
  });
});

describe('web : une adresse terminée par /index.html', () => {
  it('est lue comme le dossier, avant le routeur', () => {
    const main = web(programme('page "accueil" :', '>titre "Accueil"')).get('src/main.tsx')!;
    expect(main).toMatch(/\/index\\\.html\$/);
    expect(main).toContain('history.replaceState');
    expect(main.indexOf('history.replaceState')).toBeLessThan(main.indexOf('createRoot('));
  });
});
