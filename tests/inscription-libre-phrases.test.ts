import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { programme } from './analyse/aide.js';

/**
 * L'inscription libre : « inscription libre comme client vers "confirmation" » dans le serveur,
 * « creer mon compte avec … et … [avec nom = …] » et « confirmer mon adresse » dans une page.
 */
const source = ({ ligne = '>inscription libre comme client vers "confirmation"', emails = true, roles = '>roles client', compte = ['>compte :', '>>nom : texte'], pages = [...INSCRIPTION, '', ...CONFIRMATION] } = {}) =>
  programme(
    'serveur "boutique" :',
    ...(roles ? [roles] : []),
    ...(emails ? ['>emails par brevo'] : []),
    ...compte,
    ...(ligne ? [ligne] : []),
    '',
    ...pages,
  );

const inscription = (action: string) => [
  'page "inscription" :',
  '>titre "Créer un compte"',
  '>formulaire "compte" :',
  '>>champ "Nom"',
  '>>champ email "Email"',
  '>>champ mot de passe "Mot de passe"',
  '>>bouton "Créer mon compte"',
  '>quand le formulaire "compte" est soumis :',
  '>>essayer :',
  `>>>${action}`,
  '>>>afficher "Un lien de confirmation vous a été envoyé."',
  '>>si erreur :',
  '>>>afficher erreur "{raison}"',
];
const INSCRIPTION = inscription('creer mon compte avec champ "Email" et champ "Mot de passe"');

const CONFIRMATION = [
  'page "confirmation" :',
  '>titre "Confirmation"',
  '>quand la page se charge :',
  '>>essayer :',
  '>>>confirmer mon adresse',
  '>>>afficher "Votre adresse est confirmée."',
  '>>si erreur :',
  '>>>afficher erreur "{raison}"',
];

const erreurs = (texte: string) => compiler(texte).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);
const sansErreur = (texte: string) => {
  const resultat = compiler(texte);
  expect(resultat.diagnostics.filter((d) => d.gravite !== 'info')).toEqual([]);
  return resultat.application!;
};

/** Toutes les actions d'un objet de la RI, à n'importe quelle profondeur. */
function actions(objet: unknown, type: string, trouvees: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(objet)) for (const x of objet) actions(x, type, trouvees);
  else if (objet && typeof objet === 'object') {
    if ((objet as { type?: unknown }).type === type) trouvees.push(objet as Record<string, unknown>);
    for (const v of Object.values(objet)) actions(v, type, trouvees);
  }
  return trouvees;
}

describe('« inscription libre comme client vers "confirmation" »', () => {
  it('se lit dans le serveur et passe dans la RI', () => {
    expect(sansErreur(source()).serveurs[0]!.inscriptionLibre).toMatchObject({ role: 'client', page: 'confirmation' });
  });

  it('« comme membre » : un simple compte connecté, sans rôle à déclarer', () => {
    expect(sansErreur(source({ ligne: '>inscription libre comme membre vers "confirmation"', roles: '' })).serveurs[0]!.inscriptionLibre).toMatchObject({ role: 'membre' });
  });

  it('le rôle doit être déclaré', () => {
    expect(erreurs(source({ ligne: '>inscription libre comme acheteur vers "confirmation"' })).join('\n')).toContain('le rôle « acheteur » n\'est pas déclaré');
  });

  it('jamais le rôle admin', () => {
    expect(erreurs(source({ ligne: '>inscription libre comme admin vers "confirmation"' }))).toEqual(['l’inscription libre ne donne jamais le rôle admin : écrivez un rôle déclaré dans « roles », par exemple « inscription libre comme client vers "confirmation" ».']);
  });

  it('demande « emails par brevo »', () => {
    expect(erreurs(source({ emails: false }))).toEqual(['l’inscription libre envoie un lien de confirmation : ajoutez « emails par brevo » dans le serveur "boutique".']);
  });

  it('la page du lien doit exister, sans valeur dans son adresse', () => {
    expect(erreurs(source({ ligne: '>inscription libre comme client vers "confirmer"' })).join('\n')).toContain('« inscription libre vers "confirmer" » : cette page n\'existe pas.');
    const aParametre = source({ pages: [...INSCRIPTION, '', 'page "confirmation" avec parametre id :', '>titre "Confirmation"'] });
    expect(erreurs(aParametre).join('\n')).toContain('un lien d\'e-mail ne peut pas ouvrir une page qui attend une valeur dans son adresse');
  });

  it('une phrase mal écrite dit la bonne forme', () => {
    for (const ligne of ['>inscription libre', '>inscription libre comme client', '>inscription libre vers "confirmation"', '>inscription libre comme client vers confirmation']) {
      expect(erreurs(source({ ligne })).join('\n')).toContain('on écrit : inscription libre comme client vers "confirmation"');
    }
  });

  it('écrite une seule fois', () => {
    const deux = source({ ligne: '>inscription libre comme client vers "confirmation"\n    inscription libre comme client vers "confirmation"' });
    expect(erreurs(deux).join('\n')).toContain('« inscription libre » est déjà écrite ligne');
  });
});

describe('« creer mon compte avec … et … »', () => {
  it('passe dans la RI : l’adresse, puis le mot de passe', () => {
    const [action] = actions(sansErreur(source()), 'creationCompte');
    expect(action).toMatchObject({ type: 'creationCompte', email: { type: 'champ' }, motDePasse: { type: 'champ' } });
    expect(action!.champs).toBeUndefined();
  });

  it('avec des champs du compte : « avec nom = champ "Nom" »', () => {
    const [action] = actions(sansErreur(source({ pages: [...inscription('creer mon compte avec champ "Email" et champ "Mot de passe" avec nom = champ "Nom"'), '', ...CONFIRMATION] })), 'creationCompte');
    expect(action!.champs).toMatchObject([{ champ: 'nom', valeur: { type: 'champ' } }]);
  });

  it('seuls les champs déclarés dans « compte : »', () => {
    const texte = source({ pages: [...inscription('creer mon compte avec champ "Email" et champ "Mot de passe" avec age = champ "Nom"'), '', ...CONFIRMATION] });
    expect(erreurs(texte).join('\n')).toContain('« age » n\'est pas un champ du compte');
  });

  it('demande « inscription libre » dans le serveur', () => {
    const texte = source({ ligne: '', pages: INSCRIPTION });
    expect(erreurs(texte)).toEqual(['« creer mon compte » demande la ligne « inscription libre comme … vers "…" » dans le serveur "boutique".']);
  });

  it('dans un événement seulement', () => {
    const texte = source({ pages: ['page "inscription" :', '>creer mon compte avec "a@b.fr" et "Essai-Solide-2026!"', '', ...CONFIRMATION] });
    expect(erreurs(texte).join('\n')).toContain('« creer mon compte » ne s\'utilise que dans un événement');
  });

  it('une phrase mal écrite dit la bonne forme', () => {
    for (const action of ['creer mon compte', 'creer mon compte avec champ "Email"', 'creer mon compte champ "Email" et champ "Mot de passe"']) {
      expect(erreurs(source({ pages: [...inscription(action), '', ...CONFIRMATION] })).join('\n')).toContain('on écrit : creer mon compte avec champ "Email" et champ "Mot de passe"');
    }
  });

  it('« creer » seul ne change pas de sens dans une page', () => {
    const texte = programme(
      'serveur "s" :',
      '>donnee note :',
      '>>texte : texte',
      '>route "notes" :',
      '>>tout le monde peut lire et creer note',
      '',
      'page "notes" :',
      '>bouton "Ajouter"',
      '>quand l\'utilisateur clique sur "Ajouter" :',
      '>>creer note avec texte "x" dans "notes"',
    );
    expect(erreurs(texte)).toEqual(['instruction inconnue : « creer »']);
  });
});

describe('« confirmer mon adresse »', () => {
  it('passe dans la RI', () => {
    expect(actions(sansErreur(source()), 'confirmationAdresse')).toMatchObject([{ type: 'confirmationAdresse' }]);
  });

  it('demande « inscription libre » dans le serveur', () => {
    const texte = source({ ligne: '', pages: CONFIRMATION });
    expect(erreurs(texte)).toEqual(['« confirmer mon adresse » demande la ligne « inscription libre comme … vers "…" » dans le serveur "boutique".']);
  });

  it('dans un événement seulement', () => {
    const texte = source({ pages: [...INSCRIPTION, '', 'page "confirmation" :', '>confirmer mon adresse'] });
    expect(erreurs(texte).join('\n')).toContain('« confirmer mon adresse » ne s\'utilise que dans un événement');
  });

  it('« confirmer "Sûr ?" » reste une question à la personne', () => {
    const texte = programme(
      'page "a" :',
      '>bouton "Effacer"',
      '>quand l\'utilisateur clique sur "Effacer" :',
      '>>confirmer "Sûr ?" avec oui "Oui" et non "Non" :',
      '>>>afficher "ok"',
    );
    expect(erreurs(texte)).toEqual([]);
  });
});
