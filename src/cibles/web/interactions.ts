/**
 * Les petits outils des interactions dans le projet web (et desktop) :
 * minuteries, presse-papier et partage, raccourcis clavier, question de
 * confirmation, fenêtre, bouton « Voir plus », glisser-déposer. Chacun est
 * écrit dans `src/humalis/` seulement si une page s'en sert (règle A22) ;
 * aucun ne demande de dépendance.
 */

import { sousActions } from '../../ri/actions.js';
import type { Action, Application, Gestionnaire, NoeudVue } from '../../ri/types.js';

/** Tous les gestionnaires d'événements du programme : pages, boucles, composants. */
export function gestionnairesDuProgramme(application: Application): Gestionnaire[] {
  const dans = (noeuds: NoeudVue[]): Gestionnaire[] =>
    noeuds.flatMap((n) =>
      n.type === 'repetition'
        ? [...n.gestionnaires, ...dans(n.corps)]
        : n.type === 'condition'
          ? [...dans(n.alors), ...dans(n.sinon)]
          : 'corps' in n && Array.isArray(n.corps)
            ? dans(n.corps as NoeudVue[])
            : [],
    );
  return [...application.ecrans, ...application.composants].flatMap((e) => [...e.gestionnaires, ...dans(e.vue)]);
}

/** Vrai si l'une de ces actions (blocs imbriqués compris) répond au test. */
export function contientAction(actions: Action[], test: (action: Action) => boolean): boolean {
  return actions.some((a) => test(a) || sousActions(a).some((liste) => contientAction(liste, test)));
}

/** Les fichiers de humalis/ que les pages emploient, d'après leurs imports (« ../humalis/temps », « ../../humalis/temps »). */
export function fichiersDesInteractions(codes: string[]): Map<string, string> {
  const fichiers = new Map<string, string>();
  const emploie = (fichier: string) => codes.some((c) => c.includes(`humalis/${fichier}';`));
  if (emploie('temps')) fichiers.set('temps.ts', TEMPS_TS);
  if (emploie('presse-papier')) fichiers.set('presse-papier.ts', PRESSE_PAPIER_TS);
  if (emploie('clavier')) fichiers.set('clavier.ts', CLAVIER_TS);
  if (emploie('confirmation')) fichiers.set('confirmation.ts', CONFIRMATION_TS);
  if (emploie('fenetre')) fichiers.set('fenetre.tsx', FENETRE_TSX);
  if (emploie('voir-plus')) fichiers.set('voir-plus.ts', VOIR_PLUS_TS);
  if (emploie('deplacer')) fichiers.set('deplacer.ts', DEPLACER_TS);
  if (emploie('menu')) fichiers.set('menu.ts', MENU_TS);
  return fichiers;
}

/** Les outils de chaque fichier, pour écrire les imports d'une page. */
export const OUTILS_INTERACTIONS: Record<string, string[]> = {
  temps: ['useActuel', 'useMinuterie', 'usePlanifier', 'useMouvementReduit', 'useThemeSombre', 'useQuandChange', 'useQuandPause', 'useDerniere'],
  'presse-papier': ['copier', 'partager', 'adresseAbsolue', 'telechargerCsv'],
  menu: ['menuRepliable'],
  clavier: ['useRaccourcis', 'correspond', 'cliquer', 'focaliser'],
  confirmation: ['confirmer', 'useConfirmer'],
  fenetre: ['Fenetre'],
  'voir-plus': ['useVoirPlus'],
  deplacer: ['useDeplacement'],
};

/** Les lignes d'import des outils des interactions qu'un code emploie (`dossier` : « ../humalis »). */
export function importsDesInteractions(code: string, dossier: string, outils: Record<string, string[]> = OUTILS_INTERACTIONS): string[] {
  const lignes: string[] = [];
  for (const [fichier, noms] of Object.entries(outils)) {
    // « confirmer » vient de useConfirmer() quand la page le déclare (le téléphone).
    const declares = new Set([...code.matchAll(/\bconst (\w+) = use\w+\(/g)].map((m) => m[1]));
    // Fenetre est un composant ; menuRepliable est passé tel quel à onClick.
    const motif = (n: string) => (n === 'Fenetre' ? '<Fenetre\\b' : n === 'menuRepliable' ? '\\{menuRepliable\\}' : `\\b${n}\\(`);
    const employes = noms.filter((n) => !declares.has(n) && new RegExp(motif(n)).test(code));
    if (employes.length) lignes.push(`import { ${employes.join(', ')} } from '${dossier}/${fichier}';`);
  }
  return lignes;
}

/**
 * humalis/temps.ts : les minuteries et « mouvement est reduit ». Le web suit
 * la visibilité de l'onglet et prefers-reduced-motion ; le téléphone, l'état
 * de l'application (AppState) et le réglage d'accessibilité du système.
 */
const TEMPS_TS = `import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Les dernières valeurs de la page, pour ce qui s'exécute plus tard (une
 * minuterie lancée par un clic, le bouton d'un message) : sans cela, il
 * lirait les valeurs du moment du clic.
 */
export function useActuel<T>(valeurs: T) {
  const actuel = useRef(valeurs);
  useLayoutEffect(() => {
    actuel.current = valeurs;
  });
  return actuel;
}

/** La page est-elle à l'écran ? Un onglet caché suspend les minuteries qui se répètent. */
function pageVisible(): boolean {
  return typeof document === 'undefined' || !document.hidden;
}

interface OptionsMinuterie {
  /** « toutes les … » : la minuterie se répète. */
  repete?: boolean;
  /** « tant que … » : elle n'existe que pendant que c'est vrai (et repart quand ça le redevient). */
  actif?: boolean;
}

/**
 * Une minuterie de la page (« apres 3 secondes : », « toutes les 5 secondes : »),
 * démarrée à l'ouverture de la page et annulée quand on la quitte. Un tour qui
 * attend encore (une requête) n'est pas relancé ; un onglet caché ne compte
 * pas ses tours, et les tours manqués ne sont pas rattrapés.
 */
export function useMinuterie(faire: (arreter: () => void) => void | Promise<void>, millisecondes: number, options: OptionsMinuterie = {}) {
  const { repete = false, actif = true } = options;
  const dernier = useRef(faire);
  useLayoutEffect(() => {
    dernier.current = faire;
  });
  const [arretee, setArretee] = useState(false);
  useEffect(() => {
    if (!actif || arretee) return;
    let enCours = false;
    let fini = false;
    const arreter = () => {
      fini = true;
      setArretee(true);
    };
    const tour = async () => {
      if (fini || enCours || (repete && !pageVisible())) return;
      enCours = true;
      try {
        await dernier.current(arreter);
      } finally {
        enCours = false;
      }
    };
    const minuterie = repete ? setInterval(tour, millisecondes) : setTimeout(tour, millisecondes);
    return () => {
      fini = true;
      clearInterval(minuterie);
      clearTimeout(minuterie);
    };
  }, [actif, arretee, millisecondes, repete]);
}

/**
 * Les minuteries lancées par un événement (« apres 2 secondes : » dans un
 * clic) : toutes sont annulées quand la page est quittée.
 */
export function usePlanifier() {
  const enCours = useRef(new Set<() => void>());
  useEffect(() => {
    const minuteries = enCours.current;
    return () => {
      for (const annuler of minuteries) annuler();
      minuteries.clear();
    };
  }, []);
  return useCallback(
    (faire: (arreter: () => void) => void | Promise<void>, millisecondes: number, options: { repete?: boolean; tantQue?: () => boolean } = {}) => {
      let occupe = false;
      const annuler = () => {
        clearInterval(minuterie);
        clearTimeout(minuterie);
        enCours.current.delete(annuler);
      };
      const tour = async () => {
        if (options.tantQue && !options.tantQue()) return annuler();
        if (occupe || (options.repete && !pageVisible())) return;
        occupe = true;
        try {
          await faire(annuler);
        } finally {
          occupe = false;
          if (!options.repete) annuler();
        }
      };
      const minuterie = options.repete ? setInterval(tour, millisecondes) : setTimeout(tour, millisecondes);
      enCours.current.add(annuler);
    },
    [],
  );
}

const REQUETE = '(prefers-reduced-motion: reduce)';

/** « mouvement est reduit » : la personne a demandé à son système de réduire les animations, suivi en direct. */
export function useMouvementReduit(): boolean {
  return useSyncExternalStore(
    (changement) => {
      const media = window.matchMedia(REQUETE);
      media.addEventListener('change', changement);
      return () => media.removeEventListener('change', changement);
    },
    () => window.matchMedia(REQUETE).matches,
    // Le prérendu n'écrit aucun mouvement.
    () => false,
  );
}

/** « theme est sombre » : le thème affiché (choix du visiteur ou du projet, sinon le système), suivi en direct. */
export function useThemeSombre(): boolean {
  return useSyncExternalStore(
    (changement) => {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', changement);
      const observateur = new MutationObserver(changement);
      observateur.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      return () => {
        media.removeEventListener('change', changement);
        observateur.disconnect();
      };
    },
    () => {
      const choisi = document.documentElement.dataset.theme;
      return choisi ? choisi === 'sombre' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    },
    // Le prérendu ne connaît pas le thème du visiteur.
    () => false,
  );
}

/**
 * « La dernière requête gagne » : derniere("resultats") note un nouvel appel
 * et rend de quoi savoir, à la réponse, s'il est toujours le dernier. Une
 * réponse lente ne remplace pas celle d'une requête partie après elle.
 */
export function useDerniere() {
  const numeros = useRef(new Map<string, number>());
  return useCallback((variable: string) => {
    const numero = (numeros.current.get(variable) ?? 0) + 1;
    numeros.current.set(variable, numero);
    return () => numeros.current.get(variable) === numero;
  }, []);
}

/** « quand l'utilisateur ecrit dans … » : à chaque changement de la valeur, pas au premier affichage. */
export function useQuandChange(valeur: unknown, faire: () => void | Promise<void>) {
  const dernier = useRef(faire);
  useLayoutEffect(() => {
    dernier.current = faire;
  });
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    void dernier.current();
  }, [valeur]);
}

/**
 * « quand l'utilisateur arrete d'ecrire dans … » : quand la valeur n'a plus
 * changé depuis \`millisecondes\`. \`maintenant()\` n'attend pas (la touche Entrée).
 */
export function useQuandPause(valeur: unknown, millisecondes: number, faire: () => void | Promise<void>) {
  const dernier = useRef(faire);
  useLayoutEffect(() => {
    dernier.current = faire;
  });
  const premier = useRef(true);
  const attente = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    attente.current = setTimeout(() => void dernier.current(), millisecondes);
    return () => clearTimeout(attente.current);
  }, [valeur, millisecondes]);
  const maintenant = () => {
    clearTimeout(attente.current);
    void dernier.current();
  };
  return {
    maintenant,
    /** La touche Entrée (ou « Rechercher » du clavier d'un téléphone) n'attend pas la pause. */
    entree(evenement?: object) {
      const touche = evenement && 'key' in evenement ? evenement.key : undefined;
      if (touche === undefined || touche === 'Enter') maintenant();
    },
  };
}
`;

/**
 * humalis/presse-papier.ts : « copier » et « partager ». Le navigateur a
 * l'API du presse-papier (et un repli) et la feuille de partage quand le
 * système en a une.
 */
const PRESSE_PAPIER_TS = `/**
 * Met un texte dans le presse-papier. Vrai si c'est fait. Sans l'API du
 * navigateur (page non sécurisée, vieux Safari), une zone de texte cachée et
 * la commande « copier » prennent le relais.
 */
export async function copierTexte(texte: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texte);
      return true;
    }
  } catch {
    // Refusé : on essaie l'autre moyen.
  }
  const zone = document.createElement('textarea');
  zone.value = texte;
  zone.setAttribute('readonly', '');
  zone.style.position = 'fixed';
  zone.style.opacity = '0';
  document.body.append(zone);
  zone.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    zone.remove();
  }
}

/** Afficher un message (useMessages) : le résultat est toujours dit à la personne. */
type Afficher = (texte: string, genre: 'info' | 'erreur') => void;

/**
 * « copier » : met le texte dans le presse-papier, puis dit si c'est fait
 * (\`message\`, « Copié » par défaut). Sans \`afficher\` : « sans message ».
 */
export async function copier(texte: string, afficher?: Afficher, message = 'Copié'): Promise<boolean> {
  const fait = await copierTexte(texte);
  if (afficher) afficher(fait ? message : 'Copie impossible.', fait ? 'info' : 'erreur');
  return fait;
}

/** L'adresse complète d'une page du site (« /produit/42 » → « https://site.cd/produit/42 »). */
export function adresseAbsolue(chemin: string): string {
  return new URL(chemin, window.location.origin).href;
}

/**
 * « partager » : la feuille de partage du système. Sans elle (Firefox sur
 * ordinateur, Electron), le lien (ou le texte) est copié, et la personne le
 * sait. Fermer la feuille n'est pas une erreur.
 */
export async function partager(donnees: { texte: string; titre?: string; adresse?: string }, afficher: Afficher): Promise<void> {
  const { texte, titre, adresse } = donnees;
  const partage: ShareData = { text: texte, ...(titre ? { title: titre } : {}), ...(adresse ? { url: adresse } : {}) };
  if (navigator.share && (navigator.canShare?.(partage) ?? true)) {
    try {
      await navigator.share(partage);
      return;
    } catch (erreur) {
      if (erreur instanceof DOMException && erreur.name === 'AbortError') return;
    }
  }
  await copier(adresse ?? texte, afficher, adresse ? 'Lien copié : il ne reste qu’à le coller.' : 'Texte copié : il ne reste qu’à le coller.');
}

/**
 * « telecharger … en csv » : une ligne de titres (les champs), puis une ligne par élément. Le point-virgule et
 * le BOM font ouvrir le fichier correctement par Excel en français. Une valeur qui commence par = + - ou @
 * reçoit une apostrophe : le tableur ne la lira pas comme une formule.
 */
function texteCsv(liste: unknown[]): string {
  const lignes = liste.map((e) => (e !== null && typeof e === 'object' && !Array.isArray(e) ? (e as Record<string, unknown>) : { valeur: e }));
  const champs = [...new Set(lignes.flatMap((l) => Object.keys(l)))];
  const cellule = (v: unknown): string => {
    const lu = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
    const sur = typeof v === 'string' && /^[=+\\-@\\t\\r]/.test(lu) && !/^[+-]?[\\d\\s().-]+$/.test(lu) ? \`'\${lu}\` : lu;
    return /[;"\\n\\r]/.test(sur) ? \`"\${sur.replace(/"/g, '""')}"\` : sur;
  };
  return [champs.map(cellule), ...lignes.map((l) => champs.map((c) => cellule(l[c])))].map((l) => l.join(';')).join('\\r\\n');
}

export async function telechargerCsv(liste: unknown[], fichier: string, afficher: Afficher): Promise<void> {
  try {
    const adresse = URL.createObjectURL(new Blob(['\\uFEFF' + texteCsv(liste)], { type: 'text/csv;charset=utf-8' }));
    const lien = document.createElement('a');
    lien.href = adresse;
    lien.download = fichier;
    document.body.append(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(adresse), 1000);
  } catch {
    afficher('Téléchargement impossible.', 'erreur');
  }
}
`;

/** Les noms des touches de Humalis pour le lecteur d'écran (aria-keyshortcuts) et pour l'œil (title). */
const TOUCHES_NOMMEES: Record<string, [string, string]> = {
  entree: ['Enter', 'Entrée'],
  echap: ['Escape', 'Échap'],
  espace: ['Space', 'Espace'],
  tab: ['Tab', 'Tab'],
  suppr: ['Delete', 'Suppr'],
  retour: ['Backspace', 'Retour arrière'],
  haut: ['ArrowUp', '↑'],
  bas: ['ArrowDown', '↓'],
  gauche: ['ArrowLeft', '←'],
  droite: ['ArrowRight', '→'],
  debut: ['Home', 'Début'],
  fin: ['End', 'Fin'],
  plus: ['+', '+'],
  moins: ['-', '-'],
};

/**
 * « controle+maj+a » → aria-keyshortcuts (« Control+Shift+A Meta+Shift+A » :
 * Ctrl, ou ⌘ sur Mac) et le texte montré (« Ctrl+Maj+A »).
 */
export function decrireTouches(touches: string): { aria: string; texte: string } {
  const morceaux = touches.split('+');
  const touche = morceaux.pop()!;
  const [aria, texte] = TOUCHES_NOMMEES[touche] ?? [touche.toUpperCase(), touche.toUpperCase()];
  const avec = (controle: string) =>
    [...morceaux.map((m) => (m === 'controle' ? controle : m === 'maj' ? 'Shift' : 'Alt')), aria].join('+');
  return {
    aria: morceaux.includes('controle') ? `${avec('Control')} ${avec('Meta')}` : avec('Control'),
    texte: [...morceaux.map((m) => (m === 'controle' ? 'Ctrl' : m === 'maj' ? 'Maj' : 'Alt')), texte].join('+'),
  };
}

const CLAVIER_TS = `import { useEffect, useLayoutEffect, useRef } from 'react';

/** Le nom de la touche dans Humalis (« entree ») → event.key du navigateur, en minuscules. */
const TOUCHES: Record<string, string> = {
  entree: 'enter',
  echap: 'escape',
  espace: ' ',
  tab: 'tab',
  suppr: 'delete',
  retour: 'backspace',
  haut: 'arrowup',
  bas: 'arrowdown',
  gauche: 'arrowleft',
  droite: 'arrowright',
  debut: 'home',
  fin: 'end',
  plus: '+',
  moins: '-',
};

/** Les signes que l'on tape souvent avec Maj : Maj n'est alors pas exigée. */
const SIGNES = ['/', '?', '+', '-'];

/**
 * Vrai si la touche pressée correspond (« controle+k », « maj+? », « echap »).
 * « controle » vaut Ctrl sur Windows et Linux, ⌘ sur Mac.
 */
export function correspond(evenement: KeyboardEvent, touches: string): boolean {
  const morceaux = touches.split('+');
  const touche = morceaux.pop()!;
  const voulue = TOUCHES[touche] ?? touche;
  if (evenement.key.toLowerCase() !== voulue) return false;
  if (morceaux.includes('controle') !== (evenement.ctrlKey || evenement.metaKey)) return false;
  if (morceaux.includes('alt') !== evenement.altKey) return false;
  return SIGNES.includes(voulue) || morceaux.includes('maj') === evenement.shiftKey;
}

/** Le focus est dans une zone où l'on écrit : une lettre seule y est tapée, pas un raccourci. */
function dansUneSaisie(): boolean {
  const actif = document.activeElement;
  return actif instanceof HTMLInputElement || actif instanceof HTMLTextAreaElement || actif instanceof HTMLSelectElement || (actif instanceof HTMLElement && actif.isContentEditable);
}

/** Un raccourci : ses touches, ce qu'il fait, et l'élément où doit être le focus (« dans "recherche" »). */
export type Raccourci = [touches: string, faire: () => void, dans?: string];

/**
 * Les raccourcis de la page, tant qu'elle est affichée : un seul écouteur.
 * Une touche imprimable seule ne compte pas dans un champ ; une fenêtre
 * ouverte ne laisse passer qu'Échap et ses propres raccourcis ; jamais une
 * touche répétée ni une composition en cours (clavier asiatique).
 */
export function useRaccourcis(raccourcis: Raccourci[]) {
  const derniers = useRef(raccourcis);
  useLayoutEffect(() => {
    derniers.current = raccourcis;
  });
  useEffect(() => {
    const ecouter = (evenement: KeyboardEvent) => {
      if (evenement.repeat || evenement.isComposing) return;
      const actif = document.activeElement;
      for (const [touches, faire, dans] of derniers.current) {
        if (!correspond(evenement, touches)) continue;
        if (dans !== undefined && !actif?.closest(\`[data-humalis="\${CSS.escape(dans)}"]\`)) continue;
        const simple = dans === undefined && !touches.includes('+') && evenement.key.length === 1;
        if (simple && dansUneSaisie()) continue;
        const fenetre = document.querySelector('dialog[open]');
        if (fenetre && touches !== 'echap' && !fenetre.contains(actif)) continue;
        evenement.preventDefault();
        faire();
        return;
      }
    };
    document.addEventListener('keydown', ecouter);
    return () => document.removeEventListener('keydown', ecouter);
  }, []);
}

/** « avec raccourci » sur un bouton ou un lien : la touche le clique. */
export function cliquer(id: string): void {
  document.querySelector<HTMLElement>(\`[data-humalis="\${CSS.escape(id)}"]\`)?.click();
}

/** « avec raccourci » sur un champ : la touche met le focus dedans. */
export function focaliser(id: string): void {
  document.querySelector<HTMLElement>(\`[data-humalis="\${CSS.escape(id)}"]\`)?.focus();
}
`;

const CONFIRMATION_TS = `/**
 * « confirmer » : une question, deux boutons. Rend vrai si la personne
 * répond oui ; non, Échap ou un clic à côté rendent faux. Le focus part sur
 * le bouton qui annule (le choix sûr) et revient ensuite là où il était.
 * La question aide la personne : elle ne protège rien, le serveur vérifie
 * toujours ce qu'on lui demande.
 */
export function confirmer(question: string, boutons: { oui?: string; non?: string } = {}): Promise<boolean> {
  return new Promise((repondre) => {
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fenetre = document.createElement('dialog');
    fenetre.className = 'humalis-fenetre humalis-confirmation';
    fenetre.setAttribute('role', 'alertdialog');
    fenetre.setAttribute('aria-modal', 'true');
    const texte = document.createElement('p');
    texte.id = \`humalis-question-\${Date.now()}\`;
    texte.className = 'humalis-confirmation-question';
    texte.textContent = question;
    fenetre.setAttribute('aria-labelledby', texte.id);
    const actions = document.createElement('div');
    actions.className = 'humalis-confirmation-boutons';
    const bouton = (libelle: string, classe: string, reponse: boolean) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = classe;
      element.textContent = libelle;
      element.addEventListener('click', () => fermer(reponse));
      return element;
    };
    const non = bouton(boutons.non ?? 'Non', 'humalis-confirmation-non', false);
    actions.append(non, bouton(boutons.oui ?? 'Oui', 'humalis-confirmation-oui', true));
    fenetre.append(texte, actions);
    let fini = false;
    const fermer = (reponse: boolean) => {
      if (fini) return;
      fini = true;
      fenetre.close();
      fenetre.remove();
      document.documentElement.classList.remove('humalis-fenetre-ouverte');
      avant?.focus();
      repondre(reponse);
    };
    // Échap, ou un clic sur le fond, répondent non.
    fenetre.addEventListener('cancel', (evenement) => {
      evenement.preventDefault();
      fermer(false);
    });
    fenetre.addEventListener('click', (evenement) => {
      if (evenement.target === fenetre) fermer(false);
    });
    document.body.append(fenetre);
    document.documentElement.classList.add('humalis-fenetre-ouverte');
    if (typeof fenetre.showModal === 'function') fenetre.showModal();
    else fenetre.setAttribute('open', '');
    non.focus();
  });
}
`;

const FENETRE_TSX = `import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Une fenêtre par-dessus la page (\`fenetre "…" :\`), fermée au départ. La
 * balise <dialog> du navigateur garde le focus dedans, rend le reste de la
 * page inerte et rend le focus à ce qui l'a ouverte. Échap, la croix ou un
 * clic à côté la ferment, sauf si elle est obligatoire (la croix reste).
 */
export function Fenetre({
  ouverte,
  fermer,
  titre,
  description,
  obligatoire = false,
  className,
  children,
}: {
  ouverte: boolean;
  fermer: () => void;
  titre: string;
  description?: string;
  obligatoire?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const fenetre = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = fenetre.current;
    if (!element) return;
    if (ouverte && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.setAttribute('open', '');
      document.documentElement.classList.add('humalis-fenetre-ouverte');
    } else if (!ouverte && element.open) {
      element.close();
    }
    if (!ouverte) document.documentElement.classList.remove('humalis-fenetre-ouverte');
  }, [ouverte]);
  return (
    <dialog
      ref={fenetre}
      className={['humalis-fenetre', className].filter(Boolean).join(' ')}
      aria-labelledby={\`\${id}-titre\`}
      aria-describedby={description ? \`\${id}-description\` : undefined}
      onCancel={(evenement) => {
        evenement.preventDefault();
        if (!obligatoire) fermer();
      }}
      onClose={() => ouverte && fermer()}
      onClick={(evenement) => {
        if (!obligatoire && evenement.target === evenement.currentTarget) fermer();
      }}
    >
      {ouverte && (
        <div className="humalis-fenetre-contenu">
          <h2 id={\`\${id}-titre\`}>{titre}</h2>
          {description && <p id={\`\${id}-description\`}>{description}</p>}
          {children}
          <button type="button" className="humalis-fenetre-fermer" aria-label="Fermer" onClick={fermer}>
            ×
          </button>
        </div>
      )}
    </dialog>
  );
}
`;

const VOIR_PLUS_TS = `import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * « quand l'utilisateur arrive en bas de … » : charge la suite quand le bas
 * du bloc approche (400 pixels avant), ou quand on clique sur « Voir
 * plus », le même bouton atteignable au clavier. Un chargement à la fois ;
 * après trois chargements qui n'ont rien ajouté, on s'arrête (le bouton reste).
 */
export function useVoirPlus(faire: () => void | Promise<void>, actif: boolean) {
  const dernier = useRef(faire);
  useLayoutEffect(() => {
    dernier.current = faire;
  });
  const [enCours, setEnCours] = useState(false);
  const [sentinelle, setSentinelle] = useState<HTMLElement | null>(null);
  const [tours, setTours] = useState(0);
  const enVol = useRef(false);
  const hauteur = useRef(-1);
  const sansEffet = useRef(0);
  const charger = useCallback(async () => {
    if (enVol.current) return;
    enVol.current = true;
    setEnCours(true);
    try {
      await dernier.current();
    } finally {
      enVol.current = false;
      setEnCours(false);
      setTours((n) => n + 1);
    }
  }, []);
  useEffect(() => {
    if (!actif || !sentinelle || typeof IntersectionObserver === 'undefined') return;
    // La sentinelle n'a pas bougé : le bloc n'a pas grandi.
    const position = sentinelle.offsetTop;
    sansEffet.current = position > hauteur.current ? 0 : sansEffet.current + 1;
    hauteur.current = position;
    if (sansEffet.current >= 3) return;
    const observateur = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) void charger();
      },
      { rootMargin: '400px' },
    );
    observateur.observe(sentinelle);
    return () => observateur.disconnect();
  }, [actif, sentinelle, charger, tours]);
  return { sentinelle: setSentinelle, charger, enCours };
}
`;

const DEPLACER_TS = `import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * « pour chaque … avec deplacement » : chaque élément se prend et se
 * déplace, à la souris, au doigt ou au stylet (Pointer Events), et au
 * clavier : Espace le prend, les flèches le déplacent, Espace le dépose,
 * Échap annule. Une région vivante dit ce qui se passe au lecteur d'écran.
 * \`quandChange\` est appelé une fois par déplacement terminé.
 */
export function useDeplacement<T>(liste: T[], changer: (liste: T[]) => void, nommer: (element: T) => string, quandChange?: () => void | Promise<void>) {
  const [pris, setPris] = useState<number | null>(null);
  const [cible, setCible] = useState<number | null>(null);
  const [annonce, setAnnonce] = useState('');
  const depart = useRef<T[] | null>(null);
  const elements = useRef<(HTMLElement | null)[]>([]);
  const aFocaliser = useRef<number | null>(null);
  const dernier = useRef({ liste, changer, quandChange });
  useLayoutEffect(() => {
    dernier.current = { liste, changer, quandChange };
  });
  useEffect(() => {
    if (aFocaliser.current === null) return;
    elements.current[aFocaliser.current]?.focus();
    aFocaliser.current = null;
  });

  const deplacer = (de: number, vers: number): T[] => {
    const copie = [...dernier.current.liste];
    const [element] = copie.splice(de, 1);
    copie.splice(vers, 0, element);
    return copie;
  };
  const position = (i: number) => \`position \${i + 1} sur \${dernier.current.liste.length}\`;
  const terminer = () => {
    depart.current = null;
    setPris(null);
    setCible(null);
    void dernier.current.quandChange?.();
  };

  const auClavier = (index: number) => (evenement: KeyboardEvent<HTMLElement>) => {
    const { liste: actuelle } = dernier.current;
    if (evenement.key === ' ') {
      evenement.preventDefault();
      if (pris === null) {
        depart.current = actuelle;
        setPris(index);
        setAnnonce(\`Pris : \${nommer(actuelle[index])}, \${position(index)}. Flèches pour déplacer, Espace pour déposer, Échap pour annuler.\`);
      } else {
        setAnnonce(\`Déposé : \${nommer(actuelle[index])}, \${position(index)}.\`);
        terminer();
      }
    } else if (pris !== null && (evenement.key === 'ArrowUp' || evenement.key === 'ArrowDown')) {
      evenement.preventDefault();
      const vers = evenement.key === 'ArrowUp' ? index - 1 : index + 1;
      if (vers < 0 || vers >= actuelle.length) return;
      dernier.current.changer(deplacer(index, vers));
      setPris(vers);
      aFocaliser.current = vers;
      setAnnonce(\`Déplacé en \${position(vers)}.\`);
    } else if (pris !== null && evenement.key === 'Escape') {
      evenement.preventDefault();
      if (depart.current) dernier.current.changer(depart.current);
      aFocaliser.current = depart.current ? depart.current.indexOf(actuelle[index]) : index;
      depart.current = null;
      setPris(null);
      setAnnonce('Annulé.');
    }
  };

  /** L'élément sous le pointeur, d'après la moitié de chaque élément. */
  const indexSous = (y: number): number => {
    const boites = elements.current.map((e) => e?.getBoundingClientRect());
    for (let i = 0; i < boites.length; i++) {
      const b = boites[i];
      if (b && y < b.top + b.height / 2) return i;
    }
    return Math.max(boites.length - 1, 0);
  };

  const auPointeur = (index: number) => ({
    onPointerDown(evenement: PointerEvent<HTMLElement>) {
      // Un bouton ou un champ de l'élément garde son clic.
      if ((evenement.target as HTMLElement).closest('button, a, input, textarea, select') || evenement.button !== 0) return;
      evenement.currentTarget.setPointerCapture(evenement.pointerId);
      setPris(index);
      setCible(index);
    },
    onPointerMove(evenement: PointerEvent<HTMLElement>) {
      if (pris !== index) return;
      setCible(indexSous(evenement.clientY));
    },
    onPointerUp() {
      if (pris !== index) return;
      const vers = cible ?? index;
      if (vers !== index) {
        dernier.current.changer(deplacer(index, vers));
        setAnnonce(\`Déplacé en \${position(vers)}.\`);
        terminer();
      } else {
        setPris(null);
        setCible(null);
      }
    },
    onPointerCancel() {
      setPris(null);
      setCible(null);
    },
  });

  return {
    annonce,
    element(index: number) {
      const classes = ['humalis-deplacable', pris === index ? 'humalis-pris' : '', cible !== null && pris !== null && cible === index && cible !== pris ? (cible < pris ? 'humalis-insertion-avant' : 'humalis-insertion-apres') : ''];
      return {
        ref: (element: HTMLElement | null) => {
          elements.current[index] = element;
        },
        tabIndex: 0,
        'aria-roledescription': 'élément déplaçable',
        'aria-grabbed': pris === index,
        className: classes.filter(Boolean).join(' '),
        onKeyDown: auClavier(index),
        ...auPointeur(index),
      };
    },
  };
}
`;

/** Les styles des interactions utilisées, d'après le code produit (les couleurs ont leurs deux modes). */
export function cssInteractions(codes: string[]): string {
  const tout = codes.join('\n');
  const parties: string[] = [];
  if (/humalis-fenetre|<Fenetre\b|confirmer\(/.test(tout)) parties.push(CSS_FENETRE);
  if (/humalis-voir-plus/.test(tout)) parties.push('.humalis-voir-plus { display: block; margin: 1rem auto; }\n.humalis-sentinelle { height: 1px; }');
  if (/humalis-deplacable|useDeplacement\(/.test(tout)) parties.push(CSS_DEPLACER);
  if (/humalis-annonce-cachee/.test(tout)) parties.push(CSS_CACHE);
  return parties.length ? `\n/* Les interactions (fenêtres, « Voir plus », glisser-déposer). */\n${parties.join('\n')}\n` : '';
}

const CSS_CACHE = '.humalis-annonce-cachee { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }';

const CSS_FENETRE = `html.humalis-fenetre-ouverte { overflow: hidden; }
.humalis-fenetre { border: none; border-radius: 0.75rem; padding: 0; max-width: min(32rem, calc(100% - 2rem)); background: var(--humalis-page); color: var(--humalis-encre); box-shadow: 0 12px 40px rgb(0 0 0 / 0.3); }
.humalis-fenetre::backdrop { background: rgb(0 0 0 / 0.45); }
.humalis-fenetre-contenu, .humalis-confirmation { position: relative; padding: 1.5rem; }
.humalis-fenetre-contenu h2 { margin-top: 0; padding-right: 2rem; }
.humalis-fenetre-fermer { position: absolute; top: 0.75rem; right: 0.75rem; margin: 0; padding: 0.25rem 0.6rem; line-height: 1; }
.humalis-confirmation-boutons { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; }
.humalis-confirmation-oui { background: var(--humalis-encre); color: var(--humalis-page); }
@media (prefers-reduced-motion: no-preference) {
  .humalis-fenetre[open] { animation: humalis-fondu 150ms ease-out; }
  @keyframes humalis-fondu { from { opacity: 0; transform: translateY(0.5rem); } }
}`;

const CSS_DEPLACER = `.humalis-liste-deplacable { list-style: none; margin: 0; padding: 0; }
.humalis-deplacable { touch-action: none; cursor: grab; user-select: none; border-radius: 0.375rem; }
.humalis-deplacable:focus-visible { outline: 2px solid var(--humalis-bleu); outline-offset: 2px; }
.humalis-pris { cursor: grabbing; opacity: 0.6; }
.humalis-insertion-avant { box-shadow: 0 -3px 0 var(--humalis-bleu); }
.humalis-insertion-apres { box-shadow: 0 3px 0 var(--humalis-bleu); }
${CSS_CACHE}`;

/** `src/humalis/menu.ts` : « menu repliable », le bouton « Menu » d'un petit écran. */
const MENU_TS = `/**
 * « menu repliable » : le bouton « Menu » ouvre et ferme les liens (visible
 * seulement sur un petit écran, par le CSS) ; un lien choisi referme le menu.
 */
export function menuRepliable(evenement: { target: EventTarget; currentTarget: EventTarget }): void {
  const menu = evenement.currentTarget as HTMLElement;
  const cible = evenement.target as Element;
  const bouton = menu.querySelector(':scope > .humalis-menu-bouton');
  const ouvrir = cible.closest('.humalis-menu-bouton') !== null && !menu.hasAttribute('data-ouvert');
  if (!ouvrir && cible.closest('.humalis-menu-bouton, a') === null) return;
  menu.toggleAttribute('data-ouvert', ouvrir);
  bouton?.setAttribute('aria-expanded', String(ouvrir));
  if (!ouvrir) return;
  // Ouvert : un clic à côté, ou la touche Échap, le referme (et Échap rend le focus au bouton).
  const fermer = (e: Event) => {
    if (e instanceof KeyboardEvent ? e.key !== 'Escape' : menu.contains(e.target as Node)) return;
    menu.removeAttribute('data-ouvert');
    bouton?.setAttribute('aria-expanded', 'false');
    if (e instanceof KeyboardEvent) (bouton as HTMLElement | null)?.focus();
    document.removeEventListener('click', fermer, true);
    document.removeEventListener('keydown', fermer);
  };
  setTimeout(() => {
    document.addEventListener('click', fermer, true);
    document.addEventListener('keydown', fermer);
  });
}
`;
