import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { GEOMETRIE_JS } from '../src/cibles/commun/graphique/geometrie.js';
import { formaterArgent, formaterNombre } from '../src/cibles/format.js';
import { programme } from './analyse/aide.js';

const VENTES = programme(
  'page "ventes" :',
  '>titre "Ventes du trimestre"',
  '>variable ventes = [fiche avec mois "Janvier" et montant 120000, fiche avec mois "Février" et montant 180000, fiche avec mois "Mars" et montant 150000]',
  '>graphique en courbe ventes avec etiquette mois et valeur montant en FC et description "Les ventes passent de 120 000 FC en janvier à 150 000 FC en mars."',
);
const SANS = programme('page "accueil" :', '>titre "Bonjour"', '>texte "Rien à dessiner."');
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

describe('graphiques — le web', () => {
  const projet = web(VENTES);
  const page = fichier(projet, 'pages/Ventes.tsx');

  it('la page écrit <Graphique> avec ses données, ses champs, sa devise et sa description', () => {
    expect(page).toContain(
      '<Graphique genre="courbe" donnees={ventes} etiquette="mois" nomEtiquettes="Mois" series={[{ nom: \'Montant\', valeur: \'montant\' }]} devise="FC" titre="Graphique en courbe" description="Les ventes passent de 120 000 FC en janvier à 150 000 FC en mars." />',
    );
    expect(page).toContain("import Graphique from '../humalis/graphique';");
  });

  it('le composant : figure, role="img", title, desc, la table « Voir les données », aucune bibliothèque', () => {
    const composant = projet.get('src/humalis/graphique.tsx')!;
    expect(composant).toContain('<figure className={classes}>');
    expect(composant).toContain('role="img" aria-labelledby={id + \'-nom \' + id + \'-desc\'}');
    expect(composant).toContain('<title id={id + \'-nom\'}>{titre}</title>');
    expect(composant).toContain('<desc id={id + \'-desc\'}>{description}</desc>');
    expect(composant).toContain('<summary>Voir les données</summary>');
    expect(composant).toContain('<th key={i} scope="col">{entete}</th>');
    const imports = [...composant.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['react', './graphique-geometrie', './outils']);
    expect(projet.get('src/humalis/graphique-geometrie.js')).toContain(GEOMETRIE_JS);
    expect(projet.get('src/humalis/graphique-geometrie.d.ts')).toContain('export function calculerGraphique');
    expect(JSON.parse(projet.get('package.json')!).dependencies).not.toHaveProperty('recharts');
    expect(projet.get('src/humalis/outils.ts')).toContain('export function formaterArgent');
  });

  it('le CSS : la version étroite sous 34rem (requête de conteneur), une couleur de série par couleur', () => {
    const css = projet.get('src/humalis/styles.css')!;
    expect(css).toContain('@container humalis-graphique (max-width: 34rem)');
    expect(css).toContain('.humalis-graphique-c-bleu { --humalis-serie: var(--humalis-bleu); }');
  });

  it('un programme sans graphique n’écrit ni composant, ni géométrie, ni CSS de graphique', () => {
    const sans = web(SANS);
    expect([...sans.keys()].filter((n) => n.includes('graphique'))).toEqual([]);
    expect(sans.get('src/humalis/styles.css')).not.toContain('humalis-graphique');
    expect([...statique(SANS).entries()].filter(([n, c]) => n.includes('graphique') || c.includes('graphique'))).toEqual([]);
    expect([...mobile(SANS).keys()].filter((n) => n.includes('graphique'))).toEqual([]);
  });

  it('le desktop reprend le web', () => {
    const projetDesktop = desktop(VENTES);
    expect(fichier(projetDesktop, 'humalis/graphique.tsx')).toBe(projet.get('src/humalis/graphique.tsx'));
  });
});

describe('graphiques — le site statique', () => {
  const projet = statique(VENTES);
  const html = fichier(projet, 'ventes.html') || fichier(projet, 'index.html');
  const script = fichier(projet, 'pages/ventes.js');

  it('le HTML de départ contient déjà le dessin, sa description et sa table', () => {
    expect(html).toContain('<figure class="humalis-graphique" data-humalis="graphique-4">');
    expect(html).toContain('role="img" aria-labelledby="graphique-4-l-nom graphique-4-l-desc"');
    expect(html).toContain('<tr><th scope="row">Février</th><td>180 000 FC</td></tr>');
    expect(html).toContain('<script src="humalis/graphique.js" defer></script>');
  });

  it('le script redessine avec la même fonction : son HTML est celui de la page, caractère pour caractère', () => {
    expect(script).toContain("humalisGraphique.dessiner({ id: 'graphique-4', genre: 'courbe', etiquette: 'mois', nomEtiquettes: 'Mois', series: [{ nom: 'Montant', valeur: 'montant' }], devise: 'FC', titre: 'Graphique en courbe', description: ");
    const code = projet.get('humalis/graphique.js')!;
    expect(code).toContain('function calculerGraphique(config, lignes, formater, largeur)');
    // Le script, exécuté sans navigateur : un faux « document » rend le HTML qu'il aurait inséré.
    let insere = '';
    const document = { createElement: () => ({ set innerHTML(v: string) { insere = v; }, content: { firstElementChild: 'élément' } }) };
    const humalis = { formaterArgent, formaterNombre };
    const module = new Function('document', 'humalis', `${code}\nreturn humalisGraphique;`)(document, humalis);
    const appel = /humalisGraphique\.dessiner\((\{.*\}), (ventes)\)/.exec(script)!;
    const ventes = [{ mois: 'Janvier', montant: 120000 }, { mois: 'Février', montant: 180000 }, { mois: 'Mars', montant: 150000 }];
    const config = new Function('ventes', `return ${appel[1]};`)(ventes);
    expect(module.dessiner(config, ventes)).toBe('élément');
    expect(html).toContain(insere);
  });
});

describe('graphiques — le mobile', () => {
  const projet = mobile(VENTES);

  it('react-native-svg (version d’Expo 57) seulement quand un graphique est dessiné, et un libellé accessible', () => {
    expect(JSON.parse(projet.get('package.json')!).dependencies['react-native-svg']).toBe('15.15.4');
    expect(JSON.parse(mobile(SANS).get('package.json')!).dependencies['react-native-svg']).toBeUndefined();
    const composant = projet.get('humalis/graphique.tsx')!;
    expect(composant).toContain("from 'react-native-svg'");
    expect(composant).toContain("accessibilityRole=\"image\" accessibilityLabel={titre + '. ' + description}");
    expect(composant).toContain("'Voir les données'");
    expect(projet.get('humalis/graphique-geometrie.js')).toContain(GEOMETRIE_JS);
    expect(fichier(projet, 'app/index.tsx')).toContain('<Graphique genre="courbe"');
  });
});
