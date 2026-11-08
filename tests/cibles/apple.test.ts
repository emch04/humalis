import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { genererProjetApple, MARQUE_APPLE } from '../../src/cibles/apple/projet.js';
import { chaineSwift, nomSwift, nomType } from '../../src/cibles/apple/noms.js';
import { touches } from '../../src/cibles/apple/styles.js';
import { SYMBOLES } from '../../src/cibles/apple/icones.js';
import { ICONES } from '../../src/vocabulaire/icones.js';

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const produire = (source: string, options = {}) => genererProjetApple(compile(source), { nom: 'essai', source: 'essai.humalis', ...options });
const projet = (source: string, options = {}) => {
  const { fichiers, diagnostics } = produire(source, options);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return fichiers;
};

const COMPTEUR = `page "compteur" :
    variable clics = 0
    calcul double = clics * 2
    titre "Compteur"
    texte "Tu as cliqué {clics} fois"
    bouton "Cliquer"
    quand l'utilisateur clique sur "Cliquer" :
        changer clics par clics + 1
`;

describe('cible Apple — le projet Xcode', () => {
  const fichiers = projet(COMPTEUR);

  it('produit un projet complet, sans React ni navigateur embarqué', () => {
    for (const f of [MARQUE_APPLE, 'LISEZMOI.md', 'Essai.xcodeproj/project.pbxproj', 'Essai.xcodeproj/xcshareddata/xcschemes/Essai.xcscheme', 'Essai/EssaiApp.swift', 'Essai/Pages/PageCompteur.swift', 'Essai/Essai.entitlements', 'Essai/PrivacyInfo.xcprivacy']) {
      expect(fichiers.has(f), f).toBe(true);
    }
    const tout = [...fichiers.values()].join('\n');
    expect(tout).not.toMatch(/WKWebView|react-native|electron/i);
  });

  it('une seule application pour iPhone, iPad et Mac', () => {
    const pbx = fichiers.get('Essai.xcodeproj/project.pbxproj')!;
    expect(pbx).toContain('SUPPORTED_PLATFORMS = "iphoneos iphonesimulator macosx"');
    expect(pbx).toContain('TARGETED_DEVICE_FAMILY = "1,2"');
    expect(pbx).toContain('SUPPORTS_MACCATALYST = NO');
    expect(pbx).toContain('PBXFileSystemSynchronizedRootGroup');
  });

  it('le Mac enferme l\'application et lui ouvre seulement le réseau', () => {
    const droits = fichiers.get('Essai/Essai.entitlements')!;
    expect(droits).toContain('com.apple.security.app-sandbox');
    expect(droits).toContain('com.apple.security.network.client');
    expect(droits).not.toContain('files.user-selected');
  });

  it('signe avec l\'équipe demandée, et un identifiant choisi', () => {
    const pbx = projet(COMPTEUR, { equipe: 'ABCDE12345', identifiant: 'dev.exemple.compteur' }).get('Essai.xcodeproj/project.pbxproj')!;
    expect(pbx).toContain('DEVELOPMENT_TEAM = ABCDE12345');
    expect(pbx).toContain('PRODUCT_BUNDLE_IDENTIFIER = dev.exemple.compteur');
    expect(pbx).toContain('CODE_SIGN_STYLE = Automatic');
  });
});

describe('cible Apple — la réactivité', () => {
  const page = projet(COMPTEUR).get('Essai/Pages/PageCompteur.swift')!;

  it('une variable est un @State, un calcul une propriété recalculée', () => {
    expect(page).toContain('@State private var clics: Double = 0');
    expect(page).toContain('private var double: Double { (clics * 2) }');
  });

  it('un texte lit sa variable au format français', () => {
    expect(page).toContain('"Tu as cliqué \\(formaterNombre(clics)) fois"');
  });

  it('un bouton appelle la fonction de son événement', () => {
    expect(page).toContain('Button { quandCliqueCliquer() } label:');
    expect(page).toMatch(/private func quandCliqueCliquer\(\) \{\s+clics = \(clics \+ 1\)/);
  });

  it('un élément porte son identifiant, pour les lecteurs d\'écran et les essais', () => {
    expect(page).toContain('.accessibilityIdentifier("bouton_cliquer")');
  });
});

describe('cible Apple — les noms', () => {
  it('un mot réservé de Swift ou une fonction d\'aide changent de nom', () => {
    expect(nomSwift('class')).toBe('class_');
    expect(nomSwift('body')).toBe('body_');
    expect(nomSwift('somme')).toBe('somme_');
    expect(nomSwift('nombre_articles')).toBe('nombreArticles');
  });

  it('une donnée ne prend pas le nom d\'un type de SwiftUI', () => {
    expect(nomType('image')).toBe('ImageDonnee');
    expect(nomType('produit')).toBe('Produit');
  });

  it('une chaîne Swift est échappée', () => {
    expect(chaineSwift('a"b\\c\nd')).toBe('"a\\"b\\\\c\\nd"');
  });

  it('un raccourci : « controle » est la touche Commande', () => {
    expect(touches('controle+maj+k')).toBe('.keyboardShortcut(KeyEquivalent(Character("k")), modifiers: [.command, .shift])');
  });

  it('chaque icône de Humalis a son dessin Apple', () => {
    for (const icone of ICONES) expect(SYMBOLES[icone.nom], icone.nom).toBeDefined();
  });
});

describe('cible Apple — ce qui n\'existe pas ici est dit clairement', () => {
  it('« utiliser module » est refusé, et rien n\'est produit pour l\'écrire', () => {
    const { diagnostics } = produire(`utiliser module "Scene" depuis "./scene.js"\npage "accueil" :\n    Scene\n`);
    const erreurs = diagnostics.filter((d) => d.gravite === 'erreur');
    expect(erreurs.length).toBeGreaterThan(0);
    expect(erreurs[0].message).toContain("n'a pas de JavaScript");
  });

  it('un composant React est refusé, avec la marche à suivre', () => {
    const { diagnostics } = produire(`utiliser composant "Carte" depuis "./Carte.tsx"\npage "accueil" :\n    Carte\n`);
    expect(diagnostics.some((d) => d.gravite === 'erreur' && d.message.includes('sur apple'))).toBe(true);
  });

  it('le CSS est signalé sans bloquer', () => {
    const { diagnostics } = produire(`style :\n    .a { color: red; }\npage "accueil" :\n    titre "a"\n`);
    expect(diagnostics.some((d) => d.gravite === 'avertissement' && d.message.includes('CSS'))).toBe(true);
    expect(diagnostics.some((d) => d.gravite === 'erreur')).toBe(false);
  });
});

describe('cible Apple — les exemples', () => {
  for (const nom of readdirSync('exemples').filter((f) => f.endsWith('.humalis'))) {
    it(`« ${nom} » se produit ou dit pourquoi il ne peut pas`, () => {
      const { application, diagnostics } = compiler(readFileSync(`exemples/${nom}`, 'utf8'));
      if (!application || application.ecrans.length === 0 || diagnostics.some((d) => d.gravite === 'erreur')) return;
      const resultat = genererProjetApple(application, { nom: 'essai', source: nom });
      for (const d of resultat.diagnostics.filter((x) => x.gravite === 'erreur')) expect(d.message.length).toBeGreaterThan(10);
      expect(resultat.fichiers.size).toBeGreaterThan(0);
    });
  }
});
