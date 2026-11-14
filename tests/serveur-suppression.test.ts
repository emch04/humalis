import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { codeEffacerLesDonnees } from '../src/cibles/serveur/suppression.js';
import { programme } from './analyse/aide.js';

const source = (route: string, ...donnees: string[]) =>
  programme('serveur "s" :', '>compte :', '>>nom : texte', ...donnees, '>route "moi" :', `>>${route}`, '', 'page "a" :', '>titre "A"');

const serveurDe = (texte: string) => {
  const resultat = compiler(texte);
  expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return resultat.application!.serveurs[0]!;
};
const fichiers = (texte: string) => genererProjetServeur(serveurDe(texte), { nom: 's', source: 's.humalis' });

describe('la suppression de son compte dans le serveur produit', () => {
  it('« supprimer son compte » ouvre POST /auth/suppression-compte, sans la lecture de son compte', () => {
    const serveur = fichiers(source('connecte peut supprimer son compte')).get('src/serveur.ts')!;
    expect(serveur).toContain("routeSuppressionCompte.post('/', createLoginLimiter() as unknown as RequestHandler, ...acces.connecte, csrfMiddleware, comptes.supprimerMonCompte)");
    expect(serveur).toContain("app.use('/auth/suppression-compte', routeSuppressionCompte)");
    expect(serveur).not.toContain('comptes.monCompte');
    expect(serveur).toContain('effacerLesDonnees: (id) => effacerLesDonnees(id, transaction)');
  });

  it('« lire son compte » seul ne permet pas de le supprimer', () => {
    const serveur = fichiers(source('connecte peut lire son compte')).get('src/serveur.ts')!;
    expect(serveur).toContain('comptes.monCompte');
    expect(serveur).not.toContain('/auth/suppression-compte');
    expect(serveur).not.toContain('effacerLesDonnees');
  });

  it('« lire et supprimer » ouvre les deux', () => {
    const serveur = fichiers(source('connecte peut lire et supprimer son compte')).get('src/serveur.ts')!;
    expect(serveur).toContain('comptes.monCompte');
    expect(serveur).toContain('comptes.supprimerMonCompte');
  });

  it('la session s’en va comme à la déconnexion', () => {
    const sessions = fichiers(source('connecte peut supprimer son compte')).get('src/humalis/sessions.ts')!;
    expect(sessions).toContain("'/auth/suppression-compte'");
    expect(sessions).toContain("const sortie = req.path === '/auth/logout' || req.path === '/auth/suppression-compte';");
  });

  it('les attaques produites couvrent la suppression', () => {
    const attaques = fichiers(source('connecte peut supprimer son compte', '>donnee note par compte :', '>>texte : texte', '>route "notes" :', '>>connecte peut lire et creer note')).get('tests/attaques.test.ts')!;
    expect(attaques).toContain("describe('supprimer son compte'");
    expect(attaques).toContain('le dernier admin ne peut pas supprimer son compte');
    expect(attaques).toContain("on ne supprime que son propre compte, quel que soit l\\'identifiant envoyé");
  });
});

describe('codeEffacerLesDonnees', () => {
  const code = (...donnees: string[]) => codeEffacerLesDonnees(serveurDe(source('connecte peut supprimer son compte', ...donnees)));

  it('une donnée par compte : effacée', () => {
    expect(code('>donnee note par compte :', '>>texte : texte', '>route "notes" :', '>>connecte peut lire et creer note')).toContain('await fichesDeLaPersonne(s.note, id, ["compte"], ["compte"], true, null);');
  });

  it('une donnée qui garde son auteur : anonyme', () => {
    expect(code('>donnee avis :', '>>texte : texte', '>route "avis" :', '>>connecte peut creer avis', '>>seul son auteur peut modifier avis')).toContain('await fichesDeLaPersonne(s.avis, id, ["auteur"], ["auteur"], false, null);');
  });

  it('« garder » : rien, et aucune fonction inutile', () => {
    const texte = code('>donnee avis :', '>>texte : texte', '>>a la suppression du compte : garder', '>route "avis" :', '>>connecte peut creer avis', '>>seul son auteur peut modifier avis');
    expect(texte).not.toContain('fichesDeLaPersonne');
    expect(texte).toContain('async function effacerLesDonnees(_id: string');
  });

  it('une fiche payée : jamais effacée', () => {
    const texte = code(
      '>paiements par stripe',
      '>donnee commande :',
      '>>total : nombre',
      '>>a la suppression du compte : effacer',
      '>donnee journal :',
      '>>texte : texte',
      '>route "commandes" :',
      '>>connecte peut creer commande',
      '>>seul son auteur peut modifier commande',
      '>>quand commande est payee :',
      '>>>creer journal avec texte "payée"',
      '>route "journaux" :',
      '>>seul admin peut lire journal',
    );
    expect(texte).toContain('await fichesDeLaPersonne(s.commande, id, ["auteur"], ["auteur"], true, "paye");');
  });

  it('le reste du temps réel : ses appels, sa présence et ses exclusions', () => {
    const texte = code('>roles client et vendeur', '>salle "classe" pour client et vendeur animee par vendeur', '>discussion "aide" entre client et vendeur');
    expect(texte).toContain('await fichesDeLaPersonne(s.presenceVue, id, ["compte"], [], true, null);');
    expect(texte).toContain('await fichesDeLaPersonne(s.exclusionSalle, id, ["compte"], [], true, null);');
    expect(texte).not.toContain('appelFini');
  });

  it('une discussion : ses pièces et ses lectures effacées, ses messages anonymes et sans pièce, ses conversations sans son nom', () => {
    const texte = code('>roles client et vendeur', '>discussion "aide" entre client et vendeur');
    expect(texte).toContain('await fichesDeLaPersonne(s.pieceAide, id, ["auteur"], [], true, null);');
    expect(texte).toContain('await fichesDeLaPersonne(s.lectureAide, id, ["compte"], [], true, null);');
    expect(texte).toContain('await fichesDeLaPersonne(s.ecritureAide, id, ["compte"], [], true, null);');
    expect(texte).toContain('await fichesDeLaPersonne(s.messageAide, id, ["auteur"], ["auteur","auteurNom","piece","pieceNom","pieceType","pieceAdresse"], false, null);');
    expect(texte).toContain('await fichesDeLaPersonne(s.conversationAide, id, ["personne"], ["personne"], false, null, { titre: "Compte supprimé" });');
    // Les messages ne sont traités qu'une fois.
    expect(texte.match(/s\.messageAide/g)).toHaveLength(1);
  });
});
