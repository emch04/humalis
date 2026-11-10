import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { programme, erreurs } from './analyse/aide.js';

const OPTIONS = { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' };
const web = (source: string) => genererProjetWeb(compiler(source).application!, OPTIONS);

// Les défauts relevés en écrivant Rey Store et le site (humalis-notes, 2026-10-30-defauts-trouves), repris le 10 novembre.
describe('défauts repris le 10 novembre', () => {
  it('une date saisie dans un « champ date » puis copiée dans une fiche garde son format', () => {
    const source = programme(
      'page "p" :',
      '>titre "P"',
      '>variable inscrits = []',
      '>formulaire "f" :',
      '>>champ "Nom"',
      '>>champ date "Naissance"',
      '>>bouton "Ok"',
      '>quand le formulaire "f" est soumis :',
      '>>ajouter fiche avec jour champ "Naissance" et nom champ "Nom" à inscrits',
      '>pour chaque x dans inscrits :',
      '>>texte "{x.jour}, {x.nom}"',
    );
    expect(erreurs(source)).toEqual([]);
    const page = web(source).get('src/pages/P.tsx')!;
    expect(page).toContain('formaterDate(x.jour)');
    expect(page).not.toContain('formaterDate(x.nom)');
    const moteur = [...genererProjetMoteur(compiler(source).application!, OPTIONS).values()].join('\n');
    expect(moteur).toContain('formaterDate(x.v.jour)');
    const apple = [...genererProjetApple(compiler(source).application!, OPTIONS).fichiers.values()].join('\n');
    expect(apple).toContain('formaterDate(x.jour)');
  });

  it('deux champs de même libellé, l’un dans « si », l’autre dans « sinon », ne sont pas des doublons', () => {
    const source = programme(
      'page "p" :',
      '>titre "P"',
      '>variable ouvert = faux',
      '>formulaire "f" :',
      '>>si ouvert est vrai :',
      '>>>champ "Nom"',
      '>>sinon :',
      '>>>champ "Nom"',
      '>>bouton "Envoyer"',
      '>quand le formulaire "f" est soumis :',
      '>>afficher "Fait"',
    );
    expect(compiler(source).diagnostics.map((d) => d.message)).toEqual([]);
    // Après le « si », un même libellé redevient un doublon ; dans une même branche aussi.
    const apres = programme('page "p" :', '>titre "P"', '>variable ouvert = faux', '>formulaire "f" :', '>>si ouvert est vrai :', '>>>champ "Nom"', '>>sinon :', '>>>champ "Nom"', '>>champ "Nom"', '>>bouton "Envoyer"');
    expect(compiler(apres).diagnostics.map((d) => d.message).join('\n')).toMatch(/deux champs du même formulaire portent « Nom »/);
    const meme = programme('page "p" :', '>titre "P"', '>variable ouvert = faux', '>formulaire "f" :', '>>si ouvert est vrai :', '>>>champ "Nom"', '>>>champ "Nom"', '>>bouton "Envoyer"');
    expect(compiler(meme).diagnostics.map((d) => d.message).join('\n')).toMatch(/deux champs du même formulaire portent « Nom »/);
  });

  it('un événement écrit hors du « si » vise le bouton de chaque branche', () => {
    const source = programme(
      'page "p" :',
      '>titre "P"',
      '>variable ouvert = faux',
      '>si ouvert est vrai :',
      '>>bouton "Ok"',
      '>sinon :',
      '>>bouton "Ok"',
      '>quand l\'utilisateur clique sur "Ok" :',
      '>>changer ouvert par vrai',
    );
    expect(erreurs(source)).toEqual([]);
    const page = web(source).get('src/pages/P.tsx')!;
    expect(page.match(/onClick=\{quandCliqueOk\}/g)?.length).toBe(2);
    // Deux boutons qui s'affichent ensemble restent ambigus.
    const ensemble = programme('page "p" :', '>titre "P"', '>variable ouvert = faux', '>si ouvert est vrai :', '>>bouton "Ok"', '>bouton "Ok"', '>quand l\'utilisateur clique sur "Ok" :', '>>changer ouvert par vrai');
    expect(erreurs(ensemble).join('\n')).toMatch(/deux éléments s'appellent « Ok »/);
  });

  it('« arrondi de (moyenne de …) a 0 chiffres » est accepté (déjà corrigé, gardé par ce test)', () => {
    const source = programme('page "p" :', '>variable notes = [12, 15]', '>calcul m = arrondi de (moyenne de notes) a 0 chiffres', '>titre "P"', '>texte "{m}"');
    expect(erreurs(source)).toEqual([]);
    expect(JSON.stringify(compiler(source).application!.ecrans[0])).toContain('"chiffres":0');
  });

  it('une fiche vide au départ, remplie ensuite avec une date, l’affiche en français', () => {
    const source = programme(
      'serveur "s" :',
      '>donnee commande :',
      '>>nom : texte',
      '>>jour : date',
      '>route "commandes" :',
      '>>seul admin peut lire commande',
      '>>seul admin peut modifier commande',
      '',
      'page "p" :',
      '>titre "P"',
      '>variable commandes = []',
      '>variable choisie = fiche avec jour "" et nom ""',
      '>texte "Le {choisie.jour}, {choisie.nom}"',
      '>quand la page se charge :',
      '>>envoyer requete vers "commandes" dans commandes',
      '>>pour chaque c dans commandes :',
      '>>>changer choisie par fiche avec jour c.jour et nom c.nom',
    );
    expect(erreurs(source)).toEqual([]);
    const page = web(source).get('src/pages/P.tsx')!;
    expect(page).toContain('formaterDate(choisie.jour)');
    expect(page).not.toContain('formaterDate(choisie.nom)');
  });
});
