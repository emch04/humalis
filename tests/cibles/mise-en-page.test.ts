import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { genererProjetWeb } from '../../src/cibles/web/projet.js';
import { genererProjetMobile, verifierPourLeMobile } from '../../src/cibles/mobile/projet.js';
import { genererProjetStatique } from '../../src/cibles/statique/projet.js';
import { genererProjetDesktop } from '../../src/cibles/desktop/projet.js';
import { programme } from '../analyse/aide.js';

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const web = (source: string) => genererProjetWeb(compile(source), { nom: 'essai', adresse: 'https://exemple.cd', source: 'essai.humalis' });
const mobile = (source: string) => genererProjetMobile(compile(source), { nom: 'essai', source: 'essai.humalis' });
const statique = (source: string) => genererProjetStatique(compile(source), { nom: 'essai', source: 'essai.humalis' });

const SOURCE = programme(
  'page "p" :',
  '>grille avec colonnes 3 et espacement moyenne et alignement centre :',
  '>>bloc avec ombre legere et bordure douce et remplissage grande :',
  '>>>texte "a"',
  '>section "S" avec largeur etroite :',
  '>>texte "b"',
  '>ligne avec repartition entre :',
  '>>bouton "Oui"',
);

describe('mise en page — la cible web (4.1, 4.4)', () => {
  const fichiers = web(SOURCE);
  const css = fichiers.get('src/humalis/styles.css')!;
  const page = fichiers.get('src/pages/P.tsx') ?? [...fichiers.entries()].find(([n]) => n.endsWith('P.tsx'))![1];

  it('met les réglages en classes', () => {
    expect(page).toContain('className="humalis-grille humalis-colonnes-3 humalis-espacement-moyenne humalis-alignement-centree"');
    expect(page).toContain('humalis-ombre-legere humalis-bordure-douce humalis-remplissage-grande');
  });

  it('écrit le CSS des seules classes utilisées', () => {
    expect(css).toContain('.humalis-grille.humalis-colonnes-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }');
    expect(css).toContain('@media (max-width: 1023px) { .humalis-grille.humalis-colonnes-3 { grid-template-columns: repeat(2');
    expect(css).toContain('@media (max-width: 639px) { .humalis-grille.humalis-colonnes-3 { grid-template-columns: minmax(0, 1fr); } }');
    expect(css).toContain('.humalis-espacement-moyenne { gap: 1rem; }');
    expect(css).toContain('.humalis-largeur-etroite { max-width: 36rem;');
    expect(css).toContain('.humalis-repartition-entre { justify-content: space-between; }');
    expect(css).toContain('.humalis-ombre-legere { box-shadow:');
    expect(css).toContain('.humalis-bordure-douce { border-radius: 0.5rem; }');
    expect(css).not.toContain('humalis-colonnes-5');
    expect(css).not.toContain('humalis-ombre-forte');
  });

  it('n’écrit rien quand le programme n’utilise aucun réglage', () => {
    const sans = web(programme('page "p" :', '>grille :', '>>texte "a"')).get('src/humalis/styles.css')!;
    expect(sans).not.toContain('Les réglages de mise en page');
  });

  it('le desktop reprend le web à l’octet près', () => {
    const bureau = genererProjetDesktop(compile(SOURCE), { nom: 'essai', source: 'essai.humalis' });
    const cssBureau = [...bureau.entries()].find(([n]) => n.endsWith('styles.css'))![1];
    expect(cssBureau).toContain('.humalis-espacement-moyenne { gap: 1rem; }');
  });
});

describe('mise en page — sur telephone, sur tablette (4.2)', () => {
  const source = programme('page "p" :', '>sur telephone :', '>>texte "petit"', '>sur tablette ou ordinateur :', '>>texte "grand"');

  it('web : des enveloppes en CSS seul, sans JavaScript', () => {
    const fichiers = web(source);
    const page = [...fichiers.entries()].find(([n]) => n.endsWith('P.tsx'))![1];
    expect(page).toContain('className="humalis-appareil humalis-sur-telephone"');
    expect(page).toContain('className="humalis-appareil humalis-sur-tablette humalis-sur-ordinateur"');
    const css = fichiers.get('src/humalis/styles.css')!;
    expect(css).toContain('.humalis-appareil { display: none; }');
    expect(css).toContain('@media (max-width: 639px) { .humalis-sur-telephone { display: contents; } }');
    expect(css).toContain('@media (min-width: 1024px) { .humalis-sur-ordinateur { display: contents; } }');
  });

  it('statique : le même HTML et le même CSS', () => {
    const fichiers = statique(source);
    expect(fichiers.get('index.html')).toContain('humalis-appareil humalis-sur-telephone');
    expect(fichiers.get('humalis/styles.css')).toContain('.humalis-sur-tablette { display: contents; }');
  });

  it('mobile : un composant SurAppareil, écrit seulement quand il sert', () => {
    const fichiers = mobile(source);
    const page = fichiers.get('app/index.tsx')!;
    expect(page).toContain("<SurAppareil sur={['telephone']}>");
    expect(page).toContain("<SurAppareil sur={['tablette', 'ordinateur']}>");
    expect(page).toContain("import { SurAppareil } from '../humalis/appareil';");
    expect(fichiers.get('humalis/appareil.tsx')).toContain('useWindowDimensions');
    expect(mobile(programme('page "p" :', '>texte "a"')).has('humalis/appareil.tsx')).toBe(false);
  });
});

describe('mise en page — la cible mobile (4.1, 4.4, 4.5)', () => {
  it('traduit les réglages en StyleSheet', () => {
    const fichiers = mobile(SOURCE);
    const styles = fichiers.get('humalis/styles.ts')!;
    expect(styles).toContain('espacementMoyenne: { gap: 16 },');
    expect(styles).toContain('alignementCentree: { alignItems: \'center\' },');
    expect(styles).toContain('repartitionEntre: { justifyContent: \'space-between\' },');
    expect(styles).toContain('largeurEtroite:');
    expect(styles).toContain('ombreLegere:');
    expect(styles).toContain('bordureDouce: { borderRadius: 8 },');
    expect(fichiers.get('app/index.tsx')).toContain('s.espacementMoyenne');
  });

  it('un dégradé devient un composant Degrade, et la dépendance expo-linear-gradient n’arrive qu’alors', () => {
    const avec = mobile(programme('page "p" :', '>bloc avec degrade bleu vers violet vertical :', '>>texte "a"'));
    expect(avec.get('app/index.tsx')).toContain('<Degrade de="bleu" vers="violet" direction="vertical"');
    expect(avec.get('humalis/degrade.tsx')).toContain("from 'expo-linear-gradient'");
    expect(JSON.parse(avec.get('package.json')!).dependencies['expo-linear-gradient']).toBeDefined();
    const sans = mobile(programme('page "p" :', '>bloc :', '>>texte "a"'));
    expect(sans.has('humalis/degrade.tsx')).toBe(false);
    expect(JSON.parse(sans.get('package.json')!).dependencies['expo-linear-gradient']).toBeUndefined();
  });

  it('« colle » est signalé : sans effet sur le téléphone', () => {
    const avertissements = verifierPourLeMobile(compile(programme('page "p" :', '>bloc avec colle :', '>>texte "a"')));
    expect(avertissements.map((d) => d.message)).toEqual(["« colle » n'a pas d'effet sur le téléphone, sauf pour l'en-tête et le pied de page."]);
    const page = mobile(programme('page "p" :', '>bloc avec colle :', '>>texte "a"')).get('app/index.tsx')!;
    expect(page).not.toContain('colle');
  });
});

describe('mise en page — dégradé et élément collé sur le web et en statique (4.4, 4.5)', () => {
  const source = programme('page "p" :', '>bloc avec degrade bleu vers violet et colle en bas :', '>>texte "a"');

  it('web', () => {
    const css = web(source).get('src/humalis/styles.css')!;
    expect(css).toContain('.humalis-degrade-bleu-violet-diagonale { background: linear-gradient(135deg, var(--humalis-bleu), var(--humalis-violet)); color: var(--humalis-bleu-encre); }');
    expect(css).toContain('.humalis-colle-bas { position: sticky; bottom: 0;');
  });

  it('statique', () => {
    const css = statique(source).get('humalis/styles.css')!;
    expect(css).toContain('linear-gradient(135deg');
    expect(css).toContain('position: sticky');
  });
});
