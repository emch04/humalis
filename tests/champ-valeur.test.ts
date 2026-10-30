import { describe, expect, it } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { programme, erreurs } from './analyse/aide.js';

const exemple = programme(
  'page "taches" :',
  '>variable taches = ["Acheter du pain"]',
  '>variable dernier = ""',
  '>champ "Nouvelle tâche"',
  '>bouton "Ajouter"',
  '>quand l\'utilisateur clique sur "Ajouter" :',
  '>>ajouter champ "Nouvelle tâche" à taches',
  '>>changer dernier par champ "Nouvelle tâche"',
  '>texte "Dernière ajoutée : {dernier}"',
  '>pour chaque t dans taches :',
  '>>texte t',
);

describe('valeur courante d’un champ dans une action', () => {
  it('lit les deux formes comme une valeur de champ', () => {
    const corps = analyserSyntaxe(analyser(exemple)).pages[0].corps;
    expect(corps[4]).toMatchObject({ type: 'Evenement', corps: [
      { type: 'ModificationListe', valeur: { type: 'Champ', nom: 'Nouvelle tâche' } },
      { type: 'Affectation', valeur: { type: 'Champ', nom: 'Nouvelle tâche' } },
    ] });
  });

  it('accepte le libellé français même avec une version anglaise', () => {
    const source = programme('langues :', '>francais', '>anglais', exemple.replace('champ "Nouvelle tâche"\n', 'champ "Nouvelle tâche" en anglais "New task"\n'));
    expect(erreurs(source)).toEqual([]);
  });

  it('propose le libellé le plus proche quand le champ manque', () => {
    expect(erreurs(exemple.replaceAll('champ "Nouvelle tâche" à', 'champ "Nouvelle tachee" à'))[0]).toMatch(/Nouvelle tâche/);
  });

  it('vérifie les types des nombres et des cases', () => {
    const source = programme('page "a" :', '>variable total = 0', '>variable etats = [vrai]', '>champ nombre "Quantité"', '>case à cocher "Actif"', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>changer total par champ "Quantité"', '>>ajouter champ "Actif" à etats');
    expect(erreurs(source)).toEqual([]);
    expect(erreurs(source.replace('variable total = 0', 'variable total = ""'))).toContain('8 : « total » est un texte ; on ne peut pas lui donner un nombre.');
    expect(erreurs(source.replace('variable etats = [vrai]', 'variable etats = [0]'))[0]).toMatch(/liste de nombres/);
  });

  it('produit la lecture de l’état du champ sur les trois cibles', () => {
    const { application, diagnostics } = compiler(exemple);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const web = genererProjetWeb(application!, { nom: 'a', adresse: 'https://a.exemple.fr', source: 'a.humalis' }).get('src/pages/Taches.tsx')!;
    expect(web).toContain('setDernier(champNouvelleTache)');
    expect(web).toContain('setTaches([...taches, champNouvelleTache])');
    const statique = genererProjetStatique(application!, { nom: 'a', source: 'a.humalis' });
    expect([...statique.values()].join('\n')).toMatch(/champNouvelleTache/);
    const mobile = genererProjetMobile(application!, { nom: 'a', source: 'a.humalis' });
    expect([...mobile.values()].join('\n')).toContain('setDernier(champNouvelleTache)');
  });
});
