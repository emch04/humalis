import type { Page, Instruction, Element, Style } from '../parser/ast.js';
import type { Diagnostic } from './erreurs.js';
import { texteSimple } from './ecran.js';
import { contraste, encreSur, FOND_PAGE } from './couleurs.js';
import { COULEURS_CSS } from '../cibles/web/styles.js';

const SEUIL_NORMAL = 4.5;
const SEUIL_GRAND = 3;
const motsVides = new Set(['image', 'photo']);

/** Vérifications qui demandent une intention explicite de l'auteur. */
export function verifierAccessibilite(page: Page, theme: ReadonlyMap<string, { clair: string; sombre: string }>, modes: readonly ('clair' | 'sombre')[] = ['clair', 'sombre']): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const signaler = (gravite: Diagnostic['gravite'], message: string, ligne: number) =>
    diagnostics.push({ gravite, categorie: 'accessibilite', message, ligne });
  let titres = 0;
  let niveauPrecedent = 1;
  const liens = new Map<string, Set<string>>();
  const survols: { cible?: string; ligne: number }[] = [];
  const clics = new Set<string | undefined>();
  const parcours = (instructions: Instruction[], champs = new Map<string, number>()): void => {
    for (const instruction of instructions) {
      if (instruction.type === 'Element') {
        const element = instruction as Element;
        const texte = texteSimple(element.contenu);
        const option = (nom: string): Style | undefined => element.styles.find((s) => s.propriete === nom);
        if (['bouton', 'lien', 'champ'].includes(element.element) && texte !== undefined && texte.trim() === '') {
          signaler('erreur', `le ${element.element} n'a pas de texte. Écrivez un libellé entre guillemets.`, element.ligne);
        } else if (element.element === 'champ' && texte !== undefined) {
          if (!/\p{L}/u.test(texte)) signaler('avertissement', `le libellé « ${texte} » du champ ne contient aucune lettre.`, element.ligne);
          const deja = champs.get(texte.toLocaleLowerCase('fr'));
          if (deja !== undefined) signaler('avertissement', `deux champs du même formulaire portent « ${texte} » (premier ligne ${deja}). Donnez-leur des libellés différents.`, element.ligne);
          else champs.set(texte.toLocaleLowerCase('fr'), element.ligne);
        }
        if (element.element === 'image') {
          const description = option('description')?.valeur;
          // Une image sans description ni « decoratif » est déjà une erreur (décision M4, src/analyse/medias.ts).
          if (description !== undefined && (description.trim().length < 3 || motsVides.has(description.toLocaleLowerCase('fr')) || description === texte || /^IMG[_-]?\d+/i.test(description))) {
            signaler('avertissement', `la description « ${description} » de l'image ne dit rien. Décrivez ce qu'elle montre.`, element.ligne);
          }
        }
        if (element.element === 'icone' && !option('description') && !option('decoratif')) {
          signaler('avertissement', 'cette icône seule n’a pas de description pour le lecteur d’écran. Ajoutez « avec description "…" » ou « avec decoratif ». ', element.ligne);
        }
        if (element.element === 'etoiles' && !option('description')) {
          signaler('avertissement', 'ces étoiles n’ont pas de description explicite. Ajoutez « avec description "Note : 4 sur 5" ». ', element.ligne);
        }
        if (element.element === 'lien' && texte !== undefined && /^(ici|cliquez ici|lire la suite|en savoir plus)$/i.test(texte.trim())) {
          const adresses = liens.get(texte.toLocaleLowerCase('fr')) ?? new Set<string>();
          if (adresses.size === 0 || !adresses.has(element.cible ?? '')) signaler('avertissement', `le lien « ${texte} » n'explique pas sa destination. Écrivez un libellé plus précis.`, element.ligne);
          adresses.add(element.cible ?? '');
          liens.set(texte.toLocaleLowerCase('fr'), adresses);
        }
        if (element.element === 'titre') {
          titres++;
          if (titres > 1) signaler('avertissement', `la page « ${page.nom} » a plusieurs titres principaux. Gardez un seul « titre ».`, element.ligne);
        }
        if (element.element === 'soustitre') {
          const niveau = element.niveau ?? 2;
          if (niveau < 2 || niveau > 6) {
            signaler('erreur', 'le niveau d’un sous-titre doit être entre 2 et 6.', element.ligne);
            continue;
          }
          if (titres === 0) signaler('avertissement', 'ce sous-titre apparaît avant le titre principal de la page.', element.ligne);
          if (niveau > niveauPrecedent + 1) signaler('avertissement', `ce sous-titre fait un saut de niveau : après ${niveauPrecedent}, écrivez un niveau ${niveauPrecedent + 1}.`, element.ligne);
          niveauPrecedent = niveau;
        }
        if (['texte', 'titre', 'bouton', 'lien', 'champ'].includes(element.element)) verifierContraste(element, theme, modes, signaler);
      } else if (instruction.type === 'Formulaire') parcours(instruction.corps, new Map());
      else if (instruction.type === 'Evenement') {
        if (instruction.genre === 'survol') survols.push({ cible: instruction.cible, ligne: instruction.ligne });
        if (instruction.genre === 'clic') clics.add(instruction.cible);
        parcours(instruction.corps, champs);
      }
      else if (instruction.type === 'Bloc' || instruction.type === 'Boucle') parcours(instruction.corps, champs);
      else if (instruction.type === 'Condition') { parcours(instruction.alors, champs); parcours(instruction.sinon, champs); }
    }
  };
  parcours(page.corps);
  for (const survol of survols) {
    if (!clics.has(survol.cible)) signaler('avertissement', 'ce survol n’a pas d’action au clic : le clavier et les écrans tactiles ne peuvent pas le déclencher.', survol.ligne);
  }
  // Une page qui montre ses sous-pages (« sous page ») laisse le titre principal à chacune d'elles.
  const montreSesSousPages = JSON.stringify(page.corps).includes('"type":"SousPage"');
  if (titres === 0 && !montreSesSousPages) signaler('avertissement', `la page « ${page.nom} » n'a pas de titre principal. Ajoutez « titre "…" ».`, page.ligne);
  return diagnostics;
}

function verifierContraste(element: Element, theme: ReadonlyMap<string, { clair: string; sombre: string }>, modes: readonly ('clair' | 'sombre')[], signaler: (gravite: Diagnostic['gravite'], message: string, ligne: number) => void): void {
  const valeur = (nom: string) => element.styles.find((s) => s.propriete === nom)?.valeur;
  const couleur = valeur('couleur') ?? valeur('texte');
  const fond = valeur('fond');
  if (!couleur && !fond) return;
  const seuil = valeur('taille') === 'grande' ? SEUIL_GRAND : SEUIL_NORMAL;
  for (const mode of modes) {
    const hex = (nom: string) => theme.get(nom)?.[mode] ?? COULEURS_CSS[nom]?.[mode];
    const fondHex = fond ? hex(fond) : FOND_PAGE[mode];
    const encreHex = couleur ? hex(couleur) : fondHex ? encreSur(fondHex) : undefined;
    if (!fondHex || !encreHex) continue;
    const rapport = contraste(encreHex, fondHex);
    if (rapport >= seuil) continue;
    const suggestions = Object.entries(COULEURS_CSS).filter(([, c]) => contraste(c[mode], fondHex) >= seuil).map(([nom]) => nom).slice(0, 3);
    signaler('avertissement', `le contraste du texte en ${couleur ?? 'couleur calculée'} est ${rapport.toFixed(1).replace('.', ',')} en mode ${mode} ; il faut ${seuil.toString().replace('.', ',')}. Essayez ${suggestions.join(', ')}.`, element.ligne);
  }
}
