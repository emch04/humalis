import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { genererProjetWindows } from '../src/cibles/windows/projet.js';
import { pourLaCible } from '../src/ri/plateforme.js';
import { estStyleDefini, langueDuStyle, nomStyleNatif, nomsDesStylesNatifs, stylesSwiftDu, stylesXamlDu } from '../src/cibles/commun/styles-natifs.js';

const SWIFT = `import SwiftUI
// struct StyleFaux: ViewModifier : un commentaire ne compte pas.
struct StyleCarte: ViewModifier {
    func body(content: Content) -> some View { content.padding(16) }
}
struct StyleBoutonPrincipal: ViewModifier {
    func body(content: Content) -> some View { content.tint(.green) }
}`;
const XAML = `<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
    <!-- <Style x:Key="faux"> -->
    <Style x:Key="carte" TargetType="Border"><Setter Property="Padding" Value="16"/></Style>
    <Style x:Key="bouton-principal" TargetType="Button"/>
</ResourceDictionary>`;

const SOURCE = `style "carte" :
    fond blanc
    arrondi 8

utiliser style "./apple.swift" sur apple
utiliser style "./windows.xaml" sur windows

page "vitrine" :
    titre "Vitrine"
    bloc avec style "carte" :
        bouton "Acheter" avec style "bouton-principal"
`;
const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const fichiersStyle = new Map([['./apple.swift', SWIFT], ['./windows.xaml', XAML]]);

describe('les styles écrits dans la langue de la plateforme', () => {
  it('l’extension donne la langue, et chaque langue sa plateforme', () => {
    expect(['a.css', 'a.swift', 'a.kt', 'a.xaml', 'a.scss'].map(langueDuStyle)).toEqual(['css', 'swift', 'kotlin', 'xaml', 'css']);
    expect(() => analyserSyntaxe(analyser('utiliser style "./windows.xaml"\npage "a" :\n    titre "A"'))).toThrow(/style écrit en XAML : il ne vaut que pour « sur windows »/);
    expect(() => analyserSyntaxe(analyser('utiliser style "./a.swift" sur windows\npage "a" :\n    titre "A"'))).toThrow(/« sur apple », « sur ios » ou « sur macos »/);
    expect(() => analyserSyntaxe(analyser('utiliser style "./a.swift" sur ios\nutiliser style "./b.swift" sur macos\npage "a" :\n    titre "A"'))).not.toThrow();
  });

  it('lit les noms des styles, sans les commentaires', () => {
    expect(stylesSwiftDu(SWIFT)).toEqual(['Carte', 'BoutonPrincipal']);
    expect(stylesXamlDu(XAML)).toEqual(['carte', 'bouton-principal']);
    expect(nomStyleNatif('bouton-principal')).toBe('BoutonPrincipal');
    const definis = new Set(nomsDesStylesNatifs('swift', SWIFT));
    expect(estStyleDefini(definis, 'bouton-principal')).toBe(true);
    expect(estStyleDefini(definis, 'faux')).toBe(false);
    expect(nomsDesStylesNatifs('kotlin', 'fun Modifier.carte(): Modifier = this')).toEqual(['natif:Carte']);
  });

  it('le web ne reçoit ni le Swift ni le XAML', () => {
    expect(pourLaCible(compile(SOURCE), 'web').fichiersStyle).toEqual([]);
  });

  it('Apple : le ViewModifier remplace le style traduit, et le fichier est recopié', () => {
    const { fichiers, diagnostics } = genererProjetApple(compile(SOURCE), { nom: 'essai', source: 'essai.humalis', fichiersStyle });
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const page = fichiers.get('Essai/Pages/PageVitrine.swift')!;
    expect(page).toContain('.modifier(StyleCarte())');
    expect(page).toContain('.modifier(StyleBoutonPrincipal())');
    expect(fichiers.get('Essai/Natif/Styles/apple.swift')).toBe(SWIFT);
  });

  it('Apple : un style pour iOS seulement est écrit sous « #if os(iOS) »', () => {
    const source = 'utiliser style "./ios.swift" sur ios\npage "a" :\n    titre "A" avec style "carte"\n';
    const { fichiers } = genererProjetApple(compile(source), { nom: 'essai', source: 'essai.humalis', fichiersStyle: new Map([['./ios.swift', SWIFT]]) });
    expect(fichiers.get('Essai/Pages/PageA.swift')).toMatch(/#if os\(iOS\)\s*\n\s*\.modifier\(StyleCarte\(\)\)\s*\n\s*#endif/);
    expect(fichiers.get('Essai/Natif/Styles/ios.swift')).toMatch(/^#if os\(iOS\)/);
  });

  it('Windows : le dictionnaire est chargé au démarrage, et le style XAML passe devant le style traduit', () => {
    const { fichiers, diagnostics } = genererProjetWindows(compile(SOURCE), { nom: 'essai', source: 'essai.humalis', fichiersStyle });
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(fichiers.get('Styles/windows.xaml')).toBe(XAML);
    expect(fichiers.get('App.cs')).toContain('new Uri("/Essai;component/Styles/windows.xaml", UriKind.Relative)');
    const page = fichiers.get('Pages/PageVitrine.cs')!;
    expect(page).toContain('"carte")');
    expect(page).toContain('UI.StyleNatif(UI.Bouton(');
    expect(page).not.toContain('Styles.Carte');
  });

  it('Windows : un fichier qui n’est pas un ResourceDictionary est refusé', () => {
    const { diagnostics } = genererProjetWindows(compile('utiliser style "./windows.xaml" sur windows\npage "a" :\n    titre "A"\n'), { nom: 'essai', source: 'essai.humalis', fichiersStyle: new Map([['./windows.xaml', '<Style x:Key="a"/>']]) });
    expect(diagnostics.map((d) => d.message).join()).toContain('doit être un dictionnaire de styles WPF');
  });
});
