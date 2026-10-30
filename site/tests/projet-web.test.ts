import { describe, it, expect } from 'vitest';
import { FICHIERS_BOUTIQUE, PAGE_BOUTIQUE, MARQUE_PROJET } from '../src/contenu/projetWeb';

describe('projet web de la boutique, calculé par le générateur', () => {
  it('contient la marque, les pages et le prérendu', () => {
    for (const f of [MARQUE_PROJET, 'package.json', 'src/main.tsx', 'src/pages/Boutique.tsx', 'src/pages/Panier.tsx', 'astratra.prerender.config.cjs']) {
      expect(FICHIERS_BOUTIQUE.has(f), f).toBe(true);
    }
  });

  it('l’extrait est du vrai React produit', () => {
    expect(PAGE_BOUTIQUE).toMatch(/export default function Boutique/);
    expect(PAGE_BOUTIQUE).toMatch(/useState/);
    expect(PAGE_BOUTIQUE).toMatch(/\.map\(/);
  });
});

import { CHEMINS_COMPOSANTS_BOUTIQUE, RACINE_COMPOSANTS, LISEZMOI_COMPOSANTS, PROJET_REACT_HOTE } from '../src/contenu/projetWeb';

describe('mode --composants de la boutique, calculé par le générateur', () => {
  it('écrit les pages et leurs outils, sans le projet Vite', () => {
    for (const f of ['pages/Boutique.tsx', 'pages/Panier.tsx', 'humalis/racine.tsx', 'humalis/partage.tsx', 'LISEZMOI.md']) {
      expect(CHEMINS_COMPOSANTS_BOUTIQUE, f).toContain(f);
    }
    expect(CHEMINS_COMPOSANTS_BOUTIQUE).not.toContain('package.json');
    expect(CHEMINS_COMPOSANTS_BOUTIQUE).not.toContain('src/main.tsx');
  });

  it('HumalisRacine réunit les messages et le partage', () => {
    expect(RACINE_COMPOSANTS).toContain('export function HumalisRacine');
    expect(RACINE_COMPOSANTS).toContain('<Partage>');
  });

  it('le LISEZMOI donne les routes à déclarer', () => {
    expect(LISEZMOI_COMPOSANTS).toContain('| `pages/Panier.tsx` | `/panier` |');
  });

  it('le projet React hôte utilise HumalisRacine et les deux pages', () => {
    expect(PROJET_REACT_HOTE).toContain('HumalisRacine');
    expect(PROJET_REACT_HOTE).toContain('path="/panier"');
  });
});

import { VITE_CONFIG_LIEN, DONNEES_LIEN, PAGE_LIEN } from '../src/contenu/projetLien';

describe('projet web de la boutique complète (serveur et pages dans le fichier), calculé par le générateur', () => {
  it('relaie /api et /auth vers le serveur', () => {
    expect(VITE_CONFIG_LIEN).toContain('HUMALIS_SERVEUR');
    expect(VITE_CONFIG_LIEN).toContain("'/api': cible");
  });
  it('type la liste avec l’interface de la donnée', () => {
    expect(DONNEES_LIEN).toContain('export interface Produit');
    expect(PAGE_LIEN).toContain('{p.nom}');
    expect(PAGE_LIEN).toContain("serveur.lire('/api/produits'");
  });
});

import { FICHIERS_MOBILE, PAGE_MOBILE, CHEMINS_MOBILE } from '../src/contenu/projetMobile';

describe('projet mobile de la boutique, calculé par le générateur', () => {
  it('contient les pages expo-router', () => {
    for (const f of ['package.json', 'app/_layout.tsx', 'app/index.tsx', 'app/panier.tsx', 'humalis/styles.ts']) {
      expect(CHEMINS_MOBILE, f).toContain(f);
    }
    expect(FICHIERS_MOBILE.get('package.json')).toContain('"expo"');
  });

  it('l’extrait est du vrai React Native produit', () => {
    expect(PAGE_MOBILE).toMatch(/export default function Boutique/);
    expect(PAGE_MOBILE).toContain("from 'react-native'");
    expect(PAGE_MOBILE).toContain('onPress=');
  });
});

import { CHEMINS_DESKTOP, CHEMINS_STATIQUE, HTML_STATIQUE, SCRIPT_STATIQUE } from '../src/contenu/projetBureauStatique';

describe('projets desktop et statique de la boutique, calculés par les générateurs', () => {
  it('le bureau a son processus Electron', () => {
    expect(CHEMINS_DESKTOP).toContain('electron/principal.ts');
    expect(CHEMINS_DESKTOP).toContain('package.json');
  });

  it('le site statique a une page HTML lisible et un script en clair', () => {
    expect(CHEMINS_STATIQUE).toContain('index.html');
    expect(CHEMINS_STATIQUE).toContain('panier.html');
    expect(HTML_STATIQUE).toContain('Nos produits');
    expect(SCRIPT_STATIQUE).toContain('function dessiner()');
  });
});
