/**
 * « style "carte" : » puis une propriété par ligne, écrite en français :
 *
 *     style "carte" :
 *         fond blanc
 *         bord 1 gris clair
 *         arrondi 12
 *         espace interieur 16
 *         ombre douce
 *
 * Le bloc devient une classe CSS ordinaire (« .carte »), ajoutée au CSS du
 * projet : chaque cible qui lit le CSS (web, moteur, statique, mobile, Apple)
 * la comprend sans rien de plus. On l'emploie comme aujourd'hui :
 * « bloc avec style "carte" ».
 */
import type { Token } from '../lexer/types.js';
import { normaliser } from '../lexer/motsCles.js';
import { ErreurSyntaxique } from './erreurs.js';
import type { FluxTokens } from './fluxTokens.js';
import type { Theme } from './ast.js';

/** Une ligne lue : la propriété et ses mots, tels qu'écrits. */
export interface LigneStyle {
  propriete: string;
  mots: { valeur: string; type: Token['type'] }[];
  ligne: number;
}

export interface StyleHumalis {
  nom: string;
  lignes: LigneStyle[];
  ligne: number;
}

/** Les couleurs nommées du langage (les mêmes que « avec couleur bleu »), en mode clair. */
const COULEURS: Record<string, string> = {
  bleu: '#1f5fbf',
  rouge: '#c62828',
  vert: '#2e7d32',
  jaune: '#f2c200',
  orange: '#e65100',
  violet: '#6a3fb5',
  rose: '#c2185b',
  gris: '#5f6368',
  noir: '#1d1d1f',
  blanc: '#ffffff',
  transparent: 'transparent',
};

const OMBRES: Record<string, string> = {
  aucune: 'none',
  douce: '0 1px 3px rgb(0 0 0 / 0.08), 0 4px 12px rgb(0 0 0 / 0.06)',
  forte: '0 4px 10px rgb(0 0 0 / 0.12), 0 16px 32px rgb(0 0 0 / 0.14)',
};

const PROPRIETES = ['fond', 'couleur', 'bord', 'arrondi', 'espace interieur', 'marge', 'ombre', 'taille', 'gras', 'largeur maximale', 'alignement'];

/** « style "carte" : » en haut du fichier. */
export function estStyleHumalis(flux: FluxTokens): boolean {
  return flux.verifier('MOT_CLE', 'style') && flux.regarder(1).type === 'CHAINE' && flux.regarder(2).valeur === ':';
}

export function analyserStyleHumalis(flux: FluxTokens): StyleHumalis {
  const debut = flux.avancer();
  const nom = flux.avancer().valeur.trim();
  if (!/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(nom)) throw new ErreurSyntaxique(`« ${nom} » ne peut pas nommer un style : des lettres sans accent, des chiffres, - et _ (par exemple « carte-produit »).`, debut.ligne);
  flux.avancer();
  const lignes: LigneStyle[] = [];
  flux.sauterFinsDeLigne();
  if (!flux.accepter('INDENT')) throw new ErreurSyntaxique(`le style « ${nom} » est vide : écrivez ses propriétés en dessous, une par ligne (fond blanc, arrondi 12…).`, debut.ligne);
  flux.sauterFinsDeLigne();
  while (!flux.verifier('DEDENT') && !flux.estFini()) {
    const ligne = flux.actuel().ligne;
    const mots: LigneStyle['mots'] = [];
    while (!flux.verifier('FIN_LIGNE') && !flux.verifier('DEDENT') && !flux.estFini()) {
      const jeton = flux.avancer();
      mots.push({ valeur: jeton.type === 'CHAINE' ? jeton.valeur : normaliser(jeton.original ?? jeton.valeur), type: jeton.type });
    }
    const deux = mots.length > 1 ? `${mots[0].valeur} ${mots[1].valeur}` : '';
    const propriete = PROPRIETES.includes(deux) ? deux : mots[0]?.valeur ?? '';
    if (!PROPRIETES.includes(propriete)) throw new ErreurSyntaxique(`« ${propriete} » n'est pas une propriété de style. Propriétés possibles : ${PROPRIETES.join(', ')}.`, ligne);
    lignes.push({ propriete, mots: mots.slice(propriete.split(' ').length), ligne });
    flux.sauterFinsDeLigne();
  }
  flux.accepter('DEDENT');
  return { nom, lignes, ligne: debut.ligne };
}

/** Une couleur : un nom (« gris clair », « bleu fonce »), une couleur du thème, ou « "#1f5fbf" ». */
function couleur(mots: LigneStyle['mots'], ligne: number, theme?: Theme): string {
  const [premier, nuance] = mots;
  if (!premier) throw new ErreurSyntaxique('une couleur est attendue : blanc, gris clair, bleu fonce, une couleur du thème ou "#1f5fbf".', ligne);
  if (premier.type === 'CHAINE') {
    if (!/^#[0-9a-f]{3,8}$/i.test(premier.valeur)) throw new ErreurSyntaxique(`« ${premier.valeur} » n'est pas une couleur : écrivez par exemple "#1f5fbf".`, ligne);
    return premier.valeur;
  }
  const duTheme = theme?.couleurs.find((c) => normaliser(c.nom) === premier.valeur);
  const base = duTheme ? duTheme.clair : COULEURS[premier.valeur];
  if (!base) throw new ErreurSyntaxique(`« ${premier.valeur} » n'est pas une couleur connue. Couleurs : ${Object.keys(COULEURS).join(', ')}${theme?.couleurs.length ? `, ${theme.couleurs.map((c) => c.nom).join(', ')}` : ''} ; ou "#1f5fbf".`, ligne);
  const valeur = !nuance ? base : nuance.valeur === 'clair' || nuance.valeur === 'claire' ? melanger(base, '#ffffff', 0.7) : nuance.valeur === 'fonce' || nuance.valeur === 'foncee' ? melanger(base, '#000000', 0.35) : undefined;
  if (valeur === undefined) throw new ErreurSyntaxique(`après « ${premier.valeur} », on attend « clair » ou « fonce » : à la place, on trouve « ${nuance!.valeur} ».`, ligne);
  // Une couleur du thème suit le thème (mode sombre compris) sur le web ; la valeur claire sert ailleurs.
  return duTheme && !nuance ? `var(--humalis-${duTheme.nom}, ${base})` : valeur;
}

function melanger(a: string, b: string, part: number): string {
  const rgb = (h: string) => {
    const x = h.length === 4 ? [...h.slice(1)].map((c) => c + c).join('') : h.slice(1, 7);
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  };
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * part).toString(16).padStart(2, '0')).join('')}`;
}

function nombres(mots: LigneStyle['mots'], ligne: number, propriete: string, maximum: number): string {
  if (mots.length === 0 || mots.length > maximum || mots.some((m) => m.type !== 'NOMBRE')) {
    throw new ErreurSyntaxique(`« ${propriete} » attend ${maximum === 1 ? 'un nombre' : `de 1 à ${maximum} nombres`} de points : par exemple « ${propriete} 16 ».`, ligne);
  }
  return mots.map((m) => `${Number(m.valeur)}px`).join(' ');
}

/** Le CSS d'un style écrit en Humalis : une classe du même nom. */
export function cssDuStyle(style: StyleHumalis, theme?: Theme): string {
  return `.${style.nom} { ${declarationsDuStyle(style, theme).map(([p, v]) => `${p}: ${v}`).join('; ')}; }`;
}

/** Les déclarations CSS d'un style, une par ligne écrite : le mobile les traduit à sa façon. */
export function declarationsDuStyle(style: StyleHumalis, theme?: Theme): [string, string][] {
  return style.lignes.map(({ propriete, mots, ligne }): [string, string] => {
    const [p, ...v] = declaration(propriete, mots, ligne, theme).split(': ');
    return [p!, v.join(': ')];
  });
}

function declaration(propriete: string, mots: LigneStyle['mots'], ligne: number, theme?: Theme): string {
  {
    switch (propriete) {
      case 'fond':
        return `background: ${couleur(mots, ligne, theme)}`;
      case 'couleur':
        return `color: ${couleur(mots, ligne, theme)}`;
      case 'bord': {
        const [epaisseur, ...reste] = mots;
        if (epaisseur?.type !== 'NOMBRE') throw new ErreurSyntaxique('« bord » attend une épaisseur puis une couleur : bord 1 gris clair', ligne);
        return `border: ${Number(epaisseur.valeur)}px solid ${reste.length ? couleur(reste, ligne, theme) : 'currentColor'}`;
      }
      case 'arrondi':
        return `border-radius: ${nombres(mots, ligne, propriete, 4)}`;
      case 'espace interieur':
        return `padding: ${nombres(mots, ligne, propriete, 4)}`;
      case 'marge':
        return `margin: ${nombres(mots, ligne, propriete, 4)}`;
      case 'taille':
        return `font-size: ${nombres(mots, ligne, propriete, 1)}`;
      case 'largeur maximale':
        return `max-width: ${nombres(mots, ligne, propriete, 1)}`;
      case 'gras':
        if (mots.length) throw new ErreurSyntaxique('« gras » s’écrit seul sur sa ligne.', ligne);
        return 'font-weight: 700';
      case 'alignement': {
        const sens = { centre: 'center', gauche: 'left', droite: 'right' }[mots[0]?.valeur ?? ''];
        if (!sens || mots.length > 1) throw new ErreurSyntaxique('« alignement » attend centre, gauche ou droite.', ligne);
        return `text-align: ${sens}`;
      }
      case 'ombre': {
        const ombre = OMBRES[mots[0]?.valeur ?? ''];
        if (!ombre || mots.length > 1) throw new ErreurSyntaxique('« ombre » attend douce, forte ou aucune.', ligne);
        return `box-shadow: ${ombre}`;
      }
      default:
        throw new ErreurSyntaxique(`« ${propriete} » n'est pas une propriété de style.`, ligne);
    }
  }
}
