import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { prevenirDesTuiles } from '../src/analyse/carte.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const p = (...lignes: string[]) => programme('page "p" :', ...lignes);
const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;

const POSITION = p('>carte "Le restaurant Le Fleuve, avenue de la Gombe" avec latitude -4,3250 et longitude 15,3222 et zoom 15');
const MARQUEURS = p(
  '>variable agences = [fiche avec nom "Gombe" et adresse "12 avenue du Port" et latitude -4,3047 et longitude 15,3070, fiche avec nom "Limete" et adresse "5 avenue des Poids Lourds" et latitude -4,3353 et longitude 15,3446]',
  '>carte "Nos deux agences à Kinshasa" :',
  '>>pour chaque agence dans agences :',
  '>>>marqueur agence.nom avec adresse agence.adresse et latitude agence.latitude et longitude agence.longitude',
  '>>marqueur "Entrepôt" avec latitude -4,3902 et longitude 15,2611',
);

describe('carte — le parser', () => {
  it('lit une position : décimaux négatifs, zoom', () => {
    const [carte] = corps(POSITION) as any[];
    expect(carte.type).toBe('Bloc');
    expect(carte.genre).toBe('carte');
    expect(carte.carte.latitude).toMatchObject({ type: 'Nombre', valeur: -4.325 });
    expect(carte.carte.longitude).toMatchObject({ type: 'Nombre', valeur: 15.3222 });
    expect(carte.carte.zoom).toMatchObject({ type: 'Nombre', valeur: 15 });
    expect(carte.corps).toEqual([]);
  });
  it('lit des marqueurs, dans un « pour chaque » aussi', () => {
    const [, carte] = corps(MARQUEURS) as any[];
    expect(carte.genre).toBe('carte');
    expect(carte.corps[0].type).toBe('Boucle');
    expect(carte.corps[0].corps[0]).toMatchObject({ type: 'Element', element: 'marqueur' });
    expect(carte.corps[0].corps[0].lieu.adresse.type).toBe('AccesChamp');
    expect(carte.corps[1].lieu.latitude).toMatchObject({ valeur: -4.3902 });
  });
  it('lit les tuiles et leur attribution', () => {
    const [carte] = corps(p('>carte "Plan" avec latitude 1 et longitude 2 et tuiles "https://t.exemple.cd/{z}/{x}/{y}.png" et attribution "© Exemple"')) as any[];
    expect(carte.carte.tuiles).toBe('https://t.exemple.cd/{z}/{x}/{y}.png');
    expect(carte.carte.attribution).toBe('© Exemple');
  });
  it('« carte », « marqueur », « latitude » et « zoom » restent des noms ailleurs', () => {
    expect(erreurs(p('>variable carte = 3', '>variable marqueur = 1', '>variable latitude = 2', '>variable zoom = 4', '>texte "{carte} {marqueur} {latitude} {zoom}"'))).toEqual([]);
  });
  it('refuse un réglage inconnu', () => {
    expect(() => corps(p('>carte "Plan" avec couleurs 3 :', '>>marqueur "a" avec latitude 1 et longitude 2'))).toThrow('ne se règle pas sur une carte');
    expect(() => corps(p('>carte "Plan" :', '>>marqueur "a" avec rayon 3'))).toThrow('ne se règle pas sur un marqueur');
  });
  it('refuse une valeur manquante', () => {
    expect(() => corps(p('>carte "Plan" avec latitude'))).toThrow('il manque la valeur après « latitude »');
  });
});

describe('carte — l’analyse (décision M14)', () => {
  it('les deux formes passent sans erreur', () => {
    expect(erreurs(POSITION)).toEqual([]);
    expect(erreurs(MARQUEURS)).toEqual([]);
  });
  it('la latitude seule est refusée', () => {
    expect(erreurs(p('>carte "Plan" avec latitude -4,3'))[0]).toContain('latitude et longitude ensemble : il manque la longitude');
    expect(erreurs(p('>carte "Plan" avec longitude 15,3'))[0]).toContain('il manque la latitude');
  });
  it('les bornes sont vérifiées', () => {
    expect(erreurs(p('>carte "Plan" avec latitude 95 et longitude 15'))).toEqual(['2 : la latitude 95 est hors des bornes : elle va de -90 à 90.']);
    expect(erreurs(p('>carte "Plan" avec latitude 5 et longitude -181,5'))[0]).toContain('la longitude -181,5 est hors des bornes');
    expect(erreurs(p('>carte "Plan" avec latitude 5 et longitude 5 et zoom 19'))[0]).toContain('le zoom 19 est hors des bornes');
    expect(erreurs(p('>carte "Plan" avec latitude 5 et longitude 5 et zoom 2,5'))[0]).toContain('nombre entier');
    expect(erreurs(p('>carte "Plan" :', '>>marqueur "a" avec latitude 91 et longitude 5'))[0]).toContain('la latitude 91 est hors des bornes');
  });
  it('un texte n’est pas une coordonnée', () => {
    expect(erreurs(p('>carte "Plan" avec latitude "nord" et longitude 5'))[0]).toContain('la latitude est un nombre');
  });
  it('un marqueur hors d’une carte est refusé', () => {
    expect(erreurs(p('>marqueur "Gombe" avec latitude -4,3 et longitude 15,3'))[0]).toContain('un marqueur se place dans une carte');
  });
  it('un marqueur a un nom et une position complète', () => {
    expect(erreurs(p('>carte "Plan" :', '>>marqueur "" avec latitude 1 et longitude 2'))[0]).toContain('le nom du marqueur est vide');
    expect(erreurs(p('>carte "Plan" :', '>>marqueur "a" avec latitude 1'))[0]).toContain('il manque sa longitude');
    expect(erreurs(p('>carte "Plan" :', '>>marqueur "a"'))[0]).toContain('il manque sa latitude et sa longitude');
  });
  it('le nom de la carte n’est pas vide', () => {
    expect(erreurs(p('>carte "" avec latitude 1 et longitude 2'))[0]).toContain('le nom de la carte est vide');
  });
  it('une carte vide est refusée', () => {
    expect(erreurs(p('>carte "Plan" :', '>>si 1 est egal a 1 :', '>>>marqueur "a" avec latitude 1 et longitude 2'))).toEqual([]);
    expect(erreurs(p('>carte "Plan"'))[0]).toContain('une carte sans position ni marqueur n’affiche rien');
  });
  it('une carte ne contient que des marqueurs', () => {
    expect(erreurs(p('>carte "Plan" avec latitude 1 et longitude 2 :', '>>texte "bonjour"'))[0]).toContain('une carte ne contient que des marqueurs');
  });
  it('les tuiles : https, {z} {x} {y}, et l’attribution qui va avec', () => {
    expect(erreurs(p('>carte "Plan" avec latitude 1 et longitude 2 et tuiles "https://t.exemple.cd/{z}/{x}/{y}.png"'))[0]).toContain('demandent son attribution');
    expect(erreurs(p('>carte "Plan" avec latitude 1 et longitude 2 et tuiles "http://t.exemple.cd/tuile.png" et attribution "© E"'))[0]).toContain('commence par https:// et contient {z}, {x} et {y}');
    expect(erreurs(p('>carte "Plan" avec latitude 1 et longitude 2 et attribution "© E"'))[0]).toContain('l’attribution accompagne des tuiles');
    expect(erreurs(p('>carte "Plan" avec latitude 1 et longitude 2 et tuiles "https://t.exemple.cd/{z}/{x}/{y}.png" et attribution "© E"'))).toEqual([]);
  });
  it('l’analyse ne dit rien du fournisseur : la commande le dit, une fois, à la compilation', () => {
    expect(avertissements(POSITION)).toEqual([]);
  });
  it('plus de 200 marqueurs écrits : avertissement', () => {
    const lignes = Array.from({ length: 201 }, (_, i) => `>>marqueur "m${i}" avec latitude 1 et longitude 2`);
    expect(avertissements(p('>carte "Beaucoup" :', ...lignes))[0]).toContain('201 marqueurs écrits');
  });
  it('les variables du nom et des coordonnées sont vérifiées', () => {
    expect(erreurs(p('>carte "Plan {inconnue}" avec latitude 1 et longitude 2'))[0]).toContain('inconnue');
    expect(erreurs(p('>carte "Plan" :', '>>marqueur "a" avec latitude absente et longitude 2'))[0]).toContain('absente');
  });
});

describe('carte — la confidentialité des tuiles (décision M14)', () => {
  const prevenir = (source: string) => prevenirDesTuiles(compiler(source).application!).map((d) => `${d.ligne} : ${d.message}`);
  it('dit une fois, pour tout le programme, que les tuiles viennent d’OpenStreetMap et reçoivent l’adresse IP', () => {
    const deux = programme('page "a" :', '    carte "Un" avec latitude 1 et longitude 2', 'page "b" :', '    carte "Deux" avec latitude 3 et longitude 4');
    const messages = prevenir(deux);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('2 : cette carte appelle un fournisseur de tuiles (tile.openstreetmap.org, OpenStreetMap)');
    expect(messages[0]).toContain('l’adresse IP de chaque visiteur lui est envoyée avec chaque tuile demandée');
  });
  it('nomme le fournisseur choisi', () => {
    const messages = prevenir(p('>carte "Plan" avec latitude 1 et longitude 2 et tuiles "https://t.exemple.cd/{z}/{x}/{y}.png" et attribution "© E"'));
    expect(messages[0]).toContain('(t.exemple.cd)');
  });
  it('ne dit rien sans carte', () => {
    expect(prevenir(p('>texte "a"'))).toEqual([]);
  });
});

describe('carte — le formateur', () => {
  it('ne change pas l’arbre et reste identique en le repassant', async () => {
    const { formaterSource } = await import('../src/outils/formatage.js');
    const source = programme(
      'page "p" :',
      '>variable agences = [fiche avec nom "Gombe" et latitude -4,3047 et longitude 15,3070]',
      '>carte   "Nos agences"   avec   latitude -4,3250  et longitude 15,3222 et zoom 12 :',
      '>>pour chaque agence dans agences :',
      '>>>marqueur agence.nom   avec latitude agence.latitude et longitude agence.longitude',
      '>>marqueur "Entrepôt" avec adresse "5 avenue" et latitude -4,3902 et longitude 15,2611',
    );
    const une = formaterSource(source);
    expect(une).toContain('latitude -4,3250 et longitude 15,3222 et zoom 12');
    expect(une).toContain('marqueur "Entrepôt" avec adresse "5 avenue" et latitude -4,3902 et longitude 15,2611');
    expect(formaterSource(une)).toBe(une);
  });
});
