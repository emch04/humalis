import { relative } from 'node:path';
import type { EtapeTest } from '../parser/ast.js';
import type { ResultatVerification } from './tests-web.js';

export function libelleEtape(etape: EtapeTest): string {
  const cible = `"${etape.cible}"`;
  switch (etape.type) {
    case 'Cliquer': return `cliquer sur ${cible}`;
    case 'RemplirChamp': return `remplir champ ${cible} avec "${etape.valeur}"`;
    case 'AllerVers': return `aller vers ${cible}`;
    case 'VerifierTexteVisible': return `verifier que texte ${cible} est visible`;
    case 'VerifierTexteAbsent': return `verifier que texte ${cible} est absent`;
    case 'VerifierPage': return `verifier que page est ${cible}`;
    case 'VerifierChamp': return `verifier que champ ${cible} vaut "${etape.valeur}"`;
  }
}

export function messageEchec(etape: EtapeTest, erreur: Error, obtenu?: string, detail = false): string {
  let message: string;
  switch (etape.type) {
    case 'Cliquer': message = `le bouton ou lien « ${etape.cible} » est introuvable (attendu 5 secondes)`; break;
    case 'RemplirChamp': message = `le champ « ${etape.cible} » est introuvable (attendu 5 secondes)`; break;
    case 'AllerVers': message = `la page « ${etape.cible} » ne s’est pas chargée (attendu 5 secondes)`; break;
    case 'VerifierTexteVisible': message = `le texte « ${etape.cible} » n’est pas apparu (attendu 5 secondes)`; break;
    case 'VerifierTexteAbsent': message = `le texte « ${etape.cible} » est encore visible (attendu 5 secondes)`; break;
    case 'VerifierPage': message = `la page attendue est « ${etape.cible} », la page affichée est « ${obtenu ?? 'inconnue'} »`; break;
    case 'VerifierChamp': message = obtenu === undefined
      ? `le champ « ${etape.cible} » est introuvable (attendu 5 secondes)`
      : `le champ « ${etape.cible} » devrait valoir « ${etape.valeur} », il vaut « ${obtenu} »`; break;
  }
  return detail ? `${message}\n${erreur.message}` : message;
}

export function resumeVerifications(reussites: number, echecs: number): string {
  return `${reussites} réussie${reussites > 1 ? 's' : ''}, ${echecs} échouée${echecs > 1 ? 's' : ''}.`;
}

export function ligneVerification(projet: string, resultat: ResultatVerification): string {
  return `${resultat.succes ? '✓' : '✗'} ${relative(projet, resultat.fichier)}, ligne ${resultat.ligne}, test « ${resultat.test} » : ${resultat.message}`;
}
