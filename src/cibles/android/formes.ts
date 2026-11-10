/**
 * Les formes d'application spéciales sur Android (validées par Emch le 10 novembre 2026) : widget (Glance),
 * partage reçu, clavier, activité en direct (notification qui se met à jour), raccourcis de l'icône, commandes
 * vocales (App Actions), fichiers ouverts, boutons des notifications, recherche du téléphone (AppSearch), tuile
 * des réglages rapides et écran de voiture (Android Auto). La montre et la télévision sont des modules à part,
 * écrits par projet.ts.
 *
 * Ce qui s'affiche (widget, activité) se lit comme une petite page : ses variables, son « quand la page se
 * charge », puis sa vue. Ce qui agit (tuile, partage, fichier, commande vocale, bouton) devient une fonction
 * Kotlin, écrite avec les mêmes actions que les pages.
 */
import { simplifier } from '../../analyse/elements.js';
import type { Action, Application, Ecran, NoeudVue, Valeur } from '../../ri/types.js';
import { FORMES_LUCIDE } from '../icones-donnees.js';
import { EcrivainActions } from './actions.js';
import { EcrivainKotlin } from './ecrivain.js';
import { enChemin, lucideDe } from './icones.js';
import { chaineKotlin, nomApplication, nomKotlin } from './noms.js';
import { Valeurs, type Portee } from './valeurs.js';

/** Les versions des bibliothèques des formes, épinglées comme les autres. */
export const VERSIONS_FORMES = {
  glance: '1.2.0',
  travail: '2.10.5',
  appsearch: '1.1.0',
  voiture: '1.7.0',
  montre: '1.6.2',
  tele: '1.1.0',
} as const;

export interface ContexteFormes {
  application: Application;
  paquet: string;
  /** Les variables partagées : leur nom Humalis → `Partage.x`. */
  partages: Map<string, string>;
  fonctions: Set<string>;
  /** La route Kotlin d'une page, avec ses paramètres (expressions Kotlin) ; rien si elle n'existe pas ici. */
  route(page: string, parametres?: string[]): string | undefined;
  /** Les paramètres d'adresse d'une page. */
  parametresDe(page: string): string[];
  refuser(ligne: number, message: string): void;
  avertir(ligne: number, message: string): void;
  ecrireCode(fichier: string, contenu: string): void;
  ecrireFichier(chemin: string, contenu: string): void;
  /** Tout le code des pages déjà écrit : pour savoir si « dire » ou « commencer activite » y sont employés. */
  code: string;
}

export interface SortieFormes {
  /** Ce qui s'ajoute dans la balise <activity> de MainActivity (filtres d'intention, raccourcis). */
  activite: string;
  /** Ce qui s'ajoute dans <application> (récepteurs, services). */
  application: string;
  permissions: string[];
  dependances: string[];
  /** Les notifications de Firebase doivent être reçues (boutons, activité mise à jour par le serveur). */
  notifications: boolean;
  /** Ce que la réception des notifications fait des messages de données. */
  donnees: { boutons: boolean; activites: boolean };
  /** Quelque chose a été écrit : MainActivity transmet ses intentions à FormesHumalis. */
  actif: boolean;
}

// ─── Les noms ──────────────────────────────────────────────────────────────

const pascal = (texte: string, repli: string): string => nomApplication(simplifier(texte) || repli);
const ressource = (texte: string, repli: string): string => (simplifier(texte) || repli).replace(/[^a-z0-9_]/g, '_').replace(/^([^a-z])/, 'x$1');
const xml = (texte: string): string => texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Une chaîne de ressource Android : l'apostrophe et les guillemets s'échappent. */
const chaineXml = (texte: string): string => xml(texte).replace(/'/g, "\\'").replace(/@/g, '\\@').replace(/\?/g, '\\?');

/** Le dessin vectoriel d'une icône (tuile, raccourci, widget) : les mêmes traits que sur le web. */
export function iconeDrawable(nom: string): string {
  const formes = FORMES_LUCIDE[lucideDe(nom) ?? nom] ?? FORMES_LUCIDE['circle-help'] ?? '<circle cx="12" cy="12" r="10" />';
  const chemins = (formes.match(/<\w+[^>]*\/>/g) ?? []).flatMap((f) => enChemin(f) ?? []);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis : l'icône « ${xml(nom)} », d'après Lucide (licence ISC). -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
${chemins.map((d) => `    <path android:pathData="${xml(d)}" android:fillColor="#00000000" android:strokeColor="#FF000000" android:strokeWidth="2" android:strokeLineCap="round" android:strokeLineJoin="round" />`).join('\n')}
</vector>
`;
}

/** Le type MIME des extensions les plus courantes ; les autres se reconnaissent par leur nom. */
const MIMES: Record<string, string[]> = {
  csv: ['text/csv', 'text/comma-separated-values'],
  txt: ['text/plain'],
  md: ['text/markdown'],
  json: ['application/json'],
  xml: ['text/xml', 'application/xml'],
  html: ['text/html'],
  pdf: ['application/pdf'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  heic: ['image/heic'],
  svg: ['image/svg+xml'],
  mp3: ['audio/mpeg'],
  m4a: ['audio/mp4'],
  wav: ['audio/wav', 'audio/x-wav'],
  mp4: ['video/mp4'],
  mov: ['video/quicktime'],
  zip: ['application/zip'],
  ics: ['text/calendar'],
  vcf: ['text/vcard', 'text/x-vcard'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  odt: ['application/vnd.oasis.opendocument.text'],
  ods: ['application/vnd.oasis.opendocument.spreadsheet'],
  epub: ['application/epub+zip'],
};
export const mimesDe = (extension: string): string[] | undefined => MIMES[extension.replace(/^\./, '').toLowerCase()];

// ─── Les actions hors d'une page ───────────────────────────────────────────

type Sorte = 'ouverte' | 'sansPage';

/**
 * Le corps d'une forme qui agit, en Kotlin : ses actions, avec les variables partagées et ses valeurs reçues.
 * « ouverte » : l'application est ouverte (partage, fichier, commande vocale), elle peut changer de page.
 * « sansPage » : rien n'est ouvert (tuile, bouton d'une notification).
 */
function corpsActions(ctx: ContexteFormes, actions: Action[], locales: Map<string, string>, ligne: number, quoi: string, sorte: Sorte): string {
  const portee: Portee = { variables: new Map([...ctx.partages, ...locales]), champs: new Map(), fonctions: ctx.fonctions, etatsRequetes: new Set(), horsLigne: new Set(ctx.application.partages.filter((p) => p.horsLigne).map((p) => p.nom)) };
  const precision = ` (${quoi})`;
  const valeurs = new Valeurs(portee, (q) => ctx.refuser(ligne, `${q} ne se traduit pas en Kotlin${precision}`));
  const route = (page: string, args?: { parametres?: Valeur[] }) => ctx.route(page, (args?.parametres ?? []).map((p) => valeurs.t(p)));
  const ecrivain = new EcrivainActions({ valeurs, visibilite: () => '', texteChange: () => '', route: (page, args) => route(page, args as { parametres?: Valeur[] }), allerAncre: () => undefined, clesChamps: new Map(), refuser: (m) => ctx.refuser(ligne, `${m}${precision}`) });
  const corps = new EcrivainKotlin();
  corps.indenter(() => ecrivain.ecrire(corps, actions));
  // Une lecture sait se rejouer (« recharger ») : hors d'une page, elle se rejoue dans la même forme.
  const texte = (/\brelances\[/.test(corps.texte()) ? '    val relances = mutableMapOf<String, suspend () -> Unit>()\n' : '') + corps.texte();
  if (/\bportee\b/.test(texte)) ctx.refuser(ligne, `${quoi} : une minuterie ou une lecture « en direct » demandent une page ouverte`);
  if (sorte === 'sansPage' && /\b(nav|confirmer)\b/.test(texte)) ctx.refuser(ligne, `${quoi} : rien n'est ouvert à l'écran, on ne peut ni changer de page ni poser une question ; écrivez ces actions dans une page`);
  return texte.trimEnd();
}

const actionsDe = (ecran: Ecran): Action[] => ecran.gestionnaires.filter((g) => g.declencheur === 'chargement').flatMap((g) => g.actions);

// ─── Les petites vues : widget et activité ─────────────────────────────────

/** Ses variables, son chargement, puis ses calculs : le début d'une petite vue lue hors d'une page. */
function prelude(ctx: ContexteFormes, ecran: Ecran, quoi: string, e: EcrivainKotlin): Valeurs {
  const locales = new Map<string, string>();
  for (const etat of ecran.etat) locales.set(etat.nom, `l${nomApplication(nomKotlin(etat.nom))}`);
  const portee: Portee = { variables: new Map([...ctx.partages, ...locales]), champs: new Map(), fonctions: ctx.fonctions, etatsRequetes: new Set() };
  const valeurs = new Valeurs(portee, (q) => ctx.refuser(ecran.ligne, `${q} ne se traduit pas en Kotlin (${quoi})`));
  for (const etat of ecran.etat) e.ligne(`var ${locales.get(etat.nom)}: Any? = ${valeurs.x(etat.initiale)}`);
  const actions = actionsDe(ecran);
  if (actions.length) {
    const corps = corpsActions(ctx, actions, locales, ecran.ligne, quoi, 'sansPage');
    // Une coupure de réseau ne doit pas empêcher la vue de se montrer : elle garde ses valeurs de départ.
    e.bloc('try {', () => corps.split('\n').forEach((l) => e.ligne(l.replace(/^ {4}/, ''))), '} catch (e: Exception) { }');
  }
  for (const c of ecran.calculs) {
    const nom = `c${nomApplication(nomKotlin(c.nom))}`;
    e.ligne(`val ${nom}: Any? = ${valeurs.x(c.valeur)}`);
    portee.variables.set(c.nom, nom);
  }
  return valeurs;
}

const nombreKt = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

/** La vue d'un widget en Glance : titres, textes, icônes, progression, lignes et colonnes, conditions et listes. */
class VueGlance {
  private numero = 0;
  constructor(private readonly v: Valeurs, private readonly refuser: (ligne: number, m: string) => void, readonly icones: Set<string>, private readonly quoi: string) {}

  ecrire(e: EcrivainKotlin, noeuds: NoeudVue[]): void {
    for (const n of noeuds) this.noeud(e, n);
  }

  private texte(e: EcrivainKotlin, valeur: Valeur, taille: number, gras: boolean, couleur = 'onSurface'): void {
    e.ligne(`Text(${this.v.t(valeur)}, style = TextStyle(fontSize = ${taille}.sp${gras ? ', fontWeight = FontWeight.Bold' : ''}, color = GlanceTheme.colors.${couleur}), maxLines = ${taille >= 18 ? 1 : 3})`);
  }

  private noeud(e: EcrivainKotlin, n: NoeudVue): void {
    const pas = (quoi: string, ligne: number) => this.refuser(ligne, `${quoi} ne se dessine pas dans ${this.quoi} sur Android (un widget montre des titres, des textes, des icônes, des badges et une progression)`);
    switch (n.type) {
      case 'element':
        switch (n.genre) {
          case 'titre':
            return this.texte(e, n.contenu, (n.niveau ?? 1) <= 1 ? 18 : 16, true);
          case 'soustitre':
            return this.texte(e, n.contenu, 15, true);
          case 'texte':
            return this.texte(e, n.contenu, 14, false, 'onSurfaceVariant');
          case 'bouton':
          case 'lien':
            // Tout le widget ouvre l'application (« vers ») : un bouton s'y lit comme un texte mis en avant.
            return this.texte(e, n.contenu, 14, true, 'primary');
          default:
            return pas(`« ${n.genre} »`, n.ligne);
        }
      case 'widget':
        switch (n.genre) {
          case 'progression':
            e.ligne(`LinearProgressIndicator(progress = (${this.v.n(n.contenu)} / ${nombreKt(n.maximum ?? 100)}).toFloat().coerceIn(0f, 1f), modifier = GlanceModifier.fillMaxWidth().padding(vertical = 4.dp))`);
            return;
          case 'badge':
            e.ligne(`Text(${this.v.t(n.contenu)}, style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, color = GlanceTheme.colors.onSecondaryContainer), modifier = GlanceModifier.background(GlanceTheme.colors.secondaryContainer).cornerRadius(10.dp).padding(horizontal = 8.dp, vertical = 2.dp))`);
            return;
          case 'icone': {
            const nom = n.contenu.type === 'texte' && n.contenu.parties.every((p) => 'texte' in p) ? n.contenu.parties.map((p) => ('texte' in p ? p.texte : '')).join('') : undefined;
            if (!nom) return pas('une icône lue dans une variable', 0);
            this.icones.add(nom);
            e.ligne(`Image(ImageProvider(R.drawable.icone_${ressource(nom, 'icone')}), contentDescription = null, colorFilter = ColorFilter.tint(GlanceTheme.colors.onSurface), modifier = GlanceModifier.size(20.dp))`);
            return;
          }
          default:
            return pas(`« ${n.genre} »`, 0);
        }
      case 'bloc': {
        const ligne = n.genre === 'ligne';
        e.bloc(ligne ? 'Row(verticalAlignment = Alignment.CenterVertically) {' : 'Column {', () => this.ecrire(e, n.corps));
        return;
      }
      case 'condition':
        e.bloc(`if (${this.v.b(n.test)}) {`, () => this.ecrire(e, n.alors), n.sinon.length ? '} else {' : '}');
        if (n.sinon.length) e.indenter(() => this.ecrire(e, n.sinon)).ligne('}');
        return;
      case 'repetition': {
        const nom = `x${++this.numero}`;
        const avant = this.v.portee.variables.get(n.variable);
        this.v.portee.variables.set(n.variable, nom);
        // Un widget est petit : les huit premiers éléments suffisent.
        e.bloc(`for (${nom} in liste(${this.v.x(n.liste)}).take(8)) {`, () => this.ecrire(e, n.corps));
        if (avant === undefined) this.v.portee.variables.delete(n.variable);
        else this.v.portee.variables.set(n.variable, avant);
        return;
      }
      default:
        return pas(`« ${n.type} »`, 'ligne' in n ? (n as { ligne: number }).ligne : 0);
    }
  }
}

/** Le contenu d'une activité en direct : un titre, un texte et une progression, lus dans sa vue. */
function contenuActivite(e: EcrivainKotlin, v: Valeurs, noeuds: NoeudVue[], ignores: string[]): void {
  let numero = 0;
  const parcourir = (liste: NoeudVue[]): void => {
    for (const n of liste) {
      if (n.type === 'element' && n.genre === 'titre') e.ligne(`if (titre.isEmpty()) titre = ${v.t(n.contenu)} else textes.add(${v.t(n.contenu)})`);
      else if (n.type === 'element' && (n.genre === 'texte' || n.genre === 'soustitre')) e.ligne(`textes.add(${v.t(n.contenu)})`);
      else if (n.type === 'widget' && n.genre === 'progression') e.ligne(`progression = (${v.n(n.contenu)} / ${nombreKt(n.maximum ?? 100)}).coerceIn(0.0, 1.0)`);
      else if (n.type === 'widget' && n.genre === 'badge') e.ligne(`textes.add(${v.t(n.contenu)})`);
      else if (n.type === 'bloc') parcourir(n.corps);
      else if (n.type === 'condition') {
        e.bloc(`if (${v.b(n.test)}) {`, () => parcourir(n.alors), n.sinon.length ? '} else {' : '}');
        if (n.sinon.length) e.indenter(() => parcourir(n.sinon)).ligne('}');
      } else if (n.type === 'repetition') {
        const nom = `x${++numero}`;
        v.portee.variables.set(n.variable, nom);
        e.bloc(`for (${nom} in liste(${v.x(n.liste)})) {`, () => parcourir(n.corps));
        v.portee.variables.delete(n.variable);
      } else ignores.push(n.type === 'element' || n.type === 'widget' ? n.genre : n.type);
    }
  };
  parcourir(noeuds);
}

// ─── Le code Kotlin ────────────────────────────────────────────────────────

const IMPORTS_FORMES = [
  'android.content.Context',
  'android.content.Intent',
  'android.net.Uri',
  'android.os.Build',
  'android.provider.OpenableColumns',
  'android.util.Base64',
  'android.webkit.MimeTypeMap',
  'android.widget.Toast',
  'androidx.compose.runtime.getValue',
  'androidx.compose.runtime.mutableStateOf',
  'androidx.compose.runtime.setValue',
  'androidx.navigation.NavHostController',
  'java.io.File',
  'java.util.UUID',
  'kotlinx.coroutines.CoroutineScope',
  'kotlinx.coroutines.Dispatchers',
  'kotlinx.coroutines.SupervisorJob',
  'kotlinx.coroutines.launch',
  'kotlinx.coroutines.withContext',
];

/** Lire un fichier reçu (partage, « Ouvrir avec ») : le copier dans l'application, son nom, son type, son contenu. */
const LIRE_FICHIERS_KT = String.raw`
/** Un fichier reçu d'une autre application : copié dans l'application, car la permission de le lire ne dure pas. */
fun copierRecu(contexte: Context, adresse: Uri): File? {
    val resolveur = contexte.contentResolver
    var nom = adresse.lastPathSegment?.substringAfterLast('/') ?: "fichier"
    try {
        resolveur.query(adresse, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) nom = it.getString(0) ?: nom }
    } catch (e: Exception) { }
    val dossier = File(contexte.cacheDir, "humalis-recus").apply { mkdirs() }
    val copie = File(dossier, UUID.randomUUID().toString().take(8) + "-" + nom.replace(Regex("[^A-Za-z0-9._-]"), "_"))
    return try {
        (if (adresse.scheme == "file") File(adresse.path ?: return null).inputStream() else resolveur.openInputStream(adresse) ?: return null).use { entree -> copie.outputStream().use { entree.copyTo(it) } }
        copie
    } catch (e: Exception) {
        null
    }
}

/** Le nom lisible d'une copie : sans le préfixe ajouté pour la rendre unique. */
fun nomRecu(copie: File): String = copie.name.substringAfter('-')

fun typeRecu(contexte: Context, adresse: Uri, nom: String): String =
    contexte.contentResolver.getType(adresse) ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(nom.substringAfterLast('.', "").lowercase()) ?: "application/octet-stream"
`;

const LIRE_PARTAGE_KT = String.raw`
/** « quand on partage vers l'application » : le texte, le premier lien trouvé dedans, et le fichier partagé. */
@Suppress("DEPRECATION")
fun lirePartage(contexte: Context, intent: Intent): Map<String, Any?> {
    val texte = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
    val lien = Regex("https?://[^\\s]+").find(texte)?.value ?: ""
    val flux: List<Uri> = if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
        (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)) ?: emptyList()
    } else {
        listOfNotNull(if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
    }
    val copies = flux.mapNotNull { copierRecu(contexte, it) }
    return fiche("texte" to texte, "lien" to lien, "fichier" to (copies.firstOrNull()?.absolutePath ?: ""), "fichiers" to copies.map { it.absolutePath })
}
`;

const LIRE_FICHIER_KT = String.raw`
/** « quand on ouvre un fichier » : son nom, son type, et son contenu (le texte, ou le fichier en base 64). */
fun lireFichierOuvert(contexte: Context, adresse: Uri): Map<String, Any?>? {
    val copie = copierRecu(contexte, adresse) ?: return null
    val nom = nomRecu(copie)
    val type = typeRecu(contexte, adresse, nom)
    val texteLisible = type.startsWith("text/") || type in setOf("application/json", "application/xml", "application/csv")
    val contenu = if (texteLisible) copie.readText() else Base64.encodeToString(copie.readBytes(), Base64.NO_WRAP)
    return fiche("nom" to nom, "type" to type, "contenu" to contenu, "chemin" to copie.absolutePath)
}
`;

const HORS_PAGE_KT = String.raw`
/**
 * Une forme qui agit sans page ouverte (tuile, bouton d'une notification) : ses messages s'affichent en bas de
 * l'écran par le système, puisque l'application n'est pas à l'écran.
 */
object HorsPage {
    suspend fun lancer(contexte: Context, actions: suspend () -> Unit) = withContext(Dispatchers.Main) {
        Appli.contexte = contexte.applicationContext
        val avant = Messages.enCours.size
        try {
            actions()
        } catch (e: ErreurHumalis) {
            Messages.afficher(e.raison, "erreur")
        } catch (e: Exception) {
            Messages.afficher(e.message ?: "Une erreur est survenue.", "erreur")
        }
        if (Activite.courante == null) {
            val nouveaux = Messages.enCours.drop(avant)
            for (m in nouveaux) {
                Toast.makeText(contexte.applicationContext, m.texte, if (m.duree > 4000) Toast.LENGTH_LONG else Toast.LENGTH_SHORT).show()
                Messages.enCours.remove(m)
            }
        }
    }
}
`;

const VOIX_KT = String.raw`// Produit par Humalis : « dire » : la phrase est lue à voix haute par le téléphone, et affichée.
package PAQUET

import android.speech.tts.TextToSpeech
import java.util.Locale

object Voix {
    private var moteur: TextToSpeech? = null
    private var pret = false
    private val enAttente = mutableListOf<String>()

    fun dire(texte: String) {
        Messages.afficher(texte, "info", duree = 6000)
        val m = moteur
        if (m == null) {
            enAttente.add(texte)
            moteur = TextToSpeech(Appli.contexte) { statut ->
                if (statut == TextToSpeech.SUCCESS) {
                    pret = true
                    moteur?.language = Locale.getDefault()
                    enAttente.forEach { parler(it) }
                    enAttente.clear()
                }
            }
            return
        }
        if (pret) parler(texte) else enAttente.add(texte)
    }

    private fun parler(texte: String) {
        moteur?.speak(texte, TextToSpeech.QUEUE_ADD, null, "humalis-" + texte.hashCode())
    }
}
`;

export function ecrireFormes(ctx: ContexteFormes): SortieFormes {
  const { application, paquet } = ctx;
  const f = application.formes;
  const sortie: SortieFormes = { activite: '', application: '', permissions: [], dependances: [], notifications: false, donnees: { boutons: false, activites: false }, actif: false };
  const icones = new Set<string>();
  const chaines: { nom: string; valeur: string }[] = [];
  const tableaux: { nom: string; valeurs: string[] }[] = [];
  const raccourcisXml: string[] = [];
  const receptions = new EcrivainKotlin();
  const quitter: string[] = [];
  const fonctions = new EcrivainKotlin();
  const activiteClasse = `${paquet}.MainActivity`;
  const lectures = new Set<string>();
  const dependances = new Set<string>();
  let avecHorsPage = false;
  const avecTravail = () => dependances.add(`implementation("androidx.work:work-runtime-ktx:${VERSIONS_FORMES.travail}")`);

  const kt = (nom: string, imports: string[], corps: string) => {
    const e = new EcrivainKotlin();
    e.ligne(`// Produit par Humalis : ${nom}.`);
    e.ligne(`package ${paquet}`);
    e.ligne();
    for (const i of imports) e.ligne(`import ${i}`);
    return `${e.texte()}\n${corps.replace(/^\n+/, '')}`;
  };

  // ── Les widgets (Glance) ──
  for (const [i, w] of (f?.widgets ?? []).entries()) {
    sortie.actif = true;
    const classe = `Widget${pascal(w.nom, `${i + 1}`)}`;
    const res = `widget_${ressource(w.nom, `${i + 1}`)}`;
    const quoi = `le widget « ${w.nom} »`;
    const e = new EcrivainKotlin();
    e.ligne(`/** ${quoi.replace(/^l/, 'L')}, sur l'écran d'accueil. */`);
    e.bloc(`class ${classe} : GlanceAppWidget() {`, () => {
      e.bloc('override suspend fun provideGlance(context: Context, id: GlanceId) {', () => {
        e.ligne('Appli.contexte = context.applicationContext');
        const valeurs = prelude(ctx, w.ecran, quoi, e);
        const vue = new VueGlance(valeurs, ctx.refuser, icones, quoi);
        const route = w.vers ? ctx.route(w.vers, ctx.parametresDe(w.vers).map(() => '""')) : undefined;
        e.ligne(`val ouvrir = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)${route ? `.putExtra("humalis.page", ${route})` : ''}`);
        e.bloc('provideContent {', () => {
          e.bloc('GlanceTheme {', () => {
            e.bloc('Column(modifier = GlanceModifier.fillMaxSize().background(GlanceTheme.colors.widgetBackground).cornerRadius(16.dp).padding(12.dp).clickable(actionStartActivity(ouvrir)), verticalAlignment = Alignment.Top) {', () => vue.ecrire(e, w.ecran.vue));
          });
        });
      });
    });
    e.ligne();
    e.ligne('/** Le système demande au récepteur de dessiner le widget ; l\'actualisation passe par WorkManager. */');
    e.bloc(`class Recepteur${classe} : GlanceAppWidgetReceiver() {`, () => {
      e.ligne(`override val glanceAppWidget: GlanceAppWidget = ${classe}()`);
      if (w.actualiser) {
        const minutes = w.actualiser.unite === 'heures' ? w.actualiser.nombre * 60 : w.actualiser.nombre;
        e.ligne();
        e.bloc('override fun onEnabled(context: Context) {', () => {
          e.ligne('super.onEnabled(context)');
          e.ligne(`val demande = PeriodicWorkRequestBuilder<Actualiser${classe}>(${Math.max(15, minutes)}, TimeUnit.MINUTES).build()`);
          e.ligne(`WorkManager.getInstance(context).enqueueUniquePeriodicWork(${chaineKotlin(`humalis-${res}`)}, ExistingPeriodicWorkPolicy.KEEP, demande)`);
        });
        e.ligne();
        e.bloc('override fun onDisabled(context: Context) {', () => {
          e.ligne('super.onDisabled(context)');
          e.ligne(`WorkManager.getInstance(context).cancelUniqueWork(${chaineKotlin(`humalis-${res}`)})`);
        });
      }
    });
    if (w.actualiser) {
      avecTravail();
      e.ligne();
      e.ligne(`/** « actualiser toutes les ${w.actualiser.nombre} ${w.actualiser.unite} » : le système réveille l'application, jamais avant 15 minutes. */`);
      e.bloc(`class Actualiser${classe}(contexte: Context, reglages: WorkerParameters) : CoroutineWorker(contexte, reglages) {`, () => {
        e.bloc('override suspend fun doWork(): Result {', () => {
          e.ligne(`${classe}().updateAll(applicationContext)`);
          e.ligne('return Result.success()');
        });
      });
    }
    ctx.ecrireCode(`${classe}.kt`, kt(quoi, [
      'android.content.Context',
      'android.content.Intent',
      'androidx.compose.ui.unit.dp',
      'androidx.compose.ui.unit.sp',
      'androidx.glance.ColorFilter',
      'androidx.glance.GlanceId',
      'androidx.glance.GlanceModifier',
      'androidx.glance.GlanceTheme',
      'androidx.glance.Image',
      'androidx.glance.ImageProvider',
      'androidx.glance.action.clickable',
      'androidx.glance.appwidget.GlanceAppWidget',
      'androidx.glance.appwidget.GlanceAppWidgetReceiver',
      'androidx.glance.appwidget.LinearProgressIndicator',
      'androidx.glance.appwidget.action.actionStartActivity',
      'androidx.glance.appwidget.cornerRadius',
      'androidx.glance.appwidget.provideContent',
      'androidx.glance.appwidget.updateAll',
      'androidx.glance.background',
      'androidx.glance.layout.Alignment',
      'androidx.glance.layout.Column',
      'androidx.glance.layout.Row',
      'androidx.glance.layout.fillMaxSize',
      'androidx.glance.layout.fillMaxWidth',
      'androidx.glance.layout.padding',
      'androidx.glance.layout.size',
      'androidx.glance.text.FontWeight',
      'androidx.glance.text.Text',
      'androidx.glance.text.TextStyle',
      ...(w.actualiser ? ['androidx.work.CoroutineWorker', 'androidx.work.ExistingPeriodicWorkPolicy', 'androidx.work.PeriodicWorkRequestBuilder', 'androidx.work.WorkManager', 'androidx.work.WorkerParameters', 'java.util.concurrent.TimeUnit'] : []),
    ], e.texte()));
    const [largeur, hauteur, cl, ch] = { petite: [110, 110, 2, 2], moyenne: [250, 110, 4, 2], grande: [250, 250, 4, 4] }[w.taille ?? 'petite'];
    chaines.push({ nom: `${res}_description`, valeur: w.nom });
    ctx.ecrireFichier(`app/src/main/res/xml/${res}.xml`, `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis : ${xml(quoi)} (taille ${w.taille ?? 'petite'}). -->
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/${res}_description"
    android:minWidth="${largeur}dp"
    android:minHeight="${hauteur}dp"
    android:targetCellWidth="${cl}"
    android:targetCellHeight="${ch}"
    android:resizeMode="horizontal|vertical"
    android:updatePeriodMillis="0"
    android:initialLayout="@layout/glance_default_loading_layout"
    android:widgetCategory="home_screen" />
`);
    sortie.application += `
        <receiver android:name=".Recepteur${classe}" android:exported="true" android:label="${xml(w.nom)}">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/${res}" />
        </receiver>`;
    quitter.push(`${classe}().updateAll(contexte)`);
    const lu = JSON.stringify(w.ecran);
    const volatiles = application.partages.filter((p) => lu.includes(`"${p.nom}"`) && !p.memorisee && !p.secret && !p.horsLigne).map((p) => p.nom);
    if (volatiles.length) ctx.avertir(w.ligne, `${quoi} lit ${volatiles.map((n) => `« ${n} »`).join(', ')} : quand l'application est fermée, Android montre ${volatiles.length > 1 ? 'leurs valeurs' : 'sa valeur'} de départ. Ajoutez « avec memorisee » pour que le widget montre la dernière valeur.`);
  }
  if (f?.widgets.length) dependances.add(`implementation("androidx.glance:glance-appwidget:${VERSIONS_FORMES.glance}")`);

  // ── Les activités en direct : une notification « en cours » qui se met à jour ──
  const activites = f?.activites ?? [];
  const avecActivites = activites.length > 0 && (/\bActivites\.(commencer|terminer)\(/.test(ctx.code) || JSON.stringify(application.serveurs ?? []).includes('"type":"activite"'));
  if (activites.length) {
    sortie.actif = true;
    const e = new EcrivainKotlin();
    e.ligne('/** Ce qu\'une activité en direct montre : un titre, un texte, et une progression de 0 à 1. */');
    e.ligne('class ContenuActivite(val titre: String, val texte: String, val progression: Double?)');
    e.ligne();
    e.ligne('/**');
    e.ligne(' * « activite en direct » : une notification « en cours », qui reste en haut de l\'écran et sur l\'écran de');
    e.ligne(' * verrouillage. Android 16 la met aussi en avant dans la barre d\'état. Le serveur la fait relire par Firebase.');
    e.ligne(' */');
    e.bloc('object Activites {', () => {
      e.ligne('const val CANAL = "humalis.activites"');
      e.ligne();
      e.bloc('private fun numero(nom: String): Int = when (nom) {', () => {
        activites.forEach((a, i) => e.ligne(`${chaineKotlin(a.nom)} -> ${7300 + i}`));
        e.ligne('else -> 7399');
      });
      e.ligne();
      e.bloc('private suspend fun contenu(nom: String): ContenuActivite? = when (nom) {', () => {
        activites.forEach((a, i) => e.ligne(`${chaineKotlin(a.nom)} -> contenuActivite${i + 1}()`));
        e.ligne('else -> null');
      });
      e.ligne();
      e.ligne('/** « commencer activite » : la permission de notifier (Android 13), puis la notification. */');
      e.bloc('suspend fun commencer(nom: String) {', () => {
        e.ligne('val contexte = Appli.contexte');
        e.ligne('if (Build.VERSION.SDK_INT >= 33 && !permission(Manifest.permission.POST_NOTIFICATIONS)) {');
        e.ligne('    Messages.afficher("Les notifications ne sont pas permises : autorisez-les dans les réglages de l\'appareil.", "erreur")');
        e.ligne('    return');
        e.ligne('}');
        e.ligne('montrer(contexte, nom)');
      });
      e.ligne();
      e.bloc('fun terminer(nom: String) {', () => e.ligne('NotificationManagerCompat.from(Appli.contexte).cancel(numero(nom))'));
      e.ligne();
      e.ligne('/** « mettre a jour activite » du serveur : relue seulement si elle est encore à l\'écran. */');
      e.bloc('suspend fun actualiser(contexte: Context, nom: String) {', () => {
        e.ligne('Appli.contexte = contexte.applicationContext');
        e.ligne('val gestionnaire = contexte.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager');
        e.ligne('if (gestionnaire.activeNotifications.any { it.id == numero(nom) }) montrer(contexte, nom)');
      });
      e.ligne();
      e.bloc('private suspend fun montrer(contexte: Context, nom: String) {', () => {
        e.ligne('val c = contenu(nom) ?: return');
        e.ligne('val gestionnaire = contexte.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager');
        e.ligne('if (Build.VERSION.SDK_INT >= 26) gestionnaire.createNotificationChannel(NotificationChannel(CANAL, "Activités en cours", NotificationManager.IMPORTANCE_DEFAULT).apply { setSound(null, null) })');
        e.ligne('val ouvrir = PendingIntent.getActivity(contexte, numero(nom), Intent(contexte, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)');
        e.ligne('val n = NotificationCompat.Builder(contexte, CANAL)');
        e.ligne('    .setSmallIcon(android.R.drawable.ic_popup_sync)');
        e.ligne('    .setContentTitle(c.titre)');
        e.ligne('    .setContentText(c.texte)');
        e.ligne('    .setStyle(NotificationCompat.BigTextStyle().bigText(c.texte))');
        e.ligne('    .setOngoing(true)');
        e.ligne('    .setOnlyAlertOnce(true)');
        e.ligne('    .setCategory(if (c.progression != null) NotificationCompat.CATEGORY_PROGRESS else NotificationCompat.CATEGORY_STATUS)');
        e.ligne('    .setContentIntent(ouvrir)');
        e.ligne('    .setShortCriticalText(c.titre.take(7))');
        e.ligne('    .setRequestPromotedOngoing(true)');
        e.ligne('c.progression?.let { n.setProgress(100, (it * 100).toInt(), false) }');
        e.ligne('if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(contexte, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return');
        e.ligne('NotificationManagerCompat.from(contexte).notify(numero(nom), n.build())');
      });
    });
    for (const [i, a] of activites.entries()) {
      const quoi = `l'activité en direct « ${a.nom} »`;
      e.ligne();
      e.ligne(`/** ${quoi.replace(/^l/, 'L')}. */`);
      e.bloc(`private suspend fun contenuActivite${i + 1}(): ContenuActivite {`, () => {
        const valeurs = prelude(ctx, a.ecran, quoi, e);
        e.ligne('var titre = ""');
        e.ligne('val textes = mutableListOf<String>()');
        e.ligne('var progression: Double? = null');
        const ignores: string[] = [];
        contenuActivite(e, valeurs, a.ecran.vue, ignores);
        if (ignores.length) ctx.avertir(a.ligne, `${quoi} : sur Android, une activité en direct montre un titre, un texte et une progression ; ${[...new Set(ignores)].map((x) => `« ${x} »`).join(', ')} n'y ${ignores.length > 1 ? 'sont' : 'est'} pas montré${ignores.length > 1 ? 's' : ''}.`);
        e.ligne('return ContenuActivite(titre, textes.filter { it.isNotBlank() }.joinToString(" · "), progression)');
      });
    }
    ctx.ecrireCode('Activites.kt', kt('les activités en direct', [
      'android.Manifest',
      'android.app.NotificationChannel',
      'android.app.NotificationManager',
      'android.app.PendingIntent',
      'android.content.Context',
      'android.content.Intent',
      'android.content.pm.PackageManager',
      'android.os.Build',
      'androidx.core.app.NotificationCompat',
      'androidx.core.app.NotificationManagerCompat',
      'androidx.core.content.ContextCompat',
    ], e.texte()));
    sortie.permissions.push('android.permission.POST_NOTIFICATIONS', 'android.permission.POST_PROMOTED_NOTIFICATIONS');
    dependances.add(`implementation("androidx.core:core-ktx:1.17.0")`);
    if (JSON.stringify(application.serveurs ?? []).includes('"type":"activite"')) {
      sortie.notifications = true;
      sortie.donnees.activites = true;
    }
    if (!avecActivites) ctx.avertir(activites[0]!.ligne, `l'activité en direct « ${activites[0]!.nom} » n'est commencée nulle part : écrivez « commencer activite "${activites[0]!.nom}" » dans une page.`);
  }

  // ── Les formes qui agissent quand l'application s'ouvre : partage, fichier, commande vocale ──
  const partage = f?.partageRecu;
  if (partage) {
    sortie.actif = true;
    lectures.add(LIRE_FICHIERS_KT).add(LIRE_PARTAGE_KT);
    const corps = corpsActions(ctx, actionsDe(partage.ecran), new Map([['partage', 'partage']]), partage.ligne, 'le partage reçu', 'ouverte');
    fonctions.ligne('/** « quand on partage vers l\'application ». */');
    fonctions.ligne('@Suppress("UNUSED_PARAMETER", "UNUSED_VARIABLE", "NAME_SHADOWING")');
    fonctions.ligne('suspend fun partageRecu(nav: NavHostController, partage: Any?) {');
    if (corps) fonctions.ligne(corps);
    fonctions.ligne('}');
    fonctions.ligne();
    receptions.bloc('if (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE) {', () => {
      receptions.ligne('val partage = lirePartage(contexte, intent)');
      receptions.ligne('enAttente = { nav -> partageRecu(nav, partage) }');
      receptions.ligne('return');
    });
    sortie.activite += `
            <intent-filter android:label="@string/app_name">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="*/*" />
            </intent-filter>
            <intent-filter android:label="@string/app_name">
                <action android:name="android.intent.action.SEND_MULTIPLE" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="*/*" />
            </intent-filter>`;
  }

  const ouverts = f?.fichiersOuverts ?? [];
  if (ouverts.length) {
    sortie.actif = true;
    lectures.add(LIRE_FICHIERS_KT).add(LIRE_FICHIER_KT);
    const choix: string[] = [];
    for (const [i, o] of ouverts.entries()) {
      const quoi = `l'ouverture des fichiers ${o.extensions.join(', ')}`;
      const corps = corpsActions(ctx, actionsDe(o.ecran), new Map([['fichier', 'fichier']]), o.ligne, quoi, 'ouverte');
      fonctions.ligne(`/** « quand on ouvre un fichier ${o.extensions.map((x) => `"${x}"`).join(' ou ')} ». */`);
      fonctions.ligne('@Suppress("UNUSED_PARAMETER", "UNUSED_VARIABLE", "NAME_SHADOWING")');
      fonctions.ligne(`suspend fun fichierOuvert${i + 1}(nav: NavHostController, fichier: Any?) {`);
      if (corps) fonctions.ligne(corps);
      fonctions.ligne('}');
      fonctions.ligne();
      const extensions = o.extensions.map((x) => x.replace(/^\./, '').toLowerCase());
      const types = extensions.flatMap((x) => mimesDe(x) ?? []);
      choix.push(`${[`nom.substringAfterLast('.', "").lowercase() in setOf(${extensions.map(chaineKotlin).join(', ')})`, ...(types.length ? [`type in setOf(${types.map(chaineKotlin).join(', ')})`] : [])].join(' || ')} -> fichierOuvert${i + 1}(nav, fichier)`);
      const connus = extensions.filter((x) => mimesDe(x));
      const inconnus = extensions.filter((x) => !mimesDe(x));
      if (connus.length) {
        sortie.activite += `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:scheme="file" />
${[...new Set(connus.flatMap((x) => mimesDe(x)!))].map((m) => `                <data android:mimeType="${m}" />`).join('\n')}
            </intent-filter>`;
      }
      if (inconnus.length) {
        // Une extension sans type connu : reconnue par la fin du nom (les gestionnaires de fichiers la gardent).
        sortie.activite += `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:scheme="content" />
                <data android:scheme="file" />
                <data android:host="*" />
                <data android:mimeType="application/octet-stream" />
${inconnus.flatMap((x) => [`.*\\\\.${x}`, `.*\\\\..*\\\\.${x}`]).map((p) => `                <data android:pathPattern="${p}" />`).join('\n')}
            </intent-filter>`;
        ctx.avertir(o.ligne, `${quoi} : Android reconnaît les fichiers par leur type ; ${inconnus.map((x) => `« .${x} »`).join(', ')} n'${inconnus.length > 1 ? 'ont' : 'a'} pas de type connu et ${inconnus.length > 1 ? 'sont reconnus' : 'est reconnu'} seulement par la fin du nom, quand l'application qui l'ouvre le donne.`);
      }
    }
    fonctions.ligne('/** Le fichier ouvert va à la forme qui attend son extension ou son type. */');
    fonctions.ligne('@Suppress("UNUSED_VARIABLE")');
    fonctions.bloc('suspend fun fichierOuvert(nav: NavHostController, fichier: Map<String, Any?>) {', () => {
      fonctions.ligne('val nom = texte(fichier["nom"])');
      fonctions.ligne('val type = texte(fichier["type"])');
      fonctions.bloc('when {', () => {
        for (const c of choix) fonctions.ligne(c);
        fonctions.ligne('else -> fichierOuvert1(nav, fichier)');
      });
    });
    fonctions.ligne();
    receptions.bloc('if (intent.action == Intent.ACTION_VIEW && intent.data?.scheme in setOf("content", "file")) {', () => {
      receptions.ligne('val adresse = intent.data!!');
      receptions.bloc('portee.launch {', () => {
        receptions.ligne('val fichier = withContext(Dispatchers.IO) { lireFichierOuvert(contexte, adresse) }');
        receptions.ligne('if (fichier == null) Messages.afficher("Ce fichier n\'a pas pu être lu.", "erreur") else enAttente = { nav -> fichierOuvert(nav, fichier) }');
      });
      receptions.ligne('return');
    });
  }

  const commandes = f?.commandesVocales ?? [];
  if (commandes.length) {
    sortie.actif = true;
    const cas: string[] = [];
    for (const [i, c] of commandes.entries()) {
      const quoi = `la commande vocale « ${c.phrase} »`;
      const locales = new Map(c.parametres.map((p) => [p, nomKotlin(p)]));
      const corps = corpsActions(ctx, actionsDe(c.ecran), locales, c.ligne, quoi, 'ouverte');
      const params = c.parametres.map((p) => `${nomKotlin(p)}: Any?`);
      fonctions.ligne(`/** « commande vocale "${c.phrase}" » : l'assistant ouvre l'application, qui fait ce qui est écrit. */`);
      fonctions.ligne('@Suppress("UNUSED_PARAMETER", "UNUSED_VARIABLE", "NAME_SHADOWING")');
      fonctions.ligne(`suspend fun commandeVocale${i + 1}(${['nav: NavHostController', ...params].join(', ')}) {`);
      if (c.vers) {
        const attendus = ctx.parametresDe(c.vers);
        const route = ctx.route(c.vers, attendus.map((_, k) => (c.parametres[k] ? `texte(${nomKotlin(c.parametres[k]!)})` : '""')));
        if (route) fonctions.ligne(`    allerVers(nav, ${route})`);
      }
      if (corps) fonctions.ligne(corps);
      fonctions.ligne('}');
      fonctions.ligne();
      cas.push(`${chaineKotlin(String(i + 1))} -> { ${[...c.parametres.map((p) => `val ${nomKotlin(p)} = intent.getStringExtra(${chaineKotlin(p)}) ?: ""`), `enAttente = { nav -> commandeVocale${i + 1}(${['nav', ...c.parametres.map(nomKotlin)].join(', ')}) }`].join('; ')} }`);
      const capacite = `custom.actions.intent.${(simplifier(c.phrase) || `commande_${i + 1}`).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
      const motif = c.phrase.replace(/\{([^}]+)\}/g, (_, p: string) => `$${nomKotlin(p)}`);
      tableaux.push({ nom: `commande_vocale_${i + 1}`, valeurs: [motif] });
      raccourcisXml.push(`    <capability android:name="${capacite}" app:queryPatterns="@array/commande_vocale_${i + 1}">
        <intent android:action="android.intent.action.VIEW" android:targetPackage="${paquet}" android:targetClass="${activiteClasse}">
            <extra android:key="humalis.commande" android:value="${i + 1}" />
${c.parametres.map((p) => `            <parameter android:name="${nomKotlin(p)}" android:key="${xml(p)}" android:mimeType="https://schema.org/Text" />`).join('\n')}
        </intent>
    </capability>`);
      if (JSON.stringify(c.ecran.gestionnaires).includes('"type":"dire"')) {
        ctx.avertir(c.ligne, `${quoi} : l'assistant Google ne laisse pas une application lui donner la réponse à dire. Sur Android, l'application s'ouvre, affiche la phrase et la lit à voix haute.`);
      }
    }
    receptions.bloc('intent.getStringExtra("humalis.commande")?.let { commande ->', () => {
      receptions.ligne('intent.removeExtra("humalis.commande")');
      receptions.bloc('when (commande) {', () => cas.forEach((c) => receptions.ligne(c)));
      receptions.ligne('return');
    });
    ctx.avertir(commandes[0]!.ligne, 'les commandes vocales passent par les App Actions de l\'assistant Google (fichier res/xml/shortcuts.xml) : elles marchent une fois l\'application publiée sur Google Play, et l\'assistant ne les reconnaît que dans les langues qu\'il prend en charge pour les intentions personnalisées.');
  }

  // ── Les raccourcis de l'icône (statiques, dans shortcuts.xml) ──
  for (const [i, r] of (f?.raccourcisIcone ?? []).entries()) {
    sortie.actif = true;
    const parametres = ctx.parametresDe(r.page);
    const routeExpr = ctx.route(r.page, parametres.map(() => '""'));
    // La route sans paramètre : une chaîne Kotlin simple, à écrire telle quelle dans le XML.
    const route = routeExpr && /^"[^"$\\]*"$/.test(routeExpr) ? routeExpr.slice(1, -1) : undefined;
    if (!route) {
      ctx.refuser(r.ligne, `le raccourci « ${r.titre} » vise la page « ${r.page} », qui attend un paramètre`);
      continue;
    }
    if (r.icone) icones.add(r.icone);
    chaines.push({ nom: `raccourci_${i + 1}`, valeur: r.titre });
    raccourcisXml.push(`    <shortcut android:shortcutId="raccourci_${i + 1}" android:enabled="true"${r.icone ? ` android:icon="@drawable/icone_${ressource(r.icone, 'icone')}"` : ''} android:shortcutShortLabel="@string/raccourci_${i + 1}">
        <intent android:action="android.intent.action.VIEW" android:targetPackage="${paquet}" android:targetClass="${activiteClasse}">
            <extra android:name="humalis.page" android:value="${xml(route)}" />
        </intent>
    </shortcut>`);
  }
  if (raccourcisXml.length) {
    ctx.ecrireFichier('app/src/main/res/xml/shortcuts.xml', `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis : les raccourcis de l'icône et les commandes vocales (App Actions). -->
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android" xmlns:app="http://schemas.android.com/apk/res-auto">
${raccourcisXml.join('\n')}
</shortcuts>
`);
    sortie.activite += `
            <meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />`;
  }

  // ── Les tuiles des réglages rapides ──
  for (const [i, t] of (f?.tuiles ?? []).entries()) {
    sortie.actif = true;
    avecHorsPage = true;
    const classe = `Tuile${pascal(t.nom, `${i + 1}`)}`;
    const quoi = `la tuile « ${t.nom} »`;
    const corps = corpsActions(ctx, actionsDe(t.ecran), new Map(), t.ligne, quoi, 'sansPage');
    const icone = t.icone ?? 'zap';
    icones.add(icone);
    ctx.ecrireCode(`${classe}.kt`, kt(quoi, ['android.os.Build', 'android.service.quicksettings.Tile', 'android.service.quicksettings.TileService', 'kotlinx.coroutines.CoroutineScope', 'kotlinx.coroutines.Dispatchers', 'kotlinx.coroutines.SupervisorJob', 'kotlinx.coroutines.launch'], `/** ${quoi.replace(/^l/, 'L')}, dans les réglages rapides (tirer deux fois le haut de l'écran). */
class ${classe} : TileService() {
    private val portee = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onStartListening() {
        super.onStartListening()
        val tuile = qsTile ?: return
        tuile.label = ${chaineKotlin(t.nom)}
        tuile.state = Tile.STATE_INACTIVE
        tuile.updateTile()
    }

    override fun onClick() {
        super.onClick()
        val tuile = qsTile
        tuile?.state = Tile.STATE_ACTIVE
        tuile?.updateTile()
        portee.launch {
            HorsPage.lancer(this@${classe}) { actionsTuile${i + 1}() }
            tuile?.state = Tile.STATE_INACTIVE
            tuile?.updateTile()
        }
    }
}

@Suppress("UNUSED_VARIABLE", "NAME_SHADOWING")
suspend fun actionsTuile${i + 1}() {
${corps}
}
`));
    sortie.application += `
        <service
            android:name=".${classe}"
            android:exported="true"
            android:icon="@drawable/icone_${ressource(icone, 'icone')}"
            android:label="${xml(t.nom)}"
            android:permission="android.permission.BIND_QUICK_SETTINGS_TILE">
            <intent-filter>
                <action android:name="android.service.quicksettings.action.QS_TILE" />
            </intent-filter>
        </service>`;
  }

  // ── Les boutons des notifications (reçus par Firebase) ──
  const boutons = f?.boutonsNotification ?? [];
  const serveurBoutons = f !== undefined && JSON.stringify(application.serveurs ?? []).includes('"boutons":[');
  if (boutons.length || serveurBoutons) {
    sortie.actif = true;
    sortie.notifications = true;
    sortie.donnees.boutons = true;
    avecHorsPage = true;
    const e = new EcrivainKotlin();
    e.ligne('/** Un bouton touché dans une notification : la réponse se fait sans ouvrir l\'application. */');
    e.bloc('class RecepteurBoutonsHumalis : BroadcastReceiver() {', () => {
      e.bloc('override fun onReceive(context: Context, intent: Intent) {', () => {
        e.ligne('val bouton = intent.getStringExtra("bouton") ?: return');
        e.ligne('NotificationManagerCompat.from(context).cancel(intent.getIntExtra("notification", 0))');
        e.ligne('val attente = goAsync()');
        e.bloc('CoroutineScope(SupervisorJob() + Dispatchers.Main).launch {', () => {
          e.ligne('try { HorsPage.lancer(context) { boutonNotification(bouton) } } finally { attente.finish() }');
        });
      });
    });
    e.ligne();
    e.ligne('/** Les boutons sans réponse écrite ouvrent l\'application. */');
    e.ligne(`val BOUTONS_ECRITS = setOf(${boutons.map((b) => chaineKotlin(b.bouton)).join(', ')})`);
    e.ligne();
    e.bloc('suspend fun boutonNotification(bouton: String) {', () => {
      e.bloc('when (bouton) {', () => {
        boutons.forEach((b, i) => e.ligne(`${chaineKotlin(b.bouton)} -> boutonNotification${i + 1}()`));
        e.ligne('else -> { }');
      });
    });
    for (const [i, b] of boutons.entries()) {
      const corps = corpsActions(ctx, actionsDe(b.ecran), new Map(), b.ligne, `le bouton « ${b.bouton} » d'une notification`, 'sansPage');
      e.ligne();
      e.ligne(`/** « quand l'utilisateur touche "${b.bouton}" dans une notification ». */`);
      e.ligne('@Suppress("UNUSED_VARIABLE", "NAME_SHADOWING")');
      e.ligne(`suspend fun boutonNotification${i + 1}() {`);
      if (corps) e.ligne(corps);
      e.ligne('}');
    }
    ctx.ecrireCode('Boutons.kt', kt('les boutons des notifications', ['android.content.BroadcastReceiver', 'android.content.Context', 'android.content.Intent', 'androidx.core.app.NotificationManagerCompat', 'kotlinx.coroutines.CoroutineScope', 'kotlinx.coroutines.Dispatchers', 'kotlinx.coroutines.SupervisorJob', 'kotlinx.coroutines.launch'], e.texte()));
    sortie.application += `
        <receiver android:name=".RecepteurBoutonsHumalis" android:exported="false" />`;
  }

  // ── La recherche du téléphone (AppSearch, visible par le système) ──
  const recherches = f?.recherches ?? [];
  if (recherches.length) {
    sortie.actif = true;
    dependances.add(`implementation("androidx.appsearch:appsearch:${VERSIONS_FORMES.appsearch}")`);
    dependances.add(`implementation("androidx.appsearch:appsearch-platform-storage:${VERSIONS_FORMES.appsearch}")`);
    const e = new EcrivainKotlin();
    e.ligne('/**');
    e.ligne(' * « recherche du systeme » : les fiches sont rangées dans AppSearch, la recherche du téléphone (Android 12');
    e.ligne(' * et plus), et marquées visibles par le système. Le lanceur du téléphone choisit de les montrer ou non.');
    e.ligne(' */');
    e.bloc('object RechercheHumalis {', () => {
      e.ligne('private const val GENRE = "FicheHumalis"');
      e.ligne();
      e.bloc('suspend fun indexer(contexte: Context) {', () => {
        e.ligne('if (Build.VERSION.SDK_INT < 31) return');
        e.ligne('val fiches = mutableListOf<GenericDocument>()');
        for (const [i, r] of recherches.entries()) {
          const portee: Portee = { variables: new Map(ctx.partages), champs: new Map(), fonctions: ctx.fonctions, etatsRequetes: new Set() };
          const valeurs = new Valeurs(portee, (q) => ctx.refuser(r.ligne, `${q} ne se traduit pas en Kotlin (la recherche du système)`));
          const source = application.sources.some((s) => s.nom === r.liste) && !ctx.partages.has(r.liste);
          const liste = source ? `(try { Serveur.appel("", source = Sources.${nomKotlin(r.liste)}) } catch (e: Exception) { null })` : valeurs.x({ type: 'variable', nom: r.liste });
          const routeBase = ctx.route(r.vers, ctx.parametresDe(r.vers).map(() => 'RANG'));
          e.bloc(`liste(${liste}).forEachIndexed { rang, fiche ->`, () => {
            e.ligne(`val id = texte(champ(fiche, "id")).ifEmpty { rang.toString() }`);
            const route = routeBase ? routeBase.replace(/\$\{Uri\.encode\(RANG\)\}/g, '${Uri.encode(id)}') : '""';
            e.ligne(`val ouvrir = Intent(contexte, MainActivity::class.java).putExtra("humalis.page", ${route}).toUri(Intent.URI_INTENT_SCHEME)`);
            e.ligne(`fiches.add(GenericDocument.Builder<GenericDocument.Builder<*>>("humalis", "${i}-" + id, GENRE).setPropertyString("titre", texte(champ(fiche, ${chaineKotlin(r.titre)}))).setPropertyString("texte", ${r.texte ? `texte(champ(fiche, ${chaineKotlin(r.texte)}))` : '""'}).setPropertyString("lien", ouvrir).build())`);
          });
        }
        e.bloc('withContext(Dispatchers.IO) {', () => {
          e.bloc('try {', () => {
            e.ligne('val session = PlatformStorage.createSearchSessionAsync(PlatformStorage.SearchContext.Builder(contexte, "humalis").build()).get()');
            e.ligne('val texte = { nom: String -> AppSearchSchema.StringPropertyConfig.Builder(nom).setCardinality(AppSearchSchema.PropertyConfig.CARDINALITY_OPTIONAL).setIndexingType(AppSearchSchema.StringPropertyConfig.INDEXING_TYPE_PREFIXES).setTokenizerType(AppSearchSchema.StringPropertyConfig.TOKENIZER_TYPE_PLAIN).build() }');
            e.ligne('val schema = AppSearchSchema.Builder(GENRE).addProperty(texte("titre")).addProperty(texte("texte")).addProperty(AppSearchSchema.StringPropertyConfig.Builder("lien").setCardinality(AppSearchSchema.PropertyConfig.CARDINALITY_OPTIONAL).build()).build()');
            e.ligne('session.setSchemaAsync(SetSchemaRequest.Builder().addSchemas(schema).setSchemaTypeDisplayedBySystem(GENRE, true).setForceOverride(true).build()).get()');
            e.ligne('session.removeAsync("", SearchSpec.Builder().addFilterNamespaces("humalis").build()).get()');
            e.ligne('if (fiches.isNotEmpty()) session.putAsync(PutDocumentsRequest.Builder().addGenericDocuments(fiches).build()).get()');
            e.ligne('session.requestFlushAsync().get()');
            e.ligne('session.close()');
          }, '} catch (e: Exception) { }');
        });
      });
    });
    ctx.ecrireCode('Recherche.kt', kt('la recherche du téléphone', ['android.content.Context', 'android.content.Intent', 'android.net.Uri', 'android.os.Build', 'androidx.appsearch.app.AppSearchSchema', 'androidx.appsearch.app.GenericDocument', 'androidx.appsearch.app.PutDocumentsRequest', 'androidx.appsearch.app.SearchSpec', 'androidx.appsearch.app.SetSchemaRequest', 'androidx.appsearch.platformstorage.PlatformStorage', 'kotlinx.coroutines.Dispatchers', 'kotlinx.coroutines.withContext'], e.texte()));
    quitter.push('RechercheHumalis.indexer(contexte)');
    ctx.avertir(recherches[0]!.ligne, 'la recherche du système sur Android : les fiches sont rangées dans AppSearch (Android 12 et plus) et marquées visibles par le système, la seule voie publique. Android ne garantit pas que le lanceur du téléphone les montre : le lanceur Pixel lit AppSearch, d\'autres non.');
  }

  // ── Android Auto (Car App Library) ──
  const voitures = f?.voitures ?? [];
  if (voitures.length) {
    sortie.actif = true;
    dependances.add(`implementation("androidx.car.app:app:${VERSIONS_FORMES.voiture}")`);
    const e = new EcrivainKotlin();
    e.ligne('/** Android Auto : l\'écran de la voiture montre une liste, lisible d\'un coup d\'œil, sans rien à taper. */');
    e.bloc('class VoitureHumalis : CarAppService() {', () => {
      e.ligne('override fun createHostValidator(): HostValidator = if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) HostValidator.ALLOW_ALL_HOSTS_VALIDATOR else HostValidator.Builder(applicationContext).addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample).build()');
      e.ligne();
      e.bloc('override fun onCreateSession(): Session = object : Session() {', () => {
        e.ligne(`override fun onCreateScreen(intent: Intent): Screen = ${voitures.length > 1 ? 'EcransVoiture(carContext)' : 'EcranVoiture1(carContext)'}`);
      });
    });
    if (voitures.length > 1) {
      e.ligne();
      e.ligne('/** Plusieurs écrans de voiture : on choisit d\'abord lequel. */');
      e.bloc('class EcransVoiture(contexte: CarContext) : Screen(contexte) {', () => {
        e.bloc('override fun onGetTemplate(): Template {', () => {
          e.ligne('val lignes = ItemList.Builder()');
          voitures.forEach((v, i) => e.ligne(`lignes.addItem(Row.Builder().setTitle(${chaineKotlin(v.nom)}).setBrowsable(true).setOnClickListener { screenManager.push(EcranVoiture${i + 1}(carContext)) }.build())`));
          e.ligne('return ListTemplate.Builder().setTitle(carContext.getString(R.string.app_name)).setSingleList(lignes.build()).build()');
        });
      });
    }
    for (const [i, v] of voitures.entries()) {
      const portee: Portee = { variables: new Map(ctx.partages), champs: new Map(), fonctions: ctx.fonctions, etatsRequetes: new Set() };
      const valeurs = new Valeurs(portee, (q) => ctx.refuser(v.ligne, `${q} ne se traduit pas en Kotlin (l'écran de voiture)`));
      const source = application.sources.some((s) => s.nom === v.liste) && !ctx.partages.has(v.liste);
      e.ligne();
      e.ligne(`/** L'écran de voiture « ${v.nom} ». */`);
      e.bloc(`class EcranVoiture${i + 1}(contexte: CarContext) : Screen(contexte) {`, () => {
        e.ligne('private var fiches: List<Any?>? = null');
        if (source) {
          e.ligne();
          e.bloc('init {', () => {
            e.bloc('lifecycleScope.launch {', () => {
              e.ligne('Appli.contexte = carContext.applicationContext');
              e.ligne(`fiches = liste(try { Serveur.appel("", source = Sources.${nomKotlin(v.liste)}) } catch (e: Exception) { null })`);
              e.ligne('invalidate()');
            });
          });
        }
        e.ligne();
        e.bloc('override fun onGetTemplate(): Template {', () => {
          e.ligne('Appli.contexte = carContext.applicationContext');
          if (!source) e.ligne(`fiches = liste(${valeurs.x({ type: 'variable', nom: v.liste })})`);
          e.ligne(`val modele = ListTemplate.Builder().setTitle(${chaineKotlin(v.nom)})`);
          e.ligne('val lues = fiches');
          e.bloc('if (lues == null) modele.setLoading(true) else {', () => {
            e.ligne('val lignes = ItemList.Builder().setNoItemsMessage("Rien pour le moment")');
            e.bloc('for (fiche in lues.take(ConstraintManager.CONTENT_LIMIT_TYPE_LIST.let { carContext.getCarService(ConstraintManager::class.java).getContentLimit(it) })) {', () => {
              e.ligne(`val ligne = Row.Builder().setTitle(texte(champ(fiche, ${chaineKotlin(v.titre)})).ifEmpty { " " })`);
              if (v.texte) e.ligne(`texte(champ(fiche, ${chaineKotlin(v.texte)})).takeIf { it.isNotBlank() }?.let { ligne.addText(it) }`);
              e.ligne('lignes.addItem(ligne.build())');
            });
            e.ligne('modele.setSingleList(lignes.build())');
          });
          e.ligne('return modele.build()');
        });
      });
    }
    ctx.ecrireCode('Voiture.kt', kt('Android Auto', ['android.content.Intent', 'android.content.pm.ApplicationInfo', 'androidx.car.app.CarAppService', 'androidx.car.app.CarContext', 'androidx.car.app.Screen', 'androidx.car.app.Session', 'androidx.car.app.constraints.ConstraintManager', 'androidx.car.app.model.ItemList', 'androidx.car.app.model.ListTemplate', 'androidx.car.app.model.Row', 'androidx.car.app.model.Template', 'androidx.car.app.validation.HostValidator', 'androidx.lifecycle.lifecycleScope', 'kotlinx.coroutines.launch'], e.texte()));
    ctx.ecrireFichier('app/src/main/res/xml/automotive_app_desc.xml', `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis : l'application a un écran pour Android Auto. -->
<automotiveApp>
    <uses name="template" />
</automotiveApp>
`);
    sortie.application += `
        <meta-data android:name="com.google.android.gms.car.application" android:resource="@xml/automotive_app_desc" />
        <meta-data android:name="androidx.car.app.minCarApiLevel" android:value="1" />
        <service android:name=".VoitureHumalis" android:exported="true">
            <intent-filter>
                <action android:name="androidx.car.app.CarAppService" />
                <category android:name="androidx.car.app.category.POI" />
            </intent-filter>
        </service>`;
    for (const v of voitures) if (v.vers) ctx.avertir(v.ligne, `l'écran de voiture « ${v.nom} » : « vers "${v.vers}" » est sans effet sur Android Auto, qui ne montre pas les pages de l'application ; la liste reste lisible.`);
    ctx.avertir(voitures[0]!.ligne, 'Android Auto : Google doit autoriser l\'application avant sa publication (catégorie « points d\'intérêt » choisie ici). Pour l\'essayer avant, activez le mode développeur de l\'application Android Auto et ses « sources inconnues ». Voir LISEZMOI.md.');
  }

  // ── Les claviers (InputMethodService, des vues Android simples) ──
  for (const [i, k] of (f?.claviers ?? []).entries()) {
    sortie.actif = true;
    const classe = `Clavier${pascal(k.nom, `${i + 1}`)}`;
    const res = `clavier_${ressource(k.nom, `${i + 1}`)}`;
    const quoi = `le clavier « ${k.nom} »`;
    ctx.ecrireCode(`${classe}.kt`, kt(quoi, ['android.content.res.Configuration', 'android.graphics.Color', 'android.inputmethodservice.InputMethodService', 'android.os.Build', 'android.view.Gravity', 'android.view.View', 'android.view.ViewGroup', 'android.widget.Button', 'android.widget.LinearLayout', 'android.widget.ScrollView'], `/** ${quoi.replace(/^l/, 'L')} : chaque touche écrit sa phrase là où l'on tape. */
class ${classe} : InputMethodService() {
    private val touches = listOf(${k.touches.map((t) => `${chaineKotlin(t.texte)} to ${chaineKotlin(t.ecrit)}`).join(', ')})

    override fun onCreateInputView(): View {
        val sombre = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val densite = resources.displayMetrics.density
        val colonne = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(if (sombre) Color.rgb(32, 33, 36) else Color.rgb(232, 234, 237))
            setPadding((6 * densite).toInt(), (6 * densite).toInt(), (6 * densite).toInt(), (6 * densite).toInt())
        }
        fun bouton(texte: String, description: String, action: () -> Unit) = Button(this).apply {
            text = texte
            isAllCaps = false
            contentDescription = description
            setOnClickListener { action() }
            layoutParams = LinearLayout.LayoutParams(0, (52 * densite).toInt(), 1f).apply { setMargins((3 * densite).toInt(), (3 * densite).toInt(), (3 * densite).toInt(), (3 * densite).toInt()) }
        }
        touches.chunked(2).forEach { paire ->
            val rangee = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            paire.forEach { (texte, ecrit) -> rangee.addView(bouton(texte, ecrit) { currentInputConnection?.commitText(ecrit, 1) }) }
            if (paire.size == 1) rangee.addView(View(this), LinearLayout.LayoutParams(0, 0, 1f))
            colonne.addView(rangee)
        }
        val bas = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        bas.addView(bouton("🌐", "Clavier suivant") { if (Build.VERSION.SDK_INT >= 28) switchToNextInputMethod(false) else requestHideSelf(0) })
        bas.addView(bouton("Espace", "Espace") { currentInputConnection?.commitText(" ", 1) })
        bas.addView(bouton("⌫", "Effacer") { currentInputConnection?.deleteSurroundingText(1, 0) })
        bas.addView(bouton("↵", "Entrée") { currentInputConnection?.performEditorAction(currentInputEditorInfo?.imeOptions?.and(android.view.inputmethod.EditorInfo.IME_MASK_ACTION) ?: android.view.inputmethod.EditorInfo.IME_ACTION_DONE) })
        colonne.addView(bas)
        return ScrollView(this).apply {
            addView(colonne)
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            isFillViewport = true
        }
    }
}
`));
    ctx.ecrireFichier(`app/src/main/res/xml/${res}.xml`, `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis : ${xml(quoi)}. -->
<input-method xmlns:android="http://schemas.android.com/apk/res/android" android:supportsSwitchingToNextInputMethod="true">
    <subtype android:label="${xml(k.nom)}" android:imeSubtypeMode="keyboard" android:imeSubtypeLocale="" />
</input-method>
`);
    sortie.application += `
        <service
            android:name=".${classe}"
            android:exported="true"
            android:label="${xml(k.nom)}"
            android:permission="android.permission.BIND_INPUT_METHOD">
            <intent-filter>
                <action android:name="android.view.InputMethod" />
            </intent-filter>
            <meta-data android:name="android.view.im" android:resource="@xml/${res}" />
        </service>`;
    ctx.avertir(k.ligne, `${quoi} : la personne l'active dans les réglages d'Android (Système › Clavier › Claviers à l'écran), puis le choisit par le bouton du clavier en bas de l'écran.`);
  }

  // ── « dire », « commencer activite » dans les pages ──
  const tout = `${ctx.code}\n${fonctions.texte()}`;
  if (/\bVoix\.dire\(/.test(tout) || (f?.commandesVocales ?? []).some((c) => JSON.stringify(c.ecran).includes('"type":"dire"')) || [...(f?.tuiles ?? []), ...boutons].some((x) => JSON.stringify(x.ecran).includes('"type":"dire"'))) {
    ctx.ecrireCode('Voix.kt', VOIX_KT.replace('package PAQUET', `package ${paquet}`));
  }

  // ── Les icônes des formes (tuiles, raccourcis, widgets) ──
  for (const nom of icones) ctx.ecrireFichier(`app/src/main/res/drawable/icone_${ressource(nom, 'icone')}.xml`, iconeDrawable(nom));
  if (chaines.length || tableaux.length) {
    ctx.ecrireFichier('app/src/main/res/values/formes.xml', `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis : les textes des formes (raccourcis, widgets, commandes vocales). -->
<resources>
${chaines.map((c) => `    <string name="${c.nom}">${chaineXml(c.valeur)}</string>`).join('\n')}
${tableaux.map((t) => `    <string-array name="${t.nom}">\n${t.valeurs.map((v) => `        <item>${chaineXml(v)}</item>`).join('\n')}\n    </string-array>`).join('\n')}
</resources>
`.replace(/\n\n<\/resources>/, '\n</resources>'));
  }

  // ── FormesHumalis : ce que l'activité reçoit, et ce qu'elle fait en passant à l'arrière-plan ──
  if (sortie.actif || avecHorsPage) {
    const e = new EcrivainKotlin();
    e.ligne('/** Ce que l\'application reçoit du système (raccourci, partage, fichier, commande vocale) : fait dès qu\'une page est prête. */');
    e.bloc('object FormesHumalis {', () => {
      e.ligne('var enAttente by mutableStateOf<(suspend (NavHostController) -> Unit)?>(null)');
      e.ligne('val portee = CoroutineScope(SupervisorJob() + Dispatchers.Main)');
      e.ligne();
      e.bloc('fun recevoir(contexte: Context, intent: Intent?) {', () => {
        e.ligne('if (intent == null) return');
        e.bloc('intent.getStringExtra("humalis.page")?.let { route ->', () => {
          e.ligne('intent.removeExtra("humalis.page")');
          e.ligne('enAttente = { nav -> allerVers(nav, route) }');
          e.ligne('return');
        });
        const r = receptions.texte().trimEnd();
        if (r) r.split('\n').forEach((l) => e.ligne(l));
      });
      e.ligne();
      e.ligne('/** L\'application passe à l\'arrière-plan : les widgets et la recherche du téléphone reprennent les dernières valeurs. */');
      e.bloc('fun quitter(contexte: Context) {', () => {
        if (quitter.length) e.ligne(`portee.launch { try { ${quitter.join('; ')} } catch (e: Exception) { } }`);
      });
    });
    const corps = [e.texte(), [...lectures].join(''), avecHorsPage ? HORS_PAGE_KT : '', fonctions.texte()].join('');
    ctx.ecrireCode('Formes.kt', kt('les formes de l\'application (raccourcis, partage, fichiers, commandes vocales)', [...IMPORTS_FORMES, ...(f?.widgets.length ? ['androidx.glance.appwidget.updateAll'] : [])], corps));
  }

  sortie.dependances = [...dependances];
  return sortie;
}

/** Ce que LISEZMOI.md dit des formes : la voiture, le clavier, les commandes vocales. */
export function lisezmoiFormes(application: Application): string {
  const f = application.formes;
  const parties: string[] = [];
  if (f?.voitures.length) {
    parties.push(`## Android Auto

L'écran de voiture passe par la Car App Library (catégorie « points d'intérêt »). **Google doit autoriser
l'application** avant qu'elle soit publiée avec Android Auto : la demande se fait dans la Play Console
(« Advanced settings › Form factors › Android Auto »), et la catégorie peut devoir changer selon l'usage.

Pour l'essayer avant : sur le téléphone, ouvrez Android Auto, touchez dix fois « Version » (mode développeur),
puis cochez « Sources inconnues » dans les paramètres pour les développeurs ; ou lancez le Desktop Head Unit du SDK.
`);
  }
  if (f?.claviers.length) parties.push(`## Clavier

Le clavier s'active dans les réglages d'Android : Système › Clavier › Claviers à l'écran.
`);
  if (f?.commandesVocales.length) parties.push(`## Commandes vocales

Les commandes vocales sont des App Actions (res/xml/shortcuts.xml). L'assistant Google ne les reconnaît qu'une
fois l'application publiée sur Google Play ; avant, l'extension « Google Assistant » d'Android Studio sert à les
essayer. L'assistant ne prend pas de réponse à dire : l'application s'ouvre, affiche la phrase et la lit.
`);
  return parties.length ? `\n${parties.join('\n')}` : '';
}
