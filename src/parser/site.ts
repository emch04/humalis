/**
 * L'analyse syntaxique de la publication (plan 2026-10-30-qualite-publication,
 * parties 3 et 4) : le bloc « site : » en haut du fichier, et le bloc
 * « apercu : » dans une page. Tous les mots sont contextuels : ailleurs,
 * « site », « apercu » ou « logo » restent des noms libres.
 */
import { normaliser } from '../lexer/motsCles.js';
import type { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import { estLeMot, estMot } from './miseEnPage.js';
import type { Apercu, Expression, Site } from './ast.js';
import { lireVersions } from './langues.js';

const LIGNES_SITE = ['nom', 'description', 'image', 'logo', 'adresse'] as const;
const LIGNES_APERCU = ['titre', 'description', 'image'] as const;

const suiviDeDeuxPoints = (flux: FluxTokens) => flux.regarder(1).type === 'PONCTUATION' && flux.regarder(1).valeur === ':';

/** « site : » en haut du fichier. */
export function estSite(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'site') && suiviDeDeuxPoints(flux);
}

/** « apercu : » (ou « aperçu : ») en tête de ligne dans une page. */
export function estApercu(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'apercu') && suiviDeDeuxPoints(flux);
}

/** Le mot qui ouvre une ligne du bloc, sans accent. */
function motDeLigne(flux: FluxTokens, attendus: string): string {
  const jeton = flux.actuel();
  if (!estMot(jeton)) {
    throw new ErreurSyntaxique(`une ligne de ce bloc commence par ${attendus} : à la place, on trouve « ${jeton.valeur || jeton.type} »`, jeton.ligne);
  }
  flux.avancer();
  return normaliser(jeton.original ?? jeton.valeur);
}

/** « indexation non » (ou « indexation oui ») : vrai si la page ou le site est indexé. */
function indexation(flux: FluxTokens): boolean {
  const jeton = flux.actuel();
  if (estLeMot(jeton, 'non') || estLeMot(jeton, 'oui')) {
    flux.avancer();
    return estLeMot(jeton, 'oui');
  }
  throw new ErreurSyntaxique('« indexation » est suivi de « non » (caché aux moteurs de recherche) ou de « oui ».', jeton.ligne);
}

/** Les lignes décalées d'un bloc, une par une ; le bloc vide est permis. */
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

export function analyserSite(flux: FluxTokens): Site {
  const debut = flux.avancer();
  flux.avancer();
  const site: Site = { type: 'Site', indexation: true, lignes: {}, ligne: debut.ligne };
  lignesDuBloc(flux, () => {
    const ligne = flux.actuel().ligne;
    const genre = motDeLigne(flux, 'nom, description, image, logo, adresse ou indexation');
    if (genre === 'indexation') {
      site.indexation = indexation(flux);
      return;
    }
    if (!(LIGNES_SITE as readonly string[]).includes(genre)) {
      throw new ErreurSyntaxique(`« ${genre} » n'est pas une ligne du bloc « site ». Lignes possibles : nom, description, image, logo, adresse ou indexation.`, ligne);
    }
    const cle = genre as (typeof LIGNES_SITE)[number];
    if (site[cle] !== undefined) throw new ErreurSyntaxique(`« ${cle} » est déjà donné dans le bloc « site » (ligne ${site.lignes[cle]}).`, ligne);
    const texte = flux.attendre('CHAINE', undefined, `la valeur de « ${cle} » entre guillemets`);
    site[cle] = texte.valeur;
    site.lignes[cle] = ligne;
    // « nom "Le Fleuve" en anglais "The River" » : le nom et la description se traduisent.
    if (cle === 'nom' || cle === 'description') {
      const versions = lireVersions(flux);
      if (versions) site.textes = { ...site.textes, [cle]: { type: 'Chaine', parties: [{ type: 'texte', valeur: texte.valeur }], versions, ligne: texte.ligne } };
    }
  });
  return site;
}

/** « apercu : » ; `expression` lit un texte avec ses « {…} », comme ailleurs dans la page. */
export function analyserApercu(flux: FluxTokens, expression: (flux: FluxTokens) => Expression): Apercu {
  const debut = flux.avancer();
  flux.avancer();
  const apercu: Apercu = { type: 'Apercu', indexation: true, ligne: debut.ligne };
  lignesDuBloc(flux, () => {
    const ligne = flux.actuel().ligne;
    const genre = motDeLigne(flux, 'titre, description, image ou indexation');
    if (genre === 'indexation') {
      apercu.indexation = indexation(flux);
      return;
    }
    if (!(LIGNES_APERCU as readonly string[]).includes(genre)) {
      throw new ErreurSyntaxique(`« ${genre} » n'est pas une ligne du bloc « apercu ». Lignes possibles : titre, description, image ou indexation.`, ligne);
    }
    const cle = genre as (typeof LIGNES_APERCU)[number];
    if (apercu[cle] !== undefined) throw new ErreurSyntaxique(`« ${cle} » est déjà donné dans le bloc « apercu ».`, ligne);
    apercu[cle] = expression(flux);
  });
  return apercu;
}
