/**
 * La suppression de son propre compte : ce que deviennent les fiches de la personne.
 * « a la suppression du compte : effacer | anonymiser | garder » dans une donnée ; sans cette ligne, la règle par défaut.
 */
import type { ChoixSuppressionCompte, Donnee, Serveur } from '../parser/ast.js';
import { slugTempsReel } from '../parser/temps-reel.js';

/**
 * Les champs qui désignent la personne dans une fiche : ceux qui la retrouvent, et ceux qu'« anonymiser » vide.
 * « compte » d'une donnée par compte, le champ « auteur » de « seul son auteur », et l'auteur des messages d'une discussion.
 */
export function champsDeLaPersonne(donnee: Donnee, serveur: Pick<Serveur, 'discussions'>): string[] {
  if (donnee.comptes || donnee.reponseSeule) return [];
  const champs: string[] = [];
  if (donnee.par === 'compte') champs.push('compte');
  for (const champ of donnee.champs) if (champ.regle?.genre === 'auteur' && !champs.includes(champ.nom)) champs.push(champ.nom);
  if (estMessageDeDiscussion(donnee, serveur)) for (const nom of ['auteur', 'auteur_nom']) if (!champs.includes(nom)) champs.push(nom);
  return champs;
}

/** « message_support » : les messages de « discussion "support" », que le serveur écrit lui-même. */
function estMessageDeDiscussion(donnee: Donnee, serveur: Pick<Serveur, 'discussions'>): boolean {
  return (serveur.discussions ?? []).some((d) => donnee.nom === `message_${slugTempsReel(d.nom)}`);
}

/**
 * Le choix d'une donnée : celui qu'écrit le programme, sinon la règle par défaut (une donnée par compte est effacée,
 * une fiche qui garde son auteur devient anonyme, comme un message). undefined : rien à faire.
 */
export function choixSuppressionCompte(donnee: Donnee, serveur: Pick<Serveur, 'discussions'>): ChoixSuppressionCompte | undefined {
  if (champsDeLaPersonne(donnee, serveur).length === 0) return undefined;
  if (donnee.suppressionCompte) return donnee.suppressionCompte.choix;
  return donnee.par === 'compte' ? 'effacer' : 'anonymiser';
}
