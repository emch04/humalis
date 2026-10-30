import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Décision L3 d'Emch : « fiche avec nom "Livre" et prix 12 », lue par « livre.prix ».
const PROFIL = programme(
  'page "profil" :',
  '>variable client = fiche avec nom "Awa" et ville "Kinshasa" et adresse (fiche avec rue "Av. du Fleuve" et numero 12)',
  '>variable panier = [fiche avec nom "Livre" et prix 12500, fiche avec nom "Stylo" et prix 1500]',
  '>texte "{client.nom}, {client.adresse.rue} {client.adresse.numero}"',
  '>pour chaque article dans panier :',
  '>>texte "{article.nom} : {article.prix} FC"',
  '>bouton "Déménager"',
  '>quand l\'utilisateur clique sur "Déménager" :',
  '>>changer client.ville par "Goma"',
  '>>changer client.adresse.numero par 7',
);

describe('fiches — l’analyse', () => {
  it('accepte les fiches, les fiches imbriquées et les listes de fiches', () => {
    expect(erreurs(PROFIL)).toEqual([]);
  });

  it('refuse un champ qui n’existe pas, en donnant les champs de la fiche', () => {
    expect(erreurs(programme('page "a" :', '>variable livre = fiche avec nom "Livre" et prix 12', '>texte "{livre.auteur}"'))).toEqual([
      '3 : le champ « auteur » n\'existe pas dans cette fiche. Champs : nom, prix.',
    ]);
  });

  it('refuse de changer un champ avec une valeur d’un autre type', () => {
    expect(
      erreurs(programme('page "a" :', '>variable livre = fiche avec nom "Livre" et prix 12', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>changer livre.prix par "cher"')),
    ).toEqual(['5 : « livre.prix » est un nombre ; on ne peut pas lui donner un texte.']);
  });

  it('refuse un champ donné deux fois', () => {
    expect(erreurs(programme('page "a" :', '>variable livre = fiche avec nom "A" et nom "B"'))).toEqual([
      '2 : le champ « nom » est donné deux fois dans cette fiche.',
    ]);
  });

  it('les nombres d’une fiche sont au format français dans un texte', () => {
    const vue = compiler(PROFIL).application!.ecrans[0].vue;
    expect(vue[1]).toMatchObject({ corps: [{ contenu: { parties: [{ variable: 'article.nom' }, { texte: ' : ' }, { variable: 'article.prix', format: 'nombre' }, { texte: ' FC' }] } }] });
  });
});

describe('fiches — ce que produit chaque cible', () => {
  it('web : des objets typés, et un changement de champ qui recopie la fiche', () => {
    const page = genererProjetWeb(compiler(PROFIL).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).get('src/pages/Profil.tsx')!;
    expect(page).toContain(
      // Une fiche seule : TypeScript déduit son type de la valeur de départ.
      "useState({ nom: 'Awa', ville: 'Kinshasa', adresse: { rue: 'Av. du Fleuve', numero: 12 } })",
    );
    expect(page).toContain("useState<{ nom: string; prix: number }[]>([{ nom: 'Livre', prix: 12500 }, { nom: 'Stylo', prix: 1500 }])");
    // Deux changements dans le même événement : une copie à jour, pour qu'ils s'ajoutent.
    expect(page).toContain("let clientMaj = client;\n    clientMaj = { ...clientMaj, ville: 'Goma' };\n    setClient(clientMaj);");
    expect(page).toContain('clientMaj = { ...clientMaj, adresse: { ...clientMaj.adresse, numero: 7 } };\n    setClient(clientMaj);');
  });

  it('web : un seul changement de champ garde la forme fonctionnelle de React', () => {
    const source = programme('page "a" :', '>variable livre = fiche avec nom "A" et prix 1', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>changer livre.prix par 2');
    const page = genererProjetWeb(compiler(source).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).get('src/pages/A.tsx')!;
    expect(page).toContain('setLivre((livre) => ({ ...livre, prix: 2 }));');
  });

  it('site statique : des objets JavaScript, et le HTML de départ lit les champs', () => {
    const fichiers = genererProjetStatique(compiler(PROFIL).application!, { nom: 'a', source: 'a.humalis' });
    expect(fichiers.get('index.html')).toContain('Awa, Av. du Fleuve 12');
    expect(fichiers.get('index.html')).toContain('Livre : 12 500 FC');
    const script = [...fichiers.entries()].find(([c]) => c.endsWith('.js') && c !== 'humalis/humalis.js')![1];
    expect(script).toContain("client = { ...client, ville: 'Goma' };");
  });
});
