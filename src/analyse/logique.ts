/**
 * Vérifie ce qui s'exécute sur le serveur et le traduit pour le générateur. Une seule passe :
 * l'analyse s'en sert pour les erreurs, la construction de la RI pour le résultat.
 */
import type { ActionServeur, DocumentServeur, Donnee, Expression, InstructionServeur, Serveur, TachePlanifiee, Test } from '../parser/ast.js';
import type { InstructionServeurRI, TestServeurRI, ValeurServeurRI } from '../ri/types.js';
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
  ) {}

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

  corps(liste: InstructionServeur[], portee: Portee): InstructionServeurRI[] {
    return liste.map((i) => this.instruction(i, portee));
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
        const champ = i.filtre ? champDe(donnee, i.filtre.champ) : undefined;
        if (i.filtre && !champ) this.erreur(`la donnée « ${donnee.nom} » n'a pas de champ « ${i.filtre.champ} ». Champs : ${donnee.champs.map((c) => c.nom).join(', ')}.`, i.ligne);
        const interieur = new Map(portee).set(i.variable, donnee);
        return {
          type: 'pourChaque',
          variable: i.variable,
          donnee: donnee.nom,
          ...(i.filtre && champ ? { filtre: { champ: champ.nom, valeur: this.valeur(i.filtre.valeur, portee) } } : {}),
          corps: this.corps(i.corps, interieur),
        };
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
        const { destinataire: d } = i.envoi;
        const texte = (morceaux: typeof i.envoi.titre) => this.valeur({ type: 'Chaine', parties: morceaux, ligne: i.ligne }, portee);
        return {
          type: 'notification',
          a: d.genre === 'roles' ? { genre: 'roles', roles: d.roles } : { genre: 'compte', valeur: this.acces(d.donnee, d.champ, portee, i.ligne) },
          titre: texte(i.envoi.titre),
          texte: texte(i.envoi.texte),
        };
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
  return new Traduction(serveur, erreur, true).corps(action.corps, new Map([[donnee.nom, donnee]]));
}

/** Les lignes d'un document : chaque « {commande.total} » existe. */
export function traduireDocument(document: DocumentServeur, serveur: Serveur, erreur: Erreur): { genre: 'titre' | 'texte'; valeur: ValeurServeurRI }[] {
  const donnee = serveur.donnees.find((d) => d.nom === document.donnee && !d.comptes);
  if (!donnee) {
    erreur(`la donnée « ${document.donnee} » n'existe pas. Données : ${serveur.donnees.filter((d) => !d.comptes).map((d) => d.nom).join(', ') || 'aucune'}.`, document.ligne);
    return [];
  }
  const traduction = new Traduction(serveur, erreur, false);
  return document.lignes.map(({ genre, parties, ligne }) => ({ genre, valeur: traduction.valeur({ type: 'Chaine', parties, ligne }, new Map([[donnee.nom, donnee]])) }));
}

export function traduireTache(tache: TachePlanifiee, serveur: Serveur, erreur: Erreur): InstructionServeurRI[] {
  return new Traduction(serveur, erreur, false).corps(tache.corps, new Map());
}
