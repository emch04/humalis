/**
 * L'analyse syntaxique des langues (plan 2026-10-30-qualite-publication,
 * partie 1, décisions Q1 à Q4) :
 *
 * - le bloc « langues : » en haut du fichier, une langue par ligne, ou sur la
 *   même ligne séparées par des virgules : « langues : francais, anglais » ;
 * - le bloc « traductions anglais : », des lignes « "texte" : "version" » ;
 * - la version écrite à côté d'un texte : « "Bienvenue" en anglais "Welcome" » ;
 * - l'élément « selecteur de langue », en tête de ligne.
 *
 * Aucun de ces mots n'est réservé : « langues », « traductions » et
 * « selecteur » ne comptent qu'à leur place ; « en » n'est lu après un texte
 * que s'il est suivi d'un nom puis d'un autre texte.
 */
import { normaliser } from '../lexer/motsCles.js';
import type { PartieChaine } from '../lexer/types.js';
import type { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import { estLeMot, estMot } from './miseEnPage.js';
import type { Langues, Traductions, VersionChaine } from './ast.js';

const suiviDeDeuxPoints = (flux: FluxTokens, decalage = 1) =>
  flux.regarder(decalage).type === 'PONCTUATION' && flux.regarder(decalage).valeur === ':';

/** « langues : » en haut du fichier. */
export function estLangues(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'langues') && suiviDeDeuxPoints(flux);
}

/** « traductions anglais : » en haut du fichier. */
export function estTraductions(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'traductions') && estMot(flux.regarder(1)) && suiviDeDeuxPoints(flux, 2);
}

/** Les lignes décalées d'un bloc, une par une. */
function lignesDuBloc(flux: FluxTokens, lireLigne: () => void): void {
  flux.sauterFinsDeLigne();
  if (!flux.accepter('INDENT')) return;
  flux.sauterFinsDeLigne();
  while (!flux.verifier('DEDENT') && !flux.estFini()) {
    lireLigne();
    flux.sauterFinsDeLigne();
  }
  flux.accepter('DEDENT');
}

export function analyserLangues(flux: FluxTokens): Langues {
  const debut = flux.avancer();
  flux.avancer();
  const langues: Langues = { type: 'Langues', langues: [], ligne: debut.ligne };
  const ajouter = (jeton: ReturnType<FluxTokens['actuel']>) =>
    langues.langues.push({ mot: normaliser(jeton.original ?? jeton.valeur), ligne: jeton.ligne });
  // « langues : francais, anglais » : sur la ligne même, séparées par des virgules.
  if (!flux.verifier('FIN_LIGNE') && !flux.estFini()) {
    for (;;) {
      const jeton = flux.actuel();
      if (!estMot(jeton)) {
        throw new ErreurSyntaxique(`après « langues : », on attend le nom d'une langue, par exemple « francais » ou « anglais » : à la place, on trouve « ${jeton.valeur || jeton.type} »`, jeton.ligne);
      }
      flux.avancer();
      ajouter(jeton);
      if (flux.verifier('FIN_LIGNE') || flux.estFini()) break;
      if (flux.actuel().type === 'PONCTUATION' && flux.actuel().valeur === ',') {
        flux.avancer();
        if (flux.verifier('FIN_LIGNE') || flux.estFini()) {
          throw new ErreurSyntaxique(`après la virgule, il manque le nom d'une langue : « langues : francais, anglais »`, jeton.ligne);
        }
        continue;
      }
      throw new ErreurSyntaxique(`séparez les langues par des virgules : « langues : francais, anglais ». À la place de la virgule, on trouve « ${flux.actuel().valeur || flux.actuel().type} »`, jeton.ligne);
    }
    flux.sauterFinsDeLigne();
    if (flux.verifier('INDENT')) {
      throw new ErreurSyntaxique(`les langues s'écrivent soit sur la ligne, soit en dessous, une par ligne, pas les deux à la fois`, flux.actuel().ligne);
    }
    return langues;
  }
  lignesDuBloc(flux, () => {
    const jeton = flux.actuel();
    if (!estMot(jeton)) {
      throw new ErreurSyntaxique(`une ligne du bloc « langues » est le nom d'une langue, par exemple « francais » ou « anglais » : à la place, on trouve « ${jeton.valeur || jeton.type} »`, jeton.ligne);
    }
    flux.avancer();
    ajouter(jeton);
  });
  return langues;
}

export function analyserTraductions(flux: FluxTokens): Traductions {
  const debut = flux.avancer();
  const langue = flux.avancer();
  flux.avancer();
  const traductions: Traductions = { type: 'Traductions', langue: normaliser(langue.original ?? langue.valeur), entrees: [], ligne: debut.ligne };
  lignesDuBloc(flux, () => {
    const ligne = flux.actuel().ligne;
    const texte = flux.attendre('CHAINE', undefined, 'le texte à traduire entre guillemets, puis « : » et sa version : "Bonjour" : "Hello"');
    flux.attendre('PONCTUATION', ':', 'deux-points entre le texte et sa version : "Bonjour" : "Hello"');
    const version = flux.attendre('CHAINE', undefined, 'la version entre guillemets après les deux-points : "Bonjour" : "Hello"');
    traductions.entrees.push({ texte: partiesDe(texte), version: partiesDe(version), ligne });
  });
  return traductions;
}

const partiesDe = (jeton: { valeur: string; parties?: PartieChaine[] }): PartieChaine[] =>
  jeton.parties ?? (jeton.valeur === '' ? [] : [{ type: 'texte', valeur: jeton.valeur }]);

/**
 * Après un texte : « en anglais "Welcome" », autant de fois qu'il y a de
 * versions. Un « en » qui n'est pas suivi d'un nom puis d'un texte n'est
 * pas consommé.
 */
export function lireVersions(flux: FluxTokens): VersionChaine[] | undefined {
  const versions: VersionChaine[] = [];
  while (estLeMot(flux.actuel(), 'en') && estMot(flux.regarder(1)) && flux.regarder(2).type === 'CHAINE') {
    flux.avancer();
    const langue = flux.avancer();
    const texte = flux.avancer();
    versions.push({ langue: normaliser(langue.original ?? langue.valeur), parties: partiesDe(texte), ligne: texte.ligne });
  }
  return versions.length > 0 ? versions : undefined;
}

/** « selecteur de langue » en tête de ligne (« de » est un mot de liaison, déjà sauté). */
export function estSelecteurLangue(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'selecteur') && estLeMot(flux.regarder(1), 'langue');
}

/** Le texte écrit, interpolations comprises (« {n article} dans le panier ») : la clé d'une traduction. */
export function texteSource(parties: PartieChaine[]): string {
  return parties.map((p) => (p.type === 'variable' ? `{${p.valeur}}` : p.valeur)).join('');
}
