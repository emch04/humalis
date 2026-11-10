/**
 * Les actions Humalis, en Swift : ce qui se passe quand l'utilisateur agit.
 * Contrairement à React, une variable SwiftUI est à jour dès qu'on l'écrit :
 * les actions s'écrivent donc simplement, l'une après l'autre.
 */
import type { Action, ArgumentsPage, TypeValeur, Valeur } from '../../ri/types.js';
import { sousActions } from '../../ri/actions.js';
import { lireCible } from '../../analyse/navigation.js';
import { Ecrivain } from '../web/ecrivain.js';
import { chaineSwift, cleJson, nomRoute, nomSwift } from './noms.js';
import { plusPrecis, type Expr, type Valeurs } from './valeurs.js';

const TEXTE: TypeValeur = { genre: 'texte' };
const NOMBRE: TypeValeur = { genre: 'nombre' };

/** Ce que les actions demandent à la page qui les écrit. */
export interface HotePage {
  /** Une fonction dont le type de retour n'est pas connu : ce qu'elle rend devient une valeur souple. */
  retourSouple?: boolean;
  valeurs: Valeurs;
  refuser(ligne: number, quoi: string): void;
  ligne: number;
  /** Les pages du programme, pour écrire les routes. */
  pages: Map<string, { parametres: string[]; filtres: { nom: string; nombre?: boolean }[] }>;
  /** La variable d'un champ, pour effacer un mot de passe. */
  /** Les variables dont la page lit l'état de requête. */
  etatsRequetes: Set<string>;
  /** Vrai si la variable d'état existe. */
  estEtat(nom: string): boolean;
  /** Le nom Swift de l'état de requête d'une variable. */
  nomEtatRequete(nom: string): string;
  /** Vrai pour une variable « avec hors ligne » : sans réseau, pas de message d'erreur. */
  estHorsLigne(nom: string): boolean;
}

/** La clé d'un champ envoyé, déjà traduite pour le serveur. */
export type ClesChamps = Map<string, string>;

interface Cadre {
  /** Dans « essayer » : les appels au serveur lèvent leur erreur. */
  essai: boolean;
  /** Dans la soumission d'un formulaire : un envoi refusé arrête la suite. */
  formulaire: boolean;
  /** Dans une minuterie, hors d'une boucle : « arreter » l'arrête pour de bon. */
  minuterie: boolean;
  /** Dans une fonction écrite en haut du fichier. */
  fonction: boolean;
}

/** Vrai si l'action, ou une de ses sous-actions, est de ce genre. */
export function contient(actions: Action[], genres: readonly Action['type'][]): boolean {
  return actions.some((a) => genres.includes(a.type) || sousActions(a).some((s) => contient(s, genres)));
}

/** Les noms qu'une suite d'actions modifie : ceux-là s'écrivent « var ». */
function modifies(actions: Action[]): Set<string> {
  const noms = new Set<string>();
  const voir = (liste: Action[]) => {
    for (const a of liste) {
      if (a.type === 'affectation') noms.add(a.nom);
      if (a.type === 'ajout' || a.type === 'retrait') noms.add(a.liste);
      if (a.type === 'requete' && a.resultat) noms.add(a.resultat);
      sousActions(a).forEach(voir);
    }
  };
  voir(actions);
  return noms;
}

export class EcrivainActions {
  private numero = 0;

  constructor(
    private readonly hote: HotePage,
    private readonly cles: ClesChamps,
  ) {}

  /** Le corps d'un événement. `formulaire` : sa soumission s'arrête si un envoi est refusé. */
  ecrire(e: Ecrivain, actions: Action[], options: { formulaire?: boolean; fonction?: boolean } = {}): void {
    this.suite(e, actions, { essai: false, formulaire: options.formulaire ?? false, minuterie: false, fonction: options.fonction ?? false }, modifies(actions));
  }

  /** Une minuterie écrite dans la page : `arreter` y est disponible. */
  ecrireMinuterie(e: Ecrivain, actions: Action[]): void {
    this.suite(e, actions, { essai: false, formulaire: false, minuterie: true, fonction: false }, modifies(actions));
  }

  private get v(): Valeurs {
    return this.hote.valeurs;
  }

  private x(valeur: Valeur, attendu?: TypeValeur): Expr {
    return this.v.expr(valeur, attendu);
  }

  private variable(nom: string): Expr | undefined {
    return this.v.portee.variables.get(nom);
  }

  private suite(e: Ecrivain, actions: Action[], c: Cadre, vars: Set<string>): void {
    for (const action of actions) this.action(e, action, c, vars);
  }

  private dansBranche(e: Ecrivain, actions: Action[], c: Cadre, vars: Set<string>): void {
    const avant = new Map(this.v.portee.variables);
    this.suite(e, actions, c, vars);
    this.v.portee.variables.clear();
    for (const [n, l] of avant) this.v.portee.variables.set(n, l);
  }

  private action(e: Ecrivain, a: Action, c: Cadre, vars: Set<string>): void {
    switch (a.type) {
      case 'affectation':
        return this.affectation(e, a);
      case 'locale': {
        const valeur = this.x(a.valeur, a.typeValeur.genre === 'inconnu' ? undefined : a.typeValeur);
        const type = plusPrecis(a.typeValeur, valeur.type);
        const code = valeur.opt ? this.v.versOpt(valeur, type) : this.v.vers(valeur, type);
        const nom = nomSwift(a.nom);
        e.ligne(`${vars.has(a.nom) ? 'var' : 'let'} ${nom}: ${this.v.types.swift(type, valeur.opt)} = ${code}`);
        this.v.portee.variables.set(a.nom, { code: nom, type, opt: valeur.opt });
        return;
      }
      case 'ajout': {
        const liste = this.variable(a.liste);
        if (!liste) return this.hote.refuser(this.hote.ligne, `« ajouter à ${a.liste} » : cette liste est inconnue ici`);
        const de = this.v.elementDe(liste.type);
        const valeur = this.x(a.valeur, de);
        if (liste.type.genre === 'inconnu') return this.hote.refuser(this.hote.ligne, `« ajouter à ${a.liste} » : cette variable n'est pas une liste connue`);
        if (valeur.opt) e.bloc(`if let valeur = ${valeur.code} {`, () => e.ligne(`${liste.code}.append(${this.v.vers({ code: 'valeur', type: valeur.type, opt: false }, de)})`));
        else e.ligne(`${liste.code}.append(${this.v.vers(valeur, de)})`);
        return;
      }
      case 'retrait': {
        const liste = this.variable(a.liste);
        if (!liste || liste.type.genre !== 'liste') return this.hote.refuser(this.hote.ligne, `« retirer de ${a.liste} » : cette variable n'est pas une liste connue`);
        e.ligne(`retirerPremier(&${liste.code}, ${this.v.vers(this.x(a.valeur, liste.type.de), liste.type.de)})`);
        return;
      }
      case 'si':
        e.ligne(`if ${this.v.condition(a.test)} {`);
        e.indenter(() => this.dansBranche(e, a.alors, c, vars));
        if (a.sinon.length > 0) {
          e.ligne('} else {');
          e.indenter(() => this.dansBranche(e, a.sinon, c, vars));
        }
        e.ligne('}');
        return;
      case 'repetition': {
        const liste = this.v.listePresente(a.liste);
        const nom = nomSwift(a.variable);
        const type = plusPrecis(a.typeVariable, this.v.elementDe(liste.type));
        this.v.portee.variables.set(a.variable, { code: nom, type, opt: false });
        e.ligne(`for ${nom} in ${liste.code} {`);
        e.indenter(() => this.dansBranche(e, a.corps, { ...c, minuterie: false }, vars));
        e.ligne('}');
        return;
      }
      case 'tantQue':
        e.ligne(`while ${this.v.condition(a.test)} {`);
        e.indenter(() => this.dansBranche(e, a.corps, { ...c, minuterie: false }, vars));
        e.ligne('}');
        return;
      case 'repeter':
        e.ligne(`for _ in 0..<Swift.max(0, Int(${this.v.nombre(a.fois)})) {`);
        e.indenter(() => this.dansBranche(e, a.corps, { ...c, minuterie: false }, vars));
        e.ligne('}');
        return;
      case 'arreter':
        if (c.minuterie) {
          e.ligne('arreter()');
          e.ligne('return');
        } else e.ligne('break');
        return;
      case 'passer':
        e.ligne('continue');
        return;
      case 'selon':
        return this.selon(e, a, c, vars);
      case 'essayer':
        return this.essayer(e, a, c, vars);
      case 'rendre': {
        if (!c.fonction) return this.hote.refuser(this.hote.ligne, '« rendre » hors d\'une fonction');
        e.ligne(`return ${this.hote.retourSouple && this.x(a.valeur).type.genre !== 'inconnu' ? `ValeurHumalis(${this.retour(a.valeur)})` : this.retour(a.valeur)}`);
        return;
      }
      case 'message':
        return this.message(e, a, c);
      case 'confirmation': {
        const options = a.oui !== 'Oui' || a.non !== 'Non' ? `, oui: ${chaineSwift(a.oui)}, non: ${chaineSwift(a.non)}` : '';
        e.ligne(`if await confirmer(${this.v.texte(a.question)}${options}) {`);
        e.indenter(() => this.dansBranche(e, a.alors, c, vars));
        if (a.sinon.length > 0) {
          e.ligne('} else {');
          e.indenter(() => this.dansBranche(e, a.sinon, c, vars));
        }
        e.ligne('}');
        return;
      }
      case 'minuterie':
        return this.minuterie(e, a, vars);
      case 'visibilite':
        for (const id of a.ids) e.ligne(`visibilite[${chaineSwift(id)}] = ${a.visible}`);
        return;
      case 'changerTexte':
        for (const id of a.ids) e.ligne(`textes[${chaineSwift(id)}] = ${this.v.enTexte(a.texte)}`);
        return;
      case 'navigation':
        return this.navigation(e, a);
      case 'filtre': {
        const filtre = this.variable(a.nom);
        if (!filtre) return this.hote.refuser(this.hote.ligne, `« changer ${a.nom} » : ce filtre est inconnu ici`);
        const valeur = this.x(a.valeur, filtre.type);
        e.ligne(`${filtre.code} = ${this.v.versOpt(valeur, filtre.type)}`);
        return;
      }
      case 'retour':
        e.ligne(`Routeur.commun.revenir(${a.vers !== undefined ? `sinon: ${this.route(a.vers)}` : ''})`);
        return;
      case 'viderChamp': {
        const champ = this.v.portee.champs.get(a.id);
        if (champ) e.ligne(`${champ.variable} = ${champ.sorte === 'case' ? 'false' : '""'}`);
        return;
      }
      case 'theme':
        e.ligne(`Apparence.commun.definir(.${a.valeur})`);
        return;
      case 'langue':
        e.ligne(`Langues.commun.changer(${chaineSwift(a.code)})`);
        return;
      case 'copie': {
        const message = a.message === null ? 'nil' : a.texte ? this.v.texte(a.texte) : chaineSwift(a.message);
        e.ligne(`copier(${this.v.enTexte(a.valeur)}, message: ${message})`);
        return;
      }
      case 'partage':
        return this.partage(e, a);
      case 'telechargementCsv': {
        const liste = this.x(a.liste);
        e.ligne(`await telechargerCsv(${liste.opt ? `${liste.code} ?? []` : liste.code}, fichier: ${chaineSwift(a.fichier)})`);
        return;
      }
      case 'requete':
        return this.requete(e, a, c);
      case 'recharger':
        e.ligne(`await relances[${chaineSwift(a.variable)}]?()`);
        return;
      case 'suppression':
      case 'modification':
        return this.ecriture(e, a, c);
      case 'optimiste':
        return this.optimiste(e, a, c, vars);
      case 'envoiFichier':
        return this.envoiFichier(e, a, c);
      case 'telechargementBon': {
        const appel = `await Serveur.commun.telechargerBon(${chaineSwift(a.adresse)}, id: ${this.identifiant(a.objet)})`;
        e.ligne(c.essai ? `try ${appel.replace('telechargerBon', 'telechargerBonOuEchouer')}` : appel);
        return;
      }
      case 'connexion':
        return this.compte(e, c, `seConnecter(email: ${this.v.texte(a.email)}, motDePasse: ${this.motDePasse(e, a.motDePasse)})`);
      case 'connexionGoogle':
        return this.compte(e, c, 'seConnecterAvecGoogle()');
      case 'connexionApple':
        return this.compte(e, c, 'seConnecterAvecApple()');
      case 'changementMotDePasse':
        return this.compte(e, c, `changerMotDePasse(actuel: ${this.v.texte(a.actuel)}, nouveau: ${this.v.texte(a.nouveau)})`);
      case 'invitation':
        return this.compte(e, c, `inviter(email: ${this.v.texte(a.email)}, role: ${chaineSwift(a.role)}${a.groupe ? `, groupes: [${chaineSwift(cleJson(a.groupe.champ))}: .texte(${this.v.enTexte(a.groupe.valeur)})]` : ''}${a.champs?.length ? `, champs: [${a.champs.map((ch) => `${chaineSwift(cleJson(ch.champ))}: ValeurHumalis(${this.x(ch.valeur).code})`).join(', ')}]` : ''})`);
      case 'demandeLienMotDePasse':
        return this.compte(e, c, `demanderLienMotDePasse(email: ${this.v.texte(a.email)})`);
      case 'choixMotDePasse':
        return this.compte(e, c, `choisirMotDePasse(nouveau: ${this.v.texte(a.nouveau)})`);
      case 'deconnexion':
        e.ligne('await Session.commun.seDeconnecter()');
        return;
      case 'paiement': {
        const appel = `Serveur.commun.payer(${chaineSwift(a.adresse)}, id: ${this.identifiant(a.objet)})`;
        e.ligne(c.essai ? `try await ${appel.replace('payer(', 'payerOuEchouer(')}` : `await ${appel}`);
        return;
      }
      case 'demandeIa': {
        const reponse = this.variable(a.variable);
        if (!reponse) return this.hote.refuser(this.hote.ligne, `« dans ${a.variable} » : cette variable est inconnue ici`);
        e.ligne(`${reponse.code} = ""`);
        const appel = `Serveur.commun.demanderIa(${this.v.texte(a.question)}) { ${reponse.code} += $0 }`;
        e.ligne(c.essai ? `try await ${appel.replace('demanderIa(', 'demanderIaOuEchouer(')}` : `await ${appel}`);
        return;
      }
      case 'activationNotifications':
        e.ligne('await activerNotifications()');
        return;
      case 'enregistrerAudio':
      case 'enregistrerVideo':
      case 'scannerDocument':
      case 'recadrerPhoto':
        return this.hote.refuser(this.hote.ligne, `« ${a.type} » : cette action n'est pas encore disponible sur cette cible`);
      case 'prisePhoto': {
        const cible = this.variable(a.variable);
        if (!cible) return this.hote.refuser(this.hote.ligne, `« photo dans ${a.variable} » : cette variable est inconnue ici`);
        e.bloc('if let humalisPhoto = await prendrePhoto() {', () => e.ligne(`${cible.code} = humalisPhoto`));
        return;
      }
      case 'localisation': {
        const cible = this.variable(a.variable);
        if (!cible) return this.hote.refuser(this.hote.ligne, `« position dans ${a.variable} » : cette variable est inconnue ici`);
        e.bloc('if let humalisLieu = await lirePosition() {', () => e.ligne(`${cible.code} = ${this.v.types.swift(cible.type)}(latitude: humalisLieu.latitude, longitude: humalisLieu.longitude, precision: humalisLieu.precision)`));
        return;
      }
      case 'scanCode': {
        const cible = this.variable(a.variable);
        if (!cible) return this.hote.refuser(this.hote.ligne, `« scanner code dans ${a.variable} » : cette variable est inconnue ici`);
        e.bloc('if let humalisCode = await scannerCode() {', () => e.ligne(`${cible.code} = humalisCode`));
        return;
      }
      case 'verificationIdentite':
        e.ligne('if await verifierIdentite() {');
        e.indenter(() => this.dansBranche(e, a.alors, c, vars));
        if (a.sinon.length > 0) {
          e.ligne('} else {');
          e.indenter(() => this.dansBranche(e, a.sinon, c, vars));
        }
        e.ligne('}');
        return;
      case 'vibration':
        e.ligne('vibrer()');
        return;
      case 'changementRole': {
        const envoi = `["role": ValeurHumalis(${this.v.texte(a.role)})]`;
        const appel = `"/auth/comptes/:id/role", methode: "POST", envoi: ${envoi}, id: ${this.identifiant(a.cible)}`;
        if (c.essai) e.ligne(`try await Serveur.commun.appelSansReponse(${appel})`);
        else e.ligne(`_ = await Serveur.commun.appelReussi(${appel})`);
        return;
      }
      case 'changementCompte': {
        const paires = a.champs.map((ch) => `${chaineSwift(cleJson(ch.champ))}: ${enValeurSwift(this.x(ch.valeur).code)}`);
        const appel = `"/auth/comptes/:id/champs", methode: "POST", envoi: [${paires.length ? paires.join(', ') : ':'}], id: ${this.identifiant(a.cible)}`;
        if (c.essai) e.ligne(`try await Serveur.commun.appelSansReponse(${appel})`);
        else e.ligne(`_ = await Serveur.commun.appelReussi(${appel})`);
        return;
      }
      // « commencer activite "livraison" » : ActivityKit (voir formes.ts).
      case 'activite':
        e.ligne(`await ActivitesHumalis.${a.mode}(${chaineSwift(a.nom)})`);
        return;
      // « dire » : la réponse de Siri dans une commande vocale, la voix de l'appareil ailleurs.
      case 'dire':
        e.ligne(`Voix.dire(${this.v.texte(a.texte)})`);
        return;
      default: {
        // Une action ajoutée au langage doit être traitée ici : sinon le compilateur TypeScript s'arrête.
        const oubliee: never = a;
        void oubliee;
      }
    }
  }

  /** Le mot de passe est lu, puis effacé de son champ dès l'envoi : il n'est gardé nulle part. */
  private motDePasse(e: Ecrivain, valeur: Valeur): string {
    const code = this.v.texte(valeur);
    if (valeur.type !== 'champ') return code;
    const champ = this.v.portee.champs.get(valeur.id);
    if (!champ) return code;
    const copie = `motDePasse${++this.numero}`;
    e.ligne(`let ${copie} = ${champ.variable}`);
    e.ligne(`${champ.variable} = ""`);
    return copie;
  }

  /** Une action sur le compte : refusée, un message s'affiche (ou « si erreur » la reçoit) et la suite s'arrête. */
  private compte(e: Ecrivain, c: Cadre, appel: string): void {
    if (c.essai) e.ligne(`try await Session.commun.${appel}`);
    else e.ligne(`guard await Session.commun.afficherSiRefus({ try await Session.commun.${appel} }) else { return }`);
  }

  private retour(valeur: Valeur): string {
    const e = this.x(valeur);
    return e.opt ? this.v.versOpt(e, e.type) : e.code;
  }

  private affectation(e: Ecrivain, a: Extract<Action, { type: 'affectation' }>): void {
    const cible = this.variable(a.nom);
    if (!cible) return this.hote.refuser(this.hote.ligne, `« changer ${a.nom} » : cette variable est inconnue ici`);
    if (!a.champs?.length) {
      const valeur = this.x(a.valeur, cible.type);
      e.ligne(`${cible.code} = ${cible.opt ? this.v.versOpt(valeur, cible.type) : this.v.vers(valeur, cible.type)}`);
      return;
    }
    let lue: Expr = cible;
    for (const champ of a.champs) lue = this.v.lireChamp(lue, champ);
    const valeur = this.x(a.valeur, lue.type);
    if (cible.type.genre === 'inconnu') {
      e.ligne(`${cible.code}${a.champs.map((c) => `[${chaineSwift(cleJson(c))}]`).join('')} = ${this.v.vers(valeur, { genre: 'inconnu' })}`);
      return;
    }
    e.ligne(`${lue.code} = ${lue.opt && !cible.opt ? this.v.versOpt(valeur, lue.type) : this.v.vers(valeur, lue.type)}`);
  }

  private selon(e: Ecrivain, a: Extract<Action, { type: 'selon' }>, c: Cadre, vars: Set<string>): void {
    const valeur = this.x(a.valeur);
    const nom = `valeurSelon${++this.numero}`;
    e.ligne(`let ${nom} = ${valeur.code}`);
    const lue: Expr = { code: nom, type: valeur.type, opt: valeur.opt };
    a.cas.forEach((cas, i) => {
      const test = cas.valeurs.map((v) => `${nom} == ${this.v.versOpt(this.x(v, lue.type), lue.type)}`).join(' || ');
      e.ligne(`${i === 0 ? '' : '} else '}if ${test} {`);
      e.indenter(() => this.dansBranche(e, cas.corps, c, vars));
    });
    if (a.sinon.length > 0) {
      e.ligne(a.cas.length > 0 ? '} else {' : 'do {');
      e.indenter(() => this.dansBranche(e, a.sinon, c, vars));
    }
    if (a.cas.length > 0 || a.sinon.length > 0) e.ligne('}');
  }

  private essayer(e: Ecrivain, a: Extract<Action, { type: 'essayer' }>, c: Cadre, vars: Set<string>): void {
    e.ligne('do {');
    e.indenter(() => this.dansBranche(e, a.corps, { ...c, essai: true }, vars));
    // Swift refuse un « catch » que rien ne peut atteindre : un corps sans appel au serveur ne lève rien.
    if (!/^\s*(try|.*\btry await\b)/m.test(this.dernierCorps(a.corps))) e.indenter(() => e.ligne('if false { throw ErreurHumalis.refus("") }'));
    e.ligne('} catch {');
    const avant = this.v.portee.variables.get('raison');
    this.v.portee.variables.set('raison', { code: 'raison', type: TEXTE, opt: false });
    e.indenter(() => {
      e.ligne('let raison = raisonDe(error)');
      if (a.siErreur.length === 0) e.ligne('_ = raison');
      this.dansBranche(e, a.siErreur, c, vars);
      if (c.formulaire) e.ligne('return');
    });
    if (avant) this.v.portee.variables.set('raison', avant);
    else this.v.portee.variables.delete('raison');
    e.ligne('}');
  }

  /** Vrai si le corps fait un appel qui peut échouer : on écrit donc « try ». */
  private dernierCorps(actions: Action[]): string {
    return contient(actions, ['requete', 'suppression', 'modification', 'connexion', 'connexionGoogle', 'connexionApple', 'changementMotDePasse', 'invitation', 'demandeLienMotDePasse', 'choixMotDePasse', 'envoiFichier', 'telechargementBon']) ? 'try await' : '';
  }

  private message(e: Ecrivain, a: Extract<Action, { type: 'message' }>, c: Cadre): void {
    const reglages = [
      ...(a.duree ? [`duree: ${this.v.nombre(a.duree)}`] : []),
      ...(a.persistant ? ['persistant: true'] : []),
    ];
    const appel = `Messages.commun.afficher(${this.v.enTexte(a.texte)}, .${a.genre}`;
    if (!a.action) {
      e.ligne(`${appel}${reglages.length ? `, ${reglages.join(', ')}` : ''})`);
      return;
    }
    const bouton = a.action;
    e.bloc(`${appel}${reglages.length ? `, ${reglages.join(', ')}` : ''}, action: ActionMessage(libelle: ${chaineSwift(bouton.libelle)}) {`, () => this.dansBranche(e, bouton.actions, { ...c, essai: false, formulaire: false, minuterie: false }, modifies(bouton.actions)), '})');
  }

  private minuterie(e: Ecrivain, a: Extract<Action, { type: 'minuterie' }>, vars: Set<string>): void {
    const tantQue = a.tantQue ? `, tantQue: { ${this.v.condition(a.tantQue)} }` : '';
    const mode = a.mode === 'toutes' ? 'toutes' : 'apres';
    e.bloc(`planificateur.${mode}(${this.v.nombre(a.millisecondes)}${tantQue}) { arreter in`, () => {
      e.ligne('_ = arreter');
      this.dansBranche(e, a.corps, { essai: false, formulaire: false, minuterie: true, fonction: false }, vars);
    });
  }

  private partage(e: Ecrivain, a: Extract<Action, { type: 'partage' }>): void {
    const lien = a.lien && 'externe' in a.lien ? chaineSwift(a.lien.externe) : a.lien ? `Routeur.adressePublique(${chaineSwift(a.lien.ecran)})` : 'nil';
    e.ligne(`partager(texte: ${this.v.enTexte(a.texte)}, titre: ${a.titre ? this.v.enTexte(a.titre) : 'nil'}, adresse: ${lien})`);
  }

  // ─── Navigation ──────────────────────────────────────────────────────────

  /** `Route.produit(id: p.id)` : la route d'une page, avec ses valeurs. */
  route(page: string, args?: ArgumentsPage): string {
    const info = this.hote.pages.get(page);
    if (!info) {
      this.hote.refuser(this.hote.ligne, `le lien vers la page « ${page} », qui n'existe pas dans ce programme`);
      return '.introuvable';
    }
    const valeurs = [
      ...info.parametres.map((p) => {
        const donne = args?.find((a) => a.nom === p || cleJson(a.nom) === cleJson(p));
        return `${nomSwift(p)}: ${donne ? this.v.enTexte(donne.valeur) : '""'}`;
      }),
      ...info.filtres.flatMap((f) => {
        const donne = args?.find((a) => a.nom === f.nom);
        if (!donne) return [];
        const type = f.nombre ? NOMBRE : TEXTE;
        return [`${nomSwift(f.nom)}: ${this.v.versOpt(this.x(donne.valeur, type), type)}`];
      }),
    ];
    return `.${nomRoute(page)}${valeurs.length || info.filtres.length ? `(${valeurs.join(', ')})` : ''}`;
  }

  /** L'instruction qui va vers une cible écrite (« produit », « carte#desserts », « https://… »). */
  allerVers(cible: string, args?: ArgumentsPage, continuer = false): string {
    const lue = lireCible(cible);
    if (lue.externe) return `ouvrirExterne(${chaineSwift(cible)})`;
    const ancre = lue.ancre !== undefined ? `ancre: ${chaineSwift(lue.ancre)}` : '';
    if (!lue.page) return `Routeur.commun.ancre = ${chaineSwift(lue.ancre ?? '')}`;
    if (continuer) return `Routeur.commun.continuer(sinon: ${this.route(lue.page, args)})`;
    return `Routeur.commun.aller(${this.route(lue.page, args)}${ancre ? `, ${ancre}` : ''})`;
  }

  private navigation(e: Ecrivain, a: Extract<Action, { type: 'navigation' }>): void {
    const page = a.ecran.type === 'texte' && !a.ecran.versions && a.ecran.parties.every((p) => 'texte' in p) ? a.ecran.parties.map((p) => ('texte' in p ? p.texte : '')).join('') : undefined;
    if (page === undefined) {
      e.ligne(`Routeur.commun.allerVers(${this.v.enTexte(a.ecran)})`);
      return;
    }
    e.ligne(this.allerVers(page, a.arguments, a.continuer));
  }

  // ─── Serveur ─────────────────────────────────────────────────────────────

  /** `["email": ValeurHumalis(champEmail)]` : les données envoyées. */
  private donnees(valeurs: Valeur[], cles: (string | undefined)[] | undefined, versLeServeur: boolean): string {
    if (valeurs.length === 0) return '[:]';
    const paires = valeurs.map((v, i) => {
      const ecrite = cles?.[i];
      const cle = ecrite !== undefined ? (versLeServeur && /^[A-Za-z_]\w*$/.test(ecrite) ? cleJson(ecrite) : ecrite) : v.type === 'champ' ? (this.cles.get(v.id) ?? v.id) : v.type === 'variable' ? cleJson(v.nom) : v.type === 'champDonnee' ? cleJson(v.champ) : 'valeur';
      const code = this.x(v);
      return `${chaineSwift(cle)}: ${enValeurSwift(code.code)}`;
    });
    return `[${paires.join(', ')}]`;
  }

  private identifiant(objet: Valeur): string {
    return this.v.vers(this.v.lireChamp(this.x(objet), 'id'), TEXTE);
  }

  private requete(e: Ecrivain, a: Extract<Action, { type: 'requete' }>, c: Cadre): void {
    const resultat = a.resultat !== undefined ? this.variable(a.resultat) : undefined;
    if (a.resultat !== undefined && !resultat) return this.hote.refuser(this.hote.ligne, `« dans ${a.resultat} » : cette variable est inconnue ici`);
    const suivie = a.resultat !== undefined && this.hote.etatsRequetes.has(a.resultat);
    const options: string[] = [];
    if (a.mode === 'envoyer') options.push(`envoi: ${this.donnees(a.donnees, a.cles, a.source === undefined)}`);
    if (a.mode === 'lireUn') options.push(`id: ${this.v.enTexte(a.donnees[0])}`);
    if (a.source !== undefined) options.push(`source: Sources.${nomSwift(a.source)}`);
    if (a.filtrant?.length) options.push(`filtres: [${a.filtrant.map((f) => `(${chaineSwift(f.cle)}, ${this.v.enTexte(f.valeur)})`).join(', ')}]`);
    if (a.dans !== undefined) options.push(`dans: ${chaineSwift(a.dans)}`);
    if (suivie) options.push(`suivi: { ${this.hote.nomEtatRequete(a.resultat!)} = $0 }`);
    const fin = options.length ? `, ${options.join(', ')}` : '';
    const adresse = chaineSwift(a.adresse);

    if (!resultat && a.enAttente) {
      this.envoiGarde(e, `${adresse}${fin}`, c);
      return;
    }
    if (!resultat) {
      if (c.essai) e.ligne(`try await Serveur.commun.appelSansReponse(${adresse}${fin})`);
      else if (c.formulaire && a.mode === 'envoyer') e.ligne(`guard await Serveur.commun.appelReussi(${adresse}${fin}) else { return }`);
      else e.ligne(`_ = await Serveur.commun.appelReussi(${adresse}${fin})`);
      return;
    }

    const type = this.v.types.swift(resultat.type);
    const appel = c.essai ? `try await Serveur.commun.appel(${adresse}, comme: ${type}.self${fin})` : `await Serveur.commun.lire(${adresse}, comme: ${type}.self${fin}${this.hote.estHorsLigne(a.resultat!) ? ', horsLigne: true' : ''})`;
    const nom = `reponse${++this.numero}`;
    const lecture = a.mode !== 'envoyer';
    // Une lecture sait se rejouer : « recharger » et le bouton « Réessayer » s'en servent.
    if (lecture && (suivie || a.direct) && !c.essai) {
      const charge = `charger${this.numero}`;
      e.bloc(`let ${charge}: @MainActor () async -> Void = {`, () => {
        e.bloc(`if let ${nom} = ${appel} {`, () => e.ligne(`${resultat.code} = ${nom}`));
      });
      if (suivie) e.ligne(`relances[${chaineSwift(a.resultat!)}] = ${charge}`);
      e.ligne(`await ${charge}()`);
      // « en direct » : le serveur annonce un changement, la page relit la route avec ses droits.
      if (a.direct) e.ligne(`directs.ecouter(${adresse}, relire: ${charge})`);
      return;
    }
    // Une réponse arrivée après celle d'une requête plus récente (une recherche tapée vite) ne remplace rien.
    const jeton = `jeton${this.numero}`;
    e.ligne(`let ${jeton} = jetons.nouveau(${chaineSwift(a.resultat!)})`);
    if (c.formulaire && !lecture && !c.essai) {
      e.ligne(`guard let ${nom} = ${appel} else { return }`);
      e.ligne(`if jetons.estDernier(${chaineSwift(a.resultat!)}, ${jeton}) { ${resultat.code} = ${nom} }`);
      return;
    }
    e.bloc(`if let ${nom} = ${appel}, jetons.estDernier(${chaineSwift(a.resultat!)}, ${jeton}) {`, () => e.ligne(`${resultat.code} = ${nom}`));
  }

  private ecriture(e: Ecrivain, a: Extract<Action, { type: 'suppression' | 'modification' }>, c: Cadre): void {
    const source = a.source !== undefined ? `, source: Sources.${nomSwift(a.source)}` : '';
    const objet = this.x(a.objet);
    const id = objet.opt ? `identifiant${++this.numero}` : this.identifiant(a.objet);
    const ecrire = () => {
      const adresse = chaineSwift(a.adresse);
      let appel: string;
      if (a.type === 'suppression') appel = `methode: "DELETE", id: ${id}${source}`;
      else {
        const paires = a.changements.map((ch) => `${chaineSwift(a.source === undefined ? cleJson(ch.champ) : ch.champ)}: ${enValeurSwift(this.x(ch.valeur).code)}`);
        appel = `methode: ${a.remplacement ? '"PUT"' : '"PATCH"'}, envoi: [${paires.length ? paires.join(', ') : ':'}], id: ${id}${source}`;
      }
      if (a.enAttente) this.envoiGarde(e, `${adresse}, ${appel}`, c);
      else if (c.essai) e.ligne(`try await Serveur.commun.appelSansReponse(${adresse}, ${appel})`);
      else if (c.formulaire) e.ligne(`guard await Serveur.commun.appelReussi(${adresse}, ${appel}) else { return }`);
      else e.ligne(`_ = await Serveur.commun.appelReussi(${adresse}, ${appel})`);
    };
    if (objet.opt) {
      const lu = this.v.vers(this.v.lireChamp({ code: 'objet', type: objet.type, opt: false }, 'id'), TEXTE);
      e.bloc(`if let objet = ${objet.code} {`, () => {
        e.ligne(`let ${id} = ${lu}`);
        ecrire();
      });
    } else ecrire();
  }

  /** « … hors ligne » : sans réseau l'envoi attend et le geste continue ; un refus du serveur reste un refus. */
  private envoiGarde(e: Ecrivain, arguments_: string, c: Cadre): void {
    if (c.essai) e.ligne(`try await Serveur.commun.appelOuGarder(${arguments_})`);
    else if (c.formulaire) e.ligne(`guard await Serveur.commun.appelReussiOuGarder(${arguments_}) else { return }`);
    else e.ligne(`_ = await Serveur.commun.appelReussiOuGarder(${arguments_})`);
  }

  private optimiste(e: Ecrivain, a: Extract<Action, { type: 'optimiste' }>, c: Cadre, vars: Set<string>): void {
    const n = ++this.numero;
    const gardees = a.variables.map((nom) => ({ nom, lue: this.variable(nom) })).filter((v) => v.lue);
    for (const { nom, lue } of gardees) e.ligne(`let avant${n}${nomSwift(nom).replace(/^./, (l) => l.toUpperCase())} = ${lue!.code}`);
    e.ligne('do {');
    e.indenter(() => this.dansBranche(e, a.corps, { ...c, essai: true }, vars));
    if (!this.dernierCorps(a.corps)) e.indenter(() => e.ligne('if false { throw ErreurHumalis.refus("") }'));
    e.ligne('} catch {');
    e.indenter(() => {
      for (const { nom, lue } of gardees) e.ligne(`${lue!.code} = avant${n}${nomSwift(nom).replace(/^./, (l) => l.toUpperCase())}`);
      e.ligne('Messages.commun.afficher("L\'action n\'a pas été prise en compte : on a remis les choses comme avant.", .erreur)');
      e.ligne('return');
    });
    e.ligne('}');
  }

  private envoiFichier(e: Ecrivain, a: Extract<Action, { type: 'envoiFichier' }>, c: Cadre): void {
    const fichier = this.variable(a.variable);
    if (!fichier) return this.hote.refuser(this.hote.ligne, `« envoyer fichier ${a.variable} » : cette variable est inconnue ici`);
    const suivi = a.suivi !== undefined ? this.variable(a.suivi) : undefined;
    const resultat = a.resultat !== undefined ? this.variable(a.resultat) : undefined;
    const options = [
      `source: Sources.${nomSwift(a.source)}`,
      a.corpsBrut ? 'corpsBrut: true' : `champ: ${chaineSwift(a.champ)}`,
      ...(suivi ? [`progression: { ${suivi.code} = $0 }`] : []),
    ].join(', ');
    const type = resultat ? this.v.types.swift(resultat.type) : 'ValeurHumalis';
    const appel = `await Serveur.commun.televerser(${fichier.code}, vers: ${chaineSwift(a.adresse)}, comme: ${type}.self, ${options})`;
    if (c.essai) {
      const lu = `try ${appel.replace('televerser(', 'televerserOuEchouer(')}`;
      if (resultat) e.bloc(`if let reponse = ${lu} {`, () => e.ligne(`${resultat.code} = reponse`));
      else e.ligne(`_ = ${lu}`);
    } else if (resultat) e.bloc(`if let reponse = ${appel} {`, () => e.ligne(`${resultat.code} = reponse`));
    else e.ligne(`_ = ${appel}`);
  }
}

/** Une valeur envoyée au serveur ; « [] » seul n'a pas de type en Swift. */
function enValeurSwift(code: string): string {
  return code.trim() === '[]' ? '.liste([])' : `ValeurHumalis(${code})`;
}
