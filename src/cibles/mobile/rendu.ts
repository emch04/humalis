import type { Option } from '../../ri/types.js';
import { attributTexte, type Rendu, type ElementProduit, type ImageProduite } from '../web/ecran.js';
import { camel, chaine } from '../web/noms.js';
import { messageEnCode } from '../../i18n/messages.js';
import { WIDGETS_MOBILE } from './widgets.js';
import { MILLISECONDES } from '../commun/mouvement.js';

/** Les composants React Native que le code produit peut utiliser. */
const NATIFS = ['ActivityIndicator', 'Pressable', 'ScrollView', 'Switch', 'Text', 'TextInput', 'View'];

/** Les réglages qui ne sont pas des styles du StyleSheet : l'appareil, le dégradé (un composant) et l'élément collé (sans effet). */
const SANS_STYLE = new Set(['sur', 'degrade', 'colle', 'animation', 'duree', 'delai', 'transition', 'effet']);

/**
 * « avec animation montee » : l'élément est entouré d'un <Anime>, qui ne
 * bouge pas si le téléphone demande de réduire les animations. « transition »
 * et « effet » sont sans effet sur le téléphone.
 */
function ouvrirAnime(options: Option[]): string {
  const animation = options.find((o) => o.nom === 'animation' && o.valeur !== 'defilement' && o.valeur !== 'cascade');
  if (!animation) return '';
  const duree = MILLISECONDES.duree[options.find((o) => o.nom === 'duree')?.valeur ?? 'moyenne'] ?? 300;
  const delai = options.find((o) => o.nom === 'delai');
  return `<Anime animation="${animation.valeur}" duree={${duree}} delai={${delai ? (MILLISECONDES.delai[delai.valeur] ?? 0) : 0}}>`;
}
const animer = (options: Option[], code: string): string => (ouvrirAnime(options) ? `${ouvrirAnime(options)}${code}</Anime>` : code);
const stylesDe = (options: Option[]) => options.filter((o) => !SANS_STYLE.has(o.nom)).map(nomStyle);

/**
 * Une image avec expo-image (décisions M4 à M6) : un fichier local est recopié dans
 * assets/images et chargé par require ; une adresse passe par uri. La place est
 * réservée par les proportions écrites, sinon par les dimensions lues dans le fichier.
 */
function imageMobile(image: ImageProduite, id: string, options: Option[]): string {
  const source = image.locale !== undefined ? `{require(${chaine(`../assets/images/${image.locale}`)})}` : `{{ uri: ${image.expression} }}`;
  const accessibilite = image.alt.decorative ? ' accessible={false}' : ` accessibilityLabel=${image.alt.jsx}`;
  const ajustement = options.find((o) => o.nom === 'ajustement')?.valeur;
  const proportions = image.proportions ?? (image.largeur && image.hauteur ? [image.largeur, image.hauteur] : undefined);
  const styles = [...options.filter((o) => o.nom !== 'ajustement' && !SANS_STYLE.has(o.nom)).map((o) => `s.${nomStyle(o)}`)];
  const tous = ['s.image', ...styles, ...(proportions ? [`{ aspectRatio: ${proportions[0]} / ${proportions[1]} }`] : [])];
  const style = tous.length === 1 ? `style={${tous[0]}}` : `style={[${tous.join(', ')}]}`;
  return `<Image ${id} source=${source}${accessibilite}${image.prioritaire ? ' priority="high"' : ''}${ajustement ? ` contentFit="${ajustement === 'remplir' ? 'cover' : 'contain'}"` : ''} ${style} />`;
}

/** Le nom d'un style nommé dans le StyleSheet (« couleur bleu » → couleurBleu). */
export const nomStyle = (option: Option) => camel(`${option.nom}_${option.valeur}`);

/** `style={s.texte}`, ou `style={[s.titre, s.couleurBleu]}` pour plusieurs. */
function style(noms: string[]): string {
  const references = noms.map((n) => `s.${n}`);
  return references.length === 1 ? `style={${references[0]}}` : `style={[${references.join(', ')}]}`;
}

/**
 * Le rendu React Native (décision M2) : Text, Pressable, Image, TextInput,
 * la navigation d'expo-router et le StyleSheet de humalis/styles.ts.
 */
export const RENDU_MOBILE: Rendu = {
  imports(code) {
    const lignes: string[] = [];
    const natifs = NATIFS.filter((n) => new RegExp(`<${n}\\b`).test(code));
    if (natifs.length) lignes.push(`import { ${natifs.join(', ')} } from 'react-native';`);
    // Les images passent par expo-image : cache, chargement progressif, ajustement.
    if (/<Image\b/.test(code)) lignes.push(`import { Image } from 'expo-image';`);
    const routeur: string[] = [];
    if (/<Link\b/.test(code)) routeur.push('Link');
    if (/\buseRouter\(/.test(code)) routeur.push('useRouter');
    if (/\buseLocalSearchParams</.test(code)) routeur.push('useLocalSearchParams');
    if (routeur.length) lignes.push(`import { ${routeur.join(', ')} } from 'expo-router';`);
    if (/<SurAppareil\b/.test(code)) lignes.push(`import { SurAppareil } from '../humalis/appareil';`);
    if (/<Degrade\b/.test(code)) lignes.push(`import { Degrade } from '../humalis/degrade';`);
    if (/<Anime\b/.test(code)) lignes.push(`import { Anime } from '../humalis/mouvement';`);
    lignes.push(`import { useStyles } from '../humalis/styles';`);
    return lignes;
  },
  navigateur: 'const routeur = useRouter();',
  naviguer: (chemin) => `routeur.push(${chemin});`,
  enveloppe: { page: ['<ScrollView contentContainerStyle={s.page}>', '</ScrollView>'], composant: ['<>', '</>'] },
  // Pas de souris sur un téléphone : le survol n'y existe pas (décision M7).
  evenements: { clic: 'onPress' },
  debut: 'const s = useStyles();',
  parametres: (noms) =>
    `const { ${noms.map((n) => `${camel(n)} = ''`).join(', ')} } = useLocalSearchParams<{ ${noms.map((n) => `${camel(n)}: string`).join('; ')} }>();`,
  adresse: (base, valeurs) => `\`${base === '/' ? '' : base}${valeurs.map((v) => `/\${encodeURIComponent(String(${v}))}`).join('')}\``,
  element(el: ElementProduit): string {
    return animer(el.options, elementMobile(el));
  },
  // Un formulaire est un groupe : le bouton (onPress) et la touche « Envoyer » du clavier l'envoient.
  formulaire: {
    ouvrir: (id) => `<View testID="${id}" ${style(['formulaire'])}>`,
    fermer: '</View>',
  },
  // Un bloc est une View : sa mise en page (rangée, colonne, grille) vient du StyleSheet.
  bloc: {
    ouvrir: (genre, options) => ouvrirAnime(options) + ouvrirBloc(genre, options),
    fermer: (genre, options) => (genre === 'appareil' ? '</SurAppareil>' : options.some((o) => o.nom === 'degrade') ? '</Degrade>' : '</View>') + (ouvrirAnime(options) ? '</Anime>' : ''),
  },
  soumission: { bouton: 'onPress', saisie: 'onSubmitEditing' },
  widgets: WIDGETS_MOBILE,
  entree: 'onSubmitEditing',
  confirmationParCrochet: true,
  // Le téléphone n'observe pas le défilement : la suite se charge avec le bouton, toujours là.
  voirPlus: (nom, bouton) => [
    `<Pressable accessibilityRole="button" accessibilityState={{ busy: ${nom}.enCours }} disabled={${nom}.enCours} ${style(['bouton'])} onPress={() => void ${nom}.charger()}><Text ${style(['texteBouton'])}>${bouton ?? 'Voir plus'}</Text></Pressable>`,
  ],
  // Pas de glissement au doigt pour l'instant : « Monter » et « Descendre », visibles et pour le lecteur d'écran.
  deplacement: {
    ouvrir: '<View accessibilityRole="list">',
    element: (nom, index) => [
      `<View accessibilityRole="none" {...${nom}.element(${index})} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>`,
      `<Pressable accessibilityRole="button" accessibilityLabel="Monter" onPress={() => ${nom}.monter(${index})} hitSlop={8}><Text ${style(['texte'])}>↑</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Descendre" onPress={() => ${nom}.descendre(${index})} hitSlop={8}><Text ${style(['texte'])}>↓</Text></Pressable></View>`,
    ],
    fermer: () => ['</View>'],
  },
  annonce: 'accessibilityLiveRegion="polite"',
  listeAOuvrir: true,
};

/** L'ouverture d'un bloc sur le téléphone : une View, ou l'appareil, ou le dégradé. */
function ouvrirBloc(genre: string, options: Option[]): string {
  // Un bloc « sur telephone : » n'est rendu que sur ces appareils (largeur de la fenêtre).
  if (genre === 'appareil') return `<SurAppareil sur={[${options.filter((o) => o.nom === 'sur').map((o) => `'${o.valeur}'`).join(', ')}]}>`;
  const degrade = options.find((o) => o.nom === 'degrade');
  const noms = style([genre, ...stylesDe(options)]);
  if (degrade) {
    const [de, vers, direction] = degrade.valeur.split('-');
    return `<Degrade de="${de}" vers="${vers}" direction="${direction}" ${noms}>`;
  }
  return `<View ${noms}>`;
}

/** Un élément sur le téléphone, sans son animation. */
function elementMobile(el: ElementProduit): string {
  const id = `testID="${el.id}"`;
  const evenements = el.evenements.length ? ' ' + el.evenements.join(' ') : '';
  const options = stylesDe(el.options);
  // Le texte posé sur un fond prend la couleur d'encre de ce fond.
  const encres = el.options.filter((o) => o.nom === 'fond').map((o) => camel(`encre_${o.valeur}`));
  const contenu = ['titre', 'soustitre', 'texte'].includes(el.genre)
    ? el.contenu.replace(/<span className="humalis-accent">/g, '<Text style={s.accent}>').replace(/<code className="humalis-code-ligne">/g, '<Text style={{ fontFamily: "monospace" }}>').replace(/<\/(span|code)>/g, '</Text>')
    : el.contenu;

  switch (el.genre) {
    case 'titre':
    case 'soustitre':
      return `<Text ${id} accessibilityRole="header" ${style([el.niveau === 1 ? 'titre' : 'sousTitre', ...options, ...encres])}${evenements}>${contenu}</Text>`;
    case 'texte':
      return `<Text ${id} ${style(['texte', ...options, ...encres])}${evenements}>${contenu}</Text>`;
    case 'bouton': {
      // Le fond, la bordure et la position vont au bouton ; la couleur et la taille, à son texte.
      const duBouton = el.options.filter((o) => ['fond', 'bordure', 'position'].includes(o.nom)).map(nomStyle);
      // « transition » et « effet » sont sans effet sur le téléphone : aucune référence de style n'est écrite pour eux.
      const duTexte = el.options.filter((o) => !SANS_STYLE.has(o.nom) && !['fond', 'bordure', 'position'].includes(o.nom)).map(nomStyle);
      return `<Pressable ${id} accessibilityRole="button" ${style(['bouton', ...duBouton])}${evenements}><Text ${style(['texteBouton', ...duTexte, ...encres])}>${el.contenu}</Text></Pressable>`;
    }
    case 'lien':
      return `<Link href=${el.versExpression ? `{${el.versExpression}}` : JSON.stringify(el.vers)} ${id} ${style(['lien', ...options])}${evenements}>${el.contenu}</Link>`;
    case 'image': {
      if (el.image) {
        const image = imageMobile(el.image, id, el.options);
        return el.evenements.length ? `<Pressable${evenements}>${image}</Pressable>` : image;
      }
      const image = `<Image ${id} source={{ uri: ${el.source.expression} }}${el.decoratif ? ' accessible={false}' : ` accessibilityLabel=${JSON.stringify(el.source.alt)}`} ${style(['image', ...options])} />`;
      // Une image ne se touche pas : elle est entourée d'un Pressable (décision M7).
      return el.evenements.length ? `<Pressable${evenements}>${image}</Pressable>` : image;
    }
    case 'champ':
      return champMobile(el, id, evenements, options);
  }
}

/** Ce que chaque sorte de champ demande au clavier du téléphone. */
const CLAVIERS: Record<string, string> = {
  texte: '',
  email: ' keyboardType="email-address" autoComplete="email" autoCapitalize="none"',
  telephone: ' keyboardType="phone-pad" autoComplete="tel"',
  nombre: ' keyboardType="numeric"',
  date: ' keyboardType="numbers-and-punctuation"',
  heure: ' keyboardType="numbers-and-punctuation"',
  motDePasse: ' secureTextEntry autoComplete="new-password" autoCapitalize="none"',
  texteLong: ' multiline numberOfLines={4} textAlignVertical="top"',
  adresseWeb: ' keyboardType="url" autoComplete="url" autoCapitalize="none"',
};

/** Sur le téléphone, la date et l'heure se tapent : l'indice montre la forme attendue. */
const INDICES: Record<string, string> = { date: 'AAAA-MM-JJ', heure: 'HH:MM' };

/** Un champ sur le téléphone : TextInput, Switch, boutons radio ou liste qui s'ouvre, selon sa sorte. */
function champMobile(el: ElementProduit, id: string, evenements: string, options: string[]): string {
  const { variable: v, setter, saisie } = el.champ;
  const sorte = saisie?.sorte ?? 'texte';
  const libelleTexte = /^[^{}]+$/.test(el.contenu) ? JSON.stringify(el.contenu) : undefined;
  const accessible = libelleTexte ? ` accessibilityLabel=${libelleTexte}` : '';
  const libelle = `<Text ${style(['texte', ...options])}>${el.contenu}${saisie?.obligatoire ? ' *' : ''}</Text>`;
  // Une valeur possible d'un choix ou d'une liste : un Pressable « radio », coché ou non.
  const option = (choisir: string, contenu: string) =>
    `<Pressable key={option} accessibilityRole="radio" aria-checked={${v} === option} ${style(['option'])} onPress={${choisir}}><Text ${style(['texte'])}>${contenu}</Text></Pressable>`;

  switch (sorte) {
    case 'case':
      return `<View ${style(['case'])}><Switch ${id}${accessible} value={${v}} onValueChange={${setter}}${evenements} />${libelle}</View>`;
    case 'choix':
      return `<View ${id} accessibilityRole="radiogroup"${accessible} ${style(['champ'])}>${libelle}{${el.champ.valeurs}.map((option) => (${option(`() => ${setter}(option)`, `{${v} === option ? '◉' : '○'} {option}`)}))}</View>`;
    case 'liste': {
      // Pas de dépendance : un Pressable ouvre la liste des valeurs, chacune choisie d'un appui.
      const ouvert = el.champ.ouvert!;
      const premiere = saisie?.indiceLangues ? messageEnCode(saisie.indiceLangues, chaine) : chaine(saisie?.indice ?? 'Choisissez…');
      return `<View ${id} ${style(['champ'])}>${libelle}<Pressable accessibilityRole="button"${accessible} aria-expanded={${ouvert.variable}} ${style(['saisie'])} onPress={() => ${ouvert.setter}(!${ouvert.variable})}><Text ${style(['texte'])}>{${v} || ${premiere}} ▾</Text></Pressable>{${ouvert.variable} && ${el.champ.valeurs}.map((option) => (${option(`() => { ${setter}(option); ${ouvert.setter}(false); }`, '{option}')}))}</View>`;
    }
    default: {
      // Le mot de passe est masqué ; l'email ouvre le clavier des adresses. Les champs de
      // « se connecter » gardent leur rôle pour le gestionnaire de mots de passe.
      const genre =
        el.champ.genre === 'motDePasse'
          ? ' secureTextEntry autoComplete="current-password" autoCapitalize="none"'
          : el.champ.genre === 'email'
            ? ' keyboardType="email-address" autoComplete="email" autoCapitalize="none"'
            : CLAVIERS[sorte];
      const texteIndice = saisie?.indice ?? INDICES[sorte];
      // Le texte gris d'un champ vide : du même gris que la bordure, en clair comme en sombre.
      const indice = texteIndice !== undefined ? ` placeholder=${saisie?.indiceLangues ? `{${messageEnCode(saisie.indiceLangues, chaine)}}` : attributTexte(texteIndice)} placeholderTextColor="#8a8a90"` : '';
      const saisieStyle = style(sorte === 'texteLong' ? ['saisie', 'saisieLongue'] : ['saisie']);
      const envoi = el.champ.envoie ? ' returnKeyType="send"' : '';
      return `<View ${style(['champ'])}>${libelle}<TextInput ${id}${accessible}${genre}${indice} ${saisieStyle} value={${v}} onChangeText={${setter}}${envoi}${evenements} /></View>`;
    }
  }
}
