import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { web, statique, mobile, desktop, fichier, erreurs } from './interactions/aide.js';

const page = (...lignes: string[]) => ['page "P" :', '    titre "T"', ...lignes.map((l) => `    ${l}`)].join('\n');
const NOTES = 'variable notes = [fiche avec prix 1 et vu "o", fiche avec prix 60 et vu "n"]';
const code = (source: string) => fichier(web(source), 'pages/P.tsx');

describe('non', () => {
  it('retourne une valeur ou une comparaison', () => {
    const source = page('variable actif = faux', 'variable prix = 1', 'si non actif :', '    texte "a"', 'si non prix est egal a 0 :', '    texte "b"');
    expect(erreurs(source)).toEqual([]);
    expect(code(source)).toContain('!actif');
    expect(code(source)).toContain('prix !== 0');
  });
  it('se lit après « dont »', () => {
    const source = page('variable notes = [fiche avec ok vrai]', 'calcul v = notes dont non ok', 'texte "x"');
    expect(erreurs(source)).toEqual([]);
    expect(code(source)).toContain('element.ok === false');
  });
  it('ne change pas « oui » et « non » de confirmer', () => {
    const source = page('bouton "x"', 'quand l\'utilisateur clique sur "x" :', '    confirmer "Sûr ?" avec oui "Oui" et non "Non" :', '        afficher "ok"');
    expect(erreurs(source)).toEqual([]);
  });
});

describe('dont avec plusieurs conditions', () => {
  it('relie les conditions par et et ou', () => {
    const et = page(NOTES, 'calcul v = notes dont prix est inferieur a 50 et vu est egal a "o"', 'texte "x"');
    expect(erreurs(et)).toEqual([]);
    expect(code(et)).toContain("element.prix < 50 && element.vu === 'o'");
    const ou = page(NOTES, 'calcul v = notes dont prix est egal a 1 ou prix est egal a 60', 'texte "x"');
    expect(code(ou)).toContain('element.prix === 1 || element.prix === 60');
  });
  it('laisse à la fiche le « et » qui ne suit pas une comparaison', () => {
    const source = page(NOTES, 'variable lot = fiche avec choix (notes dont prix est egal a 1) et total 3', 'calcul resume = fiche avec choix notes dont prix est egal a 1 et total 3', 'texte "{resume.total}"');
    expect(erreurs(source)).toEqual([]);
  });
  it('marche aussi en statique', () => {
    const source = page(NOTES, 'calcul v = notes dont prix est inferieur a 50 et vu est egal a "o"', 'texte "{nombre de v}"');
    expect(fichier(statique(source), 'index.html')).toContain('>1</p>');
  });
});

describe('trier une liste filtrée', () => {
  it('accepte les parenthèses', () => {
    const source = page(NOTES, 'calcul v = trier (notes dont prix est inferieur a 50) par prix decroissant', 'texte "x"');
    expect(erreurs(source)).toEqual([]);
    expect(code(source)).toContain('notes.filter(');
  });
  it('« trier(x) » reste l’appel d’une fonction', () => {
    const source = ['fonction trier avec x :', '    rendre x', '', page('calcul v = trier(2)', 'texte "{v}"')].join('\n');
    expect(erreurs(source)).toEqual([]);
  });
});

describe('un calcul dans un texte', () => {
  it('lit le nombre et l’opération, au format français', () => {
    const source = page(NOTES, 'variable prix = 2', 'texte "{nombre de notes} notes, {prix * 2}, {prix * 3 en euros}"');
    expect(erreurs(source)).toEqual([]);
    const lu = code(source);
    expect(lu).toContain('formaterNombre(notes.length)');
    expect(lu).toContain('formaterNombre(prix * 2)');
    expect(lu).toContain("formaterArgent(prix * 3, 'EUR')");
  });
  it('lit le champ de la boucle', () => {
    const source = page(NOTES, 'pour chaque n dans notes :', '    texte "{n.prix * 2}"');
    expect(erreurs(source)).toEqual([]);
    expect(code(source)).toContain('formaterNombre(n.prix * 2)');
  });
  it('dit quelle variable manque', () => {
    expect(erreurs(page('texte "{nombre de rien_ici}"')).join()).toMatch(/rien_ici/);
  });
  it('statique : le HTML de départ et le script calculent pareil', () => {
    const fichiers = statique(page('variable prix = 2', 'texte "{prix * 2}"'));
    expect(fichier(fichiers, 'index.html')).toContain('>4</p>');
    expect(fichier(fichiers, 'pages/p.js')).toContain('prix * 2');
  });
  it('mobile et bureau', () => {
    const source = page('variable prix = 2', 'texte "{prix * 2}"');
    expect(fichier(mobile(source), 'app/index.tsx')).toContain('prix * 2');
    expect(fichier(desktop(source), 'pages/P.tsx')).toContain('prix * 2');
  });
});

describe('un calcul partagé', () => {
  const source = ['variable panier = [] avec partagee', 'calcul articles = nombre de panier', '', 'entete :', '    texte "{articles}"', '', page('texte "{articles}"')].join('\n');
  it('se recalcule dans la page et dans l’en-tête', () => {
    expect(erreurs(source)).toEqual([]);
    const fichiers = web(source);
    expect(fichier(fichiers, 'pages/P.tsx')).toContain('const articles = panier.length;');
    expect(fichier(fichiers, 'pages/P.tsx')).not.toContain('setArticles');
  });
  it('refuse un calcul partagé après les pages', () => {
    expect(() => compiler([page('texte "x"'), '', 'calcul a = 1'].join('\n'))).not.toThrow();
    expect(compiler([page('texte "x"'), '', 'calcul a = 1'].join('\n')).diagnostics.map((d) => d.message).join()).toMatch(/en haut du fichier/);
  });
});

describe('selon dans la page', () => {
  const source = page('variable etat = "a"', 'selon etat :', '    cas "a" ou "b" :', '        texte "un"', '    cas "c" :', '        texte "deux"', '    sinon :', '        texte "trois"');
  it('affiche le bon cas sur chaque cible', () => {
    expect(erreurs(source)).toEqual([]);
    expect(code(source)).toContain("etat === 'a' || etat === 'b'");
    expect(fichier(statique(source), 'index.html')).toContain('>un</p>');
    expect(fichier(mobile(source), 'app/index.tsx')).toContain("etat === 'c'");
  });
  it('reste une action dans un événement', () => {
    const action = page('variable etat = "a"', 'bouton "x"', 'quand l\'utilisateur clique sur "x" :', '    selon etat :', '        cas "a" :', '            afficher "un"');
    expect(erreurs(action)).toEqual([]);
    expect(code(action)).toContain("if (etat === 'a')");
  });
});

describe('un lien vers une adresse variable', () => {
  const source = page('variable site = "https://exemple.fr"', 'lien "Site" vers "{site}"');
  it('ne suit que les schémas sûrs', () => {
    expect(erreurs(source)).toEqual([]);
    const lu = code(source);
    expect(lu).toContain('https?:|mailto:|tel:');
    expect(lu).toContain("'#'");
  });
  it('un lien vers une adresse écrite ne change pas', () => {
    expect(code(page('variable numero = "1"', 'lien "A" vers "https://wa.me/{numero}"'))).not.toContain("'#'");
  });
});

describe('le style d’un formulaire et d’un fil d’Ariane', () => {
  const source = page('formulaire "f" avec style "carte" :', '    champ "A"', 'fil d\'Ariane avec style "discret" :', '    lien "P" vers "P"', '    texte "Ici"');
  it('ajoute la classe', () => {
    const lu = code(source);
    expect(lu).toContain('className="humalis-formulaire carte"');
    expect(lu).toContain('humalis-fil discret');
    expect(fichier(statique(source), 'index.html')).toContain('class="humalis-formulaire carte"');
  });
  it('refuse une autre option', () => {
    expect(() => compiler(page('formulaire "f" avec couleur rouge :', '    champ "A"'))).not.toThrow();
    expect(compiler(page('formulaire "f" avec couleur rouge :', '    champ "A"')).diagnostics.map((d) => d.message).join()).toMatch(/« style » après « avec »/);
  });
});

describe('le saut de ligne', () => {
  it('passe par une chaîne en JSX, et garde le retour à la ligne', () => {
    const fichiers = web(page('texte "Bonjour{saut de ligne}Merci"'));
    expect(fichier(fichiers, 'pages/P.tsx')).toContain("{'Bonjour\\nMerci'}");
    expect(fichier(fichiers, 'humalis/styles.css')).toContain('white-space: pre-line');
  });
  it('sans saut de ligne, pas de règle en plus', () => {
    expect(fichier(web(page('texte "Bonjour"')), 'humalis/styles.css')).not.toContain('white-space: pre-line');
  });
  it('s’écrit %0A dans une adresse', () => {
    expect(code(page('variable n = 1', 'lien "W" vers "https://wa.me/1?text=A{saut de ligne}{n}"'))).toContain('text=A%0A');
    expect(code(page('lien "W" vers "https://wa.me/1?text=A{saut de ligne}B"'))).toContain('text=A%0AB');
  });
  it('mobile : une chaîne suffit', () => {
    expect(fichier(mobile(page('texte "A{saut de ligne}B"')), 'app/index.tsx')).toContain("{'A\\nB'}");
  });
});

describe('télécharger en CSV', () => {
  const source = page(NOTES, 'bouton "x"', 'quand l\'utilisateur clique sur "x" :', '    telecharger notes en csv');
  it('web, bureau, mobile et statique', () => {
    expect(erreurs(source)).toEqual([]);
    expect(code(source)).toContain("await telechargerCsv(notes, 'notes.csv', afficherMessage);");
    expect(fichier(web(source), 'humalis/presse-papier.ts')).toContain('createObjectURL');
    expect(fichier(mobile(source), 'humalis/presse-papier.ts')).toContain('Share.share({ title: fichier');
    expect(fichier(desktop(source), 'pages/P.tsx')).toContain('telechargerCsv');
    expect(fichier(statique(source), 'humalis/humalis.js')).toContain('function texteCsv');
  });
  it('« telecharger bon » reste à sa place', () => {
    const bon = page('variable bon = [1]', 'bouton "x"', 'quand l\'utilisateur clique sur "x" :', '    telecharger bon en csv');
    expect(erreurs(bon)).toEqual([]);
    expect(code(bon)).toContain("telechargerCsv(bon, 'bon.csv'");
  });
  it('neutralise les formules et échappe les cellules', () => {
    const js = fichier(statique(source), 'humalis/humalis.js');
    const debut = js.indexOf('function texteCsv');
    const fin = js.indexOf('async function telechargerCsv');
    const texteCsv = new Function(`${js.slice(debut, fin)}; return texteCsv;`)() as (l: unknown[]) => string;
    expect(texteCsv([{ nom: '=SOMME(A1)', note: 'a;b', q: -3 }, { nom: 'Jo "K"' }])).toBe('nom;note;q\r\n\'=SOMME(A1);"a;b";-3\r\n"Jo ""K""";;');
    expect(texteCsv(['a'])).toBe('valeur\r\na');
    expect(texteCsv([])).toBe('');
  });
});
