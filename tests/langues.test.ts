import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { readFileSync, readdirSync } from 'node:fs';
import { compilerProjet } from '../src/fichiers.js';
import { MESSAGES } from '../src/i18n/messages.js';
import { analyserSens } from '../src/analyse/analyse.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { FORMAT_JS_LANGUES } from '../src/cibles/format.js';
import { programme } from './analyse/aide.js';

// Plan 2026-10-30-qualite-publication, partie 1 (Q1 à Q6, acceptées par Emch) : les langues.
const lire = (...lignes: string[]) => analyserSyntaxe(analyser(programme(...lignes)));

const LANGUES = ['langues :', '>francais', '>anglais', ''];

describe('langues — le parseur', () => {
  it('lit le bloc « langues : », la première langue en tête', () => {
    const { langues } = lire(...LANGUES, 'page "a" :', '>titre "A"');
    expect(langues?.langues.map((l) => l.mot)).toEqual(['francais', 'anglais']);
  });

  it('accepte les accents : « français »', () => {
    const { langues } = lire('langues :', '>français', '>anglais', '', 'page "a" :', '>titre "A"');
    expect(langues?.langues[0].mot).toBe('francais');
  });

  it('lit « "…" en anglais "…" » après un titre, un texte, un bouton, un lien et un champ', () => {
    const { pages } = lire(
      ...LANGUES,
      'page "a" :',
      '>titre "Bienvenue" en anglais "Welcome"',
      '>texte "Bonjour" en anglais "Hello" avec couleur bleu',
      '>bouton "Ajouter" en anglais "Add"',
      '>lien "Panier" en anglais "Cart" vers "b"',
      '>champ "Nom" en anglais "Name"',
      'page "b" :',
      '>titre "B"',
    );
    const contenus = pages[0].corps.map((i) => (i as { contenu: { versions?: { langue: string; parties: { valeur: string }[] }[] } }).contenu);
    expect(contenus.map((c) => c.versions?.[0].parties[0].valeur)).toEqual(['Welcome', 'Hello', 'Add', 'Cart', 'Name']);
    expect(contenus.every((c) => c.versions?.[0].langue === 'anglais')).toBe(true);
    expect((pages[0].corps[1] as { styles: unknown[] }).styles).toHaveLength(1);
  });

  it('lit une version dans « afficher » et dans la valeur d’une variable', () => {
    const { pages } = lire(
      ...LANGUES,
      'page "a" :',
      '>variable salut = "Salut" en anglais "Hi"',
      '>bouton "Ok"',
      ">quand l'utilisateur clique sur \"Ok\" :",
      '>>afficher "Merci" en anglais "Thanks"',
    );
    const variable = pages[0].corps[0] as { valeur: { versions?: unknown[] } };
    expect(variable.valeur.versions).toHaveLength(1);
    const evenement = pages[0].corps[2] as { corps: { arguments: { versions?: unknown[] }[] }[] };
    expect(evenement.corps[0].arguments[0].versions).toHaveLength(1);
  });

  it('ne consomme pas « en » sans nom de langue suivi d’un texte', () => {
    const { pages } = lire('page "a" :', '>variable x = "a"', '>titre "A"');
    expect((pages[0].corps[0] as { valeur: { versions?: unknown } }).valeur.versions).toBeUndefined();
  });

  it('lit le bloc « traductions anglais : »', () => {
    const { traductions } = lire(
      ...LANGUES,
      'traductions anglais :',
      '>"Bienvenue" : "Welcome"',
      '>"{n article} dans le panier" : "{n item} in the cart"',
      '',
      'page "a" :',
      '>titre "Bienvenue"',
    );
    expect(traductions?.[0].langue).toBe('anglais');
    expect(traductions?.[0].entrees).toHaveLength(2);
    expect(traductions?.[0].entrees[1].texte.map((p) => p.type)).toEqual(['variable', 'texte']);
  });

  it('refuse une ligne de traduction sans deux-points', () => {
    expect(() => lire(...LANGUES, 'traductions anglais :', '>"Bienvenue" "Welcome"', '', 'page "a" :', '>titre "A"')).toThrow(/deux-points/);
  });

  it('lit « selecteur de langue » en tête de ligne, avec ses options', () => {
    const { pages } = lire(...LANGUES, 'page "a" :', '>selecteur de langue avec style "langues"', '>titre "A"');
    expect(pages[0].corps[0]).toMatchObject({ type: 'Element', element: 'selecteurLangue', classes: ['langues'] });
  });

  it('laisse « selecteur » et « langues » libres ailleurs', () => {
    const { pages } = lire('page "a" :', '>variable selecteur = 1', '>variable langues = ["fr"]', '>titre "A"');
    expect(pages[0].corps).toHaveLength(3);
  });

  it('refuse deux blocs « langues » et un bloc après les pages', () => {
    expect(() => lire(...LANGUES, ...LANGUES, 'page "a" :', '>titre "A"')).toThrow(/un seul bloc « langues »/);
    expect(() => lire('page "a" :', '>titre "A"', ...LANGUES)).toThrow(/en haut du fichier/);
  });

  it('un programme sans langues garde le même arbre', () => {
    const arbre = lire('page "a" :', '>titre "A"');
    expect('langues' in arbre).toBe(false);
    expect('traductions' in arbre).toBe(false);
    expect('versions' in (arbre.pages[0].corps[0] as { contenu: object }).contenu).toBe(false);
  });
});

describe('langues — l’analyse', () => {
  const diagnostics = (...lignes: string[]) =>
    analyserSens(analyserSyntaxe(analyser(programme(...lignes))))
      .diagnostics.filter((d) => d.categorie !== 'accessibilite')
      .map((d) => `${d.gravite} ${d.ligne} : ${d.message}`);
  const CLIC = ">quand l'utilisateur clique sur \"Ok\" :";

  it('un site de deux langues tout traduit compile sans remarque', () => {
    expect(
      diagnostics(
        ...LANGUES,
        'page "accueil" :',
        '>selecteur de langue',
        '>titre "Bienvenue" en anglais "Welcome"',
        '>variable n = 2',
        '>texte "{n article}" en anglais "{n item}"',
        '>bouton "Ok" en anglais "Switch"',
        CLIC,
        '>>si langue est anglais :',
        '>>>changer langue par francais',
        '>>sinon :',
        '>>>changer langue par anglais',
      ),
    ).toEqual([]);
  });

  it('refuse une version sans bloc « langues »', () => {
    expect(diagnostics('page "a" :', '>titre "Bienvenue" en anglais "Welcome"')).toEqual([
      expect.stringMatching(/^erreur 2 : ce texte a une version anglaise, mais le fichier ne déclare pas ses langues/),
    ]);
  });

  it('refuse une langue non déclarée, prévue ou inconnue', () => {
    expect(diagnostics(...LANGUES, 'page "a" :', '>titre "A" en espagnol "B" en anglais "A"')).toEqual([
      expect.stringMatching(/l'espagnol n'est pas dans le bloc « langues »\. Langues déclarées : français, anglais/),
    ]);
    expect(diagnostics('langues :', '>francais', '>espagnol', '', 'page "a" :', '>titre "A"')).toEqual([
      expect.stringMatching(/^erreur 3 : l'espagnol n'est pas encore disponible/),
    ]);
    expect(diagnostics('langues :', '>francais', '>anglai', '', 'page "a" :', '>titre "A"')).toEqual([
      expect.stringMatching(/« anglai » n'est pas une langue connue de Humalis.*Peut-être « anglais »/),
    ]);
  });

  it('refuse une version dans la langue des textes, et deux versions de la même langue', () => {
    expect(diagnostics(...LANGUES, 'page "a" :', '>titre "A" en francais "B" en anglais "A"')).toEqual([
      expect.stringMatching(/le texte écrit est déjà en français/),
    ]);
    expect(diagnostics(...LANGUES, 'page "a" :', '>titre "A" en anglais "B" en anglais "C"')).toEqual([
      expect.stringMatching(/deux versions anglaises pour le même texte/),
    ]);
  });

  it('avertit d’un texte visible sans version, avec la ligne', () => {
    const liste = diagnostics(...LANGUES, 'page "a" :', '>variable x = 1', '>titre "Bienvenue" en anglais "Welcome"', '>bouton "Voir le catalogue"', '>texte "{x}"');
    expect(liste).toEqual([expect.stringMatching(/^avertissement 8 : « Voir le catalogue » n'a pas de version anglaise/)]);
  });

  it('les avertissements de traduction ont leur catégorie', () => {
    const resultat = analyserSens(analyserSyntaxe(analyser(programme(...LANGUES, 'page "a" :', '>titre "Bienvenue"'))));
    expect(resultat.diagnostics.find((d) => /version anglaise/.test(d.message))?.categorie).toBe('traduction');
  });

  it('le bloc « traductions » compte comme une version', () => {
    expect(diagnostics(...LANGUES, 'traductions anglais :', '>"Bienvenue" : "Welcome"', '', 'page "a" :', '>titre "Bienvenue"')).toEqual([]);
  });

  it('avertit d’une traduction inutilisée en proposant le texte proche', () => {
    expect(diagnostics(...LANGUES, 'traductions anglais :', '>"Bienvenu" : "Welcome"', '', 'page "a" :', '>titre "Bienvenue" en anglais "Welcome"')).toEqual([
      expect.stringMatching(/^avertissement 6 : cette traduction ne sert à rien : aucun texte du programme ne s'écrit « Bienvenu »\. Peut-être « Bienvenue » \?/),
    ]);
  });

  it('avertit d’une version qui oublie une variable, refuse une variable inconnue', () => {
    expect(diagnostics(...LANGUES, 'page "a" :', '>variable total = 3', '>texte "Total : {total}" en anglais "Total"')).toEqual([
      expect.stringMatching(/la version anglaise n'utilise pas \{total\}/),
    ]);
    expect(diagnostics(...LANGUES, 'page "a" :', '>variable total = 3', '>texte "Total : {total}" en anglais "Total: {totl}"').join('\n')).toMatch(
      /erreur 7 : le texte utilise \{totl\}, mais la variable « totl » n'est pas déclarée/,
    );
  });

  it('refuse une version dans les valeurs d’un choix', () => {
    expect(diagnostics(...LANGUES, 'page "a" :', '>titre "A" en anglais "A"', '>choix "Taille" en anglais "Size" parmi ["Petit" en anglais "Small", "Grand"]').join('\n')).toMatch(
      /la valeur d'un choix est envoyée au serveur/,
    );
  });

  it('refuse une variable « langue » avec un bloc, la permet sans', () => {
    expect(diagnostics(...LANGUES, 'page "a" :', '>variable langue = "fr"', '>titre "A" en anglais "A"')).toEqual([
      expect.stringMatching(/^erreur 6 : « langue » est la langue choisie par la personne/),
    ]);
    expect(diagnostics('page "a" :', '>variable langue = "fr"', '>titre "{langue}"')).toEqual([]);
  });

  it('refuse « changer langue par » une langue non déclarée', () => {
    expect(diagnostics(...LANGUES, 'page "a" :', '>bouton "Ok" en anglais "Ok"', CLIC, '>>changer langue par espagnol')).toEqual([
      expect.stringMatching(/« changer langue par » attend une langue du bloc « langues » : francais ou anglais/),
    ]);
  });

  it('sans bloc, « langue » et « selecteur de langue » demandent le bloc', () => {
    expect(diagnostics('page "a" :', '>selecteur de langue', '>titre "A"').join('\n')).toMatch(/« selecteur de langue » demande un bloc « langues : »/);
    expect(diagnostics('page "a" :', '>bouton "Ok"', CLIC, '>>changer langue par anglais')).toEqual([
      expect.stringMatching(/« langue » est la langue choisie par la personne : déclarez d'abord les langues/),
    ]);
  });
});

const EXEMPLE = readFileSync(new URL('../exemples/deux-langues.humalis', import.meta.url), 'utf8');
const application = () => {
  const resultat = compiler(EXEMPLE);
  expect(resultat.diagnostics).toEqual([]);
  return resultat.application!;
};
const OPTIONS = { nom: 'rey', adresse: 'http://localhost', source: 'deux-langues.humalis' };

describe('langues — la représentation intermédiaire', () => {
  it('porte les langues, et les versions de chaque texte, celle de base en premier', () => {
    const a = application();
    expect(a.langues).toEqual([{ code: 'fr', nom: 'Français' }, { code: 'en', nom: 'English' }]);
    const titre = a.ecrans[0].vue.find((n) => n.type === 'element' && n.genre === 'titre');
    expect(titre?.type === 'element' && titre.contenu).toEqual({
      type: 'texte',
      parties: [{ texte: 'Bienvenue chez Rey Store' }],
      versions: [
        { code: 'fr', parties: [{ texte: 'Bienvenue chez Rey Store' }] },
        { code: 'en', parties: [{ texte: 'Welcome to Rey Store' }] },
      ],
    });
  });

  it('applique le bloc « traductions » aux textes qui s’écrivent pareil', () => {
    const bouton = application().ecrans[0].vue.find((n) => n.type === 'element' && n.genre === 'bouton');
    expect(bouton?.type === 'element' && bouton.contenu.type === 'texte' && bouton.contenu.versions?.[1]).toEqual({ code: 'en', parties: [{ texte: 'See the catalogue' }] });
  });

  it('« changer langue par anglais » devient une action ; « langue » se lit comme une valeur', () => {
    const json = JSON.stringify(application().ecrans[0].gestionnaires);
    expect(json).toContain('{"type":"langue","code":"en"}');
    expect(json).toContain('{"type":"variable","nom":"langue"}');
  });

  it('un programme sans langues n’a ni langues ni versions', () => {
    const a = compiler(programme('page "a" :', '>titre "A"')).application!;
    expect('langues' in a).toBe(false);
    expect(JSON.stringify(a)).not.toContain('versions');
  });
});

describe('langues — le web et le bureau', () => {
  it('les textes passent par t({ fr, en }), la page par useLangue()', () => {
    const page = genererProjetWeb(application(), OPTIONS).get('src/pages/Accueil.tsx')!;
    expect(page).toContain("{t({ fr: 'Bienvenue chez Rey Store', en: 'Welcome to Rey Store' })}");
    expect(page).toContain('const { t, langue, changerLangue } = useLangue();');
    expect(page).toContain("import { SelecteurLangue, useLangue } from '../humalis/langue';");
    expect(page).toContain('<SelecteurLangue className="humalis-selecteur-langue" />');
    expect(page).toContain("changerLangue('en');");
    expect(page).toContain("if (langue === 'en') {");
  });

  it('les montants et les pluriels suivent la langue de leur version', () => {
    const page = genererProjetWeb(application(), OPTIONS).get('src/pages/Accueil.tsx')!;
    expect(page).toContain("t({ fr: `${accorder(panier, 'article')} dans le panier`, en: `${accorder(panier, 'item', 'en')} in the cart` })");
    expect(page).toContain("formaterArgent(total, 'EUR', 'en')");
  });

  it('langue.tsx garde la langue seulement après un choix, et pose <html lang>', () => {
    const fichiers = genererProjetWeb(application(), OPTIONS);
    const langue = fichiers.get('src/humalis/langue.tsx')!;
    expect(langue).toContain("export const LANGUES = ['fr', 'en'] as const;");
    expect(langue).toContain("export const NOMS_LANGUES: Record<Langue, string> = { fr: 'Français', en: 'English' };");
    // Une seule écriture du choix, dans changerLangue : jamais pour une langue seulement détectée.
    expect(langue.match(/localStorage\.setItem/g)).toHaveLength(1);
    expect(langue.indexOf('localStorage.setItem')).toBeGreaterThan(langue.indexOf('export function changerLangue'));
    expect(langue).toContain('document.documentElement.lang = langue;');
    expect(langue).toContain('<option key={code} value={code} lang={code}>');
    expect(fichiers.get('index.html')).toContain('<html lang="fr">');
  });

  it('le bureau a le même langue.tsx et la même page que le web', () => {
    const web = genererProjetWeb(application(), OPTIONS);
    const bureau = genererProjetDesktop(application(), { nom: 'rey', source: 'deux-langues.humalis' });
    expect(bureau.get('src/humalis/langue.tsx')).toBe(web.get('src/humalis/langue.tsx'));
    expect(bureau.get('src/pages/Accueil.tsx')).toBe(web.get('src/pages/Accueil.tsx'));
  });

  it('l’aperçu d’une page prend aussi sa version', () => {
    const source = programme(
      'langues :',
      '>francais',
      '>anglais',
      '',
      'page "accueil" :',
      '>apercu :',
      '>>titre "Rey Store, mode à Kinshasa" en anglais "Rey Store, fashion in Kinshasa"',
      '>titre "Bienvenue" en anglais "Welcome"',
    );
    const resultat = compiler(source);
    expect(resultat.diagnostics).toEqual([]);
    const page = genererProjetWeb(resultat.application!, OPTIONS).get('src/pages/Accueil.tsx')!;
    expect(page).toContain("usePage(t({ fr: 'Rey Store, mode à Kinshasa', en: 'Rey Store, fashion in Kinshasa' })");
  });

  it('sans langues : ni langue.tsx, ni t()', () => {
    const fichiers = genererProjetWeb(compiler(programme('page "a" :', '>titre "A"')).application!, OPTIONS);
    expect(fichiers.has('src/humalis/langue.tsx')).toBe(false);
    expect([...fichiers.values()].some((c) => /\bt\(\{|useLangue/.test(c))).toBe(false);
  });
});

describe('langues — le mobile', () => {
  it('ajoute expo-localization et le stockage seulement avec des langues', () => {
    const avec = genererProjetMobile(application(), { nom: 'rey', source: 'deux-langues.humalis' });
    const paquet = JSON.parse(avec.get('package.json')!);
    expect(paquet.dependencies['expo-localization']).toBe('57.0.2');
    expect(paquet.dependencies['@react-native-async-storage/async-storage']).toBeDefined();
    expect(avec.get('humalis/langue.tsx')).toContain('getLocales()');
    expect(avec.get('app/index.tsx')).toContain("t({ fr: 'Bienvenue chez Rey Store', en: 'Welcome to Rey Store' })");
    const sans = genererProjetMobile(compiler(programme('page "a" :', '>titre "A"')).application!, { nom: 'a', source: 'a.humalis' });
    expect(JSON.parse(sans.get('package.json')!).dependencies['expo-localization']).toBeUndefined();
    expect(sans.has('humalis/langue.tsx')).toBe(false);
  });
});

describe('langues — le site statique', () => {
  it('le HTML de départ est dans la langue de base, le script traduit', () => {
    const fichiers = genererProjetStatique(application(), { nom: 'rey', source: 'deux-langues.humalis' });
    const html = fichiers.get('index.html')!;
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('>Bienvenue chez Rey Store</h1>');
    expect(html).not.toContain('Welcome');
    const script = fichiers.get('pages/accueil.js')!;
    expect(script).toContain("t({ fr: 'Bienvenue chez Rey Store', en: 'Welcome to Rey Store' })");
    expect(script).toContain("if (langue() === 'en') {");
    const outils = fichiers.get('humalis/humalis.js')!;
    expect(outils).toContain("localStorage.setItem('humalis-langue', code);");
    expect(outils.match(/localStorage\.setItem\('humalis-langue'/g)).toHaveLength(1);
    expect(outils).toMatch(/return \{ [^}]*\bt, langue, changerLangue\b/);
  });
});

describe('langues — les montants et les pluriels', () => {
  const outils = new Function(`${FORMAT_JS_LANGUES}\nreturn { formaterArgent, accorder, formaterNombre, formaterDate };`)() as {
    formaterArgent: (v: number, d: string, l?: string) => string;
    accorder: (n: number, m: string, l?: string) => string;
    formaterNombre: (v: number, l?: string) => string;
    formaterDate: (v: string, l?: string) => string;
  };
  const espaces = (texte: string) => texte.replace(/[  ]/g, ' ');

  it('« {prix en euros} » : « 1 234,50 € » en français, « €1,234.50 » en anglais', () => {
    expect(espaces(outils.formaterArgent(1234.5, 'EUR'))).toBe('1 234,50 €');
    expect(outils.formaterArgent(1234.5, 'EUR', 'en')).toBe('€1,234.50');
    expect(outils.formaterArgent(12.5, 'USD', 'en')).toBe('$12.50');
    expect(outils.formaterArgent(15000, 'FC', 'en')).toBe('15,000 FC');
  });

  it('« {n article} » : 0, 1, 2 en français et en anglais', () => {
    expect([0, 1, 2].map((n) => outils.accorder(n, 'article'))).toEqual(['0 article', '1 article', '2 articles']);
    expect([0, 1, 2].map((n) => outils.accorder(n, 'item', 'en'))).toEqual(['0 items', '1 item', '2 items']);
    expect(outils.accorder(2, 'box', 'en')).toBe('2 boxes');
  });

  it('les nombres et les dates en anglais', () => {
    expect(outils.formaterNombre(28000, 'en')).toBe('28,000');
    expect(outils.formaterDate('2026-11-07', 'en')).toBe('7 November 2026');
  });
});

/** Un programme qui choisit un fichier : refusé sur le mobile et le site statique (seulement web et bureau). */
const webSeulement = (a: { ecrans: unknown[] }) => JSON.stringify(a.ecrans).includes('"genre":"fichier"');

describe('langues — les messages intégrés (T10)', () => {
  /** Les exemples du dépôt, avec un bloc « langues » ajouté en haut : chaque cible. */
  const projets = () =>
    readdirSync('exemples')
      .filter((f) => f.endsWith('.humalis'))
      .flatMap((f) => {
        const r = compilerProjet(f, (c) => {
          try {
            const texte = readFileSync(`exemples/${c}`, 'utf8');
            return c === f && !texte.includes('langues :') ? `langues :\n    francais\n    anglais\n\n${texte}` : texte;
          } catch {
            return undefined;
          }
        });
        // Un composant React demande son fichier, que ce test ne lit pas.
        if (!r.application || r.application.composantsReact.length > 0) return [];
        const a = r.application;
        return [
          genererProjetWeb(a, { nom: 'e', adresse: 'https://x.cd', source: f }),
          // Le choix d'un fichier n'est produit que pour le web et le bureau.
          ...(webSeulement(a) ? [] : [genererProjetMobile(a, { nom: 'e', source: f }), genererProjetStatique(a, { nom: 'e', source: f })]),
        ];
      });

  it('chaque message a ses deux langues, différentes', () => {
    for (const message of MESSAGES) {
      expect(message.fr.length * message.en.length).toBeGreaterThan(0);
      expect(message.en).not.toBe(message.fr);
    }
  });

  it('avec des langues, aucun message de Humalis n’est écrit en français seul dans les fichiers de Humalis', () => {
    const restes: string[] = [];
    for (const fichiers of projets()) {
      for (const [chemin, contenu] of fichiers) {
        // Les pages HTML de départ sont dans la langue de base ; les pages des exemples ont leurs propres textes.
        if (!/(^|\/)humalis\/|Introuvable|not-found|introuvable-humalis/.test(chemin) || chemin.endsWith('langue.tsx') || !/\.(tsx?|js)$/.test(chemin)) continue;
        const code = contenu.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const message of MESSAGES) {
          const sansT = code.split(/t\(\{[^\n]*?\}\)/).join('');
          // Le message écrit seul : entre apostrophes, guillemets, accents graves, ou comme texte JSX.
          if ([`'${message.fr.replace(/'/g, "\\'")}'`, JSON.stringify(message.fr), `\`${message.fr}\``, `>${message.fr}<`].some((forme) => sansT.includes(forme))) restes.push(`${chemin} : ${message.fr}`);
        }
      }
    }
    expect([...new Set(restes)]).toEqual([]);
  });

  it('les erreurs de champ prennent le libellé de la langue', () => {
    const contact = genererProjetWeb(application(), OPTIONS).get('src/pages/Contact.tsx')!;
    expect(contact).toContain("afficherMessage(t({ fr: 'Le champ « Email » est obligatoire.', en: 'The field “Email address” is required.' }), 'erreur');");
    const statique = genererProjetStatique(application(), { nom: 'rey', source: 'deux-langues.humalis' }).get('pages/contact.js')!;
    expect(statique).toContain("afficherMessage(t({ fr: 'Le champ « Email » est obligatoire.', en: 'The field “Email address” is required.' }), 'erreur');");
    expect(statique).toMatch(/const \{ [^}]*\bt\b[^}]* \} = humalis;/);
  });

  it('la page introuvable et les messages du serveur passent par t(), importé là où il faut', () => {
    const web = genererProjetWeb(application(), OPTIONS);
    const introuvable = web.get('src/Introuvable.tsx')!;
    expect(introuvable).toContain("import { t } from './humalis/langue';");
    expect(introuvable).toContain("<h1>{t({ fr: 'Page introuvable', en: 'Page not found' })}</h1>");
    expect(web.get('src/humalis/serveur.ts')).toContain("import { t } from './langue';");
    const statique = genererProjetStatique(application(), { nom: 'rey', source: 'deux-langues.humalis' });
    expect(statique.get('404.html')).toContain('<script src="pages/introuvable-humalis.js" defer></script>');
    expect(statique.get('pages/introuvable-humalis.js')).toContain("t({ fr: 'Page introuvable', en: 'Page not found' })");
  });

  it('sans langues, les exemples du dépôt n’ont ni t() ni langue.tsx', () => {
    for (const f of readdirSync('exemples').filter((x) => x.endsWith('.humalis') && !x.startsWith('deux-langues'))) {
      const r = compilerProjet(f, (c) => {
        try {
          return readFileSync(`exemples/${c}`, 'utf8');
        } catch {
          return undefined;
        }
      });
      if (!r.application || r.application.composantsReact.length > 0) continue;
      for (const fichiers of [genererProjetWeb(r.application, { nom: 'e', adresse: 'https://x.cd', source: f }), ...(webSeulement(r.application) ? [] : [genererProjetStatique(r.application, { nom: 'e', source: f })])]) {
        expect([...fichiers.entries()].filter(([, c]) => /\bt\(\{|humalis\/langue|humalis-langue/.test(c)).map(([n]) => `${f} ${n}`)).toEqual([]);
      }
    }
  });
});

describe('langues — le nom d’un fichier son ne se traduit pas', () => {
  it('« audio "extrait.mp3" » ne demande pas de version anglaise', () => {
    const r = compiler('langues :\n    francais\n    anglais\n\npage "a" :\n    titre "A" en anglais "A"\n    audio "extrait.mp3" avec description "Un extrait"\n');
    expect(r.diagnostics.map((d) => d.message).join('\n')).not.toMatch(/« extrait\.mp3 » n'a pas de version anglaise/);
  });
});
