import { describe, it, expect } from 'vitest';
import { compilerProjet } from '../src/fichiers.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { repereSource, attributSourceHtml, attributSourceJsx, AIDE_REPERES } from '../src/cibles/commun/reperes.js';
import { programme } from './analyse/aide.js';

// « humalis developper » : chaque élément porte son fichier Humalis et sa ligne
// (data-humalis-source="pages/accueil.humalis:3"), pour que l'inspecteur du
// navigateur mène droit au code. Une compilation normale n'en garde rien.

/** Un disque en mémoire : chemin → contenu. */
const disque = (fichiers: Record<string, string>) => (chemin: string) => fichiers[chemin];

const PRINCIPAL = programme(
  'utiliser fichier "./pages/accueil.humalis"',
  '',
  'page "contact" :',
  '>titre "Contact"',
  '>lien "Accueil" vers "accueil"',
);
const ACCUEIL = programme(
  'page "accueil" :',
  '>titre "Bienvenue"',
  '>section :',
  '>>texte "Bonjour"',
  '>>bouton "Valider"',
  '>formulaire "message" :',
  '>>champ "Nom"',
  '>image "logo.png" avec description "Le logo"',
);

function projet(principal = 'site/site.humalis', accueil = 'site/pages/accueil.humalis') {
  const r = compilerProjet(principal, disque({ [principal]: PRINCIPAL, [accueil]: ACCUEIL }));
  expect(r.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return { application: r.application!, fichiers: r.fichiers! };
}

const tout = (fichiers: Map<string, string>) => [...fichiers.values()].join('\n');

describe('repère d’un élément : son fichier et sa ligne dans ce fichier', () => {
  it('rend la ligne fusionnée à son fichier', () => {
    expect(repereSource(4, ['site.humalis', 'pages/accueil.humalis'])).toBe('site.humalis:4');
    expect(repereSource(1_000_002, ['site.humalis', 'pages/accueil.humalis'])).toBe('pages/accueil.humalis:2');
    expect(repereSource(2_000_002, ['site.humalis'])).toBeUndefined();
    expect(repereSource(0, ['site.humalis'])).toBeUndefined();
  });

  it('échappe le repère en HTML et en JSX', () => {
    const nom = 'pages/"a" & <b> {c}\\.humalis:3';
    expect(attributSourceHtml(nom)).toBe(' data-humalis-source="pages/&quot;a&quot; &amp; &lt;b&gt; {c}\\.humalis:3"');
    // En JSX, une chaîne entre guillemets lit les entités HTML : une expression JavaScript, toujours sûre.
    expect(attributSourceJsx(nom)).toBe(` data-humalis-source={${JSON.stringify(nom)}}`);
    expect(attributSourceJsx('pages/accueil.humalis:3')).toBe(' data-humalis-source="pages/accueil.humalis:3"');
  });
});

describe('web : data-humalis-source avec le mode développement', () => {
  it('chaque élément visible porte son fichier et sa ligne', () => {
    const { application, fichiers } = projet();
    const web = genererProjetWeb(application, { nom: 'site', adresse: 'http://localhost', source: 'site.humalis', sources: fichiers });
    const contact = web.get('src/pages/Contact.tsx')!;
    expect(contact).toMatch(/<h1 data-humalis-source="site\.humalis:4"[^>]*>Contact<\/h1>/);
    expect(contact).toMatch(/<Lien data-humalis-source="site\.humalis:5"/);
    const accueil = web.get('src/pages/Accueil.tsx')!;
    expect(accueil).toMatch(/<h1 data-humalis-source="pages\/accueil\.humalis:2"[^>]*>Bienvenue<\/h1>/);
    expect(accueil).toMatch(/<section data-humalis-source="pages\/accueil\.humalis:3"/);
    expect(accueil).toMatch(/<p data-humalis-source="pages\/accueil\.humalis:4"[^>]*>Bonjour<\/p>/);
    expect(accueil).toMatch(/<button data-humalis-source="pages\/accueil\.humalis:5"/);
    expect(accueil).toMatch(/<form data-humalis-source="pages\/accueil\.humalis:6"/);
    expect(accueil).toMatch(/<label data-humalis-source="pages\/accueil\.humalis:7"/);
    expect(accueil).toMatch(/<img data-humalis-source="pages\/accueil\.humalis:8"/);
    expect(accueil).not.toContain('1000002');
  });

  it('échappe un nom de fichier qui a des guillemets ou des accolades', () => {
    const { application, fichiers } = projet();
    const nom = `pages/"a" & {b}.humalis`;
    const web = genererProjetWeb(application, { nom: 'site', adresse: 'http://localhost', source: 'site.humalis', sources: [fichiers[0], nom] });
    expect(web.get('src/pages/Accueil.tsx')).toContain(`<h1 data-humalis-source={${JSON.stringify(`${nom}:2`)}}`);
  });

  it('sans le mode, le code produit est identique et ne porte aucun repère', () => {
    const { application } = projet();
    const options = { nom: 'site', adresse: 'http://localhost', source: 'site.humalis' };
    const sans = genererProjetWeb(application, options);
    expect(genererProjetWeb(projet().application, { ...options })).toEqual(sans);
    expect(tout(sans)).not.toContain('data-humalis-source');
    expect(tout(sans)).not.toContain('humalis-repere');
    const avec = genererProjetWeb(projet().application, { ...options, sources: projet().fichiers });
    expect([...avec.keys()]).toEqual([...sans.keys()]);
    for (const [chemin, contenu] of sans) {
      expect(avec.get(chemin)!.replace(/ data-humalis-source=(?:"[^"]*"|\{"[^"]*"\})/g, '')).toBe(contenu);
    }
  });
});

describe('statique : data-humalis-source avec le mode développement', () => {
  it('le HTML de départ et le script portent le fichier et la ligne', () => {
    const { application, fichiers } = projet();
    const site = genererProjetStatique(application, { nom: 'site', source: 'site.humalis', sources: fichiers });
    const accueil = site.get('index.html')!;
    expect(accueil).toMatch(/<h1 data-humalis-source="pages\/accueil\.humalis:2"[^>]*>Bienvenue<\/h1>/);
    expect(accueil).toMatch(/<section data-humalis-source="pages\/accueil\.humalis:3"/);
    expect(accueil).toMatch(/<p data-humalis-source="pages\/accueil\.humalis:4"/);
    expect(accueil).toMatch(/<form data-humalis-source="pages\/accueil\.humalis:6"/);
    expect(accueil).toMatch(/<input data-humalis-source="pages\/accueil\.humalis:7"/);
    expect(accueil).toMatch(/<img data-humalis-source="pages\/accueil\.humalis:8"/);
    expect(site.get('contact.html')).toMatch(/<h1 data-humalis-source="site\.humalis:4"/);
    const script = tout(site);
    expect(script).toContain(`'data-humalis-source': 'pages/accueil.humalis:4'`);
    expect(script).toContain(`'data-humalis-source': 'pages/accueil.humalis:3'`);
  });

  it('échappe le repère dans le HTML et dans le script', () => {
    const { application, fichiers } = projet();
    const site = genererProjetStatique(application, { nom: 'site', source: 'site.humalis', sources: [fichiers[0], `pages/'a' "b" <c>.humalis`] });
    const accueil = site.get('index.html')!;
    expect(accueil).toContain('data-humalis-source="pages/&#39;a&#39; &quot;b&quot; &lt;c&gt;.humalis:2"');
    expect(tout(site)).toContain(`'data-humalis-source': 'pages/\\'a\\' "b" <c>.humalis:2'`);
  });

  it('sans le mode, le site produit est identique et ne porte aucun repère', () => {
    const options = { nom: 'site', source: 'site.humalis' };
    const sans = genererProjetStatique(projet().application, options);
    expect(genererProjetStatique(projet().application, { ...options })).toEqual(sans);
    expect(tout(sans)).not.toContain('data-humalis-source');
    expect(tout(sans)).not.toContain('humalis-repere');
    // Avec le mode, seuls les repères s'ajoutent : le reste du site est le même, caractère pour caractère.
    const avec = genererProjetStatique(projet().application, { ...options, sources: projet().fichiers });
    expect([...avec.keys()]).toEqual([...sans.keys()]);
    for (const [chemin, contenu] of sans) {
      expect(avec.get(chemin)!.replace(/ data-humalis-source="[^"]*"|'data-humalis-source': '[^']*', /g, '')).toBe(contenu);
    }
  });
});

describe('l’aide Alt + survol, servie par humalis developper seulement', () => {
  it('est un script valide qui lit data-humalis-source', () => {
    expect(() => new Function(AIDE_REPERES)).not.toThrow();
    expect(AIDE_REPERES).toContain('data-humalis-source');
    expect(AIDE_REPERES).toContain('altKey');
  });

  it('montre le repère près du curseur quand Alt est tenue', () => {
    // Un petit document imité : assez pour suivre ce que fait le script.
    const ecouteurs = new Map<string, (evenement: unknown) => void>();
    const etiquette = { style: {} as Record<string, string>, textContent: '', id: '' };
    const element = { closest: (selecteur: string) => (selecteur === '[data-humalis-source]' ? { getAttribute: () => 'pages/accueil.humalis:12' } : null) };
    const document = {
      createElement: () => etiquette,
      body: { append: () => undefined },
      addEventListener: (nom: string, f: (evenement: unknown) => void) => ecouteurs.set(nom, f),
    };
    new Function('document', 'window', AIDE_REPERES)(document, { addEventListener: (nom: string, f: (evenement: unknown) => void) => ecouteurs.set(`fenetre:${nom}`, f) });
    ecouteurs.get('mousemove')!({ altKey: false, target: element, clientX: 10, clientY: 20 });
    expect(etiquette.style.display).toBe('none');
    ecouteurs.get('mousemove')!({ altKey: true, target: element, clientX: 10, clientY: 20 });
    expect(etiquette.textContent).toBe('pages/accueil.humalis:12');
    expect(etiquette.style.display).toBe('block');
    ecouteurs.get('keyup')!({ altKey: false, key: 'Alt' });
    expect(etiquette.style.display).toBe('none');
  });
});
