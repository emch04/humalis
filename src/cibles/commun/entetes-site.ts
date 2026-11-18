/**
 * Le module crypto de Node, pris à l'appel (Node 24 : process.getBuiltinModule) et non importé : le même code est
 * regroupé dans le compilateur pour navigateur (dist/navigateur.js, le bac à sable du site), où aucun module de Node
 * ne se charge. Là, il n'y a pas de module crypto, et le site produit n'a pas de fichier « _headers ».
 */
function cryptoDeNode(): typeof import('node:crypto') | undefined {
  return (globalThis as { process?: { getBuiltinModule?: (nom: string) => unknown } }).process?.getBuiltinModule?.('node:crypto') as typeof import('node:crypto') | undefined;
}

/** Les empreintes des scripts se calculent ici : « _headers » peut être écrit. */
export const peutEcrireLesEntetes = (): boolean => cryptoDeNode() !== undefined;

/**
 * Les en-têtes de sécurité du site produit, dans un fichier « _headers » : Cloudflare Pages et Netlify le
 * lisent tel quel ; pour un autre hébergeur (nginx, Apache), le LISEZMOI dit de recopier ces lignes.
 *
 * La politique de contenu dit au navigateur de n'exécuter que les scripts du site : un texte venu d'ailleurs
 * ne peut pas en ajouter. Les quelques scripts écrits dans les pages (le thème choisi, lu avant le premier
 * affichage) sont autorisés un par un, par leur empreinte.
 */
const SCRIPT_EN_LIGNE = /<script(?![^>]*\bsrc=)(?![^>]*type="application\/(?:ld\+)?json")[^>]*>([\s\S]*?)<\/script>/g;

/** Les empreintes des scripts écrits dans les pages, chacune une fois, dans un ordre stable. */
function empreintes(fichiers: Map<string, unknown>): string[] {
  const crypto = cryptoDeNode();
  if (!crypto) throw new Error('les empreintes des scripts demandent le module crypto de Node');
  const trouvees = new Set<string>();
  for (const [nom, contenu] of fichiers) {
    if (!nom.endsWith('.html') || typeof contenu !== 'string') continue;
    for (const [, code] of contenu.matchAll(SCRIPT_EN_LIGNE)) {
      if (code.trim() !== '') trouvees.add(`'sha256-${crypto.createHash('sha256').update(code).digest('base64')}'`);
    }
  }
  return [...trouvees].sort();
}

export interface OptionsEntetes {
  /** « connexion apple » : la page charge le script d'Apple. */
  apple?: boolean;
}

/** La politique de contenu d'un site produit. */
export function politiqueDeContenu(fichiers: Map<string, unknown>, options: OptionsEntetes = {}): string {
  const scripts = ["'self'", ...(options.apple ? ['https://appleid.cdn-apple.com'] : []), ...empreintes(fichiers)];
  return [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    // Les styles posés par les animations et les graphiques sont écrits dans les éléments.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    // Le serveur de l'application, les API déclarées par « source », les réunions.
    "connect-src 'self' https: wss:",
    'frame-src https:',
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

/** Le fichier « _headers » : les mêmes en-têtes pour toutes les adresses du site. */
export function entetesDuSite(fichiers: Map<string, unknown>, options: OptionsEntetes = {}): string {
  return [
    '/*',
    `  Content-Security-Policy: ${politiqueDeContenu(fichiers, options)}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '',
  ].join('\n');
}

/** Ce que le LISEZMOI du site dit de ce fichier. */
export const noteEntetes = (chemin: string): string => `
## Les en-têtes de sécurité

Le fichier \`${chemin}\` dit au navigateur de n'exécuter que les scripts de ce site (politique de contenu). Cloudflare Pages et Netlify le lisent tout seuls. Chez un autre hébergeur (nginx, Apache, Caddy), recopie ses trois lignes dans les en-têtes de réponse du site. Si tu ajoutes un script d'un autre site à la main, ajoute son adresse à \`script-src\`.
`;
