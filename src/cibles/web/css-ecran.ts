/**
 * Le CSS des réglages de mise en page : colonnes,
 * espacement, remplissage, alignement, répartition, largeur, ombre,
 * coins, dégradé, élément collé, affichage selon l'appareil.
 *
 * Il est partagé par le web, le desktop (qui reprend le web) et le site
 * statique : chacun lui passe le code qu'il a produit, et il n'écrit que
 * les règles des classes qui s'y trouvent. Le CSS de l'utilisateur, chargé
 * après, peut tout redéfinir.
 */

/** L'échelle des espaces (espacement, remplissage). */
const ESPACES: Record<string, string> = { aucune: '0', petite: '0.5rem', moyenne: '1rem', grande: '2rem' };
const ALIGNEMENTS: Record<string, string> = { debut: 'flex-start', centree: 'center', fin: 'flex-end', etire: 'stretch' };
const REPARTITIONS: Record<string, string> = { debut: 'flex-start', centree: 'center', fin: 'flex-end', entre: 'space-between', autour: 'space-around' };
const LARGEURS: Record<string, string> = { etroite: '36rem', normale: '48rem', large: '72rem', pleine: 'none' };
const OMBRES: Record<string, string> = {
  aucune: 'none',
  legere: '0 1px 3px rgb(0 0 0 / 0.15)',
  moyenne: '0 4px 12px rgb(0 0 0 / 0.2)',
  forte: '0 12px 32px rgb(0 0 0 / 0.3)',
};
const COINS: Record<string, string> = { douce: '0.5rem', ronde: '50%' };
const ANGLES: Record<string, string> = { diagonale: '135deg', vertical: '180deg', horizontal: '90deg' };

/** Les classes `humalis-<réglage>-<valeur>` qui apparaissent dans le code produit. */
export function reglagesUtilises(codes: string[]): Set<string> {
  const trouves = new Set<string>();
  const motif = /humalis-(colonnes|espacement|remplissage|alignement|repartition|largeur|ombre|degrade|colle|bordure|sur|defilement|hauteur|fixe)-([a-z0-9_-]+)/g;
  for (const code of codes) for (const m of code.matchAll(motif)) trouves.add(`${m[1]}-${m[2]}`);
  return trouves;
}

/** Le CSS des réglages utilisés, ou une chaîne vide s'il n'y en a pas. */
export function cssEcran(codes: string[]): string {
  const utilises = reglagesUtilises(codes);
  const regles: string[] = [];
  if (codes.some((c) => c.includes('humalis-accent'))) regles.push('.humalis-accent { color: var(--humalis-marque, currentColor); }');
  if (codes.some((c) => c.includes('humalis-code-ligne'))) regles.push('.humalis-code-ligne { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; padding: 0.1em 0.25em; border-radius: 0.2em; background: rgb(127 127 127 / 0.12); }');
  if (codes.some((c) => c.includes('humalis-bloc-code'))) regles.push('.humalis-bloc-code-conteneur { position: relative; max-width: 100%; overflow-x: auto; } .humalis-bloc-code { overflow-x: auto; padding: 1rem; border-radius: 0.5rem; background: rgb(127 127 127 / 0.12); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre; } .humalis-bloc-code-conteneur button { position: absolute; top: 0.5rem; right: 0.5rem; }');
  if (codes.some((c) => c.includes('humalis-code-mot'))) regles.push('.humalis-code-mot { color: #7348c3; font-weight: 600; } .humalis-code-texte { color: #147d50; } .humalis-code-commentaire { color: #68717d; } .humalis-code-nombre { color: #b25215; }');
  if (codes.some((c) => c.includes('humalis-tableau-conteneur'))) regles.push('.humalis-tableau-conteneur { max-width: 100%; overflow-x: auto; } .humalis-tableau-conteneur table { border-collapse: collapse; width: 100%; } .humalis-tableau-conteneur th, .humalis-tableau-conteneur td { border: 1px solid rgb(127 127 127 / 0.3); padding: 0.5rem; text-align: left; } .humalis-tableau-conteneur caption { text-align: left; font-weight: 700; margin-bottom: 0.5rem; }');
  if (codes.some((c) => c.includes('humalis-liste'))) regles.push('.humalis-liste { padding-inline-start: 1.5rem; } .humalis-liste > li { margin-block: 0.35rem; }');
  // L'en-tête et le pied communs : hors de la page, sur toute la largeur.
  if (codes.some((c) => /humalis-entete\b/.test(c))) {
    regles.push('.humalis-entete { padding: 0.75rem 1rem; border-bottom: 1px solid rgb(138 138 144 / 0.4); }');
    // « Aller au contenu » : hors de l'écran, il apparaît quand le clavier l'atteint.
    regles.push('.humalis-aller-au-contenu { position: absolute; left: 0.5rem; top: -4rem; z-index: 1000; padding: 0.5rem 1rem; border-radius: 0.5rem; background: Canvas; color: CanvasText; }');
    regles.push('.humalis-aller-au-contenu:focus { top: 0.5rem; }');
  }
  // « menu vertical » : les liens en colonne, qui ne passent jamais sur une deuxième colonne
  // (un sommaire de hauteur limitée défile au lieu de s'étaler).
  if (codes.some((c) => c.includes('humalis-menu-vertical'))) regles.push('.humalis-menu-vertical { flex-direction: column; flex-wrap: nowrap; align-items: stretch; }');
  // « menu repliable » : sur un petit écran, les liens attendent le bouton « Menu ».
  if (codes.some((c) => c.includes('humalis-menu-repliable'))) {
    regles.push('.humalis-menu-bouton { display: none; }');
    // L'icône burger : trois traits (le trait du milieu et ses deux ombres), une croix quand le menu est ouvert.
    regles.push('.humalis-menu-bouton { align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; padding: 0; }');
    regles.push('.humalis-menu-icone { position: relative; display: block; width: 1.125rem; height: 2px; border-radius: 2px; background: currentColor; box-shadow: 0 -6px 0 currentColor, 0 6px 0 currentColor; }');
    regles.push('.humalis-menu-bouton[aria-expanded="true"] .humalis-menu-icone { box-shadow: none; transform: rotate(45deg); }');
    regles.push('.humalis-menu-bouton[aria-expanded="true"] .humalis-menu-icone::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: currentColor; transform: rotate(-90deg); }');
    regles.push(
      '@media (max-width: 720px) { .humalis-menu-repliable { flex-direction: column; align-items: stretch; } .humalis-menu-bouton { display: inline-flex; align-self: flex-start; } .humalis-menu-repliable:not([data-ouvert]) > :not(.humalis-menu-bouton) { display: none; } }',
    );
  }
  if (codes.some((c) => /humalis-pied\b/.test(c))) regles.push('.humalis-pied { padding: 1.5rem 1rem; margin-top: 2rem; border-top: 1px solid rgb(138 138 144 / 0.4); }');
  if (utilises.size === 0 && regles.length === 0) return '';
  const media: string[] = [];
  let appareil = false;

  for (const reglage of [...utilises].sort()) {
    const [, option, valeur] = /^([a-z]+)-(.+)$/.exec(reglage)!;
    const classe = `.humalis-${option}-${valeur}`;
    switch (option) {
      case 'colonnes': {
        const n = Number(valeur);
        regles.push(`.humalis-grille${classe} { grid-template-columns: repeat(${n}, minmax(0, 1fr)); }`);
        if (n > 2) media.push(`@media (max-width: 1023px) { .humalis-grille${classe} { grid-template-columns: repeat(2, minmax(0, 1fr)); } }`);
        if (n > 1) media.push(`@media (max-width: 639px) { .humalis-grille${classe} { grid-template-columns: minmax(0, 1fr); } }`);
        break;
      }
      case 'espacement':
        if (valeur in ESPACES) regles.push(`${classe} { gap: ${ESPACES[valeur]}; }`);
        break;
      case 'remplissage':
        if (valeur in ESPACES) regles.push(`${classe} { padding: ${ESPACES[valeur]}; }`);
        break;
      case 'alignement':
        if (valeur in ALIGNEMENTS) regles.push(`${classe} { align-items: ${ALIGNEMENTS[valeur]}; }`);
        break;
      case 'repartition':
        if (valeur in REPARTITIONS) regles.push(`${classe} { justify-content: ${REPARTITIONS[valeur]}; }`);
        break;
      case 'largeur':
        if (valeur in LARGEURS) regles.push(`${classe} { max-width: ${LARGEURS[valeur]}; margin-left: auto; margin-right: auto; }`);
        break;
      case 'ombre':
        if (valeur in OMBRES) regles.push(`${classe} { box-shadow: ${OMBRES[valeur]}; }`);
        break;
      case 'bordure':
        if (valeur in COINS) regles.push(`${classe} { border-radius: ${COINS[valeur]}; }`);
        break;
      case 'colle':
        // Un fond opaque, pour ne pas laisser voir le contenu qui passe dessous.
        regles.push(
          valeur === 'bas'
            ? `${classe} { position: sticky; bottom: 0; z-index: 5; background: var(--humalis-page); }`
            : `${classe} { position: sticky; top: 0; z-index: 5; background: var(--humalis-page); }`,
        );
        break;
      case 'degrade': {
        const m = /^([a-z0-9_]+)-([a-z0-9_]+)-(diagonale|vertical|horizontal)$/.exec(valeur);
        if (m) {
          regles.push(
            `${classe} { background: linear-gradient(${ANGLES[m[3]]}, var(--humalis-${m[1]}), var(--humalis-${m[2]})); color: var(--humalis-${m[1]}-encre); }`,
          );
        }
        break;
      }
      case 'sur':
        appareil = true;
        break;
      case 'defilement':
        // « defilement interne » : le bloc défile seul, sans entraîner la page ; une barre fine.
        if (valeur === 'interne') regles.push(`${classe} { overflow-y: auto; overscroll-behavior: contain; min-height: 0; max-height: 100%; align-self: stretch; scrollbar-width: thin; }`);
        break;
      case 'hauteur':
        // « hauteur ecran » : l'écran moins l'en-tête (mesuré par le script, 0 sans en-tête fixe ou collé).
        if (valeur === 'ecran') regles.push(`${classe} { height: calc(100dvh - var(--humalis-hauteur-entete, 0px)); min-height: 0; overflow: auto; }`);
        break;
      case 'fixe':
        // « entete avec fixe » : l'en-tête ne bouge pas ; sur le web, la racine devient la zone qui
        // défile, sous l'en-tête (sans glisser de côté : un décor qui dépasse ne la déplace pas) ;
        // sur le statique, la page laisse la place de l'en-tête.
        regles.push(`header${classe} { position: fixed; top: 0; left: 0; right: 0; z-index: 50; background: var(--humalis-page); }`);
        regles.push('html:has(#racine > .humalis-fixe-oui), html:has(#racine > .humalis-fixe-oui) body { height: 100%; overflow: hidden; }');
        regles.push('#racine:has(> .humalis-fixe-oui) { position: fixed; top: var(--humalis-hauteur-entete, 0px); left: 0; right: 0; bottom: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; }');
        regles.push('body:has(header.humalis-fixe-oui) { padding-top: var(--humalis-hauteur-entete, 0px); }');
        break;
    }
  }

  if (appareil) {
    // Le contenu est en CSS seul : le HTML prérendu est le même sur tous les appareils.
    // « display: contents » laisse les enfants se placer dans la ligne ou la grille parente.
    regles.unshift('.humalis-appareil { display: none; }');
    media.push(
      '@media (max-width: 639px) { .humalis-sur-telephone { display: contents; } }',
      '@media (min-width: 640px) and (max-width: 1023px) { .humalis-sur-tablette { display: contents; } }',
      '@media (min-width: 1024px) { .humalis-sur-ordinateur { display: contents; } }',
    );
  }

  return `\n/* Les réglages de mise en page utilisés par cette application. */\n${[...regles, ...media].join('\n')}\n`;
}
