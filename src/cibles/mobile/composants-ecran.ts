/**
 * Les petits fichiers que le projet mobile reçoit quand le programme se
 * sert d'une construction de mise en page ou d'un élément d'écran : ils
 * ne sont écrits que dans ce cas (voir `projet.ts`).
 */

/** « sur telephone : » : un bloc rendu seulement sur certains appareils, d'après la largeur de la fenêtre. */
export const APPAREIL_TSX = `import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

export type Appareil = 'telephone' | 'tablette' | 'ordinateur';

/** Les mêmes seuils que le web : moins de 640 pixels, de 640 à 1023, 1024 et plus. */
export function useAppareil(): Appareil {
  const { width } = useWindowDimensions();
  return width < 640 ? 'telephone' : width < 1024 ? 'tablette' : 'ordinateur';
}

/** Rend son contenu seulement sur les appareils donnés. */
export function SurAppareil({ sur, children }: { sur: Appareil[]; children: ReactNode }) {
  return sur.includes(useAppareil()) ? <>{children}</> : null;
}
`;

/** « avec degrade bleu vers violet » : un fond en dégradé entre deux couleurs du thème. */
export const DEGRADE_TSX = `import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCouleurs } from './styles';

const DIRECTIONS = {
  diagonale: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  vertical: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  horizontal: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
};

interface Proprietes {
  de: string;
  vers: string;
  direction: keyof typeof DIRECTIONS;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function Degrade({ de, vers, direction, style, children }: Proprietes) {
  const couleurs: Record<string, string> = useCouleurs();
  return (
    <LinearGradient colors={[couleurs[de], couleurs[vers]]} {...DIRECTIONS[direction]} style={style}>
      {children}
    </LinearGradient>
  );
}
`;

/**
 * humalis/mouvement.tsx (plan des médias, 4.6) : les animations d'entrée,
 * faites avec Animated (sans dépendance). Si le téléphone demande de réduire
 * les animations, l'élément s'affiche dans son état final, sans Animated.timing.
 */
export const MOUVEMENT_TSX = `// Produit par Humalis : les animations d'entrée, coupées si le téléphone demande de réduire les animations.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

/** Vrai si le téléphone demande de réduire les animations (réglage d'accessibilité), suivi en direct. */
export function useReduireAnimations(): boolean {
  // Vrai tant que la réponse n'est pas là : rien ne bouge sans savoir.
  const [reduire, setReduire] = useState(true);
  useEffect(() => {
    let actif = true;
    AccessibilityInfo.isReduceMotionEnabled().then((valeur) => {
      if (actif) setReduire(valeur);
    });
    const abonnement = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduire);
    return () => {
      actif = false;
      abonnement.remove();
    };
  }, []);
  return reduire;
}

interface Proprietes {
  animation: 'apparition' | 'montee' | 'agrandissement';
  /** Millisecondes. */
  duree: number;
  delai: number;
  children: ReactNode;
}

/** Une animation d'entrée, jouée une fois ; l'élément part de son état final (jamais caché sans mouvement). */
export function Anime({ animation, duree, delai, children }: Proprietes) {
  const reduire = useReduireAnimations();
  const progres = useRef(new Animated.Value(1)).current;
  const jouee = useRef(false);
  useEffect(() => {
    if (reduire) {
      progres.setValue(1);
      return;
    }
    if (jouee.current) return;
    jouee.current = true;
    progres.setValue(0);
    Animated.timing(progres, { toValue: 1, duration: duree, delay: delai, useNativeDriver: true }).start();
  }, [reduire, progres, duree, delai]);
  const transform =
    animation === 'montee'
      ? [{ translateY: progres.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }]
      : animation === 'agrandissement'
        ? [{ scale: progres.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }]
        : [];
  return <Animated.View style={{ opacity: progres, transform }}>{children}</Animated.View>;
}
`;
