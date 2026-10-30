import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { programme } from '../analyse/aide.js';
import { p, corps, web, statique, mobile, fichier, erreurs, avertissements } from './aide.js';

const CATALOGUE = programme(
  'page "catalogue" :',
  '>variable resultats = []',
  '>variable lettres = 0',
  '>titre "Catalogue"',
  '>champ "recherche" avec indice "Chercher une robe"',
  '>quand l\'utilisateur ecrit dans "recherche" :',
  '>>changer lettres par lettres + 1',
  '>quand l\'utilisateur arrete d\'ecrire dans "recherche" apres 500 millisecondes :',
  '>>envoyer requete vers "/produits" avec le champ "recherche" dans resultats',
  '>calcul trouves = nombre de resultats',
  '>texte "{lettres} lettres, {trouves} résultats" avec annonce',
);

describe('recherche pendant la frappe — le parser', () => {
  it('lit les deux événements, la pause et l’option annonce', () => {
    const instructions = corps(CATALOGUE) as any[];
    const [ecrit, arrete] = instructions.filter((i) => i.type === 'Evenement');
    expect(ecrit).toMatchObject({ genre: 'saisie', cible: 'recherche' });
    expect(arrete).toMatchObject({ genre: 'pauseSaisie', cible: 'recherche' });
    expect(arrete.duree.unite).toBe('milliseconde');
    expect(instructions.find((i) => i.type === 'Element' && i.element === 'texte').annonce).toBe(true);
  });
});

describe('recherche pendant la frappe — l’analyse', () => {
  it('accepte l’exemple', () => {
    expect(erreurs(CATALOGUE)).toEqual([]);
    expect(avertissements(CATALOGUE)).toEqual([]);
  });
  it('refuse un champ inconnu, une case à cocher, une pause hors bornes', () => {
    expect(erreurs(p('>champ "nom"', '>quand l\'utilisateur ecrit dans "prenom" :', '>>afficher "a"'))[0]).toMatch(/aucun champ « prenom » dans la page « p »\. Champs : nom/);
    expect(erreurs(p('>case a cocher "Accepter"', '>quand l\'utilisateur ecrit dans "Accepter" :', '>>afficher "a"'))[0]).toMatch(/on ne tape pas dans « Accepter »/);
    expect(erreurs(p('>champ "nom"', '>quand l\'utilisateur arrete d\'ecrire dans "nom" apres 10 secondes :', '>>afficher "a"'))[0]).toMatch(/de 100 millisecondes à 5 secondes/);
  });
  it('avertit d’une requête à chaque touche', () => {
    expect(avertissements(p('>variable r = []', '>champ "nom"', '>quand l\'utilisateur ecrit dans "nom" :', '>>envoyer requete vers "/r" dans r'))[0]).toMatch(/une requête à chaque touche/);
  });
  it('refuse l’événement d’un champ placé dans une boucle', () => {
    const source = p('>variable l = [1, 2]', '>pour chaque x dans l :', '>>champ "nom"', '>>quand l\'utilisateur ecrit dans "nom" :', '>>>afficher "a"');
    expect(erreurs(source)[0]).toMatch(/suit un seul champ/);
  });
});

describe('recherche pendant la frappe — la RI', () => {
  it('donne les déclencheurs « saisie » et « pauseSaisie », la pause en millisecondes, l’annonce', () => {
    const ecran = compiler(CATALOGUE).application!.ecrans[0];
    expect(ecran.gestionnaires.map((g) => [g.declencheur, g.millisecondes])).toEqual([['saisie', undefined], ['pauseSaisie', 500]]);
    expect(JSON.stringify(ecran.vue)).toContain('"annonce":true');
    // Sans durée : 300 millisecondes.
    const defaut = compiler(p('>champ "nom"', '>quand l\'utilisateur arrete d\'ecrire dans "nom" :', '>>afficher "a"')).application!.ecrans[0];
    expect(defaut.gestionnaires[0].millisecondes).toBe(300);
  });
});

describe('recherche pendant la frappe — les cibles', () => {
  it('web : un effet sur la valeur, Entrée sans attendre, la dernière requête gagne, la région vivante', () => {
    const fichiers = web(CATALOGUE);
    const page = fichier(fichiers, 'pages/Catalogue.tsx');
    expect(page).toContain('useQuandChange(champRecherche, () => {');
    expect(page).toContain('const pauseRecherche = useQuandPause(champRecherche, 500, async () => {');
    expect(page).toContain('onKeyDown={pauseRecherche.entree}');
    expect(page).toContain("const derniere1 = derniereRequete('resultats');");
    expect(page).toContain('if (!derniere1()) return;');
    expect(page).toContain('resultatsMaj = reponse1;');
    expect(page).toContain('setResultats(resultatsMaj);');
    expect(page).toContain('const derniereRequete = useDerniere();');
    expect(page).toMatch(/<p data-humalis="[^"]+" aria-live="polite" aria-atomic="true">/);
    expect(fichier(fichiers, 'humalis/temps.ts')).toContain('export function useDerniere()');
  });
  it('mobile : le même effet ; la touche du clavier envoie tout de suite ; région vivante polie', () => {
    const page = fichier(mobile(CATALOGUE), 'app/index.tsx');
    expect(page).toContain('const pauseRecherche = useQuandPause(champRecherche, 500, async () => {');
    expect(page).toContain('onSubmitEditing={pauseRecherche.entree}');
    expect(page).toContain('accessibilityLiveRegion="polite"');
  });
  it('statique : les écouteurs de frappe et de pause, la région vivante dans le HTML de départ', () => {
    const fichiers = statique(CATALOGUE);
    const page = fichier(fichiers, 'pages/catalogue.js');
    expect(page).toContain('onfrappe: quandEcritRecherche');
    expect(page).toContain('onpause: { faire: quandArreteDEcrireRecherche, millisecondes: 500 }');
    expect(page).toContain("const derniere1 = derniereRequete('resultats');");
    expect(fichier(fichiers, 'humalis/humalis.js')).toContain('function ecouterLaPause(element, { faire, millisecondes })');
    expect(fichier(fichiers, 'index.html')).toMatch(/<p data-humalis="[^"]+" aria-live="polite" aria-atomic="true">0 lettres/);
  });
});
