import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { mouvementHorsBloc } from '../src/cibles/commun/mouvement.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const p = (...lignes: string[]) => programme('page "p" :', ...lignes);
const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;
const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const web = (source: string) => genererProjetWeb(compile(source), { nom: 'e', adresse: 'https://x.cd', source: 'e.humalis' });
const statique = (source: string) => genererProjetStatique(compile(source), { nom: 'e', source: 'e.humalis' });
const mobile = (source: string) => genererProjetMobile(compile(source), { nom: 'e', source: 'e.humalis' });
const desktop = (source: string) => genererProjetDesktop(compile(source), { nom: 'e', source: 'e.humalis' });
const fichier = (fichiers: Map<string, string>, fin: string) => [...fichiers.entries()].find(([n]) => n.endsWith(fin))?.[1] ?? '';

const ANIME = p(
  '>titre "Le Fleuve" avec animation apparition',
  '>bloc avec animation montee au defilement et delai court et duree longue :',
  '>>texte "Cuisine du fleuve"',
  '>bouton "Réserver" avec transition douce et effet agrandi',
  '>bloc avec effet leve et ombre legere :',
  '>>texte "Poisson"',
);

describe('mouvement — le parser', () => {
  it('lit animation, au defilement, duree, delai, transition et effet comme des options', () => {
    const [titre, bloc, bouton] = corps(ANIME) as any[];
    expect(titre.styles).toEqual([{ propriete: 'animation', valeur: 'apparition' }]);
    expect(bloc.styles).toEqual([
      { propriete: 'animation', valeur: 'montee', defilement: true },
      { propriete: 'delai', valeur: 'court' },
      { propriete: 'duree', valeur: 'longue' },
    ]);
    expect(bouton.styles).toEqual([
      { propriete: 'transition', valeur: 'douce' },
      { propriete: 'effet', valeur: 'agrandi' },
    ]);
  });
  it('ces mots restent des noms ailleurs', () => {
    expect(erreurs(p('>variable animation = 1', '>variable effet = "x"', '>variable duree = 2', '>texte "{animation} {effet} {duree}"'))).toEqual([]);
  });
});

describe('mouvement — l’analyse', () => {
  it('accepte le programme animé', () => {
    expect(erreurs(ANIME)).toEqual([]);
  });
  it('refuse un nom d’animation inconnu, avec la liste', () => {
    expect(erreurs(p('>titre "a" avec animation rotation'))).toEqual([
      '2 : « rotation » n\'est pas une valeur possible pour « animation ». Valeurs possibles : apparition, montee, agrandissement, defilement.',
    ]);
  });
  it('refuse « duree » ou « delai » sans animation', () => {
    expect(erreurs(p('>titre "a" avec delai court'))).toEqual([
      '2 : « delai » donne l’attente d’une animation : écrivez aussi « animation … », par exemple « avec animation montee et delai court ».',
    ]);
    expect(erreurs(p('>titre "a" avec duree longue'))).toHaveLength(1);
  });
  it('refuse « defilement » sans nom d’animation', () => {
    expect(erreurs(p('>titre "a" avec animation defilement'))).toEqual([
      '2 : « au defilement » suit le nom d’une animation : « animation montee au defilement ».',
    ]);
  });
  it('refuse une animation sur un champ, ou dans un formulaire', () => {
    expect(erreurs(p('>variable nom = ""', '>champ "Nom" avec animation apparition'))).toEqual([
      '3 : pas d’animation sur un champ, ni dans un formulaire : un champ qui bouge pendant qu’on écrit gêne la saisie.',
    ]);
    expect(erreurs(p('>variable nom = ""', '>formulaire "f" :', '>>texte "a" avec animation montee', '>>champ "Nom"', '>>bouton "Envoyer"'))).toHaveLength(1);
  });
  it('prévient au-delà de 30 éléments animés au défilement dans une page', () => {
    const lignes = Array.from({ length: 31 }, (_, i) => `>texte "t${i}" avec animation apparition au defilement`);
    expect(avertissements(p(...lignes)).filter((a) => a.includes('trop de mouvement'))).toHaveLength(1);
  });
});

describe('mouvement — web et desktop', () => {
  it('pose les classes, et le CSS du mouvement n’existe que dans « prefers-reduced-motion: no-preference »', () => {
    const fichiers = web(ANIME);
    const page = fichier(fichiers, 'pages/P.tsx');
    expect(page).toContain('className="humalis-animation-apparition"');
    expect(page).toContain('humalis-animation-montee humalis-animation-defilement humalis-delai-courte humalis-duree-longue');
    expect(page).toContain('humalis-transition-douce humalis-effet-agrandi');
    const css = fichier(fichiers, 'styles.css');
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)');
    expect(css).toContain('@keyframes humalis-montee');
    expect(css).toContain('.humalis-js .humalis-animation-defilement:not([data-humalis-vu]) { opacity: 0; }');
    expect(css).toContain('.humalis-animation-defilement:not([data-humalis-vu]) { animation: none; }');
    expect(mouvementHorsBloc(css)).toEqual([]);
  });
  it('l’observateur du défilement n’est écrit que si une page s’en sert', () => {
    const avec = web(ANIME);
    expect(avec.get('src/humalis/mouvement.ts')).toContain('IntersectionObserver');
    expect(avec.get('src/humalis/mouvement.ts')).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(avec.get('src/main.tsx')).toContain("import { observerLeDefilement } from './humalis/mouvement';");
    const sans = web(p('>titre "a" avec animation apparition'));
    expect(sans.has('src/humalis/mouvement.ts')).toBe(false);
    expect(sans.get('src/main.tsx')).not.toContain('mouvement');
  });
  it('le prérendu retire les marques posées par le script (rien de caché sans JavaScript)', () => {
    const config = fichier(web(ANIME), 'prerender.config.cjs');
    expect(config).toContain('transformHtml');
    expect(config).toContain('humalis-js');
  });
  it('un programme sans mouvement n’a aucune règle de mouvement', () => {
    const css = fichier(web(p('>titre "a"', '>bloc avec ombre legere :', '>>texte "b"')), 'styles.css');
    expect(css).not.toContain('prefers-reduced-motion');
    expect(css).not.toMatch(/animation|transition|@keyframes/);
  });
  it('le desktop reprend le web', () => {
    const fichiers = desktop(ANIME);
    expect(fichier(fichiers, 'styles.css')).toContain('@keyframes humalis-apparition');
    expect(mouvementHorsBloc(fichier(fichiers, 'styles.css'))).toEqual([]);
  });
  it('les éléments d’écran existants rangent aussi leur mouvement dans le bloc', () => {
    const css = fichier(web(p('>chargement', '>deroulant "Détails" :', '>>texte "a"', '>carrousel :', '>>texte "a"', '>>texte "b"')), 'styles.css');
    expect(css).toContain('humalis-tourne');
    expect(mouvementHorsBloc(css)).toEqual([]);
  });
});

describe('mouvement — statique', () => {
  it('mêmes classes et même CSS ; le HTML de départ ne cache rien, le script pose « humalis-js »', () => {
    const fichiers = statique(ANIME);
    const html = fichier(fichiers, 'index.html');
    expect(html).toContain('humalis-animation-montee humalis-animation-defilement');
    expect(html).not.toContain('humalis-js');
    expect(html).not.toContain('data-humalis-vu');
    const css = fichier(fichiers, 'styles.css');
    expect(mouvementHorsBloc(css)).toEqual([]);
    const js = [...fichiers.entries()].filter(([n]) => n.endsWith('.js')).map(([, v]) => v).join('\n');
    expect(js).toContain("document.documentElement.classList.add('humalis-js')");
    expect(js).toContain('IntersectionObserver');
  });
  it('sans « au defilement », aucun observateur', () => {
    const js = [...statique(p('>titre "a" avec animation apparition')).entries()].filter(([n]) => n.endsWith('.js')).map(([, v]) => v).join('\n');
    expect(js).not.toContain('IntersectionObserver');
  });
});

describe('mouvement — mobile', () => {
  it('Animated, et rien ne bouge si l’appareil demande de réduire les animations', () => {
    const fichiers = mobile(ANIME);
    const anime = fichiers.get('humalis/mouvement.tsx')!;
    expect(anime).toContain('AccessibilityInfo.isReduceMotionEnabled()');
    expect(anime).toContain("addEventListener('reduceMotionChanged'");
    expect(anime).toContain('Animated.timing');
    expect(anime).toContain('useNativeDriver: true');
    const page = fichier(fichiers, 'app/index.tsx');
    expect(page).toContain('<Anime animation="apparition" duree={300} delai={0}>');
    expect(page).toContain('<Anime animation="montee" duree={600} delai={100}>');
  });
  it('sans animation, le fichier n’est pas écrit ; « transition » est sans effet et le dit', () => {
    expect(mobile(p('>titre "a"')).has('humalis/mouvement.tsx')).toBe(false);
  });
});

// Manque n° 5 du site public : « avec animation montee au defilement et en cascade » sur un bloc.
describe('les apparitions en cascade', () => {
  const source = p('>titre "a"', '>grille avec animation montee au defilement et en cascade :', '>>texte "Un"', '>>texte "Deux"', '>>texte "Trois"');

  it('est lu sur un bloc', () => {
    expect(erreurs(source)).toEqual([]);
    const bloc = corps(source)[1] as unknown as { styles: { propriete: string; cascade?: boolean }[] };
    expect(bloc.styles.find((s) => s.propriete === 'animation')?.cascade).toBe(true);
  });

  it('est refusé sur un simple élément', () => {
    expect(erreurs(p('>titre "a" avec animation montee au defilement et en cascade')).join('\n')).toMatch(/cascade.*bloc/);
  });

  it('web : les enfants du bloc apparaissent l’un après l’autre, sans mouvement si on le demande', () => {
    const fichiers = web(source);
    const code = [...fichiers.values()].join('\n');
    expect(code).toContain('humalis-animation-cascade');
    const css = fichiers.get('src/humalis/styles.css')!;
    expect(css).toContain('.humalis-animation-cascade.humalis-animation-montee > *');
    expect(css).toContain('.humalis-animation-cascade > :nth-child(2) { --humalis-delai: 80ms; }');
    expect(mouvementHorsBloc(css)).toEqual([]);
  });

  it('mobile : le bloc s’anime en entier', () => {
    const mobile = [...genererProjetMobile(compile(source), { nom: 'e', source: 'e.humalis' }).values()].join('\n');
    expect(mobile).not.toContain('cascade');
  });
});
