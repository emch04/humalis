/**
 * Les styles de Humalis en WPF : les options d'un élément (« avec fond primaire ») et les
 * styles nommés (« style "carte" : », ou une règle CSS qui vise une seule classe) deviennent
 * un StyleHumalis. Ce que WPF ne sait pas dessiner est compté et dit, jamais perdu en silence.
 */
import type { Option } from '../../ri/types.js';
import { chaineCs, nomMethode, nombreCs } from './noms.js';

const ESPACES: Record<string, number> = { aucune: 0, petite: 8, moyenne: 16, grande: 32 };
const ARRONDIS: Record<string, number> = { arrondie: 999, carree: 0, douce: 8, ronde: 9999 };
const LARGEURS: Record<string, number> = { etroite: 576, normale: 768, large: 1152 };
const TAILLES: Record<string, number> = { petite: 13, normale: 14, grande: 28, tres_grande: 48 };
const OMBRES: Record<string, string> = {
  legere: 'new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 6, ShadowDepth = 1, Opacity = 0.15 }',
  moyenne: 'new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 24, ShadowDepth = 4, Opacity = 0.2 }',
  forte: 'new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 48, ShadowDepth = 12, Opacity = 0.3 }',
};
const POSITIONS: Record<string, [string, string]> = {
  gauche: ['HorizontalAlignment.Left', 'TextAlignment.Left'],
  centree: ['HorizontalAlignment.Center', 'TextAlignment.Center'],
  droite: ['HorizontalAlignment.Right', 'TextAlignment.Right'],
};

/** Les options sans équivalent dessiné sur Windows pour l'instant (mouvements, effets de survol). */
export const OPTIONS_NON_DESSINEES = new Set(['animation', 'effet', 'duree', 'delai', 'hauteur']);

/** Le nom C# d'une couleur du thème ou de Humalis (« primaire » → Couleurs.Primaire). */
export const couleurCs = (nom: string): string => `Couleurs.${nomMethode(nom)}`;

/** Le style des options d'un élément ; undefined s'il n'en a aucune qui se dessine. */
export function styleDesOptions(options: Option[], couleurs: Set<string>, sorte: 'texte' | 'bloc' | 'bouton' | 'champ' | 'image'): string | undefined {
  const valeur = (nom: string) => options.find((o) => o.nom === nom)?.valeur;
  const p: string[] = [];
  const couleur = (nom: string | undefined) => (nom && couleurs.has(nom) ? couleurCs(nom) : undefined);

  const taille = valeur('taille');
  if (taille && TAILLES[taille]) p.push(`Taille = ${TAILLES[taille]}`);
  const texte = couleur(valeur('couleur') ?? valeur('texte'));
  if (texte) p.push(`Couleur = ${texte}`);
  const fondNom = valeur('fond');
  if (fondNom === 'translucide') p.push('Fond = Apparence.FondCarte');
  else if (fondNom && couleurs.has(fondNom)) {
    p.push(`Fond = ${couleurCs(fondNom)}`);
    // Le texte posé sur un fond prend la couleur d'encre de ce fond.
    if (!texte) p.push(`Couleur = Couleurs.Encre${nomMethode(fondNom)}`);
    if ((sorte === 'texte') && !valeur('remplissage')) p.push('Remplissage = new Thickness(8, 4, 8, 4)');
  }
  const degrade = valeur('degrade');
  if (degrade) {
    const [de, vers, direction] = degrade.split('-');
    if (couleurs.has(de) && couleurs.has(vers)) p.push(`Fond = Apparence.Degrade(${couleurCs(de)}, ${couleurCs(vers)}, ${chaineCs(direction ?? 'diagonal')})`);
  }
  const remplissage = valeur('remplissage');
  if (remplissage && ESPACES[remplissage] !== undefined) p.push(`Remplissage = new Thickness(${ESPACES[remplissage]})`);
  const largeur = valeur('largeur');
  if (largeur && LARGEURS[largeur]) p.push(`LargeurMax = ${LARGEURS[largeur]}`);
  else if (largeur === 'pleine') p.push('Pleine = true');
  const bordure = valeur('bordure');
  if (bordure && ARRONDIS[bordure] !== undefined) p.push(`Arrondi = ${ARRONDIS[bordure]}`);
  const ombre = valeur('ombre');
  if (ombre && OMBRES[ombre]) p.push(`Ombre = ${OMBRES[ombre]}`);
  const position = valeur('position');
  if (position && POSITIONS[position]) {
    p.push(`Position = ${POSITIONS[position][0]}`);
    if (sorte === 'texte') p.push(`Alignement = ${POSITIONS[position][1]}`);
  }
  if (sorte === 'bloc' && (fondNom !== undefined || ombre !== undefined) && !largeur) p.push('Pleine = true');
  return p.length > 0 ? `new StyleHumalis { ${dedoublonner(p).join(', ')} }` : undefined;
}

/** La dernière valeur d'une propriété l'emporte (un initialiseur C# refuse deux fois le même nom). */
function dedoublonner(proprietes: string[]): string[] {
  const parNom = new Map<string, string>();
  for (const p of proprietes) parNom.set(p.split(' = ')[0], p);
  return [...parNom.values()];
}

// ─── Le CSS ───────────────────────────────────────────────────────────────

const NOMMEES: Record<string, string> = {
  white: '#FFFFFF', black: '#000000', red: '#FF0000', green: '#008000', blue: '#0000FF', gray: '#808080', grey: '#808080',
  orange: '#FFA500', yellow: '#FFFF00', purple: '#800080', pink: '#FFC0CB', transparent: '#00000000',
};
const POIDS: Record<string, string> = {
  '100': 'Thin', '200': 'ExtraLight', '300': 'Light', '400': 'Normal', normal: 'Normal', '500': 'Medium', '600': 'SemiBold',
  '700': 'Bold', bold: 'Bold', '800': 'ExtraBold', '900': 'Black', bolder: 'Bold', lighter: 'Light',
};
const ALIGNE: Record<string, string> = { left: 'TextAlignment.Left', start: 'TextAlignment.Left', center: 'TextAlignment.Center', right: 'TextAlignment.Right', end: 'TextAlignment.Right', justify: 'TextAlignment.Justify' };

/** Une longueur CSS en pixels WPF (1 px CSS = 1 unité WPF ; 1rem = 16). */
function longueur(texte: string): number | undefined {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(texte.trim());
  if (!m) return texte.trim() === '0' ? 0 : undefined;
  const n = Number(m[1]);
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
}

function epaisseur(texte: string): string | undefined {
  const valeurs = texte.trim().split(/\s+/).map(longueur);
  if (valeurs.some((v) => v === undefined)) return undefined;
  const [h, d = h, b = h, g = d] = valeurs as number[];
  return h === d && d === b && b === g ? `new Thickness(${nombre(h)})` : `new Thickness(${nombre(g)}, ${nombre(h)}, ${nombre(d)}, ${nombre(b)})`;
}

const nombre = (n: number) => String(Number(n.toFixed(3)));

/** Une couleur CSS en pinceau WPF ; undefined si elle ne se lit pas. */
export function couleurCss(texte: string, couleurs: Set<string>): string | undefined {
  const t = texte.trim().toLowerCase();
  const variable = /^var\(--(?:couleur-)?([a-z0-9_-]+)\)$/.exec(t);
  if (variable && couleurs.has(variable[1].replace(/-/g, '_'))) return couleurCs(variable[1].replace(/-/g, '_'));
  if (NOMMEES[t]) return `Apparence.Pinceau(${chaineCs(NOMMEES[t])})`;
  const hexa = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(t);
  if (hexa) {
    let h = hexa[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    // CSS écrit l'opacité à la fin (#RRGGBBAA), WPF au début (#AARRGGBB).
    if (h.length === 8) h = h.slice(6) + h.slice(0, 6);
    return `Apparence.Pinceau(${chaineCs(`#${h.toUpperCase()}`)})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(t);
  if (rgb) {
    const octet = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4]);
    return `Apparence.Pinceau(${chaineCs(`#${octet(alpha * 255)}${octet(Number(rgb[1]))}${octet(Number(rgb[2]))}${octet(Number(rgb[3]))}`.toUpperCase())})`;
  }
  return undefined;
}

/** Les déclarations CSS d'un style nommé : les propriétés de son StyleHumalis, et ce qui ne se traduit pas. */
export function styleDesDeclarations(declarations: [string, string][], couleurs: Set<string>): { proprietes: string[]; ignorees: string[] } {
  const p: string[] = [];
  const ignorees: string[] = [];
  for (const [nomBrut, valeurBrute] of declarations) {
    const nom = nomBrut.trim().toLowerCase();
    const valeur = valeurBrute.replace(/!important/g, '').trim();
    const avant = p.length;
    switch (nom) {
      case 'color': { const c = couleurCss(valeur, couleurs); if (c) p.push(`Couleur = ${c}`); break; }
      case 'background':
      case 'background-color': { const c = couleurCss(valeur, couleurs); if (c) p.push(`Fond = ${c}`); break; }
      case 'padding': { const e = epaisseur(valeur); if (e) p.push(`Remplissage = ${e}`); break; }
      case 'margin': { const e = epaisseur(valeur); if (e) p.push(`Marge = ${e}`); break; }
      case 'font-size': { const l = longueur(valeur); if (l !== undefined) p.push(`Taille = ${nombre(l)}`); break; }
      case 'font-weight': if (POIDS[valeur]) p.push(`Graisse = FontWeights.${POIDS[valeur]}`); break;
      case 'font-style': if (valeur === 'italic') p.push('Italique = FontStyles.Italic'); else if (valeur === 'normal') p.push('Italique = FontStyles.Normal'); break;
      case 'font-family': p.push(`Police = new FontFamily(${chaineCs(valeur.split(',').map((f) => f.trim().replace(/^["']|["']$/g, '')).filter((f) => !/^(sans-serif|serif|monospace|system-ui|-apple-system)$/.test(f)).join(', ') || 'Segoe UI')})`); break;
      case 'border-radius': { const l = longueur(valeur.split(/\s+/)[0]); if (l !== undefined) p.push(`Arrondi = ${nombre(l)}`); break; }
      case 'border': {
        if (valeur === 'none' || valeur === '0') { p.push('Bordure = new Thickness(0)'); break; }
        const morceaux = valeur.split(/\s+(?![^(]*\))/);
        const l = morceaux.map(longueur).find((x) => x !== undefined);
        const c = morceaux.map((m) => couleurCss(m, couleurs)).find((x) => x !== undefined);
        if (l !== undefined) p.push(`Bordure = new Thickness(${nombre(l)})`);
        if (c) p.push(`CouleurBordure = ${c}`);
        break;
      }
      case 'border-width': { const e = epaisseur(valeur); if (e) p.push(`Bordure = ${e}`); break; }
      case 'border-color': { const c = couleurCss(valeur, couleurs); if (c) p.push(`CouleurBordure = ${c}`); break; }
      case 'width':
      case 'max-width':
      case 'min-width':
      case 'height':
      case 'min-height':
      case 'max-height': {
        const propriete = { width: 'Largeur', 'max-width': 'LargeurMax', 'min-width': 'LargeurMin', height: 'Hauteur', 'min-height': 'HauteurMin', 'max-height': 'HauteurMax' }[nom]!;
        if (valeur === '100%' && nom === 'width') { p.push('Pleine = true'); break; }
        const l = longueur(valeur);
        if (l !== undefined) p.push(`${propriete} = ${nombre(l)}`);
        break;
      }
      case 'text-align': if (ALIGNE[valeur]) p.push(`Alignement = ${ALIGNE[valeur]}`); break;
      case 'gap':
      case 'row-gap': { const l = longueur(valeur.split(/\s+/)[0]); if (l !== undefined) p.push(`Ecart = ${nombre(l)}`); break; }
      case 'opacity': if (!Number.isNaN(Number(valeur))) p.push(`Opacite = ${nombre(Number(valeur))}`); break;
      case 'line-height': {
        const l = longueur(valeur);
        if (l !== undefined && /px|rem|em/.test(valeur)) p.push(`Interligne = ${nombre(l)}`);
        else if (!Number.isNaN(Number(valeur))) p.push(`Interligne = ${nombre(Number(valeur) * 16)}`);
        break;
      }
      case 'box-shadow': if (valeur !== 'none') p.push(`Ombre = ${OMBRES.moyenne}`); break;
    }
    if (p.length === avant) ignorees.push(`${nom}: ${valeur}`);
  }
  return { proprietes: dedoublonner(p), ignorees };
}

/** Les règles d'un texte CSS qui visent une seule classe (« .carte { … } ») ; le reste est compté à part. */
export function reglesDeClasses(css: string): { regles: { classe: string; declarations: [string, string][] }[]; autres: number } {
  const regles: { classe: string; declarations: [string, string][] }[] = [];
  let autres = 0;
  const propre = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < propre.length) {
    const ouverture = propre.indexOf('{', i);
    if (ouverture === -1) break;
    const selecteur = propre.slice(i, ouverture).trim();
    // Le bloc entier, accolades imbriquées comprises (@media).
    let profondeur = 1;
    let j = ouverture + 1;
    while (j < propre.length && profondeur > 0) {
      if (propre[j] === '{') profondeur++;
      if (propre[j] === '}') profondeur--;
      j++;
    }
    const corps = propre.slice(ouverture + 1, j - 1);
    i = j;
    const classes = selecteur.split(',').map((s) => s.trim());
    if (selecteur.startsWith('@') || !classes.every((c) => /^\.[A-Za-z_][\w-]*$/.test(c))) {
      autres++;
      continue;
    }
    const declarations = corps.split(';').flatMap((d): [string, string][] => {
      const deux = d.indexOf(':');
      return deux === -1 ? [] : [[d.slice(0, deux).trim(), d.slice(deux + 1).trim()]];
    });
    for (const c of classes) regles.push({ classe: c.slice(1), declarations });
  }
  return { regles, autres };
}

/** Un nombre pour une propriété double d'un style (taille de police d'un titre…). */
export const nombreStyle = nombreCs;
