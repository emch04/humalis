import { ligneLocale } from '../fichiers.js';
import { simplifier } from '../analyse/elements.js';
import type { Test as TestAst,
  Programme,
  Page,
  Instruction,
  Expression,
  Comparaison,
  Element,
  GenreEvenement,
  DeclarationVariable,
  Duree,
  Serveur,
  Source,
  Style,
} from '../parser/ast.js';
import { normaliser } from '../lexer/motsCles.js';
import { chercherIcone } from '../vocabulaire/icones.js';
import type { ResultatAnalyse } from '../analyse/analyse.js';
import { INCONNU, NOMBRE, BOOLEEN, type TypeValeur } from '../analyse/types.js';
import { optionCanonique } from '../analyse/styles.js';
import { droitsDeRoute } from '../analyse/serveur.js';
import { encreSur } from '../analyse/couleurs.js';
import { lireCible } from '../analyse/navigation.js';
import { imageDe, REGLAGES_IMAGE, choixFichierDe } from './medias.js';
import { graphiqueDe } from './graphique.js';
import { messageEnLangues } from '../i18n/messages.js';
import type { PartieChaine } from '../lexer/types.js';
import type { LitteralChaine } from '../parser/ast.js';
import { texteSource } from '../parser/langues.js';
import { langueDuMot } from '../i18n/langues.js';
import type { TexteEnLangues, PartiesTexte, Reglages, GenreWidget, DispositionRI, ThemeRI, ServeurRI, SourceRI, Option, Etat, Application, Ecran, NoeudVue, Gestionnaire, Action, Valeur, Test, Saisie } from './types.js';
import { lireTouches } from '../analyse/interactions.js';
import { MILLISECONDES } from '../parser/interactions.js';

/** La cible d'un lien dans la RI : la page, l'ancre visée, ou l'adresse externe. */
function cibleDe(cible: string | undefined): { cible?: string; versAncre?: string; externe?: string } {
  if (cible === undefined) return {};
  const lue = lireCible(cible);
  if (lue.externe) return { externe: cible.trim() };
  return {
    ...(lue.page !== undefined && lue.page !== '' ? { cible: lue.page } : {}),
    ...(lue.ancre !== undefined ? { versAncre: lue.ancre } : {}),
  };
}

const DECLENCHEURS: Record<GenreEvenement, Gestionnaire['declencheur']> = {
  clic: 'clic',
  survol: 'survol',
  chargement: 'chargement',
  soumission: 'soumission',
  touche: 'touche',
  saisie: 'saisie',
  pauseSaisie: 'pauseSaisie',
  bas: 'bas',
  ordre: 'ordre',
};

/** Les touches sous leur forme canonique (l'analyse a déjà refusé celles qui n'existent pas). */
const touchesDe = (texte: string) => {
  const lu = lireTouches(texte);
  return 'touches' in lu ? lu.touches : texte;
};

/**
 * Construit la RI d'un programme sans erreur d'analyse. L'analyse a déjà
 * résolu les éléments visés et les types : on ne fait ici que traduire.
 */
export function construireRepresentation(
  programme: Programme,
  analyse: ResultatAnalyse,
): Application {
  return {
    ecrans: programme.pages.map((page) => new Construction(page, analyse).ecran()),
    css: programme.styles.map((b) => b.css),
    fichiersStyle: programme.fichiersStyle.map((f) => ({ chemin: f.chemin, ligne: f.ligne })),
    partages: programme.partages.map((d) => etatDe(d, analyse)),
    serveurs: programme.serveurs.map(serveurRI),
    sources: programme.sources.map(sourceRI),
    ...(programme.theme ? { theme: themeRI(programme.theme) } : {}),
    ...(analyse.langues.langues.length > 1 ? { langues: analyse.langues.langues.map((l) => ({ code: l.code, nom: l.nomPropre })) } : {}),
    ...(programme.site
      ? {
          site: {
            ...(programme.site.nom !== undefined ? { nom: programme.site.nom } : {}),
            ...(programme.site.textes?.nom && textesEnLangues(programme.site.textes.nom, analyse) ? { nomLangues: textesEnLangues(programme.site.textes.nom, analyse)! } : {}),
            ...(programme.site.description !== undefined ? { description: programme.site.description } : {}),
            ...(programme.site.textes?.description && textesEnLangues(programme.site.textes.description, analyse) ? { descriptionLangues: textesEnLangues(programme.site.textes.description, analyse)! } : {}),
            ...(programme.site.image !== undefined ? { image: programme.site.image } : {}),
            ...(programme.site.logo !== undefined ? { logo: programme.site.logo } : {}),
            ...(programme.site.adresse !== undefined ? { adresse: programme.site.adresse } : {}),
            indexation: programme.site.indexation,
            ligne: programme.site.ligne,
          },
        }
      : {}),
    ...(programme.entete || programme.pied
      ? {
          disposition: {
            ...(programme.entete ? { entete: dispositionRI(programme.entete, analyse) } : {}),
            ...(programme.pied ? { pied: dispositionRI(programme.pied, analyse) } : {}),
          },
        }
      : {}),
    composantsReact: programme.composantsReact.map((c) => ({ nom: c.nom, chemin: c.chemin, ligne: c.ligne })),
    fonctions: [...analyse.fonctions.values()].map(({ definition, retour, appels }) => ({
      nom: definition.nom,
      parametres: definition.parametres.map((p, i) => ({ nom: p.nom, type: typeParametre(appels.map((a) => a[i])) })),
      retour,
      corps: new Construction(
        { type: 'Page', nom: `fonction ${definition.nom}`, parametres: [], corps: [], ligne: definition.ligne },
        analyse,
      ).actionsDe(definition.corps),
      ligne: definition.ligne,
    })),
    composants: programme.composants.map((definition) => ({
      ...new Construction(analyse.pagesComposants.get(definition)!, analyse).ecran(),
      parametres: definition.parametres.map((p) => ({
        nom: p.nom,
        type: typeParametre(analyse.typesParametres.get(`${definition.nom}.${p.nom}`) ?? []),
      })),
    })),
  };
}

function sourceRI(source: Source): SourceRI {
  return {
    nom: source.nom,
    adresse: source.adresse ?? '',
    session: source.session,
    // Une source à session suit l'enveloppe des packs Astratra.
    enveloppe: source.enveloppe ?? (source.session ? 'data' : undefined),
    erreurDans: source.erreurDans ?? (source.session ? 'message' : undefined),
    entetes: source.entetes.map((e) => ({ nom: e.nom, valeur: e.valeur })),
    // Un jeton secret n'entre jamais ici : l'analyse le refuse tant que la passerelle n'existe pas.
    jetonPublic: source.jeton?.genre === 'public' ? { valeur: source.jeton.valeur, place: source.jeton.place } : undefined,
    cache: source.cache,
    essais: source.essais,
    delai: source.delai,
    donnees: source.donnees.map((d) => ({ nom: d.cle ?? d.nom, champs: d.champs.map((c) => ({ nom: c.nom, type: c.type })) })),
  };
}

function dispositionRI(disposition: NonNullable<Programme['entete']>, analyse: ResultatAnalyse): DispositionRI {
  const page = analyse.pagesDispositions.get(disposition)!;
  return {
    ecran: { ...new Construction(page, analyse).ecran(), parametres: [] },
    options: disposition.styles.map((s) => {
      const option = optionCanonique(s.propriete, s.valeur, analyse.couleursTheme);
      return 'erreur' in option ? { nom: s.propriete, valeur: s.valeur } : { nom: option.propriete, valeur: option.valeur };
    }),
    classes: disposition.classes,
  };
}

function themeRI(theme: NonNullable<Programme['theme']>): ThemeRI {
  return {
    couleurs: theme.couleurs.map((c) => {
      const sombre = c.sombre ?? c.clair;
      return { nom: c.nom, clair: c.clair, sombre, encreClair: encreSur(c.clair), encreSombre: encreSur(sombre) };
    }),
    polices: theme.polices.map((p) => ({ role: p.role as ThemeRI['polices'][number]['role'], nom: p.nom, ...(p.fichier ? { fichier: p.fichier } : {}) })),
    mode: (theme.mode?.valeur ?? 'automatique') as ThemeRI['mode'],
    largeur: (theme.largeur?.valeur ?? 'normale') as ThemeRI['largeur'],
  };
}

function serveurRI(serveur: Serveur): ServeurRI {
  return {
    nom: serveur.nom,
    donnees: serveur.donnees.map((d) => ({ nom: d.nom, champs: d.champs.map((c) => ({ nom: c.nom, type: c.type })) })),
    routes: serveur.routes
      .filter((r) => r.regles.length > 0)
      .map((route) => {
        const droits = droitsDeRoute(route);
        return { adresse: route.adresse, donnee: route.regles[0].donnee, droits, ligne: route.ligne };
      }),
  };
}

/** Le type d'un paramètre : celui de tous ses usages s'ils sont d'accord, sinon inconnu. */
function typeParametre(types: TypeValeur[]): TypeValeur {
  const connus = types.filter((t) => t.genre !== 'inconnu');
  if (connus.length === 0) return INCONNU;
  const premier = JSON.stringify(connus[0]);
  return connus.every((t) => JSON.stringify(t) === premier) ? connus[0] : INCONNU;
}

function etatDe(declaration: DeclarationVariable, analyse: ResultatAnalyse): Etat {
  const etat: Etat = {
    nom: declaration.nom,
    type: analyse.types.get(declaration) ?? INCONNU,
    initiale: traduireValeur(declaration.valeur, analyse),
    ligne: declaration.ligne,
  };
  if (declaration.options?.memorisee) etat.memorisee = true;
  if (declaration.options?.secret) etat.secret = true;
  if (analyse.facultatives.has(declaration)) etat.facultatif = true;
  if (declaration.fichierDonnees) etat.lectureSeule = true;
  return etat;
}

/** Les éléments d'écran d'une ligne. */
const WIDGETS = new Set(['icone', 'badge', 'avatar', 'progression', 'chargement', 'etoiles', 'compteur', 'qr', 'fichier', 'audio', 'selecteurLangue']);
/** Les options qui ne sont pas des styles (elles ne font pas de classe CSS). */
const REGLAGES = new Set(['icone', 'description', 'decoratif', 'photo', 'modifiable', 'ouvert', 'plusieurs', 'pourcentage', 'automatique', 'visibles', 'transcription', 'boucle']);

class Construction {
  /** Les états cachés des onglets et des blocs dépliables, ajoutés à l'état de l'écran. */
  private readonly caches: Etat[] = [];

  constructor(
    private readonly page: Page,
    private readonly analyse: ResultatAnalyse,
  ) {}

  ecran(): Ecran {
    const etat: Ecran['etat'] = [];
    const calculs: Ecran['calculs'] = [];
    const vue: NoeudVue[] = [];
    const gestionnaires: Gestionnaire[] = [];

    for (const instruction of this.page.corps) {
      if (instruction.type === 'Variable' && instruction.calcul) {
        calculs.push({
          nom: instruction.nom,
          type: this.analyse.types.get(instruction) ?? INCONNU,
          valeur: this.valeur(instruction.valeur),
          ...(this.analyse.facultatives.has(instruction) ? { facultatif: true } : {}),
        });
      } else if (instruction.type === 'Variable') {
        etat.push({ ...etatDe(instruction, this.analyse), initiale: this.valeur(instruction.valeur) });
      } else if (instruction.type === 'Evenement') {
        gestionnaires.push(this.gestionnaire(instruction));
      } else if (instruction.type === 'Minuterie') {
        // Une minuterie écrite dans la page démarre à son ouverture.
        gestionnaires.push({ declencheur: 'minuterie', cibles: [], actions: this.actions([instruction]), ligne: instruction.ligne });
      } else {
        vue.push(...this.vue([instruction], gestionnaires));
      }
    }

    return {
      nom: this.page.nom,
      etat: [...etat, ...this.caches],
      calculs,
      vue,
      gestionnaires,
      ...(this.page.parametres.length > 0 ? { parametresAdresse: this.page.parametres } : {}),
      ...(this.page.adresse !== undefined ? { adresse: this.page.adresse } : {}),
      ...(this.page.parent !== undefined ? { parent: this.page.parent } : {}),
      ...(this.page.filtres?.length ? { filtres: this.page.filtres.map((f) => ({ nom: f.nom, ...(f.nombre ? { nombre: true } : {}) })) } : {}),
      ...(this.page.reservee ? { reservee: { qui: this.page.reservee.qui, sinon: this.page.reservee.sinon ?? 'connexion' } } : {}),
      ...(this.analyse.etatsLus.get(this.page)?.size ? { etatsRequetes: [...this.analyse.etatsLus.get(this.page)!] } : {}),
      ...(this.page.sansEntete ? { sansEntete: true } : {}),
      ...(this.page.sansPied ? { sansPied: true } : {}),
      ...(this.page.apercu
        ? {
            apercu: {
              ...(this.page.apercu.titre ? { titre: this.valeur(this.page.apercu.titre) } : {}),
              ...(this.page.apercu.description ? { description: this.valeur(this.page.apercu.description) } : {}),
              ...(this.page.apercu.image ? { image: this.valeur(this.page.apercu.image) } : {}),
              indexation: this.page.apercu.indexation,
            },
          }
        : {}),
      ligne: this.page.ligne,
    };
  }

  private gestionnaire(evenement: Extract<Instruction, { type: 'Evenement' }>): Gestionnaire {
    return {
      declencheur: DECLENCHEURS[evenement.genre],
      cibles: this.analyse.cibles.get(evenement) ?? [],
      actions: this.actions(evenement.corps),
      ...(evenement.touches !== undefined ? { touches: touchesDe(evenement.touches) } : {}),
      // « arrete d'ecrire » attend 300 millisecondes, sauf si une autre durée est écrite.
      ...(evenement.genre === 'pauseSaisie' ? { millisecondes: evenement.duree ? millisecondes(evenement.duree) : 300 } : {}),
      ...(evenement.tantQue ? { tantQue: this.test(evenement.tantQue) } : {}),
      ...(evenement.genre === 'bas' ? { bouton: evenement.bouton === undefined ? 'Voir plus' : evenement.bouton } : {}),
      ...(evenement.variable !== undefined ? { variable: evenement.variable } : {}),
      ligne: evenement.ligne,
    };
  }

  /**
   * Les nœuds de la vue. Un événement écrit dans un « si » ou un bloc
   * (décision F2) rejoint `gestionnaires` : ceux de la page, ou ceux de la
   * boucle qui l'entoure, dont il voit la variable.
   */
  private vue(instructions: Instruction[], gestionnaires: Gestionnaire[]): NoeudVue[] {
    const noeuds: NoeudVue[] = [];

    for (const instruction of instructions) {
      switch (instruction.type) {
        case 'Element':
          noeuds.push(instruction.element === 'marqueur' ? this.marqueur(instruction) : this.element(instruction));
          break;

        case 'Graphique':
          noeuds.push(graphiqueDe(instruction, `graphique-${ligneLocale(instruction.ligne)}`, (e) => this.valeur(e), this.analyse.couleursTheme, {
            serie: (texte) => this.enLangues(texte),
            message: (fr) => messageEnLangues(fr, this.analyse.langues.langues.map((l) => l.code)),
          }));
          break;

        // « afficher "…" » dans la page place un texte, comme « texte "…" ».
        case 'Action':
          if (instruction.action === 'afficher') {
            noeuds.push({
              type: 'element',
              id: `texte_ligne_${ligneLocale(instruction.ligne)}`,
              genre: 'texte',
              contenu: this.valeur(instruction.arguments[0]),
              options: [],
              classes: [],
              ligne: instruction.ligne,
            });
          }
          break;

        case 'Condition':
          noeuds.push({
            type: 'condition',
            test: this.test(instruction.test),
            alors: this.vue(instruction.alors, gestionnaires),
            sinon: this.vue(instruction.sinon, gestionnaires),
            ligne: instruction.ligne,
          });
          break;

        case 'Boucle': {
          const dansLaBoucle: Gestionnaire[] = [];
          noeuds.push({
            type: 'repetition',
            variable: instruction.variable,
            typeVariable: this.analyse.types.get(instruction) ?? INCONNU,
            liste: this.valeur(instruction.liste),
            corps: this.vue(instruction.corps, dansLaBoucle),
            gestionnaires: dansLaBoucle,
            ...(instruction.deplacement ? { deplacement: true } : {}),
            ligne: instruction.ligne,
          });
          break;
        }

        case 'Evenement':
          gestionnaires.push(this.gestionnaire(instruction));
          break;

        case 'SousPage':
          noeuds.push({ type: 'sousPage', ligne: instruction.ligne });
          break;

        case 'Fenetre':
          noeuds.push({
            type: 'fenetre',
            id: this.analyse.fenetres.get(instruction) ?? `fenetre_ligne_${ligneLocale(instruction.ligne)}`,
            titre: instruction.titre,
            ...(instruction.description !== undefined ? { description: instruction.description } : {}),
            ...(instruction.obligatoire ? { obligatoire: true } : {}),
            classes: instruction.classes,
            corps: this.vue(instruction.corps, gestionnaires),
            ligne: instruction.ligne,
          });
          break;

        case 'Bloc':
          noeuds.push(instruction.genre === 'carte' ? this.carte(instruction, gestionnaires) : this.bloc(instruction, gestionnaires));
          break;

        case 'Formulaire':
          noeuds.push({
            type: 'formulaire',
            id:
              this.analyse.elements.get(this.page)?.formulaires.find((f) => f.noeud === instruction)?.id ??
              `formulaire_ligne_${instruction.ligne}`,
            nom: instruction.nom,
            corps: this.vue(instruction.corps, gestionnaires),
            ligne: instruction.ligne,
          });
          break;

        case 'Composant':
          noeuds.push({
            type: 'composant',
            nom: instruction.nom,
            proprietes: instruction.proprietes.map((p) => ({ nom: p.nom, valeur: this.valeur(p.valeur) })),
            ligne: instruction.ligne,
          });
          break;

        case 'Variable':
          noeuds.push({
            type: 'locale',
            nom: instruction.nom,
            typeValeur: this.analyse.types.get(instruction) ?? INCONNU,
            valeur: this.valeur(instruction.valeur),
            ligne: instruction.ligne,
          });
          break;

        // Les autres instructions n'ont pas leur place dans la vue :
        // l'analyse les a déjà refusées.
      }
    }

    return noeuds;
  }

  private element(element: Element): NoeudVue {
    // La saisie n'est écrite que pour un champ qui a une sorte ou une option :
    // la représentation des anciens programmes ne change pas.
    const indiceLangues =
      element.indice !== undefined
        ? this.enLangues(element.indiceTexte ?? { type: 'Chaine', parties: [{ type: 'texte', valeur: element.indice }], ligne: element.ligne })
        : undefined;
    const options = {
      ...(element.parmi ? { parmi: this.valeur(element.parmi) } : {}),
      ...(element.obligatoire ? { obligatoire: true } : {}),
      ...(element.indice !== undefined ? { indice: element.indice } : {}),
      ...(indiceLangues ? { indiceLangues } : {}),
      ...(element.minimum !== undefined ? { minimum: element.minimum } : {}),
      ...(element.maximum !== undefined ? { maximum: element.maximum } : {}),
    };
    const saisie: Saisie | undefined =
      element.element === 'champ' && (element.sorte !== undefined || Object.keys(options).length > 0)
        ? { sorte: element.sorte ?? 'texte', ...options }
        : undefined;
    // Une image : sa description et ses réglages vont dans « image », pas dans les classes.
    const image = element.element === 'image' ? imageDe(element, (e) => this.valeur(e)) : undefined;
    const { options: styles, reglages } = this.separer(image ? element.styles.filter((s) => !REGLAGES_IMAGE.has(normaliser(s.propriete))) : element.styles);
    if (WIDGETS.has(element.element)) {
      return {
        type: 'widget',
        genre: element.element as GenreWidget,
        id: this.analyse.elements.get(this.page)?.idDe(element) ?? `${element.element}_ligne_${ligneLocale(element.ligne)}`,
        contenu: this.valeur(element.contenu),
        options: styles,
        classes: element.classes,
        reglages,
        ...(element.minimum !== undefined ? { minimum: element.minimum } : {}),
        ...(element.maximum !== undefined ? { maximum: element.maximum } : {}),
        ...(element.fichier ? { fichier: choixFichierDe(element.fichier) } : {}),
        ...(element.element === 'audio' ? { textes: this.textesAudio(element) } : {}),
        ligne: element.ligne,
      };
    }
    return {
      ...(saisie ? { saisie } : {}),
      ...(Object.keys(reglages).length > 0 ? { reglages } : {}),
      type: 'element',
      id: this.analyse.elements.get(this.page)?.idDe(element) ?? `${element.element}_ligne_${ligneLocale(element.ligne)}`,
      genre: element.element as Extract<NoeudVue, { type: 'element' }>['genre'],
      ...(element.niveau !== undefined ? { niveau: element.niveau } : {}),
      contenu: this.valeur(element.contenu),
      options: styles,
      classes: element.classes,
      ...cibleDe(element.cible),
      ...(element.ancre !== undefined ? { ancre: element.ancre } : {}),
      ...(element.nouvelOnglet ? { nouvelOnglet: true } : {}),
      ...(element.arguments ? { arguments: element.arguments.map((x) => ({ nom: x.nom, valeur: this.valeur(x.valeur) })) } : {}),
      ...(image ? { image } : {}),
      ...(element.raccourci !== undefined ? { raccourci: touchesDe(element.raccourci) } : {}),
      ...(element.annonce ? { annonce: true } : {}),
      ligne: element.ligne,
    };
  }

  /** Les actions du corps d'une fonction. */
  actionsDe(instructions: Instruction[]): Action[] {
    return this.actions(instructions);
  }

  private actions(instructions: Instruction[]): Action[] {
    const actions: Action[] = [];

    for (const instruction of instructions) {
      switch (instruction.type) {
        case 'Supposant': {
          const variables = [...new Set(instruction.corps.map((a) => a.type === 'Affectation' ? a.nom : a.type === 'ModificationListe' ? a.liste : '').filter(Boolean))];
          actions.push({ type: 'optimiste', corps: this.actions(instruction.corps), variables });
          break;
        }
        case 'Rendre':
          actions.push({ type: 'rendre', valeur: this.valeur(instruction.valeur) });
          break;
        case 'Variable':
          actions.push({
            type: 'locale',
            nom: instruction.nom,
            typeValeur: this.analyse.types.get(instruction) ?? INCONNU,
            valeur: this.valeur(instruction.valeur),
          });
          break;

        case 'Affectation': {
          // « changer langue par anglais » : la langue choisie par la personne.
          const langue = this.analyse.changementsLangue.get(instruction);
          if (langue !== undefined) {
            actions.push({ type: 'langue', code: langue });
            break;
          }
          if (!instruction.champs && this.page.filtres?.some((f) => f.nom === instruction.nom)) {
            actions.push({ type: 'filtre', nom: instruction.nom, valeur: this.valeur(instruction.valeur) });
            break;
          }
          actions.push({
            type: 'affectation',
            nom: instruction.nom,
            ...(instruction.champs ? { champs: instruction.champs } : {}),
            valeur: this.valeur(instruction.valeur),
          });
          break;
        }

        case 'ModificationListe':
          // Deux formes écrites à part : l'union des actions est trop grande pour que TypeScript accepte un type choisi par une condition.
          actions.push(
            instruction.operation === 'ajouter'
              ? { type: 'ajout', liste: instruction.liste, valeur: this.valeur(instruction.valeur) }
              : { type: 'retrait', liste: instruction.liste, valeur: this.valeur(instruction.valeur) },
          );
          break;

        case 'Requete':
          actions.push({
            type: 'requete',
            // L'adresse réelle quand la requête vise une route du serveur du fichier.
            adresse: this.analyse.adressesRequetes.get(instruction) ?? depuisLaRacine(instruction.adresse),
            mode: this.analyse.lecturesUn.has(instruction) ? 'lireUn' : instruction.donnees.length > 0 ? 'envoyer' : 'lire',
            donnees: instruction.donnees.map((d) => this.valeur(d)),
            ...(instruction.cles ? { cles: instruction.cles } : {}),
            resultat: instruction.resultat,
            ...(instruction.source !== undefined
              ? {
                  source: instruction.source,
                  filtrant: instruction.filtrant?.map((f) => ({ cle: f.cle, valeur: this.valeur(f.valeur) })),
                  dans: this.analyse.reglesSources.get(instruction)?.dans,
                }
              : {}),
          });
          break;

        case 'Rechargement':
          actions.push({ type: 'recharger', variable: instruction.variable });
          break;

        case 'EnvoiFichier':
          actions.push({
            type: 'envoiFichier',
            variable: instruction.variable,
            adresse: instruction.adresse,
            source: instruction.source ?? '',
            corpsBrut: instruction.corpsBrut === true,
            champ: instruction.champ ?? 'fichier',
            ...(instruction.suivi !== undefined ? { suivi: instruction.suivi } : {}),
            ...(instruction.resultat !== undefined ? { resultat: instruction.resultat } : {}),
          });
          break;

        case 'Suppression':
          actions.push({
            type: 'suppression',
            adresse: this.analyse.adressesRequetes.get(instruction) ?? instruction.adresse,
            objet: this.valeur(instruction.objet),
            ...(instruction.source !== undefined ? { source: instruction.source } : {}),
          });
          break;

        case 'Modification':
          actions.push({
            type: 'modification',
            adresse: this.analyse.adressesRequetes.get(instruction) ?? instruction.adresse,
            objet: this.valeur(instruction.objet),
            changements: instruction.changements.map((c) => ({ champ: simplifier(c.champ), valeur: this.valeur(c.valeur) })),
            ...(instruction.source !== undefined ? { source: instruction.source } : {}),
            ...(this.analyse.reglesOperations.get(instruction)?.remplacement ? { remplacement: true } : {}),
          });
          break;

        case 'Action':
          actions.push(this.action(instruction));
          break;

        case 'Connexion':
          actions.push({ type: 'connexion', email: this.valeur(instruction.email), motDePasse: this.valeur(instruction.motDePasse) });
          break;

        case 'Deconnexion':
          actions.push({ type: 'deconnexion' });
          break;

        case 'Condition':
          actions.push({
            type: 'si',
            test: this.test(instruction.test),
            alors: this.actions(instruction.alors),
            sinon: this.actions(instruction.sinon),
          });
          break;

        case 'Boucle':
          actions.push({
            type: 'repetition',
            variable: instruction.variable,
            typeVariable: this.analyse.types.get(instruction) ?? INCONNU,
            liste: this.valeur(instruction.liste),
            corps: this.actions(instruction.corps),
          });
          break;

        case 'Essayer':
          actions.push({ type: 'essayer', corps: this.actions(instruction.corps), siErreur: this.actions(instruction.siErreur) });
          break;
        case 'TantQue':
          actions.push({ type: 'tantQue', test: this.test(instruction.test), corps: this.actions(instruction.corps) });
          break;
        case 'Repeter':
          actions.push({ type: 'repeter', fois: this.valeur(instruction.fois), corps: this.actions(instruction.corps) });
          break;
        case 'Arreter':
          actions.push({ type: 'arreter' });
          break;
        case 'PasserAuSuivant':
          actions.push({ type: 'passer' });
          break;
        case 'Selon':
          actions.push({
            type: 'selon',
            valeur: this.valeur(instruction.valeur),
            cas: instruction.cas.map((c) => ({ valeurs: c.valeurs.map((v) => this.valeur(v)), corps: this.actions(c.corps) })),
            sinon: this.actions(instruction.sinon),
          });
          break;

        case 'Minuterie':
          actions.push({
            type: 'minuterie',
            mode: instruction.mode,
            millisecondes: this.duree(instruction.duree),
            ...(instruction.tantQue ? { tantQue: this.test(instruction.tantQue) } : {}),
            corps: this.actions(instruction.corps),
          });
          break;

        case 'Copier':
          actions.push({
            type: 'copie',
            valeur: this.valeur(instruction.valeur),
            message: instruction.message === undefined ? 'Copié' : instruction.message,
            ...(instruction.texte ? { texte: this.valeur(instruction.texte) } : {}),
          });
          break;

        case 'Partager': {
          const lien = instruction.lien;
          const lue = lien ? lireCible(lien.adresse) : undefined;
          actions.push({
            type: 'partage',
            texte: this.valeur(instruction.texte),
            ...(instruction.titre ? { titre: this.valeur(instruction.titre) } : {}),
            ...(lien && lue
              ? {
                  lien: lue.externe
                    ? { externe: lien.adresse.trim() }
                    : { ecran: lue.page ?? this.page.nom, ...(lien.parametres?.length ? { arguments: lien.parametres.map((a) => ({ nom: a.nom, valeur: this.valeur(a.valeur) })) } : {}) },
                }
              : {}),
          });
          break;
        }

        case 'Confirmer':
          actions.push({
            type: 'confirmation',
            question: this.valeur(instruction.question),
            oui: instruction.oui ?? 'Oui',
            non: instruction.non ?? 'Non',
            alors: this.actions(instruction.alors),
            sinon: this.actions(instruction.sinon),
          });
          break;

        // Éléments et événements imbriqués : refusés par l'analyse.
      }
    }

    return actions;
  }

  /** Une durée en millisecondes : un nombre écrit, ou un calcul (« delai secondes » : delai * 1000). */
  private duree(duree: Duree): Valeur {
    const facteur = MILLISECONDES[duree.unite];
    if (duree.valeur.type === 'Nombre') return { type: 'nombre', valeur: Math.round(duree.valeur.valeur * facteur) };
    const valeur = this.valeur(duree.valeur);
    return facteur === 1 ? valeur : { type: 'calcul', operateur: '*', gauche: valeur, droite: { type: 'nombre', valeur: facteur } };
  }

  /** Les styles d'un élément ou d'un bloc, séparés de ses réglages. */
  private separer(styles: Style[]): { options: Option[]; reglages: Reglages } {
    const options: Option[] = [];
    const reglages: Record<string, unknown> = {};
    for (const s of styles) {
      const nom = normaliser(s.propriete);
      if (REGLAGES.has(nom)) {
        if (nom === 'photo') reglages.photo = this.valeur({ type: 'Chaine', parties: s.parties ?? [{ type: 'texte', valeur: s.valeur }], ligne: 0 });
        else if (nom === 'automatique' || nom === 'visibles') reglages[nom] = Number(s.valeur);
        else if (nom === 'icone') reglages.icone = chercherIcone(s.valeur)?.nom ?? s.valeur;
        else if (nom === 'description' || nom === 'transcription') {
          reglages[nom] = s.valeur;
          const langues = nom === 'description' ? this.enLangues(s.texte ?? { type: 'Chaine', parties: s.parties ?? [{ type: 'texte', valeur: s.valeur }], ligne: 0 }) : undefined;
          if (langues) reglages.descriptionLangues = langues;
        }
        else reglages[nom] = true;
        continue;
      }
      const option = optionCanonique(s.propriete, s.valeur, this.analyse.couleursTheme);
      options.push('erreur' in option ? { nom: s.propriete, valeur: s.valeur } : { nom: option.propriete, valeur: option.valeur });
      // « animation montee au defilement » : la marque que lit l'observateur du défilement.
      if (s.defilement) options.push({ nom: 'animation', valeur: 'defilement' });
      // « … et en cascade » : les enfants du bloc s'animent, l'un après l'autre.
      if (s.cascade) options.push({ nom: 'animation', valeur: 'cascade' });
    }
    return { options, reglages: reglages as Reglages };
  }

  /** Un texte en clair dans chaque langue du site ; rien s'il n'a qu'une langue. */
  private enLangues(texte: LitteralChaine | undefined): TexteEnLangues | undefined {
    return texte ? textesEnLangues(texte, this.analyse) : undefined;
  }

  /** La description et la transcription d'un audio, avec leurs {variables}. */
  private textesAudio(element: Element): { description?: Valeur; transcription?: Valeur } {
    const texte = (nom: string): Valeur | undefined => {
      const s = element.styles.find((x) => normaliser(x.propriete) === nom);
      return s ? this.valeur(s.texte ?? { type: 'Chaine', parties: s.parties ?? [{ type: 'texte', valeur: s.valeur }], ligne: element.ligne }) : undefined;
    };
    const description = texte('description');
    const transcription = texte('transcription');
    return { ...(description ? { description } : {}), ...(transcription ? { transcription } : {}) };
  }

  /** Un état caché, dont le nom ne peut pas se confondre avec une variable de l'utilisateur. */
  private etatCache(base: string, ligne: number, type: TypeValeur, initiale: Valeur): string {
    const nom = `${base}_${ligneLocale(ligne)}`;
    this.caches.push({ nom, type, initiale, ligne });
    return nom;
  }

  /** Un bloc de mise en page, ou un bloc d'éléments d'écran avec son état caché. */
  private bloc(instruction: Extract<Instruction, { type: 'Bloc' }>, gestionnaires: Gestionnaire[], groupe?: { etat: string; index: number }): NoeudVue {
    const { options, reglages } = this.separer(instruction.styles);
    // « menu repliable » : la marque que lisent le CSS et le bouton « Menu ».
    if (instruction.repliable) options.push({ nom: 'menu', valeur: 'repliable' });
    const noeud: Extract<NoeudVue, { type: 'bloc' }> = {
      type: 'bloc',
      genre: instruction.genre,
      options,
      classes: instruction.classes,
      ...(instruction.ancre !== undefined ? { ancre: instruction.ancre } : {}),
      corps: [],
      ...(instruction.titre ? { titre: this.valeur(instruction.titre) } : {}),
      ...(Object.keys(reglages).length > 0 ? { reglages } : {}),
      ...(instruction.nom !== undefined && this.analyse.blocsNommes.has(instruction.nom) ? { id: this.analyse.blocsNommes.get(instruction.nom)! } : {}),
      ligne: instruction.ligne,
    };
    const enfants = instruction.corps.filter((i): i is Extract<Instruction, { type: 'Bloc' }> => i.type === 'Bloc');
    const ouvert = enfants.findIndex((e) => e.styles.some((s) => normaliser(s.propriete) === 'ouvert'));

    if (instruction.genre === 'onglets' || (instruction.genre === 'accordeon' && !reglages.plusieurs)) {
      // Un seul onglet (ou deroulant) ouvert : son index est l'état caché du groupe.
      const depart = instruction.genre === 'onglets' ? Math.max(ouvert, 0) : ouvert;
      noeud.etat = this.etatCache(instruction.genre === 'onglets' ? 'onglet' : 'accordeon', instruction.ligne, NOMBRE, { type: 'nombre', valeur: depart });
      noeud.corps = instruction.corps.flatMap((enfant) =>
        enfant.type === 'Bloc' ? [this.bloc(enfant, gestionnaires, { etat: noeud.etat!, index: enfants.indexOf(enfant) })] : this.vue([enfant], gestionnaires),
      );
      return noeud;
    }
    if (instruction.genre === 'deroulant' && !groupe) {
      noeud.etat = this.etatCache('ouvert', instruction.ligne, BOOLEEN, { type: 'booleen', valeur: reglages.ouvert === true });
    } else if (groupe) {
      noeud.etat = groupe.etat;
      noeud.index = groupe.index;
    }
    noeud.corps = this.vue(instruction.corps, gestionnaires);
    return noeud;
  }

  /** Une carte : son nom, son centre, son zoom, ses tuiles, et ses marqueurs. */
  private carte(instruction: Extract<Instruction, { type: 'Bloc' }>, gestionnaires: Gestionnaire[]): NoeudVue {
    const o = instruction.carte ?? {};
    return {
      type: 'carte',
      id: `carte_ligne_${ligneLocale(instruction.ligne)}`,
      nom: this.valeur(instruction.titre!),
      ...(o.latitude ? { latitude: this.valeur(o.latitude) } : {}),
      ...(o.longitude ? { longitude: this.valeur(o.longitude) } : {}),
      ...(o.zoom ? { zoom: this.valeur(o.zoom) } : {}),
      ...(o.tuiles !== undefined ? { tuiles: { adresse: o.tuiles, attribution: o.attribution ?? '' } } : {}),
      classes: instruction.classes,
      corps: this.vue(instruction.corps, gestionnaires),
      ligne: instruction.ligne,
    };
  }

  /** Un marqueur : l'analyse a déjà vérifié qu'il a sa latitude et sa longitude. */
  private marqueur(element: Element): NoeudVue {
    const lieu = element.lieu!;
    return {
      type: 'marqueur',
      nom: this.valeur(element.contenu),
      ...(lieu.adresse ? { adresse: this.valeur(lieu.adresse) } : {}),
      latitude: this.valeur(lieu.latitude!),
      longitude: this.valeur(lieu.longitude!),
      ligne: element.ligne,
    };
  }

  private action(action: Extract<Instruction, { type: 'Action' }>): Action {
    const ids = this.analyse.cibles.get(action) ?? [];
    switch (action.action) {
      case 'afficher':
      case 'afficherErreur': {
        const suite = action.message;
        return {
          type: 'message',
          genre: action.action === 'afficherErreur' ? 'erreur' : (suite?.genre ?? 'info'),
          texte: this.valeur(action.arguments[0]),
          ...(suite?.duree ? { duree: this.duree(suite.duree) } : {}),
          ...(suite?.persistant ? { persistant: true } : {}),
          ...(suite?.action ? { action: { libelle: suite.action.libelle, actions: this.actions(suite.action.corps) } } : {}),
        };
      }
      case 'montrer':
        return { type: 'visibilite', ids, visible: true };
      case 'cacher':
        return { type: 'visibilite', ids, visible: false };
      case 'rediriger':
        return {
          type: 'navigation',
          ecran: this.valeur(action.arguments[0]),
          ...(action.parametres ? { arguments: action.parametres.map((a) => ({ nom: a.nom, valeur: this.valeur(a.valeur) })) } : {}),
          ...(action.continuer ? { continuer: true } : {}),
        };
      case 'changerTexte':
        return { type: 'changerTexte', ids, texte: this.valeur(action.arguments[1]) };
      case 'changerTheme': {
        const texte = this.valeur(action.arguments[0]);
        const valeur = texte.type === 'texte' && 'texte' in texte.parties[0] ? texte.parties[0].texte : 'automatique';
        return { type: 'theme', valeur: valeur as 'clair' | 'sombre' | 'automatique' | 'bascule' };
      }
      case 'revenir': {
        const vers = action.arguments[0];
        return { type: 'retour', ...(vers && vers.type === 'Chaine' ? { vers: vers.parties.map((p) => (p.type === 'texte' ? p.valeur : '')).join('') } : {}) };
      }
    }
  }

  private test(comparaison: TestAst): Test {
    if (comparaison.type === 'Combinaison') {
      return { operateur: comparaison.operateur, gauche: this.test(comparaison.gauche), droite: this.test(comparaison.droite) };
    }
    return {
      gauche: this.valeur(comparaison.gauche),
      operateur: comparaison.operateur,
      droite: comparaison.droite && this.valeur(comparaison.droite),
      ...(comparaison.negation ? { negation: true } : {}),
    };
  }

  private valeur(expression: Expression): Valeur {
    return traduireValeur(expression, this.analyse);
  }
}

/** Une expression de l'arbre devient une valeur de la RI. */
function traduireValeur(expression: Expression, analyse: ResultatAnalyse): Valeur {
  const valeur = (e: Expression) => traduireValeur(e, analyse);
  switch (expression.type) {
    case 'Chaine': {
      const parties = (liste: PartieChaine[]): PartiesTexte =>
        liste.map((p) => {
          if (p.type === 'texte') return { texte: p.valeur };
          if (p.type === 'accent') return { texte: p.valeur, accent: true };
          const format = analyse.formats.get(p);
          const pluriel = analyse.pluriels.get(p);
          return {
            variable: analyse.chemins.get(p) ?? p.valeur,
            ...(format ? { format } : {}),
            ...(pluriel ? { pluriel } : {}),
          };
        });
      const versions = versionsDe(expression, analyse);
      return { type: 'texte', parties: parties(expression.parties), ...(versions ? { versions: versions.map((v) => ({ code: v.code, parties: parties(v.parties) })) } : {}) };
    }
    case 'Nombre':
      return { type: 'nombre', valeur: expression.valeur };
    case 'Booleen':
      return { type: 'booleen', valeur: expression.valeur };
    case 'Rien':
      return { type: 'rien' };
    case 'Liste':
      return { type: 'liste', elements: expression.elements.map((e) => valeur(e)) };
    case 'Reference': {
      // « langue » (la langue choisie) et « anglais » (son code) avec un bloc « langues ».
      const langue = analyse.referencesLangue.get(expression);
      if (langue === 'langue') return { type: 'variable', nom: 'langue' };
      if (langue !== undefined) return { type: 'texte', parties: [{ texte: langue }] };
      return { type: 'variable', nom: expression.nom };
    }
    case 'Champ':
      return { type: 'champ', id: analyse.champs.get(expression) ?? expression.nom };
    case 'Calcul':
      return {
        type: 'calcul',
        operateur: expression.operateur,
        gauche: valeur(expression.gauche),
        droite: valeur(expression.droite),
      };
    case 'Compte':
      return { type: 'compte', liste: valeur(expression.liste) };
    case 'Fiche':
      return { type: 'fiche', champs: expression.champs.map((c) => ({ nom: c.nom, valeur: valeur(c.valeur) })) };
    case 'Appel':
      return { type: 'appel', nom: expression.nom, arguments: expression.arguments.map((a) => valeur(a)) };
    case 'AccesChamp':
      return analyse.projections.has(expression)
        ? { type: 'champs', liste: valeur(expression.objet), champ: expression.champ }
        : { type: 'champDonnee', objet: valeur(expression.objet), champ: expression.champ };
    case 'Agregat':
      return { type: 'agregat', operation: expression.operation, liste: valeur(expression.liste) };
    case 'Arrondi':
      return { type: 'arrondi', valeur: valeur(expression.valeur), ...(expression.chiffres !== undefined ? { chiffres: expression.chiffres } : {}) };
    case 'DateDuJour':
      return { type: 'dateDuJour', maintenant: expression.maintenant };
    case 'DateDecalee':
      return { type: 'dateDecalee', date: valeur(expression.date), nombre: valeur(expression.nombre), unite: expression.unite, signe: expression.signe };
    case 'JoursEntre':
      return { type: 'joursEntre', debut: valeur(expression.debut), fin: valeur(expression.fin) };
    case 'Hasard':
      return { type: 'hasard', minimum: valeur(expression.minimum), maximum: valeur(expression.maximum) };
    case 'Filtre':
      return {
        type: 'filtre',
        liste: valeur(expression.liste),
        champs: analyse.filtres.get(expression) ?? [],
        test: {
          gauche: valeur(expression.test.gauche),
          operateur: expression.test.operateur,
          ...(expression.test.droite ? { droite: valeur(expression.test.droite) } : {}),
          ...(expression.test.negation ? { negation: true } : {}),
        },
      };
    case 'Tri':
      return {
        type: 'tri',
        liste: valeur(expression.liste),
        ...(expression.champ !== undefined ? { champ: expression.champ } : {}),
        decroissant: expression.decroissant,
        genre: analyse.tris.get(expression) ?? 'nombre',
      };
    case 'Premier':
      return { type: 'premier', liste: valeur(expression.liste) };
    case 'Groupement':
      return { type: 'groupement', liste: valeur(expression.liste), champ: expression.champ };
    case 'OperationTexte':
      return { type: 'operationTexte', operation: expression.operation, valeur: valeur(expression.valeur) };
    case 'Remplacement':
      return { type: 'remplacement', cherche: valeur(expression.cherche), remplace: valeur(expression.remplace), dans: valeur(expression.dans) };
    case 'Premiers':
      return { type: 'premiers', nombre: valeur(expression.nombre), liste: valeur(expression.liste) };
    case 'EtatUtilisateur':
      return { type: 'utilisateur', etat: expression.etat };
    case 'EtatRequete':
      return { type: 'etatRequete', variable: expression.variable, etat: expression.etat };
    case 'ErreurRequete':
      return { type: 'erreurRequete', variable: expression.variable };
    case 'MouvementReduit':
      return { type: 'mouvementReduit' };
    case 'ThemeSombre':
      return { type: 'themeSombre' };
  }
}

/** Une durée écrite en chiffres, en millisecondes (l'analyse a refusé les autres là où il le faut). */
function millisecondes(duree: Duree): number {
  return duree.valeur.type === 'Nombre' ? Math.round(duree.valeur.valeur * MILLISECONDES[duree.unite]) : 300;
}

/** Le texte en clair dans chaque langue du site (la langue de base en premier) ; rien s'il n'a qu'une langue. */
function textesEnLangues(chaine: LitteralChaine, analyse: ResultatAnalyse): TexteEnLangues | undefined {
  return versionsDe(chaine, analyse)?.map((v) => ({ code: v.code, texte: texteSource(v.parties) }));
}

/**
 * Les versions d'un texte dans chaque langue déclarée, celle de base en
 * premier : écrites à côté (« en anglais "…" »), sinon prises au bloc
 * « traductions ». Rien pour un texte qui n'a qu'une langue.
 */
function versionsDe(chaine: LitteralChaine, analyse: ResultatAnalyse): { code: string; parties: PartieChaine[] }[] | undefined {
  const [base, ...autres] = analyse.langues.langues;
  if (!base) return undefined;
  const duBloc = analyse.langues.traductions.get(texteSource(chaine.parties));
  const versions = autres.flatMap((langue) => {
    const ecrite = chaine.versions?.find((v) => langueDuMot(v.langue) === langue);
    const parties = ecrite?.parties ?? duBloc?.get(langue.code);
    return parties ? [{ code: langue.code, parties }] : [];
  });
  return versions.length > 0 ? [{ code: base.code, parties: chaine.parties }, ...versions] : undefined;
}

/**
 * Une adresse sans serveur dans le fichier : « produits » part de la racine du
 * site (/produits), quelle que soit la page qui l'envoie (/produit/42). Une
 * adresse complète (https://…) reste telle quelle.
 */
function depuisLaRacine(adresse: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(adresse) || adresse.startsWith('/') ? adresse : `/${adresse}`;
}
