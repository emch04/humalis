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

const champDe = (d: Donnee, c: string) => d.champs.find((x) => simplifier(x.nom) === simplifier(c));
const vide: ValeurServeurRI = { genre: 'valeur', valeur: '' };

class Traduction {
  constructor(
    private readonly serveur: Serveur,
    private readonly erreur: Erreur,
    private readonly avecUtilisateur: boolean,
    private locaux = new Set<string>(),
  ) {}

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
    if (nom === 'utilisateur') {
      if (!this.avecUtilisateur) this.erreur('une tâche planifiée tourne sans personne connectée : « utilisateur » n’existe pas ici.', ligne);
      return { genre: 'utilisateur', champ };
    }
    const donnee = portee.get(nom);
    if (!donnee) {
      this.erreur(`« ${nom} » n'existe pas ici. Valeurs connues : ${[...portee.keys()].join(', ') || 'aucune'}.${proposerNom(nom, [...portee.keys()])}`, ligne);
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

  private instruction(i: InstructionServeur, portee: Portee): InstructionServeurRI {
    switch (i.type) {
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
        if (!donnee) this.erreur(`« ${i.cible} » n'existe pas ici. Valeurs connues : ${[...portee.keys()].join(', ')}.`, i.ligne);
        else if (!champ) this.erreur(`la donnée « ${donnee.nom} » n'a pas de champ « ${i.champ} ». Champs : ${donnee.champs.map((c) => c.nom).join(', ')}.`, i.ligne);
        else if (champ.regle?.genre === 'groupe') this.erreur(`« ${champ.nom} » désigne le groupe de la fiche : on ne le change pas.`, i.ligne);
        return { type: 'changer', fiche: i.cible, donnee: donnee?.nom ?? '', champ: champ?.nom ?? i.champ, valeur: this.valeur(i.valeur, portee) };
      }
      case 'SupprimerFiche': {
        const donnee = portee.get(i.cible);
        if (!donnee) this.erreur(`« ${i.cible} » n'existe pas ici. Valeurs connues : ${[...portee.keys()].join(', ')}.`, i.ligne);
        return { type: 'supprimer', fiche: i.cible, donnee: donnee?.nom ?? '' };
      }
      case 'Refuser':
        return { type: 'refuser', message: this.valeur(i.message, portee) };
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
        if (!this.serveur.emails) this.erreur(`« envoyer email » demande la ligne « emails par brevo » dans le serveur "${this.serveur.nom}".`, i.ligne);
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
