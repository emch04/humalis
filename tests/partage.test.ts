import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb, verifierPourLeWeb } from '../src/cibles/web/projet.js';
import { programme, erreurs } from './analyse/aide.js';

const boutique = programme(
  'variable panier = [] avec partagée',
  '',
  'page "boutique" :',
  '>calcul nombre_articles = nombre de panier',
  '>texte "Articles : {nombre_articles}"',
  '>bouton "Ajouter"',
  '>quand utilisateur clique sur "Ajouter" :',
  '>>ajouter "Livre" à panier',
  '',
  'page "panier" :',
  '>pour chaque nom dans panier :',
  '>>texte nom',
);

describe('partage — parser', () => {
  it('lit une variable partagée en haut du fichier', () => {
    expect(analyserSyntaxe(analyser(boutique)).partages).toMatchObject([
      { type: 'Variable', nom: 'panier', options: { partagee: true } },
    ]);
  });

  it('lit « avec partagee et memorisee » et « avec memorisee en secret »', () => {
    const [a, b] = analyserSyntaxe(
      analyser('variable compte = 1 avec partagee et mémorisée\nvariable jeton = "x" avec partagee et memorisee en secret\npage "p" :\n    titre "P"'),
    ).partages;
    expect(a.options).toEqual({ partagee: true, memorisee: true });
    expect(b.options).toEqual({ partagee: true, memorisee: true, secret: true });
  });

  it('refuse une option inconnue', () => {
    expect(() => analyserSyntaxe(analyser('page "p" :\n    variable x = 1 avec rapide'))).toThrow(
      /« rapide » n'est pas une option de variable. Options possibles : partagee, memorisee/,
    );
  });
});

describe('partage — analyse', () => {
  it('rend la variable visible dans toutes les pages', () => {
    expect(erreurs(boutique)).toEqual([]);
  });

  it('exige « avec partagee » en haut du fichier', () => {
    expect(erreurs('variable panier = []\npage "p" :\n    titre "P"')).toEqual([
      '1 : en haut du fichier, une variable est partagée entre les pages : ajoutez « avec partagee » (variable panier = … avec partagee).',
    ]);
  });

  it('refuse une variable partagée déclarée dans une page', () => {
    expect(erreurs('page "p" :\n    variable panier = [] avec partagee')).toEqual([
      '2 : une variable partagée se déclare en haut du fichier, hors des pages.',
    ]);
  });

  it('refuse de redéclarer une variable partagée dans une page', () => {
    expect(erreurs('variable panier = [] avec partagee\npage "p" :\n    variable panier = []')).toEqual([
      '3 : la variable « panier » existe déjà (ligne 1). Pour changer sa valeur, écrivez : changer panier par …',
    ]);
  });

  it('accepte « avec memorisee » sur une variable de page', () => {
    expect(erreurs('page "p" :\n    variable visites = 0 avec memorisee\n    texte "{visites}"')).toEqual([]);
  });
});

describe('partage — cible web', () => {
  const { application } = compiler(boutique);
  const fichiers = genererProjetWeb(application!, { nom: 'boutique', adresse: 'http://localhost', source: 'boutique.humalis' });

  it('produit un contexte React pour les variables partagées', () => {
    const partage = fichiers.get('src/humalis/partage.tsx')!;
    expect(partage).toContain('const [panier, setPanier] = useState<string[]>([]);');
    expect(partage).toContain('export function usePartage()');
    expect(fichiers.get('src/main.tsx')).toContain('<Partage>');
  });

  it('fait lire le panier partagé par les deux pages', () => {
    expect(fichiers.get('src/pages/Boutique.tsx')).toContain('const { panier, setPanier } = usePartage();');
    expect(fichiers.get('src/pages/Boutique.tsx')).toContain('setPanier([...panier, \'Livre\']);');
    expect(fichiers.get('src/pages/Panier.tsx')).toContain('const { panier } = usePartage();');
    expect(fichiers.get('src/pages/Panier.tsx')).not.toContain('useState<string[]>([])');
  });

  it('mémorise dans le navigateur avec « memorisee »', () => {
    const { application: a } = compiler('variable panier = [] avec partagee et memorisee\npage "p" :\n    variable visites = 0 avec memorisee\n    texte "{visites}"\n    texte "{panier}"');
    const f = genererProjetWeb(a!, { nom: 'essai', adresse: 'http://localhost', source: 'essai.humalis' });
    expect(f.get('src/humalis/partage.tsx')).toContain("useMemorise<any[]>('humalis:essai:partage:panier', [])");
    expect(f.get('src/pages/P.tsx')).toContain("const [visites, setVisites] = useMemorise('humalis:essai:p:visites', 0);");
    expect(f.get('src/humalis/memoire.ts')).toContain('localStorage');
  });

  it('refuse « memorisee en secret » sur le web', () => {
    const { application: a } = compiler('page "p" :\n    variable jeton = "" avec memorisee en secret\n    texte jeton');
    expect(verifierPourLeWeb(a!)).toEqual([
      {
        gravite: 'erreur',
        message:
          "« memorisee en secret » n'existe pas sur le web : le navigateur n'a pas de coffre sûr pour garder un secret. La connexion passera par les packs Astratra (étape 3).",
        ligne: 2,
      },
    ]);
  });
});
