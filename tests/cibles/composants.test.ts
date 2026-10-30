import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { genererComposantsWeb } from '../../src/cibles/web/projet.js';

const fichiers = genererComposantsWeb(compiler(readFileSync('exemples/boutique.humalis', 'utf8')).application!, {
  nom: 'boutique',
  adresse: 'http://localhost',
  source: 'boutique.humalis',
});

describe('cible web — mode composants (une page Humalis dans un projet React)', () => {
  it('écrit seulement les pages et les outils, sans projet Vite', () => {
    expect([...fichiers.keys()].sort()).toEqual([
      '.humalis-projet',
      'LISEZMOI.md',
      'humalis/memoire.ts'.replace('memoire', 'messages').replace('.ts', '.tsx'),
      'humalis/navigation.tsx',
      'humalis/outils.ts',
      'humalis/page.ts',
      'humalis/partage.tsx',
      'humalis/racine.tsx',
      'humalis/serveur.ts',
      'humalis/styles.css',
      'pages/Boutique.tsx',
      'pages/Panier.tsx',
    ].sort());
  });

  it('regroupe les fournisseurs dans HumalisRacine', () => {
    const racine = fichiers.get('humalis/racine.tsx')!;
    expect(racine).toContain('export function HumalisRacine({ children }: { children: ReactNode })');
    expect(racine).toContain('<Messages>');
    expect(racine).toContain('<Partage>');
    expect(racine).toContain("import './styles.css';");
  });

  it('garde les pages telles qu’elles sont dans le projet complet', () => {
    expect(fichiers.get('pages/Boutique.tsx')).toContain('export default function Boutique()');
    expect(fichiers.get('pages/Boutique.tsx')).toContain("from '../humalis/partage'");
  });

  it('explique l’usage, les adresses et les dépendances dans le LISEZMOI', () => {
    const lisezmoi = fichiers.get('LISEZMOI.md')!;
    expect(lisezmoi).toContain('<HumalisRacine>');
    expect(lisezmoi).toContain('`/panier`');
    expect(lisezmoi).toContain('react-router');
  });
});
