import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { programme } from './analyse/aide.js';

const avecBarre = (entete: string) =>
  programme(
    'barre laterale :',
    '>lien "Accueil" vers "accueil"',
    '',
    entete,
    '>titre "Accueil"',
  );

const apple = (source: string) => {
  const r = compiler(source);
  expect(r.application, JSON.stringify(r.diagnostics)).toBeDefined();
  return genererProjetApple(r.application!, { nom: 'essai', source: 'essai.humalis' });
};

const avertissementBarre = (diagnostics: { gravite: string; message: string }[]) =>
  diagnostics.filter((d) => d.gravite === 'avertissement' && d.message.includes('barre laterale'));

describe('« barre laterale : » sur Mac', () => {
  it('prévient qu’elle n’est dessinée qu’avec des pages « dessinee pour … »', () => {
    const { diagnostics, fichiers } = apple(avecBarre('page "accueil" :'));
    expect(avertissementBarre(diagnostics)).toHaveLength(1);
    expect([...fichiers.keys()].some((f) => f.endsWith('BarreSite.swift'))).toBe(false);
  });

  it('la dessine sans rien dire quand une page est dessinée', () => {
    const { diagnostics, fichiers } = apple(avecBarre('page "accueil" dessinee pour 1440 par 900 :'));
    expect(avertissementBarre(diagnostics)).toEqual([]);
    expect([...fichiers.keys()].some((f) => f.endsWith('BarreSite.swift'))).toBe(true);
  });
});
