import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme } from './analyse/aide.js';

// humalis.js réunit les outils des éléments (carrousel) et des interactions (minuteries) :
// deux noms identiques au même niveau empêchaient tout le fichier de se charger.
describe('statique — humalis.js se lit sans erreur', () => {
  it('un carrousel automatique et une minuterie dans la même application', () => {
    const source = programme(
      'page "accueil" :',
      '>titre "Accueil"',
      '>variable secondes = 0',
      '>carrousel avec automatique 5 :',
      '>>image "a.jpg" avec description "Première photo"',
      '>>image "b.jpg" avec description "Deuxième photo"',
      '>texte "{secondes}"',
      '>quand la page se charge :',
      '>>toutes les 1 secondes :',
      '>>>changer secondes par secondes + 1',
    );
    const resultat = compiler(source);
    expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const js = genererProjetStatique(resultat.application!, { nom: 'a', source: 'a.humalis' }).get('humalis/humalis.js')!;
    // Les deux mécanismes sont bien là, chacun sous son nom.
    expect(js).toContain('const minuteries = new Map();');
    expect(js).toContain('const minuteriesEnCours = new Set();');
    expect(() => new Function(js)).not.toThrow();
  });
});
