import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { programme, erreurs } from './analyse/aide.js';

const SERVEUR = [
  'serveur "boutique" :',
  '>donnee produit :',
  '>>nom : texte',
  '>>visible : booleen',
  '>donnee commande :',
  '>>nom : texte',
  '>route "produits" :',
  '>>tout le monde peut lire produit',
  '>route "commandes" :',
  '>>tout le monde peut creer commande',
  '',
];

describe('requêtes : ordre des lignes et noms donnés', () => {
  it('un calcul écrit avant « quand la page se charge » lit les champs de la liste remplie par le serveur', () => {
    const source = programme(
      ...SERVEUR,
      'page "boutique" :',
      '>variable produits = []',
      '>calcul en_vente = produits dont visible est vrai',
      '>titre "Boutique"',
      '>quand la page se charge :',
      '>>envoyer requete vers "produits" dans produits',
      '>pour chaque p dans en_vente :',
      '>>texte p.nom',
    );
    expect(erreurs(source)).toEqual([]);
  });

  it('« avec nom = client » : le nom donné est celui du champ vérifié, pas celui de la variable', () => {
    const page = (envoi: string) => programme(
      ...SERVEUR,
      'page "commande" :',
      '>variable client = "Patrick"',
      '>titre "Commande"',
      '>bouton "Commander"',
      '>quand l\'utilisateur clique sur "Commander" :',
      `>>envoyer requete vers "commandes" avec ${envoi}`,
    );
    expect(erreurs(page('nom = client'))).toEqual([]);
    expect(erreurs(page('client')).join('\n')).toMatch(/pas de champ « client »/);
  });

  it('web : une page à paramètre recharge ses données quand le paramètre change (d’un produit à un autre)', () => {
    const source = programme(
      ...SERVEUR,
      'page "produit" avec parametre id :',
      '>variable produit = rien',
      '>quand la page se charge :',
      '>>envoyer requete vers "produits" avec id dans produit',
      '>si produit est rien :',
      '>>texte "Chargement…"',
      '>sinon :',
      '>>titre produit.nom',
    );
    expect(erreurs(source)).toEqual([]);
    const page = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/Produit.tsx')!;
    expect(page).toContain('}, [id]);');
  });

  it('« produits dont club est egal a club » : à droite, le filtre de la page, pas le champ', () => {
    const source = programme(
      'serveur "boutique" :',
      '>donnee produit :',
      '>>nom : texte',
      '>>club : texte',
      '>route "produits" :',
      '>>tout le monde peut lire produit',
      '',
      'page "maillots" avec filtre club :',
      '>variable produits = []',
      '>quand la page se charge :',
      '>>envoyer requete vers "produits" dans produits',
      '>calcul du_club = produits dont club est egal a club',
      '>titre "Maillots"',
      '>pour chaque p dans du_club :',
      '>>texte p.nom',
    );
    expect(erreurs(source)).toEqual([]);
    const application = compiler(source).application!;
    const page = genererProjetWeb(application, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/Maillots.tsx')!;
    expect(page).toContain('produits.filter((element) => element.club === club)');
  });
});
