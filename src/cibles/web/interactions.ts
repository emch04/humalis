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

/** La plateforme du projet produit : le navigateur (web, bureau) ou le téléphone (Expo). */
export type Plateforme = 'web' | 'mobile';

/** Les fichiers de humalis/ que les pages emploient, d'après leurs imports (« ../humalis/temps », « ../../humalis/temps »). */
export function fichiersDesInteractions(codes: string[], plateforme: Plateforme = 'web'): Map<string, string> {
  const fichiers = new Map<string, string>();
  const emploie = (fichier: string) => codes.some((c) => c.includes(`humalis/${fichier}';`));
  if (emploie('temps')) fichiers.set('temps.ts', tempsTs(plateforme));
  if (emploie('presse-papier')) fichiers.set('presse-papier.ts', pressePapierTs(plateforme));
  if (emploie('clavier')) fichiers.set('clavier.ts', CLAVIER_TS);
  if (emploie('confirmation')) fichiers.set(plateforme === 'web' ? 'confirmation.ts' : 'confirmation.tsx', plateforme === 'web' ? CONFIRMATION_TS : CONFIRMATION_MOBILE);
  if (emploie('fenetre')) fichiers.set('fenetre.tsx', plateforme === 'web' ? FENETRE_TSX : FENETRE_MOBILE);
  if (emploie('voir-plus')) fichiers.set('voir-plus.ts', plateforme === 'web' ? VOIR_PLUS_TS : VOIR_PLUS_MOBILE);
  if (emploie('deplacer')) fichiers.set('deplacer.ts', plateforme === 'web' ? DEPLACER_TS : DEPLACER_MOBILE);
  return fichiers;
}

/** Les outils de chaque fichier, pour écrire les imports d'une page. */
export const OUTILS_INTERACTIONS: Record<string, string[]> = {
  temps: ['useActuel', 'useMinuterie', 'usePlanifier', 'useMouvementReduit', 'useQuandChange', 'useQuandPause', 'useDerniere'],
  'presse-papier': ['copier', 'partager', 'adresseAbsolue'],
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
    const employes = noms.filter((n) => !declares.has(n) && new RegExp(n === 'Fenetre' ? '<Fenetre\\b' : `\\b${n}\\(`).test(code));
    if (employes.length) lignes.push(`import { ${employes.join(', ')} } from '${dossier}/${fichier}';`);
  }
  return lignes;
}

/**
 * humalis/temps.ts : les minuteries et « mouvement est reduit ». Le web suit
 * la visibilité de l'onglet et prefers-reduced-motion ; le téléphone, l'état
 * de l'application (AppState) et le réglage d'accessibilité du système.
 */
function tempsTs(plateforme: Plateforme): string {
  const web = plateforme === 'web';
  return `import { useCallback, useEffect, useLayoutEffect, useRef, useState${web ? ', useSyncExternalStore' : ''} } from 'react';
${web ? '' : "import { AccessibilityInfo, AppState } from 'react-native';\n"}
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

${
  web
    ? `/** La page est-elle à l'écran ? Un onglet caché suspend les minuteries qui se répètent. */
function pageVisible(): boolean {
  return typeof document === 'undefined' || !document.hidden;
}`
    : `/** L'application est-elle à l'écran ? En arrière-plan, les minuteries qui se répètent sont suspendues. */
function pageVisible(): boolean {
  return AppState.currentState === 'active';
}`
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

${
  web
    ? `const REQUETE = '(prefers-reduced-motion: reduce)';

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
}`
    : `/** « mouvement est reduit » : la personne a demandé à son téléphone de réduire les animations, suivi en direct. */
export function useMouvementReduit(): boolean {
  const [reduit, setReduit] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduit);
    const abonnement = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduit);
    return () => abonnement.remove();
  }, []);
  return reduit;
}`
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
}

/** Ce que copier et partager disent à la personne : sans retour, un lecteur d'écran n'entendrait rien. */
const MESSAGES_PRESSE_PAPIER = `/** Afficher un message (useMessages) : le résultat est toujours dit à la personne. */
type Afficher = (texte: string, genre: 'info' | 'erreur') => void;

/**
 * « copier » : met le texte dans le presse-papier, puis dit si c'est fait
 * (\`message\`, « Copié » par défaut). Sans \`afficher\` : « sans message ».
 */
export async function copier(texte: string, afficher?: Afficher, message = 'Copié'): Promise<boolean> {
  const fait = await copierTexte(texte);
  if (afficher) afficher(fait ? message : 'Copie impossible.', fait ? 'info' : 'erreur');
  return fait;
}`;

/**
 * humalis/presse-papier.ts : « copier » et « partager ». Le navigateur a
 * l'API du presse-papier (et un repli) et la feuille de partage quand le
 * système en a une ; le téléphone, expo-clipboard et Share de React Native.
 */
function pressePapierTs(plateforme: Plateforme): string {
  if (plateforme === 'mobile') {
    return `import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

/** Met un texte dans le presse-papier du téléphone. Vrai si c'est fait. */
export async function copierTexte(texte: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(texte);
    return true;
  } catch {
    return false;
  }
}

${MESSAGES_PRESSE_PAPIER}

/**
 * L'adresse complète d'une page, pour la partager : celle du site
 * (EXPO_PUBLIC_HUMALIS_SITE, par exemple https://reystore.cd). Sans elle,
 * une application n'a pas d'adresse : seul le texte est partagé.
 */
export function adresseAbsolue(chemin: string): string | undefined {
  const site = process.env.EXPO_PUBLIC_HUMALIS_SITE;
  return site ? new URL(chemin, site).href : undefined;
}

/**
 * « partager » : la feuille de partage du téléphone. Sur Android, l'adresse
 * va dans le message ; sur iPhone, dans son propre champ. Fermer la feuille
 * n'est pas une erreur.
 */
export async function partager(donnees: { texte: string; titre?: string; adresse?: string }, afficher: Afficher): Promise<void> {
  const { texte, titre, adresse } = donnees;
  try {
    await Share.share({
      message: adresse && Platform.OS !== 'ios' ? \`\${texte} \${adresse}\` : texte,
      ...(adresse ? { url: adresse } : {}),
      ...(titre ? { title: titre } : {}),
    });
  } catch {
    afficher('Partage impossible.', 'erreur');
  }
}
`;
  }
  return `/**
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

${MESSAGES_PRESSE_PAPIER}

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
`;
}

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

/**
 * La fenêtre sur le téléphone : un Modal, fermé par le bouton retour
 * d'Android et le geste d'iOS, sauf si elle est obligatoire (la croix reste).
 */
const FENETRE_MOBILE = `import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCouleurs } from './styles';

export function Fenetre({
  ouverte,
  fermer,
  titre,
  description,
  obligatoire = false,
  children,
}: {
  ouverte: boolean;
  fermer: () => void;
  titre: string;
  description?: string;
  obligatoire?: boolean;
  /** Le CSS ne s'applique pas sur le téléphone : la classe est ignorée. */
  className?: string;
  children: ReactNode;
}) {
  const couleurs = useCouleurs();
  // « Réduire les animations » : la fenêtre apparaît sans fondu.
  const [reduit, setReduit] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduit);
  }, []);
  const fermerSiPermis = () => {
    if (!obligatoire) fermer();
  };
  return (
    <Modal transparent visible={ouverte} animationType={reduit ? 'none' : 'fade'} onRequestClose={fermerSiPermis}>
      <View style={styles.fond}>
        <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={fermerSiPermis} />
        <View accessibilityViewIsModal style={[styles.carte, { backgroundColor: couleurs.page }]}>
          <Text accessibilityRole="header" style={[styles.titre, { color: couleurs.encre }]}>
            {titre}
          </Text>
          {description && <Text style={{ color: couleurs.encre }}>{description}</Text>}
          <ScrollView>{children}</ScrollView>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" hitSlop={8} onPress={fermer} style={styles.fermer}>
            <Text style={{ color: couleurs.encre, fontSize: 20 }}>×</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  carte: { borderRadius: 12, padding: 20, paddingTop: 16, gap: 12, maxHeight: '90%' },
  titre: { fontSize: 20, fontWeight: '600', paddingRight: 32 },
  fermer: { position: 'absolute', top: 8, right: 8, padding: 8 },
});
`;

/**
 * « confirmer » sur le téléphone : une seule fenêtre de question pour toute
 * l'application (<Confirmations> dans app/_layout.tsx) ; useConfirmer() rend
 * la fonction qui pose la question et attend la réponse.
 */
const CONFIRMATION_MOBILE = `import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCouleurs } from './styles';

type Confirmer = (question: string, boutons?: { oui?: string; non?: string }) => Promise<boolean>;

const Contexte = createContext<Confirmer>(async () => false);

interface Question {
  texte: string;
  oui: string;
  non: string;
}

export function Confirmations({ children }: { children: ReactNode }) {
  const couleurs = useCouleurs();
  const [question, setQuestion] = useState<Question | null>(null);
  const repondre = useRef<(reponse: boolean) => void>(() => {});
  const confirmer = useCallback<Confirmer>(
    (texte, boutons = {}) =>
      new Promise((resoudre) => {
        repondre.current = (reponse) => {
          setQuestion(null);
          resoudre(reponse);
        };
        setQuestion({ texte, oui: boutons.oui ?? 'Oui', non: boutons.non ?? 'Non' });
      }),
    [],
  );
  return (
    <Contexte.Provider value={confirmer}>
      {children}
      <Modal transparent visible={question !== null} animationType="none" onRequestClose={() => repondre.current(false)}>
        <View style={styles.fond}>
          <View accessibilityViewIsModal accessibilityRole="alert" style={[styles.carte, { backgroundColor: couleurs.page }]}>
            <Text style={[styles.question, { color: couleurs.encre }]}>{question?.texte}</Text>
            <View style={styles.boutons}>
              {/* Le bouton qui annule d'abord : c'est le choix sûr. */}
              <Pressable accessibilityRole="button" onPress={() => repondre.current(false)} style={[styles.bouton, { borderColor: couleurs.encre }]}>
                <Text style={{ color: couleurs.encre }}>{question?.non}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => repondre.current(true)} style={[styles.bouton, { backgroundColor: couleurs.encre, borderColor: couleurs.encre }]}>
                <Text style={{ color: couleurs.page }}>{question?.oui}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Contexte.Provider>
  );
}

/** La fonction qui pose une question : vrai si la personne répond oui. */
export function useConfirmer(): Confirmer {
  return useContext(Contexte);
}

const styles = StyleSheet.create({
  fond: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  carte: { borderRadius: 12, padding: 20, gap: 16 },
  question: { fontSize: 18 },
  boutons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  bouton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1 },
});
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

/** « arrive en bas de » sur le téléphone : le bouton « Voir plus », un chargement à la fois. */
const VOIR_PLUS_MOBILE = `import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export function useVoirPlus(faire: () => void | Promise<void>, actif: boolean) {
  const dernier = useRef(faire);
  useLayoutEffect(() => {
    dernier.current = faire;
  });
  const [enCours, setEnCours] = useState(false);
  const charger = useCallback(async () => {
    if (!actif || enCours) return;
    setEnCours(true);
    try {
      await dernier.current();
    } finally {
      setEnCours(false);
    }
  }, [actif, enCours]);
  return { charger, enCours };
}
`;

/**
 * « avec deplacement » sur le téléphone : chaque élément monte ou descend
 * d'un cran (boutons visibles et actions du lecteur d'écran). \`quandChange\`
 * est appelé une fois par déplacement.
 */
const DEPLACER_MOBILE = `import { useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useDeplacement<T>(liste: T[], changer: (liste: T[]) => void, nommer: (element: T) => string, quandChange?: () => void | Promise<void>) {
  const dernier = useRef({ liste, changer, quandChange });
  useLayoutEffect(() => {
    dernier.current = { liste, changer, quandChange };
  });
  const deplacer = (de: number, vers: number) => {
    const actuelle = dernier.current.liste;
    if (vers < 0 || vers >= actuelle.length) return;
    const copie = [...actuelle];
    const [element] = copie.splice(de, 1);
    copie.splice(vers, 0, element);
    dernier.current.changer(copie);
    AccessibilityInfo.announceForAccessibility(\`Déplacé en position \${vers + 1} sur \${copie.length}.\`);
    void dernier.current.quandChange?.();
  };
  return {
    monter: (index: number) => deplacer(index, index - 1),
    descendre: (index: number) => deplacer(index, index + 1),
    element(index: number) {
      return {
        accessibilityLabel: \`\${nommer(liste[index])}, position \${index + 1} sur \${liste.length}\`,
        accessibilityActions: [
          { name: 'monter', label: 'Monter' },
          { name: 'descendre', label: 'Descendre' },
        ],
        onAccessibilityAction: (evenement: { nativeEvent: { actionName: string } }) =>
          deplacer(index, evenement.nativeEvent.actionName === 'monter' ? index - 1 : index + 1),
      };
    },
  };
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
