/**
 * La langue du site dans le projet produit (plan 2026-10-30-qualite-publication,
 * partie 1, § 1.3) : `src/humalis/langue.tsx` sur le web et le bureau,
 * `src/humalis/langue.tsx` aussi sur le mobile (Expo), avec son propre
 * stockage. Écrit seulement si le programme déclare au moins deux langues.
 *
 * - `t({ fr: '…', en: '…' })` choisit la version de la langue courante ;
 * - `useLangue()` redessine la page quand la langue change ;
 * - la langue de départ : le choix gardé, sinon la première langue du site
 *   que demande le navigateur (ou le téléphone), sinon la première du bloc ;
 * - le choix n'est gardé qu'après un geste de la personne (sélecteur,
 *   « changer langue par … »), jamais pour une langue seulement détectée.
 */
import type { LangueRI } from '../../ri/types.js';
import { chaine } from './noms.js';
import { NOM_DU_CHOIX } from '../../i18n/messages-langues.js';

/** La clé du stockage du navigateur (ou du téléphone) où le choix est gardé. */
export const CLE_LANGUE = 'humalis-langue';

/** La classe qui cache la page prérendue tant que la bonne langue n'est pas dessinée. */
const CLASSE_ATTENTE = 'humalis-langue-attente';

/**
 * Les balises du haut de page d'un site en plusieurs langues : le prérendu est écrit dans la
 * première langue ; si la personne en attend une autre, on le cache jusqu'au premier dessin,
 * pour qu'elle ne voie pas une langue puis l'autre. Au bout de 3 secondes, on montre quand même.
 */
export function balisesLangueDeDepart(codes: string[]): string {
  const script = `(function(){try{if(navigator.webdriver)return;var L=${JSON.stringify(codes)},c=null;try{var g=localStorage.getItem(${JSON.stringify(CLE_LANGUE)});if(L.indexOf(g)>=0)c=g}catch(e){}if(!c){var n=navigator.languages||[navigator.language];for(var i=0;i<n.length&&!c;i++){var d=n[i].slice(0,2).toLowerCase();if(L.indexOf(d)>=0)c=d}}if(c&&c!==L[0]){var r=document.documentElement;r.lang=c;r.classList.add(${JSON.stringify(CLASSE_ATTENTE)});setTimeout(function(){r.classList.remove(${JSON.stringify(CLASSE_ATTENTE)})},3000)}}catch(e){}})()`;
  return `\n    <style>html.${CLASSE_ATTENTE} #racine{visibility:hidden}</style>\n    <script>${script}</script>`;
}

/** Les lignes communes : la liste des langues et leurs noms écrits dans leur langue. */
function entete(langues: LangueRI[]): string {
  return `/** Les langues du site : la première est celle des textes écrits. */
export const LANGUES = [${langues.map((l) => chaine(l.code)).join(', ')}] as const;
export type Langue = (typeof LANGUES)[number];

/** Le nom de chaque langue, écrit dans cette langue : c'est ainsi que le sélecteur les montre. */
export const NOMS_LANGUES: Record<Langue, string> = { ${langues.map((l) => `${l.code}: ${chaine(l.nom)}`).join(', ')} };

const estLangue = (code: unknown): code is Langue => (LANGUES as readonly unknown[]).includes(code);
`;
}

/** La partie commune au web et au mobile : la langue courante, t(), changerLangue(), useLangue(). */
const CORPS = `const abonnes = new Set<() => void>();

/** Le texte dans la langue de la personne ; à défaut, celui de la langue de base. */
export function t(versions: Partial<Record<Langue, string>>): string {
  return versions[actuelle] ?? versions[LANGUES[0]] ?? '';
}

/** La langue courante, pour les fonctions qui ne sont pas des composants (requêtes, montants). */
export function langueActuelle(): Langue {
  return actuelle;
}

function abonner(prevenir: () => void) {
  abonnes.add(prevenir);
  return () => {
    abonnes.delete(prevenir);
  };
}

/** La langue courante ; la page qui l'utilise se redessine quand elle change. */
export function useLangue() {
  const langue = useSyncExternalStore(abonner, () => actuelle, () => LANGUES[0]);
  return { langue, t, changerLangue };
}
`;

/** src/humalis/langue.tsx du web (et du bureau, à l'octet près). */
export function langueWebTsx(langues: LangueRI[], parAdresse = false): string {
  if (parAdresse) return langueParAdresseTsx(langues);
  return `import { useSyncExternalStore } from 'react';

${entete(langues)}const CLE = ${chaine(CLE_LANGUE)};

/**
 * La langue de départ : le choix gardé, sinon la première langue du site
 * que demande le navigateur, sinon la première du site.
 */
function langueDeDepart(): Langue {
  if (typeof window === 'undefined') return LANGUES[0];
  // Le prérendu (un navigateur automatisé) écrit les pages dans la langue de base du site,
  // celle que les moteurs de recherche doivent lire, quelle que soit la langue de ce navigateur.
  if (navigator.webdriver) return LANGUES[0];
  try {
    const gardee = localStorage.getItem(CLE);
    if (estLangue(gardee)) return gardee;
  } catch {
    // Stockage refusé (navigation privée, réglages) : on suit le navigateur.
  }
  for (const demandee of navigator.languages ?? [navigator.language]) {
    const code = demandee.slice(0, 2).toLowerCase();
    if (estLangue(code)) return code;
  }
  return LANGUES[0];
}

let actuelle: Langue = langueDeDepart();
// Les lecteurs d'écran prononcent la page dans la bonne langue.
if (typeof document !== 'undefined') {
  document.documentElement.lang = actuelle;
  // Ce fichier arrive avec la page : deux images plus tard, elle est dessinée dans la bonne langue.
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('humalis-langue-attente')));
}

/** Change la langue, et la garde dans ce navigateur : c'est un choix de la personne. */
export function changerLangue(langue: Langue): void {
  actuelle = langue;
  document.documentElement.lang = langue;
  try {
    localStorage.setItem(CLE, langue);
  } catch {
    // Sans stockage, le choix vaut jusqu'au rechargement.
  }
  for (const prevenir of abonnes) prevenir();
}

${CORPS}
/** « selecteur de langue » : chaque langue écrite dans sa langue, l'actuelle choisie. */
export function SelecteurLangue({ className }: { className?: string }) {
  const { langue } = useLangue();
  return (
    <select
      className={className}
      value={langue}
      aria-label={t({ ${langues.map((l) => `${l.code}: ${chaine(NOM_DU_CHOIX[l.code] ?? 'Langue')}`).join(', ')} })}
      onChange={(evenement) => changerLangue(evenement.target.value as Langue)}
    >
      {LANGUES.map((code) => (
        <option key={code} value={code} lang={code}>
          {NOMS_LANGUES[code]}
        </option>
      ))}
    </select>
  );
}
`;
}


/**
 * « avec adresse par langue » : la langue se lit dans l'adresse (/en/accueil ; /accueil pour la première).
 * Le routeur reçoit ce préfixe comme base : tous les liens le gardent. Changer de langue change d'adresse.
 * Chaque page déclare ses autres langues (hreflang) pour les moteurs de recherche.
 */
function langueParAdresseTsx(langues: LangueRI[]): string {
  return `import { useSyncExternalStore } from 'react';

${entete(langues)}
/** La langue écrite au début de l'adresse (« /en/… ») ; sans préfixe, la première langue du site. */
function langueDeLAdresse(chemin: string): Langue {
  const premier = chemin.split('/')[1];
  return estLangue(premier) && premier !== LANGUES[0] ? premier : LANGUES[0];
}

let actuelle: Langue = typeof window === 'undefined' ? LANGUES[0] : langueDeLAdresse(location.pathname);

/** La base du routeur : « /en » pour l'anglais, rien pour la première langue. */
export function baseDuRouteur(): string | undefined {
  return actuelle === LANGUES[0] ? undefined : '/' + actuelle;
}

/** Le même chemin dans une autre langue : « /en/menu » devient « /menu » ou « /es/menu ». */
export function cheminEnLangue(chemin: string, langue: Langue): string {
  const sans = langueDeLAdresse(chemin) === LANGUES[0] ? chemin : chemin.slice(1 + actuelle.length) || '/';
  return langue === LANGUES[0] ? sans : '/' + langue + (sans === '/' ? '/' : sans);
}

/** Les autres versions de cette page, pour les moteurs de recherche (hreflang). */
function declarerLesLangues(): void {
  document.querySelectorAll('link[data-humalis-langue]').forEach((lien) => lien.remove());
  for (const code of [...LANGUES, 'x-default' as const]) {
    const lien = document.createElement('link');
    lien.rel = 'alternate';
    lien.hreflang = code;
    lien.href = location.origin + cheminEnLangue(location.pathname, code === 'x-default' ? LANGUES[0] : code);
    lien.dataset.humalisLangue = '';
    document.head.append(lien);
  }
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = actuelle;
  declarerLesLangues();
  // Une page suivante garde ses liens hreflang à jour.
  addEventListener('popstate', declarerLesLangues);
  const pousser = history.pushState.bind(history);
  history.pushState = (...args: Parameters<History['pushState']>) => {
    pousser(...args);
    declarerLesLangues();
  };
}

/** Change de langue : la même page, à l'adresse de cette langue. */
export function changerLangue(langue: Langue): void {
  if (langue === actuelle) return;
  location.assign(cheminEnLangue(location.pathname, langue) + location.search + location.hash);
}

${CORPS}
/** « selecteur de langue » : chaque langue écrite dans sa langue, l'actuelle choisie. */
export function SelecteurLangue({ className }: { className?: string }) {
  const { langue } = useLangue();
  return (
    <select
      className={className}
      value={langue}
      aria-label={t({ ${langues.map((l) => `${l.code}: ${chaine(NOM_DU_CHOIX[l.code] ?? 'Langue')}`).join(', ')} })}
      onChange={(evenement) => changerLangue(evenement.target.value as Langue)}
    >
      {LANGUES.map((code) => (
        <option key={code} value={code} lang={code}>
          {NOMS_LANGUES[code]}
        </option>
      ))}
    </select>
  );
}
`;
}

/** src/humalis/langue.tsx du mobile (Expo) : langue du téléphone par expo-localization, choix gardé par AsyncStorage. */
export function langueMobileTsx(langues: LangueRI[]): string {
  return `import { useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

${entete(langues)}const CLE = ${chaine(CLE_LANGUE)};

/** La première langue du site que demande le téléphone, sinon la première du site. */
function langueDuTelephone(): Langue {
  for (const { languageCode } of getLocales()) {
    if (estLangue(languageCode)) return languageCode;
  }
  return LANGUES[0];
}

let actuelle: Langue = langueDuTelephone();

// Le choix gardé arrive un instant après le démarrage : il passe avant la langue du téléphone.
AsyncStorage.getItem(CLE)
  .then((gardee) => {
    if (estLangue(gardee) && gardee !== actuelle) {
      actuelle = gardee;
      for (const prevenir of abonnes) prevenir();
    }
  })
  .catch(() => {});

/** Change la langue, et la garde sur le téléphone : c'est un choix de la personne. */
export function changerLangue(langue: Langue): void {
  actuelle = langue;
  AsyncStorage.setItem(CLE, langue).catch(() => {});
  for (const prevenir of abonnes) prevenir();
}

${CORPS}
/** « selecteur de langue » : un bouton par langue, écrite dans sa langue, l'actuelle marquée. */
export function SelecteurLangue() {
  const { langue } = useLangue();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t({ ${langues.map((l) => `${l.code}: ${chaine(NOM_DU_CHOIX[l.code] ?? 'Langue')}`).join(', ')} })} style={{ flexDirection: 'row', gap: 8 }}>
      {LANGUES.map((code) => (
        <Pressable
          key={code}
          accessibilityRole="radio"
          accessibilityState={{ checked: code === langue }}
          accessibilityLanguage={code}
          onPress={() => changerLangue(code)}
          style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, opacity: code === langue ? 1 : 0.6 }}
        >
          <Text style={{ fontWeight: code === langue ? '700' : '400' }}>{NOMS_LANGUES[code]}</Text>
        </Pressable>
      ))}
    </View>
  );
}
`;
}
