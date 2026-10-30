/**
 * Les vérifications de la carte et de ses marqueurs.
 */
import type { Bloc, Element, Expression, Instruction } from '../parser/ast.js';
import type { Diagnostic } from './erreurs.js';
import type { Application, NoeudVue } from '../ri/types.js';
import { texteSimple, type Signaler } from './ecran.js';
import { decrireType, estConnu } from './types.js';

/** Au-delà, une carte devient lourde : le regroupement des marqueurs n'existe pas dans cette version. */
export const MAXIMUM_MARQUEURS = 200;

/** Le début du message qui prévient que les tuiles viennent d'un fournisseur. */
export const DEBUT_MESSAGE_TUILES = 'cette carte appelle un fournisseur de tuiles';

const decimal = (n: number) => String(n).replace('.', ',');

/** Une expression numérique écrite sans calcul ni variable : sa valeur, sinon undefined. */
const nombreLitteral = (e: Expression): number | undefined => (e.type === 'Nombre' ? e.valeur : undefined);

/** latitude, longitude ou zoom : un nombre, dans ses bornes quand il est écrit en clair. */
function verifierNombre(e: Expression, quoi: 'latitude' | 'longitude' | 'zoom', ligne: number, s: Signaler): void {
  const [minimum, maximum] = quoi === 'latitude' ? [-90, 90] : quoi === 'longitude' ? [-180, 180] : [1, 18];
  const type = s.typeDe(e);
  if (estConnu(type) && type.genre !== 'nombre') {
    s.erreur(`${quoi === 'zoom' ? 'le' : 'la'} ${quoi} est un nombre (ici, ${decrireType(type)}) : ${quoi} ${quoi === 'zoom' ? '15' : quoi === 'latitude' ? '-4,3250' : '15,3222'}.`, ligne);
    return;
  }
  const valeur = nombreLitteral(e);
  if (valeur === undefined) return;
  if (valeur < minimum || valeur > maximum) {
    s.erreur(
      quoi === 'zoom'
        ? `le zoom ${decimal(valeur)} est hors des bornes : il va de 1 (le monde entier) à 18 (une rue).`
        : `la ${quoi} ${decimal(valeur)} est hors des bornes : elle va de ${minimum} à ${maximum}.`,
      ligne,
    );
  } else if (quoi === 'zoom' && !Number.isInteger(valeur)) {
    s.erreur(`le zoom est un nombre entier de 1 (le monde entier) à 18 (une rue), pas ${decimal(valeur)}.`, ligne);
  }
}

/** Le texte d'un nom (carte ou marqueur) : jamais vide quand il est écrit en clair. */
function verifierNom(e: Expression, siVide: string, ligne: number, s: Signaler): void {
  const texte = texteSimple(e);
  if (texte !== undefined && texte.trim() === '') s.erreur(siVide, ligne);
  else s.typeDe(e);
}

/** Les marqueurs du corps d'une carte, boucles et conditions comprises ; `litteraux` : ceux qui sont écrits un à un. */
function compterMarqueurs(corps: Instruction[]): { total: number; litteraux: number } {
  let total = 0;
  let litteraux = 0;
  for (const i of corps) {
    if (i.type === 'Element' && i.element === 'marqueur') {
      total++;
      litteraux++;
    } else if (i.type === 'Boucle') {
      total += compterMarqueurs(i.corps).total;
    } else if (i.type === 'Condition') {
      const alors = compterMarqueurs(i.alors);
      const sinon = compterMarqueurs(i.sinon);
      total += alors.total + sinon.total;
      litteraux += alors.litteraux + sinon.litteraux;
    }
  }
  return { total, litteraux };
}

/**
 * Une carte : un nom qui la décrit, une position complète ou aucune, des
 * bornes respectées, au moins un marqueur ou un centre, des tuiles
 * accompagnées de leur attribution.
 */
export function verifierCarte(bloc: Bloc, s: Signaler): void {
  const { ligne } = bloc;
  const options = bloc.carte ?? {};
  if (bloc.titre) {
    verifierNom(bloc.titre, 'le nom de la carte est vide : il la décrit pour les lecteurs d’écran, par exemple carte "Le restaurant Le Fleuve, avenue de la Gombe".', ligne, s);
  }
  const { latitude, longitude, zoom } = options;
  if ((latitude === undefined) !== (longitude === undefined)) {
    s.erreur(`une position s’écrit avec latitude et longitude ensemble : il manque ${latitude === undefined ? 'la latitude' : 'la longitude'}. Exemple : avec latitude -4,3250 et longitude 15,3222.`, ligne);
  }
  if (latitude) verifierNombre(latitude, 'latitude', ligne, s);
  if (longitude) verifierNombre(longitude, 'longitude', ligne, s);
  if (zoom) verifierNombre(zoom, 'zoom', ligne, s);

  if (options.tuiles !== undefined) {
    const adresse = options.tuiles;
    if (!/^https:\/\//i.test(adresse) || !adresse.includes('{z}') || !adresse.includes('{x}') || !adresse.includes('{y}')) {
      s.erreur(`l’adresse des tuiles commence par https:// et contient {z}, {x} et {y} (le zoom et la case demandés), comme https://tile.openstreetmap.org/{z}/{x}/{y}.png. Ici : « ${adresse} ».`, ligne);
    }
    if (options.attribution === undefined || options.attribution.trim() === '') {
      s.erreur('des tuiles d’un autre fournisseur demandent son attribution, toujours affichée sur la carte : avec tuiles "https://…/{z}/{x}/{y}.png" et attribution "© MapTiler".', ligne);
    }
  } else if (options.attribution !== undefined) {
    s.erreur('l’attribution accompagne des tuiles d’un autre fournisseur : écrivez aussi « tuiles "https://…/{z}/{x}/{y}.png" ». Les tuiles par défaut portent déjà leur attribution (OpenStreetMap).', ligne);
  }

  const intrus = bloc.corps.find((i) => !(i.type === 'Element' && i.element === 'marqueur') && i.type !== 'Boucle' && i.type !== 'Condition');
  if (intrus) {
    s.erreur('une carte ne contient que des marqueurs (dans un « pour chaque » ou un « si » au besoin) : marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070.', 'ligne' in intrus ? intrus.ligne : ligne);
  }
  const { total, litteraux } = compterMarqueurs(bloc.corps);
  if (latitude === undefined && longitude === undefined && total === 0) {
    s.erreur('une carte sans position ni marqueur n’affiche rien : ajoutez « avec latitude … et longitude … », ou des marqueurs.', ligne);
  }
  if (litteraux > MAXIMUM_MARQUEURS) {
    s.avertissement(`${litteraux} marqueurs écrits dans cette carte (plus de ${MAXIMUM_MARQUEURS}) : le regroupement des marqueurs n’existe pas dans cette version, la carte sera lente et illisible. Montrez-en moins, ou découpez en plusieurs cartes.`, ligne);
  }
}

/** Les cartes d'un arbre de vue, dans l'ordre. */
export function cartesDe(noeuds: NoeudVue[]): Extract<NoeudVue, { type: 'carte' }>[] {
  return noeuds.flatMap((n) => {
    if (n.type === 'carte') return [n];
    if (n.type === 'condition') return [...cartesDe(n.alors), ...cartesDe(n.sinon)];
    if (n.type === 'repetition' || n.type === 'bloc' || n.type === 'formulaire') return cartesDe(n.corps);
    return [];
  });
}

/**
 * Dit une fois par programme que les tuiles viennent d'un fournisseur : chaque
 * tuile demandée envoie l'adresse IP du visiteur (et la page d'où il vient) à ce
 * fournisseur. Pour le web, le desktop et le site statique ; le mobile dit la même
 * chose avec la clé de Google Maps (`cibles/mobile/projet.ts`). Un avertissement,
 * donné par la commande à la compilation (le sens du programme n'est pas en cause).
 */
export function prevenirDesTuiles(application: Application): Diagnostic[] {
  const cartes = [...application.ecrans, ...application.composants, ...(application.disposition ? [application.disposition.entete, application.disposition.pied].flatMap((d) => (d ? [d.ecran] : [])) : [])].flatMap((e) => cartesDe(e.vue));
  if (cartes.length === 0) return [];
  const fournisseurs = [...new Set(cartes.map((c) => (c.tuiles ? (/^https:\/\/([^/{]+)/i.exec(c.tuiles.adresse)?.[1] ?? 'un autre fournisseur') : 'tile.openstreetmap.org, OpenStreetMap')))];
  return [
    {
      gravite: 'avertissement',
      ligne: cartes[0].ligne,
      message: `${DEBUT_MESSAGE_TUILES} (${fournisseurs.join(' ; ')}) : l’adresse IP de chaque visiteur lui est envoyée avec chaque tuile demandée. Pour un site à fort trafic, prenez un fournisseur à contrat (avec tuiles "…" et attribution "…").`,
    },
  ];
}

/** Un marqueur : dans une carte, nommé, avec une position complète et dans les bornes. */
export function verifierMarqueur(element: Element, dansCarte: boolean, s: Signaler): void {
  const { ligne, lieu } = element;
  if (!dansCarte) {
    s.erreur('un marqueur se place dans une carte : carte "Nos agences" : puis, en dessous et décalé, marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070.', ligne);
  }
  verifierNom(element.contenu, 'le nom du marqueur est vide : il s’affiche dans la bulle et nomme le repère pour les lecteurs d’écran.', ligne, s);
  if (lieu?.latitude === undefined || lieu.longitude === undefined) {
    const manque = lieu?.latitude === undefined && lieu?.longitude === undefined ? 'sa latitude et sa longitude' : lieu?.latitude === undefined ? 'sa latitude' : 'sa longitude';
    s.erreur(`le marqueur a besoin de sa position : il manque ${manque}. Exemple : marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070.`, ligne);
  }
  if (lieu?.latitude) verifierNombre(lieu.latitude, 'latitude', ligne, s);
  if (lieu?.longitude) verifierNombre(lieu.longitude, 'longitude', ligne, s);
  if (lieu?.adresse) s.typeDe(lieu.adresse);
}
