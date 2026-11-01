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
import { LECTURE_JS } from '../web/graphique.js';
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

/**
 * Lire un graphique au doigt, à la souris et au clavier, comme le composant
 * du web : le script remplace chaque dessin par sa version lisible (une bulle
 * suit le point lu, une phrase est dite aux lecteurs d'écran, un graphique
 * trop long pour sa largeur défile au doigt et montre d'abord la fin).
 */
const ACTIVATION_JS = String.raw`/** Le mouvement est-il réduit (prefers-reduced-motion) ? Les défilements sautent alors sans glisser. */
function mouvementReduit() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Un dessin lisible (large ou étroit) : son HTML, et ce qui le relie au doigt,
 * à la souris et au clavier. « choisir » change la ligne lue, partagée par
 * les deux dessins ; « courant » la donne.
 */
function dessinLisible(lecture, config, suffixe, nom, choisir, courant) {
  const g = lecture.graphe;
  const defilant = lecture.defilant;
  const vueX = defilant ? lecture.gauche : 0;
  const vueLargeur = g.largeur - vueX;
  const id = echapperGraphique(config.id + '-' + suffixe);
  const formes = g.formes.map((f, i) => {
    if (defilant && f.role === 'graduation') return '';
    // Sans <title> : la bulle remplace l'infobulle du navigateur.
    const html = formeHtml(Object.assign({}, f, { titre: undefined }));
    const ligne = lecture.lignesDesFormes[i];
    return ligne >= 0 ? html.replace(/^<(\w+)/, '<$1 data-ligne="' + ligne + '"') : html;
  });
  const svg = '<svg viewBox="' + vueX + ' 0 ' + vueLargeur + ' ' + g.hauteur + '" font-size="' + g.taille + '" role="img" aria-labelledby="' + id + '-nom ' + id + '-desc">' +
    '<title id="' + id + '-nom">' + echapperGraphique(config.titre) + '</title><desc id="' + id + '-desc">' + echapperGraphique(config.description) + '</desc>' + formes.join('') + '</svg>';
  const trace = '<div class="humalis-graphique-trace"' + (defilant ? ' style="width: ' + vueLargeur + 'px"' : '') + '>' + svg + '</div>';
  let html = '<span id="' + id + '-consigne" class="humalis-graphique-consigne">Flèches gauche et droite : lire les valeurs une à une.' + (defilant ? ' Le graphique défile ; il montre d’abord les dernières valeurs.' : '') + '</span>';
  if (defilant) {
    const axe = g.formes.filter((f) => f.role === 'graduation').map(formeHtml).join('');
    html += '<div class="humalis-graphique-cadre"><svg class="humalis-graphique-axe-fixe" width="' + lecture.gauche + '" height="' + g.hauteur + '" viewBox="0 0 ' + lecture.gauche + ' ' + g.hauteur + '" font-size="' + g.taille + '" aria-hidden="true">' + axe + '</svg>' +
      '<div class="humalis-graphique-defileur">' + trace + '</div></div>' +
      '<div class="humalis-graphique-navigation"><button type="button" aria-label="Revenir aux premières valeurs" disabled>« Début</button><button type="button" aria-label="Aller aux dernières valeurs">Fin »</button></div>';
  } else {
    html += trace;
  }
  const zone = document.createElement('div');
  zone.className = 'humalis-graphique-' + nom + ' humalis-graphique-zone' + (defilant ? ' humalis-graphique-defilant' : '');
  zone.tabIndex = 0;
  zone.setAttribute('role', 'group');
  zone.setAttribute('aria-label', config.titre);
  zone.setAttribute('aria-describedby', config.id + '-' + suffixe + '-consigne');
  zone.innerHTML = html;

  const dessin = zone.querySelector('.humalis-graphique-trace > svg');
  const cadre = dessin.parentNode;
  const defileur = zone.querySelector('.humalis-graphique-defileur');
  const boutons = zone.querySelectorAll('.humalis-graphique-navigation button');
  const valeurs = zone.querySelectorAll('[data-ligne]');
  const points = lecture.points;
  const guide = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  guide.setAttribute('class', 'humalis-graphique-guide');
  const bulle = document.createElement('div');
  bulle.className = 'humalis-graphique-bulle';
  bulle.setAttribute('aria-hidden', 'true');

  /** Montre la ligne lue : la bulle, le trait vertical, la forme en évidence (ou rien). */
  function montrer(index) {
    const point = points.find((p) => p.index === index);
    cadre.classList.toggle('humalis-graphique-lu', !!point);
    valeurs.forEach((el) => el.classList.toggle('humalis-graphique-actif', !!point && Number(el.getAttribute('data-ligne')) === index));
    if (!point) {
      guide.remove();
      bulle.remove();
      return;
    }
    if (config.genre !== 'camembert') {
      guide.setAttribute('x1', point.x);
      guide.setAttribute('x2', point.x);
      guide.setAttribute('y1', lecture.haut);
      guide.setAttribute('y2', lecture.bas);
      dessin.querySelector('desc').after(guide);
    }
    const fort = document.createElement('strong');
    fort.textContent = point.libelle;
    bulle.replaceChildren(fort);
    for (const ligne of point.lignes) {
      const morceau = document.createElement('span');
      morceau.textContent = ligne;
      bulle.append(morceau);
    }
    // La bulle se pose du côté où il reste de la place, sans jamais cacher le point lu.
    const aDroite = defilant && defileur.clientWidth > 0 ? point.x - vueX - defileur.scrollLeft < defileur.clientWidth / 2 : point.x - vueX < vueLargeur / 2;
    const decalage = aDroite ? '12px' : 'calc(-100% - 12px)';
    bulle.style.left = ((point.x - vueX) / vueLargeur) * 100 + '%';
    if (config.genre === 'camembert') {
      bulle.style.top = Math.min(85, Math.max(15, (point.y / g.hauteur) * 100)) + '%';
      bulle.style.transform = 'translate(' + decalage + ', -50%)';
    } else {
      bulle.style.top = '0.25rem';
      bulle.style.transform = 'translateX(' + decalage + ')';
    }
    cadre.append(bulle);
  }

  /** La ligne sous le doigt ou la souris : la part touchée, sinon le point le plus proche en largeur. */
  function ligneSous(e) {
    if (config.genre === 'camembert') {
      const element = document.elementFromPoint(e.clientX, e.clientY);
      const ligne = element ? element.getAttribute('data-ligne') : null;
      return ligne === null ? null : Number(ligne);
    }
    const boite = dessin.getBoundingClientRect();
    if (boite.width === 0 || points.length === 0) return null;
    const x = vueX + ((e.clientX - boite.left) / boite.width) * vueLargeur;
    let proche = points[0];
    for (const p of points) if (Math.abs(p.x - x) < Math.abs(proche.x - x)) proche = p;
    return proche.index;
  }

  // Courbe et barres : glisser le doigt de gauche à droite fait suivre la bulle, un glissement
  // vertical fait défiler la page. Un dessin qui défile garde le glissement pour défiler :
  // un appui long, puis glisser, fait suivre la bulle.
  let appui = null;
  function finirAppui() {
    if (appui) clearTimeout(appui.minuteur);
    appui = null;
  }
  dessin.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) choisir(ligneSous(e));
      return;
    }
    choisir(ligneSous(e));
    const etat = { suit: !defilant, bloque: false, minuteur: 0, x: e.clientX, y: e.clientY };
    if (defilant) etat.minuteur = setTimeout(() => { etat.suit = true; etat.bloque = true; }, 300);
    appui = etat;
  });
  dessin.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      const ligne = ligneSous(e);
      if (ligne !== null || config.genre === 'camembert') choisir(ligne);
      return;
    }
    if (!appui) return;
    if (!appui.suit) {
      if (Math.abs(e.clientX - appui.x) + Math.abs(e.clientY - appui.y) > 10) finirAppui();
      return;
    }
    const ligne = ligneSous(e);
    if (ligne !== null) choisir(ligne);
  });
  dessin.addEventListener('pointerup', finirAppui);
  dessin.addEventListener('pointercancel', finirAppui);
  dessin.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && document.activeElement !== zone) choisir(null);
  });
  dessin.addEventListener('touchmove', (e) => {
    if (appui && appui.bloque) e.preventDefault();
  }, { passive: false });

  /** Fait défiler le dessin jusqu'au point, s'il est caché. */
  function amener(point) {
    if (!defilant) return;
    const x = point.x - vueX;
    if (x < defileur.scrollLeft + 24 || x > defileur.scrollLeft + defileur.clientWidth - 24) defileur.scrollLeft = x - defileur.clientWidth / 2;
  }

  // Le clavier : flèches gauche et droite d'un point à l'autre, Début et Fin, Échap pour fermer la bulle.
  zone.addEventListener('keydown', (e) => {
    if (e.target !== zone || points.length === 0) return;
    const actif = courant();
    const position = points.findIndex((p) => p.index === actif);
    let suivante = -1;
    if (e.key === 'ArrowRight') suivante = position < 0 ? 0 : Math.min(points.length - 1, position + 1);
    else if (e.key === 'ArrowLeft') suivante = position < 0 ? points.length - 1 : Math.max(0, position - 1);
    else if (e.key === 'Home') suivante = 0;
    else if (e.key === 'End') suivante = points.length - 1;
    else if (e.key === 'Escape' && actif !== null) {
      e.preventDefault();
      choisir(null);
      return;
    }
    if (suivante < 0) return;
    e.preventDefault();
    amener(points[suivante]);
    choisir(points[suivante].index);
  });

  if (defilant) {
    const mesurerBords = () => {
      boutons[0].disabled = defileur.scrollLeft <= 1;
      boutons[1].disabled = defileur.scrollLeft + defileur.clientWidth >= defileur.scrollWidth - 1;
    };
    const aller = (fin) => defileur.scrollTo({ left: fin ? defileur.scrollWidth : 0, behavior: mouvementReduit() ? 'auto' : 'smooth' });
    boutons[0].addEventListener('click', () => aller(false));
    boutons[1].addEventListener('click', () => aller(true));
    defileur.addEventListener('scroll', mesurerBords, { passive: true });
    // Les dernières valeurs d'abord, dès que le dessin a une largeur (il n'est pas encore dans la page).
    let place = false;
    const placer = () => {
      if (place || defileur.clientWidth === 0) return;
      place = true;
      defileur.scrollLeft = defileur.scrollWidth;
      mesurerBords();
    };
    if (typeof ResizeObserver === 'function') new ResizeObserver(placer).observe(defileur);
    else requestAnimationFrame(placer);
  }
  return { zone, lecture, montrer };
}

/** Remplace les dessins d'une figure par leurs versions lisibles, qui partagent la ligne lue. */
function activer(figure, config, donnees, formater) {
  const dessins = [];
  let actif = null;
  const annonce = document.createElement('p');
  annonce.className = 'humalis-graphique-annonce';
  annonce.setAttribute('aria-live', 'polite');
  const choisir = (index) => {
    if (index === actif) return;
    actif = index;
    for (const d of dessins) d.montrer(index);
    const point = dessins[0].lecture.points.find((p) => p.index === index);
    annonce.textContent = point ? texteDuPoint(point) : '';
  };
  [[640, 'large', 'l'], [400, 'etroit', 'e']].forEach(([largeur, nom, suffixe]) => {
    const ancien = figure.querySelector(':scope > svg.humalis-graphique-' + nom);
    if (!ancien) return;
    const dessin = dessinLisible(lireGraphique(config, largeur, (reglage, l) => calculerGraphique(reglage, donnees, formater, l)), config, suffixe, nom, choisir, () => actif);
    ancien.replaceWith(dessin.zone);
    dessins.push(dessin);
  });
  if (dessins.length === 0) return;
  dessins[dessins.length - 1].zone.after(annonce);
  // Toucher ailleurs que sur le graphique ferme sa bulle. Une page redessinée remplace ses
  // figures : l'écoute d'une figure retirée de la page s'enlève au toucher suivant.
  const fermer = (e) => {
    if (!figure.isConnected) {
      document.removeEventListener('pointerdown', fermer);
      return;
    }
    if (actif !== null && !figure.contains(e.target)) choisir(null);
  };
  document.addEventListener('pointerdown', fermer);
}
`;

/** `humalis/graphique.js` : écrit seulement si une page dessine un graphique. */
export const GRAPHIQUE_JS = `// Produit par Humalis : les graphiques du site, dessinés en SVG sans bibliothèque.
// Le HTML de départ de chaque page a été écrit avec ces mêmes fonctions : le
// dessin du script est identique. Tout texte (libellés, description) est
// échappé avant d'entrer dans le HTML ; les nombres passent par isFinite.
// Ensuite, chaque dessin devient lisible au doigt, à la souris et au clavier.
'use strict';

const humalisGraphique = (() => {
${indenter(GEOMETRIE_JS)}

${indenter(HTML_GRAPHIQUE_JS)}

${indenter(LECTURE_JS)}

${indenter(ACTIVATION_JS)}

  /** Les valeurs au format du graphique : sa devise, sinon le format français des nombres. */
  function formateur(devise) {
    return devise ? (valeur) => humalis.formaterArgent(valeur, devise) : humalis.formaterNombre;
  }

  /** Le graphique, en élément de la page, lisible au doigt, à la souris et au clavier. */
  function dessiner(config, donnees) {
    const modele = document.createElement('template');
    modele.innerHTML = htmlDuGraphique(config, donnees, formateur(config.devise));
    const figure = modele.content.firstElementChild;
    if (figure && typeof figure.querySelector === 'function') activer(figure, config, donnees, formateur(config.devise));
    return figure;
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
