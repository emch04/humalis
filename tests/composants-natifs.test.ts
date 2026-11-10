import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { genererProjetWindows } from '../src/cibles/windows/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { lireVueNatifCs } from '../src/cibles/windows/natifs.js';
import { verifierAppareilPourLaCible } from '../src/cibles/appareil.js';

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const syntaxe = (source: string) => analyserSyntaxe(analyser(source));

const CARTE_CS = `using System.Windows;
using System.Windows.Controls;

namespace MesVues;

// public Carte(int faux) : un commentaire ne compte pas.
public class Carte : UserControl
{
    public Carte(string titre, double prix, int quantite = 1, bool promo = false)
    {
        Content = new TextBlock { Text = titre };
    }
}`;
const windows = (source: string, natifs = new Map([['Carte', { nom: 'Carte.cs', contenu: CARTE_CS }]])) =>
  genererProjetWindows(compile(source), { nom: 'essai', source: 'essai.humalis', natifs });

describe('« utiliser composant … sur apple / android / windows » : une vue native, sans React', () => {
  it('lit une vue pour chaque plateforme, sans « depuis »', () => {
    const [c] = syntaxe('utiliser composant "Carte" sur apple "./natif/Carte.swift" et sur android "./natif/Carte.kt" et sur windows "./natif/Carte.cs"\npage "a" :\n    titre "A"').composantsReact;
    expect(c).toMatchObject({ nom: 'Carte', apple: './natif/Carte.swift', android: './natif/Carte.kt', windows: './natif/Carte.cs' });
    expect(c!.chemin).toBeUndefined();
  });

  it('garde « depuis » pour le web, suivi des vues natives', () => {
    const [c] = syntaxe('utiliser module "Scene" depuis "./scene.js" sur windows "./Scene.cs"\npage "a" :\n    titre "A"').composantsReact;
    expect(c).toMatchObject({ nom: 'Scene', chemin: './scene.js', module: true, windows: './Scene.cs' });
  });

  it('les chemins passent dans la représentation du programme', () => {
    const app = compile('utiliser composant "Carte" sur android "./Carte.kt" et sur windows "./Carte.cs"\npage "a" :\n    titre "A"');
    expect(app.composantsReact[0]).toEqual({ nom: 'Carte', ligne: 1, android: './Carte.kt', windows: './Carte.cs' });
  });

  it('refuse une plateforme inconnue, une mauvaise extension et une plateforme donnée deux fois', () => {
    expect(() => syntaxe('utiliser composant "Carte" sur linux "./Carte.c"\npage "a" :\n    titre "A"')).toThrow(/apple \(Swift\), android \(Kotlin\) ou windows \(C#\)/);
    expect(() => syntaxe('utiliser composant "Carte" sur android "./Carte.swift"\npage "a" :\n    titre "A"')).toThrow(/sur android, la vue s'écrit en Kotlin, dans un fichier \.kt/);
    expect(() => syntaxe('utiliser composant "Carte" sur windows "./A.cs" et sur windows "./B.cs"\npage "a" :\n    titre "A"')).toThrow(/donné deux fois/);
  });

  it('le web, le bureau et le mobile refusent un composant qui n’a que des vues natives', () => {
    const app = compile('utiliser composant "Carte" sur windows "./Carte.cs"\npage "a" :\n    titre "A"');
    for (const cible of ['web', 'statique', 'desktop', 'mobile']) {
      const erreurs = verifierAppareilPourLaCible(app, cible).filter((d) => d.gravite === 'erreur');
      expect(erreurs.map((d) => d.message).join()).toContain('n\'a que des vues natives');
    }
    expect(verifierAppareilPourLaCible(app, 'windows')).toEqual([]);
  });
});

describe('« paquet android » et « paquet windows »', () => {
  it('lit les bibliothèques Gradle et NuGet', () => {
    const app = compile('paquet android "io.coil-kt:coil-compose" version "2.7.0"\npaquet windows "Humanizer.Core" version "2.14.1"\npage "a" :\n    titre "A"');
    expect(app.paquetsAndroid).toEqual([{ nom: 'io.coil-kt:coil-compose', version: '2.7.0', ligne: 1 }]);
    expect(app.paquetsWindows).toEqual([{ nom: 'Humanizer.Core', version: '2.14.1', ligne: 2 }]);
  });

  it('refuse un nom ou une version mal écrits', () => {
    expect(() => syntaxe('paquet android "coil" version "2.7.0"\npage "a" :\n    titre "A"')).toThrow(/groupe:nom/);
    expect(() => syntaxe('paquet windows "Humanizer Core" version "2.14.1"\npage "a" :\n    titre "A"')).toThrow(/nom de paquet NuGet/);
    expect(() => syntaxe('paquet windows "Humanizer.Core" version "la dernière"\npage "a" :\n    titre "A"')).toThrow(/numéro de version/);
  });

  it('Windows ajoute les paquets au projet .NET', () => {
    const { fichiers } = windows('paquet windows "Humanizer.Core" version "2.14.1"\npage "a" :\n    titre "A"', new Map());
    expect(fichiers.get('Essai.csproj')).toContain('<PackageReference Include="Humanizer.Core" Version="2.14.1" />');
  });
});

describe('la vue C# écrite à la main, sur Windows', () => {
  it('lit la classe, son espace de noms et son constructeur', () => {
    expect(lireVueNatifCs('Carte', CARTE_CS)).toEqual({
      classe: 'global::MesVues.Carte',
      parametres: [
        { nom: 'titre', genre: 'texte', facultatif: false },
        { nom: 'prix', genre: 'nombre', facultatif: false },
        { nom: 'quantite', genre: 'entier', facultatif: true },
        { nom: 'promo', genre: 'booleen', facultatif: true },
      ],
    });
    expect(lireVueNatifCs('Vide', 'public class Vide : UserControl { }')).toEqual({ classe: 'global::Vide', parametres: [] });
    expect(lireVueNatifCs('Carte', 'public class Autre {}')).toMatch(/introuvable/);
  });

  it('appelle le constructeur par le nom des paramètres, au bon type, et recopie le fichier', () => {
    const { fichiers, diagnostics } = windows('utiliser composant "Carte" sur windows "./natif/Carte.cs"\nvariable nombre = 2 avec partagee\npage "a" :\n    titre "A"\n    Carte avec titre "Café" et prix 3.5 et quantite nombre\n');
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(fichiers.get('Pages/PageA.cs')).toContain('UI.Natif(() => new global::MesVues.Carte(titre: V.T("Café"), prix: V.N(3.5d), quantite: (int)V.N(Partage.nombre.Lire())))');
    expect(fichiers.get('Natif/Carte.cs')).toBe(CARTE_CS);
  });

  it('dit quelle propriété n’existe pas, et laquelle manque', () => {
    const source = (props: string) => `utiliser composant "Carte" sur windows "./natif/Carte.cs"\npage "a" :\n    titre "A"\n    Carte avec ${props}\n`;
    const inconnue = windows(source('titre "x" et prix 1 et couleur "rouge"')).diagnostics.map((d) => d.message).join();
    expect(inconnue).toContain('« couleur » n\'est pas un paramètre du constructeur de la vue C# « Carte » (paramètres : titre, prix, quantite, promo)');
    const manque = windows(source('titre "x"')).diagnostics.map((d) => d.message).join();
    expect(manque).toContain('attend aussi « prix »');
  });

  it('un composant sans vue C# est refusé avec la ligne à ajouter', () => {
    const { diagnostics } = windows('utiliser composant "Carte" sur apple "./Carte.swift"\npage "a" :\n    titre "A"\n', new Map());
    expect(diagnostics.map((d) => d.message).join()).toContain('ajoutez « sur windows "./natif/Carte.cs" »');
  });
});

describe('la vue Swift sans React, sur Apple', () => {
  it('« utiliser composant … sur apple » suffit, sans « depuis »', () => {
    const { fichiers, diagnostics } = genererProjetApple(compile('utiliser composant "Carte" sur apple "./Carte.swift" et sur windows "./Carte.cs"\npage "a" :\n    titre "A"\n    Carte avec titre "x"\n'), {
      nom: 'essai',
      source: 'essai.humalis',
      natifs: new Map([['Carte', { nom: 'Carte.swift', contenu: 'import SwiftUI\nstruct Carte: View {\n    let titre: String\n    var body: some View { Text(titre) }\n}' }]]),
    });
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(fichiers.get('Essai/Pages/PageA.swift')).toContain('Carte(titre: "x")');
    expect(fichiers.get('Essai/Natif/Carte.swift')).toContain('struct Carte');
  });
});
