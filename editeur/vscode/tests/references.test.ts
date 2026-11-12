import { describe, it, expect } from 'vitest';
import { nomRefuse, preparerRenommage, renommer, usages } from '../src/langage/references.js';
import { col, indexDe } from './aide-langage.js';

/** Trouver les usages et renommer (revue du 12 novembre 2026, E2). */
const SOURCE = [
  'variable panier = [] avec partagee',          // 1
  '',
  'page "accueil" :',                             // 3
  '    variable nom = "Awa"',                     // 4
  '    calcul total = nombre de panier',          // 5
  '    titre "Bonjour {nom}"',                    // 6
  '    texte "{total} articles, {nom}"',          // 7
  '    lien "Voir le panier" vers "panier"',      // 8
  '    bouton "Ajouter"',                         // 9
  '    quand l\'utilisateur clique sur "Ajouter" :', // 10
  '        ajouter nom a panier',                 // 11
  '        rediriger vers "panier"',              // 12
  '',
  'page "panier" :',                              // 14
  '    titre "Panier"',                           // 15
  '    pour chaque nom dans panier :',            // 16
  '        texte nom',                            // 17
  '    lien "Retour" vers "accueil"',             // 18
  '',
].join('\n');
const index = indexDe(SOURCE);
const places = (ligne: number, mot: string, occurrence = 1) => [ligne, col(SOURCE, ligne, mot, 0, occurrence)] as const;
const lieux = (ligne: number, mot: string, occurrence = 1) => usages(index, ...places(ligne, mot, occurrence))!.lieux.map((l) => [l.ligne, l.colonne]);

describe('trouver les usages', () => {
  it('une variable de page : sa déclaration, ses lectures, et ses {nom} dans les textes', () => {
    expect(lieux(4, 'nom')).toEqual([
      [4, col(SOURCE, 4, 'nom')],
      [6, col(SOURCE, 6, 'nom')],
      [7, col(SOURCE, 7, 'nom')],
      [11, col(SOURCE, 11, 'nom')],
    ]);
  });

  it('deux variables du même nom dans deux pages ne se mélangent pas', () => {
    expect(lieux(17, 'nom')).toEqual([
      [16, col(SOURCE, 16, 'nom')],
      [17, col(SOURCE, 17, 'nom')],
    ]);
  });

  it('une variable partagée se retrouve dans toutes les pages', () => {
    expect(lieux(1, 'panier').map(([ligne]) => ligne)).toEqual([1, 5, 11, 16]);
  });

  it('une page : sa déclaration et chaque « vers "…" », sans les guillemets', () => {
    const trouves = usages(index, ...places(12, 'panier'))!;
    expect(trouves.symbole.genre).toBe('page');
    expect(trouves.lieux.map((l) => [l.ligne, l.colonne, l.fin - l.colonne])).toEqual([
      [8, col(SOURCE, 8, 'panier', 0, 2), 6],
      [12, col(SOURCE, 12, 'panier'), 6],
      [14, col(SOURCE, 14, 'panier'), 6],
    ]);
  });

  it('depuis un usage ou depuis la déclaration : la même liste ; sans la déclaration si on le demande', () => {
    expect(lieux(7, 'nom')).toEqual(lieux(4, 'nom'));
    expect(usages(index, ...places(4, 'nom'), { sansDeclaration: true })!.lieux.map((l) => l.ligne)).toEqual([6, 7, 11]);
  });

  it('rien sous un mot du langage', () => {
    expect(usages(index, ...places(15, 'titre'))).toBeUndefined();
    expect(usages(index, ...places(16, 'chaque'))).toBeUndefined();
  });
});

describe('renommer', () => {
  it('prépare le renommage du nom sous le curseur', () => {
    const pret = preparerRenommage(index, ...places(6, 'nom'));
    expect(pret).toMatchObject({ symbole: { nom: 'nom', genre: 'variable' }, lieu: { ligne: 6, colonne: col(SOURCE, 6, 'nom'), fin: col(SOURCE, 6, 'nom') + 3 } });
  });

  it('rend chaque endroit à réécrire, et le programme renommé se compile', async () => {
    const resultat = renommer(index, ...places(4, 'nom'), 'prenom');
    expect('lieux' in resultat && resultat.lieux.map((l) => l.ligne)).toEqual([4, 6, 7, 11]);
    const lignes = SOURCE.split('\n');
    for (const l of [...('lieux' in resultat ? resultat.lieux : [])].sort((a, b) => b.ligne - a.ligne || b.colonne - a.colonne)) {
      lignes[l.ligne - 1] = lignes[l.ligne - 1]!.slice(0, l.colonne - 1) + 'prenom' + lignes[l.ligne - 1]!.slice(l.fin - 1);
    }
    const { compiler } = await import('../../../src/compilateur.js');
    const renomme = lignes.join('\n');
    expect(compiler(renomme).diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(renomme).toContain('titre "Bonjour {prenom}"');
    // L'autre « nom », celui de la boucle du panier, n'a pas bougé.
    expect(renomme).toContain('pour chaque nom dans panier :');
  });

  it('une page se renomme avec tous ses liens', () => {
    const resultat = renommer(index, ...places(14, 'panier'), 'mon panier');
    expect('lieux' in resultat && resultat.lieux.map((l) => l.ligne)).toEqual([8, 12, 14]);
  });

  it('refuse un nom déjà pris, un mot réservé, un petit mot, un nom mal écrit, le même nom', () => {
    const refus = (nouveau: string) => (renommer(index, ...places(4, 'nom'), nouveau) as { refus?: string }).refus;
    expect(refus('total')).toMatch(/existe déjà/);
    expect(refus('page')).toMatch(/mot réservé/);
    expect(refus('de')).toMatch(/petit mot/);
    expect(refus('mon nom')).toMatch(/sans espace/);
    expect(refus('2nom')).toMatch(/ne commence pas par un chiffre/);
    expect(refus('nom')).toMatch(/déjà son nom/);
    expect(nomRefuse(index, usages(index, ...places(14, 'panier'))!.symbole, 'accueil')).toMatch(/existe déjà/);
  });

  it('ce qui engage les données ne se renomme pas ici : la raison est dite', () => {
    const serveur = ['serveur "b" :', '    donnee produit :', '        nom : texte', '    route "produits" :', '        tout le monde peut lire produit', '', 'page "a" :', '    variable liste = []', '    titre "A"', '    quand la page se charge :', '        envoyer requete vers "produits" dans liste', '    pour chaque p dans liste :', '        texte p.nom', ''].join('\n');
    const i = indexDe(serveur);
    expect(preparerRenommage(i, 13, col(serveur, 13, 'nom'))).toMatchObject({ refus: expect.stringMatching(/avant "ancien nom"/) });
    expect(preparerRenommage(i, 11, col(serveur, 11, 'produits'))).toMatchObject({ refus: expect.stringMatching(/adresse/) });
    expect(preparerRenommage(i, 9, col(serveur, 9, 'titre'))).toMatchObject({ refus: expect.stringMatching(/pas de nom à renommer/) });
  });
});

describe('dans un projet de plusieurs fichiers', () => {
  const PRINCIPAL = ['utiliser fichier "./pages/panier.humalis"', '', 'variable panier = [] avec partagee', '', 'page "accueil" :', '    titre "Accueil"', '    lien "Panier" vers "panier"', '    texte "{nombre de panier} articles"', ''].join('\n');
  const AUTRE = ['page "panier" :', '    titre "Panier"', '    pour chaque article dans panier :', '        texte article', '    lien "Retour" vers "accueil"', ''].join('\n');
  const projet = indexDe(PRINCIPAL, '/projet/app.humalis', { '/projet/pages/panier.humalis': AUTRE });

  it('les usages d’une variable partagée et d’une page sont trouvés dans les autres fichiers', () => {
    const variable = usages(projet, 3, col(PRINCIPAL, 3, 'panier'))!.lieux.map((l) => [l.fichier, l.ligne]);
    expect(variable).toEqual([['/projet/app.humalis', 3], ['/projet/app.humalis', 8], ['/projet/pages/panier.humalis', 3]]);
    const page = usages(projet, 7, col(PRINCIPAL, 7, 'panier', 0, 1))!;
    expect(page.symbole.genre).toBe('page');
    expect(page.lieux.map((l) => [l.fichier, l.ligne])).toEqual([['/projet/app.humalis', 7], ['/projet/pages/panier.humalis', 1]]);
  });

  it('le renommage réécrit chaque fichier', () => {
    const resultat = renommer(projet, 3, col(PRINCIPAL, 3, 'panier'), 'achats');
    expect('lieux' in resultat && new Set(resultat.lieux.map((l) => l.fichier)).size).toBe(2);
  });
});
