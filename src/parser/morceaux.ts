/**
 * La lecture d'une liste par morceaux (phrases validées par le mainteneur le 12 novembre 2026) :
 *
 *     envoyer requete vers "produits" par 20 dans produits
 *     charger la suite de produits
 *     … tant que produits a une suite …
 *
 * Tout se déplie ici en phrases Humalis ordinaires, comme le temps réel : chaque cible en hérite sans
 * rien écrire. Seule l'adresse de la lecture porte du nouveau : « ?limite=21&depuis=40 » (`tranche`).
 *
 * La page demande une fiche de plus que le morceau. Sa présence dit qu'il y a une suite ; elle n'est pas
 * gardée, et le morceau suivant la relira. Le serveur n'a rien à compter, et la réponse reste une liste.
 *
 * Quatre variables cachées par liste : `hd_suite_x` (il reste des fiches), `hd_morceau_x` (le morceau
 * reçu), `hd_depuis_x` (la longueur de la liste quand la suite est partie) et `hd_charge_x` (une suite
 * est en route). Une seule suite à la fois : un second clic pendant la lecture ne demande rien. Et la
 * suite ne s'ajoute que si la liste a encore la longueur du départ : relire le premier morceau pendant
 * qu'une suite est en route ne mélange pas les deux. Une lecture ratée n'ajoute rien et laisse la suite
 * à demander de nouveau.
 */
import { ErreurSyntaxique } from './erreurs.js';
import type { FluxTokens } from './fluxTokens.js';
import type { Comparaison, Condition, Essayer, Expression, Instruction, Requete } from './ast.js';
import { estLeMot } from './parser.js';
import { declarer, phrases } from './temps-reel.js';

/** Le plus grand morceau : le serveur ne rend jamais plus de 1 000 fiches, et la page en demande une de plus. */
export const MORCEAU_MAX = 500;

/** Écrit là où la taille du morceau n'est pas encore connue (« charger la suite » avant la lecture). */
const A_REMPLIR = 987654321;

interface PageMorceaux {
  /** Chaque liste lue par morceaux dans la page : son adresse, la taille de ses morceaux. */
  lues: Map<string, { adresse: string; taille: number }>;
  /** Les « charger la suite de x », à compléter une fois la page lue. */
  suites: { variable: string; ligne: number; requete: Requete; tailles: { valeur: number }[] }[];
  /** Les « x a une suite » : la liste doit être lue par morceaux dans la page. */
  temoins: { variable: string; ligne: number }[];
}

let pile: PageMorceaux[] = [];

/** Au début de la lecture d'un programme : rien ne reste d'une lecture interrompue. */
export function oublierMorceaux(): void {
  pile = [];
}

export function commencerMorceaux(): void {
  pile.push({ lues: new Map(), suites: [], temoins: [] });
}

/** À la fin d'une page : chaque « charger la suite » reçoit l'adresse et la taille de sa lecture. */
export function finirMorceaux(): void {
  const page = pile.pop();
  if (!page) return;
  for (const suite of page.suites) {
    const lue = page.lues.get(suite.variable);
    if (!lue) throw new ErreurSyntaxique(pasParMorceaux(`« charger la suite de ${suite.variable} »`, suite.variable), suite.ligne);
    suite.requete.adresse = lue.adresse;
    suite.requete.tranche!.limite = lue.taille + 1;
    for (const taille of suite.tailles) taille.valeur = lue.taille;
  }
  for (const temoin of page.temoins) {
    if (!page.lues.has(temoin.variable)) throw new ErreurSyntaxique(pasParMorceaux(`« ${temoin.variable} a une suite »`, temoin.variable), temoin.ligne);
  }
}

const pasParMorceaux = (quoi: string, variable: string): string =>
  `${quoi} demande une liste lue par morceaux dans cette page. Écrivez d’abord : envoyer requete vers "…" par 20 dans ${variable}`;

const temoin = (variable: string): string => `hd_suite_${variable}`;

function page(ligne: number, quoi: string): PageMorceaux {
  const actuelle = pile.at(-1);
  if (!actuelle) throw new ErreurSyntaxique(`${quoi} s’écrit dans une page, pas dans un composant.`, ligne);
  return actuelle;
}

/** « par 20 », juste après l'adresse : la taille du morceau, ou rien. */
export function lireMorceau(flux: FluxTokens): number | undefined {
  if (!flux.verifier('MOT_CLE', 'par')) return undefined;
  const par = flux.avancer();
  const nombre = flux.actuel();
  if (nombre.type !== 'NOMBRE') {
    throw new ErreurSyntaxique('après « par », le nombre de fiches de chaque morceau : envoyer requete vers "produits" par 20 dans produits', par.ligne);
  }
  flux.avancer();
  const taille = Number(String(nombre.valeur).replace(',', '.'));
  if (!Number.isInteger(taille) || taille < 1 || taille > MORCEAU_MAX) {
    throw new ErreurSyntaxique(`un morceau compte de 1 à ${MORCEAU_MAX} fiches, en nombre entier : envoyer requete vers "produits" par 20 dans produits`, nombre.ligne);
  }
  return taille;
}

/** Une lecture écrite avec « par 20 » : vérifiée, puis notée pour « charger la suite » et « a une suite ». */
export function requeteParMorceaux(requete: Requete): void {
  const taille = requete.morceau!;
  const exemple = `envoyer requete vers "${requete.adresse}" par ${taille} dans ${requete.resultat ?? 'produits'}`;
  if (requete.source !== undefined || requete.filtrant !== undefined) {
    throw new ErreurSyntaxique('« par 20 » lit une route du serveur de ce fichier. Une source se lit page par page avec ses propres paramètres : filtrant par numero = suivant', requete.ligne);
  }
  if (requete.donnees.length > 0 || requete.enAttente) {
    throw new ErreurSyntaxique(`une lecture par morceaux lit une liste, sans « avec » ni « hors ligne » : ${exemple}`, requete.ligne);
  }
  if (requete.resultat === undefined) {
    throw new ErreurSyntaxique(`il manque « dans » et la liste qui reçoit les fiches : envoyer requete vers "${requete.adresse}" par ${taille} dans produits`, requete.ligne);
  }
  if (requete.direct) {
    throw new ErreurSyntaxique(`« en direct » relit toute la liste à chaque changement : il ne va pas avec « par ${taille} ». Gardez l’un ou l’autre.`, requete.ligne);
  }
  const variable = requete.resultat;
  const ici = page(requete.ligne, `« par ${taille} »`);
  const deja = ici.lues.get(variable);
  if (deja && (deja.adresse !== requete.adresse || deja.taille !== taille)) {
    throw new ErreurSyntaxique(
      `« ${variable} » est lue par morceaux de deux façons dans cette page (« ${deja.adresse} » par ${deja.taille}, « ${requete.adresse} » par ${taille}) : « charger la suite » ne saurait pas laquelle continuer. Gardez la même adresse et la même taille, ou une autre liste.`,
      requete.ligne,
    );
  }
  ici.lues.set(variable, { adresse: requete.adresse, taille });
  declarer(`morceaux:suite:${variable}`, `variable ${temoin(variable)} = faux`, requete.ligne, `« par ${taille} »`);
  requete.tranche = { limite: taille + 1 };
}

/** Ce qui suit la lecture d'un premier morceau : la fiche de trop dit qu'il y a une suite, puis elle est retirée. */
export function apresInstruction(instruction: Instruction): Instruction[] {
  if (instruction.type !== 'Requete' || instruction.morceau === undefined || instruction.resultat === undefined) return [];
  const variable = instruction.resultat;
  const taille = instruction.morceau;
  return phrases(`changer ${temoin(variable)} par nombre de ${variable} est superieur a ${taille}\nchanger ${variable} par les ${taille} premiers de ${variable}`, instruction.ligne);
}

/** « charger la suite de produits » : le morceau suivant, ajouté à la liste. */
export function analyserPhraseMorceaux(flux: FluxTokens): Instruction[] | undefined {
  const debut = flux.actuel();
  if (!estLeMot(debut, 'charger') || !estLeMot(flux.regarder(1), 'suite')) return undefined;
  flux.avancer();
  flux.avancer();
  const suivant = flux.actuel();
  if (suivant.type !== 'IDENTIFIANT' && suivant.type !== 'MOT_CLE') {
    throw new ErreurSyntaxique('il manque le nom de la liste : charger la suite de produits', debut.ligne);
  }
  const variable = flux.attendreNom('le nom de la liste : charger la suite de produits').nom;
  const ligne = debut.ligne;
  const quoi = `« charger la suite de ${variable} »`;
  const ici = page(ligne, quoi);
  const morceau = `hd_morceau_${variable}`;
  const depuis = `hd_depuis_${variable}`;
  const enRoute = `hd_charge_${variable}`;
  declarer(`morceaux:suite:${variable}`, `variable ${temoin(variable)} = faux`, ligne, quoi);
  declarer(`morceaux:morceau:${variable}`, `variable ${morceau} = []`, ligne, quoi);
  declarer(`morceaux:depuis:${variable}`, `variable ${depuis} = 0`, ligne, quoi);
  declarer(`morceaux:charge:${variable}`, `variable ${enRoute} = faux`, ligne, quoi);

  // L'adresse et la taille viennent de la lecture « par 20 », peut-être écrite plus bas : finirMorceaux les pose.
  const requete: Requete = { type: 'Requete', adresse: '', donnees: [], resultat: morceau, tranche: { limite: 0, depuis: { type: 'Reference', nom: depuis, ligne } }, ligne };
  const lignes = [
    // Une seule suite à la fois : le morceau reçu est toujours celui de cette demande.
    `si ${enRoute} est faux :`,
    `    changer ${enRoute} par vrai`,
    `    changer ${depuis} par nombre de ${variable}`,
    '    essayer :',
    // La liste n'a pas changé de longueur depuis le départ de la demande : ce morceau est bien le suivant.
    `        si nombre de ${variable} est egal a ${depuis} :`,
    `            changer ${temoin(variable)} par nombre de ${morceau} est superieur a ${A_REMPLIR}`,
    `            pour chaque hd_fiche_${variable} dans les ${A_REMPLIR} premiers de ${morceau} :`,
    `                ajouter hd_fiche_${variable} a ${variable}`,
    '    si erreur :',
    '        afficher erreur "{raison}"',
    `    changer ${enRoute} par faux`,
  ];
  const instructions = phrases(lignes.join('\n'), ligne);
  const garde = instructions[0] as Condition;
  const essai = garde.alors.find((i): i is Essayer => i.type === 'Essayer')!;
  essai.corps.unshift(requete);
  ici.suites.push({ variable, ligne, requete, tailles: nombresARemplir(essai.corps) });
  return instructions;
}

/** Les nombres laissés « à remplir » dans ces instructions. */
function nombresARemplir(noeud: unknown, trouves: { valeur: number }[] = []): { valeur: number }[] {
  if (noeud === null || typeof noeud !== 'object') return trouves;
  if (Array.isArray(noeud)) {
    for (const n of noeud) nombresARemplir(n, trouves);
    return trouves;
  }
  const n = noeud as { type?: string; valeur?: unknown };
  if (n.type === 'Nombre' && n.valeur === A_REMPLIR) trouves.push(n as { valeur: number });
  else for (const v of Object.values(n)) nombresARemplir(v, trouves);
  return trouves;
}

/**
 * « produits a une suite », « produits n'a pas de suite » : après le nom de la liste, les petits mots
 * (« a », « une », « n' », « de ») sont déjà sautés ; il reste « suite », ou « pas » et « suite ».
 */
export function analyserAUneSuite(flux: FluxTokens, gauche: Expression): Comparaison | undefined {
  if (gauche.type !== 'Reference') return undefined;
  const nie = estLeMot(flux.actuel(), 'pas') && estLeMot(flux.regarder(1), 'suite');
  if (!nie && !estLeMot(flux.actuel(), 'suite')) return undefined;
  if (nie) flux.avancer();
  flux.avancer();
  const quoi = `« ${gauche.nom} a une suite »`;
  page(gauche.ligne, quoi).temoins.push({ variable: gauche.nom, ligne: gauche.ligne });
  declarer(`morceaux:suite:${gauche.nom}`, `variable ${temoin(gauche.nom)} = faux`, gauche.ligne, quoi);
  return { type: 'Comparaison', gauche: { type: 'Reference', nom: temoin(gauche.nom), ligne: gauche.ligne }, operateur: nie ? 'faux' : 'vrai', ligne: gauche.ligne };
}
