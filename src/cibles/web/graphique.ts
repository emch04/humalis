/**
 * Les graphiques sur le web, le desktop et le mobile (plan des médias, 4.1) :
 * le composant `<Graphique>` que les pages écrivent, ses deux versions
 * (React DOM et React Native), la géométrie partagée et le CSS.
 *
 * Aucune bibliothèque de graphiques : le composant habille les formes que
 * calcule `graphique-geometrie.js` (la même fonction pour toutes les cibles).
 * Le mobile ajoute seulement `react-native-svg`, déjà fournie par Expo.
 */
import { GEOMETRIE_JS, DECLARATIONS_GEOMETRIE } from '../commun/graphique/geometrie.js';
import { COULEURS_CSS } from './styles.js';
import { camel, chaine } from './noms.js';
import type { GraphiqueRI } from '../../ri/types.js';
import { messageEnCode } from '../../i18n/messages.js';

/** Un texte en attribut JSX : entre guillemets si possible, sinon entre accolades. */
const attribut = (texte: string) => (/["\\{}\n]/.test(texte) ? `{${chaine(texte)}}` : `"${texte}"`);

/**
 * La balise `<Graphique … />` d'une page (web et mobile écrivent la même).
 * `valeur` traduit une valeur Humalis en expression ; `texte` rend le texte
 * d'une valeur écrite en clair, sinon undefined.
 */
export function baliseGraphique(noeud: GraphiqueRI, valeur: (v: GraphiqueRI['liste']) => string, texte: (v: GraphiqueRI['liste']) => string | undefined): string {
  const series = noeud.series.map(
    (s) => `{ nom: ${s.nomLangues ? messageEnCode(s.nomLangues, chaine) : chaine(s.nom)}${s.valeur !== undefined ? `, valeur: ${chaine(camel(s.valeur))}` : ''}${s.couleur ? `, couleur: ${chaine(s.couleur)}` : ''} }`,
  );
  const description = texte(noeud.description);
  const proprietes = [
    `genre="${noeud.genre}"`,
    `donnees={${valeur(noeud.liste)}}`,
    ...(noeud.etiquette !== undefined ? [`etiquette="${camel(noeud.etiquette)}"`] : []),
    ...(noeud.etiquettes ? [`etiquettes={${valeur(noeud.etiquettes)}}`] : []),
    `nomEtiquettes=${noeud.nomEtiquettesLangues ? `{${messageEnCode(noeud.nomEtiquettesLangues, chaine)}}` : attribut(noeud.nomEtiquettes)}`,
    `series={[${series.join(', ')}]}`,
    ...(noeud.devise ? [`devise="${noeud.devise}"`] : []),
    ...(noeud.proportions ? [`proportions={[${noeud.proportions.join(', ')}]}`] : []),
    `titre=${noeud.titreLangues ? `{${messageEnCode(noeud.titreLangues, chaine)}}` : attribut(noeud.titre)}`,
    `description=${description !== undefined ? attribut(description) : `{${valeur(noeud.description)}}`}`,
    ...(noeud.classes.length > 0 ? [`className=${attribut(noeud.classes.join(' '))}`] : []),
  ];
  return `<Graphique ${proprietes.join(' ')} />`;
}

/** `graphique-geometrie.js` : la géométrie, avec ses exports. */
export const GEOMETRIE_MODULE = `// Produit par Humalis : la géométrie des graphiques, la même pour toutes les cibles.
${GEOMETRIE_JS}
export { PALETTE_GRAPHIQUE, calculerGraphique, repere };
`;

/** Les fichiers des graphiques (dans `src/humalis/` pour le web, `humalis/` pour le mobile), si une page en dessine. */
export function fichiersGraphique(codes: string[], mobile: boolean): Map<string, string> {
  const fichiers = new Map<string, string>();
  if (!codes.some((c) => /<Graphique\b/.test(c))) return fichiers;
  fichiers.set('graphique.tsx', mobile ? GRAPHIQUE_MOBILE : GRAPHIQUE_WEB);
  fichiers.set('graphique-geometrie.js', GEOMETRIE_MODULE);
  fichiers.set('graphique-geometrie.d.ts', DECLARATIONS_GEOMETRIE);
  return fichiers;
}

// ─── Le composant web (React DOM) ────────────────────────────────────────

const GRAPHIQUE_WEB = `// Produit par Humalis : un graphique dessiné en SVG, sans bibliothèque.
// Les formes viennent de graphique-geometrie.js ; le CSS (styles.css) les
// colore en clair et en sombre. Rien n'est mesuré à l'exécution : le HTML
// prérendu est celui du navigateur.
import { useId } from 'react';
import { calculerGraphique, repere, type ConfigGraphique, type Forme, type Graphe } from './graphique-geometrie';
import { formaterArgent, formaterNombre } from './outils';

interface Proprietes extends ConfigGraphique {
  donnees: readonly unknown[] | null | undefined;
  /** Le nom du dessin, lu par les lecteurs d'écran (« Graphique en courbe »). */
  titre: string;
  /** Ce que montre le graphique, écrit par l'auteur. */
  description: string;
  devise?: 'FC' | 'EUR' | 'USD';
  className?: string;
}

/** Une forme, en élément SVG : sa classe dit son rôle et sa couleur. */
function FormeSvg({ forme }: { forme: Forme }) {
  const className = 'humalis-graphique-' + forme.role + (forme.couleur ? ' humalis-graphique-c-' + forme.couleur : '');
  const titre = forme.titre ? <title>{forme.titre}</title> : null;
  switch (forme.type) {
    case 'ligne':
      return <line className={className} x1={forme.x1} y1={forme.y1} x2={forme.x2} y2={forme.y2} />;
    case 'texte':
      return <text className={className} x={forme.x} y={forme.y} textAnchor={forme.ancre}>{forme.texte}</text>;
    case 'rect':
      return <rect className={className} x={forme.x} y={forme.y} width={forme.largeur} height={forme.hauteur}>{titre}</rect>;
    case 'cercle':
      return <circle className={className} cx={forme.x} cy={forme.y} r={forme.r}>{titre}</circle>;
    case 'chemin':
      return <path className={className} d={forme.d}>{titre}</path>;
  }
}

/** Un dessin : role="img", son nom et sa description. Les repères ne prennent pas le focus : la table est l'alternative. */
function Dessin({ graphe, id, classe, titre, description }: { graphe: Graphe; id: string; classe: string; titre: string; description: string }) {
  return (
    <svg className={classe} viewBox={'0 0 ' + graphe.largeur + ' ' + graphe.hauteur} fontSize={graphe.taille} role="img" aria-labelledby={id + '-nom ' + id + '-desc'}>
      <title id={id + '-nom'}>{titre}</title>
      <desc id={id + '-desc'}>{description}</desc>
      {graphe.formes.map((forme, i) => (
        <FormeSvg key={i} forme={forme} />
      ))}
    </svg>
  );
}

/**
 * Le graphique : deux dessins (large, et étroit pour les petits écrans : le
 * CSS montre celui qui convient), la légende, et la table « Voir les données ».
 */
export default function Graphique({ donnees, titre, description, devise, className, ...config }: Proprietes) {
  const id = useId();
  const formater = (valeur: number) => (devise ? formaterArgent(valeur, devise) : formaterNombre(valeur));
  const large = calculerGraphique(config, donnees, formater, 640);
  const classes = className ? 'humalis-graphique ' + className : 'humalis-graphique';
  if (large.vide) {
    return (
      <figure className={classes}>
        <p className="humalis-graphique-vide" role="status">Aucune donnée à afficher.</p>
      </figure>
    );
  }
  const etroit = calculerGraphique(config, donnees, formater, 400);
  return (
    <figure className={classes}>
      <Dessin graphe={large} id={id + '-l'} classe="humalis-graphique-large" titre={titre} description={description} />
      <Dessin graphe={etroit} id={id + '-e'} classe="humalis-graphique-etroit" titre={titre} description={description} />
      {large.legende.length > 0 && (
        <figcaption className="humalis-graphique-legende">
          <ul>
            {large.legende.map((element, i) => (
              <li key={i}>
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <FormeSvg forme={repere(element.repere, 6, 6, element.couleur)} />
                </svg>
                {element.nom}
              </li>
            ))}
          </ul>
        </figcaption>
      )}
      <details className="humalis-graphique-donnees">
        <summary>Voir les données</summary>
        <table>
          <caption>Les données du graphique</caption>
          <thead>
            <tr>
              {large.table.entetes.map((entete, i) => (
                <th key={i} scope="col">{entete}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {large.table.lignes.map((ligne, i) => (
              <tr key={i}>
                <th scope="row">{ligne[0]}</th>
                {ligne.slice(1).map((cellule, j) => (
                  <td key={j}>{cellule}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
`;

// ─── Le composant mobile (React Native) ──────────────────────────────────

const GRAPHIQUE_MOBILE = `// Produit par Humalis : un graphique dessiné avec react-native-svg, sans
// bibliothèque de graphiques. Les formes viennent de graphique-geometrie.js
// (la même géométrie que sur le web), aux couleurs du thème du téléphone.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as TexteSvg } from 'react-native-svg';
import { calculerGraphique, repere, type ConfigGraphique, type Forme } from './graphique-geometrie';
import { formaterArgent, formaterNombre } from './outils';
import { useCouleurs } from './styles';

interface Proprietes extends ConfigGraphique {
  donnees: readonly unknown[] | null | undefined;
  titre: string;
  description: string;
  devise?: 'FC' | 'EUR' | 'USD';
  /** Les classes CSS du web : sans effet sur le téléphone. */
  className?: string;
}

/** Une forme de la géométrie, aux couleurs du thème (clair ou sombre). */
function FormeSvg({ forme, couleurs }: { forme: Forme; couleurs: Record<string, string> }) {
  const encre = couleurs.encre;
  const teinte = forme.couleur ? couleurs[forme.couleur] ?? couleurs.bleu : encre;
  switch (forme.type) {
    case 'ligne':
      return <Line x1={forme.x1} y1={forme.y1} x2={forme.x2} y2={forme.y2} stroke={encre} strokeOpacity={forme.role === 'axe' ? 0.6 : 0.15} />;
    case 'texte':
      return (
        <TexteSvg x={forme.x} y={forme.y} textAnchor={forme.ancre} fill={encre} fontSize={14}>
          {forme.texte}
        </TexteSvg>
      );
    case 'rect':
      return <Rect x={forme.x} y={forme.y} width={forme.largeur} height={forme.hauteur} fill={teinte} />;
    case 'cercle':
      return <Circle cx={forme.x} cy={forme.y} r={forme.r} fill={teinte} />;
    case 'chemin':
      return forme.role === 'courbe' ? (
        <Path d={forme.d} fill="none" stroke={teinte} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      ) : (
        <Path d={forme.d} fill={teinte} stroke={forme.role === 'part' ? couleurs.page : 'none'} strokeWidth={forme.role === 'part' ? 2 : 0} />
      );
  }
}

/**
 * Le graphique : le dessin étroit (un téléphone est étroit), lu comme une
 * image avec sa description, la légende, et « Voir les données ».
 */
export default function Graphique({ donnees, titre, description, devise, ...config }: Proprietes) {
  const couleurs = useCouleurs() as Record<string, string>;
  const [ouvert, setOuvert] = useState(false);
  const formater = (valeur: number) => (devise ? formaterArgent(valeur, devise) : formaterNombre(valeur));
  const graphe = calculerGraphique(config, donnees, formater, 400);
  if (graphe.vide) {
    return (
      <Text accessibilityLiveRegion="polite" style={{ color: couleurs.encre, marginVertical: 8 }}>
        Aucune donnée à afficher.
      </Text>
    );
  }
  return (
    <View style={{ marginVertical: 12 }}>
      <View accessible accessibilityRole="image" accessibilityLabel={titre + '. ' + description} style={{ width: '100%', aspectRatio: graphe.largeur / graphe.hauteur }}>
        <Svg width="100%" height="100%" viewBox={'0 0 ' + graphe.largeur + ' ' + graphe.hauteur}>
          {graphe.formes.map((forme, i) => (
            <FormeSvg key={i} forme={forme} couleurs={couleurs} />
          ))}
        </Svg>
      </View>
      {graphe.legende.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
          {graphe.legende.map((element, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Svg width={12} height={12} viewBox="0 0 12 12">
                <FormeSvg forme={repere(element.repere, 6, 6, element.couleur)} couleurs={couleurs} />
              </Svg>
              <Text style={{ color: couleurs.encre }}>{element.nom}</Text>
            </View>
          ))}
        </View>
      )}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: ouvert }} onPress={() => setOuvert(!ouvert)} style={{ paddingVertical: 8 }}>
        <Text style={{ color: couleurs.bleu, textDecorationLine: 'underline' }}>{ouvert ? 'Cacher les données' : 'Voir les données'}</Text>
      </Pressable>
      {ouvert &&
        graphe.table.lignes.map((ligne, i) => (
          <Text key={i} style={{ color: couleurs.encre, paddingVertical: 2 }}>
            {ligne.map((cellule, j) => (j === 0 ? cellule : graphe.table.entetes[j] + ' : ' + cellule)).join(', ')}
          </Text>
        ))}
    </View>
  );
}
`;

// ─── Le CSS (web, desktop, statique) ─────────────────────────────────────

/**
 * Le CSS des graphiques, si une page en dessine : le dessin prend la largeur
 * de son conteneur ; sous 34rem, la version étroite remplace la large (une
 * requête de conteneur, rien n'est mesuré). Une couleur de série par couleur
 * de base ou du thème, qui suit le mode clair ou sombre.
 */
export function cssGraphique(codes: string[], couleursTheme: string[] = []): string {
  if (!codes.some((c) => /humalis-graphique\b|<Graphique\b|humalisGraphique\./.test(c))) return '';
  const couleurs = [...new Set([...Object.keys(COULEURS_CSS), ...couleursTheme])];
  return `
/* Les graphiques : du SVG écrit par Humalis, à la largeur de son conteneur. */
.humalis-graphique { margin: 1rem 0; width: 100%; box-sizing: border-box; container: humalis-graphique / inline-size; }
.humalis-graphique > svg { display: block; width: 100%; height: auto; overflow: visible; }
.humalis-graphique > .humalis-graphique-etroit { display: none; }
@container humalis-graphique (max-width: 34rem) {
  .humalis-graphique > .humalis-graphique-large { display: none; }
  .humalis-graphique > .humalis-graphique-etroit { display: block; }
}
.humalis-graphique text { fill: currentColor; }
.humalis-graphique-grille { stroke: currentColor; stroke-opacity: 0.15; }
.humalis-graphique-axe { stroke: currentColor; stroke-opacity: 0.6; }
.humalis-graphique-courbe { fill: none; stroke: var(--humalis-serie); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
.humalis-graphique-barre, .humalis-graphique-repere, path.humalis-graphique-part { fill: var(--humalis-serie); }
path.humalis-graphique-part { stroke: var(--humalis-page); stroke-width: 2; }
${couleurs.map((nom) => `.humalis-graphique-c-${nom} { --humalis-serie: var(--humalis-${nom}); }`).join('\n')}
.humalis-graphique-legende ul { list-style: none; display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; padding: 0; margin: 0.5rem 0 0; }
.humalis-graphique-legende li { display: inline-flex; align-items: center; gap: 0.4rem; }
.humalis-graphique-legende svg { width: 0.85rem; height: 0.85rem; }
.humalis-graphique-donnees { margin-top: 0.5rem; }
.humalis-graphique-donnees summary { cursor: pointer; width: fit-content; }
.humalis-graphique-donnees table { border-collapse: collapse; margin-top: 0.5rem; }
.humalis-graphique-donnees caption { text-align: left; font-weight: 600; padding-bottom: 0.25rem; }
.humalis-graphique-donnees th, .humalis-graphique-donnees td { padding: 0.25rem 1rem 0.25rem 0; border-bottom: 1px solid rgb(138 138 144 / 0.35); text-align: left; }
.humalis-graphique-donnees td { text-align: right; font-variant-numeric: tabular-nums; }
.humalis-graphique-vide { margin: 0; padding: 1rem; border: 1px dashed rgb(138 138 144 / 0.6); border-radius: 0.5rem; }
`;
}
