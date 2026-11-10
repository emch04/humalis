/**
 * Les mots du temps réel (phrases validées par Emch le 10 novembre 2026) : discussions, appels, réunions.
 */
import type { Cible, EntreeVocabulaire, Traduction } from './types.js';

const SERVEUR = `serveur "agence" :
    roles client et agent
    discussion "support" entre client et agent
    salle "conseil" pour client animee par agent
`;
const PAGE = (corps: string) => `${SERVEUR}\npage "accueil" :\n    titre "Accueil"\n${corps}`;
const CLIC = (ligne: string) => PAGE(`    bouton "Go"\n    quand l'utilisateur clique sur "Go" :\n        ${ligne}`);

const t = (produit: string): Traduction => ({ produit });
/** Le web et le bureau par le moteur ; Apple, Android et Windows ont leur propre code. */
function partout(produit: string): Readonly<Record<Cible, Traduction | null>> {
  return { web: t(produit), mobile: null, desktop: { produit, note: 'comme la cible web : Electron affiche la page web' }, serveur: t(produit), statique: null };
}

function mot(entree: Omit<EntreeVocabulaire, 'variantes' | 'contextes' | 'statut' | 'etape' | 'cibles' | 'couvre'> & { produit: string }): EntreeVocabulaire {
  const { produit, ...reste } = entree;
  return { variantes: [], contextes: ['interaction'], statut: 'supporte', etape: 9, couvre: [], cibles: partout(produit), ...reste };
}

export const ENTREES_TEMPS_REEL: EntreeVocabulaire[] = [
  mot({ mot: 'discussion', categorie: 'action', concept: 'tempsReel.discussion', produit: 'une conversation en direct', description: '« discussion "support" entre client et agent » dans le serveur ; « discussion "support" » dans une page : messages, qui écrit, lu ou non lu, pièces jointes, présence.', exemple: PAGE('    discussion "support"') }),
  mot({ mot: 'pieces', accentue: 'pièces', categorie: 'option', concept: 'tempsReel.sansPieces', produit: 'pas de choix de fichier', description: '« discussion "support" sans pieces jointes ».', exemple: PAGE('    discussion "support" sans pieces jointes') }),
  mot({ mot: 'jointes', categorie: 'option', concept: 'tempsReel.sansPieces', produit: 'pas de choix de fichier', description: '« discussion "support" sans pieces jointes ».', exemple: PAGE('    discussion "support" sans pieces jointes') }),
  mot({ mot: 'lus', categorie: 'valeur', concept: 'tempsReel.nonLus', produit: 'le nombre de messages non lus', description: '« non lus de "support" » : le nombre de messages que la personne n’a pas lus.', exemple: PAGE('    badge non lus de "support"') }),
  mot({ mot: 'ouvrir', categorie: 'action', concept: 'tempsReel.ouvrirDiscussion', produit: 'ouvre la conversation avec cette personne', description: '« ouvrir discussion "support" avec commande.client ».', exemple: `${SERVEUR}\npage "accueil" :\n    titre "Accueil"\n    discussion "support"\n    bouton "Go"\n    quand l'utilisateur clique sur "Go" :\n        ouvrir discussion "support" avec "compte-1"` }),
  mot({ mot: 'salle', categorie: 'action', concept: 'tempsReel.salle', produit: 'une salle LiveKit', description: '« salle "conseil" pour membre et direction » dans le serveur.', exemple: PAGE('    reunion "conseil"') }),
  mot({ mot: 'animee', accentue: 'animée', categorie: 'option', concept: 'tempsReel.animateurs', produit: 'ces rôles peuvent couper un micro et exclure', description: '« salle "conseil" pour membre animee par direction ».', exemple: PAGE('    reunion "conseil"') }),
  mot({ mot: 'reunion', accentue: 'réunion', categorie: 'action', concept: 'tempsReel.reunion', produit: 'les images des participants et la barre', description: '« reunion "conseil" » dans une page : les vidéos, le micro, la caméra, l’écran, la main, quitter.', exemple: PAGE('    reunion "conseil"') }),
  mot({ mot: 'rejoindre', categorie: 'action', concept: 'tempsReel.rejoindre', produit: 'entre dans la salle', description: '« rejoindre reunion "conseil" ».', exemple: CLIC('rejoindre reunion "conseil"') }),
  mot({ mot: 'quitter', categorie: 'action', concept: 'tempsReel.quitter', produit: 'sort de la salle', description: '« quitter reunion ».', exemple: CLIC('quitter reunion') }),
  mot({ mot: 'participants', categorie: 'valeur', concept: 'tempsReel.participants', produit: 'la liste des personnes présentes', description: '« pour chaque p dans participants de reunion "conseil" : ».', exemple: PAGE('    pour chaque p dans participants de reunion "conseil" :\n        texte p.nom') }),
  mot({ mot: 'exclure', categorie: 'action', concept: 'tempsReel.exclure', produit: 'retire la personne de la salle', description: '« exclure participant » : réservé à une personne qui anime.', exemple: PAGE('    pour chaque p dans participants de reunion "conseil" :\n        bouton "Exclure"\n        quand l\'utilisateur clique sur "Exclure" :\n            exclure p') }),
  mot({ mot: 'appeler', categorie: 'action', concept: 'tempsReel.appeler', produit: 'fait sonner la personne et ouvre l’appel', description: '« appeler en video contact », « appeler en audio contact ».', exemple: CLIC('appeler en video "compte-1"') }),
  mot({ mot: 'appel', categorie: 'evenement', concept: 'tempsReel.appel', produit: 'un appel qui arrive', description: '« quand un appel arrive : » (donne appel.auteur) ; « refuser appel ».', exemple: PAGE('    quand un appel arrive :\n        afficher appel.auteur_nom') }),
  mot({ mot: 'decrocher', accentue: 'décrocher', categorie: 'action', concept: 'tempsReel.decrocher', produit: 'répond à l’appel qui sonne', description: '« decrocher ».', exemple: CLIC('decrocher') }),
  mot({ mot: 'raccrocher', categorie: 'action', concept: 'tempsReel.raccrocher', produit: 'termine l’appel', description: '« raccrocher ».', exemple: CLIC('raccrocher') }),
];
