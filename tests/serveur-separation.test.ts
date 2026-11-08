import { describe, expect, it } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { donneesTs } from '../src/cibles/web/projet.js';
import { erreurs } from './analyse/aide.js';

const serveurDe = (source: string) => genererProjetServeur(compiler(source).application!.serveurs[0], { nom: 's', source: 's.humalis' });

const programme = `serveur "s" :
    roles gerant et client
    invitations vers "p"
    emails par brevo
    donnee commande par boutique :
        total : nombre
    route "commandes" :
        seul gerant peut lire commande
        seul gerant peut modifier commande
        client peut lire commande si utilisateur.id est commande.boutique
    route "equipe" :
        seul gerant peut creer comptes

page "p" :
    titre "P"
    champ email "Adresse"
    bouton "Go"
    quand l'utilisateur clique sur "Go" :
        inviter champ "Adresse" comme client dans boutique "A"
        changer role de "x" en "gerant"
`;

describe('groupes et droits sur ses fiches', () => {
  it('les champs de « compte : » se lisent dans une page', () => {
    const application = compiler('serveur "s" :\n    roles gerant\n    compte :\n        telephone : texte\n    route "equipe" :\n        seul gerant peut lire comptes\n\npage "p" :\n    titre "P"\n').application!;
    expect(donneesTs(application)).toMatch(/interface Comptes \{[^}]*telephone: string;/);
  });

  it('lit les nouvelles phrases', () => {
    const ast = analyserSyntaxe(analyser(programme));
    const serveur = ast.serveurs[0];
    expect(serveur.donnees[0].par).toBe('boutique');
    expect(serveur.donnees[0].champs.at(-1)).toMatchObject({ nom: 'boutique', regle: { genre: 'groupe' } });
    expect(serveur.routes[0].regles[2].si).toMatchObject({ dans: false, gauche: { genre: 'utilisateur', champ: 'id' } });
  });

  it('« changer role par 2 » reste une variable de ce nom', () => {
    expect(erreurs('page "p" :\n    variable role = 1\n    bouton "Go"\n    quand l\'utilisateur clique sur "Go" :\n        changer role par 2\n')).toEqual([]);
  });

  it('le serveur produit filtre et relit le compte', () => {
    const serveur = serveurDe(programme);
    const code = serveur.get('src/serveur.ts')!;
    expect(code).toContain('porteeDe(moiDe(req)');
    expect(code).toContain('compteRelu');
    expect(code).toContain("...acces.roles([\"gerant\"]), csrfMiddleware, comptes.inviter");
    expect(code).toContain('comptes.changerRole');
    expect(serveur.get('src/humalis/comptes.ts')).toContain('seul un admin peut inviter un admin');
  });
});
