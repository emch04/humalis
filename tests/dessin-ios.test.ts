import { describe, it, expect } from 'vitest';
import { CssExact, conditionMedia } from '../src/cibles/apple/css-exact.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import type { NoeudVue } from '../src/ri/types.js';

const bloc = (classes: string[], corps: NoeudVue[] = [], plateforme?: string): NoeudVue => ({ type: 'bloc', genre: 'bloc', options: [], classes, corps, ligne: 1, ...(plateforme ? { plateforme } : {}) }) as NoeudVue;
const DESSIN = { largeur: 1440, hauteur: 900 };

/** Les styles d'un code « varianteHumalis(…) » ou « StylesDessines.sN », lus en JSON. */
const styles = (exact: CssExact, code: string) => {
  const table = new Map([...exact.swift().matchAll(/static let (s\d+) = StyleHumalis\.lire\(#"(.*?)"#\)/g)].map((m) => [m[1], JSON.parse(m[2])]));
  return [...code.matchAll(/StylesDessines\.(s\d+)/g)].map((m) => table.get(m[1]));
};

describe('le dessin sur iPhone et iPad', () => {
  it('lit le mode sombre dans « @media »', () => {
    expect(conditionMedia('@media (prefers-color-scheme: dark)')).toEqual({ sombre: true });
    expect(conditionMedia('@media (max-width: 600px) and (prefers-color-scheme: light)')).toEqual({ max: 600, sombre: false });
  });

  it('découpe la largeur en plages ; le Mac garde la largeur du dessin', () => {
    const exact = new CssExact([{ css: '.b{width:1px}@media (max-width:599px){.b{width:2px}}@media (min-width:1024px){.b{width:3px}}' }], new Set());
    expect(exact.debutsDesPlages('ios')).toEqual([0, 599.01, 1024]);
    expect(exact.variantes('ios', DESSIN).map((v) => v.largeur)).toEqual([0, 599.01, 1024]);
    expect(exact.variantes('macos', DESSIN)).toEqual([{ largeur: 1440, sombre: false }]);
  });

  it('choisit le style à l’écran, plage par plage, puis clair ou sombre', () => {
    const b = bloc(['b']);
    const exact = new CssExact([{ css: '.b{width:1px}@media (max-width:599px){.b{width:2px}}@media (prefers-color-scheme:dark){.b{opacity:.5}}' }], new Set());
    const code = exact.resoudreVariantes([b], DESSIN, 'ios').de(b)!.code;
    expect(code).toMatch(/^varianteHumalis\(/);
    const lus = styles(exact, code);
    // Dans l'ordre : (étroit, clair), (étroit, sombre), (large, clair), (large, sombre).
    expect(lus.map((s) => s.la.p)).toEqual([2, 2, 1, 1]);
    expect(lus.map((s) => s.op)).toEqual([undefined, 0.5, undefined, 0.5]);
  });

  it('écrit un style qui ne change pas une seule fois', () => {
    const b = bloc(['b']);
    const exact = new CssExact([{ css: '.b{width:1px}@media (max-width:599px){.autre{width:2px}}' }], new Set());
    expect(exact.resoudreVariantes([b], DESSIN, 'ios').de(b)!.code).toMatch(/^StylesDessines\.s\d+$/);
  });

  it('ne cache pour de bon que ce qui est caché partout', () => {
    const b = bloc(['b']);
    const exact = new CssExact([{ css: '@media (max-width:599px){.b{display:none}}' }], new Set());
    const entree = exact.resoudreVariantes([b], DESSIN, 'ios').de(b)!;
    expect(entree.masque).toBe(false);
    expect(styles(exact, entree.code).map((s) => s.d)).toEqual(['none', 'block']);
  });

  it('suit la feuille, les blocs et les classes de son appareil', () => {
    const dansIos = bloc(['a']);
    const dansMac = bloc(['a']);
    const ios = bloc([], [dansIos], 'ios');
    const mac = bloc([], [dansMac], 'macos');
    const c = bloc(['ios:carte', 'macos:panneau']);
    const vue = [bloc(['x'], [ios, mac]), c];
    const exact = new CssExact([{ css: '.x{width:1px}.carte{width:5px}.panneau{width:6px}' }, { css: '.x{width:2px}', os: 'ios' }, { css: '.x{width:3px}', os: 'macos' }], new Set());
    const lireX = (os: 'ios' | 'macos') => styles(exact, exact.resoudreVariantes(vue, DESSIN, os).de(vue[0])!.code)[0].la.p;
    expect(lireX('ios')).toBe(2);
    expect(lireX('macos')).toBe(3);
    expect(exact.resoudreVariantes(vue, DESSIN, 'ios').de(dansIos)).toBeDefined();
    expect(exact.resoudreVariantes(vue, DESSIN, 'ios').de(dansMac)).toBeUndefined();
    expect(exact.resoudreVariantes(vue, DESSIN, 'macos').de(dansMac)).toBeDefined();
    expect(exact.resoudreVariantes(vue, DESSIN, 'macos').de(dansIos)).toBeUndefined();
    expect(styles(exact, exact.resoudreVariantes(vue, DESSIN, 'ios').de(c)!.code)[0].la.p).toBe(5);
    expect(styles(exact, exact.resoudreVariantes(vue, DESSIN, 'macos').de(c)!.code)[0].la.p).toBe(6);
  });

  it('garde le fond de la page, pour le dessiner sous l’encoche', () => {
    const b = bloc(['b']);
    const exact = new CssExact([{ css: 'body{background:#102030}' }], new Set());
    const fond = styles(exact, exact.resoudreVariantes([b], DESSIN, 'ios').fond)[0];
    expect(fond.fo[0].c).toEqual([0.063, 0.125, 0.188, 1]);
  });

  it('lit la couleur d’un seul bord', () => {
    const b = bloc(['b']);
    const exact = new CssExact([{ css: '.b{border:1px solid #ffffff;border-bottom-color:#000000}' }], new Set());
    const s = styles(exact, exact.resoudre([b], DESSIN).de(b)!.code)[0];
    expect(s.bd[0][1]).toEqual([1, 1, 1, 1]);
    expect(s.bd[2][1]).toEqual([0, 0, 0, 1]);
  });
});

describe('le projet Apple d’une page dessinée', () => {
  const source = [
    'utiliser style "./site.css"',
    'utiliser style "./ios.css" sur ios',
    '',
    'barre laterale avec style "barre" :',
    '    lien "Accueil" vers "accueil"',
    '',
    'page "accueil" dessinee pour 1440 par 900 :',
    '    bloc avec style "carte" :',
    '        texte "Bonjour"',
    '    bouton "Ok"',
    '',
  ].join('\n');
  const css = new Map([
    ['./site.css', 'body{background:#eeeeee}.carte{padding:32px}.barre{width:240px}@media (max-width:1023px){.barre{display:none}}@media (max-width:599px){.carte{padding:16px}}'],
    ['./ios.css', '.carte{border-radius:12px}'],
  ]);
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  const { fichiers } = genererProjetApple(application!, { nom: 'essai', source: 'essai.humalis', fichiersStyle: css });
  const page = fichiers.get('Essai/Pages/PageAccueil.swift')!;
  const dessin = fichiers.get('Essai/Humalis/Dessin.swift')!;
  const app = fichiers.get('Essai/EssaiApp.swift')!;

  it('écrit la page pour le Mac et pour iPhone et iPad', () => {
    const [mac, ios] = page.split('#else');
    expect(mac).toContain('#if os(macOS)');
    expect(mac).toContain('PageDessineeHumalis(largeur: 1440, hauteur: 900) {');
    expect(ios).toMatch(/PageDessineeHumalis\(largeur: 1440, hauteur: 900, fond: StylesDessines\.s\d+\) \{/);
    expect(ios).toContain('varianteHumalis(');
    expect(page).not.toMatch(/[^e]PageHumalis\(/);
    expect(page).toContain('BoitePageHumalis(');
  });

  it('agrandit la zone de toucher des boutons', () => {
    expect(page).toContain('.modifier(CibleTactileHumalis())');
  });

  it('donne les plages de largeur d’iOS ; une seule sur Mac', () => {
    expect(dessin).toContain('static let debuts: [CGFloat] = [0, 599.01, 1023.01]');
    expect(dessin).toContain('static let debuts: [CGFloat] = [0]');
    // La feuille de base du site a son mode sombre : chaque plage a donc deux variantes.
    expect(dessin).toContain('static let sombre = true');
  });

  it('dessine la barre sur iPad là où le CSS la montre', () => {
    expect(app).toContain('private let barreVisible: [Bool] = [false, false, false, false, true, true]');
    expect(app).toContain('CoquilleDessineeHumalis(');
    expect(app).toContain('classeDessin == .regular');
  });
});

describe('le dessin part du même point que le site', () => {
  const texte = (classes: string[] = []): NoeudVue => ({ type: 'element', id: 't', genre: 'texte', contenu: { type: 'texte', parties: [{ texte: 'x' }] }, options: [], classes, ligne: 1 }) as unknown as NoeudVue;
  const champ = (sorte?: string): NoeudVue => ({ type: 'element', id: 'c', genre: 'champ', contenu: { type: 'texte', parties: [{ texte: 'Note' }] }, options: [], classes: ['saisie'], ligne: 1, ...(sorte ? { saisie: { sorte } } : {}) }) as unknown as NoeudVue;

  it('donne aux paragraphes et aux titres les marges du navigateur', () => {
    const t = texte();
    const exact = new CssExact([], new Set());
    expect(styles(exact, exact.resoudre([t], DESSIN).de(t)!.code)[0].ma).toEqual([{ p: 16 }, { p: 0 }, { p: 16 }, { p: 0 }]);
  });

  it('compte width sans l’espace intérieur ni le bord, sauf en border-box', () => {
    const a = bloc(['a']);
    const b = bloc(['b']);
    const exact = new CssExact([{ css: '.a,.b{width:100px;padding:0 10px;border:2px solid #000}.b{box-sizing:border-box}' }], new Set());
    expect(styles(exact, exact.resoudre([a], DESSIN).de(a)!.code)[0].la).toEqual({ p: 124 });
    expect(styles(exact, exact.resoudre([b], DESSIN).de(b)!.code)[0].la).toEqual({ p: 100 });
  });

  it('lit env(safe-area-inset-…) comme 0, à la façon de Safari', () => {
    const b = bloc(['b']);
    const exact = new CssExact([{ css: '.b{padding:0 6px env(safe-area-inset-bottom)}' }], new Set());
    expect(styles(exact, exact.resoudre([b], DESSIN).de(b)!.code)[0].pa).toEqual([0, 6, 0, 6]);
  });

  it('met un champ dans son label, comme le web', () => {
    const c = champ();
    const exact = new CssExact([{ css: '.humalis-champ{padding:4px}.saisie{padding:9px}' }], new Set(), '.humalis-champ input{border:1px solid #8a8a90}');
    const r = exact.resoudre([c], DESSIN);
    expect(styles(exact, r.enveloppe(c)!.code)[0].pa).toEqual([4, 4, 4, 4]);
    const saisie = styles(exact, r.de(c)!.code)[0];
    expect(saisie.pa).toEqual([9, 9, 9, 9]);
    expect(saisie.bd[0][0]).toBe(1);
  });

  it('dessine un formulaire comme le <form> du site', () => {
    const f = { type: 'formulaire', id: 'f', nom: 'f', corps: [champ()], ligne: 1 } as unknown as NoeudVue;
    const exact = new CssExact([{ css: '.humalis-formulaire{margin:5px 0}' }], new Set());
    expect(styles(exact, exact.resoudre([f], DESSIN).de(f)!.code)[0].ma).toEqual([{ p: 5 }, { p: 0 }, { p: 5 }, { p: 0 }]);
  });

  it('écrit la barre comme l’en-tête du site, à côté de la page', () => {
    const lien = { type: 'element', id: 'l', genre: 'lien', cible: 'a', contenu: { type: 'texte', parties: [{ texte: 'A' }] }, options: [], classes: [], ligne: 1 } as unknown as NoeudVue;
    const barre = bloc(['humalis-barre-laterale', 'barre'], [lien]);
    const exact = new CssExact([{ css: '.humalis-entete{width:200px;position:fixed;top:0}.humalis-page a{padding:30px}' }], new Set());
    const r = exact.resoudre([barre], DESSIN, 'barre');
    const s = styles(exact, r.de(barre)!.code)[0];
    expect(s.la).toEqual({ p: 200 });
    expect(s.ab).toBeUndefined();
    expect(styles(exact, r.de(lien)!.code)[0].pa).toBeUndefined();
  });

  it('garde le style de main.humalis-page', () => {
    const exact = new CssExact([{ css: '.humalis-page{margin-left:272px;padding:8px}' }], new Set());
    const page = styles(exact, exact.resoudre([bloc(['b'])], DESSIN).page)[0];
    expect(page.ma[3]).toEqual({ p: 272 });
    expect(page.pa).toEqual([8, 8, 8, 8]);
  });
});

describe('les champs d’une page dessinée', () => {
  const source = [
    'utiliser style "./site.css"',
    '',
    'page "accueil" dessinee pour 1440 par 900 :',
    '    champ "Note" avec style "saisie" et indice "Une remarque"',
    '    liste deroulante "Ville" parmi ["Lyon", "Nantes"]',
    '    case a cocher "Rappel"',
    '',
  ].join('\n');
  const produire = (cadres: boolean) => {
    const { application } = compiler(source);
    return genererProjetApple(application!, { nom: 'essai', source: 'essai.humalis', fichiersStyle: new Map([['./site.css', '.saisie{padding:4px}']]), cadres }).fichiers;
  };
  const fichiers = produire(false);
  const page = fichiers.get('Essai/Pages/PageAccueil.swift')!;

  it('suivent leur CSS, dans leur label', () => {
    expect(page).toContain('SaisieDessineeHumalis(s: ');
    expect(page).toContain('indice: "Une remarque"');
    expect(page).toContain('ListeDessineeHumalis(s: ');
    expect(page).toContain('CaseDessineeHumalis(s: ');
    expect(page).not.toContain('ChampHumalis(');
    expect(fichiers.has('Essai/Humalis/Champs.swift')).toBe(true);
  });

  it('n’écrivent leur place que pour l’essai au point près', () => {
    expect(page).not.toContain('CadreEssaiHumalis');
    expect(produire(true).get('Essai/Pages/PageAccueil.swift')).toContain('.modifier(CadreEssaiHumalis(id: "champ_note"))');
  });
});
