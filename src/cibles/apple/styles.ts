/**
 * Les styles nommés de Humalis en modificateurs SwiftUI. L'ordre compte en
 * SwiftUI : le remplissage vient avant le fond, le fond avant l'arrondi.
 */
import { MILLISECONDES } from '../commun/mouvement.js';
import { nomSwift } from './noms.js';

export interface Option {
  nom: string;
  valeur: string;
}

export const ESPACES: Record<string, number> = { aucune: 0, petite: 8, moyenne: 16, grande: 32 };
const BORDURES: Record<string, number> = { arrondie: 999, carree: 0, douce: 8, ronde: 9999 };
const LARGEURS: Record<string, number> = { etroite: 576, normale: 768, large: 1152 };
const POLICES: Record<string, string> = { petite: '.subheadline', normale: '.body', grande: '.largeTitle', tres_grande: '.system(size: 48)' };
const OMBRES: Record<string, string> = {
  legere: '.shadow(color: .black.opacity(0.15), radius: 3, y: 1)',
  moyenne: '.shadow(color: .black.opacity(0.2), radius: 12, y: 4)',
  forte: '.shadow(color: .black.opacity(0.3), radius: 32, y: 12)',
};
const ALIGNEMENTS: Record<string, [string, string]> = {
  gauche: ['.leading', '.leading'],
  centree: ['.center', '.center'],
  droite: ['.trailing', '.trailing'],
};

export type SorteVue = 'texte' | 'bouton' | 'lien' | 'bloc' | 'image' | 'champ';

const majuscule = (mot: string) => mot.charAt(0).toUpperCase() + mot.slice(1);

/** Les modificateurs d'un élément ou d'un bloc, dans l'ordre où SwiftUI les veut. */
export function modificateurs(options: Option[], sorte: SorteVue, contexte: { dansLigne: boolean }): string[] {
  const valeur = (nom: string) => options.find((o) => o.nom === nom)?.valeur;
  const lignes: string[] = [];
  const estTexte = sorte === 'texte' || sorte === 'lien';

  const taille = valeur('taille');
  if (taille && POLICES[taille]) lignes.push(`.font(${POLICES[taille]})`);
  const couleur = valeur('couleur') ?? valeur('texte');
  const fond = valeur('fond');
  if (couleur) lignes.push(`.foregroundStyle(Couleurs.${nomSwift(couleur)})`);

  const position = valeur('position');
  if (position && ALIGNEMENTS[position] && estTexte) lignes.push(`.multilineTextAlignment(${ALIGNEMENTS[position][1]})`);

  const remplissage = valeur('remplissage');
  if (remplissage && ESPACES[remplissage] !== undefined) lignes.push(`.padding(${ESPACES[remplissage]})`);

  const degrade = valeur('degrade');
  const plein = sorte === 'bloc' && (fond !== undefined || degrade !== undefined || valeur('ombre') !== undefined) && !contexte.dansLigne;
  if (plein) lignes.push('.frame(maxWidth: .infinity, alignment: .leading)');

  const largeur = valeur('largeur');
  if (largeur && LARGEURS[largeur]) lignes.push(`.frame(maxWidth: ${LARGEURS[largeur]})`, '.frame(maxWidth: .infinity)');
  else if (largeur === 'pleine') lignes.push('.frame(maxWidth: .infinity, alignment: .leading)');

  if (valeur('hauteur') === 'ecran') lignes.push('.containerRelativeFrame(.vertical)');

  if (fond && sorte !== 'bouton') {
    if (estTexte && !remplissage) lignes.push('.padding(.horizontal, 8)', '.padding(.vertical, 4)');
    // Le texte posé sur un fond prend la couleur d'encre de ce fond.
    if (!couleur && (estTexte || sorte === 'bloc')) lignes.push(`.foregroundStyle(Couleurs.encre${majuscule(nomSwift(fond))})`);
    lignes.push(`.background(Couleurs.${nomSwift(fond)})`);
  }
  if (degrade) {
    const [de, vers, direction] = degrade.split('-');
    const points = direction === 'horizontal' ? 'startPoint: .leading, endPoint: .trailing' : direction === 'vertical' ? 'startPoint: .top, endPoint: .bottom' : 'startPoint: .topLeading, endPoint: .bottomTrailing';
    lignes.push(`.background(LinearGradient(colors: [Couleurs.${nomSwift(de)}, Couleurs.${nomSwift(vers)}], ${points}))`);
  }

  const bordure = valeur('bordure');
  if (bordure && BORDURES[bordure] !== undefined) {
    if (sorte === 'bouton') lignes.push(bordure === 'carree' ? '.buttonBorderShape(.roundedRectangle(radius: 0))' : bordure === 'douce' ? '.buttonBorderShape(.roundedRectangle(radius: 8))' : '.buttonBorderShape(.capsule)');
    else lignes.push(`.clipShape(RoundedRectangle(cornerRadius: ${BORDURES[bordure]}))`);
  }

  const ombre = valeur('ombre');
  if (ombre && OMBRES[ombre]) lignes.push(OMBRES[ombre]);

  if (position && ALIGNEMENTS[position]) lignes.push(`.frame(maxWidth: .infinity, alignment: ${ALIGNEMENTS[position][0]})`);

  const effet = valeur('effet');
  if (effet) lignes.push(`.modifier(EffetSurvolHumalis(effet: .${effet}))`);

  const animation = valeur('animation');
  if (animation && animation !== 'defilement' && animation !== 'cascade') {
    const duree = MILLISECONDES.duree[valeur('duree') ?? 'moyenne'] ?? 300;
    const delai = MILLISECONDES.delai[valeur('delai') ?? ''] ?? 0;
    lignes.push(`.modifier(AnimeHumalis(animation: .${animation}, duree: ${duree}, delai: ${delai}))`);
  }
  return lignes;
}

/** Le clavier d'un champ d'une ligne. */
export function clavier(sorte: string, email: boolean): string {
  if (email) return 'email';
  return ({ email: 'email', telephone: 'telephone', nombre: 'nombre', adresseWeb: 'adresseWeb' } as Record<string, string>)[sorte] ?? 'texte';
}

const TOUCHES_NOMMEES: Record<string, string> = {
  entree: '.return',
  echap: '.escape',
  espace: '.space',
  tab: '.tab',
  tabulation: '.tab',
  haut: '.upArrow',
  bas: '.downArrow',
  gauche: '.leftArrow',
  droite: '.rightArrow',
  retour: '.delete',
  suppr: '.deleteForward',
};

/** « controle+maj+k » → `.keyboardShortcut("k", modifiers: [.command, .shift])` : « controle » est la touche Commande sur Apple. */
export function touches(texte: string): string {
  const morceaux = texte.split('+');
  const touche = morceaux.pop() ?? '';
  const mods = morceaux.map((m) => ({ controle: '.command', ctrl: '.command', commande: '.command', maj: '.shift', majuscule: '.shift', alt: '.option', option: '.option' })[m] ?? '.command');
  const cle = TOUCHES_NOMMEES[touche] ?? `KeyEquivalent(Character("${touche.charAt(0)}"))`;
  return `.keyboardShortcut(${cle}, modifiers: [${mods.join(', ')}])`;
}
