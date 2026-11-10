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
    expect(page).not.toContain('PageHumalis(');
  });

  it('agrandit la zone de toucher des boutons', () => {
    expect(page).toContain('.modifier(CibleTactileHumalis())');
  });

  it('donne les plages de largeur d’iOS ; une seule sur Mac', () => {
    expect(dessin).toContain('static let debuts: [CGFloat] = [0, 599.01, 1023.01]');
    expect(dessin).toContain('static let debuts: [CGFloat] = [0]');
    expect(dessin).toContain('static let sombre = false');
  });

  it('dessine la barre sur iPad là où le CSS la montre', () => {
    expect(app).toContain('private let barreVisible: [Bool] = [false, false, true]');
    expect(app).toContain('CoquilleDessineeHumalis(');
    expect(app).toContain('classeDessin == .regular');
  });
});
