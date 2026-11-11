/**
 * Ce que la machine ne peut pas faire pour de vrai, dit sans détour. Chaque limite est lue dans le
 * programme : on ne parle que de ce que le fichier emploie. Rien n'est jamais simulé en silence :
 * un envoi est gardé dans la boîte de la machine (« capté, pas envoyé »), le reste répond une erreur claire.
 */
import type { InstructionServeurRI, ServeurRI } from '../../ri/types.js';

export interface Limite {
  /** Ce que le programme écrit. */
  fonction: string;
  /** « capte » : la machine garde l'envoi dans sa boîte ; « refuse » : la route répond une erreur claire. */
  traitement: 'capte' | 'refuse';
  explication: string;
}

function parcourir(liste: InstructionServeurRI[], voir: (i: InstructionServeurRI) => void): void {
  for (const i of liste) {
    voir(i);
    if (i.type === 'si') { parcourir(i.alors, voir); parcourir(i.sinon, voir); }
    if (i.type === 'pourChaque') parcourir(i.corps, voir);
  }
}

export function instructionsDuServeur(serveur: ServeurRI): InstructionServeurRI[] {
  const blocs: InstructionServeurRI[][] = [
    ...(serveur.taches ?? []).map((t) => t.corps),
    ...serveur.routes.flatMap((r) => [...(r.actions ?? []).map((a) => a.corps), r.apresPaiement ?? []]),
  ];
  const toutes: InstructionServeurRI[] = [];
  for (const bloc of blocs) parcourir(bloc, (i) => toutes.push(i));
  return toutes;
}

export function limitesDuServeur(serveur: ServeurRI): Limite[] {
  const limites: Limite[] = [];
  const instructions = instructionsDuServeur(serveur);
  const emails = serveur.routes.some((r) => r.envois?.length) || instructions.some((i) => i.type === 'email') || serveur.invitations !== undefined || serveur.motDePasseOublie !== undefined || serveur.emails !== undefined;
  if (emails) limites.push({ fonction: 'e-mails (envoyer, inviter, mot de passe oublié)', traitement: 'capte', explication: "Aucun e-mail ne part : chacun est gardé dans la boîte de la machine, avec son lien, à ouvrir depuis le panneau /__machine." });
  const notifications = serveur.activeNotifications || serveur.routes.some((r) => r.notifications?.length) || instructions.some((i) => i.type === 'notification' || i.type === 'activite');
  if (notifications) limites.push({ fonction: 'notifications et activités en direct', traitement: 'capte', explication: "Aucune notification n'est poussée (pas d'appareil réel, pas de clés VAPID, APNs ni Firebase) : chacune est gardée dans la boîte de la machine." });
  if (serveur.routes.some((r) => r.apresPaiement !== undefined || r.payables?.length) || serveur.paiements) limites.push({ fonction: 'paiement (payer … pour …)', traitement: 'refuse', explication: "Pas de paiement réel : la route de paiement répond 501. Le panneau /__machine permet de marquer une fiche « payée » à la main, ce qui lance ce que le programme fait après un paiement." });
  if (serveur.routes.some((r) => r.bon) || serveur.documents?.length) limites.push({ fonction: 'documents et bons en PDF', traitement: 'refuse', explication: "Le PDF n'est pas produit par la machine : la route répond 501." });
  if (serveur.fidelite) limites.push({ fonction: 'carte de fidélité', traitement: 'refuse', explication: "La carte à tampons vient d'un pack Astratra que la machine n'embarque pas : la route répond 501." });
  if (serveur.droitIa) limites.push({ fonction: 'demande à l’IA', traitement: 'refuse', explication: "Pas de modèle d'IA dans la machine : la route répond 501." });
  if (serveur.connexionGoogle || serveur.connexionApple) limites.push({ fonction: 'connexion avec Google ou Apple', traitement: 'refuse', explication: "Pas d'identifiants OAuth : la route répond « pas réglée », comme un serveur sans GOOGLE_CLIENT_ID. Connectez-vous avec un compte d'essai." });
  if (serveur.passerelles?.length) limites.push({ fonction: 'passerelles de sources à jeton secret', traitement: 'refuse', explication: "Les secrets restent dans l'environnement du vrai serveur : la machine n'appelle pas ces API et répond 501." });
  return limites;
}
