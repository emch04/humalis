/**
 * Les actions Humalis en Kotlin : le corps d'une fonction `suspend` de la
 * page, qui lit et change ses variables. Une requête attend sa réponse sans
 * bloquer l'écran.
 */
import { lireCible } from '../../analyse/navigation.js';
import type { Action, ArgumentsPage, Valeur } from '../../ri/types.js';
import type { EcrivainKotlin } from './ecrivain.js';
import { chaineKotlin, cleJson, nomKotlin } from './noms.js';
import { nomEtatRequete, type Valeurs } from './valeurs.js';

/** Ce que les actions demandent à la page qui les contient. */
export interface HoteActions {
  valeurs: Valeurs;
  /** La variable de visibilité d'un élément (« montrer », « cacher »). */
  visibilite(id: string): string;
  /** La variable du texte changé d'un élément (« changer texte de »). */
  texteChange(id: string): string;
  /** L'expression Kotlin de la route d'une page, avec ses paramètres ; rien si la page n'existe pas. */
  route(page: string, args?: ArgumentsPage): string | undefined;
  /** Aller à une ancre, sur cette page ou sur une autre ; rien si elle n'existe pas. */
  allerAncre(page: string | undefined, ancre: string, args?: ArgumentsPage): string | undefined;
  /** Les clés JSON des champs envoyés (le libellé du champ). */
  clesChamps: Map<string, string>;
  /** Les variables de la page « avec memorisee » ou suivies : rien de particulier à faire ici. */
  refuser(message: string): void;
}

/** Où s'écrit l'action : un « essayer » laisse passer l'erreur ; une fonction écrite en haut peut « rendre ». */
interface Cadre {
  essai: boolean;
  fonction: boolean;
  /** L'envoi d'un formulaire : après une erreur, ses champs restent remplis. */
  formulaire?: boolean;
}

/** Les phrases Humalis des actions qui n'existent pas encore ici : le message les cite telles qu'on les écrit. */
const PHRASES: Partial<Record<Action['type'], string>> = {
  activationNotifications: '« activer notifications »',
};

/** Ce qui arrête la suite des actions : une fonction écrite en haut rend « rien ». */
const sortie = (c: Cadre): string => (c.fonction ? 'return null' : 'return');

export class EcrivainActions {
  private numero = 0;
  private readonly v: Valeurs;

  constructor(private readonly hote: HoteActions) {
    this.v = hote.valeurs;
  }

  /** Le corps d'une fonction : les variables locales n'en sortent pas. */
  ecrire(e: EcrivainKotlin, actions: Action[], cadre: Partial<Cadre> = {}): void {
    this.branche(e, actions, { essai: false, fonction: false, ...cadre });
  }

  private branche(e: EcrivainKotlin, actions: Action[], c: Cadre): void {
    const avant = new Map(this.v.portee.variables);
    for (const a of actions) this.action(e, a, c);
    this.v.portee.variables.clear();
    for (const [nom, code] of avant) this.v.portee.variables.set(nom, code);
  }

  private variable(nom: string): string | undefined {
    return this.v.portee.variables.get(nom);
  }

  private action(e: EcrivainKotlin, a: Action, c: Cadre): void {
    switch (a.type) {
      case 'affectation': {
        const cible = this.variable(a.nom);
        if (!cible) return this.hote.refuser(`« changer ${a.nom} » : cette variable est inconnue ici`);
        if (!a.champs?.length) e.ligne(`${cible} = ${this.v.x(a.valeur)}`);
        else e.ligne(`${cible} = avecChamp(${cible}, listOf(${a.champs.map((ch) => chaineKotlin(cleJson(ch))).join(', ')}), ${this.v.x(a.valeur)})`);
        return;
      }
      case 'locale': {
        const nom = this.nomLocal(a.nom);
        e.ligne(`var ${nom}: Any? = ${this.v.x(a.valeur)}`);
        this.v.portee.variables.set(a.nom, nom);
        return;
      }
      case 'ajout': {
        const liste = this.variable(a.liste);
        if (!liste) return this.hote.refuser(`« ajouter … a ${a.liste} » : cette liste est inconnue ici`);
        e.ligne(`${liste} = liste(${liste}) + listOf(${this.v.x(a.valeur)})`);
        return;
      }
      case 'retrait': {
        const liste = this.variable(a.liste);
        if (!liste) return this.hote.refuser(`« retirer … de ${a.liste} » : cette liste est inconnue ici`);
        e.ligne(`${liste} = sansPremier(${liste}, ${this.v.x(a.valeur)})`);
        return;
      }
      case 'si':
        e.ligne(`if (${this.v.b(a.test)}) {`);
        e.indenter(() => this.branche(e, a.alors, c));
        if (a.sinon.length) {
          e.ligne('} else {');
          e.indenter(() => this.branche(e, a.sinon, c));
        }
        e.ligne('}');
        return;
      case 'tantQue':
        e.bloc(`while (${this.v.b(a.test)}) {`, () => this.branche(e, a.corps, c));
        return;
      case 'repeter': {
        const n = `fois${++this.numero}`;
        e.bloc(`for (${n} in 0 until ${this.v.n(a.fois)}.toInt()) {`, () => this.branche(e, a.corps, c));
        return;
      }
      case 'repetition': {
        const nom = this.nomLocal(a.variable);
        e.bloc(`for (${nom} in liste(${this.v.x(a.liste)})) {`, () => {
          this.v.portee.variables.set(a.variable, nom);
          this.branche(e, a.corps, c);
        });
        return;
      }
      case 'arreter':
        e.ligne('break');
        return;
      case 'passer':
        e.ligne('continue');
        return;
      case 'selon': {
        const valeur = `selon${++this.numero}`;
        e.ligne(`val ${valeur} = ${this.v.x(a.valeur)}`);
        a.cas.forEach((cas, i) => {
          const test = cas.valeurs.map((x) => `egal(${valeur}, ${this.v.x(x)})`).join(' || ');
          e.ligne(`${i === 0 ? 'if' : '} else if'} (${test}) {`);
          e.indenter(() => this.branche(e, cas.corps, c));
        });
        if (a.cas.length === 0) e.ligne('run {');
        else if (a.sinon.length) e.ligne('} else {');
        if (a.cas.length === 0 || a.sinon.length) e.indenter(() => this.branche(e, a.sinon, c));
        e.ligne('}');
        return;
      }
      case 'essayer': {
        const erreur = `erreur${++this.numero}`;
        e.bloc('try {', () => this.branche(e, a.corps, { ...c, essai: true }), `} catch (${erreur}: ErreurHumalis) {`);
        e.indenter(() => {
          const avant = this.v.portee.variables.get('raison');
          e.ligne(`val raisonErreur${this.numero} = ${erreur}.raison`);
          this.v.portee.variables.set('raison', `raisonErreur${this.numero}`);
          this.branche(e, a.siErreur, c);
          // Dans un formulaire, les champs restent remplis : la suite (qui les vide) ne s'exécute pas.
          if (c.formulaire) e.ligne(sortie(c));
          if (avant !== undefined) this.v.portee.variables.set('raison', avant);
          else this.v.portee.variables.delete('raison');
        });
        e.ligne('}');
        return;
      }
      case 'rendre':
        if (!c.fonction) return this.hote.refuser('« rendre » hors d\'une fonction');
        e.ligne(`return ${this.v.x(a.valeur)}`);
        return;
      case 'message':
        return this.message(e, a);
      case 'minuterie': {
        const f = `minuterie${++this.numero}`;
        const ms = `${this.v.n(a.millisecondes)}.toLong()`;
        e.bloc(`suspend fun ${f}() {`, () => this.branche(e, a.corps, { essai: false, fonction: false }));
        const tantQue = a.tantQue ? this.v.b(a.tantQue) : 'true';
        if (a.mode === 'apres') e.ligne(`portee.launch { delay(${ms}); if (${tantQue}) ${f}() }`);
        else e.ligne(`portee.launch { while (${tantQue}) { delay(${ms}); if (${tantQue}) ${f}() } }`);
        return;
      }
      case 'copie':
        e.ligne(`copier(${this.v.t(a.texte ?? a.valeur)}, ${a.message === null ? 'null' : chaineKotlin(a.message)})`);
        return;
      case 'partage': {
        const lien = a.lien && 'externe' in a.lien ? ` + "\\n" + ${chaineKotlin(a.lien.externe)}` : '';
        e.ligne(`partager(${this.v.t(a.texte)}${lien}, ${a.titre ? this.v.t(a.titre) : 'null'})`);
        return;
      }
      case 'confirmation':
        e.ligne(`if (confirmer(${this.v.t(a.question)}, ${chaineKotlin(a.oui)}, ${chaineKotlin(a.non)})) {`);
        e.indenter(() => this.branche(e, a.alors, c));
        if (a.sinon.length) {
          e.ligne('} else {');
          e.indenter(() => this.branche(e, a.sinon, c));
        }
        e.ligne('}');
        return;
      case 'visibilite':
        for (const id of a.ids) e.ligne(`${this.hote.visibilite(id)} = ${a.visible}`);
        return;
      case 'changerTexte':
        for (const id of a.ids) e.ligne(`${this.hote.texteChange(id)} = ${this.v.t(a.texte)}`);
        return;
      case 'viderChamp': {
        const champ = this.v.portee.champs.get(a.id);
        if (champ) e.ligne(`${champ.variable} = ${champ.sorte === 'case' ? 'false' : '""'}`);
        return;
      }
      case 'navigation':
        return this.navigation(e, a);
      case 'filtre': {
        // « changer categorie par "costumes" » : le filtre de la page change, la page se relit avec lui.
        const filtre = this.variable(a.nom);
        if (!filtre) return this.hote.refuser(`« changer ${a.nom} » : ce filtre est inconnu ici`);
        e.ligne(`${filtre} = ${this.v.x(a.valeur)}`);
        return;
      }
      case 'retour':
        if (a.vers !== undefined) {
          const route = this.hote.route(a.vers);
          if (!route) return this.hote.refuser(`« revenir vers "${a.vers}" » : cette page n'existe pas`);
          e.ligne(`if (!nav.popBackStack()) allerVers(nav, ${route})`);
        } else e.ligne('nav.popBackStack()');
        return;
      case 'prisePhoto':
      case 'localisation':
      case 'scanCode': {
        const cible = this.variable(a.variable);
        if (!cible) return this.hote.refuser(`« ${a.type === 'prisePhoto' ? 'photo' : a.type === 'scanCode' ? 'scanner code' : 'position'} dans ${a.variable} » : cette variable est inconnue ici`);
        const appel = { prisePhoto: 'prendrePhoto()', localisation: 'lirePosition()', scanCode: 'scannerCode()' }[a.type];
        e.ligne(`${appel}?.let { ${cible} = it }`);
        return;
      }
      case 'verificationIdentite':
        e.ligne('if (verifierIdentite()) {');
        e.indenter(() => this.branche(e, a.alors, c));
        if (a.sinon.length) {
          e.ligne('} else {');
          e.indenter(() => this.branche(e, a.sinon, c));
        }
        e.ligne('}');
        return;
      case 'vibration':
        e.ligne('vibrer()');
        return;
      case 'envoiFichier': {
        const fichier = this.variable(a.variable);
        if (!fichier) return this.hote.refuser(`« envoyer fichier ${a.variable} » : cette variable est inconnue ici`);
        const suivi = a.suivi !== undefined ? this.variable(a.suivi) : undefined;
        const resultat = a.resultat !== undefined ? this.variable(a.resultat) : undefined;
        const options = [`source = Sources.${nomKotlin(a.source)}`, a.corpsBrut ? 'corpsBrut = true' : `champ = ${chaineKotlin(a.champ)}`, ...(suivi ? [`progression = { ${suivi} = it }`] : [])].join(', ');
        const appel = `Serveur.${c.essai ? 'televerserOuEchouer' : 'televerser'}(${fichier}, ${chaineKotlin(a.adresse)}, ${options})`;
        e.ligne(resultat ? `${appel}?.let { ${resultat} = it }` : appel);
        return;
      }
      case 'telechargementBon':
        e.ligne(`Serveur.${c.essai ? 'telechargerBonOuEchouer' : 'telechargerBon'}(${chaineKotlin(a.adresse)}, identifiant(${this.v.x(a.objet)}))`);
        return;
      case 'telechargementCsv':
        e.ligne(`telechargerCsv(${this.v.x(a.liste)}, ${chaineKotlin(a.fichier)})`);
        return;
      case 'langue':
        e.ligne(`Langues.changer(${chaineKotlin(a.code)})`);
        return;
      case 'theme':
        e.ligne(`Apparence.changer(${chaineKotlin(a.valeur)})`);
        return;
      case 'requete':
        return this.requete(e, a, c);
      case 'recharger':
        e.ligne(`relances[${chaineKotlin(a.variable)}]?.invoke()`);
        return;
      case 'suppression':
      case 'modification':
        return this.ecriture(e, a, c);
      case 'optimiste': {
        // L'écran change tout de suite ; si le serveur refuse, les variables reprennent leur valeur.
        const gardes = a.variables.flatMap((nom) => {
          const code = this.variable(nom);
          return code ? [{ code, garde: `avant${++this.numero}` }] : [];
        });
        for (const g of gardes) e.ligne(`val ${g.garde} = ${g.code}`);
        e.bloc('try {', () => this.branche(e, a.corps, { ...c, essai: true }), '} catch (erreurOptimiste: ErreurHumalis) {');
        e.indenter(() => {
          for (const g of gardes) e.ligne(`${g.code} = ${g.garde}`);
          e.ligne(c.essai ? 'throw erreurOptimiste' : 'Messages.afficher(erreurOptimiste.raison, "erreur")');
        });
        e.ligne('}');
        return;
      }
      case 'connexion':
        return this.compte(e, c, `seConnecter(${this.v.t(a.email)}, ${this.v.t(a.motDePasse)})`);
      case 'changementMotDePasse':
        return this.compte(e, c, `changerMotDePasse(${this.v.t(a.actuel)}, ${this.v.t(a.nouveau)})`);
      case 'demandeLienMotDePasse':
        return this.compte(e, c, `demanderLienMotDePasse(${this.v.t(a.email)})`);
      case 'deconnexion':
        e.ligne('Session.seDeconnecter()');
        return;
      case 'connexionGoogle':
        return this.compte(e, c, 'seConnecterAvecGoogle()', '');
      case 'connexionApple':
        return this.compte(e, c, 'seConnecterAvecApple()', '');
      case 'choixMotDePasse':
        return this.compte(e, c, `choisirMotDePasse(${this.v.t(a.nouveau)})`);
      case 'invitation': {
        const groupes = a.groupe ? `, groupes = fiche(${chaineKotlin(cleJson(a.groupe.champ))} to ${this.v.t(a.groupe.valeur)})` : '';
        const champs = a.champs?.length ? `, champs = fiche(${a.champs.map((ch) => `${chaineKotlin(cleJson(ch.champ))} to ${this.v.x(ch.valeur)}`).join(', ')})` : '';
        return this.compte(e, c, `inviter(${this.v.t(a.email)}, ${chaineKotlin(a.role)}${groupes}${champs})`);
      }
      case 'changementRole': {
        const appel = `"/auth/comptes/:id/role", "POST", fiche("role" to ${this.v.t(a.role)}), identifiant(${this.v.x(a.cible)})`;
        e.ligne(c.essai ? `Serveur.appel(${appel})` : `if (!Serveur.appelReussi(${appel})) ${sortie(c)}`);
        return;
      }
      case 'changementCompte': {
        const appel = `"/auth/comptes/:id/champs", "POST", fiche(${a.champs.map((ch) => `${chaineKotlin(cleJson(ch.champ))} to ${this.v.x(ch.valeur)}`).join(', ')}), identifiant(${this.v.x(a.cible)})`;
        e.ligne(c.essai ? `Serveur.appel(${appel})` : `if (!Serveur.appelReussi(${appel})) ${sortie(c)}`);
        return;
      }
      case 'paiement':
        e.ligne(`Serveur.${c.essai ? 'payerOuEchouer' : 'payer'}(${chaineKotlin(a.adresse)}, identifiant(${this.v.x(a.objet)}))`);
        return;
      case 'demandeIa': {
        const reponse = this.variable(a.variable);
        if (!reponse) return this.hote.refuser(`« dans ${a.variable} » : cette variable est inconnue ici`);
        e.ligne(`${reponse} = ""`);
        e.ligne(`Serveur.${c.essai ? 'demanderIaOuEchouer' : 'demanderIa'}(${this.v.t(a.question)}) { ${reponse} = texte(${reponse}) + it }`);
        return;
      }
      default:
        return this.hote.refuser(PHRASES[a.type] ?? `« ${a.type} »`);
    }
  }

  /** Un nom de variable locale qui ne cache rien de la page. */
  private nomLocal(nom: string): string {
    const base = nomKotlin(nom);
    return [...this.v.portee.variables.values()].includes(base) ? `${base}${++this.numero}` : base;
  }

  /** Une action sur le compte : dans « essayer », l'erreur passe ; sinon elle s'affiche et la suite s'arrête. */
  private compte(e: EcrivainKotlin, c: Cadre, appel: string, objet = 'Session.'): void {
    if (c.essai) e.ligne(`${objet}${appel}`);
    else e.ligne(`if (!Session.afficherSiRefus { ${objet}${appel} }) ${sortie(c)}`);
  }

  private message(e: EcrivainKotlin, a: Extract<Action, { type: 'message' }>): void {
    const reglages = [
      ...(a.duree ? [`duree = ${this.v.n(a.duree)}.toLong()`] : []),
      ...(a.persistant ? ['persistant = true'] : []),
    ];
    if (a.action) {
      const f = `actionMessage${++this.numero}`;
      e.bloc(`suspend fun ${f}() {`, () => this.branche(e, a.action!.actions, { essai: false, fonction: false }));
      reglages.push(`action = ${chaineKotlin(a.action.libelle)} to suspend { ${f}() }`);
    }
    e.ligne(`Messages.afficher(${this.v.t(a.texte)}, ${chaineKotlin(a.genre)}${reglages.length ? `, ${reglages.join(', ')}` : ''})`);
  }

  private navigation(e: EcrivainKotlin, a: Extract<Action, { type: 'navigation' }>): void {
    const ecrite = a.ecran.type === 'texte' && !a.ecran.versions && a.ecran.parties.every((p) => 'texte' in p) ? a.ecran.parties.map((p) => ('texte' in p ? p.texte : '')).join('') : undefined;
    if (ecrite === undefined) {
      // « rediriger vers adresse » : une adresse reçue ; seule une adresse externe sûre s'ouvre.
      e.ligne(`ouvrirExterne(${this.v.t(a.ecran)})`);
      return;
    }
    const lue = lireCible(ecrite);
    if (lue.externe) {
      e.ligne(`ouvrirExterne(${chaineKotlin(ecrite)})`);
      return;
    }
    if (lue.ancre !== undefined) {
      const aller = this.hote.allerAncre(lue.page, lue.ancre, a.arguments);
      if (aller) e.ligne(aller);
      return;
    }
    if (!lue.page) return;
    const route = this.hote.route(lue.page, a.arguments);
    if (!route) return this.hote.refuser(`« aller a "${lue.page}" » : cette page n'existe pas`);
    e.ligne(a.continuer ? `continuerVers(nav, ${route})` : `allerVers(nav, ${route})`);
  }

  // ─── Le serveur ──────────────────────────────────────────────────────────

  /** `fiche("email" to champEmail)` : les données envoyées. */
  private donnees(valeurs: Valeur[], cles: (string | undefined)[] | undefined, versLeServeur: boolean): string {
    const paires = valeurs.map((v, i) => {
      const ecrite = cles?.[i];
      const cle =
        ecrite !== undefined
          ? versLeServeur && /^[A-Za-z_]\w*$/.test(ecrite)
            ? cleJson(ecrite)
            : ecrite
          : v.type === 'champ'
            ? (this.hote.clesChamps.get(v.id) ?? v.id)
            : v.type === 'variable'
              ? cleJson(v.nom)
              : v.type === 'champDonnee'
                ? cleJson(v.champ)
                : 'valeur';
      return `${chaineKotlin(cle)} to ${this.v.x(v)}`;
    });
    return `fiche(${paires.join(', ')})`;
  }

  private requete(e: EcrivainKotlin, a: Extract<Action, { type: 'requete' }>, c: Cadre): void {
    const resultat = a.resultat !== undefined ? this.variable(a.resultat) : undefined;
    if (a.resultat !== undefined && !resultat) return this.hote.refuser(`« dans ${a.resultat} » : cette variable est inconnue ici`);
    if (a.enAttente) return this.hote.refuser('« … hors ligne » sur un envoi');
    const suivie = a.resultat !== undefined && this.v.portee.etatsRequetes.has(a.resultat);
    const options: string[] = [];
    if (a.mode === 'envoyer') options.push(`envoi = ${this.donnees(a.donnees, a.cles, a.source === undefined)}`);
    if (a.mode === 'lireUn') options.push(`id = identifiant(${this.v.x(a.donnees[0])})`);
    if (a.source !== undefined) options.push(`source = Sources.${nomKotlin(a.source)}`);
    if (a.filtrant?.length) options.push(`filtres = listOf(${a.filtrant.map((f) => `${chaineKotlin(f.cle)} to ${this.v.t(f.valeur)}`).join(', ')})`);
    if (a.dans !== undefined) options.push(`dans = ${chaineKotlin(a.dans)}`);
    if (suivie) options.push(`suivi = { ${nomEtatRequete(a.resultat!)} = it }`);
    const fin = options.length ? `, ${options.join(', ')}` : '';
    const adresse = chaineKotlin(a.adresse);

    if (!resultat) {
      if (c.essai) e.ligne(`Serveur.appel(${adresse}${fin})`);
      else if (a.mode === 'envoyer') e.ligne(`if (!Serveur.appelReussi(${adresse}${fin})) ${sortie(c)}`);
      else e.ligne(`Serveur.lire(${adresse}${fin})`);
      return;
    }
    const n = ++this.numero;
    const appel = c.essai ? `Serveur.appel(${adresse}${fin})` : `Serveur.lire(${adresse}${fin})`;
    // Une lecture sait se rejouer : « recharger » s'en sert.
    if (a.mode !== 'envoyer' && !c.essai) {
      e.bloc(`val charger${n}: suspend () -> Unit = {`, () => e.ligne(`${appel}?.let { ${resultat} = it }`));
      e.ligne(`relances[${chaineKotlin(a.resultat!)}] = charger${n}`);
      e.ligne(`charger${n}()`);
      return;
    }
    if (c.essai) e.ligne(`${resultat} = ${appel}`);
    else e.ligne(`${appel}?.let { ${resultat} = it }`);
  }

  private ecriture(e: EcrivainKotlin, a: Extract<Action, { type: 'suppression' | 'modification' }>, c: Cadre): void {
    if (a.enAttente) return this.hote.refuser('« … hors ligne » sur un envoi');
    const source = a.source !== undefined ? `, source = Sources.${nomKotlin(a.source)}` : '';
    const id = `identifiant(${this.v.x(a.objet)})`;
    const adresse = chaineKotlin(a.adresse);
    let options: string;
    if (a.type === 'suppression') options = `methode = "DELETE", id = ${id}${source}`;
    else {
      const paires = a.changements.map((ch) => `${chaineKotlin(a.source === undefined ? cleJson(ch.champ) : ch.champ)} to ${this.v.x(ch.valeur)}`);
      options = `methode = ${a.remplacement ? '"PUT"' : '"PATCH"'}, envoi = fiche(${paires.join(', ')}), id = ${id}${source}`;
    }
    if (c.essai) e.ligne(`Serveur.appel(${adresse}, ${options})`);
    else e.ligne(`if (!Serveur.appelReussi(${adresse}, ${options})) ${sortie(c)}`);
  }
}
