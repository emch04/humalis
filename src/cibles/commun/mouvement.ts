/**
 * Le mouvement du code produit : les animations d'entrée, la transition douce et les effets au
 * survol, pour le web, le desktop et le site statique.
 *
 * La règle (décision M18) : tout mouvement vit dans la requête
 * `@media (prefers-reduced-motion: no-preference)`. Hors de ce bloc, le CSS
 * est celui d'un site immobile : on n'ajoute du mouvement que si l'appareil
 * l'accepte, et un navigateur qui ne connaît pas la requête n'anime rien.
 * `mouvementHorsBloc` le vérifie sur tout le CSS produit (test transversal).
 */

/** La seule requête sous laquelle le code produit peut bouger. */
export const REQUETE_MOUVEMENT = '@media (prefers-reduced-motion: no-preference)';

const DUREES: Record<string, string> = { courte: '150ms', moyenne: '300ms', longue: '600ms' };
const DELAIS: Record<string, string> = { courte: '100ms', moyenne: '250ms', longue: '500ms' };
/** L'état de départ de chaque animation d'entrée ; l'arrivée est l'état normal de l'élément. */
const ENTREES: Record<string, string> = {
  apparition: 'from { opacity: 0; }',
  montee: 'from { opacity: 0; transform: translateY(1rem); }',
  agrandissement: 'from { opacity: 0; transform: scale(0.95); }',
};
/** Les durées et délais en millisecondes, pour le mobile (Animated.timing). */
export const MILLISECONDES = {
  duree: { courte: 150, moyenne: 300, longue: 600 } as Record<string, number>,
  delai: { courte: 100, moyenne: 250, longue: 500 } as Record<string, number>,
};

/** Les classes de mouvement qui apparaissent dans le code produit. */
function classesUtilisees(codes: string[]): Set<string> {
  const trouvees = new Set<string>();
  for (const code of codes) for (const m of code.matchAll(/humalis-(animation|duree|delai|transition|effet)-([a-z]+)/g)) trouvees.add(`${m[1]}-${m[2]}`);
  return trouvees;
}

/** Vrai si une page anime un élément « au defilement » (l'observateur doit alors être écrit). */
export const animeAuDefilement = (codes: string[]): boolean => codes.some((c) => c.includes('humalis-animation-defilement'));

/** Le CSS du mouvement utilisé, rangé dans le bloc « no-preference » ; une chaîne vide s'il n'y en a pas. */
export function cssMouvement(codes: string[]): string {
  const utilisees = classesUtilisees(codes);
  if (utilisees.size === 0) return '';
  const regles: string[] = [];
  for (const classe of [...utilisees].sort()) {
    const [option, valeur] = classe.split('-');
    const selecteur = `.humalis-${classe}`;
    if (option === 'animation' && ENTREES[valeur]) {
      // « backwards » : l'état de départ pendant le délai, puis l'élément revient à ses propres styles (survol compris).
      regles.push(`${selecteur} { animation: humalis-${valeur} var(--humalis-duree, 300ms) ease-out var(--humalis-delai, 0ms) backwards; }`);
      regles.push(`@keyframes humalis-${valeur} { ${ENTREES[valeur]} }`);
    } else if (option === 'animation' && valeur === 'defilement') {
      // L'animation attend que le script voie l'élément à l'écran (sans script : immobile et visible) ;
      // caché seulement quand le script est là (humalis-js).
      regles.push('.humalis-animation-defilement:not([data-humalis-vu]) { animation: none; }');
      regles.push('.humalis-js .humalis-animation-defilement:not([data-humalis-vu]) { opacity: 0; }');
    } else if (option === 'duree' && DUREES[valeur]) {
      regles.push(`${selecteur} { --humalis-duree: ${DUREES[valeur]}; }`);
    } else if (option === 'delai' && DELAIS[valeur]) {
      regles.push(`${selecteur} { --humalis-delai: ${DELAIS[valeur]}; }`);
    } else if (option === 'transition' && valeur === 'douce') {
      regles.push(`${selecteur} { transition: color 200ms ease, background-color 200ms ease, border-color 200ms ease, box-shadow 200ms ease, opacity 200ms ease, transform 200ms ease; }`);
    } else if (option === 'effet' && valeur === 'leve') {
      regles.push(`${selecteur} { transition: transform 200ms ease, box-shadow 200ms ease; }`);
      regles.push(`${selecteur}:hover, ${selecteur}:focus-within, ${selecteur}:active { transform: translateY(-0.25rem); box-shadow: 0 8px 20px rgb(0 0 0 / 0.18); }`);
    } else if (option === 'effet' && valeur === 'agrandi') {
      regles.push(`${selecteur} { transition: transform 200ms ease; }`);
      regles.push(`${selecteur}:hover, ${selecteur}:focus-within, ${selecteur}:active { transform: scale(1.03); }`);
    }
  }
  if (regles.length === 0) return '';
  return `\n/* Le mouvement : seulement si l'appareil ne demande pas de réduire les animations. */\n${REQUETE_MOUVEMENT} {\n${regles.map((r) => `  ${r}`).join('\n')}\n}\n`;
}

/**
 * Les déclarations de mouvement écrites hors du bloc « no-preference » :
 * `animation`, `transition`, `@keyframes`, `scroll-behavior: smooth`. Une
 * liste vide : le CSS respecte « réduire les animations ».
 */
export function mouvementHorsBloc(css: string): string[] {
  const texte = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const pile: string[] = [];
  const fautes: string[] = [];
  let morceau = '';
  const dansLeBloc = () => pile.some((p) => /@media[^{]*prefers-reduced-motion\s*:\s*no-preference/.test(p));
  const examiner = (declaration: string) => {
    const d = declaration.trim();
    if (!d || dansLeBloc()) return;
    if (/^(animation|transition)(-[a-z-]+)?\s*:/i.test(d) || /^scroll-behavior\s*:\s*smooth/i.test(d)) fautes.push(d);
  };
  for (const c of texte) {
    if (c === '{') {
      const prelude = morceau.trim();
      if (/^@keyframes\b/.test(prelude) && !dansLeBloc()) fautes.push(prelude);
      pile.push(prelude);
      morceau = '';
    } else if (c === '}') {
      examiner(morceau);
      pile.pop();
      morceau = '';
    } else if (c === ';') {
      examiner(morceau);
      morceau = '';
    } else {
      morceau += c;
    }
  }
  return fautes;
}

/**
 * L'observateur du défilement, en JavaScript lisible : il pose `humalis-js`
 * sur la page, puis marque chaque élément « au defilement » quand il entre à
 * l'écran (data-humalis-vu), ce qui lance son animation. Si l'appareil
 * demande de réduire les animations (maintenant ou plus tard), tout est
 * montré tout de suite. Sans IntersectionObserver, rien n'est caché.
 */
export const OBSERVATEUR_DEFILEMENT = `function observerLeDefilement() {
  if (!('IntersectionObserver' in window)) return;
  const reduire = matchMedia('(prefers-reduced-motion: reduce)');
  const montrer = (element) => element.setAttribute('data-humalis-vu', '');
  const observateur = new IntersectionObserver((entrees) => {
    for (const entree of entrees) {
      if (!entree.isIntersecting) continue;
      montrer(entree.target);
      observateur.unobserve(entree.target);
    }
  });
  const suivre = () => {
    for (const element of document.querySelectorAll('.humalis-animation-defilement:not([data-humalis-vu])')) {
      if (reduire.matches) montrer(element);
      else observateur.observe(element);
    }
  };
  document.documentElement.classList.add('humalis-js');
  suivre();
  // Les éléments affichés plus tard (un « si », une liste reçue) sont suivis aussi.
  new MutationObserver(suivre).observe(document.body, { childList: true, subtree: true });
  reduire.addEventListener('change', suivre);
}`;

/** src/humalis/mouvement.ts du web et du desktop : le même observateur, typé. */
export const MOUVEMENT_WEB = `// Produit par Humalis : les animations « au defilement » se jouent quand l'élément entre à l'écran.
${OBSERVATEUR_DEFILEMENT.replace('function observerLeDefilement() {', 'export function observerLeDefilement(): void {').replace('(element) =>', '(element: Element) =>')}
`;

/** Le prérendu capture la page après le script : il retire les marques du mouvement (rien de caché sans JavaScript). */
export const NETTOYAGE_PRERENDU = `  // Le script du mouvement marque la page (humalis-js, data-humalis-vu) : le HTML prérendu ne garde aucune de ces marques.
  transformHtml: (html) => html.replace(/(<html[^>]*class="[^"]*)\\bhumalis-js\\b/, '$1').replace(/ data-humalis-vu=""/g, ''),
`;
