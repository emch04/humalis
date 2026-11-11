/**
 * Les lignes Humalis dans un site ou une application de bureau produits avec
 * le moteur (voir cibles/lignes-humalis.ts pour les cartes de sources).
 *
 * - `LIGNES_VITE_JS` : un module Vite écrit dans le projet. Il donne à Vite
 *   les cartes de sources des fichiers produits ; à la construction, il en
 *   tire une table compacte, `humalis-lignes.json` (fichier et ligne
 *   Humalis de chaque morceau du code construit), puis efface les cartes :
 *   le texte des fichiers Humalis ne part pas avec le site. Pendant le
 *   développement, la même table est calculée à la demande depuis ce que
 *   Vite sert.
 * - `LIGNES_NAVIGATEUR_JS` : un petit script chargé par chaque page. Il rend
 *   une pile d'erreur à ses lignes Humalis (« ligne 9 de boutique.humalis »)
 *   et écrit dans la console chaque erreur non rattrapée avec sa ligne.
 */

/** Le module Vite (JavaScript simple, sans dépendance). */
/**
 * Le chemin du dossier des fichiers Humalis n'est connu qu'à l'écriture du
 * projet : la commande remplace ce repère (voir appliquerLignesHumalis).
 */
export const REPERE_SOURCES = '__HUMALIS_VERS_LES_SOURCES__';

export function lignesViteJs(versLesSources = REPERE_SOURCES): string {
  return `// Produit par Humalis : les lignes Humalis du site, pour les piles d'erreurs et le débogueur.
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decoder(texte) {
  const valeurs = [];
  let valeur = 0;
  let decalage = 0;
  for (const caractere of texte) {
    const chiffre = BASE64.indexOf(caractere);
    if (chiffre < 0) continue;
    valeur += (chiffre & 31) << decalage;
    if (chiffre & 32) decalage += 5;
    else {
      valeurs.push(valeur & 1 ? -(valeur >>> 1) : valeur >>> 1);
      valeur = 0;
      decalage = 0;
    }
  }
  return valeurs;
}

/** Le dossier des fichiers Humalis, vu depuis la racine du projet produit. */
const SOURCES = resolve(import.meta.dirname, ${JSON.stringify(versLesSources)});

/** « boutique.humalis » ou « pages/panier.humalis » ; undefined pour une source qui n'est pas un fichier Humalis. */
function nomHumalis(source, depuis) {
  if (!source || !source.endsWith('.humalis')) return undefined;
  const sansProtocole = source.replace(/^file:\\/\\//, '');
  const absolu = isAbsolute(sansProtocole) ? sansProtocole : resolve(depuis, sansProtocole);
  return relative(SOURCES, absolu).split(sep).join('/');
}

/** Une carte de sources → [ligne, colonne, fichier, ligne Humalis] à plat ; fichier -1 : sans lien. */
function table(carte, depuis, fichiers) {
  const sortie = [];
  let source = 0;
  let ligneSource = 0;
  let precedent = '';
  carte.mappings.split(';').forEach((ligne, numero) => {
    let colonne = 0;
    for (const morceau of ligne.split(',')) {
      if (!morceau) continue;
      const v = decoder(morceau);
      colonne += v[0] ?? 0;
      let fichier = -1;
      let humalis = 0;
      if (v.length >= 4) {
        source += v[1];
        ligneSource += v[2];
        const nom = nomHumalis(carte.sources[source], depuis);
        if (nom !== undefined) {
          fichier = fichiers.indexOf(nom);
          if (fichier < 0) fichier = fichiers.push(nom) - 1;
          humalis = ligneSource + 1;
        }
      }
      const cle = fichier + ':' + humalis;
      if (cle === precedent) continue;
      precedent = cle;
      sortie.push(numero + 1, colonne + 1, fichier, humalis);
    }
  });
  return sortie;
}

export function humalisLignes() {
  let racine = process.cwd();
  return {
    name: 'humalis-lignes',
    enforce: 'pre',
    config(_reglages, { command }) {
      // Des cartes cachées : le site construit n'y renvoie pas ; la table en est tirée puis elles sont effacées.
      if (command === 'build') return { build: { sourcemap: 'hidden' } };
    },
    configResolved(reglages) {
      racine = reglages.root;
    },
    load(id) {
      const chemin = id.split('?')[0];
      if (!chemin.endsWith('.js') || chemin.includes('/node_modules/')) return null;
      const carte = chemin + '.map';
      if (!existsSync(carte) || !existsSync(chemin)) return null;
      const lue = JSON.parse(readFileSync(carte, 'utf8'));
      // Les sources deviennent absolues : Vite les garde telles quelles d'une carte à l'autre.
      lue.sources = lue.sources.map((s) => resolve(dirname(chemin), s));
      return { code: readFileSync(chemin, 'utf8').replace(/\\n\\/\\/# sourceMappingURL=[^\\n]*\\n?$/, '\\n'), map: lue };
    },
    configureServer(serveur) {
      serveur.middlewares.use('/humalis-lignes.json', async (requete, reponse) => {
        const demandes = new URL(requete.url ?? '', 'http://localhost').searchParams.get('fichiers') ?? '';
        const fichiers = [];
        const tables = {};
        for (const adresse of demandes.split(',').filter(Boolean).slice(0, 50)) {
          try {
            const transforme = await serveur.transformRequest(adresse);
            if (transforme?.map?.mappings) tables[adresse] = table(transforme.map, resolve(racine, '.' + dirname(adresse)), fichiers);
          } catch { /* Un fichier inconnu : pas de table. */ }
        }
        reponse.setHeader('Content-Type', 'application/json');
        reponse.setHeader('Cache-Control', 'no-store');
        reponse.end(JSON.stringify({ fichiers, tables }));
      });
    },
    generateBundle(options, paquet) {
      const fichiers = [];
      const tables = {};
      const dossier = options.dir ?? resolve(racine, 'dist');
      for (const [nom, morceau] of Object.entries(paquet)) {
        if (morceau.type !== 'chunk' || !morceau.map) continue;
        const t = table(morceau.map, dirname(resolve(dossier, nom)), fichiers);
        if (t.some((v, i) => i % 4 === 2 && v >= 0)) tables['/' + nom] = t;
      }
      this.emitFile({ type: 'asset', fileName: 'humalis-lignes.json', source: JSON.stringify({ fichiers, tables }) });
    },
    writeBundle(options, paquet) {
      const dossier = options.dir ?? resolve(racine, 'dist');
      for (const nom of Object.keys(paquet)) {
        if (!nom.endsWith('.map')) continue;
        try { unlinkSync(resolve(dossier, nom)); } catch { /* Déjà absente. */ }
      }
      for (const morceau of Object.values(paquet)) {
        if (morceau.type !== 'chunk') continue;
        try { unlinkSync(resolve(dossier, morceau.fileName + '.map')); } catch { /* Pas de carte écrite. */ }
      }
    },
  };
}
`;
}

/**
 * Le script des pages : `window.humalisLignes.traduire(pile)` rend
 * `{ pile, ligne }` ; chaque erreur non rattrapée est écrite dans la
 * console avec sa ligne Humalis. JavaScript simple, sans module.
 */
export const LIGNES_NAVIGATEUR_JS = `// Produit par Humalis : les erreurs rendues à leurs lignes Humalis.
(() => {
  if (window.humalisLignes) return;
  const tables = new Map();
  const motif = /((?:https?|humalis|file|app):\\/\\/[^\\s()]+?):(\\d+):(\\d+)/g;
  const cheminDe = (adresse) => { try { return new URL(adresse).pathname; } catch { return adresse; } };

  async function charger(chemins) {
    const manquants = chemins.filter((c) => !tables.has(c));
    if (manquants.length === 0) return;
    let lu = null;
    try {
      const reponse = await fetch('/humalis-lignes.json?fichiers=' + encodeURIComponent(manquants.join(',')), { credentials: 'omit' });
      if (reponse.ok && (reponse.headers.get('content-type') || '').includes('json')) lu = await reponse.json();
    } catch { /* Sans table, la pile reste telle quelle. */ }
    for (const c of manquants) tables.set(c, lu && lu.tables && lu.tables[c] ? { fichiers: lu.fichiers, t: lu.tables[c] } : null);
  }

  /** La dernière entrée avant (ligne, colonne) : son fichier et sa ligne Humalis, ou rien. */
  function situer(table, ligne, colonne) {
    const t = table.t;
    let bas = 0;
    let haut = t.length / 4 - 1;
    let trouve = -1;
    while (bas <= haut) {
      const milieu = (bas + haut) >> 1;
      const l = t[milieu * 4];
      const c = t[milieu * 4 + 1];
      if (l < ligne || (l === ligne && c <= colonne)) { trouve = milieu; bas = milieu + 1; } else haut = milieu - 1;
    }
    if (trouve < 0 || t[trouve * 4 + 2] < 0) return null;
    return { fichier: table.fichiers[t[trouve * 4 + 2]], ligne: t[trouve * 4 + 3] };
  }

  /** La pile, chaque ligne du code produit remplacée par « ligne N de fichier.humalis » quand elle en vient. */
  async function traduire(pile) {
    const texte = String(pile || '');
    const chemins = [...new Set([...texte.matchAll(motif)].map((m) => cheminDe(m[1])))];
    await charger(chemins);
    let ligne = '';
    const traduite = texte.replace(motif, (tout, adresse, l, c) => {
      const table = tables.get(cheminDe(adresse));
      const situe = table && situer(table, Number(l), Number(c));
      if (!situe) return tout;
      if (!ligne) ligne = situe.fichier + ':' + situe.ligne;
      return 'ligne ' + situe.ligne + ' de ' + situe.fichier;
    });
    return { pile: traduite, ligne };
  }

  const enClair = (ligne) => { const i = ligne.lastIndexOf(':'); return 'ligne ' + ligne.slice(i + 1) + ' de ' + ligne.slice(0, i); };
  async function signaler(erreur) {
    if (!(erreur instanceof Error)) return;
    const { pile, ligne } = await traduire(erreur.stack);
    if (!ligne) return;
    console.error('Erreur, ' + enClair(ligne) + ' : ' + erreur.message + '\\n' + pile.split('\\n').filter((l) => l.includes('.humalis')).join('\\n'));
    window.dispatchEvent(new CustomEvent('humalis:erreur', { detail: { message: erreur.message, pile, ligne } }));
  }
  window.humalisLignes = { traduire, enClair };
  window.addEventListener('error', (evenement) => { void signaler(evenement.error); });
  window.addEventListener('unhandledrejection', (evenement) => { void signaler(evenement.reason); });
})();
`;
