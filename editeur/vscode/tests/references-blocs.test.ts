import { describe, it, expect } from 'vitest';
import { compilerProjet } from '../../../src/fichiers.js';
import { survoler } from '../src/langage/survol.js';
import { definir } from '../src/langage/definition.js';
import { completerSource } from '../src/langage/completion.js';
import { indexDe } from './aide-langage.js';

/** Chaque ligne marquée « # lu » lit gamma comme une valeur nue : le survol et F12 doivent la trouver. */
const PROGRAMME = `serveur "s" :
    donnee fiche :
        prix : nombre
    route "fiches" :
        tout le monde peut lire fiche
        seul admin peut modifier fiche

calcul total_haut = 1 + 1

entete :
    variable gamma = 0
    si gamma est superieur a 0 : # lu
        texte "e"

pied :
    variable gamma = 0
    si gamma est superieur a 0 : # lu
        texte "p"

fonction doubler avec gamma :
    rendre gamma + gamma # lu

fonction vider :
    variable gamma = 0
    changer gamma par 1 # lu

composant "Volet" :
    variable gamma = 0
    fenetre "V" avec description "D" :
        si gamma est superieur a 0 : # lu
            texte "v"

page "accueil" :
    titre "Accueil"
    variable gamma = 0
    variable liste = [1]
    variable lu = rien
    fenetre "F" avec description "D" :
        formulaire "dedans" :
            champ "Autre"
            bouton "Va"
        quand le formulaire "dedans" est soumis :
            changer gamma par 1 # lu
            si gamma est superieur a 0 : # lu
                changer gamma par 2
        progression gamma # lu
    onglets :
        onglet "Un" :
            progression gamma # lu
    deroulant "Plus" :
        progression gamma # lu
    section "S" :
        ligne :
            colonne :
                progression gamma # lu
    bouton "Go"
    quand l'utilisateur clique sur "Go" :
        essayer :
            changer gamma par gamma + 1 # lu
        si erreur :
            changer gamma par 0 # lu
        selon gamma : # lu
            cas 1 :
                changer gamma par 2 # lu
            sinon :
                changer gamma par 3 # lu
        apres 2 secondes :
            changer gamma par 4 # lu
        afficher reussite "Fait" avec action "Annuler" :
            changer gamma par 5 # lu
        pour chaque e dans liste :
            ajouter gamma à liste # lu
        envoyer requete vers "fiches" avec prix = gamma # lu
        confirmer "Sûr ?" :
            changer gamma par 6 # lu
        si gamma est egal a 1 et gamma est egal a 2 : # lu
            changer gamma par 7 # lu
        sinon :
            changer gamma par 8 # lu
    toutes les 5 secondes tant que gamma est egal a 0 : # lu
        changer gamma par 9 # lu
`;
const LIGNES = PROGRAMME.split('\n');

describe('survol et définition d’une variable nue, dans chaque bloc', () => {
  it('le programme de l’essai est accepté', () => {
    const { diagnostics } = compilerProjet(undefined, () => undefined, PROGRAMME);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  const lues = LIGNES.flatMap((texte, i) => (texte.includes('# lu') ? [{ ligne: i + 1, texte: texte.trim() }] : []));

  it.each(lues)('ligne $ligne : $texte', ({ ligne, texte }) => {
    const index = indexDe(PROGRAMME);
    const colonne = LIGNES[ligne - 1].indexOf('gamma') + 1;
    const survol = survoler(index, ligne, colonne);
    expect(survol?.markdown ?? `rien pour : ${texte}`).toContain('`gamma`');
    const lieu = definir(index, ligne, colonne);
    expect(lieu?.ligne, texte).toBeLessThan(ligne);
    expect(LIGNES[(lieu?.ligne ?? 1) - 1]).toMatch(/variable gamma|avec gamma/);
  });

  it('une variable déclarée dans une fenêtre se voit dedans, pas dehors', () => {
    const source = 'page "a" :\n    titre "A"\n    fenetre "F" avec description "D" :\n        variable beta = 1\n        progression beta\n    variable delta = beta\n';
    const index = indexDe(source);
    expect(survoler(index, 5, 21)?.markdown).toContain('`beta`');
    expect(definir(index, 5, 21)?.ligne).toBe(4);
    expect(definir(index, 6, 21)).toBeUndefined();
  });

  it('la complétion propose les variables d’une fenêtre', () => {
    const source = 'page "a" :\n    titre "A"\n    variable gamma = 0\n    fenetre "F" avec description "D" :\n        variable beta = 1\n        progression ';
    const libelles = completerSource(source, 6, source.split('\n')[5].length + 1).propositions.map((p) => p.libelle);
    expect(libelles).toEqual(expect.arrayContaining(['gamma', 'beta']));
  });

  it('un mot écrit ailleurs ne devient pas une variable', () => {
    const source = 'page "a" :\n    titre "A"\n    variable texte_x = 0\n    texte "texte_x"\n';
    expect(survoler(indexDe(source), 4, 13)?.markdown ?? '').not.toContain('variable `texte_x`');
  });
});
