/**
 * Les outils JavaScript des éléments d'écran du site statique (icônes,
 * avatar, étoiles, code QR, carrousel). Ils sont ajoutés à
 * `humalis/humalis.js` seulement quand une page s'en sert.
 */
import { FORMES_LUCIDE } from '../icones-donnees.js';

export interface UsageElements {
  /** Les noms Lucide des icônes que le script dessine. */
  icones: string[];
  avatar: boolean;
  etoiles: boolean;
  qr: boolean;
  carrousel: boolean;
  carte: boolean;
}

/** Ce que les scripts et le HTML des pages utilisent. */
export function usageElements(textes: string[]): UsageElements {
  const tout = textes.join('\n');
  const icones = [...new Set([...tout.matchAll(/\bicone\('([a-z0-9-]+)'/g)].map((m) => m[1]))];
  const etoiles = /\betoiles\(/.test(tout);
  if (etoiles && !icones.includes('star')) icones.push('star');
  return {
    icones,
    avatar: /\bavatar\(/.test(tout),
    etoiles,
    qr: /\bcodeQr\(/.test(tout),
    carrousel: /data-humalis-carrousel/.test(tout),
    carte: /\bcarteLieux\(/.test(tout),
  };
}

/** Les noms que `humalis.js` exporte en plus, selon l'usage. */
export function exportsElements(u: UsageElements): string[] {
  return [...(u.icones.length > 0 ? ['icone'] : []), ...(u.avatar ? ['avatar'] : []), ...(u.etoiles ? ['etoiles'] : []), ...(u.qr ? ['codeQr'] : []), ...(u.carte ? ['carteLieux'] : [])];
}

export function elementsJs(u: UsageElements): string {
  const parties: string[] = [];
  if (u.icones.length > 0) {
    const formes = u.icones.map((nom) => `    ${JSON.stringify(nom)}: ${JSON.stringify(FORMES_LUCIDE[nom] ?? FORMES_LUCIDE['circle-help'])},`).join('\n');
    parties.push(`
  // ─── Les icônes (tracés de Lucide, licence ISC) ─────────────────────────

  const FORMES = {
${formes}
  };

  /**
   * Une icône en SVG, à la couleur du texte. Les tracés viennent de cette
   * table, jamais d'une valeur du programme.
   */
  function icone(nom, classe, label) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    const attributs = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: classe };
    for (const [cle, valeur] of Object.entries(attributs)) svg.setAttribute(cle, valeur);
    if (label) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', label);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }
    const modele = new DOMParser().parseFromString(\`<svg xmlns="\${NS}">\${FORMES[nom] ?? ''}</svg>\`, 'image/svg+xml');
    for (const forme of modele.documentElement.childNodes) svg.append(document.importNode(forme, true));
    return svg;
  }
`);
  }
  if (u.avatar) {
    parties.push(`
  // ─── L'avatar : la photo, ou les initiales ──────────────────────────────

  /** « Camille Martin » donne « CM ». */
  function initiales(nom) {
    const mots = String(nom).trim().split(/\\s+/).filter(Boolean);
    return ((mots[0]?.[0] ?? '') + (mots.length > 1 ? (mots[mots.length - 1][0] ?? '') : '')).toUpperCase();
  }

  function avatar(nom, photo) {
    return photo ? creer('img', { src: photo, alt: '' }) : creer('span', { 'aria-hidden': 'true' }, initiales(nom));
  }
`);
  }
  if (u.etoiles) {
    parties.push(`
  // ─── Les étoiles de note ────────────────────────────────────────────────

  /** Une note en étoiles, avec les demi-étoiles ; des boutons radio si \`change\` est donné. */
  function etoiles(valeur, maximum, change, label, classes) {
    const unites = Array.from({ length: maximum }, (_, i) => {
      const reste = (valeur || 0) - i;
      const etat = reste >= 1 ? 'pleine' : reste >= 0.5 ? 'demi' : 'vide';
      const dessin = [icone('star', 'humalis-etoile-fond'), ...(etat === 'demi' ? [creer('span', { class: 'humalis-etoile-moitie' }, icone('star', ''))] : [])];
      return change
        ? creer('button', { type: 'button', role: 'radio', 'aria-checked': String(Math.round(valeur) === i + 1), 'aria-label': \`\${i + 1} sur \${maximum}\`, class: \`humalis-etoile humalis-etoile-\${etat}\`, onclick: () => change(i + 1) }, ...dessin)
        : creer('span', { class: \`humalis-etoile humalis-etoile-\${etat}\` }, ...dessin);
    });
    return creer('span', { class: classes, role: change ? 'radiogroup' : 'img', 'aria-label': label }, ...unites);
  }
`);
  }
  if (u.qr) {
    parties.push(`
  // ─── Le code QR (qrcode-generator, licence MIT : humalis/qrcode.js) ─────

  /** Un code QR en SVG, noir sur blanc ; niveau de correction M. */
  function codeQr(texte) {
    const NS = 'http://www.w3.org/2000/svg';
    const code = qrcode(0, 'M');
    code.addData(String(texte));
    code.make();
    const taille = code.getModuleCount();
    let d = '';
    for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) if (code.isDark(y, x)) d += \`M\${x} \${y}h1v1h-1z\`;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', \`0 0 \${taille} \${taille}\`);
    svg.setAttribute('width', '192');
    svg.setAttribute('height', '192');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('aria-hidden', 'true');
    const chemin = document.createElementNS(NS, 'path');
    chemin.setAttribute('d', d);
    chemin.setAttribute('fill', '#000000');
    svg.append(chemin);
    return svg;
  }
`);
  }
  if (u.carrousel) {
    parties.push(`
  // ─── Les carrousels ─────────────────────────────────────────────────────
  // Le HTML porte la piste (défilement accroché : le doigt et la molette
  // marchent sans script). Le script ajoute les flèches, les points et le
  // défilement automatique après chaque dessin de la page, et retrouve la
  // position où l'on en était.

  const positions = new Map();
  const minuteries = new Map();

  function activerCarrousels() {
    for (const minuterie of minuteries.values()) clearInterval(minuterie);
    minuteries.clear();
    for (const section of document.querySelectorAll('[data-humalis-carrousel]')) {
      const id = section.getAttribute('data-humalis-carrousel');
      const piste = section.querySelector('.humalis-carrousel-piste');
      if (!piste) continue;
      const visibles = window.innerWidth < 640 ? 1 : Number(section.style.getPropertyValue('--humalis-visibles')) || 1;
      const pages = Math.max(1, piste.children.length - visibles + 1);
      const pas = () => (piste.children[1] ? piste.children[1].offsetLeft - piste.children[0].offsetLeft : piste.clientWidth);
      const courante = () => Math.min(pages - 1, Math.round(piste.scrollLeft / (pas() || 1)));
      const aller = (index) => {
        const cible = piste.children[(index + pages) % pages];
        if (cible) piste.scrollTo({ left: cible.offsetLeft - piste.offsetLeft });
      };
      piste.style.scrollBehavior = 'auto';
      piste.scrollLeft = positions.get(id) ?? 0;
      piste.style.scrollBehavior = '';
      if (pages > 1) {
        const points = Array.from({ length: pages }, (_, i) => {
          const point = creer('button', { type: 'button', class: 'humalis-carrousel-point', 'aria-label': \`Diapositive \${i + 1} sur \${pages}\` });
          point.addEventListener('click', () => aller(i));
          return point;
        });
        const precedent = creer('button', { type: 'button', 'aria-label': 'Précédent' }, '‹');
        const suivant = creer('button', { type: 'button', 'aria-label': 'Suivant' }, '›');
        precedent.addEventListener('click', () => aller(courante() - 1));
        suivant.addEventListener('click', () => aller(courante() + 1));
        section.append(creer('div', { class: 'humalis-carrousel-commandes' }, precedent, creer('div', { class: 'humalis-carrousel-points' }, ...points), suivant));
        const majPoints = () => points.forEach((p, i) => p.setAttribute('aria-current', String(courante() === i)));
        majPoints();
        piste.addEventListener('scroll', () => {
          positions.set(id, piste.scrollLeft);
          majPoints();
        }, { passive: true });
        const secondes = Number(section.getAttribute('data-automatique'));
        if (secondes && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          let pause = false;
          for (const evenement of ['mouseenter', 'focusin']) section.addEventListener(evenement, () => (pause = true));
          for (const evenement of ['mouseleave', 'focusout']) section.addEventListener(evenement, () => (pause = false));
          minuteries.set(id, setInterval(() => !pause && aller(courante() + 1), secondes * 1000));
        }
      }
    }
  }
`);
  }
  if (u.carte) {
    parties.push(`
  // ─── Les cartes (Leaflet 1.9.4 : humalis/leaflet.js, licence BSD-2-Clause) ──
  // Le HTML de départ porte déjà la liste des lieux ; le script y ajoute la carte
  // dessinée. Une carte déjà dessinée reste en place quand la page est redessinée.

  const cartes = new Map();

  /** Le même endroit sur OpenStreetMap : une alternative à la carte dessinée. */
  const lienOpenStreetMap = (lieu) => \`https://www.openstreetmap.org/?mlat=\${lieu.latitude}&mlon=\${lieu.longitude}#map=15/\${lieu.latitude}/\${lieu.longitude}\`;

  const echapperHtml = (texte) => String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /** Les tuiles d'OpenStreetMap (politique d'usage : https://operations.osmfoundation.org/policies/tiles/), attribution toujours affichée. */
  const TUILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">les contributeurs d’OpenStreetMap</a>';
  const REPERE = '<svg viewBox="0 0 24 32" width="28" height="38" aria-hidden="true" focusable="false"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20 12 32 12 32s12-12 12-20.3C24 5.2 18.6 0 12 0z" stroke="#ffffff" stroke-width="1.5"/><circle cx="12" cy="11.5" r="4.5" fill="#ffffff"/></svg>';

  /** Dessine la carte de Leaflet dans la zone : les tuiles, les repères focalisables, le centre et le zoom. */
  function dessinerCarte(L, zone, reglages, lieux) {
    // « Réduire les animations » : la carte ne bouge pas toute seule.
    const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const carte = L.map(zone, { zoomControl: false, attributionControl: false, zoomAnimation: !calme, fadeAnimation: !calme, markerZoomAnimation: !calme, inertia: !calme });
    L.control.zoom({ zoomInTitle: 'Agrandir', zoomOutTitle: 'Réduire' }).addTo(carte);
    L.control.attribution({ prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(carte);
    L.tileLayer(reglages.tuiles ?? TUILES, { maxZoom: 19, attribution: reglages.tuiles ? echapperHtml(reglages.attribution ?? '') : ATTRIBUTION }).addTo(carte);
    const icone = L.divIcon({ className: 'humalis-carte-repere', html: REPERE, iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -34] });
    const marqueurs = lieux.map((lieu) => {
      const marqueur = L.marker([lieu.latitude, lieu.longitude], { icon: icone, title: lieu.nom, keyboard: true }).addTo(carte);
      // La bulle est faite avec des noeuds de texte : un nom n'est jamais lu comme du HTML.
      marqueur.bindPopup(creer('div', {}, creer('strong', {}, lieu.nom), ...(lieu.adresse ? [creer('p', {}, lieu.adresse)] : [])));
      return marqueur;
    });
    const positions = marqueurs.map((m) => m.getLatLng());
    if (reglages.latitude !== undefined && reglages.longitude !== undefined) carte.setView([reglages.latitude, reglages.longitude], reglages.zoom ?? 15);
    else if (positions.length === 1) carte.setView(positions[0], reglages.zoom ?? 15);
    else if (reglages.zoom !== undefined) carte.setView(L.latLngBounds(positions).getCenter(), reglages.zoom);
    else carte.fitBounds(L.latLngBounds(positions), { padding: [32, 32], maxZoom: 15 });
    // Le repère n'existe dans la page qu'une fois la vue posée : c'est alors qu'il reçoit son nom.
    marqueurs.forEach((m, i) => m.getElement()?.setAttribute('aria-label', lieux[i].nom));
    return carte;
  }

  /** Une carte : la zone dessinée par Leaflet et, dessous, la liste des lieux (lue par les lecteurs d'écran). */
  function carteLieux(id, nom, reglages, lieux, classes) {
    const signature = JSON.stringify([nom, reglages, lieux]);
    const gardee = cartes.get(id);
    if (gardee?.signature === signature) return gardee.element;
    gardee?.carte?.remove();
    const zone = creer('div', { class: 'humalis-carte-zone' });
    const items = lieux.map((lieu) =>
      creer('li', {}, creer('strong', {}, lieu.nom), ...(lieu.adresse ? [creer('span', {}, lieu.adresse)] : []), creer('a', { href: lienOpenStreetMap(lieu), 'aria-label': \`Ouvrir dans OpenStreetMap : \${lieu.nom}\` }, 'Ouvrir dans OpenStreetMap')),
    );
    if (lieux.length === 0) items.push(creer('li', {}, creer('a', { href: lienOpenStreetMap(reglages) }, 'Ouvrir dans OpenStreetMap')));
    const element = creer('section', { 'aria-label': nom, class: classes }, zone, creer('ul', { 'aria-label': \`Les lieux de la carte : \${nom}\`, class: 'humalis-carte-lieux' }, ...items));
    const entree = { signature, element, carte: undefined };
    cartes.set(id, entree);
    // Leaflet mesure la zone : elle doit être dans la page. Sans lui (script bloqué), la liste reste.
    setTimeout(() => {
      if (window.L && zone.isConnected) entree.carte = dessinerCarte(window.L, zone, reglages, lieux);
    }, 0);
    return element;
  }
`);
  }
  return parties.join('');
}
