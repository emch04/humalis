/**
 * L'analyse syntaxique des graphiques, des médias et du mouvement.
 *
 * Aucun de ces mots n'est réservé : les options (`animation`, `duree`,
 * `proportions`…) ne sont des mots-clés qu'après « avec » ou « et », et les
 * éléments (`graphique`, `audio`, `carte`…) qu'en tête de ligne, suivis de
 * ce qu'ils attendent. `variable animation = 1` reste permis.
 */
import type { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import type { Expression, GenreGraphique, Graphique, SerieGraphique, Style, ValeurGraphique } from './ast.js';
import { estLeMot, estMot } from './miseEnPage.js';
import { normaliser } from '../lexer/motsCles.js';
import { proposerNom } from '../analyse/suggestions.js';
import { lireVersions } from './langues.js';

/**
 * Les options des médias dont la tournure n'est pas « nom valeur ». Le nom
 * de l'option est déjà lu ; renvoie undefined pour les autres.
 */
export function analyserOptionMedia(flux: FluxTokens, nom: string): Style | undefined {
  // « animation montee au defilement » : l'animation se joue quand l'élément entre à l'écran.
  if (nom === 'animation') {
    if (!estMot(flux.actuel())) {
      throw new ErreurSyntaxique('il manque le nom de l’animation : « animation apparition », « animation montee » ou « animation agrandissement »', flux.actuel().ligne);
    }
    const valeur = flux.avancer().valeur;
    if (estLeMot(flux.actuel(), 'defilement')) {
      flux.avancer();
      // « … au defilement et en cascade » : les enfants du bloc, l'un après l'autre.
      const enCascade = flux.actuel().valeur === 'et' && estLeMot(flux.regarder(1), 'en') && estLeMot(flux.regarder(2), 'cascade');
      if (enCascade) for (let i = 0; i < 3; i++) flux.avancer();
      return { propriete: 'animation', valeur, defilement: true, ...(enCascade ? { cascade: true } : {}) };
    }
    return { propriete: 'animation', valeur };
  }
  // « description "Le fleuve" », « description "{p.nom}" » ou « description p.nom » : un texte, avec ses {variables}.
  if (nom === 'description' || nom === 'transcription') {
    const actuel = flux.actuel();
    if (actuel.type === 'CHAINE') {
      flux.avancer();
      // « description "Le fleuve" en anglais "The river" » : les versions écrites à côté.
      const versions = lireVersions(flux);
      const parties = actuel.parties ?? [];
      return {
        propriete: nom,
        valeur: actuel.valeur,
        parties,
        ...(versions ? { texte: { type: 'Chaine' as const, parties, versions, ligne: actuel.ligne } } : {}),
      };
    }
    if (actuel.type === 'IDENTIFIANT') {
      const noms = [flux.avancer().valeur];
      while (flux.actuel().type === 'PONCTUATION' && flux.actuel().valeur === '.' && estMot(flux.regarder(1))) {
        flux.avancer();
        noms.push(flux.avancer().valeur);
      }
      const reference = noms.join('.');
      return { propriete: nom, valeur: `{${reference}}`, parties: [{ type: 'variable', valeur: reference }] };
    }
    return undefined;
  }
  // « proportions 4 sur 3 » : le rapport de la largeur à la hauteur.
  if (nom === 'proportions') {
    const largeur = flux.actuel();
    if (largeur.type !== 'NOMBRE' || !estLeMot(flux.regarder(1), 'sur') || flux.regarder(2).type !== 'NOMBRE') {
      throw new ErreurSyntaxique('les proportions s’écrivent « largeur sur hauteur », par exemple « proportions 4 sur 3 » ou « proportions 16 sur 9 »', largeur.ligne);
    }
    flux.avancer();
    flux.avancer();
    return { propriete: nom, valeur: `${largeur.valeur}:${flux.avancer().valeur}` };
  }
  // Les réglages sans valeur des images : « decoratif » (ou « decorative », l'image), « prioritaire ».
  if (nom === 'decorative' || nom === 'decoratif') return { propriete: 'decoratif', valeur: 'oui' };
  if (nom === 'prioritaire') return { propriete: nom, valeur: 'oui' };
  return undefined;
}

// ─── Les graphiques (plan, 4.1) ──────────────────────────────────────────

const GENRES_GRAPHIQUE: Record<string, GenreGraphique> = { courbe: 'courbe', courbes: 'courbe', barres: 'barres', barre: 'barres', camembert: 'camembert', camemberts: 'camembert' };
const OPTIONS_GRAPHIQUE = ['etiquette', 'etiquettes', 'valeur', 'couleur', 'description', 'proportions', 'style'];
const EXEMPLE_SERIE = 'serie "Ventes" valeur ventes avec couleur bleu';

/** Ce que l'analyse d'un graphique demande à `parser.ts` : lire une valeur (la liste, les étiquettes). */
export interface LecteurGraphique {
  expression(flux: FluxTokens): Expression;
}

const motDe = (flux: FluxTokens, decalage = 0) => {
  const jeton = flux.regarder(decalage);
  return estMot(jeton) ? normaliser(jeton.original ?? jeton.valeur) : '';
};

/**
 * « graphique en courbe … » en tête de ligne. « graphique » suivi d'une
 * valeur (un nom, une liste, un texte) est aussi un graphique, dont le genre
 * manque. « variable graphique = 1 » et « graphique = 2 » restent permis.
 */
export function estGraphique(flux: FluxTokens): boolean {
  if (!estLeMot(flux.actuel(), 'graphique')) return false;
  const suivant = flux.regarder(1);
  return estLeMot(suivant, 'en') || suivant.type === 'IDENTIFIANT' || suivant.type === 'CHAINE' || (suivant.type === 'PONCTUATION' && suivant.valeur === '[');
}

/** « serie "Ventes" … » en tête de ligne. */
export function estSerieSeule(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'serie') && flux.regarder(1).type === 'CHAINE';
}

/** Une série hors d'un graphique en bloc. */
export function refuserSerieSeule(flux: FluxTokens): never {
  throw new ErreurSyntaxique(
    `« serie » se place dans un graphique en bloc, décalée sous la ligne « graphique … : », par exemple ${EXEMPLE_SERIE}`,
    flux.actuel().ligne,
  );
}

export function analyserGraphique(flux: FluxTokens, lecteur: LecteurGraphique): Graphique {
  const debut = flux.avancer();
  const genre = estLeMot(flux.actuel(), 'en') ? GENRES_GRAPHIQUE[motDe(flux, 1)] : undefined;
  if (!genre) {
    throw new ErreurSyntaxique(
      'il manque le genre du graphique juste après « graphique » : en courbe, en barres, en camembert. Par exemple : graphique en barres ventes avec etiquette mois et valeur montant et description "…"',
      debut.ligne,
    );
  }
  flux.avancer();
  flux.avancer();
  const graphique: Graphique = { type: 'Graphique', genre, liste: lecteur.expression(flux), series: [], classes: [], ligne: debut.ligne };
  if (flux.accepter('MOT_CLE', 'avec')) {
    do lireOptionGraphique(flux, graphique, lecteur);
    while (flux.accepter('MOT_CLE', 'et'));
  }
  if (flux.accepter('PONCTUATION', ':')) graphique.series = lireSeries(flux);
  return graphique;
}

function lireOptionGraphique(flux: FluxTokens, graphique: Graphique, lecteur: LecteurGraphique): void {
  const jeton = flux.actuel();
  const nom = motDe(flux);
  if (!OPTIONS_GRAPHIQUE.includes(nom)) {
    throw new ErreurSyntaxique(
      `« ${jeton.original ?? jeton.valeur} » n’est pas une option de graphique. Options : ${OPTIONS_GRAPHIQUE.join(', ')}.${proposerNom(nom, OPTIONS_GRAPHIQUE)}`,
      jeton.ligne,
    );
  }
  flux.avancer();
  if (nom === 'etiquette') graphique.etiquette = flux.attendreNom('le champ des libellés, par exemple « etiquette mois »').nom;
  else if (nom === 'etiquettes') graphique.etiquettes = lecteur.expression(flux);
  else if (nom === 'valeur') graphique.valeur = lireValeur(flux);
  else if (nom === 'couleur') graphique.couleur = flux.attendreNom('une couleur, par exemple « couleur bleu »').nom;
  else if (nom === 'style') graphique.classes.push(...flux.attendre('CHAINE', undefined, 'le nom de la classe CSS entre guillemets').valeur.split(/\s+/).filter(Boolean));
  else if (nom === 'proportions') {
    const [largeur, hauteur] = analyserOptionMedia(flux, 'proportions')!.valeur.split(':').map(Number);
    graphique.proportions = [largeur, hauteur];
  } else {
    // « description "…" » ou « description p.nom » : un texte, avec ses {variables}.
    const description = analyserOptionMedia(flux, 'description');
    const parties = description?.parties ?? [{ type: 'texte' as const, valeur: flux.attendre('CHAINE', undefined, 'la description entre guillemets').valeur }];
    graphique.description = { type: 'Chaine', parties, ...(description?.texte?.versions ? { versions: description.texte.versions } : {}), ligne: jeton.ligne };
  }
}

/** « valeur montant », « valeur montant en FC ». */
function lireValeur(flux: FluxTokens): ValeurGraphique {
  const champ = flux.attendreNom('le champ des valeurs, par exemple « valeur montant »');
  const valeur: ValeurGraphique = { champ: champ.nom, ligne: champ.ligne };
  if (estLeMot(flux.actuel(), 'en') && estMot(flux.regarder(1))) {
    flux.avancer();
    const devise = flux.avancer();
    valeur.devise = devise.original ?? devise.valeur;
  }
  return valeur;
}

/** Les lignes « serie » d'un graphique en bloc. */
function lireSeries(flux: FluxTokens): SerieGraphique[] {
  const series: SerieGraphique[] = [];
  flux.sauterFinsDeLigne();
  if (!flux.accepter('INDENT')) return series;
  flux.sauterFinsDeLigne();
  while (!flux.verifier('DEDENT') && !flux.estFini()) {
    const debut = flux.actuel();
    if (!estSerieSeule(flux)) {
      throw new ErreurSyntaxique(`dans un graphique, chaque ligne est une série, par exemple ${EXEMPLE_SERIE}`, debut.ligne);
    }
    flux.avancer();
    const nom = flux.avancer();
    const serie: SerieGraphique = { nom: nom.valeur, ligne: debut.ligne };
    // « serie "Ventes" en anglais "Sales" » : les versions écrites à côté.
    const versions = lireVersions(flux);
    if (versions) serie.texteNom = { type: 'Chaine', parties: [{ type: 'texte', valeur: nom.valeur }], versions, ligne: nom.ligne };
    if (estLeMot(flux.actuel(), 'valeur')) {
      flux.avancer();
      serie.valeur = lireValeur(flux);
    }
    if (flux.accepter('MOT_CLE', 'avec')) {
      do {
        const option = flux.actuel();
        if (motDe(flux) !== 'couleur') {
          throw new ErreurSyntaxique(`« ${option.original ?? option.valeur} » ne se règle pas sur une série : seule sa couleur se choisit, par exemple ${EXEMPLE_SERIE}`, option.ligne);
        }
        flux.avancer();
        serie.couleur = flux.attendreNom('une couleur, par exemple « couleur bleu »').nom;
      } while (flux.accepter('MOT_CLE', 'et'));
    }
    series.push(serie);
    flux.sauterFinsDeLigne();
  }
  flux.accepter('DEDENT');
  return series;
}
