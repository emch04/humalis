/**
 * Les vérifications de la navigation : adresses choisies, page « introuvable », pages réservées.
 */
import type { Programme, Page, Instruction, Element } from '../parser/ast.js';
import type { Diagnostic } from './erreurs.js';
import { simplifier } from './elements.js';
import { proposerNom } from './suggestions.js';

/** Ce que dit la chaîne d'un « vers » : une page (et peut-être une ancre), l'ancre de cette page, ou une adresse externe. */
export interface CibleLue {
  page?: string;
  ancre?: string;
  externe?: boolean;
  /** Le message d'erreur quand l'adresse est refusée (javascript:, data:…). */
  refus?: string;
}

const SCHEMAS_PERMIS = ['http', 'https', 'mailto', 'tel'];

/** Vrai si l'adresse est un schéma permis pour un lien externe (http, https, mailto, tel). */
export function estAdresseExterne(valeur: string): boolean {
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(valeur.trim())?.[1]?.toLowerCase();
  return schema !== undefined && SCHEMAS_PERMIS.includes(schema);
}

/** « carte#desserts », « #desserts », « https://… », « mailto:… » : ce qu'un lien ou une redirection vise. */
export function lireCible(cible: string): CibleLue {
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(cible.trim())?.[1]?.toLowerCase();
  if (schema !== undefined) {
    if (SCHEMAS_PERMIS.includes(schema)) return { externe: true };
    return {
      refus: `l'adresse « ${cible} » est refusée : un lien mène à une page, ou à une adresse en https://, http://, mailto: ou tel:. Les autres schémas (comme ${schema}:) peuvent exécuter du code ou lire des fichiers.`,
    };
  }
  const diese = cible.indexOf('#');
  if (diese < 0) return { page: cible };
  return { ...(diese > 0 ? { page: cible.slice(0, diese) } : {}), ancre: cible.slice(diese + 1) };
}

/** Parcourt les instructions de la vue (blocs, formulaires, conditions, boucles). */
function parcourir(corps: Instruction[], visite: (i: Instruction) => void): void {
  for (const i of corps) {
    visite(i);
    if (i.type === 'Bloc' || i.type === 'Formulaire' || i.type === 'Boucle') parcourir(i.corps, visite);
    else if (i.type === 'Condition') {
      parcourir(i.alors, visite);
      parcourir(i.sinon, visite);
    }
  }
}

/** Les ancres écrites dans une page, avec leur ligne. */
function ancresDe(page: Page): { nom: string; ligne: number }[] {
  const ancres: { nom: string; ligne: number }[] = [];
  parcourir(page.corps, (i) => {
    if ((i.type === 'Bloc' || i.type === 'Element') && i.ancre !== undefined) ancres.push({ nom: i.ancre, ligne: i.ligne });
  });
  return ancres;
}

/** La page 404 : une convention de nom, comme « accueil » est la page d'entrée. */
export const PAGE_INTROUVABLE = 'introuvable';
/** La page où l'on envoie un visiteur refusé, quand « sinon vers » n'est pas écrit. */
export const PAGE_CONNEXION = 'connexion';

export function analyserNavigation(programme: Programme, diagnostics: Diagnostic[]): void {
  const erreur = (message: string, ligne: number) => diagnostics.push({ gravite: 'erreur', message, ligne });
  const noms = new Set(programme.pages.map((p) => p.nom));
  const sessionDisponible = programme.serveurs.length > 0 || programme.sources.some((s) => s.session);

  const adresses = new Map<string, { nom: string; ligne: number }>();
  for (const page of programme.pages) {
    if (page.adresse !== undefined) {
      if (!page.adresse.startsWith('/')) {
        erreur(`l'adresse « ${page.adresse} » de la page « ${page.nom} » doit commencer par / (par exemple "/collections/:slug").`, page.ligne);
      }
      const deja = adresses.get(page.adresse);
      // Une sous-page d'index a l'adresse de son parent : c'est permis.
      const autre = deja ? programme.pages.find((p) => p.nom === deja.nom) : undefined;
      const parent = page.parent !== undefined ? programme.pages.find((p) => p.nom === page.parent) : undefined;
      // Deux sous-pages d'index du même parent sont signalées à part (analyserSousPages).
      const freresIndex = parent !== undefined && autre?.parent === page.parent && (parent.adresse ?? `/${simplifier(parent.nom)}`) === page.adresse;
      const parentEtEnfant = deja && (page.parent === deja.nom || autre?.parent === page.nom || freresIndex);
      if (deja && parentEtEnfant) adresses.set(page.adresse, deja);
      else if (deja) erreur(`l'adresse « ${page.adresse} » est déjà celle de la page « ${deja.nom} » (ligne ${deja.ligne}).`, page.ligne);
      else adresses.set(page.adresse, { nom: page.nom, ligne: page.ligne });
    }

    if (page.nom === PAGE_INTROUVABLE && (page.adresse !== undefined || page.parametres.length > 0 || page.reservee !== undefined)) {
      erreur(`la page « ${PAGE_INTROUVABLE} » est la page 404 : elle n'a ni adresse, ni paramètre, et n'est pas réservée.`, page.ligne);
    }

    if (page.reservee) {
      if (!sessionDisponible) {
        erreur(
          `la page « ${page.nom} » est réservée, ce qui demande une session : ajoutez un bloc serveur, ou une source avec session astratra.`,
          page.reservee.ligne,
        );
      }
      const sinon = page.reservee.sinon ?? PAGE_CONNEXION;
      if (!noms.has(sinon)) {
        erreur(
          page.reservee.sinon === undefined
            ? `la page « ${page.nom} » est réservée : dites où envoyer les visiteurs (sinon vers "connexion") ou écrivez une page « ${PAGE_CONNEXION} ».`
            : `la page « ${page.nom} » renvoie les visiteurs refusés vers « ${sinon} », qui n'existe pas. Pages : ${[...noms].join(', ')}.${proposerNom(sinon, noms)}`,
          page.reservee.ligne,
        );
      } else if (sinon === page.nom || programme.pages.find((p) => p.nom === sinon)?.reservee) {
        erreur(`la page « ${sinon} », où l'on envoie les visiteurs refusés de « ${page.nom} », est elle-même réservée : ils tourneraient en rond.`, page.reservee.ligne);
      }
    }
  }

  analyserSousPages(programme, erreur);
  analyserAncres(programme, diagnostics, erreur);
}

/** Les sous-pages : le parent existe, pas de cycle, adresses cohérentes, « sous page » là où il faut. */
function analyserSousPages(programme: Programme, erreur: (message: string, ligne: number) => void): void {
  const pages = new Map(programme.pages.map((p) => [p.nom, p]));
  const noms = [...pages.keys()].join(', ');
  const adresseDe = (p: Page) => p.adresse ?? `/${simplifier(p.nom)}`;
  const emplacements = (p: Page) => {
    const lignes: number[] = [];
    parcourir(p.corps, (i) => {
      if (i.type === 'SousPage') lignes.push(i.ligne);
    });
    return lignes;
  };
  const enfants = new Map<string, Page[]>();
  const dansUnCycle = new Set<string>();
  for (const page of programme.pages) {
    if (page.parent === undefined) continue;
    const parent = pages.get(page.parent);
    if (page.parent === page.nom) {
      erreur(`une page ne peut pas être dans elle-même (page « ${page.nom} »).`, page.ligne);
      continue;
    }
    if (!parent) {
      erreur(`la page « ${page.nom} » veut être dans « ${page.parent} », qui n'existe pas. Pages : ${noms}.${proposerNom(page.parent, programme.pages.map((p) => p.nom))}`, page.ligne);
      continue;
    }
    enfants.set(parent.nom, [...(enfants.get(parent.nom) ?? []), page]);
    // Un cycle : en remontant les parents, on retrouve la page.
    const vus = new Set([page.nom]);
    let courant: Page | undefined = parent;
    let cycle = false;
    while (courant) {
      if (vus.has(courant.nom)) {
        cycle = true;
        break;
      }
      vus.add(courant.nom);
      courant = courant.parent !== undefined ? pages.get(courant.parent) : undefined;
    }
    if (cycle) {
      // Un cycle n'est signalé qu'une fois, sur la première page rencontrée.
      if (!dansUnCycle.has(page.nom)) {
        for (const nom of vus) dansUnCycle.add(nom);
        erreur(`la page « ${page.nom} » est dans « ${page.parent} », qui est elle-même dans « ${page.nom} » (directement ou non) : les sous-pages ne tournent pas en rond.`, page.ligne);
      }
      continue;
    }
    if (page.nom === PAGE_INTROUVABLE) {
      erreur(`la page « ${PAGE_INTROUVABLE} » est la page 404 : elle ne peut pas être une sous-page.`, page.ligne);
      continue;
    }
    if (parent.parametres.length > 0) {
      erreur(`la page « ${parent.nom} » a un paramètre et des sous-pages (dont « ${page.nom} ») : dans cette version, le parent d'une sous-page n'a pas de paramètre. L'enfant peut avoir le sien.`, page.ligne);
      continue;
    }
    // L'adresse d'un enfant commence par celle de son parent.
    if (page.adresse !== undefined && (parent.adresse !== undefined || parent.nom !== 'accueil')) {
      const prefixe = adresseDe(parent).replace(/\/+$/, '');
      if (page.adresse !== prefixe && !page.adresse.startsWith(`${prefixe}/`)) {
        erreur(`l'adresse « ${page.adresse} » de « ${page.nom} » ne commence pas par celle de son parent « ${prefixe} ».`, page.ligne);
      }
    }
    // Un enfant ne peut pas être « moins protégé » que son parent.
    const protege = (p: Page): Page['reservee'] => {
      for (let c: Page | undefined = p; c; c = c.parent !== undefined ? pages.get(c.parent) : undefined) {
        if (c.reservee) return c.reservee;
        if (c.parent === undefined) break;
      }
      return undefined;
    };
    const duParent = protege(parent);
    if (page.reservee && duParent?.qui === 'admin' && page.reservee.qui === 'connecte') {
      erreur(`la page « ${page.nom} » est réservée aux connectés, mais son parent « ${parent.nom} » l'est aux admins : une sous-page peut être plus protégée que son parent, jamais moins.`, page.reservee.ligne);
    }
  }

  for (const page of programme.pages) {
    const fils = enfants.get(page.nom) ?? [];
    const places = emplacements(page);
    if (fils.length > 0 && places.length === 0) {
      erreur(`la page « ${page.nom} » a des sous-pages (${fils.map((f) => f.nom).join(', ')}) mais pas d'endroit pour les montrer : écrivez « sous page » là où elles doivent apparaître.`, page.ligne);
    }
    if (fils.length === 0 && places.length > 0) {
      erreur(`« sous page » est écrit dans la page « ${page.nom} », qui n'a aucune sous-page : écrivez page "…" dans "${page.nom}" : sur une autre page.`, places[0]);
    }
    if (places.length > 1) erreur(`« sous page » est écrit ${places.length} fois dans la page « ${page.nom} » : une seule fois, à l'endroit où la sous-page apparaît.`, places[1]);
    // Au plus une sous-page d'index.
    const index = fils.filter((f) => f.adresse !== undefined && f.adresse.replace(/\/+$/, '') === adresseDe(page).replace(/\/+$/, ''));
    if (index.length > 1) erreur(`les pages « ${index[0].nom} » et « ${index[1].nom} » sont toutes deux la sous-page d'index de « ${page.nom} » (même adresse) : une seule.`, index[1].ligne);
  }
}

/** Les ancres : valides, uniques dans leur page, et les liens qui y mènent existent. */
function analyserAncres(programme: Programme, diagnostics: Diagnostic[], erreur: (message: string, ligne: number) => void): void {
  const pages = new Map(programme.pages.map((p) => [p.nom, p]));
  const ancres = new Map<string, string[]>();
  for (const page of programme.pages) {
    const vues = new Map<string, number>();
    for (const ancre of ancresDe(page)) {
      if (!/^[A-Za-z0-9_-]+$/.test(ancre.nom)) {
        erreur(`l'ancre « ${ancre.nom} » n'est pas valable : des lettres sans accent, des chiffres et des tirets seulement (par exemple avec ancre "desserts").`, ancre.ligne);
      }
      const deja = vues.get(ancre.nom);
      if (deja !== undefined) erreur(`l'ancre « ${ancre.nom} » est déjà utilisée dans la page « ${page.nom} » (ligne ${deja}).`, ancre.ligne);
      else vues.set(ancre.nom, ancre.ligne);
    }
    ancres.set(page.nom, [...vues.keys()]);
  }
  const verifier = (depuis: Page, cible: string, ligne: number) => {
    const lue = lireCible(cible);
    if (lue.ancre === undefined) return;
    const visee = lue.page === undefined || lue.page === '' ? depuis : pages.get(lue.page);
    if (!visee) return; // la page inconnue est déjà signalée
    if (visee.parametres.length > 0) {
      diagnostics.push({ gravite: 'avertissement', ligne, message: `l'ancre « ${lue.ancre} » mène à la page « ${visee.nom} », qui a un paramètre : l'ancre n'est pas vérifiée.` });
      return;
    }
    const existantes = ancres.get(visee.nom) ?? [];
    if (!existantes.includes(lue.ancre)) {
      const ou = visee === depuis && (lue.page === undefined || lue.page === '') ? 'dans cette page' : `dans la page « ${visee.nom} »`;
      erreur(
        `l'ancre « ${lue.ancre} » n'existe pas ${ou}. ${existantes.length > 0 ? `Ancres : ${existantes.join(', ')}.` : 'Cette page n\'a aucune ancre : écrivez avec ancre "' + lue.ancre + '" sur l\'élément ou le bloc où le lien doit mener.'}`,
        ligne,
      );
    }
  };
  for (const page of programme.pages) {
    parcourir(page.corps, (i) => {
      if (i.type === 'Element' && (i as Element).cible !== undefined) verifier(page, (i as Element).cible!, i.ligne);
    });
  }
}
