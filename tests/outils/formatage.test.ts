import { expect, it } from 'vitest';
import { formaterSource } from '../../src/outils/formatage.js';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sansPositions = (valeur: unknown): unknown => JSON.parse(JSON.stringify(valeur, (cle, contenu) =>
  cle === 'ligne' || cle === 'colonne' ? undefined : contenu));

const familles: Record<string, string> = {
  'pages, éléments et options': 'page "accueil" :\n    variable prix=2,5\n    titre "Été {prix}" avec couleur bleu et fond blanc\n    bouton "OK" avec nom "valider" et fond vert\n',
  'conditions et boucles': 'page "a" :\n    variable n=0\n    variable noms=["A", "B"]\n    pour chaque nom dans noms :\n        texte nom\n    si n est egal a 0 :\n        texte "zéro"\n    sinon :\n        texte "autre"\n    bouton "Go"\n    quand l\'utilisateur clique sur "Go" :\n        tant que n est inferieur a 2 :\n            changer n par n+1\n        repeter 2 fois :\n            afficher "ok"\n        selon n :\n            cas 1 :\n                afficher "un"\n            sinon :\n                afficher "autre"\n',
  'événements, formulaires et blocs': 'page "a" :\n    section "Été" avec style "carte" :\n        ligne :\n            colonne :\n                grille :\n                    bloc avec fond vert :\n                        formulaire "contact" :\n                            champ "email" avec type email et obligatoire\n                            bouton "Envoyer"\n    quand le formulaire "contact" est soumis :\n        afficher "Reçu"\n',
  'composants, serveur, utiliser et CSS': 'utiliser composant "Carte" depuis "./composants/Carte"\nutiliser style "./theme.css"\nstyle :\n    .x { color: #fff; }\n\nserveur "boutique" :\n    donnee produit :\n        nom : texte\n    route "produits" :\n        tout le monde peut lire produit\n\ncomposant "Fiche" :\n    texte "Été"\n\npage "a" :\n    titre "Bonjour"\n',
  'fonctions, fiches et décimaux': 'fonction remise avec prix et taux :\n    rendre prix-taux*2,5\n\npage "a" :\n    variable livre=fiche avec nom "Été" et prix 2,5\n    calcul total=remise(livre.prix, 1,5)\n    texte "{livre.nom} : {total}"\n',
  'tests Humalis': 'test "Été" de page "accueil" :\n    cliquer sur "OK"\n    verifier que texte "Été" est visible\n',
};

it.each(Object.entries(familles))('formate %s sans changer l’arbre', (_famille, source) => {
  const resultat = formaterSource(source);
  expect(sansPositions(analyserSyntaxe(analyser(resultat)))).toEqual(sansPositions(analyserSyntaxe(analyser(source))));
  expect(formaterSource(resultat)).toBe(resultat);
});

it('garde commentaires, CSS, chaînes, accents et accolades intacts', () => {
  const source = '# commentaire  avec  espaces\nstyle :\n    .x { content: "{été}"; color: #fff; }\n\npage "été" :\n  # commentaire  indenté\n    texte "{nom} # été"    # commentaire  final\n';
  const resultat = formaterSource(source);
  expect(resultat).toContain('# commentaire  avec  espaces');
  expect(resultat).toContain('  # commentaire  indenté');
  expect(resultat).toContain('    .x { content: "{été}"; color: #fff; }');
  expect(resultat).toContain('"{nom} # été"    # commentaire  final');
});

it('écrit toujours les décimaux avec une virgule, sans séparer leurs chiffres', () => {
  expect(formaterSource('page "a" :\n    variable prix=2.5\n')).toContain('prix = 2,5');
  expect(formaterSource('page "a" :\n    variable prix=2,5\n')).toContain('prix = 2,5');
});

it('la CLI refuse un fichier invalide sans toucher à ses octets', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'humalis-formatage-'));
  try {
    const fichier = join(dossier, 'invalide.humalis');
    const source = Buffer.from('page :\n# commentaire avec é et {accolades}\n');
    writeFileSync(fichier, source);
    const construction = spawnSync('npm', ['run', 'build'], { encoding: 'utf8' });
    expect(construction.status).toBe(0);
    const resultat = spawnSync(process.execPath, ['dist/cli.js', 'formater', fichier], { encoding: 'utf8' });
    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toContain('Erreur');
    expect(readFileSync(fichier)).toEqual(source);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

it('conserve l’arbre et reste idempotent', () => {
  const source = 'page "accueil" :\n    titre "Bienvenue"\n';
  const resultat = formaterSource(source);
  expect(formaterSource(resultat)).toBe(resultat);
});

it('refuse une source invalide', () => {
  expect(() => formaterSource('page :\n')).toThrow();
});

it('normalise les opérateurs et séparateurs sans toucher aux chaînes', () => {
  const source = 'page "accueil" :\n    variable total=2+3\n    texte "a+b, c"\n';
  const resultat = formaterSource(source);
  expect(resultat).toContain('variable total = 2 + 3');
  expect(resultat).toContain('"a+b, c"');
  expect(formaterSource(resultat)).toBe(resultat);
});

it('préserve le CSS brut et les commentaires', () => {
  const source = 'style :\n    h1 { color:red; }\n\npage "accueil" :\n    titre "A"\n';
  expect(formaterSource(source)).toContain('    h1 { color:red; }');
});
