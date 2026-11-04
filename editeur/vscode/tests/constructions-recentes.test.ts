import { describe, it, expect } from 'vitest';
import { compilerProjet } from '../../../src/fichiers.js';
import { completerSource, type Completion } from '../src/langage/completion.js';
import { survoler } from '../src/langage/survol.js';
import { indexDe, col } from './aide-langage.js';
import { colorier, jetonDe, porteeDe } from './aide-grammaire.js';

const CONTEXTUEL = 'support.function.humalis';

const PROGRAMME = `site :
    nom "Le Comptoir"
    erreurs pendant 5 secondes

serveur "boutique" :
    connexion google
    emails par brevo
    invitations vers "bienvenue"
    mot de passe oublié vers "bienvenue"
    donnee produit :
        nom : texte non vide
        prix : nombre
    donnee zone :
        commune : texte
        prix : nombre
    donnee suivi :
        etape : texte
    donnee commande :
        refs : liste de texte non vide
        photos : liste de texte du site
        quantite : nombre calcule nombre de refs
        commune : texte
        livraison : nombre au plus prix de zone par commune
        total : nombre calcule somme prix de produit par refs plus livraison
        suivi : texte
        statut : texte au depart "en_attente"
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
    route "zones" :
        tout le monde peut lire zone
        seul admin peut modifier zone
    route "equipe" :
        seul admin peut lire comptes
        seul admin peut supprimer comptes
    route "suivis" :
        tout le monde peut lire suivi par identifiant
        seul admin peut lire suivi
        seul admin peut modifier suivi
    route "commandes" :
        tout le monde peut creer commande
        seul admin peut lire commande
        seul admin peut modifier commande
        quand commande est cree :
            creer suivi avec etape "en_attente" dans commande.suivi
            envoyer email aux admins avec sujet "Commande" et texte "Total {commande.total}"

page "accueil" :
    titre "Accueil"
    variable membres = []
    variable lu = rien
    variable ids = ["a"]
    quand la page se charge :
        envoyer requete vers "equipe" dans membres
    pour chaque m dans membres :
        texte "{m.email} : {m.statut}"
    champ email "Adresse"
    bouton "Inviter"
    quand l'utilisateur clique sur "Inviter" :
        inviter champ "Adresse" comme admin
        demander un lien de mot de passe pour champ "Adresse"
        pour chaque id_lu dans ids :
            envoyer requete vers "suivis" avec id id_lu dans lu

page "bienvenue" :
    titre "Bienvenue"
    champ mot de passe "Nouveau"
    bouton "Valider"
    quand l'utilisateur clique sur "Valider" :
        choisir le mot de passe avec champ "Nouveau"
`;
const LIGNES = PROGRAMME.split('\n');
const ligneDe = (morceau: string) => LIGNES.findIndex((l) => l.includes(morceau)) + 1;

describe('les constructions depuis la 1.5.2', () => {
  it('le programme se compile sans erreur', () => {
    const { diagnostics } = compilerProjet(undefined, () => undefined, PROGRAMME);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  describe('le survol', () => {
    const fiche = (morceau: string, mot = morceau.split(' ')[0]) => {
      const ligne = ligneDe(morceau);
      return survoler(indexDe(PROGRAMME), ligne, col(PROGRAMME, ligne, mot))?.markdown ?? '';
    };
    it.each([
      ['erreurs pendant', 'erreurs', 'erreurs pendant'],
      ['emails par brevo', 'emails', 'emails par brevo'],
      ['emails par brevo', 'brevo', 'emails par brevo'],
      ['invitations vers', 'invitations', 'invitations vers'],
      ['mot de passe oublié vers', 'oublié', 'mot de passe oublié vers'],
      ['connexion google', 'connexion', 'connexion google'],
      ['etape "en_attente" dans', 'creer', 'creer'],
      ['quand commande est cree', 'cree', 'est cree'],
      ['envoyer email aux admins', 'email', 'envoyer email'],
      ['statut : texte au depart', 'depart', 'au depart'],
      ['photos : liste de texte du site', 'site', 'du site'],
      ['refs : liste de texte non vide', 'vide', 'non vide'],
      ['quantite : nombre calcule', 'calcule', 'calcule'],
      ['livraison : nombre au plus', 'plus', 'au plus'],
      ['lire suivi par identifiant', 'identifiant', 'par identifiant'],
      ['inviter champ', 'inviter', 'inviter'],
      ['inviter champ', 'comme', 'inviter'],
      ['demander un lien', 'demander', 'demander'],
      ['choisir le mot de passe', 'choisir', 'choisir'],
    ])('%s, sur « %s »', (morceau, mot, attendu) => {
      expect(fiche(morceau, mot).toLowerCase()).toContain(attendu.toLowerCase());
    });
    it('« par » garde son sens ailleurs', () => {
      expect(fiche('livraison : nombre au plus', 'nombre')).not.toContain('au plus');
    });
  });

  describe('la complétion', () => {
    const completerA = (texte: string): Completion => {
      const lignes = texte.split('\n');
      const ligne = lignes.findIndex((l) => l.includes('‸')) + 1;
      return completerSource(texte.replace('‸', ''), ligne, lignes[ligne - 1].indexOf('‸') + 1);
    };
    const libelles = (texte: string) => completerA(texte).propositions.map((p) => p.libelle);
    const serveur = (corps: string) => `serveur "s" :\n${corps}\n\npage "a" :\n    titre "A"\n`;

    it('le bloc site', () => {
      expect(libelles('site :\n    ‸\n')).toEqual(expect.arrayContaining(['nom', 'adresse', 'erreurs pendant']));
      expect(libelles('site :\n    ‸\n')).not.toContain('bouton');
    });
    it('le bloc serveur', () => {
      expect(libelles(serveur('    ‸'))).toEqual(expect.arrayContaining(['donnée', 'route', 'connexion google', 'emails par brevo', 'invitations vers "…"', 'mot de passe oublié vers "…"']));
    });
    it('une route', () => {
      const route = (ligne: string) => serveur(`    donnee suivi :\n        etape : texte\n    route "r" :\n        ${ligne}`);
      expect(libelles(route('‸'))).toContain('quand … est cree :');
      expect(libelles(route('seul admin peut lire ‸'))).toEqual(expect.arrayContaining(['suivi', 'comptes']));
      expect(libelles(route('tout le monde peut lire suivi ‸'))).toContain('par identifiant');
    });
    it('sous « quand … est cree »', () => {
      const dedans = serveur('    donnee suivi :\n        etape : texte\n    route "r" :\n        connecte peut creer suivi\n        quand suivi est cree :\n            ‸');
      expect(libelles(dedans)).toEqual(expect.arrayContaining(['envoyer email', 'creer … avec …']));
      expect(libelles(dedans)).not.toContain('bouton');
    });
    it('après le type d’un champ', () => {
      const champ = (ligne: string) => serveur(`    donnee suivi :\n        ${ligne}`);
      expect(libelles(champ('etape : texte ‸'))).toEqual(expect.arrayContaining(['au depart', 'du site', 'non vide']));
      expect(libelles(champ('total : nombre ‸'))).toEqual(expect.arrayContaining(['calcule nombre de', 'calcule somme', 'au plus', 'au depart']));
      expect(libelles(champ('etape : ‸'))).toContain('texte');
    });
    it('dans un événement', () => {
      const evenement = 'page "a" :\n    bouton "B"\n    quand l\'utilisateur clique sur "B" :\n        ‸';
      expect(libelles(evenement)).toEqual(expect.arrayContaining(['inviter', 'demander un lien de mot de passe', 'choisir le mot de passe']));
      expect(libelles('page "a" :\n    bouton "B"\n    quand l\'utilisateur clique sur "B" :\n        inviter champ "A" ‸')).toContain('comme admin');
    });
    it('les champs de « comptes »', () => {
      const avec = PROGRAMME.replace('texte "{m.email} : {m.statut}"', 'texte m.‸');
      expect(libelles(avec)).toEqual(expect.arrayContaining(['email', 'role', 'statut']));
    });
  });

  describe('la coloration', () => {
    it.each([
      ['    erreurs pendant 5 secondes', 'erreurs'],
      ['    emails par brevo', 'brevo'],
      ['    invitations vers "b"', 'invitations'],
      ['    mot de passe oublié vers "b"', 'oublié'],
      ['    connexion google', 'google'],
      ['        statut : texte au depart "a"', 'depart'],
      ['        statut : texte au départ "a"', 'départ'],
      ['        photos : liste de texte du site', 'site'],
      ['        refs : liste de texte non vide', 'vide'],
      ['        total : nombre calcule somme prix', 'calcule'],
      ['        total : nombre calculé somme prix', 'calculé'],
      ['        livraison : nombre au plus prix', 'au plus'],
      ['        seul admin peut lire suivi par identifiant', 'identifiant'],
      ['        quand commande est cree :', 'cree'],
      ['            envoyer email aux admins avec sujet "a"', 'email'],
      ['            envoyer email aux admins avec sujet "a"', 'admins'],
      ['            envoyer email aux admins avec sujet "a"', 'sujet'],
      ['        inviter champ "A" comme admin', 'inviter'],
      ['        inviter champ "A" comme admin', 'comme'],
      ['        demander un lien de mot de passe pour champ "A"', 'demander'],
      ['        choisir le mot de passe avec champ "A"', 'choisir'],
      ['        seul admin peut lire comptes', 'comptes'],
    ])('%s : « %s »', async (ligne, mot) => {
      const [lignes] = [await colorier(ligne)];
      expect(porteeDe(jetonDe(lignes[0], mot))).toBe(CONTEXTUEL);
    });
    it('un nom libre reste un nom : « inviter » et « site » ailleurs', async () => {
      const lignes = await colorier('    variable site = 1\n    changer inviter par 2');
      expect(porteeDe(jetonDe(lignes[0], 'site'))).not.toBe(CONTEXTUEL);
      expect(porteeDe(jetonDe(lignes[1], 'inviter'))).not.toBe(CONTEXTUEL);
    });
  });
});
