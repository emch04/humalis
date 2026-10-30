import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from './aide-qualite.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const avecCarte = programme(
  'utiliser composant "Carte" depuis "./composants/Carte"',
  '',
  'page "accueil" :',
  '>variable prix = 12',
  '>Carte avec titre "Bienvenue" et prix prix',
  '>Carte',
);

const avecFiche = programme(
  'composant "Fiche" :',
  '>parametre nom',
  '>parametre prix',
  '>texte nom',
  '>texte "{prix} €"',
  '',
  'page "boutique" :',
  '>Fiche avec nom "Livre" et prix 12',
  '>Fiche avec nom "Stylo" et prix 2',
);

describe('composants React — parser', () => {
  it('lit « utiliser composant … depuis … »', () => {
    expect(analyserSyntaxe(analyser(avecCarte)).composantsReact).toEqual([
      { type: 'ComposantReact', nom: 'Carte', chemin: './composants/Carte', ligne: 1 },
    ]);
  });

  it('lit un usage avec des propriétés, et sans', () => {
    const [, carte, seule] = analyserSyntaxe(analyser(avecCarte)).pages[0].corps;
    expect(carte).toMatchObject({
      type: 'Composant',
      nom: 'Carte',
      proprietes: [
        { nom: 'titre', valeur: { type: 'Chaine' } },
        { nom: 'prix', valeur: { type: 'Reference', nom: 'prix' } },
      ],
    });
    expect(seule).toMatchObject({ type: 'Composant', nom: 'Carte', proprietes: [] });
  });

  it('explique un « depuis » oublié', () => {
    expect(() => analyserSyntaxe(analyser('utiliser composant "Carte" "./Carte"\npage "a" :\n    titre "A"'))).toThrow(
      /il manque « depuis » suivi du chemin du fichier React/,
    );
  });
});

describe('composants — analyse', () => {
  it('accepte un composant déclaré', () => {
    expect(erreurs(avecCarte)).toEqual([]);
  });

  it('refuse un composant inconnu et dit comment le déclarer', () => {
    expect(erreurs('page "a" :\n    Crate avec titre "x"')).toEqual([
      '2 : le composant « Crate » n\'est pas déclaré. Ajoutez en haut du fichier : utiliser composant "Crate" depuis "…", ou écrivez-le avec composant "Crate" :',
    ]);
  });

  it('vérifie les variables données aux propriétés', () => {
    expect(erreurs('utiliser composant "Carte" depuis "./Carte"\npage "a" :\n    Carte avec prix totl')).toEqual([
      "3 : la variable « totl » n'est pas déclarée. Déclarez-la avec : variable totl = …",
    ]);
  });

  it('refuse un composant créé dans un événement', () => {
    expect(
      erreurs('utiliser composant "Carte" depuis "./Carte"\npage "a" :\n    bouton "Go"\n    quand utilisateur clique sur "Go" :\n        Carte'),
    ).toEqual([
      '5 : un composant ne peut pas être créé dans un événement. Placez-le dans la page, puis utilisez montrer "…" pour le faire apparaître.',
    ]);
  });

  it('voit les paramètres dans un composant Humalis', () => {
    expect(erreurs(avecFiche)).toEqual([]);
  });

  it('refuse une propriété qui n’est pas un paramètre du composant Humalis', () => {
    expect(erreurs(avecFiche.replace('et prix 2', 'et couleur 2'))).toEqual([
      '9 : « couleur » n\'est pas un paramètre du composant « Fiche ». Paramètres : nom, prix.',
    ]);
  });

  it('avertit d’un paramètre oublié', () => {
    expect(avertissements(avecFiche.replace(' et prix 2', ''))).toEqual([
      '9 : le paramètre « prix » du composant « Fiche » n\'est pas donné.',
    ]);
  });

  it('exige une majuscule au nom d’un composant', () => {
    expect(erreurs('composant "fiche" :\n    texte "x"\npage "a" :\n    titre "A"')).toEqual([
      '1 : le nom d\'un composant commence par une majuscule, comme en React : « Fiche ».',
    ]);
  });
});

describe('composants — cible web', () => {
  it('écrit la balise et l’import du composant React', () => {
    const f = genererProjetWeb(compiler(avecCarte).application!, {
      nom: 'a',
      adresse: 'http://localhost',
      source: 'a.humalis',
      composantsReact: new Map([['./composants/Carte', { nom: 'Carte.tsx', contenu: 'export default function Carte() { return null; }' }]]),
    });
    const accueil = f.get('src/pages/Accueil.tsx')!;
    expect(accueil).toContain("import Carte from '../composants/Carte';");
    expect(accueil).toContain('<Carte titre="Bienvenue" prix={prix} />');
    expect(accueil).toContain('<Carte />');
    expect(f.get('src/composants/Carte.tsx')).toContain('export default function Carte()');
  });

  it('écrit un composant Humalis comme un composant React exporté', () => {
    const f = genererProjetWeb(compiler(avecFiche).application!, { nom: 'b', adresse: 'http://localhost', source: 'b.humalis' });
    const fiche = f.get('src/composants/Fiche.tsx')!;
    expect(fiche).toContain('export default function Fiche({ nom, prix }: { nom: string; prix: number }) {');
    expect(fiche).toContain('<p data-humalis="texte_ligne_4">{nom}</p>');
    expect(fiche).not.toContain('usePage');
    // Un morceau de page, pas une page : pas de <main> imbriqué.
    expect(fiche).not.toContain('<main');
    expect(fiche).toContain('    <>');
    expect(f.get('src/pages/Boutique.tsx')).toContain('<Fiche nom="Livre" prix={12} />');
    expect(f.get('src/pages/Boutique.tsx')).toContain("import Fiche from '../composants/Fiche';");
  });
});
