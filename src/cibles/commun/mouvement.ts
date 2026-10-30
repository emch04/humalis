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

/**
 * Les attributs d'un bloc « code … avec animation frappe » : sa classe, le moment de la frappe et une
 * clé stable (la ligne et une empreinte du code), pour ne pas refaire la frappe quand la page se redessine.
 */
export function attributsFrappe(bloc: { frappe?: 'chargement' | 'defilement'; code: string; ligne: number }): { classe: string; frappe: string; cle: string } | undefined {
  if (!bloc.frappe) return undefined;
  let empreinte = 0;
  for (const lettre of bloc.code) empreinte = (empreinte * 31 + lettre.charCodeAt(0)) >>> 0;
  return { classe: 'humalis-animation-frappe', frappe: bloc.frappe, cle: `${bloc.ligne}-${empreinte.toString(36)}` };
}

/** Vrai si une page anime un élément « au defilement » (l'observateur doit alors être écrit). */
export const animeAuDefilement = (codes: string[]): boolean => codes.some((c) => c.includes('humalis-animation-defilement') || c.includes('humalis-animation-frappe'));

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
    } else if (option === 'animation' && valeur === 'frappe') {
      // « code … avec animation frappe » : le vrai code reste en place mais transparent (lecteurs d'écran,
      // copie, taille du bloc) ; le script pose par-dessus une copie qui s'écrit lettre par lettre.
      regles.push('.humalis-animation-frappe { position: relative; }');
      regles.push('.humalis-js .humalis-animation-frappe:not([data-humalis-tape="fini"]) > code:not(.humalis-frappe-copie), .humalis-js .humalis-animation-frappe:not([data-humalis-tape="fini"]) > code:not(.humalis-frappe-copie) * { color: transparent; }');
      regles.push('.humalis-frappe-copie { position: absolute; inset: 0; padding: inherit; overflow: hidden; pointer-events: none; }');
      regles.push('.humalis-frappe-copie::after { content: ""; display: inline-block; width: 0.55em; height: 1.1em; margin-left: 1px; vertical-align: text-bottom; background: currentColor; animation: humalis-curseur 1s steps(1) infinite; }');
      regles.push('@keyframes humalis-curseur { 50% { opacity: 0; } }');
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
  // « en cascade » : le bloc reste en place, ses enfants s'animent l'un après l'autre (80 ms d'écart).
  if (utilisees.has('animation-cascade')) {
    regles.push('.humalis-animation-cascade.humalis-animation-cascade { animation: none; }');
    for (const valeur of Object.keys(ENTREES).filter((v) => utilisees.has(`animation-${v}`))) {
      regles.push(`.humalis-animation-cascade.humalis-animation-${valeur} > * { animation: humalis-${valeur} var(--humalis-duree, 300ms) ease-out var(--humalis-delai, 0ms) backwards; }`);
    }
    for (let rang = 2; rang <= 12; rang++) regles.push(`.humalis-animation-cascade > :nth-child(${rang}) { --humalis-delai: ${(rang - 1) * 80}ms; }`);
    regles.push('.humalis-animation-cascade:not([data-humalis-vu]) > * { animation: none; }');
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
  // « code … avec animation frappe » : une copie du code s'écrit par-dessus le vrai, puis s'efface.
  // Chaque bloc garde où il en est : redessiné en cours de frappe, il reprend au même endroit ;
  // déjà tapé (un retour sur la page), il est montré entier tout de suite.
  const etats = new Map();
  const taper = (pre) => {
    const code = pre.querySelector(':scope > code');
    const cle = pre.getAttribute('data-humalis-frappe-cle');
    const etat = etats.get(cle) ?? { ecrites: 0, fini: false };
    etats.set(cle, etat);
    if (!code || reduire.matches || etat.fini) {
      pre.setAttribute('data-humalis-tape', 'fini');
      return;
    }
    const copie = code.cloneNode(true);
    copie.className = 'humalis-frappe-copie';
    copie.setAttribute('aria-hidden', 'true');
    const morceaux = [];
    const parcours = document.createTreeWalker(copie, NodeFilter.SHOW_TEXT);
    while (parcours.nextNode()) {
      const noeud = parcours.currentNode;
      morceaux.push([noeud, noeud.data]);
      noeud.data = '';
    }
    pre.append(copie);
    pre.setAttribute('data-humalis-tape', 'en-cours');
    // Les lettres déjà tapées sur le bloc d'avant reviennent d'un coup.
    let deja = etat.ecrites;
    for (const morceau of morceaux) {
      const part = morceau[1].slice(0, deja);
      morceau[0].data = part;
      deja -= part.length;
    }
    // Une lettre toutes les 30 ms au plus, et pas plus de 5 secondes en tout ; une pause en fin de ligne.
    const total = morceaux.reduce((somme, morceau) => somme + morceau[1].length, 0);
    const pas = Math.max(8, Math.min(30, 5000 / Math.max(total, 1)));
    let rang = 0;
    let position = 0;
    for (let reste = etat.ecrites; rang < morceaux.length && reste > 0; ) {
      const pris = Math.min(reste, morceaux[rang][1].length);
      reste -= pris;
      if (pris === morceaux[rang][1].length) rang++;
      else position = pris;
    }
    const suivante = () => {
      if (!copie.isConnected) return;
      while (rang < morceaux.length && position >= morceaux[rang][1].length) {
        rang++;
        position = 0;
      }
      if (rang >= morceaux.length || reduire.matches) {
        etat.fini = true;
        copie.remove();
        pre.setAttribute('data-humalis-tape', 'fini');
        return;
      }
      const lettre = morceaux[rang][1][position++];
      morceaux[rang][0].data += lettre;
      etat.ecrites++;
      setTimeout(suivante, lettre === '\\n' ? pas * 6 : pas);
    };
    suivante();
  };
  const observateur = new IntersectionObserver((entrees) => {
    for (const entree of entrees) {
      if (!entree.isIntersecting) continue;
      if (entree.target.hasAttribute('data-humalis-frappe')) taper(entree.target);
      else montrer(entree.target);
      observateur.unobserve(entree.target);
    }
  });
  const suivre = () => {
    for (const element of document.querySelectorAll('.humalis-animation-defilement:not([data-humalis-vu])')) {
      if (reduire.matches) montrer(element);
      else observateur.observe(element);
    }
    for (const pre of document.querySelectorAll('[data-humalis-frappe]:not([data-humalis-tape])')) {
      if (pre.getAttribute('data-humalis-frappe') === 'defilement' && !reduire.matches) {
        pre.setAttribute('data-humalis-tape', 'attente');
        observateur.observe(pre);
      } else taper(pre);
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
${OBSERVATEUR_DEFILEMENT.replace('function observerLeDefilement() {', 'export function observerLeDefilement(): void {')
  .replace('(element) =>', '(element: Element) =>')
  .replace('const etats = new Map();', 'const etats = new Map<string | null, { ecrites: number; fini: boolean }>();')
  .replace('(pre) =>', '(pre: Element) =>')
  .replace('code.cloneNode(true);', 'code.cloneNode(true) as HTMLElement;')
  .replace('const morceaux = [];', 'const morceaux: [Text, string][] = [];')
  .replace('const noeud = parcours.currentNode;', 'const noeud = parcours.currentNode as Text;')}
`;

/** Le prérendu capture la page après le script : il retire les marques du mouvement (rien de caché sans JavaScript). */
export const NETTOYAGE_PRERENDU = `  // Le script du mouvement marque la page (humalis-js, data-humalis-vu) : le HTML prérendu ne garde aucune de ces marques.
  transformHtml: (html) => html.replace(/(<html[^>]*class="[^"]*)\\bhumalis-js\\b/, '$1').replace(/ data-humalis-vu=""/g, '').replace(/ data-humalis-tape="[a-z-]*"/g, '').replace(/<code class="humalis-frappe-copie"[\\s\\S]*?<\\/code>/g, ''),
`;
