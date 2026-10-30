import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { programme, erreurs, avertissements } from './aide.js';

describe('analyse — pages cibles', () => {
  it('avertit d’une page cible absente (W1)', () => {
    const source = programme('page "a" :', '>bouton "Go"', '>quand utilisateur clique sur "Go" :', '>>rediriger vers "panier"');
    expect(erreurs(source)).toEqual([]);
    expect(avertissements(source)).toEqual(['4 : la page « panier » n\'existe pas dans ce fichier.']);
  });

  it('avertit aussi pour un lien', () => {
    expect(avertissements(programme('page "a" :', '>lien "Plus" vers "apropos"'))).toEqual([
      '2 : la page « apropos » n\'existe pas dans ce fichier.',
    ]);
  });

  it('ne dit rien quand la page existe', () => {
    expect(avertissements(programme('page "a" :', '>lien "B" vers "b"', 'page "b" :', '>titre "B"'))).toEqual([]);
  });

  it('n’a plus l’avertissement W2 : les formulaires sont pris en charge (plan des formulaires, F1)', () => {
    const source = programme(
      'page "a" :',
      '>formulaire "connexion" :',
      '>>champ "email"',
      '>quand le formulaire "connexion" est soumis :',
      '>>afficher "ok"',
    );
    expect(avertissements(source)).toEqual([]);
  });
});

describe('analyse — exemples de référence', () => {
  it.each(['boutique', 'connexion'])('ne trouve aucune erreur dans %s.humalis', (nom) => {
    expect(erreurs(readFileSync(`exemples/${nom}.humalis`, 'utf8'))).toEqual([]);
  });
});
