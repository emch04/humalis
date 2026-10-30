/**
 * Les vérifications des langues (plan 2026-10-30-qualite-publication,
 * partie 1, tableau « Ce que vérifie le compilateur »). Les variables d'un
 * texte et la valeur intégrée `langue` sont vérifiées par l'analyse des
 * pages ; ici, ce qui ne dépend pas des portées : les blocs, les versions,
 * les textes sans version et les traductions inutilisées.
 *
 * Tous ces diagnostics ont la catégorie « traduction » : `--exigeant`
 * change leurs avertissements en erreurs.
 */
import type { PartieChaine } from '../lexer/types.js';
import type { Expression, Instruction, LitteralChaine, Page, Programme, Style } from '../parser/ast.js';
import { texteSource } from '../parser/langues.js';
import { LANGUES_DISPONIBLES, langueDuMot, type Langue } from '../i18n/langues.js';
import type { Diagnostic } from './erreurs.js';
import { nomProche } from './suggestions.js';

/** Les langues d'un programme : la première est celle des textes écrits. */
export interface LanguesDuProgramme {
  langues: Langue[];
  /** Pour chaque texte de la langue de base, ses versions du bloc « traductions » (code → parties). */
  traductions: Map<string, Map<string, PartieChaine[]>>;
}

/** Les langues déclarées et disponibles, dans l'ordre ; vide sans bloc « langues ». */
export function languesDeclarees(programme: Programme): Langue[] {
  const vues = new Set<string>();
  return (programme.langues?.langues ?? []).flatMap((l) => {
    const langue = langueDuMot(l.mot);
    if (!langue || !langue.disponible || vues.has(langue.code)) return [];
    vues.add(langue.code);
    return [langue];
  });
}

const liste = (langues: Langue[]) => langues.map((l) => l.nom).join(', ');

/** « l'anglais », « le français » : le nom avec son article. */
const leNom = (langue: Langue) => (/^[aeiouy]/.test(langue.nom) ? `l'${langue.nom}` : `le ${langue.nom}`);

/** Le texte visible d'un littéral : il a au moins une lettre en dehors des « {…} ». */
const aDesLettres = (parties: PartieChaine[]) => parties.some((p) => p.type === 'texte' && /\p{L}/u.test(p.valeur));

/** Les variables d'un texte, sans leur habillage (« {prix en FC} » → « prix »). */
const variablesDe = (parties: PartieChaine[]) =>
  new Set(parties.filter((p) => p.type === 'variable').map((p) => p.valeur.trim().split(/\s+/)[0]));

/**
 * Les textes sans « {variables} » : l'indice d'un champ, le nom d'une série,
 * le nom et la description du site. Leur version n'en a pas non plus.
 */
const PLATS = new WeakSet<LitteralChaine>();
const plat = (texte: LitteralChaine): LitteralChaine => {
  PLATS.add(texte);
  return texte;
};

/** Un texte écrit sans guillemets de version (un indice, le nom d'une série) : un littéral comme les autres. */
const litteralDe = (valeur: string, ligne: number): LitteralChaine => plat({ type: 'Chaine', parties: [{ type: 'texte', valeur }], ligne });

/**
 * Les textes des options (plan langues, suite) : la description et la
 * transcription d'une image, d'un son, d'une icône…, l'indice d'un champ, les
 * étiquettes, la description et les séries d'un graphique. Ce sont des textes
 * que la personne lit ou entend, comme les autres.
 */
function textesDesOptions(instruction: Instruction, vus: LitteralChaine[]): void {
  if (instruction.type === 'Element') {
    for (const style of instruction.styles as Style[]) {
      if ((style.propriete === 'description' || style.propriete === 'transcription') && style.parties) {
        vus.push(style.texte ?? { type: 'Chaine', parties: style.parties, ligne: instruction.ligne });
      }
    }
    if (instruction.indice !== undefined) vus.push(instruction.indiceTexte ? plat(instruction.indiceTexte) : litteralDe(instruction.indice, instruction.ligne));
  }
  if (instruction.type === 'Graphique') {
    if (instruction.description?.type === 'Chaine') vus.push(instruction.description);
    if (instruction.etiquettes) tousLesTextes(instruction.etiquettes, vus);
    for (const serie of instruction.series) vus.push(serie.texteNom ? plat(serie.texteNom) : litteralDe(serie.nom, serie.ligne));
  }
}

/** « si langue est anglais : » (ou « n'est pas ») : ses deux branches sont chacune écrites dans une seule langue. */
const testeLaLangue = (instruction: Instruction): boolean => {
  if (instruction.type !== 'Condition') return false;
  const test = instruction.test;
  return test.type === 'Comparaison' && test.gauche.type === 'Reference' && test.gauche.nom === 'langue' && test.droite?.type === 'Reference' && langueDuMot(test.droite.nom) !== undefined;
};

/**
 * Les textes que la personne voit : contenus d'éléments, titres de blocs, messages, aperçu.
 * Ceux d'une branche « si langue est … » vont aussi dans `uneLangue` : ils n'ont pas à être traduits.
 */
function textesVisibles(instructions: Instruction[], vus: LitteralChaine[], uneLangue?: Set<LitteralChaine>): void {
  const ajouter = (e: Expression | undefined) => {
    if (e?.type === 'Chaine') vus.push(e);
  };
  for (const instruction of instructions) {
    textesDesOptions(instruction, vus);
    switch (instruction.type) {
      case 'Element':
        if (!['image', 'audio', 'icone', 'avatar', 'qr', 'selecteurLangue', 'chargement', 'progression', 'etoiles', 'compteur'].includes(instruction.element)) {
          ajouter(instruction.contenu);
        }
        break;
      case 'Action':
        if (instruction.action === 'afficher' || instruction.action === 'afficherErreur') ajouter(instruction.arguments[0]);
        if (instruction.action === 'changerTexte') ajouter(instruction.arguments[1]);
        break;
      case 'Apercu':
        ajouter(instruction.titre);
        ajouter(instruction.description);
        break;
      default:
        break;
    }
    if (instruction.type === 'Bloc') ajouter(instruction.titre);
    for (const cle of ['corps', 'alors', 'sinon'] as const) {
      const enfants = (instruction as Partial<Record<typeof cle, Instruction[]>>)[cle];
      if (!Array.isArray(enfants)) continue;
      if (cle !== 'corps' && uneLangue && testeLaLangue(instruction)) {
        const dedans: LitteralChaine[] = [];
        textesVisibles(enfants, dedans, uneLangue);
        for (const texte of dedans) uneLangue.add(texte);
        vus.push(...dedans);
      } else textesVisibles(enfants, vus, uneLangue);
    }
    if (instruction.type === 'Selon') for (const cas of instruction.cas) textesVisibles(cas.corps, vus, uneLangue);
  }
}

/** Tous les littéraux de texte d'un arbre, où qu'ils soient. */
function tousLesTextes(noeud: unknown, vus: LitteralChaine[]): void {
  if (Array.isArray(noeud)) {
    for (const enfant of noeud) tousLesTextes(enfant, vus);
    return;
  }
  if (!noeud || typeof noeud !== 'object') return;
  if ((noeud as { type?: string }).type === 'Chaine') vus.push(noeud as LitteralChaine);
  for (const valeur of Object.values(noeud)) if (valeur && typeof valeur === 'object') tousLesTextes(valeur, vus);
}

/** Les valeurs d'un choix ou d'une liste déroulante (« parmi [...] ») : elles partent au serveur. */
function valeursDeChoix(noeud: unknown, vus: Expression[], selecteur?: 'selecteurLangue'): void {
  if (Array.isArray(noeud)) {
    for (const enfant of noeud) valeursDeChoix(enfant, vus, selecteur);
    return;
  }
  if (!noeud || typeof noeud !== 'object') return;
  const element = noeud as { type?: string; element?: string; parmi?: Expression; contenu?: Expression };
  // Avec `selecteur` : les « selecteur de langue » (leur contenu vide porte la ligne).
  if (element.type === 'Element' && selecteur && element.element === selecteur && element.contenu) vus.push(element.contenu);
  else if (element.type === 'Element' && !selecteur && element.parmi) vus.push(element.parmi);
  for (const valeur of Object.values(noeud)) if (valeur && typeof valeur === 'object') valeursDeChoix(valeur, vus, selecteur);
}

/**
 * Vérifie les langues d'un programme et rend ce que la représentation
 * intermédiaire en a besoin. Sans bloc « langues », seules les versions
 * écrites sans lui sont refusées.
 */
export function analyserLangues(programme: Programme, diagnostics: Diagnostic[]): LanguesDuProgramme {
  const signaler = (gravite: Diagnostic['gravite'], message: string, ligne: number) =>
    diagnostics.push({ gravite, categorie: 'traduction', message, ligne });
  const erreur = (message: string, ligne: number) => signaler('erreur', message, ligne);
  const avertir = (message: string, ligne: number) => signaler('avertissement', message, ligne);

  const textes: LitteralChaine[] = [];
  tousLesTextes([programme.pages, programme.partages, programme.composants, programme.fonctions, programme.entete, programme.pied, programme.site?.textes], textes);
  const traductions = new Map<string, Map<string, PartieChaine[]>>();

  // Sans bloc « langues » : une version écrite est refusée, une fois par ligne.
  if (!programme.langues) {
    const lignes = new Set<number>();
    for (const texte of textes) {
      const version = texte.versions?.[0];
      if (!version || lignes.has(version.ligne)) continue;
      lignes.add(version.ligne);
      const langue = langueDuMot(version.langue);
      erreur(
        `ce texte a une version ${langue?.adjectif ?? `« ${version.langue} »`}, mais le fichier ne déclare pas ses langues. Ajoutez en haut du fichier : « langues : », puis « francais » et « anglais » sur deux lignes décalées.`,
        version.ligne,
      );
    }
    const selecteurs: Expression[] = [];
    valeursDeChoix(programme.pages, selecteurs, 'selecteurLangue');
    for (const selecteur of selecteurs) {
      erreur('« selecteur de langue » demande un bloc « langues : » en haut du fichier, avec « francais » et « anglais » sur deux lignes décalées.', selecteur.ligne);
    }
    for (const bloc of programme.traductions ?? []) {
      erreur('le bloc « traductions » demande d\'abord un bloc « langues : » en haut du fichier (« francais », puis « anglais »).', bloc.ligne);
    }
    return { langues: [], traductions };
  }

  // Le bloc « langues » lui-même.
  const vues = new Map<string, number>();
  for (const { mot, ligne } of programme.langues.langues) {
    const langue = langueDuMot(mot);
    if (!langue) {
      const proche = nomProche(mot, LANGUES_DISPONIBLES.map((l) => l.mot));
      erreur(`« ${mot} » n'est pas une langue connue de Humalis. Langues possibles : ${liste(LANGUES_DISPONIBLES)}.${proche ? ` Peut-être « ${proche} » ?` : ''}`, ligne);
    } else if (!langue.disponible) {
      erreur(`${leNom(langue)} n'est pas encore disponible : pour l'instant, Humalis traduit en ${liste(LANGUES_DISPONIBLES)}.`, ligne);
    } else if (vues.has(langue.code)) {
      erreur(`${leNom(langue)} est déjà dans le bloc « langues » (ligne ${vues.get(langue.code)}).`, ligne);
    } else {
      vues.set(langue.code, ligne);
    }
  }
  const declarees = languesDeclarees(programme);
  if (declarees.length === 0) {
    erreur(`le bloc « langues » est vide : écrivez une langue par ligne, la première étant celle des textes (${liste(LANGUES_DISPONIBLES)}).`, programme.langues.ligne);
    return { langues: [], traductions };
  }
  const base = declarees[0];
  const autres = declarees.slice(1);

  /** La langue d'une version ou d'un bloc, vérifiée ; rien si elle est refusée. */
  const langueVisee = (mot: string, ligne: number, quoi: string): Langue | undefined => {
    const langue = langueDuMot(mot);
    if (!langue) {
      const proche = nomProche(mot, declarees.map((l) => l.mot));
      erreur(`« ${mot} » n'est pas une langue connue de Humalis. Langues déclarées : ${liste(declarees)}.${proche ? ` Peut-être « ${proche} » ?` : ''}`, ligne);
      return undefined;
    }
    if (!declarees.includes(langue)) {
      erreur(`${leNom(langue)} n'est pas dans le bloc « langues ». Langues déclarées : ${liste(declarees)}.`, ligne);
      return undefined;
    }
    if (langue === base) {
      erreur(`${quoi} est déjà en ${base.nom}, la première langue du bloc « langues » : la version à ajouter est celle d'une autre langue (${liste(autres) || 'aucune autre déclarée'}).`, ligne);
      return undefined;
    }
    return langue;
  };

  // Les blocs « traductions ».
  const entreesVues = new Map<string, { ligne: number; utilisee: boolean; langue: Langue }>();
  for (const bloc of programme.traductions ?? []) {
    const langue = langueVisee(bloc.langue, bloc.ligne, 'le texte des pages');
    if (!langue) continue;
    for (const entree of bloc.entrees) {
      const cle = texteSource(entree.texte);
      const id = `${langue.code}\u0000${cle}`;
      const deja = entreesVues.get(id);
      if (deja) {
        erreur(`« ${cle} » a déjà une version ${langue.adjectif} dans ce bloc (ligne ${deja.ligne}).`, entree.ligne);
        continue;
      }
      entreesVues.set(id, { ligne: entree.ligne, utilisee: false, langue });
      verifierVariables(entree.texte, entree.version, langue, entree.ligne);
      if (!traductions.has(cle)) traductions.set(cle, new Map());
      traductions.get(cle)!.set(langue.code, entree.version);
    }
  }

  function verifierVariables(texte: PartieChaine[], version: PartieChaine[], langue: Langue, ligne: number): void {
    const dansVersion = variablesDe(version);
    for (const variable of variablesDe(texte)) {
      if (!dansVersion.has(variable)) {
        avertir(`la version ${langue.adjectif} n'utilise pas {${variable}} : la personne qui lit en ${langue.nom} ne verra pas cette valeur.`, ligne);
      }
    }
  }

  // Les textes visibles : ceux des pages, des options et du bloc « site ».
  const visibles: LitteralChaine[] = [];
  const uneLangue = new Set<LitteralChaine>();
  const pages: Page[] = programme.pages;
  for (const page of pages) {
    textesVisibles(page.corps, visibles, uneLangue);
    if (page.apercu) textesVisibles([page.apercu], visibles, uneLangue);
  }
  for (const disposition of [programme.entete, programme.pied]) if (disposition) textesVisibles(disposition.corps, visibles, uneLangue);
  for (const composant of programme.composants) textesVisibles(composant.corps, visibles, uneLangue);
  for (const cle of ['nom', 'description'] as const) {
    const valeur = programme.site?.[cle];
    if (valeur !== undefined) visibles.push(programme.site?.textes?.[cle] ? plat(programme.site.textes[cle]!) : litteralDe(valeur, programme.site?.lignes[cle] ?? programme.site!.ligne));
  }
  // Un texte écrit sans version (une description, un indice) n'est pas dans l'arbre : il compte aussi.
  const connus = new Set<LitteralChaine>(textes);
  for (const texte of visibles) if (!connus.has(texte)) textes.push(texte);

  // Les versions écrites à côté des textes.
  for (const texte of textes) {
    const langues = new Set<Langue>();
    if (PLATS.has(texte)) {
      for (const version of texte.versions ?? []) {
        if (version.parties.some((p) => p.type === 'variable')) {
          erreur('ce texte (un indice, le nom d\'une série, le nom ou la description du site) n\'accepte pas de « {variable} » : retirez les accolades de la version.', version.ligne);
        }
      }
    }
    for (const version of texte.versions ?? []) {
      const langue = langueVisee(version.langue, version.ligne, 'le texte écrit');
      if (!langue) continue;
      if (langues.has(langue)) {
        erreur(`deux versions ${langue.adjectif}s pour le même texte : gardez-en une seule.`, version.ligne);
        continue;
      }
      langues.add(langue);
      verifierVariables(texte.parties, version.parties, langue, version.ligne);
    }
    // Une entrée du bloc qui correspond à ce texte sert (même si la version écrite à côté gagne).
    for (const langue of autres) {
      const entree = entreesVues.get(`${langue.code}\u0000${texteSource(texte.parties)}`);
      if (entree) entree.utilisee = true;
    }
  }

  // Les valeurs d'un choix partent au serveur telles qu'écrites.
  const choix: Expression[] = [];
  valeursDeChoix(programme.pages, choix);
  for (const parmi of choix) {
    const dedans: LitteralChaine[] = [];
    tousLesTextes(parmi, dedans);
    for (const texte of dedans) {
      if (texte.versions) {
        erreur('la valeur d\'un choix est envoyée au serveur telle qu\'elle est écrite : elle ne se traduit pas. Retirez « en … "…" » de cette valeur.', texte.versions[0].ligne);
      }
    }
  }

  // Les textes visibles sans version dans une langue déclarée.
  for (const texte of visibles) {
    if (!aDesLettres(texte.parties) || uneLangue.has(texte) || texte.sansTraduction) continue;
    const cle = texteSource(texte.parties);
    for (const langue of autres) {
      const ecrite = texte.versions?.some((v) => langueDuMot(v.langue) === langue);
      if (ecrite || traductions.get(cle)?.has(langue.code)) continue;
      avertir(`« ${cle} » n'a pas de version ${langue.adjectif} : écrivez « en ${langue.mot} "…" » après le texte, ou ajoutez-le au bloc « traductions ${langue.mot} ».`, texte.ligne);
    }
  }

  // Les entrées du bloc qui ne servent à rien.
  const ecrits = textes.map((t) => texteSource(t.parties));
  for (const [id, entree] of entreesVues) {
    if (entree.utilisee) continue;
    const cle = id.split('\u0000')[1];
    const proche = nomProche(cle, ecrits);
    avertir(`cette traduction ne sert à rien : aucun texte du programme ne s'écrit « ${cle} ».${proche ? ` Peut-être « ${proche} » ?` : ' Une faute de frappe ?'}`, entree.ligne);
  }

  return { langues: declarees, traductions };
}
