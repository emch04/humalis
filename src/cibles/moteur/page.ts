/**
 * Un écran de la représentation intermédiaire → une couche du moteur : son
 * HTML de départ, écrit à la compilation, et ses liaisons.
 *
 * Chaque morceau de vue devient un petit arbre (`M`) décrit une seule fois,
 * puis écrit trois fois : en HTML de départ (avec les valeurs de départ), en
 * gabarit (les mêmes éléments, valeurs vides) et en liaisons JavaScript.
 *
 * La logique des événements et des actions vient de la cible statique : ce
 * générateur en hérite, et ne change que la façon de lire et d'écrire une
 * variable (`compteur.v`) et la façon de dessiner.
 */
import { GenerateurPage, type ContexteSite, type Element, type Fonction, type Parametre, COMPOSITES, BALISES_BLOC, estRepliable, attributsRaccourci, alt, texteLitteral, classesDuBloc, contientRequete, arrete, modifiees } from '../statique/page.js';
import { arbreComposite, arbreWidget, initiales, type Attr, type Enfant } from '../statique/widgets.js';
import { iconeHtml, etoilesHtml } from '../statique/html-elements.js';
import { appelGraphique, htmlGraphique } from '../statique/graphique.js';
import { attributs, echapperTexte } from '../statique/html.js';
import { Environnement, conditionJs, contenuJs, evaluer, expressionJs, nomJs, verifier } from '../statique/valeurs.js';
import { Ecrivain } from '../web/ecrivain.js';
import { camel, chaine, pascal } from '../web/noms.js';
import { premiereValeur, titreEtDescription } from '../web/ecran.js';
import { ficheAvec } from '../web/valeurs.js';
import { lireCible } from '../../analyse/navigation.js';
import { lecturesDuChargement } from '../web/lectures.js';
import { attributsFrappe } from '../commun/mouvement.js';
import { colorerCodeHumalis } from '../commun/colorerCode.js';
import { chercherIcone } from '../../vocabulaire/icones.js';
import { messageEnCode, messageEnLangues } from '../../i18n/messages.js';
import { simplifier } from '../../analyse/elements.js';
import type { Action, ComposantHumalis, Ecran, Gestionnaire, NoeudVue, Valeur, ImageRI, ArgumentsPage, Etat } from '../../ri/types.js';

type Liste<T> = T[];

export interface MElement {
  tag: string;
  attrs: [string, Attr][];
  enfants: M[];
  /** Des liaisons de plus ; « @ » y désigne l'élément. */
  liaisons?: string[];
  h?: number;
}
export interface MTexte {
  js: string;
  initial: string;
  h?: number;
  seul?: boolean;
}
export interface MSi {
  si: string;
  /** Pour le gabarit : toutes les branches. */
  branches?: M[][];
  /** Pour le HTML de départ : la branche écrite. */
  choix?: number;
  branche?: M[];
  h?: number;
}
export interface MChaque {
  chaque: string;
  variable: string;
  corps?: M[];
  lignes?: M[][];
  animation?: boolean;
  h?: number;
}
export interface MZone {
  zone: string;
  initial: string;
  h?: number;
}
export type M = MElement | MTexte | MSi | MChaque | MZone | { texte: string } | { brut: string } | { locale: { nom: string; js: string } };

const estElement = (m: M): m is MElement => 'tag' in m;
const ORPHELINS = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source']);

const el = (tag: string, attrs: [string, Attr | undefined][], enfants: M[] = [], liaisons?: string[]): MElement => ({
  tag,
  attrs: attrs.filter((a): a is [string, Attr] => a[1] !== undefined && a[1] !== false),
  enfants,
  ...(liaisons?.length ? { liaisons } : {}),
});

const dynamique = (a: Attr): a is { js: string; initial: string | boolean } => typeof a === 'object';

/** Donne un numéro à chaque endroit à relier de ce niveau ; les blocs ont les leurs. */
function numeroter(liste: M[], compte = { n: 0 }): void {
  for (const m of liste) {
    if (estElement(m)) {
      const seul = m.enfants.length === 1 && 'js' in m.enfants[0] && !('zone' in m.enfants[0]);
      if (seul) (m.enfants[0] as MTexte).seul = true;
      if (seul || m.liaisons?.length || m.attrs.some(([nom, v]) => dynamique(v) || nom.startsWith('on'))) m.h = compte.n++;
      numeroter(m.enfants, compte);
    } else if ('js' in m) {
      if (!m.seul) m.h = compte.n++;
    } else if ('si' in m || 'chaque' in m || 'zone' in m) {
      m.h = compte.n++;
    }
  }
}

function html(liste: M[]): string {
  let sortie = '';
  liste.forEach((m, i) => {
    if ('texte' in m) sortie += echapperTexte(m.texte);
    else if ('brut' in m) sortie += m.brut;
    else if ('locale' in m) return;
    else if ('tag' in m) {
      const att: [string, string | undefined][] = m.attrs
        .filter(([nom]) => !nom.startsWith('on'))
        .map(([nom, v]) => {
          const valeur = dynamique(v) ? v.initial : v;
          return [nom, valeur === false ? undefined : valeur === true ? 'true' : valeur];
        });
      if (m.h !== undefined) att.push(['data-h', String(m.h)]);
      const ouvert = `<${m.tag}${attributs(att)}>`;
      sortie += ORPHELINS.has(m.tag) ? ouvert : `${ouvert}${html(m.enfants)}</${m.tag}>`;
    } else if ('js' in m) {
      if (m.seul) sortie += echapperTexte(m.initial);
      else {
        sortie += `<!--#${m.h}-->${echapperTexte(m.initial)}`;
        const suivant = liste[i + 1];
        if (suivant && 'texte' in suivant) sortie += '<!---->';
      }
    } else if ('si' in m) {
      if (m.branche && m.choix !== undefined && m.choix >= 0) {
        numeroter(m.branche);
        sortie += `<!--[${m.h}:${m.choix}-->${html(m.branche)}<!--]-->`;
      } else sortie += `<!--[${m.h}--><!--]-->`;
    } else if ('chaque' in m) {
      sortie += `<!--[${m.h}-->`;
      for (const ligne of m.lignes ?? []) {
        numeroter(ligne);
        sortie += `<!--,-->${html(ligne)}`;
      }
      sortie += '<!--]-->';
    } else if ('zone' in m) {
      sortie += `<!--[${m.h}-->${m.initial}<!--]-->`;
    }
  });
  return sortie;
}

/** Ce que le moteur ajoute au contexte du site. */
export interface ContexteMoteur extends ContexteSite {
  /** Les modules JavaScript et les composants d'autres frameworks : nom → chemin d'import depuis src/couches. */
  externes: Map<string, { chemin: string; sorte: 'module' | 'react' | 'vue' | 'svelte' | 'web'; balise?: string }>;
  /** Ce que le compilateur a lu sur le serveur : « page:variable » → valeur. */
  donnees?: Map<string, unknown>;
  /** La description du site dans chaque langue, en JavaScript, quand une page n'a pas de texte à elle. */
  descriptionSite?: string;
  /** Les chemins des pages (« /produit/:id »). */
  chemins: Map<string, string>;
  /** Les filtres d'adresse de chaque page : un lien n'est actif que si l'adresse a les mêmes. */
  filtresDesPages: Map<string, string[]>;
}

const ACTIONS_LUES = new Set<Action['type']>(['affectation', 'ajout', 'retrait', 'visibilite', 'changerTexte', 'navigation', 'locale', 'repetition']);

export class GenerateurMoteur extends GenerateurPage {
  /** Les noms qui ne sont pas des boîtes ici : les paramètres et les variables locales d'une fonction. */
  declare private horsBoites?: Set<string>;
  private gabarits: { nom: string; html: string }[] = [];
  private prefixe = '';
  private imports = new Set<string>();

  constructor(ecran: Ecran, private readonly moteur: ContexteMoteur, source: string, parametres?: { nom: string; type: import('../../ri/types.js').TypeValeur }[]) {
    super(ecran, moteur, source, parametres);
    this.contexte.lu = (nom) => this.lu(nom);
    this.contexte.requetes = true;
    for (const [id, variable] of this.contexte.champs) this.contexte.champs.set(id, `${variable}.v`);
    this.prefixe = parametres ? pascal(ecran.nom) : '';
  }

  declare private ordres?: Map<string, string>;

  private ordresDe(): Map<string, string> {
    return (this.ordres ??= new Map());
  }

  /** « l'ordre de taches change » : appelé après chaque déplacement. */
  protected override enregistrer(gestionnaire: Gestionnaire, parametres: Parametre[]): void {
    if (gestionnaire.declencheur !== 'ordre') {
      super.enregistrer(gestionnaire, parametres);
      return;
    }
    this.parcourirActions(gestionnaire.actions);
    const fonction = this.nomUnique(`quandOrdreChange${pascal(gestionnaire.variable ?? '')}`, false);
    this.fonctions.push({ nom: fonction, parametres, actions: gestionnaire.actions });
    this.ordresDe().set(gestionnaire.variable ?? '', fonction);
  }

  private hors(): Set<string> {
    return (this.horsBoites ??= new Set());
  }

  protected override lu(nom: string): string {
    return this.hors().has(nom) ? nomJs(nom) : `${nomJs(nom)}.v`;
  }

  /** La boîte d'un champ : son nom sans « .v ». */
  private boiteDuChamp(id: string): string {
    return this.contexte.champs.get(id)!.replace(/\.v$/, '');
  }

  // ─── Les adresses ───────────────────────────────────────────────────────

  protected override fichier(nom: string): string {
    return this.moteur.chemins.get(nom) ?? `/${simplifier(nom)}`;
  }

  protected override adresseAvec(page: string, args: ArgumentsPage): string {
    let chemin = this.fichier(page).replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    const requete: string[] = [];
    for (const a of args) {
      const nom = camel(a.nom);
      const valeur = `\${encodeURIComponent(String(${expressionJs(a.valeur, this.contexte)}))}`;
      if (chemin.includes(`:${nom}`)) chemin = chemin.replace(`:${nom}`, valeur);
      else requete.push(`${a.nom}=${valeur}`);
    }
    return `\`${chemin}${requete.length ? `?${requete.join('&')}` : ''}\``;
  }

  /** Une adresse à trous (« https://wa.me/…?text={message} ») : après « ? » ou « # », les valeurs sont encodées. */
  private adresseEncodee(valeur: Valeur): string {
    if (valeur.type !== 'texte' || valeur.versions || valeur.parties.every((p) => 'texte' in p)) return expressionJs(valeur, this.contexte);
    let requete = false;
    const morceaux = valeur.parties.map((p) => {
      if ('texte' in p) {
        if (/[?#]/.test(p.texte)) requete = true;
        return p.texte.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\n/g, '%0A');
      }
      const lu = expressionJs({ type: 'texte', parties: [p] }, this.contexte);
      return requete ? `\${encodeURIComponent(${lu})}` : `\${${lu}}`;
    });
    return `\`${morceaux.join('')}\``;
  }

  /** Une adresse qui commence par une variable : seuls les schémas sûrs passent, jamais « javascript: ». */
  private adresseDeLien(valeur: Valeur): string {
    const adresse = this.adresseEncodee(valeur);
    const premiere = valeur.type === 'texte' ? valeur.parties[0] : undefined;
    return premiere && 'variable' in premiere ? `((adresse) => (/^(https?:|mailto:|tel:|\\/)/i.test(adresse) ? adresse : '#'))(${adresse})` : adresse;
  }

  private adresseInitiale(page: string, args: ArgumentsPage, env: Environnement): string {
    let chemin = this.fichier(page);
    const requete: string[] = [];
    for (const a of args) {
      const nom = camel(a.nom);
      const valeur = encodeURIComponent(String(evaluer(a.valeur, env)));
      if (chemin.includes(`:${nom}`)) chemin = chemin.replace(`:${nom}`, valeur);
      else requete.push(`${a.nom}=${valeur}`);
    }
    return chemin + (requete.length ? `?${requete.join('&')}` : '');
  }

  // ─── Les actions ────────────────────────────────────────────────────────

  protected override ecrireFonction(e: Ecrivain, fonction: Fonction): void {
    this.avecHors(fonction.parametres.map((p) => p.nom), () => super.ecrireFonction(e, fonction));
  }

  private avecHors(noms: string[], f: () => void): void {
    const avant = new Set(this.hors());
    for (const n of noms) this.hors().add(n);
    f();
    this.horsBoites = avant;
  }

  override fonctionGlobale(f: import('../../ri/types.js').FonctionRI): string {
    let code = '';
    this.avecHors(f.parametres.map((p) => p.nom), () => {
      code = super.fonctionGlobale(f);
    });
    return `export ${code}`;
  }

  protected override ecrireActions(e: Ecrivain, actions: Action[], locales: Set<string>, modif: Set<string>): void {
    const x = (v: Valeur) => expressionJs(v, this.contexte);
    for (const action of actions) {
      if (!ACTIONS_LUES.has(action.type) && this.actionEnPlus(e, action, locales, modif)) continue;
      switch (action.type) {
        case 'affectation':
          e.ligne(`${this.lu(action.nom)} = ${action.champs ? ficheAvec(this.lu(action.nom), action.champs, x(action.valeur)) : x(action.valeur)};`);
          break;
        case 'ajout':
          e.ligne(`${this.lu(action.liste)} = [...${this.lu(action.liste)}, ${x(action.valeur)}];`);
          break;
        case 'retrait':
          e.ligne(`${this.lu(action.liste)} = retirerPremier(${this.lu(action.liste)}, ${x(action.valeur)});`);
          break;
        case 'visibilite':
          for (const id of action.ids) e.ligne(`visibilite.v = { ...visibilite.v, ${chaine(id)}: ${action.visible} };`);
          break;
        case 'viderChamp':
          e.ligne(`${this.contexte.champs.get(action.id)!} = ${this.contexte.sortes?.get(action.id) === 'case' ? 'false' : "''"};`);
          break;
        case 'changerTexte':
          for (const id of action.ids) e.ligne(`textes.v = { ...textes.v, ${chaine(id)}: ${x(action.texte)} };`);
          break;
        case 'navigation': {
          const page = texteLitteral(action.ecran);
          if (page === undefined) {
            // Une adresse reçue : une page, ou une adresse permise ; naviguer refuse le reste avec un message.
            const ecrite = action.ecran.type === 'texte' && action.ecran.parties[0] && 'texte' in action.ecran.parties[0] && lireCible(action.ecran.parties[0].texte).externe;
            e.ligne(`naviguer(String(${ecrite ? this.adresseEncodee(action.ecran) : x(action.ecran)}));`);
            break;
          }
          const lue = lireCible(page);
          if (lue.externe) {
            e.ligne(`naviguer(${chaine(page)});`);
            break;
          }
          const ancre = lue.ancre ? `#${lue.ancre}` : '';
          const vers = action.arguments && lue.page ? this.adresseAvec(lue.page, action.arguments) : chaine(this.fichier(lue.page ?? page) + ancre);
          e.ligne(`naviguer(${action.continuer ? `apresLaGarde() ?? ${vers}` : vers});`);
          break;
        }
        case 'locale':
          this.hors().add(action.nom);
          super.ecrireActions(e, [action], locales, modif);
          break;
        case 'repetition':
          this.hors().add(action.variable);
          super.ecrireActions(e, [action], locales, modif);
          break;
        default:
          super.ecrireActions(e, [action], locales, modif);
      }
    }
  }

  /** Ce qu'il faut pour réécrire une variable après un échec (« optimiste ») ; annulé après la première requête. */
  private optimiste?: { avant: string; echecs: string; variables: string[] };
  private essai?: string;
  private dansEssai = false;
  private compteurs = { chargeurs: 0, essais: 0, optimistes: 0 };

  /** La variable d'une réponse : une réponse lente ne remplace pas une plus récente, dans un événement. */
  private reponse(e: Ecrivain, variable: string, appel: string): void {
    if (!this.dansEvenement) {
      e.ligne(`${this.lu(variable)} = ${appel};`);
      return;
    }
    const n = ++this.dernieres;
    e.ligne(`const $derniere${n} = derniereRequete(${chaine(variable)});`);
    e.ligne(`const $reponse${n} = ${appel};`);
    e.ligne(`if (!$derniere${n}()) return;`);
    e.ligne(`${this.lu(variable)} = $reponse${n};`);
  }

  /** Après un appel au serveur : un échec arrête « essayer », ou la soumission d'un formulaire. */
  private apresAppel(e: Ecrivain, envoi: boolean): void {
    const opt = this.optimiste;
    if (this.essai) e.ligne(`if (serveur.echecs() > ${this.essai}) return serveur.raison();`);
    else if (this.echecs && envoi && !opt) e.ligne(`if (serveur.echecs() > ${this.echecs}) return;`);
    if (opt) {
      e.bloc(`if (serveur.echecs() > ${opt.echecs}) {`, () => {
        for (const nom of opt.variables) e.ligne(`${this.lu(nom)} = ${opt.avant}.${camel(nom)};`);
        e.ligne(`afficherMessage("L'action n'a pas été prise en compte : on a remis les choses comme avant.", 'erreur');`);
        e.ligne('return;');
      });
      this.optimiste = undefined;
    }
  }

  /** Les actions propres au moteur : rend vrai si l'action est écrite ici. */
  protected actionEnPlus(e: Ecrivain, action: Action, locales: Set<string>, modif: Set<string>): boolean {
    const x = (v: Valeur) => expressionJs(v, this.contexte);
    const lit = (v: Valeur) => `String(${x(v)})`;
    switch (action.type) {
      case 'optimiste': {
        const n = ++this.compteurs.optimistes;
        const avant = `$avant${n}`;
        const echecs = `$echecsOptimiste${n}`;
        e.ligne(`const ${avant} = structuredClone({ ${action.variables.map((nom) => `${camel(nom)}: ${this.lu(nom)}`).join(', ')} });`);
        e.ligne(`const ${echecs} = serveur.echecs();`);
        this.ecrireActions(e, action.corps, locales, modif);
        this.optimiste = { avant, echecs, variables: action.variables };
        return true;
      }
      case 'requete': {
        if (action.enAttente) {
          e.ligne(`await appareil.envoyerHorsLigne('POST', ${chaine(action.adresse)}, ${this.donnees(action.donnees, action.cles)});`);
          return true;
        }
        // « calcul … = photos dont produit est egal a id » : seulement les photos de ce produit.
        const filtre = action.mode === 'lire' && action.source === undefined && action.resultat !== undefined ? lecturesDuChargement(this.ecran).find((l) => l.variable === action.resultat)?.filtre : undefined;
        const args = [filtre ? `\`${action.adresse}?${encodeURIComponent(filtre.champ)}=\${encodeURIComponent(${this.lu(filtre.parametre)})}\`` : chaine(action.adresse)];
        if (action.mode === 'envoyer') args.push(this.donnees(action.donnees, action.cles));
        if (action.mode === 'lireUn') args.push(x(action.donnees[0]));
        if (action.resultat !== undefined) args.push(this.lu(action.resultat));
        else if (action.source !== undefined) args.push('undefined');
        const suivie = action.resultat !== undefined && (this.ecran.etatsRequetes?.includes(action.resultat) ?? false);
        const lecture = (action.source !== undefined && action.mode !== 'envoyer') || action.direct === true;
        if (action.source !== undefined) {
          const filtres = (action.filtrant ?? []).map((f) => `${/^[A-Za-z_]\w*$/.test(f.cle) ? f.cle : chaine(f.cle)}: ${x(f.valeur)}`);
          const n = this.compteurs.chargeurs + 1;
          const options = [
            `source: ${chaine(action.source)}`,
            ...(filtres.length > 0 ? [`filtres: { ${filtres.join(', ')} }`] : []),
            ...(action.dans !== undefined ? [`dans: ${chaine(action.dans)}`] : []),
            ...(lecture && action.resultat !== undefined ? ['contourner', `relancer: () => $charger${n}(true)`] : []),
            ...(suivie ? [`suivi: (etat) => { ${camel(action.resultat!)}Req.v = etat; }`, 'silencieux: true'] : []),
          ];
          args.push(`{ ${options.join(', ')} }`);
        }
        if (action.resultat !== undefined) {
          const appel = `await serveur.${action.mode}(${args.join(', ')})`;
          if (lecture) {
            const n = ++this.compteurs.chargeurs;
            e.bloc(`const $charger${n} = async (contourner = false) => {`, () => this.reponse(e, action.resultat!, appel), '};');
            if (suivie) e.ligne(`relances.${camel(action.resultat)} = $charger${n};`);
            e.ligne(`await $charger${n}();`);
            if (action.direct) e.ligne(`enDirect(${chaine(action.adresse)}, () => $charger${n}(true));`);
          } else this.reponse(e, action.resultat, appel);
        } else e.ligne(`await serveur.${action.mode}(${args.join(', ')});`);
        this.apresAppel(e, action.mode === 'envoyer');
        return true;
      }
      case 'suppression':
      case 'modification':
      case 'telechargementBon': {
        if (action.type !== 'telechargementBon' && action.enAttente) {
          const fiche = `${chaine(action.adresse + '/')} + encodeURIComponent(String(${x(action.objet)}.id))`;
          e.ligne(action.type === 'suppression' ? `await appareil.envoyerHorsLigne('DELETE', ${fiche});` : `await appareil.envoyerHorsLigne('PATCH', ${fiche}, { ${action.changements.map((c) => `${camel(c.champ)}: ${x(c.valeur)}`).join(', ')} });`);
          return true;
        }
        const source = action.type !== 'telechargementBon' && action.source !== undefined ? `, { source: ${chaine(action.source)}${action.type === 'modification' && action.remplacement ? ', remplacement: true' : ''} }` : '';
        const appel =
          action.type === 'telechargementBon'
            ? `await serveur.telecharger(${chaine(action.adresse)}, ${x(action.objet)}.id);`
            : action.type === 'suppression'
              ? `await serveur.supprimer(${chaine(action.adresse)}, ${x(action.objet)}.id${source});`
              : `await serveur.modifier(${chaine(action.adresse)}, ${x(action.objet)}.id, { ${action.changements.map((c) => `${camel(c.champ)}: ${x(c.valeur)}`).join(', ')} }${source});`;
        const facultatif = action.objet.type === 'variable' && this.contexte.facultatives?.has(action.objet.nom);
        if (facultatif) e.bloc(`if (${x(action.objet)} !== null) {`, () => e.ligne(appel));
        else e.ligne(appel);
        this.apresAppel(e, true);
        return true;
      }
      case 'recharger':
        e.ligne(`await relances.${camel(action.variable)}?.();`);
        return true;
      case 'envoiFichier': {
        const suivie = action.resultat !== undefined && (this.ecran.etatsRequetes?.includes(action.resultat) ?? false);
        const options = [
          `source: ${chaine(action.source)}`,
          action.corpsBrut ? 'corpsBrut: true' : `champ: ${chaine(action.champ)}`,
          ...(action.suivi !== undefined ? [`progression: (valeur) => { ${this.lu(action.suivi)} = valeur; }`] : []),
          ...(suivie ? [`suivi: (etat) => { ${camel(action.resultat!)}Req.v = etat; }`, 'silencieux: true'] : ['message: afficherMessage']),
        ];
        const appel = `await televerser(${this.lu(action.variable)}, ${chaine(action.adresse)}, { ${options.join(', ')} }, ${action.resultat !== undefined ? this.lu(action.resultat) : 'null'})`;
        if (action.resultat !== undefined) e.ligne(`${this.lu(action.resultat)} = ${appel};`);
        else e.ligne(`${appel};`);
        return true;
      }
      case 'connexion': {
        const champ = action.motDePasse.type === 'champ' ? this.contexte.champs.get(action.motDePasse.id) : undefined;
        let motDePasse = x(action.motDePasse);
        if (champ) {
          e.ligne(`const motDePasseSaisi = ${champ};`);
          e.ligne(`${champ} = '';`);
          motDePasse = 'motDePasseSaisi';
        }
        e.ligne(`if (!(await utilisateur.seConnecter(${x(action.email)}, ${motDePasse}${this.dansEssai ? ', true' : ''}))) return;`);
        return true;
      }
      case 'connexionGoogle':
        e.ligne(`if (!(await utilisateur.seConnecterAvecGoogle(${this.dansEssai ? 'true' : ''}))) return;`);
        return true;
      case 'connexionApple':
        e.ligne(`if (!(await utilisateur.seConnecterAvecApple(${this.dansEssai ? 'true' : ''}))) return;`);
        return true;
      case 'changementMotDePasse':
        e.ligne(`if (!(await utilisateur.changerMotDePasse(${lit(action.actuel)}, ${lit(action.nouveau)}${this.dansEssai ? ', true' : ''}))) return;`);
        return true;
      case 'invitation':
        e.ligne(`if (!(await utilisateur.inviter(${lit(action.email)}, '${action.role}'${action.groupe || action.champs ? `, ${this.dansEssai}, ${action.groupe ? `{ ${JSON.stringify(camel(action.groupe.champ))}: String(${x(action.groupe.valeur)}) }` : 'undefined'}${action.champs ? `, { ${action.champs.map((c) => `${JSON.stringify(camel(c.champ))}: ${x(c.valeur)}`).join(', ')} }` : ''}` : this.dansEssai ? ', true' : ''}))) return;`);
        return true;
      case 'paiement':
        e.ligne(`if (!(await utilisateur.payer(${chaine(action.adresse)}, ${x(action.objet)}.id, ${this.dansEssai}))) return;`);
        return true;
      case 'prisePhoto':
        e.bloc('{', () => {
          e.ligne('const $resultat = await appareil.prendrePhoto();');
          e.ligne(`if ($resultat) ${this.lu(action.variable)} = $resultat;`);
        }, '}');
        return true;
      case 'scanCode':
        e.bloc('{', () => {
          e.ligne('const $resultat = await appareil.scannerCode();');
          e.ligne(`if ($resultat !== null) ${this.lu(action.variable)} = $resultat;`);
        }, '}');
        return true;
      case 'localisation':
        e.bloc('{', () => {
          e.ligne('const $resultat = await appareil.position();');
          e.ligne(`if ($resultat) ${this.lu(action.variable)} = $resultat;`);
        }, '}');
        return true;
      case 'vibration':
        e.ligne('appareil.vibrer();');
        return true;
      case 'verificationIdentite':
        e.bloc('if (await appareil.verifierIdentite()) {', () => this.ecrireActions(e, action.alors, locales, modif), action.sinon.length > 0 ? '} else {' : '}');
        if (action.sinon.length > 0) e.bloc('', () => this.ecrireActions(e, action.sinon, locales, modif), '}');
        return true;
      case 'demandeIa':
        e.ligne(`if (!(await utilisateur.demanderIa(${lit(action.question)}, (texte) => { ${this.lu(action.variable)} = texte; }, ${this.dansEssai}))) return;`);
        return true;
      case 'activationNotifications':
        e.ligne(`if (!(await utilisateur.activerNotifications(${this.dansEssai}))) return;`);
        return true;
      case 'changementCompte':
        e.ligne(`if (!(await utilisateur.changerCompte(String(${x(action.cible)}?.id ?? ${x(action.cible)}), { ${action.champs.map((c) => `${JSON.stringify(camel(c.champ))}: ${x(c.valeur)}`).join(', ')} }, ${this.dansEssai}))) return;`);
        return true;
      case 'changementRole':
        e.ligne(`if (!(await utilisateur.changerRole(String(${x(action.cible)}?.id ?? ${x(action.cible)}), ${lit(action.role)}, ${this.dansEssai}))) return;`);
        return true;
      case 'demandeLienMotDePasse':
        e.ligne(`if (!(await utilisateur.demanderLienMotDePasse(${lit(action.email)}${this.dansEssai ? ', true' : ''}))) return;`);
        return true;
      case 'choixMotDePasse':
        e.ligne(`if (!(await utilisateur.choisirMotDePasse(${lit(action.nouveau)}${this.dansEssai ? ', true' : ''}))) return;`);
        return true;
      case 'deconnexion':
        e.ligne('await utilisateur.seDeconnecter();');
        return true;
      case 'filtre':
        e.ligne(`changerFiltre(${chaine(action.nom)}, ${x(action.valeur)});`);
        return true;
      case 'retour':
        e.ligne(`revenir(${action.vers !== undefined ? chaine(this.fichier(action.vers)) : ''});`);
        return true;
      case 'essayer': {
        const n = ++this.compteurs.essais;
        const echecs = `$echecsEssai${n}`;
        const raison = `$raison${n}`;
        const requetes = JSON.stringify(action.corps).match(/"type":"(requete|suppression|modification|envoiFichier)"/) !== null;
        if (requetes) {
          e.ligne(`const ${echecs} = serveur.echecs();`);
          e.ligne('serveur.taire(true);');
        }
        e.ligne(`let ${raison};`);
        e.ligne('try {');
        e.indenter(() => e.bloc(`${raison} = await (async () => {`, () => {
          const avant = this.essai;
          const dansAvant = this.dansEssai;
          if (requetes) this.essai = echecs;
          this.dansEssai = true;
          this.ecrireActions(e, action.corps, locales, modif);
          this.essai = avant;
          this.dansEssai = dansAvant;
          e.ligne('return undefined;');
        }, '})();'));
        e.ligne('} catch (erreur) {');
        e.indenter(() => e.ligne(`${raison} = erreur instanceof Error ? erreur.message : String(erreur);`));
        if (requetes) {
          e.ligne('} finally {');
          e.indenter(() => e.ligne('serveur.taire(false);'));
        }
        e.ligne('}');
        if (action.siErreur.length) {
          e.bloc(`if (${raison} !== undefined) {`, () => {
            e.ligne(`const raison = ${raison};`);
            this.avecHors(['raison'], () => this.ecrireActions(e, action.siErreur, new Set([...locales, 'raison']), modif));
          });
        }
        return true;
      }
      default:
        return false;
    }
  }

  // ─── La couche ──────────────────────────────────────────────────────────

  private nomGabarit(contenu: string): string {
    const trouve = this.gabarits.find((g) => g.html === contenu);
    if (trouve) return trouve.nom;
    const nom = `$g${this.prefixe}${this.gabarits.length + 1}`;
    this.gabarits.push({ nom, html: contenu });
    return nom;
  }

  private ecrireEtatMoteur(e: Ecrivain): void {
    const adresse = this.ecran.parametresAdresse ?? [];
    for (const p of adresse) e.ligne(`const ${nomJs(p)} = signal(adresse.parametres[${chaine(camel(p))}] ?? '');`);
    for (const f of this.ecran.filtres ?? []) e.ligne(`const ${nomJs(f.nom)} = filtre(${chaine(f.nom)}, ${f.nombre ? 'true' : 'false'});`);
    for (const etat of this.ecran.etat) {
      const initiale = expressionJs(etat.initiale, this.contexte);
      const cle = `${this.ecran.nom}:${etat.nom}`;
      e.ligne(`const ${nomJs(etat.nom)} = signal(${this.moteur.donnees?.has(cle) ? `adresse.donnees[${chaine(cle)}] ?? ${initiale}` : initiale});`);
    }
    for (const [id, variable] of this.contexte.champs) {
      e.ligne(`const ${variable.replace(/\.v$/, '')} = signal(${this.contexte.sortes?.get(id) === 'case' ? 'false' : "''"});`);
    }
    const visibles = [...new Set([...this.montres, ...this.caches, ...this.fenetres])];
    if (visibles.length > 0) e.ligne(`const visibilite = signal({ ${visibles.map((id) => `${chaine(id)}: ${!this.montres.has(id) && !this.fenetres.has(id)}`).join(', ')} });`);
    if (this.textesChanges.size > 0) e.ligne('const textes = signal({});');
    const suivies = this.ecran.etatsRequetes ?? [];
    for (const nom of suivies) e.ligne(`const ${camel(nom)}Req = signal(REPOS);`);
    if (suivies.length > 0) e.ligne('const relances = {};');
  }

  protected override ecrireCalcul(e: Ecrivain, nom: string, valeur: Valeur): void {
    e.ligne(`const ${nomJs(nom)} = calcul(() => ${expressionJs(valeur, this.contexte)});`);
  }

  /** Les variables « memorisee » de la page. */
  private ecrireMemoireMoteur(e: Ecrivain): string[] {
    const gardees = this.ecran.etat.filter((etat: Etat) => etat.memorisee || etat.horsLigne);
    // Une page déjà vue s'affiche tout de suite avec sa dernière réponse, puis relit le serveur.
    const lectures = lecturesDuChargement(this.ecran).map((l) => ({
      variable: l.variable,
      code: (this.ecran.parametresAdresse ?? []).concat((this.ecran.filtres ?? []).map((f) => f.nom)).reduce((c, p) => c.replace(new RegExp(`encodeURIComponent\\(${camel(p)}\\)`, 'g'), `encodeURIComponent(${this.lu(p)})`), l.code),
    }));
    if (gardees.length === 0 && lectures.length === 0) return [];
    const cle = (etat: Etat) => chaine(`${etat.horsLigne ? 'humalis-hors-ligne:' : ''}${this.site.cle}:${simplifier(this.ecran.nom)}:${simplifier(etat.nom)}`);
    e.bloc('function relire() {', () => {
      for (const l of lectures) e.ligne(`${this.lu(l.variable)} = lectureGardee(${l.code}, ${nomJs(l.variable)}.x);`);
      for (const etat of gardees) e.ligne(`${nomJs(etat.nom)}.v = lireMemoire(${cle(etat)}, ${nomJs(etat.nom)}.x);`);
      for (const etat of gardees) e.ligne(`effet(() => garderMemoire(${cle(etat)}, ${nomJs(etat.nom)}.v));`);
    });
    return ['relire'];
  }

  /** Les valeurs de départ, avec ce que le compilateur a lu sur le serveur. */
  protected override environnement(): Environnement {
    const env = super.environnement();
    for (const e of this.ecran.etat) {
      const cle = `${this.ecran.nom}:${e.nom}`;
      if (this.moteur.donnees?.has(cle)) env.definir(e.nom, this.moteur.donnees.get(cle));
    }
    return env;
  }

  /** Le script de la couche : une fois par écran. */
  scriptCouche(): { script: string; session: boolean; serveur: boolean } {
    const corps = new Ecrivain();
    const options: string[] = [];
    corps.indenter(() => {
      this.ecrireEtatMoteur(corps);
      for (const calcul of this.ecran.calculs) this.ecrireCalcul(corps, calcul.nom, calcul.valeur);
      for (const fonction of this.fonctions) this.ecrireFonction(corps, fonction);
      if (this.chargements.length > 0) {
        const asynchrone = contientRequete(this.chargements) ? 'async ' : '';
        corps.bloc(`${asynchrone}function auChargement() {`, () => this.avecHors([], () => this.ecrireActions(corps, this.chargements, new Set(), modifiees(this.chargements))));
        options.push('auChargement');
      }
      if (this.minuteries.length > 0) this.ecrireMinuteries(corps, options);
      if (this.raccourcis.length > 0) {
        corps.bloc('const raccourcis = [', () => this.raccourcis.forEach((r) => corps.ligne(`${r},`)), '];');
        options.push('raccourcis');
      }
      options.push(...this.ecrireMemoireMoteur(corps));
      const arbre = this.groupe(this.ecran.vue, null);
      numeroter(arbre);
      this.liaisons(arbre, corps);
      // La description de la page suit la langue, comme son titre.
      const description = this.site.langues ? premiereValeur('texte', this.ecran.vue, this.site.langues) : undefined;
      const enLangues = description?.type === 'texte' && description.versions ? expressionJs(description, this.contexte) : !this.parametres && this.ecran.vue.length > 0 ? this.moteur.descriptionSite : undefined;
      if (enLangues) corps.ligne(`descriptionDeLaPage(() => ${enLangues});`);
      corps.ligne(`return { ${options.join(', ')} };`);
    });
    const code = this.avecPlanificateur(corps.texte());
    const session = /\butilisateur\.\w+/.test(code);
    return {
      script: `${/\bappareil\.\w+\(/.test(code) ? "import { appareil } from '../humalis/appareil.js';\n" : ''}${this.entete(code)}

export default function couche(r, adresse) {
${code}}
`,
      session,
      serveur: this.besoins.serveur,
    };
  }

  /** Une minuterie lancée par un événement appartient à sa couche, ou à son composant. */
  private avecPlanificateur(code: string): string {
    const direct = /\benDirect\(/.test(code) ? '  const enDirect = directDeCouche();\n' : '';
    return direct + (/\bplanifier\(/.test(code) ? `  const planifier = planificateur();\n${code}` : code);
  }

  /** Le HTML de départ de la couche, avec celui de sa sous-couche. */
  htmlDepart(sous?: string): string {
    this.sousPageDepart = sous;
    const depart = this.groupe(this.ecran.vue, this.environnement());
    numeroter(depart);
    return html(depart);
  }

  titres(langue?: string): { titre: string; description: string } {
    return titreEtDescription(this.ecran, this.site.langues, langue);
  }

  /** Le début du fichier : ce qu'il importe, et ses gabarits. */
  private entete(code: string, chemin = '../humalis'): string {
    return `// Produit par Humalis depuis ${this.source || this.ecran.nom} : « ${this.ecran.nom} ».
${importsDe(code, chemin, this.moteur, this.site.partages.map((p) => nomJs(p.nom)))}
${this.gabarits.map((g) => `const ${g.nom} = /*#__PURE__*/ gabarit(${chaine(g.html)});`).join('\n')}`;
  }

  private ecrireMinuteries(e: Ecrivain, options: string[]): void {
    e.bloc('const minuteries = [', () => {
      for (const m of this.minuteries) {
        e.bloc('{', () => {
          this.dansMinuterie = true;
          e.bloc(`${contientRequete(m.corps) ? 'async ' : ''}faire(${arrete(m.corps) ? 'arreter' : ''}) {`, () => this.ecrireActions(e, m.corps, new Set(), modifiees(m.corps)), '},');
          this.dansMinuterie = false;
          e.ligne(`millisecondes: () => ${expressionJs(m.millisecondes, this.contexte)},`);
          if (m.mode === 'toutes') e.ligne('repete: true,');
          if (m.tantQue) e.ligne(`actif: () => ${conditionJs(m.tantQue, this.contexte)},`);
        }, '},');
      }
    }, '];');
    options.push('minuteries');
  }

  // ─── Un composant écrit en Humalis ──────────────────────────────────────

  /** `export function Carte(r, { titre }) { … }`, et son gabarit. */
  composantMoteur(): { code: string; gabarit: string } {
    const parametres = (this.parametres ?? []).map((p) => nomJs(p.nom)).join(', ');
    const corps = new Ecrivain();
    corps.indenter(() => {
      this.ecrireEtatMoteur(corps);
      for (const calcul of this.ecran.calculs) this.ecrireCalcul(corps, calcul.nom, calcul.valeur);
      for (const fonction of this.fonctions) this.ecrireFonction(corps, fonction);
      const options: string[] = [];
      if (this.minuteries.length > 0) this.ecrireMinuteries(corps, options);
      if (options.length > 0) corps.ligne('minuteriesDeCouche(minuteries);');
      if (this.raccourcis.length > 0) corps.bloc('ecouterRaccourcis([', () => this.raccourcis.forEach((r) => corps.ligne(`${r},`)), ']);');
      const memoire = this.ecrireMemoireMoteur(corps);
      const arbre = this.groupe(this.ecran.vue, null);
      numeroter(arbre);
      this.liaisons(arbre, corps);
      if (memoire.length > 0) corps.ligne('relire();');
      if (this.chargements.length > 0) {
        corps.bloc('executer(async () => {', () => this.avecHors([], () => this.ecrireActions(corps, this.chargements, new Set(), modifiees(this.chargements))), '});');
      }
    });
    const arbre = this.groupe(this.ecran.vue, null);
    numeroter(arbre);
    const nom = pascal(this.ecran.nom);
    return {
      gabarit: html(arbre),
      code: `${this.gabarits.map((g) => `const ${g.nom} = /*#__PURE__*/ gabarit(${chaine(g.html)});`).join('\n')}
export const $g${nom} = /*#__PURE__*/ gabarit(${chaine(html(arbre))});
export function ${nom}(r${parametres ? `, { ${parametres} }` : ''}) {
${this.avecPlanificateur(corps.texte())}}
`,
    };
  }

  /** Le HTML de départ d'un composant, avec ses propriétés. */
  departComposant(proprietes: Map<string, unknown>): string {
    const env = new Environnement(this.contexte.types);
    if (this.site.langues) env.definir('langue', this.site.langues[0].code);
    for (const p of this.site.partages) env.definir(p.nom, evaluer(p.initiale, env));
    for (const p of this.parametres ?? []) env.definir(p.nom, proprietes.get(p.nom));
    for (const e of this.ecran.etat) env.definir(e.nom, evaluer(e.initiale, env));
    for (const c of this.ecran.calculs) env.definirCalcul(c.nom, c.valeur);
    const depart = this.groupe(this.ecran.vue, env);
    numeroter(depart);
    return html(depart);
  }

  /** Une valeur, en JavaScript. */
  expression(valeur: Valeur): string {
    return expressionJs(valeur, this.contexte);
  }

  /** Un fichier fonctions.js ou composants.js : seulement ses imports. */
  importsDuFichier(code: string): string {
    return importsDe(code, '.', this.moteur, this.site.partages.map((p) => nomJs(p.nom)));
  }

  // ─── La vue en arbre ────────────────────────────────────────────────────

  private groupe(noeuds: NoeudVue[], env: Environnement | null): M[] {
    const dedans = env?.enfant() ?? null;
    const sortie: M[] = [];
    for (const l of noeuds) {
      if (l.type !== 'locale') continue;
      if (dedans) dedans.definir(l.nom, evaluer(l.valeur, dedans));
      sortie.push({ locale: { nom: nomJs(l.nom), js: `lecture(() => ${expressionJs(l.valeur, this.contexte)})` } });
    }
    for (const n of noeuds) this.noeudM(n, dedans, sortie);
    return sortie;
  }

  /** Les valeurs de départ, ou rien pour un gabarit. */
  private txt(v: Valeur, env: Environnement | null): string {
    return env ? this.texteInitial(v, env) : '';
  }

  private dyn(v: Valeur, env: Environnement | null): { js: string; initial: string } {
    return { js: contenuJs(v, this.contexte), initial: this.txt(v, env) };
  }

  /** Une expression qu'on écrit dans un attribut, avec sa valeur de départ. */
  private attr(v: Valeur, env: Environnement | null): Attr {
    const fixe = texteLitteral(v);
    if (fixe !== undefined) return fixe;
    return { js: expressionJs(v, this.contexte), initial: env ? String(this.initial(v, env) ?? '') : false };
  }

  private enVisibilite(id: string, m: M[], env: Environnement | null, sortie: M[]): void {
    if (!this.montres.has(id) && !this.caches.has(id)) {
      sortie.push(...m);
      return;
    }
    const js = `visibilite.v[${chaine(id)}] ? 0 : -1`;
    if (!env) sortie.push({ si: js, branches: [m] });
    else {
      const visible = !this.montres.has(id);
      sortie.push(visible ? { si: js, choix: 0, branche: m } : { si: js, choix: -1 });
    }
  }

  private noeudM(noeud: NoeudVue, env: Environnement | null, sortie: M[]): void {
    switch (noeud.type) {
      case 'element':
        this.enVisibilite(noeud.id, [this.elementM(noeud, env)], env, sortie);
        break;
      case 'condition': {
        const js = `${conditionJs(noeud.test, this.contexte)} ? 0 : ${noeud.sinon.length > 0 ? 1 : -1}`;
        if (!env) sortie.push({ si: js, branches: [this.groupe(noeud.alors, null), this.groupe(noeud.sinon, null)] });
        else {
          const vrai = verifier(noeud.test, env, this.contexte.champs);
          const choix = vrai ? 0 : noeud.sinon.length > 0 ? 1 : -1;
          sortie.push({ si: js, choix, ...(choix >= 0 ? { branche: this.groupe(vrai ? noeud.alors : noeud.sinon, env) } : {}) });
        }
        break;
      }
      case 'repetition':
        if (noeud.deplacement && noeud.liste.type === 'variable') {
          const surOrdre = this.ordresDe().get(noeud.liste.nom);
          const lignes: MChaque = { ...this.chaqueM(noeud.liste, noeud.variable, (dedans) => [el('div', [['role', 'listitem'], ['data-deplacable', 'true']], this.groupe(noeud.corps, dedans))], env), ...(noeud.animation ? { animation: true } : {}) };
          sortie.push(el('div', [['role', 'list'], ['class', 'humalis-liste-deplacable']], [lignes], [`listeDeplacable(@, ${nomJs(noeud.liste.nom)}${surOrdre ? `, ${surOrdre}` : ''});`]));
          break;
        }
        sortie.push({ ...this.chaqueM(noeud.liste, noeud.variable, (dedans) => this.groupe(noeud.corps, dedans), env), ...(noeud.animation ? { animation: true } : {}) });
        break;
      case 'widget':
        if (noeud.genre === 'fichier') {
          const f = noeud.fichier!;
          const icone = noeud.reglages.icone ? chercherIcone(noeud.reglages.icone)?.lucide : undefined;
          const reglages = [
            `libelle: () => ${contenuJs(noeud.contenu, this.contexte)}`,
            `boite: ${nomJs(f.variable)}`,
            `familles: ${JSON.stringify(f.familles)}`,
            ...(f.octets !== undefined ? [`maximum: ${f.octets}`] : []),
            ...(f.plusieurs ? ['plusieurs: true'] : []),
            `apercu: ${f.apercu}`,
            ...(icone ? [`iconeHtml: ${chaine(iconeHtml(icone, 'humalis-icone'))}`] : []),
            `classes: ${chaine(['humalis-fichier', ...noeud.options.map((o) => `humalis-${o.nom}-${o.valeur}`), ...noeud.classes].join(' '))}`,
          ];
          sortie.push(el('div', [], [], [`choixFichier(@, { ${reglages.join(', ')} });`]));
          break;
        }
        sortie.push(...this.enfantM(arbreWidget(noeud.genre, this.aideMoteur(noeud, env)), env));
        break;
      case 'carte': {
        const e = new Ecrivain();
        // Dans la carte, les boucles sont de vraies boucles JavaScript : leurs variables ne sont pas des boîtes.
        const variables = (liste: NoeudVue[]): string[] => liste.flatMap((n) => (n.type === 'repetition' ? [n.variable, ...variables(n.corps)] : n.type === 'condition' ? [...variables(n.alors), ...variables(n.sinon)] : []));
        this.avecHors(variables(noeud.corps), () => this.carteJs(e, noeud));
        const lignes: string[] = [];
        if (env) this.carteHtml(noeud, env, lignes);
        sortie.push({ zone: `[${e.texte().trim().replace(/,$/, '')}]`, initial: lignes.join('') });
        break;
      }
      case 'marqueur':
      case 'locale':
        break;
      case 'fenetre': {
        const fermer = `() => { visibilite.v = { ...visibilite.v, ${chaine(noeud.id)}: false }; }`;
        const contenu: M[] = [
          el('h2', [['id', `${noeud.id}-titre`]], [{ texte: noeud.titre }]),
          ...(noeud.description !== undefined ? [el('p', [['id', `${noeud.id}-description`]], [{ texte: noeud.description }])] : []),
          ...this.groupe(noeud.corps, env),
          el('button', [['type', 'button'], ['class', 'humalis-fenetre-fermer'], ['aria-label', this.messageAttr('Fermer', env)], ['onclick', fermer]], [{ texte: '×' }]),
        ];
        sortie.push(el('dialog', [['data-humalis', noeud.id], ['class', ['humalis-fenetre', ...noeud.classes].join(' ')], ['aria-labelledby', `${noeud.id}-titre`], ['aria-describedby', noeud.description !== undefined ? `${noeud.id}-description` : undefined]], [el('div', [['class', 'humalis-fenetre-contenu']], contenu)], [`fenetre(@, () => visibilite.v[${chaine(noeud.id)}], ${fermer}, ${noeud.obligatoire ? 'true' : 'false'});`]));
        break;
      }
      case 'graphique':
        sortie.push({ zone: `[${appelGraphique(noeud, (v) => expressionJs(v, this.contexte))}]`, initial: env ? htmlGraphique(noeud, (v) => this.initial(v, env), (v) => this.texteInitial(v, env)) : '' });
        break;
      case 'codeDocumentation': {
        const frappe = attributsFrappe(noeud);
        // Le code est déjà dans la page : le bouton le relit, le script ne le porte pas une seconde fois.
        const copier = `(evenement) => copier(evenement.currentTarget.previousElementSibling.querySelector('code').textContent)`;
        const message = this.messageCopier();
        const texte: M = message.length > 1 ? { js: messageEnCode(message, chaine), initial: env ? message[0].texte : '' } : { texte: message[0].texte };
        sortie.push(el('div', [['class', 'humalis-bloc-code-conteneur']], [
          el('pre', [['class', `humalis-bloc-code${frappe ? ` ${frappe.classe}` : ''}`], ['data-langage', noeud.langage ?? ''], ['data-humalis-frappe', frappe?.frappe], ['data-humalis-frappe-cle', frappe?.cle]], [el('code', [], [{ brut: colorerCodeHumalis(noeud.code, noeud.langage) }])]),
          el('button', [['type', 'button'], ['onclick', copier]], [texte]),
        ]));
        break;
      }
      case 'tableauDocumentation': {
        const cellule = (v: Valeur, tag: string) => el(tag, [], this.contenuM(v, 'texte', env));
        sortie.push(el('div', [['class', 'humalis-tableau-conteneur']], [el('table', [], [
          el('caption', [], this.contenuM(noeud.legende, 'texte', env)),
          el('thead', [], [el('tr', [], noeud.colonnes.map((v) => cellule(v, 'th')))]),
          el('tbody', [], noeud.rangees.map((r) => el('tr', [], r.map((v) => cellule(v, 'td'))))),
        ])]));
        break;
      }
      case 'bloc':
        this.blocM(noeud, env, sortie);
        break;
      case 'formulaire': {
        const soumission = this.formulaires.get(noeud.id)?.soumission ?? '() => {}';
        const f = el('form', [this.repereHtml(noeud.ligne) as [string, Attr | undefined], ['data-humalis', noeud.id], ['class', ['humalis-formulaire', ...(noeud.classes ?? [])].join(' ')], ['novalidate', 'true']], this.groupe(noeud.corps, env), [`soumettre(@, ${soumission});`]);
        this.enVisibilite(noeud.id, [f], env, sortie);
        break;
      }
      case 'composant':
        this.composantM(noeud, env, sortie);
        break;
      case 'sousPage':
        sortie.push(el('div', [['class', 'humalis-page humalis-sous-page'], ['data-c', String(this.niveau + 1)]], env ? [{ brut: this.sousPageDepart ?? '' }] : []));
        break;
    }
  }

  /** La profondeur de cette couche, et le HTML de sa sous-page au départ (écrit par le projet). */
  niveau = 0;
  sousPageDepart: string | undefined;

  private chaqueM(liste: Valeur, variable: string, corps: (env: Environnement | null) => M[], env: Environnement | null): MChaque {
    const js = expressionJs(liste, this.contexte);
    const base: MChaque = { chaque: js, variable: nomJs(variable) };
    if (!env) return { ...base, corps: corps(null) };
    const valeurs = this.initial(liste, env);
    return { ...base, lignes: (Array.isArray(valeurs) ? valeurs : []).map((v) => corps(env.enfant().definir(variable, v))) };
  }

  private blocM(noeud: Extract<NoeudVue, { type: 'bloc' }>, env: Environnement | null, sortie: M[]): void {
    if (noeud.genre === 'liste' || noeud.genre === 'listeNumerotee') {
      const enfants: M[] = noeud.corps.map((enfant) =>
        enfant.type === 'repetition'
          ? { ...this.chaqueM(enfant.liste, enfant.variable, (dedans) => [el('li', [], this.groupe(enfant.corps, dedans))], env), ...(enfant.animation ? { animation: true } : {}) }
          : el('li', [], this.groupe([enfant], env)),
      );
      sortie.push(el(noeud.genre === 'liste' ? 'ul' : 'ol', [this.repereHtml(noeud.ligne) as [string, Attr | undefined], ['class', 'humalis-liste']], enfants));
      return;
    }
    if (COMPOSITES.has(noeud.genre)) {
      const environnement = env ?? new Environnement(this.contexte.types);
      sortie.push(...this.enfantM(arbreComposite(this.aideComposite(noeud, environnement)), env));
      return;
    }
    const enfants: M[] = [
      ...(estRepliable(noeud) ? [{ brut: '<button type="button" class="humalis-menu-bouton" aria-expanded="false" aria-label="Menu"><span class="humalis-menu-icone" aria-hidden="true"></span></button>' } as M] : []),
      ...this.groupe(noeud.corps, env),
    ];
    // Comme sur le web : l'en-tête, le <main> de la page, le pied, côte à côte.
    if (noeud.genre === 'contenu' && this.coucheContenu !== undefined) {
      sortie.push(el('main', [['id', 'contenu'], ['class', 'humalis-page'], ['data-c', String(this.coucheContenu)], ...(this.pageCachee ? ([['hidden', 'true']] as [string, Attr][]) : [])], [{ brut: env ? (this.sousPageDepart ?? '') : '' }]));
      return;
    }
    if (noeud.genre === 'entete' && this.coucheContenu !== undefined) sortie.push({ brut: ALLER_AU_CONTENU });
    sortie.push(el(BALISES_BLOC[noeud.genre] ?? 'div', [this.repereHtml(noeud.ligne) as [string, Attr | undefined], ['class', classesDuBloc(noeud)], ['id', noeud.ancre]], enfants));
    const bas = noeud.id !== undefined ? this.basDesBlocs.get(noeud.id) : undefined;
    if (!bas) return;
    const fonction = bas.fonction;
    const m: M[] = [
      el('div', [['class', 'humalis-sentinelle'], ['data-humalis', `${noeud.id}-bas`], ['aria-hidden', 'true']], [], [`observerLeBas(@, ${fonction});`]),
      ...(bas.gestionnaire.bouton === null ? [] : [el('button', [['type', 'button'], ['class', 'humalis-voir-plus'], ['data-humalis', `${noeud.id}-voir-plus`], ['onclick', fonction]], [this.messageM(bas.gestionnaire.bouton ?? 'Voir plus', env)])]),
    ];
    if (!bas.gestionnaire.tantQue) {
      sortie.push(...m);
      return;
    }
    const js = `${conditionJs(bas.gestionnaire.tantQue, this.contexte)} ? 0 : -1`;
    if (!env) sortie.push({ si: js, branches: [m] });
    else sortie.push(verifier(bas.gestionnaire.tantQue, env, this.contexte.champs) ? { si: js, choix: 0, branche: m } : { si: js, choix: -1 });
  }

  /** La couche de la disposition met ici le numéro de son emplacement pour le contenu de la page. */
  coucheContenu: number | undefined;
  /** Une page réservée reste cachée tant que la session n'a pas répondu. */
  pageCachee = false;

  private composantM(noeud: Extract<NoeudVue, { type: 'composant' }>, env: Environnement | null, sortie: M[]): void {
    const externe = this.moteur.externes.get(noeud.nom);
    const props = noeud.proprietes.map((p) => `${camel(p.nom)}: ${expressionJs(p.valeur, this.contexte)}`).join(', ');
    if (externe) {
      this.imports.add(noeud.nom);
      sortie.push(el('div', [], [], [`${ADAPTATEURS[externe.sorte]}(@, () => import(${chaine(externe.chemin)}), () => ({ ${props} })${externe.balise ? `, ${chaine(externe.balise)}` : ''});`]));
      return;
    }
    const composant = this.moteur.composants.get(noeud.nom);
    if (!composant) throw new Error(`le composant « ${noeud.nom} » n'est pas écrit en Humalis`);
    const nom = pascal(noeud.nom);
    const proprietes = noeud.proprietes.map((p) => `${nomJs(p.nom)}: lecture(() => ${expressionJs(p.valeur, this.contexte)})`).join(', ');
    const js = '0';
    if (!env) {
      sortie.push({ si: js, branches: [[{ brut: '' }]], ...{ composant: { nom, proprietes } } } as MSi);
      return;
    }
    const valeurs = new Map(noeud.proprietes.map((p) => [p.nom, this.initial(p.valeur, env)]));
    sortie.push({ si: js, choix: 0, branche: [{ brut: new GenerateurMoteur(composant, this.moteur, '', (composant as ComposantHumalis).parametres).departComposant(valeurs) }] });
  }

  private contenuM(valeur: Valeur, genre: string, env: Environnement | null, id?: string): M[] {
    if (id !== undefined && this.textesChanges.has(id)) {
      return [{ js: `textes.v[${chaine(id)}] ?? ${contenuJs(valeur, this.contexte)}`, initial: this.txt(valeur, env) }];
    }
    if (valeur.type !== 'texte') return [this.dyn(valeur, env)];
    const accent = (liste: typeof valeur.parties) => liste.some((p) => 'texte' in p && (p.accent || p.code));
    const avecAccents = ['titre', 'soustitre', 'texte'].includes(genre) && (accent(valeur.parties) || valeur.versions?.some((v) => accent(v.parties)));
    if (avecAccents && valeur.versions) {
      return [{ zone: `[${this.contenuAccentJs(valeur, genre)}]`, initial: env ? this.contenuAccentHtml(valeur, genre, env) : '' }];
    }
    if (avecAccents) {
      return valeur.parties.map((p): M =>
        'texte' in p
          ? p.accent
            ? el('span', [['class', 'humalis-accent']], [{ texte: p.texte }])
            : p.code
              ? el('code', [['class', 'humalis-code-ligne']], [{ texte: p.texte }])
              : { texte: p.texte }
          : this.dyn({ type: 'texte', parties: [p] }, env),
      );
    }
    const fixe = texteLitteral(valeur);
    return fixe !== undefined ? [{ texte: fixe }] : [this.dyn(valeur, env)];
  }

  private communM(noeud: Element, avant: [string, Attr | undefined][] = []): [string, Attr | undefined][] {
    const liste: [string, Attr | undefined][] = [this.repereHtml(noeud.ligne) as [string, Attr | undefined], ...avant, ['data-humalis', noeud.id], ['class', this.classes(noeud) || undefined]];
    if (noeud.annonce) liste.push(['aria-live', 'polite'], ['aria-atomic', 'true']);
    for (const a of attributsRaccourci(noeud)) liste.push(a);
    for (const [attribut, appels] of this.evenements.get(noeud.id) ?? []) {
      const reference = appels.length === 1 && !appels[0].includes('(') || attribut === 'onpause';
      const valeur = reference
        ? appels[0]
        : appels.length === 1
          ? `() => ${appels[0]}`
          : `async () => { ${appels.map((a) => `await ${a.includes('(') ? a : `${a}()`};`).join(' ')} }`;
      liste.push([attribut, valeur]);
    }
    return liste;
  }

  private elementM(noeud: Element, env: Environnement | null): MElement {
    const lucideIcone = noeud.reglages?.icone ? chercherIcone(noeud.reglages.icone)?.lucide : undefined;
    // « bouton icone "…" avec nom "…" » : l'icône seule ; le nom va dans aria-label.
    const seule = noeud.reglages?.seule ? texteLitteral(noeud.contenu) : undefined;
    const contenu: M[] = [...(lucideIcone ? [{ brut: iconeHtml(lucideIcone, 'humalis-icone') } as M] : []), ...(seule !== undefined ? [] : this.contenuM(noeud.contenu, noeud.genre, env, noeud.id))];
    switch (noeud.genre) {
      case 'titre':
      case 'soustitre': {
        const niveau = this.niveaux.get(noeud) ?? 1;
        const dyn = niveau === 1 && (texteLitteral(noeud.contenu) === undefined || this.textesChanges.has(noeud.id));
        return el(`h${niveau}`, this.communM(noeud), contenu, dyn ? [`titreDeLaPage(() => ${this.textesChanges.has(noeud.id) ? `textes.v[${chaine(noeud.id)}] ?? ${contenuJs(noeud.contenu, this.contexte)}` : contenuJs(noeud.contenu, this.contexte)});`] : undefined);
      }
      case 'texte':
        return el('p', this.communM(noeud), contenu);
      case 'bouton': {
        const envoie = this.formulaireDe.has(noeud.id) && !this.evenements.has(noeud.id);
        return el('button', this.communM(noeud, [['type', envoie ? 'submit' : 'button'], ...(seule !== undefined ? ([['aria-label', seule]] as [string, string][]) : []), ...this.desactiveM(noeud, env)]), contenu);
      }
      case 'lien':
        return el('a', this.communM(noeud, this.attrsLien(noeud, env)), contenu);
      case 'image':
        return el('img', this.communM(noeud, this.attrsImage(noeud, env)));
      case 'champ':
        return this.champM(noeud, env, contenu);
    }
  }

  /** « avec desactive si … » : l'attribut disabled suit la condition pendant que la page vit. */
  private desactiveM(noeud: Element, env: Environnement | null): [string, Attr][] {
    if (noeud.desactive === true) return [['disabled', true]];
    if (!noeud.desactive) return [];
    return [['disabled', { js: conditionJs(noeud.desactive, this.contexte), initial: env ? verifier(noeud.desactive, env, new Map()) : false }]];
  }

  private attrsLien(noeud: Element, env: Environnement | null): [string, Attr | undefined][] {
    const onglet: [string, Attr | undefined][] = noeud.nouvelOnglet ? [['target', '_blank'], ['rel', 'noopener noreferrer']] : [];
    if (noeud.externeValeur) return [['href', { js: this.adresseDeLien(noeud.externeValeur), initial: false }], ...onglet];
    if (noeud.externe !== undefined) return [['href', noeud.externe], ...onglet];
    const filtres = noeud.cible !== undefined ? this.moteur.filtresDesPages.get(noeud.cible) : undefined;
    if (filtres?.length) onglet.push(['data-filtres', filtres.join(' ')]);
    const ancre = noeud.versAncre !== undefined ? `#${noeud.versAncre}` : '';
    if (noeud.cible === undefined && ancre) return [['href', ancre], ...onglet];
    if (noeud.arguments?.length && noeud.cible !== undefined) {
      const initial = env ? this.adresseInitiale(noeud.cible, noeud.arguments, env) : false;
      const js = this.adresseAvec(noeud.cible, noeud.arguments);
      return [['href', { js: ancre ? `${js} + ${chaine(ancre)}` : js, initial: initial === false ? false : initial + ancre }], ...onglet];
    }
    return [['href', this.fichier(noeud.cible ?? '') + ancre], ...onglet];
  }

  private attrsImage(noeud: Element, env: Environnement | null): [string, Attr | undefined][] {
    if (noeud.image) return this.attrsImageRiche(noeud.image, noeud.contenu, env);
    const source = texteLitteral(noeud.contenu);
    return [['src', this.attr(noeud.contenu, env)], ['alt', noeud.reglages?.decoratif ? '' : noeud.reglages?.description ?? alt(source)], ['aria-hidden', noeud.reglages?.decoratif ? 'true' : undefined]];
  }

  private attrsImageRiche(image: ImageRI, contenu: Valeur, env: Environnement | null): [string, Attr | undefined][] {
    const valeurs: Valeur[] = [];
    const paires = this.attributsImage(image, contenu, (v) => `\u0000${valeurs.push(v) - 1}`, (t) => t);
    return paires.map(([nom, v]): [string, Attr] => {
      const marque = v.match(/^\u0000(\d+)$/);
      if (marque) return [nom, this.attr(valeurs[Number(marque[1])], env)];
      return [nom, nom === 'src' && v.startsWith('images/') ? `/${v}` : v];
    });
  }

  private champM(noeud: Element, env: Environnement | null, contenu: M[]): MElement {
    const boite = this.boiteDuChamp(noeud.id);
    const saisie = noeud.saisie;
    const sorte = saisie?.sorte ?? 'texte';
    const etoile: M = { brut: '<span class="humalis-obligatoire" aria-hidden="true"> *</span>' };
    const libelle: M[] = saisie?.obligatoire ? [el('span', [], [...contenu, etoile])] : contenu;
    const indice: Attr | undefined = saisie?.indiceValeur
      ? { js: expressionJs(saisie.indiceValeur, this.contexte), initial: env ? this.txt(saisie.indiceValeur, env) : false }
      : saisie?.indice === undefined
        ? undefined
        : saisie.indiceLangues
          ? { js: messageEnCode(saisie.indiceLangues, chaine), initial: env ? saisie.indice : false }
          : saisie.indice;
    const options = (liste: [string, Attr | undefined][]): [string, Attr | undefined][] => [
      ...liste,
      ['required', saisie?.obligatoire ? 'true' : undefined],
      ['placeholder', sorte !== 'liste' ? indice : undefined],
      ['min', saisie?.minimum !== undefined ? String(saisie.minimum) : undefined],
      ['max', saisie?.maximum !== undefined ? String(saisie.maximum) : undefined],
      ...this.desactiveM(noeud, env),
    ];
    const parmi = (ligne: (valeur: string, initial: string) => MElement): MChaque => {
      if (!saisie?.parmi) return { chaque: '[]', variable: 'valeur', ...(env ? { lignes: [] } : { corps: [] }) };
      const js = expressionJs(saisie.parmi, this.contexte);
      if (!env) return { chaque: js, variable: 'valeur', corps: [ligne('valeur.v', '')] };
      const valeurs = this.initial(saisie.parmi, env);
      return { chaque: js, variable: 'valeur', lignes: (Array.isArray(valeurs) ? valeurs : []).map((v) => [ligne('valeur.v', String(v))]) };
    };
    switch (sorte) {
      case 'case':
        return el('label', [['class', 'humalis-case']], [el('input', options(this.communM(noeud, [['type', 'checkbox']])), [], [`modele(@, ${boite}, 'checked');`]), ...libelle]);
      case 'choix': {
        const classes = this.classes(noeud);
        const radios = parmi((v, initial) => el('label', [], [
          el('input', [['type', 'radio'], ['name', noeud.id], ['value', { js: v, initial }], ['checked', { js: `${boite}.v === ${v}`, initial: false }], ['oninput', `() => { ${boite}.v = ${v}; }`]]),
          { js: v, initial },
        ]));
        return el('fieldset', [this.repereHtml(noeud.ligne) as [string, Attr | undefined], ['data-humalis', noeud.id], ['class', classes ? `${classes} humalis-choix` : 'humalis-choix'], ...this.desactiveM(noeud, env)], [el('legend', [], libelle), radios]);
      }
      case 'liste': {
        const premiere = el('option', [['value', ''], ['selected', 'true']], saisie?.indiceLangues ? [{ js: messageEnCode(saisie.indiceLangues, chaine), initial: env ? (saisie.indice ?? '') : '' }] : [this.messageM(saisie?.indice ?? 'Choisissez…', env)]);
        const choix = parmi((v, initial) => el('option', [['value', { js: v, initial }]], [{ js: v, initial }]));
        return el('label', [['class', 'humalis-champ']], [...libelle, el('select', options(this.communM(noeud)), [premiere, choix], [`modele(@, ${boite});`])]);
      }
      case 'texteLong':
        return el('label', [['class', 'humalis-champ']], [...libelle, el('textarea', options(this.communM(noeud, [['rows', '4']])), [], [`modele(@, ${boite});`])]);
      default: {
        const genre = this.genreChamp(noeud) ?? TYPES_SAISIE[sorte];
        return el('label', [['class', 'humalis-champ']], [...libelle, el('input', options([...this.communM(noeud), ['type', genre?.type], ['autocomplete', genre?.autocomplete]]), [], [`modele(@, ${boite});`, ...(genre?.type === 'password' ? ['activerMotDePasse(@);'] : [])])]);
      }
    }
  }

  private aideMoteur(noeud: Extract<NoeudVue, { type: 'widget' }>, env: Environnement | null) {
    const environnement = env ?? new Environnement(this.contexte.types);
    const aide = this.aide(noeud, environnement);
    if (noeud.genre === 'progression' && !env) aide.valeur.initial = 0;
    return aide;
  }

  private versionsDe(texte: string): ReturnType<typeof messageEnLangues> {
    return this.site.langues ? messageEnLangues(texte, this.site.langues.map((l) => l.code)) : undefined;
  }

  /** Un message de Humalis écrit dans la page : il suit la langue de la personne. */
  private messageM(texte: string, env: Environnement | null): M {
    const versions = this.versionsDe(texte);
    return versions ? { js: messageEnCode(versions, chaine), initial: env ? texte : '' } : { texte };
  }

  private messageAttr(texte: string, env: Environnement | null): Attr {
    const versions = this.versionsDe(texte);
    return versions ? { js: messageEnCode(versions, chaine), initial: env ? texte : false } : texte;
  }

  /** Un arbre de widgets.ts : le même arbre, relié finement. */
  private enfantM(enfant: Enfant, env: Environnement | null): M[] {
    if ('tag' in enfant) {
      const attrs: [string, Attr][] = enfant.attrs.map(([nom, v]) => [nom, nom === 'aria-label' && typeof v === 'string' ? this.messageAttr(v, env) : !env && typeof v === 'object' ? { js: v.js, initial: false } : v]);
      const fixees = attrs.filter(([, v]) => v !== false).map(([nom, v]): [string, Attr] => [nom, nom === 'src' && typeof v === 'string' && /^(audio|images)\//.test(v) ? `/${v}` : v]);
      const carrousel = enfant.attrs.some(([nom]) => nom === 'data-humalis-carrousel');
      return [{ tag: enfant.tag, attrs: fixees, enfants: enfant.enfants.flatMap((c) => this.enfantM(c, env)), ...(carrousel ? { liaisons: ['activerCarrousel(@);'] } : {}) }];
    }
    if ('texte' in enfant) return [this.messageM(enfant.texte, env)];
    if ('js' in enfant) return [{ js: enfant.js, initial: env ? enfant.initial : '' }];
    if ('vue' in enfant) return this.groupe(enfant.vue, env);
    if ('icone' in enfant) {
      if (typeof enfant.label === 'object') return [{ zone: `[icone(${chaine(enfant.icone)}, ${chaine(enfant.classe ?? 'humalis-icone')}, ${enfant.label.js})]`, initial: env ? iconeHtml(enfant.icone, enfant.classe ?? 'humalis-icone', enfant.label.initial) : '' }];
      return [{ brut: iconeHtml(enfant.icone, enfant.classe ?? 'humalis-icone', enfant.label) }];
    }
    if ('qr' in enfant) return [{ zone: `[codeQr(${enfant.qr})]`, initial: '' }];
    if ('signature' in enfant) return [{ zone: `[appareil.signature(document.createElement('span'), (valeur) => { ${enfant.signature} = valeur; })]`, initial: '' }];
    if ('avatar' in enfant) {
      const { nom, photo, initialNom, initialPhoto } = enfant.avatar;
      return [{ zone: `[avatar(${nom}, ${photo ?? "''"})]`, initial: !env ? '' : initialPhoto ? `<img${attributs([['src', initialPhoto], ['alt', '']])}>` : `<span aria-hidden="true">${echapperTexte(initiales(initialNom))}</span>` }];
    }
    const { js, initial, maximum, change, label, classes } = enfant.etoiles;
    return [{ zone: `[etoiles(${js}, ${maximum}, ${change ?? 'undefined'}, ${typeof label === 'string' ? chaine(label) : label.js}, ${chaine(classes)})]`, initial: env ? etoilesHtml(initial, maximum, change !== undefined, typeof label === 'string' ? label : label.initial, classes) : '' }];
  }

  // ─── Les liaisons ───────────────────────────────────────────────────────

  private liaisons(liste: M[], e: Ecrivain): void {
    const avecLocales = liste.some((m) => 'locale' in m);
    if (avecLocales) e.ligne('{');
    const ecrire = () => {
      for (const m of liste) this.liaison(m, e);
    };
    if (avecLocales) e.indenter(ecrire);
    else ecrire();
    if (avecLocales) e.ligne('}');
  }

  private bloc(contenu: M[], e: Ecrivain, entree: string, sortie: string, params = '(r)'): void {
    numeroter(contenu);
    const nom = this.nomGabarit(html(contenu));
    e.bloc(`${entree}${nom}, ${params} => {`, () => this.liaisons(contenu, e), `}${sortie}`);
  }

  private liaison(m: M, e: Ecrivain): void {
    if ('locale' in m) {
      e.ligne(`const ${m.locale.nom} = ${m.locale.js};`);
    } else if ('tag' in m) {
      this.liaisons(m.enfants, e);
      const r = `r[${m.h}]`;
      if (m.h === undefined) return;
      for (const [nom, v] of m.attrs) {
        if (nom.startsWith('on')) {
          if (typeof v !== 'string') continue;
          if (nom === 'onpause') e.ligne(`ecouterLaPause(${r}, ${v});`);
          else e.ligne(`ecouter(${r}, ${chaine(nom === 'onfrappe' ? 'input' : nom.slice(2))}, ${v});`);
        } else if (dynamique(v)) e.ligne(`attribut(${r}, ${chaine(nom)}, () => ${v.js});`);
      }
      for (const l of m.liaisons ?? []) e.ligne(l.replace(/@/g, r));
      if (m.enfants.length === 1 && 'js' in m.enfants[0] && m.enfants[0].seul) e.ligne(`texte(${r}, () => ${m.enfants[0].js});`);
    } else if ('si' in m) {
      const composant = (m as MSi & { composant?: { nom: string; proprietes: string } }).composant;
      if (composant) {
        e.ligne(`si(r[${m.h}], () => 0, [[$g${composant.nom}, (r) => ${composant.nom}(r, { ${composant.proprietes} })]]);`);
        return;
      }
      e.ligne(`si(r[${m.h}], () => ${m.si}, [`);
      e.indenter(() => {
        for (const branche of m.branches ?? []) {
          if (branche.length === 0) e.ligne('null,');
          else this.bloc(branche, e, '[', '],');
        }
      });
      e.ligne(']);');
    } else if ('chaque' in m) {
      this.bloc(m.corps ?? [], e, `chaque(r[${m.h}], () => ${m.chaque}, `, m.animation ? ', animerListe);' : ');', `(r, ${m.variable})`);
    } else if ('zone' in m) {
      e.ligne(`zone(r[${m.h}], () => ${m.zone});`);
    } else if ('js' in m && !m.seul) {
      e.ligne(`texte(r[${m.h}], () => ${m.js});`);
    }
  }
}

const ALLER_AU_CONTENU = '<a class="humalis-aller-au-contenu" href="#contenu">Aller au contenu</a>';

const TYPES_SAISIE: Partial<Record<string, { type: string; autocomplete?: string }>> = {
  email: { type: 'email', autocomplete: 'email' },
  telephone: { type: 'tel', autocomplete: 'tel' },
  nombre: { type: 'number' },
  date: { type: 'date' },
  heure: { type: 'time' },
  motDePasse: { type: 'password', autocomplete: 'new-password' },
  adresseWeb: { type: 'url', autocomplete: 'url' },
};

/** Les noms que les pages produites emploient : une variable du programme ne peut pas les cacher. */
export const NOMS_RESERVES = (): Set<string> => new Set(['appareil', 'r', 'adresse', 'couche', 'relances', 'minuteries', 'raccourcis', 'session', 'valeur', 'evenement', 'etat', ...NOMS_MOTEUR, ...NOMS_OUTILS, ...NOMS_NAV, ...NOMS_ADAPT, ...NOMS_SERVEUR, 'listeDeplacable', 'choixFichier', 'humalisGraphique']);

export const ADAPTATEURS = { module: 'monterModule', react: 'monterReact', vue: 'monterVue', svelte: 'monterSvelte', web: 'monterWeb' } as const;

const NOMS_MOTEUR = ['animerListe', 'signal', 'calcul', 'lecture', 'effet', 'nettoyer', 'gabarit', 'texte', 'attribut', 'ecouter', 'soumettre', 'ecouterLaPause', 'modele', 'si', 'chaque', 'zone', 'contenu', 'executer'];
const NOMS_OUTILS = ['formaterDateLongue', 'formaterEnLettres', 'avecMajuscule', 'initialesDe', 'creer', 'icone', 'avatar', 'etoiles', 'codeQr', 'carteLieux', 'fenetre', 'observerLeBas', 'titreDeLaPage', 'descriptionDeLaPage', 'activerCarrousel', 'activerMotDePasse', 'afficherMessage', 'planifier', 'planificateur', 'minuteriesDeCouche', 'ecouterRaccourcis', 'mouvementReduit', 'themeSombre', 'copier', 'partager', 'telechargerCsv', 'confirmer', 'retirerPremier', 'grouper', 'formaterNombre', 'formaterDate', 'formaterArgent', 'accorder', 'formaterTaille', 'dateDuJour', 'maintenant', 'decalerDate', 'joursEntre', 'formaterDepuis', 'lireMemoire', 'garderMemoire', 'cliquer', 'focaliser', 't', 'langue', 'changerLangue', 'definirTheme'];
const NOMS_NAV = ['naviguer', 'adresseDe', 'filtre', 'revenir', 'changerFiltre', 'apresLaGarde'];
const NOMS_ADAPT = ['monterModule', 'monterReact', 'monterVue', 'monterSvelte', 'monterWeb'];
const NOMS_SERVEUR = ['serveur', 'derniereRequete', 'utilisateur', 'televerser', 'REPOS', 'lectureGardee', 'directDeCouche'];

const utilise = (nom: string, code: string) => new RegExp(`(?<![.\\w$])${nom}\\b(?=\\s*[(.{},\\)\\];]|$)`, 'm').test(code);

function importsDe(code: string, dossier: string, moteur: ContexteMoteur, partages: string[]): string {
  const prendre = (noms: string[]) => noms.filter((n) => utilise(n, code));
  const ligne = (noms: string[], fichier: string) => (noms.length ? `import { ${noms.join(', ')} } from '${fichier}';\n` : '');
  const composants = [...moteur.composants.keys()].flatMap((n) => {
    const nom = pascal(n);
    return new RegExp(`\\b${nom}\\(`).test(code) ? [nom, `$g${nom}`] : [];
  });
  const fonctions = [...(moteur.fonctionsGlobales ?? [])].filter((n) => new RegExp(`(?<![.\\w$])${n}\\(`).test(code));
  return (
    ligne(['gabarit', ...prendre(NOMS_MOTEUR.filter((n) => n !== 'gabarit'))], `${dossier}/moteur.js`) +
    ligne(prendre(NOMS_OUTILS), `${dossier}/outils.js`) +
    ligne(prendre(NOMS_NAV), `${dossier}/navigation.js`) +
    ligne(/\bhumalisGraphique\./.test(code) ? ['humalisGraphique'] : [], `${dossier}/graphique.js`) +
    ligne(prendre(['listeDeplacable']), `${dossier}/deplacement.js`) +
    ligne(prendre(['choixFichier']), `${dossier}/fichier.js`) +
    ligne(prendre(NOMS_ADAPT), `${dossier}/adaptateurs.js`) +
    ligne(prendre(NOMS_SERVEUR), `${dossier}/serveur.js`) +
    ligne(partages.filter((n) => new RegExp(`(?<![.\\w$])${n}\\.v\\b`).test(code)), `${dossier}/partages.js`) +
    ligne(fonctions, `${dossier}/fonctions.js`) +
    ligne(composants, `${dossier}/composants.js`)
  ).trimEnd();
}

declare module '../statique/page.js' {
  interface ContexteSite {
    /** Les noms JavaScript des fonctions écrites en haut du fichier. */
    fonctionsGlobales?: string[];
  }
}

export type { Liste };
