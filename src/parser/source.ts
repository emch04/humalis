/**
 * Le bloc « source » : une API qui existe déjà. Ses mots
 * (`adresse`, `jeton`, `enveloppe`…) ne sont des mots-clés qu'ici : le lexer
 * ne les connaît pas, le parseur les lit à leur place, comme pour `serveur`.
 */
import type { Token } from '../lexer/types.js';
import { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import { normaliser } from '../lexer/motsCles.js';
import { chaqueLigne, analyserDonnee, estLeMot, analyserOperande } from './parser.js';
import type { ActionDonnee, Expression, JetonSource, PlaceJeton, Qui, RegleSource, RouteSource, Source } from './ast.js';

const mot = (token: Token) => normaliser(token.original ?? token.valeur);
const ecrit = (token: Token) => token.original ?? token.valeur;

const LIGNES = 'adresse, session, enveloppe, erreur, entete, jeton, cache, essais, delai, donnee, route';

/** « source "boutique" : », en haut du fichier. */
export function analyserSource(flux: FluxTokens): Source {
  const debut = flux.avancer();
  const nom = flux.attendre('CHAINE', undefined, 'le nom de la source entre guillemets').valeur;
  flux.attendre('PONCTUATION', ':', 'deux-points après le nom de la source');
  const source: Source = { type: 'Source', nom, session: false, entetes: [], donnees: [], routes: [], ligne: debut.ligne };

  chaqueLigne(flux, () => {
    const token = flux.actuel();
    const m = mot(token);
    switch (m) {
      case 'adresse':
        flux.avancer();
        source.adresse = flux.attendre('CHAINE', undefined, "l'adresse de l'API entre guillemets").valeur;
        break;
      case 'session':
        flux.avancer();
        if (!estLeMot(flux.actuel(), 'astratra')) {
          throw new ErreurSyntaxique('« session » est suivi de « astratra » : la connexion des packs Astratra (session astratra)', token.ligne);
        }
        flux.avancer();
        source.session = true;
        break;
      case 'enveloppe':
        flux.avancer();
        source.enveloppe = flux.attendre('CHAINE', undefined, 'le chemin de la valeur utile entre guillemets (enveloppe "data")').valeur;
        break;
      case 'erreur':
        flux.avancer();
        flux.attendre('MOT_CLE', 'dans', '« dans » suivi du chemin du message (erreur dans "message")');
        source.erreurDans = flux.attendre('CHAINE', undefined, 'le chemin du message entre guillemets').valeur;
        break;
      case 'entete': {
        flux.avancer();
        const nomEntete = flux.attendre('CHAINE', undefined, "le nom de l'en-tête entre guillemets").valeur;
        if (!estLeMot(flux.actuel(), 'vaut')) flux.attendre('IDENTIFIANT', 'vaut', '« vaut » suivi de la valeur (entete "Accept-Language" vaut "fr")');
        flux.avancer();
        const valeur = flux.attendre('CHAINE', undefined, "la valeur de l'en-tête entre guillemets").valeur;
        source.entetes.push({ nom: nomEntete, valeur, ligne: token.ligne });
        break;
      }
      case 'jeton':
        source.jeton = analyserJeton(flux);
        break;
      case 'cache':
        flux.avancer();
        source.cache = analyserDuree(flux, 'cache 5 minutes');
        break;
      case 'delai':
        flux.avancer();
        source.delai = analyserDuree(flux, 'delai 10 secondes');
        break;
      case 'essais': {
        flux.avancer();
        source.essais = entier(flux, 'essais 2');
        break;
      }
      case 'donnee':
        source.donnees.push(analyserDonnee(flux, true));
        break;
      case 'route':
        source.routes.push(analyserRouteSource(flux));
        break;
      default:
        throw new ErreurSyntaxique(`« ${ecrit(token)} » n'est pas une ligne d'une source. Lignes possibles : ${LIGNES}.`, token.ligne);
    }
  });
  return source;
}

function entier(flux: FluxTokens, exemple: string): number {
  const token = flux.attendre('NOMBRE', undefined, `un nombre entier (${exemple})`);
  const n = Number(token.valeur);
  if (!Number.isInteger(n) || n < 0) {
    throw new ErreurSyntaxique(`un nombre entier est attendu (${exemple}), mais « ${token.valeur} » a été trouvé`, token.ligne);
  }
  return n;
}

/** « 5 minutes », « 30 secondes », « 2 heures » : en secondes. */
function analyserDuree(flux: FluxTokens, exemple: string): number {
  const n = entier(flux, exemple);
  const unite = flux.actuel();
  const facteur: Record<string, number> = { seconde: 1, secondes: 1, minute: 60, minutes: 60, heure: 3600, heures: 3600 };
  const f = facteur[mot(unite)];
  if (f === undefined) {
    throw new ErreurSyntaxique(`une durée s'écrit avec un nombre entier et une unité : ${exemple} (secondes, minutes ou heures)`, unite.ligne);
  }
  flux.avancer();
  return n * f;
}

/** « jeton public "…" » ou « jeton secret depuis l'environnement "NOM" », puis où le mettre. */
function analyserJeton(flux: FluxTokens): JetonSource {
  const debut = flux.avancer();
  const genreToken = flux.actuel();
  const genre = mot(genreToken);
  let valeur: string;
  if (genre === 'public') {
    flux.avancer();
    valeur = flux.attendre('CHAINE', undefined, 'le jeton public entre guillemets (jeton public "pk_…")').valeur;
  } else if (genre === 'secret') {
    flux.avancer();
    // Un secret ne s'écrit jamais : seulement le nom de sa variable d'environnement.
    if (flux.verifier('CHAINE')) {
      throw new ErreurSyntaxique(
        `un jeton secret ne s'écrit jamais dans le fichier. Écrivez son nom : jeton secret depuis l'environnement "NOM_DE_LA_VARIABLE", et mettez la valeur dans le fichier .env du serveur.`,
        debut.ligne,
      );
    }
    if (!estLeMot(flux.actuel(), 'depuis')) flux.attendre('IDENTIFIANT', 'depuis', `« depuis l'environnement "NOM" » après « jeton secret »`);
    flux.avancer();
    if (!estLeMot(flux.actuel(), 'environnement')) flux.attendre('IDENTIFIANT', 'environnement', `« environnement » après « depuis » (depuis l'environnement "NOM")`);
    flux.avancer();
    valeur = flux.attendre('CHAINE', undefined, "le nom de la variable d'environnement entre guillemets").valeur;
  } else {
    throw new ErreurSyntaxique(
      `après « jeton », écrivez « public "…" » (valeur faite pour être vue) ou « secret depuis l'environnement "NOM" » ; « ${ecrit(genreToken)} » a été trouvé`,
      genreToken.ligne,
    );
  }
  let place: PlaceJeton = { genre: 'autorisation' };
  if (flux.accepter('MOT_CLE', 'dans')) {
    const lieu = flux.actuel();
    const m = mot(lieu);
    if (m !== 'entete' && m !== 'parametre') {
      throw new ErreurSyntaxique(`« dans » est suivi de « entete "X" » ou de « parametre "key" » ; « ${ecrit(lieu)} » a été trouvé`, lieu.ligne);
    }
    flux.avancer();
    place = { genre: m, nom: flux.attendre('CHAINE', undefined, `le nom de l'${m === 'entete' ? 'en-tête' : 'paramètre'} entre guillemets`).valeur };
  }
  return { genre: genre as 'public' | 'secret', valeur, place, ligne: debut.ligne };
}

const QUI: Record<string, Qui> = {
  'tout monde': 'tout_le_monde',
  connecte: 'connecte',
  'utilisateur connecte': 'connecte',
  'seul admin': 'admin',
  admin: 'admin',
};
const ACTIONS: ActionDonnee[] = ['lire', 'creer', 'modifier', 'supprimer'];

function analyserRouteSource(flux: FluxTokens): RouteSource {
  const debut = flux.avancer();
  const adresse = flux.attendre('CHAINE', undefined, "l'adresse de la route entre guillemets").valeur;
  flux.attendre('PONCTUATION', ':', 'deux-points après l\'adresse de la route');
  const regles: RegleSource[] = [];
  chaqueLigne(flux, () => regles.push(analyserRegleSource(flux)));
  return { type: 'RouteSource', adresse, regles, ligne: debut.ligne };
}

/** « [tout le monde peut] lire une liste de produit dans "products" ». */
function analyserRegleSource(flux: FluxTokens): RegleSource {
  const debut = flux.actuel();
  // Un « peut » sur la même ligne : les mots d'avant disent qui.
  let qui: Qui | undefined;
  let i = 0;
  while (!['FIN_LIGNE', 'FIN_FICHIER', 'INDENT', 'DEDENT'].includes(flux.regarder(i).type) && !estLeMot(flux.regarder(i), 'peut')) i++;
  if (estLeMot(flux.regarder(i), 'peut')) {
    const mots: string[] = [];
    while (!estLeMot(flux.actuel(), 'peut')) mots.push(mot(flux.avancer()));
    qui = QUI[mots.join(' ')];
    if (!qui) {
      throw new ErreurSyntaxique(`qui peut agir ? Écrivez « tout le monde », « connecte » ou « seul admin », puis « peut … »`, debut.ligne);
    }
    flux.avancer();
  }
  const verbe = flux.avancer();
  const action = mot(verbe) as ActionDonnee;
  if (!ACTIONS.includes(action)) {
    throw new ErreurSyntaxique(`« ${ecrit(verbe)} » n'est pas une action. Actions possibles : ${ACTIONS.join(', ')}.`, verbe.ligne);
  }
  const liste = estLeMot(flux.actuel(), 'liste');
  if (liste) flux.avancer();
  const { nom: donnee } = flux.attendreNom('le nom de la donnée');
  let remplacement = false;
  if (flux.verifier('MOT_CLE', 'par')) {
    flux.avancer();
    if (!estLeMot(flux.actuel(), 'remplacement') || action !== 'modifier') {
      throw new ErreurSyntaxique('« par remplacement » ne suit que « modifier » (modifier produit par remplacement)', verbe.ligne);
    }
    flux.avancer();
    remplacement = true;
  }
  let dans: string | undefined;
  if (flux.accepter('MOT_CLE', 'dans')) dans = flux.attendre('CHAINE', undefined, 'le chemin de la valeur dans la réponse, entre guillemets').valeur;
  return { type: 'RegleSource', qui, action, liste, donnee, ...(remplacement ? { remplacement } : {}), dans, ligne: debut.ligne };
}

/**
 * Après l'adresse d'une requête : « de la source "boutique" » (les articles
 * sont ignorés) puis « filtrant par categorie = "robes" et page = 2 ».
 */
/** « de la source "boutique" » seule (pour supprimer et modifier). */
export function analyserSourceSeule(flux: FluxTokens): string | undefined {
  if (estLeMot(flux.actuel(), 'source') && flux.regarder(1).type === 'CHAINE') {
    flux.avancer();
    return flux.avancer().valeur;
  }
  return undefined;
}

export function analyserClausesRequete(flux: FluxTokens): { source?: string; filtrant?: { cle: string; valeur: Expression }[] } {
  const clauses: { source?: string; filtrant?: { cle: string; valeur: Expression }[] } = {};
  if (estLeMot(flux.actuel(), 'source') && flux.regarder(1).type === 'CHAINE') {
    flux.avancer();
    clauses.source = flux.avancer().valeur;
  }
  if (estLeMot(flux.actuel(), 'filtrant')) {
    flux.avancer();
    flux.attendre('MOT_CLE', 'par', '« par » après « filtrant » (filtrant par categorie = "robes")');
    clauses.filtrant = [];
    do {
      const cle = flux.attendreNom('le nom du paramètre').nom;
      flux.attendre('PONCTUATION', '=', '« = » entre le paramètre et sa valeur (filtrant par categorie = "robes")');
      clauses.filtrant.push({ cle, valeur: analyserOperande(flux) });
    } while (flux.accepter('MOT_CLE', 'et'));
  }
  return clauses;
}
