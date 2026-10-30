import { analyser } from './lexer/lexer.js';
import { ErreurLexicale } from './lexer/types.js';
import { analyserSyntaxe } from './parser/parser.js';
import { ErreurSyntaxique } from './parser/erreurs.js';
import type { Programme } from './parser/ast.js';
import type { Expression } from './parser/ast.js';
import { lireCsv } from './donnees/csv.js';
import { lireJson } from './donnees/json.js';
import { analyserSens } from './analyse/analyse.js';
import { verifierCss } from './analyse/css.js';
import type { Diagnostic } from './analyse/erreurs.js';
import { construireRepresentation } from './ri/construire.js';
import type { Application } from './ri/types.js';

export interface ResultatCompilation {
  /** Absente s'il y a au moins une erreur. */
  application?: Application;
  /** Erreurs du lexer, du parser et de l'analyse, puis avertissements, triés par fichier et par ligne. */
  diagnostics: Diagnostic[];
  /** Les fichiers du projet, relatifs au dossier du fichier principal ; le premier est le principal. */
  fichiers?: string[];
}

/** Lit un fichier du projet ; undefined s'il n'existe pas. Le compilateur ne touche jamais au disque lui-même. */
export type Lecteur = (chemin: string) => string | undefined;

/**
 * Plusieurs fichiers (trou G4) : les lignes du k-ième fichier utilisé sont
 * comptées à partir de k × DECALAGE pendant l'analyse, puis rendues à leur
 * fichier dans les diagnostics.
 */
export const DECALAGE = 1_000_000;

/** La ligne dans son propre fichier (pour les identifiants « texte_ligne_6 »). */
export const ligneLocale = (ligne: number) => ligne % DECALAGE;

/**
 * Rend un diagnostic à son fichier : « panier.humalis », ligne 6. Les lignes
 * citées dans le message (« existe déjà (ligne 3) ») sont rendues aussi, avec
 * le nom de leur fichier quand ce n'est pas celui du diagnostic.
 */
export function situer(diagnostic: Diagnostic, fichiers: string[] = []): Diagnostic {
  const k = Math.floor(diagnostic.ligne / DECALAGE);
  const message = diagnostic.message.replace(/\bligne (\d+)/g, (_, nombre: string) => {
    const cite = Number(nombre);
    const autre = Math.floor(cite / DECALAGE);
    return autre === k ? `ligne ${ligneLocale(cite)}` : `ligne ${ligneLocale(cite)} de ${fichiers[autre] ?? 'ce fichier'}`;
  });
  if (k === 0) return message === diagnostic.message ? diagnostic : { ...diagnostic, message };
  return { ...diagnostic, message, ligne: ligneLocale(diagnostic.ligne), fichier: fichiers[k] };
}

/** VS Code, le site et la commande placent la ligne eux-mêmes. */
const sansPrefixe = (message: string) => message.replace(/^Ligne \d+ : /, '');

/**
 * Compile un projet : le fichier principal et ceux qu'il utilise
 * (« utiliser fichier "./panier.humalis" »), chacun une seule fois. Une
 * faute dans le programme ne lève jamais d'exception : elle devient un
 * diagnostic.
 */
export function compilerProjet(principal: string | undefined, lire: Lecteur, sourcePrincipale?: string): ResultatCompilation {
  const complet = principal === undefined ? '' : normaliser(principal);
  const base = dossier(complet);
  const nomDe = (chemin: string) => relatif(base, chemin);
  const fichiers: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const programmes: Programme[] = [];
  const vus = new Set<string>();
  const enCours: string[] = [];

  const charger = (chemin: string, source: string): void => {
    const k = fichiers.length;
    const decalage = k * DECALAGE;
    vus.add(chemin);
    fichiers.push(nomDe(chemin));
    let programme: Programme;
    try {
      programme = analyserSyntaxe(analyser(source));
    } catch (erreur) {
      if (erreur instanceof ErreurLexicale) {
        diagnostics.push({ gravite: 'erreur', message: sansPrefixe(erreur.message), ligne: decalage + erreur.ligne, colonne: erreur.colonne });
        return;
      }
      if (erreur instanceof ErreurSyntaxique) {
        diagnostics.push({ gravite: 'erreur', message: sansPrefixe(erreur.message), ligne: decalage + erreur.ligne });
        return;
      }
      throw erreur;
    }
    const ici = dossier(chemin);
    if (k > 0) {
      decaler(programme, decalage);
      // Les chemins CSS et React d'un fichier utilisé partent de son dossier : on les ramène au dossier principal.
      for (const f of programme.fichiersStyle) f.chemin = relatif(base, joindre(ici, f.chemin));
      for (const c of programme.composantsReact) c.chemin = relatif(base, joindre(ici, c.chemin));
      for (const d of programme.donneesFichiers) d.chemin = './' + relatif(base, joindre(ici, d.chemin));
      for (const police of programme.theme?.polices ?? []) if (police.fichier) police.fichier = relatif(base, joindre(ici, police.fichier));
      for (const cle of ['image', 'logo'] as const) {
        const chemin = programme.site?.[cle];
        if (chemin && !/^https?:\/\//.test(chemin)) programme.site![cle] = relatif(base, joindre(ici, chemin));
      }
    }
    programmes.push(programme);

    enCours.push(chemin);
    for (const utilise of programme.fichiersHumalis) {
      const cible = joindre(ici, utilise.chemin);
      const position = enCours.indexOf(cible);
      if (position !== -1) {
        const boucle = [...enCours.slice(position), cible].map(nomDe).join(' → ');
        diagnostics.push({
          gravite: 'erreur',
          message: `les fichiers s'utilisent en boucle : ${boucle}. Retirez l'un des « utiliser fichier ».`,
          ligne: utilise.ligne,
        });
        continue;
      }
      if (vus.has(cible)) continue;
      const texte = lire(cible);
      if (texte === undefined) {
        const aCote = chemin === '' ? 'ce fichier' : nomFichier(chemin);
        diagnostics.push({
          gravite: 'erreur',
          message: `le fichier « ${utilise.chemin} » est introuvable (cherché à côté de ${aCote}, sous ${cible}).`,
          ligne: utilise.ligne,
        });
        continue;
      }
      charger(cible, texte);
    }
    enCours.pop();
  };

  const source = sourcePrincipale ?? lire(complet);
  if (source === undefined) throw new Error(`le fichier principal « ${principal} » n'a pas pu être lu`);
  charger(complet, source);

  const fin = (): ResultatCompilation => ({
    diagnostics: diagnostics.map((d) => situer(d, fichiers)).sort(parFichierEtLigne),
    fichiers,
  });
  if (diagnostics.some((d) => d.gravite === 'erreur')) return fin();

  const programme = reunir(programmes, fichiers, diagnostics);
  for (const donnees of programme.donneesFichiers) {
    const cible = joindre(base, donnees.chemin);
    if (!donnees.chemin.startsWith('./') && !donnees.chemin.startsWith('../')) {
      diagnostics.push({ gravite: 'erreur', ligne: donnees.ligne, message: `le fichier de données « ${donnees.chemin} » doit avoir un chemin relatif (./…).` });
      continue;
    }
    if (relatif(base, cible).startsWith('..')) {
      diagnostics.push({ gravite: 'erreur', ligne: donnees.ligne, message: `le fichier de données « ${donnees.chemin} » sort du projet.` });
      continue;
    }
    const contenu = lire(cible);
    if (contenu === undefined) {
      diagnostics.push({ gravite: 'erreur', ligne: donnees.ligne, message: `le fichier de données « ${donnees.chemin} » est introuvable (cherché à côté du fichier Humalis).` });
      continue;
    }
    if (new TextEncoder().encode(contenu).length > 1_048_576) {
      diagnostics.push({ gravite: 'erreur', ligne: donnees.ligne, message: `le fichier de données « ${donnees.chemin} » dépasse 1 Mo : utilisez une source pour des données plus grandes.` });
      continue;
    }
    try {
      const valeur = donnees.chemin.endsWith('.csv') ? lireCsv(contenu) : donnees.chemin.endsWith('.json') ? lireJson(contenu) : undefined;
      if (valeur === undefined) throw new Error('seuls les fichiers .csv et .json sont acceptés.');
      programme.partages.push({ type: 'Variable', nom: donnees.nom, valeur: valeurDonnee(valeur, donnees.ligne), options: { partagee: true }, fichierDonnees: donnees.chemin, ligne: donnees.ligne });
    } catch (erreur) {
      diagnostics.push({ gravite: 'erreur', ligne: donnees.ligne, message: `le fichier de données « ${donnees.chemin} » : ${(erreur as Error).message}` });
    }
  }
  if (diagnostics.some((d) => d.gravite === 'erreur')) return fin();
  const classesCss = new Set<string>();
  let cssIllisible = false;
  for (const bloc of programme.styles) {
    const resultat = verifierCss(bloc.css, bloc.ligne + 1);
    for (const nom of resultat.classes) classesCss.add(nom);
    diagnostics.push(...resultat.diagnostics);
  }
  for (const fichier of programme.fichiersStyle) {
    const contenu = lire(joindre(base, fichier.chemin));
    if (contenu === undefined) { cssIllisible = true; continue; }
    const resultat = verifierCss(contenu, 1, fichier.chemin.replace(/^\.\//, ''));
    for (const nom of resultat.classes) classesCss.add(nom);
    diagnostics.push(...resultat.diagnostics);
  }
  const analyse = analyserSens(programme, cssIllisible ? undefined : classesCss);
  diagnostics.push(...analyse.diagnostics);
  if (diagnostics.some((d) => d.gravite === 'erreur')) return fin();
  return { ...fin(), application: construireRepresentation(programme, analyse) };
}

function valeurDonnee(valeur: unknown, ligne: number): Expression {
  if (typeof valeur === 'string') return { type: 'Chaine', parties: [{ type: 'texte', valeur }], ligne };
  if (typeof valeur === 'number') return { type: 'Nombre', valeur, ligne };
  if (typeof valeur === 'boolean') return { type: 'Booleen', valeur, ligne };
  if (Array.isArray(valeur)) return { type: 'Liste', elements: valeur.map((v) => valeurDonnee(v, ligne)), ligne };
  if (valeur && typeof valeur === 'object') return { type: 'Fiche', champs: Object.entries(valeur).map(([nom, v]) => ({ nom, valeur: valeurDonnee(v, ligne), ligne })), ligne };
  return { type: 'Rien', ligne };
}

/** Le programme de tout le projet : les pages, composants, variables et serveurs de chaque fichier. */
function reunir(programmes: Programme[], fichiers: string[], diagnostics: Diagnostic[]): Programme {
  const [premier, ...autres] = programmes;
  const tout: Programme = {
    ...premier,
    pages: [...premier.pages],
    styles: [...premier.styles],
    fichiersStyle: [...premier.fichiersStyle],
    donneesFichiers: [...premier.donneesFichiers],
    partages: [...premier.partages],
    composantsReact: [...premier.composantsReact],
    composants: [...premier.composants],
    serveurs: [...premier.serveurs],
    sources: [...premier.sources],
    fonctions: [...premier.fonctions],
    tests: [...premier.tests],
  };
  for (const p of autres) {
    for (const page of p.pages) {
      const deja = tout.pages.find((x) => x.nom === page.nom);
      if (deja) {
        diagnostics.push({ gravite: 'erreur', message: `la page « ${page.nom} » est déjà déclarée (ligne ${deja.ligne}).`, ligne: page.ligne });
      } else tout.pages.push(page);
    }
    for (const serveur of p.serveurs) {
      const deja = tout.serveurs[0];
      if (deja) {
        diagnostics.push({
          gravite: 'erreur',
          message: `un seul serveur par application : le serveur « ${deja.nom} » est déjà déclaré (ligne ${deja.ligne}). Mets ses données et ses routes dans ce même bloc.`,
          ligne: serveur.ligne,
        });
      } else tout.serveurs.push(serveur);
    }
    for (const source of p.sources) {
      const deja = tout.sources.find((x) => x.nom === source.nom);
      if (deja) {
        diagnostics.push({ gravite: 'erreur', message: `la source « ${source.nom} » est déjà déclarée (ligne ${deja.ligne}).`, ligne: source.ligne });
      } else tout.sources.push(source);
    }
    for (const fonction of p.fonctions) {
      const deja = tout.fonctions.find((x) => x.nom === fonction.nom);
      if (deja) {
        diagnostics.push({ gravite: 'erreur', message: `la fonction « ${fonction.nom} » est déjà définie (ligne ${deja.ligne}).`, ligne: fonction.ligne });
      } else tout.fonctions.push(fonction);
    }
    tout.tests.push(...p.tests);
    if (p.site) {
      if (tout.site) {
        diagnostics.push({ gravite: 'erreur', message: `un seul bloc « site » par application : il est déjà déclaré (ligne ${tout.site.ligne}).`, ligne: p.site.ligne });
      } else tout.site = p.site;
    }
    if (p.theme) {
      if (tout.theme) {
        diagnostics.push({
          gravite: 'erreur',
          message: `un seul bloc « theme » par application : il est déjà déclaré (ligne ${tout.theme.ligne}). Réunissez les couleurs et les polices dans le même bloc.`,
          ligne: p.theme.ligne,
        });
      } else tout.theme = p.theme;
    }
    for (const genre of ['entete', 'pied'] as const) {
      const autre = p[genre];
      if (!autre) continue;
      if (tout[genre]) {
        diagnostics.push({
          gravite: 'erreur',
          message: `un seul « ${genre} » par application : il est déjà déclaré (ligne ${tout[genre]!.ligne}).`,
          ligne: autre.ligne,
        });
      } else tout[genre] = autre;
    }
    tout.styles.push(...p.styles);
    tout.fichiersStyle.push(...p.fichiersStyle);
    tout.donneesFichiers.push(...p.donneesFichiers);
    tout.partages.push(...p.partages);
    // Un composant (Humalis ou React) n'a qu'une définition dans toute l'application.
    for (const composant of [...p.composants, ...p.composantsReact]) {
      const deja = [...tout.composants, ...tout.composantsReact].find((x) => x.nom === composant.nom);
      if (deja) {
        diagnostics.push({ gravite: 'erreur', message: `le composant « ${composant.nom} » est déjà défini (ligne ${deja.ligne}).`, ligne: composant.ligne });
      } else if (composant.type === 'ComposantReact') tout.composantsReact.push(composant);
      else tout.composants.push(composant);
    }
  }
  return tout;
}

const parFichierEtLigne = (a: Diagnostic, b: Diagnostic) =>
  (a.fichier ?? '').localeCompare(b.fichier ?? '') || a.ligne - b.ligne;

/** Ajoute un décalage à chaque « ligne » de l'arbre d'un fichier utilisé. */
function decaler(noeud: unknown, decalage: number): void {
  if (Array.isArray(noeud)) {
    for (const n of noeud) decaler(n, decalage);
  } else if (noeud !== null && typeof noeud === 'object') {
    const objet = noeud as Record<string, unknown>;
    for (const [cle, valeur] of Object.entries(objet)) {
      if (cle === 'ligne' && typeof valeur === 'number') objet[cle] = valeur + decalage;
      else decaler(valeur, decalage);
    }
  }
}

// ─── Les chemins, écrits à la main (le compilateur n'utilise pas node:path) ─

function normaliser(chemin: string): string {
  const parties: string[] = [];
  const absolu = chemin.startsWith('/');
  for (const partie of chemin.replace(/\\/g, '/').split('/')) {
    if (partie === '' || partie === '.') continue;
    if (partie === '..' && parties.length > 0 && parties[parties.length - 1] !== '..') parties.pop();
    else if (partie !== '..' || !absolu) parties.push(partie);
  }
  return (absolu ? '/' : '') + parties.join('/');
}

const dossier = (chemin: string) => (chemin.includes('/') ? chemin.slice(0, chemin.lastIndexOf('/')) || '/' : '');
const nomFichier = (chemin: string) => chemin.slice(chemin.lastIndexOf('/') + 1);
const joindre = (base: string, chemin: string) =>
  normaliser(chemin.startsWith('/') || base === '' ? chemin : `${base}/${chemin}`);

/** Le chemin vu depuis `base` : « pages/panier.humalis », « ../commun.humalis ». */
function relatif(base: string, chemin: string): string {
  if (base === '') return chemin;
  const a = base.split('/').filter(Boolean);
  const b = chemin.split('/').filter(Boolean);
  let commun = 0;
  while (commun < a.length && commun < b.length && a[commun] === b[commun]) commun++;
  return [...Array(a.length - commun).fill('..'), ...b.slice(commun)].join('/');
}
