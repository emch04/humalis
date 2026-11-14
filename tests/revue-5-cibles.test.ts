import { describe, expect, it } from 'vitest';
import { stripTypeScriptTypes } from 'node:module';
import { compiler } from '../src/compilateur.js';
import { genererProjetAndroid } from '../src/cibles/android/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetWindows } from '../src/cibles/windows/projet.js';

/**
 * Les écarts entre cibles de la cinquième revue (14 novembre 2026) : une même phrase doit faire la même chose sur le
 * web, le site statique, le bureau, Apple, Android et Windows.
 */
const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const tout = (fichiers: Map<string, string>) => [...fichiers.values()].join('\n');

const REDIRECTION = `page "accueil" :
    titre "Accueil"
    variable cible = "panier"
    variable dehors = "https://exemple.fr"
    bouton "Aller"
    bouton "Sortir"
    quand l'utilisateur clique sur "Aller" :
        rediriger vers cible
    quand l'utilisateur clique sur "Sortir" :
        rediriger vers dehors

page "panier" :
    titre "Panier"
`;

describe('« rediriger vers » une variable, pareil partout', () => {
  it('Android ouvre une page par son nom, ou une adresse sûre', () => {
    const { fichiers } = genererProjetAndroid(compile(REDIRECTION), { nom: 'essai', source: 'essai.humalis' });
    const code = tout(fichiers);
    expect(code).toContain('ouvrirLien(nav, ');
    expect(code).toMatch(/val PAGES_PAR_NOM = mapOf<String, String>\([^)]*"panier" to "panier"/);
    expect(code).toContain("Messages.afficher(\"La page « \" + adresse + \" » n'existe pas.\", \"erreur\")");
  });
  it('Windows passe par AllerAdresse (adresse externe ou page)', () => {
    const { fichiers } = genererProjetWindows(compile(REDIRECTION), { nom: 'essai', source: 'essai.humalis' });
    const code = tout(fichiers);
    expect(code).toContain('_ = Routeur.AllerAdresse(');
    expect(code).not.toMatch(/Routeur\.Aller\(V\.T\(/);
  });
  it('le site statique refuse javascript: et garde une adresse https telle quelle', () => {
    const fichiers = genererProjetStatique(compile(REDIRECTION), { nom: 'essai', source: 'essai.humalis' });
    const js = [...fichiers].find(([chemin]) => chemin.endsWith('humalis.js'))![1];
    const adresseDe = new Function('PAGES', `${js.slice(js.indexOf('function adresseDe('), js.indexOf('\n  }\n', js.indexOf('function adresseDe(')) + 4)}\nreturn adresseDe;`)({ panier: 'panier.html' }) as (n: string) => string | undefined;
    const erreur = console.error;
    console.error = () => {};
    try {
      expect(adresseDe('panier')).toBe('panier.html');
      expect(adresseDe('https://exemple.fr')).toBe('https://exemple.fr');
      expect(adresseDe('javascript:alert(1)')).toBeUndefined();
      expect(adresseDe('autre')).toBe('autre.html');
    } finally {
      console.error = erreur;
    }
  });
});

describe('l’export CSV, pareil partout', () => {
  const CSV = `page "a" :
    titre "A"
    variable commandes = ["=HYPERLINK(1)", "deux"]
    bouton "Exporter"
    quand l'utilisateur clique sur "Exporter" :
        telecharger commandes en csv
`;
  it('Apple, Android et Windows neutralisent une formule, comme le web', () => {
    const application = compile(CSV);
    const apple = tout(genererProjetApple(application, { nom: 'essai', source: 'essai.humalis' }).fichiers);
    const android = tout(genererProjetAndroid(application, { nom: 'essai', source: 'essai.humalis' }).fichiers);
    const windows = tout(genererProjetWindows(application, { nom: 'essai', source: 'essai.humalis' }).fichiers);
    expect(apple).toContain('func celluleCsv(');
    expect(apple).toContain('"\\u{FEFF}"');
    expect(android).toContain('fun celluleCsv(');
    expect(android).toContain('"\\uFEFF"');
    expect(windows).toContain('"=+-@\\t\\r".Contains(t[0])');
  });
});

describe('les petites différences de valeurs', () => {
  it('« contient » compte les majuscules sur Windows, comme ailleurs', () => {
    const windows = tout(genererProjetWindows(compile('page "a" :\n    titre "A"\n    variable nom = "Élodie Martin"\n    si nom contient "martin" :\n        texte "oui"\n'), { nom: 'essai', source: 'essai.humalis' }).fichiers);
    expect(windows).not.toContain('CurrentCultureIgnoreCase');
    expect(windows).toContain('T(dans).Contains(texte, StringComparison.Ordinal)');
  });
  it('un vrai ou faux s’écrit « vrai » ou « faux » sur toutes les cibles', () => {
    const source = 'page "a" :\n    titre "A"\n    variable actif = vrai\n    texte "Actif : {actif}"\n';
    const application = compile(source);
    const moteur = tout(genererProjetMoteur(application, { nom: 'essai', source: 'essai.humalis' }));
    expect(moteur).toContain("? 'vrai' : 'faux'");
    // Le prérendu écrit la valeur de départ en français, comme le script.
    expect(moteur).toMatch(/Actif\s:\svrai/);
    expect(tout(genererProjetApple(application, { nom: 'essai', source: 'essai.humalis' }).fichiers)).toContain('extension Bool: AffichableHumalis { var enTexteHumalis: String { self ? "vrai" : "faux" } }');
    expect(tout(genererProjetAndroid(application, { nom: 'essai', source: 'essai.humalis' }).fichiers)).toContain('is Boolean -> if (v) "vrai" else "faux"');
  });
  it('la moyenne, le maximum et le minimum d’une liste vide valent 0 sur le web', () => {
    const source = 'page "a" :\n    titre "A"\n    variable notes = [1]\n    calcul moy = moyenne de notes\n    calcul haut = maximum de notes\n    texte "{moy} {haut}"\n';
    const moteur = tout(genererProjetMoteur(compile(source), { nom: 'essai', source: 'essai.humalis' }));
    expect(moteur).toContain('((l) => (l.length ? l.reduce((somme, n) => somme + n, 0) / l.length : 0))');
    expect(moteur).toContain('((l) => (l.length ? Math.max(...l) : 0))');
    const moyenne = eval(stripTypeScriptTypes('((l) => (l.length ? l.reduce((somme, n) => somme + n, 0) / l.length : 0))([])'));
    expect(moyenne).toBe(0);
  });
});

describe('le bureau, le projet Apple et les outils', () => {
  it('le bureau laisse passer une vidéo distante (media-src), comme un son', () => {
    const fichiers = genererProjetDesktop(compile('page "a" :\n    titre "A"\n    video "https://exemple.fr/film.mp4" avec commandes et description "Un film"\n'), { nom: 'essai', source: 'essai.humalis' });
    const principal = [...fichiers].find(([chemin]) => chemin.endsWith('principal.ts'))![1];
    expect(principal).toContain("media-src 'self' blob: https:");
  });
  it('Apple et Windows ne lisent HUMALIS_SERVEUR que dans une construction Debug', () => {
    const source = 'serveur "s" :\n    donnee note :\n        texte : texte\n    route "notes" :\n        tout le monde peut lire note\n\npage "a" :\n    titre "A"\n    variable notes = []\n    quand la page se charge :\n        envoyer requete vers "notes" dans notes\n    pour chaque n dans notes :\n        texte n.texte\n';
    const apple = tout(genererProjetApple(compile(source), { nom: 'essai', source: 'essai.humalis', serveur: 'https://api.exemple.fr' }).fichiers);
    const windows = tout(genererProjetWindows(compile(source), { nom: 'essai', source: 'essai.humalis', serveur: 'https://api.exemple.fr' }).fichiers);
    expect(apple).toMatch(/#if DEBUG\n\s*let adresse = ProcessInfo\.processInfo\.environment\["HUMALIS_SERVEUR"\]/);
    expect(windows).toMatch(/#if DEBUG\n\s*public static string Base => \(Environment\.GetEnvironmentVariable\("HUMALIS_SERVEUR"\)/);
  });
});
