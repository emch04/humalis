import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { compilerProjet } from '../../src/fichiers.js';
import { genererProjetMobile, verifierPourLeMobile } from '../../src/cibles/mobile/projet.js';
import type { Application } from '../../src/ri/types.js';

const compile = (source: string): Application => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const projet = (application: Application) => genererProjetMobile(application, { nom: 'essai', source: 'essai.humalis' });

describe('cible mobile — « defilement interne » et « hauteur ecran »', () => {
  const source = [
    'page "guide" :',
    '    titre "Le guide"',
    '    ligne avec hauteur ecran :',
    '        colonne avec defilement interne :',
    '            texte "Un long chapitre."',
    '',
    'page "autre" :',
    '    colonne avec defilement interne :',
    '        texte "Seul."',
    '',
  ].join('\n');
  const application = compile(source);
  const fichiers = projet(application);
  const guide = fichiers.get('app/index.tsx')!;

  it('rend le bloc « defilement interne » par une Zone qui défile, et « hauteur ecran » par une Zone à la hauteur de la page', () => {
    expect(guide).toMatch(/<Zone ecran style=\{\[s\.ligne\]\}>|<Zone ecran style=\{s\.ligne\}>/);
    expect(guide).toMatch(/<Zone defile style=\{s\.colonne\}>/);
    expect(guide).toContain('</Zone>');
    // Aucun style nommé inexistant n'est écrit pour ces deux réglages.
    expect(guide).not.toMatch(/s\.(defilementInterne|hauteurEcran)\b/);
  });

  it('fait mesurer sa hauteur visible à la page (ZonePage), sans ScrollView laissé ouvert', () => {
    expect(guide).toContain('<ZonePage style={s.page}>');
    expect(guide).toContain('</ZonePage>');
    expect(guide).not.toContain('<ScrollView');
    expect(guide).toContain("import { Zone, ZonePage } from '../humalis/zone';");
    expect(guide).not.toMatch(/import \{[^}]*ScrollView[^}]*\} from 'react-native'/);
  });

  it('écrit humalis/zone.tsx : ScrollView interne et hauteur de la fenêtre', () => {
    const zone = fichiers.get('humalis/zone.tsx')!;
    expect(zone).toContain('export function Zone(');
    expect(zone).toContain('export function ZonePage(');
    expect(zone).toContain('nestedScrollEnabled');
    expect(zone).toContain('useWindowDimensions');
    expect(zone).toContain('contentContainerStyle={contenu as ViewStyle}');
  });

  it('ne prévient plus que ces réglages sont sans effet sur le téléphone', () => {
    const messages = verifierPourLeMobile(application).map((d) => d.message);
    expect(messages.filter((m) => /defilement interne|hauteur ecran/.test(m))).toEqual([]);
  });

  it('laisse les pages sans ces réglages telles quelles', () => {
    const simple = projet(compile('page "accueil" :\n    titre "Bonjour"\n'));
    expect(simple.get('app/index.tsx')).toContain('<ScrollView contentContainerStyle={s.page}>');
    expect(simple.has('humalis/zone.tsx')).toBe(false);
  });
});

describe('cible mobile — les icônes propres au projet', () => {
  const fichiersSource: Record<string, string> = {
    'app.humalis': [
      'utiliser icones "./icones.svg"',
      '',
      'page "accueil" :',
      '    icone "fusee" avec description "Fusée"',
      '    icone "panier"',
      '',
    ].join('\n'),
    'icones.svg': '<svg><symbol id="fusee" viewBox="0 0 24 24"><path d="M4 20L20 4" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></symbol></svg>',
  };
  const lire = (chemin: string) => fichiersSource[chemin.replace(/^\.\//, '')];
  const { application, diagnostics } = compilerProjet('app.humalis', lire, fichiersSource['app.humalis']);

  it('compile sans erreur', () => {
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  const fichiers = projet(application!);
  const page = fichiers.get('app/index.tsx')!;

  it('dessine l’icône du projet au lieu de l’icône d’aide', () => {
    expect(page).not.toContain('CircleHelpIcon');
    expect(page).toMatch(/<Icone icone=\{ProjetFuseeIcon\} accessibilityLabel="Fusée" \/>/);
    expect(page).toContain("import { ProjetFuseeIcon } from '../humalis/icones-projet';");
    // L'icône du catalogue vient toujours de Lucide.
    expect(page).toMatch(/import \{ ShoppingCartIcon \} from 'lucide-react-native';/);
  });

  it('écrit le dessin avec react-native-svg, à la couleur du texte', () => {
    const icones = fichiers.get('humalis/icones-projet.tsx')!;
    expect(icones).toContain("import { SvgXml } from 'react-native-svg';");
    expect(icones).toContain('export function ProjetFuseeIcon(');
    expect(icones).toContain('stroke=\\"currentColor\\"');
    expect(icones).toContain('<path d=\\"M4 20L20 4\\" />');
    expect(icones).toContain('color={color}');
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.dependencies['react-native-svg']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
