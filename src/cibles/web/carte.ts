/**
 * La carte sur le web et le desktop : un composant `CarteLieux` écrit dans `src/humalis/carte-lieux.tsx` seulement quand
 * une page contient une carte, qui dessine Leaflet 1.9.4 (dépendance épinglée du
 * projet produit) et qui écrit toujours la liste des lieux.
 *
 * Le compilateur n'importe pas Leaflet : il écrit le texte de ce composant.
 */

/** Ce qu'une carte demande au rendu : des expressions JavaScript, prêtes à être écrites. */
export interface CarteProduite {
  id: string;
  /** Les classes CSS (`avec style`), séparées par des espaces. */
  classes: string;
  /** Le nom de la carte, en expression de texte. */
  nom: string;
  latitude?: string;
  longitude?: string;
  zoom?: string;
  tuiles?: { adresse: string; attribution: string };
  /** Les lieux : les lignes d'un tableau JavaScript (un objet, ou une répétition, ou une condition par ligne). */
  lieux: string[];
}

/** Les versions épinglées de Leaflet et de ses types, écrites dans le `package.json` du projet produit. */
export const LEAFLET = { version: '1.9.4', types: '1.9.21' };

const chaine = (texte: string) => JSON.stringify(texte);

/** `<CarteLieux … />` écrit en JSX, un réglage par ligne. */
export function carteWeb(c: CarteProduite): string[] {
  const reglages = [
    `nom={${c.nom}}`,
    ...(c.latitude !== undefined && c.longitude !== undefined ? [`latitude={${c.latitude}}`, `longitude={${c.longitude}}`] : []),
    ...(c.zoom !== undefined ? [`zoom={${c.zoom}}`] : []),
    ...(c.tuiles ? [`tuiles=${chaine(c.tuiles.adresse)}`, `attribution=${chaine(c.tuiles.attribution)}`] : []),
    ...(c.classes ? [`className=${chaine(c.classes)}`] : []),
  ];
  return [
    '<CarteLieux',
    ...reglages.map((r) => `  ${r}`),
    ...(c.lieux.length > 0 ? ['  lieux={[', ...c.lieux.map((l) => `    ${l}`), '  ]}'] : ['  lieux={[]}']),
    '/>',
  ];
}

export const CARTE_TSX = `import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

/** Un lieu de la carte : son nom (la bulle), son adresse facultative, sa position. */
export interface Lieu {
  nom: string;
  adresse?: string;
  latitude: number;
  longitude: number;
}

interface Proprietes {
  /** Le nom de la carte : il la décrit pour les lecteurs d'écran. */
  nom: string;
  lieux: Lieu[];
  /** Le centre et le zoom, s'ils sont donnés ; sinon la carte s'ajuste à ses lieux. */
  latitude?: number;
  longitude?: number;
  zoom?: number;
  /** Un autre fournisseur de tuiles (https://…/{z}/{x}/{y}.png) et son attribution. */
  tuiles?: string;
  attribution?: string;
  className?: string;
}

/**
 * Les tuiles d'OpenStreetMap, soumises à la politique d'usage de la fondation
 * (https://operations.osmfoundation.org/policies/tiles/) : attribution toujours
 * affichée, pas d'usage massif. Pour un site très visité, donnez les tuiles
 * d'un fournisseur à contrat (« avec tuiles "…" et attribution "…" »).
 */
const TUILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">les contributeurs d’OpenStreetMap</a>';

/** Le repère : un petit dessin, pas l'image par défaut de Leaflet (que les outils de construction cassent). */
const REPERE =
  '<svg viewBox="0 0 24 32" width="28" height="38" aria-hidden="true" focusable="false"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20 12 32 12 32s12-12 12-20.3C24 5.2 18.6 0 12 0z" stroke="#ffffff" stroke-width="1.5"/><circle cx="12" cy="11.5" r="4.5" fill="#ffffff"/></svg>';

const echapper = (texte: string) => texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Le lien vers le même endroit sur OpenStreetMap : une alternative à la carte dessinée. */
const lienOpenStreetMap = ({ latitude, longitude }: Lieu) =>
  \`https://www.openstreetmap.org/?mlat=\${latitude}&mlon=\${longitude}#map=15/\${latitude}/\${longitude}\`;

/**
 * Une carte Leaflet et, sous elle, la liste des lieux. La liste est toujours
 * écrite (nom, adresse, lien) : elle est lue par les lecteurs d'écran, elle
 * reste là sans JavaScript, et elle est le contenu du site prérendu. La carte
 * se dessine dans le navigateur, quand Leaflet est arrivé.
 */
export default function CarteLieux({ nom, lieux, latitude, longitude, zoom, tuiles, attribution, className }: Proprietes) {
  const zone = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify([lieux, latitude, longitude, zoom, tuiles, attribution]);

  useEffect(() => {
    const element = zone.current;
    // Pendant le prérendu, le navigateur est piloté : la carte n'est pas dessinée (et ne demande aucune tuile).
    if (!element || navigator.webdriver) return;
    let arretee = false;
    let carte: import('leaflet').Map | undefined;
    import('leaflet').then((L) => {
      if (arretee) return;
      // « Réduire les animations » : la carte ne bouge pas toute seule.
      const calme = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      carte = L.map(element, { zoomControl: false, attributionControl: false, zoomAnimation: !calme, fadeAnimation: !calme, markerZoomAnimation: !calme, inertia: !calme });
      L.control.zoom({ zoomInTitle: 'Agrandir', zoomOutTitle: 'Réduire' }).addTo(carte);
      L.control.attribution({ prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(carte);
      L.tileLayer(tuiles ?? TUILES, { maxZoom: 19, attribution: tuiles ? echapper(attribution ?? '') : ATTRIBUTION }).addTo(carte);

      const icone = L.divIcon({ className: 'humalis-carte-repere', html: REPERE, iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -34] });
      const marqueurs = lieux.map((lieu) => {
        const marqueur = L.marker([lieu.latitude, lieu.longitude], { icon: icone, title: lieu.nom, keyboard: true }).addTo(carte!);
        // La bulle est faite avec des noeuds de texte : un nom n'est jamais lu comme du HTML.
        const bulle = document.createElement('div');
        const titre = document.createElement('strong');
        titre.textContent = lieu.nom;
        bulle.append(titre);
        if (lieu.adresse) {
          const adresse = document.createElement('p');
          adresse.textContent = lieu.adresse;
          bulle.append(adresse);
        }
        marqueur.bindPopup(bulle);
        return marqueur;
      });
      const positions = marqueurs.map((m) => m.getLatLng());

      if (latitude !== undefined && longitude !== undefined) carte.setView([latitude, longitude], zoom ?? 15);
      else if (positions.length === 1) carte.setView(positions[0], zoom ?? 15);
      else {
        const limites = L.latLngBounds(positions);
        if (zoom !== undefined) carte.setView(limites.getCenter(), zoom);
        else carte.fitBounds(limites, { padding: [32, 32], maxZoom: 15 });
      }
      // Le repère n'existe dans la page qu'une fois la vue posée : c'est alors qu'il reçoit son nom.
      marqueurs.forEach((m, i) => m.getElement()?.setAttribute('aria-label', lieux[i].nom));
    });
    return () => {
      arretee = true;
      carte?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (
    <section aria-label={nom} className={\`humalis-carte\${className ? \` \${className}\` : ''}\`}>
      <div ref={zone} className="humalis-carte-zone" />
      <ul aria-label={\`Les lieux de la carte : \${nom}\`} className="humalis-carte-lieux">
        {lieux.map((lieu, i) => (
          <li key={i}>
            <strong>{lieu.nom}</strong>
            {lieu.adresse && <span>{lieu.adresse}</span>}
            <a href={lienOpenStreetMap(lieu)} aria-label={\`Ouvrir dans OpenStreetMap : \${lieu.nom}\`}>
              Ouvrir dans OpenStreetMap
            </a>
          </li>
        ))}
        {lieux.length === 0 && latitude !== undefined && longitude !== undefined && (
          <li>
            <a href={lienOpenStreetMap({ nom, latitude, longitude })}>Ouvrir dans OpenStreetMap</a>
          </li>
        )}
      </ul>
    </section>
  );
}
`;

/** Le CSS de la carte : la zone a une hauteur, la liste des lieux est lue mais pas vue (l'auteur la montre avec son CSS). */
export const CARTE_CSS = `.humalis-carte { margin: 1rem 0; }
.humalis-carte-zone { position: relative; z-index: 0; height: 24rem; max-height: 70vh; border-radius: 0.5rem; overflow: hidden; }
/* Le style des liens de la page ne doit pas déformer les commandes et l'attribution de Leaflet. */
.humalis-page .humalis-carte .leaflet-control-attribution a { display: inline; width: auto; margin: 0; }
.humalis-page .humalis-carte .leaflet-bar a { display: block; width: 30px; margin: 0; }
.humalis-carte-repere { background: none; border: none; }
.humalis-carte-repere svg { fill: var(--humalis-rouge, #d6361e); }
.humalis-carte-lieux { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; list-style: none; }`;
