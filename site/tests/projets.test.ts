import { describe, it, expect } from 'vitest';
import { PROJETS } from '../src/contenu/projets';
import { diagnostiquerProjet } from '../src/contenu/verification';

describe('les projets en plusieurs fichiers de la documentation', () => {
  it('existent', () => {
    expect(PROJETS.length).toBeGreaterThan(0);
  });

  for (const projet of PROJETS) {
    it(projet.id, () => {
      const diagnostics = diagnostiquerProjet(projet);
      if (!projet.attendu) {
        expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
        return;
      }
      const erreurs = diagnostics.filter((d) => d.gravite === 'erreur');
      expect(erreurs).toHaveLength(1);
      expect(erreurs[0].message).toContain(projet.attendu.contient);
      expect(erreurs[0].ligne).toBe(projet.attendu.ligne);
      expect(erreurs[0].fichier).toBe(projet.attendu.fichier);
    });
  }

  it('le projet principal réunit les pages des deux fichiers', () => {
    const projet = PROJETS.find((p) => p.id === 'boutique-et-panier')!;
    expect(projet.fichiers.map((f) => f.nom)).toEqual(['boutique.humalis', 'panier.humalis']);
    expect(diagnostiquerProjet(projet)).toEqual([]);
  });
});
