import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { programme } from './analyse/aide.js';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';

/** Un serveur d'essai ; « route » et « page » se remplacent pour chaque cas. */
const source = ({ route = '>>connecte peut supprimer son compte', donnees = [] as string[], page = PAGE, avecRoute = true } = {}) =>
  programme(
    'serveur "s" :',
    '>compte :',
    '>>nom : texte',
    ...donnees,
    ...(avecRoute ? ['>route "moi" :', route] : []),
    '',
    ...page,
  );

const PAGE = [
  'page "reglages" :',
  '>formulaire "suppression" :',
  '>>champ mot de passe "Mot de passe"',
  '>>bouton "Supprimer mon compte"',
  '>quand le formulaire "suppression" est soumis :',
  '>>essayer :',
  '>>>supprimer mon compte avec champ "Mot de passe"',
  '>>si erreur :',
  '>>>afficher erreur "{raison}"',
];

const erreurs = (texte: string) => compiler(texte).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);
const avertissements = (texte: string) => compiler(texte).diagnostics.filter((d) => d.gravite === 'avertissement').map((d) => d.message);
const serveurDe = (texte: string) => {
  const resultat = compiler(texte);
  expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return resultat.application!.serveurs[0]!;
};
const donneeDe = (texte: string, nom: string) => serveurDe(texte).donnees.find((d) => d.nom === nom)!;

/** Toutes les actions d'un objet de la RI, à n'importe quelle profondeur. */
function actions(objet: unknown, type: string, trouvees: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(objet)) for (const x of objet) actions(x, type, trouvees);
  else if (objet && typeof objet === 'object') {
    if ((objet as { type?: unknown }).type === type) trouvees.push(objet as Record<string, unknown>);
    for (const v of Object.values(objet)) actions(v, type, trouvees);
  }
  return trouvees;
}

describe('« connecte peut supprimer son compte »', () => {
  it('ouvre la suppression, sans la lecture', () => {
    expect(serveurDe(source()).routeMonCompte).toMatchObject({ adresse: 'moi', lire: false, supprimer: true });
  });

  it('« lire et supprimer » ouvre les deux', () => {
    expect(serveurDe(source({ route: '>>connecte peut lire et supprimer son compte' })).routeMonCompte).toMatchObject({ lire: true, supprimer: true });
  });

  it('« lire son compte » seul reste une lecture', () => {
    expect(serveurDe(source({ route: '>>connecte peut lire son compte', page: [] })).routeMonCompte).toMatchObject({ lire: true, supprimer: false });
  });

  it('un visiteur n’a pas de compte', () => {
    expect(erreurs(source({ route: '>>tout le monde peut supprimer son compte' })).join('\n')).toContain('un visiteur n’a pas de compte : écrivez « connecte peut supprimer son compte ».');
  });

  it('« son compte » se lit ou se supprime, rien d’autre', () => {
    expect(erreurs(source({ route: '>>connecte peut modifier son compte' })).join('\n')).toContain('« son compte » se lit ou se supprime : connecte peut lire son compte, connecte peut supprimer son compte');
  });
});

describe('« a la suppression du compte : … »', () => {
  const avis = (ligne: string) => ['>donnee avis :', '>>texte : texte', ligne];

  it('se lit dans la donnée', () => {
    const texte = source({ donnees: [...avis('>>a la suppression du compte : effacer'), '>route "avis" :', '>>connecte peut creer avis', '>>seul son auteur peut modifier avis'] });
    expect(donneeDe(texte, 'avis').suppressionCompte).toBe('effacer');
  });

  it('effacer et garder se lisent aussi', () => {
    expect(donneeDe(source({ donnees: ['>donnee note par compte :', '>>texte : texte', '>>a la suppression du compte : garder'] }), 'note').suppressionCompte).toBe('garder');
    expect(donneeDe(source({ donnees: ['>donnee note par compte :', '>>texte : texte', '>>a la suppression du compte : effacer'] }), 'note').suppressionCompte).toBe('effacer');
  });

  it('un autre mot est refusé', () => {
    expect(erreurs(source({ donnees: avis('>>a la suppression du compte : detruire') })).join('\n')).toContain('après « a la suppression du compte : », écrivez effacer, anonymiser ou garder');
  });

  it('ne devient pas un champ', () => {
    const donnee = donneeDe(source({ donnees: avis('>>a la suppression du compte : anonymiser') }), 'avis');
    expect(donnee.champs.map((c) => c.nom)).toEqual(['texte']);
  });

  it('un champ nommé « suppression » reste un champ', () => {
    const donnee = donneeDe(source({ donnees: ['>donnee tache :', '>>suppression : date'] }), 'tache');
    expect(donnee.champs.map((c) => c.nom)).toEqual(['suppression']);
  });

  it('sans effet sur une donnée qui ne garde pas qui l’a écrite : un avertissement', () => {
    expect(avertissements(source({ donnees: ['>donnee produit :', '>>nom : texte', '>>a la suppression du compte : effacer'] })).join('\n')).toContain('la donnée « produit » ne garde pas qui l’a écrite : « a la suppression du compte » n’y change rien');
  });
});

describe('la règle par défaut', () => {
  it('une donnée « par compte » est effacée', () => {
    const note = donneeDe(source({ donnees: ['>donnee note par compte :', '>>texte : texte'] }), 'note');
    expect(note.suppressionCompte).toBe('effacer');
    expect(note.champsDeLaPersonne).toEqual(['compte']);
  });

  it('une donnée qui garde son auteur devient anonyme', () => {
    const texte = source({ donnees: ['>donnee avis :', '>>texte : texte', '>route "avis" :', '>>connecte peut creer avis', '>>seul son auteur peut modifier avis'] });
    const avis = donneeDe(texte, 'avis');
    expect(avis.suppressionCompte).toBe('anonymiser');
    expect(avis.champsDeLaPersonne).toEqual(['auteur']);
  });

  it('les messages d’une discussion deviennent anonymes', () => {
    const texte = source({ donnees: ['>roles client et vendeur', '>discussion "support" entre client et vendeur'] });
    const messages = donneeDe(texte, 'message_support');
    expect(messages.suppressionCompte).toBe('anonymiser');
    expect(messages.champsDeLaPersonne).toEqual(['auteur', 'auteur_nom']);
  });

  it('une autre donnée ne bouge pas', () => {
    const produit = donneeDe(source({ donnees: ['>donnee produit :', '>>nom : texte'] }), 'produit');
    expect(produit.suppressionCompte).toBeUndefined();
    expect(produit.champsDeLaPersonne).toBeUndefined();
  });

  it('la ligne écrite l’emporte sur la règle par défaut', () => {
    const note = donneeDe(source({ donnees: ['>donnee note par compte :', '>>texte : texte', '>>a la suppression du compte : anonymiser'] }), 'note');
    expect(note.suppressionCompte).toBe('anonymiser');
    expect(note.champsDeLaPersonne).toEqual(['compte']);
  });
});

describe('« supprimer mon compte » dans une page', () => {
  it('avec le mot de passe', () => {
    const trouvees = actions(compiler(source()).application, 'suppressionCompte');
    expect(trouvees).toHaveLength(1);
    expect(trouvees[0]!.motDePasse).toMatchObject({ type: 'champ' });
  });

  it('sans mot de passe', () => {
    const page = PAGE.map((l) => l.replace(' avec champ "Mot de passe"', ''));
    const resultat = compiler(source({ page }));
    expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const trouvees = actions(resultat.application, 'suppressionCompte');
    expect(trouvees).toHaveLength(1);
    expect(trouvees[0]).not.toHaveProperty('motDePasse');
  });

  it('« supprimer note de "notes" » reste la suppression d’une fiche', () => {
    const ast = analyserSyntaxe(analyser(programme('page "notes" :', '>quand l\'utilisateur clique sur "Effacer" :', '>>supprimer note de "notes"', '>>supprimer mon compte')));
    expect(actions(ast, 'Suppression')).toHaveLength(1);
    expect(actions(ast, 'SuppressionCompte')).toHaveLength(1);
  });

  it('demande la route qui le permet', () => {
    expect(erreurs(source({ avecRoute: false, donnees: ['>donnee note par compte :', '>>texte : texte', '>route "notes" :', '>>connecte peut lire note'] })).join('\n')).toContain(
      '« supprimer mon compte » demande une route du serveur avec : connecte peut supprimer son compte',
    );
  });

  it('ne s’utilise que dans un événement', () => {
    const page = ['page "reglages" :', '>supprimer mon compte'];
    expect(erreurs(source({ page })).join('\n')).toContain('« supprimer mon compte » ne s\'utilise que dans un événement');
  });
});
