/**
 * Le temps réel (phrases validées par Emch le 10 novembre 2026) : discussions, appels et réunions.
 *
 * Presque tout se déplie ici en phrases Humalis ordinaires : une discussion est une page qui lit une
 * route « en direct », un formulaire et un choix de fichier ; la barre d'une réunion, des boutons.
 * Chaque cible en hérite sans rien écrire. Seuls restent propres à chaque cible l'image des
 * participants (`reunion`) et ses gestes (micro, caméra, écran), confiés à LiveKit.
 */
import { analyser as analyserLexique } from '../lexer/lexer.js';
import type { Token } from '../lexer/types.js';
import { simplifier } from '../analyse/elements.js';
import { ErreurSyntaxique } from './erreurs.js';
import type { FluxTokens } from './fluxTokens.js';
import type { Action, Comparaison, DeclarationVariable, Donnee, Evenement, Expression, GesteReunion, Instruction, Page, Programme, Requete, Route, Serveur } from './ast.js';
import { analyserBloc, analyserExpression, analyserSyntaxe, estLeMot } from './parser.js';
import { estMot } from './miseEnPage.js';

/** Le nom des routes et des variables d'une discussion ou d'une salle : lettres, chiffres et « _ ». */
export const slugTempsReel = (nom: string): string => simplifier(nom).replace(/[^a-z0-9_]/g, '_');

/** Le nom de la page d'un appel en cours : ajoutée au programme qui appelle. */
export const PAGE_APPEL = 'appel_en_cours';

interface Etat {
  profondeur: number;
  /** Les discussions et salles nommées dans les pages, à vérifier une fois le programme lu. */
  discussionsNommees: { nom: string; ligne: number }[];
  sallesNommees: { nom: string; ligne: number }[];
  /** La première phrase d'appel, s'il y en a une. */
  appel?: number;
  /** Une phrase qui demande l'état de la réunion : les variables partagées sont ajoutées. */
  reunion?: number;
  presence?: number;
  /** Ce qu'il faut à chaque discussion pour s'ouvrir depuis une autre page. */
  ouvertures: Set<string>;
  /** La page en cours de lecture : ses variables cachées, ses lectures au chargement. */
  page?: { variables: Map<string, Instruction[]>; chargement: Map<string, Instruction[]>; appelEcoute: boolean };
  /** Où se montre chaque discussion, pour « ouvrir discussion ». */
  pagesDesDiscussions: Map<string, string>;
  ouverturesParPage: { discussion: string; ligne: number; redirection: Action }[];
}

const etatVide = (profondeur: number): Etat => ({ profondeur, discussionsNommees: [], sallesNommees: [], ouvertures: new Set(), pagesDesDiscussions: new Map(), ouverturesParPage: [] });
let etat: Etat = etatVide(0);

/** Quelques lignes Humalis, lues comme le corps d'une page. */
function phrases(source: string, ligne: number): Instruction[] {
  const decale = source.split('\n').map((l) => `    ${l}`).join('\n');
  return analyserSyntaxe(analyserLexique(`page "x" :\n${decale}\n`).map((t: Token) => ({ ...t, ligne }))).pages[0]!.corps;
}

/** Le contenu d'un bloc « serveur », lu par le vrai parser : `donnee …` et `route …`. */
function lignesDuServeur(source: string, ligne: number): Serveur {
  const decale = source.split('\n').map((l) => `    ${l}`).join('\n');
  return analyserSyntaxe(analyserLexique(`serveur "x" :\n${decale}\n`).map((t: Token) => ({ ...t, ligne }))).serveurs![0]!;
}

/** Une variable partagée, lue comme en haut d'un fichier. */
function partagee(ligneSource: string, ligne: number): DeclarationVariable {
  return analyserSyntaxe(analyserLexique(`${ligneSource}\npage "x" :\n    titre "x"\n`).map((t: Token) => ({ ...t, ligne }))).partages![0]!;
}

/** Autour de la lecture d'un programme : l'état ne vit qu'une lecture ; à la fin, les pages reçoivent ce qu'il leur faut. */
export function lireProgramme(lire: () => Programme): Programme {
  if (etat.profondeur > 0) {
    etat.profondeur++;
    try {
      return lire();
    } finally {
      etat.profondeur--;
    }
  }
  etat = etatVide(1);
  try {
    const programme = lire();
    etat.profondeur = 2; // Les phrases dépliées ci-dessous ne sont pas des programmes à finir.
    return finirProgramme(programme);
  } finally {
    etat = etatVide(0);
  }
}

// ─── Dans le serveur ───────────────────────────────────────────────────────

/** « discussion "support" entre client et agent », « salle "conseil" pour membre animee par direction ». */
export function estPhraseServeurTempsReel(flux: FluxTokens): boolean {
  return (estLeMot(flux.actuel(), 'discussion') || estLeMot(flux.actuel(), 'salle')) && flux.regarder(1).type === 'CHAINE';
}

function roleLu(flux: FluxTokens, exemple: string): string {
  const jeton = flux.actuel();
  if (!estMot(jeton)) throw new ErreurSyntaxique(`il manque le nom d’un rôle : ${exemple}`, jeton.ligne);
  return flux.avancer().valeur;
}

function rolesLus(flux: FluxTokens, exemple: string): string[] {
  const roles = [roleLu(flux, exemple)];
  while (estLeMot(flux.actuel(), 'et') || flux.verifier('PONCTUATION', ',')) {
    flux.avancer();
    roles.push(roleLu(flux, exemple));
  }
  return roles;
}

const DONNEES_DISCUSSION = (s: string) => `donnee conversation_${s} :
    titre : texte
    personne : texte
    dernier : texte
    dernier_le : texte
    non_lus : nombre
    en_ligne : booleen
donnee message_${s} :
    conversation : texte
    auteur : texte
    auteur_nom : texte
    moi : booleen
    texte : texte
    piece : texte
    piece_nom : texte
    piece_type : texte
    piece_adresse : texte
    lu : booleen
    cree_le : texte
donnee vue_${s} :
    titre : texte
    en_ligne : booleen
    ecrivent : texte
    messages : texte
donnee resume_${s} :
    nombre : nombre
donnee piece_${s} :
    conversation : texte
    auteur : texte
    nom : texte
    genre : texte
    contenu : texte
donnee lecture_${s} :
    conversation : texte
    compte : texte
    lu_le : texte
donnee ecriture_${s} :
    conversation : texte
    compte : texte
    nom : texte
    ecrit_le : texte
route "discussions_${s}_conversations" :
    connecte peut lire conversation_${s}
    connecte peut creer conversation_${s}
route "discussions_${s}_vue" :
    connecte peut lire vue_${s}
route "discussions_${s}_messages" :
    connecte peut lire message_${s}
    connecte peut creer message_${s}
route "discussions_${s}_non_lus" :
    connecte peut lire resume_${s}
route "discussions_${s}_pieces" :
    connecte peut creer piece_${s}
route "discussions_${s}_ecriture" :
    connecte peut creer ecriture_${s}
route "discussions_${s}_lecture" :
    connecte peut lire lecture_${s}`;

const DONNEES_SALLES = `donnee participant_salle :
    nom : texte
    micro : booleen
    camera : booleen
    ecran : booleen
    main : booleen
    animateur : booleen
donnee vue_salle :
    micro_coupe : booleen
    camera_coupee : booleen
    participants : texte
donnee jeton_salle :
    adresse : texte
    jeton : texte
    video : booleen
donnee geste_salle :
    salle : texte
    participant : texte
    geste : texte
route "salles_vue" :
    connecte peut lire vue_salle
route "salles_moi" :
    connecte peut lire vue_salle
route "salles_jeton" :
    connecte peut creer jeton_salle
route "salles_geste" :
    connecte peut creer geste_salle`;

const DONNEES_APPELS = `donnee appel_humalis :
    auteur : texte
    auteur_nom : texte
    appele : texte
    salle : texte
    video : booleen
    etat : texte
    appele_le : texte
donnee reponse_appel :
    appel : texte
    reponse : texte
route "appels" :
    connecte peut lire appel_humalis
    connecte peut creer appel_humalis
route "appels_reponse" :
    connecte peut creer reponse_appel`;

const DONNEES_PRESENCE = `donnee presence_comptes :
    comptes : liste de texte
donnee presence_vue :
    compte : texte
    vu_le : texte
route "presence" :
    connecte peut lire presence_comptes
route "presence_vue" :
    connecte peut lire presence_vue`;

/** Ajoute au serveur ses données et ses routes cachées : le serveur les sert lui-même (src/cibles/serveur/temps-reel.ts). */
function ajouterAuServeur(serveur: Pick<Serveur, 'donnees' | 'routes'>, source: string, ligne: number, famille: string): void {
  const lu = lignesDuServeur(source, ligne);
  for (const d of lu.donnees) {
    if (serveur.donnees.some((x) => x.nom === d.nom)) continue;
    // Ces données décrivent seulement une réponse : aucune table.
    if (/^(vue_|resume_|participant_salle$|jeton_salle$|geste_salle$|reponse_appel$|presence_comptes$)/.test(d.nom)) d.reponseSeule = true;
    for (const c of d.champs) {
      if (c.nom === 'messages') c.type = { genre: 'liste', de: { genre: 'donnee', nom: d.nom.replace(/^vue_/, 'message_') } };
      if (c.nom === 'participants') c.type = { genre: 'liste', de: { genre: 'donnee', nom: 'participant_salle' } };
    }
    serveur.donnees.push(d);
  }
  for (const r of lu.routes) if (!serveur.routes.some((x) => x.adresse === r.adresse)) serveur.routes.push({ ...r, interne: famille });
}

/** Lit la phrase et déclare ce qu'il lui faut. */
export function analyserPhraseServeurTempsReel(flux: FluxTokens, serveur: { donnees: Donnee[]; routes: Route[]; discussions: NonNullable<Serveur['discussions']>; salles: NonNullable<Serveur['salles']> }): void {
  const debut = flux.avancer();
  const nom = flux.attendre('CHAINE', undefined, 'le nom entre guillemets').valeur;
  const s = slugTempsReel(nom);
  if (estLeMot(debut, 'discussion')) {
    const exemple = 'discussion "support" entre client et agent';
    if (!estLeMot(flux.actuel(), 'entre')) throw new ErreurSyntaxique(`il manque « entre » et les rôles : ${exemple}`, flux.actuel().ligne);
    flux.avancer();
    const entre = rolesLus(flux, exemple);
    if (entre.length > 2) throw new ErreurSyntaxique(`une discussion se fait entre un rôle ou deux : ${exemple}, ou discussion "equipe" entre membre.`, debut.ligne);
    if (serveur.discussions.some((d) => d.nom === nom)) throw new ErreurSyntaxique(`la discussion « ${nom} » est déjà écrite : donnez-lui un autre nom.`, debut.ligne);
    serveur.discussions.push({ nom, entre, ligne: debut.ligne });
    ajouterAuServeur(serveur, DONNEES_DISCUSSION(s), debut.ligne, `discussion:${nom}`);
    ajouterAuServeur(serveur, DONNEES_PRESENCE, debut.ligne, 'presence');
    return;
  }
  const exemple = 'salle "conseil" pour membre et direction';
  if (!flux.verifier('MOT_CLE', 'pour') && !estLeMot(flux.actuel(), 'pour')) throw new ErreurSyntaxique(`il manque « pour » et les rôles : ${exemple}`, flux.actuel().ligne);
  flux.avancer();
  const pour = rolesLus(flux, exemple);
  let animateurs: string[] | undefined;
  if (estLeMot(flux.actuel(), 'animee')) {
    flux.avancer();
    if (!estLeMot(flux.actuel(), 'par')) throw new ErreurSyntaxique('il manque « par » : salle "conseil" pour membre animee par direction', flux.actuel().ligne);
    flux.avancer();
    animateurs = rolesLus(flux, 'salle "conseil" pour membre animee par direction');
  }
  if (serveur.salles.some((x) => x.nom === nom)) throw new ErreurSyntaxique(`la salle « ${nom} » est déjà écrite : donnez-lui un autre nom.`, debut.ligne);
  serveur.salles.push({ nom, pour, ...(animateurs ? { animateurs } : {}), ligne: debut.ligne });
  ajouterAuServeur(serveur, DONNEES_SALLES, debut.ligne, 'salles');
}

// ─── Dans une page ─────────────────────────────────────────────────────────

/** Au début d'une page ; rend l'état à remettre à la fin. */
export function commencerPage(): Etat['page'] {
  const avant = etat.page;
  etat.page = { variables: new Map(), chargement: new Map(), appelEcoute: false };
  return avant;
}

/** À la fin d'une page : ses variables cachées d'abord, ses lectures au début de son chargement. */
export function finirPage(corps: Instruction[], nomPage: string, avant: Etat['page'], ligne: number): Instruction[] {
  const page = etat.page!;
  etat.page = avant;
  if (etat.profondeur > 1) return corps; // Une page « x » de phrases dépliées.
  return avecBesoins(corps, page, ligne, nomPage);
}

function avecBesoins(corps: Instruction[], page: NonNullable<Etat['page']>, ligne: number, _nomPage: string): Instruction[] {
  const variables = [...page.variables.values()].flat();
  const lectures = [...page.chargement.values()].flat();
  if (variables.length === 0 && lectures.length === 0) return corps;
  if (lectures.length === 0) return [...variables, ...corps];
  const chargement = corps.find((i): i is Evenement => i.type === 'Evenement' && i.genre === 'chargement');
  if (chargement) {
    chargement.corps = [...lectures, ...chargement.corps];
    return [...variables, ...corps];
  }
  return [...variables, ...corps, { type: 'Evenement', genre: 'chargement', corps: lectures, ligne }];
}

function besoinDePage(ligne: number, quoi: string): NonNullable<Etat['page']> {
  if (!etat.page) throw new ErreurSyntaxique(`${quoi} s’écrit dans une page, pas dans un composant.`, ligne);
  return etat.page;
}

function declarer(cle: string, source: string, ligne: number, quoi: string): void {
  const page = besoinDePage(ligne, quoi);
  if (!page.variables.has(cle)) page.variables.set(cle, phrases(source, ligne));
}

function auChargement(cle: string, corps: () => Instruction[], ligne: number, quoi: string): void {
  const page = besoinDePage(ligne, quoi);
  if (!page.chargement.has(cle)) page.chargement.set(cle, corps());
}

/** Une lecture d'une route cachée, relue quand le serveur annonce un changement. */
function lecture(adresse: string, id: Expression, resultat: string, ligne: number, suite?: Instruction[]): Requete {
  return { type: 'Requete', adresse, donnees: [id], parId: true, resultat, direct: true, ...(suite ? { suite } : {}), ligne };
}

function envoi(adresse: string, cles: string[], donnees: Expression[], ligne: number, resultat?: string): Requete {
  return { type: 'Requete', adresse, donnees, cles, ...(resultat ? { resultat } : {}), ligne };
}

const reference = (nom: string, ligne: number): Expression => ({ type: 'Reference', nom, ligne });
const texte = (valeur: string, ligne: number): Expression => ({ type: 'Chaine', parties: [{ type: 'texte', valeur }], ligne });

const choisie = (s: string) => `hd_${s}_choisie`;

/** La vue d'une discussion, écrite en Humalis : elle marche donc sur toutes les cibles. */
function vueDiscussion(s: string, avecPieces: boolean): string {
  const pieces = avecPieces
    ? `
        fichier "Joindre un fichier" dans hd_${s}_piece avec maximum 10 Mo
        si hd_${s}_piece n'est pas rien :
            bouton "Envoyer le fichier" avec icone "envoyer"
            quand l'utilisateur clique sur "Envoyer le fichier" :
                envoyer fichier hd_${s}_piece vers "api/discussions_${s}_pieces" fichier dans hd_${s}_envoyee
                envoyer requete vers "discussions_${s}_messages" avec conversation = ${choisie(s)} et piece = hd_${s}_envoyee.id`
    : '';
  return `bloc :
    si hd_${s}_conversations n'est pas vide :
        pour chaque c dans hd_${s}_conversations :
            ligne :
                texte "{c.titre}"
                si c.non_lus est superieur a 0 :
                    badge c.non_lus
                bouton "Ouvrir"
                quand l'utilisateur clique sur "Ouvrir" :
                    changer ${choisie(s)} par c.id
                    envoyer requete vers "discussions_${s}_vue" avec id ${choisie(s)} dans hd_${s}_vue
    si hd_${s}_vue n'est pas rien :
        soustitre hd_${s}_vue.titre
        si hd_${s}_vue.en_ligne :
            badge "En ligne"
        pour chaque m dans hd_${s}_vue.messages :
            bloc :
                texte "{m.auteur_nom}" avec taille petite
                si m.texte n'est pas vide :
                    texte m.texte
                si m.piece_adresse n'est pas vide :
                    lien m.piece_nom vers m.piece_adresse
                si m.moi :
                    si m.lu :
                        texte "Lu" avec taille petite
        si hd_${s}_vue.ecrivent n'est pas vide :
            texte "{hd_${s}_vue.ecrivent} écrit…" avec taille petite
        formulaire "Message ${s}" :
            champ "Message"
            bouton "Envoyer" avec icone "envoyer"
        quand l'utilisateur ecrit dans "Message" :
            si non hd_${s}_ecrit :
                changer hd_${s}_ecrit par vrai
                envoyer requete vers "discussions_${s}_ecriture" avec conversation = ${choisie(s)}
                apres 2 secondes :
                    changer hd_${s}_ecrit par faux
        quand le formulaire "Message ${s}" est soumis :
            envoyer requete vers "discussions_${s}_messages" avec conversation = ${choisie(s)} et texte = champ "Message"
            vider champ "Message"${pieces}`;
}

function discussionDansLaPage(flux: FluxTokens): Instruction[] {
  const debut = flux.avancer();
  const nom = flux.avancer().valeur;
  const s = slugTempsReel(nom);
  let avecPieces = true;
  if (estLeMot(flux.actuel(), 'sans') && estLeMot(flux.regarder(1), 'pieces') && estLeMot(flux.regarder(2), 'jointes')) {
    flux.avancer(); flux.avancer(); flux.avancer();
    avecPieces = false;
  }
  etat.discussionsNommees.push({ nom, ligne: debut.ligne });
  etat.ouvertures.add(s);
  const quoi = `la discussion « ${nom} »`;
  declarer(`discussion:${s}`, `variable hd_${s}_conversations = []\nvariable hd_${s}_vue = rien\nvariable hd_${s}_envoyee = rien\nvariable hd_${s}_piece = rien\nvariable hd_${s}_ecrit = faux`, debut.ligne, quoi);
  auChargement(`discussion:${s}`, () => [
    { type: 'Requete', adresse: `discussions_${s}_conversations`, donnees: [], resultat: `hd_${s}_conversations`, direct: true, ligne: debut.ligne },
    lecture(`discussions_${s}_vue`, reference(choisie(s), debut.ligne), `hd_${s}_vue`, debut.ligne),
  ], debut.ligne, quoi);
  return phrases(vueDiscussion(s, avecPieces), debut.ligne);
}

/** Le ton des boutons de la barre : une icône, avec son nom pour les lecteurs d'écran. */
function barreDeReunion(): string {
  const bascule = (variable: string, oui: [string, string, string], non: [string, string, string]) => `    si ${variable} :
        bouton icone "${oui[1]}" avec nom "${oui[0]}"
        quand l'utilisateur clique sur "${oui[0]}" :
            ${oui[2]}
    sinon :
        bouton icone "${non[1]}" avec nom "${non[0]}"
        quand l'utilisateur clique sur "${non[0]}" :
            ${non[2]}`;
  return `ligne :
${bascule('micro est coupe', ['Activer le micro', 'micro_coupe', 'activer micro'], ['Couper le micro', 'micro', 'couper micro'])}
${bascule('camera est coupee', ['Activer la caméra', 'video_coupee', 'activer camera'], ['Couper la caméra', 'video', 'couper camera'])}
${bascule('hd_ecran_partage', ['Arrêter le partage', 'partage_ecran_arrete', 'arreter partage'], ['Partager l’écran', 'partage_ecran', 'partager ecran'])}
${bascule('main est levee', ['Baisser la main', 'main_levee', 'baisser la main'], ['Lever la main', 'main', 'lever la main'])}`;
}

/** L'image des participants : un élément propre à chaque cible, jamais écrit à la main. */
const imageReunion = (ligne: number): Instruction => ({ type: 'Element', element: 'reunion', contenu: { type: 'Chaine', parties: [], ligne }, styles: [], classes: [], ligne }) as unknown as Instruction;

function reunionDansLaPage(flux: FluxTokens): Instruction[] {
  const debut = flux.avancer();
  const nom = flux.avancer().valeur;
  etat.sallesNommees.push({ nom, ligne: debut.ligne });
  etat.reunion ??= debut.ligne;
  const entree = phrases(`si hd_reunion_salle n'est pas egal a "${nom}" :\n    bouton "Rejoindre" avec icone "video"\n    quand l'utilisateur clique sur "Rejoindre" :\n        rejoindre reunion "${nom}"\nsinon :\n    bouton icone "raccrocher" avec nom "Quitter la réunion"\n    quand l'utilisateur clique sur "Quitter la réunion" :\n        quitter reunion`, debut.ligne);
  (entree[0] as Instruction & { sinon: Instruction[] }).sinon.unshift(imageReunion(debut.ligne));
  return [...entree, ...phrases(barreConditionnelle(nom), debut.ligne)];
}

const barreConditionnelle = (nom: string) => `si hd_reunion_salle est egal a "${nom}" :\n${barreDeReunion().split('\n').map((l) => `    ${l}`).join('\n')}`;

const GESTES: [string[], GesteReunion['geste']][] = [
  [['couper', 'micro'], 'couperMicro'],
  [['activer', 'micro'], 'activerMicro'],
  [['couper', 'camera'], 'couperCamera'],
  [['activer', 'camera'], 'activerCamera'],
  [['partager', 'ecran'], 'partagerEcran'],
  [['arreter', 'partage'], 'arreterPartage'],
  [['lever', 'main'], 'leverMain'],
  [['baisser', 'main'], 'baisserMain'],
];

/** Après un geste, ce que la page montre de son état change tout de suite. */
const ETAT_DU_GESTE: Partial<Record<GesteReunion['geste'], [string, boolean]>> = {
  couperMicro: ['hd_micro_coupe', true], activerMicro: ['hd_micro_coupe', false],
  couperCamera: ['hd_camera_coupee', true], activerCamera: ['hd_camera_coupee', false],
  partagerEcran: ['hd_ecran_partage', true], arreterPartage: ['hd_ecran_partage', false],
  leverMain: ['hd_main_levee', true], baisserMain: ['hd_main_levee', false],
};

const suiteDeMots = (flux: FluxTokens, mots: string[], depart = 0) => mots.every((m, i) => estLeMot(flux.regarder(depart + i), m));

function geste(flux: FluxTokens, g: GesteReunion['geste'], n: number): Instruction[] {
  const ligne = flux.actuel().ligne;
  for (let i = 0; i < n; i++) flux.avancer();
  etat.reunion ??= ligne;
  const change = ETAT_DU_GESTE[g];
  return [{ type: 'GesteReunion', geste: g, ...(change ? { puis: phrases(`changer ${change[0]} par ${change[1] ? 'vrai' : 'faux'}`, ligne) } : {}), ligne }];
}

/** Une action de moderation : le serveur vérifie que la personne anime la salle. */
function moderation(flux: FluxTokens, nomGeste: string, n: number): Instruction[] {
  const ligne = flux.actuel().ligne;
  for (let i = 0; i < n; i++) flux.avancer();
  const participant = analyserExpression(flux);
  etat.reunion ??= ligne;
  return [envoi('salles_geste', ['salle', 'participant', 'geste'], [reference('hd_reunion_salle', ligne), participant, texte(nomGeste, ligne)], ligne)];
}

/** Entrer dans une salle ; ensuite, ce que le serveur sait du micro et de la caméra se reflète dans la page (une personne qui anime peut couper un micro). */
function rejoindre(salle: Expression, ligne: number): Instruction[] {
  return [
    { type: 'GesteReunion', geste: 'rejoindre', valeur: salle, ligne },
    { type: 'Affectation', nom: 'hd_reunion_salle', valeur: salle, ligne },
    lecture('salles_moi', salle, 'hd_moi_salle', ligne, phrases('changer hd_micro_coupe par hd_moi_salle.micro_coupe\nchanger hd_camera_coupee par hd_moi_salle.camera_coupee', ligne)),
  ];
}

function appel(flux: FluxTokens, video: boolean): Instruction[] {
  const ligne = flux.actuel().ligne;
  flux.avancer(); flux.avancer(); flux.avancer();
  const contact = analyserExpression(flux);
  etat.appel ??= ligne;
  etat.reunion ??= ligne;
  return [
    // L'appel d'avant ne compte plus : si le serveur refuse celui-ci, on reste sur la page.
    ...phrases('changer hd_appel par rien', ligne),
    envoi('appels', ['appele', 'video'], [contact, { type: 'Booleen', valeur: video, ligne } as Expression], ligne, 'hd_appel'),
    ...phrases(`si hd_appel.id n'est pas vide :\n    rediriger vers "${PAGE_APPEL}"`, ligne),
  ];
}

/** Vrai si la ligne commence une phrase du temps réel, dans une page ou un événement. */
export function analyserPhraseTempsReel(flux: FluxTokens): Instruction[] | undefined {
  const a = flux.actuel();
  if (!estMot(a)) return undefined;
  if (estLeMot(a, 'discussion') && flux.regarder(1).type === 'CHAINE') return discussionDansLaPage(flux);
  if (estLeMot(a, 'reunion') && flux.regarder(1).type === 'CHAINE') return reunionDansLaPage(flux);
  if (estLeMot(a, 'ouvrir') && estLeMot(flux.regarder(1), 'discussion') && flux.regarder(2).type === 'CHAINE') {
    flux.avancer(); flux.avancer();
    const nom = flux.avancer().valeur;
    const s = slugTempsReel(nom);
    if (!estLeMot(flux.actuel(), 'avec') && !flux.verifier('MOT_CLE', 'avec')) throw new ErreurSyntaxique('il manque « avec » et la personne : ouvrir discussion "support" avec commande.client', flux.actuel().ligne);
    flux.avancer();
    const personne = analyserExpression(flux);
    etat.discussionsNommees.push({ nom, ligne: a.ligne });
    etat.ouvertures.add(s);
    declarer(`ouverte:${s}`, `variable hd_${s}_ouverte = rien`, a.ligne, `ouvrir discussion « ${nom} »`);
    const redirection: Action = { type: 'Action', action: 'rediriger', arguments: [], continuer: true, ligne: a.ligne };
    etat.ouverturesParPage.push({ discussion: nom, ligne: a.ligne, redirection });
    return [envoi(`discussions_${s}_conversations`, ['personne'], [personne], a.ligne, `hd_${s}_ouverte`), ...phrases(`changer ${choisie(s)} par hd_${s}_ouverte.id`, a.ligne), redirection];
  }
  if (estLeMot(a, 'appeler') && estLeMot(flux.regarder(1), 'en') && (estLeMot(flux.regarder(2), 'video') || estLeMot(flux.regarder(2), 'audio'))) return appel(flux, estLeMot(flux.regarder(2), 'video'));
  if (estLeMot(a, 'decrocher') && flux.regarder(1).type === 'FIN_LIGNE') {
    const ligne = flux.avancer().ligne;
    etat.appel ??= ligne; etat.reunion ??= ligne;
    return [envoi('appels_reponse', ['appel', 'reponse'], [champ('hd_appel_entrant', 'id', ligne), texte('oui', ligne)], ligne), ...phrases(`changer hd_appel par hd_appel_entrant\nrediriger vers "${PAGE_APPEL}"`, ligne)];
  }
  if (estLeMot(a, 'refuser') && estLeMot(flux.regarder(1), 'appel')) {
    const ligne = flux.avancer().ligne;
    flux.avancer();
    etat.appel ??= ligne;
    return [envoi('appels_reponse', ['appel', 'reponse'], [champ('hd_appel_entrant', 'id', ligne), texte('non', ligne)], ligne)];
  }
  if (estLeMot(a, 'raccrocher') && flux.regarder(1).type === 'FIN_LIGNE') {
    const ligne = flux.avancer().ligne;
    etat.appel ??= ligne; etat.reunion ??= ligne;
    // La salle est quittée d'abord : l'annonce « fini » qui revient du serveur ne fait pas revenir une seconde fois.
    return [
      ...phrases('changer hd_reunion_salle par ""', ligne),
      envoi('appels_reponse', ['appel', 'reponse'], [champ('hd_appel', 'id', ligne), texte('fin', ligne)], ligne),
      { type: 'GesteReunion', geste: 'quitter', puis: phrases(REMISE_A_ZERO, ligne), ligne },
      ...phrases('revenir', ligne),
    ];
  }
  if (estLeMot(a, 'rejoindre') && estLeMot(flux.regarder(1), 'reunion')) {
    flux.avancer(); flux.avancer();
    const salle = analyserExpression(flux);
    const nomEcrit = salle.type === 'Chaine' && salle.parties.length === 1 ? (salle.parties[0] as { type: string; valeur?: unknown }) : undefined;
    if (nomEcrit?.type === 'texte' && typeof nomEcrit.valeur === 'string') etat.sallesNommees.push({ nom: nomEcrit.valeur, ligne: a.ligne });
    etat.reunion ??= a.ligne;
    return rejoindre(salle, a.ligne);
  }
  if (estLeMot(a, 'quitter') && estLeMot(flux.regarder(1), 'reunion')) {
    flux.avancer(); flux.avancer();
    etat.reunion ??= a.ligne;
    return [{ type: 'GesteReunion', geste: 'quitter', puis: phrases(REMISE_A_ZERO, a.ligne), ligne: a.ligne }];
  }
  if (suiteDeMots(flux, ['couper', 'micro']) && commenceValeur(flux.regarder(2))) return moderation(flux, 'couper_micro', 2);
  if (estLeMot(a, 'exclure') && commenceValeur(flux.regarder(1))) return moderation(flux, 'exclure', 1);
  for (const [mots, g] of GESTES) if (suiteDeMots(flux, mots) && flux.regarder(mots.length).type === 'FIN_LIGNE') return geste(flux, g, mots.length);
  return undefined;
}

/** En sortant d'une salle : plus de salle, la main baissée, plus de partage d'écran. */
const REMISE_A_ZERO = 'changer hd_reunion_salle par ""\nchanger hd_main_levee par faux\nchanger hd_ecran_partage par faux';

const commenceValeur = (t: Token) => t.type === 'IDENTIFIANT' || (t.type === 'MOT_CLE' && !t.reserve);
const champ = (nom: string, c: string, ligne: number): Expression => ({ type: 'AccesChamp', objet: reference(nom, ligne), champ: c, ligne });

// ─── Les valeurs ───────────────────────────────────────────────────────────

/** « non lus de "support" », « participants de reunion "conseil" » : des lectures cachées de la page. */
export function analyserValeurTempsReel(flux: FluxTokens): Expression | undefined {
  const a = flux.actuel();
  if (estLeMot(a, 'non') && estLeMot(flux.regarder(1), 'lus') && flux.regarder(2).type === 'CHAINE') {
    flux.avancer(); flux.avancer();
    const nom = flux.avancer().valeur;
    const s = slugTempsReel(nom);
    etat.discussionsNommees.push({ nom, ligne: a.ligne });
    declarer(`nonlus:${s}`, `variable hd_${s}_non_lus = rien`, a.ligne, `non lus de « ${nom} »`);
    auChargement(`nonlus:${s}`, () => [lecture(`discussions_${s}_non_lus`, texte('moi', a.ligne), `hd_${s}_non_lus`, a.ligne)], a.ligne, `non lus de « ${nom} »`);
    return champ(`hd_${s}_non_lus`, 'nombre', a.ligne);
  }
  if (estLeMot(a, 'participants') && estLeMot(flux.regarder(1), 'reunion') && flux.regarder(2).type === 'CHAINE') {
    flux.avancer(); flux.avancer();
    const nom = flux.avancer().valeur;
    const s = slugTempsReel(nom);
    etat.sallesNommees.push({ nom, ligne: a.ligne });
    etat.reunion ??= a.ligne;
    declarer(`salle:${s}`, `variable hd_salle_${s} = rien`, a.ligne, `participants de reunion « ${nom} »`);
    auChargement(`salle:${s}`, () => [lecture('salles_vue', texte(nom, a.ligne), `hd_salle_${s}`, a.ligne)], a.ligne, `participants de reunion « ${nom} »`);
    return champ(`hd_salle_${s}`, 'participants', a.ligne);
  }
  return undefined;
}

/** « micro est coupe », « camera est coupee », « main est levee ». */
export function analyserEtatReunion(flux: FluxTokens): Comparaison | undefined {
  const a = flux.actuel();
  const cas: [string, string, string][] = [['micro', 'coupe', 'hd_micro_coupe'], ['camera', 'coupee', 'hd_camera_coupee'], ['main', 'levee', 'hd_main_levee']];
  for (const [sujet, attribut, variable] of cas) {
    if (estLeMot(a, sujet) && estLeMot(flux.regarder(1), 'est') && estLeMot(flux.regarder(2), attribut)) {
      flux.avancer(); flux.avancer(); flux.avancer();
      etat.reunion ??= a.ligne;
      return { type: 'Comparaison', gauche: reference(variable, a.ligne), operateur: 'vrai', ligne: a.ligne };
    }
  }
  return undefined;
}

/** « si contact est en ligne : » : une lecture cachée de la liste des présents. */
export function analyserEnLigne(flux: FluxTokens, gauche: Expression): Comparaison | undefined {
  if (!estLeMot(flux.actuel(), 'en') || !estLeMot(flux.regarder(1), 'ligne')) return undefined;
  const ligne = flux.avancer().ligne;
  flux.avancer();
  etat.presence ??= ligne;
  declarer('presence', 'variable hd_presence = rien', ligne, '« est en ligne »');
  auChargement('presence', () => [lecture('presence', texte('moi', ligne), 'hd_presence', ligne)], ligne, '« est en ligne »');
  return { type: 'Comparaison', gauche, operateur: 'dans', droite: champ('hd_presence', 'comptes', ligne), enLigne: true, ligne };
}

// ─── Les événements ────────────────────────────────────────────────────────

/** « quand un message arrive dans "support" : », « quand un appel arrive : ». Rendu : rien, l'événement est déplié dans le chargement. */
export function analyserEvenementTempsReel(flux: FluxTokens): Instruction[] | undefined {
  // « un » est un petit mot : le lecteur l'a déjà sauté.
  const a = flux.actuel();
  const d = estLeMot(flux.regarder(1), 'un') ? 1 : 0;
  if (estLeMot(flux.regarder(1 + d), 'message') && estLeMot(flux.regarder(2 + d), 'arrive') && estLeMot(flux.regarder(3 + d), 'dans') && flux.regarder(4 + d).type === 'CHAINE') {
    for (let i = 0; i < 4 + d; i++) flux.avancer();
    const nom = flux.avancer().valeur;
    const s = slugTempsReel(nom);
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin de l’événement');
    const corps = analyserBloc(flux);
    etat.discussionsNommees.push({ nom, ligne: a.ligne });
    const quoi = `« quand un message arrive »`;
    declarer(`arrivee:${s}`, `variable message = rien\nvariable hd_${s}_vu = ""`, a.ligne, quoi);
    auChargement(`arrivee:${s}`, () => [lecture(`discussions_${s}_messages`, texte('dernier', a.ligne), 'message', a.ligne, suiteSiNouveau('message', `hd_${s}_vu`, corps, a.ligne))], a.ligne, quoi);
    return [];
  }
  if (estLeMot(flux.regarder(1 + d), 'appel') && estLeMot(flux.regarder(2 + d), 'arrive')) {
    for (let i = 0; i < 3 + d; i++) flux.avancer();
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin de l’événement');
    const corps = analyserBloc(flux);
    etat.appel ??= a.ligne;
    etat.reunion ??= a.ligne;
    const page = besoinDePage(a.ligne, '« quand un appel arrive »');
    page.appelEcoute = true;
    declarer('appel-entrant', 'variable appel = rien\nvariable hd_appel_vu = ""', a.ligne, '« quand un appel arrive »');
    auChargement('appel-entrant', () => [lecture('appels', texte('entrant', a.ligne), 'hd_appel_entrant', a.ligne, [...phrases('changer appel par hd_appel_entrant', a.ligne), ...suiteSiNouveau('hd_appel_entrant', 'hd_appel_vu', corps, a.ligne)])], a.ligne, '« quand un appel arrive »');
    return [];
  }
  return undefined;
}

/** Ce qui suit une lecture : le corps de l'événement, seulement pour une fiche jamais vue et après la première lecture. */
function suiteSiNouveau(variable: string, vu: string, corps: Instruction[], ligne: number): Instruction[] {
  const [bloc] = phrases(`si ${variable}.id n'est pas egal a ${vu} :\n    si ${variable}.id n'est pas vide :\n        vibrer`, ligne);
  const si = bloc as Instruction & { alors: (Instruction & { alors: Instruction[] })[] };
  si.alors[0]!.alors = corps;
  return [si, ...phrases(`changer ${vu} par ${variable}.id`, ligne)];
}

// ─── La fin du programme ───────────────────────────────────────────────────

/** Vérifie les noms, ajoute les variables partagées, la page d'appel, et la sonnerie des pages. */
function finirProgramme(programme: Programme): Programme {
  // Le serveur qui déclare les discussions ou les salles ; sinon le premier.
  const serveur = programme.serveurs?.find((x) => x.discussions?.length || x.salles?.length) ?? programme.serveurs?.[0];
  const ligneDe = (l?: number) => l ?? 1;
  const discussions = serveur?.discussions ?? [];
  const salles = serveur?.salles ?? [];
  for (const d of etat.discussionsNommees) {
    if (!discussions.some((x) => x.nom === d.nom)) throw new ErreurSyntaxique(`la discussion « ${d.nom} » n’est pas déclarée : écrivez dans le serveur discussion "${d.nom}" entre client et agent.`, d.ligne);
  }
  for (const s of etat.sallesNommees) {
    if (!salles.some((x) => x.nom === s.nom)) throw new ErreurSyntaxique(`la salle « ${s.nom} » n’est pas déclarée : écrivez dans le serveur salle "${s.nom}" pour membre.`, s.ligne);
  }
  const besoinServeur = etat.appel ?? etat.reunion ?? etat.presence;
  if (besoinServeur !== undefined && !serveur) throw new ErreurSyntaxique('les appels, les réunions et la présence passent par le serveur : écrivez un bloc serveur "…" dans ce fichier, avec ses rôles.', besoinServeur);
  if (!serveur) return programme;

  if (etat.presence !== undefined) ajouterAuServeur(serveur, DONNEES_PRESENCE, etat.presence, 'presence');
  if (etat.reunion !== undefined) ajouterAuServeur(serveur, DONNEES_SALLES, etat.reunion, 'salles');
  if (etat.appel !== undefined) ajouterAuServeur(serveur, DONNEES_APPELS, etat.appel, 'appels');

  const partages = programme.partages ?? (programme.partages = []);
  const ajouter = (ligneSource: string, ligne: number) => {
    const d = partagee(ligneSource, ligne);
    if (!partages.some((p) => p.nom === d.nom)) partages.push(d);
  };
  for (const s of etat.ouvertures) ajouter(`variable ${choisie(s)} = "moi" avec partagee`, 1);
  if (etat.reunion !== undefined) {
    ajouter('variable hd_reunion_salle = "" avec partagee', etat.reunion);
    ajouter('variable hd_micro_coupe = faux avec partagee', etat.reunion);
    ajouter('variable hd_camera_coupee = faux avec partagee', etat.reunion);
    ajouter('variable hd_ecran_partage = faux avec partagee', etat.reunion);
    ajouter('variable hd_main_levee = faux avec partagee', etat.reunion);
    ajouter('variable hd_moi_salle = rien avec partagee', etat.reunion);
  }
  // « ouvrir discussion » mène à la page qui montre cette discussion.
  for (const o of etat.ouverturesParPage) {
    const s = slugTempsReel(o.discussion);
    const page = programme.pages.find((p) => JSON.stringify(p.corps).includes(`discussions_${s}_vue`));
    if (!page) throw new ErreurSyntaxique(`aucune page ne montre la discussion « ${o.discussion} » : écrivez discussion "${o.discussion}" dans une page.`, o.ligne);
    o.redirection.arguments = [texte(page.nom, o.ligne)];
  }
  if (etat.appel !== undefined) {
    const ligne = ligneDe(etat.appel);
    ajouter('variable hd_appel = rien avec partagee', ligne);
    ajouter('variable hd_appel_entrant = rien avec partagee', ligne);
    for (const page of programme.pages) sonnerie(page, ligne);
    programme.pages.push(pageAppel(ligne));
  }
  return programme;
}

/** Sur chaque page sans « quand un appel arrive » : la sonnerie et ses deux boutons. */
function sonnerie(page: Page, ligne: number): void {
  const ecoute = JSON.stringify(page.corps).includes('"adresse":"appels"') && JSON.stringify(page.corps).includes('"resultat":"hd_appel_entrant"');
  if (ecoute) return;
  const vue = phrases(`si hd_appel_entrant n'est pas rien :
    si hd_appel_entrant.id n'est pas vide :
        bloc :
            texte "Appel de {hd_appel_entrant.auteur_nom}"
            ligne :
                bouton icone "decrocher" avec nom "Décrocher"
                quand l'utilisateur clique sur "Décrocher" :
                    decrocher
                bouton icone "raccrocher" avec nom "Refuser l’appel"
                quand l'utilisateur clique sur "Refuser l’appel" :
                    refuser appel`, ligne);
  const lue: Requete = lecture('appels', texte('entrant', ligne), 'hd_appel_entrant', ligne);
  const chargement = page.corps.find((i): i is Evenement => i.type === 'Evenement' && i.genre === 'chargement');
  if (chargement) chargement.corps = [lue, ...chargement.corps];
  else page.corps.push({ type: 'Evenement', genre: 'chargement', corps: [lue], ligne });
  page.corps = [...vue, ...page.corps];
}

/** La page d'un appel : l'image, la barre, et le retour quand l'autre raccroche. */
function pageAppel(ligne: number): Page {
  const corps = phrases(`titre "Appel"
${barreDeReunion()}
bouton icone "raccrocher" avec nom "Raccrocher"
quand l'utilisateur clique sur "Raccrocher" :
    raccrocher`, ligne);
  // Seulement si l'on est encore dans l'appel : « raccrocher » a déjà fait revenir.
  const fin = phrases('si hd_appel.etat est egal a "fini" :\n    si hd_reunion_salle n\'est pas vide :\n        quitter reunion\n        revenir', ligne);
  const entree: Instruction[] = [...rejoindre(champ('hd_appel', 'salle', ligne), ligne), lecture('appels', champ('hd_appel', 'id', ligne), 'hd_appel', ligne, fin)];
  return { type: 'Page', nom: PAGE_APPEL, parametres: [], corps: [corps[0]!, imageReunion(ligne), ...corps.slice(1), { type: 'Evenement', genre: 'chargement', corps: entree, ligne }], ligne };
}
