import { describe, expect, it } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { verifierSourcesPourLaCible } from '../src/cibles/sources.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';

const base = (actions: string) => `source "boutique" :\n    adresse "https://exemple.test"\npage "equipe" :\n    variable membres = []\n    bouton "Retirer"\n    quand l'utilisateur clique sur "Retirer" :\n${actions}`;

describe('en supposant que ça marche', () => {
  it('lit le bloc et la requête qui le suit', () => {
    const resultat = compiler(base('        en supposant que ca marche :\n            retirer "Luc" de membres\n        envoyer requete vers "equipe" de la source "boutique" avec membres'));
    expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(JSON.stringify(resultat.application)).toContain('optimiste');
  });
  it('refuse un bloc sans requête à la suite', () => {
    expect(compiler(base('        en supposant que ça marche :\n            retirer "Luc" de membres')).diagnostics.find((d) => d.gravite === 'erreur')!.message).toMatch(/requête.*après/i);
    expect(compiler(base('        en supposant que ca marche :\n            retirer "Luc" de membres\n        afficher "Suite"\n        envoyer requete vers "equipe" de la source "boutique" avec membres')).diagnostics.find((d) => d.gravite === 'erreur')!.message).toMatch(/requête.*après/i);
  });
  it('produit le retour arrière après la requête et refuse les cibles sans moteur', () => {
    const resultat = compiler(base('        en supposant que ca marche :\n            retirer "Luc" de membres\n        envoyer requete vers "equipe" de la source "boutique" avec membres'));
    const application = resultat.application!;
    expect(verifierSourcesPourLaCible(application, 'mobile').some((d) => d.message.includes('en supposant'))).toBe(true);
    expect(verifierSourcesPourLaCible(application, 'statique').some((d) => d.message.includes('en supposant'))).toBe(true);
    const fichiers = genererProjetWeb(application, { nom: 'essai', source: 'essai.humalis' });
    const ecran = [...fichiers.entries()].find(([nom]) => nom.includes('Equipe'))?.[1] ?? [...fichiers.values()].find((texte) => texte.includes('avantOptimiste'))!;
    expect(ecran).toMatch(/await serveur\.envoyer[\s\S]*if \(serveur\.echecs\(\) > echecsOptimiste/);
    expect(ecran).toContain('setMembres(avantOptimiste');
  });
});
