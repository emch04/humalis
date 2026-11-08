import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from './aide-qualite.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { verifierModulesPourLeMobile } from '../src/cibles/mobile/projet.js';
import { verifierNomsPourLeWeb } from '../src/cibles/sources.js';
import { dependancesDesComposantsReact, paquetsImportes } from '../src/cibles/web/composants-react.js';
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

describe('composants React — paquets, .jsx et 3D', () => {
  const avec = (nom: string, contenu: string) =>
    genererProjetWeb(compiler(avecCarte).application!, {
      nom: 'b', adresse: 'http://localhost', source: 'b.humalis',
      composantsReact: new Map([['./composants/Carte', { nom, contenu }]]),
    });
  const scene = "import { useEffect } from 'react';\nimport * as THREE from 'three';\nimport gsap from 'gsap';\nexport default function Carte() { return null; }";

  it('lit les paquets importés, sans React, sans chemins relatifs ni modules de Node', () => {
    expect(paquetsImportes(`
import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from "three";
import './style.css';
import x from './x';
import { readFile } from 'node:fs';
const g = await import('gsap/ScrollTrigger');
`)).toEqual(['@react-three/fiber', 'gsap', 'three']);
  });

  it('ajoute three, gsap et les types de three au package.json', () => {
    const paquet = JSON.parse(avec('Carte.jsx', scene).get('package.json')!);
    expect(paquet.dependencies.three).toBe('0.187.0');
    expect(paquet.dependencies.gsap).toBe('3.15.0');
    expect(paquet.devDependencies['@types/three']).toBe('0.187.0');
  });

  it('un paquet inconnu part en latest ; sans import, rien n\'est ajouté', () => {
    expect(dependancesDesComposantsReact(["import x from 'inconnu';"]).dependances).toEqual({ inconnu: 'latest' });
    expect(dependancesDesComposantsReact(['export default function A() { return null; }'])).toEqual({ dependances: {}, dependancesDev: {} });
  });

  it('fige three quand seul @react-three/… est importé', () => {
    const { dependances, dependancesDev } = dependancesDesComposantsReact(["import { Float } from '@react-three/drei';"]);
    expect(dependances.three).toBe('0.187.0');
    expect(dependancesDev['@types/three']).toBe('0.187.0');
  });

  it('accepte un composant .jsx : tsconfig avec allowJs, fichier recopié tel quel', () => {
    const f = avec('Carte.jsx', 'export default function Carte() { return null; }');
    expect(JSON.parse(f.get('tsconfig.json')!).compilerOptions.allowJs).toBe(true);
    expect(f.get('src/composants/Carte.jsx')).toContain('function Carte');
  });

  it('charge à part un composant 3D, pas un composant ordinaire', () => {
    const f3d = avec('Carte.tsx', scene);
    expect(f3d.get('src/composants/Carte.differe.tsx')).toContain("lazy(() => import('./Carte')");
    expect(f3d.get('src/pages/Accueil.tsx')).toContain('composants/Carte.differe');
    const ordinaire = avec('Carte.tsx', 'export default function Carte() { return null; }');
    expect(ordinaire.has('src/composants/Carte.differe.tsx')).toBe(false);
    expect(ordinaire.get('src/pages/Accueil.tsx')).toContain("composants/Carte'");
  });
});

describe('utiliser module — JavaScript sans framework', () => {
  const source = 'utiliser module "Scene3D" depuis "./modules/Scene3D"\n\npage "accueil" :\n    variable c = "#fff"\n    Scene3D avec couleur c\n';
  const genere = () =>
    genererProjetWeb(compiler(source).application!, {
      nom: 'b', adresse: 'http://localhost', source: 'b.humalis',
      composantsReact: new Map([['./modules/Scene3D', { nom: 'Scene3D.js', contenu: "import * as THREE from 'three';\nexport default function Scene3D(e) { return () => {}; }" }]]),
    });

  it('se lit, avec le genre module', () => {
    expect(analyserSyntaxe(analyser(source)).composantsReact).toEqual([
      { type: 'ComposantReact', nom: 'Scene3D', chemin: './modules/Scene3D', ligne: 1, module: true },
    ]);
  });

  it('dit ce qui manque', () => {
    expect(() => analyserSyntaxe(analyser('utiliser module "A" "./a"\npage "a" :\n    titre "A"'))).toThrow(/depuis/);
  });

  it('recopie le fichier, le relie par une enveloppe chargée à part, ajoute ses paquets', () => {
    const f = genere();
    expect(f.get('src/composants/Scene3D.js')).toContain('function Scene3D');
    expect(f.get('src/composants/Scene3D.module.tsx')).toContain("import('./Scene3D')");
    expect(f.get('src/pages/Accueil.tsx')).toContain('composants/Scene3D.module');
    expect(f.get('src/pages/Accueil.tsx')).toContain('<Scene3D couleur={c} />');
    expect(f.has('src/composants/Scene3D.differe.tsx')).toBe(false);
    expect(JSON.parse(f.get('package.json')!).dependencies.three).toBe('0.187.0');
  });

  it('refuse un nom déjà pris par un élément de Humalis', () => {
    const application = compiler('utiliser module "Compteur" depuis "./m"\n\npage "accueil" :\n    Compteur\n').application!;
    expect(verifierNomsPourLeWeb(application)[0]).toMatchObject({ gravite: 'erreur', ligne: 1 });
    expect(verifierNomsPourLeWeb(compiler(source).application!)).toEqual([]);
  });

  it('un module est refusé sur le mobile', () => {
    expect(verifierModulesPourLeMobile(compiler(source).application!)[0]).toMatchObject({ gravite: 'erreur', ligne: 1 });
    expect(verifierModulesPourLeMobile(compiler(avecCarte).application!)).toEqual([]);
  });

  it('un composant React reste un composant React', () => {
    expect(analyserSyntaxe(analyser(avecCarte)).composantsReact[0]).not.toHaveProperty('module');
  });
});
