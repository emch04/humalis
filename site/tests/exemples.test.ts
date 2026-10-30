import { describe, it, expect } from 'vitest';
import { EXEMPLES, envelopper, type Exemple } from '../src/contenu/exemples';
import { diagnostiquer as diagnostiquerActuel, formater, refusesPourLeWeb } from '../src/contenu/verification';

const diagnostiquer = (source: string) => diagnostiquerActuel(source).filter((d) => d.categorie !== 'accessibilite');

/** Lève si l'exemple ne se comporte pas comme annoncé. */
export function verifierExemple(e: Exemple): void {
  const source = e.mode === 'fragment' ? envelopper(e.code) : e.code;
  const diagnostics = diagnostiquer(source);
  const erreurs = diagnostics.filter((d) => d.gravite === 'erreur');
  const lignes = diagnostics.map(formater).join('\n');

  if (e.mode === 'refus-web') {
    if (diagnostics.length > 0) throw new Error(`« ${e.id} » devait être accepté par le langage, mais :\n${lignes}`);
    const refus = refusesPourLeWeb(source);
    const trouve = refus.find((d) => d.message.includes(e.attendu!.contient));
    if (!trouve) throw new Error(`« ${e.id} » devait être refusé par le web avec « ${e.attendu!.contient} », mais : ${refus.map(formater).join(' | ') || 'rien'}`);
    if (trouve.ligne !== e.attendu!.ligne) throw new Error(`« ${e.id} » : ligne ${trouve.ligne} au lieu de ${e.attendu!.ligne}`);
    return;
  }
  if (e.mode === 'erreur' || e.mode === 'avertissement') {
    const gravite = e.mode === 'erreur' ? 'erreur' : 'avertissement';
    const trouve = diagnostics.find((d) => d.gravite === gravite && d.message.includes(e.attendu!.contient));
    if (!trouve) throw new Error(`« ${e.id} » devait produire « ${e.attendu!.contient} », mais :\n${lignes || 'rien'}`);
    if (trouve.ligne !== e.attendu!.ligne) throw new Error(`« ${e.id} » : ligne ${trouve.ligne} au lieu de ${e.attendu!.ligne}`);
    if (e.mode === 'erreur' && erreurs.length !== 1) throw new Error(`« ${e.id} » : une seule erreur attendue, mais :\n${lignes}`);
    return;
  }
  const permis = (d: { gravite: string; message: string }) =>
    d.gravite === 'avertissement' && e.tolere !== undefined && d.message.includes(e.tolere);
  if (diagnostics.some((d) => !permis(d))) throw new Error(`« ${e.id} » devait passer sans rien signaler, mais :\n${lignes}`);
  if (!compilerReussit(source)) throw new Error(`« ${e.id} » ne produit pas d'application`);
}

import { compiler } from '../../src/compilateur';
const compilerReussit = (source: string) => compiler(source).application !== undefined;

describe('envelopper', () => {
  it('indente chaque ligne sous une page', () => {
    expect(envelopper('titre "A"\ntexte "B"')).toBe('page "exemple" :\n    titre "A"\n    texte "B"');
  });
  it('produit un programme que le compilateur accepte', () => {
    expect(diagnostiquer(envelopper('titre "A" avec couleur bleu'))).toEqual([]);
  });
});

describe('exemples de la documentation', () => {
  it('il y a des exemples', () => {
    expect(EXEMPLES.length).toBeGreaterThan(0);
  });
  it('les identifiants sont uniques', () => {
    const ids = EXEMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  for (const e of EXEMPLES) {
    it(`« ${e.id} » se comporte comme annoncé`, () => {
      expect(() => verifierExemple(e)).not.toThrow();
    });
  }
});
