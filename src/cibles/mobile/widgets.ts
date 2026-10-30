/**
 * Les éléments d'écran sur le mobile (Expo / React Native) : le pendant de
 * `cibles/web/widgets.ts`. Honnêteté : vérifié par `tsc` sur le projet
 * produit seulement quand l'essai mobile le passe ; jamais regardé dans le
 * simulateur.
 */
import { composantLucide, ICONES } from '../../vocabulaire/icones.js';
import { camel, chaine } from '../web/noms.js';
import { messageEnCode } from '../../i18n/messages.js';
import { composantIcone, type RenduWidgets, type WidgetProduit } from '../web/widgets.js';
import { estFichierLocal } from '../../ri/medias.js';
import { CARTE_MOBILE_TSX, REACT_NATIVE_MAPS, carteMobile } from './carte.js';

/** Les icônes (`icone={ShoppingCart}`) que le code utilise. */
const iconesMobile = (code: string): string[] =>
  ICONES.map((i) => composantLucide(i.lucide) + 'Icon').filter((c, i, tout) => tout.indexOf(c) === i && new RegExp(`icone=\\{${c}\\}`).test(code));

const styleDe = (noms: string[]) => (noms.length === 0 ? '' : noms.length === 1 ? ` style={s.${noms[0]}}` : ` style={[${noms.map((n) => `s.${n}`).join(', ')}]}`);
const nomsStyle = (w: { styles: string[] }) => w.styles.map((n) => camel(n));
const taille = (w: { styles: string[] }) => w.styles.find((n) => n.startsWith('taille_'))?.slice(7);

export const WIDGETS_MOBILE: RenduWidgets = {
  imports(code) {
    const lignes: string[] = [];
    const icones = iconesMobile(code);
    if (icones.length > 0) lignes.push(`import { ${icones.join(', ')} } from 'lucide-react-native';`);
    if (/<QRCode\b/.test(code)) lignes.push(`import QRCode from 'react-native-qrcode-svg';`);
    for (const [composant, fichier] of [['Avatar', 'avatar'], ['Etoiles', 'etoiles'], ['Compteur', 'compteur'], ['Carrousel', 'carrousel'], ['Progression', 'progression'], ['Icone', 'icone'], ['Lecteur', 'lecteur'], ['CarteLieux', 'carte-lieux'], ['Graphique', 'graphique']]) {
      if (new RegExp(`<${composant}\\b`).test(code)) lignes.push(`import ${composant} from '../humalis/${fichier}';`);
    }
    if (/<SelecteurLangue\b/.test(code)) lignes.push(`import { SelecteurLangue } from '../humalis/langue';`);
    return lignes;
  },

  carte: carteMobile,

  // Sur le téléphone, une icône ne se glisse pas dans un <Text> : elle n'est pas placée avant le texte d'un bouton.
  icone: () => '',

  widget(w: WidgetProduit) {
    const etiquette = w.reglages.descriptionLangues ? `{${messageEnCode(w.reglages.descriptionLangues, chaine)}}` : JSON.stringify(w.reglages.description);
    const description = w.reglages.description && !w.reglages.decoratif ? ` accessibilityLabel=${etiquette}` : '';
    switch (w.genre) {
      case 'icone':
        return `<Icone icone={${composantIcone(w.texte ?? '')}}${taille(w) ? ` taille="${taille(w)}"` : ''}${description} />`;
      case 'badge':
        return `<View${styleDe(['badge', ...nomsStyle(w)])}><Text${styleDe(['texteBadge'])}>${w.contenu}</Text></View>`;
      case 'avatar':
        return `<Avatar nom={${w.valeur}}${w.photo ? ` photo={${w.photo}}` : ''}${taille(w) ? ` taille="${taille(w)}"` : ''} />`;
      case 'progression': {
        const rien = w.valeur === 'null' || w.valeur === 'undefined';
        return `<Progression ${rien ? '' : `valeur={${w.valeur}} `}maximum={${w.maximum ?? 100}}${w.reglages.pourcentage ? ' pourcentage' : ''}${description} />`;
      }
      case 'chargement':
        return `<View accessibilityRole="progressbar" accessibilityLabel=${w.texte ? JSON.stringify(w.texte) : '"Chargement"'}${styleDe(['chargement'])}><ActivityIndicator />${w.contenu ? `<Text${styleDe(['texte'])}>${w.contenu}</Text>` : ''}</View>`;
      case 'etoiles':
        return `<Etoiles valeur={${w.valeur}} maximum={${w.maximum ?? 5}}${w.reglages.modifiable && w.variable ? ` onChange={${w.variable.setter}}` : ''}${description} />`;
      case 'compteur':
        return `<Compteur valeur={${w.valeur}} onChange={${w.variable!.setter}}${w.minimum !== undefined ? ` minimum={${w.minimum}}` : ''}${w.maximum !== undefined ? ` maximum={${w.maximum}}` : ''}${description} />`;
      case 'qr': {
        const t = { petite: 128, normale: 192, grande: 256, tres_grande: 320 }[taille(w) ?? 'normale'] ?? 192;
        return `<View accessibilityRole="image" accessibilityLabel=${w.reglages.descriptionLangues ? etiquette : JSON.stringify(w.reglages.description ?? 'Code QR')}${styleDe(['qr'])}><QRCode value={${w.valeur}} size={${t}} backgroundColor="#ffffff" color="#000000" /></View>`;
      }
      case 'selecteurLangue':
        return '<SelecteurLangue />';
      case 'audio': {
        // Un son local est recopié dans assets/audio/ ; une adresse reste telle quelle. Jamais de lecture automatique.
        const local = w.texte !== undefined && estFichierLocal(w.texte);
        const source = local ? `require(${JSON.stringify(`../assets/audio/${w.texte}`)})` : `{ uri: ${w.valeur} }`;
        const description = w.audio?.description ? ` description=${w.audio.description}` : '';
        const transcription = w.audio?.transcription ? ` transcription={<>${w.audio.transcription}</>}` : '';
        return `<Lecteur source={${source}}${description}${transcription}${w.reglages.boucle ? ' boucle' : ''} />`;
      }
      case 'fichier':
        // Refusé avant d'arriver ici (cibles/sources.ts : verifierMediasPourLaCible).
        throw new Error('le choix d’un fichier n’est pas encore produit pour le mobile');
    }
  },

  composite(c) {
    switch (c.genre) {
      case 'onglets': {
        const sel = c.etat!.lecture;
        const set = c.etat!.setter;
        const onglets = c.parties.map(
          (p, i) =>
            `<Pressable key={${i}} accessibilityRole="tab" accessibilityState={{ selected: ${sel} === ${i} }} onPress={() => ${set}(${i})}${styleDe(['onglet'])}><Text${styleDe(['texteBouton'])}>${p.titre}</Text>{${sel} === ${i} && <View${styleDe(['ongletSoulignement'])} />}</Pressable>`,
        );
        return {
          avant: ['<View>', `  <ScrollView horizontal showsHorizontalScrollIndicator={false}${styleDe(['onglets'])}>`, ...onglets.map((o) => `    ${o}`), '  </ScrollView>'],
          parties: c.parties.map((_, i) => ({ ouvrir: [`{${sel} === ${i} && (`, '  <View>'], fermer: ['  </View>', ')}'] })),
          apres: ['</View>'],
        };
      }
      case 'deroulant':
        return {
          avant: [
            '<View>',
            `  <Pressable accessibilityRole="button" accessibilityState={{ expanded: ${c.ouvert} }} onPress={() => ${c.basculer}}${styleDe(['deroulantTitre'])}><Text${styleDe(['texteBouton'])}>${c.parties[0].titre}</Text><Text${styleDe(['texte'])}>{${c.ouvert} ? '▴' : '▾'}</Text></Pressable>`,
          ],
          parties: [{ ouvrir: [`{${c.ouvert} && (`, '  <View>'], fermer: ['  </View>', ')}'] }],
          apres: ['</View>'],
        };
      case 'accordeon':
        return { avant: ['<View>'], apres: ['</View>'] };
      case 'carrousel':
        return {
          avant: [`<Carrousel${c.reglages.automatique ? ` automatique={${c.reglages.automatique}}` : ''}${c.reglages.visibles ? ` visibles={${c.reglages.visibles}}` : ''}>`],
          apres: ['</Carrousel>'],
        };
      case 'filAriane':
        return {
          avant: [`<View accessibilityRole="menu"${styleDe(['fil'])}>`],
          parties: c.parties.map((_, i) => ({
            ouvrir: [`<View${styleDe(['filItem'])}>`, ...(i > 0 ? [`  <Text${styleDe(['texte'])}>›</Text>`] : [])],
            fermer: ['</View>'],
          })),
          apres: ['</View>'],
        };
      default:
        return { avant: [], apres: [] };
    }
  },
};

// ─── Les styles et les petits fichiers ──────────────────────────────────

/** Les styles des éléments d'écran, écrits seulement s'ils servent (`s.badge`…). */
export function stylesDesElements(codes: string[], encre: string, bleu: string, rouge: string, rougeEncre: string): string[] {
  const emploie = (nom: string) => codes.some((c) => new RegExp(`\\bs\\.${nom}\\b`).test(c));
  const styles: Record<string, string> = {
    badge: `badge: { alignSelf: 'flex-start', minWidth: 24, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: '${rouge}', marginVertical: 4 },`,
    texteBadge: `texteBadge: { fontSize: 13, fontWeight: '600', color: '${rougeEncre}', textAlign: 'center' },`,
    chargement: `chargement: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },`,
    qr: `qr: { alignSelf: 'flex-start', padding: 12, borderRadius: 8, backgroundColor: '#ffffff', marginVertical: 8 },`,
    onglets: `onglets: { borderBottomWidth: 1, borderColor: '#8a8a9080', flexGrow: 0 },`,
    onglet: `onglet: { paddingHorizontal: 16, paddingVertical: 10 },`,
    ongletSoulignement: `ongletSoulignement: { height: 3, backgroundColor: '${bleu}', marginTop: 6 },`,
    deroulantTitre: `deroulantTitre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: '#8a8a9080' },`,
    fil: `fil: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginVertical: 8 },`,
    filItem: `filItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },`,
  };
  void encre;
  return Object.entries(styles).filter(([nom]) => emploie(nom)).map(([, ligne]) => ligne);
}

/** Les petits fichiers de `humalis/` dont le projet mobile a besoin. */
export function fichiersMobiles(codes: string[]): Map<string, string> {
  const fichiers = new Map<string, string>();
  const emploie = (motif: RegExp) => codes.some((c) => motif.test(c));
  if (emploie(/<Icone\b/)) fichiers.set('humalis/icone.tsx', ICONE_TSX);
  if (emploie(/<Avatar\b/)) fichiers.set('humalis/avatar.tsx', AVATAR_TSX);
  if (emploie(/<Progression\b/)) fichiers.set('humalis/progression.tsx', PROGRESSION_TSX);
  if (emploie(/<Etoiles\b/)) fichiers.set('humalis/etoiles.tsx', ETOILES_TSX);
  if (emploie(/<Compteur\b/)) fichiers.set('humalis/compteur.tsx', COMPTEUR_TSX);
  if (emploie(/<Carrousel\b/)) fichiers.set('humalis/carrousel.tsx', CARROUSEL_TSX);
  if (emploie(/<Lecteur\b/)) fichiers.set('humalis/lecteur.tsx', LECTEUR_TSX);
  if (emploie(/<CarteLieux\b/)) fichiers.set('humalis/carte-lieux.tsx', CARTE_MOBILE_TSX);
  return fichiers;
}

/** Les dépendances que le projet mobile ajoute, d'après ce que son code emploie. */
export function dependancesMobiles(codes: string[]): Record<string, string> {
  const emploie = (motif: RegExp) => codes.some((c) => motif.test(c));
  const svg = emploie(/from 'lucide-react-native'/) || emploie(/from 'react-native-qrcode-svg'/) || emploie(/from 'react-native-svg'/);
  return {
    ...(emploie(/from 'lucide-react-native'/) ? { 'lucide-react-native': '1.65.0' } : {}),
    ...(emploie(/from 'react-native-qrcode-svg'/) ? { 'react-native-qrcode-svg': '6.3.48' } : {}),
    // La version d'expo-image accordée à Expo 57 (bundledNativeModules.json).
    ...(emploie(/from 'expo-image'/) ? { 'expo-image': '57.0.5' } : {}),
    // « copier » : le presse-papier du téléphone (la version accordée à Expo 57).
    ...(emploie(/from 'expo-clipboard'/) ? { 'expo-clipboard': '57.0.2' } : {}),
    // Le lecteur de son : expo-audio, accordé à Expo 57 (il remplace expo-av).
    ...(emploie(/<Lecteur\b/) ? { 'expo-audio': '57.0.5' } : {}),
    // La carte native, accordée à Expo 57 (bundledNativeModules.json).
    ...(emploie(/from 'react-native-maps'/) ? { 'react-native-maps': REACT_NATIVE_MAPS } : {}),
    ...(svg ? { 'react-native-svg': '15.15.4' } : {}),
  };
}

const TAILLES = `{ petite: 14, normale: 20, grande: 32, tres_grande: 48 }`;

const ICONE_TSX = `import type { ComponentType } from 'react';
import { useCouleurs } from './styles';

const TAILLES: Record<string, number> = ${TAILLES};

interface Proprietes {
  icone: ComponentType<{ size?: number; color?: string }>;
  taille?: keyof typeof TAILLES;
  accessibilityLabel?: string;
}

/** Une icône de Lucide, à la couleur du texte du thème. */
export default function Icone({ icone: Dessin, taille = 'normale', accessibilityLabel }: Proprietes) {
  const couleurs = useCouleurs();
  return (
    <Dessin size={TAILLES[taille]} color={couleurs.encre} {...(accessibilityLabel ? { accessibilityLabel, accessibilityRole: 'image' } : { accessible: false })} />
  );
}
`;

const AVATAR_TSX = `import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useCouleurs } from './styles';

const TAILLES: Record<string, number> = { petite: 32, normale: 40, grande: 64, tres_grande: 96 };

function initiales(nom: string): string {
  const mots = nom.trim().split(/\\s+/).filter(Boolean);
  return ((mots[0]?.[0] ?? '') + (mots.length > 1 ? (mots[mots.length - 1][0] ?? '') : '')).toUpperCase();
}

/** La personne : sa photo, ou ses initiales si elle manque ou ne se charge pas. */
export default function Avatar({ nom, photo, taille = 'normale' }: { nom: string; photo?: string; taille?: string }) {
  const couleurs = useCouleurs();
  const [echec, setEchec] = useState(false);
  const cote = TAILLES[taille] ?? 40;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={nom}
      style={{ width: cote, height: cote, borderRadius: cote / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: couleurs.bleu, marginVertical: 4, alignSelf: 'flex-start' }}
    >
      {photo && !echec ? (
        <Image source={{ uri: photo }} onError={() => setEchec(true)} style={{ width: cote, height: cote }} />
      ) : (
        <Text style={{ color: couleurs.page, fontWeight: '600', fontSize: cote / 2.5 }}>{initiales(nom)}</Text>
      )}
    </View>
  );
}
`;

const PROGRESSION_TSX = `import { Text, View } from 'react-native';
import { useCouleurs } from './styles';

interface Proprietes {
  /** Absent : la barre n'avance pas vers une fin connue. */
  valeur?: number | null;
  maximum?: number;
  pourcentage?: boolean;
  accessibilityLabel?: string;
}

export default function Progression({ valeur, maximum = 100, pourcentage, accessibilityLabel }: Proprietes) {
  const couleurs = useCouleurs();
  const part = valeur == null ? 0.3 : Math.max(0, Math.min(1, valeur / maximum));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 10 }}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={valeur == null ? undefined : { min: 0, max: maximum, now: valeur }}
        style={{ flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#8a8a904d' }}
      >
        <View style={{ width: \`\${part * 100}%\`, height: 10, borderRadius: 5, backgroundColor: couleurs.bleu }} />
      </View>
      {pourcentage && valeur != null && <Text style={{ color: couleurs.encre }}>{Math.round(part * 100)} %</Text>}
    </View>
  );
}
`;

const ETOILES_TSX = `import { Pressable, View } from 'react-native';
import { StarIcon as Star } from 'lucide-react-native';
import { useCouleurs } from './styles';

interface Proprietes {
  valeur: number;
  maximum?: number;
  onChange?: (valeur: number) => void;
  accessibilityLabel?: string;
}

/** Une note en étoiles ; modifiable si \`onChange\` est donné. Les demi-étoiles sont arrondies à l'étoile la plus proche. */
export default function Etoiles({ valeur, maximum = 5, onChange, accessibilityLabel }: Proprietes) {
  const couleurs = useCouleurs();
  const arrondi = Math.round(valeur * 2) / 2;
  return (
    <View
      accessibilityRole={onChange ? 'adjustable' : 'image'}
      accessibilityLabel={accessibilityLabel ?? \`Note : \${valeur} sur \${maximum}\`}
      style={{ flexDirection: 'row', gap: 2, marginVertical: 4 }}
    >
      {Array.from({ length: maximum }, (_, i) => {
        const pleine = arrondi >= i + 1 || arrondi >= i + 0.5;
        const etoile = <Star size={22} color={couleurs.jaune} fill={pleine ? couleurs.jaune : 'none'} opacity={arrondi >= i + 1 || arrondi < i + 0.5 ? 1 : 0.6} />;
        return onChange ? (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={\`\${i + 1} sur \${maximum}\`} onPress={() => onChange(i + 1)}>
            {etoile}
          </Pressable>
        ) : (
          <View key={i}>{etoile}</View>
        );
      })}
    </View>
  );
}
`;

/** Le lecteur de son du mobile : lecture et pause, position, temps, transcription. Jamais de lecture automatique. */
const LECTEUR_TSX = `import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCouleurs } from './styles';

interface Proprietes {
  source: number | { uri: string };
  description?: string;
  transcription?: ReactNode;
  boucle?: boolean;
}

/** 83 secondes donnent « 1:23 ». */
const duree = (secondes: number) => \`\${Math.floor(secondes / 60)}:\${String(Math.floor(secondes % 60)).padStart(2, '0')}\`;

/** Un son : un bouton lecture / pause, une barre de position et le temps. La personne le lance, jamais l'application. */
export default function Lecteur({ source, description, transcription, boucle }: Proprietes) {
  const couleurs = useCouleurs();
  const lecteur = useAudioPlayer(source);
  const etat = useAudioPlayerStatus(lecteur);
  const [lue, setLue] = useState(false);
  lecteur.loop = boucle === true;
  const fraction = etat.duration > 0 ? Math.min(1, etat.currentTime / etat.duration) : 0;
  return (
    <View accessibilityLabel={description} style={{ marginVertical: 8, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={etat.playing ? 'Pause' : 'Lecture'}
          onPress={() => (etat.playing ? lecteur.pause() : lecteur.play())}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: couleurs.encre, borderRadius: 22 }}
        >
          <Text style={{ color: couleurs.encre, fontSize: 18 }}>{etat.playing ? '❚❚' : '▶'}</Text>
        </Pressable>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Position"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
          style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(138,138,144,0.3)' }}
        >
          <View style={{ width: \`\${fraction * 100}%\`, height: 6, borderRadius: 3, backgroundColor: couleurs.encre }} />
        </View>
        <Text style={{ color: couleurs.encre }}>{duree(etat.currentTime)} / {duree(etat.duration || 0)}</Text>
      </View>
      {transcription ? (
        <View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: lue }} onPress={() => setLue(!lue)}>
            <Text style={{ color: couleurs.encre, textDecorationLine: 'underline' }}>Lire la transcription</Text>
          </Pressable>
          {lue ? <Text style={{ color: couleurs.encre, marginTop: 4 }}>{transcription}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
`;

const COMPTEUR_TSX = `import { Pressable, Text, View } from 'react-native';
import { useCouleurs } from './styles';

interface Proprietes {
  valeur: number;
  onChange: (valeur: number) => void;
  minimum?: number;
  maximum?: number;
  accessibilityLabel?: string;
}

/** « – 1 + » : deux boutons et la valeur, qui reste entre le minimum et le maximum. */
export default function Compteur({ valeur, onChange, minimum, maximum, accessibilityLabel }: Proprietes) {
  const couleurs = useCouleurs();
  const moins = minimum !== undefined && valeur <= minimum;
  const plus = maximum !== undefined && valeur >= maximum;
  const bouton = (actif: boolean) => ({ minWidth: 40, alignItems: 'center' as const, paddingVertical: 6, borderWidth: 1, borderColor: couleurs.encre, borderRadius: 6, opacity: actif ? 1 : 0.4 });
  return (
    <View accessibilityLabel={accessibilityLabel ?? 'Quantité'} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Diminuer" disabled={moins} onPress={() => onChange(valeur - 1)} style={bouton(!moins)}>
        <Text style={{ color: couleurs.encre, fontSize: 18 }}>–</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={{ color: couleurs.encre, minWidth: 28, textAlign: 'center', fontSize: 18 }}>
        {valeur}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Augmenter" disabled={plus} onPress={() => onChange(valeur + 1)} style={bouton(!plus)}>
        <Text style={{ color: couleurs.encre, fontSize: 18 }}>+</Text>
      </Pressable>
    </View>
  );
}
`;

const CARROUSEL_TSX = `import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useCouleurs } from './styles';

interface Proprietes {
  children: ReactNode;
  automatique?: number;
  /** Sur un téléphone, une seule diapositive est vue à la fois. */
  visibles?: number;
}

/** Des diapositives qu'on fait défiler du doigt, avec des points, et seules si \`automatique\` est donné. */
export default function Carrousel({ children, automatique }: Proprietes) {
  const couleurs = useCouleurs();
  const { width } = useWindowDimensions();
  const piste = useRef<ScrollView>(null);
  const [courante, setCourante] = useState(0);
  const total = Children.count(children);
  const largeur = width - 32;

  useEffect(() => {
    if (!automatique || total < 2) return;
    const minuterie = setInterval(() => {
      const suivante = (courante + 1) % total;
      piste.current?.scrollTo({ x: suivante * largeur, animated: true });
      setCourante(suivante);
    }, automatique * 1000);
    return () => clearInterval(minuterie);
  }, [automatique, courante, total, largeur]);

  return (
    <View accessibilityRole="adjustable" style={{ marginVertical: 12 }}>
      <ScrollView
        ref={piste}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(evenement) => setCourante(Math.round(evenement.nativeEvent.contentOffset.x / largeur))}
      >
        {Children.map(children, (enfant) => (
          <View style={{ width: largeur }}>{enfant}</View>
        ))}
      </ScrollView>
      {total > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          {Array.from({ length: total }, (_, i) => (
            <Pressable
              key={i}
              accessibilityLabel={\`Diapositive \${i + 1} sur \${total}\`}
              onPress={() => {
                piste.current?.scrollTo({ x: i * largeur, animated: true });
                setCourante(i);
              }}
              style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: couleurs.encre, backgroundColor: courante === i ? couleurs.encre : 'transparent' }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
`;
