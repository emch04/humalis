/**
 * L'analyse du temps réel : les rôles d'une discussion ou d'une salle doivent exister. Le reste
 * (les routes et les variables que ces phrases déplient) passe par l'analyse ordinaire.
 */
import type { Programme } from '../parser/ast.js';
import type { Diagnostic } from './erreurs.js';
import { proposerNom } from './suggestions.js';

/** Les routes cachées des discussions, des salles, des appels et de la présence : l'analyse les laisse relire par identifiant. */
export const estRouteTempsReel = (adresse: string): boolean => /^(discussions_[a-z0-9_]+|salles_[a-z]+|appels(_reponse)?|presence(_vue)?)$/.test(adresse);

export function analyserTempsReel(programme: Programme, diagnostics: Diagnostic[]): void {
  for (const serveur of programme.serveurs ?? []) {
    const roles = new Set([...(serveur.roles ?? []), 'admin', 'membre']);
    const verifier = (role: string, quoi: string, ligne: number) => {
      if (roles.has(role)) return;
      const connus = [...roles].filter((r) => r !== 'admin' && r !== 'membre');
      diagnostics.push({ gravite: 'erreur', message: `${quoi} nomme le rôle « ${role} », qui n'est pas déclaré. ${connus.length ? `Rôles : ${connus.join(', ')}.${proposerNom(role, connus)}` : `Ajoutez dans le serveur : roles ${role}.`}`, ligne });
    };
    for (const d of serveur.discussions ?? []) for (const r of d.entre) verifier(r, `la discussion « ${d.nom} »`, d.ligne);
    for (const s of serveur.salles ?? []) {
      for (const r of s.pour) verifier(r, `la salle « ${s.nom} »`, s.ligne);
      for (const r of s.animateurs ?? []) verifier(r, `la salle « ${s.nom} »`, s.ligne);
    }
  }
}
