import { deplierFonctionsActions } from './fonctionsActions.js';
import { estSite, analyserSite, estApercu, analyserApercu } from './site.js';
import { estLangues, analyserLangues, estTraductions, analyserTraductions, lireVersions, estSelecteurLangue } from './langues.js';
import { OPTIONS } from '../analyse/styles.js';
import type { Token } from '../lexer/types.js';
import { FluxTokens } from './fluxTokens.js';
import { analyserSource, analyserClausesRequete, analyserSourceSeule } from './source.js';
import { analyserEntetePage, analyserAvecPage } from './navigation.js';
import { ErreurSyntaxique } from './erreurs.js';
import { estUnTest, analyserTest } from './test.js';
import { normaliser } from '../lexer/motsCles.js';
import { entreePrevue } from '../vocabulaire/recherche.js';
import { langueDuMot } from '../i18n/langues.js';
import { estMot } from './miseEnPage.js';
import { analyserStylePropre, estSurAppareil, analyserSurAppareil, estDisposition, analyserDisposition, analyserSansDisposition } from './miseEnPage.js';
import { estCarte, estMarqueur, analyserCarte, analyserMarqueur } from './carte.js';
import { lireElementEcran, estFilAriane, GENRES_AVEC_TITRE } from './elements.js';
import { estChoixFichier, analyserChoixFichier, estEnvoiFichier, analyserEnvoiFichier } from './fichier.js';
import { estGraphique, analyserGraphique, estSerieSeule, refuserSerieSeule } from './medias.js';
import { estTheme, analyserTheme, estChangerTheme, analyserChangerTheme } from './theme.js';
import { estInteraction, analyserInteraction, lireSuiteMessage, lireEvenementUtilisateur, estEvenementOrdre, lireEvenementOrdre, type OutilsParser } from './interactions.js';
import type {
  Programme,
  Apercu,
  Test,
  Page,
  OptionsVariable,
  ComposantReact,
  DefinitionComposant,
  Serveur,
  Source,
  Donnee,
  TypeChamp,
  Route,
  Regle,
  Qui,
  ActionDonnee,
  Parametre,
  UsageComposant,
  BlocStyle,
  FichierStyle,
  Instruction,
  Expression,
  DeclarationVariable,
  Element,
  NomElement,
  SorteChamp,
  Formulaire,
  Bloc,
  DefinitionFonction,
  CasTest,
  Selon,
  GenreBloc,
  Style,
  Action,
  Affectation,
  ModificationListe,
  OperateurCalcul,
  Requete,
  Condition,
  Comparaison,
  Operateur,
  Boucle,
  Evenement,
  GenreEvenement,
  Connexion, Suppression, Modification, EnvoiFichier, ArgumentPage } from './ast.js';

export function analyserSyntaxe(tokens: Token[]): Programme {
  const flux = new FluxTokens(tokens);
  const pages: Page[] = [];
  const styles: BlocStyle[] = [];
  const fichiersStyle: FichierStyle[] = [];
  const donneesFichiers: Programme['donneesFichiers'] = [];
  const partages: DeclarationVariable[] = [];
  const composantsReact: ComposantReact[] = [];
  const fichiersHumalis: { chemin: string; ligne: number }[] = [];
  const composants: DefinitionComposant[] = [];
  const serveurs: Serveur[] = [];
  const sources: Source[] = [];
  const fonctions: DefinitionFonction[] = [];
  const tests: CasTest[] = [];
  let theme: Programme['theme'];
  let site: Programme['site'];
  let langues: Programme['langues'];
  const traductions: NonNullable<Programme['traductions']> = [];
  const constantes: DeclarationVariable[] = [];
  let entete: Programme['entete'];
  let pied: Programme['pied'];
  const nomsVus = new Set<string>();

  flux.sauterFinsDeLigne();

  while (!flux.estFini()) {
    if (flux.verifier('MOT_CLE', 'style') && flux.regarder(1).valeur === ':') {
      const debut = flux.avancer();
      flux.avancer();
      flux.sauterFinsDeLigne();
      const css = flux.accepter('CSS') ? flux.regarder(-1).valeur : '';
      styles.push({ type: 'BlocStyle', css, ligne: debut.ligne });
      flux.sauterFinsDeLigne();
      continue;
    }

    // « entete : » et « pied : » : communs à toutes les pages.
    if (estDisposition(flux)) {
      const disposition = analyserDisposition(flux, { corps: analyserBloc, style: analyserStyle });
      if (disposition.genre === 'entete' ? entete : pied) {
        throw new ErreurSyntaxique(`un seul « ${disposition.genre} » par application : il est déjà déclaré plus haut.`, disposition.ligne);
      }
      if (disposition.genre === 'entete') entete = disposition;
      else pied = disposition;
      flux.sauterFinsDeLigne();
      continue;
    }

    // « theme : » : les couleurs, les polices et le mode du projet.
    if (estTheme(flux)) {
      if (theme) throw new ErreurSyntaxique('un seul bloc « theme » par application : réunissez les couleurs et les polices dans le même bloc.', flux.actuel().ligne);
      theme = analyserTheme(flux);
      flux.sauterFinsDeLigne();
      continue;
    }

    // « site : » : la déclaration « je publie » (nom, description, image, logo, adresse).
    if (estSite(flux)) {
      if (site) throw new ErreurSyntaxique(`un seul bloc « site » par application : il est déjà déclaré (ligne ${site.ligne}).`, flux.actuel().ligne);
      if (pages.length > 0) throw new ErreurSyntaxique('le bloc « site » s\'écrit en haut du fichier, avant les pages.', flux.actuel().ligne);
      site = analyserSite(flux);
      flux.sauterFinsDeLigne();
      continue;
    }

    // « langues : » : les langues du site, la première est celle des textes écrits.
    if (estLangues(flux)) {
      if (langues) throw new ErreurSyntaxique(`un seul bloc « langues » par application : il est déjà déclaré (ligne ${langues.ligne}).`, flux.actuel().ligne);
      if (pages.length > 0) throw new ErreurSyntaxique('le bloc « langues » s\'écrit en haut du fichier, avant les pages.', flux.actuel().ligne);
      langues = analyserLangues(flux);
      flux.sauterFinsDeLigne();
      continue;
    }

    // « traductions anglais : » : des versions rangées en un seul endroit.
    if (estTraductions(flux)) {
      traductions.push(analyserTraductions(flux));
      flux.sauterFinsDeLigne();
      continue;
    }

    // « constante tva = 16 » en haut du fichier : elle vaut dans toutes les pages.
    if (estConstante(flux)) {
      constantes.push({ ...analyserVariable(flux), calcul: true, constante: true });
      flux.sauterFinsDeLigne();
      continue;
    }

    // « variable panier = [] avec partagee », en haut du fichier.
    if (flux.verifier('MOT_CLE', 'variable')) {
      partages.push(analyserVariable(flux));
      flux.sauterFinsDeLigne();
      continue;
    }

    if (estLeMot(flux.actuel(), 'serveur') && flux.regarder(1).type === 'CHAINE') {
      serveurs.push(analyserServeur(flux));
      flux.sauterFinsDeLigne();
      continue;
    }

    // « test "…" de page "…" : » (fichiers *.test.humalis, décision O3).
    if (estUnTest(flux)) {
      tests.push(analyserTest(flux));
      flux.sauterFinsDeLigne();
      continue;
    }

    // « fonction remise avec prix et taux : » ; « fonction » seul reste un nom possible.
    if (estLeMot(flux.actuel(), 'fonction') && estUnNom(flux.regarder(1))) {
      fonctions.push(analyserFonction(flux));
      flux.sauterFinsDeLigne();
      continue;
    }

    if (estLeMot(flux.actuel(), 'source') && flux.regarder(1).type === 'CHAINE') {
      sources.push(analyserSource(flux));
      flux.sauterFinsDeLigne();
      continue;
    }

    // « composant "Fiche" : » ; le mot peut arriver en mot-clé ou en nom.
    if (estLeMot(flux.actuel(), 'composant') && flux.regarder(1).type === 'CHAINE') {
      composants.push(analyserDefinitionComposant(flux));
      flux.sauterFinsDeLigne();
      continue;
    }

    if (flux.verifier('MOT_CLE', 'utiliser') && estLeMot(flux.regarder(1), 'composant')) {
      const debut = flux.avancer();
      flux.avancer();
      const nom = flux.attendre('CHAINE', undefined, 'le nom du composant entre guillemets').valeur;
      if (!estLeMot(flux.actuel(), 'depuis')) {
        flux.attendre('IDENTIFIANT', 'depuis', '« depuis » suivi du chemin du fichier React');
      }
      flux.avancer();
      const chemin = flux.attendre('CHAINE', undefined, 'le chemin du fichier React entre guillemets').valeur;
      composantsReact.push({ type: 'ComposantReact', nom, chemin, ligne: debut.ligne });
      flux.sauterFinsDeLigne();
      continue;
    }

    if (flux.verifier('MOT_CLE', 'utiliser') && estLeMot(flux.regarder(1), 'donnees')) {
      const debut = flux.avancer();
      flux.avancer();
      const nom = flux.attendre('CHAINE', undefined, 'le nom des données entre guillemets').valeur;
      if (!estLeMot(flux.actuel(), 'depuis')) throw new ErreurSyntaxique('écrivez « depuis » puis le chemin du fichier CSV ou JSON.', debut.ligne);
      flux.avancer();
      const chemin = flux.attendre('CHAINE', undefined, 'le chemin du fichier CSV ou JSON entre guillemets').valeur;
      donneesFichiers.push({ nom, chemin, ligne: debut.ligne });
      flux.sauterFinsDeLigne();
      continue;
    }

    // « utiliser fichier "./panier.humalis" » : un autre fichier du projet.
    if (flux.verifier('MOT_CLE', 'utiliser') && estLeMot(flux.regarder(1), 'fichier')) {
      const debut = flux.avancer();
      flux.avancer();
      const chemin = flux.attendre('CHAINE', undefined, 'le chemin du fichier Humalis entre guillemets').valeur;
      fichiersHumalis.push({ chemin, ligne: debut.ligne });
      flux.sauterFinsDeLigne();
      continue;
    }

    if (flux.verifier('MOT_CLE', 'utiliser')) {
      const debut = flux.avancer();
      flux.attendre('MOT_CLE', 'style', '« style » après « utiliser »');
      const chemin = flux.attendre('CHAINE', undefined, 'le chemin du fichier CSS entre guillemets').valeur;
      fichiersStyle.push({ type: 'FichierStyle', chemin, ligne: debut.ligne });
      flux.sauterFinsDeLigne();
      continue;
    }

    const page = analyserPage(flux);

    if (nomsVus.has(page.nom)) {
      throw new ErreurSyntaxique(
        `la page « ${page.nom} » est déjà déclarée plus haut`,
        page.ligne,
      );
    }

    nomsVus.add(page.nom);
    pages.push(page);
    flux.sauterFinsDeLigne();
  }

  // Les constantes du haut du fichier sont écrites en tête de chaque page et de chaque composant.
  if (constantes.length > 0) {
    for (const lieu of [...pages, ...composants, ...(entete ? [entete] : []), ...(pied ? [pied] : [])]) lieu.corps.unshift(...constantes.map((c) => ({ ...c })));
  }
  const programme: Programme = { type: 'Programme', pages, styles, fichiersStyle, donneesFichiers, partages, composantsReact, composants, serveurs, sources, fichiersHumalis, fonctions, tests, ...(theme ? { theme } : {}), ...(site ? { site } : {}), ...(langues ? { langues } : {}), ...(traductions.length ? { traductions } : {}), ...(entete ? { entete } : {}), ...(pied ? { pied } : {}) };
  // Les appels de fonctions d'actions sont remplacés par leur corps (src/parser/fonctionsActions.ts).
  const actions = deplierFonctionsActions(programme);
  if (actions.length) programme.fonctionsActions = actions;
  return programme;
}

/** « selon jour : », puis des « cas … : » et un « sinon : » décalés. */
function analyserSelon(flux: FluxTokens): Selon {
  const debut = flux.avancer();
  const valeur = analyserExpression(flux);
  flux.attendre('PONCTUATION', ':', 'deux-points après la valeur de « selon »');
  const cas: Selon['cas'] = [];
  let sinon: Instruction[] = [];
  flux.sauterFinsDeLigne();
  flux.attendre('INDENT', undefined, 'des lignes « cas … : » décalées sous « selon »');
  flux.sauterFinsDeLigne();
  while (!flux.verifier('DEDENT') && !flux.estFini()) {
    const ligne = flux.actuel().ligne;
    if (estLeMot(flux.actuel(), 'cas')) {
      flux.avancer();
      const valeurs: Expression[] = [];
      do valeurs.push(analyserExpression(flux));
      while (flux.accepter('MOT_CLE', 'ou'));
      flux.attendre('PONCTUATION', ':', 'deux-points après les valeurs du « cas »');
      cas.push({ valeurs, corps: analyserBloc(flux), ligne });
    } else if (flux.accepter('MOT_CLE', 'sinon')) {
      flux.attendre('PONCTUATION', ':', 'deux-points après « sinon »');
      sinon = analyserBloc(flux);
    } else {
      throw new ErreurSyntaxique('dans « selon », chaque ligne commence par « cas … : » ou « sinon : ».', ligne);
    }
    flux.sauterFinsDeLigne();
  }
  flux.accepter('DEDENT');
  return { type: 'Selon', valeur, cas, sinon, ligne: debut.ligne };
}

/** « fonction remise avec prix et taux : », puis le corps décalé. */
function analyserFonction(flux: FluxTokens): DefinitionFonction {
  const debut = flux.avancer();
  const { nom } = flux.attendreNom('le nom de la fonction');
  const parametres: { nom: string; ligne: number }[] = [];
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      const parametre = flux.attendreNom('le nom d\'une valeur que reçoit la fonction');
      parametres.push({ nom: parametre.nom, ligne: parametre.ligne });
    } while (flux.accepter('MOT_CLE', 'et'));
  }
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la ligne « fonction », puis son corps en dessous, décalé');
  return { type: 'Fonction', nom, parametres, corps: analyserBloc(flux), ligne: debut.ligne };
}

/** Vrai si le token est ce mot, qu'il arrive en mot-clé ou en simple nom. */
export function estLeMot(token: Token, mot: string): boolean {
  return (
    (token.type === 'MOT_CLE' || token.type === 'IDENTIFIANT') &&
    normaliser(token.original ?? token.valeur) === mot
  );
}

/** Parcourt les lignes d'un bloc indenté, une par une. */
export function chaqueLigne(flux: FluxTokens, ligne: () => void): void {
  flux.sauterFinsDeLigne();
  if (!flux.accepter('INDENT')) return;
  flux.sauterFinsDeLigne();
  while (!flux.verifier('DEDENT') && !flux.estFini()) {
    ligne();
    flux.sauterFinsDeLigne();
  }
  flux.accepter('DEDENT');
}

/** Le mot d'un token, sans accent ni majuscule (« Créer » → « creer »). */
const motDe = (token: Token) => normaliser(token.original ?? token.valeur);

function analyserServeur(flux: FluxTokens): Serveur {
  const debut = flux.avancer();
  const nom = flux.attendre('CHAINE', undefined, 'le nom du serveur entre guillemets').valeur;
  flux.attendre('PONCTUATION', ':', 'deux-points après le nom du serveur');
  const donnees: Donnee[] = [];
  const routes: Route[] = [];

  chaqueLigne(flux, () => {
    const token = flux.actuel();
    if (estLeMot(token, 'donnee')) {
      donnees.push(analyserDonnee(flux));
    } else if (estLeMot(token, 'route')) {
      routes.push(analyserRoute(flux));
    } else {
      throw new ErreurSyntaxique(
        `dans un serveur, on écrit « donnee … : » ou « route "…" : », mais « ${token.original ?? token.valeur} » a été trouvé`,
        token.ligne,
      );
    }
  });

  return { type: 'Serveur', nom, donnees, routes, ligne: debut.ligne };
}

export function analyserDonnee(flux: FluxTokens, ouverte = false): Donnee {
  const debut = flux.avancer();
  const { nom } = flux.attendreNom('le nom de la donnée');
  flux.attendre('PONCTUATION', ':', 'deux-points après le nom de la donnée');
  const champs: Donnee['champs'] = [];
  chaqueLigne(flux, () => {
    const champ = flux.attendreNom('le nom du champ');
    flux.attendre('PONCTUATION', ':', 'deux-points entre le nom du champ et son type');
    champs.push({ nom: champ.nom, type: analyserTypeChamp(flux, ouverte), ligne: champ.ligne });
  });
  return { type: 'Donnee', nom, champs, ligne: debut.ligne };
}

/** « texte », « nombre », « booleen », « date », « liste de … ». */
function analyserTypeChamp(flux: FluxTokens, ouverte = false): TypeChamp {
  const token = flux.avancer();
  const mot = motDe(token);
  if (mot === 'texte' || mot === 'nombre' || mot === 'booleen' || mot === 'date') return { genre: mot };
  if (mot === 'liste') return { genre: 'liste', de: analyserTypeChamp(flux, ouverte) };
  // Dans une source, un autre nom est une autre donnée de la même source (un objet imbriqué).
  if (ouverte && estUnNom(token)) return { genre: 'donnee', nom: token.original ?? token.valeur };
  throw new ErreurSyntaxique(
    `« ${token.original ?? token.valeur} » n'est pas un type de champ. Types possibles : texte, nombre, booleen, date, liste de …`,
    token.ligne,
  );
}

const ACTIONS_DONNEE: ActionDonnee[] = ['lire', 'creer', 'modifier', 'supprimer'];

function analyserRoute(flux: FluxTokens): Route {
  const debut = flux.avancer();
  const adresse = flux.attendre('CHAINE', undefined, "l'adresse de la route entre guillemets").valeur;
  flux.attendre('PONCTUATION', ':', "deux-points après l'adresse de la route");
  const regles: Regle[] = [];
  chaqueLigne(flux, () => regles.push(analyserRegle(flux)));
  return { type: 'Route', adresse, regles, ligne: debut.ligne };
}

/** « tout le monde peut lire produit », « seul admin peut modifier produit ». */
function analyserRegle(flux: FluxTokens): Regle {
  const debut = flux.actuel();
  const mots: string[] = [];
  while (!estLeMot(flux.actuel(), 'peut') && !flux.verifier('FIN_LIGNE') && !flux.estFini()) {
    mots.push(motDe(flux.avancer()));
  }
  const qui: Qui | undefined = (
    { 'tout monde': 'tout_le_monde', connecte: 'connecte', 'utilisateur connecte': 'connecte', 'seul admin': 'admin', admin: 'admin' } as Record<string, Qui>
  )[mots.join(' ')];
  if (!qui) {
    throw new ErreurSyntaxique(
      `qui peut agir ? Écrivez « tout le monde », « connecte » ou « seul admin », puis « peut … »`,
      debut.ligne,
    );
  }
  flux.attendre(flux.actuel().type === 'MOT_CLE' ? 'MOT_CLE' : 'IDENTIFIANT', 'peut', '« peut » suivi d\'une action');

  const actions: ActionDonnee[] = [];
  do {
    const token = flux.avancer();
    const action = motDe(token) as ActionDonnee;
    if (!ACTIONS_DONNEE.includes(action)) {
      throw new ErreurSyntaxique(
        `« ${token.original ?? token.valeur} » n'est pas une action. Actions possibles : ${ACTIONS_DONNEE.join(', ')}.`,
        token.ligne,
      );
    }
    actions.push(action);
  } while (flux.accepter('MOT_CLE', 'et'));

  const { nom: donnee } = flux.attendreNom('le nom de la donnée');
  return { type: 'Regle', qui, actions, donnee, ligne: debut.ligne };
}

function analyserDefinitionComposant(flux: FluxTokens): DefinitionComposant {
  const debut = flux.avancer();
  const nom = flux.attendre('CHAINE', undefined, 'le nom du composant entre guillemets').valeur;
  flux.attendre('PONCTUATION', ':', 'deux-points après le nom du composant');
  const instructions = analyserBloc(flux);
  const parametres = instructions.filter((i): i is Parametre => i.type === 'Parametre');
  const corps = instructions.filter((i) => i.type !== 'Parametre');
  return { type: 'DefinitionComposant', nom, parametres, corps, ligne: debut.ligne };
}

function analyserPage(flux: FluxTokens): Page {
  const debut = flux.attendre('MOT_CLE', 'page', 'une déclaration de page');
  const nom = flux.attendre('CHAINE', undefined, 'le nom de la page entre guillemets');
  const entete = analyserEntetePage(flux);
  const { parametres, filtres } = analyserAvecPage(flux);
  const sans = analyserSansDisposition(flux);
  flux.attendre('PONCTUATION', ':', 'deux-points après le nom de la page');

  const corps = analyserBloc(flux);

  // Un morceau « :slug » de l'adresse choisie déclare le paramètre de la page.
  for (const morceau of entete.adresse?.matchAll(/:([A-Za-z_]\w*)/g) ?? []) {
    if (!parametres.includes(morceau[1])) parametres.push(morceau[1]);
  }
  // L'aperçu écrit directement dans la page n'est pas affiché : il décrit la page.
  const apercus = corps.filter((i): i is Apercu => i.type === 'Apercu');
  if (apercus.length > 1) throw new ErreurSyntaxique(`un seul bloc « apercu » par page : il est déjà écrit ligne ${apercus[0].ligne}.`, apercus[1].ligne);
  return {
    type: 'Page',
    nom: nom.valeur,
    parametres,
    ...(filtres.length > 0 ? { filtres } : {}),
    ...entete,
    ...sans,
    ...(apercus.length ? { apercu: apercus[0] } : {}),
    corps: corps.filter((i) => i.type !== 'Apercu'),
    ligne: debut.ligne,
  };
}

/** Un bloc est la suite d'instructions indentées sous une en-tête. */
function analyserBloc(flux: FluxTokens): Instruction[] {
  const instructions: Instruction[] = [];
  flux.sauterFinsDeLigne();

  if (!flux.accepter('INDENT')) {
    return instructions;
  }

  flux.sauterFinsDeLigne();

  while (!flux.verifier('DEDENT') && !flux.estFini()) {
    instructions.push(analyserInstruction(flux));
    flux.sauterFinsDeLigne();
  }

  flux.accepter('DEDENT');
  return instructions;
}

function analyserInstruction(flux: FluxTokens): Instruction {
  if (estLeMot(flux.actuel(), 'tableau') && (flux.regarder(1).type === 'CHAINE' || flux.regarder(1).valeur === ':')) {
    const debut = flux.avancer();
    const legende = flux.verifier('PONCTUATION', ':') ? undefined : analyserValeur(flux);
    flux.attendre('PONCTUATION', ':', 'deux-points après la légende du tableau');
    flux.sauterFinsDeLigne();
    const colonnes: Expression[] = [];
    const rangees: Expression[][] = [];
    if (flux.accepter('INDENT')) {
      flux.sauterFinsDeLigne();
      while (!flux.verifier('DEDENT') && !flux.estFini()) {
        const genre = flux.avancer();
        if (!estLeMot(genre, 'colonnes') && !estLeMot(genre, 'rangee')) throw new ErreurSyntaxique('un tableau contient « colonnes » et « rangee ».', genre.ligne);
        const cellules = [analyserValeur(flux)];
        while (flux.accepter('PONCTUATION', ',')) cellules.push(analyserValeur(flux));
        if (estLeMot(genre, 'colonnes')) colonnes.push(...cellules);
        else rangees.push(cellules);
        flux.sauterFinsDeLigne();
      }
      flux.accepter('DEDENT');
    }
    return { type: 'TableauDocumentation', ...(legende ? { legende } : {}), colonnes, rangees, ligne: debut.ligne };
  }
  if (estLeMot(flux.actuel(), 'liste') && (flux.regarder(1).valeur === ':' || (estLeMot(flux.regarder(1), 'numerotee') && flux.regarder(2).valeur === ':'))) {
    const debut = flux.avancer();
    const numerotee = estLeMot(flux.actuel(), 'numerotee');
    if (numerotee) flux.avancer();
    flux.attendre('PONCTUATION', ':', 'deux-points après « liste »');
    return { type: 'Bloc', genre: numerotee ? 'listeNumerotee' : 'liste', styles: [], classes: [], corps: analyserBloc(flux), ligne: debut.ligne };
  }
  if (estLeMot(flux.actuel(), 'code') && estBlocDeCode(flux)) {
    const debut = flux.avancer();
    const langage = flux.verifier('PONCTUATION', ':') || estLeMot(flux.actuel(), 'avec') ? undefined : flux.avancer().valeur;
    // « avec animation frappe » (au chargement), « … au defilement » (quand le bloc arrive à l'écran).
    let frappe: 'chargement' | 'defilement' | undefined;
    if (estLeMot(flux.actuel(), 'avec')) {
      flux.avancer(); // avec
      flux.avancer(); // animation
      flux.avancer(); // frappe
      frappe = estLeMot(flux.actuel(), 'au') ? (flux.avancer(), flux.avancer(), 'defilement') : 'chargement';
    }
    flux.attendre('PONCTUATION', ':', 'deux-points après « code »');
    flux.accepter('FIN_LIGNE');
    const code = flux.attendre('CODE_BRUT', undefined, 'les lignes du bloc de code').valeur;
    return { type: 'CodeDocumentation', ...(langage ? { langage } : {}), ...(frappe ? { frappe } : {}), code, ligne: debut.ligne };
  }
  if (estLeMot(flux.actuel(), 'en') && estLeMot(flux.regarder(1), 'supposant')) {
    const debut = flux.avancer();
    for (const motAttendu of ['supposant', 'que', 'ca', 'marche']) {
      if (!estLeMot(flux.actuel(), motAttendu)) throw new ErreurSyntaxique(`écrivez « en supposant que ça marche : »`, debut.ligne);
      flux.avancer();
    }
    flux.attendre('PONCTUATION', ':', 'deux-points après « en supposant que ça marche »');
    return { type: 'Supposant', corps: analyserBloc(flux), ligne: debut.ligne };
  }
  if (flux.verifier('MOT_CLE', 'variable')) {
    return analyserVariable(flux);
  }

  // « continuer vers "admin" » : là où la personne allait avant de se connecter, sinon cette page.
  if (estLeMot(flux.actuel(), 'continuer') && flux.regarder(1).type === 'MOT_CLE' && flux.regarder(1).valeur === 'vers') {
    const debut = flux.avancer();
    flux.avancer();
    return { type: 'Action', action: 'rediriger', arguments: [analyserExpression(flux)], continuer: true, ligne: debut.ligne };
  }

  // « apercu : » : le titre, la description et l'image de partage de la page.
  if (estApercu(flux)) return analyserApercu(flux, analyserExpression);

  // « sous page » : l'endroit où une page parente montre sa sous-page.
  if (estLeMot(flux.actuel(), 'sous') && estLeMot(flux.regarder(1), 'page')) {
    const debut = flux.avancer();
    flux.avancer();
    return { type: 'SousPage', ligne: debut.ligne };
  }

  // « revenir » ou « revenir vers "catalogue" » : le retour du navigateur ; « revenir » seul reste un nom possible.
  if (estLeMot(flux.actuel(), 'revenir') && (flux.regarder(1).type === 'FIN_LIGNE' || flux.regarder(1).type === 'FIN_FICHIER' || flux.regarder(1).type === 'DEDENT' || (flux.regarder(1).type === 'MOT_CLE' && flux.regarder(1).valeur === 'vers'))) {
    const debut = flux.avancer();
    const vers = flux.accepter('MOT_CLE', 'vers') ? [analyserExpression(flux)] : [];
    return { type: 'Action', action: 'revenir', arguments: vers, ligne: debut.ligne };
  }

  // « recharger produits » ; « recharger » seul reste un nom possible.
  if (estLeMot(flux.actuel(), 'recharger') && estUnNom(flux.regarder(1))) {
    const debut = flux.avancer();
    return { type: 'Rechargement', variable: flux.attendreNom('le nom de la variable à recharger').nom, ligne: debut.ligne };
  }

  // « essayer : » puis, au même niveau, « si erreur : » (décision L5).
  if (estLeMot(flux.actuel(), 'essayer') && flux.regarder(1).type === 'PONCTUATION' && flux.regarder(1).valeur === ':') {
    const debut = flux.avancer();
    flux.avancer();
    const corps = analyserBloc(flux);
    flux.sauterFinsDeLigne();
    let siErreur: Instruction[] = [];
    if (flux.verifier('MOT_CLE', 'si') && estLeMot(flux.regarder(1), 'erreur') && flux.regarder(2).type === 'PONCTUATION' && flux.regarder(2).valeur === ':') {
      flux.avancer();
      flux.avancer();
      flux.avancer();
      siErreur = analyserBloc(flux);
    }
    return { type: 'Essayer', corps, siErreur, ligne: debut.ligne };
  }

  // « fonction vider_panier : » dans une page : une fonction d'actions de cette page.
  if (estLeMot(flux.actuel(), 'fonction') && estUnNom(flux.regarder(1))) return analyserFonction(flux);

  // « vider_panier() » seul sur une ligne : l'appel d'une fonction d'actions.
  if (estUnNom(flux.actuel()) && flux.regarder(1).type === 'PONCTUATION' && flux.regarder(1).valeur === '(') {
    const appel = analyserExpression(flux);
    if (appel.type === 'Appel') return { type: 'Execution', nom: appel.nom, arguments: appel.arguments, ligne: appel.ligne };
  }

  // « constante tva = 16 » ; « constante » seul reste un nom de variable possible.
  if (estConstante(flux)) return { ...analyserVariable(flux), calcul: true, constante: true };

  // « calcul total = … » ; « calcul » seul reste un nom de variable possible.
  if (
    flux.verifier('MOT_CLE', 'calcul') &&
    estUnNom(flux.regarder(1)) &&
    flux.regarder(2).type === 'PONCTUATION' &&
    flux.regarder(2).valeur === '='
  ) {
    return { ...analyserVariable(flux), calcul: true };
  }

  if (flux.verifier('MOT_CLE', 'si')) {
    return analyserCondition(flux);
  }

  if (flux.verifier('MOT_CLE', 'quand')) {
    return analyserEvenement(flux);
  }

  // Boucles et choix (tâche 1) : ces mots ne comptent qu'en tête de ligne, à leur place.
  if (estLeMot(flux.actuel(), 'tant') && estLeMot(flux.regarder(1), 'que')) {
    const debut = flux.avancer();
    flux.avancer();
    const test = analyserTestCombine(flux);
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin de « tant que … »');
    return { type: 'TantQue', test, corps: analyserBloc(flux), ligne: debut.ligne };
  }
  if (estLeMot(flux.actuel(), 'repeter') && !(flux.regarder(1).type === 'PONCTUATION' && flux.regarder(1).valeur === '=')) {
    const debut = flux.avancer();
    const fois = analyserExpression(flux);
    if (!estLeMot(flux.actuel(), 'fois')) {
      throw new ErreurSyntaxique('il manque « fois » : écrivez par exemple « repeter 3 fois : ».', flux.actuel().ligne);
    }
    flux.avancer();
    flux.attendre('PONCTUATION', ':', 'deux-points après « fois »');
    return { type: 'Repeter', fois, corps: analyserBloc(flux), ligne: debut.ligne };
  }
  const finDeLigne = (t: Token) => t.type === 'FIN_LIGNE' || t.type === 'FIN_FICHIER' || t.type === 'DEDENT';
  if (estLeMot(flux.actuel(), 'arreter') && finDeLigne(flux.regarder(1))) {
    return { type: 'Arreter', ligne: flux.avancer().ligne };
  }
  if (estLeMot(flux.actuel(), 'passer') && estLeMot(flux.regarder(1), 'suivant')) {
    const debut = flux.avancer();
    flux.avancer();
    return { type: 'PasserAuSuivant', ligne: debut.ligne };
  }
  if (estLeMot(flux.actuel(), 'selon') && !(flux.regarder(1).type === 'PONCTUATION' && flux.regarder(1).valeur === '=')) {
    return analyserSelon(flux);
  }

  // « rendre prix * 2 » : la valeur d'une fonction ; « rendre » seul reste un nom possible.
  const apresRendre = flux.regarder(1);
  if (
    estLeMot(flux.actuel(), 'rendre') &&
    (commenceUneValeur(apresRendre) ||
      (apresRendre.type === 'PONCTUATION' && ['(', '-'].includes(apresRendre.valeur)) ||
      (apresRendre.type === 'MOT_CLE' && apresRendre.valeur === 'rien'))
  ) {
    const debut = flux.avancer();
    return { type: 'Rendre', valeur: analyserExpression(flux), ligne: debut.ligne };
  }

  if (flux.verifier('MOT_CLE', 'pour')) {
    return analyserBoucle(flux);
  }

  // Les interactions : « apres 3 secondes : », « toutes les … : », « copier … »,
  // « partager … », « confirmer … : », « fenetre "…" : ». Ces mots ne comptent
  // qu'en tête de ligne, suivis de leur valeur ; ailleurs, ce sont des noms.
  if (estInteraction(flux)) {
    return analyserInteraction(flux, OUTILS);
  }

  // « se connecter avec … », « se deconnecter » : « se » est un petit mot
  // déjà sauté, comme dans « la page se charge ».
  if (estLeMot(flux.actuel(), 'connecter')) {
    return analyserConnexion(flux);
  }
  if (estLeMot(flux.actuel(), 'deconnecter')) {
    return { type: 'Deconnexion', ligne: flux.avancer().ligne };
  }

  // « changer theme par sombre » : le choix clair ou sombre du visiteur.
  if (estChangerTheme(flux)) {
    return analyserChangerTheme(flux);
  }

  // « supprimer p de "produits" », « modifier p dans "produits" avec … » :
  // sur le serveur. « supprimer » et « modifier » seuls restent des noms possibles.
  if ((estLeMot(flux.actuel(), 'supprimer') || estLeMot(flux.actuel(), 'modifier')) && estUnNom(flux.regarder(1))) {
    return analyserOperationServeur(flux);
  }

  // « formulaire "message" : » ; « formulaire » seul reste un nom possible.
  if (flux.verifier('MOT_CLE', 'formulaire') && flux.regarder(1).type === 'CHAINE') {
    return analyserFormulaire(flux);
  }

  // « section "Nos plats" : », « ligne : », « grille avec style "plats" : » :
  // ces mots ne sont des blocs qu'en tête de ligne, suivis de « : », de
  // « avec » ou (pour une section) de son titre ; ailleurs, ce sont des noms.
  if (estBlocMiseEnPage(flux)) {
    return analyserBlocMiseEnPage(flux);
  }

  // « sur telephone : » : un bloc affiché selon l'appareil.
  if (estSurAppareil(flux)) {
    return analyserSurAppareil(flux, { corps: analyserBloc });
  }

  // « case a cocher "…" », « choix "…" parmi … », « liste deroulante "…"
  // parmi … » : des champs d'une sorte. Ces mots ne sont reconnus que
  // suivis d'un libellé entre guillemets ; ailleurs, ce sont des noms.
  const ligne = flux.actuel().ligne;
  const sorte = lireTournure(flux, ELEMENTS_CHAMP);
  if (sorte) return analyserElement(flux, { element: 'champ', ligne, sorte });

  // « fichier "Choisir une photo" dans photo accepte images » : le choix d'un fichier.
  if (estChoixFichier(flux)) return analyserChoixFichier(flux, analyserExpression);

  // « carte "Nos agences" avec zoom 12 : » et « marqueur "Gombe" avec latitude … et longitude … » (src/parser/carte.ts).
  if (estCarte(flux)) return analyserCarte(flux, { expression: analyserExpression, corps: analyserBloc });
  if (estMarqueur(flux)) return analyserMarqueur(flux, analyserExpression);

  // Les éléments d'écran : « icone "panier" », « badge nombre de panier », « code qr "…" »…
  // « graphique en courbe ventes avec … » (plan des médias, 4.1).
  if (estGraphique(flux)) return analyserGraphique(flux, { expression: analyserExpression });
  if (estSerieSeule(flux)) refuserSerieSeule(flux);

  const ligneEcran = flux.actuel().ligne;
  // « selecteur de langue » : le choix de la langue, en tête de ligne seulement.
  if (estSelecteurLangue(flux)) {
    flux.avancer();
    flux.avancer();
    return analyserElement(flux, { element: 'selecteurLangue', ligne: ligneEcran });
  }
  const elementEcran = lireElementEcran(flux);
  if (elementEcran) return analyserElement(flux, { element: elementEcran, ligne: ligneEcran });

  // Avant les éléments : « changer texte ... » commence par un mot-clé
  // qui est aussi un nom d'élément.
  if (estAction(flux)) {
    return analyserAction(flux);
  }

  if (estLeMot(flux.actuel(), 'soustitre') && commenceUneValeur(flux.regarder(1))) {
    const ligneSousTitre = flux.avancer().ligne;
    return analyserElement(flux, { element: 'soustitre', ligne: ligneSousTitre });
  }

  if (estElement(flux)) {
    return analyserElement(flux);
  }

  // « parametre nom », au début d'un composant écrit en Humalis.
  if (estLeMot(flux.actuel(), 'parametre') && estUnNom(flux.regarder(1))) {
    const debut = flux.avancer();
    return { type: 'Parametre', nom: flux.attendreNom('le nom du paramètre').nom, ligne: debut.ligne };
  }

  // « Carte avec titre "…" » : un nom avec une majuscule est un composant.
  if (flux.actuel().type === 'IDENTIFIANT' && /^\p{Lu}/u.test(flux.actuel().valeur)) {
    return analyserUsageComposant(flux);
  }

  const token = flux.actuel();
  if (token.type === 'IDENTIFIANT' && entreePrevue(token.valeur)) {
    throw new ErreurSyntaxique(messageMotPrevu(token), token.ligne);
  }
  throw new ErreurSyntaxique(
    `instruction inconnue : « ${token.valeur || token.type} »`,
    token.ligne,
  );
}

function analyserUsageComposant(flux: FluxTokens): UsageComposant {
  const debut = flux.avancer();
  const proprietes: UsageComposant['proprietes'] = [];
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      const propriete = flux.attendreNom('le nom d\'une propriété du composant');
      proprietes.push({ nom: propriete.nom, valeur: analyserExpression(flux), ligne: propriete.ligne });
    } while (flux.accepter('MOT_CLE', 'et'));
  }
  return { type: 'Composant', nom: debut.valeur, proprietes, ligne: debut.ligne };
}

/** « constante nom = … » : le mot, un nom, puis « = ». */
function estConstante(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'constante') && estUnNom(flux.regarder(1)) && flux.regarder(2).type === 'PONCTUATION' && flux.regarder(2).valeur === '=';
}

function analyserVariable(flux: FluxTokens): DeclarationVariable {
  const debut = flux.avancer();
  const { nom } = flux.attendreNom('le nom de la variable');
  flux.attendre('PONCTUATION', '=', 'le signe = après le nom de la variable');
  const valeur = analyserExpression(flux);

  if (!flux.accepter('MOT_CLE', 'avec')) {
    return { type: 'Variable', nom, valeur, ligne: debut.ligne };
  }

  // « avec partagee et memorisee en secret » : les accents sont permis.
  const options: OptionsVariable = {};
  do {
    const option = flux.attendreNom('une option de variable (partagee, memorisee)');
    const mot = normaliser(option.nom);
    if (mot === 'partagee') {
      options.partagee = true;
    } else if (mot === 'memorisee') {
      options.memorisee = true;
      const suite = flux.actuel();
      if (suite.type === 'IDENTIFIANT' && normaliser(suite.valeur) === 'en') {
        flux.avancer();
        const secret = flux.attendreNom('« secret » après « memorisee en »');
        if (normaliser(secret.nom) !== 'secret') {
          throw new ErreurSyntaxique('« secret » est attendu après « memorisee en »', secret.ligne);
        }
        options.secret = true;
      }
    } else {
      throw new ErreurSyntaxique(
        `« ${option.nom} » n'est pas une option de variable. Options possibles : partagee, memorisee.`,
        option.ligne,
      );
    }
  } while (flux.accepter('MOT_CLE', 'et'));

  return { type: 'Variable', nom, valeur, options, ligne: debut.ligne };
}

const ELEMENTS: NomElement[] = ['titre', 'texte', 'image', 'bouton', 'lien', 'champ'];

function estElement(flux: FluxTokens): boolean {
  const token = flux.actuel();
  return token.type === 'MOT_CLE' && ELEMENTS.includes(token.valeur as NomElement);
}

/** Le mot d'un token, sans accent, trait d'union ni tiret bas (« mot_de_passe » → « motdepasse »). */
const formeDe = (token: Token): string =>
  token.type === 'MOT_CLE' || token.type === 'IDENTIFIANT' ? motDe(token).replace(/[-_]/g, '') : '';

/** La sorte écrite juste après « champ », avant le libellé (« champ telephone "…" »). */
const SORTES_CHAMP: [string[], SorteChamp][] = [
  [['mot', 'passe'], 'motDePasse'],
  [['motdepasse'], 'motDePasse'],
  [['texte', 'long'], 'texteLong'],
  [['textelong'], 'texteLong'],
  [['adresse', 'web'], 'adresseWeb'],
  [['adresseweb'], 'adresseWeb'],
  [['email'], 'email'],
  [['telephone'], 'telephone'],
  [['nombre'], 'nombre'],
  [['date'], 'date'],
  [['heure'], 'heure'],
  [['texte'], 'texte'],
];

/** Les champs qui ont leur propre mot en tête de ligne (le « a » de « case a cocher » est un petit mot, sauté). */
const ELEMENTS_CHAMP: [string[], SorteChamp][] = [
  [['case', 'cocher'], 'case'],
  [['caseacocher'], 'case'],
  [['choix'], 'choix'],
  [['liste', 'deroulante'], 'liste'],
  [['liste', 'deroulant'], 'liste'],
  [['listederoulante'], 'liste'],
];

/**
 * Une tournure de la liste, suivie d'un libellé entre guillemets : elle est
 * consommée et sa sorte renvoyée. Sans libellé juste après, rien ne bouge :
 * « champ email » reste le champ dont le libellé est la variable email.
 */
function lireTournure(flux: FluxTokens, tournures: [string[], SorteChamp][]): SorteChamp | undefined {
  for (const [mots, sorte] of tournures) {
    if (mots.every((mot, i) => formeDe(flux.regarder(i)) === mot) && flux.regarder(mots.length).type === 'CHAINE') {
      for (let i = 0; i < mots.length; i++) flux.avancer();
      return sorte;
    }
  }
  return undefined;
}

function analyserFormulaire(flux: FluxTokens): Formulaire {
  const debut = flux.avancer();
  const nom = flux.attendre('CHAINE', undefined, 'le nom du formulaire entre guillemets').valeur;
  flux.attendre('PONCTUATION', ':', 'deux-points après le nom du formulaire');
  return { type: 'Formulaire', nom, corps: analyserBloc(flux), ligne: debut.ligne };
}

/** « minimum 1 », « maximum -5 » : un nombre entier, peut-être négatif. */
const GENRES_BLOC: GenreBloc[] = ['section', 'bloc', 'ligne', 'colonne', 'grille', 'onglets', 'onglet', 'deroulant', 'accordeon', 'carrousel', 'menu'];

function estBlocMiseEnPage(flux: FluxTokens): boolean {
  if (estFilAriane(flux)) return true;
  const genre = GENRES_BLOC.find((g) => estLeMot(flux.actuel(), g));
  if (!genre) return false;
  const suivant = flux.regarder(1);
  return (
    (suivant.type === 'PONCTUATION' && suivant.valeur === ':') ||
    (suivant.type === 'MOT_CLE' && suivant.valeur === 'avec') ||
    (genre === 'menu' && (estLeMot(suivant, 'repliable') || estLeMot(suivant, 'vertical'))) ||
    ((genre === 'section' || GENRES_AVEC_TITRE.includes(genre)) && suivant.type === 'CHAINE')
  );
}

function analyserBlocMiseEnPage(flux: FluxTokens): Bloc {
  const filAriane = estFilAriane(flux);
  const debut = flux.avancer();
  if (filAriane) flux.avancer();
  const genre: GenreBloc = filAriane ? 'filAriane' : GENRES_BLOC.find((g) => estLeMot(debut, g))!;
  // « menu repliable : » : sur un petit écran, un bouton « Menu » ouvre et ferme les liens.
  // « menu vertical : » : les liens en colonne. Les deux se combinent, dans n'importe quel ordre.
  let repliable = false;
  let vertical = false;
  while (genre === 'menu' && (estLeMot(flux.actuel(), 'repliable') || estLeMot(flux.actuel(), 'vertical'))) {
    if (estLeMot(flux.avancer(), 'repliable')) repliable = true;
    else vertical = true;
  }
  // Le titre d'une section devient son premier élément : un « titre » comme les autres.
  const titre: Instruction[] = [];
  let titreBloc: Expression | undefined;
  if (genre === 'section' && flux.verifier('CHAINE')) {
    titre.push({ type: 'Element', element: 'titre', contenu: analyserValeur(flux), styles: [], classes: [], ligne: debut.ligne });
  } else if (GENRES_AVEC_TITRE.includes(genre) && flux.verifier('CHAINE')) {
    titreBloc = analyserValeur(flux);
  }
  const styles: Style[] = [];
  const classes: string[] = [];
  let ancre: string | undefined;
  let nom: string | undefined;
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      if (flux.verifier('MOT_CLE', 'style')) {
        flux.avancer();
        const valeur = flux.attendre('CHAINE', undefined, 'le nom de la classe CSS entre guillemets').valeur;
        classes.push(...valeur.split(/\s+/).filter(Boolean));
      } else if (estLeMot(flux.actuel(), 'ancre')) {
        flux.avancer();
        ancre = flux.attendre('CHAINE', undefined, "le nom de l'ancre entre guillemets (avec ancre \"desserts\")").valeur;
      } else if (flux.verifier('IDENTIFIANT', 'nom') && flux.regarder(1).type === 'CHAINE') {
        // « avec nom "catalogue" » : pour viser le bloc (« arrive en bas de "catalogue" »).
        flux.avancer();
        nom = flux.avancer().valeur;
      } else {
        styles.push(analyserStyle(flux));
      }
    } while (flux.accepter('MOT_CLE', 'et'));
  }
  flux.attendre('PONCTUATION', ':', `deux-points à la fin de la ligne « ${genre} », puis son contenu en dessous, décalé`);
  return { type: 'Bloc', genre, styles, classes, ...(titreBloc ? { titre: titreBloc } : {}), ...(ancre !== undefined ? { ancre } : {}), ...(nom !== undefined ? { nom } : {}), ...(repliable ? { repliable } : {}), ...(vertical ? { vertical } : {}), corps: [...titre, ...analyserBloc(flux)], ligne: debut.ligne };
}

function lireNombre(flux: FluxTokens, description: string): number {
  const negatif = flux.accepter('PONCTUATION', '-');
  const nombre = Number(flux.attendre('NOMBRE', undefined, description).valeur);
  return negatif ? -nombre : nombre;
}

/**
 * Un élément. `enTete` : un champ déjà reconnu à son propre mot
 * (« case a cocher », « choix », « liste deroulante »), mots consommés.
 */
function analyserElement(flux: FluxTokens, enTete?: { element: NomElement; ligne: number; sorte?: SorteChamp }): Element {
  const debut = enTete ? { valeur: enTete.element, ligne: enTete.ligne } : flux.avancer();
  const sorte = enTete?.sorte ?? (debut.valeur === 'champ' ? lireTournure(flux, SORTES_CHAMP) : undefined);
  // « chargement » seul est un indicateur sans texte.
  const contenu: Expression =
    (debut.valeur === 'chargement' && !commenceUneValeur(flux.actuel())) || debut.valeur === 'selecteurLangue'
      ? { type: 'Chaine', parties: [], ligne: debut.ligne }
      : analyserExpression(flux);

  // « choix "Taille" parmi ["S", "M", "L"] » : les valeurs possibles.
  let parmi: Expression | undefined;
  if (sorte === 'choix' || sorte === 'liste') {
    if (!estLeMot(flux.actuel(), 'parmi')) {
      const exemple = sorte === 'choix' ? 'choix "Taille" parmi ["S", "M", "L"]' : 'liste deroulante "Pays" parmi pays';
      throw new ErreurSyntaxique(`il manque « parmi » suivi des valeurs possibles, par exemple : ${exemple}`, flux.actuel().ligne);
    }
    flux.avancer();
    parmi = analyserExpression(flux);
  }

  let cible: string | undefined;
  if (flux.accepter('MOT_CLE', 'vers')) {
    cible = flux.attendre('CHAINE', undefined, 'le nom de la page cible').valeur;
  }

  const styles: Style[] = [];
  const classes: string[] = [];
  const arguments_: ArgumentPage[] = [];
  let nom: string | undefined;
  let ancre: string | undefined;
  let nouvelOnglet = false;
  const saisie: Pick<Element, 'obligatoire' | 'indice' | 'indiceTexte' | 'minimum' | 'maximum' | 'raccourci' | 'annonce'> = {};
  let niveau: number | undefined;
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      // « avec nom "connexion" » nomme l'élément ; « avec style "…" » lui
      // donne des classes CSS ; « obligatoire », « indice », « minimum » et
      // « maximum » sont les options d'un champ ; les autres, des styles nommés.
      // Après « vers "produit" », un nom qui n'est pas une option est un
      // paramètre de la page cible : « avec id p.id ».
      const option = formeDe(flux.actuel());
      if (cible !== undefined && estArgumentPage(flux)) {
        arguments_.push(analyserArgumentPage(flux));
      } else if (flux.verifier('MOT_CLE', 'style')) {
        flux.avancer();
        const valeur = flux.attendre('CHAINE', undefined, 'le nom de la classe CSS entre guillemets').valeur;
        classes.push(...valeur.split(/\s+/).filter(Boolean));
      } else if (option === 'ancre') {
        flux.avancer();
        ancre = flux.attendre('CHAINE', undefined, "le nom de l'ancre entre guillemets (avec ancre \"desserts\")").valeur;
      } else if (option === 'nouvel' && formeDe(flux.regarder(1)) === 'onglet') {
        flux.avancer();
        flux.avancer();
        nouvelOnglet = true;
      } else if (flux.verifier('IDENTIFIANT', 'nom')) {
        flux.avancer();
        nom = flux.attendre(
          'CHAINE',
          undefined,
          "le nom de l'élément entre guillemets",
        ).valeur;
      } else if (option === 'obligatoire' || option === 'obligatoires') {
        flux.avancer();
        saisie.obligatoire = true;
      } else if (option === 'decoratif') {
        flux.avancer();
        styles.push({ propriete: 'decoratif', valeur: 'oui' });
      } else if (option === 'niveau' && debut.valeur === 'soustitre') {
        flux.avancer();
        niveau = lireNombre(flux, 'un niveau de titre entre 2 et 6');
      } else if (option === 'indice' || option === 'indices') {
        flux.avancer();
        const texteIndice = flux.attendre('CHAINE', undefined, "le texte de l'indice entre guillemets");
        saisie.indice = texteIndice.valeur;
        // « avec indice "Votre nom" en anglais "Your name" » : les versions écrites à côté.
        const versionsIndice = lireVersions(flux);
        if (versionsIndice) saisie.indiceTexte = { type: 'Chaine', parties: [{ type: 'texte', valeur: texteIndice.valeur }], versions: versionsIndice, ligne: texteIndice.ligne };
      } else if (option === 'minimum' || option === 'maximum') {
        flux.avancer();
        saisie[option] = lireNombre(flux, `un nombre après « ${option} » (par exemple « ${option} 1 »)`);
      } else if (option === 'raccourci' && flux.regarder(1).type === 'CHAINE') {
        // « avec raccourci "controle+k" » : la touche qui clique le bouton.
        flux.avancer();
        saisie.raccourci = flux.avancer().valeur;
      } else if (option === 'annonce' || option === 'annonces') {
        // « avec annonce » : un lecteur d'écran lit ce texte quand il change.
        flux.avancer();
        saisie.annonce = true;
      } else {
        styles.push(analyserStyle(flux));
      }
    } while (flux.accepter('MOT_CLE', 'et'));
  }

  // La sorte et les options ne vont dans l'arbre que si le programme les écrit.
  return {
    type: 'Element',
    element: debut.valeur as NomElement,
    contenu,
    styles,
    ...(niveau !== undefined ? { niveau } : {}),
    classes,
    nom,
    cible,
    ...(arguments_.length > 0 ? { arguments: arguments_ } : {}),
    ...(ancre !== undefined ? { ancre } : {}),
    ...(nouvelOnglet ? { nouvelOnglet } : {}),
    ...(sorte ? { sorte } : {}),
    ...(parmi ? { parmi } : {}),
    ...saisie,
    ligne: debut.ligne,
  };
}

/** Les options d'un élément (« couleur bleu », « nom "…" ») : tout autre nom est un paramètre de page. */
const NOMS_OPTIONS = new Set([...Object.keys(OPTIONS), 'nom', 'style', 'ancre', 'nouvel', 'obligatoire', 'obligatoires', 'indice', 'indices', 'minimum', 'maximum', 'raccourci', 'annonce']);

function estArgumentPage(flux: FluxTokens): boolean {
  const token = flux.actuel();
  return estUnNom(token) && !NOMS_OPTIONS.has(motDe(token));
}

function analyserArgumentPage(flux: FluxTokens): ArgumentPage {
  const { nom } = flux.attendreNom('le nom du paramètre de la page');
  return { nom, valeur: analyserExpression(flux) };
}

/** Une paire « propriete valeur », par exemple « couleur bleu ». */
function analyserStyle(flux: FluxTokens): Style {
  const propriete = flux.avancer();
  if (propriete.type !== 'MOT_CLE' && propriete.type !== 'IDENTIFIANT') {
    throw new ErreurSyntaxique(
      'un nom de propriété de style est attendu après « avec »',
      propriete.ligne,
    );
  }

  // Les options à tournure propre : « colle », « colle en bas », « degrade bleu vers violet vertical ».
  const propre = analyserStylePropre(flux, propriete);
  if (propre) return propre;

  const valeur = flux.avancer();
  if (
    valeur.type !== 'IDENTIFIANT' &&
    valeur.type !== 'MOT_CLE' &&
    valeur.type !== 'CHAINE' &&
    valeur.type !== 'NOMBRE'
  ) {
    throw new ErreurSyntaxique(
      `une valeur est attendue pour le style « ${propriete.valeur} »`,
      valeur.ligne,
    );
  }

  return { propriete: propriete.valeur, valeur: valeur.valeur };
}

function estAction(flux: FluxTokens): boolean {
  const token = flux.actuel();
  return (
    token.type === 'MOT_CLE' &&
    ['afficher', 'cacher', 'montrer', 'rediriger', 'changer', 'envoyer', 'ajouter', 'retirer'].includes(
      token.valeur,
    )
  );
}

function analyserAction(
  flux: FluxTokens,
): Action | Affectation | ModificationListe | Requete | EnvoiFichier {
  const debut = flux.avancer();

  // « ajouter nom à panier » : « à » et « de » sont des mots de liaison
  // déjà écartés par le lexer ; « dans » reste permis.
  if (debut.valeur === 'ajouter' || debut.valeur === 'retirer') {
    const valeur = analyserOperande(flux);
    flux.accepter('MOT_CLE', 'dans');
    const { nom } = flux.attendreNom('le nom de la liste');
    return {
      type: 'ModificationListe',
      operation: debut.valeur,
      valeur,
      liste: nom,
      ligne: debut.ligne,
    };
  }

  if (debut.valeur === 'afficher') {
    // « afficher erreur "…" » montre un message d'erreur ; « afficher
    // erreur » seul affiche la variable nommée « erreur ».
    const estErreur =
      flux.verifier('MOT_CLE', 'erreur') && commenceUneValeur(flux.regarder(1));
    if (estErreur) flux.avancer();
    // « afficher reussite "…" », « afficher avertissement "…" » : seulement suivis d'un texte.
    const genre = (['reussite', 'avertissement'] as const).find((g) => estLeMot(flux.actuel(), g) && commenceUneValeur(flux.regarder(1)));
    if (genre) flux.avancer();
    const action = estErreur ? 'afficherErreur' : 'afficher';
    const texte = analyserExpression(flux);
    // « pendant 10 secondes », « sans disparaitre », « avec action "Annuler" : ».
    const message = lireSuiteMessage(flux, OUTILS, genre);
    return {
      type: 'Action',
      action,
      arguments: [texte],
      ...(message ? { message } : {}),
      ligne: debut.ligne,
    };
  }

  if (debut.valeur === 'cacher' || debut.valeur === 'montrer') {
    return {
      type: 'Action',
      action: debut.valeur,
      arguments: [analyserExpression(flux)],
      ligne: debut.ligne,
    };
  }

  if (debut.valeur === 'rediriger') {
    flux.attendre('MOT_CLE', 'vers', '« vers » après « rediriger »');
    const cible = analyserExpression(flux);
    const parametres: ArgumentPage[] = [];
    if (flux.accepter('MOT_CLE', 'avec')) {
      do parametres.push(analyserArgumentPage(flux));
      while (flux.accepter('MOT_CLE', 'et'));
    }
    return {
      type: 'Action',
      action: 'rediriger',
      arguments: [cible],
      ...(parametres.length > 0 ? { parametres } : {}),
      ligne: debut.ligne,
    };
  }

  if (debut.valeur === 'envoyer') {
    // « envoyer fichier photo vers … » ; sinon « envoyer requete vers … ».
    if (estEnvoiFichier(flux)) return analyserEnvoiFichier(flux, debut.ligne);
    return analyserRequete(flux, debut.ligne);
  }

  // « changer clics par 1 » : nouvelle valeur d'une variable. On le
  // reconnaît à ce qui suit « changer » : un nom, et non « texte » suivi
  // d'une chaîne.
  const estChangerTexte =
    flux.verifier('MOT_CLE', 'texte') && flux.regarder(1).type === 'CHAINE';
  if (!estChangerTexte) {
    const { nom } = flux.attendreNom('le nom de la variable à changer');
    // « changer client.ville par … » : un champ d'une fiche.
    const champs: string[] = [];
    while (flux.verifier('PONCTUATION', '.') && estUnNom(flux.regarder(1))) {
      flux.avancer();
      const champ = flux.avancer();
      champs.push(champ.original ?? champ.valeur);
    }
    flux.attendre('MOT_CLE', 'par', '« par » suivi de la nouvelle valeur');
    return {
      type: 'Affectation',
      nom,
      ...(champs.length > 0 ? { champs } : {}),
      valeur: analyserOperande(flux),
      ligne: debut.ligne,
    };
  }

  // « changer texte de "x" par "y" » — « de » est un mot de liaison, sauté
  // par le flux ; « par » est un mot réservé.
  flux.avancer();
  const cible = analyserExpression(flux);
  flux.attendre('MOT_CLE', 'par', '« par » suivi du nouveau texte');
  const nouveau = analyserExpression(flux);

  return {
    type: 'Action',
    action: 'changerTexte',
    arguments: [cible, nouveau],
    ligne: debut.ligne,
  };
}

function analyserRequete(flux: FluxTokens, ligne: number): Requete {
  flux.attendre('MOT_CLE', 'requete', '« requete » après « envoyer »');
  flux.attendre('MOT_CLE', 'vers', "« vers » suivi de l'adresse");
  const adresse = flux.attendre('CHAINE', undefined, "l'adresse entre guillemets").valeur;
  const clauses = analyserClausesRequete(flux);

  const donnees: Expression[] = [];
  const cles: (string | undefined)[] = [];
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      // « avec customer = client » : le nom donné à la donnée envoyée (l'API attend ce nom).
      const nomme = flux.verifierNom() && flux.regarder(1).type === 'PONCTUATION' && flux.regarder(1).valeur === '=';
      cles.push(nomme ? flux.attendreNom('le nom de la donnée envoyée').nom : undefined);
      if (nomme) flux.avancer();
      donnees.push(nomme ? analyserExpression(flux) : analyserOperande(flux));
    } while (flux.accepter('MOT_CLE', 'et'));
  }

  let resultat: string | undefined;
  if (flux.accepter('MOT_CLE', 'dans')) {
    resultat = flux.attendreNom('le nom de la variable qui recevra la réponse').nom;
  }

  return { type: 'Requete', adresse, ...clauses, donnees, ...(cles.some((c) => c !== undefined) ? { cles } : {}), resultat, ligne };
}

function analyserOperationServeur(flux: FluxTokens): Suppression | Modification {
  const debut = flux.avancer();
  const suppression = estLeMot(debut, 'supprimer');
  const { nom } = flux.attendreNom('le nom de la donnée');
  const objet: Expression = { type: 'Reference', nom, ligne: debut.ligne };
  // « de » est un mot de liaison, déjà écarté ; « dans » est attendu après « modifier ».
  if (!suppression) flux.attendre('MOT_CLE', 'dans', `« dans » suivi de la route, après « modifier ${nom} »`);
  const adresse = flux.attendre('CHAINE', undefined, 'la route entre guillemets').valeur;
  const source = analyserSourceSeule(flux);
  if (suppression) return { type: 'Suppression', objet, adresse, ...(source !== undefined ? { source } : {}), ligne: debut.ligne };

  flux.attendre('MOT_CLE', 'avec', '« avec » suivi des champs à changer (avec prix = 10)');
  const changements: Modification['changements'] = [];
  do {
    if (flux.verifier('MOT_CLE', 'champ')) {
      const valeur = analyserOperande(flux);
      changements.push({ champ: valeur.type === 'Champ' ? valeur.nom : '', valeur });
    } else {
      const champ = flux.attendreNom('le nom du champ à changer').nom;
      flux.attendre('PONCTUATION', '=', `« = » suivi de la nouvelle valeur de « ${champ} »`);
      changements.push({ champ, valeur: analyserExpression(flux) });
    }
  } while (flux.accepter('MOT_CLE', 'et'));
  return { type: 'Modification', objet, adresse, ...(source !== undefined ? { source } : {}), changements, ligne: debut.ligne };
}

/** « se connecter avec champ "email" et champ "mot de passe" » : l'email, puis le mot de passe. */
function analyserConnexion(flux: FluxTokens): Connexion {
  const debut = flux.avancer();
  flux.attendre('MOT_CLE', 'avec', '« avec champ "email" et champ "mot de passe" » après « se connecter »');
  const email = analyserOperande(flux);
  flux.attendre('MOT_CLE', 'et', '« et » suivi du champ du mot de passe');
  const motDePasse = analyserOperande(flux);
  return { type: 'Connexion', email, motDePasse, ligne: debut.ligne };
}

function analyserCondition(flux: FluxTokens): Condition {
  const debut = flux.avancer();
  const test = analyserTestCombine(flux);
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la condition');

  const alors = analyserBloc(flux);
  let sinon: Instruction[] = [];

  flux.sauterFinsDeLigne();
  if (flux.accepter('MOT_CLE', 'sinon')) {
    flux.attendre('PONCTUATION', ':', 'deux-points après « sinon »');
    sinon = analyserBloc(flux);
  }

  return { type: 'Condition', test, alors, sinon, ligne: debut.ligne };
}

/** « a ou b et c » se lit « a ou (b et c) » : « et » lie plus fort, comme en logique. */
function analyserTestCombine(flux: FluxTokens): Test {
  let test = analyserEt(flux);
  while (flux.verifier('MOT_CLE', 'ou')) {
    const ligne = flux.avancer().ligne;
    test = { type: 'Combinaison', operateur: 'ou', gauche: test, droite: analyserEt(flux), ligne };
  }
  return test;
}

function analyserEt(flux: FluxTokens): Test {
  let test: Test = analyserComparaison(flux);
  while (flux.verifier('MOT_CLE', 'et')) {
    const ligne = flux.avancer().ligne;
    test = { type: 'Combinaison', operateur: 'et', gauche: test, droite: analyserComparaison(flux), ligne };
  }
  return test;
}

function analyserComparaison(flux: FluxTokens): Comparaison {
  // « utilisateur est connecte », « utilisateur est admin » : l'état de la
  // session, vrai ou faux. Une variable « utilisateur » se compare toujours.
  const etat = flux.regarder(2);
  if (
    estLeMot(flux.actuel(), 'utilisateur') &&
    flux.regarder(1).type === 'MOT_CLE' &&
    flux.regarder(1).valeur === 'est' &&
    (estLeMot(etat, 'connecte') || estLeMot(etat, 'admin') || (estLeMot(etat, 'pas') && (estLeMot(flux.regarder(3), 'connecte') || estLeMot(flux.regarder(3), 'admin'))))
  ) {
    // « utilisateur n'est pas connecte » : le contraire.
    const nie = estLeMot(etat, 'pas');
    const debut = flux.avancer();
    flux.avancer();
    if (nie) flux.avancer();
    const lu = flux.avancer();
    const gauche: Expression = { type: 'EtatUtilisateur', etat: motDe(lu) as 'connecte' | 'admin', ligne: debut.ligne };
    return { type: 'Comparaison', gauche, operateur: nie ? 'faux' : 'vrai', ligne: debut.ligne };
  }

  // « mouvement est reduit » : la personne a demandé de réduire les animations ;
  // « mouvement n'est pas reduit » : le contraire (le « n' » est déjà sauté).
  const pas = estLeMot(flux.regarder(2), 'pas') ? 1 : 0;
  if (
    estLeMot(flux.actuel(), 'mouvement') &&
    flux.regarder(1).type === 'MOT_CLE' &&
    flux.regarder(1).valeur === 'est' &&
    estLeMot(flux.regarder(2 + pas), 'reduit')
  ) {
    const debut = flux.avancer();
    for (let i = 0; i < 2 + pas; i++) flux.avancer();
    return { type: 'Comparaison', gauche: { type: 'MouvementReduit', ligne: debut.ligne }, operateur: pas ? 'faux' : 'vrai', ligne: debut.ligne };
  }

  // « theme est sombre », « theme est clair » (et « theme n'est pas sombre ») : le thème affiché.
  if (
    estLeMot(flux.actuel(), 'theme') &&
    flux.regarder(1).type === 'MOT_CLE' &&
    flux.regarder(1).valeur === 'est' &&
    (estLeMot(flux.regarder(2 + pas), 'sombre') || estLeMot(flux.regarder(2 + pas), 'clair'))
  ) {
    const debut = flux.avancer();
    for (let i = 0; i < 1 + pas; i++) flux.avancer();
    const sombre = estLeMot(flux.avancer(), 'sombre');
    return { type: 'Comparaison', gauche: { type: 'ThemeSombre', ligne: debut.ligne }, operateur: sombre !== Boolean(pas) ? 'vrai' : 'faux', ligne: debut.ligne };
  }

  const gauche = analyserOperande(flux);
  // « panier contient "Livre" », « nom contient "Liv" ».
  if (estLeMot(flux.actuel(), 'contient')) {
    flux.avancer();
    return { type: 'Comparaison', gauche, operateur: 'contient', droite: analyserExpression(flux), ligne: gauche.ligne };
  }
  // « nom commence par "Awa" », « nom finit par "Mbuyi" ».
  for (const [mot, operateur] of [['commence', 'commencePar'], ['finit', 'finitPar']] as const) {
    if (estLeMot(flux.actuel(), mot) && flux.regarder(1).type === 'MOT_CLE' && flux.regarder(1).valeur === 'par') {
      flux.avancer();
      flux.avancer();
      return { type: 'Comparaison', gauche, operateur, droite: analyserExpression(flux), ligne: gauche.ligne };
    }
  }
  flux.attendre('MOT_CLE', 'est', '« est » dans la comparaison');
  // « panier n'est pas vide » : le « n' » est un mot de liaison, déjà sauté ; « pas » retourne la comparaison.
  if (estLeMot(flux.actuel(), 'pas')) {
    flux.avancer();
    return nier(analyserApresEst(flux, gauche));
  }
  return analyserApresEst(flux, gauche);
}

/** Les opérateurs dont le contraire s'écrit directement (« n'est pas egal a » → « different »). */
const CONTRAIRES: Partial<Record<Comparaison['operateur'], Comparaison['operateur']>> = {
  egal: 'different',
  different: 'egal',
  vrai: 'faux',
  faux: 'vrai',
  superieur: 'inferieurOuEgal',
  inferieurOuEgal: 'superieur',
  inferieur: 'superieurOuEgal',
  superieurOuEgal: 'inferieur',
};

/** Le contraire d'une comparaison : l'opérateur contraire s'il existe, sinon une négation. */
function nier(comparaison: Comparaison): Comparaison {
  const contraire = CONTRAIRES[comparaison.operateur];
  return contraire ? { ...comparaison, operateur: contraire } : { ...comparaison, negation: true };
}

/** Ce qui suit « est » dans une comparaison. */
function analyserApresEst(flux: FluxTokens, gauche: Expression): Comparaison {

  // « produits est en chargement », « est en erreur », « est introuvable » : l'état d'une requête.
  if (gauche.type === 'Reference') {
    const suite = flux.actuel();
    const enMot = estLeMot(suite, 'en') ? flux.regarder(1) : undefined;
    const etat = enMot && (estLeMot(enMot, 'chargement') || estLeMot(enMot, 'erreur')) ? motDe(enMot) : estLeMot(suite, 'introuvable') ? 'introuvable' : undefined;
    if (etat) {
      flux.avancer();
      if (enMot) flux.avancer();
      return {
        type: 'Comparaison',
        gauche: { type: 'EtatRequete', variable: gauche.nom, etat: etat as 'chargement' | 'erreur' | 'introuvable', ligne: gauche.ligne },
        operateur: 'vrai',
        ligne: gauche.ligne,
      };
    }
  }

  if (flux.accepter('MOT_CLE', 'vide')) {
    return { type: 'Comparaison', gauche, operateur: 'vide', ligne: gauche.ligne };
  }
  if (flux.accepter('MOT_CLE', 'vrai')) {
    return { type: 'Comparaison', gauche, operateur: 'vrai', ligne: gauche.ligne };
  }
  if (flux.accepter('MOT_CLE', 'faux')) {
    return { type: 'Comparaison', gauche, operateur: 'faux', ligne: gauche.ligne };
  }
  if (flux.accepter('MOT_CLE', 'rien')) {
    return { type: 'Comparaison', gauche, operateur: 'rien', ligne: gauche.ligne };
  }
  // « si langue est anglais » : le nom d'une langue se compare sans « égal à ».
  if (estMot(flux.actuel()) && langueDuMot(flux.actuel().original ?? flux.actuel().valeur)) {
    const langue = flux.avancer();
    return { type: 'Comparaison', gauche, operateur: 'egal', droite: { type: 'Reference', nom: langue.original ?? langue.valeur, ligne: langue.ligne }, ligne: gauche.ligne };
  }
  // « categorie est dans ["robes", "pagnes"] » : la valeur fait partie de la liste.
  if (flux.accepter('MOT_CLE', 'dans')) {
    return { type: 'Comparaison', gauche, operateur: 'dans', droite: analyserExpression(flux), ligne: gauche.ligne };
  }

  let operateur: Operateur;

  if (estLeMot(flux.actuel(), 'plus')) {
    flux.avancer();
    const grandeur = flux.actuel();
    if (!['grand', 'grande', 'grands', 'grandes', 'petit', 'petite', 'petits', 'petites'].some((mot) => estLeMot(grandeur, mot))) {
      throw new ErreurSyntaxique('après « est plus », écrivez « grand que » ou « petit que »', grandeur.ligne);
    }
    flux.avancer();
    const grand = normaliser(grandeur.original ?? grandeur.valeur).startsWith('grand');
    if (estLeMot(flux.actuel(), 'ou')) {
      flux.avancer();
      const egal = flux.actuel();
      if (!['egal', 'egale', 'egaux', 'egales'].some((mot) => estLeMot(egal, mot))) {
        throw new ErreurSyntaxique('après « plus grand ou », écrivez « égal à »', egal.ligne);
      }
      flux.avancer();
      operateur = grand ? 'superieurOuEgal' : 'inferieurOuEgal';
    } else {
      if (!estLeMot(flux.actuel(), 'que')) {
        throw new ErreurSyntaxique(`après « plus ${grand ? 'grand' : 'petit'} », écrivez « plus ${grand ? 'grand' : 'petit'} que »`, flux.actuel().ligne);
      }
      flux.avancer();
      operateur = grand ? 'superieur' : 'inferieur';
    }
  } else if (['different', 'differente', 'differents', 'differentes'].some((mot) => estLeMot(flux.actuel(), mot))) {
    flux.avancer();
    operateur = 'different';
  } else if (flux.accepter('MOT_CLE', 'egal')) {
    operateur = 'egal';
  } else if (flux.accepter('MOT_CLE', 'inferieur')) {
    operateur =
      flux.accepter('MOT_CLE', 'ou') && flux.accepter('MOT_CLE', 'egal')
        ? 'inferieurOuEgal'
        : 'inferieur';
  } else if (flux.accepter('MOT_CLE', 'superieur')) {
    operateur =
      flux.accepter('MOT_CLE', 'ou') && flux.accepter('MOT_CLE', 'egal')
        ? 'superieurOuEgal'
        : 'superieur';
  } else {
    const token = flux.actuel();
    throw new ErreurSyntaxique(
      `comparaison inconnue après « est » : « ${token.valeur || token.type} ». Essayez « égal à », « différent de », « supérieur à », « inférieur à », « plus grand que » ou « plus petit que »`,
      token.ligne,
    );
  }

  const droite = analyserExpression(flux);
  return { type: 'Comparaison', gauche, operateur, droite, ligne: gauche.ligne };
}

/** Variable ou champ de formulaire (« champ "email" »). */
/** « code … : » est un bloc de code quand le lexer a recopié ses lignes (CODE_BRUT) juste après les deux-points. */
function estBlocDeCode(flux: FluxTokens): boolean {
  for (let decalage = 1; decalage <= 7; decalage++) {
    if (flux.regarder(decalage).valeur === ':') return flux.regarder(decalage + 2).type === 'CODE_BRUT' || flux.regarder(decalage + 1).type === 'CODE_BRUT';
  }
  return false;
}

export function analyserOperande(flux: FluxTokens): Expression {
  if (flux.verifier('MOT_CLE', 'champ') && flux.regarder(1).type === 'CHAINE') {
    const debut = flux.avancer();
    const nom = flux.attendre('CHAINE', undefined, 'le nom du champ entre guillemets');
    return { type: 'Champ', nom: nom.valeur, ligne: debut.ligne };
  }
  return analyserExpression(flux);
}

function analyserEvenement(flux: FluxTokens): Evenement {
  const debut = flux.avancer();

  let genre: GenreEvenement;
  let cible: string | undefined;

  // « quand l'ordre de taches change » : après un déplacement dans la liste.
  if (estEvenementOrdre(flux)) {
    const suite = lireEvenementOrdre(flux);
    flux.attendre('PONCTUATION', ':', "deux-points à la fin de l'événement");
    return { type: 'Evenement', ...suite, corps: analyserBloc(flux), ligne: debut.ligne };
  }

  if (flux.accepter('MOT_CLE', 'utilisateur')) {
    // « appuie sur "controle+k" », « ecrit dans "…" », « arrete d'ecrire dans "…" », « arrive en bas de "…" ».
    const suite = lireEvenementUtilisateur(flux, OUTILS);
    if (suite) {
      flux.attendre('PONCTUATION', ':', "deux-points à la fin de l'événement");
      return { type: 'Evenement', ...suite, corps: analyserBloc(flux), ligne: debut.ligne };
    }
    if (flux.accepter('MOT_CLE', 'clique')) {
      genre = 'clic';
      // « clique sur X » : la préposition fait partie de la tournure.
      flux.attendre('MOT_CLE', 'sur', '« sur » suivi de la cible');
    } else if (flux.accepter('MOT_CLE', 'survole')) {
      // « survole X » : verbe transitif direct, pas de préposition.
      genre = 'survol';
    } else {
      const token = flux.actuel();
      throw new ErreurSyntaxique(
        `action utilisateur inconnue : « ${token.valeur || token.type} »`,
        token.ligne,
      );
    }
    cible = flux.attendre('CHAINE', undefined, 'la cible entre guillemets').valeur;
  } else if (flux.accepter('MOT_CLE', 'page')) {
    flux.attendre('MOT_CLE', 'charge', '« se charge » après « la page »');
    genre = 'chargement';
  } else if (flux.accepter('MOT_CLE', 'formulaire')) {
    cible = flux.attendre('CHAINE', undefined, 'le nom du formulaire').valeur;
    flux.attendre('MOT_CLE', 'est', '« est soumis » après le nom du formulaire');
    flux.attendre('MOT_CLE', 'soumis', '« soumis »');
    genre = 'soumission';
  } else {
    const token = flux.actuel();
    throw new ErreurSyntaxique(
      `événement inconnu après « quand » : « ${token.valeur || token.type} »`,
      token.ligne,
    );
  }

  flux.attendre('PONCTUATION', ':', "deux-points à la fin de l'événement");
  const corps = analyserBloc(flux);

  return { type: 'Evenement', genre, cible, corps, ligne: debut.ligne };
}

function analyserBoucle(flux: FluxTokens): Boucle {
  const debut = flux.avancer();
  flux.attendre('MOT_CLE', 'chaque', '« chaque » après « pour »');
  const { nom: variable } = flux.attendreNom('le nom de la variable de boucle');
  flux.attendre('MOT_CLE', 'dans', '« dans » suivi de la liste à parcourir');
  const liste = analyserExpression(flux);
  // « avec deplacement » : chaque élément peut être pris et déplacé.
  const deplacement = flux.verifier('MOT_CLE', 'avec') && estLeMot(flux.regarder(1), 'deplacement');
  if (deplacement) {
    flux.avancer();
    flux.avancer();
  }
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la boucle');
  const corps = analyserBloc(flux);

  return {
    type: 'Boucle',
    variable,
    liste,
    ...(deplacement ? { deplacement } : {}),
    corps,
    ligne: debut.ligne,
  };
}

/** Un calcul : des termes séparés par + ou -, de gauche à droite. */
function analyserExpression(flux: FluxTokens): Expression {
  let gauche = analyserTerme(flux);
  while (flux.verifier('PONCTUATION', '+') || flux.verifier('PONCTUATION', '-')) {
    const operateur = flux.avancer().valeur as OperateurCalcul;
    const droite = analyserTerme(flux);
    gauche = { type: 'Calcul', operateur, gauche, droite, ligne: gauche.ligne };
  }
  return gauche;
}

/** Des facteurs séparés par * ou / : ils passent avant + et -. */
function analyserTerme(flux: FluxTokens): Expression {
  let gauche = analyserFacteur(flux);
  while (flux.verifier('PONCTUATION', '*') || flux.verifier('PONCTUATION', '/')) {
    const operateur = flux.avancer().valeur as OperateurCalcul;
    const droite = analyserFacteur(flux);
    gauche = { type: 'Calcul', operateur, gauche, droite, ligne: gauche.ligne };
  }
  return gauche;
}

/** Une valeur, suivie au besoin d'un décalage de date : « aujourd'hui plus 3 jours », « livraison moins 1 semaine ». */
function analyserFacteur(flux: FluxTokens): Expression {
  const valeur = analyserFacteurSeul(flux);
  const signe = estLeMot(flux.actuel(), 'plus') ? 1 : estLeMot(flux.actuel(), 'moins') ? -1 : 0;
  const unite = flux.regarder(2);
  const UNITES: Record<string, 'jours' | 'semaines' | 'mois'> = { jour: 'jours', jours: 'jours', semaine: 'semaines', semaines: 'semaines', mois: 'mois' };
  const lue = estMot(unite) ? UNITES[normaliser(unite.original ?? unite.valeur)] : undefined;
  if (!signe || !commenceUneValeur(flux.regarder(1)) || !lue) return valeur;
  flux.avancer();
  const nombre = analyserFacteurSeul(flux);
  flux.avancer();
  return { type: 'DateDecalee', date: valeur, nombre, unite: lue, signe: signe as 1 | -1, ligne: valeur.ligne };
}

function analyserFacteurSeul(flux: FluxTokens): Expression {
  const token = flux.actuel();

  // « aujourd'hui » (le lexer lit « aujourd ' hui ») et « maintenant », seuls à leur place.
  if (estLeMot(token, 'aujourdhui') || (estLeMot(token, 'aujourd') && flux.regarder(1).valeur === "'" && estLeMot(flux.regarder(2), 'hui'))) {
    flux.avancer();
    if (estLeMot(token, 'aujourd')) {
      flux.avancer();
      flux.avancer();
    }
    return { type: 'DateDuJour', maintenant: false, ligne: token.ligne };
  }
  if (estLeMot(token, 'maintenant') && !estUnNom(flux.regarder(1)) && flux.regarder(1).valeur !== '=') {
    flux.avancer();
    return { type: 'DateDuJour', maintenant: true, ligne: token.ligne };
  }
  // « jours entre debut et fin ».
  if (estLeMot(token, 'jours') && estLeMot(flux.regarder(1), 'entre')) {
    flux.avancer();
    flux.avancer();
    const debut = analyserFacteurSeul(flux);
    flux.attendre('MOT_CLE', 'et', '« et » entre les deux dates (jours entre debut et fin)');
    return { type: 'JoursEntre', debut, fin: analyserFacteurSeul(flux), ligne: token.ligne };
  }

  if (flux.accepter('PONCTUATION', '(')) {
    const expression = analyserExpression(flux);
    flux.attendre('PONCTUATION', ')', 'une parenthèse fermante )');
    return expression;
  }

  // « -3 », ou « -prix », qui se lit 0 - prix.
  if (flux.accepter('PONCTUATION', '-')) {
    const suite = flux.actuel();
    if (suite.type === 'NOMBRE') {
      flux.avancer();
      return { type: 'Nombre', valeur: -Number(suite.valeur), ligne: suite.ligne };
    }
    return {
      type: 'Calcul',
      operateur: '-',
      gauche: { type: 'Nombre', valeur: 0, ligne: token.ligne },
      droite: analyserFacteur(flux),
      ligne: token.ligne,
    };
  }

  // « moyenne de notes », « somme de panier.prix » : « de » est déjà écarté.
  for (const operation of ['moyenne', 'somme', 'minimum', 'maximum'] as const) {
    if (estLeMot(token, operation) && commenceUneValeur(flux.regarder(1))) {
      flux.avancer();
      return { type: 'Agregat', operation, liste: analyserFacteur(flux), ligne: token.ligne };
    }
  }
  // « arrondi de x », « arrondi de x a 2 chiffres » (« a » est un petit mot écarté).
  if (estLeMot(token, 'arrondi') && commenceUneValeur(flux.regarder(1))) {
    flux.avancer();
    const valeur = analyserFacteur(flux);
    if (flux.verifier('NOMBRE') && estLeMot(flux.regarder(1), 'chiffres')) {
      const chiffres = Number(flux.avancer().valeur);
      flux.avancer();
      return { type: 'Arrondi', valeur, chiffres, ligne: token.ligne };
    }
    return { type: 'Arrondi', valeur, ligne: token.ligne };
  }
  // « hasard entre 1 et 6 ».
  if (estLeMot(token, 'hasard') && estLeMot(flux.regarder(1), 'entre')) {
    flux.avancer();
    flux.avancer();
    const minimum = analyserFacteur(flux);
    flux.attendre('MOT_CLE', 'et', '« et » entre les deux bornes (hasard entre 1 et 6)');
    return { type: 'Hasard', minimum, maximum: analyserFacteur(flux), ligne: token.ligne };
  }

  // « nombre de panier » : « de » est déjà écarté, il reste « nombre panier ».
  if (flux.verifier('MOT_CLE', 'nombre') && estUnNom(flux.regarder(1))) {
    flux.avancer();
    return { type: 'Compte', liste: analyserFacteur(flux), ligne: token.ligne };
  }

  // Le texte (tâche 2) : « majuscules de nom », « remplacer "a" par "b" dans nom ».
  for (const operation of ['majuscules', 'minuscules', 'longueur'] as const) {
    if (estLeMot(token, operation) && commenceUneValeur(flux.regarder(1))) {
      flux.avancer();
      return { type: 'OperationTexte', operation, valeur: analyserFacteur(flux), ligne: token.ligne };
    }
  }
  if (estLeMot(token, 'remplacer') && commenceUneValeur(flux.regarder(1))) {
    flux.avancer();
    const cherche = analyserFacteur(flux);
    flux.attendre('MOT_CLE', 'par', '« par » suivi du nouveau texte (remplacer "a" par "b" dans nom)');
    const remplace = analyserFacteur(flux);
    flux.attendre('MOT_CLE', 'dans', '« dans » suivi du texte où remplacer');
    return { type: 'Remplacement', cherche, remplace, dans: analyserFacteur(flux), ligne: token.ligne };
  }

  // Les listes (tâche 2) : « trier … par … », « premier de … », « les 4 premiers de … ».
  if (estLeMot(token, 'trier') && commenceUneValeur(flux.regarder(1))) {
    flux.avancer();
    const liste = analyserValeur(flux);
    const champ = flux.accepter('MOT_CLE', 'par') ? flux.attendreNom('le champ selon lequel trier').nom : undefined;
    const decroissant = estLeMot(flux.actuel(), 'decroissant');
    if (decroissant) flux.avancer();
    return { type: 'Tri', liste, ...(champ !== undefined ? { champ } : {}), decroissant, ligne: token.ligne };
  }
  if (estLeMot(token, 'grouper') && commenceUneValeur(flux.regarder(1))) {
    flux.avancer();
    const liste = analyserValeur(flux);
    flux.attendre('MOT_CLE', 'par', '« par » suivi du champ selon lequel grouper (grouper produits par categorie)');
    return { type: 'Groupement', liste, champ: flux.attendreNom('le champ selon lequel grouper').nom, ligne: token.ligne };
  }
  if (estLeMot(token, 'premier') && commenceUneValeur(flux.regarder(1))) {
    flux.avancer();
    return { type: 'Premier', liste: analyserFacteur(flux), ligne: token.ligne };
  }
  if (token.type === 'NOMBRE' && estLeMot(flux.regarder(1), 'premiers')) {
    flux.avancer();
    flux.avancer();
    return { type: 'Premiers', nombre: { type: 'Nombre', valeur: Number(token.valeur), ligne: token.ligne }, liste: analyserFacteur(flux), ligne: token.ligne };
  }

  // « produits dont prix est inferieur a 20000 » (décision L4).
  let valeur = analyserValeur(flux);
  while (estLeMot(flux.actuel(), 'dont')) {
    flux.avancer();
    valeur = { type: 'Filtre', liste: valeur, test: analyserComparaison(flux), ligne: token.ligne };
  }
  return valeur;
}

function estUnNom(token: Token): boolean {
  return token.type === 'IDENTIFIANT' || (token.type === 'MOT_CLE' && !token.reserve);
}

function analyserValeur(flux: FluxTokens): Expression {
  const token = flux.actuel();

  if (token.type === 'CHAINE') {
    flux.avancer();
    // « "Bienvenue" en anglais "Welcome" » : les versions écrites à côté.
    const versions = lireVersions(flux);
    // « "GitHub" sans traduction » : le même texte dans toutes les langues (un nom propre).
    if (estLeMot(flux.actuel(), 'sans') && estLeMot(flux.regarder(1), 'traduction')) {
      const sans = flux.avancer();
      flux.avancer();
      if (versions) throw new ErreurSyntaxique('ce texte a une version traduite et « sans traduction » : gardez l’un ou l’autre.', sans.ligne);
      return { type: 'Chaine', parties: token.parties ?? [], sansTraduction: true, ligne: token.ligne };
    }
    return { type: 'Chaine', parties: token.parties ?? [], ...(versions ? { versions } : {}), ligne: token.ligne };
  }

  if (token.type === 'NOMBRE') {
    flux.avancer();
    return { type: 'Nombre', valeur: Number(token.valeur), ligne: token.ligne };
  }

  if (flux.verifier('MOT_CLE', 'vrai') || flux.verifier('MOT_CLE', 'faux')) {
    flux.avancer();
    return { type: 'Booleen', valeur: token.valeur === 'vrai', ligne: token.ligne };
  }

  if (flux.verifier('MOT_CLE', 'rien')) {
    flux.avancer();
    return { type: 'Rien', ligne: token.ligne };
  }

  if (flux.verifier('PONCTUATION', '[')) {
    return analyserListe(flux);
  }

  // « erreur de produits » (« de » est déjà écarté) : le message de la requête qui remplit la variable.
  if (estLeMot(token, 'erreur') && flux.regarder(1).type === 'IDENTIFIANT') {
    flux.avancer();
    const variable = flux.avancer();
    return { type: 'ErreurRequete', variable: variable.original ?? variable.valeur, ligne: token.ligne };
  }

  // « fiche avec nom "Livre" et prix 12 » ; « fiche » seul reste un nom possible.
  if (estLeMot(token, 'fiche') && flux.regarder(1).type === 'MOT_CLE' && flux.regarder(1).valeur === 'avec') {
    return analyserFiche(flux);
  }

  // « remise(prix, 10) » : un nom collé à une parenthèse appelle une fonction.
  if (flux.verifierNom() && flux.regarder(1).type === 'PONCTUATION' && flux.regarder(1).valeur === '(') {
    flux.avancer();
    flux.avancer();
    const arguments_: Expression[] = [];
    if (!flux.accepter('PONCTUATION', ')')) {
      do arguments_.push(analyserExpression(flux));
      while (flux.accepter('PONCTUATION', ','));
      flux.attendre('PONCTUATION', ')', 'une parenthèse fermante ) après les valeurs données à la fonction');
    }
    return { type: 'Appel', nom: token.original ?? token.valeur, arguments: arguments_, ligne: token.ligne };
  }

  if (flux.verifierNom()) {
    flux.avancer();
    let valeur: Expression = { type: 'Reference', nom: token.original ?? token.valeur, ligne: token.ligne };
    // « p.prix » : un champ d'une donnée du serveur.
    while (flux.verifier('PONCTUATION', '.') && estUnNom(flux.regarder(1))) {
      flux.avancer();
      const champ = flux.avancer();
      valeur = { type: 'AccesChamp', objet: valeur, champ: champ.original ?? champ.valeur, ligne: token.ligne };
    }
    return valeur;
  }

  const liaison = flux.messageLiaison('la variable');
  if (liaison) throw new ErreurSyntaxique(`une valeur est attendue. ${liaison}`, token.ligne);
  // « non » est réservé mais pas encore compris : on le dit, plutôt que de
  // parler d'un nom de variable.
  if (token.type === 'MOT_CLE' && token.reserve && entreePrevue(token.valeur)) {
    throw new ErreurSyntaxique(messageMotPrevu(token), token.ligne);
  }
  if (token.type === 'MOT_CLE' && token.reserve) {
    throw new ErreurSyntaxique(
      `une valeur est attendue, mais « ${token.original ?? token.valeur} » est un mot réservé du langage : il ne peut pas servir de nom de variable.`,
      token.ligne,
    );
  }
  const trouve =
    token.type === 'FIN_LIGNE' || token.type === 'FIN_FICHIER'
      ? "la ligne s'arrête là"
      : `« ${token.valeur || token.type} » a été trouvé`;
  throw new ErreurSyntaxique(`une valeur est attendue, mais ${trouve}`, token.ligne);
}

/** « fiche avec nom "Livre" et prix 12 » : des paires nom valeur, reliées par « et ». */
function analyserFiche(flux: FluxTokens): Expression {
  const debut = flux.avancer();
  flux.avancer();
  const champs: { nom: string; valeur: Expression; ligne: number }[] = [];
  do {
    const { nom, ligne } = flux.attendreNom('le nom du champ de la fiche (fiche avec nom "Livre" et prix 12)');
    champs.push({ nom, valeur: analyserExpression(flux), ligne });
  } while (flux.accepter('MOT_CLE', 'et'));
  return { type: 'Fiche', champs, ligne: debut.ligne };
}

/** Ce que le parser prête aux interactions (`./interactions.ts`). */
const OUTILS: OutilsParser = {
  bloc: analyserBloc,
  expression: analyserExpression,
  comparaison: analyserComparaison,
  argumentPage: analyserArgumentPage,
};

/** Le message d'un mot du vocabulaire prévu mais pas encore pris en charge. */
function messageMotPrevu(token: Token): string {
  return `« ${token.original ?? token.valeur} » n’est pas encore disponible : ce mot est prévu dans le vocabulaire, mais le compilateur ne le comprend pas encore.`;
}

/** Vrai si le token peut commencer une valeur (chaîne, nombre, liste, nom…). */
function commenceUneValeur(token: Token): boolean {
  return (
    token.type === 'CHAINE' ||
    token.type === 'NOMBRE' ||
    token.type === 'IDENTIFIANT' ||
    (token.type === 'MOT_CLE' && (!token.reserve || ['vrai', 'faux'].includes(token.valeur))) ||
    (token.type === 'PONCTUATION' && token.valeur === '[')
  );
}

function analyserListe(flux: FluxTokens): Expression {
  const debut = flux.avancer();
  const elements: Expression[] = [];

  if (!flux.verifier('PONCTUATION', ']')) {
    elements.push(analyserExpression(flux));
    while (flux.accepter('PONCTUATION', ',')) {
      elements.push(analyserExpression(flux));
    }
  }

  flux.attendre('PONCTUATION', ']', 'un crochet fermant ] pour la liste');
  return { type: 'Liste', elements, ligne: debut.ligne };
}
