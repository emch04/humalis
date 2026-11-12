import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * Le cloisonnement des données : un compte ne peut ni déplacer sa fiche dans l'espace d'un autre (« par compte »,
 * « par boutique »), ni choisir l'auteur d'une fiche (« seul son auteur peut … »). Trouvé par la revue du 12 novembre
 * 2026, reproduit en vrai sur un serveur produit (PATCH { compte: autre } → 200 avant, 400 après).
 */
const erreurs = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);

describe('le cloisonnement des données du serveur', () => {
  it('le champ de séparation ne change jamais, même dans une modification', () => {
    for (const separation of ['par compte', 'par boutique']) {
      const source = `serveur "coffre" :\n${separation === 'par boutique' ? '    roles gerant et vendeur\n' : ''}    donnee secret ${separation} :\n        texte : texte\n    route "secrets" :\n        connecte peut lire secret\n        connecte peut creer secret\n        connecte peut modifier secret\n\npage "a" :\n    titre "A"\n`;
      const { application, diagnostics } = compiler(source);
      expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message), separation).toEqual([]);
      const serveur = genererProjetServeur(application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' }).get('src/serveur.ts')!;
      const champ = separation === 'par compte' ? 'compte' : 'boutique';
      const modification = serveur.split('\n').find((l) => l.includes('verifierEnvoi(SCHEMA_SECRET, req.body, false'));
      expect(modification, separation).toContain(`fixes: ["${champ}"]`);
    }
  });

  it('un champ « auteur » déclaré à la main est refusé avec « seul son auteur peut … »', () => {
    const source = 'serveur "avis" :\n    donnee avis :\n        texte : texte\n        auteur : texte\n    route "avis" :\n        tout le monde peut lire avis\n        tout le monde peut creer avis\n        seul son auteur peut modifier avis\n\npage "a" :\n    titre "A"\n';
    expect(erreurs(source)[0]).toContain('le champ « auteur » de la donnée « avis » est rempli par le serveur');
    // Sans le champ déclaré, le serveur l'ajoute lui-même : aucune erreur.
    expect(erreurs(source.replace('        auteur : texte\n', ''))).toEqual([]);
  });
});
