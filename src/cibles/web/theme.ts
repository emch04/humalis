/**
 * Le thème de l'application (plan 2026-10-30-mise-en-page-et-elements,
 * chapitre 4.3) pour le web, le desktop (qui reprend le web) et le site
 * statique : le CSS des couleurs, des polices, du mode, et le petit script
 * qui retrouve le choix du visiteur avant le premier affichage.
 */
import type { Application, ThemeRI, Action, NoeudVue, Gestionnaire } from '../../ri/types.js';
import { COULEURS_CSS } from './styles.js';

/** Le choix du visiteur (« changer theme par sombre ») : écrit dans le navigateur sous cette clé. */
export const CLE_THEME = 'humalis-theme';

const PILE_TEXTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const PILE_CODE = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const LARGEURS: Record<string, string> = { etroite: '36rem', normale: '48rem', large: '72rem', pleine: 'none' };
const FORMATS: Record<string, [string, string]> = {
  woff2: ['font/woff2', 'woff2'],
  woff: ['font/woff', 'woff'],
  ttf: ['font/ttf', 'truetype'],
  otf: ['font/otf', 'opentype'],
};

// ─── Le programme change-t-il le thème ? ─────────────────────────────────

function actionsDe(actions: Action[]): Action[] {
  return actions.flatMap((a) => [a, ...(a.type === 'si' ? [...actionsDe(a.alors), ...actionsDe(a.sinon)] : a.type === 'repetition' ? actionsDe(a.corps) : [])]);
}

function gestionnairesDe(noeuds: NoeudVue[]): Gestionnaire[] {
  return noeuds.flatMap((n) =>
    n.type === 'condition'
      ? [...gestionnairesDe(n.alors), ...gestionnairesDe(n.sinon)]
      : n.type === 'repetition'
        ? [...n.gestionnaires, ...gestionnairesDe(n.corps)]
        : n.type === 'formulaire' || n.type === 'bloc'
          ? gestionnairesDe(n.corps)
          : [],
  );
}

/** Vrai si une page ou un composant contient « changer theme par … ». */
export function changeLeTheme(application: Application): boolean {
  const dispositions = [application.disposition?.entete?.ecran, application.disposition?.pied?.ecran].filter((e) => e !== undefined);
  return [...application.ecrans, ...application.composants, ...dispositions].some((e) =>
    [...e.gestionnaires, ...gestionnairesDe(e.vue)].some((g) => actionsDe(g.actions).some((a) => a.type === 'theme')),
  );
}

// ─── Le CSS ──────────────────────────────────────────────────────────────

const nomPolice = (nom: string) => `'${nom.replace(/'/g, "\\'")}'`;

/** Les variables d'une couleur, dans un mode. */
const variable = (nom: string, couleur: string, encre: string, retrait: string) =>
  `${retrait}--humalis-${nom}: ${couleur};\n${retrait}--humalis-${nom}-encre: ${encre};`;

/** Toutes les variables d'un mode : la page, l'encre, les couleurs de base (redéfinies par le thème) et celles du thème. */
function variablesDuMode(theme: ThemeRI | undefined, mode: 'clair' | 'sombre', retrait: string): string {
  const base = Object.entries(COULEURS_CSS).map(([nom, v]) => ({
    nom,
    couleur: v[mode],
    encre: mode === 'clair' ? v.encreClair : v.encreSombre,
  }));
  const duTheme = (theme?.couleurs ?? []).map((c) => ({
    nom: c.nom,
    couleur: mode === 'clair' ? c.clair : c.sombre,
    encre: mode === 'clair' ? c.encreClair : c.encreSombre,
  }));
  const parNom = new Map([...base, ...duTheme].map((c) => [c.nom, c]));
  const page = mode === 'clair' ? '#ffffff' : '#141416';
  const encre = mode === 'clair' ? '#1d1d1f' : '#f2f2f4';
  return [`${retrait}--humalis-page: ${page};`, `${retrait}--humalis-encre: ${encre};`, ...[...parNom.values()].map((c) => variable(c.nom, c.couleur, c.encre, retrait))].join('\n');
}

/**
 * Le CSS du thème, à écrire après celui de Humalis : les polices, les
 * couleurs du projet (et leurs classes), la largeur des pages, et, si
 * l'application change le thème ou le fixe, les règles `data-theme`.
 */
export function cssTheme(theme: ThemeRI | undefined, bascule: boolean, polices: Map<string, string> = new Map()): string {
  const parties: string[] = [];

  for (const police of theme?.polices ?? []) {
    if (!police.fichier) continue;
    const contenu = polices.get(police.fichier);
    if (contenu === undefined) throw new Error(`le fichier de police « ${police.fichier} » n'a pas été lu`);
    const extension = police.fichier.split('.').pop()!.toLowerCase();
    const [mime, format] = FORMATS[extension] ?? FORMATS.woff2;
    parties.push(
      `@font-face {\n  font-family: ${nomPolice(police.nom)};\n  src: url(data:${mime};base64,${contenu}) format('${format}');\n  font-display: swap;\n}`,
    );
  }

  if (theme && theme.couleurs.length > 0) {
    parties.push(`:root {\n${variablesDuMode(theme, 'clair', '  ')}\n}`);
    parties.push(`@media (prefers-color-scheme: dark) {\n  :root {\n${variablesDuMode(theme, 'sombre', '    ')}\n  }\n}`);
    for (const c of theme.couleurs.filter((x) => !(x.nom in COULEURS_CSS))) {
      parties.push(
        `.humalis-couleur-${c.nom}, .humalis-texte-${c.nom} { color: var(--humalis-${c.nom}); }\n` +
          `.humalis-fond-${c.nom} { background: var(--humalis-${c.nom}); color: var(--humalis-${c.nom}-encre); border-color: transparent; }`,
      );
    }
  }

  const texte = theme?.polices.find((p) => p.role === 'texte');
  const titres = theme?.polices.find((p) => p.role === 'titres');
  const code = theme?.polices.find((p) => p.role === 'code');
  if (texte) parties.push(`body { font-family: ${nomPolice(texte.nom)}, ${PILE_TEXTE}; }`);
  if (titres) parties.push(`h1, h2, h3, h4, h5, h6 { font-family: ${nomPolice(titres.nom)}, ${texte ? `${nomPolice(texte.nom)}, ` : ''}${PILE_TEXTE}; }`);
  if (code) parties.push(`code, pre { font-family: ${nomPolice(code.nom)}, ${PILE_CODE}; }`);

  if (theme && theme.largeur !== 'normale') parties.push(`.humalis-page { max-width: ${LARGEURS[theme.largeur]}; }`);

  // Le mode fixé par le projet, ou choisi par le visiteur : l'attribut data-theme gagne sur le système.
  if (bascule || (theme && theme.mode !== 'automatique')) {
    parties.push(`:root[data-theme="clair"] {\n  color-scheme: light;\n${variablesDuMode(theme, 'clair', '  ')}\n}`);
    parties.push(`:root[data-theme="sombre"] {\n  color-scheme: dark;\n${variablesDuMode(theme, 'sombre', '  ')}\n}`);
  }

  return parties.length === 0 ? '' : `\n/* Le thème du projet (couleurs, polices, mode). */\n${parties.join('\n')}\n`;
}

// ─── Le HTML et le script ────────────────────────────────────────────────

/** La valeur à écrire dans `<html data-theme="…">`, ou undefined (le système décide). */
export function modeParDefaut(theme: ThemeRI | undefined): 'clair' | 'sombre' | undefined {
  return theme && theme.mode !== 'automatique' ? theme.mode : undefined;
}

/** Le script de `<head>` : retrouve le choix du visiteur avant le premier affichage (pas de clignotement). */
export const SCRIPT_THEME =
  `try{var t=localStorage.getItem('${CLE_THEME}');if(t==='clair'||t==='sombre')document.documentElement.dataset.theme=t}catch(e){}`;

/** `src/humalis/theme.ts` du projet web : « changer theme par … ». */
export function themeTs(defaut: 'clair' | 'sombre' | undefined): string {
  return `/** Le thème choisi par le visiteur (« changer theme par sombre »), gardé dans le navigateur. */
export type Theme = 'clair' | 'sombre' | 'automatique';

const CLE = '${CLE_THEME}';
/** Le mode du projet quand le visiteur n'a rien choisi (bloc « theme : »). */
const PAR_DEFAUT: 'clair' | 'sombre' | undefined = ${defaut ? `'${defaut}'` : 'undefined'};

export function definirTheme(theme: Theme): void {
  const racine = document.documentElement;
  try {
    if (theme === 'automatique') localStorage.removeItem(CLE);
    else localStorage.setItem(CLE, theme);
  } catch {
    // Stockage refusé : le choix vaut pour cette visite seulement.
  }
  const choisi = theme === 'automatique' ? PAR_DEFAUT : theme;
  if (choisi) racine.dataset.theme = choisi;
  else delete racine.dataset.theme;
}
`;
}
