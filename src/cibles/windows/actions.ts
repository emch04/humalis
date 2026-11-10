/**
 * Les actions Humalis en C# : ce qui se passe quand la personne agit. Chaque événement
 * devient une méthode `async Task` ; une variable de la page s'écrit par son Signal,
 * et ce qui la lit se redessine seul.
 */
import type { Action, ArgumentsPage, Valeur } from '../../ri/types.js';
import { Ecrivain } from '../web/ecrivain.js';
import { chaineCs, cleJson, nomCs } from './noms.js';
import type { ExpressionsCs, Lieu } from './valeurs.js';

/** Ce que les actions demandent au code qui les écrit (une page, un composant, une fonction). */
export interface HoteActions {
  x: ExpressionsCs;
  refuser(quoi: string): void;
  /** Les variables dont la page montre l'état de requête (« produits est en chargement »). */
  etatsRequetes: Set<string>;
  /** Les fenêtres : fermées au départ. */
  fenetres: Set<string>;
  /** Faux dans une fonction du haut du fichier : ni page, ni minuterie, ni serveur. */
  dansUnePage: boolean;
}

interface Cadre {
  /** Dans « essayer » : les appels au serveur lèvent leur erreur. */
  essai: boolean;
  /** Dans la soumission d'un formulaire : un envoi refusé arrête la suite. */
  formulaire: boolean;
  /** Dans une minuterie, hors d'une boucle : « arreter » l'arrête pour de bon. */
  minuterie?: string;
  /** Dans une boucle : « arreter » en sort. */
  boucle: boolean;
}

/** Les sources (« source "boutique" ») en C# : Sources.Boutique. */
export const sourceCs = (nom: string): string => `Sources.${nom.replace(/(^|[_-])(\w)/g, (_, __, c: string) => c.toUpperCase())}`;

export class EcrivainActions {
  private numero = 0;

  constructor(private readonly hote: HoteActions) {}

  private get x() {
    return this.hote.x;
  }

  ecrire(e: Ecrivain, actions: Action[], options: { formulaire?: boolean } = {}): void {
    this.suite(e, actions, { essai: false, formulaire: options.formulaire ?? false, boucle: false });
  }

  private suite(e: Ecrivain, actions: Action[], c: Cadre): void {
    for (const a of actions) this.action(e, a, c);
  }

  /** Une branche : ce qui y est déclaré n'en sort pas. */
  private branche(e: Ecrivain, actions: Action[], c: Cadre, noms: [string, Lieu][] = []): void {
    e.indenter(() => this.x.avec(noms, () => this.suite(e, actions, c)));
  }

  private lieu(nom: string): Lieu | undefined {
    const lieu = this.hote.x.portee.variables.get(nom);
    if (!lieu) this.hote.refuser(`la variable « ${nom} », inconnue ici,`);
    return lieu;
  }

  /** Écrit une nouvelle valeur dans une variable (Signal ou variable locale). */
  private affecter(lieu: Lieu, nom: string, valeur: string): string | undefined {
    if (lieu.signal) return `${lieu.signal}.Ecrire(${valeur});`;
    if (lieu.locale) return `${lieu.locale} = ${valeur};`;
    this.hote.refuser(`« changer ${nom} » : un calcul ne se change pas, il se recalcule`);
    return undefined;
  }

  private ecrireAffectation(e: Ecrivain, nom: string, valeur: (actuel: string) => string): void {
    const lieu = this.lieu(nom);
    if (!lieu) return;
    const ligne = this.affecter(lieu, nom, valeur(lieu.signal ? `${lieu.signal}.Valeur` : lieu.lire));
    if (ligne) e.ligne(ligne);
  }

  private action(e: Ecrivain, a: Action, c: Cadre): void {
    switch (a.type) {
      case 'affectation':
        return this.ecrireAffectation(e, a.nom, (actuel) => (a.champs?.length ? `V.AvecChamp(${actuel}, new[] { ${a.champs.map((ch) => chaineCs(cleJson(ch))).join(', ')} }, ${this.x.expr(a.valeur)})` : this.x.expr(a.valeur)));
      case 'locale': {
        const nom = nomCs(a.nom);
        e.ligne(`object? ${nom} = ${this.x.expr(a.valeur)};`);
        this.x.portee.variables.set(a.nom, { lire: nom, locale: nom });
        return;
      }
      case 'ajout':
        return this.ecrireAffectation(e, a.liste, (actuel) => `V.Ajouter(${actuel}, ${this.x.expr(a.valeur)})`);
      case 'retrait':
        return this.ecrireAffectation(e, a.liste, (actuel) => `V.Retirer(${actuel}, ${this.x.expr(a.valeur)})`);
      case 'si':
        e.ligne(`if (${this.x.condition(a.test)})`);
        e.ligne('{');
        this.branche(e, a.alors, c);
        e.ligne('}');
        if (a.sinon.length > 0) {
          e.ligne('else');
          e.ligne('{');
          this.branche(e, a.sinon, c);
          e.ligne('}');
        }
        return;
      case 'repetition': {
        const element = this.x.nouveauNom('Element');
        const nom = nomCs(a.variable);
        e.ligne(`foreach (var ${element} in V.L(${this.x.expr(a.liste)}))`);
        e.ligne('{');
        e.indenter(() => e.ligne(`object? ${nom} = ${element};`));
        this.branche(e, a.corps, { ...c, boucle: true }, [[a.variable, { lire: nom, locale: nom }]]);
        e.ligne('}');
        return;
      }
      case 'tantQue':
        e.ligne(`while (${this.x.condition(a.test)})`);
        e.ligne('{');
        this.branche(e, a.corps, { ...c, boucle: true });
        e.ligne('}');
        return;
      case 'repeter': {
        const i = this.x.nouveauNom('Fois');
        e.ligne(`for (var ${i} = 0; ${i} < (int)${this.x.enNombre(a.fois)}; ${i}++)`);
        e.ligne('{');
        this.branche(e, a.corps, { ...c, boucle: true });
        e.ligne('}');
        return;
      }
      case 'arreter':
        if (!c.boucle && c.minuterie) {
          e.ligne(`${c.minuterie}?.Arreter();`);
          e.ligne('return;');
        } else if (c.boucle) e.ligne('break;');
        else e.ligne('return;');
        return;
      case 'passer':
        e.ligne(c.boucle ? 'continue;' : 'return;');
        return;
      case 'selon': {
        const valeur = this.x.nouveauNom('Selon');
        e.ligne(`var ${valeur} = ${this.x.expr(a.valeur)};`);
        a.cas.forEach((cas, i) => {
          e.ligne(`${i === 0 ? 'if' : 'else if'} (${cas.valeurs.map((v) => `V.Egal(${valeur}, ${this.x.expr(v)})`).join(' || ')})`);
          e.ligne('{');
          this.branche(e, cas.corps, c);
          e.ligne('}');
        });
        if (a.sinon.length > 0) {
          if (a.cas.length > 0) e.ligne('else');
          e.ligne('{');
          this.branche(e, a.sinon, c);
          e.ligne('}');
        }
        return;
      }
      case 'essayer': {
        const erreur = this.x.nouveauNom('Erreur');
        e.ligne('try');
        e.ligne('{');
        this.branche(e, a.corps, { ...c, essai: true });
        e.ligne('}');
        e.ligne(`catch (ErreurHumalis ${erreur})`);
        e.ligne('{');
        e.indenter(() => e.ligne(`object? raison = ${erreur}.Message;`));
        this.branche(e, a.siErreur, c, [['raison', { lire: 'raison', locale: 'raison' }]]);
        e.ligne('}');
        return;
      }
      case 'rendre':
        e.ligne(`return ${this.x.expr(a.valeur)};`);
        return;
      case 'message': {
        const args = [this.x.enTexte(a.texte), chaineCs(a.genre)];
        if (a.duree || a.persistant || a.action) args.push(a.duree ? this.x.enNombre(a.duree) : '4000');
        if (a.persistant || a.action) args.push(a.persistant ? 'true' : 'false');
        if (a.action) {
          e.ligne(`Messages.Afficher(${args.join(', ')}, ${chaineCs(a.action.libelle)}, async () =>`);
          e.ligne('{');
          this.branche(e, a.action.actions, { essai: false, formulaire: false, boucle: false });
          e.indenter(() => e.ligne('await Task.CompletedTask;'));
          e.ligne('});');
        } else e.ligne(`Messages.Afficher(${args.join(', ')});`);
        return;
      }
      case 'confirmation': {
        const options = a.oui !== 'Oui' || a.non !== 'Non' ? `, ${chaineCs(a.oui)}, ${chaineCs(a.non)}` : '';
        e.ligne(`if (await Messages.Confirmer(${this.x.enTexte(a.question)}${options}))`);
        e.ligne('{');
        this.branche(e, a.alors, c);
        e.ligne('}');
        if (a.sinon.length > 0) {
          e.ligne('else');
          e.ligne('{');
          this.branche(e, a.sinon, c);
          e.ligne('}');
        }
        return;
      }
      case 'minuterie': {
        if (!this.hote.dansUnePage) return this.hote.refuser('une minuterie dans une fonction');
        const nom = this.x.nouveauNom('Minuterie');
        const tantQue = a.tantQue ? `, () => ${this.x.condition(a.tantQue)}` : '';
        e.ligne(`Minuterie? ${nom} = null;`);
        e.ligne(`${nom} = Minuterie.${a.mode === 'apres' ? 'Apres' : 'Toutes'}(${this.x.enNombre(a.millisecondes)}, async () =>`);
        e.ligne('{');
        this.branche(e, a.corps, { essai: false, formulaire: false, boucle: false, minuterie: nom });
        e.indenter(() => e.ligne('await Task.CompletedTask;'));
        e.ligne(`}${tantQue});`);
        e.ligne(`Arreter(${nom});`);
        return;
      }
      case 'visibilite':
        for (const id of a.ids) e.ligne(`Visibilite(${chaineCs(id)}${this.hote.fenetres.has(id) ? ', false' : ''}).Ecrire(${a.visible});`);
        return;
      case 'changerTexte':
        for (const id of a.ids) e.ligne(`ChangerTexte(${chaineCs(id)}, ${this.x.enTexte(a.texte)});`);
        return;
      case 'navigation':
        return this.navigation(e, a.ecran, a.arguments, a.continuer);
      case 'filtre':
        return this.ecrireAffectation(e, a.nom, () => this.x.expr(a.valeur));
      case 'retour':
        e.ligne(`Routeur.Revenir(${a.vers !== undefined ? chaineCs(a.vers) : ''});`);
        return;
      case 'viderChamp': {
        const champ = this.x.portee.champs.get(a.id);
        if (champ) e.ligne(`${champ.signal}.Ecrire(${champ.sorte === 'case' ? 'false' : champ.sorte === 'nombre' ? '(object?)null' : '""'});`);
        return;
      }
      case 'theme':
        e.ligne(`Apparence.Definir(${chaineCs(a.valeur)});`);
        return;
      case 'copie': {
        const message = a.message === null ? 'null' : a.texte ? this.x.enTexte(a.texte) : chaineCs(a.message);
        e.ligne(`Messages.Copier(${this.x.enTexte(a.valeur)}, ${message});`);
        return;
      }
      case 'partage': {
        // Pas de feuille de partage ici : le texte (et le lien externe) vont au presse-papiers.
        const lien = a.lien && 'externe' in a.lien ? ` + "\\n" + ${chaineCs(a.lien.externe)}` : '';
        e.ligne(`Messages.Copier(${this.x.enTexte(a.texte)}${lien}, "Copié : vous pouvez le coller où vous voulez.");`);
        return;
      }
      case 'telechargementCsv':
        e.ligne(`await Messages.TelechargerCsv(${this.x.expr(a.liste)}, ${chaineCs(a.fichier)});`);
        return;
      case 'requete':
        return this.requete(e, a, c);
      case 'recharger':
        e.ligne(`await Recharger(${chaineCs(a.variable)});`);
        return;
      case 'suppression':
      case 'modification':
        return this.ecriture(e, a, c);
      case 'optimiste':
        return this.optimiste(e, a, c);
      case 'connexion':
        return this.compte(e, c, `Session.SeConnecter(${this.x.enTexte(a.email)}, ${this.x.enTexte(a.motDePasse)})`);
      case 'changementMotDePasse':
        return this.compte(e, c, `Session.ChangerMotDePasse(${this.x.enTexte(a.actuel)}, ${this.x.enTexte(a.nouveau)})`);
      case 'deconnexion':
        e.ligne('await Session.SeDeconnecter();');
        return;
      case 'langue':
        e.ligne(`Langues.Changer(${chaineCs(a.code)});`);
        return;
      default:
        return this.hote.refuser(`« ${NOMS_ACTIONS[a.type] ?? a.type} »`);
    }
  }

  private navigation(e: Ecrivain, ecran: Valeur, args?: ArgumentsPage, continuer?: boolean): void {
    const fixe = ecran.type === 'texte' && !ecran.versions && ecran.parties.every((p) => 'texte' in p) ? ecran.parties.map((p) => ('texte' in p ? p.texte : '')).join('') : undefined;
    const page = fixe !== undefined ? chaineCs(fixe) : this.x.enTexte(ecran);
    e.ligne(`Routeur.${continuer ? 'Continuer' : 'Aller'}(${page}${this.arguments(args)});`);
  }

  /** `, new Arguments { ["id"] = … }` : les valeurs données à la page. */
  arguments(args?: ArgumentsPage): string {
    if (!args?.length) return '';
    return `, new Arguments { ${args.map((a) => `[${chaineCs(a.nom)}] = ${this.x.expr(a.valeur)}`).join(', ')} }`;
  }

  /** Une action sur le compte : refusée, le message s'affiche et la suite ne s'exécute pas. */
  private compte(e: Ecrivain, c: Cadre, appel: string): void {
    if (c.essai) e.ligne(`await ${appel};`);
    else e.ligne(`if (!await Session.AfficherSiRefus(() => ${appel})) return;`);
  }

  // ─── Serveur ─────────────────────────────────────────────────────────────

  /** `V.FicheDe(("email", …))` : les données envoyées, sous les noms que le serveur attend. */
  private donnees(valeurs: Valeur[], cles: (string | undefined)[] | undefined, versLeServeur: boolean): string {
    const paires = valeurs.map((v, i) => {
      const ecrite = cles?.[i];
      const cle = ecrite !== undefined ? (versLeServeur && /^[A-Za-z_]\w*$/.test(ecrite) ? cleJson(ecrite) : ecrite) : v.type === 'champ' ? (this.x.portee.champs.get(v.id)?.cle ?? v.id) : v.type === 'variable' ? cleJson(v.nom) : v.type === 'champDonnee' ? cleJson(v.champ) : 'valeur';
      return `(${chaineCs(cle)}, ${this.x.expr(v)})`;
    });
    return `V.FicheDe(${paires.join(', ')})`;
  }

  private requete(e: Ecrivain, a: Extract<Action, { type: 'requete' }>, c: Cadre): void {
    if (!this.hote.dansUnePage) return this.hote.refuser('une requête dans une fonction');
    const options: string[] = [];
    if (a.mode === 'envoyer') options.push(`envoi: ${this.donnees(a.donnees, a.cles, a.source === undefined)}`);
    if (a.mode === 'lireUn') options.push(`id: ${this.x.enTexte(a.donnees[0])}`);
    if (a.source !== undefined) options.push(`source: ${sourceCs(a.source)}`);
    if (a.filtrant?.length) options.push(`filtres: new (string, object?)[] { ${a.filtrant.map((f) => `(${chaineCs(f.cle)}, ${this.x.expr(f.valeur)})`).join(', ')} }`);
    if (a.dans !== undefined) options.push(`dans: ${chaineCs(a.dans)}`);
    const adresse = chaineCs(a.adresse);
    const resultat = a.resultat !== undefined ? this.lieu(a.resultat) : undefined;
    if (a.resultat !== undefined && !resultat) return;

    if (!resultat) {
      const fin = options.length ? `, ${options.join(', ')}` : '';
      if (c.essai) e.ligne(`await Serveur.Appel(${adresse}${fin});`);
      else if (c.formulaire && a.mode === 'envoyer') e.ligne(`if (!await Serveur.Reussi(${adresse}${fin})) return;`);
      else e.ligne(`await Serveur.Reussi(${adresse}${fin});`);
      return;
    }

    const suivie = this.hote.etatsRequetes.has(a.resultat!);
    if (suivie) options.push(`suivi: Etat(${chaineCs(a.resultat!)})`);
    const fin = options.length ? `, ${options.join(', ')}` : '';
    const n = ++this.numero;
    const ecrire = (valeur: string) => this.affecter(resultat, a.resultat!, valeur) ?? '';

    if (c.essai) {
      e.ligne(`var hValeur${n} = await Serveur.Appel(${adresse}${fin});`);
      e.ligne(`if (hValeur${n} is not null) ${ecrire(`hValeur${n}`)}`);
      return;
    }
    const lecture = a.mode !== 'envoyer';
    // Une lecture sait se rejouer : « recharger » et la page s'en servent.
    if (lecture && suivie) {
      e.ligne(`relances[${chaineCs(a.resultat!)}] = async () =>`);
      e.ligne('{');
      e.indenter(() => {
        e.ligne(`var (hOk${n}, hValeur${n}) = await Serveur.Lire(${adresse}${fin});`);
        e.ligne(`if (hOk${n} && hValeur${n} is not null) ${ecrire(`hValeur${n}`)}`);
      });
      e.ligne('};');
      e.ligne(`await relances[${chaineCs(a.resultat!)}]();`);
      return;
    }
    // Une réponse arrivée après celle d'une requête plus récente (une recherche tapée vite) ne remplace rien.
    e.ligne(`var hJeton${n} = Jeton(${chaineCs(a.resultat!)});`);
    e.ligne(`var (hOk${n}, hValeur${n}) = await Serveur.Lire(${adresse}${fin});`);
    if (c.formulaire && !lecture) e.ligne(`if (!hOk${n}) return;`);
    e.ligne(`if (hOk${n} && hValeur${n} is not null && EstDernier(${chaineCs(a.resultat!)}, hJeton${n})) ${ecrire(`hValeur${n}`)}`);
  }

  private ecriture(e: Ecrivain, a: Extract<Action, { type: 'suppression' | 'modification' }>, c: Cadre): void {
    if (!this.hote.dansUnePage) return this.hote.refuser('un envoi au serveur dans une fonction');
    const source = a.source !== undefined ? `, source: ${sourceCs(a.source)}` : '';
    const id = `id: Serveur.Identifiant(${this.x.expr(a.objet)})`;
    let appel: string;
    if (a.type === 'suppression') appel = `${chaineCs(a.adresse)}, "DELETE", ${id}${source}`;
    else {
      const paires = a.changements.map((ch) => `(${chaineCs(a.source === undefined ? cleJson(ch.champ) : ch.champ)}, ${this.x.expr(ch.valeur)})`);
      appel = `${chaineCs(a.adresse)}, ${a.remplacement ? '"PUT"' : '"PATCH"'}, envoi: V.FicheDe(${paires.join(', ')}), ${id}${source}`;
    }
    if (c.essai) e.ligne(`await Serveur.Appel(${appel});`);
    else if (c.formulaire) e.ligne(`if (!await Serveur.Reussi(${appel})) return;`);
    else e.ligne(`await Serveur.Reussi(${appel});`);
  }

  /** « … de facon optimiste » : la page change tout de suite ; un refus du serveur remet les valeurs d'avant. */
  private optimiste(e: Ecrivain, a: Extract<Action, { type: 'optimiste' }>, c: Cadre): void {
    const avant = this.x.nouveauNom('Avant');
    const lieux = a.variables.map((v) => ({ v, lieu: this.lieu(v) })).filter((l) => l.lieu?.signal);
    e.ligne(`var ${avant} = new object?[] { ${lieux.map((l) => `${l.lieu!.signal}.Valeur`).join(', ')} };`);
    e.ligne('try');
    e.ligne('{');
    this.branche(e, a.corps, { ...c, essai: true });
    e.ligne('}');
    const erreur = this.x.nouveauNom('Erreur');
    e.ligne(`catch (ErreurHumalis ${erreur})`);
    e.ligne('{');
    e.indenter(() => {
      lieux.forEach((l, i) => e.ligne(`${l.lieu!.signal}.Ecrire(${avant}[${i}]);`));
      if (c.essai) e.ligne('throw;');
      else {
        e.ligne(`Messages.Afficher(${erreur}.Message, "erreur");`);
        if (c.formulaire) e.ligne('return;');
      }
    });
    e.ligne('}');
  }
}

/** Le nom d'une action qui n'existe pas encore sur Windows, tel qu'on l'écrit en Humalis. */
const NOMS_ACTIONS: Partial<Record<Action['type'], string>> = {
  envoiFichier: 'envoyer fichier',
  telechargementBon: 'telecharger bon de commande',
  connexionGoogle: 'se connecter avec google',
  connexionApple: 'se connecter avec apple',
  invitation: 'inviter',
  changementCompte: 'changer compte',
  paiement: 'payer',
  demandeIa: 'demander a ia',
  activationNotifications: 'activer notifications',
  prisePhoto: 'photo dans',
  localisation: 'position dans',
  scanCode: 'scanner code',
  verificationIdentite: 'verifier identite',
  vibration: 'vibrer',
  changementRole: 'changer role',
  demandeLienMotDePasse: 'demander un lien de mot de passe',
  choixMotDePasse: 'choisir le mot de passe',
};
