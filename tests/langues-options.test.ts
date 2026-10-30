import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { MESSAGES, geometrieEnLangues, messageEnLangues } from '../src/i18n/messages.js';
import { programme } from './analyse/aide.js';

// Suite des langues : les textes des options (description, transcription, série,
// étiquettes, indice, bloc « site », aperçu), le libellé d'un fichier, et les
// messages intégrés des graphiques, de l'audio et du choix de fichier.
const LANGUES = ['langues :', '>francais', '>anglais', ''];
const lire = (...lignes: string[]) => analyserSyntaxe(analyser(programme(...lignes)));
const avertissements = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'avertissement').map((d) => d.message);
const erreurs = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);

describe('langues des options — le parseur', () => {
  it('lit « en anglais » après une description, une transcription, une série, un indice et le bloc site', () => {
    const p = lire(
      ...LANGUES,
      'site :',
      '>nom "Le Fleuve" en anglais "The River"',
      '>description "Cuisine du fleuve." en anglais "River cooking."',
      'page "a" :',
      '>audio "extrait.mp3" avec description "Un extrait" en anglais "An excerpt" et transcription "Bonjour" en anglais "Hello" et boucle',
      '>graphique en barres ventes avec etiquette mois et description "Ventes" en anglais "Sales" :',
      '>>serie "Ventes" en anglais "Sales" valeur montant',
      '>champ texte "Nom" avec indice "Votre nom" en anglais "Your name"',
    );
    expect(p.site?.textes?.nom?.versions?.[0].parties[0]).toMatchObject({ valeur: 'The River' });
    expect(p.site?.textes?.description?.versions).toHaveLength(1);
    const audio = p.pages[0].corps[0] as { styles: { propriete: string; texte?: { versions?: { parties: { valeur: string }[] }[] } }[] };
    expect(audio.styles.map((s) => s.texte?.versions?.[0].parties[0].valeur)).toEqual(['An excerpt', 'Hello', undefined]);
    const graphique = p.pages[0].corps[1] as { description: { versions?: unknown[] }; series: { texteNom?: { versions?: unknown[] } }[] };
    expect(graphique.description.versions).toHaveLength(1);
    expect(graphique.series[0].texteNom?.versions).toHaveLength(1);
    expect((p.pages[0].corps[2] as { indiceTexte?: { versions?: unknown[] } }).indiceTexte?.versions).toHaveLength(1);
  });

  it('accepte « en anglais » après le libellé d’un fichier', () => {
    const p = lire(...LANGUES, 'page "a" :', '>variable photo = rien', '>fichier "Choisir une photo" en anglais "Choose a photo" dans photo accepte images');
    expect((p.pages[0].corps[1] as { contenu: { versions?: unknown[] } }).contenu.versions).toHaveLength(1);
  });

  it('un texte sans version garde le même arbre (aucun champ en plus)', () => {
    const p = lire('page "a" :', '>audio "extrait.mp3" avec description "Un extrait"', '>champ texte "Nom" avec indice "Votre nom"');
    expect(JSON.stringify(p)).not.toMatch(/texte":\{|indiceTexte|texteNom|textes/);
  });

  it('« en » reste libre : « valeur montant en FC » n’est pas une version', () => {
    const p = lire(...LANGUES, 'page "a" :', '>graphique en barres ventes avec etiquette mois et description "V" en anglais "S" :', '>>serie "Ventes" valeur montant en FC');
    expect((p.pages[0].corps[0] as { series: { valeur: { devise: string } }[] }).series[0].valeur.devise).toBe('FC');
  });
});

const PROGRAMME = `langues :
    francais
    anglais

site :
    nom "Le Fleuve" en anglais "The River"
    description "Cuisine du fleuve, tous les soirs." en anglais "River cooking, every evening."

page "accueil" :
    apercu :
        titre "Accueil" en anglais "Home"
        description "Cuisine du fleuve, tous les soirs." en anglais "River cooking, every evening."
    titre "Le Fleuve" en anglais "The River"
    variable ventes = [fiche avec mois "Janvier" et montant 120000 et achats 90000, fiche avec mois "Février" et montant 180000 et achats 110000]
    variable visites = [120, 180]
    graphique en courbe ventes avec etiquette mois et valeur montant en FC et description "Les ventes montent." en anglais "Sales go up."
    graphique en barres ventes avec etiquette mois et description "Ventes et achats" en anglais "Sales and purchases" :
        serie "Ventes" en anglais "Sales" valeur montant en FC avec couleur bleu
        serie "Achats" en anglais "Purchases" valeur achats en FC avec couleur orange
    graphique en barres visites avec etiquettes ["Lun" en anglais "Mon", "Mar" en anglais "Tue"] et description "Visites" en anglais "Visits"
    audio "extrait.wav" avec description "Un extrait" en anglais "An excerpt" et transcription "Bonjour" en anglais "Hello"
    image "https://exemple.cd/logo.png" avec description "Notre logo" en anglais "Our logo"
    icone "etoile" avec description "Favori" en anglais "Favourite"
    champ texte "Nom" en anglais "Name" avec indice "Votre nom" en anglais "Your name"
    liste deroulante "Pays" en anglais "Country" parmi ["RDC", "France"] avec indice "Choisir" en anglais "Pick"
`;

describe('langues des options — l’analyse', () => {
  it('ne demande rien de plus quand chaque texte a sa version', () => {
    const r = compiler(PROGRAMME);
    expect(r.diagnostics.filter((d) => d.categorie === 'traduction')).toEqual([]);
  });

  it.each([
    ['la description d’un son', 'audio "extrait.wav" avec description "Un extrait" et transcription "Bonjour" en anglais "Hello"', 'Un extrait'],
    ['la transcription d’un son', 'audio "extrait.wav" avec description "Un extrait" en anglais "An excerpt" et transcription "Bonjour"', 'Bonjour'],
    ['la description d’une image', 'image "https://exemple.cd/a.png" avec description "Notre logo"', 'Notre logo'],
    ['la description d’une icône', 'icone "etoile" avec description "Favori"', 'Favori'],
    ['l’indice d’un champ', 'champ texte "Nom" en anglais "Name" avec indice "Votre nom"', 'Votre nom'],
    ['le nom d’une série', 'graphique en barres ventes avec etiquette mois et description "V" en anglais "S" :\n        serie "Ventes" valeur montant', 'Ventes'],
    ['la description d’un graphique', 'graphique en barres ventes avec etiquette mois et valeur montant et description "Les ventes"', 'Les ventes'],
  ])('avertit quand %s n’a pas de version anglaise', (_, ligne, texte) => {
    const source = `${programme(...LANGUES)}\npage "a" :\n    titre "A" en anglais "A"\n    variable ventes = [fiche avec mois "Janvier" et montant 1]\n    ${ligne}\n`;
    expect(avertissements(source).filter((m) => m.includes(`« ${texte} » n'a pas de version anglaise`))).toHaveLength(1);
  });

  it('avertit pour le nom et la description du site, et pour l’étiquette d’un graphique', () => {
    const source = `${programme(...LANGUES)}\nsite :\n    nom "Le Fleuve"\n    description "Cuisine du fleuve."\n\npage "a" :\n    titre "A" en anglais "A"\n    graphique en barres [1, 2] avec etiquettes ["Lun", "Mar" en anglais "Tue"] et description "V" en anglais "S"\n`;
    const m = avertissements(source).join('\n');
    expect(m).toContain("« Le Fleuve » n'a pas de version anglaise");
    expect(m).toContain("« Cuisine du fleuve. » n'a pas de version anglaise");
    expect(m).toContain("« Lun » n'a pas de version anglaise");
    expect(m).not.toContain("« Mar » n'a pas de version anglaise");
  });

  it('le bloc « traductions » s’applique aux options, sans « ne sert à rien »', () => {
    const source = `${programme(...LANGUES)}\ntraductions anglais :\n    "Un extrait" : "An excerpt"\n    "Votre nom" : "Your name"\n    "Ventes" : "Sales"\n\npage "a" :\n    titre "A" en anglais "A"\n    variable ventes = [fiche avec mois "Janvier" et montant 1]\n    audio "extrait.wav" avec description "Un extrait" et transcription "Salut" en anglais "Hi"\n    champ texte "Nom" en anglais "Name" avec indice "Votre nom"\n    graphique en barres ventes avec etiquette mois et description "V" en anglais "S" :\n        serie "Ventes" valeur montant\n`;
    const messages = compiler(source).diagnostics.map((d) => d.message).join('\n');
    expect(messages).not.toMatch(/ne sert à rien/);
    expect(messages).not.toMatch(/« (Un extrait|Votre nom|Ventes) » n'a pas de version/);
  });

  it('sans bloc « langues », une version écrite sur une option est refusée', () => {
    const e = erreurs('page "a" :\n    titre "A"\n    champ texte "Nom" avec indice "Votre nom" en anglais "Your name"\n');
    expect(e.join('\n')).toMatch(/ne déclare pas ses langues/);
  });

  it('la version d’une description lit les variables de la page', () => {
    const source = `${programme(...LANGUES)}\npage "a" :\n    titre "A" en anglais "A"\n    variable nom = "Rey"\n    image "https://exemple.cd/a.png" avec description "Photo de {nom}" en anglais "Photo of {inconnue}"\n`;
    expect(erreurs(source).join('\n')).toMatch(/inconnue/);
  });

  it('un indice ou le nom d’une série n’accepte pas de variable dans sa version', () => {
    const source = `${programme(...LANGUES)}\npage "a" :\n    titre "A" en anglais "A"\n    champ texte "Nom" en anglais "Name" avec indice "Votre nom" en anglais "Your {nom}"\n`;
    expect(erreurs(source).join('\n')).toMatch(/n'accepte pas de « \{variable\} »/);
  });
});

describe('langues des options — le code produit', () => {
  const application = () => {
    const r = compiler(PROGRAMME);
    expect(r.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    return r.application!;
  };
  const OPTIONS = { nom: 'rey', adresse: 'http://localhost', source: 'fleuve.humalis' };

  it('le web écrit t({ fr, en }) pour chaque texte d’option', () => {
    const page = genererProjetWeb(application(), OPTIONS).get('src/pages/Accueil.tsx')!;
    for (const attendu of [
      "description={t({ fr: 'Les ventes montent.', en: 'Sales go up.' })}",
      "nom: t({ fr: 'Ventes', en: 'Sales' })",
      "nom: t({ fr: 'Achats', en: 'Purchases' })",
      "etiquettes={[t({ fr: 'Lun', en: 'Mon' }), t({ fr: 'Mar', en: 'Tue' })]}",
      "aria-label={t({ fr: 'Un extrait', en: 'An excerpt' })}",
      "<summary>{t({ fr: 'Lire la transcription', en: 'Read the transcript' })}</summary><p>{t({ fr: 'Bonjour', en: 'Hello' })}</p>",
      "alt={t({ fr: 'Notre logo', en: 'Our logo' })}",
      "aria-label={t({ fr: 'Favori', en: 'Favourite' })}",
      "placeholder={t({ fr: 'Votre nom', en: 'Your name' })}",
      '<option value="">{t({ fr: \'Choisir\', en: \'Pick\' })}</option>',
      "titre={t({ fr: 'Graphique en courbe', en: 'Line chart' })}",
      "nomEtiquettes={t({ fr: 'Libellé', en: 'Label' })}",
      "nom: t({ fr: 'Valeur', en: 'Value' })",
    ]) {
      expect(page).toContain(attendu);
    }
    // Le titre de l’onglet porte le nom du site, dans la langue.
    expect(page).toContain("t({ fr: ' | Le Fleuve', en: ' | The River' })");
    expect(page).toContain("t({ fr: 'Cuisine du fleuve, tous les soirs.', en: 'River cooking, every evening.' })");
  });

  it('le nom d’un fichier son ne se traduit jamais', () => {
    const page = genererProjetWeb(application(), OPTIONS).get('src/pages/Accueil.tsx')!;
    expect(page).toContain('src="/audio/extrait.wav"');
    expect(page).not.toContain("t({ fr: 'extrait.wav'");
  });

  it('le site statique écrit les mêmes versions, dont le titre du graphique et la transcription', () => {
    const fichiers = genererProjetStatique(application(), { nom: 'rey', source: 'fleuve.humalis' });
    const page = fichiers.get('pages/accueil.js')!;
    for (const attendu of [
      "t({ fr: 'Ventes', en: 'Sales' })",
      "nomEtiquettes: t({ fr: 'Libellé', en: 'Label' })",
      "titre: t({ fr: 'Graphique en barres', en: 'Bar chart' })",
      "etiquettes: [t({ fr: 'Lun', en: 'Mon' }), t({ fr: 'Mar', en: 'Tue' })]",
      "t({ fr: 'Lire la transcription', en: 'Read the transcript' })",
      "icone('star', 'humalis-icone', t({ fr: 'Favori', en: 'Favourite' }))",
      "placeholder: t({ fr: 'Votre nom', en: 'Your name' })",
    ]) {
      expect(page).toContain(attendu);
    }
    // Le HTML de départ reste dans la langue de base.
    expect(fichiers.get('index.html')).toContain('Lire la transcription');
    const graphique = fichiers.get('humalis/graphique.js')!;
    expect(graphique).toContain("humalis.t({ fr: 'Voir les données', en: 'View the data' })");
    expect(graphique).toContain("humalis.t({ fr: 'Aucune donnée à afficher.', en: 'No data to display.' })");
    expect(graphique).toContain('humalis.formaterArgent(valeur, devise, humalis.langue())');
    expect(graphique).toContain('REGION_GRAPHIQUE');
  });

  it('le mobile écrit les mêmes versions, et son lecteur et son graphique suivent la langue', () => {
    const r = compiler(PROGRAMME.replace(/^site :[\s\S]*?\n\n/m, '').replace(/    apercu :[\s\S]*?    titre "Le Fleuve"/m, '    titre "Le Fleuve"'));
    const fichiers = genererProjetMobile(r.application!, { nom: 'rey', source: 'fleuve.humalis' });
    const page = fichiers.get('app/index.tsx')!;
    expect(page).toContain("accessibilityLabel={t({ fr: 'Favori', en: 'Favourite' })}");
    expect(page).toContain("description={t({ fr: 'Un extrait', en: 'An excerpt' })}");
    expect(page).toContain("placeholder={t({ fr: 'Votre nom', en: 'Your name' })}");
    expect(fichiers.get('humalis/lecteur.tsx')).toContain("t({ fr: 'Lire la transcription', en: 'Read the transcript' })");
    expect(fichiers.get('humalis/lecteur.tsx')).toContain('useLangue();');
    const graphique = fichiers.get('humalis/graphique.tsx')!;
    expect(graphique).toContain("t({ fr: 'Voir les données', en: 'View the data' })");
    expect(graphique).toContain("t({ fr: 'Cacher les données', en: 'Hide the data' })");
    expect(graphique).toContain('useLangue();');
    expect(graphique).toContain('langue: langueActuelle()');
  });

  it('le web traduit le graphique et le choix de fichier (messages, tailles, types)', () => {
    const source = `${PROGRAMME}    variable photo = rien\n    fichier "Choisir une photo" en anglais "Choose a photo" dans photo accepte images avec maximum 5 Mo\n`;
    const r = compiler(source);
    expect(r.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const fichiers = genererProjetWeb(r.application!, OPTIONS);
    const page = fichiers.get('src/pages/Accueil.tsx')!;
    expect(page).toContain("libelle={t({ fr: 'Choisir une photo', en: 'Choose a photo' })}");
    const graphique = fichiers.get('src/humalis/graphique.tsx')!;
    expect(graphique).toContain("{t({ fr: 'Voir les données', en: 'View the data' })}");
    expect(graphique).toContain("{t({ fr: 'Les données du graphique', en: 'The chart data' })}");
    expect(graphique).toContain("{t({ fr: 'Aucune donnée à afficher.', en: 'No data to display.' })}");
    expect(graphique).toContain('formaterArgent(valeur, devise, langueActuelle())');
    const geometrie = fichiers.get('src/humalis/graphique-geometrie.js')!;
    expect(geometrie).toContain("REGION_GRAPHIQUE = config.langue === 'en' ? 'en-US' : 'fr-FR';");
    expect(geometrie).not.toContain("toLocaleString('fr-FR'");
    expect(fichiers.get('src/humalis/graphique-geometrie.d.ts')).toContain('langue?: string;');
    const choix = fichiers.get('src/humalis/choix-fichier.tsx')!;
    expect(choix).toContain("t({ fr: ' Mo', en: ' MB' })");
    expect(choix).toContain("toLocaleString(t({ fr: 'fr-FR', en: 'en-US' })");
    expect(choix).toContain("get images() {\n    return t({ fr: 'une image', en: 'an image' });");
    expect(choix).toContain('is too large: ${ecrireTaille(fichier.size)}, the maximum is ${ecrireTaille(maximum)}.');
    expect(choix).toContain('useLangue();');
  });

  it('l’envoi d’un fichier traduit ses messages', () => {
    const source = `${PROGRAMME}    variable photo = rien\n    variable envoi = 0\n    fichier "Choisir une photo" en anglais "Choose a photo" dans photo accepte images\n    bouton "Envoyer" en anglais "Send"\n    quand l'utilisateur clique sur "Envoyer" :\n        envoyer fichier photo vers "api/photos" de la source "boutique" en corps brut suivi dans envoi\n`;
    // Les langues doivent rester en haut du fichier : la source vient après.
    const ordonne = source.replace('page "accueil" :', 'source "boutique" :\n    adresse "http://localhost:3000"\n    route "api/photos" :\n        creer photo\n    donnee photo :\n        fichier : texte\n\npage "accueil" :');
    const r = compiler(ordonne);
    expect(r.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const televerser = genererProjetWeb(r.application!, OPTIONS).get('src/humalis/televerser.ts')!;
    expect(televerser).toContain("t({ fr: 'Ce fichier est trop gros pour le serveur.', en: 'This file is too large for the server.' })");
    expect(televerser).toContain("t({ fr: 'Choisissez d\\'abord un fichier.', en: 'Choose a file first.' })");
  });

  it('chaque message ajouté est en deux langues différentes, et la table sait les retrouver', () => {
    for (const fr of ['Voir les données', 'Cacher les données', 'Aucune donnée à afficher.', 'Lire la transcription', 'Graphique en courbe', 'Valeur', 'Libellé']) {
      const message = MESSAGES.find((m) => m.fr === fr)!;
      expect(message.en).not.toBe(fr);
      expect(messageEnLangues(fr, ['fr', 'en'])).toEqual([{ code: 'fr', texte: fr }, { code: 'en', texte: message.en }]);
    }
    // Une seule langue : le message reste celui du code produit d’avant.
    expect(messageEnLangues('Valeur', ['fr'])).toBeUndefined();
    expect(messageEnLangues('Un texte qui n’y est pas', ['fr', 'en'])).toBeUndefined();
  });

  it('la géométrie ne change qu’avec des langues', () => {
    expect(geometrieEnLangues("function calculerGraphique(config, lignes, formater, largeur) {\n  x.toLocaleString('fr-FR');\n}")).toContain('REGION_GRAPHIQUE');
  });
});

describe('langues des options — sans bloc « langues », le code produit ne change pas', () => {
  const SANS = PROGRAMME.replace(/^langues :\n    francais\n    anglais\n\n/, '')
    .replace(/ en anglais "[^"]*"/g, '')
    .replace(/^site :[\s\S]*?\n\n/m, '');

  it('ni t(), ni useLangue, ni langueActuelle dans aucun fichier produit', () => {
    const r = compiler(SANS);
    expect(r.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const web = genererProjetWeb(r.application!, { nom: 'rey', adresse: 'http://localhost', source: 'fleuve.humalis' });
    const statique = genererProjetStatique(r.application!, { nom: 'rey', source: 'fleuve.humalis' });
    const mobile = genererProjetMobile(r.application!, { nom: 'rey', source: 'fleuve.humalis' });
    for (const fichiers of [web, statique, mobile]) {
      const traces = [...fichiers.entries()].filter(([, c]) => /\bt\(\{|useLangue|langueActuelle|REGION_GRAPHIQUE|humalis\.langue/.test(c)).map(([n]) => n);
      expect(traces).toEqual([]);
    }
    expect(web.get('src/humalis/graphique.tsx')).toContain('<summary>Voir les données</summary>');
    expect(web.get('src/humalis/graphique-geometrie.js')).toContain("toLocaleString('fr-FR'");
  });
});
