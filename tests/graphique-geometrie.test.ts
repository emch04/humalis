import { describe, it, expect } from 'vitest';
import {
  calculerGraphique,
  graduations,
  htmlDuGraphique,
  GEOMETRIE_JS,
  PALETTE_GRAPHIQUE,
  type ConfigGraphique,
  type Forme,
} from '../src/cibles/commun/graphique/geometrie.js';
import { formaterArgent, formaterNombre } from '../src/cibles/format.js';
import { contraste, FOND_PAGE } from '../src/analyse/couleurs.js';
import { COULEURS_CSS } from '../src/cibles/web/styles.js';

const enFC = (n: number) => formaterArgent(n, 'FC');
const VENTES = [
  { mois: 'Janvier', montant: 120000 },
  { mois: 'Février', montant: 180000 },
  { mois: 'Mars', montant: 150000 },
];
const courbe: ConfigGraphique = { genre: 'courbe', etiquette: 'mois', nomEtiquettes: 'Mois', series: [{ nom: 'Montant', valeur: 'montant' }] };
const de = (formes: Forme[], type: Forme['type'], role?: string) => formes.filter((f) => f.type === type && (role === undefined || ('role' in f && f.role === role)));

describe('graphiques — les graduations', () => {
  it('sont « jolies » (1, 2, 5 × 10^n) et commencent à zéro', () => {
    expect(graduations(0, 180000)).toEqual([0, 50000, 100000, 150000, 200000]);
    expect(graduations(0, 5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(graduations(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(graduations(-30, 70)).toEqual([-40, -20, 0, 20, 40, 60, 80]);
  });
  it('donnent une échelle quand toutes les valeurs sont égales', () => {
    const g = calculerGraphique({ ...courbe }, [{ mois: 'A', montant: 5 }, { mois: 'B', montant: 5 }], formaterNombre, 640);
    expect(de(g.formes, 'texte', 'graduation').map((f) => (f as { texte: string }).texte)).toEqual(['0', '1', '2', '3', '4', '5']);
  });
});

describe('graphiques — la courbe et les barres', () => {
  it('place un repère par point, une courbe, des libellés et des infobulles formatées', () => {
    const g = calculerGraphique(courbe, VENTES, enFC, 640);
    expect(g).toMatchObject({ largeur: 640, hauteur: 360, vide: false });
    expect(de(g.formes, 'chemin', 'courbe')).toHaveLength(1);
    const reperes = g.formes.filter((f) => 'role' in f && f.role === 'repere');
    expect(reperes).toHaveLength(3);
    expect(reperes.map((r) => (r as { titre: string }).titre)).toEqual(['Janvier : 120 000 FC', 'Février : 180 000 FC', 'Mars : 150 000 FC']);
    expect(de(g.formes, 'texte', 'etiquette').map((f) => (f as { texte: string }).texte)).toEqual(['Janvier', 'Février', 'Mars']);
    // Le point le plus haut est le plus grand montant, et l'axe part de zéro.
    const ys = reperes.map((r) => (r as { y: number }).y);
    expect(ys[1]).toBeLessThan(ys[2]);
    expect(ys[2]).toBeLessThan(ys[0]);
    expect(g.legende).toEqual([]);
    expect(g.table).toEqual({ entetes: ['Mois', 'Montant'], lignes: [['Janvier', '120 000 FC'], ['Février', '180 000 FC'], ['Mars', '150 000 FC']] });
  });

  it('une courbe d’un seul point a son repère au milieu', () => {
    const g = calculerGraphique(courbe, [VENTES[0]], enFC, 640);
    const [repere] = g.formes.filter((f) => 'role' in f && f.role === 'repere') as { x: number }[];
    const axe = g.formes.find((f) => f.type === 'ligne' && f.role === 'axe') as { x1: number; x2: number };
    expect(repere.x).toBeCloseTo((axe.x1 + axe.x2) / 2, 1);
    expect(de(g.formes, 'chemin', 'courbe')).toHaveLength(0);
  });

  it('une valeur nulle dessine une barre plate, une valeur absente rien (et un tiret dans la table)', () => {
    const g = calculerGraphique({ ...courbe, genre: 'barres' }, [{ mois: 'A', montant: 0 }, { mois: 'B', montant: 4 }, { mois: 'C' }], formaterNombre, 640);
    const barres = de(g.formes, 'rect', 'barre') as { hauteur: number }[];
    expect(barres.map((b) => b.hauteur > 0)).toEqual([false, true]);
    expect(g.table.lignes[2]).toEqual(['C', '—']);
  });

  it('plusieurs séries : une légende, des repères de formes différentes, au-dessus des barres aussi', () => {
    const config: ConfigGraphique = {
      genre: 'barres',
      etiquette: 'nom',
      nomEtiquettes: 'Nom',
      series: [{ nom: 'Ventes', valeur: 'ventes', couleur: 'bleu' }, { nom: 'Achats', valeur: 'achats', couleur: 'orange' }],
    };
    const g = calculerGraphique(config, [{ nom: 'Janvier', ventes: 120000, achats: 90000 }], formaterNombre, 640);
    expect(g.legende).toEqual([{ nom: 'Ventes', couleur: 'bleu', repere: 'rond' }, { nom: 'Achats', couleur: 'orange', repere: 'carre' }]);
    expect(de(g.formes, 'rect', 'barre')).toHaveLength(2);
    expect(g.formes.filter((f) => 'role' in f && f.role === 'repere')).toHaveLength(2);
    expect((de(g.formes, 'rect', 'barre')[0] as { titre: string }).titre).toBe('Ventes, Janvier : 120 000');
  });

  it('une liste de nombres prend ses libellés dans « etiquettes », sinon des numéros', () => {
    const g = calculerGraphique({ genre: 'barres', etiquettes: ['Lun', 'Mar'], series: [{ nom: 'Valeur' }] }, [120, 180, 150], formaterNombre, 640);
    expect(g.table.lignes.map((l) => l[0])).toEqual(['Lun', 'Mar', '3']);
    expect(g.table.entetes).toEqual(['Libellé', 'Valeur']);
  });

  it('beaucoup de libellés : on en saute, selon une règle fixe', () => {
    const lignes = Array.from({ length: 60 }, (_, i) => ({ mois: `Semaine ${i + 1}`, montant: i }));
    const g = calculerGraphique(courbe, lignes, formaterNombre, 640);
    const libelles = de(g.formes, 'texte', 'etiquette');
    expect(libelles.length).toBeLessThan(20);
    expect((libelles[0] as { texte: string }).texte).toBe('Semaine 1');
  });

  it('la version étroite a ses propres dimensions (4 sur 3), ou les proportions demandées', () => {
    expect(calculerGraphique(courbe, VENTES, enFC, 400)).toMatchObject({ largeur: 400, hauteur: 300 });
    expect(calculerGraphique({ ...courbe, proportions: [2, 1] }, VENTES, enFC, 640)).toMatchObject({ largeur: 640, hauteur: 320 });
    expect(calculerGraphique({ ...courbe, proportions: [2, 1] }, VENTES, enFC, 400)).toMatchObject({ largeur: 400, hauteur: 200 });
  });
});

describe('graphiques — le camembert', () => {
  const config: ConfigGraphique = { genre: 'camembert', etiquette: 'poste', nomEtiquettes: 'Poste', series: [{ nom: 'Total', valeur: 'total' }] };
  const DEPENSES = [{ poste: 'Loyer', total: 500 }, { poste: 'Courses', total: 300 }, { poste: 'Transport', total: 200 }];

  it('trois parts : des arcs qui font le tour, dans le sens des aiguilles d’une montre depuis le haut', () => {
    const g = calculerGraphique(config, DEPENSES, formaterNombre, 640);
    const parts = de(g.formes, 'chemin', 'part') as { d: string; couleur: string; titre: string }[];
    expect(parts).toHaveLength(3);
    // La somme des angles fait 360° : la dernière part se referme au point de départ (en haut).
    const depart = /^M [\d.]+ [\d.]+ L ([\d.]+) ([\d.]+)/.exec(parts[0].d)!;
    const fin = /([\d.]+) ([\d.]+) Z$/.exec(parts[2].d)!;
    expect([fin[1], fin[2]]).toEqual([depart[1], depart[2]]);
    expect(Number(depart[1])).toBe(320);
    expect(parts.map((p) => p.couleur)).toEqual(['bleu', 'orange', 'vert']);
    expect(parts[0].titre).toBe('Loyer : 500 (50 %)');
    expect(de(g.formes, 'texte', 'part').map((t) => (t as { texte: string }).texte)).toEqual(['Loyer 50 %', 'Courses 30 %', 'Transport 20 %']);
    expect(g.legende.map((l) => l.nom)).toEqual(['Loyer', 'Courses', 'Transport']);
    expect(g.table).toEqual({ entetes: ['Poste', 'Total', 'Part'], lignes: [['Loyer', '500', '50 %'], ['Courses', '300', '30 %'], ['Transport', '200', '20 %']] });
  });

  it('une seule part est un disque entier', () => {
    const g = calculerGraphique(config, [DEPENSES[0]], formaterNombre, 640);
    expect((de(g.formes, 'chemin', 'part')[0] as { d: string }).d.match(/A /g)).toHaveLength(2);
  });
});

describe('graphiques — rien à dessiner', () => {
  it('une liste vide, ou des valeurs toutes à zéro ou absentes, donne « vide »', () => {
    expect(calculerGraphique(courbe, [], formaterNombre, 640).vide).toBe(true);
    expect(calculerGraphique(courbe, null, formaterNombre, 640).vide).toBe(true);
    expect(calculerGraphique(courbe, [{ mois: 'A', montant: 0 }, { mois: 'B' }], formaterNombre, 640).vide).toBe(true);
    expect(calculerGraphique({ ...courbe, genre: 'camembert' }, [{ mois: 'A', montant: -3 }], formaterNombre, 640).vide).toBe(true);
  });
  it('le HTML d’un graphique vide le dit, avec role="status"', () => {
    const html = htmlDuGraphique({ ...courbe, id: 'g', titre: 'Graphique en courbe', description: 'Ventes' }, [], formaterNombre);
    expect(html).toContain('<p class="humalis-graphique-vide" role="status">Aucune donnée à afficher.</p>');
  });
});

describe('graphiques — déterminisme et HTML', () => {
  it('deux calculs donnent les mêmes octets, coordonnées arrondies à deux décimales', () => {
    const a = JSON.stringify(calculerGraphique(courbe, VENTES, enFC, 640));
    expect(JSON.stringify(calculerGraphique(courbe, VENTES, enFC, 640))).toBe(a);
    for (const n of a.match(/-?\d+\.\d+/g) ?? []) expect(n.split('.')[1].length).toBeLessThanOrEqual(2);
  });

  it('le HTML : figure, deux dessins (large, étroit) avec role="img", title, desc, et la table « Voir les données »', () => {
    const html = htmlDuGraphique({ ...courbe, id: 'graphique-3', titre: 'Graphique en courbe', description: 'Les ventes <montent>' }, VENTES, enFC);
    expect(html).toMatch(/^<figure class="humalis-graphique" data-humalis="graphique-3">/);
    expect(html).toContain('<svg class="humalis-graphique-large" viewBox="0 0 640 360" font-size="14" role="img" aria-labelledby="graphique-3-l-nom graphique-3-l-desc">');
    expect(html).toContain('<title id="graphique-3-l-nom">Graphique en courbe</title><desc id="graphique-3-l-desc">Les ventes &lt;montent&gt;</desc>');
    expect(html).toContain('<svg class="humalis-graphique-etroit" viewBox="0 0 400 300"');
    expect(html).toContain('<details class="humalis-graphique-donnees"><summary>Voir les données</summary><table><caption>Les données du graphique</caption>');
    expect(html).toContain('<th scope="col">Mois</th><th scope="col">Montant</th>');
    expect(html).toContain('<tr><th scope="row">Janvier</th><td>120 000 FC</td></tr>');
    expect(html).toContain('class="humalis-graphique-courbe humalis-graphique-c-bleu"');
    expect(html).not.toContain('figcaption');
  });

  it('la source du code produit ne dépend de rien : ni import, ni accent grave', () => {
    expect(GEOMETRIE_JS).not.toMatch(/\bimport\b|\brequire\(|`/);
  });
});

describe('graphiques — la palette', () => {
  it('chaque teinte se voit sur le fond de la page, en clair et en sombre (3 pour 1 au moins)', () => {
    expect(PALETTE_GRAPHIQUE).toHaveLength(6);
    for (const nom of PALETTE_GRAPHIQUE) {
      for (const mode of ['clair', 'sombre'] as const) {
        expect(contraste(COULEURS_CSS[nom][mode], FOND_PAGE[mode]), `${nom} ${mode}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
