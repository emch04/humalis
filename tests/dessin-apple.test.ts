import { describe, it, expect } from 'vitest';
import { lireIconesSvg, lireChemin } from '../src/icones-svg.js';
import { CssExact } from '../src/cibles/apple/css-exact.js';
import { pourLaCible } from '../src/ri/plateforme.js';
import type { Application, NoeudVue } from '../src/ri/types.js';
import { connaitreIconesDessinees, chercherIcone } from '../src/vocabulaire/icones.js';
import { formaterEnLettres, formaterDateLongue, avecMajuscule, initialesDe, FORMES_TEXTE_JS } from '../src/cibles/format.js';
import { iconeHtml } from '../src/cibles/statique/html-elements.js';
import { composantIcone, fichiersDesElements } from '../src/cibles/web/widgets.js';

const bloc = (classes: string[], corps: NoeudVue[] = []): NoeudVue => ({ type: 'bloc', genre: 'bloc', options: [], classes, corps, ligne: 1 });
const DESSIN = { largeur: 1440, hauteur: 900 };
const style = (css: string, vue: NoeudVue[], noeud: NoeudVue) => {
  const exact = new CssExact([{ css }], new Set(['Sora']));
  const code = exact.resoudre(vue, DESSIN).de(noeud)!.code;
  const i = /s(\d+)$/.exec(code)![1];
  const ligne = exact.swift().split('\n').find((l) => l.includes(`let s${i} =`))!;
  return JSON.parse(/#"(.*)"#/.exec(ligne)![1]);
};

describe('utiliser icones', () => {
  it('lit chaque symbole, avec remplissage et trait', () => {
    const [i] = lireIconesSvg('<svg><symbol id="cloche" viewBox="0 0 24 24"><path d="M1 2h3v4z" fill="currentColor" fill-opacity=".17" stroke="none"/><path d="M1 2L3 4" fill="none" stroke="currentColor" stroke-width="2"/></symbol></svg>');
    expect(i.nom).toBe('cloche');
    expect(i.traces[0].remplissage?.opacite).toBeCloseTo(0.17);
    expect(i.traces[0].trait).toBeUndefined();
    expect(i.traces[1].trait?.epaisseur).toBe(2);
    expect(i.traces[1].remplissage).toBeUndefined();
  });
  it('rend un chemin relatif en coordonnées absolues', () => {
    const c = lireChemin('M1 2h3v4z');
    expect(c.commandes).toBe('MLLZ');
    expect(c.valeurs).toEqual([1, 2, 4, 2, 4, 6]);
  });
  it('convertit un arc en courbes', () => {
    expect(lireChemin('M0 0A5 5 0 0 1 10 0').commandes).toMatch(/^MC+$/);
  });
});

describe('le CSS résolu pour un dessin', () => {
  it('suit les sélecteurs composés et la priorité', () => {
    const b = bloc(['b']);
    const a = bloc(['a'], [b]);
    expect(style('.b{width:10px}.a .b{width:20px}.b{height:5px}', [a], b)).toMatchObject({ la: { p: 20 }, ha: { p: 5 } });
  });
  it('ne reprend pas le survol, mais garde le reste de la règle', () => {
    const b = bloc(['n', 'on']);
    expect(style('.n:hover{opacity:.5}.n.on,.n:hover{width:9px}', [b], b)).toMatchObject({ la: { p: 9 } });
    expect(style('.n:hover{opacity:.5}', [b], b).op).toBeUndefined();
  });
  it('hérite la couleur et résout les variables', () => {
    const b = bloc(['b']);
    const a = bloc(['a'], [b]);
    expect(style('.a{--v:#ff0000;color:var(--v)}', [a], b).c).toEqual([1, 0, 0, 1]);
  });
  it('lit flèche, dégradé et calcul', () => {
    const b = bloc(['b']);
    const s = style('.b{width:calc(100% + 28px);background:linear-gradient(90deg,#000,#fff);clip-path:polygon(0 0,calc(100% - 28px) 0,100% 50%)}', [b], b);
    expect(s.la).toEqual({ c: 100, p: 28 });
    expect(s.fo[0].l.a).toBe(90);
    expect(s.po[1][0]).toEqual({ c: 100, p: -28 });
  });
  it('laisse la première ligne d’une boucle différer des suivantes', () => {
    const ligne = bloc(['l']);
    const vue: NoeudVue[] = [{ type: 'repetition', variable: 'x', corps: [ligne] } as unknown as NoeudVue];
    const exact = new CssExact([{ css: '.l+.l{height:1px}' }], new Set());
    expect(exact.resoudre(vue, DESSIN).de(ligne)!.code).toContain('rangHumalis(§');
  });
});

describe('la barre latérale hors du Mac', () => {
  const app = (entete: boolean) => ({ fichiersStyle: [], disposition: { barre: { ecran: {}, options: [], classes: ['s'] }, ...(entete ? { entete: { ecran: {}, options: [], classes: [] } } : {}) } }) as unknown as Application;
  it('prend la place de l’en-tête s’il n’y en a pas', () => {
    expect(pourLaCible(app(false), 'web').disposition?.entete?.classes).toEqual(['humalis-barre-laterale', 's']);
  });
  it('s’efface devant un en-tête', () => {
    const d = pourLaCible(app(true), 'web').disposition;
    expect(d?.barre).toBeUndefined();
    expect(d?.entete?.classes).toEqual([]);
  });
  it('reste sur Apple', () => {
    expect(pourLaCible(app(false), 'apple').disposition?.barre).toBeDefined();
  });
});

describe('les icônes du projet sur le web', () => {
  const dessins = lireIconesSvg('<svg><symbol id="cloche" viewBox="0 0 24 24"><path d="M1 2L3 4"/></symbol><symbol id="grand" viewBox="0 0 48 48"><path d="M1 2L3 4"/></symbol></svg>');
  it('passent avant le catalogue, sur le site statique aussi', () => {
    connaitreIconesDessinees(dessins);
    const lucide = chercherIcone('cloche')!.lucide;
    expect(lucide).toBe('projet-cloche');
    expect(iconeHtml(lucide, 'x')).toContain('M1 2L3 4');
    expect(iconeHtml(chercherIcone('grand')!.lucide, 'x')).toContain('viewBox="0 0 48 48"');
    connaitreIconesDessinees([]);
    expect(chercherIcone('cloche')!.lucide).not.toBe('projet-cloche');
  });
  it('produisent leur composant React', () => {
    connaitreIconesDessinees(dessins);
    const c = composantIcone('cloche');
    expect(c).toBe('ProjetClocheIcon');
    const f = fichiersDesElements([`<${c} className="x" />`]).get('icones-projet.tsx')!;
    expect(f).toContain('export function ProjetClocheIcon');
    expect(f).not.toContain('ProjetGrandIcon');
    connaitreIconesDessinees([]);
  });
});

describe('les formes de texte', () => {
  it('écrit les nombres en lettres', () => {
    const cas: [number, string][] = [[0, 'zéro'], [1, 'un'], [4, 'quatre'], [17, 'dix-sept'], [21, 'vingt et un'], [71, 'soixante et onze'], [72, 'soixante-douze'], [80, 'quatre-vingts'], [81, 'quatre-vingt-un'], [91, 'quatre-vingt-onze'], [100, 'cent'], [200, 'deux cents'], [201, 'deux cent un'], [1000, 'mille'], [2000, 'deux mille'], [80000, 'quatre-vingt mille'], [200000, 'deux cent mille'], [1000000, 'un million'], [-3, 'moins trois']];
    for (const [n, attendu] of cas) expect(formaterEnLettres(n)).toBe(attendu);
    expect(formaterEnLettres(null)).toBe('');
  });
  it('écrit la date longue, la majuscule et les initiales', () => {
    expect(formaterDateLongue('2026-11-09')).toBe('lundi 9 novembre');
    expect(avecMajuscule('lundi 9 novembre')).toBe('Lundi 9 novembre');
    expect(initialesDe('Direction générale')).toBe('DG');
    expect(initialesDe('  awa  ')).toBe('A');
  });
  it('recopie des fonctions qui marchent seules', () => {
    const f = new Function(`${FORMES_TEXTE_JS}; return { formaterEnLettres, initialesDe };`)() as { formaterEnLettres: (n: number) => string; initialesDe: (t: string) => string };
    expect(f.formaterEnLettres(71)).toBe('soixante et onze');
    expect(f.initialesDe('Direction générale')).toBe('DG');
  });
});

describe('sur site et macos', () => {
  const app = () => ({ fichiersStyle: [], ecrans: [{ nom: 'a', vue: [{ type: 'bloc', genre: 'bloc', plateforme: 'site+macos', options: [], classes: [], corps: [{ type: 'bloc', genre: 'bloc', options: [], classes: ['x'], corps: [], ligne: 1 }], ligne: 1 }] }] }) as unknown as Application;
  it('vaut sur le site, sans le bloc autour', () => {
    expect((pourLaCible(app(), 'web').ecrans[0].vue[0] as { classes: string[] }).classes).toEqual(['x']);
  });
  it('reste réservé au Mac dans le projet Apple', () => {
    expect((pourLaCible(app(), 'apple').ecrans[0].vue[0] as { plateforme?: string }).plateforme).toBe('macos');
  });
});

describe('le dessin suit la largeur et les images de fond', () => {
  it('compare « @media » à la largeur du dessin', () => {
    const b = bloc(['b']);
    const css = '.b{width:1px}@media (min-width:1600px){.b{width:2px}}@media (max-width:1500px){.b{height:3px}}@media (prefers-color-scheme:dark){.b{opacity:.5}}';
    const s = style(css, [b], b);
    expect(s.la).toEqual({ p: 1 });
    expect(s.ha).toEqual({ p: 3 });
    expect(s.op).toBeUndefined();
  });
  it('lit couleurs, dégradé et cadrage d’un SVG', () => {
    const [i] = lireIconesSvg(`<svg><symbol id="f" viewBox="0 0 10 10" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB9A2" stop-opacity=".5"/><stop offset="1" stop-color="#FFB9A2" stop-opacity="0"/></linearGradient></defs><path d="M0 0H10V10Z" fill="url(#g)"/><path d="M0 0L10 10" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="4" vector-effect="non-scaling-stroke"/></symbol></svg>`);
    expect(i.cadrage).toBe('couvre');
    expect(i.traces[0].remplissage?.degrade?.a).toEqual([0, 1]);
    expect(i.traces[0].remplissage?.degrade?.arrets[0].c[3]).toBeCloseTo(0.5);
    expect(i.traces[1].trait?.couleur).toEqual([1, 1, 1, 0.2]);
    expect(i.traces[1].trait?.fixe).toBe(true);
  });
  it('trace un « background » en SVG sous le contenu', () => {
    const b = bloc(['carte']);
    const svg = encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M0,0 L100,100' fill='none' stroke='rgba(255,255,255,.2)'/></svg>");
    const s = style(`.carte{position:absolute;inset:0;background:url("data:image/svg+xml,${svg}")}`, [b], b);
    expect(s.fi).toBe(0);
  });
});
