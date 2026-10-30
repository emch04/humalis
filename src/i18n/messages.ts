/**
 * Les messages intégrés de Humalis, en français et en anglais (plan
 * 2026-10-30-qualite-publication, T10) : ceux que le projet produit montre
 * de lui-même (« Réessayer », la page introuvable, les erreurs de champ, les
 * boutons du carrousel, les noms lus par les lecteurs d'écran).
 *
 * Sans bloc « langues », rien ne change : les générateurs écrivent ces
 * textes en français, comme avant, octet pour octet. Avec des langues, un
 * message devient `t({ fr: '…', en: '…' })`, une ligne par message, sans
 * toucher à la logique qui l'emploie.
 */
import type { Saisie, Valeur } from '../ri/types.js';

/** Un texte dans chaque langue disponible. */
export type Versions = Record<'fr' | 'en', string> & {
  /**
   * Vrai pour un message qu'une page écrit elle-même (le texte d'un
   * `<summary>`) : il est traduit dans les pages aussi, à cet endroit précis.
   */
  page?: true;
};

/**
 * Les messages fixes, tels que les générateurs les écrivent en français.
 * Un message qui porte des valeurs (« Note : ${nombre} sur ${maximum} ») est
 * écrit comme dans le code produit, gabarit compris.
 */
export const MESSAGES: Versions[] = [
  { fr: 'Réessayer', en: 'Try again' },
  { fr: "Le serveur n'a pas répondu. Réessayez dans un instant.", en: 'The server did not answer. Try again in a moment.' },
  { fr: 'Email ou mot de passe incorrect.', en: 'Incorrect email or password.' },
  { fr: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.', en: 'Too many sign-in attempts. Try again in a few minutes.' },
  { fr: 'Trop de demandes en peu de temps. Patientez un moment, puis réessayez.', en: 'Too many requests in a short time. Wait a moment, then try again.' },
  { fr: "Ce que vous cherchez n'existe pas.", en: 'What you are looking for does not exist.' },
  { fr: 'Connectez-vous pour continuer.', en: 'Sign in to continue.' },
  { fr: 'Page introuvable', en: 'Page not found' },
  { fr: "Cette page n'existe pas.", en: 'This page does not exist.' },
  { fr: "Revenir à l'accueil", en: 'Back to the home page' },
  { fr: 'Précédent', en: 'Previous' },
  { fr: 'Suivant', en: 'Next' },
  { fr: 'Chargement', en: 'Loading' },
  { fr: 'Diminuer', en: 'Decrease' },
  { fr: 'Augmenter', en: 'Increase' },
  { fr: 'Quantité', en: 'Quantity' },
  { fr: 'Code QR', en: 'QR code' },
  { fr: "Fil d'Ariane", en: 'Breadcrumb' },
  { fr: 'Choisissez…', en: 'Choose…' },
  { fr: 'Vérification…', en: 'Checking…' },
  { fr: 'Note : ${nombre} sur ${maximum}', en: 'Rating: ${nombre} out of ${maximum}' },
  { fr: 'Note : ${valeur} sur ${maximum}', en: 'Rating: ${valeur} out of ${maximum}' },
  { fr: '${i + 1} sur ${maximum}', en: '${i + 1} out of ${maximum}' },
  { fr: 'Diapositive ${i + 1} sur ${pages}', en: 'Slide ${i + 1} of ${pages}' },
  { fr: 'Diapositive ${i + 1} sur ${total}', en: 'Slide ${i + 1} of ${total}' },
  // La carte : les commandes de zoom, la liste des lieux et ses liens.
  { fr: 'Agrandir', en: 'Zoom in' },
  { fr: 'Réduire', en: 'Zoom out' },
  { fr: 'Ouvrir dans OpenStreetMap', en: 'Open in OpenStreetMap' },
  { fr: 'Ouvrir dans OpenStreetMap : ${lieu.nom}', en: 'Open in OpenStreetMap: ${lieu.nom}' },
  { fr: 'Les lieux de la carte : ${nom}', en: 'Places on the map: ${nom}' },
  // Les interactions : messages, copier et partager, fenêtre, question, « Voir plus », réordonner.
  // Les graphiques : le dessin, sa table de données et ce qu'écrit la représentation intermédiaire.
  { fr: 'Graphique en courbe', en: 'Line chart' },
  { fr: 'Graphique en barres', en: 'Bar chart' },
  { fr: 'Graphique en camembert', en: 'Pie chart' },
  { fr: 'Valeur', en: 'Value' },
  { fr: 'Libellé', en: 'Label' },
  { fr: 'Voir les données', en: 'View the data' },
  { fr: 'Cacher les données', en: 'Hide the data' },
  { fr: 'Les données du graphique', en: 'The chart data' },
  { fr: 'Aucune donnée à afficher.', en: 'No data to display.' },
  // L'audio : le lecteur du téléphone et la transcription.
  { fr: 'Lire la transcription', en: 'Read the transcript', page: true },
  { fr: 'Lecture', en: 'Play' },
  // Le choix et l'envoi d'un fichier.
  { fr: 'Ce fichier', en: 'This file' },
  { fr: '${sujet} est trop gros : ${ecrireTaille(fichier.size)}, le maximum est ${ecrireTaille(maximum)}.', en: '${sujet} is too large: ${ecrireTaille(fichier.size)}, the maximum is ${ecrireTaille(maximum)}.' },
  { fr: "${sujet} n'est pas ${familles.map((f) => REFUS_DE_TYPE[f.nom]).join(' ni ')}.", en: "${sujet} is not ${familles.map((f) => REFUS_DE_TYPE[f.nom]).join(' or ')}." },
  { fr: 'une image', en: 'an image' },
  { fr: 'un son', en: 'a sound' },
  { fr: 'une vidéo', en: 'a video' },
  { fr: 'un PDF', en: 'a PDF' },
  { fr: 'un document', en: 'a document' },
  { fr: ' Mo', en: ' MB' },
  { fr: ' Ko', en: ' KB' },
  { fr: ' octets', en: ' bytes' },
  { fr: 'Ce fichier est trop gros pour le serveur.', en: 'This file is too large for the server.' },
  { fr: "Choisissez d'abord un fichier.", en: 'Choose a file first.' },
  { fr: 'AAAA-MM-JJ', en: 'YYYY-MM-DD' },
  { fr: 'Fermer le message', en: 'Close the message' },
  { fr: 'Aller au contenu', en: 'Skip to content' },
  { fr: 'Fermer', en: 'Close' },
  { fr: 'Copié', en: 'Copied' },
  { fr: 'Copier', en: 'Copy' },
  { fr: 'Copie impossible.', en: 'Could not copy.' },
  { fr: 'Lien copié : il ne reste qu’à le coller.', en: 'Link copied: paste it wherever you like.' },
  { fr: 'Texte copié : il ne reste qu’à le coller.', en: 'Text copied: paste it wherever you like.' },
  { fr: 'Partage impossible.', en: 'Could not share.' },
  { fr: 'Oui', en: 'Yes' },
  { fr: 'Non', en: 'No' },
  { fr: 'Voir plus', en: 'See more' },
  { fr: 'Monter', en: 'Move up' },
  { fr: 'Descendre', en: 'Move down' },
  { fr: 'élément déplaçable', en: 'movable item' },
  { fr: 'Annulé.', en: 'Cancelled.' },
  { fr: 'position ${i + 1} sur ${dernier.current.liste.length}', en: 'position ${i + 1} of ${dernier.current.liste.length}' },
  { fr: 'Pris : ${nommer(actuelle[index])}, ${position(index)}. Flèches pour déplacer, Espace pour déposer, Échap pour annuler.', en: 'Picked up: ${nommer(actuelle[index])}, ${position(index)}. Arrows to move, Space to drop, Escape to cancel.' },
  { fr: 'Déposé : ${nommer(actuelle[index])}, ${position(index)}.', en: 'Dropped: ${nommer(actuelle[index])}, ${position(index)}.' },
  { fr: 'Déplacé en ${position(vers)}.', en: 'Moved to ${position(vers)}.' },
  { fr: 'Déplacé en position ${vers + 1} sur ${copie.length}.', en: 'Moved to position ${vers + 1} of ${copie.length}.' },
  { fr: '${nommer(liste[index])}, position ${index + 1} sur ${liste.length}', en: '${nommer(liste[index])}, position ${index + 1} of ${liste.length}' },
];

/**
 * Un message intégré dans chaque langue du site, la langue de base en premier ;
 * rien si le message n'est pas dans la table. Sert aux textes que la
 * représentation intermédiaire écrit elle-même (« Graphique en courbe »).
 */
export function messageEnLangues(fr: string, codes: string[]): MessageEnLangues | undefined {
  const message = MESSAGES.find((m) => m.fr === fr);
  // Une seule langue (ou aucune) : le message reste celui du code produit d'avant.
  return message && codes.length > 1 ? codes.map((code) => ({ code, texte: message[code === 'en' ? 'en' : 'fr'] })) : undefined;
}

/** Les erreurs de champ, avant l'envoi d'un formulaire : le libellé du champ dans la langue du message. */
const CHAMPS = {
  cocher: { fr: (l: string) => `Cochez « ${l} » pour continuer.`, en: (l: string) => `Check “${l}” to continue.` },
  choisir: { fr: (l: string) => `Choisissez une valeur pour « ${l} ».`, en: (l: string) => `Choose a value for “${l}”.` },
  obligatoire: { fr: (l: string) => `Le champ « ${l} » est obligatoire.`, en: (l: string) => `The field “${l}” is required.` },
  email: {
    fr: (l: string) => `« ${l} » n’a pas la forme d’une adresse email (par exemple nom@exemple.cd).`,
    en: (l: string) => `“${l}” does not look like an email address (for example name@example.com).`,
  },
  date: {
    fr: (l: string) => `« ${l} » doit être une date écrite AAAA-MM-JJ (par exemple 2026-01-31).`,
    en: (l: string) => `“${l}” must be a date written YYYY-MM-DD (for example 2026-01-31).`,
  },
  heure: {
    fr: (l: string) => `« ${l} » doit être une heure écrite HH:MM (par exemple 14:30).`,
    en: (l: string) => `“${l}” must be a time written HH:MM (for example 14:30).`,
  },
  adresseWeb: {
    fr: (l: string) => `« ${l} » doit être une adresse web complète, qui commence par https://.`,
    en: (l: string) => `“${l}” must be a full web address, starting with https://.`,
  },
  nombre: { fr: (l: string) => `« ${l} » doit être un nombre.`, en: (l: string) => `“${l}” must be a number.` },
  auMoins: { fr: (l: string, n = 0) => `« ${l} » doit être au moins ${n}.`, en: (l: string, n = 0) => `“${l}” must be at least ${n}.` },
  auPlus: { fr: (l: string, n = 0) => `« ${l} » doit être au plus ${n}.`, en: (l: string, n = 0) => `“${l}” must be at most ${n}.` },
};

/** Un message dans chaque langue du site : la langue et son texte (le français seul sans bloc « langues »). */
export type MessageEnLangues = { code: string; texte: string }[];

/**
 * Ce qui est vérifié avant d'envoyer un formulaire, pour un champ : des
 * paires (condition d'erreur, message). `libelles` donne le libellé du champ
 * dans chaque langue du site ; sans langues, le français seul. Cela aide la
 * personne ; cela ne protège rien (le serveur vérifie de nouveau).
 */
export function verificationsDuChamp(variable: string, saisie: Saisie | undefined, libelles: { code: string; libelle: string }[]): [string, MessageEnLangues][] {
  const sorte = saisie?.sorte ?? 'texte';
  const rempli = `${variable}.trim() !== ''`;
  const message = (genre: keyof typeof CHAMPS, nombre?: number): MessageEnLangues =>
    libelles.map(({ code, libelle }) => ({ code, texte: (CHAMPS[genre][code === 'en' ? 'en' : 'fr'] as (l: string, n?: number) => string)(libelle, nombre) }));
  const resultat: [string, MessageEnLangues][] = [];
  if (saisie?.obligatoire) {
    if (sorte === 'case') resultat.push([`!${variable}`, message('cocher')]);
    else if (sorte === 'choix' || sorte === 'liste') resultat.push([`${variable} === ''`, message('choisir')]);
    else resultat.push([`${variable}.trim() === ''`, message('obligatoire')]);
  }
  const forme = (motif: string, genre: keyof typeof CHAMPS) => resultat.push([`${rempli} && !${motif}.test(${variable}.trim())`, message(genre)]);
  switch (sorte) {
    case 'email':
      forme('/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/', 'email');
      break;
    case 'date':
      forme('/^\\d{4}-\\d{2}-\\d{2}$/', 'date');
      break;
    case 'heure':
      forme('/^\\d{2}:\\d{2}$/', 'heure');
      break;
    case 'adresseWeb':
      forme('/^https?:\\/\\/\\S+$/', 'adresseWeb');
      break;
    case 'nombre': {
      const nombre = `Number(${variable}.replace(',', '.'))`;
      resultat.push([`${rempli} && Number.isNaN(${nombre})`, message('nombre')]);
      if (saisie?.minimum !== undefined) resultat.push([`${rempli} && ${nombre} < ${saisie.minimum}`, message('auMoins', saisie.minimum)]);
      if (saisie?.maximum !== undefined) resultat.push([`${rempli} && ${nombre} > ${saisie.maximum}`, message('auPlus', saisie.maximum)]);
      break;
    }
  }
  return resultat;
}

/** Les versions écrites en clair d'un libellé, par langue (« en » → « Name ») ; vide sans versions. */
export function libellesEnLangues(valeur: Valeur): Map<string, string> {
  const versions = new Map<string, string>();
  if (valeur.type !== 'texte') return versions;
  for (const version of valeur.versions ?? []) {
    if (version.parties.every((p) => 'texte' in p)) versions.set(version.code, version.parties.map((p) => ('texte' in p ? p.texte : '')).join(''));
  }
  return versions;
}

/** Une chaîne JavaScript entre apostrophes. */
const apostrophes = (texte: string) => `'${texte.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

/** Le message en code : une chaîne seule, ou `t({ fr: '…', en: '…' })` avec plusieurs langues. */
export function messageEnCode(message: MessageEnLangues, chaine: (texte: string) => string): string {
  if (message.length === 1) return chaine(message[0].texte);
  return `t({ ${message.map((m) => `${m.code}: ${apostrophes(m.texte)}`).join(', ')} })`;
}

/** Les versions d'un message fixe, dans l'ordre des langues du site (la langue de base en premier). */
function enCode(message: Versions, codes: string[], gabarit: boolean): string {
  const ecrire = (texte: string) => (gabarit ? `\`${texte}\`` : apostrophes(texte));
  return `t({ ${codes.map((code) => `${code}: ${ecrire(message[code === 'en' ? 'en' : 'fr'])}`).join(', ')} })`;
}

const echapperRegex = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Avec des langues : les messages fixes d'un fichier produit passent par
 * `t()`. Sont reconnus, pour chaque message : le texte entre apostrophes ou
 * entre guillemets, l'attribut JSX (`aria-label="Précédent"`), le texte
 * JSX (`>Page introuvable<`, ou seul sur sa ligne) et le gabarit
 * (`` `Note : ${nombre} sur ${maximum}` ``).
 *
 * Dans une page (`partout` faux), où les textes de la personne côtoient ceux
 * de Humalis, seuls les attributs écrits par Humalis sont traduits
 * (`aria-label="Quantité"`, `'aria-label': 'Diminuer'`) : un texte de la
 * personne qui s'écrirait « Suivant » reste le sien.
 * `importer` dit d'où prendre `t` (« ./langue ») ; absent, `t` est déjà là.
 */
export function traduireMessages(code: string, codes: string[], options: { importer?: string; partout: boolean }): string {
  // Chaque message traduit est d'abord mis de côté (une marque), pour ne pas être traduit deux fois.
  const traduits: string[] = [];
  const marque = (texte: string) => `\u0000${traduits.push(texte) - 1}\u0000`;
  let resultat = code;
  for (const message of MESSAGES) {
    const gabarit = message.fr.includes('${');
    const traduit = marque(enCode(message, codes, gabarit));
    if (gabarit) {
      if (options.partout) resultat = resultat.split(`\`${message.fr}\``).join(traduit);
      continue;
    }
    const simple = apostrophes(message.fr);
    const double = JSON.stringify(message.fr);
    // aria-label="Précédent" (JSX) : l'attribut devient une expression.
    resultat = resultat.replace(new RegExp(`=${echapperRegex(double)}(?=[\\s/>])`, 'g'), `={${traduit}}`);
    // 'aria-label': 'Diminuer' (le site statique).
    resultat = resultat.split(`'aria-label': ${simple}`).join(`'aria-label': ${traduit}`);
    // Le texte d'un <summary> que la page écrit elle-même (la transcription d'un son), en JSX et dans le site statique.
    if (message.page && !options.partout) {
      resultat = resultat.split(`<summary>${message.fr}</summary>`).join(`<summary>{${traduit}}</summary>`);
      // Le site statique l'écrit sur plusieurs lignes : creer('summary', {  },\n 'Lire la transcription',
      resultat = resultat.replace(new RegExp(`(creer\\('summary', \\{\\s*\\},\\s*)${echapperRegex(simple)}`, 'g'), (_, debut: string) => `${debut}${traduit}`);
    }
    if (!options.partout) continue;
    resultat = resultat
      // >Page introuvable< ou « Réessayer » seul sur sa ligne : le texte JSX devient une expression.
      .replace(new RegExp(`>${echapperRegex(message.fr)}<`, 'g'), `>{${traduit}}<`)
      .replace(new RegExp(`^(\\s+)${echapperRegex(message.fr)}$`, 'gm'), `$1{${traduit}}`)
      .split(simple)
      .join(traduit)
      .split(double)
      .join(traduit);
  }
  resultat = resultat.replace(/\u0000(\d+)\u0000/g, (_, rang: string) => traduits[Number(rang)]);
  if (resultat === code || options.importer === undefined) return resultat;
  // t est déjà pris à la langue (un composant qui a ses propres textes) : rien à importer.
  if (/\bconst \{[^}]*\bt\b[^}]*\} = useLangue\(\)/.test(resultat) || /import \{[^}]*\bt\b[^}]*\} from '[^']*langue'/.test(resultat)) return resultat;
  const ligne = `import { t } from '${options.importer}';\n`;
  // Après le dernier import du fichier, sinon tout en haut.
  const imports = [...resultat.matchAll(/^import [^\n]*\n/gm)];
  const fin = imports.length > 0 ? imports[imports.length - 1].index! + imports[imports.length - 1][0].length : 0;
  return resultat.slice(0, fin) + ligne + resultat.slice(fin);
}

/** Le chemin relatif d'un fichier vers un autre du même projet (« src/pages/A.tsx » → « ../humalis/langue »). */
function relatif(depuis: string, vers: string): string {
  const dossier = depuis.split('/').slice(0, -1);
  const cible = vers.split('/');
  let commun = 0;
  while (commun < dossier.length && dossier[commun] === cible[commun]) commun++;
  const remonter = dossier.length - commun;
  return (remonter === 0 ? './' : '../'.repeat(remonter)) + cible.slice(commun).join('/');
}

/**
 * Les messages intégrés d'un projet web, bureau ou mobile, en plusieurs
 * langues. `outils` est le dossier de Humalis (« src/humalis/ » ou
 * « humalis/ ») ; ses fichiers et la page introuvable sont traduits partout,
 * les pages et les composants seulement dans leurs attributs.
 */
export function messagesDuProjet(fichiers: Map<string, string>, codes: string[], outils: string, introuvable: string): void {
  const langue = `${outils}langue`;
  // Les graphiques : les nombres suivent la langue, avant que les messages soient traduits.
  const adapter = (nom: string, adaptation: (code: string) => string) => {
    if (fichiers.has(`${outils}${nom}`)) fichiers.set(`${outils}${nom}`, adaptation(fichiers.get(`${outils}${nom}`)!));
  };
  adapter('graphique.tsx', graphiqueEnLangues);
  adapter('graphique-geometrie.js', geometrieEnLangues);
  adapter('graphique-geometrie.d.ts', declarationsGeometrieEnLangues);
  for (const [chemin, contenu] of fichiers) {
    if (!/\.tsx?$/.test(chemin) || chemin === `${langue}.tsx`) continue;
    const partout = chemin.startsWith(outils) || chemin === introuvable;
    fichiers.set(chemin, traduireMessages(contenu, codes, { importer: relatif(chemin, langue), partout }));
  }
  // La taille d'un fichier choisi, le lecteur de son : après les messages, t est alors importé.
  adapter('choix-fichier.tsx', choixFichierEnLangues);
  adapter('lecteur.tsx', lecteurEnLangues);
}

/** Les messages intégrés d'un site statique : humalis.js partout, les scripts des pages dans leurs attributs (t est pris à humalis). */
export function messagesDuSiteStatique(fichiers: Map<string, string>, codes: string[]): void {
  for (const [chemin, contenu] of fichiers) {
    if (!chemin.endsWith('.js') || chemin === 'humalis/qrcode.js') continue;
    const partout = chemin === 'humalis/humalis.js' || chemin === 'pages/introuvable-humalis.js';
    let traduit = traduireMessages(chemin === 'humalis/graphique.js' ? graphiqueStatiqueEnLangues(contenu, codes) : contenu, codes, { partout });
    if (traduit !== contenu && chemin !== 'humalis/humalis.js') {
      // Le script prend t à humalis.js, comme ses autres outils.
      traduit = traduit.replace(/const \{ ([^}]*) \} = humalis;/g, (ligne, noms: string) => (/\bt\b/.test(noms) ? ligne : `const { ${noms}, t } = humalis;`));
    }
    fichiers.set(chemin, traduit);
  }
}

// ─── Les fichiers produits qui ont besoin de plus qu'un message ─────────────

/** Un message de la table, par son texte français (il y est, c'est une erreur de programmation sinon). */
function messageDe(fr: string): Versions {
  const message = MESSAGES.find((m) => m.fr === fr);
  if (!message) throw new Error(`message intégré inconnu : ${fr}`);
  return message;
}

/**
 * La géométrie des graphiques avec des langues : les nombres et les
 * pourcentages suivent la langue de la figure (`config.langue`), au lieu du
 * français seul. Sans langues, le fichier n'est pas touché.
 */
export function geometrieEnLangues(code: string): string {
  return code
    .replace(/^(\s*)\/\*\* Le nombre d'une ligne/m, "$1/** La région des nombres de la figure en cours de calcul (« fr-FR » ou « en-US »). */\n$1let REGION_GRAPHIQUE = 'fr-FR';\n\n$1/** Le nombre d'une ligne")
    .split("toLocaleString('fr-FR'")
    .join('toLocaleString(REGION_GRAPHIQUE')
    // Le programme donne toujours l'en-tête des libellés (dans chaque langue) : plus de repli en français.
    .replace("config.nomEtiquettes || 'Libellé'", "config.nomEtiquettes || ''")
    .replace(/^(\s*)function calculerGraphique\(config, lignes, formater, largeur\) \{\n/m, "$&$1  REGION_GRAPHIQUE = config.langue === 'en' ? 'en-US' : 'fr-FR';\n");
}

/** Les types de la géométrie avec des langues : la figure sait dans quelle langue écrire ses nombres. */
export function declarationsGeometrieEnLangues(code: string): string {
  return code.replace('  proportions?: readonly [number, number];\n', '  proportions?: readonly [number, number];\n  /** « fr » ou « en » : la langue des nombres de la figure. */\n  langue?: string;\n');
}

/**
 * Le composant graphique (web ou mobile) avec des langues : les montants et
 * les nombres suivent la langue courante, et le composant se redessine quand
 * elle change (même si la page n'écrit aucun texte à versions).
 */
export function graphiqueEnLangues(code: string): string {
  return code
    .replace('formaterArgent(valeur, devise) : formaterNombre(valeur)', 'formaterArgent(valeur, devise, langueActuelle()) : formaterNombre(valeur, langueActuelle())')
    .split('calculerGraphique(config,')
    .join('calculerGraphique({ ...config, langue: langueActuelle() },')
    .replace("import { formaterArgent, formaterNombre } from './outils';", "import { formaterArgent, formaterNombre } from './outils';\nimport { langueActuelle, useLangue } from './langue';")
    .replace(/^(export default function Graphique\([^\n]*\{\n)/m, '$1  useLangue();\n');
}

/**
 * Le choix d'un fichier avec des langues : la taille s'écrit « 8,2 Mo » en
 * français, « 8.2 MB » en anglais ; les noms de types se lisent à l'usage (une
 * propriété qui lit la langue courante) ; le composant suit la langue.
 */
export function choixFichierEnLangues(code: string): string {
  return code
    .split("toLocaleString('fr-FR'")
    .join("toLocaleString(t({ fr: 'fr-FR', en: 'en-US' })")
    .replace(/^  (\w+): (t\(\{[^\n]*\}\)),$/gm, (ligne, nom: string, valeur: string) => (['images', 'audio', 'videos', 'pdf', 'documents'].includes(nom) ? `  get ${nom}() {\n    return ${valeur};\n  },` : ligne))
    .replace("import { t } from './langue';", "import { t, useLangue } from './langue';")
    .replace(/^(export default function ChoixFichier\([^\n]*\{\n)/m, '$1  useLangue();\n');
}

/** Le lecteur de son du mobile avec des langues : il se redessine quand la langue change. */
export function lecteurEnLangues(code: string): string {
  return code
    .replace("import { t } from './langue';", "import { t, useLangue } from './langue';")
    .replace(/^(export default function Lecteur\([^\n]*\{\n)/m, '$1  useLangue();\n');
}

/**
 * Le script des graphiques du site statique avec des langues : les nombres, les
 * montants et les trois textes de la table suivent la langue courante.
 */
export function graphiqueStatiqueEnLangues(code: string, codes: string[]): string {
  let resultat = geometrieEnLangues(code)
    .replace(
      'devise ? (valeur) => humalis.formaterArgent(valeur, devise) : humalis.formaterNombre;',
      'devise ? (valeur) => humalis.formaterArgent(valeur, devise, humalis.langue()) : (valeur) => humalis.formaterNombre(valeur, humalis.langue());',
    )
    .replace('htmlDuGraphique(config, donnees, formateur(config.devise))', 'htmlDuGraphique({ ...config, langue: humalis.langue() }, donnees, formateur(config.devise))');
  for (const fr of ['Voir les données', 'Les données du graphique', 'Aucune donnée à afficher.']) {
    resultat = resultat.split(`>${fr}<`).join(`>' + humalis.${enCode(messageDe(fr), codes, false)} + '<`);
  }
  return resultat;
}
