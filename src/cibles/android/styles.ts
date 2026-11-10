/**
 * Les styles nommés de Humalis en Compose. L'ordre des modificateurs compte :
 * l'ombre, puis la forme et le fond, puis le remplissage, puis la largeur.
 */
import type { StyleCompose } from './css.js';
import { MILLISECONDES } from '../commun/mouvement.js';
import { nomKotlin } from './noms.js';

export interface Option {
  nom: string;
  valeur: string;
}

export const ESPACES: Record<string, number> = { aucune: 0, petite: 8, moyenne: 16, grande: 32 };
const BORDURES: Record<string, number> = { arrondie: 999, carree: 0, douce: 8, ronde: 9999 };
const LARGEURS: Record<string, number> = { etroite: 576, normale: 768, large: 1152 };
const OMBRES: Record<string, number> = { legere: 2, moyenne: 6, forte: 16 };
const TAILLES: Record<string, string> = { petite: 'bodySmall', normale: 'bodyLarge', grande: 'headlineLarge', tres_grande: 'displayMedium' };
const ALIGNEMENTS: Record<string, [string, string]> = {
  gauche: ['Alignment.Start', 'TextAlign.Start'],
  centree: ['Alignment.CenterHorizontally', 'TextAlign.Center'],
  droite: ['Alignment.End', 'TextAlign.End'],
};

export type SorteVue = 'texte' | 'bouton' | 'lien' | 'bloc' | 'image' | 'champ';

const majuscule = (mot: string) => mot.charAt(0).toUpperCase() + mot.slice(1);
const forme = (bordure: string | undefined): string | undefined => {
  if (bordure === undefined || BORDURES[bordure] === undefined) return undefined;
  if (bordure === 'carree') return 'RectangleShape';
  return BORDURES[bordure] >= 999 ? 'RoundedCornerShape(50)' : `RoundedCornerShape(${BORDURES[bordure]}.dp)`;
};

/** Les modificateurs d'un élément ou d'un bloc : `.shadow(…).background(…).padding(…)`, ou rien. */
export function modificateurs(options: Option[], sorte: SorteVue, css?: StyleCompose): string {
  // Le CSS des classes : ses marges et sa taille dehors, son décor et son remplissage autour des options.
  if (css) return css.dehors + modificateurs(options, sorte) + css.decor + css.dedans;
  const valeur = (nom: string) => options.find((o) => o.nom === nom)?.valeur;
  const m: string[] = [];
  const estTexte = sorte === 'texte' || sorte === 'lien';
  const position = valeur('position');
  if (position && ALIGNEMENTS[position]) m.push(`.fillMaxWidth().wrapContentWidth(${ALIGNEMENTS[position][0]})`);
  const largeur = valeur('largeur');
  if (largeur && LARGEURS[largeur]) m.push(`.widthIn(max = ${LARGEURS[largeur]}.dp)`);
  else if (largeur === 'pleine') m.push('.fillMaxWidth()');

  // Le mouvement : une animation d'entrée, et l'effet au survol d'une souris.
  const animation = valeur('animation');
  const mouvement: string[] = [];
  if (animation && ['apparition', 'montee', 'agrandissement'].includes(animation)) {
    mouvement.push(`.animeHumalis("${animation}", ${MILLISECONDES.duree[valeur('duree') ?? 'moyenne'] ?? 300}, ${MILLISECONDES.delai[valeur('delai') ?? ''] ?? 0})`);
  }
  const effet = valeur('effet');
  if (effet === 'leve' || effet === 'agrandi') mouvement.push(`.effetHumalis("${effet}")`);
  m.unshift(...mouvement);
  // Un bouton a déjà sa forme et sa couleur : elles passent par ses paramètres.
  if (sorte === 'bouton') return m.join('');
  const leForme = forme(valeur('bordure'));
  const ombre = valeur('ombre');
  if (ombre && OMBRES[ombre] !== undefined) m.push(`.shadow(${OMBRES[ombre]}.dp, ${leForme ?? 'RectangleShape'})`);
  const fond = valeur('fond');
  const degrade = valeur('degrade');
  if (degrade) {
    const [de, vers, direction] = degrade.split('-');
    const couleurs = `listOf(Couleurs.${nomKotlin(de)}.lue(), Couleurs.${nomKotlin(vers ?? de)}.lue())`;
    const brosse = direction === 'horizontal' ? `Brush.horizontalGradient(${couleurs})` : direction === 'vertical' ? `Brush.verticalGradient(${couleurs})` : `Brush.linearGradient(${couleurs})`;
    m.push(`.background(${brosse}${leForme ? `, ${leForme}` : ''})`);
  } else if (fond === 'translucide') m.push(`.background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f)${leForme ? `, ${leForme}` : ''})`);
  else if (fond) m.push(`.background(Couleurs.${nomKotlin(fond)}.lue()${leForme ? `, ${leForme}` : ''})`);
  if (leForme && !fond && !degrade) m.push(`.clip(${leForme})`);
  const remplissage = valeur('remplissage');
  if (remplissage && ESPACES[remplissage] !== undefined) m.push(`.padding(${ESPACES[remplissage]}.dp)`);
  // Le texte posé sur un fond respire un peu, comme sur le web.
  else if (fond && estTexte) m.push('.padding(horizontal = 8.dp, vertical = 4.dp)');
  if (valeur('hauteur') === 'ecran') m.push('.heightIn(min = LocalConfiguration.current.screenHeightDp.dp)');
  return m.join('');
}

/** Le style d'un texte : `style = …, color = …, textAlign = …, ` (avec la virgule finale), ou rien. */
export function styleTexte(options: Option[], genre: string, css?: Map<string, string>): string {
  const valeur = (nom: string) => options.find((o) => o.nom === nom)?.valeur;
  const parties: string[] = [];
  const parGenre: Record<string, string> = {
    titre1: 'headlineLarge',
    titre2: 'headlineMedium',
    titre3: 'headlineSmall',
    titre4: 'titleLarge',
    titre5: 'titleMedium',
    titre6: 'titleSmall',
    soustitre: 'titleMedium',
  };
  const taille = valeur('taille');
  const style = (taille && TAILLES[taille]) ?? parGenre[genre];
  if (style) parties.push(`style = MaterialTheme.typography.${style}`);
  const couleur = valeur('couleur') ?? valeur('texte');
  const fond = valeur('fond');
  if (couleur) parties.push(`color = Couleurs.${nomKotlin(couleur)}.lue()`);
  else if (fond && fond !== 'translucide' && genre !== 'bouton') parties.push(`color = Couleurs.encre${majuscule(nomKotlin(fond))}.lue()`);
  else if (genre === 'soustitre') parties.push('color = MaterialTheme.colorScheme.onSurfaceVariant');
  const position = valeur('position');
  if (position && ALIGNEMENTS[position]) parties.push(`textAlign = ${ALIGNEMENTS[position][1]}`);
  if (valeur('gras') !== undefined || valeur('poids') === 'gras') parties.push('fontWeight = FontWeight.Bold');
  // Le CSS des classes ajoute ce que les options n'ont pas dit : une option écrite sur l'élément passe avant.
  for (const [nom, v] of css ?? []) if (!parties.some((p) => p.startsWith(`${nom} =`))) parties.push(`${nom} = ${v}`);
  return parties.length ? `${parties.join(', ')}, ` : '';
}
