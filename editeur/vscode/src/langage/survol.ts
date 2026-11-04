/**
 * Le survol (plan `2026-10-29-outils-editeur.md`, D6) : la fiche d'un mot,
 * prise dans la table de vocabulaire, ou ce qu'est un nom et où il est
 * déclaré.
 */
import { dirname, relative } from 'node:path';
import { chercher, entreesDe } from '../../../../src/vocabulaire/recherche.js';
import { normaliser } from '../../../../src/vocabulaire/normaliser.js';
import type { Categorie, Cible, Contexte, EntreeVocabulaire } from '../../../../src/vocabulaire/types.js';
import { longueurJeton, texteJeton } from './document.js';
import { entetes, genreBloc, type GenreBloc } from './blocs.js';
import { principal } from './projet.js';
import { jetonPlace, symboleA, type Lieu, type JetonPlace } from './definition.js';
import type { GenreSymbole, Index, Symbole } from './portees.js';

export interface Survol {
  /** Le texte à montrer, en Markdown. */
  markdown: string;
  /** Le mot survolé. */
  plage: Lieu;
}

const CATEGORIES: Record<Categorie, string> = {
  structure: 'structure',
  controle: 'contrôle',
  comparaison: 'comparaison',
  valeur: 'valeur',
  liaison: 'petit mot de liaison (sauté par le compilateur)',
  element: 'élément',
  option: 'option',
  style: 'style',
  valeurStyle: 'valeur de style',
  evenement: 'événement',
  action: 'action',
  etat: 'état',
  appareil: 'appareil',
  bureau: 'bureau',
  donnee: 'type de donnée',
  droit: "droit d'accès",
  saisie: 'sorte de champ',
};

const CIBLES: readonly Cible[] = ['web', 'mobile', 'desktop', 'serveur', 'statique'];

/** Un bout de code en ligne, qui reste lisible même s'il contient une apostrophe inverse ou une barre. */
const code = (texte: string) => {
  const sur = texte.replace(/\|/g, '\\|');
  return sur.includes('`') ? `\`\` ${sur} \`\`` : `\`${sur}\``;
};

/** La fiche d'une entrée de la table, en Markdown. */
export function fiche(entree: EntreeVocabulaire): string {
  const nom = entree.accentue ?? entree.mot;
  const parties = [`**${nom}** · ${CATEGORIES[entree.categorie]}`];
  if (entree.statut === 'prevu') parties.push('*Prévu : pas encore disponible.*');
  parties.push(entree.description);
  const formes = [...(entree.accentue ? [entree.mot] : []), ...entree.variantes];
  if (formes.length > 0) parties.push(`Aussi écrit : ${formes.map(code).join(', ')}`);
  if (entree.categorie !== 'liaison') {
    const lignes = CIBLES.map((c) => {
      const t = entree.cibles[c];
      return `| ${c} | ${t ? code(t.produit) + (t.note ? ` (${t.note.replace(/\|/g, '\\|')})` : '') : '—'} |`;
    });
    parties.push(['| Cible | Code produit |', '|---|---|', ...lignes].join('\n'));
  }
  if (entree.note) parties.push(`*${entree.note}*`);
  parties.push(`Exemple :\n\n\`\`\`humalis\n${entree.exemple}\n\`\`\``);
  return parties.join('\n\n');
}

/** La fiche du mot à cette place, s'il est dans la table. */
export function ficheDuMot(mot: string, contexte: Contexte): string | undefined {
  const entree = entreeDuMot(mot, contexte);
  return entree ? fiche(entree) : undefined;
}

/**
 * Les tournures de plusieurs mots : la table les range sous la phrase entière,
 * le survol se fait sur un de ses mots. La ligne et le bloc disent de quelle phrase il s'agit.
 */
const PHRASES: readonly { blocs: readonly GenreBloc[]; ligne: RegExp; mots: readonly string[]; entree: string }[] = [
  { blocs: ['site'], ligne: /^\s*erreurs\s+pendant\b/, mots: ['erreurs', 'pendant'], entree: 'erreurs pendant' },
  { blocs: ['serveur'], ligne: /^\s*connexion\s+google\b/, mots: ['connexion', 'google'], entree: 'connexion google' },
  { blocs: ['serveur'], ligne: /^\s*emails\b/, mots: ['emails', 'par', 'brevo'], entree: 'emails par brevo' },
  { blocs: ['serveur'], ligne: /^\s*invitations\b/, mots: ['invitations', 'vers'], entree: 'invitations vers' },
  { blocs: ['serveur'], ligne: /^\s*mot\s+de\s+passe\b/, mots: ['mot', 'de', 'passe', 'oublie', 'vers'], entree: 'mot de passe oublie vers' },
  { blocs: ['donnee'], ligne: /\bau\s+d[eé]part\b/, mots: ['au', 'depart'], entree: 'au depart' },
  { blocs: ['donnee'], ligne: /\bdu\s+site\b/, mots: ['du', 'site'], entree: 'du site' },
  { blocs: ['donnee'], ligne: /\bnon\s+vide\b/, mots: ['non', 'vide'], entree: 'non vide' },
  { blocs: ['donnee'], ligne: /\bcalcul[eé]\b/, mots: ['calcule', 'somme', 'plus'], entree: 'calcule somme nombre' },
  { blocs: ['donnee'], ligne: /\bau\s+plus\b/, mots: ['au', 'plus', 'par'], entree: 'au plus par' },
  { blocs: ['route'], ligne: /\bpar\s+identifiant\b/, mots: ['par', 'identifiant'], entree: 'par identifiant' },
  { blocs: ['route'], ligne: /^\s*quand\b/, mots: ['quand', 'est', 'cree'], entree: 'quand est cree envoyer email sujet admins' },
  { blocs: ['apresCreation'], ligne: /^\s*envoyer\s+email\b/, mots: ['envoyer', 'email', 'admins', 'aux', 'sujet'], entree: 'quand est cree envoyer email sujet admins' },
  { blocs: ['apresCreation'], ligne: /^\s*cr[eé]er\b/, mots: ['creer', 'avec', 'dans'], entree: 'creer avec dans' },
  { blocs: ['evenement'], ligne: /^\s*inviter\b/, mots: ['inviter', 'comme'], entree: 'inviter comme' },
  { blocs: ['evenement'], ligne: /^\s*demander\s+un\s+lien\b/, mots: ['demander', 'lien', 'mot', 'de', 'passe', 'pour'], entree: 'demander lien mot de passe pour' },
  { blocs: ['evenement'], ligne: /^\s*choisir\s+le\s+mot\b/, mots: ['choisir', 'mot', 'de', 'passe'], entree: 'choisir mot de passe' },
];

/** L'entrée de la phrase dont ce mot fait partie, à cette ligne. */
function entreeDeLaPhrase(lignes: readonly string[], ligne: number, mot: string): EntreeVocabulaire | undefined {
  const genre = genreBloc(lignes, entetes(lignes, ligne));
  const texte = lignes[ligne - 1] ?? '';
  const forme = normaliser(mot);
  const phrase = PHRASES.find((p) => p.blocs.includes(genre) && p.ligne.test(texte) && p.mots.includes(forme));
  return phrase && entreesDe(phrase.entree)[0];
}

function entreeDuMot(mot: string, contexte: Contexte): EntreeVocabulaire | undefined {
  const entrees = entreesDe(mot);
  return chercher(mot, contexte) ?? entrees.find((e) => e.statut === 'supporte') ?? entrees[0];
}

const STYLES = new Set(['couleur', 'fond', 'texte', 'taille', 'position', 'bordure']);

/** La place d'un mot dans sa ligne, au sens de la table (`Contexte`). */
export function contexteDuMot(lignes: readonly string[], ligne: number, place: JetonPlace): Contexte {
  const genre = genreBloc(lignes, entetes(lignes, ligne));
  if (genre === 'serveur' || genre === 'apresCreation') return 'serveur';
  if (genre === 'donnee') return 'donnee';
  if (genre === 'route') return 'route';
  const mots = place.avant.map((j) => normaliser(texteJeton(j)));
  const precedent = mots[mots.length - 1];
  if (mots.length === 0) return 'instruction';
  if (mots[0] === 'utiliser') return 'declaration';
  if (mots.includes('quand')) return 'evenement';
  if (precedent === 'est') return 'comparaison';
  if (mots.includes('avec')) return precedent !== undefined && STYLES.has(precedent) ? 'valeurStyle' : 'option';
  return 'expression';
}

const GENRES: Record<GenreSymbole, string> = {
  variable: 'variable',
  calcul: 'calcul (sa valeur se recalcule seule)',
  partagee: 'variable partagée entre les pages',
  boucle: 'variable de la boucle « pour chaque »',
  parametrePage: 'paramètre de la page (lu dans son adresse)',
  parametreComposant: 'paramètre du composant',
  parametreFonction: 'paramètre de la fonction',
  fonction: 'fonction',
  page: 'page',
  composant: 'composant écrit en Humalis',
  composantReact: 'composant React',
  serveur: 'serveur',
  donnee: 'donnée du serveur',
  champDonnee: 'champ',
  route: 'route du serveur',
  element: 'élément',
};

function decrire(index: Index, s: Symbole): string {
  const { chemin } = principal(index.projet);
  const titre =
    s.genre === 'page'
      ? `page « ${s.nom} »`
      : s.genre === 'route'
        ? `route « ${s.nom} » du serveur`
        : s.genre === 'champDonnee'
          ? `champ \`${s.nom}\` de la donnée \`${s.donnee}\``
          : s.genre === 'element'
            ? `${s.element} « ${s.nom} » de la page`
            : `${GENRES[s.genre]} \`${s.nom}\``;
  const ou =
    s.fichier !== undefined && s.fichier !== chemin
      ? `${chemin === undefined ? s.fichier : relative(dirname(chemin), s.fichier)}, ligne ${s.ligne}`
      : `ligne ${s.ligne}`;
  return `**${titre}**\n\nDéclaré ${ou} :\n\n\`\`\`humalis\n${s.texteLigne}\n\`\`\``;
}

export function survoler(index: Index, ligne: number, colonne: number): Survol | undefined {
  const { doc } = principal(index.projet);
  const place = jetonPlace(doc.lignes, ligne, colonne);
  if (!place) return undefined;
  const { jeton } = place;
  const plage = { ligne, colonne: jeton.colonne, fin: jeton.colonne + longueurJeton(jeton) };

  const symbole = symboleA(index, ligne, colonne);
  if (symbole && 'genre' in symbole) return { markdown: decrire(index, symbole), plage };
  if (symbole) return { markdown: `**fichier utilisé**\n\n${code(symbole.fichier ?? '')}`, plage };

  if (jeton.type === 'CHAINE' || jeton.type === 'NOMBRE') return undefined;
  const entree = entreeDeLaPhrase(doc.lignes, ligne, texteJeton(jeton)) ?? entreeDuMot(texteJeton(jeton), contexteDuMot(doc.lignes, ligne, place));
  return entree ? { markdown: fiche(entree), plage } : undefined;
}
