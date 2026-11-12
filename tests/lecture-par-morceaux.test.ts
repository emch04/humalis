import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { genererProjetAndroid } from '../src/cibles/android/projet.js';
import { genererProjetWindows } from '../src/cibles/windows/projet.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import type { Action } from '../src/ri/types.js';

/**
 * La lecture d'une liste par morceaux (phrases validées par le mainteneur le 12 novembre 2026) :
 *
 *     envoyer requete vers "produits" par 20 dans produits
 *     charger la suite de produits
 *     … tant que produits a une suite …
 *
 * Le serveur découpe déjà les listes (« ?limite=20&depuis=40 »), après le filtre des droits. La page
 * demande une fiche de plus que le morceau : sa présence dit qu'il y a une suite, et elle n'est pas gardée.
 */
const SERVEUR = ['serveur "boutique" :', '    donnee produit :', '        nom : texte', '        prix : nombre', '    route "produits" :', '        tout le monde peut lire produit', '        admin peut creer produit', '        admin peut modifier produit', '        admin peut supprimer produit', ''];
const PAGE = [
  'page "accueil" :',
  '    variable produits = []',
  '    titre "Produits"',
  '    section avec nom "liste" :',
  '        pour chaque p dans produits :',
  '            texte p.nom',
  '    quand la page se charge :',
  '        envoyer requete vers "produits" par 20 dans produits',
  '    quand l\'utilisateur arrive en bas de "liste" tant que produits a une suite avec bouton "Voir plus" :',
  '        charger la suite de produits',
];
const source = (page: string[] = PAGE, serveur: string[] = SERVEUR) => [...serveur, ...page].join('\n') + '\n';
const erreurs = (texte: string) => compiler(texte).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);
const application = (texte = source()) => {
  const { application: a, diagnostics } = compiler(texte);
  expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
  return a!;
};
const options = { nom: 'essai', source: 'essai.humalis' };
const tout = (fichiers: Map<string, string>) => [...fichiers.values()].join('\n');
const aplatir = (actions: Action[]): Action[] => actions.flatMap((a) => [a, ...Object.values(a).flatMap((v) => (Array.isArray(v) && v.every((x) => x && typeof x === 'object' && 'type' in x) ? aplatir(v as Action[]) : []))]);
const requetes = (texte = source()) =>
  application(texte)
    .ecrans[0]!.gestionnaires.flatMap((g) => aplatir(g.actions))
    .filter((a): a is Extract<Action, { type: 'requete' }> => a.type === 'requete');

describe('les phrases', () => {
  it('« par 20 » demande une fiche de plus que le morceau, et « charger la suite » repart d’où la liste s’arrête', () => {
    const [premiere, suite] = requetes();
    expect(premiere).toMatchObject({ adresse: '/api/produits', mode: 'lire', resultat: 'produits' });
    expect(premiere!.source).toBeUndefined();
    expect(premiere!.filtrant).toEqual([{ cle: 'limite', valeur: { type: 'nombre', valeur: 21 } }]);
    expect(suite).toMatchObject({ adresse: '/api/produits', mode: 'lire', resultat: 'hd_morceau_produits' });
    expect(suite!.filtrant!.map((f) => f.cle)).toEqual(['limite', 'depuis']);
    expect(suite!.filtrant![0]!.valeur).toEqual({ type: 'nombre', valeur: 21 });
    expect(suite!.filtrant![1]!.valeur).toMatchObject({ type: 'variable', nom: 'hd_depuis_produits' });
  });

  it('la page de l’exemple ne reçoit aucun avertissement : le bas atteint fait bien grandir la liste, et la suite finit par s’arrêter', () => {
    expect(compiler(source()).diagnostics.map((d) => d.message)).toEqual([]);
    // Dans un « essayer » écrit à la main aussi : ce qu'il contient compte.
    const page = [...PAGE.slice(0, -1), '        essayer :', '            charger la suite de produits', '        si erreur :', '            afficher erreur "Pas de réseau"'];
    expect(compiler(source(page)).diagnostics.map((d) => d.message)).toEqual([]);
  });

  it('la page garde ce qu’il lui faut : le témoin de la suite, le morceau reçu, le point de départ', () => {
    const etat = application().ecrans[0]!.etat;
    expect(etat.map((e) => e.nom).sort()).toEqual(['hd_charge_produits', 'hd_depuis_produits', 'hd_morceau_produits', 'hd_suite_produits', 'produits']);
    expect(etat.find((e) => e.nom === 'hd_suite_produits')!.type).toEqual({ genre: 'booleen' });
    expect(etat.find((e) => e.nom === 'hd_morceau_produits')!.type).toEqual({ genre: 'liste', de: { genre: 'donnee', nom: 'produit' } });
    expect(etat.find((e) => e.nom === 'produits')!.type).toEqual({ genre: 'liste', de: { genre: 'donnee', nom: 'produit' } });
  });

  it('après la première lecture : la fiche de trop dit qu’il y a une suite, puis elle est retirée', () => {
    const chargement = application().ecrans[0]!.gestionnaires.find((g) => g.declencheur === 'chargement')!.actions;
    expect(chargement.map((a) => a.type)).toEqual(['requete', 'affectation', 'affectation']);
    expect(chargement[1]).toMatchObject({ type: 'affectation', nom: 'hd_suite_produits' });
    expect(chargement[2]).toMatchObject({ type: 'affectation', nom: 'produits' });
    expect(JSON.stringify(chargement[2])).toContain('"nombre":{"type":"nombre","valeur":20}');
  });

  it('une seule suite à la fois, et elle ne s’ajoute que si la liste a gardé sa longueur : rien n’est ajouté deux fois', () => {
    const bas = application().ecrans[0]!.gestionnaires.find((g) => g.declencheur !== 'chargement')!.actions;
    // Un second clic pendant la lecture ne demande rien.
    expect(bas.map((a) => a.type)).toEqual(['si']);
    expect(JSON.stringify((bas[0] as Extract<Action, { type: 'si' }>).test)).toContain('hd_charge_produits');
    const dedans = (bas[0] as Extract<Action, { type: 'si' }>).alors;
    expect(dedans.map((a) => a.type)).toEqual(['affectation', 'affectation', 'essayer', 'affectation']);
    expect(dedans[0]).toMatchObject({ nom: 'hd_charge_produits' });
    expect(dedans[1]).toMatchObject({ nom: 'hd_depuis_produits' });
    // Réussie ou ratée, la lecture rend la main : la suite se redemande.
    expect(dedans[3]).toMatchObject({ nom: 'hd_charge_produits' });
    // Une lecture ratée arrête là (« essayer ») : rien n'est ajouté, et la raison s'affiche.
    const essai = dedans[2] as Extract<Action, { type: 'essayer' }>;
    expect(essai.corps.map((a) => a.type)).toEqual(['requete', 'si']);
    const ajout = aplatir([essai.corps[1]!]);
    expect(ajout.map((a) => a.type)).toContain('ajout');
    expect(ajout.find((a) => a.type === 'affectation')).toMatchObject({ nom: 'hd_suite_produits' });
    expect(JSON.stringify(essai.corps[1])).toContain('"nombre":{"type":"nombre","valeur":20}');
    expect(JSON.stringify(essai.corps[1])).not.toContain('987654321');
  });

  it('« produits a une suite » et « produits n’a pas de suite » se lisent partout où une condition se lit', () => {
    const page = [...PAGE, '    si produits a une suite :', '        texte "Il en reste"', '    si produits n\'a pas de suite :', '        texte "Tout est là"', '    si produits a une suite et produits n\'est pas vide :', '        texte "Encore"', '    toutes les 30 secondes tant que produits a une suite :', '        charger la suite de produits'];
    expect(erreurs(source(page))).toEqual([]);
  });

  it('« charger la suite » peut être écrit avant la lecture, plus haut dans la page', () => {
    const page = ['page "accueil" :', '    variable produits = []', '    bouton "Encore"', '    quand l\'utilisateur clique sur "Encore" :', '        charger la suite de produits', '    quand la page se charge :', '        envoyer requete vers "produits" par 5 dans produits'];
    const [suite, premiere] = requetes(source(page));
    expect(suite!.filtrant![0]!.valeur).toEqual({ type: 'nombre', valeur: 6 });
    expect(premiere!.filtrant![0]!.valeur).toEqual({ type: 'nombre', valeur: 6 });
  });

  it('dans un « essayer » écrit à la main, dans une boucle ou une condition : la phrase se déplie de même', () => {
    const page = [...PAGE, '    bouton "Encore"', '    quand l\'utilisateur clique sur "Encore" :', '        essayer :', '            charger la suite de produits', '            afficher reussite "Chargé"', '        si erreur :', '            afficher erreur "Pas de réseau"', '        si produits a une suite :', '            charger la suite de produits'];
    const texte = source(page);
    expect(erreurs(texte)).toEqual([]);
    for (const cible of [genererProjetApple, genererProjetAndroid, genererProjetWindows]) expect(cible(application(texte), options).diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(() => [genererProjetMoteur, genererProjetStatique, genererProjetWeb].map((cible) => cible(application(texte), options))).not.toThrow();
  });

  it('relire le premier morceau (après une recherche, un tri) remet la suite à zéro : la même phrase, dans un événement', () => {
    const page = [...PAGE, '    bouton "Revenir au début"', '    quand l\'utilisateur clique sur "Revenir au début" :', '        envoyer requete vers "produits" par 20 dans produits'];
    expect(erreurs(source(page))).toEqual([]);
  });
});

describe('ce qui est refusé, avec la phrase à écrire', () => {
  const avec = (...lignes: string[]) => source(['page "accueil" :', '    variable produits = []', '    variable choix = "a"', '    titre "Produits"', '    bouton "Encore"', ...lignes]);
  const auChargement = (ligne: string) => avec('    quand la page se charge :', `        ${ligne}`);

  it('un morceau va de 1 à 500 fiches, en nombre entier', () => {
    for (const taille of ['0', '501', '2,5']) expect(erreurs(auChargement(`envoyer requete vers "produits" par ${taille} dans produits`))[0]).toMatch(/de 1 à 500/);
  });

  it('il faut dire où ranger la liste', () => {
    expect(erreurs(auChargement('envoyer requete vers "produits" par 20'))[0]).toMatch(/« dans »/);
  });

  it('« par 20 » lit : pas d’envoi, pas d’identifiant, pas « en direct », pas « hors ligne »', () => {
    expect(erreurs(auChargement('envoyer requete vers "produits" par 20 avec choix dans produits'))[0]).toMatch(/par morceaux/);
    expect(erreurs(auChargement('envoyer requete vers "produits" par 20 dans produits en direct'))[0]).toMatch(/en direct/);
  });

  it('une source se lit page par page avec ses propres paramètres : « filtrant par »', () => {
    const texte = ['source "catalogue" :', '    adresse "https://api.exemple.fr"', '    donnee produit :', '        nom : texte', '    route "produits" :', '        tout le monde peut lire une liste de produit', '', 'page "accueil" :', '    variable produits = []', '    titre "Produits"', '    quand la page se charge :', '        envoyer requete vers "produits" de la source "catalogue" par 20 dans produits', ''].join('\n');
    expect(erreurs(texte)[0]).toMatch(/filtrant par/);
  });

  it('sans serveur dans le fichier, ou vers une route qui n’existe pas', () => {
    const sans = source(['page "accueil" :', '    variable produits = []', '    titre "Produits"', '    quand la page se charge :', '        envoyer requete vers "/produits" par 20 dans produits'], []);
    expect(erreurs(sans)[0]).toMatch(/route du serveur de ce fichier/);
    expect(erreurs(auChargement('envoyer requete vers "articles" par 20 dans produits')).length).toBeGreaterThan(0);
  });

  it('« charger la suite » et « a une suite » demandent une liste lue par morceaux dans la même page', () => {
    expect(erreurs(avec('    quand l\'utilisateur clique sur "Encore" :', '        charger la suite de produits'))[0]).toMatch(/envoyer requete vers "…" par 20 dans produits/);
    expect(erreurs(avec('    si produits a une suite :', '        texte "Encore"'))[0]).toMatch(/envoyer requete vers "…" par 20 dans produits/);
    expect(erreurs(avec('    quand la page se charge :', '        envoyer requete vers "produits" dans produits', '    quand l\'utilisateur clique sur "Encore" :', '        charger la suite de produits'))[0]).toMatch(/par 20/);
  });

  it('une même liste ne se lit pas par morceaux de deux façons dans une page', () => {
    const texte = avec('    quand la page se charge :', '        envoyer requete vers "produits" par 20 dans produits', '    quand l\'utilisateur clique sur "Encore" :', '        envoyer requete vers "produits" par 50 dans produits', '        charger la suite de produits');
    expect(erreurs(texte)[0]).toMatch(/deux façons/);
  });

  it('« charger la suite de » sans nom de liste', () => {
    expect(erreurs(avec('    quand l\'utilisateur clique sur "Encore" :', '        charger la suite'))[0]).toMatch(/charger la suite de produits/);
  });
});

describe('chaque cible demande le morceau au serveur', () => {
  it('web : l’adresse porte « limite » et « depuis »', () => {
    const page = tout(genererProjetMoteur(application(), options));
    expect(page).toContain('`/api/produits?limite=${encodeURIComponent(21)}`');
    expect(page).toMatch(/`\/api\/produits\?limite=\$\{encodeURIComponent\(21\)\}&depuis=\$\{encodeURIComponent\([^)]*hdDepuisProduits[^)]*\)\}`/);
  });

  it('site statique et web d’origine : de même', () => {
    for (const fichiers of [genererProjetStatique(application(), options), genererProjetWeb(application(), options)]) {
      const texte = tout(fichiers);
      expect(texte).toContain('`/api/produits?limite=${encodeURIComponent(21)}`');
      expect(texte).toMatch(/`\/api\/produits\?limite=\$\{encodeURIComponent\(21\)\}&depuis=\$\{encodeURIComponent\([^)]*hdDepuisProduits[^)]*\)\}`/);
    }
  });

  it('Apple, Android et Windows : les paramètres passent par les filtres de la lecture', () => {
    const apple = genererProjetApple(application(), options);
    expect(apple.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    // Un nombre part écrit pour une machine : « 1000 », jamais « 1 000 » (la mise en forme d'un nombre affiché).
    expect(tout(apple.fichiers)).toContain('filtres: [("limite", parametreDe(21)), ("depuis", parametreDe(hdDepuisProduits))]');
    const android = genererProjetAndroid(application(), options);
    expect(android.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(tout(android.fichiers)).toContain('filtres = listOf("limite" to parametre(21.0), "depuis" to parametre(hdDepuisProduits))');
    const windows = genererProjetWindows(application(), options);
    expect(windows.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(tout(windows.fichiers)).toMatch(/filtres: new \(string, object\?\)\[\] \{ \("limite", [^\n]*\), \("depuis", [^\n]*HdDepuisProduits/i);
    expect(tout(windows.fichiers)).toContain('nombre.ToString("0.###############", System.Globalization.CultureInfo.InvariantCulture)');
  });

  it('la page ne garde pas la réponse d’un morceau comme valeur de départ de la liste', () => {
    const page = tout(genererProjetMoteur(application(), options));
    expect(page).not.toContain("lectureGardee('/api/produits'");
  });
});

describe('le serveur', () => {
  it('rend les fiches dans un ordre qui ne bouge pas : deux fiches créées au même instant ne changent pas de place d’un morceau à l’autre', () => {
    const serveur = tout(genererProjetServeur(application().serveurs[0]!, options));
    expect(serveur).toContain("' ORDER BY cree_le, id'");
  });
});
