import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { BINAIRE } from '../src/cibles/binaire.js';
import { dimensionsImage } from '../src/image/entete.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

// Plan 2026-10-30-qualite-publication, parties 3 à 5 (Q10 à Q14, acceptées par Emch) :
// le bloc « site : », le bloc « apercu : », le logo, le plan du site et robots.txt.
const lire = (...lignes: string[]) => analyserSyntaxe(analyser(programme(...lignes)));

const SITE = [
  'site :',
  '>nom "Rey Store"',
  '>description "Maillots et mode, livrés à Kinshasa, en trois jours seulement."',
  '>image "./partage/rey-store.png"',
  '>logo "./logo.svg"',
  '>adresse "https://reystore.cd"',
  '',
];

const BOUTIQUE = programme(
  ...SITE,
  'page "accueil" :',
  '>titre "Bienvenue"',
  '>texte "Les nouveautés de la semaine, choisies pour vous à Kinshasa."',
  'page "panier" :',
  '>apercu :',
  '>>indexation non',
  '>titre "Votre panier"',
  '>texte "Les articles que vous avez choisis, prêts à être commandés."',
  'page "a_propos" :',
  '>apercu :',
  '>>titre "Qui sommes-nous"',
  '>>description "Rey Store, une boutique de Kinshasa : maillots, pagnes & mode."',
  '>titre "À propos"',
);

const IMAGE_PNG = (largeur: number, hauteur: number) => {
  const octets = new Uint8Array(24);
  octets.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(octets.buffer).setUint32(16, largeur);
  new DataView(octets.buffer).setUint32(20, hauteur);
  return octets;
};

describe('publication — le parseur', () => {
  it('lit le bloc « site : » et ses lignes', () => {
    const { site } = lire(...SITE, 'page "a" :', '>titre "A"');
    expect(site).toMatchObject({
      nom: 'Rey Store',
      image: './partage/rey-store.png',
      logo: './logo.svg',
      adresse: 'https://reystore.cd',
      indexation: true,
    });
  });

  it('lit « indexation non » du site', () => {
    expect(lire('site :', '>nom "A"', '>indexation non', '', 'page "a" :', '>titre "A"').site?.indexation).toBe(false);
  });

  it('lit le bloc « apercu : » d’une page, qui n’est pas un élément affiché', () => {
    const [, , page] = analyserSyntaxe(analyser(BOUTIQUE)).pages;
    expect(page.apercu).toMatchObject({ indexation: true });
    expect(page.apercu?.titre?.type).toBe('Chaine');
    expect(page.corps.some((i) => (i as { type: string }).type === 'Apercu')).toBe(false);
  });

  it('refuse une ligne inconnue dans « site : », en donnant celles qui existent', () => {
    expect(() => lire('site :', '>couleur "bleu"', '', 'page "a" :', '>titre "A"')).toThrow(/nom, description, image, logo, adresse ou indexation/);
  });

  it('refuse deux blocs « site »', () => {
    expect(() => lire('site :', '>nom "A"', '', 'site :', '>nom "B"', '', 'page "a" :', '>titre "A"')).toThrow(/un seul bloc « site »/);
  });

  it('« site » reste un nom de variable ailleurs', () => {
    expect(erreurs(programme('page "a" :', '>variable site = "x"', '>texte "{site}"'))).toEqual([]);
  });
});

describe('publication — l’analyse', () => {
  it('un site bien décrit ne donne aucune erreur', () => {
    expect(erreurs(BOUTIQUE)).toEqual([]);
  });

  it('l’adresse du site commence par https://', () => {
    expect(erreurs(programme('site :', '>adresse "reystore.cd"', '', 'page "a" :', '>titre "A"'))).toEqual([
      '2 : l\'adresse du site « reystore.cd » doit commencer par https:// (ou http://localhost pour un essai).',
    ]);
  });

  it('avertit d’un titre trop long et d’une description trop courte', () => {
    const messages = avertissements(programme(
      'site :', '>nom "R"', '>logo "./l.svg"', '',
      'page "a" :',
      '>apercu :',
      '>>titre "Un titre beaucoup trop long pour tenir dans une ligne de résultat de recherche"',
      '>>description "Trop court."',
      '>titre "A"',
    ));
    expect(messages.join('\n')).toMatch(/plus de 60 caractères/);
    expect(messages.join('\n')).toMatch(/moins de 50 caractères/);
  });

  it('avertit d’une page sans description propre, seulement quand le site est déclaré', () => {
    const avecSite = avertissements(programme('site :', '>nom "R"', '>logo "./l.svg"', '', 'page "a" :', '>titre "A"'));
    expect(avecSite.join('\n')).toMatch(/la page « a » n'a pas de description/);
    expect(avertissements(programme('page "a" :', '>titre "A"'))).toEqual([]);
  });

  it('avertit d’un site sans logo', () => {
    expect(avertissements(programme('site :', '>nom "R"', '', 'page "a" :', '>titre "A"', '>texte "Une description assez longue pour ne pas être coupée ici."')).join('\n')).toMatch(
      /le site n'a pas d'icône/,
    );
  });

  it('avertit qu’un aperçu calculé ne sera pas vu par les réseaux sociaux', () => {
    const messages = avertissements(programme(
      ...SITE,
      'page "produit" avec parametre nom :',
      '>apercu :',
      '>>titre "{nom} | Rey Store"',
      '>titre "Produit"',
      '>texte "Un produit de la boutique, livré à Kinshasa en trois jours."',
    ));
    expect(messages.join('\n')).toMatch(/l'aperçu de partage de « produit » dépend de données/);
  });

  it('une interpolation inconnue dans l’aperçu est une erreur, comme dans un texte', () => {
    expect(erreurs(programme('page "a" :', '>apercu :', '>>titre "{produt}"', '>titre "A"')).join('\n')).toMatch(/« produt » n'est pas déclarée/);
  });
});

describe('publication — le site web', () => {
  const fichiers = genererProjetWeb(compiler(BOUTIQUE).application!, {
    nom: 'boutique', adresse: 'https://reystore.cd', source: 'b.humalis',
    images: new Map([['./logo.svg', btoa('<svg xmlns="http://www.w3.org/2000/svg"/>')], ['./partage/rey-store.png', 'iVBORw0KGgo=']]),
  });

  it('index.html porte l’icône et le nom du site', () => {
    const index = fichiers.get('index.html')!;
    expect(index).toContain('<link rel="icon" type="image/svg+xml" href="/logo.svg" />');
    expect(index).toContain('<meta property="og:site_name" content="Rey Store" />');
    expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
  });

  it('chaque page pose son aperçu : titre complété du nom du site, image absolue, canonique', () => {
    const page = fichiers.get('src/pages/APropos.tsx')!;
    expect(page).toContain("usePage('Qui sommes-nous | Rey Store', 'Rey Store, une boutique de Kinshasa : maillots, pagnes & mode.', { adresse: 'https://reystore.cd/a_propos', image: 'https://reystore.cd/partage/rey-store.png' });");
    const outil = fichiers.get('src/humalis/page.ts')!;
    expect(outil).toContain("meta('property', 'og:title', titre)");
    expect(outil).toContain("'twitter:card'");
    expect(outil).toContain("rel = 'canonical'");
  });

  it('une page « indexation non » porte noindex et sort du prérendu et du plan du site', () => {
    expect(fichiers.get('src/pages/Panier.tsx')).toContain('noindex: true');
    const config = fichiers.get('astratra.prerender.config.cjs')!;
    expect(config).not.toContain('/panier');
    expect(config).toContain('siteUrl: "https://reystore.cd"');
  });

  it('robots.txt, manifest et fichiers du projet recopiés', () => {
    expect(fichiers.get('public/robots.txt')).toBe('User-agent: *\nAllow: /\nSitemap: https://reystore.cd/sitemap.xml\n');
    expect(JSON.parse(fichiers.get('public/manifest.webmanifest')!)).toEqual({
      name: 'Rey Store',
      icons: [{ src: '/logo.svg', type: 'image/svg+xml', sizes: 'any' }],
      display: 'browser',
    });
    expect(fichiers.get('public/logo.svg')!.startsWith(BINAIRE)).toBe(true);
    expect(fichiers.get('public/partage/rey-store.png')!.startsWith(BINAIRE)).toBe(true);
  });

  it('sans bloc « site », rien ne change', () => {
    const avant = genererProjetWeb(compiler(programme('page "a" :', '>titre "A"')).application!, { nom: 'a', adresse: 'http://localhost', source: 'a.humalis' });
    expect(avant.get('index.html')).not.toContain('og:');
    expect(avant.has('public/robots.txt')).toBe(false);
    expect(avant.get('src/pages/A.tsx')).toContain("usePage('A', 'A');");
  });

  it('« indexation non » du site ferme tout aux moteurs', () => {
    const ferme = genererProjetWeb(compiler(programme('site :', '>nom "R"', '>indexation non', '', 'page "a" :', '>titre "A"')).application!, { nom: 'a', adresse: 'https://r.cd', source: 'a.humalis' });
    expect(ferme.get('public/robots.txt')).toBe('User-agent: *\nDisallow: /\n');
    expect(ferme.get('astratra.prerender.config.cjs')).toContain('sitemap: false');
    expect(ferme.get('src/pages/A.tsx')).toContain('noindex: true');
  });
});

describe('publication — le site statique', () => {
  const fichiers = genererProjetStatique(compiler(BOUTIQUE).application!, {
    nom: 'boutique', source: 'b.humalis',
    images: new Map([['./logo.svg', btoa('<svg xmlns="http://www.w3.org/2000/svg"/>')], ['./partage/rey-store.png', 'iVBORw0KGgo=']]),
  });

  it('chaque page a son en-tête complet, échappé', () => {
    const html = fichiers.get('a_propos.html')!;
    expect(html).toContain('<title>Qui sommes-nous | Rey Store</title>');
    expect(html).toContain('<meta property="og:description" content="Rey Store, une boutique de Kinshasa : maillots, pagnes &amp; mode." />');
    expect(html).toContain('<link rel="canonical" href="https://reystore.cd/a_propos.html" />');
    expect(html).toContain('<meta property="og:image" content="https://reystore.cd/partage/rey-store.png" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="logo.svg" />');
    expect(fichiers.get('panier.html')).toContain('<meta name="robots" content="noindex" />');
  });

  it('sitemap.xml liste les pages indexables, robots.txt le cite', () => {
    const plan = fichiers.get('sitemap.xml')!;
    expect(plan).toContain('<loc>https://reystore.cd/</loc>');
    expect(plan).toContain('<loc>https://reystore.cd/a_propos.html</loc>');
    expect(plan).not.toContain('panier');
    expect(fichiers.get('robots.txt')).toBe('User-agent: *\nAllow: /\nSitemap: https://reystore.cd/sitemap.xml\n');
  });

  it('sans adresse, pas de plan du site', () => {
    const sansAdresse = genererProjetStatique(compiler(programme('site :', '>nom "R"', '', 'page "a" :', '>titre "A"')).application!, { nom: 'a', source: 'a.humalis' });
    expect(sansAdresse.has('sitemap.xml')).toBe(false);
    expect(sansAdresse.get('robots.txt')).toBe('User-agent: *\nAllow: /\n');
  });
});

describe('publication — le mobile', () => {
  it('le nom du site devient le nom de l’application', () => {
    const fichiers = genererProjetMobile(compiler(programme('site :', '>nom "Rey Store"', '', 'page "a" :', '>titre "A"')).application!, { nom: 'boutique', source: 'b.humalis' });
    expect(JSON.parse(fichiers.get('app.json')!).expo.name).toBe('Rey Store');
  });
});

describe('publication — les dimensions d’une image, lues à la main', () => {
  it('lit la largeur et la hauteur d’un PNG', () => {
    expect(dimensionsImage(IMAGE_PNG(512, 512))).toMatchObject({ largeur: 512, hauteur: 512 });
    expect(dimensionsImage(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});
