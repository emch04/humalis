/**
 * Le site de la machine : les fichiers du moteur de rendu, servis depuis la mémoire comme le ferait
 * Vite (une page par adresse, la page « introuvable », les fichiers publics), avec trois retouches
 * faites au moment de servir et jamais écrites : l'objet `import.meta.env` que Vite fournit, la
 * surveillance (@astratra/centrale) que la machine n'a pas, et un crochet sur les variables du
 * moteur pour garder leur état d'un rechargement à l'autre.
 */
import { BINAIRE, octetsAEcrire } from '../cibles/binaire.js';

export interface ReponseSite {
  statut: number;
  type: string;
  corps: string | Uint8Array;
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', txt: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8', webmanifest: 'application/manifest+json', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf', md: 'text/markdown; charset=utf-8',
};
export const typeDe = (chemin: string): string => TYPES[/\.([a-z0-9]+)$/i.exec(chemin)?.[1]?.toLowerCase() ?? ''] ?? 'application/octet-stream';

const ENV = '({DEV:true,PROD:false,MODE:"development",BASE_URL:"/",SSR:false})';
/** Le crochet : chaque variable du moteur se signale à sa création (voir client.ts). */
const CONSTRUCTEUR = '  constructor(valeur) {\n    this.x = valeur;\n';
const AVEC_CROCHET = `${CONSTRUCTEUR}    globalThis.__machine?.boite(this);\n`;

/** Vrai si le moteur produit porte encore la ligne que la machine accroche : sinon l'état ne sera pas gardé, et on le dit. */
export const crochetPossible = (fichiers: Map<string, string>): boolean => fichiers.get('src/humalis/moteur.js')?.includes(CONSTRUCTEUR) ?? false;

const dossierDe = (chemin: string) => chemin.replace(/^\/+|\/+$/g, '').replace(/:[A-Za-z0-9_]+/g, '_');
const htmlDe = (chemin: string) => (dossierDe(chemin) ? `${dossierDe(chemin)}/index.html` : 'index.html');

export class SiteVirtuel {
  private readonly adresses: [RegExp, string][];
  private readonly retouches = new Map<string, string | Uint8Array>();

  constructor(private readonly fichiers: Map<string, string>, chemins: Map<string, string>, private readonly tete: string) {
    const uniques = [...new Set(chemins.values())];
    this.adresses = uniques.map((chemin) => [new RegExp(`^${chemin.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z0-9_]+/g, '[^/]+')}/?$`), htmlDe(chemin)]);
    // La racine est une adresse comme une autre ; sans page à « / », elle va à la première.
    if (!uniques.includes('/') && this.fichiers.has('index.html')) this.adresses.push([/^\/?$/, 'index.html']);
  }

  private retouche(nom: string): string | Uint8Array | undefined {
    const gardee = this.retouches.get(nom);
    if (gardee !== undefined) return gardee;
    const brut = this.fichiers.get(nom);
    if (brut === undefined) return undefined;
    let fini: string | Uint8Array;
    if (brut.startsWith(BINAIRE)) fini = octetsAEcrire(brut) as Uint8Array;
    else if (nom.endsWith('.html')) fini = brut.replace('<head>', `<head>\n    ${this.tete}`);
    else if (nom === 'src/humalis/centrale.ts') fini = '// La surveillance (@astratra/centrale) n\'existe pas dans la machine.\nexport {};\n';
    else if (nom.endsWith('.js') || nom.endsWith('.ts')) {
      let texte = brut.replaceAll('import.meta.env', ENV);
      if (nom === 'src/humalis/moteur.js') texte = texte.replace(CONSTRUCTEUR, AVEC_CROCHET);
      fini = texte;
    } else fini = brut;
    this.retouches.set(nom, fini);
    return fini;
  }

  repondre(chemin: string): ReponseSite {
    const propre = chemin.split('?')[0].split('#')[0];
    for (const [motif, fichier] of this.adresses) {
      if (motif.test(propre)) {
        const corps = this.retouche(fichier);
        if (corps !== undefined) return { statut: 200, type: TYPES.html, corps };
      }
    }
    const relatif = decodeURIComponent(propre).replace(/^\/+/, '');
    // Les fichiers du projet que Vite sert : « src/… » tels quels, « public/… » à la racine.
    const nom = relatif.startsWith('src/') ? relatif : `public/${relatif}`;
    if (relatif !== '' && !relatif.includes('..') && this.fichiers.has(nom)) {
      const corps = this.retouche(nom);
      if (corps !== undefined) return { statut: 200, type: typeDe(nom.replace(/\.ts$/, '.js')), corps };
    }
    const introuvable = this.retouche('404.html');
    if (introuvable !== undefined && !/\.[a-z0-9]+$/i.test(propre)) return { statut: 404, type: TYPES.html, corps: introuvable };
    return { statut: 404, type: TYPES.txt, corps: 'Introuvable.' };
  }
}
