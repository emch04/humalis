import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from './aide-qualite.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const corps = (...lignes: string[]) => analyserSyntaxe(analyser(programme('page "a" :', ...lignes))).pages[0].corps;
const element = (ligne: string) => corps(`>${ligne}`)[0];

const pageWeb = (source: string, fichier = 'src/pages/A.tsx') => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return genererProjetWeb(application!, { nom: 'a', adresse: 'https://a.exemple.cd', source: 'a.humalis' }).get(fichier)!;
};
const pageMobile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return genererProjetMobile(application!, { nom: 'a', source: 'a.humalis' }).get('app/index.tsx')!;
};

/** Un formulaire d'une page « a » qui contient ces lignes, puis son événement. */
const formulaire = (...lignes: string[]) =>
  programme('page "a" :', '>formulaire "f" :', ...lignes.map((l) => `>>${l}`), '>>bouton "Envoyer"', '>quand le formulaire "f" est soumis :', '>>afficher "Merci"');

describe('champs — parser : la sorte après « champ »', () => {
  it.each([
    ['champ "Nom"', undefined],
    ['champ texte "Nom"', 'texte'],
    ['champ email "Email"', 'email'],
    ['champ e-mail "Email"', 'email'],
    ['champ telephone "Téléphone"', 'telephone'],
    ['champ téléphone "Téléphone"', 'telephone'],
    ['champ nombre "Âge"', 'nombre'],
    ['champ date "Naissance"', 'date'],
    ['champ heure "Rendez-vous"', 'heure'],
    ['champ mot de passe "Secret"', 'motDePasse'],
    ['champ mot_de_passe "Secret"', 'motDePasse'],
    ['champ mot-de-passe "Secret"', 'motDePasse'],
    ['champ texte long "Message"', 'texteLong'],
    ['champ texte_long "Message"', 'texteLong'],
    ['champ adresse web "Site"', 'adresseWeb'],
    ['champ adresse_web "Site"', 'adresseWeb'],
    ['case a cocher "J\'accepte"', 'case'],
    ['case à cocher "J\'accepte"', 'case'],
    ['Case à cocher "J\'accepte"', 'case'],
    ['case_a_cocher "J\'accepte"', 'case'],
    ['case-à-cocher "J\'accepte"', 'case'],
    ['choix "Taille" parmi ["S", "M"]', 'choix'],
    ['liste deroulante "Pays" parmi ["Congo"]', 'liste'],
    ['liste déroulante "Pays" parmi ["Congo"]', 'liste'],
  ])('« %s »', (ligne, sorte) => {
    const e = element(ligne);
    expect(e).toMatchObject({ type: 'Element', element: 'champ' });
    expect((e as { sorte?: string }).sorte).toBe(sorte);
  });

  it('garde l’arbre des anciens champs tel quel', () => {
    expect(element('champ "email"')).toEqual({
      type: 'Element',
      element: 'champ',
      contenu: { type: 'Chaine', parties: [{ type: 'texte', valeur: 'email' }], ligne: 2 },
      styles: [],
      classes: [],
      nom: undefined,
      cible: undefined,
      ligne: 2,
    });
  });

  it('ne lit pas une sorte sans libellé entre guillemets : « champ email » reste le champ de la variable email', () => {
    const [, e] = corps('>variable email = "Adresse"', '>champ email');
    expect(e).toMatchObject({ element: 'champ', contenu: { type: 'Reference', nom: 'email' } });
    expect((e as { sorte?: string }).sorte).toBeUndefined();
  });

  it('lit « parmi » suivi d’une liste écrite ou d’une variable', () => {
    expect(element('choix "Taille" parmi ["S", "M"]')).toMatchObject({ parmi: { type: 'Liste' } });
    expect(corps('>variable pays = ["Congo"]', '>liste deroulante "Pays" parmi pays')[1]).toMatchObject({ parmi: { type: 'Reference', nom: 'pays' } });
  });

  it('demande « parmi » après un choix', () => {
    expect(() => element('choix "Taille"')).toThrow(
      'Ligne 2 : il manque « parmi » suivi des valeurs possibles, par exemple : choix "Taille" parmi ["S", "M", "L"]',
    );
  });

  it('lit les options obligatoire, indice, minimum et maximum', () => {
    expect(element('champ nombre "Places" avec obligatoire et minimum 1 et maximum 10 et couleur bleu')).toMatchObject({
      sorte: 'nombre',
      obligatoire: true,
      minimum: 1,
      maximum: 10,
      styles: [{ propriete: 'couleur', valeur: 'bleu' }],
    });
    expect(element('champ "Email" avec indice "vous@exemple.cd"')).toMatchObject({ indice: 'vous@exemple.cd' });
    expect(element('champ nombre "Écart" avec minimum -5')).toMatchObject({ minimum: -5 });
    expect(element('champ "Email" avec obligatoires')).toMatchObject({ obligatoire: true });
  });

  it('laisse « case », « choix », « liste » et « parmi » servir de noms de variables', () => {
    const source = programme(
      'page "a" :',
      '>variable case = 1',
      '>variable choix = "x"',
      '>variable liste = [1]',
      '>variable parmi = 2',
      '>variable telephone = "0"',
      '>texte "{case} {choix} {parmi} {telephone}"',
    );
    expect(erreurs(source)).toEqual([]);
    expect(avertissements(source)).toEqual([]);
  });
});

describe('champs — analyse', () => {
  it('donne un nombre pour un champ nombre, que l’on compare', () => {
    const source = programme(
      'page "a" :',
      '>formulaire "f" :',
      '>>champ nombre "Places"',
      '>quand le formulaire "f" est soumis :',
      '>>si champ "Places" est superieur a 3 :',
      '>>>afficher "Beaucoup"',
    );
    expect(erreurs(source)).toEqual([]);
    expect(erreurs(programme('page "a" :', '>champ "Places"', '>bouton "Ok"', '>quand l\'utilisateur clique sur "Ok" :', '>>si champ "Places" est superieur a 3 :', '>>>afficher "x"'))).toEqual([
      '5 : le champ « Places » est un texte ; « est supérieur à » compare des nombres.',
    ]);
  });

  it('donne un booléen pour une case à cocher', () => {
    const source = programme(
      'page "a" :',
      '>case a cocher "J\'accepte"',
      '>bouton "Ok"',
      '>quand l\'utilisateur clique sur "Ok" :',
      '>>si champ "J\'accepte" est vrai :',
      '>>>afficher "Merci"',
      '>>si champ "J\'accepte" est vide :',
      '>>>afficher "Vide"',
    );
    expect(erreurs(source)).toEqual([
      '7 : le champ « J\'accepte » est un booléen (vrai ou faux) ; « est vide » s\'applique à un texte ou à une liste.',
    ]);
  });

  it('vérifie les types envoyés au serveur', () => {
    const source = (champ: string) =>
      programme(
        'serveur "s" :',
        '>donnee commande :',
        '>>quantite : nombre',
        '>>cadeau : booleen',
        '>route "commandes" :',
        '>>tout le monde peut creer commande',
        'page "a" :',
        '>formulaire "f" :',
        `>>${champ}`,
        '>>case a cocher "cadeau"',
        '>quand le formulaire "f" est soumis :',
        '>>envoyer requete vers "commandes" avec champ "quantite" et champ "cadeau"',
      );
    expect(erreurs(source('champ nombre "quantite"'))).toEqual([]);
    expect(erreurs(source('champ "quantite"'))).toEqual([
      '12 : le champ « quantite » est un texte ; le champ « quantite » de « commande » attend un nombre.',
    ]);
  });

  it('demande une liste de textes après « parmi »', () => {
    expect(erreurs(programme('page "a" :', '>choix "Taille" parmi 3'))).toEqual([
      '2 : après « parmi », il faut une liste de textes, par exemple ["S", "M", "L"] ; ici, c’est un nombre.',
    ]);
    expect(erreurs(programme('page "a" :', '>choix "Taille" parmi [1, 2]'))).toEqual([
      '2 : après « parmi », il faut une liste de textes, par exemple ["S", "M", "L"] ; ici, c’est une liste de nombres.',
    ]);
    expect(erreurs(programme('page "a" :', '>choix "Taille" parmi tailles'))).toEqual([
      '2 : la variable « tailles » n\'est pas déclarée. Déclarez-la avec : variable tailles = …',
    ]);
  });

  it('refuse les options mal placées', () => {
    expect(erreurs(programme('page "a" :', '>bouton "Payer" avec obligatoire'))).toEqual([
      '2 : l’option « obligatoire » s’applique à un champ (champ, case à cocher, choix, liste déroulante), pas à un bouton.',
    ]);
    expect(erreurs(programme('page "a" :', '>champ "Nom" avec minimum 2'))).toEqual([
      '2 : l’option « minimum » s’applique à un champ nombre : écrivez champ nombre "…" avec minimum ….',
    ]);
    expect(erreurs(programme('page "a" :', '>case a cocher "Oui" avec indice "x"'))).toEqual([
      '2 : l’option « indice » ne s’applique pas à une case à cocher ni à un choix : il n’y a rien à écrire dedans.',
    ]);
    expect(erreurs(programme('page "a" :', '>champ nombre "Âge" avec minimum 10 et maximum 2'))).toEqual([
      '2 : le minimum (10) est plus grand que le maximum (2).',
    ]);
  });

  it('avertit qu’une vérification hors formulaire n’a pas lieu', () => {
    expect(avertissements(programme('page "a" :', '>champ "Nom" avec obligatoire'))).toEqual([
      '2 : « obligatoire », « minimum » et « maximum » sont vérifiés à l’envoi d’un formulaire : placez ce champ dans un bloc formulaire "…" :',
    ]);
    expect(avertissements(programme('page "a" :', '>champ "Nom" avec indice "Votre nom"'))).toEqual([]);
  });

  it('accepte un formulaire avec chaque sorte de champ', () => {
    const source = formulaire(
      'champ "Nom" avec obligatoire',
      'champ email "Email"',
      'champ telephone "Téléphone"',
      'champ nombre "Âge" avec minimum 0 et maximum 130',
      'champ date "Naissance"',
      'champ heure "Heure"',
      'champ mot de passe "Mot de passe"',
      'champ texte long "Présentation" avec indice "Quelques mots"',
      'champ adresse web "Site"',
      'case a cocher "J\'accepte" avec obligatoire',
      'choix "Taille" parmi ["S", "M", "L"]',
      'liste deroulante "Pays" parmi ["Congo", "France"] avec indice "Choisissez un pays"',
    );
    expect(erreurs(source)).toEqual([]);
    expect(avertissements(source)).toEqual([]);
  });
});

describe('champs — cible web', () => {
  const tout = pageWeb(
    formulaire(
      'champ "Nom" avec obligatoire',
      'champ email "Email" avec indice "vous@exemple.cd"',
      'champ telephone "Téléphone"',
      'champ nombre "Âge" avec minimum 0 et maximum 130',
      'champ date "Naissance"',
      'champ heure "Heure"',
      'champ mot de passe "Mot de passe"',
      'champ texte long "Présentation"',
      'champ adresse web "Site"',
      'case a cocher "J\'accepte" avec obligatoire',
      'choix "Taille" parmi ["S", "M", "L"]',
      'liste deroulante "Pays" parmi ["Congo", "France"] avec indice "Choisissez un pays"',
    ),
  );

  it('écrit le bon type de saisie pour chaque sorte', () => {
    expect(tout).toContain(
      '<label className="humalis-champ"><span>Nom<span className="humalis-obligatoire" aria-hidden="true"> *</span></span><input data-humalis="champ_nom" required value={champNom} onChange={(evenement) => setChampNom(evenement.target.value)} /></label>',
    );
    expect(tout).toContain('<input data-humalis="champ_email" type="email" autoComplete="email" placeholder="vous@exemple.cd" value={champEmail}');
    expect(tout).toContain('<input data-humalis="champ_telephone" type="tel" autoComplete="tel" value={champTelephone}');
    expect(tout).toContain('<input data-humalis="champ_age" type="number" min={0} max={130} value={champAge}');
    expect(tout).toContain('<input data-humalis="champ_naissance" type="date" value={champNaissance}');
    expect(tout).toContain('<input data-humalis="champ_heure" type="time" value={champHeure}');
    expect(tout).toContain('<input data-humalis="champ_mot_de_passe" type="password" autoComplete="new-password" value={champMotDePasse}');
    expect(tout).toContain(
      '<textarea data-humalis="champ_presentation" rows={4} value={champPresentation} onChange={(evenement) => setChampPresentation(evenement.target.value)} />',
    );
    expect(tout).toContain('<input data-humalis="champ_site" type="url" autoComplete="url" value={champSite}');
  });

  it('écrit la case, le choix et la liste déroulante', () => {
    expect(tout).toContain("const [champJAccepte, setChampJAccepte] = useState(false);");
    expect(tout).toContain(
      '<label className="humalis-case"><input data-humalis="champ_j_accepte" type="checkbox" required checked={champJAccepte} onChange={(evenement) => setChampJAccepte(evenement.target.checked)} /><span>J\'accepte<span className="humalis-obligatoire" aria-hidden="true"> *</span></span></label>',
    );
    expect(tout).toContain(
      "<fieldset data-humalis=\"champ_taille\" className=\"humalis-choix\"><legend>Taille</legend>{['S', 'M', 'L'].map((option) => (<label key={option}><input type=\"radio\" name=\"champ_taille\" value={option} checked={champTaille === option} onChange={() => setChampTaille(option)} />{option}</label>))}</fieldset>",
    );
    expect(tout).toContain(
      "<label className=\"humalis-champ\">Pays<select data-humalis=\"champ_pays\" value={champPays} onChange={(evenement) => setChampPays(evenement.target.value)}><option value=\"\">Choisissez un pays</option>{['Congo', 'France'].map((option) => (<option key={option} value={option}>{option}</option>))}</select></label>",
    );
  });

  it('vérifie les champs avant d’envoyer, avec un message en français', () => {
    expect(tout).toContain("    if (champNom.trim() === '') {\n      afficherMessage('Le champ « Nom » est obligatoire.', 'erreur');\n      return;\n    }");
    expect(tout).toContain("if (champEmail.trim() !== '' && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(champEmail.trim())) {");
    expect(tout).toContain("afficherMessage('« Email » n’a pas la forme d’une adresse email (par exemple nom@exemple.cd).', 'erreur');");
    expect(tout).toContain("if (champAge.trim() !== '' && Number.isNaN(Number(champAge.replace(',', '.')))) {");
    expect(tout).toContain("if (champAge.trim() !== '' && Number(champAge.replace(',', '.')) < 0) {");
    expect(tout).toContain("afficherMessage('« Âge » doit être au moins 0.', 'erreur');");
    expect(tout).toContain("afficherMessage('« Âge » doit être au plus 130.', 'erreur');");
    expect(tout).toContain("if (!champJAccepte) {\n      afficherMessage('Cochez « J\\'accepte » pour continuer.', 'erreur');");
    expect(tout).toContain("    setChampJAccepte(false);\n");
    expect(tout).toContain("    setChampTaille('');\n");
  });

  it('lit la valeur d’un champ nombre comme un nombre', () => {
    const source = programme(
      'serveur "s" :',
      '>donnee commande :',
      '>>quantite : nombre',
      '>route "commandes" :',
      '>>tout le monde peut creer commande',
      'page "a" :',
      '>formulaire "f" :',
      '>>champ nombre "quantite"',
      '>quand le formulaire "f" est soumis :',
      '>>envoyer requete vers "commandes" avec champ "quantite"',
    );
    expect(pageWeb(source)).toContain("await serveur.envoyer('/api/commandes', { quantite: Number(champQuantite.replace(',', '.')) });");
  });

  it('laisse un champ simple hors formulaire exactement comme avant', () => {
    expect(pageWeb(programme('page "a" :', '>champ "email"'))).toContain(
      '<label className="humalis-champ">email<input data-humalis="champ_email" value={champEmail} onChange={(evenement) => setChampEmail(evenement.target.value)} /></label>',
    );
  });
});

describe('champs — cible mobile', () => {
  const tout = pageMobile(
    formulaire(
      'champ "Nom" avec obligatoire',
      'champ email "Email" avec indice "vous@exemple.cd"',
      'champ telephone "Téléphone"',
      'champ nombre "Âge"',
      'champ date "Naissance"',
      'champ heure "Heure"',
      'champ mot de passe "Mot de passe"',
      'champ texte long "Présentation"',
      'champ adresse web "Site"',
      'case a cocher "J\'accepte"',
      'choix "Taille" parmi ["S", "M", "L"]',
      'liste deroulante "Pays" parmi ["Congo", "France"]',
    ),
  );

  it('ouvre le bon clavier pour chaque sorte', () => {
    expect(tout).toContain('<Text style={s.texte}>Nom *</Text>');
    expect(tout).toContain('keyboardType="email-address" autoComplete="email" autoCapitalize="none" placeholder="vous@exemple.cd"');
    expect(tout).toContain('keyboardType="phone-pad" autoComplete="tel"');
    expect(tout).toContain('testID="champ_age" accessibilityLabel="Âge" keyboardType="numeric"');
    expect(tout).toContain('keyboardType="numbers-and-punctuation" placeholder="AAAA-MM-JJ"');
    expect(tout).toContain('keyboardType="numbers-and-punctuation" placeholder="HH:MM"');
    expect(tout).toContain('secureTextEntry autoComplete="new-password" autoCapitalize="none"');
    expect(tout).toContain('multiline numberOfLines={4} textAlignVertical="top" style={[s.saisie, s.saisieLongue]}');
    expect(tout).toContain('keyboardType="url" autoComplete="url" autoCapitalize="none"');
  });

  it('écrit la case (Switch), le choix et la liste avec leurs rôles accessibles', () => {
    expect(tout).toContain("import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';");
    expect(tout).toContain('<Switch testID="champ_j_accepte" accessibilityLabel="J\'accepte" value={champJAccepte} onValueChange={setChampJAccepte} />');
    expect(tout).toContain('accessibilityRole="radiogroup"');
    expect(tout).toContain('accessibilityRole="radio" aria-checked={champTaille === option}');
    expect(tout).toContain('const [ouvertPays, setOuvertPays] = useState(false);');
    expect(tout).toContain('aria-expanded={ouvertPays}');
    expect(tout).toContain("{champPays || 'Choisissez…'} ▾");
  });

  it('vérifie aussi la forme de la date et de l’heure', () => {
    expect(tout).toContain("if (champNaissance.trim() !== '' && !/^\\d{4}-\\d{2}-\\d{2}$/.test(champNaissance.trim())) {");
    expect(tout).toContain("if (champHeure.trim() !== '' && !/^\\d{2}:\\d{2}$/.test(champHeure.trim())) {");
  });
});
