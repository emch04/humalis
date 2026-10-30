import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from './aide-qualite.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { chercherIcone, iconeProche, contientUnEmoji, ICONES } from '../src/vocabulaire/icones.js';
import { FORMES_LUCIDE } from '../src/cibles/icones-donnees.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const p = (...lignes: string[]) => programme('page "p" :', ...lignes);
const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;
const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const web = (source: string) => genererProjetWeb(compile(source), { nom: 'e', adresse: 'https://x.cd', source: 'e.humalis' });
const page = (fichiers: Map<string, string>, nom = 'P.tsx') => [...fichiers.entries()].find(([n]) => n.endsWith(nom))![1];
const statique = (source: string) => genererProjetStatique(compile(source), { nom: 'e', source: 'e.humalis' });
const mobile = (source: string) => genererProjetMobile(compile(source), { nom: 'e', source: 'e.humalis' });

describe('les icônes — la table', () => {
  it('chaque icône de Humalis a ses tracés (recopiés de Lucide) et un nom unique', () => {
    const noms = new Set<string>();
    for (const i of ICONES) {
      expect(FORMES_LUCIDE[i.lucide], i.nom).toBeTruthy();
      for (const nom of [i.nom, ...(i.alias ?? [])]) {
        expect(noms.has(nom), nom).toBe(false);
        noms.add(nom);
      }
    }
  });
  it('accepte les alias, sans souci des accents', () => {
    expect(chercherIcone('Caddie')?.nom).toBe('panier');
    expect(chercherIcone('connexion')?.nom).toBe('entree');
    expect(chercherIcone('inconnue')).toBeUndefined();
  });
  it('propose le nom le plus proche, et refuse les émojis', () => {
    expect(iconeProche('paniers')).toBe('panier');
    expect(iconeProche('xylophone')).toBeUndefined();
    expect(contientUnEmoji('🛒')).toBe(true);
    expect(contientUnEmoji('panier')).toBe(false);
  });
});

describe('éléments d’écran — le parser', () => {
  it('lit chaque élément en tête de ligne', () => {
    const noms = corps(
      p(
        '>variable n = 1',
        '>icone "panier"',
        '>badge "Nouveau"',
        '>avatar "Camille Martin"',
        '>progression n',
        '>chargement',
        '>chargement "Un instant"',
        '>etoiles n',
        '>compteur n',
        '>code qr "https://x.cd"',
      ),
    ).map((i) => (i.type === 'Element' ? i.element : i.type));
    expect(noms).toEqual(['Variable', 'icone', 'badge', 'avatar', 'progression', 'chargement', 'chargement', 'etoiles', 'compteur', 'qr']);
  });

  it('ces mots restent des noms ailleurs', () => {
    const source = p('>variable compteur = 1', '>variable badge = 2', '>variable code = 3', '>variable fil = 4', '>texte "{compteur} {badge} {code} {fil}"', '>compteur compteur');
    expect(erreurs(source)).toEqual([]);
  });

  it('lit les réglages : icone, description, photo, modifiable, ouvert, automatique, visibles', () => {
    const [e] = corps(p('>etoiles 3 avec description "Note" et modifiable et maximum 10'));
    expect(e).toMatchObject({ element: 'etoiles', maximum: 10, styles: [{ propriete: 'description', valeur: 'Note' }, { propriete: 'modifiable', valeur: 'oui' }] });
    const [a] = corps(p('>avatar "Emch" avec photo "{u.photo}"'));
    expect(a).toMatchObject({ styles: [{ propriete: 'photo', parties: [{ type: 'variable', valeur: 'u.photo' }] }] });
    const [c] = corps(p('>carrousel avec automatique et visibles 2 :', '>>texte "a"'));
    expect(c).toMatchObject({ type: 'Bloc', genre: 'carrousel', styles: [{ propriete: 'automatique', valeur: '5' }, { propriete: 'visibles', valeur: '2' }] });
  });

  it('lit les blocs : onglets, accordéon, dépliant, fil d’Ariane', () => {
    const instructions = corps(
      p(
        '>onglets :',
        '>>onglet "A" avec ouvert :',
        '>>>texte "a"',
        '>accordeon :',
        '>>deroulant "Q" :',
        '>>>texte "r"',
        "> fil d'Ariane :".replace('> ', '>'),
        '>>lien "Accueil" vers "p"',
        '>>texte "Ici"',
      ),
    );
    expect(instructions.map((i) => (i.type === 'Bloc' ? i.genre : i.type))).toEqual(['onglets', 'accordeon', 'filAriane']);
    const onglets = instructions[0] as { corps: { titre?: unknown; genre: string }[] };
    expect(onglets.corps[0]).toMatchObject({ genre: 'onglet', titre: { type: 'Chaine' } });
  });
});

describe('éléments d’écran — l’analyse', () => {
  it('refuse une icône inconnue en proposant la plus proche, et un émoji', () => {
    expect(erreurs(p('>icone "paniers"'))[0]).toContain('Peut-être « panier » ?');
    expect(erreurs(p('>icone "🛒"'))[0]).toContain('pas un émoji');
    expect(erreurs(p('>bouton "Ok" avec icone "inconnu"'))[0]).toContain('n\'existe pas');
  });

  it('un compteur change une variable de type nombre', () => {
    expect(erreurs(p('>compteur 3'))[0]).toContain('un compteur change une variable');
    expect(erreurs(p('>variable t = "a"', '>compteur t'))[0]).toContain('de type nombre');
    expect(erreurs(p('>variable q = 1', '>compteur q avec minimum 5 et maximum 2'))[0]).toContain('dépasse son maximum');
    expect(erreurs(p('>variable q = 1', '>compteur q avec minimum 1 et maximum 9'))).toEqual([]);
  });

  it('des étoiles modifiables changent une variable ; le maximum va de 1 à 10', () => {
    expect(erreurs(p('>etoiles 3 avec modifiable'))[0]).toContain('changent une variable');
    expect(erreurs(p('>etoiles 3 avec maximum 20'))[0]).toContain('de 1 à 10');
    expect(erreurs(p('>etoiles "bon"'))[0]).toContain('prennent un nombre');
  });

  it('une progression prend un nombre ; elle avertit si elle dépasse son maximum', () => {
    expect(erreurs(p('>progression "beaucoup"'))[0]).toContain('prend un nombre');
    expect(avertissements(p('>progression 120'))[0]).toContain('dépasse le maximum');
    expect(erreurs(p('>progression rien'))).toEqual([]);
  });

  it('un badge long est signalé ; un code QR trop long est refusé', () => {
    expect(avertissements(p('>badge "Une étiquette beaucoup trop longue"'))[0]).toContain('un badge est court');
    expect(erreurs(p(`>code qr "${'a'.repeat(3000)}"`))[0]).toContain('trop long pour un code QR');
  });

  it('chaque réglage dit où il se règle', () => {
    expect(erreurs(p('>texte "a" avec modifiable'))[0]).toContain('se règle seulement sur : etoiles');
    expect(erreurs(p('>icone "panier" avec ouvert'))[0]).toContain('se règle seulement sur : onglet, deroulant');
  });

  it('les blocs ont leur structure : onglets, accordéon, carrousel, fil d’Ariane', () => {
    expect(erreurs(p('>onglets :', '>>texte "a"')).join(' ')).toContain('ne contient que des onglets');
    expect(erreurs(p('>onglet "A" :', '>>texte "a"'))[0]).toContain('se place dans un bloc « onglets »');
    expect(erreurs(p('>onglets :', '>>onglet "A" avec ouvert :', '>>>texte "a"', '>>onglet "B" avec ouvert :', '>>>texte "b"'))[0]).toContain('un seul onglet');
    expect(erreurs(p('>accordeon :', '>>texte "a"')).join(' ')).toContain('ne contient que des deroulant');
    expect(erreurs(p('>carrousel avec visibles 9 :', '>>texte "a"'))[0]).toContain('de 1 à 4');
    expect(erreurs(p('>carrousel avec automatique 1 :', '>>texte "a"'))[0]).toContain('2 à 60');
    expect(erreurs(p("> fil d'Ariane :".replace('> ', '>'), '>>lien "A" vers "p"', '>>lien "B" vers "p"'))[0]).toContain('page en cours');
  });
});

describe('éléments d’écran — la représentation intermédiaire', () => {
  it('un élément d’écran est un nœud « widget » ; ses réglages ne sont pas des classes', () => {
    const { vue } = compile(p('>icone "caddie" avec taille grande et description "Panier"')).ecrans[0];
    expect(vue[0]).toMatchObject({
      type: 'widget',
      genre: 'icone',
      options: [{ nom: 'taille', valeur: 'grande' }],
      reglages: { description: 'Panier' },
    });
  });

  it('les onglets et les dépliants ont un état caché', () => {
    const ecran = compile(p('>onglets :', '>>onglet "A" :', '>>>texte "a"', '>>onglet "B" avec ouvert :', '>>>texte "b"', '>deroulant "D" avec ouvert :', '>>texte "x"', '>accordeon :', '>>deroulant "E" :', '>>>texte "e"')).ecrans[0];
    expect(ecran.etat.map((e) => [e.nom.replace(/_\d+$/, ''), (e.initiale as { valeur: unknown }).valeur])).toEqual([
      ['onglet', 1],
      ['ouvert', true],
      ['accordeon', -1],
    ]);
    expect(ecran.vue[0]).toMatchObject({ type: 'bloc', genre: 'onglets', corps: [{ genre: 'onglet', index: 0 }, { genre: 'onglet', index: 1 }] });
  });
});

describe('éléments d’écran — le web', () => {
  const source = programme(
    'page "p" :',
    '>variable note = 3',
    '>variable q = 1',
    '>icone "panier" avec description "Panier"',
    '>bouton "Ajouter" avec icone "plus"',
    '>badge "Nouveau" avec fond vert',
    '>avatar "Camille Martin" avec photo "camille.jpg"',
    '>etoiles note avec modifiable',
    '>compteur q avec minimum 1 et maximum 5',
    '>progression 40 avec pourcentage',
    '>chargement "Un instant"',
    '>code qr "https://x.cd" avec taille petite',
    '>onglets :',
    '>>onglet "A" :',
    '>>>texte "a"',
    '>>onglet "B" :',
    '>>>texte "b"',
    '>deroulant "Détails" :',
    '>>texte "d"',
    '>carrousel avec automatique 4 :',
    '>>texte "x"',
    '>>texte "y"',
  );
  const fichiers = web(source);
  const code = page(fichiers);

  it('écrit les éléments avec leurs rôles et leurs classes', () => {
    expect(code).toContain('<ShoppingCartIcon className="humalis-icone" role="img" aria-label="Panier" />');
    expect(code).toContain('<PlusIcon className="humalis-icone" aria-hidden="true" />Ajouter');
    expect(code).toContain('<span className="humalis-badge humalis-fond-vert">Nouveau</span>');
    expect(code).toContain('<Avatar nom={"Camille Martin"}'.replace('{"Camille Martin"}', "{'Camille Martin'}"));
    expect(code).toContain('<Etoiles valeur={note} maximum={5} onChange={setNote}');
    expect(code).toContain('<Compteur valeur={q} onChange={setQ} minimum={1} maximum={5}');
    expect(code).toContain('<progress className="humalis-progression" value={40} max={100}');
    expect(code).toContain('<span>{Math.round((40 / 100) * 100)} %</span>');
    expect(code).toContain('role="status"');
    expect(code).toContain('<QRCodeSVG value={\'https://x.cd\'} size={128}');
    expect(code).toContain('role="tablist"');
    expect(code).toContain('role="tab"');
    expect(code).toContain('aria-selected={onglet');
    expect(code).toContain('aria-expanded={ouvert');
    expect(code).toContain('<Carrousel automatique={4}');
  });

  it('importe seulement ce qui sert, et ajoute les dépendances', () => {
    expect(code).toContain("import { ShoppingCartIcon, PlusIcon } from 'lucide-react';");
    expect(code).toContain("import { QRCodeSVG } from 'qrcode.react';");
    expect(code).toContain("import Avatar from '../humalis/avatar';");
    expect(code).toContain("import { surToucheOnglets } from '../humalis/onglets';");
    for (const f of ['avatar.tsx', 'etoiles.tsx', 'compteur.tsx', 'carrousel.tsx', 'onglets.ts']) expect(fichiers.has(`src/humalis/${f}`), f).toBe(true);
    const dependances = JSON.parse(fichiers.get('package.json')!).dependencies;
    expect(dependances['lucide-react']).toBeDefined();
    expect(dependances['qrcode.react']).toBeDefined();
  });

  it('n’ajoute rien à un programme qui n’en a pas besoin', () => {
    const sans = web(p('>titre "a"'));
    expect([...sans.keys()].some((n) => /humalis\/(avatar|etoiles|compteur|carrousel|onglets)/.test(n))).toBe(false);
    expect(JSON.parse(sans.get('package.json')!).dependencies['lucide-react']).toBeUndefined();
    expect(sans.get('src/humalis/styles.css')).not.toContain('humalis-badge');
  });

  it('écrit le CSS de base des éléments utilisés seulement', () => {
    const css = fichiers.get('src/humalis/styles.css')!;
    expect(css).toContain('.humalis-badge {');
    expect(css).toContain('.humalis-onglet[aria-selected="true"]');
    expect(css).toContain('.humalis-carrousel-piste');
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(css).not.toContain('.humalis-fil ');
  });

  it('les composants des petits fichiers sont accessibles', () => {
    expect(fichiers.get('src/humalis/compteur.tsx')).toContain('aria-label="Diminuer"');
    expect(fichiers.get('src/humalis/etoiles.tsx')).toContain('role="radiogroup"');
    expect(fichiers.get('src/humalis/carrousel.tsx')).toContain('prefers-reduced-motion');
    expect(fichiers.get('src/humalis/carrousel.tsx')).toContain('aria-roledescription="carrousel"');
  });

  it('un élément dans une boucle, un « si » ou un onglet', () => {
    const f = web(p('>variable plats = ["a", "b"]', '>pour chaque x dans plats :', '>>badge x', '>si plats est vide :', '>>chargement'));
    expect(page(f)).toContain('<span className="humalis-badge">{x}</span>');
  });

  it('le desktop reprend le web et ses bibliothèques', () => {
    const bureau = genererProjetDesktop(compile(source), { nom: 'e', source: 'e.humalis' });
    const paquet = JSON.parse(bureau.get('package.json')!);
    expect(paquet.devDependencies['lucide-react']).toBeDefined();
    expect(paquet.devDependencies['qrcode.react']).toBeDefined();
    expect(page(bureau)).toBe(code);
  });
});

describe('éléments d’écran — le site statique', () => {
  const source = programme(
    'page "p" :',
    '>variable note = 3',
    '>variable q = 1',
    '>icone "panier" avec description "Panier"',
    '>bouton "Ajouter" avec icone "plus"',
    '>etoiles note avec modifiable',
    '>compteur q avec minimum 1 et maximum 5',
    '>code qr "https://x.cd"',
    '>onglets :',
    '>>onglet "A" :',
    '>>>texte "a"',
    '>>onglet "B" :',
    '>>>texte "b"',
    '>carrousel :',
    '>>texte "x"',
    '>>texte "y"',
  );
  const fichiers = statique(source);
  const html = fichiers.get('index.html')!;

  it('écrit le HTML de départ : SVG en ligne, onglets, compteur', () => {
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg" class="humalis-icone"');
    expect(html).toContain('role="img" aria-label="Panier"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('<output aria-live="polite">');
    expect(html).toContain('aria-roledescription="carrousel"');
    expect(html).toContain('<span class="humalis-qr humalis-qr"'.replace(' humalis-qr"', '"'));
  });

  it('écrit les outils du script, seulement ceux qui servent', () => {
    const outils = fichiers.get('humalis/humalis.js')!;
    expect(outils).toContain('function icone(nom, classe, label)');
    expect(outils).toContain('function etoiles(valeur, maximum, change, label, classes)');
    expect(outils).toContain('function codeQr(texte)');
    expect(outils).toContain('function activerCarrousels()');
    expect(outils).not.toContain('function avatar(');
    expect(outils).toContain('"shopping-cart"');
    expect(outils).toContain('"star"');
  });

  it('copie le code du code QR dans le site, et le charge dans la page qui l’utilise', () => {
    expect(fichiers.get('humalis/qrcode.js')).toContain('QR Code Generator for JavaScript');
    expect(html).toContain('<script src="humalis/qrcode.js" defer>');
    expect(fichiers.has('humalis/qrcode.js')).toBe(true);
    const sans = statique(p('>titre "a"'));
    expect(sans.has('humalis/qrcode.js')).toBe(false);
    expect(sans.get('humalis/humalis.js')).not.toContain('function icone');
  });

  it('les onglets changent l’état de la page, sans innerHTML', () => {
    const script = fichiers.get('pages/p.js')!;
    expect(script).toMatch(/onclick: \(\) => \{ onglet\d+ = 1; \}/);
    expect(script).not.toContain('innerHTML');
    expect(fichiers.get('humalis/humalis.js')).not.toContain('innerHTML');
  });

  it('l’icône d’un bouton est écrite avant son texte, en HTML et en script', () => {
    expect(html).toMatch(/<button[^>]*><svg[^>]*class="humalis-icone"[^>]*>.*<\/svg>Ajouter<\/button>/);
    expect(fichiers.get('pages/p.js')).toContain("icone('plus', 'humalis-icone'), \"Ajouter\"".replace('"Ajouter"', "'Ajouter'"));
  });
});

describe('éléments d’écran — le mobile', () => {
  const fichiers = mobile(
    programme(
      'page "p" :',
      '>variable note = 3',
      '>variable q = 1',
      '>icone "panier"',
      '>badge "Nouveau"',
      '>avatar "Camille Martin"',
      '>etoiles note avec modifiable',
      '>compteur q',
      '>progression 40',
      '>chargement',
      '>code qr "https://x.cd"',
      '>onglets :',
      '>>onglet "A" :',
      '>>>texte "a"',
      '>deroulant "D" :',
      '>>texte "d"',
      '>carrousel :',
      '>>texte "x"',
    ),
  );
  const code = fichiers.get('app/index.tsx')!;

  it('utilise les composants de React Native, Lucide et le code QR', () => {
    expect(code).toContain("import { ShoppingCartIcon } from 'lucide-react-native';");
    expect(code).toContain("import QRCode from 'react-native-qrcode-svg';");
    expect(code).toContain('<Icone icone={ShoppingCartIcon}');
    expect(code).toContain('<ActivityIndicator />');
    expect(code).toContain('accessibilityRole="tab"');
    expect(code).toContain('<QRCode value=');
    expect(code).toContain('<Carrousel>');
  });

  it('écrit les petits fichiers et les dépendances demandées', () => {
    for (const f of ['icone', 'avatar', 'progression', 'etoiles', 'compteur', 'carrousel']) expect(fichiers.has(`humalis/${f}.tsx`), f).toBe(true);
    const dependances = JSON.parse(fichiers.get('package.json')!).dependencies;
    expect(dependances['lucide-react-native']).toBeDefined();
    expect(dependances['react-native-svg']).toBeDefined();
    expect(dependances['react-native-qrcode-svg']).toBeDefined();
  });

  it('écrit les styles des éléments utilisés', () => {
    const styles = fichiers.get('humalis/styles.ts')!;
    expect(styles).toContain('badge:');
    expect(styles).toContain('onglets:');
    expect(styles).toContain('deroulantTitre:');
  });

  it('n’ajoute rien à un programme qui n’en a pas besoin', () => {
    const sans = mobile(p('>titre "a"'));
    expect(JSON.parse(sans.get('package.json')!).dependencies['lucide-react-native']).toBeUndefined();
    expect(sans.has('humalis/icone.tsx')).toBe(false);
  });
});
