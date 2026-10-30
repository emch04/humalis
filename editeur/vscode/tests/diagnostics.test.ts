import { describe, it, expect } from 'vitest';
import { versDiagnostics as tousLesDiagnostics } from '../src/diagnostics.js';

// Ces petits programmes n'ont pas de titre : l'avertissement d'accessibilité qui le dit
// n'est pas le sujet de ces tests.
const versDiagnostics = (...args: Parameters<typeof tousLesDiagnostics>) =>
  tousLesDiagnostics(...args).filter((d) => !d.message.includes("n'a pas de titre"));

describe('versDiagnostics', () => {
  it('donne une liste vide pour un fichier correct', () => {
    const source = 'page "accueil" :\n    texte "Bonjour"\n';
    expect(versDiagnostics(source)).toEqual([]);
  });

  it('donne une liste vide pour un fichier vide', () => {
    expect(versDiagnostics('')).toEqual([]);
  });

  it('signale un guillemet manquant à la bonne ligne et à la bonne colonne', () => {
    const source = 'page "accueil" :\n    texte "Bonjour\n';
    const diagnostics = versDiagnostics(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].ligne).toBe(2);
    expect(diagnostics[0].colonne).toBe(11);
    expect(diagnostics[0].gravite).toBe('erreur');
    expect(diagnostics[0].message).toContain('guillemet manquant');
  });

  it('signale une indentation de 3 espaces', () => {
    const source = 'page "accueil" :\n   texte "Bonjour"\n';
    const [diagnostic] = versDiagnostics(source);
    expect(diagnostic.ligne).toBe(2);
    expect(diagnostic.message).toContain('indentation');
  });

  it('signale une page déclarée deux fois (erreur du parser)', () => {
    const source =
      'page "accueil" :\n    texte "a"\npage "accueil" :\n    texte "b"\n';
    const [diagnostic] = versDiagnostics(source);
    expect(diagnostic.ligne).toBe(3);
    expect(diagnostic.colonne).toBeUndefined();
    expect(diagnostic.message).toContain('déjà déclarée');
  });

  it('retire le préfixe « Ligne n : » du message', () => {
    const source = 'page "accueil" :\n   texte "Bonjour"\n';
    const [diagnostic] = versDiagnostics(source);
    expect(diagnostic.message).not.toMatch(/^Ligne \d+ :/);
  });

  it('affiche une exception inattendue comme une erreur interne, sans l\'avaler', () => {
    const compilateurCasse = () => {
      throw new TypeError('boum');
    };
    const [diagnostic] = versDiagnostics('page "a" :\n    texte "b"\n', compilateurCasse);
    expect(diagnostic.gravite).toBe('erreur');
    expect(diagnostic.ligne).toBe(1);
    expect(diagnostic.message).toContain(
      'erreur interne du compilateur, merci de la signaler',
    );
    expect(diagnostic.message).toContain('boum');
  });
});

describe('versDiagnostics — erreurs d’analyse (phase 2)', () => {
  it('signale une variable non déclarée', () => {
    expect(versDiagnostics('page "a" :\n    texte totl\n')).toEqual([
      {
        ligne: 2,
        message: "la variable « totl » n'est pas déclarée. Déclarez-la avec : variable totl = … Si c\'est un texte, mettez-le entre guillemets : texte \"totl\"",
        gravite: 'erreur',
      },
    ]);
  });

  it('signale une page cible absente comme un avertissement', () => {
    const source = 'page "a" :\n    lien "Plus" vers "apropos"\n';
    expect(versDiagnostics(source)).toEqual([
      { ligne: 2, message: "la page « apropos » n'existe pas dans ce fichier.", gravite: 'avertissement' },
    ]);
  });

  it('affiche plusieurs erreurs à la fois', () => {
    const diagnostics = versDiagnostics('page "a" :\n    texte x\n    texte y\n');
    expect(diagnostics.map((d) => d.ligne)).toEqual([2, 3]);
  });
});

import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('versDiagnostics — plusieurs fichiers', () => {
  it('lit les fichiers utilisés et montre leurs fautes en haut du document', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'humalis-extension-'));
    const principal = join(dossier, 'boutique.humalis');
    writeFileSync(join(dossier, 'panier.humalis'), 'page "panier" :\n    texte prix\n');
    const source = 'utiliser fichier "./panier.humalis"\n\npage "boutique" :\n    lien "Panier" vers "panier"\n';
    expect(versDiagnostics(source, undefined, principal)).toEqual([
      {
        ligne: 1,
        message: 'dans panier.humalis, ligne 2 : la variable « prix » n\'est pas déclarée. Déclarez-la avec : variable prix = … Si c\'est un texte, mettez-le entre guillemets : texte \"prix\"',
        gravite: 'erreur',
      },
    ]);
  });
});
