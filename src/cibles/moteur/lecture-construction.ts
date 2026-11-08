/**
 * Lire le serveur au moment de construire, pour que les pages publiques
 * portent déjà leur contenu dans le HTML. Rien n'est lu sans une demande
 * écrite dans le projet, et quatre règles tiennent la sécurité :
 *
 * 1. seulement ce que tout le monde peut lire (une route « tout le monde »,
 *    ou une route de source nommée dans le projet ; jamais une page réservée) ;
 * 2. aucune clé, aucun cookie : la lecture se fait comme un visiteur anonyme ;
 * 3. tout est échappé (le HTML par attributs() et echapperTexte(), les données
 *    posées dans la page par donneesDansLaPage()) ;
 * 4. une adresse fixée dans le projet, en https, sans suivre de redirection.
 */
import type { Application, Ecran } from '../../ri/types.js';
import { lecturesDuChargement, routesPubliques } from '../web/lectures.js';

export interface ReglageLecture {
  /** L'adresse du serveur Humalis du projet. */
  adresse?: string;
  /** Les routes de source que le propriétaire du projet déclare publiques. */
  sources?: string[];
}

export interface LectureConstruction {
  /** « catalogue:produits » : la page et sa variable. */
  cle: string;
  url: string;
  enveloppe?: string;
  dans?: string;
  liste: boolean;
}

/** https, ou la machine locale pour essayer ; jamais de mot de passe dans l'adresse. */
export function adressePermise(adresse: string): boolean {
  try {
    const u = new URL(adresse);
    if (u.username || u.password) return false;
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname));
  } catch {
    return false;
  }
}

const sansBarre = (texte: string) => texte.replace(/\/+$/, '');
const route = (texte: string) => texte.replace(/^\/+/, '');

function reservee(ecran: Ecran, application: Application, vus: string[] = []): boolean {
  if (ecran.reservee) return true;
  if (ecran.parent === undefined || vus.includes(ecran.nom)) return false;
  const parent = application.ecrans.find((e) => e.nom === ecran.parent);
  return parent ? reservee(parent, application, [...vus, ecran.nom]) : false;
}

/** Ce que les règles permettent de lire : rien d'autre ne partira. */
export function lecturesPermises(application: Application, reglage: ReglageLecture): { lectures: LectureConstruction[]; refus: string[] } {
  const lectures: LectureConstruction[] = [];
  const refus: string[] = [];
  const publiques = routesPubliques(application);
  const sources = new Set((reglage.sources ?? []).map(route));
  if (reglage.adresse !== undefined && !adressePermise(reglage.adresse)) {
    refus.push(`l'adresse « ${reglage.adresse} » n'est pas permise : https seulement, sans mot de passe.`);
    return { lectures, refus };
  }
  for (const ecran of application.ecrans) {
    if (reservee(ecran, application) || ecran.nom === 'introuvable') continue;
    const filtrees = new Set(lecturesDuChargement(ecran).filter((l) => l.filtre).map((l) => l.variable));
    for (const g of ecran.gestionnaires.filter((x) => x.declencheur === 'chargement')) {
      for (const a of g.actions) {
        if (a.type !== 'requete' || a.mode !== 'lire' || a.resultat === undefined || a.filtrant?.length || filtrees.has(a.resultat)) continue;
        const etat = ecran.etat.find((e) => e.nom === a.resultat);
        if (!etat || etat.memorisee) continue;
        const cle = `${ecran.nom}:${a.resultat}`;
        const liste = etat.type.genre === 'liste';
        if (a.source === undefined) {
          if (reglage.adresse === undefined || !publiques.has(a.adresse)) continue;
          lectures.push({ cle, url: `${sansBarre(reglage.adresse)}/${route(a.adresse)}`, liste });
          continue;
        }
        if (!sources.has(route(a.adresse))) continue;
        const source = application.sources.find((s) => s.nom === a.source);
        if (!source) continue;
        if (source.jetonPublic || source.entetes.length > 0) {
          refus.push(`la source « ${source.nom} » envoie une clé ou des en-têtes : elle n'est pas lue à la construction.`);
          continue;
        }
        if (!adressePermise(source.adresse)) {
          refus.push(`la source « ${source.nom} » n'est pas en https : elle n'est pas lue à la construction.`);
          continue;
        }
        lectures.push({ cle, url: `${sansBarre(source.adresse)}/${route(a.adresse)}`, liste, ...(source.enveloppe ? { enveloppe: source.enveloppe } : {}), ...(a.dans ? { dans: a.dans } : {}) });
      }
    }
  }
  return { lectures, refus };
}

const TAILLE_MAXIMALE = 5_000_000;

/** Lit une adresse comme un visiteur anonyme : ni cookie, ni clé, ni redirection. */
async function lireUne(lecture: LectureConstruction): Promise<unknown> {
  const reponse = await fetch(lecture.url, { redirect: 'error', credentials: 'omit', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!reponse.ok) throw new Error(`le serveur a répondu ${reponse.status}`);
  const texte = await reponse.text();
  if (texte.length > TAILLE_MAXIMALE) throw new Error('réponse trop grosse');
  let valeur = JSON.parse(texte) as unknown;
  for (const champ of [lecture.enveloppe, ...(lecture.dans?.split('.') ?? [])]) {
    if (champ === undefined) continue;
    valeur = (valeur as Record<string, unknown> | null)?.[champ];
  }
  if (lecture.liste && !Array.isArray(valeur)) throw new Error('une liste était attendue');
  if (valeur === undefined) throw new Error('réponse vide');
  return valeur;
}

/** Une lecture qui échoue ne casse pas la construction : la page garde son état de départ. */
export async function lireLesDonnees(lectures: LectureConstruction[]): Promise<{ donnees: Map<string, unknown>; avertissements: string[] }> {
  const donnees = new Map<string, unknown>();
  const avertissements: string[] = [];
  for (const lecture of lectures) {
    try {
      donnees.set(lecture.cle, await lireUne(lecture));
    } catch (erreur) {
      avertissements.push(`« ${lecture.cle} » n'a pas pu être lu à la construction (${(erreur as Error).message}) : la page garde son état de départ.`);
    }
  }
  return { donnees, avertissements };
}

/** Le bloc de données d'une page : « < » y est échappé, une donnée ne peut pas fermer le bloc. */
export function donneesDansLaPage(donnees: Record<string, unknown>): string {
  const texte = JSON.stringify(donnees).split('<').join('\\u003c').split('\u2028').join('\\u2028').split('\u2029').join('\\u2029');
  return `<script type="application/json" id="humalis-donnees">${texte}</script>`;
}
