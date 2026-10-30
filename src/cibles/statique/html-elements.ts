/**
 * Le HTML de départ de quelques éléments d'écran du site statique : les
 * icônes (SVG en ligne, tracés de Lucide) et les étoiles. Le script en
 * refait les mêmes dessins (`humalis.icone`, `humalis.etoiles`).
 */
import { FORMES_LUCIDE } from '../icones-donnees.js';
import { echapperAttribut, echapperTexte } from './html.js';

const SVG = (forme: string) =>
  `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${forme}`;

/** Une icône de Lucide, en SVG en ligne (décorative sans libellé, `role="img"` avec). */
export function iconeHtml(lucide: string, classe: string, label?: string): string {
  const interieur = FORMES_LUCIDE[lucide] ?? FORMES_LUCIDE['circle-help'];
  const acces = label ? ` role="img" aria-label="${echapperAttribut(label)}"` : ' aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${echapperAttribut(classe)}" ${SVG(`${acces}`)}>${interieur}</svg>`;
}

/** Les étoiles d'une note : pleines, demi ou vides ; des boutons radio si la note est modifiable. */
export function etoilesHtml(valeur: number, maximum: number, modifiable: boolean, label: string, classes: string): string {
  const etoile = iconeHtml('star', 'humalis-etoile-fond');
  const unites = Array.from({ length: maximum }, (_, i) => {
    const reste = valeur - i;
    const etat = reste >= 1 ? 'pleine' : reste >= 0.5 ? 'demi' : 'vide';
    const dessin = `${etoile}${etat === 'demi' ? `<span class="humalis-etoile-moitie">${iconeHtml('star', '')}</span>` : ''}`;
    return modifiable
      ? `<button type="button" role="radio" aria-checked="${Math.round(valeur) === i + 1}" aria-label="${i + 1} sur ${maximum}" class="humalis-etoile humalis-etoile-${etat}">${dessin}</button>`
      : `<span class="humalis-etoile humalis-etoile-${etat}">${dessin}</span>`;
  });
  return `<span class="${echapperAttribut(classes)}" role="${modifiable ? 'radiogroup' : 'img'}" aria-label="${echapperAttribut(label)}">${unites.join('')}</span>`;
}

void echapperTexte;
