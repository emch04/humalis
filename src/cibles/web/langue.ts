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

/** La clé du stockage du navigateur (ou du téléphone) où le choix est gardé. */
export const CLE_LANGUE = 'humalis-langue';

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
export function langueWebTsx(langues: LangueRI[]): string {
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
if (typeof document !== 'undefined') document.documentElement.lang = actuelle;

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

/** « Langue » dans chaque langue : le nom du sélecteur, lu par les lecteurs d'écran. */
const NOM_DU_CHOIX: Record<string, string> = { fr: 'Langue', en: 'Language' };

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
