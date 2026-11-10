/**
 * La cible Windows : un programme Humalis devient un projet .NET (C# et WPF), une
 * application native pour Windows 10 et 11, sans navigateur embarqué. Comme la cible
 * Apple écrit du Swift lisible, celle-ci écrit du C# lisible, qui se compile aussi sur
 * macOS et Linux (`dotnet build`), et se publie en un seul fichier .exe.
 */
import type { Diagnostic } from '../../analyse/erreurs.js';
import { nomDeLaCopie, type InfoMedia } from '../../ri/medias.js';
import type { Application, Ecran, ThemeRI } from '../../ri/types.js';
import { contenuBinaire } from '../binaire.js';
import { Ecrivain } from '../web/ecrivain.js';
import { COULEURS_CSS } from '../web/styles.js';
import { EcrivainActions, sourceCs } from './actions.js';
import { INTERFACE_CS } from './bibliotheque/interface.js';
import { REACTIF_CS } from './bibliotheque/reactif.js';
import { SERVEUR_CS } from './bibliotheque/serveur.js';
import { SYSTEME_CS } from './bibliotheque/systeme.js';
import { VALEURS_CS } from './bibliotheque/valeurs.js';
import { chaineCs, nomApplication, nomCs, nomMethode } from './noms.js';
import { GenerateurBloc, classeDe, quatreEspaces, type ContexteWindows } from './page.js';
import { reglesDeClasses, styleDesDeclarations } from './styles.js';
import { ExpressionsCs, type Lieu } from './valeurs.js';

export const MARQUE_WINDOWS = '.humalis-windows';

/** La version de .NET visée : une version suivie longtemps (LTS). */
export const DOTNET = 'net10.0-windows';

export interface OptionsWindows {
  /** Le nom du projet, tiré du fichier Humalis (« boutique »). */
  nom: string;
  source: string;
  /** L'adresse du serveur que l'application appelle. */
  serveur?: string;
  /** Le dossier des données sur l'appareil (« dev.exemple.boutique »). */
  identifiant?: string;
  /** Le contenu des fichiers CSS du projet. */
  fichiersStyle?: Map<string, string>;
  medias?: Map<string, InfoMedia>;
}

const LARGEURS: Record<ThemeRI['largeur'], number> = { etroite: 576, normale: 768, large: 1152, pleine: 1600 };

/** Ce qui n'a pas d'équivalent ici : la compilation le dit, plutôt que de produire quelque chose de faux. */
function verifier(application: Application): Diagnostic[] {
  const d: Diagnostic[] = [];
  const refuser = (ligne: number, message: string) => d.push({ gravite: 'erreur', ligne, message });
  for (const c of application.composantsReact) {
    refuser(c.ligne, `Le composant « ${c.nom} » est écrit en JavaScript : la cible Windows n'a pas de navigateur pour le faire tourner. Écrivez-le en Humalis (« composant "${c.nom}" : »), ou compilez avec --cible desktop.`);
  }
  for (const s of application.sources) {
    if (s.passerelle) refuser(application.ecrans[0]?.ligne ?? 1, `La source « ${s.nom} » passe par la passerelle du serveur (jeton secret) : ce n'est pas encore possible sur Windows.`);
  }
  if (application.langues && application.langues.length > 1) {
    d.push({ gravite: 'avertissement', ligne: 1, message: `Le bloc « langues » : l'application Windows s'affiche pour l'instant dans la première langue seulement (${application.langues[0].code}).` });
  }
  if (application.ongletsApplication?.length) {
    d.push({ gravite: 'avertissement', ligne: application.ongletsApplication[0].ligne, message: '« onglets de l\'application » : sur Windows, la navigation passe par les liens et le bouton Retour pour l\'instant.' });
  }
  for (const e of application.ecrans) {
    if (e.parent !== undefined) d.push({ gravite: 'avertissement', ligne: e.ligne, message: `La page « ${e.nom} » s'affiche seule sur Windows, sans sa page parente « ${e.parent} ».` });
  }
  return d;
}

function couleursCs(theme: ThemeRI | undefined): { code: string; noms: Set<string> } {
  const couleurs = new Map(Object.entries(COULEURS_CSS));
  for (const c of theme?.couleurs ?? []) couleurs.set(c.nom, { clair: c.clair, sombre: c.sombre, encreClair: c.encreClair, encreSombre: c.encreSombre });
  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : les couleurs, en clair et en sombre.');
  e.ligne('using System.Windows.Media;');
  e.ligne('using Humalis;');
  e.ligne();
  e.ligne('namespace Humalis;');
  e.ligne();
  e.ligne('public static class Couleurs');
  e.ligne('{');
  e.indenter(() => {
    for (const [nom, c] of couleurs) {
      const cs = nomMethode(nom);
      e.ligne(`public static Brush ${cs} => Apparence.Choisir(${chaineCs(c.clair)}, ${chaineCs(c.sombre)});`);
      e.ligne(`public static Brush Encre${cs} => Apparence.Choisir(${chaineCs(c.encreClair)}, ${chaineCs(c.encreSombre)});`);
    }
  });
  e.ligne('}');
  return { code: e.texte(), noms: new Set(couleurs.keys()) };
}

/** Les styles nommés : « style "carte" : » et les règles CSS qui visent une seule classe. */
function stylesCs(application: Application, options: OptionsWindows, couleurs: Set<string>, diagnostics: Diagnostic[]): { code: string; noms: Set<string>; ignorees: string[] } {
  const declarations = new Map<string, [string, string][]>();
  let autres = 0;
  const textes = [...application.css];
  for (const f of application.fichiersStyle) {
    // « utiliser style "windows.css" sur windows » : la feuille propre à Windows (le tri par plateforme est déjà fait).
    if (f.plateforme !== undefined && !['application', 'windows'].includes(f.plateforme)) continue;
    const contenu = options.fichiersStyle?.get(f.chemin);
    if (contenu !== undefined) textes.push(contenu);
  }
  for (const css of textes) {
    const lu = reglesDeClasses(css);
    autres += lu.autres;
    for (const r of lu.regles) declarations.set(r.classe, [...(declarations.get(r.classe) ?? []), ...r.declarations]);
  }
  // « style "carte" : » écrit en Humalis : ses déclarations, déjà lues.
  for (const s of application.stylesHumalis ?? []) declarations.set(s.nom, s.declarations);

  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : les styles nommés (« avec style "carte" »).');
  e.ligne('using System.Windows;');
  e.ligne('using System.Windows.Media;');
  e.ligne();
  e.ligne('namespace Humalis;');
  e.ligne();
  e.ligne('public static class Styles');
  e.ligne('{');
  const ignorees: string[] = [];
  const noms = new Set<string>();
  e.indenter(() => {
    e.ligne('/// <summary>Le bloc « carte » : un cadre sur le fond des cartes de Windows.</summary>');
    e.ligne('public static StyleHumalis CarteHumalis => new() { Fond = Apparence.FondCarte, CouleurBordure = Apparence.BordureCarte, Bordure = new Thickness(1), Arrondi = 8, Remplissage = new Thickness(16), Pleine = true };');
    for (const [nom, liste] of declarations) {
      const { proprietes, ignorees: perdues } = styleDesDeclarations(liste, couleurs);
      ignorees.push(...perdues.map((p) => `.${nom} { ${p} }`));
      const cs = nomMethode(nom);
      if (cs === 'CarteHumalis') continue;
      noms.add(nom);
      e.ligne(`public static StyleHumalis ${cs} => new() { ${proprietes.join(', ')} };`);
    }
  });
  e.ligne('}');
  if (ignorees.length > 0 || autres > 0) {
    const exemples = ignorees.slice(0, 5).join(' ; ');
    diagnostics.push({
      gravite: 'avertissement',
      ligne: 1,
      message: `Le CSS du projet est traduit en partie sur Windows : ${ignorees.length} déclaration(s) sans équivalent${exemples ? ` (${exemples}${ignorees.length > 5 ? ' …' : ''})` : ''}${autres > 0 ? `, et ${autres} règle(s) qui ne visent pas une seule classe` : ''}. La liste complète est dans CSS-SUR-WINDOWS.md.`,
    });
  }
  return { code: e.texte(), noms, ignorees };
}

/** Les fonctions écrites en haut du fichier : des calculs, en méthodes statiques. */
function fonctionsCs(application: Application, partages: Map<string, Lieu>, diagnostics: Diagnostic[]): string {
  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : les fonctions écrites en haut du fichier.');
  e.ligne('using System;');
  e.ligne('using System.Threading.Tasks;');
  e.ligne('using Humalis;');
  e.ligne();
  e.ligne('namespace Humalis;');
  e.ligne();
  e.ligne('public static class Fonctions');
  e.ligne('{');
  const fonctions = new Set(application.fonctions.map((f) => f.nom));
  e.indenter(() => {
    for (const f of application.fonctions) {
      let ligne = f.ligne;
      const refuser = (quoi: string) => {
        const message = `${quoi} n'existe pas encore dans une fonction sur la cible Windows : écrivez-la dans un événement de la page.`;
        if (!diagnostics.some((d) => d.ligne === ligne && d.message === message)) diagnostics.push({ gravite: 'erreur', ligne, message });
      };
      const variables = new Map(partages);
      for (const p of f.parametres) variables.set(p.nom, { lire: nomCs(p.nom), locale: nomCs(p.nom) });
      const x = new ExpressionsCs({ variables, champs: new Map(), fonctions }, (quoi) => refuser(quoi));
      const actions = new EcrivainActions({ x, refuser, etatsRequetes: new Set(), fenetres: new Set(), dansUnePage: false });
      e.ligne(`/// <summary>« fonction ${f.nom} » (ligne ${f.ligne}).</summary>`);
      e.ligne(`public static object? ${nomMethode(f.nom)}(${f.parametres.map((p) => `object? ${nomCs(p.nom)}`).join(', ')})`);
      e.ligne('{');
      e.indenter(() => {
        ligne = f.ligne;
        actions.ecrire(e, f.corps);
        if (f.corps.at(-1)?.type !== 'rendre') e.ligne('return null;');
      });
      e.ligne('}');
      e.ligne();
    }
  });
  e.ligne('}');
  return e.texte();
}

function sourcesCs(application: Application): string {
  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : les API existantes (« source "…" : »).');
  e.ligne('namespace Humalis;');
  e.ligne();
  e.ligne('public static class Sources');
  e.ligne('{');
  e.indenter(() => {
    for (const s of application.sources) {
      const args = [chaineCs(s.nom), chaineCs(s.adresse)];
      if (s.session) args.push('Session: true');
      if (s.enveloppe) args.push(`Enveloppe: ${chaineCs(s.enveloppe)}`);
      if (s.erreurDans) args.push(`ErreurDans: ${chaineCs(s.erreurDans)}`);
      if (s.entetes.length) args.push(`Entetes: new[] { ${s.entetes.map((h) => `(${chaineCs(h.nom)}, ${chaineCs(h.valeur)})`).join(', ')} }`);
      if (s.jetonPublic) {
        args.push(`Jeton: ${chaineCs(s.jetonPublic.valeur)}`);
        const place = s.jetonPublic.place;
        args.push(`PlaceJeton: ${chaineCs(place.genre === 'autorisation' ? 'autorisation' : `${place.genre}:${place.nom}`)}`);
      }
      if (s.essais) args.push(`Essais: ${s.essais}`);
      if (s.delai) args.push(`Delai: ${s.delai}`);
      e.ligne(`public static readonly Source ${sourceCs(s.nom).slice('Sources.'.length)} = new(${args.join(', ')});`);
    }
  });
  e.ligne('}');
  return e.texte();
}

function partagesCs(application: Application, partages: Map<string, Lieu>): string {
  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : les variables partagées entre les pages (« avec partagee »).');
  e.ligne('using Humalis;');
  e.ligne();
  e.ligne('namespace Humalis;');
  e.ligne();
  e.ligne('public static class Partage');
  e.ligne('{');
  const x = new ExpressionsCs({ variables: partages, champs: new Map(), fonctions: new Set(application.fonctions.map((f) => f.nom)) }, () => {});
  e.indenter(() => {
    for (const p of application.partages) {
      const depart = p.facultatif ? '(object?)null' : x.expr(p.initiale);
      const signal = p.memorisee ? `Memoire.Garder(${chaineCs(`partage.${p.nom}`)}, ${depart}${p.secret ? ', secret: true' : ''})` : `new Signal(${depart})`;
      e.ligne(`public static readonly Signal ${nomCs(p.nom)} = ${signal};`);
    }
  });
  e.ligne('}');
  return e.texte();
}

function csproj(nom: string, application: Application, aDesRessources: boolean): string {
  return `<Project Sdk="Microsoft.NET.Sdk">
  <!-- Produit par Humalis depuis ${nom} : une application WPF pour Windows 10 et 11. -->
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>${DOTNET}</TargetFramework>
    <UseWPF>true</UseWPF>
    <!-- Se compile aussi depuis macOS ou Linux (dotnet build). -->
    <EnableWindowsTargeting>true</EnableWindowsTargeting>
    <Nullable>enable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <LangVersion>latest</LangVersion>
    <AssemblyName>${nomApplication(nom)}</AssemblyName>
    <RootNamespace>${nomApplication(nom)}</RootNamespace>
    <Product>${echapperXml(application.site?.nom ?? nom)}</Product>
    <ApplicationManifest>app.manifest</ApplicationManifest>
    <!-- Le thème Fluent de Windows 11 est encore marqué « à l'essai » par .NET. -->
    <NoWarn>$(NoWarn);WPF0001;CS1998</NoWarn>
  </PropertyGroup>
  <!-- Publication (dotnet publish -r win-x64) : un seul fichier .exe, avec .NET dedans (rien à installer). -->
  <PropertyGroup Condition="'$(RuntimeIdentifier)' != ''">
    <SelfContained>true</SelfContained>
    <PublishSingleFile>true</PublishSingleFile>
    <IncludeNativeLibrariesForSelfExtract>true</IncludeNativeLibrariesForSelfExtract>
    <EnableCompressionInSingleFile>true</EnableCompressionInSingleFile>
  </PropertyGroup>
${aDesRessources ? `  <ItemGroup>
    <Resource Include="Ressources\\**\\*" />
  </ItemGroup>
` : ''}</Project>
`;
}

const echapperXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MANIFESTE = `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis : Windows 10 et 11, et un affichage net sur chaque écran. -->
<assembly manifestVersion="1.0" xmlns="urn:schemas-microsoft-com:asm.v1">
  <assemblyIdentity version="1.0.0.0" name="Humalis.Application"/>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}" />
    </application>
  </compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
      <longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware>
    </windowsSettings>
  </application>
</assembly>
`;

function lisezmoi(nom: string, options: OptionsWindows): string {
  const app = nomApplication(nom);
  return `# ${nom} — application Windows

Produit par Humalis depuis \`${options.source}\` : une application native pour Windows 10 et 11
(C# et WPF, .NET 10), sans navigateur embarqué. Ne modifiez pas ces fichiers à la main :
recompilez le fichier Humalis.

## Construire

Il faut le SDK .NET 10 (https://dotnet.microsoft.com). La construction marche sur Windows,
sur macOS et sur Linux.

\`\`\`sh
dotnet build
\`\`\`

## Publier un seul fichier .exe

\`\`\`sh
dotnet publish -c Release -r win-x64
dotnet publish -c Release -r win-arm64
\`\`\`

Le fichier \`${app}.exe\` est dans \`bin/Release/${DOTNET}/win-x64/publish/\`. Il contient .NET :
rien d'autre à installer sur le PC. Sans signature de code, Windows affiche un avertissement
(SmartScreen) au premier lancement : « Informations complémentaires », puis « Exécuter quand même ».

## Le serveur

L'application appelle \`${options.serveur ?? 'http://localhost:3000'}\`. Pour essayer avec un autre
serveur sans recompiler : variable d'environnement \`HUMALIS_SERVEUR\`.

## Ce qui est gardé sur le PC

- \`avec memorisee\` : \`%LOCALAPPDATA%\\${options.identifiant ?? `humalis.${nom}`}\\memoire.json\` ;
- \`avec memorisee en secret\` et la session : chiffrés par Windows (DPAPI), lisibles seulement par
  la personne connectée à cette session Windows.
`;
}

export function genererProjetWindows(application: Application, options: OptionsWindows): { fichiers: Map<string, string>; diagnostics: Diagnostic[] } {
  const diagnostics = verifier(application);
  const fichiers = new Map<string, string>();
  const app = nomApplication(options.nom);
  const { code: couleurs, noms: nomsCouleurs } = couleursCs(application.theme);
  const { code: styles, noms: nomsStyles, ignorees: cssIgnore } = stylesCs(application, options, nomsCouleurs, diagnostics);

  const partages = new Map<string, Lieu>(application.partages.map((p) => [p.nom, { lire: `Partage.${nomCs(p.nom)}.Lire()`, signal: `Partage.${nomCs(p.nom)}` }]));
  const ctx: ContexteWindows = {
    partages,
    fonctions: new Set(application.fonctions.map((f) => f.nom)),
    composants: new Map(application.composants.map((c) => [c.nom, c])),
    couleurs: nomsCouleurs,
    styles: nomsStyles,
    diagnostics,
    nonDessinees: new Set(),
  };

  for (const ecran of application.ecrans) {
    const classe = classeDe(ecran, 'page');
    fichiers.set(`Pages/${classe}.cs`, new GenerateurBloc(ecran, ctx, 'page', classe).generer(app));
  }
  for (const c of application.composants) {
    const classe = classeDe(c, 'composant');
    fichiers.set(`Composants/${classe}.cs`, new GenerateurBloc(c, ctx, 'composant', classe).generer(app));
  }
  const disposition: { entete?: string; pied?: string } = {};
  for (const partie of ['entete', 'pied'] as const) {
    const d = application.disposition?.[partie];
    if (!d) continue;
    const classe = partie === 'entete' ? 'Entete' : 'Pied';
    const ecran = { ...d.ecran, nom: partie, parametres: [] };
    const code = new GenerateurBloc(ecran, ctx, 'composant', classe, { classes: d.classes, options: d.options }).generer(app);
    fichiers.set(`Composants/${classe}.cs`, code);
    disposition[partie] = classe;
  }

  if (ctx.nonDessinees.size > 0) {
    diagnostics.push({ gravite: 'avertissement', ligne: 1, message: `Sur Windows, ${[...ctx.nonDessinees].map((o) => `« ${o} »`).join(', ')} ne se dessine pas encore : les éléments s'affichent sans ce mouvement ou cet effet.` });
  }

  // La page d'entrée : « accueil », sinon la première page sans paramètre.
  const simple = (e: Ecran) => !e.parametresAdresse?.length && e.parent === undefined;
  const entree = application.ecrans.find((e) => e.nom === 'accueil' && simple(e)) ?? application.ecrans.find((e) => simple(e) && e.nom !== 'introuvable') ?? application.ecrans[0];

  const pages = new Ecrivain();
  pages.ligne('// Produit par Humalis : les pages de l\'application, par leur nom et par leur adresse.');
  pages.ligne('using Humalis;');
  pages.ligne();
  pages.ligne(`namespace ${app};`);
  pages.ligne();
  pages.ligne('public static class Pages');
  pages.ligne('{');
  pages.indenter(() => {
    pages.ligne(`public const string Entree = ${chaineCs(entree?.nom ?? 'accueil')};`);
    pages.ligne();
    pages.ligne('public static PageHumalis? Creer(string nom, Arguments arguments) => nom switch');
    pages.ligne('{');
    pages.indenter(() => {
      for (const e of application.ecrans) pages.ligne(`${chaineCs(e.nom)} => new ${classeDe(e, 'page')}(arguments),`);
      pages.ligne('_ => null,');
    });
    pages.ligne('};');
    pages.ligne();
    pages.ligne('/// <summary>« /produits/12 » → la page « produit » et son paramètre.</summary>');
    pages.ligne('public static (string nom, Arguments arguments)? ParAdresse(string adresse)');
    pages.ligne('{');
    pages.indenter(() => {
      pages.ligne('var morceaux = adresse.Split(\'?\')[0].Trim(\'/\').Split(\'/\', System.StringSplitOptions.RemoveEmptyEntries);');
      for (const e of application.ecrans) {
        const modele = (e.adresse ?? `/${e.nom}${(e.parametresAdresse ?? []).map((p) => `/:${p}`).join('')}`).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
        const conditions = [`morceaux.Length == ${modele.length}`, ...modele.flatMap((m, i) => (m.startsWith(':') ? [] : [`morceaux[${i}] == ${chaineCs(m)}`]))];
        const args = modele.flatMap((m, i) => (m.startsWith(':') ? [`[${chaineCs(m.slice(1))}] = System.Uri.UnescapeDataString(morceaux[${i}])`] : []));
        pages.ligne(`if (${conditions.join(' && ')}) return (${chaineCs(e.nom)}, new Arguments { ${args.join(', ')} });`);
      }
      if (entree) pages.ligne(`if (morceaux.Length == 0) return (${chaineCs(entree.nom)}, new Arguments());`);
      pages.ligne('return null;');
    });
    pages.ligne('}');
  });
  pages.ligne('}');

  const identifiant = options.identifiant ?? `humalis.${options.nom}`;
  const titre = application.site?.nom ?? options.nom;
  const appCs = `// Produit par Humalis : le démarrage de l'application.
using System;
using System.Windows;
using Humalis;

namespace ${app};

public static class Programme
{
    [STAThread]
    public static void Main()
    {
        Configuration.Nom = ${chaineCs(titre)};
        Configuration.Serveur = ${chaineCs(options.serveur ?? 'http://localhost:3000')};
        Configuration.Identifiant = ${chaineCs(identifiant)};
        Configuration.ModeDepart = ${chaineCs(application.theme?.mode ?? 'automatique')};
        Configuration.LargeurContenu = ${application.theme ? LARGEURS[application.theme.largeur] : 960};

        var application = new System.Windows.Application { ShutdownMode = ShutdownMode.OnMainWindowClose };
        Apparence.Appliquer();
        Routeur.Fabrique = Pages.Creer;
        Routeur.ParAdresse = Pages.ParAdresse;
        var fenetre = new FenetrePrincipale(${disposition.entete ? `() => new ${disposition.entete}().Monter()` : 'null'}, ${disposition.pied ? `() => new ${disposition.pied}().Monter()` : 'null'});
        application.MainWindow = fenetre;
        fenetre.Show();
        Routeur.Aller(Pages.Entree);
        application.Run();
    }
}
`;

  const aDesRessources = (options.medias?.size ?? 0) > 0;
  fichiers.set(MARQUE_WINDOWS, 'Ce dossier a été produit par Humalis (cible Windows). Recompiler le fichier .humalis le remplace.\n');
  fichiers.set(`${app}.csproj`, csproj(options.nom, application, aDesRessources));
  fichiers.set('app.manifest', MANIFESTE);
  fichiers.set('App.cs', appCs);
  fichiers.set('Pages.cs', quatreEspaces(pages.texte()));
  fichiers.set('Humalis/Couleurs.cs', quatreEspaces(couleurs));
  fichiers.set('Humalis/Styles.cs', quatreEspaces(styles));
  fichiers.set('Humalis/Fonctions.cs', quatreEspaces(fonctionsCs(application, partages, diagnostics)));
  fichiers.set('Humalis/Partage.cs', quatreEspaces(partagesCs(application, partages)));
  fichiers.set('Humalis/Sources.cs', quatreEspaces(sourcesCs(application)));
  fichiers.set('Humalis/Valeurs.cs', VALEURS_CS);
  fichiers.set('Humalis/Reactif.cs', REACTIF_CS);
  fichiers.set('Humalis/Interface.cs', INTERFACE_CS);
  fichiers.set('Humalis/Systeme.cs', SYSTEME_CS);
  fichiers.set('Humalis/Serveur.cs', SERVEUR_CS);
  for (const [chemin, info] of options.medias ?? []) {
    if (info.contenu !== undefined) fichiers.set(`Ressources/${nomDeLaCopie(chemin)}`, contenuBinaire(info.contenu));
  }
  const cssPerdu = diagnostics.find((d) => d.message.includes('CSS-SUR-WINDOWS.md'));
  if (cssPerdu) fichiers.set('CSS-SUR-WINDOWS.md', `# Le CSS sur Windows\n\n${cssPerdu.message}\n\n## Les déclarations sans équivalent\n\n${cssIgnore.map((l) => `- \`${l}\``).join('\n')}\n`);
  fichiers.set('LISEZMOI.md', lisezmoi(options.nom, options));
  return { fichiers, diagnostics };
}
