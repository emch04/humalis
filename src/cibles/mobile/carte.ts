/**
 * La carte sur le mobile : `react-native-maps`, la carte native (Apple Plans sur iPhone,
 * Google Maps sur Android), dans `humalis/carte-lieux.tsx`, avec la liste des lieux
 * sous la carte. Honnêteté : écrit d'après la documentation de la bibliothèque
 * et vérifié par `tsc` seulement, jamais regardé dans un simulateur.
 */
import { carteWeb } from '../web/carte.js';
import type { CarteProduite } from '../web/carte.js';

/** La version accordée à Expo 57 (bundledNativeModules.json). */
export const REACT_NATIVE_MAPS = '1.27.2';

/** La phrase qui explique la clé de Google, écrite dans le LISEZMOI et dite à la compilation. */
export const PHRASE_CLE_GOOGLE =
  'sur Android, la carte est celle de Google Maps et demande une clé : ajoutez votre clé Google Maps dans app.json (expo.android.config.googleMaps.apiKey). Sur iPhone, la carte est celle d’Apple et n’a besoin d’aucune clé.';

/** `<CarteLieux … />` : la même écriture que le web (mêmes réglages, mêmes lieux). */
export const carteMobile = (c: CarteProduite): string[] => carteWeb(c);

export const CARTE_MOBILE_TSX = `import { useRef } from 'react';
import { Platform, Text, View } from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { useCouleurs } from './styles';

/** Un lieu de la carte : son nom (la bulle), son adresse facultative, sa position. */
export interface Lieu {
  nom: string;
  adresse?: string;
  latitude: number;
  longitude: number;
}

interface Proprietes {
  /** Le nom de la carte : il la décrit pour les lecteurs d'écran. */
  nom: string;
  lieux: Lieu[];
  latitude?: number;
  longitude?: number;
  zoom?: number;
  /** Un autre fournisseur de tuiles (https://…/{z}/{x}/{y}.png) et son attribution, toujours affichée. */
  tuiles?: string;
  attribution?: string;
}

/** La taille d'une région pour un zoom de 1 (le monde) à 18 (une rue). */
const delta = (zoom: number) => 360 / Math.pow(2, zoom);

/**
 * Une carte native et, sous elle, la liste des lieux (un texte par lieu, lu par
 * les lecteurs d'écran). Sans centre, la carte s'ajuste à ses lieux. Sur Android,
 * Google Maps demande une clé dans app.json (voir le LISEZMOI).
 */
export default function CarteLieux({ nom, lieux, latitude, longitude, zoom, tuiles, attribution }: Proprietes) {
  const couleurs = useCouleurs();
  const carte = useRef<MapView>(null);
  const centre = latitude !== undefined && longitude !== undefined ? { latitude, longitude } : lieux.length === 1 ? lieux[0] : undefined;
  const taille = delta(zoom ?? 15);
  return (
    <View style={{ marginVertical: 12 }}>
      <MapView
        ref={carte}
        accessibilityLabel={nom}
        style={{ height: 320, borderRadius: 8 }}
        mapType={tuiles && Platform.OS === 'android' ? 'none' : 'standard'}
        initialRegion={centre ? { latitude: centre.latitude, longitude: centre.longitude, latitudeDelta: taille, longitudeDelta: taille } : undefined}
        onMapReady={() => {
          if (!centre && lieux.length > 0) carte.current?.fitToCoordinates(lieux, { edgePadding: { top: 48, right: 48, bottom: 48, left: 48 }, animated: false });
        }}
      >
        {tuiles ? <UrlTile urlTemplate={tuiles} maximumZ={19} /> : null}
        {lieux.map((lieu, i) => (
          <Marker key={i} coordinate={lieu} title={lieu.nom} description={lieu.adresse} accessibilityLabel={lieu.nom} />
        ))}
      </MapView>
      {tuiles && attribution ? <Text style={{ color: couleurs.encre, fontSize: 12, marginTop: 4 }}>{attribution}</Text> : null}
      {lieux.map((lieu, i) => (
        <Text key={i} style={{ color: couleurs.encre, marginTop: 4 }}>
          {lieu.nom}
          {lieu.adresse ? \`, \${lieu.adresse}\` : ''}
        </Text>
      ))}
    </View>
  );
}
`;
