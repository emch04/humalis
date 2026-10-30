import { describe, it, expect } from 'vitest';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const VENTES = '>variable ventes = [fiche avec mois "Janvier" et montant 120000, fiche avec mois "Février" et montant 180000]';
const p = (...lignes: string[]) => programme('page "p" :', '>titre "Ventes"', ...lignes);
const tout = (source: string) => [...erreurs(source), ...avertissements(source)];

describe('graphiques — l’analyse : ce qui passe', () => {
  it('la forme en ligne, la forme en bloc, une liste de nombres : rien à signaler', () => {
    expect(tout(p(VENTES, '>graphique en courbe ventes avec etiquette mois et valeur montant en FC et description "Les ventes montent."'))).toEqual([]);
    expect(
      tout(
        p(
          '>variable mois = [fiche avec nom "Janvier" et ventes 120000 et achats 90000]',
          '>graphique en barres mois avec etiquette nom et description "Ventes et achats." et proportions 2 sur 1 :',
          '>>serie "Ventes" valeur ventes en FC avec couleur bleu',
          '>>serie "Achats" valeur achats en FC avec couleur orange',
        ),
      ),
    ).toEqual([]);
    expect(tout(p('>variable visites = [120, 180, 150]', '>graphique en barres visites avec etiquettes ["Lun", "Mar", "Mer"] et description "Visites de la semaine."'))).toEqual([]);
  });
});

describe('graphiques — l’analyse : les erreurs', () => {
  it('la description est obligatoire, et non vide (décision M3)', () => {
    expect(erreurs(p(VENTES, '>graphique en courbe ventes avec etiquette mois et valeur montant'))).toEqual([
      '4 : décrivez ce que montre le graphique, pour les personnes qui ne le voient pas : ajoutez par exemple « et description "Les ventes montent de janvier à mars." ».',
    ]);
    expect(erreurs(p(VENTES, '>graphique en courbe ventes avec etiquette mois et valeur montant et description " "'))[0]).toContain('la description du graphique est vide');
  });

  it('il faut une liste de nombres, de fiches ou de données', () => {
    expect(erreurs(p('>variable total = 3', '>graphique en barres total avec description "x"'))).toEqual([
      '4 : un graphique se fait à partir d’une liste de nombres, de fiches ou de données, par exemple les ventes par mois ; ici, c’est un nombre.',
    ]);
    expect(erreurs(p('>graphique en barres ["a", "b"] avec description "x"'))[0]).toContain('ici, c’est une liste de textes');
  });

  it('un champ inconnu, avec une suggestion ; une valeur qui n’est pas un nombre', () => {
    expect(erreurs(p(VENTES, '>graphique en courbe ventes avec etiquette mois et valeur montnt et description "x"'))).toEqual([
      '4 : « montnt » n’est pas un champ des éléments de la liste. Champs : mois, montant. Peut-être « montant » ?',
    ]);
    expect(erreurs(p(VENTES, '>graphique en courbe ventes avec etiquette mois et valeur mois et description "x"'))[0]).toContain('le champ « mois » est un texte : un graphique dessine des nombres');
  });

  it('les libellés et les valeurs manquants', () => {
    expect(erreurs(p(VENTES, '>graphique en courbe ventes avec valeur montant et description "x"'))[0]).toContain('il manque le champ des libellés : ajoutez par exemple « etiquette mois »');
    expect(erreurs(p(VENTES, '>graphique en courbe ventes avec etiquette mois et description "x"'))[0]).toContain('il manque le champ des valeurs : ajoutez par exemple « valeur montant »');
    expect(erreurs(p(VENTES, '>graphique en courbe ventes avec etiquette mois et description "x" :', '>>serie "Ventes"'))[0]).toContain('la série « Ventes » n’a pas de valeur');
  });

  it('une liste de nombres n’a pas de champs ; « etiquettes » est une liste de textes, aussi longue', () => {
    expect(erreurs(p('>graphique en barres [1, 2] avec etiquette mois et description "x"'))[0]).toContain('la liste ne contient que des nombres');
    expect(erreurs(p(VENTES, '>graphique en barres ventes avec etiquettes ["a"] et valeur montant et description "x"'))[0]).toContain('« etiquettes » sert à une liste de nombres');
    expect(erreurs(p('>graphique en barres [1, 2] avec etiquettes [1, 2] et description "x"'))[0]).toContain('« etiquettes » attend une liste de textes');
    expect(erreurs(p('>graphique en barres [1, 2, 3] avec etiquettes ["a", "b"] et description "x"'))[0]).toContain('3 nombres et 2 étiquettes');
  });

  it('le camembert : une série, pas de couleur, pas de valeur négative', () => {
    const bloc = ['>graphique en camembert ventes avec etiquette mois et description "x" :', '>>serie "A" valeur montant', '>>serie "B" valeur montant'];
    expect(erreurs(p(VENTES, ...bloc))[0]).toContain('un camembert montre une seule série');
    expect(erreurs(p(VENTES, '>graphique en camembert ventes avec etiquette mois et valeur montant et couleur vert et description "x"'))[0]).toContain('les parts d’un camembert prennent chacune leur couleur');
    expect(erreurs(p('>graphique en camembert [3, -2] avec description "x"'))[0]).toContain('un camembert ne montre pas de valeur négative (-2)');
  });

  it('la ligne et le bloc à la fois, une devise inconnue, des devises mélangées', () => {
    expect(erreurs(p(VENTES, '>graphique en courbe ventes avec etiquette mois et valeur montant et description "x" :', '>>serie "A" valeur montant'))[0]).toContain('soit sur la ligne du graphique');
    expect(erreurs(p(VENTES, '>graphique en courbe ventes avec etiquette mois et valeur montant en livres et description "x"'))[0]).toContain('« livres » n’est pas une devise connue');
    expect(
      erreurs(p(VENTES, '>graphique en courbe ventes avec etiquette mois et description "x" :', '>>serie "A" valeur montant en FC', '>>serie "B" valeur montant en euros'))[0],
    ).toContain('dans la même unité');
  });

  it('les proportions entières et positives ; une couleur connue ; pas dans un événement', () => {
    expect(erreurs(p(VENTES, '>graphique en courbe ventes avec etiquette mois et valeur montant et proportions 0 sur 1 et description "x"'))[0]).toContain('deux nombres entiers positifs');
    expect(erreurs(p(VENTES, '>graphique en courbe ventes avec etiquette mois et valeur montant et couleur turquoise et description "x"'))[0]).toContain('turquoise');
    expect(
      erreurs(p(VENTES, '>bouton "Voir"', '>quand l\'utilisateur clique sur "Voir" :', '>>graphique en courbe ventes avec etiquette mois et valeur montant et description "x"'))[0],
    ).toContain('un graphique se place dans la page, pas dans un événement');
  });
});

describe('graphiques — l’analyse : les avertissements', () => {
  it('trop de parts, trop de barres, une courbe d’un seul point', () => {
    const nombres = (n: number) => `[${Array.from({ length: n }, (_, i) => i + 1).join(', ')}]`;
    expect(avertissements(p(`>graphique en camembert ${nombres(9)} avec description "x"`))[0]).toContain('9 parts : au-delà de 8');
    expect(avertissements(p(`>graphique en barres ${nombres(41)} avec description "x"`))[0]).toContain('41 barres : au-delà de 40');
    expect(avertissements(p('>graphique en courbe [3] avec description "x"'))[0]).toContain('une courbe d’un seul point');
  });

  it('une couleur qui se voit mal sur le fond', () => {
    expect(avertissements(p(VENTES, '>graphique en barres ventes avec etiquette mois et valeur montant et couleur jaune et description "x"'))[0]).toContain('la couleur « jaune » se voit mal sur le fond de la page en mode clair');
  });

  it('une liste dont on ne connaît pas les champs : « champs non vérifiés »', () => {
    expect(avertissements(p('>variable ventes = []', '>graphique en courbe ventes avec etiquette mois et valeur montant et description "x"'))).toEqual([
      '4 : les champs des éléments de « ventes » ne sont connus qu’à l’exécution : « etiquette » et « valeur » ne sont pas vérifiés. Vérifiez qu’ils existent dans les données reçues.',
    ]);
  });
});
