/**
 * Les graphiques tactiles : toucher, survoler ou parcourir au clavier un point,
 * une barre ou une part montre une bulle (l'étiquette et la valeur formatée),
 * et un graphique trop long pour sa largeur défile au doigt, la fin d'abord.
 * Aucune phrase nouvelle dans le langage : tout se passe dans le code produit
 * (web et desktop, mobile, site statique) et dans la lecture partagée.
 */
import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { LECTURE_JS } from '../src/cibles/web/graphique.js';
import { GEOMETRIE_JS, type ConfigGraphique, type Graphe } from '../src/cibles/commun/graphique/geometrie.js';
import { formaterArgent, formaterNombre } from '../src/cibles/format.js';
import { programme } from './analyse/aide.js';

interface Point {
  index: number;
  x: number;
  y: number;
  libelle: string;
  lignes: string[];
}
interface Lecture {
  graphe: Graphe;
  points: Point[];
  lignesDesFormes: number[];
  gauche: number;
  haut: number;
  bas: number;
  defilant: boolean;
}

// La lecture, exécutée telle qu'elle est recopiée dans les projets produits.
const moteur = new Function(`${GEOMETRIE_JS}\n${LECTURE_JS}\nreturn { calculerGraphique, lireGraphique, texteDuPoint };`)() as {
  calculerGraphique(config: ConfigGraphique, lignes: unknown, formater: (v: number) => string, largeur: number): Graphe;
  lireGraphique(config: ConfigGraphique, largeur: number, calculer: (config: ConfigGraphique, largeur: number) => Graphe): Lecture;
  texteDuPoint(point: Point): string;
};
const lire = (config: ConfigGraphique, lignes: unknown, formater: (v: number) => string, largeur: number) =>
  moteur.lireGraphique(config, largeur, (reglage, l) => moteur.calculerGraphique(reglage, lignes, formater, l));

const enEuros = (n: number) => formaterArgent(n, 'EUR');
const VENTES = [
  { mois: 'Janvier', montant: 120 },
  { mois: 'Février', montant: 180 },
  { mois: 'Mars', montant: 150 },
];
const courbe: ConfigGraphique = { genre: 'courbe', etiquette: 'mois', nomEtiquettes: 'Mois', series: [{ nom: 'Montant', valeur: 'montant' }] };
/** Des commandes par jour sur trois mois : trop de valeurs pour un téléphone. */
const JOURS = Array.from({ length: 90 }, (_, i) => ({ jour: `${(i % 30) + 1} ${['janv.', 'févr.', 'mars'][Math.floor(i / 30)]}`, nombre: (i * 7) % 11 }));
const barres: ConfigGraphique = { genre: 'barres', etiquette: 'jour', nomEtiquettes: 'Jour', series: [{ nom: 'Commandes', valeur: 'nombre' }] };

describe('graphiques tactiles — la lecture partagée', () => {
  it('un point par ligne : son étiquette et sa valeur formatée, avec l’unité du programme', () => {
    const lecture = lire(courbe, VENTES, enEuros, 640);
    expect(lecture.defilant).toBe(false);
    expect(lecture.points.map((p) => p.libelle)).toEqual(['Janvier', 'Février', 'Mars']);
    expect(lecture.points[1].lignes).toEqual([`Montant : ${enEuros(180)}`]);
    expect(moteur.texteDuPoint(lecture.points[1])).toBe(`Février, Montant : ${enEuros(180)}`);
    // Les points sont rangés de gauche à droite, au milieu de leur bande, et chaque repère connaît sa ligne.
    expect(lecture.points[0].x).toBeLessThan(lecture.points[1].x);
    const reperes = lecture.graphe.formes.map((f, i) => (f.role === 'repere' ? lecture.lignesDesFormes[i] : null)).filter((l) => l !== null);
    expect(reperes).toEqual([0, 1, 2]);
    expect(lecture.haut).toBeLessThan(lecture.bas);
  });

  it('une valeur manquante n’a pas de point ; les barres de plusieurs séries vont à leur ligne', () => {
    const config: ConfigGraphique = { genre: 'barres', etiquette: 'mois', nomEtiquettes: 'Mois', series: [{ nom: 'Ventes', valeur: 'ventes' }, { nom: 'Achats', valeur: 'achats' }] };
    const lignes = [{ mois: 'Janvier', ventes: 5, achats: 3 }, { mois: 'Février' }, { mois: 'Mars', ventes: 7, achats: 4 }];
    const lecture = lire(config, lignes, formaterNombre, 640);
    expect(lecture.points.map((p) => p.index)).toEqual([0, 2]);
    expect(lecture.points[1].lignes).toEqual(['Ventes : 7', 'Achats : 4']);
    const barresLues = lecture.graphe.formes.map((f, i) => (f.role === 'barre' ? lecture.lignesDesFormes[i] : null)).filter((l) => l !== null);
    expect(barresLues).toEqual([0, 2, 0, 2]);
  });

  it('le camembert : une part par valeur positive, avec sa part en pour cent', () => {
    const config: ConfigGraphique = { genre: 'camembert', etiquette: 'poste', nomEtiquettes: 'Poste', series: [{ nom: 'Total', valeur: 'total' }] };
    const lignes = [{ poste: 'Loyer', total: 900 }, { poste: 'Rien', total: 0 }, { poste: 'Courses', total: 300 }];
    const lecture = lire(config, lignes, enEuros, 400);
    expect(lecture.points.map((p) => [p.index, p.libelle])).toEqual([[0, 'Loyer'], [2, 'Courses']]);
    expect(lecture.points[1].lignes).toEqual([`Total : ${enEuros(300)} (${(0.25).toLocaleString('fr-FR', { style: 'percent' })})`]);
    const parts = lecture.graphe.formes.map((f, i) => (f.type === 'chemin' && f.role === 'part' ? lecture.lignesDesFormes[i] : null)).filter((l) => l !== null);
    expect(parts).toEqual([0, 2]);
    expect(lecture.defilant).toBe(false);
  });

  it('beaucoup de valeurs : le dessin s’allonge et défile, à la même hauteur ; les étiquettes ne se chevauchent pas', () => {
    const etroit = lire(barres, JOURS, formaterNombre, 400);
    expect(etroit.defilant).toBe(true);
    expect(etroit.graphe.hauteur).toBe(300);
    expect(etroit.graphe.largeur).toBeGreaterThan(400);
    // Une valeur nulle se lit aussi : chaque jour a son point.
    expect(etroit.points).toHaveLength(JOURS.length);
    // Chaque valeur garde au moins 26 unités : une barre qu'on voit et qu'on touche.
    const axe = etroit.graphe.formes.find((f) => f.type === 'ligne' && f.role === 'axe')!;
    expect(axe.type === 'ligne' && (axe.x2 - axe.x1) / JOURS.length).toBeGreaterThanOrEqual(26);
    // Les étiquettes : assez d'écart entre deux, la première et la dernière dans le dessin.
    const etiquettes = etroit.graphe.formes.filter((f) => f.type === 'texte' && f.role === 'etiquette');
    expect(etiquettes.length).toBeLessThan(JOURS.length);
    const premiere = etiquettes[0];
    const derniere = etiquettes[etiquettes.length - 1];
    expect(premiere.type === 'texte' && premiere.x >= etroit.gauche).toBe(true);
    expect(derniere.type === 'texte' && derniere.x <= etroit.graphe.largeur).toBe(true);
    // Trois valeurs tiennent dans la largeur : rien ne défile.
    expect(lire(barres, JOURS.slice(0, 3), formaterNombre, 400).defilant).toBe(false);
    // Les proportions du programme gardent leur hauteur.
    expect(lire({ ...barres, proportions: [2, 1] }, JOURS, formaterNombre, 400).graphe.hauteur).toBe(200);
  });
});

const PROGRAMME = programme(
  'page "statistiques" :',
  '>titre "Statistiques"',
  `>variable jours = [${JOURS.slice(0, 5).map((j) => `fiche avec jour "${j.jour}" et nombre ${j.nombre}`).join(', ')}]`,
  '>graphique en barres jours avec etiquette jour et valeur nombre et description "Les commandes de chaque jour."',
  '>graphique en courbe jours avec etiquette jour et valeur nombre en euros et description "Le montant de chaque jour."',
);
const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};

describe('graphiques tactiles — le web et le desktop', () => {
  const projet = genererProjetWeb(compile(PROGRAMME), { nom: 'e', adresse: 'https://x.cd', source: 'e.humalis' });
  const composant = projet.get('src/humalis/graphique.tsx')!;
  const css = projet.get('src/humalis/styles.css')!;

  it('le doigt et la souris : pointer events, la bulle, la forme lue en évidence', () => {
    expect(composant).toContain('onPointerDown={surAppui} onPointerMove={surMouvement} onPointerUp={finirAppui} onPointerCancel={finirAppui} onPointerLeave={surSortie}');
    expect(composant).toContain('<div className="humalis-graphique-bulle" aria-hidden="true" style={style}>');
    expect(composant).toContain("(actif ? ' humalis-graphique-actif' : '')");
    expect(composant).toContain('className="humalis-graphique-guide"');
    // Un appui long sur un dessin qui défile retient le défilement pour suivre la bulle.
    expect(composant).toContain("svg.addEventListener('touchmove', retenir, { passive: false });");
    // La géométrie et sa lecture viennent du même module, sans bibliothèque.
    expect(projet.get('src/humalis/graphique-geometrie.js')).toContain(LECTURE_JS);
    expect(projet.get('src/humalis/graphique-geometrie.d.ts')).toContain('export function lireGraphique(');
  });

  it('le défilement : la fin d’abord, « Début » et « Fin » d’au moins 44 px, l’axe des valeurs reste en place', () => {
    expect(composant).toContain('boite.scrollLeft = boite.scrollWidth;');
    expect(composant).toContain('aria-label="Revenir aux premières valeurs"');
    expect(composant).toContain('aria-label="Aller aux dernières valeurs"');
    expect(composant).toContain('className="humalis-graphique-axe-fixe"');
    expect(css).toContain('.humalis-graphique-navigation button { min-width: 44px; min-height: 44px;');
    expect(css).toContain('.humalis-graphique-defileur { flex: 1 1 auto; min-width: 0; overflow-x: auto;');
  });

  it('le défilement vertical de la page reste libre : touch-action', () => {
    expect(css).toContain('.humalis-graphique-trace { position: relative; touch-action: pan-y;');
    expect(css).toContain('.humalis-graphique-defilant .humalis-graphique-trace { touch-action: pan-x pan-y; }');
  });

  it('le clavier et les lecteurs d’écran : flèches, focus visible, aria-live poli ; la table reste', () => {
    expect(composant).toContain("if (e.key === 'ArrowRight')");
    expect(composant).toContain("else if (e.key === 'ArrowLeft')");
    expect(composant).toContain("else if (e.key === 'Home')");
    expect(composant).toContain('tabIndex={0}');
    expect(composant).toContain('<p className="humalis-graphique-annonce" aria-live="polite">');
    expect(composant).toContain('Flèches gauche et droite : lire les valeurs une à une.');
    expect(composant).toContain('<summary>Voir les données</summary>');
    expect(css).toContain('.humalis-graphique-zone:focus-visible { outline: 2px solid var(--humalis-bleu);');
  });

  it('les couleurs du thème (clair et sombre), et aucun mouvement quand l’appareil le refuse', () => {
    expect(css).toContain('background: var(--humalis-encre); color: var(--humalis-page);');
    expect(css).toContain('@media (prefers-reduced-motion: no-preference) {\n  .humalis-graphique-barre, .humalis-graphique-repere, path.humalis-graphique-part { transition:');
    expect(composant).toContain("behavior: mouvementReduit() ? 'auto' : 'smooth'");
  });
});

describe('graphiques tactiles — le mobile', () => {
  const composant = genererProjetMobile(compile(PROGRAMME), { nom: 'e', source: 'e.humalis' }).get('humalis/graphique.tsx')!;

  it('toucher et glisser montrent la bulle ; un long graphique défile et montre la fin', () => {
    expect(composant).toContain('onResponderGrant={surAppui}');
    expect(composant).toContain('onResponderMove={(e) => appui.current.suit && lireSous(e)}');
    expect(composant).toContain("onContentSizeChange={() => defileur.current?.scrollToEnd({ animated: false })}");
    expect(composant).toContain('minHeight: 44');
  });

  it('un lecteur d’écran parcourt les valeurs (rôle « adjustable ») ; le mouvement réduit est respecté', () => {
    expect(composant).toContain('accessibilityRole="adjustable"');
    expect(composant).toContain("accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}");
    expect(composant).toContain('AccessibilityInfo.isReduceMotionEnabled()');
  });
});

describe('graphiques tactiles — le site statique', () => {
  const projet = genererProjetStatique(compile(PROGRAMME), { nom: 'e', source: 'e.humalis' });
  const script = projet.get('humalis/graphique.js')!;

  it('le même comportement en JavaScript clair : lecture partagée, bulle, clavier, défilement', () => {
    expect(script).toContain('function lireGraphique(config, largeur, calculer)');
    expect(script).toContain('function activer(figure, config, donnees, formater)');
    expect(script).toContain("dessin.addEventListener('pointermove'");
    expect(script).toContain("annonce.setAttribute('aria-live', 'polite');");
    expect(script).toContain("if (e.key === 'ArrowRight')");
    expect(script).toContain('defileur.scrollLeft = defileur.scrollWidth;');
    // Le script reste lisible par un navigateur ancien : du JavaScript simple, qui se compile.
    expect(() => new Function('document', 'humalis', script)).not.toThrow();
  });

  it('le HTML de départ ne change pas : le script rend ses dessins lisibles après coup', () => {
    const html = [...projet.entries()].find(([n]) => n.endsWith('.html') && n !== '404.html')![1];
    expect(html).toContain('<svg class="humalis-graphique-large"');
    expect(script).toContain("modele.innerHTML = htmlDuGraphique(config, donnees, formateur(config.devise));");
    expect(projet.get('humalis/styles.css')).toContain('.humalis-graphique-bulle {');
  });
});
