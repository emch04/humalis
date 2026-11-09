import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { genererProjetMoteur } from '../../src/cibles/moteur/projet.js';
import { genererProjetServeur } from '../../src/cibles/serveur/projet.js';
import { programme } from '../analyse/aide.js';

const source = (regle = '>>connecte peut lire son compte') =>
  programme(
    'serveur "s" :',
    '>roles gerant',
    '>compte :',
    '>>nom : texte',
    '>route "moi" :',
    regle,
    '',
    'page "accueil" :',
    '>variable profil = []',
    '>calcul moi = premier de profil',
    '>quand la page se charge :',
    '>>envoyer requete vers "moi" dans profil',
    '>titre "Bonjour {moi.nom}"',
  );

describe('« connecte peut lire son compte »', () => {
  it('compile, et le serveur rend le compte de la personne seulement', () => {
    const resultat = compiler(source());
    expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const fichiers = [...genererProjetServeur(resultat.application!.serveurs[0], { nom: 's', source: 's.humalis' }).values()].join('\n');
    expect(fichiers).toContain('comptes.monCompte');
    expect(fichiers).toContain("...acces.connecte, comptes.monCompte");
  });

  it('un visiteur n’a pas de compte', () => {
    const erreurs = compiler(source('>>tout le monde peut lire son compte')).diagnostics.filter((d) => d.gravite === 'erreur');
    expect(erreurs.map((d) => d.message).join('\n')).toMatch(/visiteur n’a pas de compte/);
  });

  it('seule la lecture est permise', () => {
    expect(() => compiler(source('>>connecte peut modifier son compte'))).not.toThrow();
    expect(compiler(source('>>connecte peut modifier son compte')).diagnostics.map((d) => d.message).join('\n')).toMatch(/ne se lit que/);
  });
});

describe('un champ d’un calcul dans un texte (moteur natif)', () => {
  it('se lit en appelant le calcul, pour que la page se mette à jour', () => {
    const fichiers = genererProjetMoteur(compiler(source()).application!, { nom: 'e', source: 'e.humalis' });
    const code = [...fichiers.entries()].filter(([c]) => c.includes('couches/')).map(([, t]) => t).join('\n');
    expect(code).toContain('moi()?.nom');
    expect(code).not.toContain('moi.v?.nom');
  });
});

describe('une saisie suivie (moteur natif)', () => {
  it('le champ est mis à jour avant le « quand … ecrit dans »', () => {
    const source = readFileSync(new URL('../../src/cibles/moteur/execution.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/addEventListener\('input', \(\) => \{\s*boite\.v = el\[propriete\];\s*\}, true\)/);
  });
});
