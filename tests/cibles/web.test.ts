import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { genererProjetWeb, cheminsDesPages } from '../../src/cibles/web/projet.js';
import { pascal, camel, chaine } from '../../src/cibles/web/noms.js';
import { expression, condition } from '../../src/cibles/web/valeurs.js';
import { programme } from '../analyse/aide.js';

const projet = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return genererProjetWeb(application!, { nom: 'essai', adresse: 'https://exemple.cd', source: 'essai.humalis' });
};
const exemple = (nom: string) => projet(readFileSync(`exemples/${nom}.humalis`, 'utf8'));

describe('cible web — noms', () => {
  it('nomme composants et variables', () => {
    expect(pascal('liste_produits')).toBe('ListeProduits');
    expect(pascal('accueil')).toBe('Accueil');
    expect(camel('email_valide')).toBe('emailValide');
    expect(camel('prénom')).toBe('prenom');
    expect(camel('class')).toBe('class_');
  });

  it('échappe les chaînes', () => {
    expect(chaine("l'été")).toBe("'l\\'été'");
  });
});

describe('cible web — valeurs', () => {
  const contexte = {
    types: new Map([
      ['panier', { genre: 'liste' as const, de: { genre: 'texte' as const } }],
      ['clics', { genre: 'nombre' as const }],
    ]),
    champs: new Map([['champ_email', 'champEmail']]),
  };

  it('traduit interpolations, calculs et comptes', () => {
    expect(
      expression({ type: 'texte', parties: [{ texte: 'Vous avez ' }, { variable: 'clics' }, { texte: ' `clics`' }] }, contexte),
    ).toBe('`Vous avez ${clics} \\`clics\\``');
    expect(
      expression(
        {
          type: 'calcul',
          operateur: '*',
          gauche: { type: 'calcul', operateur: '+', gauche: { type: 'variable', nom: 'clics' }, droite: { type: 'nombre', valeur: 1 } },
          droite: { type: 'compte', liste: { type: 'variable', nom: 'panier' } },
        },
        contexte,
      ),
    ).toBe('(clics + 1) * panier.length');
  });

  it('affiche une liste séparée par des virgules dans un texte', () => {
    expect(expression({ type: 'texte', parties: [{ texte: 'Panier : ' }, { variable: 'panier' }] }, contexte)).toBe(
      "`Panier : ${panier.join(', ')}`",
    );
  });

  it('traduit les conditions', () => {
    expect(condition({ gauche: { type: 'champ', id: 'champ_email' }, operateur: 'vide' }, contexte)).toBe(
      'champEmail.length === 0',
    );
    expect(
      condition({ gauche: { type: 'variable', nom: 'clics' }, operateur: 'superieurOuEgal', droite: { type: 'nombre', valeur: 18 } }, contexte),
    ).toBe('clics >= 18');
  });
});

describe('cible web — boutique', () => {
  const fichiers = exemple('boutique');
  const boutique = fichiers.get('src/pages/Boutique.tsx')!;

  it('produit un projet complet', () => {
    for (const f of [
      'package.json', 'index.html', 'vite.config.ts', 'tsconfig.json', 'astratra.prerender.config.cjs', 'LISEZMOI.md',
      'src/main.tsx', 'src/humalis/partage.tsx', 'src/pages/Boutique.tsx', 'src/pages/Panier.tsx', 'src/humalis/messages.tsx', 'src/humalis/styles.css',
      '.humalis-projet',
    ]) {
      expect(fichiers.has(f), f).toBe(true);
    }
  });

  it('écrit un état par variable et un calcul recalculé', () => {
    expect(boutique).toContain("const [produits, setProduits] = useState<string[]>(['Livre', 'Stylo', 'Cahier']);");
    expect(boutique).toContain('const { panier, setPanier } = usePartage();');
    expect(fichiers.get('src/humalis/partage.tsx')).toContain('const [panier, setPanier] = useState<string[]>([]);');
    expect(boutique).toContain('const [stock, setStock] = useState(0);');
    expect(boutique).toContain('const nombreArticles = panier.length;');
  });

  it('passe la variable de la boucle au gestionnaire du bouton', () => {
    expect(boutique).toContain('function quandCliqueAjouter(nom: string) {');
    expect(boutique).toContain('setPanier([...panier, nom]);');
    expect(boutique).toContain('onClick={() => quandCliqueAjouter(nom)}');
    expect(boutique).toContain('{produits.map((nom, indexNom) => (');
  });

  it('navigue vers la page panier', () => {
    expect(boutique).toContain("naviguer('/panier');");
    expect(fichiers.get('src/pages/Panier.tsx')).toContain('<Lien to="/"');
  });

  it('traduit les styles nommés en classes', () => {
    expect(boutique).toContain('className="humalis-couleur-bleu humalis-taille-grande"');
    expect(fichiers.get('src/humalis/styles.css')).toContain('.humalis-taille-grande');
    expect(fichiers.get('src/humalis/styles.css')).toContain('.humalis-page a { display: block;');
    // Le texte d'un bouton vert reste lisible : blanc en clair, foncé en sombre.
    expect(fichiers.get('src/humalis/styles.css')).toContain('.humalis-fond-vert { background: var(--humalis-vert); color: var(--humalis-vert-encre);');
    expect(fichiers.get('src/humalis/styles.css')).toMatch(/prefers-color-scheme: dark[\s\S]*--humalis-vert-encre: #141416;/);
  });

  it('pose le titre et la description de la page', () => {
    // Le premier texte contient une variable : la description reprend le titre.
    expect(boutique).toContain("usePage('Nos produits', 'Nos produits');");
  });

  it('ne laisse passer aucune valeur manquante dans les pages', () => {
    for (const [chemin, contenu] of fichiers) {
      if (chemin.startsWith('src/pages/')) expect(contenu, chemin).not.toMatch(/\bundefined\b|\[object Object\]/);
    }
  });

  it('n’enveloppe pas un élément seul dans un fragment', () => {
    expect(boutique).toContain('{stock === 0 ? (\n        <p data-humalis="texte_ligne_15">Rupture de stock</p>\n      ) : (');
  });

  it('configure le prérendu : une route par page, le plan du site', () => {
    const config = fichiers.get('astratra.prerender.config.cjs')!;
    expect(config).toContain('siteUrl: "https://exemple.cd"');
    expect(config).toContain('{ path: "/", label: "Nos produits" }');
    expect(config).toContain('{ path: "/panier", label: "Votre panier" }');
    expect(config).toContain('sitemap: true');
  });

  it('épingle les versions exactes', () => {
    const paquet = JSON.parse(fichiers.get('package.json')!);
    for (const version of [...Object.values(paquet.dependencies), ...Object.values(paquet.devDependencies)]) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(paquet.scripts.build).toBe('tsc --noEmit && vite build && astratra-prerender');
  });
});

describe('cible web — connexion', () => {
  const connexion = exemple('connexion').get('src/pages/Connexion.tsx')!;

  it('relie le champ à un état et affiche les messages', () => {
    expect(connexion).toContain("const [champEmail, setChampEmail] = useState('');");
    expect(connexion).toContain('value={champEmail} onChange={(evenement) => setChampEmail(evenement.target.value)}');
    expect(connexion).toContain('if (champEmail.length === 0) {');
    expect(connexion).toContain("afficherMessage('Email requis', 'erreur');");
    expect(connexion).toContain("afficherMessage('Connexion réussie', 'info');");
    expect(connexion).toContain('onClick={quandCliqueSeConnecter}');
  });
});

describe('cible web — événements et requêtes', () => {
  const fichiers = projet(
    programme(
      'page "accueil" :',
      '>variable produits = []',
      '>variable clics = 0',
      '>champ "email"',
      '>texte "Menu" avec nom "menu"',
      '>texte "Bienvenue" avec nom "popup"',
      '>bouton "Go"',
      '>quand la page se charge :',
      '>>envoyer requete vers "/produits" dans produits',
      '>quand utilisateur clique sur "Go" :',
      '>>variable etape = 1',
      '>>changer etape par etape + 1',
      '>>changer clics par clics + etape',
      '>>montrer "menu"',
      '>>cacher "popup"',
      '>>changer texte de "menu" par "Ouvert"',
      '>>envoyer requete vers "/inscription" avec champ "email"',
    ),
  );
  const accueil = fichiers.get('src/pages/Accueil.tsx')!;

  it('charge les données au chargement de la page', () => {
    expect(accueil).toContain('useEffect(() => {');
    expect(accueil).toContain("setProduits(await serveur.lire('/produits', produits));");
  });

  it('écrit un gestionnaire asynchrone avec ses variables locales', () => {
    expect(accueil).toContain('async function quandCliqueGo() {');
    expect(accueil).toContain('let etape = 1;');
    expect(accueil).toContain('etape = etape + 1;');
    expect(accueil).toContain('setClics(clics + etape);');
    expect(accueil).toContain("await serveur.envoyer('/inscription', { email: champEmail });");
  });

  it('cache au départ un élément que l’on montre, et montre un élément que l’on cache', () => {
    expect(accueil).toContain("useState<Record<string, boolean>>({ 'menu': false, 'popup': true })");
    expect(accueil).toContain("setVisibilite((v) => ({ ...v, 'menu': true }));");
    expect(accueil).toContain("{visibilite['menu'] && <p data-humalis=\"menu\">{textes['menu'] ?? 'Menu'}</p>}");
  });

  it('neutralise les adresses des requêtes pendant le prérendu', () => {
    expect(fichiers.get('astratra.prerender.config.cjs')).toContain('apiPatterns: ["**/produits", "**/inscription"]');
  });

  it('met la page accueil à la racine', () => {
    const { application } = compiler(programme('page "a" :', '>titre "A"', 'page "accueil" :', '>titre "B"'));
    expect([...cheminsDesPages(application!)]).toEqual([
      ['a', '/a'],
      ['accueil', '/'],
    ]);
  });
});
