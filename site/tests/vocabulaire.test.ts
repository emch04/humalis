import { describe, it, expect } from 'vitest';
import { MOTS_CLES, MOTS_LIAISON, MOTS_RESERVES, VARIANTES } from '../../src/lexer/motsCles';
import { compiler } from '../../src/compilateur';
import { compilerProjet } from '../../src/fichiers';
/** Pour l'exemple de « utiliser fichier "./panier.humalis" » : une page « panier » toute simple. */
const fichierUtilise = (chemin: string) =>
  chemin.endsWith('.csv') ? 'nom;prix\nLivre;12\n' : `page "${chemin.replace(/^.*\//, '').replace(/\.humalis$/, '')}" :\n    texte "Votre panier"\n`;

import { VOCABULAIRE } from '../../src/vocabulaire/table';
import { TABLE, CATEGORIES } from '../src/vocabulaire/adaptateur';
import { regrouperParCategorie, filtrer } from '../src/vocabulaire/regrouper';

describe('vocabulaire du site', () => {
  it('ne perd aucune entrée en regroupant', () => {
    const groupes = regrouperParCategorie(TABLE);
    const total = [...groupes.values()].reduce((n, g) => n + g.length, 0);
    expect(total).toBe(TABLE.length);
  });

  it('filtre sans tenir compte des accents ni de la casse', () => {
    expect(filtrer(TABLE, 'INFÉRIEURE').some((e) => e.mot === 'inferieur')).toBe(true);
  });

  it('retrouve un mot par une de ses variantes', () => {
    const e = TABLE.find((x) => x.variantes.length > 0)!;
    expect(filtrer(TABLE, e.variantes[0]).map((x) => x.mot)).toContain(e.mot);
  });

  it('filtre par catégorie', () => {
    const r = filtrer(TABLE, '', 'element');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.categorie === 'element')).toBe(true);
  });

  it('chaque entrée a un mot, une catégorie connue, un concept et un exemple', () => {
    for (const e of TABLE) {
      expect(e.mot, e.mot).not.toBe('');
      expect(CATEGORIES[e.categorie], `catégorie de « ${e.mot} »`).toBeDefined();
      expect(e.concept, `concept de « ${e.mot} »`).not.toBe('');
      expect(e.exemple, `exemple de « ${e.mot} »`).not.toBe('');
    }
  });
});

describe('le site lit la vraie table de vocabulaire (rien ne manque, rien n’est inventé)', () => {
  const mots = TABLE.map((e) => e.mot);

  it('a une fiche par entrée de la table', () => {
    expect(TABLE).toHaveLength(VOCABULAIRE.length);
    expect(mots).toEqual(VOCABULAIRE.map((e) => e.mot));
  });

  it('contient tous les mots-clés et tous les mots de liaison du lexer', () => {
    for (const m of [...MOTS_CLES, ...MOTS_LIAISON]) expect(mots, m).toContain(m);
  });

  it('les mots réservés sont ceux du lexer', () => {
    const reserves = TABLE.filter((e) => e.reserve).map((e) => e.mot).sort();
    expect(reserves).toEqual([...MOTS_RESERVES].sort());
  });

  it('chaque variante du lexer est présente sur son mot', () => {
    for (const [variante, canonique] of VARIANTES) {
      expect(TABLE.find((e) => e.mot === canonique)!.variantes, variante).toContain(variante);
    }
  });

  it('les identifiants des fiches sont uniques', () => {
    const ids = TABLE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('montre aussi les mots prévus, marqués comme tels', () => {
    const prevus = TABLE.filter((e) => !e.disponible);
    expect(prevus.length).toBeGreaterThan(0);
    for (const e of prevus) expect(e.note, e.mot).toMatch(/Prévu, pas encore compris par le compilateur\./);
  });
});

describe('exemples du vocabulaire', () => {
  for (const e of TABLE.filter((x) => x.disponible)) {
    it(`l’exemple de « ${e.mot} » est accepté par le compilateur`, () => {
      const erreurs = compilerProjet(undefined, fichierUtilise, e.exemple).diagnostics.filter((d) => d.gravite === 'erreur');
      expect(erreurs).toEqual([]);
    });
  }
});
