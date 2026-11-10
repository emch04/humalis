import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { Script, createContext } from 'node:vm';
import { verifierPourLeStatique, genererProjetStatique, SERVEUR_JS } from '../src/cibles/statique/projet.js';
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
    // La raison du refus vient du serveur (« le champ « prix » doit être un nombre »), sinon « pas répondu ».
    expect(page).toMatch(/if \(serveur\.echecs\(\) > \w+\) return serveur\.raison\(\);/);
    expect(page).toContain('const raison = raisonEssai;');
    expect(fichiers.get('src/humalis/serveur.ts')).toContain('taire: (oui: boolean)');
  });

  it('site statique : accepté, écrit comme sur le web', () => {
    expect(verifierPourLeStatique(compiler(COMMANDE).application!).filter((d) => d.gravite === 'erreur')).toEqual([]);
    const fichiers = genererProjetStatique(compiler(COMMANDE).application!, { nom: 'c', source: 'c.humalis' });
    const page = fichiers.get('pages/commande.js')!;
    expect(page).toContain('serveur.taire(true);');
    expect(page).toMatch(/if \(serveur\.echecs\(\) > echecsEssai\) return serveur\.raison\(\);/);
    expect(page).toContain('const raison = raisonEssai;');
    expect(page).toContain('serveur.taire(false);');
    expect(fichiers.get('humalis/humalis.js')).toContain('raison: () => derniereRaison,');
    expect(() => new Script(page)).not.toThrow();
    expect(() => new Script(fichiers.get('humalis/humalis.js')!)).not.toThrow();
  });

  /** Joue la soumission du site statique avec un faux fetch : rend les messages affichés et ce qui reste dans le champ. */
  async function soumettreSurLeStatique(reponse: () => Promise<Response>) {
    const fichiers = genererProjetStatique(compiler(COMMANDE).application!, { nom: 'c', source: 'c.humalis' });
    const messages: string[] = [];
    const afficherMessage = (texte: string, genre: string) => messages.push(`${genre} : ${texte}`);
    const serveur = new Function('fetch', 'afficherMessage', 'document', `const ADRESSE_SERVEUR = '';\n${SERVEUR_JS}\nreturn serveur;`)(reponse, afficherMessage, { cookie: '' });
    const contexte = createContext({ humalis: { creer: () => null, afficherMessage, serveur, demarrer: () => undefined } });
    new Script(`${fichiers.get('pages/commande.js')!}\nthis.soumettre = async () => { champNom = 'Ada'; await quandSoumisCommande(); return champNom; };`).runInContext(contexte);
    const champ = await (contexte as { soumettre: () => Promise<string> }).soumettre();
    return { messages, champ };
  }

  it('site statique : un refus du serveur passe à « si erreur » avec sa raison, sans le message automatique', async () => {
    const { messages, champ } = await soumettreSurLeStatique(async () => new Response(JSON.stringify({ erreur: 'le champ « nom » est trop court' }), { status: 400 }));
    expect(messages).toEqual(["erreur : La commande n'est pas partie : Le champ « nom » est trop court."]);
    // Dans un formulaire, les champs restent remplis.
    expect(champ).toBe('Ada');
  });

  it('site statique : sans réponse du serveur, « raison » le dit en français', async () => {
    const { messages } = await soumettreSurLeStatique(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(messages).toEqual(["erreur : La commande n'est pas partie : Le serveur n'a pas répondu."]);
  });

  it('site statique : un envoi réussi continue le bloc et vide le champ', async () => {
    const { messages, champ } = await soumettreSurLeStatique(async () => new Response(JSON.stringify({ id: 1, nom: 'Ada' }), { status: 201 }));
    expect(messages).toEqual(['info : Commande envoyée']);
    expect(champ).toBe('');
  });

  it('site statique : « se connecter » dans un essai lève son refus pour « si erreur »', () => {
    const source = programme(
      'serveur "boutique" :',
      '>donnee commande :',
      '>>nom : texte',
      '>route "commandes" :',
      '>>seul admin peut lire commande',
      '',
      'page "connexion" :',
      '>titre "Connexion"',
      '>formulaire "connexion" :',
      '>>champ email "Email" avec obligatoire',
      '>>champ mot de passe "Mot de passe" avec obligatoire',
      '>>bouton "Se connecter"',
      '>quand le formulaire "connexion" est soumis :',
      '>>essayer :',
      '>>>se connecter avec champ "Email" et champ "Mot de passe"',
      '>>si erreur :',
      '>>>afficher erreur "Connexion refusée : {raison}"',
    );
    const fichiers = genererProjetStatique(compiler(source).application!, { nom: 'c', source: 'c.humalis' });
    const page = fichiers.get('pages/connexion.js')!;
    expect(page).toContain('await utilisateur.seConnecter(champEmail, motDePasseSaisi, true)');
    expect(page).not.toContain('serveur.taire');
    expect(fichiers.get('humalis/humalis.js')).toContain('if (lever) throw new Error(message);');
  });

  it('web : « se connecter » dans un essai rend sa raison à « si erreur », sans appeler le serveur des données', () => {
    const source = programme(
      'serveur "boutique" :',
      '>donnee commande :',
      '>>nom : texte',
      '>route "commandes" :',
      '>>seul admin peut lire commande',
      '',
      'page "connexion" :',
      '>titre "Connexion"',
      '>formulaire "connexion" :',
      '>>champ email "Email" avec obligatoire',
      '>>champ mot de passe "Mot de passe" avec obligatoire',
      '>>bouton "Se connecter"',
      '>quand le formulaire "connexion" est soumis :',
      '>>essayer :',
      '>>>se connecter avec champ "Email" et champ "Mot de passe"',
      '>>>rediriger vers "connexion"',
      '>>si erreur :',
      '>>>afficher erreur "Connexion refusée : {raison}"',
    );
    expect(erreurs(source)).toEqual([]);
    const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'c', adresse: 'https://c.cd', source: 'c.humalis' });
    const page = fichiers.get('src/pages/Connexion.tsx')!;
    expect(page).toContain('await utilisateur.seConnecter(champEmail, champMotDePasse, true)');
    expect(page).not.toContain('serveur.');
    expect(fichiers.get('src/humalis/session.tsx')).toContain('if (dansUnEssai) throw new Error(texte);');
  });
});
