/**
 * Les rôles d'un serveur (« roles directeur, enseignant et parent ») : chaque
 * rôle employé dans le programme doit être déclaré. « admin » existe toujours
 * et passe partout ; « connecte » n'est pas un rôle, c'est un état.
 */
import type { Programme } from '../parser/ast.js';
import type { Diagnostic } from './erreurs.js';
import { simplifier } from './elements.js';
import { proposerNom } from './suggestions.js';

const RESERVES = new Set(['admin', 'connecte', 'membre', 'visiteur', 'tout']);

/** « role:directeur,parent » → ["directeur", "parent"] ; rien pour un droit ordinaire. */
export const rolesDe = (qui: string | undefined): string[] => (qui?.startsWith('role:') ? qui.slice(5).split(',') : []);

export function verifierRoles(programme: Programme, diagnostics: Diagnostic[]): void {
  const declares = new Set<string>();
  const erreur = (message: string, ligne: number) => diagnostics.push({ gravite: 'erreur', message, ligne });
  for (const serveur of programme.serveurs) {
    for (const role of serveur.roles ?? []) {
      if (RESERVES.has(simplifier(role))) erreur(`« ${role} » existe déjà dans Humalis : donnez un autre nom à ce rôle.`, serveur.ligne);
      declares.add(role);
    }
  }
  const verifier = (role: string, ligne: number) => {
    if (declares.has(role)) return;
    erreur(`le rôle « ${role} » n'est pas déclaré. Ajoutez-le au serveur : roles ${[...declares, role].join(', ')}.${proposerNom(role, [...declares])}`, ligne);
  };
  const visiter = (noeud: unknown): void => {
    if (Array.isArray(noeud)) return noeud.forEach(visiter);
    if (noeud === null || typeof noeud !== 'object') return;
    const n = noeud as { type?: string; qui?: string; etat?: string; role?: string; ligne?: number };
    const ligne = n.ligne ?? 0;
    for (const role of rolesDe(n.qui)) verifier(role, ligne);
    if (n.type === 'EtatUtilisateur') for (const role of rolesDe(n.etat)) verifier(role, ligne);
    if (n.type === 'Invitation' && n.role !== undefined && n.role !== 'admin' && n.role !== 'membre') verifier(n.role, ligne);
    Object.values(noeud).forEach(visiter);
  };
  visiter(programme);
}
