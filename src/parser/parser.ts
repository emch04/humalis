import { deplierFonctionsActions } from './fonctionsActions.js';
import { estSite, analyserSite, estApercu, analyserApercu } from './site.js';
import { estLangues, analyserLangues, estTraductions, analyserTraductions, lireVersions, estSelecteurLangue } from './langues.js';
import { OPTIONS } from '../analyse/styles.js';
import type { Token, PartieChaine } from '../lexer/types.js';
import { analyser as analyserLexique } from '../lexer/lexer.js';
import { FluxTokens } from './fluxTokens.js';
import { analyserResume, analyserActionServeur, analyserCorpsServeur, analyserDocument, analyserTache, estTache } from './logique.js';
import { analyserSource, analyserClausesRequete, analyserSourceSeule } from './source.js';
import { analyserEntetePage, analyserAvecPage } from './navigation.js';
import { ErreurSyntaxique } from './erreurs.js';
import { estUnTest, analyserTest } from './test.js';
import { normaliser } from '../lexer/motsCles.js';
import { entreePrevue } from '../vocabulaire/recherche.js';
import { langueDuMot } from '../i18n/langues.js';
import { estMot } from './miseEnPage.js';
import { analyserStylePropre, estSurPlateforme, analyserSurPlateforme, estStylePlateforme, lireStylePlateforme, lirePlateforme, estSurAppareil, analyserSurAppareil, estDisposition, analyserDisposition, analyserSansDisposition } from './miseEnPage.js';
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
  Connexion, ConnexionGoogle, ConnexionApple, ChangementMotDePasse, Invitation, ChangementRole, ChangementCompte, ResumeServeur, DroitIa, DemandeIa, Paiement, ApresPaiement, FaireAction, TelechargementDocument, DocumentServeur, ActionServeur, TachePlanifiee, EnvoiNotification, ConditionRegle, OperandeRegle, DemandeLienMotDePasse, ChoixMotDePasse, ApresCreation, EnvoiEmail, CreationLiee, RegleChamp, ValeurFixe, TelechargementBon, TelechargementCsv, Fidelite, Suppression, Modification, EnvoiFichier, ArgumentPage } from './ast.js';

export function analyserSyntaxe(tokens: Token[]): Programme {
  const flux = new FluxTokens(tokens);
  const pages: Page[] = [];
  const styles: BlocStyle[] = [];
  const fichiersStyle: FichierStyle[] = [];
  const fichiersIcones: { chemin: string; ligne: number }[] = [];
  let barreDessinee: Programme['barreDessinee'];
  const donneesFichiers: Programme['donneesFichiers'] = [];
  const partages: DeclarationVariable[] = [];
  const composantsReact: ComposantReact[] = [];
  let paquetsSwift: NonNullable<Programme['paquetsSwift']> | undefined;
  let liensProfonds: Programme['liensProfonds'];
  let ongletsApplication: Programme['ongletsApplication'];
  let barreLaterale: string | undefined;
  const commandesMenu: Evenement[] = [];
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
  const calculsPartages: DeclarationVariable[] = [];
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
      if (disposition.genre === 'barre' ? barreDessinee : disposition.genre === 'entete' ? entete : pied) {
        throw new ErreurSyntaxique(`un seul « ${disposition.genre === 'barre' ? 'barre laterale' : disposition.genre} » par application : il est déjà déclaré plus haut.`, disposition.ligne);
      }
      if (disposition.genre === 'barre') barreDessinee = disposition;
      else if (disposition.genre === 'entete') entete = disposition;
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

    // « calcul articles = somme de panier.quantite » en haut du fichier : il se recalcule dans toutes les pages.
    if (flux.verifier('MOT_CLE', 'calcul')) {
      if (pages.length > 0) throw new ErreurSyntaxique('un calcul partagé s\'écrit en haut du fichier, avant les pages.', flux.actuel().ligne);
      calculsPartages.push({ ...analyserVariable(flux), calcul: true });
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

    // « onglets de l'application : » : les pages principales.
    if (estLeMot(flux.actuel(), 'onglets') && estLeMot(flux.regarder(1), 'application')) {
      const debut = flux.avancer();
      flux.avancer();
      // « avec barre laterale "Module" » : sur Mac, l'application dessine sa propre barre.
      if (estLeMot(flux.actuel(), 'avec') && estLeMot(flux.regarder(1), 'barre') && estLeMot(flux.regarder(2), 'laterale')) {
        flux.avancer(); flux.avancer(); flux.avancer();
        barreLaterale = flux.attendre('CHAINE', undefined, 'le nom du module de la barre latérale entre guillemets').valeur;
      }
      flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la ligne');
      ongletsApplication = [];
      const lireOnglet = (groupe?: string) => {
        const ligne = motAttendu(flux, 'onglet', 'onglet "Accueil" vers "accueil" avec icone "maison"');
        const titre = flux.attendre('CHAINE', undefined, 'le titre de l’onglet entre guillemets').valeur;
        flux.attendre('MOT_CLE', 'vers', '« vers » puis la page entre guillemets');
        const page = flux.attendre('CHAINE', undefined, 'la page entre guillemets').valeur;
        const icone = lireIcone(flux);
        ongletsApplication!.push({ titre, page, ...(icone ? { icone } : {}), ...(groupe ? { groupe } : {}), ligne });
      };
      lignesDuBloc(flux, () => {
        // « groupe "Équipe" : » puis ses onglets, décalés : un intertitre dans le menu.
        if (estLeMot(flux.actuel(), 'groupe')) {
          flux.avancer();
          const groupe = flux.attendre('CHAINE', undefined, 'le titre du groupe entre guillemets').valeur;
          flux.attendre('PONCTUATION', ':', 'deux-points après le titre du groupe');
          lignesDuBloc(flux, () => lireOnglet(groupe));
          return;
        }
        lireOnglet();
      });
      if (ongletsApplication.length === 0) throw new ErreurSyntaxique('« onglets de l’application » attend au moins un onglet en dessous, décalé.', debut.ligne);
      flux.sauterFinsDeLigne();
      continue;
    }

    // « menu de l'application "Fichier" : » puis ses commandes.
    if (estLeMot(flux.actuel(), 'menu') && estLeMot(flux.regarder(1), 'application') && flux.regarder(2).type === 'CHAINE') {
      flux.avancer();
      flux.avancer();
      const menu = flux.avancer().valeur;
      flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la ligne');
      lignesDuBloc(flux, () => {
        const ligne = motAttendu(flux, 'commande', 'commande "Nouveau" avec raccourci "cmd+n" :');
        const titreCommande = flux.attendre('CHAINE', undefined, 'le titre de la commande entre guillemets').valeur;
        let touches: string | undefined;
        if (flux.accepter('MOT_CLE', 'avec')) {
          motAttendu(flux, 'raccourci', 'commande "Nouveau" avec raccourci "cmd+n" :');
          touches = flux.attendre('CHAINE', undefined, 'le raccourci entre guillemets').valeur.replace(/\b(cmd|commande)\b/gi, 'controle');
        }
        flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la commande');
        commandesMenu.push({ type: 'Evenement', genre: 'commandeMenu', menuApplication: menu, titreCommande, ...(touches ? { touches } : {}), corps: analyserBloc(flux), ligne });
      });
      flux.sauterFinsDeLigne();
      continue;
    }

    // « liens profonds "magasin" » : les adresses magasin://… ouvrent les pages.
    if (estLeMot(flux.actuel(), 'liens') && estLeMot(flux.regarder(1), 'profonds')) {
      const debut = flux.avancer();
      flux.avancer();
      const schema = flux.attendre('CHAINE', undefined, 'le début des adresses entre guillemets : liens profonds "magasin"').valeur.toLowerCase();
      if (!/^[a-z][a-z0-9+.-]*$/.test(schema) || ['http', 'https', 'file', 'mailto', 'tel'].includes(schema)) {
        throw new ErreurSyntaxique(`« ${schema} » ne peut pas servir de début d’adresse : choisissez un mot propre à l’application, sans espace ni « : », par exemple liens profonds "magasin".`, debut.ligne);
      }
      if (liensProfonds) throw new ErreurSyntaxique('« liens profonds » ne s’écrit qu’une fois par application.', debut.ligne);
      let domaine: string | undefined;
      if (flux.accepter('MOT_CLE', 'et')) {
        if (!estLeMot(flux.actuel(), 'domaine')) flux.attendre('IDENTIFIANT', 'domaine', '« domaine » puis le site entre guillemets');
        flux.avancer();
        domaine = flux.attendre('CHAINE', undefined, 'le site entre guillemets : domaine "exemple.fr/essai"').valeur;
        if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[A-Za-z0-9._~-]+)*$/.test(domaine)) {
          throw new ErreurSyntaxique(`« ${domaine} » n’est pas un domaine : écrivez seulement le site, sans https:// ni « / » à la fin, par exemple domaine "exemple.fr/essai".`, debut.ligne);
        }
      }
      liensProfonds = { schema, ...(domaine ? { domaine } : {}), ligne: debut.ligne };
      flux.sauterFinsDeLigne();
      continue;
    }

    // « paquet swift "https://…" version "1.2" » : une bibliothèque Swift pour les vues écrites à la main.
    if (estLeMot(flux.actuel(), 'paquet') && estLeMot(flux.regarder(1), 'swift')) {
      const debut = flux.avancer();
      flux.avancer();
      const adresse = flux.attendre('CHAINE', undefined, 'l’adresse du paquet entre guillemets').valeur;
      flux.attendre('IDENTIFIANT', 'version', '« version » puis le numéro entre guillemets');
      const version = flux.attendre('CHAINE', undefined, 'le numéro de version entre guillemets').valeur;
      let produit: string | undefined;
      if (estLeMot(flux.actuel(), 'produit')) {
        flux.avancer();
        produit = flux.attendre('CHAINE', undefined, 'le nom du produit entre guillemets').valeur;
      }
      (paquetsSwift ??= []).push({ adresse, version, ...(produit ? { produit } : {}), ligne: debut.ligne });
      flux.sauterFinsDeLigne();
      continue;
    }

    // « utiliser composant » : du React. « utiliser module » : du JavaScript simple, sans framework.
    if (flux.verifier('MOT_CLE', 'utiliser') && (estLeMot(flux.regarder(1), 'composant') || estLeMot(flux.regarder(1), 'module'))) {
      const debut = flux.avancer();
      const estModule = estLeMot(flux.avancer(), 'module');
      const genre = estModule ? 'module' : 'composant';
      const fichier = estModule ? 'fichier JavaScript' : 'fichier React';
      const nom = flux.attendre('CHAINE', undefined, `le nom du ${genre} entre guillemets`).valeur;
      if (!estLeMot(flux.actuel(), 'depuis')) {
        flux.attendre('IDENTIFIANT', 'depuis', `« depuis » suivi du chemin du ${fichier}`);
      }
      flux.avancer();
      const chemin = flux.attendre('CHAINE', undefined, `le chemin du ${fichier} entre guillemets`).valeur;
      // « sur apple "Carte.swift" » : la vue écrite à la main pour les applications Apple.
      let apple: string | undefined;
      if (estLeMot(flux.actuel(), 'sur')) {
        flux.avancer();
        flux.attendre('IDENTIFIANT', 'apple', '« apple », puis le chemin du fichier Swift');
        apple = flux.attendre('CHAINE', undefined, 'le chemin du fichier Swift entre guillemets').valeur;
      }
      composantsReact.push({ type: 'ComposantReact', nom, chemin, ligne: debut.ligne, ...(estModule ? { module: true as const } : {}), ...(apple !== undefined ? { apple } : {}) });
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

    // « utiliser icones "./icones.svg" » : des dessins que le projet apporte.
    if (flux.verifier('MOT_CLE', 'utiliser') && estLeMot(flux.regarder(1), 'icones')) {
      const debut = flux.avancer();
      flux.avancer();
      fichiersIcones.push({ chemin: flux.attendre('CHAINE', undefined, 'le chemin du fichier SVG entre guillemets').valeur, ligne: debut.ligne });
      flux.sauterFinsDeLigne();
      continue;
    }

    if (flux.verifier('MOT_CLE', 'utiliser')) {
      const debut = flux.avancer();
      flux.attendre('MOT_CLE', 'style', '« style » après « utiliser »');
      const chemin = flux.attendre('CHAINE', undefined, 'le chemin du fichier CSS entre guillemets').valeur;
      const plateforme = flux.accepter('MOT_CLE', 'sur') ? lirePlateforme(flux) : undefined;
      fichiersStyle.push({ type: 'FichierStyle', chemin, ...(plateforme ? { plateforme } : {}), ligne: debut.ligne });
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
  const enTete = [...constantes, ...calculsPartages];
  if (enTete.length > 0) {
    for (const lieu of [...pages, ...composants, ...(entete ? [entete] : []), ...(pied ? [pied] : [])]) lieu.corps.unshift(...enTete.map((c) => ({ ...c })));
  }
  for (const lieu of [...pages, ...composants, ...(entete ? [entete] : []), ...(pied ? [pied] : [])]) lieu.corps = selonEnConditions(lieu.corps);
  // Les onglets donnent un menu aux cibles sans barre d'onglets : c'est aussi la barre latérale du Mac.
  if (ongletsApplication) {
    let groupeEnCours: string | undefined;
    const liens = ongletsApplication.flatMap((o) => {
      const intertitre = o.groupe && o.groupe !== groupeEnCours ? [`        texte "${sansGuillemets(o.groupe)}" avec style "humalis-menu-groupe"`] : [];
      groupeEnCours = o.groupe;
      return [...intertitre, `        lien "${sansGuillemets(o.titre)}" vers "${o.page}"${o.icone ? ` avec icone "${o.icone}"` : ''}`];
    }).join('\n');
    const menuOnglets = analyserSyntaxe(analyserLexique(`entete :\n    menu :\n${liens}\n`).map((t) => ({ ...t, ligne: ongletsApplication![0].ligne }))).entete!;
    if (entete) entete.corps.push(...menuOnglets.corps);
    else entete = menuOnglets;
  }
  if (commandesMenu.length > 0) {
    if (pages.length === 0) throw new ErreurSyntaxique('« menu de l’application » demande au moins une page dans le fichier.', commandesMenu[0].ligne);
    pages[0].corps.push(...commandesMenu);
  }
  const programme: Programme = { type: 'Programme', pages, ...(fichiersIcones.length ? { fichiersIcones } : {}), ...(barreDessinee ? { barreDessinee } : {}), ...(ongletsApplication ? { ongletsApplication } : {}), ...(barreLaterale ? { barreLaterale } : {}), ...(paquetsSwift ? { paquetsSwift } : {}), ...(liensProfonds ? { liensProfonds } : {}), ...(enTete.length > 0 ? { calculsPartages: enTete } : {}), styles, fichiersStyle, donneesFichiers, partages, composantsReact, composants, serveurs, sources, fichiersHumalis, fonctions, tests, ...(theme ? { theme } : {}), ...(site ? { site } : {}), ...(langues ? { langues } : {}), ...(traductions.length ? { traductions } : {}), ...(entete ? { entete } : {}), ...(pied ? { pied } : {}) };
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

/** « selon » écrit dans une page : chaque « cas » devient un « si », seul ce qui s'affiche est concerné. */
function selonEnConditions(corps: Instruction[]): Instruction[] {
  return corps.map((i) => {
    switch (i.type) {
      case 'Selon': {
        let sinon = selonEnConditions(i.sinon);
        for (const cas of [...i.cas].reverse()) {
          const test = cas.valeurs
            .map((droite): Test => ({ type: 'Comparaison', gauche: i.valeur, operateur: 'egal', droite, ligne: cas.ligne }))
            .reduce((gauche, droite) => ({ type: 'Combinaison', operateur: 'ou', gauche, droite, ligne: cas.ligne }));
          sinon = [{ type: 'Condition', test, alors: selonEnConditions(cas.corps), sinon, ligne: cas.ligne }];
        }
        return sinon.length === 1 ? sinon[0] : { type: 'Bloc', genre: 'bloc', styles: [], classes: [], corps: sinon, ligne: i.ligne };
      }
      case 'Condition':
        return { ...i, alors: selonEnConditions(i.alors), sinon: selonEnConditions(i.sinon) };
      case 'Bloc':
      case 'Formulaire':
      case 'Boucle':
      case 'Fenetre':
        return { ...i, corps: selonEnConditions(i.corps) };
      default:
        return i;
    }
  });
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
  let connexionGoogle: number | undefined;
  let connexionApple: number | undefined;
  let roles: string[] | undefined;
  let emails: Serveur['emails'];
  let invitations: Serveur['invitations'];
  let motDePasseOublie: Serveur['motDePasseOublie'];
  let fidelite: Fidelite | undefined;
  const taches: TachePlanifiee[] = [];
  const documents: DocumentServeur[] = [];
  let ia: Serveur['ia'];
  const champsCompte: NonNullable<Serveur['champsCompte']> = [];
  let paiements: Serveur['paiements'];
  let droitIa: DroitIa | undefined;

  chaqueLigne(flux, () => {
    const token = flux.actuel();
    if (estLeMot(token, 'compte') && flux.regarder(1).valeur === ':') {
      flux.avancer();
      flux.avancer();
      chaqueLigne(flux, () => {
        const champ = flux.attendreNom('le nom du champ du compte');
        flux.attendre('PONCTUATION', ':', 'deux-points entre le nom du champ et son type');
        champsCompte.push({ nom: champ.nom, type: analyserTypeChamp(flux), ligne: champ.ligne });
      });
    } else if (estDroitIa(flux)) {
      const droit = analyserRegle(flux, roles !== undefined);
      if (droit.type === 'DroitIa') droitIa = droit;
    } else if (estLeMot(token, 'paiements') && estLeMot(flux.regarder(1), 'par')) {
      flux.avancer();
      flux.avancer();
      if (motDe(flux.actuel()) !== 'stripe') throw new ErreurSyntaxique('le seul service de paiement est Stripe pour l’instant : paiements par stripe', token.ligne);
      flux.avancer();
      paiements = { service: 'stripe', ligne: token.ligne };
    } else if (estLeMot(token, 'ia') && estLeMot(flux.regarder(1), 'par')) {
      flux.avancer();
      flux.avancer();
      if (motDe(flux.actuel()) !== 'anthropic') throw new ErreurSyntaxique('le seul service d’IA est Anthropic pour l’instant : ia par anthropic', token.ligne);
      flux.avancer();
      ia = { service: 'anthropic', ligne: token.ligne };
    } else if (estTache(flux)) {
      taches.push(analyserTache(flux));
    } else if (estLeMot(token, 'document') && flux.regarder(1).type === 'CHAINE') {
      documents.push(analyserDocument(flux));
    } else if (estLeMot(token, 'donnee')) {
      donnees.push(analyserDonnee(flux));
    } else if (estLeMot(token, 'route')) {
      routes.push(analyserRoute(flux, roles !== undefined));
    } else if (estLeMot(token, 'connexion')) {
      // « connexion google », « connexion apple » : les portes en plus de l'email et du mot de passe.
      flux.avancer();
      const fournisseur = flux.actuel();
      if (motDe(fournisseur) !== 'google' && motDe(fournisseur) !== 'apple') {
        throw new ErreurSyntaxique(`après « connexion », écrivez le fournisseur : connexion google ou connexion apple`, token.ligne);
      }
      flux.avancer();
      if (motDe(fournisseur) === 'apple') connexionApple = token.ligne;
      else connexionGoogle = token.ligne;
    } else if (estLeMot(token, 'roles')) {
      // « roles directeur, enseignant et parent ».
      flux.avancer();
      roles = [];
      while (!flux.verifier('FIN_LIGNE') && !flux.estFini()) {
        const mot = flux.avancer();
        if (motDe(mot) !== 'et' && mot.valeur !== ',') roles.push(motDe(mot));
      }
    } else if (estLeMot(token, 'emails')) {
      // « emails par brevo » : un seul service pour l'instant.
      flux.avancer();
      if (!estLeMot(flux.actuel(), 'par')) throw new ErreurSyntaxique('après « emails », écrivez le service qui les envoie : emails par brevo', token.ligne);
      flux.avancer();
      const service = flux.actuel();
      if (motDe(service) !== 'brevo') throw new ErreurSyntaxique('le seul service d’e-mails est Brevo pour l’instant : emails par brevo', token.ligne);
      flux.avancer();
      emails = { service: 'brevo', ligne: token.ligne };
    } else if (estLeMot(token, 'invitations')) {
      flux.avancer();
      invitations = { page: pageDuLien(flux, 'invitations'), ligne: token.ligne };
    } else if (estLeMot(token, 'mot') && estLeMot(flux.regarder(1), 'passe') && estLeMot(flux.regarder(2), 'oublie')) {
      flux.avancer();
      flux.avancer();
      flux.avancer();
      motDePasseOublie = { page: pageDuLien(flux, 'mot de passe oublie'), ligne: token.ligne };
    } else if (estLeMot(token, 'fidelite')) {
      if (fidelite) throw new ErreurSyntaxique(`un serveur n'a qu'une seule « fidelite » : elle est déjà écrite ligne ${fidelite.ligne}.`, token.ligne);
      fidelite = analyserFidelite(flux);
    } else {
      throw new ErreurSyntaxique(
        `dans un serveur, on écrit « donnee … : », « route "…" : », « fidelite par … de … : », « connexion google », « emails par brevo », « invitations vers "…" » ou « mot de passe oublie vers "…" », mais « ${token.original ?? token.valeur} » a été trouvé`,
        token.ligne,
      );
    }
  });

  // Une donnée payée reçoit un champ « paye », que seul le serveur écrit.
  for (const route of routes) {
    if (!route.apresPaiement) continue;
    const payee = donnees.find((d) => d.nom === route.apresPaiement!.donnee);
    if (payee) payee.champs.push({ nom: 'paye', type: { genre: 'booleen' }, regle: { genre: 'depart', valeur: { genre: 'valeur', valeur: false } }, ligne: route.apresPaiement.ligne });
  }

  // « comptes » dans une règle : les comptes de la connexion, s'il n'existe pas de donnée de ce nom.
  const regleComptes = routes.flatMap((r) => r.regles).find((r) => r.donnee === 'comptes');
  if (regleComptes && !donnees.some((d) => d.nom === 'comptes')) {
    const champ = (nom: string) => ({ nom, type: { genre: 'texte' as const }, ligne: regleComptes.ligne });
    donnees.push({ type: 'Donnee', nom: 'comptes', champs: [...['email', 'role', 'statut'].map(champ), ...champsCompte], comptes: true, ligne: regleComptes.ligne });
  }

  return {
    type: 'Serveur',
    nom,
    donnees,
    routes,
    ...(connexionGoogle !== undefined ? { connexionGoogle } : {}),
    ...(connexionApple !== undefined ? { connexionApple } : {}),
    ...(roles?.length ? { roles } : {}),
    ...(taches.length ? { taches } : {}),
    ...(documents.length ? { documents } : {}),
    ...(ia ? { ia } : {}),
    ...(champsCompte.length ? { champsCompte } : {}),
    ...(paiements ? { paiements } : {}),
    ...(droitIa ? { droitIa } : {}),
    ...(emails ? { emails } : {}),
    ...(invitations ? { invitations } : {}),
    ...(motDePasseOublie ? { motDePasseOublie } : {}),
    ...(fidelite ? { fidelite } : {}),
    ligne: debut.ligne,
  };
}

/** « vers "bienvenue" » : la page qu'ouvre le lien d'un e-mail. */
function pageDuLien(flux: FluxTokens, ligne: string): string {
  const exemple = `« ${ligne} » est suivi de la page qu'ouvre le lien : ${ligne} vers "bienvenue"`;
  if (!estLeMot(flux.actuel(), 'vers')) throw new ErreurSyntaxique(exemple, flux.actuel().ligne);
  flux.avancer();
  if (flux.actuel().type !== 'CHAINE') throw new ErreurSyntaxique(exemple, flux.actuel().ligne);
  return flux.avancer().valeur;
}

/**
 * « fidelite par telephone de commande : », puis « 1 tampon par commande livree »
 * et « apres 5 tampons, recompense "Un maillot offert" ». L'analyse vérifie le sens
 * (les champs, les nombres entiers) : ici, on lit seulement les mots.
 */
function analyserFidelite(flux: FluxTokens): Fidelite {
  const debut = flux.avancer();
  flux.attendre('MOT_CLE', 'par', '« par » suivi du champ qui désigne le client (fidelite par telephone de commande)');
  const champ = flux.attendreNom('le nom du champ qui désigne le client').nom;
  const donnee = flux.attendreNom('le nom de la donnée').nom;
  flux.attendre('PONCTUATION', ':', 'deux-points après « fidelite par … de … »');

  const fidelite: Fidelite = { type: 'Fidelite', champ, donnee, ligne: debut.ligne };
  chaqueLigne(flux, () => {
    const token = flux.actuel();
    if (estLeMot(token, 'apres')) {
      flux.avancer();
      const tampons = lireTampons(flux);
      // « apres 5 tampons, recompense » : la virgule se lit si elle est écrite.
      flux.accepter('PONCTUATION', ',');
      if (motDe(flux.actuel()) !== 'recompense') {
        throw new ErreurSyntaxique(`après « apres ${tampons} tampons », écrivez la récompense : recompense "Un cadeau"`, flux.actuel().ligne);
      }
      flux.avancer();
      fidelite.objectif = { tampons, recompense: flux.attendre('CHAINE', undefined, 'la récompense entre guillemets').valeur, ligne: token.ligne };
    } else if (token.type === 'NOMBRE' || (token.type === 'PONCTUATION' && token.valeur === '-')) {
      const tampons = lireTampons(flux);
      flux.attendre('MOT_CLE', 'par', '« par » suivi de la donnée et de son statut (1 tampon par commande livree)');
      const cible = flux.attendreNom('le nom de la donnée').nom;
      const statut = flux.attendreNom('le statut qui donne le tampon').nom;
      fidelite.gain = { tampons, donnee: cible, statut, ligne: token.ligne };
    } else {
      throw new ErreurSyntaxique(
        `dans « fidelite », on écrit « 1 tampon par commande livree » et « apres 5 tampons, recompense "…" », mais « ${token.original ?? token.valeur} » a été trouvé`,
        token.ligne,
      );
    }
  });
  return fidelite;
}

/** « 5 tampons » ou « 1 tampon » : le nombre, tel qu'il est écrit (l'analyse refuse ce qui n'est pas un entier positif). */
function lireTampons(flux: FluxTokens): number {
  const negatif = flux.accepter('PONCTUATION', '-');
  const nombre = Number(flux.attendre('NOMBRE', undefined, 'le nombre de tampons').valeur);
  const mot = flux.actuel();
  if (motDe(mot) !== 'tampon' && motDe(mot) !== 'tampons') {
    throw new ErreurSyntaxique(`après le nombre, écrivez « tampon » ou « tampons » : ${nombre} tampons`, mot.ligne);
  }
  flux.avancer();
  return negatif ? -nombre : nombre;
}

export function analyserDonnee(flux: FluxTokens, ouverte = false): Donnee {
  const debut = flux.avancer();
  const { nom } = flux.attendreNom('le nom de la donnée');
  // « donnee commande par boutique : », « donnee message par compte : ».
  let par: string | undefined;
  if (!ouverte && estLeMot(flux.actuel(), 'par')) {
    flux.avancer();
    par = flux.attendreNom('ce qui sépare les fiches : donnee commande par boutique').nom;
  }
  flux.attendre('PONCTUATION', ':', 'deux-points après le nom de la donnée');
  const champs: Donnee['champs'] = [];
  chaqueLigne(flux, () => {
    const champ = flux.attendreNom('le nom du champ');
    flux.attendre('PONCTUATION', ':', 'deux-points entre le nom du champ et son type');
    const type = analyserTypeChamp(flux, ouverte);
    // « non vide » se place avant ou après une règle : « liste de texte du site non vide ».
    const nonVideAvant = !ouverte && lireNonVide(flux);
    const regle = ouverte ? undefined : analyserRegleChamp(flux);
    const nonVide = nonVideAvant || (!ouverte && lireNonVide(flux));
    champs.push({ nom: champ.nom, type, ...(regle ? { regle } : {}), ...(nonVide ? { nonVide } : {}), ligne: champ.ligne });
  });
  if (par !== undefined) champs.push({ nom: par, type: { genre: 'texte' }, regle: { genre: 'groupe' }, ligne: debut.ligne });
  return { type: 'Donnee', nom, ...(par !== undefined ? { par } : {}), champs, ligne: debut.ligne };
}

/** « non vide » après le type d'un champ. */
function lireNonVide(flux: FluxTokens): boolean {
  if (!estLeMot(flux.actuel(), 'non') || !estLeMot(flux.regarder(1), 'vide')) return false;
  flux.avancer();
  flux.avancer();
  return true;
}

/** Un nom de champ ou de donnée dans une règle du serveur : les mots du langage y restent des noms. */
function nomDansRegle(flux: FluxTokens, exemple: string): string {
  const jeton = flux.actuel();
  if (!estMot(jeton)) throw new ErreurSyntaxique(`on écrit par exemple : ${exemple}`, jeton.ligne);
  flux.avancer();
  return jeton.valeur;
}

/** « "en_attente" », « 0 », « vrai », « aujourd'hui » ; undefined si ce n'est aucun des quatre. */
function valeurFixe(flux: FluxTokens): ValeurFixe | undefined {
  const jeton = flux.actuel();
  if (jeton.type === 'CHAINE') {
    flux.avancer();
    return { genre: 'valeur', valeur: jeton.valeur };
  }
  if (jeton.type === 'NOMBRE') {
    flux.avancer();
    return { genre: 'valeur', valeur: Number(jeton.valeur) };
  }
  if (estLeMot(jeton, 'vrai') || estLeMot(jeton, 'faux')) {
    flux.avancer();
    return { genre: 'valeur', valeur: estLeMot(jeton, 'vrai') };
  }
  if (estLeMot(jeton, 'aujourdhui')) {
    flux.avancer();
    return { genre: 'aujourdhui' };
  }
  if (estLeMot(jeton, 'aujourd') && flux.regarder(1).valeur === "'" && estLeMot(flux.regarder(2), 'hui')) {
    flux.avancer();
    flux.avancer();
    flux.avancer();
    return { genre: 'aujourdhui' };
  }
  return undefined;
}

/** Ce qui suit le type d'un champ : « au depart "…" », « du site », « calcule … », « au plus … » (« au » et « du » sont déjà sautés). */
function analyserRegleChamp(flux: FluxTokens): RegleChamp | undefined {
  const jeton = flux.actuel();
  if (estLeMot(jeton, 'site')) {
    flux.avancer();
    return { genre: 'site' };
  }
  if (estLeMot(jeton, 'depart')) {
    flux.avancer();
    const valeur = valeurFixe(flux);
    if (!valeur) throw new ErreurSyntaxique('« au depart » est suivi de la valeur que le serveur donne : un texte entre guillemets, un nombre, vrai, faux ou aujourd\'hui.', jeton.ligne);
    return { genre: 'depart', valeur };
  }
  if (estLeMot(jeton, 'plus')) {
    const exemple = 'livraison : nombre au plus prix de zone par commune';
    flux.avancer();
    const prix = nomDansRegle(flux, exemple);
    const donnee = nomDansRegle(flux, exemple);
    if (!estLeMot(flux.actuel(), 'par')) throw new ErreurSyntaxique(`on écrit par exemple : ${exemple}`, jeton.ligne);
    flux.avancer();
    return { genre: 'auPlus', prix, donnee, par: nomDansRegle(flux, exemple) };
  }
  if (!estLeMot(jeton, 'calcule')) return undefined;
  const exemple = 'total : nombre calcule somme prix de produit par refs plus livraison, ou quantite : nombre calcule nombre de refs';
  flux.avancer();
  if (estLeMot(flux.actuel(), 'nombre')) {
    flux.avancer();
    return { genre: 'nombreDe', liste: nomDansRegle(flux, exemple) };
  }
  if (!estLeMot(flux.actuel(), 'somme')) throw new ErreurSyntaxique(`on écrit par exemple : ${exemple}`, jeton.ligne);
  flux.avancer();
  const prix = nomDansRegle(flux, exemple);
  const donnee = nomDansRegle(flux, exemple);
  if (!estLeMot(flux.actuel(), 'par')) throw new ErreurSyntaxique(`on écrit par exemple : ${exemple}`, jeton.ligne);
  flux.avancer();
  const liste = nomDansRegle(flux, exemple);
  if (!estLeMot(flux.actuel(), 'plus')) return { genre: 'somme', prix, donnee, liste };
  flux.avancer();
  return { genre: 'somme', prix, donnee, liste, plus: nomDansRegle(flux, exemple) };
}

/** « texte », « nombre », « booleen », « date », « liste de … ». */
export function analyserTypeChamp(flux: FluxTokens, ouverte = false): TypeChamp {
  const token = flux.avancer();
  const mot = motDe(token);
  if (mot === 'texte' || mot === 'nombre' || mot === 'booleen' || mot === 'date') return { genre: mot };
  if (mot === 'liste') return { genre: 'liste', de: analyserTypeChamp(flux, ouverte) };
  // « photo : image » : une image envoyée depuis la page (un fichier choisi), gardée par le serveur.
  if (mot === 'image' && !ouverte) return { genre: 'texte', image: true };
  // Dans une source, un autre nom est une autre donnée de la même source (un objet imbriqué).
  if (ouverte && estUnNom(token)) return { genre: 'donnee', nom: token.original ?? token.valeur };
  throw new ErreurSyntaxique(
    `« ${token.original ?? token.valeur} » n'est pas un type de champ. Types possibles : texte, nombre, booleen, date, image, liste de …`,
    token.ligne,
  );
}

const ACTIONS_DONNEE: ActionDonnee[] = ['lire', 'creer', 'modifier', 'supprimer'];

function analyserRoute(flux: FluxTokens, avecRoles = false): Route {
  const debut = flux.avancer();
  const adresse = flux.attendre('CHAINE', undefined, "l'adresse de la route entre guillemets").valeur;
  flux.attendre('PONCTUATION', ':', "deux-points après l'adresse de la route");
  const regles: Regle[] = [];
  const actions: ActionServeur[] = [];
  const resumes: ResumeServeur[] = [];
  let apresCreation: ApresCreation | undefined;
  let apresPaiement: ApresPaiement | undefined;
  chaqueLigne(flux, () => {
    if ((flux.verifier('MOT_CLE', 'quand') || estLeMot(flux.actuel(), 'quand')) && estLeMot(flux.regarder(3), 'payee')) {
      const debutQuand = flux.avancer();
      const { nom: donnee } = flux.attendreNom('le nom de la donnée');
      flux.avancer();
      flux.avancer();
      flux.attendre('PONCTUATION', ':', 'deux-points après « est payee »');
      if (apresPaiement) throw new ErreurSyntaxique(`une route n'a qu'un seul « quand … est payee » : il est déjà écrit ligne ${apresPaiement.ligne}.`, debutQuand.ligne);
      apresPaiement = { donnee, corps: analyserCorpsServeur(flux), ligne: debutQuand.ligne };
    } else if (flux.verifier('MOT_CLE', 'quand') || estLeMot(flux.actuel(), 'quand')) {
      if (apresCreation) throw new ErreurSyntaxique(`une route n'a qu'un seul « quand … est cree » : il est déjà écrit ligne ${apresCreation.ligne}.`, flux.actuel().ligne);
      apresCreation = analyserApresCreation(flux);
    } else {
      const lue = analyserRegle(flux, avecRoles);
      if (lue.type === 'Regle') regles.push(lue);
      else if (lue.type === 'ActionServeur') actions.push(lue);
      else if (lue.type === 'ResumeServeur') resumes.push(lue);
      else throw new ErreurSyntaxique('« … peut demander a ia » s’écrit directement dans le serveur, pas dans une route.', lue.ligne);
    }
  });
  return { type: 'Route', adresse, regles, ...(actions.length ? { actions } : {}), ...(resumes.length ? { resumes } : {}), ...(apresCreation ? { apresCreation } : {}), ...(apresPaiement ? { apresPaiement } : {}), ligne: debut.ligne };
}

/** « quand message est cree : » puis, décalés, les « envoyer email … ». */
function analyserApresCreation(flux: FluxTokens): ApresCreation {
  const debut = flux.avancer();
  const { nom: donnee } = flux.attendreNom('le nom de la donnée');
  if (!estLeMot(flux.actuel(), 'est') || !estLeMot(flux.regarder(1), 'cree')) {
    throw new ErreurSyntaxique(`dans une route, on écrit « quand ${donnee} est cree : » puis, en dessous, « envoyer email … ».`, debut.ligne);
  }
  flux.avancer();
  flux.avancer();
  flux.attendre('PONCTUATION', ':', 'deux-points après « est cree »');
  const envois: EnvoiEmail[] = [];
  const creations: CreationLiee[] = [];
  const notifications: EnvoiNotification[] = [];
  chaqueLigne(flux, () => {
    if (estLeMot(flux.actuel(), 'creer')) creations.push(analyserCreationLiee(flux));
    else if (estLeMot(flux.actuel(), 'envoyer') && estLeMot(flux.regarder(1), 'notification')) notifications.push(analyserEnvoiNotification(flux));
    else envois.push(analyserEnvoiEmail(flux));
  });
  return { donnee, envois, creations, ...(notifications.length ? { notifications } : {}), ligne: debut.ligne };
}

/** « creer suivi avec etape "en_attente" et total commande.total dans commande.suivi ». */
export function analyserCreationLiee(flux: FluxTokens): CreationLiee {
  const exemple = 'creer suivi avec etape "en_attente" et total commande.total dans commande.suivi';
  const debut = flux.avancer();
  const donnee = nomDansRegle(flux, exemple);
  flux.attendre('MOT_CLE', 'avec', `« avec » suivi des valeurs de la fiche : ${exemple}`);
  const valeurs: CreationLiee['valeurs'] = [];
  const champDeFiche = () => {
    const nom = flux.actuel();
    if (!estMot(nom) || flux.regarder(1).valeur !== '.' || !estMot(flux.regarder(2))) throw new ErreurSyntaxique(`on écrit par exemple : ${exemple}`, nom.ligne);
    flux.avancer();
    flux.avancer();
    return { genre: 'champ' as const, donnee: nom.valeur, champ: flux.avancer().valeur };
  };
  do {
    const champ = nomDansRegle(flux, exemple);
    valeurs.push({ champ, valeur: valeurFixe(flux) ?? champDeFiche() });
  } while (flux.accepter('MOT_CLE', 'et'));
  if (!estLeMot(flux.actuel(), 'dans')) return { donnee, valeurs, ligne: debut.ligne };
  flux.avancer();
  const { donnee: parent, champ } = champDeFiche();
  return { donnee, valeurs, dans: { donnee: parent, champ }, ligne: debut.ligne };
}

/** « envoyer email aux admins avec sujet "…" et texte "…" » ; le destinataire peut être "a@b.c" ou commande.email. */
/** « envoyer notification aux gerant et vendeur avec titre "…" et texte "…" », ou « a commande.compte ». */
export function analyserEnvoiNotification(flux: FluxTokens): EnvoiNotification {
  const exemple = 'envoyer notification aux gerant avec titre "Nouveau" et texte "{commande.total}"';
  const debut = flux.avancer();
  flux.avancer();
  let destinataire: EnvoiNotification['destinataire'];
  if (estMot(flux.actuel()) && flux.regarder(1).valeur === '.' && estMot(flux.regarder(2))) {
    const donnee = flux.avancer().valeur;
    flux.avancer();
    destinataire = { genre: 'compte', donnee, champ: flux.avancer().valeur };
  } else {
    const roles: string[] = [];
    while (!estLeMot(flux.actuel(), 'avec') && !flux.verifier('FIN_LIGNE') && !flux.estFini()) {
      const mot = motDe(flux.avancer());
      if (mot !== 'et' && mot !== ',' && mot !== 'aux') roles.push(mot);
    }
    if (roles.length === 0) throw new ErreurSyntaxique(`à qui part cette notification ? ${exemple}`, debut.ligne);
    destinataire = { genre: 'roles', roles };
  }
  const lireTexte = (mot: string) => {
    const jeton = flux.actuel();
    if (!estLeMot(jeton, mot) || flux.regarder(1).type !== 'CHAINE') throw new ErreurSyntaxique(`il manque ${mot} "…" dans cette notification : ${exemple}`, jeton.ligne);
    flux.avancer();
    const chaine = flux.avancer();
    return chaine.parties ?? [{ type: 'texte' as const, valeur: chaine.valeur }];
  };
  flux.attendre('MOT_CLE', 'avec', `« avec titre "…" et texte "…" » après le destinataire : ${exemple}`);
  const titre = lireTexte('titre');
  flux.attendre('MOT_CLE', 'et', `« et texte "…" » après le titre : ${exemple}`);
  return { destinataire, titre, texte: lireTexte('texte'), ligne: debut.ligne };
}

export function analyserEnvoiEmail(flux: FluxTokens): EnvoiEmail {
  const exemple = 'envoyer email aux admins avec sujet "Nouveau message" et texte "{message.texte}"';
  const debut = flux.actuel();
  if (!estLeMot(debut, 'envoyer') || !estLeMot(flux.regarder(1), 'email')) {
    throw new ErreurSyntaxique(`sous « quand … est cree : », on écrit : ${exemple}`, debut.ligne);
  }
  flux.avancer();
  flux.avancer();
  const cible = flux.actuel();
  let destinataire: EnvoiEmail['destinataire'];
  if (estLeMot(cible, 'admins')) {
    flux.avancer();
    destinataire = { genre: 'admins' };
  } else if (cible.type === 'CHAINE') {
    flux.avancer();
    destinataire = { genre: 'adresse', adresse: cible.valeur };
  } else if (estMot(cible) && flux.regarder(1).valeur === '.' && estMot(flux.regarder(2))) {
    flux.avancer();
    flux.avancer();
    destinataire = { genre: 'champ', donnee: cible.valeur, champ: flux.avancer().valeur };
  } else {
    throw new ErreurSyntaxique(`à qui part cet e-mail ? « aux admins », une adresse entre guillemets, ou le champ d'une fiche (a commande.email). Par exemple : ${exemple}`, cible.ligne);
  }
  const lireTexte = (mot: string) => {
    const jeton = flux.actuel();
    if (!estLeMot(jeton, mot) || flux.regarder(1).type !== 'CHAINE') throw new ErreurSyntaxique(`il manque ${mot} "…" dans cet e-mail : ${exemple}`, jeton.ligne);
    flux.avancer();
    const chaine = flux.avancer();
    return chaine.parties ?? [{ type: 'texte' as const, valeur: chaine.valeur }];
  };
  flux.attendre('MOT_CLE', 'avec', `« avec sujet "…" et texte "…" » après le destinataire : ${exemple}`);
  const sujet = lireTexte('sujet');
  flux.attendre('MOT_CLE', 'et', `« et texte "…" » après le sujet : ${exemple}`);
  return { destinataire, sujet, texte: lireTexte('texte'), ligne: debut.ligne };
}

/** « tout le monde peut lire produit », « seul admin peut modifier produit ». */
/** La ligne dit-elle qui peut interroger l'IA ? */
/** « avec montant = 10 et raison = champ "Raison" ». */
function lireAvec(flux: FluxTokens): { champ: string; valeur: Expression }[] {
  const liste: { champ: string; valeur: Expression }[] = [];
  flux.avancer();
  do {
    const champ = flux.attendreNom('le nom de la valeur').nom;
    flux.attendre('PONCTUATION', '=', `« = » suivi de la valeur de « ${champ} »`);
    liste.push({ champ, valeur: analyserOperande(flux) });
  } while (flux.accepter('MOT_CLE', 'et'));
  return liste;
}

function estDroitIa(flux: FluxTokens): boolean {
  for (let i = 0; i < 12 && flux.regarder(i).type !== 'FIN_LIGNE'; i++) {
    if (estLeMot(flux.regarder(i), 'peut') || estLeMot(flux.regarder(i), 'peuvent')) return estLeMot(flux.regarder(i + 1), 'demander');
  }
  return false;
}

function analyserRegle(flux: FluxTokens, avecRoles = false): Regle | ActionServeur | ResumeServeur | DroitIa {
  const debut = flux.actuel();
  const mots: string[] = [];
  while (!estLeMot(flux.actuel(), 'peut') && !estLeMot(flux.actuel(), 'peuvent') && !flux.verifier('FIN_LIGNE') && !flux.estFini()) {
    mots.push(motDe(flux.avancer()));
  }
  // « seul directeur peut … », « seuls directeur et enseignant peuvent … » : des rôles déclarés dans le serveur. Un admin passe toujours.
  const seul = mots[0] === 'seul' || mots[0] === 'seuls';
  const nommes = mots.slice(seul ? 1 : 0).filter((m) => m !== 'et' && m !== ',' && m !== 'admin');
  const qui: Qui | undefined = (
    { 'tout monde': 'tout_le_monde', connecte: 'connecte', 'utilisateur connecte': 'connecte', 'seul admin': 'admin', admin: 'admin' } as Record<string, Qui>
  )[mots.join(' ')] ?? (nommes.length > 0 && (seul || avecRoles) ? (`role:${nommes.join(',')}` as Qui) : undefined);
  if (!qui) {
    throw new ErreurSyntaxique(
      `qui peut agir ? Écrivez « tout le monde », « connecte » ou « seul admin », puis « peut … »`,
      debut.ligne,
    );
  }
  if (estLeMot(flux.actuel(), 'peuvent')) flux.avancer();
  else flux.attendre(flux.actuel().type === 'MOT_CLE' ? 'MOT_CLE' : 'IDENTIFIANT', 'peut', '« peut » suivi d\'une action');

  if (estLeMot(flux.actuel(), 'faire')) return analyserActionServeur(flux, qui, debut.ligne);
  if (estLeMot(flux.actuel(), 'lire') && flux.regarder(1).type === 'CHAINE') return analyserResume(flux, qui, debut.ligne);
  if (estLeMot(flux.actuel(), 'demander')) {
    flux.avancer();
    if (!estLeMot(flux.actuel(), 'ia')) throw new ErreurSyntaxique('on écrit : connecte peut demander a ia', debut.ligne);
    flux.avancer();
    return { type: 'DroitIa', qui, ligne: debut.ligne };
  }

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

  // « connecte peut lire son compte » : une liste d'une seule fiche, celle de la personne.
  if (estLeMot(flux.actuel(), 'son') && estLeMot(flux.regarder(1), 'compte')) {
    if (actions.some((a) => a !== 'lire')) throw new ErreurSyntaxique('« son compte » ne se lit que : connecte peut lire son compte', debut.ligne);
    flux.avancer();
    flux.avancer();
    return { type: 'Regle', qui, actions, donnee: 'comptes', soi: true, ligne: debut.ligne };
  }
  const { nom: donnee } = flux.attendreNom('le nom de la donnée');
  if (estLeMot(flux.actuel(), 'si')) {
    flux.avancer();
    return { type: 'Regle', qui, actions, donnee, si: analyserConditionRegle(flux), ligne: debut.ligne };
  }
  // « par identifiant » : une fiche à la fois, jamais la liste.
  if (!estLeMot(flux.actuel(), 'par')) return { type: 'Regle', qui, actions, donnee, ligne: debut.ligne };
  flux.avancer();
  if (!estLeMot(flux.actuel(), 'identifiant') || actions.some((a) => a !== 'lire')) {
    throw new ErreurSyntaxique(`« par identifiant » ne vaut que pour la lecture : ${mots.join(' ')} peut lire ${donnee} par identifiant`, debut.ligne);
  }
  flux.avancer();
  return { type: 'Regle', qui, actions, donnee, parIdentifiant: true, ligne: debut.ligne };
}

/** « facture.compte est dans utilisateur.comptes_lies », « utilisateur.id est facture.compte ». */
function analyserConditionRegle(flux: FluxTokens): ConditionRegle {
  const ligne = flux.actuel().ligne;
  const exemple = 'si facture.compte est dans utilisateur.comptes_lies';
  const operande = (): OperandeRegle => {
    const fixe = valeurFixe(flux);
    if (fixe?.genre === 'valeur') return fixe;
    const nom = flux.actuel();
    if (fixe || !estMot(nom) || flux.regarder(1).valeur !== '.' || !estMot(flux.regarder(2))) throw new ErreurSyntaxique(`on écrit par exemple : ${exemple}`, nom.ligne);
    flux.avancer();
    flux.avancer();
    const champ = flux.avancer().valeur;
    return estLeMot(nom, 'utilisateur') ? { genre: 'utilisateur', champ } : { genre: 'fiche', donnee: nom.valeur, champ };
  };
  const gauche = operande();
  if (!estLeMot(flux.actuel(), 'est')) throw new ErreurSyntaxique(`après la première valeur, écrivez « est » ou « est dans » : ${exemple}`, ligne);
  flux.avancer();
  const dans = estLeMot(flux.actuel(), 'dans');
  if (dans) flux.avancer();
  return { gauche, dans, droite: operande(), ligne };
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

/** « en reglages » à la fin de l'en-tête d'une page ou d'un formulaire. */
function lireEnReglages(flux: FluxTokens): boolean {
  if (!estLeMot(flux.actuel(), 'en') || !estLeMot(flux.regarder(1), 'reglages')) return false;
  flux.avancer();
  flux.avancer();
  return true;
}

function analyserPage(flux: FluxTokens): Page {
  const debut = flux.attendre('MOT_CLE', 'page', 'une déclaration de page');
  const nom = flux.attendre('CHAINE', undefined, 'le nom de la page entre guillemets');
  const entete = analyserEntetePage(flux);
  const { parametres, filtres } = analyserAvecPage(flux);
  const sans = analyserSansDisposition(flux);
  const reglages = lireEnReglages(flux);
  let pleineFenetre = false;
  let dessin: Page['dessin'];
  for (let i = 0; i < 2; i++) {
    if (estLeMot(flux.actuel(), 'en') && estLeMot(flux.regarder(1), 'pleine') && estLeMot(flux.regarder(2), 'fenetre')) {
      flux.avancer(); flux.avancer(); flux.avancer();
      pleineFenetre = true;
    }
    if (estLeMot(flux.actuel(), 'dessinee') && estLeMot(flux.regarder(1), 'pour')) {
      flux.avancer(); flux.avancer();
      const largeur = Number(flux.attendre('NOMBRE', undefined, 'la largeur du dessin : dessinee pour 1440 par 900').valeur);
      if (!estLeMot(flux.actuel(), 'par')) throw new ErreurSyntaxique('après la largeur, il faut « par » : dessinee pour 1440 par 900', flux.actuel().ligne);
      flux.avancer();
      const hauteur = Number(flux.attendre('NOMBRE', undefined, 'la hauteur du dessin : dessinee pour 1440 par 900').valeur);
      dessin = { largeur, hauteur };
    }
  }
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
    ...(reglages ? { reglages } : {}),
    ...(pleineFenetre ? { pleineFenetre } : {}),
    ...(dessin ? { dessin } : {}),
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
const sansGuillemets = (texte: string) => texte.replace(/"/g, '”');

/** Quelques lignes Humalis, lues comme le corps d'une page : l'équivalent simple d'un composant natif. */
function phrases(source: string, ligne: number): Instruction[] {
  const decale = source.split('\n').map((l) => `    ${l}`).join('\n');
  return analyserSyntaxe(analyserLexique(`page "x" :\n${decale}\n`).map((t) => ({ ...t, ligne }))).pages[0].corps;
}

function motAttendu(flux: FluxTokens, mot: string, exemple: string): number {
  if (!estLeMot(flux.actuel(), mot)) throw new ErreurSyntaxique(`on écrit ici : ${exemple}`, flux.actuel().ligne);
  return flux.avancer().ligne;
}

/** Chaque ligne décalée sous la ligne courante. */
function lignesDuBloc(flux: FluxTokens, lire: () => void): void {
  flux.sauterFinsDeLigne();
  if (!flux.accepter('INDENT')) return;
  flux.sauterFinsDeLigne();
  while (!flux.verifier('DEDENT') && !flux.estFini()) {
    lire();
    flux.sauterFinsDeLigne();
  }
  flux.accepter('DEDENT');
}

/** « avec icone "x" » à la fin d'une ligne. */
function lireIcone(flux: FluxTokens): string | undefined {
  if (!flux.verifier('MOT_CLE', 'avec') || !estLeMot(flux.regarder(1), 'icone')) return undefined;
  flux.avancer();
  flux.avancer();
  return flux.attendre('CHAINE', undefined, 'le nom de l’icône entre guillemets').valeur;
}

/** Un bouton et son clic : c'est ce qu'un composant natif affiche, à sa façon, sur chaque cible. */
function boutonEtClic(titre: string, icone: string | undefined, corps: Instruction[], ligne: number): Instruction[] {
  return [...phrases(`bouton "${sansGuillemets(titre)}"${icone ? ` avec icone "${icone}"` : ''}`, ligne), { type: 'Evenement', genre: 'clic', cible: sansGuillemets(titre), corps, ligne }];
}

const blocNatif = (natif: Bloc['natif'], corps: Instruction[], ligne: number, genre: GenreBloc = 'bloc', titre?: Expression): Bloc => ({ type: 'Bloc', genre, natif, styles: [], classes: [], corps, ...(titre ? { titre } : {}), ligne });

/** Les composants natifs ; undefined si la ligne n'en est pas un. Ces mots restent des noms ailleurs. */
function analyserComposantNatif(flux: FluxTokens): Instruction | undefined {
  const a = flux.actuel();
  const b = flux.regarder(1);
  const c = flux.regarder(2);
  if (estLeMot(a, 'recherche') && estLeMot(b, 'dans')) {
    const ligne = flux.avancer().ligne;
    flux.avancer();
    const variable = flux.attendreNom('la variable qui reçoit la recherche').nom;
    let indice = 'Rechercher';
    if (flux.accepter('MOT_CLE', 'avec')) {
      motAttendu(flux, 'indice', 'recherche dans q avec indice "Chercher…"');
      indice = flux.attendre('CHAINE', undefined, 'l’indice entre guillemets').valeur;
    }
    const corps = phrases(`champ "Rechercher" avec indice "${sansGuillemets(indice)}"\nquand l'utilisateur ecrit dans "Rechercher" :\n    changer ${variable} par champ "Rechercher"`, ligne);
    return blocNatif({ genre: 'recherche', variable, indice }, corps, ligne);
  }
  if (estLeMot(a, 'action') && estLeMot(b, 'en') && estLeMot(c, 'glissant')) {
    const ligne = flux.avancer().ligne;
    flux.avancer();
    flux.avancer();
    const titre = flux.attendre('CHAINE', undefined, 'le titre de l’action entre guillemets').valeur;
    const icone = lireIcone(flux);
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la ligne');
    return blocNatif({ genre: 'glisser' }, boutonEtClic(titre, icone, analyserBloc(flux), ligne), ligne);
  }
  if (estLeMot(a, 'actualiser') && estLeMot(b, 'en') && estLeMot(c, 'tirant')) {
    const ligne = flux.avancer().ligne;
    flux.avancer();
    flux.avancer();
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin de « actualiser en tirant »');
    return blocNatif({ genre: 'actualiser' }, boutonEtClic('Actualiser', 'recharger', analyserBloc(flux), ligne), ligne);
  }
  if (estLeMot(a, 'menu') && estLeMot(b, 'options') && c.valeur === ':') {
    const ligne = flux.avancer().ligne;
    flux.avancer();
    flux.avancer();
    const corps: Instruction[] = [];
    lignesDuBloc(flux, () => {
      const ici = motAttendu(flux, 'option', 'option "Copier" :');
      const titre = flux.attendre('CHAINE', undefined, 'le titre de l’option entre guillemets').valeur;
      const icone = lireIcone(flux);
      flux.attendre('PONCTUATION', ':', 'deux-points à la fin de l’option');
      corps.push(...boutonEtClic(titre, icone, analyserBloc(flux), ici));
    });
    return blocNatif({ genre: 'options' }, corps, ligne, 'deroulant', (phrases('texte "…"', ligne)[0] as Element).contenu);
  }
  if (estLeMot(a, 'etat') && estLeMot(b, 'vide') && c.type === 'CHAINE') {
    const ligne = flux.avancer().ligne;
    flux.avancer();
    const titre = flux.avancer().valeur;
    let icone: string | undefined;
    let description: string | undefined;
    if (flux.accepter('MOT_CLE', 'avec')) {
      do {
        if (estLeMot(flux.actuel(), 'icone')) {
          flux.avancer();
          icone = flux.attendre('CHAINE', undefined, 'le nom de l’icône entre guillemets').valeur;
        } else {
          motAttendu(flux, 'description', 'etat vide "Aucune commande" avec icone "boite" et description "…"');
          description = flux.attendre('CHAINE', undefined, 'la description entre guillemets').valeur;
        }
      } while (flux.accepter('MOT_CLE', 'et'));
    }
    return blocNatif({ genre: 'vide', ...(icone ? { icone } : {}) }, phrases(`soustitre "${sansGuillemets(titre)}"${description !== undefined ? `\ntexte "${sansGuillemets(description)}"` : ''}`, ligne), ligne);
  }
  if (estLeMot(a, 'barre') && estLeMot(b, 'outils')) {
    const ligne = flux.avancer().ligne;
    flux.avancer();
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin de « barre d’outils »');
    return blocNatif({ genre: 'outils' }, analyserBloc(flux), ligne, 'ligne');
  }
  if (estLeMot(a, 'groupe') && b.type === 'CHAINE') {
    const ligne = flux.avancer().ligne;
    const titre = flux.avancer().valeur;
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin du groupe');
    return blocNatif({ genre: 'groupe' }, [...phrases(`soustitre "${sansGuillemets(titre)}"`, ligne), ...analyserBloc(flux)], ligne, 'section');
  }
  if (estLeMot(a, 'table') && (b.type === 'IDENTIFIANT' || b.type === 'MOT_CLE') && c.valeur === ':') {
    const ligne = flux.avancer().ligne;
    const liste = flux.attendreNom('la liste à montrer').nom;
    flux.avancer();
    const colonnes: { titre: string; valeur: Expression }[] = [];
    lignesDuBloc(flux, () => {
      motAttendu(flux, 'colonne', 'colonne "Total" avec c.total');
      const titre = flux.attendre('CHAINE', undefined, 'le titre de la colonne entre guillemets').valeur;
      flux.attendre('MOT_CLE', 'avec', '« avec » puis la valeur de la colonne');
      colonnes.push({ titre, valeur: analyserExpression(flux) });
    });
    const premiere = colonnes[0]?.valeur as { objet?: { nom?: string }; nom?: string } | undefined;
    const variable = premiere?.objet?.nom ?? premiere?.nom;
    if (!variable) throw new ErreurSyntaxique('« table » attend des colonnes écrites sur un élément : colonne "Total" avec c.total', ligne);
    const modele = phrases('texte "x"', ligne)[0] as Element;
    const rangee = phrases(`pour chaque ${variable} dans ${liste} :\n    ligne :\n        texte "x"`, ligne)[0] as Boucle;
    (rangee.corps[0] as Bloc).corps = colonnes.map((col) => ({ ...modele, contenu: col.valeur }));
    return blocNatif({ genre: 'table', colonnes: colonnes.map((col) => col.titre) }, [rangee], ligne);
  }
  return undefined;
}

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
  const natif = analyserComposantNatif(flux);
  if (natif) return natif;

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

  // « inviter champ "Adresse" comme admin » ; « inviter(…) » reste l'appel d'une fonction de ce nom.
  if (estLeMot(flux.actuel(), 'inviter') && flux.regarder(1).valeur !== '(' && flux.regarder(1).type !== 'FIN_LIGNE') {
    return analyserInvitation(flux);
  }
  // « demander un lien de mot de passe pour champ "Email" » et « choisir le mot de passe avec champ "Nouveau" ».
  if (estLeMot(flux.actuel(), 'demander') && estLeMot(flux.regarder(1), 'lien')) return analyserDemandeLien(flux);
  if (estLeMot(flux.actuel(), 'choisir') && estLeMot(flux.regarder(1), 'mot') && estLeMot(flux.regarder(2), 'passe')) return analyserChoixMotDePasse(flux);

  // « faire "rembourser" sur c » ; « faire » seul reste un nom possible.
  if (estLeMot(flux.actuel(), 'faire') && flux.regarder(1).type === 'CHAINE') {
    const debut = flux.avancer();
    const nom = flux.avancer().valeur;
    if (!estLeMot(flux.actuel(), 'sur')) throw new ErreurSyntaxique(`on écrit : faire "${nom}" sur c`, debut.ligne);
    flux.avancer();
    const objet = analyserOperande(flux);
    return { type: 'FaireAction', nom, objet, ...(estLeMot(flux.actuel(), 'avec') ? { avec: lireAvec(flux) } : {}), ligne: debut.ligne } satisfies FaireAction;
  }

  // « changer compte de c avec … » ; « changer compte par 2 » reste une variable de ce nom.
  if (flux.verifier('MOT_CLE', 'changer') && estLeMot(flux.regarder(1), 'compte') && !estLeMot(flux.regarder(2), 'par') && flux.regarder(2).type !== 'FIN_LIGNE') {
    return analyserChangementCompte(flux);
  }

  // « changer role de c en "vendeur" » ; « changer role par 2 » reste une variable de ce nom.
  if (flux.verifier('MOT_CLE', 'changer') && estLeMot(flux.regarder(1), 'role') && !estLeMot(flux.regarder(2), 'par') && flux.regarder(2).type !== 'FIN_LIGNE') {
    return analyserChangementRole(flux);
  }

  // « changer le mot de passe avec champ "Actuel" et champ "Nouveau" » : celui du compte connecté.
  if (flux.verifier('MOT_CLE', 'changer') && estLeMot(flux.regarder(1), 'mot') && estLeMot(flux.regarder(2), 'passe')) {
    return analyserChangementMotDePasse(flux);
  }

  // « telecharger commandes en csv » : un fichier fait dans l'appareil, à partir d'une liste.
  if (estLeMot(flux.actuel(), 'telecharger') && finitParEnCsv(flux)) {
    return analyserTelechargementCsv(flux);
  }

  // « payer total pour commande » ; « payer » seul reste un nom possible.
  if (estLeMot(flux.actuel(), 'payer') && estUnNom(flux.regarder(1)) && estLeMot(flux.regarder(2), 'pour')) {
    const debut = flux.avancer();
    const champ = flux.avancer().valeur;
    flux.avancer();
    return { type: 'Paiement', champ, objet: analyserOperande(flux), ligne: debut.ligne } satisfies Paiement;
  }

  // « demander a ia "…" dans reponse » (« a » est déjà sauté par le lexer).
  if (estLeMot(flux.actuel(), 'demander') && estLeMot(flux.regarder(1), 'ia')) {
    const debut = flux.avancer();
    flux.avancer();
    const question = analyserOperande(flux);
    if (!estLeMot(flux.actuel(), 'dans')) throw new ErreurSyntaxique('on écrit : demander a ia "…" dans reponse', debut.ligne);
    flux.avancer();
    return { type: 'DemandeIa', question, variable: flux.attendreNom('la variable qui reçoit la réponse').nom, ligne: debut.ligne } satisfies DemandeIa;
  }

  // Les fonctions de l'appareil : ces mots restent des noms ailleurs.
  if (estLeMot(flux.actuel(), 'photo') && estLeMot(flux.regarder(1), 'dans')) {
    const debut = flux.avancer();
    flux.avancer();
    return { type: 'PrisePhoto', variable: flux.attendreNom('la variable qui reçoit la photo').nom, ligne: debut.ligne };
  }
  if (estLeMot(flux.actuel(), 'position') && estLeMot(flux.regarder(1), 'dans')) {
    const debut = flux.avancer();
    flux.avancer();
    return { type: 'Localisation', variable: flux.attendreNom('la variable qui reçoit la position').nom, ligne: debut.ligne };
  }
  // « en arriere plan : » : ce que l'application fait quand le système la réveille.
  if (estLeMot(flux.actuel(), 'en') && estLeMot(flux.regarder(1), 'arriere') && estLeMot(flux.regarder(2), 'plan')) {
    const debut = flux.avancer();
    flux.avancer();
    flux.avancer();
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin de « en arriere plan »');
    return { type: 'Evenement', genre: 'arrierePlan', corps: analyserBloc(flux), ligne: debut.ligne };
  }
  if (estLeMot(flux.actuel(), 'scanner') && estLeMot(flux.regarder(1), 'code') && estLeMot(flux.regarder(2), 'dans')) {
    const debut = flux.avancer();
    flux.avancer();
    flux.avancer();
    return { type: 'ScanCode', variable: flux.attendreNom('la variable qui reçoit le code').nom, ligne: debut.ligne };
  }
  if (estLeMot(flux.actuel(), 'verifier') && estLeMot(flux.regarder(1), 'identite')) {
    const debut = flux.avancer();
    flux.avancer();
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin de « verifier identite », puis ce qu’il faut faire si la personne est reconnue');
    const alors = analyserBloc(flux);
    let sinon: Instruction[] = [];
    flux.sauterFinsDeLigne();
    if (flux.accepter('MOT_CLE', 'sinon')) {
      flux.attendre('PONCTUATION', ':', 'deux-points après « sinon »');
      sinon = analyserBloc(flux);
    }
    return { type: 'VerificationIdentite', alors, sinon, ligne: debut.ligne };
  }
  if (estLeMot(flux.actuel(), 'vibrer') && flux.regarder(1).type === 'FIN_LIGNE') return { type: 'Vibration', ligne: flux.avancer().ligne };

  // « activer notifications » ; « activer » seul reste un nom possible.
  if (estLeMot(flux.actuel(), 'activer') && estLeMot(flux.regarder(1), 'notifications')) {
    const debut = flux.avancer();
    flux.avancer();
    return { type: 'ActivationNotifications', ligne: debut.ligne };
  }

  // « telecharger document "facture" de c » : le PDF écrit dans le serveur.
  if (estLeMot(flux.actuel(), 'telecharger') && estLeMot(flux.regarder(1), 'document') && flux.regarder(2).type === 'CHAINE') {
    const debut = flux.avancer();
    flux.avancer();
    const nom = flux.avancer().valeur;
    return { type: 'TelechargementDocument', nom, objet: analyserOperande(flux), ligne: debut.ligne } satisfies TelechargementDocument;
  }

  // « telecharger bon de commande de c » : le PDF d'une fiche du serveur.
  if (estLeMot(flux.actuel(), 'telecharger') && estLeMot(flux.regarder(1), 'bon') && estUnNom(flux.regarder(2))) {
    return analyserTelechargementBon(flux);
  }

  // « vider champ "Message" » : remet un champ à vide, après un envoi par exemple.
  if (estLeMot(flux.actuel(), 'vider') && estLeMot(flux.regarder(1), 'champ') && flux.regarder(2).type === 'CHAINE') {
    const debut = flux.avancer();
    return { type: 'Action', action: 'viderChamp', arguments: [analyserOperande(flux)], ligne: debut.ligne };
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

  // « sur application : », « sur site : » : un bloc réservé à une plateforme.
  if (estSurPlateforme(flux)) return analyserSurPlateforme(flux, { corps: analyserBloc });

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

  // « signature dans trace » : la personne signe à l'écran, la variable reçoit l'image.
  if (estLeMot(flux.actuel(), 'signature') && estLeMot(flux.regarder(1), 'dans')) {
    const debut = flux.avancer();
    flux.avancer();
    const variable = flux.attendreNom('la variable qui reçoit la signature');
    return { type: 'Element', element: 'signature', contenu: { type: 'Reference', nom: variable.nom, ligne: debut.ligne }, styles: [], classes: [], ligne: debut.ligne };
  }

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
    } else if (mot === 'hors' && estLeMot(flux.actuel(), 'ligne')) {
      flux.avancer();
      options.horsLigne = true;
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
  const classes: string[] = [];
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      if (estStylePlateforme(flux)) {
        classes.push(...lireStylePlateforme(flux));
        continue;
      }
      flux.attendre('MOT_CLE', 'style', '« style » après « avec » : un formulaire n\'a pas d\'autre option');
      classes.push(...flux.attendre('CHAINE', undefined, 'le nom de la classe CSS entre guillemets').valeur.split(/\s+/).filter(Boolean));
    } while (flux.accepter('MOT_CLE', 'et'));
  }
  const reglages = lireEnReglages(flux);
  flux.attendre('PONCTUATION', ':', 'deux-points après le nom du formulaire');
  return { type: 'Formulaire', nom, ...(reglages ? { reglages } : {}), ...(classes.length > 0 ? { classes } : {}), corps: analyserBloc(flux), ligne: debut.ligne };
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
    titre.push({ type: 'Element', element: 'titre', contenu: analyserValeur(flux), styles: [], classes: [], deSection: true, ligne: debut.ligne });
  } else if (GENRES_AVEC_TITRE.includes(genre) && flux.verifier('CHAINE')) {
    titreBloc = analyserValeur(flux);
  }
  const styles: Style[] = [];
  const classes: string[] = [];
  let ancre: string | undefined;
  let nom: string | undefined;
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      if (estStylePlateforme(flux)) {
        classes.push(...lireStylePlateforme(flux));
      } else if (flux.verifier('MOT_CLE', 'style')) {
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
  // « bloc avec style "tuile" » sans deux-points : une forme purement visuelle, sans contenu.
  const sansContenu = ['bloc', 'ligne', 'colonne'].includes(genre) && (classes.length > 0 || styles.length > 0) && (flux.estFini() || (flux.verifier('FIN_LIGNE') && flux.regarder(1).type !== 'INDENT'));
  if (!sansContenu) flux.attendre('PONCTUATION', ':', `deux-points à la fin de la ligne « ${genre} », puis son contenu en dessous, décalé`);
  return { type: 'Bloc', genre, styles, classes, ...(titreBloc ? { titre: titreBloc } : {}), ...(ancre !== undefined ? { ancre } : {}), ...(nom !== undefined ? { nom } : {}), ...(repliable ? { repliable } : {}), ...(vertical ? { vertical } : {}), corps: [...titre, ...(sansContenu ? [] : analyserBloc(flux))], ligne: debut.ligne };
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
  let cibleParties: PartieChaine[] | undefined;
  if (flux.accepter('MOT_CLE', 'vers')) {
    const jeton = flux.attendre('CHAINE', undefined, 'le nom de la page cible');
    // Une adresse ne garde pas de vrai retour à la ligne : il s'y écrit %0A.
    cible = jeton.valeur.replace(/\n/g, '%0A');
    if (jeton.parties?.some((p) => p.type !== 'texte')) cibleParties = jeton.parties.map((p) => (p.type === 'texte' ? { ...p, valeur: p.valeur.replace(/\n/g, '%0A') } : p));
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
      if (estStylePlateforme(flux)) {
        classes.push(...lireStylePlateforme(flux));
      } else if (cible !== undefined && estArgumentPage(flux)) {
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
        // « avec indice "{reglage.boutique}" » : la valeur actuelle écrite en gris dans le champ.
        else if (texteIndice.parties?.some((p) => p.type === 'variable')) saisie.indiceTexte = { type: 'Chaine', parties: texteIndice.parties, ligne: texteIndice.ligne };
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
    ...(cibleParties ? { cibleParties } : {}),
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
  let parId = false;
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      // « avec id c.telephone » : un seul élément, lu par cette valeur. « avec id » seul reste le nom d'une variable.
      if (donnees.length === 0 && motDe(flux.actuel()) === 'id' && commenceUneValeur(flux.regarder(1))) {
        flux.avancer();
        parId = true;
        cles.push(undefined);
        donnees.push(analyserOperande(flux));
        break;
      }
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
  // « … dans commandes en direct » : la page se met à jour quand le serveur change.
  const direct = estLeMot(flux.regarder(0), 'en') && estLeMot(flux.regarder(1), 'direct');
  if (direct) {
    flux.avancer();
    flux.avancer();
  }
  const enAttente = lireHorsLigne(flux);

  return { type: 'Requete', adresse, ...clauses, donnees, ...(direct ? { direct } : {}), ...(enAttente ? { enAttente } : {}), ...(parId ? { parId } : {}), ...(cles.some((c) => c !== undefined) ? { cles } : {}), resultat, ligne };
}

/** « … hors ligne » à la fin d'un envoi : il attendra le retour du réseau. */
function lireHorsLigne(flux: FluxTokens): boolean {
  if (!estLeMot(flux.regarder(0), 'hors') || !estLeMot(flux.regarder(1), 'ligne')) return false;
  flux.avancer();
  flux.avancer();
  return true;
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
  if (suppression) return { type: 'Suppression', objet, adresse, ...(source !== undefined ? { source } : {}), ...(lireHorsLigne(flux) ? { enAttente: true } : {}), ligne: debut.ligne };

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
  return { type: 'Modification', objet, adresse, ...(source !== undefined ? { source } : {}), changements, ...(lireHorsLigne(flux) ? { enAttente: true } : {}), ligne: debut.ligne };
}

/** « se connecter avec champ "email" et champ "mot de passe" » : l'email, puis le mot de passe. */
function analyserConnexion(flux: FluxTokens): Connexion | ConnexionGoogle | ConnexionApple {
  const debut = flux.avancer();
  flux.attendre('MOT_CLE', 'avec', '« avec champ "email" et champ "mot de passe" » (ou « avec google ») après « se connecter »');
  // « se connecter avec google » : la fenêtre de Google.
  if (motDe(flux.actuel()) === 'google') {
    flux.avancer();
    return { type: 'ConnexionGoogle', ligne: debut.ligne };
  }
  // « se connecter avec apple » : la fenêtre d'Apple.
  if (motDe(flux.actuel()) === 'apple') {
    flux.avancer();
    return { type: 'ConnexionApple', ligne: debut.ligne };
  }
  const email = analyserOperande(flux);
  flux.attendre('MOT_CLE', 'et', '« et » suivi du champ du mot de passe');
  const motDePasse = analyserOperande(flux);
  return { type: 'Connexion', email, motDePasse, ligne: debut.ligne };
}

/** « inviter champ "Adresse" » : un simple compte ; « comme admin » : un administrateur. */
function analyserInvitation(flux: FluxTokens): Invitation {
  const debut = flux.avancer();
  const email = analyserOperande(flux);
  // « dans boutique b », après le rôle : le groupe du nouveau compte.
  const groupe = () => {
    const lu: Pick<Invitation, 'groupe' | 'champs'> = {};
    if (estLeMot(flux.actuel(), 'dans')) {
      flux.avancer();
      const champ = flux.attendreNom('le groupe : inviter champ "Adresse" comme vendeur dans boutique b').nom;
      lu.groupe = { champ, valeur: analyserOperande(flux) };
    }
    if (estLeMot(flux.actuel(), 'avec')) lu.champs = lireAvec(flux);
    return lu;
  };
  if (!estLeMot(flux.actuel(), 'comme')) return { type: 'Invitation', email, role: 'membre', ...groupe(), ligne: debut.ligne };
  flux.avancer();
  // « comme directeur » : un rôle déclaré dans le serveur (vérifié par l'analyse).
  if (flux.actuel().type === 'IDENTIFIANT' && !estLeMot(flux.actuel(), 'admin')) {
    const role = motDe(flux.avancer());
    return { type: 'Invitation', email, role, ...groupe(), ligne: debut.ligne };
  }
  if (!estLeMot(flux.actuel(), 'admin')) throw new ErreurSyntaxique('après « comme », écrivez « admin » ; sans « comme », la personne invitée est un simple compte connecté.', debut.ligne);
  flux.avancer();
  return { type: 'Invitation', email, role: 'admin', ...groupe(), ligne: debut.ligne };
}

/** « changer compte de c avec telephone = champ "Tél" » (« de » est déjà sauté). */
function analyserChangementCompte(flux: FluxTokens): ChangementCompte {
  const debut = flux.avancer();
  flux.avancer();
  const cible = analyserOperande(flux);
  if (!estLeMot(flux.actuel(), 'avec')) throw new ErreurSyntaxique('on écrit : changer compte de c avec telephone = champ "Téléphone"', debut.ligne);
  return { type: 'ChangementCompte', cible, champs: lireAvec(flux), ligne: debut.ligne };
}

/** « changer role de c en "vendeur" » (« de » est déjà sauté). */
function analyserChangementRole(flux: FluxTokens): ChangementRole {
  const debut = flux.avancer();
  flux.avancer();
  const cible = analyserOperande(flux);
  if (!estLeMot(flux.actuel(), 'en')) throw new ErreurSyntaxique('on écrit : changer role de c en "vendeur"', debut.ligne);
  flux.avancer();
  return { type: 'ChangementRole', cible, role: analyserOperande(flux), ligne: debut.ligne };
}

/** « demander un lien de mot de passe pour champ "Email" » : « un », « de » et « le » sont déjà sautés. */
function analyserDemandeLien(flux: FluxTokens): DemandeLienMotDePasse {
  const debut = flux.avancer();
  flux.avancer();
  if (!estLeMot(flux.actuel(), 'mot') || !estLeMot(flux.regarder(1), 'passe') || !estLeMot(flux.regarder(2), 'pour')) {
    throw new ErreurSyntaxique('on écrit : demander un lien de mot de passe pour champ "Email"', debut.ligne);
  }
  flux.avancer();
  flux.avancer();
  flux.avancer();
  return { type: 'DemandeLienMotDePasse', email: analyserOperande(flux), ligne: debut.ligne };
}

/** « choisir le mot de passe avec champ "Nouveau" ». */
function analyserChoixMotDePasse(flux: FluxTokens): ChoixMotDePasse {
  const debut = flux.avancer();
  flux.avancer();
  flux.avancer();
  flux.attendre('MOT_CLE', 'avec', '« avec champ "Nouveau mot de passe" » après « choisir le mot de passe »');
  return { type: 'ChoixMotDePasse', nouveau: analyserOperande(flux), ligne: debut.ligne };
}

/** « changer le mot de passe avec champ "Mot de passe actuel" et champ "Nouveau mot de passe" ». */
function analyserChangementMotDePasse(flux: FluxTokens): ChangementMotDePasse {
  const debut = flux.avancer();
  flux.avancer();
  flux.avancer();
  flux.attendre('MOT_CLE', 'avec', '« avec champ "Mot de passe actuel" et champ "Nouveau mot de passe" » après « changer le mot de passe »');
  const actuel = analyserOperande(flux);
  flux.attendre('MOT_CLE', 'et', '« et » suivi du champ du nouveau mot de passe');
  const nouveau = analyserOperande(flux);
  return { type: 'ChangementMotDePasse', actuel, nouveau, ligne: debut.ligne };
}

/** Vrai si la ligne finit par « en csv ». */
function finitParEnCsv(flux: FluxTokens): boolean {
  let i = 1;
  while (flux.regarder(i).type !== 'FIN_LIGNE' && flux.regarder(i).type !== 'FIN_FICHIER') i++;
  return i > 3 && estLeMot(flux.regarder(i - 1), 'csv') && estLeMot(flux.regarder(i - 2), 'en');
}

function analyserTelechargementCsv(flux: FluxTokens): TelechargementCsv {
  const debut = flux.avancer();
  const liste = analyserExpression(flux);
  flux.avancer();
  flux.avancer();
  return { type: 'TelechargementCsv', liste, ligne: debut.ligne };
}

/** « telecharger bon de commande de c » : « de » est un petit mot sauté, comme ailleurs. */
function analyserTelechargementBon(flux: FluxTokens): TelechargementBon {
  const debut = flux.avancer();
  flux.avancer();
  const { nom: donnee } = flux.attendreNom('le nom de la donnée');
  return { type: 'TelechargementBon', donnee, objet: analyserOperande(flux), ligne: debut.ligne };
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

/** Vrai si un nom (« prix », « p.prix »), `decalage` plus loin, est suivi d'une comparaison. */
function lectureComparee(flux: FluxTokens, decalage: number): boolean {
  if (estLeMot(flux.regarder(decalage), 'non')) return true;
  let suite = decalage + 1;
  while (flux.regarder(suite).valeur === '.') suite += 2;
  const mot = flux.regarder(suite);
  return (mot.type === 'MOT_CLE' && mot.valeur === 'est') || estLeMot(mot, 'contient') || estLeMot(mot, 'commence') || estLeMot(mot, 'finit');
}

/** « a ou b et c » se lit « a ou (b et c) » : « et » lie plus fort, comme en logique. */
export function analyserTestCombine(flux: FluxTokens, continuer: () => boolean = () => true): Test {
  let test = analyserEt(flux, continuer);
  while (flux.verifier('MOT_CLE', 'ou') && continuer()) {
    const ligne = flux.avancer().ligne;
    test = { type: 'Combinaison', operateur: 'ou', gauche: test, droite: analyserEt(flux, continuer), ligne };
  }
  return test;
}

function analyserEt(flux: FluxTokens, continuer: () => boolean = () => true): Test {
  let test: Test = analyserComparaison(flux);
  while (flux.verifier('MOT_CLE', 'et') && continuer()) {
    const ligne = flux.avancer().ligne;
    test = { type: 'Combinaison', operateur: 'et', gauche: test, droite: analyserComparaison(flux), ligne };
  }
  return test;
}

function analyserComparaison(flux: FluxTokens): Comparaison {
  // « si non actif : » : le contraire d'une valeur ; « si non prix est egal a 1 » : d'une comparaison.
  if (estLeMot(flux.actuel(), 'non')) {
    flux.avancer();
    if (lectureComparee(flux, 0)) return nier(analyserComparaison(flux));
    const gauche = analyserOperande(flux);
    return { type: 'Comparaison', gauche, operateur: 'faux', ligne: gauche.ligne };
  }
  // « utilisateur est connecte », « utilisateur est admin » : l'état de la
  // session, vrai ou faux. Une variable « utilisateur » se compare toujours.
  const etat = flux.regarder(2);
  if (
    estLeMot(flux.actuel(), 'utilisateur') &&
    flux.regarder(1).type === 'MOT_CLE' &&
    flux.regarder(1).valeur === 'est' &&
    (etat.type === 'IDENTIFIANT' || estLeMot(etat, 'connecte') || estLeMot(etat, 'admin') || (estLeMot(etat, 'pas') && (flux.regarder(3).type === 'IDENTIFIANT' || estLeMot(flux.regarder(3), 'connecte') || estLeMot(flux.regarder(3), 'admin'))))
  ) {
    // « utilisateur n'est pas connecte » : le contraire.
    const nie = estLeMot(etat, 'pas');
    const debut = flux.avancer();
    flux.avancer();
    if (nie) flux.avancer();
    const lu = flux.avancer();
    // « utilisateur est directeur » : un rôle déclaré dans le serveur (vérifié par l'analyse).
    const nomme = motDe(lu);
    const gauche: Expression = { type: 'EtatUtilisateur', etat: nomme === 'connecte' || nomme === 'admin' ? nomme : `role:${nomme}`, ligne: debut.ligne };
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
  // « avec deplacement » : chaque élément peut être pris et déplacé. « avec animation » : les lignes glissent quand la liste change.
  let deplacement = false;
  let animation = false;
  if (flux.verifier('MOT_CLE', 'avec') && (estLeMot(flux.regarder(1), 'deplacement') || estLeMot(flux.regarder(1), 'animation'))) {
    flux.avancer();
    for (;;) {
      if (estLeMot(flux.regarder(0), 'deplacement')) deplacement = true;
      else if (estLeMot(flux.regarder(0), 'animation')) animation = true;
      else break;
      flux.avancer();
      if (!flux.verifier('MOT_CLE', 'et')) break;
      flux.avancer();
    }
  }
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la boucle');
  const corps = analyserBloc(flux);

  return {
    type: 'Boucle',
    variable,
    liste,
    ...(deplacement ? { deplacement } : {}),
    ...(animation ? { animation } : {}),
    corps,
    ligne: debut.ligne,
  };
}

/** Un calcul : des termes séparés par + ou -, de gauche à droite. */
export function analyserExpression(flux: FluxTokens): Expression {
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

  // « champ "Confirme" » partout où une valeur est attendue : à droite d'une comparaison,
  // dans « avec telephone = champ "Téléphone" », dans un calcul.
  if (flux.verifier('MOT_CLE', 'champ') && flux.regarder(1).type === 'CHAINE') {
    flux.avancer();
    const nom = flux.attendre('CHAINE', undefined, 'le nom du champ entre guillemets');
    return { type: 'Champ', nom: nom.valeur, ligne: token.ligne };
  }

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
  // « arrondi de x », « arrondi de x a 2 chiffres » (« a » est un petit mot écarté), « arrondi de (a - b) ».
  const apresArrondi = flux.regarder(1);
  if (estLeMot(token, 'arrondi') && (commenceUneValeur(apresArrondi) || (apresArrondi.type === 'PONCTUATION' && apresArrondi.valeur === '(' && flux.liaisonA(1)?.valeur === 'de'))) {
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
  if (estLeMot(token, 'trier') && (commenceUneValeur(flux.regarder(1)) || parentheseDetachee(flux))) {
    flux.avancer();
    const liste = flux.verifier('PONCTUATION', '(') ? analyserFacteurSeul(flux) : analyserValeur(flux);
    const champ = flux.accepter('MOT_CLE', 'par') ? flux.attendreNom('le champ selon lequel trier').nom : undefined;
    const decroissant = estLeMot(flux.actuel(), 'decroissant');
    if (decroissant) flux.avancer();
    return { type: 'Tri', liste, ...(champ !== undefined ? { champ } : {}), decroissant, ligne: token.ligne };
  }
  if (estLeMot(token, 'grouper') && (commenceUneValeur(flux.regarder(1)) || parentheseDetachee(flux))) {
    flux.avancer();
    const liste = flux.verifier('PONCTUATION', '(') ? analyserFacteurSeul(flux) : analyserValeur(flux);
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
    // Le « et » ou le « ou » restent au filtre seulement si une comparaison les suit : « fiche avec l liste dont a est vrai et prix 3 ».
    valeur = { type: 'Filtre', liste: valeur, test: analyserTestCombine(flux, () => lectureComparee(flux, 1)), ligne: token.ligne };
  }
  return valeur;
}

/** « trier (…) » : une parenthèse séparée du mot, alors que « trier(…) » reste l'appel d'une fonction. */
function parentheseDetachee(flux: FluxTokens): boolean {
  const mot = flux.actuel();
  const suite = flux.regarder(1);
  return suite.type === 'PONCTUATION' && suite.valeur === '(' && suite.ligne === mot.ligne && suite.colonne > mot.colonne + (mot.original ?? mot.valeur).length;
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

/** Le contenu d'un « {…} » qui n'est pas un simple nom : « {nombre de panier} », « {l.prix * l.quantite} ». */
export function lireExpressionDuTexte(source: string, ligne: number): Expression {
  const flux = new FluxTokens(analyserLexique(source).map((t) => ({ ...t, ligne })));
  const expression = analyserExpression(flux);
  flux.sauterFinsDeLigne();
  if (!flux.estFini()) throw new ErreurSyntaxique(`« ${flux.actuel().valeur} » ne va pas dans ce calcul`, ligne);
  return expression;
}

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
