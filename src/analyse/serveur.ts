import type { Serveur, ActionDonnee, Route, Qui } from '../parser/ast.js';
import type { Diagnostic } from './erreurs.js';
import { simplifier } from './elements.js';
import { proposerNom } from './suggestions.js';

const ACTIONS: ActionDonnee[] = ['lire', 'creer', 'modifier', 'supprimer'];

/**
 * Vérifie un bloc « serveur » : données et champs uniques, règles qui
 * visent une donnée existante, une seule donnée par route, et les
 * actions que personne ne pourra faire (la porte est fermée par défaut).
 */
export function analyserServeur(serveur: Serveur, diagnostics: Diagnostic[]): void {
  const erreur = (message: string, ligne: number) => diagnostics.push({ gravite: 'erreur', message, ligne });
  const avertissement = (message: string, ligne: number) => diagnostics.push({ gravite: 'avertissement', message, ligne });

  const donnees = new Map<string, number>();
  for (const donnee of serveur.donnees) {
    if (donnees.has(donnee.nom)) {
      erreur(`la donnée « ${donnee.nom} » est déjà déclarée (ligne ${donnees.get(donnee.nom)}).`, donnee.ligne);
    }
    donnees.set(donnee.nom, donnee.ligne);
    const champs = new Map<string, number>();
    for (const champ of donnee.champs) {
      if (champs.has(champ.nom)) erreur(`le champ « ${champ.nom} » est déjà déclaré (ligne ${champs.get(champ.nom)}).`, champ.ligne);
      champs.set(champ.nom, champ.ligne);
    }
  }

  const adresses = new Map<string, number>();
  const servies = new Set<string>();
  for (const route of serveur.routes) {
    if (adresses.has(route.adresse)) {
      erreur(`la route « ${route.adresse} » est déjà déclarée (ligne ${adresses.get(route.adresse)}).`, route.ligne);
    }
    adresses.set(route.adresse, route.ligne);

    let servie: string | undefined;
    const permises = new Set<ActionDonnee>();
    for (const regle of route.regles) {
      if (!donnees.has(regle.donnee)) {
        erreur(
          `la donnée « ${regle.donnee} » n'existe pas dans le serveur « ${serveur.nom} ». Données : ${[...donnees.keys()].join(', ') || 'aucune'}.${proposerNom(regle.donnee, donnees.keys())}`,
          regle.ligne,
        );
        continue;
      }
      if (servie !== undefined && servie !== regle.donnee) {
        erreur(
          `une route ne sert qu'une donnée : la route « ${route.adresse} » sert déjà « ${servie} ». Écrivez une autre route pour « ${regle.donnee} ».`,
          regle.ligne,
        );
        continue;
      }
      servie = regle.donnee;
      servies.add(regle.donnee);
      for (const action of regle.actions) permises.add(action);
    }

    if (servie !== undefined) {
      // « modifier » couvre aussi créer et supprimer (décision S2).
      const couvertes = new Set(permises);
      if (permises.has('modifier')) {
        couvertes.add('creer');
        couvertes.add('supprimer');
      }
      const refusees = ACTIONS.filter((a) => !couvertes.has(a));
      if (refusees.length > 0) {
        avertissement(`personne ne peut ${refusees.join(', ')} « ${servie} » : ces actions seront refusées.`, route.ligne);
      }
    }
  }

  if (serveur.fidelite) {
    const fidelite = serveur.fidelite;
    const { gain, objectif } = fidelite;
    if (adresses.has('fidelite') || adresses.has('/fidelite') || adresses.has('api/fidelite') || adresses.has('/api/fidelite')) {
      erreur(`le bloc « fidelite » sert déjà l'adresse /api/fidelite : donnez un autre nom à la route « fidelite ».`, fidelite.ligne);
    }
    const donnee = serveur.donnees.find((d) => d.nom === fidelite.donnee);
    const champDe = (nom: string) => donnee?.champs.find((c) => simplifier(c.nom) === simplifier(nom));
    const estUnTexte = (nom: string) => { const type = champDe(nom)?.type; return type?.genre === 'texte' && !type.image; };
    if (!donnee) {
      erreur(`la donnée « ${fidelite.donnee} » n'existe pas dans le serveur « ${serveur.nom} ». Données : ${[...donnees.keys()].join(', ') || 'aucune'}.${proposerNom(fidelite.donnee, donnees.keys())}`, fidelite.ligne);
    } else if (!estUnTexte(fidelite.champ)) {
      erreur(`« fidelite par ${fidelite.champ} » : la donnée « ${donnee.nom} » doit avoir un champ « ${fidelite.champ} » de type texte. Champs : ${donnee.champs.map((c) => c.nom).join(', ')}.${proposerNom(fidelite.champ, donnee.champs.map((c) => c.nom))}`, fidelite.ligne);
    }
    if (!gain) {
      erreur(`il manque la ligne qui donne les tampons, par exemple : 1 tampon par ${fidelite.donnee} livree`, fidelite.ligne);
    } else {
      if (!Number.isInteger(gain.tampons) || gain.tampons < 1) {
        erreur(`« ${gain.tampons} tampon par ${gain.donnee} … » : le nombre de tampons doit être un entier positif.`, gain.ligne);
      }
      if (gain.donnee !== fidelite.donnee) {
        erreur(`les tampons se comptent sur la donnée de l'en-tête : écrivez « par ${fidelite.donnee} ${gain.statut} », pas « par ${gain.donnee} ${gain.statut} ».`, gain.ligne);
      } else if (donnee && !estUnTexte('statut')) {
        erreur(`« par ${gain.donnee} ${gain.statut} » compare le champ « statut » : la donnée « ${donnee.nom} » doit avoir un champ « statut » de type texte.`, gain.ligne);
      }
    }
    if (!objectif) {
      erreur(`il manque la ligne de la récompense, par exemple : apres 5 tampons, recompense "Un cadeau"`, fidelite.ligne);
    } else if (!Number.isInteger(objectif.tampons) || objectif.tampons < 1) {
      erreur(`« apres ${objectif.tampons} tampons » : le nombre de tampons doit être un entier positif.`, objectif.ligne);
    }
  }

  for (const donnee of serveur.donnees) {
    if (!servies.has(donnee.nom)) avertissement(`aucune route ne donne accès à la donnée « ${donnee.nom} ».`, donnee.ligne);
  }
}

export type Droits = Record<ActionDonnee, Qui | null>;

/**
 * Qui peut faire chaque action d'une route. « modifier » couvre créer et
 * supprimer quand ils n'ont pas leur propre règle (décision S2) ; une
 * action sans règle reste fermée (null).
 */
export function droitsDeRoute(route: Route): Droits {
  const droits: Droits = { lire: null, creer: null, modifier: null, supprimer: null };
  for (const regle of route.regles) {
    for (const action of regle.actions) droits[action] = regle.qui;
  }
  if (droits.modifier) {
    droits.creer ??= droits.modifier;
    droits.supprimer ??= droits.modifier;
  }
  return droits;
}

/** « /api/produits », « /produits » et « produits » désignent la même route. */
export const adresseNormalisee = (adresse: string) => adresse.replace(/^\/+/, '').replace(/^api\//, '');
