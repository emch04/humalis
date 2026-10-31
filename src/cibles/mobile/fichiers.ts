/**
 * Le choix d'un fichier sur le téléphone : le pendant de `cibles/web/fichiers.ts`.
 * Les photos et les vidéos viennent de la galerie (expo-image-picker) ; les
 * autres fichiers (PDF, documents, sons), du sélecteur de fichiers du
 * téléphone (expo-document-picker). La page reçoit la même fiche que sur le
 * web : nom, taille, type, apercu.
 *
 * Comme sur le web, rien n'est « sécurisé » ici : le type et la taille
 * vérifiés sont un confort, le serveur revérifie toujours. Une image envoyée
 * dans une donnée (« photo : image ») est réduite par humalis/serveur.ts.
 *
 * Honnêteté : vérifié par `tsc` sur le projet produit ; jamais essayé dans un
 * simulateur.
 */
import type { Application } from '../../ri/types.js';
import type { Diagnostic } from '../../analyse/erreurs.js';

/** Les versions accordées à Expo 57 (bundledNativeModules.json). */
export const VERSIONS_FICHIERS = {
  imagePicker: '57.0.20',
  documentPicker: '57.0.3',
  imageManipulator: '57.0.21',
};

/** La phrase de la galerie sur l'iPhone (NSPhotoLibraryUsageDescription), écrite dans app.json. */
export const PHRASE_PHOTOS = "L'application ouvre vos photos pour que vous choisissiez une image à envoyer.";

/**
 * `choix-fichier.tsx` : le bouton, la galerie ou le sélecteur de fichiers, le
 * refus de confort. `galerie` est vrai quand le choix n'accepte que des images
 * ou des vidéos : la galerie du téléphone suffit.
 */
export function choixFichierMobileTsx(galerie: boolean, documents: boolean): string {
  const imports = [
    "import { useState, type ComponentType } from 'react';",
    "import { Pressable, Text, View } from 'react-native';",
    ...(galerie ? ["import * as ImagePicker from 'expo-image-picker';"] : []),
    ...(documents ? ["import * as DocumentPicker from 'expo-document-picker';"] : []),
    "import { useCouleurs, useStyles } from './styles';",
  ];
  const lireGalerie = `/** La galerie du téléphone : les photos (et les vidéos) qu'il sait déjà lire. */
async function depuisLaGalerie(familles: Famille[], plusieurs: boolean): Promise<Lu[] | null> {
  const types: ImagePicker.MediaType[] = [];
  if (familles.length === 0 || familles.some((f) => f.nom === 'images')) types.push('images');
  if (familles.length === 0 || familles.some((f) => f.nom === 'videos')) types.push('videos');
  // La galerie s'ouvre sans demander de permission : le téléphone montre son propre sélecteur.
  const resultat = await ImagePicker.launchImageLibraryAsync({ mediaTypes: types, allowsMultipleSelection: plusieurs, quality: 1 });
  if (resultat.canceled) return null;
  return resultat.assets.map((a) => ({
    nom: a.fileName ?? a.uri.split('/').pop() ?? 'photo',
    taille: a.fileSize,
    // La galerie ne rend que ce que le téléphone a décodé : une photo HEIC est une image,
    // et la réduction avant l'envoi la réécrit en JPEG.
    mime: a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    famille: a.type === 'video' ? 'videos' : 'images',
    brut: { uri: a.uri, mime: a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg'), largeur: a.width, hauteur: a.height },
  }));
}`;
  const lireDocuments = `/** Le sélecteur de fichiers du téléphone, limité aux types acceptés. */
async function depuisLesFichiers(familles: Famille[], plusieurs: boolean): Promise<Lu[] | null> {
  const mime = familles.flatMap((f) => f.mime);
  // Le fichier est copié dans le cache de l'application : son adresse reste lisible après le choix.
  const resultat = await DocumentPicker.getDocumentAsync({ type: mime.length > 0 ? mime : '*/*', multiple: plusieurs, copyToCacheDirectory: true });
  if (resultat.canceled) return null;
  return resultat.assets.map((a) => {
    const type = a.mimeType ?? '';
    return { nom: a.name, taille: a.size, mime: type, famille: familles.find((f) => f.mime.includes(type))?.nom, brut: { uri: a.uri, mime: type, largeur: 0, hauteur: 0 } };
  });
}`;
  const appel = galerie && documents ? '(galerie ? depuisLaGalerie : depuisLesFichiers)' : galerie ? 'depuisLaGalerie' : 'depuisLesFichiers';
  return `${imports.join('\n')}

/** Ce que le téléphone donne du fichier : son adresse locale, son type, et les dimensions d'une photo. */
export interface FichierBrut {
  uri: string;
  mime: string;
  /** En pixels ; 0 si ce n'est pas une image. */
  largeur: number;
  hauteur: number;
}

/** Un fichier choisi : ce que la page peut lire (nom, taille, type, aperçu) et le fichier lui-même. */
export interface FichierChoisi {
  nom: string;
  /** En octets ; 0 si le téléphone ne l'a pas dite. */
  taille: number;
  /** Un mot : image, audio, video, pdf, document ou fichier. */
  type: string;
  /** Une adresse locale pour l'afficher (images, sons, vidéos), sinon null. */
  apercu: string | null;
  brut: FichierBrut;
}

interface Famille {
  nom: string;
  mime: string[];
}

/** Un fichier tel que la galerie ou le sélecteur le rendent, avant les vérifications. */
interface Lu {
  nom: string;
  taille?: number;
  mime: string;
  famille?: string;
  brut: FichierBrut;
}

interface Proprietes {
  libelle: string;
  /** La page voit un fichier choisi comme une fiche de quatre champs (nom, taille, type, apercu) : \`brut\` est réservé à ce composant et au serveur. */
  valeur: any;
  onChange: (valeur: any) => void;
  familles: Famille[];
  /** En octets. */
  maximum?: number;
  plusieurs?: boolean;
  apercu: boolean;
  /** « avec icone "photo" » : le bouton montre l'icône seule, le libellé devient son nom pour le lecteur d'écran. */
  icone?: ComponentType<{ size?: number; color?: string }>;
}

const MOTS: Record<string, string> = { images: 'image', audio: 'audio', videos: 'video', pdf: 'pdf', documents: 'document' };

const REFUS_DE_TYPE: Record<string, string> = {
  images: 'une image',
  audio: 'un son',
  videos: 'une vidéo',
  pdf: 'un PDF',
  documents: 'un document',
};

/** 8,2 Mo, 340 Ko : la taille comme on la lit. */
function ecrireTaille(octets: number): string {
  if (octets >= 1024 * 1024) return (octets / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
  if (octets >= 1024) return Math.round(octets / 1024).toLocaleString('fr-FR') + ' Ko';
  return octets + ' octets';
}

${[...(galerie ? [lireGalerie] : []), ...(documents ? [lireDocuments] : [])].join('\n\n')}

/** Le choix d'un fichier : un bouton, la galerie ou les fichiers du téléphone, et un message si le fichier ne convient pas. */
export default function ChoixFichier({ libelle, valeur, onChange, familles, maximum, plusieurs = false, apercu, icone: Dessin }: Proprietes) {
  const s = useStyles();
  const couleurs = useCouleurs();
  const [erreur, setErreur] = useState('');
${galerie && documents ? "  // Des photos et des vidéos seulement : la galerie suffit ; sinon, le sélecteur de fichiers.\n  const galerie = familles.length > 0 && familles.every((f) => f.nom === 'images' || f.nom === 'videos');\n" : ''}
  async function choisir() {
    let lus: Lu[] | null;
    try {
      lus = await ${appel}(familles, plusieurs);
    } catch {
      setErreur("Le téléphone n'a pas pu ouvrir vos fichiers. Réessayez.");
      return;
    }
    // Rien de choisi : la valeur d'avant reste.
    if (lus === null) return;
    const gardes: FichierChoisi[] = [];
    const refus: string[] = [];
    for (const lu of lus) {
      const sujet = lus.length === 1 ? 'Ce fichier' : lu.nom;
      if (maximum !== undefined && lu.taille !== undefined && lu.taille > maximum) {
        refus.push(\`\${sujet} est trop gros : \${ecrireTaille(lu.taille)}, le maximum est \${ecrireTaille(maximum)}.\`);
        continue;
      }
      const famille = familles.find((f) => f.nom === lu.famille);
      if (familles.length > 0 && !famille) {
        refus.push(\`\${sujet} n'est pas \${familles.map((f) => REFUS_DE_TYPE[f.nom]).join(' ni ')}.\`);
        continue;
      }
      const adresse = apercu && /^(image|audio|video)\\//.test(lu.mime) ? lu.brut.uri : null;
      gardes.push({ nom: lu.nom, taille: lu.taille ?? 0, type: famille ? MOTS[famille.nom] : lu.mime.startsWith('image/') ? 'image' : 'fichier', apercu: adresse, brut: lu.brut });
    }
    // Un fichier refusé n'est pas gardé : la variable reste vide.
    setErreur(refus.join(' '));
    onChange(plusieurs ? gardes : (gardes[0] ?? null));
  }

  const choisis: FichierChoisi[] = Array.isArray(valeur) ? valeur : valeur ? [valeur] : [];
  return (
    <View style={{ marginVertical: 4, gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={libelle} style={s.bouton} onPress={() => void choisir()} hitSlop={Dessin ? 8 : undefined}>
        {Dessin ? <Dessin size={20} color={couleurs.encre} /> : <Text style={s.texteBouton}>{libelle}</Text>}
      </Pressable>
      {choisis.map((fichier, i) => (
        <Text key={i} style={s.texte}>
          {fichier.nom}
        </Text>
      ))}
      {erreur !== '' && (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[s.texte, { color: couleurs.rouge }]}>
          {erreur}
        </Text>
      )}
    </View>
  );
}
`;
}

/**
 * La réduction d'une image avant l'envoi, ajoutée à humalis/serveur.ts quand
 * une page choisit un fichier : la même règle que le web (480 px de côté, JPEG,
 * au plus 90 000 caractères), pour que le même serveur l'accepte.
 */
export const REDUIRE_IMAGE_MOBILE = `
/** Un fichier choisi dans la page (humalis/choix-fichier.tsx) : son adresse locale et ce qu'il est. */
interface FichierBrut {
  uri: string;
  mime: string;
  largeur: number;
  hauteur: number;
}

const estFichierBrut = (brut: unknown): brut is FichierBrut =>
  typeof brut === 'object' && brut !== null && typeof (brut as FichierBrut).uri === 'string' && typeof (brut as FichierBrut).mime === 'string';

/**
 * Une image choisie dans la page (« fichier … accepte images ») envoyée dans une donnée
 * (« photo : image ») : réduite à 480 px de côté, en JPEG, pour tenir dans l'envoi.
 * Une image transparente perd sa transparence : le JPEG n'en a pas.
 */
async function reduireImage(fichier: FichierBrut): Promise<string> {
  const contexte = ImageManipulator.manipulate(fichier.uri);
  let largeur = fichier.largeur;
  let hauteur = fichier.hauteur;
  // Des dimensions inconnues : l'image est lue une première fois pour les connaître.
  if (largeur <= 0 || hauteur <= 0) {
    const lue = await contexte.renderAsync();
    largeur = lue.width;
    hauteur = lue.height;
    lue.release();
  }
  if (Math.max(largeur, hauteur) > 480) contexte.resize(largeur >= hauteur ? { width: 480 } : { height: 480 });
  const image = await contexte.renderAsync();
  try {
    let qualite = 0.85;
    let texte = 'data:image/jpeg;base64,' + (await image.saveAsync({ format: SaveFormat.JPEG, compress: qualite, base64: true })).base64;
    while (texte.length > 90_000 && qualite > 0.4) {
      qualite -= 0.15;
      texte = 'data:image/jpeg;base64,' + (await image.saveAsync({ format: SaveFormat.JPEG, compress: qualite, base64: true })).base64;
    }
    return texte;
  } finally {
    image.release();
    contexte.release();
  }
}

/** Les fichiers choisis d'un envoi deviennent du texte : une image réduite ; un autre fichier ne s'envoie pas ainsi. */
async function preparer(donnees: Record<string, unknown>): Promise<Record<string, unknown>> {
  const pret: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(donnees)) {
    const brut = (valeur as { brut?: unknown } | null)?.brut;
    // Une image que le téléphone ne sait pas lire part telle quelle : le serveur la refuse.
    pret[cle] = estFichierBrut(brut) && brut.mime.startsWith('image/') ? await reduireImage(brut).catch(() => valeur) : valeur;
  }
  return pret;
}
`;

/**
 * « envoyer fichier … vers … de la source … » passe par le moteur des sources,
 * qui n'existe pas encore sur le mobile : refusé avec un message clair. Le
 * choix d'un fichier, lui, est produit, et une image part vers le serveur du
 * programme dans une donnée « image » (« envoyer requete … avec photo »).
 */
export function verifierFichiersPourLeMobile(application: Application): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const e of [...application.ecrans, ...application.composants]) {
    if (JSON.stringify([e.vue, e.gestionnaires]).includes('"type":"envoiFichier"')) {
      diagnostics.push({
        gravite: 'erreur',
        ligne: e.ligne,
        message: `« envoyer fichier … de la source » (page « ${e.nom} ») n'est pas encore disponible sur la cible mobile : l'envoi passe par les sources, qui n'existent pas encore ici. Sur le téléphone, une image choisie part vers le serveur du programme dans une donnée « image » (envoyer requete vers "…" avec photo). Sinon, compilez pour le web ou le desktop.`,
      });
    }
  }
  return diagnostics;
}
