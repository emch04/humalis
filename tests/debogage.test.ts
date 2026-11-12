/**
 * Le débogage : les lignes Humalis dans le code produit (cartes de sources,
 * directives Swift et C#, table Kotlin), « noter » sur chaque cible (rien en
 * production), et l'inspecteur de humalis developper.
 */
import { describe, it, expect } from 'vitest';
import { SourceMap } from 'node:module';
import { compiler } from '../src/compilateur.js';
import {
  appliquerLignesHumalis,
  avecReperes,
  carteDeSources,
  decoderVlq,
  lireReperes,
  plagesKotlin,
  repereLigne,
  repereNom,
  situerLigne,
  tableDebogueurKotlin,
  tableDepuisCarte,
  versCSharp,
  versSwift,
} from '../src/cibles/lignes-humalis.js';
import { DECALAGE } from '../src/fichiers.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { genererProjetAndroid } from '../src/cibles/android/projet.js';
import { genererProjetWindows } from '../src/cibles/windows/projet.js';
import { inspecteurJs } from '../src/outils/inspecteur.js';
import { horsCodeUtilisateur } from '../src/cibles/windows/projet.js';

const R = (n: number) => `/*@humalis-ligne ${n}*/`;
const PAGE = [
  'page "accueil" :',
  '    titre "Panier"',
  '    variable panier = ["Livre"]',
  '    variable total = 12',
  '    bouton "Payer"',
  '    quand l\'utilisateur clique sur "Payer" :',
  '        noter panier et total',
  '        noter "Après paiement" et total * 2',
  '        changer total par total + 1',
].join('\n');

const application = (source: string) => {
  const r = compiler(source);
  expect(r.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return r.application!;
};

describe('les repères de lignes', () => {
  it('ne sont posés que sur demande', () => {
    expect(repereLigne(12)).toBe('');
    expect(avecReperes(() => repereLigne(12))).toBe(R(12));
    expect(avecReperes(() => repereLigne(0))).toBe('');
  });

  it('couvrent leur ligne, les lignes plus indentées et les fermetures, pas la suite', () => {
    const lu = lireReperes(['function f() {', `  ${R(5)}if (a) {`, `    ${R(6)}b();`, '    c();', '  }', '  d();', '}'].join('\n'));
    expect(lu.code).not.toContain('@humalis');
    expect(lu.segments.map((s) => s[0]?.ligne ?? 0)).toEqual([0, 5, 6, 5, 5, 0, 0]);
    expect(lu.segments[1]![0]).toMatchObject({ colonne: 2, repere: true });
  });

  it('rendent une ligne fusionnée à son fichier', () => {
    expect(situerLigne(12, ['boutique.humalis'])).toEqual({ fichier: 'boutique.humalis', ligne: 12 });
    expect(situerLigne(DECALAGE + 3, ['boutique.humalis', 'pages/panier.humalis'])).toEqual({ fichier: 'pages/panier.humalis', ligne: 3 });
    expect(situerLigne(5 * DECALAGE + 1, ['a.humalis'])).toBeUndefined();
  });
});

describe('les cartes de sources (JavaScript)', () => {
  it('mènent chaque ligne produite à sa ligne Humalis, lisibles par Node', () => {
    const lu = lireReperes(['const a = 1;', `${R(7)}total.v = choisi.prix;`, `${R(9)}afficher();`, 'fin();'].join('\n'));
    const carte = carteDeSources('accueil.js', lu.segments, ['boutique.humalis'], (f) => `../../${f}`, () => 'page "x" :');
    expect(carte.sources).toEqual(['../../boutique.humalis']);
    expect(carte.sourcesContent).toEqual(['page "x" :']);
    const lue = new SourceMap(carte);
    expect(lue.findEntry(1, 3)).toMatchObject({ originalSource: '../../boutique.humalis', originalLine: 6 });
    expect(lue.findEntry(2, 0)).toMatchObject({ originalLine: 8 });
  });

  it('se lisent et s’écrivent en VLQ, et donnent la table du site construit', () => {
    expect(decoderVlq('IAOA')).toEqual([4, 0, 7, 0]);
    const lu = lireReperes(['x;', `${R(3)}y;`].join('\n'));
    const carte = carteDeSources('a.js', lu.segments, ['site.humalis'], (f) => f);
    const fichiers: string[] = [];
    expect(tableDepuisCarte(carte, fichiers, (s) => (s.endsWith('.humalis') ? s : undefined))).toEqual([[2, 1, 0, 3]]);
    expect(fichiers).toEqual(['site.humalis']);
  });

  it('donnent aux variables produites leur nom Humalis (names), même hors de toute ligne', () => {
    expect(repereNom('commande')).toBe('');
    expect(avecReperes(() => repereNom('prix total', 4))).toBe('/*@humalis-nom prix total@4*/');
    const lu = lireReperes([
      `const /*@humalis-nom commande@6*/f_commande = trouver();`,
      `${R(7)}for (const /*@humalis-nom ligne*/f_ligne of liste) {`,
      '  rien();',
      '}',
      'const /*@humalis-nom perdu*/x = 1;',
    ].join('\n'));
    expect(lu.code.split('\n')[0]).toBe('const f_commande = trouver();');
    const carte = carteDeSources('serveur.js', lu.segments, ['api.humalis'], (f) => f);
    expect(carte.names).toEqual(['commande', 'ligne']);
    const lue = new SourceMap(carte);
    expect(lue.findEntry(0, 6)).toMatchObject({ originalLine: 5, name: 'commande' });
    expect(lue.findEntry(1, 11)).toMatchObject({ originalLine: 6, name: 'ligne' });
  });

  it('appliquerLignesHumalis écrit la carte à côté, retire les repères partout et pose les lieux de « noter »', () => {
    const fichiers = new Map([
      ['src/couches/accueil.js', `${R(7)}noter('@humalis-lieu:7', []);\n`],
      ['index.html', `<p>${R(3)}x</p>`],
      ['humalis-vite.js', 'const SOURCES = "__HUMALIS_VERS_LES_SOURCES__";'],
    ]);
    const sortie = appliquerLignesHumalis(fichiers, { fichiers: ['boutique.humalis'], versLesSources: '../..' });
    expect(sortie.get('src/couches/accueil.js')).toContain("noter('boutique.humalis:7', []);");
    expect(sortie.get('src/couches/accueil.js')).toContain('//# sourceMappingURL=accueil.js.map');
    expect(JSON.parse(sortie.get('src/couches/accueil.js.map')!).sources).toEqual(['../../../../boutique.humalis']);
    expect(sortie.get('index.html')).toBe('<p>x</p>');
    expect(sortie.get('humalis-vite.js')).toBe('const SOURCES = "../..";');
  });
});

describe('les lignes Humalis du code natif', () => {
  it('Swift : #sourceLocation devant chaque instruction reliée, jamais au milieu d’une expression', () => {
    const lu = lireReperes(['func f() {', `    ${R(4)}let a = calcul(`, '        1,', '        2)', `    ${R(5)}b()`, '}'].join('\n'));
    const swift = versSwift(lu, ['app.humalis'], (f) => `/p/${f}`, true);
    expect(swift).toContain('#sourceLocation(file: "/p/app.humalis", line: 4)\n    HumalisLignes.ici = 4\n    let a = calcul(');
    expect(swift).not.toMatch(/calcul\(\n\s*#sourceLocation/);
    expect(swift).toContain('#sourceLocation(file: "/p/app.humalis", line: 5)');
    expect(swift.trimEnd().endsWith('#sourceLocation()')).toBe(true);
  });

  it('C# : #line devant chaque ligne reliée, tout le reste caché au débogueur', () => {
    const lu = lireReperes(['void F()', '{', `    ${R(8)}a();`, '    b();', '}', 'void G() { }'].join('\n'));
    const cs = versCSharp(lu, ['app.humalis'], (f) => `..\\${f}`);
    expect(cs).toBe('#line hidden\nvoid F()\n{\n#line 8 "..\\\\app.humalis"\n    a();\n#line hidden\n    b();\n}\nvoid G() { }\n#line default');
  });

  it('C# : rien n’est glissé dans une chaîne brute sur plusieurs lignes', () => {
    const lu = lireReperes(['void F()', '{', `    ${R(8)}a();`, '    var t = """', '    texte', '    """;', '}'].join('\n'));
    const cs = versCSharp(lu, ['app.humalis'], (f) => f);
    expect(cs).toContain('#line hidden\n    var t = """\n    texte\n    """;\n}\n#line default');
  });

  it('C# : la bibliothèque produite est hors du code de l’auteur pour le pas à pas', () => {
    expect(horsCodeUtilisateur('namespace Humalis;\n\npublic sealed class Signal\n{\n    private class Dedans { }\n}\ninternal static class Outils { }')).toBe(
      'namespace Humalis;\n\n[System.Diagnostics.DebuggerNonUserCode]\npublic sealed class Signal\n{\n    private class Dedans { }\n}\n[System.Diagnostics.DebuggerNonUserCode]\ninternal static class Outils { }',
    );
    const { fichiers } = genererProjetWindows(application(PAGE), { nom: 'Essai', source: 'essai.humalis' });
    expect(fichiers.get('Humalis/Reactif.cs')).toContain('[System.Diagnostics.DebuggerNonUserCode]\npublic sealed class Signal');
    expect(fichiers.get('Humalis/Reactif.cs')).toContain('[DebuggerDisplay("{valeur}", Type = "variable Humalis")]');
    // Sans les lignes Humalis (machine, tests), rien n'est caché ; avec (compile), tout le C# sans ligne Humalis l'est.
    expect(fichiers.get('App.cs')!.startsWith('#line hidden')).toBe(false);
    const compile = avecReperes(() => genererProjetWindows(application(PAGE), { nom: 'Essai', source: 'essai.humalis' })).fichiers;
    expect(compile.get('App.cs')!.startsWith('#line hidden\n')).toBe(true);
    expect(compile.get('Humalis/Reactif.cs')!.startsWith('#line hidden\n')).toBe(true);
  });

  it('Kotlin : une table de plages (ligne produite → ligne Humalis)', () => {
    const lu = lireReperes(['fun f() {', `    ${R(3)}a()`, '        .b()', `    ${R(4)}c()`, '}'].join('\n'));
    expect(plagesKotlin(lu, ['app.humalis'], () => 0)).toEqual([[2, 3, 0, 3], [4, 4, 0, 4]]);
  });
});

describe('le débogueur Android (strate « Humalis », JSR-45)', () => {
  it('la table humalis-lignes.txt : racine, fichiers Humalis depuis la racine, plages de chaque fichier Kotlin', () => {
    const table = tableDebogueurKotlin(['../boutique.humalis', '../pages/panier.humalis'], [
      { chemin: 'app/src/main/java/dev/rey/boutique/PageAccueil.kt', plages: [[50, 51, 0, 13], [52, 52, 1, 4]] },
    ], 'app/');
    expect(table.split('\n').filter((l) => !l.startsWith('#'))).toEqual([
      'racine\t..',
      'fichier\t../boutique.humalis',
      'fichier\t../pages/panier.humalis',
      'kotlin\tdev/rey/boutique/PageAccueil.kt',
      '50 51 0 13',
      '52 52 1 4',
      '',
    ]);
  });

  it('appliquerLignesHumalis l’écrit dans le module, avec le chemin des fichiers vu de la racine du projet', () => {
    const fichiers = new Map([
      ['app/src/main/java/dev/rey/boutique/PageAccueil.kt', `package dev.rey.boutique\nfun f() {\n    ${R(6)}a()\n}\n`],
      ['app/src/main/java/dev/rey/boutique/HumalisLignes.kt', 'package dev.rey.boutique\nobject HumalisLignes {}\n'],
    ]);
    const sortie = appliquerLignesHumalis(fichiers, { fichiers: ['boutique.humalis'], versLesSources: '..' });
    const table = sortie.get('app/humalis-lignes.txt')!;
    expect(table).toContain('racine\t..\nfichier\t../boutique.humalis\nkotlin\tdev/rey/boutique/PageAccueil.kt\n3 3 0 6\n');
  });

  it('le projet Gradle inscrit la strate dans les classes de la construction « debug », sans toucher au SMAP de Kotlin', () => {
    const { fichiers } = genererProjetAndroid(application(PAGE), { nom: 'Essai', source: 'essai.humalis' });
    const gradle = fichiers.get('app/build.gradle.kts')!;
    // Les imports d'un script Gradle viennent avant le bloc plugins.
    expect(gradle.indexOf('import com.android.build.api.instrumentation.AsmClassVisitorFactory')).toBeLessThan(gradle.indexOf('plugins {'));
    expect(gradle).toContain('onVariants(selector().withBuildType("debug"))');
    expect(gradle).toContain('variante.instrumentation.transformClassesWith(StrateHumalis::class.java, InstrumentationScope.PROJECT)');
    expect(gradle).toContain('parametres.table.set(layout.projectDirectory.file("humalis-lignes.txt"))');
    // La strate Humalis passe devant celle de Kotlin ; une classe sans SMAP reçoit Java comme strate par défaut.
    expect(gradle).toContain('return entete + "\\n" + section + debug.substring(entete.length + 1)');
    expect(gradle).toContain('return "SMAP\\n" + source + "\\nJava\\n" + section + "*E\\n"');
    // Le code recopié d'une fonction inline garde sa source Kotlin (strate KotlinDebug) : la strate Humalis ne le couvre pas.
    expect(gradle).toContain('if (fichier in propres && sortie !in recopiees) origines[sortie] = entree');
    // La fabrique ne garde que ses paramètres : Gradle la copie vers la tâche de transformation.
    expect(gradle).not.toMatch(/class StrateHumalis[\s\S]*?by lazy/);
    expect(gradle).not.toContain('${');
  });
});

describe('« noter » sur chaque cible', () => {
  it('le web (moteur) : seulement quand Vite sert en développement', () => {
    const fichiers = avecReperes(() => genererProjetMoteur(application(PAGE), { nom: 'essai', source: 'essai.humalis' }));
    const couche = fichiers.get('src/couches/accueil.js')!;
    expect(couche).toContain(`if (import.meta.env.DEV) noter('@humalis-lieu:7', [['panier', panier.v], ['total', total.v]]);`);
    expect(couche).toContain(`['"Après paiement"', 'Après paiement', true]`);
    expect(fichiers.get('src/humalis/outils.js')).toContain("window.dispatchEvent(new CustomEvent('humalis:note'");
  });

  it('le serveur : noterHumalis, muet si NODE_ENV vaut production', () => {
    const source = ['serveur "api" :', '    donnee commande :', '        total : nombre', '    route "commandes" :', '        seul admin peut lire commande', '        seul admin peut faire "doubler" sur commande :', '            noter commande.total', '            changer commande.total par commande.total * 2', '', 'page "a" :', '    titre "A"'].join('\n');
    const app = application(source);
    const fichiers = avecReperes(() => genererProjetServeur(app.serveurs[0]!, { nom: 'api', source: 'api.humalis' }));
    expect(fichiers.get('src/serveur.ts')).toContain(`noterHumalis("@humalis-lieu:7", [["commande.total", `);
    expect(fichiers.get('src/humalis/lignes.ts')).toContain("if (process.env.NODE_ENV === 'production') return;");
  });

  it('le serveur : la carte de sources nomme la fiche et la variable de la boucle', () => {
    const source = ['serveur "api" :', '    donnee commande :', '        total : nombre', '    donnee article :', '        prix : nombre', '    route "commandes" :', '        seul admin peut lire commande', '        seul admin peut faire "doubler" sur commande :', '            pour chaque piece dans article :', '                noter piece.prix', '            changer commande.total par commande.total * 2', '', 'page "a" :', '    titre "A"'].join('\n');
    const app = application(source);
    const produits = avecReperes(() => genererProjetServeur(app.serveurs[0]!, { nom: 'api', source: 'api.humalis' }));
    const sortie = appliquerLignesHumalis(produits, { fichiers: ['api.humalis'], versLesSources: '..' });
    const code = sortie.get('src/serveur.ts')!;
    expect(code).not.toContain('@humalis-nom');
    const carte = JSON.parse(sortie.get('src/serveur.ts.map')!);
    expect(carte.names).toEqual(expect.arrayContaining(['commande', 'piece']));
    const lue = new SourceMap(carte);
    const lignes = code.split('\n');
    const ou = (motif: string) => { const l = lignes.findIndex((t) => t.includes(motif)); return [l, lignes[l]!.indexOf(motif.split(' ').at(-1)!)] as const; };
    const [lf, cf] = ou('const f_commande');
    expect(lue.findEntry(lf, cf)).toMatchObject({ name: 'commande', originalLine: 7 });
    const [lb, cb] = ou('for (const f_piece');
    expect(lue.findEntry(lb, cb)).toMatchObject({ name: 'piece', originalLine: 8 });
  });

  it('Apple : HumalisNotes, en Debug seulement (#if DEBUG et @autoclosure)', () => {
    const { fichiers } = genererProjetApple(application(PAGE), { nom: 'Essai', source: 'essai.humalis' });
    const tout = [...fichiers.values()].join('\n');
    expect(tout).toContain('HumalisNotes.noter("@humalis-lieu:7", [("panier", ');
    expect(tout).toMatch(/static func noter\(_ lieu: String, _ valeurs: @autoclosure \(\) -> \[\(String, Any\?, Bool\)\]\) \{\n\s*#if DEBUG/);
  });

  it('Android : HumalisNotes, seulement si l’application est débogable', () => {
    const { fichiers } = genererProjetAndroid(application(PAGE), { nom: 'Essai', source: 'essai.humalis' });
    const tout = [...fichiers.values()].join('\n');
    expect(tout).toContain('HumalisNotes.noter("@humalis-lieu:7") { listOf(Triple("panier", ');
    expect(tout).toContain('HumalisLignes.installer(applicationContext)');
  });

  it('Windows : [Conditional("DEBUG")] retire l’appel d’une construction Release', () => {
    const { fichiers } = genererProjetWindows(application(PAGE), { nom: 'Essai', source: 'essai.humalis' });
    expect([...fichiers.values()].join('\n')).toContain('HumalisNotes.Noter("@humalis-lieu:7", ("panier", (object?)(');
    expect(fichiers.get('Humalis/HumalisLignes.cs')).toContain('[Conditional("DEBUG")]');
  });

  it('refuse « noter » directement dans la page', () => {
    const r = compiler('page "a" :\n    variable total = 3\n    noter total');
    expect(r.diagnostics.map((d) => d.message).join('\n')).toContain('« noter » s’écrit dans un événement');
  });
});

describe('l’inspecteur de humalis developper', () => {
  it('la page s’y inscrit en développement seulement', () => {
    const app = application(PAGE);
    const normal = genererProjetMoteur(app, { nom: 'essai', source: 'essai.humalis' }).get('src/couches/accueil.js')!;
    expect(normal).not.toContain('__humalisCouches');
    const developpement = genererProjetMoteur(app, { nom: 'essai', source: 'essai.humalis', sources: ['essai.humalis'] }).get('src/couches/accueil.js')!;
    expect(developpement).toContain('if (import.meta.env.DEV) {');
    expect(developpement).toContain('(window.__humalisCouches ??= new Set()).add(inspection);');
    expect(developpement).toContain('"panier": { boite: panier, lieu: \'@humalis-lieu:3\' }'.replace(/"/g, "'").replace("'panier'", "'panier'"));
  });

  it('suit les requêtes, les droits refusés, les notes et les erreurs', () => {
    const code = inspecteurJs('/projet');
    expect(code).toContain('window.fetch = async function');
    expect(code).toContain('r.statut === 401 || r.statut === 403');
    expect(code).toContain("window.addEventListener('humalis:note'");
    expect(code).toContain("window.addEventListener('humalis:erreur'");
    expect(code).toContain('vscode://file');
    // Le code de l'inspecteur se lit sans erreur.
    expect(() => new Function(code)).not.toThrow();
  });
});
