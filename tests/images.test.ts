import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { mediasLocaux, nomDeLaCopie, type InfoMedia } from '../src/ri/medias.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const p = (...lignes: string[]) => programme('page "p" :', ...lignes);
const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;
const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const MEDIAS = new Map<string, InfoMedia>([['salle.jpg', { octets: 120_000, largeur: 1600, hauteur: 900 }]]);
const web = (source: string, medias = MEDIAS) => genererProjetWeb(compile(source), { nom: 'e', adresse: 'https://x.cd', source: 'e.humalis', medias });
const statique = (source: string, medias = MEDIAS) => genererProjetStatique(compile(source), { nom: 'e', source: 'e.humalis', medias });
const mobile = (source: string, medias = MEDIAS) => genererProjetMobile(compile(source), { nom: 'e', source: 'e.humalis', medias });
const desktop = (source: string, medias = MEDIAS) => genererProjetDesktop(compile(source), { nom: 'e', source: 'e.humalis', medias });
const fichier = (fichiers: Map<string, string>, fin: string) => [...fichiers.entries()].find(([n]) => n.endsWith(fin))?.[1] ?? '';

const PLATS = [
  '>variable plats = [fiche avec nom "Moambe" et photo "https://cdn.lefleuve.cd/moambe.jpg"]',
  '>pour chaque plat dans plats :',
  '>>image plat.photo avec description plat.nom et proportions 4 sur 3 et ajustement remplir',
];

describe('images — le parser', () => {
  it('lit description, decorative, prioritaire, proportions et ajustement', () => {
    const [banniere, filigrane] = corps(p('>image "salle.jpg" avec description "Le fleuve au coucher du soleil" et prioritaire', '>image "filigrane.svg" avec decoratif')) as any[];
    expect(banniere.styles).toEqual([
      { propriete: 'description', valeur: 'Le fleuve au coucher du soleil', parties: [{ type: 'texte', valeur: 'Le fleuve au coucher du soleil' }] },
      { propriete: 'prioritaire', valeur: 'oui' },
    ]);
    expect(filigrane.styles).toEqual([{ propriete: 'decoratif', valeur: 'oui' }]);
    const plat = (corps(p(...PLATS))[1] as any).corps[0];
    expect(plat.styles).toEqual([
      { propriete: 'description', valeur: '{plat.nom}', parties: [{ type: 'variable', valeur: 'plat.nom' }] },
      { propriete: 'proportions', valeur: '4:3' },
      { propriete: 'ajustement', valeur: 'remplir' },
    ]);
  });
  it('refuse des proportions mal écrites', () => {
    expect(() => corps(p('>image "a.jpg" avec description "a" et proportions 4'))).toThrow('« proportions 4 sur 3 »');
  });
  it('ces mots restent des noms ailleurs', () => {
    expect(erreurs(p('>variable decorative = 1', '>variable proportions = 2', '>variable prioritaire = vrai', '>texte "{decorative} {proportions}"'))).toEqual([]);
  });
});

describe('images — l’analyse (décision M4)', () => {
  it('une image sans description est refusée, avec un exemple', () => {
    expect(erreurs(p('>image "salle.jpg"'))).toEqual([
      '2 : décrivez l’image pour les personnes qui ne la voient pas : « avec description "Le fleuve au coucher du soleil" », ou « avec decoratif » si elle ne porte aucune information.',
    ]);
  });
  it('description et decorative ensemble, ou une description vide : refusées', () => {
    expect(erreurs(p('>image "a.jpg" avec description "x" et decorative'))).toHaveLength(1);
    expect(erreurs(p('>image "a.jpg" avec description "  "'))).toEqual([
      '2 : la description de l’image est vide : écrivez ce qu’elle montre, ou « avec decoratif » si elle ne porte aucune information.',
    ]);
  });
  it('des proportions nulles, un format inconnu : refusés', () => {
    expect(erreurs(p('>image "a.jpg" avec description "x" et proportions 4 sur 0'))).toEqual(['2 : les proportions sont deux nombres entiers positifs : « proportions 4 sur 3 » (ici, 4 sur 0).']);
    expect(erreurs(p('>image "plan.bmp" avec description "Le plan"'))[0]).toContain('« plan.bmp » n’est pas une image que les navigateurs savent afficher');
  });
  it('une description qui lit une variable inconnue est refusée', () => {
    expect(erreurs(p('>image "a.jpg" avec description "{inconnu}"'))).toHaveLength(1);
  });
  it('les options des images ne vont que sur une image', () => {
    expect(erreurs(p('>texte "a" avec prioritaire'))).toHaveLength(1);
  });
  it('prévient au-delà de deux images prioritaires dans une page', () => {
    const lignes = ['a', 'b', 'c'].map((n) => `>image "${n}.jpg" avec description "${n}" et prioritaire`);
    expect(avertissements(p(...lignes))).toEqual([
      '4 : 3 images « prioritaire » dans cette page : au-delà de 2, elles se disputent le réseau et aucune n’arrive plus vite. Gardez « prioritaire » pour la grande image du haut.',
    ]);
  });
  it('accepte les images bien décrites', () => {
    expect(erreurs(p('>image "salle.jpg" avec description "La salle" et prioritaire', '>image "f.svg" avec decoratif', ...PLATS))).toEqual([]);
  });
});

describe('images — les fichiers locaux', () => {
  it('liste chaque fichier local une fois (ni adresse, ni chemin absolu)', () => {
    const application = compile(p('>image "salle.jpg" avec description "a"', '>image "./salle.jpg" avec description "b"', '>image "https://x.cd/a.png" avec description "c"', '>image "/logo.png" avec description "d"', '>image "salle.jpg" avec description "e"'));
    expect(mediasLocaux(application).map((m) => m.chemin)).toEqual(['salle.jpg', './salle.jpg']);
  });
  it('le nom de la copie garde le chemin écrit, sans « ./ » ni remontée', () => {
    expect(nomDeLaCopie('./plats/moambe.jpg')).toBe('plats/moambe.jpg');
    expect(nomDeLaCopie('../photos/salle.jpg')).toBe('salle.jpg');
  });
});

const IMAGES = p('>image "salle.jpg" avec description "Le fleuve au coucher du soleil" et prioritaire', '>image "filigrane.svg" avec decoratif', ...PLATS);

describe('images — web et desktop', () => {
  it('chargement différé, décodage à part, dimensions lues, priorité, alt décoratif, proportions', () => {
    const page = fichier(web(IMAGES), 'pages/P.tsx');
    expect(page).toContain('<img src="/images/salle.jpg" alt="Le fleuve au coucher du soleil" width={1600} height={900} fetchPriority="high" decoding="async"');
    expect(page).toContain('<img src="/images/filigrane.svg" alt="" aria-hidden="true" loading="lazy" decoding="async"');
    expect(page).toContain('<img src={plat.photo} alt={`${plat.nom}`} loading="lazy" decoding="async"');
    expect(page).toContain('className="humalis-ajustement-remplir" style={{ aspectRatio: \'4 / 3\' }}');
    expect(page).not.toMatch(/alt="photo|alt="salle/);
  });
  it('le CSS réserve la place (hauteur automatique) et donne l’ajustement', () => {
    const css = fichier(web(IMAGES), 'styles.css');
    expect(css).toContain('.humalis-ajustement-remplir { object-fit: cover;');
  });
  it('desktop : les mêmes images', () => {
    expect(fichier(desktop(IMAGES), 'pages/P.tsx')).toContain('<img src="/images/salle.jpg" alt="Le fleuve au coucher du soleil" width={1600} height={900}');
  });
});

describe('images — statique', () => {
  it('le HTML de départ et le script écrivent les mêmes attributs', () => {
    const fichiers = statique(IMAGES);
    const html = fichier(fichiers, 'index.html');
    expect(html).toContain('<img src="images/salle.jpg" alt="Le fleuve au coucher du soleil" width="1600" height="900" fetchpriority="high" decoding="async"');
    expect(html).toContain('<img src="images/filigrane.svg" alt="" loading="lazy" decoding="async"');
    expect(html).toContain('style="aspect-ratio: 4 / 3"');
    const script = fichier(fichiers, 'pages/p.js');
    expect(script).toContain("'fetchpriority': 'high'");
    expect(script).toContain("'loading': 'lazy'");
  });
});

describe('images — mobile', () => {
  it('expo-image, require pour un fichier local, uri sinon, contentFit et accessibilité', () => {
    const fichiers = mobile(IMAGES);
    const page = fichier(fichiers, 'app/index.tsx');
    expect(page).toContain("import { Image } from 'expo-image';");
    expect(page).toContain("source={require('../assets/images/salle.jpg')}");
    expect(page).toContain('accessibilityLabel="Le fleuve au coucher du soleil"');
    expect(page).toContain('priority="high"');
    expect(page).toContain('accessible={false}');
    expect(page).toContain('source={{ uri: plat.photo }}');
    expect(page).toContain('contentFit="cover"');
    expect(page).toContain('aspectRatio: 4 / 3');
    expect(page).toContain('aspectRatio: 1600 / 900');
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['expo-image']).toBeDefined();
  });
  it('sans image, ni expo-image ni dossier d’images', () => {
    const fichiers = mobile(p('>titre "a"'));
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['expo-image']).toBeUndefined();
  });
});

describe('images — mobile, une page plus profonde', () => {
  it('le chemin de l’image suit la profondeur du fichier (app/plat/[slug].tsx)', () => {
    const fichiers = mobile(programme('page "plat" avec parametre slug :', '>titre "Plat"', '>image "salle.jpg" avec description "La salle"'));
    expect(fichier(fichiers, 'app/plat/[slug].tsx')).toContain("source={require('../../assets/images/salle.jpg')}");
  });
});
