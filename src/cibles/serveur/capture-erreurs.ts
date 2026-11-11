/** Capture des erreurs du serveur produit : aucune donnée de requête ou de formulaire ne sort. */
import type { InstructionServeurRI, ServeurRI } from '../../ri/types.js';

const q = (valeur: string) => JSON.stringify(valeur);

/** Seules les requêtes HTTP sont autorisées dans une capture : elles ne dépendent d'aucune transaction. */
export function codeCaptureErreurs(serveur: ServeurRI): string {
  const requetes = (serveur.captureErreurs ?? []) as Extract<InstructionServeurRI, { type: 'requete' }>[];
  const valeur = (v: Extract<InstructionServeurRI, { type: 'requete' }>['champs'][number]['valeur']): string => {
    if (v.genre === 'erreur') return `erreur.${v.champ}`;
    if (v.genre === 'valeur') return q(String(v.valeur));
    if (v.genre === 'texte') return v.parties.map((p) => 'texte' in p ? q(p.texte) : valeur(p.valeur)).join(' + ') || "''";
    return "''";
  };
  return `// Produit par Humalis : capture sûre des erreurs du processus et d'Express.
type Rapport = { message: string; pile: string; page: string; version: string };
const enCours = new Set<string>();
const limites = new Map<string, number[]>();
let dansLaCapture = false;

function nettoyer(texte: unknown): string {
  return String(texte ?? '').slice(0, 4000)
    .replace(/([?&][^=\\s]+)=([^&\\s]+)/g, '$1=[masqué]')
    .replace(/(password|mot.?de.?passe|secret|token|jeton|authorization)(\\s*[:=]\\s*)[^\\s,;]+/gi, '$1$2[masqué]');
}

export async function rapporterErreur(inconnue: unknown, page = ''): Promise<void> {
  if (dansLaCapture) return;
  const brute = inconnue instanceof Error ? inconnue : new Error('Erreur inconnue');
  const erreur: Rapport = { message: nettoyer(brute.message), pile: nettoyer(brute.stack), page: nettoyer(page), version: ${q('1.0.0')} };
  const cle = erreur.message + '|' + erreur.pile.split('\\n')[1];
  const maintenant = Date.now();
  const passages = (limites.get(cle) ?? []).filter((instant) => maintenant - instant < 60_000);
  if (passages.length >= 3 || enCours.has(cle)) return;
  passages.push(maintenant);
  limites.set(cle, passages);
  if (limites.size > 500) for (const [nom, dates] of limites) if (dates.every((instant) => maintenant - instant >= 60_000)) limites.delete(nom);
  enCours.add(cle);
  dansLaCapture = true;
  try {
${requetes.map((i) => `    try {
      await fetch(${q(i.adresse)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ${i.champs.map((c) => `${q(c.nom)}: ${valeur(c.valeur)}`).join(', ')} }), signal: AbortSignal.timeout(3000) });
    } catch { /* Un échec d'envoi ne déclenche jamais une nouvelle capture. */ }`).join('\n')}
  } finally { dansLaCapture = false; enCours.delete(cle); }
}

let branche = false;
export function brancherErreursProcessus(): void {
  if (branche) return;
  branche = true;
  process.on('uncaughtException', (erreur) => { void rapporterErreur(erreur).finally(() => { process.exitCode = 1; }); });
  process.on('unhandledRejection', (erreur) => { void rapporterErreur(erreur); });
}
`;
}
