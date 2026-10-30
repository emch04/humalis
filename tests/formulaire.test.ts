import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from './aide-qualite.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

// Huit lignes : la page commence ligne 9.
const SERVEUR = [
  'serveur "contact" :',
  '>donnee message :',
  '>>email : texte',
  '>>contenu : texte',
  '>route "messages" :',
  '>>tout le monde peut lire message',
  '>>tout le monde peut creer message',
  '>>seul admin peut modifier message',
];

/** Une page « contact » : formulaire ligne 10, champs 11 et 12, bouton 13, événement 14. */
const contact = (...evenement: string[]) =>
  programme(
    ...SERVEUR,
    'page "contact" :',
    '>formulaire "message" :',
    '>>champ "email"',
    '>>champ "contenu"',
    '>>bouton "Envoyer"',
    ...(evenement.length
      ? evenement
      : [
          '>quand le formulaire "message" est soumis :',
          '>>envoyer requete vers "messages" avec champ "email" et champ "contenu"',
          '>>afficher "Merci !"',
        ]),
  );

const projetWeb = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return genererProjetWeb(application!, { nom: 'contact', adresse: 'https://contact.exemple.cd', source: 'contact.humalis' });
};
const projetMobile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return genererProjetMobile(application!, { nom: 'contact', source: 'contact.humalis' });
};

describe('formulaire — parser', () => {
  it('lit le bloc « formulaire "…" : » et ses champs', () => {
    const page = analyserSyntaxe(analyser(contact())).pages[0];
    expect(page.corps[0]).toMatchObject({
      type: 'Formulaire',
      nom: 'message',
      ligne: 10,
      corps: [
        { type: 'Element', element: 'champ', ligne: 11 },
        { type: 'Element', element: 'champ', ligne: 12 },
        { type: 'Element', element: 'bouton', ligne: 13 },
      ],
    });
    expect(page.corps[1]).toMatchObject({ type: 'Evenement', genre: 'soumission', cible: 'message', ligne: 14 });
  });

  it('demande les deux-points après le nom du formulaire', () => {
    expect(() => analyserSyntaxe(analyser(programme('page "a" :', '>formulaire "message"', '>>champ "email"')))).toThrow(
      'Ligne 2 : il manque deux-points après le nom du formulaire',
    );
  });

  it('« formulaire » reste un nom de variable possible', () => {
    expect(erreurs(programme('page "a" :', '>variable formulaire = "x"', '>texte formulaire'))).toEqual([]);
  });
});

describe('formulaire — analyse', () => {
  it('accepte un formulaire et son événement, sans avertissement', () => {
    expect(erreurs(contact())).toEqual([]);
    expect(avertissements(contact())).toEqual([]);
  });

  it('n’a plus l’avertissement « pas encore pris en charge »', () => {
    expect(avertissements(contact()).join('\n')).not.toContain('pas encore pris en charge');
  });

  it('refuse un événement sur un formulaire qui n’existe pas', () => {
    expect(erreurs(contact('>quand le formulaire "inscription" est soumis :', '>>afficher "Merci"'))).toEqual([
      '14 : le formulaire « inscription » n’existe pas dans cette page. Formulaires de la page : message.',
    ]);
  });

  it('dit comment créer le formulaire quand la page n’en a aucun', () => {
    expect(erreurs(programme('page "a" :', '>quand le formulaire "connexion" est soumis :', '>>afficher "ok"'))).toEqual([
      '2 : le formulaire « connexion » n’existe pas dans cette page : créez-le avec formulaire "connexion" : suivi de ses champs et d’un bouton.',
    ]);
  });

  it('avertit quand un formulaire n’a pas d’événement « est soumis »', () => {
    expect(avertissements(programme('page "a" :', '>formulaire "message" :', '>>champ "email"', '>>bouton "Envoyer"'))).toEqual([
      '2 : le formulaire « message » n’envoie rien : ajoutez quand le formulaire "message" est soumis : suivi de ce qu’il faut faire.',
    ]);
  });

  it('refuse deux formulaires du même nom', () => {
    const source = programme(
      'page "contact" :',
      '>formulaire "message" :',
      '>>champ "email"',
      '>formulaire "message" :',
      '>>champ "nom"',
      '>quand le formulaire "message" est soumis :',
      '>>afficher "ok"',
    );
    expect(erreurs(source)).toEqual(['4 : le formulaire « message » existe déjà dans cette page (ligne 2).']);
  });

  it('refuse deux événements « est soumis » pour le même formulaire', () => {
    const source = contact(
      '>quand le formulaire "message" est soumis :',
      '>>afficher "Un"',
      '>quand le formulaire "message" est soumis :',
      '>>afficher "Deux"',
    );
    expect(erreurs(source)).toEqual([
      '16 : le formulaire « message » a déjà son événement « est soumis » (ligne 14) : réunissez les deux dans le même événement.',
    ]);
  });

  it('refuse un formulaire dans un événement', () => {
    const source = programme(
      'page "contact" :',
      '>bouton "Écrire"',
      '>quand l\'utilisateur clique sur "Écrire" :',
      '>>formulaire "message" :',
      '>>>champ "email"',
    );
    expect(erreurs(source)).toEqual([
      '4 : un formulaire ne peut pas être créé dans un événement. Placez-le dans la page, puis utilisez montrer "…" pour le faire apparaître.',
    ]);
  });

  it('refuse un formulaire dans un formulaire', () => {
    const source = programme(
      'page "contact" :',
      '>formulaire "message" :',
      '>>champ "email"',
      '>>formulaire "adresse" :',
      '>>>champ "ville"',
      '>quand le formulaire "message" est soumis :',
      '>>afficher "ok"',
    );
    expect(erreurs(source)).toContain('4 : un formulaire ne peut pas contenir un autre formulaire : placez « adresse » à côté de « message ».');
  });

  it('accepte l’événement écrit dans le bloc du formulaire, sous ses champs (décision F2)', () => {
    const source = programme(
      'page "contact" :',
      '>formulaire "message" :',
      '>>champ "email"',
      '>>quand le formulaire "message" est soumis :',
      '>>>afficher "ok"',
    );
    expect(erreurs(source)).toEqual([]);
  });

  it('accepte un formulaire dans une condition ou dans une boucle', () => {
    const source = programme(
      'page "contact" :',
      '>variable sujets = ["A", "B"]',
      '>variable ouvert = vrai',
      '>si ouvert est vrai :',
      '>>formulaire "message" :',
      '>>>champ "email"',
      '>>>bouton "Envoyer"',
      '>quand le formulaire "message" est soumis :',
      '>>afficher "ok"',
      '>pour chaque sujet dans sujets :',
      '>>formulaire "avis" :',
      '>>>champ "note"',
      '>>quand le formulaire "avis" est soumis :',
      '>>>afficher "Merci pour {sujet}"',
    );
    expect(erreurs(source)).toEqual([]);
    expect(avertissements(source)).toEqual([]);
  });

  it('montre et cache un formulaire par son nom', () => {
    const source = programme(
      'page "contact" :',
      '>bouton "Écrire"',
      '>formulaire "message" :',
      '>>champ "email"',
      '>quand le formulaire "message" est soumis :',
      '>>cacher "message"',
      '>quand l\'utilisateur clique sur "Écrire" :',
      '>>montrer "message"',
    );
    expect(erreurs(source)).toEqual([]);
    const page = projetWeb(source).get('src/pages/Contact.tsx')!;
    expect(page).toContain("useState<Record<string, boolean>>({ 'formulaire_message': false })");
    expect(page).toContain("{visibilite['formulaire_message'] && (");
  });

  it('vise les champs et le bouton du formulaire depuis la page', () => {
    const source = contact('>quand l\'utilisateur clique sur "Envoyer" :', '>>si champ "email" est vide :', '>>>afficher erreur "Email requis"');
    expect(erreurs(source)).toEqual([]);
  });
});

describe('formulaire — cible web', () => {
  const page = projetWeb(contact()).get('src/pages/Contact.tsx')!;

  it('produit une vraie balise <form> envoyée par Entrée ou par le bouton', () => {
    expect(page).toContain(
      '<form data-humalis="formulaire_message" className="humalis-formulaire" noValidate onSubmit={(evenement) => { evenement.preventDefault(); void quandSoumisMessage(); }}>',
    );
    expect(page).toContain('<button type="submit" data-humalis="bouton_envoyer">Envoyer</button>');
    expect(page).toContain('</form>');
  });

  it('vide les champs après un envoi réussi, et s’arrête après un échec', () => {
    expect(page).toContain(
      [
        '  async function quandSoumisMessage() {',
        '    const echecs = serveur.echecs();',
        "    await serveur.envoyer('/api/messages', { email: champEmail, contenu: champContenu });",
        '    if (serveur.echecs() > echecs) return;',
        "    afficherMessage('Merci !', 'info');",
        "    setChampEmail('');",
        "    setChampContenu('');",
        '  }',
      ].join('\n'),
    );
    const serveur = projetWeb(contact()).get('src/humalis/serveur.ts')!;
    expect(serveur).toContain('echecs: () => echecs.current');
    expect(serveur).toContain('echecs.current += 1;');
  });

  it('vide les champs tout de suite quand il n’y a pas de requête', () => {
    const simple = projetWeb(contact('>quand le formulaire "message" est soumis :', '>>afficher "Merci"')).get('src/pages/Contact.tsx')!;
    expect(simple).toContain("  function quandSoumisMessage() {\n    afficherMessage('Merci', 'info');\n    setChampEmail('');\n    setChampContenu('');\n  }");
    expect(simple).not.toContain('echecs');
  });

  it('ne vide rien après une connexion refusée (« se connecter » sort de l’événement)', () => {
    const source = programme(
      'serveur "avis" :',
      '>donnee avis :',
      '>>commentaire : texte',
      '>route "avis" :',
      '>>tout le monde peut lire avis',
      '>>connecte peut creer avis',
      'page "connexion" :',
      '>formulaire "connexion" :',
      '>>champ email "Email"',
      '>>champ mot de passe "Mot de passe"',
      '>>bouton "Se connecter"',
      '>quand le formulaire "connexion" est soumis :',
      '>>se connecter avec champ "Email" et champ "Mot de passe"',
      '>>afficher "Bienvenue"',
    );
    const code = projetWeb(source).get('src/pages/Connexion.tsx')!;
    expect(code).toContain(
      "    if (!(await utilisateur.seConnecter(champEmail, champMotDePasse))) return;\n    afficherMessage('Bienvenue', 'info');\n    setChampEmail('');\n",
    );
    // Les champs de « se connecter » gardent leur rôle pour le navigateur.
    expect(code).toContain('type="email" autoComplete="username"');
    expect(code).toContain('type="password" autoComplete="current-password"');
  });

  it('garde « type="button" » pour un bouton qui a son propre clic', () => {
    const source = contact('>quand l\'utilisateur clique sur "Envoyer" :', '>>afficher "Clic"');
    const code = projetWeb(source).get('src/pages/Contact.tsx')!;
    expect(code).toContain('<button type="button" data-humalis="bouton_envoyer" onClick={quandCliqueEnvoyer}>Envoyer</button>');
    expect(code).toContain('onSubmit={(evenement) => evenement.preventDefault()}');
  });

  it('passe la variable de la boucle à la soumission', () => {
    const source = programme(
      'page "avis" :',
      '>variable sujets = ["A", "B"]',
      '>pour chaque sujet dans sujets :',
      '>>formulaire "avis" :',
      '>>>champ "note"',
      '>>quand le formulaire "avis" est soumis :',
      '>>>afficher "Merci pour {sujet}"',
    );
    const code = projetWeb(source).get('src/pages/Avis.tsx')!;
    expect(code).toContain('void quandSoumisAvis(sujet); }}>');
    expect(code).toContain('function quandSoumisAvis(sujet: string) {');
  });

  it('ajoute les styles des formulaires seulement quand il y en a', () => {
    expect(projetWeb(contact()).get('src/humalis/styles.css')).toContain('.humalis-formulaire');
    const sans = projetWeb(programme('page "a" :', '>champ "email"')).get('src/humalis/styles.css')!;
    expect(sans).not.toContain('.humalis-formulaire');
  });
});

describe('formulaire — cible mobile', () => {
  const projet = projetMobile(contact());
  const page = projet.get('app/index.tsx')!;

  it('regroupe les champs, et envoie par le bouton ou la touche du clavier', () => {
    expect(page).toContain('<View testID="formulaire_message" style={s.formulaire}>');
    expect(page).toContain(
      '<Pressable testID="bouton_envoyer" accessibilityRole="button" style={s.bouton} onPress={quandSoumisMessage}><Text style={s.texteBouton}>Envoyer</Text></Pressable>',
    );
    expect(page).toContain('returnKeyType="send" onSubmitEditing={quandSoumisMessage}');
    expect(projet.get('humalis/serveur.ts')).toContain('echecs: () => echecs.current');
    expect(projet.get('humalis/styles.ts')).toContain('formulaire: {');
  });

  it('vide les champs après un envoi réussi', () => {
    expect(page).toContain("    if (serveur.echecs() > echecs) return;\n    afficherMessage('Merci !', 'info');\n    setChampEmail('');");
  });
});
