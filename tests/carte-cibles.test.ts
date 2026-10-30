import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile, verifierPourLeMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { LEAFLET_JS, LEAFLET_CSS } from '../src/cibles/statique/leaflet-donnees.js';
import { programme } from './analyse/aide.js';

const p = (...lignes: string[]) => programme('page "p" :', ...lignes);
const POSITION = p('>carte "Le restaurant Le Fleuve, avenue de la Gombe" avec latitude -4,3250 et longitude 15,3222 et zoom 15');
const MARQUEURS = p(
  '>variable agences = [fiche avec nom "Gombe" et adresse "12 avenue du Port" et latitude -4,3047 et longitude 15,3070, fiche avec nom "Limete" et adresse "5 avenue des Poids Lourds" et latitude -4,3353 et longitude 15,3446]',
  '>carte "Nos deux agences à Kinshasa" :',
  '>>pour chaque agence dans agences :',
  '>>>marqueur agence.nom avec adresse agence.adresse et latitude agence.latitude et longitude agence.longitude',
  '>>marqueur "Entrepôt" avec latitude -4,3902 et longitude 15,2611',
);
const SANS_CARTE = p('>texte "Bonjour"', '>bouton "Réserver"');

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

describe('carte — le web', () => {
  const fichiers = web(MARQUEURS);
  const page = fichier(fichiers, 'src/pages/P.tsx');
  it('écrit le composant avec ses lieux : un objet par marqueur, un flatMap par « pour chaque »', () => {
    expect(page).toContain("import CarteLieux from '../humalis/carte-lieux';");
    expect(page).toContain('...agences.flatMap((agence) => [');
    expect(page).toContain('{ nom: String(agence.nom), adresse: String(agence.adresse), latitude: agence.latitude, longitude: agence.longitude },');
    expect(page).toContain("{ nom: 'Entrepôt', latitude: -4.3902, longitude: 15.2611 },");
    expect(page).toContain("nom={'Nos deux agences à Kinshasa'}");
  });
  it('une position écrit son centre et son zoom', () => {
    expect(fichier(web(POSITION), 'src/pages/P.tsx')).toMatch(/latitude=\{-4\.325\}\s+longitude=\{15\.3222\}\s+zoom=\{15\}\s+lieux=\{\[\]\}/);
  });
  it('un « si » devient un choix dans le tableau des lieux', () => {
    const code = fichier(web(p('>variable ouvert = vrai', '>carte "Plan" :', '>>si ouvert est vrai :', '>>>marqueur "Ici" avec latitude 1 et longitude 2')), 'src/pages/P.tsx');
    expect(code).toContain('...(ouvert ? [');
    expect(code).toContain('] : []),');
  });
  it('le composant : Leaflet chargé à l’ouverture, liste toujours écrite, attribution OpenStreetMap, sans animation si réduite', () => {
    const composant = fichier(fichiers, 'src/humalis/carte-lieux.tsx');
    expect(composant).toContain("import('leaflet')");
    expect(composant).toContain('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(composant).toContain('les contributeurs d’OpenStreetMap');
    expect(composant).toContain("zoomInTitle: 'Agrandir'");
    expect(composant).toContain("zoomOutTitle: 'Réduire'");
    expect(composant).toContain('prefers-reduced-motion: reduce');
    expect(composant).toContain('keyboard: true');
    expect(composant).toContain('Ouvrir dans OpenStreetMap');
    expect(composant).toContain('<section aria-label={nom}');
    expect(composant).not.toMatch(/innerHTML|dangerouslySetInnerHTML/);
    // La politique d'usage d'OpenStreetMap veut un Referer valide : le composant n'en règle pas la politique.
    expect(composant).not.toContain('referrerPolicy');
  });
  it('la liste des lieux est rendue hors de l’effet qui dessine la carte (elle est dans le HTML prérendu)', () => {
    expect(fichier(fichiers, 'src/humalis/carte-lieux.tsx')).toMatch(/<ul aria-label=[\s\S]*lieux\.map/);
  });
  it('leaflet est épinglée à 1.9.4 (avec ses types) seulement quand il y a une carte', () => {
    const paquet = JSON.parse(fichier(fichiers, 'package.json'));
    expect(paquet.dependencies.leaflet).toBe('1.9.4');
    expect(paquet.devDependencies['@types/leaflet']).toBe('1.9.21');
    const sans = web(SANS_CARTE);
    expect(fichier(sans, 'package.json')).not.toContain('leaflet');
    expect([...sans.keys()].some((n) => n.includes('carte-lieux'))).toBe(false);
    expect(fichier(sans, 'src/humalis/styles.css')).not.toContain('humalis-carte');
  });
  it('le CSS de la carte masque la liste des lieux à l’œil seulement', () => {
    const css = fichier(fichiers, 'src/humalis/styles.css');
    expect(css).toContain('.humalis-carte-lieux { position: absolute; width: 1px');
    expect(css).toContain('.humalis-carte-zone { position: relative; z-index: 0; height: 24rem');
  });
  it('un composant écrit en Humalis nommé « Carte » ne se heurte pas au composant de la carte', () => {
    const fichiersC = web(programme('composant "Carte" :', '>parametre titre', '>texte titre', 'page "p" :', '>Carte avec titre "A"', '>carte "Plan" avec latitude 1 et longitude 2'));
    const code = fichier(fichiersC, 'src/pages/P.tsx');
    expect(code).toContain("import CarteLieux from '../humalis/carte-lieux';");
    expect(code).toContain('<Carte titre="A" />');
  });
});

describe('carte — le site statique', () => {
  const fichiers = statique(MARQUEURS);
  it('recopie Leaflet 1.9.4 et sa feuille de style, sans CDN', () => {
    expect(fichier(fichiers, 'humalis/leaflet.js')).toBe(LEAFLET_JS);
    expect(fichier(fichiers, 'humalis/leaflet.css')).toBe(LEAFLET_CSS);
    expect(LEAFLET_JS).toContain('Leaflet 1.9.4');
    const html = fichier(fichiers, 'index.html');
    expect(html).toContain('<script src="humalis/leaflet.js" defer></script>');
    expect(html).toContain('<link rel="stylesheet" href="humalis/leaflet.css">');
    for (const [nom, code] of fichiers) if (!nom.includes('leaflet')) expect(code, nom).not.toMatch(/unpkg\.com|cdnjs|jsdelivr/);
  });
  it('le HTML de départ contient déjà la liste des lieux et le nom de la carte', () => {
    const html = fichier(fichiers, 'index.html');
    expect(html).toContain('<section aria-label="Nos deux agences à Kinshasa" class="humalis-carte">');
    expect(html).toContain('<li><strong>Gombe</strong><span>12 avenue du Port</span><a href="https://www.openstreetmap.org/?mlat=-4.3047&amp;mlon=15.307#map=15/-4.3047/15.307" aria-label="Ouvrir dans OpenStreetMap : Gombe">Ouvrir dans OpenStreetMap</a></li>');
    expect(html).toContain('<strong>Entrepôt</strong>');
  });
  it('le script redessine la même carte', () => {
    expect(fichier(fichiers, 'pages/p.js')).toContain("carteLieux('carte_ligne_");
    expect(fichier(fichiers, 'pages/p.js')).toContain('...agences.flatMap((agence) => [');
    expect(fichier(fichiers, 'humalis/humalis.js')).toContain('function carteLieux(');
  });
  it('les seules transitions de la feuille de Leaflet sont sous des classes que la carte ne pose pas quand les animations sont réduites', () => {
    const regles = [...LEAFLET_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*transition[^{}]*)\}/g)].map((m) => m[1].trim().replace(/\s+/g, ' '));
    expect(regles).toEqual([
      '.leaflet-fade-anim .leaflet-popup',
      '.leaflet-zoom-anim .leaflet-zoom-animated',
      '.leaflet-zoom-anim .leaflet-tile, .leaflet-pan-anim .leaflet-tile',
    ]);
    // Le script de la carte coupe le fondu et le zoom animé quand « réduire les animations » est demandé.
    const script = fichier(fichiers, 'humalis/humalis.js');
    expect(script).toContain("matchMedia('(prefers-reduced-motion: reduce)').matches");
    expect(script).toContain('zoomAnimation: !calme, fadeAnimation: !calme, markerZoomAnimation: !calme, inertia: !calme');
  });
  it('sans carte, aucun fichier de Leaflet ni fonction de carte', () => {
    const sans = statique(SANS_CARTE);
    expect([...sans.keys()].some((n) => n.includes('leaflet'))).toBe(false);
    expect(fichier(sans, 'humalis/humalis.js')).not.toContain('carteLieux');
    expect(fichier(sans, 'index.html')).not.toContain('leaflet');
  });
  it('une page sans carte du même site n’appelle pas Leaflet', () => {
    const deux = statique(programme('page "a" :', '>carte "Plan" avec latitude 1 et longitude 2', 'page "b" :', '>texte "Bonjour"'));
    expect(fichier(deux, 'index.html')).toContain('leaflet.js');
    expect(fichier(deux, 'b.html')).not.toContain('leaflet');
  });
});

describe('carte — le desktop', () => {
  it('reprend le web : composant, leaflet et ses types dans le package.json, img-src https: pour les tuiles', () => {
    const fichiers = desktop(MARQUEURS);
    expect(fichier(fichiers, 'src/humalis/carte-lieux.tsx')).toContain("import('leaflet')");
    const paquet = JSON.parse(fichier(fichiers, 'package.json'));
    expect(paquet.devDependencies.leaflet).toBe('1.9.4');
    expect(paquet.devDependencies['@types/leaflet']).toBe('1.9.21');
    expect(fichier(fichiers, 'electron/principal.ts')).toContain(`"img-src 'self' data: https:`);
  });
  it('sans carte, rien de plus', () => {
    expect(fichier(desktop(SANS_CARTE), 'package.json')).not.toContain('leaflet');
  });
});

describe('carte — le mobile (décision M15)', () => {
  const fichiers = mobile(MARQUEURS);
  it('écrit une carte native, react-native-maps (version accordée à Expo 57), et la liste des lieux', () => {
    const composant = fichier(fichiers, 'humalis/carte-lieux.tsx');
    expect(composant).toContain("from 'react-native-maps'");
    expect(composant).toContain('<Marker key={i} coordinate={lieu} title={lieu.nom} description={lieu.adresse}');
    expect(composant).toContain('accessibilityLabel={nom}');
    expect(JSON.parse(fichier(fichiers, 'package.json')).dependencies['react-native-maps']).toBe('1.27.2');
  });
  it('laisse l’emplacement vide de la clé Google pour Android dans app.json, et l’explique', () => {
    expect(JSON.parse(fichier(fichiers, 'app.json')).expo.android.config.googleMaps.apiKey).toBe('');
    const lisezmoi = fichier(fichiers, 'LISEZMOI.md');
    expect(lisezmoi).toContain('ajoutez votre clé Google Maps dans app.json');
    expect(lisezmoi).toContain('Sur iPhone, la carte est celle d’Apple et n’a besoin d’aucune clé');
  });
  it('dit la même chose à la compilation, une fois', () => {
    expect(verifierPourLeMobile(compile(MARQUEURS)).filter((d) => d.message.includes('clé Google Maps'))).toHaveLength(1);
  });
  it('sans carte, ni dépendance, ni clé, ni phrase', () => {
    const sans = mobile(SANS_CARTE);
    expect(fichier(sans, 'package.json')).not.toContain('react-native-maps');
    expect(fichier(sans, 'app.json')).not.toContain('googleMaps');
    expect(fichier(sans, 'LISEZMOI.md')).not.toContain('Google Maps');
    expect([...sans.keys()].some((n) => n.includes('carte-lieux'))).toBe(false);
  });
});

describe('carte — un programme sans carte produit les mêmes octets', () => {
  it('aucun fichier ni mot de la carte dans les quatre cibles', () => {
    for (const fichiers of [web(SANS_CARTE), statique(SANS_CARTE), mobile(SANS_CARTE), desktop(SANS_CARTE)]) {
      for (const [nom, code] of fichiers) {
        expect(nom, nom).not.toMatch(/carte-lieux|leaflet/);
        expect(code, nom).not.toMatch(/CarteLieux|carteLieux|leaflet|react-native-maps|humalis-carte/);
      }
    }
  });
});

describe('mobile : « transition » et « effet » sont sans effet sur un bouton', () => {
  it('n’écrit aucune référence à un style qui n’existe pas', () => {
    const fichiers = mobile(p('>bouton "Réserver" avec transition douce et effet agrandi et fond vert'));
    const page = [...fichiers.entries()].find(([n]) => n.startsWith('app/index'))?.[1] ?? '';
    expect(page).not.toMatch(/transitionDouce|effetAgrandi|effetLeve/);
    expect(page).toContain('s.texteBouton');
    expect(page).toContain('s.fondVert');
  });
});

describe('carte : les langues (plan qualité, T10)', () => {
  const AVEC = programme('langues :', '>francais', '>anglais', '') + '\n' + MARQUEURS;
  it('avec un bloc « langues », les textes de la carte passent par t()', () => {
    const composant = fichier(web(AVEC), 'src/humalis/carte-lieux.tsx');
    expect(composant).toContain("zoomInTitle: t({ fr: 'Agrandir', en: 'Zoom in' })");
    expect(composant).toContain("zoomOutTitle: t({ fr: 'Réduire', en: 'Zoom out' })");
    expect(composant).toContain('Open in OpenStreetMap');
    expect(composant).toContain("import { t } from './langue';");
    const sortieStatique = fichier(statique(AVEC), 'humalis/humalis.js');
    expect(sortieStatique).toContain("zoomInTitle: t({ fr: 'Agrandir', en: 'Zoom in' })");
    expect(sortieStatique).toContain('Places on the map: ${nom}');
  });
  it('sans bloc « langues », le code de la carte ne change pas', () => {
    const composant = fichier(web(MARQUEURS), 'src/humalis/carte-lieux.tsx');
    expect(composant).toContain("zoomInTitle: 'Agrandir'");
    expect(composant).not.toContain('t({');
  });
});
