/**
 * Les repères du mode développement (« humalis developper ») : chaque
 * élément de la page porte son fichier Humalis et sa ligne,
 * `data-humalis-source="pages/accueil.humalis:12"`, pour que l'inspecteur
 * du navigateur mène droit au code. Le chemin est relatif au fichier
 * principal, comme l'auteur l'écrit ; la ligne est celle de ce fichier.
 *
 * Une compilation normale n'en reçoit aucun : les cibles ne les écrivent
 * que si on leur donne la table des fichiers du projet (`sources`).
 */
import { DECALAGE, ligneLocale } from '../../fichiers.js';
import { echapperAttribut } from '../statique/html.js';

/**
 * « pages/accueil.humalis:12 » : la ligne fusionnée du projet (k × DECALAGE
 * + ligne, voir src/fichiers.ts) rendue à son fichier. `fichiers` est la
 * liste rendue par compilerProjet, le principal en premier. Undefined si la
 * ligne est inconnue (0) ou hors de la table.
 */
export function repereSource(ligne: number, fichiers: readonly string[]): string | undefined {
  const locale = ligneLocale(ligne);
  const fichier = fichiers[Math.floor(ligne / DECALAGE)];
  return fichier === undefined || locale <= 0 ? undefined : `${fichier}:${locale}`;
}

/** L'attribut en HTML : ` data-humalis-source="…"`, la valeur échappée. */
export function attributSourceHtml(repere: string): string {
  return ` data-humalis-source="${echapperAttribut(repere)}"`;
}

/**
 * L'attribut en JSX. Une chaîne JSX entre guillemets lit les entités HTML
 * (« &amp; ») et ne connaît pas l'échappement : dès qu'un caractère
 * pourrait gêner, la valeur devient une expression JavaScript.
 */
export function attributSourceJsx(repere: string): string {
  return /^[\w./:@ -]*$/u.test(repere) ? ` data-humalis-source="${repere}"` : ` data-humalis-source={${JSON.stringify(repere)}}`;
}

/** Ajoute l'attribut juste après le nom de la balise ouvrante (`<h1 …`, `<Lien …`) ; un fragment (`<>`) reste tel quel. */
export function marquerBalise(balise: string, attribut: string): string {
  return balise.replace(/^<[A-Za-z][\w.]*/, (debut) => debut + attribut);
}

/**
 * L'aide du mode développement : la touche Alt (Option sur Mac) tenue, le
 * survol d'un élément montre son repère dans une petite étiquette près du
 * curseur. Du JavaScript simple, servi par « humalis developper » avec le
 * panneau des erreurs ; il n'entre jamais dans le code produit.
 */
export const AIDE_REPERES = `(() => {
  const etiquette = document.createElement('div');
  etiquette.id = 'humalis-repere';
  Object.assign(etiquette.style, {
    position: 'fixed', zIndex: '999999', pointerEvents: 'none', display: 'none',
    padding: '2px 6px', borderRadius: '4px', background: '#1d2b24', color: '#fff',
    font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'nowrap',
  });
  document.body.append(etiquette);
  let dernier = null;
  const cacher = () => { etiquette.style.display = 'none'; };
  const montrer = (evenement) => {
    const cible = evenement.target && evenement.target.closest ? evenement.target.closest('[data-humalis-source]') : null;
    if (!evenement.altKey || !cible) return cacher();
    etiquette.textContent = cible.getAttribute('data-humalis-source');
    etiquette.style.left = (evenement.clientX + 12) + 'px';
    etiquette.style.top = (evenement.clientY + 14) + 'px';
    etiquette.style.display = 'block';
  };
  document.addEventListener('mousemove', (evenement) => { dernier = evenement; montrer(evenement); });
  document.addEventListener('keydown', (evenement) => { if (evenement.key === 'Alt' && dernier) montrer({ altKey: true, target: dernier.target, clientX: dernier.clientX, clientY: dernier.clientY }); });
  document.addEventListener('keyup', (evenement) => { if (evenement.key === 'Alt') cacher(); });
  window.addEventListener('blur', cacher);
})();
`;
