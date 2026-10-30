import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { verifierPourLeStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Décision L5 : « essayer : … si erreur : … {raison} », dans un événement.
const COMMANDE = programme(
  'serveur "boutique" :',
  '>donnee commande :',
  '>>nom : texte',
  '>route "commandes" :',
  '>>tout le monde peut creer commande',
  '',
  'page "commande" :',
  '>titre "Commande"',
  '>formulaire "commande" :',
  '>>champ "Nom"',
  '>>bouton "Commander"',
  '>quand le formulaire "commande" est soumis :',
  '>>essayer :',
  '>>>envoyer requete vers "commandes" avec champ "Nom"',
  '>>>afficher "Commande envoyée"',
  '>>si erreur :',
  '>>>afficher erreur "La commande n\'est pas partie : {raison}"',
);

describe('essayer … si erreur', () => {
  it('l’analyse accepte le bloc, et « raison » n’existe que dans « si erreur »', () => {
    expect(erreurs(COMMANDE)).toEqual([]);
    expect(erreurs(programme('page "a" :', '>titre "A"', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>essayer :', '>>>afficher "x"', '>>afficher "{raison}"')).join('\n')).toMatch(/« raison »/);
  });

  it('« essayer » s’écrit dans un événement', () => {
    expect(erreurs(programme('page "a" :', '>titre "A"', '>essayer :', '>>texte "x"')).join('\n')).toMatch(/« essayer » s'écrit dans un événement/);
  });

  it('web : la première requête refusée arrête le bloc, sans le message automatique', () => {
    const fichiers = genererProjetWeb(compiler(COMMANDE).application!, { nom: 'c', adresse: 'https://c.cd', source: 'c.humalis' });
    const page = fichiers.get('src/pages/Commande.tsx')!;
    expect(page).toContain('serveur.taire(true);');
    expect(page).toMatch(/if \(serveur\.echecs\(\) > \w+\) return "Le serveur n'a pas répondu\.";/);
    expect(page).toContain('const raison = raisonEssai;');
    expect(fichiers.get('src/humalis/serveur.ts')).toContain('taire: (oui: boolean)');
  });

  it('site statique : refusé clairement à la compilation', () => {
    expect(verifierPourLeStatique(compiler(COMMANDE).application!).map((d) => d.message).join('\n')).toMatch(/« essayer »/);
  });
});
