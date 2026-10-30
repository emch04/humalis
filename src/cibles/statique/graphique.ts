/**
 * Les graphiques du site statique (plan des médias, 4.1) : le script
 * `humalis/graphique.js` (la géométrie partagée et l'écriture du HTML), et
 * le HTML de départ, écrit par le compilateur avec ces mêmes fonctions quand
 * les données sont connues à la compilation. Le HTML de la page et celui que
 * le script redessine sont donc identiques, caractère pour caractère.
 */
import { GEOMETRIE_JS, HTML_GRAPHIQUE_JS, htmlDuGraphique, type ConfigHtml } from '../commun/graphique/geometrie.js';
import { formaterArgent, formaterNombre } from '../format.js';
import { camel, chaine } from '../web/noms.js';
import { messageEnCode } from '../../i18n/messages.js';
import type { GraphiqueRI, Valeur } from '../../ri/types.js';

/** Le réglage d'un graphique, sans ses valeurs (la liste, les étiquettes, la description). */
function reglage(noeud: GraphiqueRI): Omit<ConfigHtml, 'description' | 'etiquettes'> & { devise?: string } {
  return {
    id: noeud.id,
    genre: noeud.genre,
    ...(noeud.etiquette !== undefined ? { etiquette: camel(noeud.etiquette) } : {}),
    nomEtiquettes: noeud.nomEtiquettes,
    series: noeud.series.map((s) => ({ nom: s.nom, ...(s.valeur !== undefined ? { valeur: camel(s.valeur) } : {}), ...(s.couleur ? { couleur: s.couleur } : {}) })),
    ...(noeud.devise ? { devise: noeud.devise } : {}),
    ...(noeud.proportions ? { proportions: noeud.proportions } : {}),
    titre: noeud.titre,
    ...(noeud.classes.length > 0 ? { classes: noeud.classes.join(' ') } : {}),
  };
}

/** `humalisGraphique.dessiner({ … }, ventes)` : l'appel écrit dans le script de la page. */
export function appelGraphique(noeud: GraphiqueRI, js: (v: Valeur) => string): string {
  // Avec des langues, le nom du dessin, l'en-tête des libellés et le nom des séries suivent la langue courante.
  const enCode = (langues: GraphiqueRI['titreLangues'], texte: string) => (langues ? messageEnCode(langues, chaine) : chaine(texte));
  const champs = Object.entries(reglage(noeud)).map(([cle, valeur]) => {
    if (cle === 'titre') return `${cle}: ${enCode(noeud.titreLangues, noeud.titre)}`;
    if (cle === 'nomEtiquettes') return `${cle}: ${enCode(noeud.nomEtiquettesLangues, noeud.nomEtiquettes)}`;
    if (cle === 'series' && noeud.series.some((s) => s.nomLangues)) {
      const series = noeud.series.map((s) => `{ nom: ${enCode(s.nomLangues, s.nom)}${s.valeur !== undefined ? `, valeur: ${chaine(camel(s.valeur))}` : ''}${s.couleur ? `, couleur: ${chaine(s.couleur)}` : ''} }`);
      return `${cle}: [${series.join(', ')}]`;
    }
    return `${cle}: ${litteral(valeur)}`;
  });
  if (noeud.etiquettes) champs.push(`etiquettes: ${js(noeud.etiquettes)}`);
  champs.push(`description: ${js(noeud.description)}`);
  return `humalisGraphique.dessiner({ ${champs.join(', ')} }, ${js(noeud.liste)})`;
}

/**
 * Le HTML de départ d'un graphique : celui du script, calculé avec les
 * valeurs de départ. Une liste inconnue à la compilation donne une figure
 * vide, que le script remplit au chargement.
 */
export function htmlGraphique(noeud: GraphiqueRI, initial: (v: Valeur) => unknown, texte: (v: Valeur) => string): string {
  const config = reglage(noeud);
  const liste = initial(noeud.liste);
  if (liste === undefined) return `<figure class="humalis-graphique" data-humalis="${noeud.id}"></figure>`;
  const etiquettes = noeud.etiquettes ? initial(noeud.etiquettes) : undefined;
  const formater = config.devise ? (v: number) => formaterArgent(v, config.devise as 'FC' | 'EUR' | 'USD') : (v: number) => formaterNombre(v);
  return htmlDuGraphique({ ...config, ...(etiquettes !== undefined ? { etiquettes: etiquettes as unknown[] } : {}), description: texte(noeud.description) }, liste, formater);
}

/** `humalis/graphique.js` : écrit seulement si une page dessine un graphique. */
export const GRAPHIQUE_JS = `// Produit par Humalis : les graphiques du site, dessinés en SVG sans bibliothèque.
// Le HTML de départ de chaque page a été écrit avec ces mêmes fonctions : le
// dessin du script est identique. Tout texte (libellés, description) est
// échappé avant d'entrer dans le HTML ; les nombres passent par isFinite.
'use strict';

const humalisGraphique = (() => {
${indenter(GEOMETRIE_JS)}

${indenter(HTML_GRAPHIQUE_JS)}

  /** Les valeurs au format du graphique : sa devise, sinon le format français des nombres. */
  function formateur(devise) {
    return devise ? (valeur) => humalis.formaterArgent(valeur, devise) : humalis.formaterNombre;
  }

  /** Le graphique, en élément de la page. */
  function dessiner(config, donnees) {
    const modele = document.createElement('template');
    modele.innerHTML = htmlDuGraphique(config, donnees, formateur(config.devise));
    return modele.content.firstElementChild;
  }

  return { dessiner };
})();
`;

/** Une valeur du réglage, écrite en JavaScript lisible : `[{ nom: 'Ventes', valeur: 'montant' }]`. */
function litteral(valeur: unknown): string {
  if (typeof valeur === 'string') return chaine(valeur);
  if (Array.isArray(valeur)) return `[${valeur.map(litteral).join(', ')}]`;
  if (valeur !== null && typeof valeur === 'object') return `{ ${Object.entries(valeur).map(([cle, v]) => `${cle}: ${litteral(v)}`).join(', ')} }`;
  return String(valeur);
}

function indenter(code: string): string {
  return code.replace(/^(?=.)/gm, '  ').trimEnd();
}
