/**
 * Vérifie ce qui s'exécute sur le serveur et le traduit pour le générateur. Une seule passe :
 * l'analyse s'en sert pour les erreurs, la construction de la RI pour le résultat.
 */
import type { ApresPaiement, ActionServeur, DocumentServeur, EnvoiNotification, Donnee, Expression, FiltreServeur, InstructionServeur, ResumeServeur, Serveur, TachePlanifiee, Test } from '../parser/ast.js';
import type { FiltreServeurRI, InstructionServeurRI, LigneDocumentRI, ResumeRI, TestServeurRI, ValeurServeurRI } from '../ri/types.js';
import { simplifier } from './elements.js';
import { proposerNom } from './suggestions.js';

type Portee = Map<string, Donnee>;
type Erreur = (message: string, ligne: number) => void;

/**
 * Les services du projet, le temps d'une analyse ou d'une construction : une action peut lire une fiche d'un autre
 * service, lui demander une action, ou lui signaler un message. Un seul serveur : rien ne change.
 */
let projet: Serveur[] = [];
export function avecServices<T>(serveurs: Serveur[], faire: () => T): T {
  const avant = projet;
  projet = serveurs;
  try {
    return faire();
  } finally {
    projet = avant;
  }
}

const routeNormalisee = (adresse: string) => adresse.replace(/^\/+|\/+$/g, '');

/** Les services qui écoutent ce message de ce service. */
export const ecoutantsDe = (serveur: string, message: string): string[] => projet.filter((s) => (s.receveurs ?? []).some((r) => r.serveur === serveur && r.message === message)).map((s) => s.nom);

/** Le service écrit-il « signaler "message" » quelque part ? */
function signaleLeMessage(serveur: Serveur, message: string): boolean {
  return JSON.stringify([serveur.routes, serveur.taches ?? [], serveur.receveurs ?? []]).includes('"type":"Signaler","message":' + JSON.stringify(message));
}

/** La donnée d'une fiche signalée : lue dans les instructions du service qui signale. */
export function donneeDuMessage(serveur: Serveur, message: string): Donnee | undefined {
  let trouvee: Donnee | undefined;
  const parcourir = (liste: InstructionServeur[], portee: Portee) => {
    const ici = new Map(portee);
    for (const i of liste) {
      if (i.type === 'Signaler' && i.message === message && !trouvee) trouvee = ici.get(i.fiche);
      else if (i.type === 'PourChaqueServeur') {
        const d = serveur.donnees.find((x) => x.nom === i.donnee);
        parcourir(i.corps, d ? new Map(ici).set(i.variable, d) : ici);
      } else if (i.type === 'SiServeur') {
        parcourir(i.alors, ici);
        parcourir(i.sinon, ici);
      } else if (i.type === 'AppelService') {
        const autre = projet.find((x) => x.nom === i.serveur);
        const route = autre?.routes.find((r) => routeNormalisee(r.adresse) === routeNormalisee(i.route));
        const d = autre?.donnees.find((x) => x.nom === route?.regles[0]?.donnee);
        if (d) ici.set(i.variable, d);
      }
    }
  };
  for (const route of serveur.routes) {
    for (const action of route.actions ?? []) {
      const d = serveur.donnees.find((x) => x.nom === action.donnee);
      parcourir(action.corps, d ? new Map([[d.nom, d]]) : new Map());
    }
    if (route.apresPaiement) {
      const d = serveur.donnees.find((x) => x.nom === route.apresPaiement!.donnee);
      parcourir(route.apresPaiement.corps, d ? new Map([[d.nom, d]]) : new Map());
    }
  }
  for (const tache of serveur.taches ?? []) parcourir(tache.corps, new Map());
  for (const receveur of serveur.receveurs ?? []) {
    const emetteur = projet.find((x) => x.nom === receveur.serveur);
    const d = emetteur && emetteur !== serveur ? donneeDuMessage(emetteur, receveur.message) : undefined;
    parcourir(receveur.corps, d ? new Map([[receveur.variable, d]]) : new Map());
  }
  return trouvee;
}

const champDe = (d: Donnee, c: string) => d.champs.find((x) => simplifier(x.nom) === simplifier(c));
const vide: ValeurServeurRI = { genre: 'valeur', valeur: '' };

class Traduction {
  constructor(
    private readonly serveur: Serveur,
    private readonly erreur: Erreur,
    private readonly avecUtilisateur: boolean,
    private locaux = new Set<string>(),
    private readonly avecErreur = false,
  ) {}

  /** Une fiche qu'une lecture fautive n'a pas pu nommer : déjà signalée, elle ne l'est pas une seconde fois plus bas. */
  private readonly sansDonnee = new Set<string>();

  /** « statut est "ouverte" et total est superieur a 100 » : les champs existent. */
  filtres(liste: FiltreServeur[], donnee: Donnee, portee: Portee, ligne: number): FiltreServeurRI[] {
    return liste.map(({ champ, operateur, valeur }) => {
      const trouve = simplifier(champ) === 'id' ? { nom: 'id' } : champDe(donnee, champ);
      if (!trouve) this.erreur(`la donnée « ${donnee.nom} » n'a pas de champ « ${champ} ». Champs : ${donnee.champs.map((c) => c.nom).join(', ')}.${proposerNom(champ, donnee.champs.map((c) => c.nom))}`, ligne);
      return { champ: trouve?.nom ?? champ, operateur, valeur: this.valeur(valeur, portee) };
    });
  }

  /** « commande.total », « utilisateur.id » : ce que la valeur désigne. */
  private acces(nom: string, champ: string, portee: Portee, ligne: number): ValeurServeurRI {
    if (nom === 'erreur' && this.avecErreur) {
      if (champ === 'message' || champ === 'pile' || champ === 'page' || champ === 'version' || champ === 'ligne') return { genre: 'erreur', champ };
      this.erreur(`la capture ne connaît pas « erreur.${champ} » : champs disponibles : message, pile, page et version.`, ligne);
      return vide;
    }
    if (nom === 'utilisateur') {
      if (!this.avecUtilisateur) this.erreur('une tâche planifiée tourne sans personne connectée : « utilisateur » n’existe pas ici.', ligne);
      return { genre: 'utilisateur', champ };
    }
    const donnee = portee.get(nom);
    if (!donnee) {
      if (!this.sansDonnee.has(nom)) this.erreur(`« ${nom} » n'existe pas ici. Valeurs connues : ${[...portee.keys()].join(', ') || 'aucune'}.${proposerNom(nom, [...portee.keys()])}`, ligne);
      return vide;
    }
    if (simplifier(champ) === 'id') return { genre: 'champ', fiche: nom, champ: 'id' };
    const trouve = champDe(donnee, champ);
    if (!trouve) {
      this.erreur(`la donnée « ${donnee.nom} » n'a pas de champ « ${champ} ». Champs : ${donnee.champs.map((c) => c.nom).join(', ')}.${proposerNom(champ, donnee.champs.map((c) => c.nom))}`, ligne);
      return vide;
    }
    return { genre: 'champ', fiche: nom, champ: trouve.nom };
  }

  valeur(e: Expression, portee: Portee): ValeurServeurRI {
    switch (e.type) {
      case 'Nombre':
      case 'Booleen':
        return { genre: 'valeur', valeur: e.valeur as number | boolean };
      case 'Chaine':
        return {
          genre: 'texte',
          parties: e.parties.map((p) => {
            if (p.type !== 'variable') return { texte: p.valeur };
            const [nom, champ, ...reste] = p.valeur.split('.');
            if (champ === undefined && this.locaux.has(nom)) return { valeur: { genre: 'local', nom } };
            if (champ === undefined || reste.length > 0) {
              this.erreur(`« {${p.valeur}} » : sur le serveur, on montre le champ d'une fiche, par exemple {commande.total}.`, e.ligne);
              return { texte: '' };
            }
            return { valeur: this.acces(nom, champ, portee, e.ligne) };
          }),
        };
      case 'AccesChamp':
        if (e.objet.type === 'Reference') return this.acces(e.objet.nom, e.champ, portee, e.ligne);
        break;
      case 'Calcul':
        return { genre: 'calcul', operateur: e.operateur, gauche: this.valeur(e.gauche, portee), droite: this.valeur(e.droite, portee) };
      case 'Reference':
        if (simplifier(e.nom) === 'aujourdhui') return { genre: 'aujourdhui' };
        if (this.locaux.has(e.nom)) return { genre: 'local', nom: e.nom };
        break;
      default:
        break;
    }
    this.erreur('sur le serveur, une valeur est un texte, un nombre, un champ de fiche (commande.total) ou un calcul avec eux.', (e as { ligne: number }).ligne);
    return vide;
  }

  test(t: Test, portee: Portee): TestServeurRI {
    if (t.type === 'Combinaison') return { genre: 'combinaison', operateur: t.operateur, gauche: this.test(t.gauche, portee), droite: this.test(t.droite, portee) };
    return {
      genre: 'comparaison',
      operateur: t.operateur,
      gauche: this.valeur(t.gauche, portee),
      ...(t.droite ? { droite: this.valeur(t.droite, portee) } : {}),
      ...(t.negation ? { negation: true } : {}),
    };
  }

  /** Une notification : si une fiche séparée est là, seuls les comptes de son groupe la reçoivent. */
  notification(envoi: EnvoiNotification, portee: Portee): Extract<InstructionServeurRI, { type: 'notification' }> {
    const { destinataire: d, ligne } = envoi;
    const texte = (morceaux: EnvoiNotification['titre']) => this.valeur({ type: 'Chaine', parties: morceaux, ligne }, portee);
    if (d.genre === 'roles') for (const role of d.roles) if (!(this.serveur.roles ?? []).includes(role) && role !== 'admin') this.erreur(`le rôle « ${role} » n'est pas déclaré. Ajoutez-le au serveur : roles ${[...(this.serveur.roles ?? []), role].join(', ')}.`, ligne);
    const groupe = [...portee.entries()].reverse().find(([, donnee]) => donnee.par !== undefined && donnee.par !== 'compte');
    return {
      type: 'notification',
      a: d.genre === 'roles' ? { genre: 'roles', roles: d.roles, ...(groupe ? { groupe: { champ: groupe[1].par!, fiche: groupe[0] } } : {}) } : { genre: 'compte', valeur: this.acces(d.donnee, d.champ, portee, ligne) },
      titre: texte(envoi.titre),
      texte: texte(envoi.texte),
      ...(envoi.boutons?.length ? { boutons: envoi.boutons } : {}),
    };
  }

  corps(liste: InstructionServeur[], portee: Portee): InstructionServeurRI[] {
    const avant = this.locaux;
    this.locaux = new Set(avant);
    const traduites = liste.map((i) => this.instruction(i, portee));
    this.locaux = avant;
    return traduites;
  }

  private distante(nom: string, donnee: Donnee): string {
    const proprietaire = projet.find((x) => x.donnees.includes(donnee));
    return `« ${nom} » est une fiche du serveur « ${proprietaire?.nom ?? '?'} » : elle ne se change pas ici. Demandez-le à ce service (faire "…" sur ${nom} du serveur "${proprietaire?.nom ?? '…'}"), ou signalez un message.`;
  }

  /** Un autre service du projet, nommé. */
  private serviceDistant(nom: string, ligne: number): Serveur | undefined {
    const autre = projet.find((x) => x.nom === nom);
    if (!autre) {
      const noms = projet.filter((x) => x !== this.serveur).map((x) => x.nom);
      this.erreur(`le serveur « ${nom} » n'existe pas dans le projet. Serveurs : ${noms.join(', ') || 'aucun autre'}.${proposerNom(nom, noms)}`, ligne);
      return undefined;
    }
    if (autre === this.serveur) {
      this.erreur(`« du serveur "${nom}" » vise un autre service : ici, on lit et on change les fiches de « ${nom} » directement.`, ligne);
      return undefined;
    }
    return autre;
  }

  /** Une route d'un autre service, et sa donnée. */
  private routeDistante(serveur: string, adresse: string, ligne: number): { route: Serveur['routes'][number]; donnee: Donnee } | undefined {
    const autre = this.serviceDistant(serveur, ligne);
    if (!autre) return undefined;
    const route = autre.routes.find((r) => routeNormalisee(r.adresse) === routeNormalisee(adresse) && !r.interne);
    const donnee = autre.donnees.find((d) => d.nom === route?.regles[0]?.donnee);
    if (!route || !donnee) {
      const routes = autre.routes.filter((r) => !r.interne).map((r) => r.adresse);
      this.erreur(`le serveur « ${serveur} » n'a pas de route « ${adresse} ». Routes : ${routes.join(', ') || 'aucune'}.${proposerNom(adresse, routes)}`, ligne);
      return undefined;
    }
    return { route, donnee };
  }

  /** La donnée nommée, sinon un message. */
  private donneeDe(nom: string, ligne: number): Donnee | undefined {
    const donnee = this.serveur.donnees.find((d) => d.nom === nom && !d.comptes);
    if (!donnee) this.erreur(`la donnée « ${nom} » n'existe pas. Données : ${this.serveur.donnees.filter((d) => !d.comptes).map((d) => d.nom).join(', ')}.`, ligne);
    return donnee;
  }

  /** « calcul x = somme de total » : le champ est un nombre, sauf pour compter. */
  champCalcul(donnee: Donnee, operation: string, champ: string | undefined, ligne: number): string | undefined {
    if (operation === 'nombre' || champ === undefined) return undefined;
    const trouve = champDe(donnee, champ);
    if (trouve?.type.genre !== 'nombre') this.erreur(`« ${champ} » doit être un champ nombre de « ${donnee.nom} » pour ce calcul.`, ligne);
    return trouve?.nom ?? champ;
  }

  /** Une ligne « tableau de … ou … avec colonnes … » d'un document. */
  tableau(l: Extract<DocumentServeur['lignes'][number], { genre: 'tableau' }>, parent: Donnee): LigneDocumentRI {
    const liee = this.donneeDe(l.donnee, l.ligne);
    if (!liee) return { genre: 'texte', valeur: vide };
    const portee: Portee = new Map([[parent.nom, parent]]);
    if (liee.par !== undefined && liee.par !== parent.par) this.erreur(`« tableau de ${liee.nom} » : cette donnée est séparée par ${liee.par}, et « ${parent.nom} » ${parent.par ? `par ${parent.par}` : "ne l'est pas"}. Les deux doivent l'être de la même façon.`, l.ligne);
    const colonnes = l.colonnes.map((c) => {
      const trouve = simplifier(c) === 'id' ? { nom: 'id' } : champDe(liee, c);
      if (!trouve) this.erreur(`la donnée « ${liee.nom} » n'a pas de champ « ${c} ». Champs : ${liee.champs.map((x) => x.nom).join(', ')}.`, l.ligne);
      return trouve?.nom ?? c;
    });
    return { genre: 'tableau', donnee: liee.nom, filtres: this.filtres(l.filtres, liee, portee, l.ligne), colonnes, ...(liee.par !== undefined ? { groupeDe: parent.nom } : {}) };
  }

  /** Chaque instruction garde sa ligne Humalis (cartes de sources du serveur). */
  private instruction(i: InstructionServeur, portee: Portee): InstructionServeurRI {
    const resultat = this.instructionSansLigne(i, portee);
    return i.ligne > 0 ? { ...resultat, ligne: i.ligne } : resultat;
  }

  private instructionSansLigne(i: InstructionServeur, portee: Portee): InstructionServeurRI {
    switch (i.type) {
      case 'RequeteServeur': {
        if (!this.avecErreur) {
          this.erreur('« envoyer requete » s’écrit seulement dans « quand une erreur arrive » du serveur.', i.ligne);
          return { type: 'requete', adresse: i.adresse, champs: [] };
        }
        const vus = new Set<string>();
        for (const champ of i.champs) {
          if (vus.has(champ.nom)) this.erreur(`le champ « ${champ.nom} » est envoyé deux fois dans la requête.`, i.ligne);
          vus.add(champ.nom);
          if (/mot.?de.?passe|password|secret|formulaire|token|jeton/i.test(champ.nom)) this.erreur(`le champ « ${champ.nom} » ne peut pas être envoyé par une capture d'erreur.`, i.ligne);
        }
        const champs = i.champs.map((c) => ({ nom: c.nom, valeur: this.valeur(c.valeur, portee) }));
        const sure = (v: ValeurServeurRI): boolean => v.genre === 'erreur' || (v.genre === 'valeur' && v.valeur === '') || (v.genre === 'texte' && v.parties.every((p) => 'texte' in p || sure(p.valeur)));
        if (this.avecErreur && champs.some((c) => !sure(c.valeur))) this.erreur('la capture du serveur n’envoie que erreur.message, erreur.pile, erreur.ligne, erreur.page, erreur.version ou un texte fixe.', i.ligne);
        return { type: 'requete', adresse: i.adresse, ...(i.adresseEnvironnement !== undefined ? { adresseEnvironnement: i.adresseEnvironnement } : {}), champs };
      }
      case 'SiServeur':
        return { type: 'si', test: this.test(i.test, portee), alors: this.corps(i.alors, portee), sinon: this.corps(i.sinon, portee) };
      case 'PourChaqueServeur': {
        const donnee = this.serveur.donnees.find((d) => d.nom === i.donnee && !d.comptes);
        if (!donnee) {
          this.erreur(`la donnée « ${i.donnee} » n'existe pas. Données : ${this.serveur.donnees.filter((d) => !d.comptes).map((d) => d.nom).join(', ')}.`, i.ligne);
          return { type: 'si', test: { genre: 'combinaison', operateur: 'et', gauche: { genre: 'comparaison', operateur: 'vrai', gauche: vide }, droite: { genre: 'comparaison', operateur: 'vrai', gauche: vide } }, alors: [], sinon: [] };
        }
        const filtres = this.filtres(i.filtres, donnee, portee, i.ligne);
        const interieur = new Map(portee).set(i.variable, donnee);
        return {
          type: 'pourChaque',
          variable: i.variable,
          donnee: donnee.nom,
          filtres,
          corps: this.corps(i.corps, interieur),
        };
      }
      case 'CalculServeur': {
        const donnee = this.donneeDe(i.donnee, i.ligne);
        const filtres = donnee ? this.filtres(i.filtres, donnee, portee, i.ligne) : [];
        const champ = donnee ? this.champCalcul(donnee, i.operation, i.champ, i.ligne) : undefined;
        this.locaux.add(i.nom);
        return { type: 'calcul', nom: i.nom, operation: i.operation, donnee: i.donnee, ...(champ !== undefined ? { champ } : {}), filtres };
      }
      case 'ChangerChamp': {
        const donnee = portee.get(i.cible);
        const champ = donnee ? champDe(donnee, i.champ) : undefined;
        if (donnee && !this.serveur.donnees.includes(donnee)) this.erreur(this.distante(i.cible, donnee), i.ligne);
        else if (!donnee) this.erreur(`« ${i.cible} » n'existe pas ici. Valeurs connues : ${[...portee.keys()].join(', ')}.`, i.ligne);
        else if (!champ) this.erreur(`la donnée « ${donnee.nom} » n'a pas de champ « ${i.champ} ». Champs : ${donnee.champs.map((c) => c.nom).join(', ')}.`, i.ligne);
        else if (champ.regle?.genre === 'groupe') this.erreur(`« ${champ.nom} » désigne le groupe de la fiche : on ne le change pas.`, i.ligne);
        return { type: 'changer', fiche: i.cible, donnee: donnee?.nom ?? '', champ: champ?.nom ?? i.champ, valeur: this.valeur(i.valeur, portee) };
      }
      case 'SupprimerFiche': {
        const donnee = portee.get(i.cible);
        if (donnee && !this.serveur.donnees.includes(donnee)) this.erreur(this.distante(i.cible, donnee), i.ligne);
        else if (!donnee) this.erreur(`« ${i.cible} » n'existe pas ici. Valeurs connues : ${[...portee.keys()].join(', ')}.`, i.ligne);
        return { type: 'supprimer', fiche: i.cible, donnee: donnee?.nom ?? '' };
      }
      case 'AppelService': {
        const lue = this.routeDistante(i.serveur, i.route, i.ligne);
        const id = this.valeur(i.id, portee);
        if (!lue) {
          this.sansDonnee.add(i.variable);
          return { type: 'appelService', serveur: i.serveur, route: i.route, id, variable: i.variable };
        }
        if (!this.avecUtilisateur && !(lue.route.droitsServices ?? []).some((d) => d.serveur === this.serveur.nom && d.actions.includes('lire'))) {
          this.erreur(`ici, personne n'est connecté : le serveur « ${this.serveur.nom} » lit « ${lue.route.adresse} » en son propre nom. Donnez-lui ce droit dans la route du serveur « ${i.serveur} » : le serveur "${this.serveur.nom}" peut lire ${lue.donnee.nom}`, i.ligne);
        }
        portee.set(i.variable, lue.donnee);
        return { type: 'appelService', serveur: i.serveur, route: routeNormalisee(lue.route.adresse), id, variable: i.variable };
      }
      case 'FaireService': {
        const donnee = portee.get(i.cible);
        const valeurs = i.valeurs.map((v) => ({ nom: v.nom, valeur: this.valeur(v.valeur, portee) }));
        const autre = this.serviceDistant(i.serveur, i.ligne);
        if (!donnee) {
          if (!this.sansDonnee.has(i.cible)) this.erreur(`« ${i.cible} » n'existe pas ici. Valeurs connues : ${[...portee.keys()].join(', ') || 'aucune'}.`, i.ligne);
          return { type: 'faireService', serveur: i.serveur, route: '', action: i.action, fiche: i.cible, valeurs };
        }
        if (!autre) return { type: 'faireService', serveur: i.serveur, route: '', action: i.action, fiche: i.cible, valeurs };
        if (!autre.donnees.includes(donnee)) {
          this.erreur(`« ${i.cible} » est une fiche « ${donnee.nom} », qui n'est pas au serveur « ${i.serveur} ». Lisez-la d'abord : envoyer requete vers "…" du serveur "${i.serveur}" avec id … dans ${i.cible}`, i.ligne);
          return { type: 'faireService', serveur: i.serveur, route: '', action: i.action, fiche: i.cible, valeurs };
        }
        const route = autre.routes.find((r) => (r.actions ?? []).some((a) => a.nom === i.action && a.donnee === donnee.nom));
        const action = route?.actions?.find((a) => a.nom === i.action);
        if (!route || !action) {
          const connues = autre.routes.flatMap((r) => (r.actions ?? []).filter((a) => a.donnee === donnee.nom).map((a) => a.nom));
          this.erreur(`le serveur « ${i.serveur} » n'a pas d'action « ${i.action} » sur « ${donnee.nom} ». Actions : ${connues.join(', ') || 'aucune'}.${proposerNom(i.action, connues)}`, i.ligne);
          return { type: 'faireService', serveur: i.serveur, route: '', action: i.action, fiche: i.cible, valeurs };
        }
        const attendus = (action.parametres ?? []).map((p) => p.nom);
        for (const v of i.valeurs) if (!attendus.includes(v.nom)) this.erreur(`l'action « ${i.action} » n'attend pas « ${v.nom} ». Valeurs attendues : ${attendus.join(', ') || 'aucune'}.`, i.ligne);
        for (const nom of attendus) if (!i.valeurs.some((v) => v.nom === nom)) this.erreur(`l'action « ${i.action} » attend « ${nom} » : ajoutez « ${nom} = … » après « avec ».`, i.ligne);
        if (!this.avecUtilisateur && !(route.droitsServices ?? []).some((d) => d.serveur === this.serveur.nom && d.faire === i.action)) {
          this.erreur(`ici, personne n'est connecté : le serveur « ${this.serveur.nom} » fait « ${i.action} » en son propre nom. Donnez-lui ce droit dans la route du serveur « ${i.serveur} » : le serveur "${this.serveur.nom}" peut faire "${i.action}" sur ${donnee.nom}`, i.ligne);
        }
        return { type: 'faireService', serveur: i.serveur, route: routeNormalisee(route.adresse), action: simplifier(i.action).replace(/_/g, '-'), fiche: i.cible, valeurs };
      }
      case 'Signaler': {
        const donnee = portee.get(i.fiche);
        if (!donnee) this.erreur(`« ${i.fiche} » n'existe pas ici : on signale une fiche. Valeurs connues : ${[...portee.keys()].join(', ') || 'aucune'}.`, i.ligne);
        const vers = ecoutantsDe(this.serveur.nom, i.message);
        if (projet.length < 2) this.erreur(`« signaler » parle aux autres services du projet, et il n'y a qu'un serveur.`, i.ligne);
        return { type: 'signaler', message: i.message, fiche: i.fiche, vers };
      }
      case 'Refuser':
        return { type: 'refuser', message: this.valeur(i.message, portee) };
      case 'NoterServeur':
        return {
          type: 'noter',
          valeurs: i.valeurs.map(({ expression, libelle }) => ({
            libelle,
            valeur: this.valeur(expression, portee),
            ...(expression.type === 'Chaine' && libelle.startsWith('"') ? { titre: true } : {}),
          })),
        };
      case 'CreerFiche': {
        const { creation } = i;
        const liee = this.serveur.donnees.find((d) => d.nom === creation.donnee && !d.comptes);
        if (!liee) {
          this.erreur(`« creer ${creation.donnee} » : cette donnée n'existe pas. Données : ${this.serveur.donnees.filter((d) => !d.comptes).map((d) => d.nom).join(', ')}.`, i.ligne);
          return { type: 'creer', donnee: creation.donnee, valeurs: [] };
        }
        const valeurs = creation.valeurs.map(({ champ, valeur }) => {
          const cible = champDe(liee, champ);
          if (!cible) this.erreur(`« creer ${liee.nom} » : la donnée n'a pas de champ « ${champ} ». Champs : ${liee.champs.map((c) => c.nom).join(', ')}.`, i.ligne);
          const v: ValeurServeurRI = valeur.genre === 'champ' ? this.acces(valeur.donnee, valeur.champ, portee, i.ligne) : valeur.genre === 'aujourdhui' ? { genre: 'aujourdhui' } : { genre: 'valeur', valeur: valeur.valeur };
          return { champ: cible?.nom ?? champ, valeur: v };
        });
        const manquants = liee.champs.filter((c) => !valeurs.some((v) => simplifier(v.champ) === simplifier(c.nom)) && !c.regle);
        if (manquants.length > 0) this.erreur(`« creer ${liee.nom} » : il manque ${manquants.map((c) => `« ${c.nom} »`).join(', ')}.`, i.ligne);
        const groupe = liee.par === undefined ? undefined : [...portee.entries()].reverse().find(([, d]) => d.par === liee.par)?.[0];
        if (liee.par !== undefined && groupe === undefined) this.erreur(`« creer ${liee.nom} » : cette donnée est séparée par ${liee.par}, et aucune fiche ici n'indique lequel.`, i.ligne);
        return { type: 'creer', donnee: liee.nom, valeurs, ...(groupe !== undefined ? { groupeDe: groupe } : {}) };
      }
      case 'EmailServeur': {
        if (!this.serveur.emails) this.erreur(`« envoyer email » demande la ligne « emails » dans le serveur "${this.serveur.nom}".`, i.ligne);
        const { destinataire: d } = i.envoi;
        const texte = (morceaux: typeof i.envoi.sujet) => this.valeur({ type: 'Chaine', parties: morceaux, ligne: i.ligne }, portee);
        return {
          type: 'email',
          a: d.genre === 'admins' ? { genre: 'admins' } : d.genre === 'adresse' ? { genre: 'valeur', valeur: { genre: 'valeur', valeur: d.adresse } } : { genre: 'valeur', valeur: this.acces(d.donnee, d.champ, portee, i.ligne) },
          sujet: texte(i.envoi.sujet),
          texte: texte(i.envoi.texte),
        };
      }
      case 'NotificationServeur': {
        return this.notification(i.envoi, portee);
      }
      case 'MiseAJourActivite': {
        const { a } = this.notification({ destinataire: i.pour, titre: [], texte: [], ligne: i.ligne }, portee);
        return { type: 'activite', nom: i.nom, a };
      }
    }
  }
}

export function traduireAction(action: ActionServeur, serveur: Serveur, erreur: Erreur): InstructionServeurRI[] {
  const donnee = serveur.donnees.find((d) => d.nom === action.donnee && !d.comptes);
  if (!donnee) {
    erreur(`la donnée « ${action.donnee} » n'existe pas dans le serveur « ${serveur.nom} ». Données : ${serveur.donnees.filter((d) => !d.comptes).map((d) => d.nom).join(', ') || 'aucune'}.${proposerNom(action.donnee, serveur.donnees.map((d) => d.nom))}`, action.ligne);
    return [];
  }
  return new Traduction(serveur, erreur, true, new Set((action.parametres ?? []).map((p) => p.nom))).corps(action.corps, new Map([[donnee.nom, donnee]]));
}

/** Les lignes d'un document : chaque « {commande.total} » existe. */
export function traduireDocument(document: DocumentServeur, serveur: Serveur, erreur: Erreur): LigneDocumentRI[] {
  const donnee = serveur.donnees.find((d) => d.nom === document.donnee && !d.comptes);
  if (!donnee) {
    erreur(`la donnée « ${document.donnee} » n'existe pas. Données : ${serveur.donnees.filter((d) => !d.comptes).map((d) => d.nom).join(', ') || 'aucune'}.`, document.ligne);
    return [];
  }
  const traduction = new Traduction(serveur, erreur, false);
  return document.lignes.map((l) => (l.genre === 'tableau' ? traduction.tableau(l, donnee) : { genre: l.genre, valeur: traduction.valeur({ type: 'Chaine', parties: l.parties, ligne: l.ligne }, new Map([[donnee.nom, donnee]])) }));
}

/** « quand commande est payee : » : l'argent est déjà pris, « refuser » n'y a pas de sens. */
export function traduireApresPaiement(apres: ApresPaiement, donnee: Donnee, serveur: Serveur, erreur: Erreur): InstructionServeurRI[] {
  const contientRefus = (liste: InstructionServeur[]): boolean => liste.some((i) => i.type === 'Refuser' || (i.type === 'SiServeur' && (contientRefus(i.alors) || contientRefus(i.sinon))) || (i.type === 'PourChaqueServeur' && contientRefus(i.corps)));
  if (contientRefus(apres.corps)) erreur('le paiement est déjà fait : « refuser » ne peut plus l’annuler ici.', apres.ligne);
  return new Traduction(serveur, erreur, false).corps(apres.corps, new Map([[donnee.nom, donnee]]));
}

/** « quand commande est cree : envoyer notification … » : la fiche créée est connue. */
export function traduireNotification(envoi: EnvoiNotification, donnee: Donnee, serveur: Serveur, erreur: Erreur): Extract<InstructionServeurRI, { type: 'notification' }> {
  return new Traduction(serveur, erreur, false).notification(envoi, new Map([[donnee.nom, donnee]]));
}

/** « seul gerant peut lire "resume" de commande … : ». */
export function traduireResume(resume: ResumeServeur, serveur: Serveur, erreur: Erreur): ResumeRI {
  const traduction = new Traduction(serveur, erreur, false);
  const donnee = serveur.donnees.find((d) => d.nom === resume.donnee && !d.comptes);
  if (!donnee) {
    erreur(`la donnée « ${resume.donnee} » n'existe pas. Données : ${serveur.donnees.filter((d) => !d.comptes).map((d) => d.nom).join(', ') || 'aucune'}.`, resume.ligne);
    return { nom: resume.nom, qui: resume.qui, filtres: [], calculs: [] };
  }
  const groupe = resume.regroupePar === undefined ? undefined : champDe(donnee, resume.regroupePar);
  if (resume.regroupePar !== undefined && !groupe) erreur(`la donnée « ${donnee.nom} » n'a pas de champ « ${resume.regroupePar} ». Champs : ${donnee.champs.map((c) => c.nom).join(', ')}.`, resume.ligne);
  if (resume.calculs.length === 0) erreur(`le résumé « ${resume.nom} » est vide : écrivez au moins un calcul, par exemple « calcul combien = nombre de ${donnee.nom} ».`, resume.ligne);
  return {
    nom: resume.nom,
    qui: resume.qui,
    filtres: traduction.filtres(resume.filtres, donnee, new Map(), resume.ligne),
    calculs: resume.calculs.map((c) => ({ nom: c.nom, operation: c.operation, ...(c.champ !== undefined ? { champ: traduction.champCalcul(donnee, c.operation, c.champ, c.ligne) } : {}) })),
    ...(groupe ? { regroupePar: groupe.nom } : {}),
  };
}

export function traduireTache(tache: TachePlanifiee, serveur: Serveur, erreur: Erreur): InstructionServeurRI[] {
  return new Traduction(serveur, erreur, false).corps(tache.corps, new Map());
}

/** « quand le serveur "commandes" signale "commande-validee" avec c : » : la fiche reçue a la donnée signalée. */
export function traduireReceveur(receveur: NonNullable<Serveur['receveurs']>[number], serveur: Serveur, erreur: Erreur): { donnee: string; corps: InstructionServeurRI[] } {
  // Un seul serveur : l'analyse du projet le dit déjà.
  if (projet.length < 2) return { donnee: '', corps: [] };
  const emetteur = projet.find((x) => x.nom === receveur.serveur);
  if (!emetteur || emetteur === serveur) {
    const noms = projet.filter((x) => x !== serveur).map((x) => x.nom);
    erreur(emetteur ? `un service ne s'écoute pas lui-même : « quand le serveur » nomme un autre service.` : `le serveur « ${receveur.serveur} » n'existe pas dans le projet. Serveurs : ${noms.join(', ') || 'aucun autre'}.${proposerNom(receveur.serveur, noms)}`, receveur.ligne);
    return { donnee: '', corps: [] };
  }
  const donnee = donneeDuMessage(emetteur, receveur.message);
  // Le message est signalé, mais sa fiche est fautive : l'erreur est déjà dans l'autre service.
  if (!donnee && signaleLeMessage(emetteur, receveur.message)) return { donnee: '', corps: [] };
  if (!donnee) {
    erreur(`le serveur « ${receveur.serveur} » ne signale jamais « ${receveur.message} » : écrivez-y « signaler "${receveur.message}" avec … » dans une action, une tâche ou un message reçu.`, receveur.ligne);
    return { donnee: '', corps: [] };
  }
  return { donnee: donnee.nom, corps: new Traduction(serveur, erreur, false).corps(receveur.corps, new Map([[receveur.variable, donnee]])) };
}

/** Un nom de variable d'environnement : des majuscules, des chiffres et « _ » (ERREURS_CLE). */
export function verifierNomEnvironnement(nom: string, ligne: number, erreur: Erreur): void {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(nom)) erreur(`« ${nom} » n'est pas un nom de variable d'environnement : des majuscules, des chiffres et « _ », comme "ERREURS_CLE".`, ligne);
}

/** Le corps de capture voit seulement les quatre informations sûres de l'erreur. */
export function traduireCaptureErreurs(capture: NonNullable<Serveur['captureErreurs']>, serveur: Serveur, erreur: Erreur): InstructionServeurRI[] {
  for (const instruction of capture.corps) {
    if (instruction.type !== 'RequeteServeur') erreur('dans la capture du serveur, seules les requêtes HTTP sont disponibles.', instruction.ligne);
    else if (instruction.adresseEnvironnement !== undefined) verifierNomEnvironnement(instruction.adresseEnvironnement, instruction.ligne, erreur);
  }
  if (capture.jeton?.genre === 'secret') verifierNomEnvironnement(capture.jeton.valeur, capture.jeton.ligne, erreur);
  return new Traduction(serveur, erreur, false, new Set(), true).corps(capture.corps, new Map());
}
