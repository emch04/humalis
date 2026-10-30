import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { adressesDuServeur } from '../src/cibles/desktop/projet.js';
import { programme } from './analyse/aide.js';

// Les défauts trouvés par la revue de code du 2026-10-29, gardés par un test chacun.
const application = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};

describe('revue de code — corrections', () => {
  it('une adresse sans serveur part de la racine, quelle que soit la page', () => {
    const page = genererProjetWeb(
      application(programme('page "accueil" :', '>variable produits = []', '>quand la page se charge :', '>>envoyer requete vers "produits" dans produits', '>texte "ok"')),
      { nom: 'essai', adresse: 'https://x.cd', source: 'essai.humalis' },
    ).get('src/pages/Accueil.tsx')!;
    expect(page).toContain("serveur.lire('/produits', produits)");
  });

  it('écrit le fichier de mémoire quand seul un composant a une variable « memorisee »', () => {
    const fichiers = genererProjetWeb(
      application(programme('composant "Volet" :', '>variable ouvert = faux avec memorisee', '>texte "{ouvert}"', '', 'page "accueil" :', '>Volet')),
      { nom: 'essai', adresse: 'https://x.cd', source: 'essai.humalis' },
    );
    expect(fichiers.has('src/humalis/memoire.ts')).toBe(true);
    expect(fichiers.get('src/composants/Volet.tsx')).toContain("import { useMemorise } from '../humalis/memoire';");
  });

  it('le relais desktop ne capture jamais la page d’accueil « / »', () => {
    const { relais } = adressesDuServeur(
      application(programme('page "accueil" :', '>variable x = []', '>quand la page se charge :', '>>envoyer requete vers "/" dans x', '>texte "ok"')),
    );
    expect(relais).toEqual(['/api', '/auth']);
  });
});
