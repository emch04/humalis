/**
 * Trouver les usages d'un nom et le renommer (revue du 12 novembre 2026, E2) : du nom sous le curseur
 * à chaque endroit du projet qui le désigne, dans le fichier ouvert et dans ceux qu'il utilise.
 *
 * Rien n'est deviné : chaque mot du projet qui s'écrit comme le nom est relu avec la même règle que
 * « aller à la déclaration » (`symboleA`), et n'est gardé que s'il mène à la même déclaration. Deux
 * variables « nom » de deux pages ne se mélangent donc pas.
 */
import { estMotLiaison, estMotReserve } from '../../../../src/lexer/motsCles.js';
import { jetonsDeLigne, longueurJeton, texteJeton } from './document.js';
import { symboleA, type Existe, type Lieu } from './definition.js';
import { GENRES_VARIABLE, indexer, variableVisible, type GenreSymbole, type Index, type Symbole } from './portees.js';
import { principal, type Projet } from './projet.js';

const sansBarre = (adresse: string) => adresse.replace(/^\/+/, '');
const estSymbole = (s: Symbole | Lieu | undefined): s is Symbole => s !== undefined && 'genre' in s;
const meme = (a: Symbole, b: Symbole) => a.genre === b.genre && a.nom === b.nom && a.fichier === b.fichier && a.ligne === b.ligne && a.colonne === b.colonne;

/** Le symbole sous le curseur, s'il y en a un. */
export function symboleSousLeCurseur(index: Index, ligne: number, colonne: number, existe?: Existe): Symbole | undefined {
  const s = symboleA(index, ligne, colonne, existe);
  return estSymbole(s) ? s : undefined;
}

/** Les endroits d'un document qui désignent ce symbole : mots, textes entiers ("accueil") et {nom} dans un texte. */
function usagesDansLeDocument(index: Index, symbole: Symbole, existe?: Existe): Lieu[] {
  const { chemin, doc } = principal(index.projet);
  const lieux: Lieu[] = [];
  const garder = (ligne: number, colonne: number, fin: number) => {
    const ici = symboleA(index, ligne, colonne, existe);
    if (estSymbole(ici) && meme(ici, symbole)) lieux.push({ ...(chemin !== undefined ? { fichier: chemin } : {}), ligne, colonne, fin });
  };
  doc.lignes.forEach((texte, i) => {
    const ligne = i + 1;
    if (!texte.includes(symbole.nom) && !texte.includes(sansBarre(symbole.nom))) return;
    for (const jeton of jetonsDeLigne(texte, ligne)) {
      if (jeton.type === 'PONCTUATION' || jeton.type === 'LIAISON') continue;
      if (jeton.type !== 'CHAINE') {
        if (texteJeton(jeton) === symbole.nom || jeton.valeur === symbole.nom) garder(ligne, jeton.colonne, jeton.colonne + longueurJeton(jeton));
        continue;
      }
      // Le texte entre guillemets, tel qu'il est écrit dans la ligne.
      const debut = jeton.colonne + 1;
      const ecrit = texte.slice(debut - 1, debut - 1 + jeton.valeur.length);
      if (ecrit !== jeton.valeur) continue; // Un texte avec un caractère échappé : ses colonnes ne se devinent pas.
      if (sansBarre(jeton.valeur) === sansBarre(symbole.nom)) {
        const barre = jeton.valeur.length - sansBarre(jeton.valeur).length;
        garder(ligne, debut + barre, debut + jeton.valeur.length);
        continue;
      }
      // « {prix} », « {p.prix} », « {nombre de panier} » : le nom, où qu'il soit lu entre les accolades.
      if (!GENRES_VARIABLE.includes(symbole.genre)) continue;
      const visible = variableVisible(index, symbole.nom, ligne);
      if (!visible || !meme(visible, symbole)) continue;
      const mot = new RegExp(`(?<![.\\p{L}\\p{N}_])${symbole.nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'gu');
      for (const accolades of jeton.valeur.matchAll(/\{([^{}]*)\}/g)) {
        for (const trouve of accolades[1]!.matchAll(mot)) {
          const depart = debut + accolades.index! + 1 + trouve.index!;
          lieux.push({ ...(chemin !== undefined ? { fichier: chemin } : {}), ligne, colonne: depart, fin: depart + symbole.nom.length });
        }
      }
    }
  });
  return lieux;
}

/** Le même projet, vu depuis un autre de ses fichiers. */
const vuDepuis = (projet: Projet, k: number): Projet => ({ fichiers: [projet.fichiers[k]!, ...projet.fichiers.filter((_, i) => i !== k)] });

/**
 * Chaque endroit du projet qui désigne le nom sous le curseur, sa déclaration comprise (sauf si
 * `sansDeclaration`). Rien si le curseur n'est sur aucun nom connu.
 */
export function usages(index: Index, ligne: number, colonne: number, options: { sansDeclaration?: boolean; existe?: Existe } = {}): { symbole: Symbole; lieux: Lieu[] } | undefined {
  const symbole = symboleSousLeCurseur(index, ligne, colonne, options.existe);
  if (!symbole) return undefined;
  const lieux = usagesDansLeDocument(index, symbole, options.existe);
  // Les autres fichiers du projet, chacun lu comme le fichier ouvert.
  index.projet.fichiers.forEach((fichier, k) => {
    if (k === 0 || fichier.chemin === undefined) return;
    lieux.push(...usagesDansLeDocument(indexer(vuDepuis(index.projet, k)), symbole, options.existe));
  });
  // Un nom écrit entre guillemets (« page "accueil" ») est déclaré avec ses guillemets : on ne garde que le nom.
  const entreGuillemets = symbole.fin - symbole.colonne === symbole.nom.length + 2;
  const declaration: Lieu = {
    ...(symbole.fichier !== undefined ? { fichier: symbole.fichier } : {}),
    ligne: symbole.ligne,
    colonne: symbole.colonne + (entreGuillemets ? 1 : 0),
    fin: symbole.fin - (entreGuillemets ? 1 : 0),
  };
  const cle = (l: Lieu) => `${l.fichier ?? ''}\u0000${l.ligne}\u0000${l.colonne}`;
  const vus = new Set<string>();
  const tous = [declaration, ...lieux].filter((l) => !vus.has(cle(l)) && Boolean(vus.add(cle(l))));
  const gardes = options.sansDeclaration ? tous.filter((l) => cle(l) !== cle(declaration)) : tous;
  return { symbole, lieux: gardes.sort((a, b) => (a.fichier ?? '').localeCompare(b.fichier ?? '') || a.ligne - b.ligne || a.colonne - b.colonne) };
}

/** Les genres qui se renomment : ceux dont le nom n'engage que le programme, pas les données déjà enregistrées. */
const RENOMMABLES: readonly GenreSymbole[] = ['variable', 'calcul', 'partagee', 'boucle', 'parametrePage', 'parametreComposant', 'parametreFonction', 'fonction', 'page', 'composant'];
const ECRITS_ENTRE_GUILLEMETS: readonly GenreSymbole[] = ['page'];

const POURQUOI_PAS: Partial<Record<GenreSymbole, string>> = {
  champDonnee: 'renommer un champ change les fiches déjà enregistrées : écrivez le nouveau nom suivi de (avant "ancien nom") dans la donnée, puis corrigez les pages',
  donnee: 'renommer une donnée change la table où ses fiches sont rangées : faites-le à la main, avec une sauvegarde',
  route: 'renommer une route change l’adresse que les applications déjà installées appellent : faites-le à la main',
  serveur: 'le nom du serveur est aussi celui de son projet produit : changez-le à la main',
  element: 'un élément se désigne par son texte ou par « avec nom » : changez-le à la main, là où il est écrit',
  composantReact: 'ce composant vient d’un fichier écrit hors de Humalis : renommez-le dans ce fichier',
};

/** Ce qui se renomme sous le curseur : le nom et sa place ; sinon, pourquoi pas. */
export function preparerRenommage(index: Index, ligne: number, colonne: number, existe?: Existe): { symbole: Symbole; lieu: Lieu } | { refus: string } {
  const trouves = usages(index, ligne, colonne, { existe });
  if (!trouves) return { refus: 'il n’y a pas de nom à renommer ici' };
  const { symbole, lieux } = trouves;
  if (!RENOMMABLES.includes(symbole.genre)) return { refus: POURQUOI_PAS[symbole.genre] ?? 'ce nom ne se renomme pas' };
  const { chemin } = principal(index.projet);
  const ici = lieux.find((l) => (l.fichier ?? chemin) === chemin && l.ligne === ligne && l.colonne <= colonne && colonne <= l.fin);
  return ici ? { symbole, lieu: ici } : { refus: 'il n’y a pas de nom à renommer ici' };
}

/** Un nouveau nom acceptable pour ce symbole ; sinon, pourquoi pas. */
export function nomRefuse(index: Index, symbole: Symbole, nouveau: string): string | undefined {
  if (nouveau === symbole.nom) return 'c’est déjà son nom';
  if (ECRITS_ENTRE_GUILLEMETS.includes(symbole.genre)) {
    if (nouveau.trim() === '' || /["\n\r{}]/.test(nouveau)) return 'un nom entre guillemets ne peut être vide, ni contenir de guillemet, d’accolade ou de retour à la ligne';
  } else {
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(nouveau)) return 'un nom s’écrit avec des lettres, des chiffres et « _ », sans espace, et ne commence pas par un chiffre';
    if (estMotLiaison(nouveau)) return `« ${nouveau} » est un petit mot que Humalis saute en lisant : il ne peut pas servir de nom`;
    if (estMotReserve(nouveau)) return `« ${nouveau} » est un mot réservé du langage`;
  }
  // Un autre nom du même genre, dans tout le projet : le renommage mélangerait deux choses.
  const famille = (g: GenreSymbole) => (['variable', 'calcul', 'partagee', 'boucle', 'parametrePage', 'parametreComposant', 'parametreFonction'].includes(g) ? 'valeur' : g);
  const pris = index.symboles.some((s) => s !== symbole && famille(s.genre) === famille(symbole.genre) && s.nom === nouveau);
  return pris ? `« ${nouveau} » existe déjà : deux noms différents deviendraient le même` : undefined;
}

/** Le renommage : chaque endroit à réécrire, par fichier ; sinon, pourquoi il est refusé. */
export function renommer(index: Index, ligne: number, colonne: number, nouveau: string, existe?: Existe): { lieux: Lieu[] } | { refus: string } {
  const pret = preparerRenommage(index, ligne, colonne, existe);
  if ('refus' in pret) return pret;
  const refus = nomRefuse(index, pret.symbole, nouveau);
  if (refus) return { refus };
  return { lieux: usages(index, ligne, colonne, { existe })!.lieux };
}
