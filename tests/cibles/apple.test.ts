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

describe('cible Apple — les écrans courants', () => {
  const page = (source: string, nom: string) => projet(source).get(`Essai/Pages/${nom}.swift`)!;

  it('une condition et une boucle deviennent if et ForEach', () => {
    const code = page(`page "a" :\n    variable noms = ["x"]\n    si noms est vide :\n        texte "rien"\n    sinon :\n        pour chaque n dans noms :\n            texte n\n`, 'PageA');
    expect(code).toContain('if noms.isEmpty {');
    expect(code).toContain('ForEach(Array(noms.enumerated()), id: \\.offset)');
  });

  it('une longue liste ne construit que les lignes visibles', () => {
    const code = page(`page "a" :\n    variable noms = ["x"]\n    titre "t"\n    pour chaque n dans noms :\n        texte n\n`, 'PageA');
    expect(code).toContain('paresseuse: true');
    const bloc = page(`page "a" :\n    variable noms = ["x"]\n    titre "t"\n    section :\n        pour chaque n dans noms :\n            texte n\n`, 'PageA');
    expect(bloc).toContain('LazyVStack(alignment: .leading, spacing: 12)');
    expect(page(`page "a" :\n    variable noms = ["x"]\n    titre "t"\n    texte "z" avec ancre "b"\n    pour chaque n dans noms :\n        texte n\n`, 'PageA')).not.toContain('paresseuse: true');
  });

  it('un style nommé devient un modificateur, un bouton plein prend sa couleur', () => {
    const code = page(`page "a" :\n    titre "t" avec couleur bleu\n    bouton "b" avec fond vert\n`, 'PageA');
    expect(code).toContain('.foregroundStyle(Couleurs.bleu)');
    expect(code).toContain('.buttonStyle(.borderedProminent)');
    expect(code).toContain('.tint(Couleurs.vert)');
  });

  it('une ligne passe à la ligne, une grille prend ses colonnes', () => {
    const code = page(`page "a" :\n    ligne avec repartition entre :\n        texte "x"\n    grille avec colonnes 2 :\n        texte "y"\n`, 'PageA');
    expect(code).toContain('LigneHumalis(espacement: 12, alignement: .center, repartition: .entre)');
    expect(code).toContain('GrilleHumalis(colonnes: 2, espacement: 16)');
  });

  it('un formulaire vérifie ses champs avant d\'envoyer, puis les vide', () => {
    const code = page(`page "a" :\n    formulaire "f" :\n        champ email "mail" avec obligatoire\n        bouton "Ok"\n    quand le formulaire "f" est soumis :\n        afficher "ok"\n`, 'PageA');
    expect(code).toContain('if estVideHumalis(champMail) {');
    expect(code).toContain('correspondHumalis(champMail,');
    expect(code).toMatch(/Messages\.commun\.afficher\("ok", \.info\)\s+champMail = ""/);
  });

  it('les pages deviennent des routes, avec leurs paramètres et leurs filtres', () => {
    const f = projet(`page "accueil" :\n    lien "p" vers "produit" avec id "3"\npage "produit" avec parametre id :\n    texte id\npage "liste" avec filtre categorie :\n    texte "l"\n`);
    const routes = f.get('Essai/Humalis/Routes.swift')!;
    expect(routes).toContain('case produit(id: String)');
    expect(routes).toContain('case liste(categorie: String? = nil)');
    expect(f.get('Essai/Pages/PageAccueil.swift')).toContain('Routeur.commun.aller(.produit(id: "3"))');
  });

  it('une variable partagée vit dans un objet commun, gardée sur l\'appareil si on le demande', () => {
    const partage = projet(`variable panier = [] avec partagee et memorisee\npage "a" :\n    titre "t"\n`).get('Essai/Humalis/Partage.swift')!;
    expect(partage).toContain('@MainActor @Observable final class Partage');
    expect(partage).toContain('Memoire.ecrire(');
    expect(partage).toContain('Memoire.lire(');
  });

  it('un secret va au Keychain', () => {
    const f = projet(`page "a" :\n    variable jeton = "" avec memorisee en secret\n    titre "t"\n`);
    expect(f.get('Essai/Pages/PageA.swift')).toMatch(/@Memorisee\("[^"]+", secret: true\) private var jeton/);
    expect(f.get('Essai/Humalis/Memoire.swift')).toContain('kSecClassGenericPassword');
  });
});

describe('cible Apple — le serveur', () => {
  const SERVEUR = `serveur "s" :\n    donnee produit :\n        nom : texte\n        prix : nombre\n    route "produits" :\n        tout le monde peut lire produit\n\npage "a" :\n    variable produits = []\n    titre "t"\n    quand la page se charge :\n        envoyer requete vers "produits" dans produits\n    pour chaque p dans produits :\n        texte p.nom\n`;

  it('une donnée du serveur est un vrai type Swift, qui tolère une réponse incomplète', () => {
    const donnees = projet(SERVEUR).get('Essai/Humalis/Donnees.swift')!;
    expect(donnees).toContain('struct Produit: FicheHumalis, Identifiable');
    expect(donnees).toContain('var prix: Double = 0');
    expect(donnees).toContain('boite.lireIdentifiant(.id)');
  });

  it('la lecture attend la réponse, et la dernière requête gagne', () => {
    const page = projet(SERVEUR).get('Essai/Pages/PageA.swift')!;
    expect(page).toContain('await Serveur.commun.lire("/api/produits", comme: [Produit].self)');
    expect(page).toContain('jetons.estDernier("produits"');
    expect(page).toContain('.task(id: Routeur.commun.chemin.isEmpty) { if Routeur.commun.chemin.isEmpty { await auChargement() } }');
  });

  it('http://localhost reste permis pour essayer, une autre adresse http est signalée', () => {
    expect(projet(SERVEUR).get('Info.plist')).toContain('NSAllowsLocalNetworking');
    const { diagnostics, fichiers } = produire(SERVEUR, { serveur: 'http://exemple.fr' });
    expect(fichiers.get('Info.plist')).not.toContain('NSAllowsLocalNetworking');
    expect(fichiers.get('Info.plist')).toContain('ITSAppUsesNonExemptEncryption');
    expect(diagnostics.some((d) => d.gravite === 'avertissement' && d.message.includes('bloque http://'))).toBe(true);
  });

  it('la session passe par le Keychain, et un visiteur envoie son jeton CSRF', () => {
    const swift = projet(SERVEUR).get('Essai/Humalis/Serveur.swift')!;
    expect(swift).toContain('Coffre.ecrire(Session.cleJeton');
    expect(swift).toContain('x-csrf-token');
  });

  it('une page réservée passe par sa garde', () => {
    const routes = projet(`serveur "s" :\n    donnee d :\n        n : texte\n    route "d" :\n        tout le monde peut lire d\n\npage "accueil" :\n    titre "a"\npage "connexion" :\n    titre "c"\npage "espace" reservee a connecte sinon vers "connexion" :\n    titre "e"\n`).get('Essai/Humalis/Routes.swift')!;
    expect(routes).toContain('GardeHumalis(qui: .connecte, sinon: .connexion, ici: .espace)');
  });
});

describe('cible Apple — iPad, Mac et porte de sortie', () => {
  const MENU = `entete :\n    menu :\n        lien "Accueil" vers "accueil" avec icone "maison"\n        lien "Panier" vers "panier"\n\npage "accueil" :\n    titre "a"\npage "panier" :\n    titre "p"\n`;

  it('le menu de l\'en-tête devient la barre latérale de l\'iPad et du Mac, et un menu du Mac', () => {
    const f = projet(MENU);
    const app = f.get('Essai/EssaiApp.swift')!;
    expect(app).toContain('NavigationSplitView');
    expect(app).toContain('CommandMenu("Aller à")');
    expect(f.get('Essai/Humalis/Menu.swift')).toContain('EntreeMenu(id: 0, titre: "Accueil", icone: "house", route: .accueil)');
    expect(f.get('Essai/Composants/EnteteSite.swift')).toContain('if !menuLateral {');
  });

  it('sans menu, une simple pile de pages', () => {
    expect(projet(COMPTEUR).get('Essai/EssaiApp.swift')).not.toContain('NavigationSplitView');
  });

  it('« sur apple » : la vue Swift écrite à la main est appelée et recopiée', () => {
    const source = `utiliser composant "Carte" depuis "./Carte" sur apple "./Carte.swift"\npage "a" :\n    Carte avec titre "x"\n`;
    expect(compile(source).composantsReact[0].apple).toBe('./Carte.swift');
    const f = projet(source, { natifs: new Map([['Carte', { nom: 'Carte.swift', contenu: 'struct Carte {}' }]]) });
    expect(f.get('Essai/Natif/Carte.swift')).toBe('struct Carte {}');
    expect(f.get('Essai/Pages/PageA.swift')).toContain('Carte(titre: "x")');
  });

  it('un module JavaScript avec « sur apple » est accepté', () => {
    const { diagnostics } = produire(`utiliser module "Scene" depuis "./scene" sur apple "./Scene.swift"\npage "a" :\n    Scene\n`);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  it('une icône et un fichier de police sont recopiés', () => {
    const f = projet(`site :\n    nom "Mon app"\n    logo "./logo.png"\ntheme :\n    police texte "Ma Police" depuis "./ma.ttf"\npage "a" :\n    titre "t"\n`, { images: new Map([['./logo.png', 'AAAA']]), polices: new Map([['./ma.ttf', 'BBBB']]) });
    expect(f.has('Essai/Assets.xcassets/AppIcon.appiconset/icone.png')).toBe(true);
    expect(f.has('Essai/Ressources/ma.ttf')).toBe(true);
    expect(f.get('Essai/EssaiApp.swift')).toContain('CTFontManagerRegisterFontsForURL');
    expect(f.get('Essai.xcodeproj/project.pbxproj')).toContain('ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon');
  });
});
