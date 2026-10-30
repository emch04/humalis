/**
 * Les vérifications des graphiques, des médias et du mouvement.
 *
 * Elles sont dans leur fichier pour ne pas alourdir `analyse.ts` : elles
 * reçoivent de quoi signaler (`Signaler`) et de quoi typer une expression.
 */
import type { Element, Expression, Graphique, LitteralListe, Style, ValeurGraphique } from '../parser/ast.js';
import { normaliser } from '../lexer/motsCles.js';
import { texteSimple, type Signaler } from './ecran.js';
import { DEVISES } from '../cibles/format.js';
import { contraste, FOND_PAGE } from './couleurs.js';
import { proposerNom } from './suggestions.js';
import { decrireListe, decrireType, estConnu, INCONNU, type TypeValeur } from './types.js';

const reglage = (styles: Style[], nom: string): Style | undefined => styles.find((s) => normaliser(s.propriete) === nom);

/** Au-delà, une page anime trop d'éléments au défilement (avertissement, pas une limite). */
export const MAXIMUM_DEFILEMENTS = 30;

/**
 * Les options de mouvement d'un élément ou d'un bloc (`genre` : `texte`,
 * `champ`, `bloc`…). Les noms et les valeurs sont déjà vérifiés par la
 * table des options ; ici, ce qui les lie. Renvoie vrai si l'élément
 * s'anime au défilement.
 */
export function verifierMouvement(styles: Style[], genre: string, dansFormulaire: boolean, ligne: number, s: Signaler): boolean {
  const animation = reglage(styles, 'animation');
  for (const nom of ['duree', 'delai'] as const) {
    if (reglage(styles, nom) && !animation) {
      const exemple = nom === 'delai' ? 'avec animation montee et delai court' : 'avec animation montee et duree longue';
      s.erreur(`« ${nom} » donne ${nom === 'delai' ? 'l’attente' : 'la durée'} d’une animation : écrivez aussi « animation … », par exemple « ${exemple} ».`, ligne);
    }
  }
  if (!animation) return false;
  if (normaliser(animation.valeur) === 'defilement') {
    s.erreur('« au defilement » suit le nom d’une animation : « animation montee au defilement ».', ligne);
    return false;
  }
  if (genre === 'champ' || genre === 'formulaire' || dansFormulaire) {
    s.erreur('pas d’animation sur un champ, ni dans un formulaire : un champ qui bouge pendant qu’on écrit gêne la saisie.', ligne);
  }
  return animation.defilement === true;
}

/** Les extensions d'image que les navigateurs et le téléphone savent afficher. */
export const EXTENSIONS_IMAGE = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'];

/**
 * Une image (décision M4) : une description, ou « decoratif », jamais les
 * deux ni aucune ; des proportions entières et positives ; un fichier local
 * d'un format connu. Renvoie vrai si l'image est « prioritaire ».
 */
export function verifierImage(element: Element, s: Signaler): boolean {
  const { styles, ligne } = element;
  const description = reglage(styles, 'description');
  const decorative = reglage(styles, 'decoratif');
  if (description && decorative) {
    s.erreur('une image a soit une description, soit « decoratif » (elle ne porte aucune information), pas les deux.', ligne);
  } else if (!description && !decorative) {
    s.erreur(
      'décrivez l’image pour les personnes qui ne la voient pas : « avec description "Le fleuve au coucher du soleil" », ou « avec decoratif » si elle ne porte aucune information.',
      ligne,
    );
  } else if (description && (description.parties ?? [{ type: 'texte', valeur: description.valeur }]).every((p) => p.type === 'texte' && p.valeur.trim() === '')) {
    s.erreur('la description de l’image est vide : écrivez ce qu’elle montre, ou « avec decoratif » si elle ne porte aucune information.', ligne);
  }
  // « description p.nom » : les variables du texte sont vérifiées comme celles d'un texte.
  if (description?.parties?.some((p) => p.type === 'variable')) s.typeDe(description.texte ?? { type: 'Chaine', parties: description.parties, ligne });
  const proportions = reglage(styles, 'proportions');
  if (proportions) {
    const [largeur, hauteur] = proportions.valeur.split(':').map(Number);
    if (![largeur, hauteur].every((n) => Number.isInteger(n) && n > 0)) {
      s.erreur(`les proportions sont deux nombres entiers positifs : « proportions 4 sur 3 » (ici, ${proportions.valeur.replace(':', ' sur ').replace(/\./g, ',')}).`, ligne);
    }
  }
  const fichier = texteSimple(element.contenu);
  if (fichier !== undefined && !/^([a-z][a-z0-9+.-]*:|\/)/i.test(fichier.trim())) {
    const extension = /\.([a-z0-9]+)$/i.exec(fichier)?.[1]?.toLowerCase();
    if (!extension || !EXTENSIONS_IMAGE.includes(extension)) {
      s.erreur(`« ${fichier} » n’est pas une image que les navigateurs savent afficher. Formats possibles : ${EXTENSIONS_IMAGE.map((e) => `.${e}`).join(', ')}.`, ligne);
    }
  }
  return prioritaire(styles);
}

/** Les extensions de son que les navigateurs et le téléphone savent jouer. */
export const EXTENSIONS_AUDIO = ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac', 'opus'];

/** Les mots d'un nom de fichier qui annoncent de la parole (une heuristique modeste, dite comme telle). */
const NOMS_DE_PAROLE = /entretien|interview|discours|podcast/i;

/**
 * Un audio (décisions M13) : une description obligatoire (elle nomme le lecteur),
 * jamais de lecture automatique, un fichier d'un format connu. Une transcription
 * est conseillée pour la parole.
 */
export function verifierAudio(element: Element, s: Signaler): void {
  const { styles, ligne } = element;
  const description = reglage(styles, 'description');
  if (!description) {
    s.erreur('décrivez le son pour les personnes qui ne le voient pas : « audio "extrait.mp3" avec description "Extrait de la chanson Le Fleuve" ».', ligne);
  } else if ((description.parties ?? [{ type: 'texte', valeur: description.valeur }]).every((p) => p.type === 'texte' && p.valeur.trim() === '')) {
    s.erreur('la description du son est vide : elle nomme le lecteur pour les lecteurs d’écran.', ligne);
  }
  for (const nom of ['description', 'transcription']) {
    const texte = reglage(styles, nom);
    if (texte?.parties?.some((p) => p.type === 'variable')) s.typeDe(texte.texte ?? { type: 'Chaine', parties: texte.parties, ligne });
  }
  if (reglage(styles, 'automatique')) {
    s.erreur('Humalis ne lance jamais un son tout seul : les navigateurs le bloquent presque toujours et c’est gênant pour les lecteurs d’écran. Retirez « automatique » ; la personne lance le son avec les commandes du lecteur.', ligne);
  }
  const fichier = texteSimple(element.contenu);
  if (fichier !== undefined && !/^([a-z][a-z0-9+.-]*:|\/)/i.test(fichier.trim())) {
    const extension = /\.([a-z0-9]+)$/i.exec(fichier)?.[1]?.toLowerCase();
    if (!extension || !EXTENSIONS_AUDIO.includes(extension)) {
      s.erreur(`« ${fichier} » n’est pas un son que les navigateurs savent jouer. Formats possibles : ${EXTENSIONS_AUDIO.map((e) => `.${e}`).join(', ')}.`, ligne);
    }
  }
  if (fichier !== undefined && NOMS_DE_PAROLE.test(fichier) && !reglage(styles, 'transcription')) {
    s.avertissement('ce son ressemble à de la parole (son nom l’annonce) : ajoutez « et transcription "…" » pour les personnes qui ne peuvent pas l’écouter.', ligne);
  }
}

const prioritaire = (styles: Style[]) => reglage(styles, 'prioritaire') !== undefined;

/** Au-delà, une image prioritaire de plus fait perdre la priorité aux autres. */
export const MAXIMUM_PRIORITAIRES = 2;

/** À la fin d'une page : trop d'images prioritaires. */
export function verifierPrioritairesDeLaPage(lignes: number[], s: Signaler): void {
  if (lignes.length > MAXIMUM_PRIORITAIRES) {
    s.avertissement(
      `${lignes.length} images « prioritaire » dans cette page : au-delà de ${MAXIMUM_PRIORITAIRES}, elles se disputent le réseau et aucune n’arrive plus vite. Gardez « prioritaire » pour la grande image du haut.`,
      lignes[MAXIMUM_PRIORITAIRES],
    );
  }
}

/** À la fin d'une page : trop d'éléments animés au défilement distraient (et coûtent à observer). */
export function verifierDefilementsDeLaPage(lignes: number[], s: Signaler): void {
  if (lignes.length > MAXIMUM_DEFILEMENTS) {
    s.avertissement(
      `trop de mouvement : ${lignes.length} éléments s’animent au défilement dans cette page (plus de ${MAXIMUM_DEFILEMENTS}). Gardez l’animation pour quelques éléments importants.`,
      lignes[MAXIMUM_DEFILEMENTS],
    );
  }
}

// ─── Les graphiques (plan, 4.1) ──────────────────────────────────────────

/** Au-delà, un camembert se lit mal ; des barres deviennent trop fines (avertissements, pas des limites). */
export const MAXIMUM_PARTS = 8;
export const MAXIMUM_BARRES = 40;

/** Ce que les vérifications d'un graphique demandent à l'analyse. */
export interface SignalerGraphique extends Signaler {
  /** Le graphique est écrit dans un événement. */
  dansEvenement: boolean;
  /** Les champs des éléments d'une liste (fiches, données du serveur) ; vide s'ils ne sont pas connus. */
  champsDe(type: TypeValeur): { nom: string; type: TypeValeur }[];
  /** La liste écrite dans le programme (la liste, ou la valeur de départ de sa variable), si elle l'est. */
  listeEcrite(expression: Expression): LitteralListe | undefined;
  /** Une couleur de base ou du thème, ou l'erreur à signaler. */
  couleur(nom: string): { erreur: string } | { nom: string; clair: string; sombre: string };
}

/** « ventes » ou « la liste » : pour les messages. */
const nomDeLaListe = (liste: Expression) => (liste.type === 'Reference' ? `« ${liste.nom} »` : 'la liste');

/**
 * Un graphique : une liste de nombres, de fiches ou de données ; des
 * libellés et des valeurs qui existent (quand le type est connu) ; une
 * description (décision M3) ; des réglages cohérents. Les nombres écrits
 * dans le programme sont regardés de plus près (parts négatives, trop de
 * parts ou de barres).
 */
export function verifierGraphique(g: Graphique, s: SignalerGraphique): void {
  const { ligne } = g;
  if (s.dansEvenement) {
    s.erreur('un graphique se place dans la page, pas dans un événement. Pour le montrer après un clic, placez-le dans un « si » qui lit une variable que l’événement change.', ligne);
  }
  verifierDescriptionGraphique(g, s);
  verifierReglagesGraphique(g, s);

  const typeListe = s.typeDe(g.liste);
  const element = typeListe.genre === 'liste' ? typeListe.de : INCONNU;
  if (estConnu(typeListe) && (typeListe.genre !== 'liste' || ['texte', 'booleen', 'liste'].includes(element.genre))) {
    s.erreur(`un graphique se fait à partir d’une liste de nombres, de fiches ou de données, par exemple les ventes par mois ; ici, c’est ${decrireListe(typeListe)}.`, ligne);
    return;
  }
  const valeurs: ValeurGraphique[] = g.valeur ? [g.valeur] : g.series.flatMap((serie) => (serie.valeur ? [serie.valeur] : []));
  if (element.genre === 'nombre') verifierListeDeNombres(g, valeurs, s);
  else if (estConnu(element)) verifierChampsGraphique(g, valeurs, s.champsDe(element), s);
  else if (g.etiquette !== undefined || valeurs.length > 0) {
    s.avertissement(
      `les champs des éléments de ${nomDeLaListe(g.liste)} ne sont connus qu’à l’exécution : « etiquette » et « valeur » ne sont pas vérifiés. Vérifiez qu’ils existent dans les données reçues.`,
      ligne,
    );
  }
  verifierNombresEcrits(g, s);
}

function verifierDescriptionGraphique(g: Graphique, s: SignalerGraphique): void {
  if (!g.description) {
    s.erreur('décrivez ce que montre le graphique, pour les personnes qui ne le voient pas : ajoutez par exemple « et description "Les ventes montent de janvier à mars." ».', g.ligne);
    return;
  }
  if (g.description.type === 'Chaine' && g.description.parties.every((p) => p.type === 'texte' && p.valeur.trim() === '')) {
    s.erreur('la description du graphique est vide : écrivez ce qu’il montre, par exemple « description "Les ventes montent de janvier à mars." ».', g.ligne);
  }
  // « description "{total} ventes" » : les variables du texte sont vérifiées comme celles d'un texte.
  if (g.description.type === 'Chaine' && g.description.parties.some((p) => p.type === 'variable')) s.typeDe(g.description);
}

/** La forme (ligne ou bloc), le camembert, les devises, les couleurs et les proportions. */
function verifierReglagesGraphique(g: Graphique, s: SignalerGraphique): void {
  const { ligne } = g;
  if ((g.valeur || g.couleur) && g.series.length > 0) {
    s.erreur('la valeur et la couleur s’écrivent soit sur la ligne du graphique (une seule série), soit dans chaque ligne « serie » : pas les deux.', ligne);
  }
  if (g.genre === 'camembert' && g.series.length > 1) {
    s.erreur('un camembert montre une seule série, dont les parts font un tout : gardez une seule ligne « serie », ou choisissez un graphique en barres pour en comparer plusieurs.', ligne);
  }
  const couleurs = [g.couleur, ...g.series.map((serie) => serie.couleur)].filter((c): c is string => c !== undefined);
  if (g.genre === 'camembert' && couleurs.length > 0) {
    s.erreur('les parts d’un camembert prennent chacune leur couleur : retirez « couleur ».', ligne);
  } else {
    for (const nom of couleurs) {
      const couleur = s.couleur(nom);
      if ('erreur' in couleur) {
        s.erreur(couleur.erreur, ligne);
        continue;
      }
      const mode = (['clair', 'sombre'] as const).find((m) => contraste(couleur[m], FOND_PAGE[m]) < 3);
      if (mode) {
        const rapport = contraste(couleur[mode], FOND_PAGE[mode]).toFixed(1).replace('.', ',');
        s.avertissement(
          `la couleur « ${couleur.nom} » se voit mal sur le fond de la page en mode ${mode} (contraste ${rapport} pour 1, il en faut au moins 3) : choisissez une couleur plus ${mode === 'clair' ? 'foncée' : 'claire'}.`,
          ligne,
        );
      }
    }
  }
  const valeurs = g.valeur ? [g.valeur] : g.series.flatMap((serie) => (serie.valeur ? [serie.valeur] : []));
  for (const valeur of valeurs) {
    if (valeur.devise !== undefined && !DEVISES[normaliser(valeur.devise)]) {
      s.erreur(`« ${valeur.devise} » n’est pas une devise connue. Devises : FC, euros, dollars.${proposerNom(valeur.devise, Object.keys(DEVISES))}`, valeur.ligne);
    }
  }
  const unites = [...new Set(valeurs.map((v) => (v.devise === undefined ? 'sans devise' : DEVISES[normaliser(v.devise)] ?? v.devise)))];
  if (unites.length > 1) {
    s.erreur(`toutes les séries d’un graphique s’écrivent dans la même unité : ici, ${unites.join(' et ')}. Un axe ne peut pas compter deux unités à la fois.`, ligne);
  }
  if (g.proportions && !g.proportions.every((n) => Number.isInteger(n) && n > 0)) {
    s.erreur(`les proportions d’un graphique sont deux nombres entiers positifs : « proportions 2 sur 1 » (ici, ${g.proportions.join(' sur ').replace(/\./g, ',')}).`, ligne);
  }
}

/** Une liste de nombres : pas de champs, des étiquettes en liste de textes, aussi longue que la liste. */
function verifierListeDeNombres(g: Graphique, valeurs: ValeurGraphique[], s: SignalerGraphique): void {
  if (g.etiquette !== undefined || valeurs.length > 0) {
    s.erreur('« etiquette » et « valeur » nomment des champs, mais la liste ne contient que des nombres : retirez-les, et écrivez les libellés avec « etiquettes ["Lun", "Mar"] ».', g.ligne);
    return;
  }
  if (!g.etiquettes) return;
  const type = s.typeDe(g.etiquettes);
  if (estConnu(type) && !(type.genre === 'liste' && (type.de.genre === 'texte' || !estConnu(type.de)))) {
    s.erreur(`« etiquettes » attend une liste de textes, par exemple etiquettes ["Lun", "Mar", "Mer"] ; ici, c’est ${decrireListe(type)}.`, g.ligne);
    return;
  }
  const nombres = s.listeEcrite(g.liste);
  const etiquettes = s.listeEcrite(g.etiquettes);
  if (nombres && etiquettes && nombres.elements.length !== etiquettes.elements.length) {
    s.erreur(`il y a ${nombres.elements.length} nombres et ${etiquettes.elements.length} étiquettes : il en faut autant, une étiquette par nombre.`, g.ligne);
  }
}

/** Une liste de fiches ou de données : le champ des libellés, et ceux des valeurs, existent ; les valeurs sont des nombres. */
function verifierChampsGraphique(g: Graphique, valeurs: ValeurGraphique[], champs: { nom: string; type: TypeValeur }[], s: SignalerGraphique): void {
  const { ligne } = g;
  const textes = champs.filter((c) => c.type.genre === 'texte').map((c) => c.nom);
  const nombres = champs.filter((c) => c.type.genre === 'nombre').map((c) => c.nom);
  const inconnu = (nom: string) =>
    s.erreur(`« ${nom} » n’est pas un champ des éléments de la liste. Champs : ${champs.map((c) => c.nom).join(', ')}.${proposerNom(nom, champs.map((c) => c.nom))}`, ligne);
  if (g.etiquettes) {
    s.erreur(`« etiquettes » sert à une liste de nombres ; pour une liste de fiches ou de données, nommez le champ des libellés : « etiquette ${textes[0] ?? 'mois'} ».`, ligne);
    return;
  }
  if (g.etiquette === undefined) {
    s.erreur(`il manque le champ des libellés : ajoutez par exemple « etiquette ${textes[0] ?? champs[0]?.nom ?? 'mois'} ». Champs : ${champs.map((c) => c.nom).join(', ')}.`, ligne);
  } else if (champs.length > 0 && !champs.some((c) => c.nom === g.etiquette)) {
    inconnu(g.etiquette);
  }
  if (!g.valeur && g.series.length === 0) {
    s.erreur(`il manque le champ des valeurs : ajoutez par exemple « valeur ${nombres[0] ?? 'montant'} ».`, ligne);
  }
  for (const serie of g.series) {
    if (!serie.valeur) s.erreur(`la série « ${serie.nom} » n’a pas de valeur : écrivez par exemple serie "${serie.nom}" valeur ${nombres[0] ?? 'montant'}.`, serie.ligne);
  }
  if (champs.length === 0) return;
  for (const valeur of valeurs) {
    const champ = champs.find((c) => c.nom === valeur.champ);
    if (!champ) inconnu(valeur.champ);
    else if (estConnu(champ.type) && champ.type.genre !== 'nombre') {
      s.erreur(
        `le champ « ${valeur.champ} » est ${decrireType(champ.type)} : un graphique dessine des nombres. Choisissez un champ nombre pour « valeur »${nombres.length ? ` (${nombres.join(', ')})` : ''}.`,
        valeur.ligne,
      );
    }
  }
}

/** Les nombres écrits dans le programme : parts négatives, trop de parts ou de barres, une courbe d'un seul point. */
function verifierNombresEcrits(g: Graphique, s: SignalerGraphique): void {
  const liste = s.listeEcrite(g.liste);
  if (!liste) return;
  const champ = g.valeur?.champ ?? g.series[0]?.valeur?.champ;
  const nombres = liste.elements.flatMap((e) => {
    const valeur = e.type === 'Fiche' ? e.champs.find((c) => c.nom === champ)?.valeur : e;
    return valeur?.type === 'Nombre' ? [valeur.valeur] : [];
  });
  const n = liste.elements.length;
  if (g.genre === 'camembert') {
    const negatif = nombres.find((v) => v < 0);
    if (negatif !== undefined) {
      s.erreur(`un camembert ne montre pas de valeur négative (${String(negatif).replace('.', ',')}) : une part ne peut pas être plus petite que rien. Choisissez un graphique en barres.`, g.ligne);
    } else if (n > MAXIMUM_PARTS) {
      s.avertissement(`${n} parts : au-delà de ${MAXIMUM_PARTS}, un camembert se lit mal. Regroupez les petites parts, ou choisissez un graphique en barres.`, g.ligne);
    }
  } else if (g.genre === 'barres' && n > MAXIMUM_BARRES) {
    s.avertissement(`${n} barres : au-delà de ${MAXIMUM_BARRES}, elles deviennent trop fines pour être lues. Regroupez les valeurs, ou choisissez un graphique en courbe.`, g.ligne);
  } else if (g.genre === 'courbe' && n === 1) {
    s.avertissement('une courbe d’un seul point ne montre pas d’évolution : ajoutez des valeurs, ou montrez ce nombre dans un texte.', g.ligne);
  }
}
