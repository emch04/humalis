import { describe, it, expect } from 'vitest';
import { programme, erreurs, analyse } from './aide.js';

describe('analyse — variables', () => {
  it('ne signale rien pour un programme correct', () => {
    expect(
      erreurs(programme('page "a" :', '>variable nom = "Awa"', '>texte nom', '>texte "Bonjour {nom}"')),
    ).toEqual([]);
  });

  it('signale une variable non déclarée (A1)', () => {
    expect(erreurs(programme('page "a" :', '>texte totl'))).toEqual([
      "2 : la variable « totl » n'est pas déclarée. Déclarez-la avec : variable totl = … Si c\'est un texte, mettez-le entre guillemets : texte \"totl\"",
    ]);
  });

  it('signale une variable utilisée avant sa déclaration (A2)', () => {
    expect(erreurs(programme('page "a" :', '>texte stock', '>variable stock = 3'))).toEqual([
      "2 : la variable « stock » est utilisée avant d'être déclarée (ligne 3).",
    ]);
  });

  it('signale une variable inconnue dans une interpolation (A3)', () => {
    expect(erreurs(programme('page "a" :', '>texte "Bonjour {nom}"'))).toEqual([
      "2 : le texte utilise {nom}, mais la variable « nom » n'est pas déclarée.",
    ]);
  });

  it('signale une variable déclarée deux fois, même dans un bloc (A4)', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>variable clics = 0',
          '>bouton "Cliquer"',
          '>quand utilisateur clique sur "Cliquer" :',
          '>>variable clics = 1',
        ),
      ),
    ).toEqual([
      '5 : la variable « clics » existe déjà (ligne 2). Pour changer sa valeur, écrivez : changer clics par …',
    ]);
  });

  it('limite la variable de boucle à sa boucle (A5)', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>variable produits = ["Livre"]',
          '>pour chaque nom dans produits :',
          '>>texte nom',
          '>texte nom',
        ),
      ),
    ).toEqual(["5 : « nom » n'existe que dans la boucle de la ligne 3."]);
  });

  it('permet deux boucles successives avec la même variable', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>variable l = ["x"]',
          '>pour chaque nom dans l :',
          '>>texte nom',
          '>pour chaque nom dans l :',
          '>>texte nom',
        ),
      ),
    ).toEqual([]);
  });

  it("limite une variable déclarée dans un événement à cet événement", () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>bouton "Go"',
          '>quand utilisateur clique sur "Go" :',
          '>>variable etape = 1',
          '>texte etape',
        ),
      ),
    ).toEqual(["5 : la variable « etape » n'est pas déclarée. Déclarez-la avec : variable etape = … Si c\'est un texte, mettez-le entre guillemets : texte \"etape\""]);
  });

  it('vérifie la variable changée par « changer … par »', () => {
    expect(
      erreurs(
        programme('page "a" :', '>bouton "Go"', '>quand utilisateur clique sur "Go" :', '>>changer total par 1'),
      ),
    ).toEqual(["4 : la variable « total » n'est pas déclarée. Déclarez-la avec : variable total = …"]);
  });

  it('vérifie la variable qui reçoit la réponse d’une requête', () => {
    expect(
      erreurs(programme('page "a" :', '>quand la page se charge :', '>>envoyer requete vers "/p" dans produits')),
    ).toEqual(["3 : la variable « produits » n'est pas déclarée. Déclarez-la avec : variable produits = …"]);
  });

  it('isole les variables de chaque page', () => {
    expect(
      erreurs(programme('page "a" :', '>variable x = 1', 'page "b" :', '>texte x')),
    ).toEqual(["4 : la variable « x » n'est pas déclarée. Déclarez-la avec : variable x = … Si c\'est un texte, mettez-le entre guillemets : texte \"x\""]);
  });

  it('renvoie toutes les erreurs, triées par ligne', () => {
    const resultat = analyse(programme('page "a" :', '>texte y', '>texte x'));
    expect(resultat.diagnostics.map((d) => d.ligne)).toEqual([2, 3]);
  });
});
