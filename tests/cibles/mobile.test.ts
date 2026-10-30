import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { genererProjetMobile, verifierPourLeMobile, VERSIONS_MOBILE, MARQUE_MOBILE } from '../../src/cibles/mobile/projet.js';
import { programme } from '../analyse/aide.js';

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const projet = (source: string) => genererProjetMobile(compile(source), { nom: 'essai', source: 'essai.humalis' });
const exemple = (nom: string) => projet(readFileSync(`exemples/${nom}.humalis`, 'utf8'));

describe('cible mobile — le projet Expo', () => {
  const fichiers = exemple('boutique');

  it('produit un projet expo-router complet', () => {
    for (const f of [
      MARQUE_MOBILE,
      'package.json',
      'app.json',
      'tsconfig.json',
      'LISEZMOI.md',
      'app/_layout.tsx',
      'app/index.tsx',
      'app/panier.tsx',
      'app/+not-found.tsx',
      'humalis/messages.tsx',
      'humalis/page.ts',
      'humalis/styles.ts',
      'humalis/partage.tsx',
      'humalis/outils.ts',
    ]) {
      expect(fichiers.has(f), f).toBe(true);
    }
  });

  it('épingle les versions d’Expo 57', () => {
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.main).toBe('expo-router/entry');
    expect(paquet.dependencies.expo).toBe(VERSIONS_MOBILE.expo);
    expect(paquet.dependencies.expo).toBe('57.0.29');
    expect(paquet.dependencies['react-native']).toBe('0.86.3');
    expect(paquet.dependencies['expo-router']).toBe('57.0.27');
    for (const version of [...Object.values(paquet.dependencies), ...Object.values(paquet.devDependencies)]) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('place les pages à la même adresse que sur le web', () => {
    expect(fichiers.get('app/index.tsx')).toContain('export default function Boutique()');
    expect(fichiers.get('app/panier.tsx')).toContain('export default function Panier()');
  });

  it('entoure les pages des messages et des variables partagées', () => {
    const disposition = fichiers.get('app/_layout.tsx')!;
    expect(disposition).toContain("import { Stack } from 'expo-router';");
    expect(disposition).toContain('<Messages>');
    expect(disposition).toContain('<Partage>');
    expect(disposition).toContain('<Stack');
  });
});

describe('cible mobile — les pages', () => {
  const fichiers = exemple('boutique');
  const boutique = fichiers.get('app/index.tsx')!;
  const panier = fichiers.get('app/panier.tsx')!;

  it('garde la même logique que le web', () => {
    expect(boutique).toContain("const [produits, setProduits] = useState<string[]>(['Livre', 'Stylo', 'Cahier']);");
    expect(boutique).toContain('const { panier, setPanier } = usePartage();');
    expect(boutique).toContain('const nombreArticles = panier.length;');
    expect(boutique).toContain('function quandCliqueAjouter(nom: string) {');
    expect(boutique).toContain('setPanier([...panier, nom]);');
    expect(boutique).toContain("usePage('Nos produits', 'Nos produits');");
  });

  it('traduit chaque élément en composant React Native', () => {
    expect(boutique).toContain("import { Pressable, ScrollView, Text } from 'react-native';");
    expect(boutique).toContain('<ScrollView contentContainerStyle={s.page}>');
    expect(boutique).toContain(
      '<Text testID="titre_nos_produits" accessibilityRole="header" style={[s.titre, s.couleurBleu, s.tailleGrande]}>Nos produits</Text>',
    );
    expect(boutique).toContain('<Text testID="texte_ligne_10" style={s.texte}>{nom}</Text>');
    expect(boutique).toContain(
      '<Pressable testID="bouton_ajouter" accessibilityRole="button" style={[s.bouton, s.fondVert]} onPress={() => quandCliqueAjouter(nom)}><Text style={[s.texteBouton, s.encreVert]}>Ajouter</Text></Pressable>',
    );
    expect(boutique).not.toMatch(/<(p|button|main|div)\b/);
    expect(boutique).not.toContain('className');
    expect(boutique).not.toContain('onClick');
  });

  it('navigue avec expo-router', () => {
    expect(boutique).toContain("import { useRouter } from 'expo-router';");
    expect(boutique).toContain('const routeur = useRouter();');
    expect(boutique).toContain("routeur.push('/panier');");
    expect(panier).toContain("import { Link } from 'expo-router';");
    expect(panier).toContain('<Link href="/" testID="lien_retour_a_la_boutique" style={s.lien}>Retour à la boutique</Link>');
  });

  it('lit les styles de la page selon le thème du téléphone', () => {
    expect(boutique).toContain("import { useStyles } from '../humalis/styles';");
    expect(boutique).toContain('const s = useStyles();');
    const styles = fichiers.get('humalis/styles.ts')!;
    expect(styles).toContain('useColorScheme');
    expect(styles).toContain("couleurBleu: { color: '#1f5fbf' }");
    expect(styles).toContain("fondVert: { backgroundColor: '#2e7d32', borderColor: 'transparent' }");
    expect(styles).toContain("encreVert: { color: '#ffffff' }");
    expect(styles).toContain('tailleGrande: { fontSize: 32 }');
    expect(styles).toContain("positionCentree: { textAlign: 'center', alignSelf: 'center' }");
    expect(styles).toContain('bordureArrondie: { borderRadius: 999 }');
  });

  it('relie un champ à son état avec onChangeText', () => {
    const connexion = exemple('connexion').get('app/index.tsx')!;
    expect(connexion).toContain("const [champEmail, setChampEmail] = useState('');");
    expect(connexion).toContain(
      '<View style={s.champ}><Text style={s.texte}>email</Text><TextInput testID="champ_email" accessibilityLabel="email" style={s.saisie} value={champEmail} onChangeText={setChampEmail} /></View>',
    );
    expect(connexion).toContain("afficherMessage('Email requis', 'erreur');");
    expect(connexion).toContain('onPress={quandCliqueSeConnecter}');
  });

  it('montre une image, et l’entoure d’un Pressable si on la touche', () => {
    const fichiers = projet(
      programme(
        'page "galerie" :',
        '>image "https://exemple.cd/chat.png" avec nom "chat" et description "Un chat"',
        '>quand l\'utilisateur clique sur "chat" :',
        '>>afficher "Miaou"',
      ),
    );
    const galerie = fichiers.get('app/index.tsx')!;
    expect(galerie).toMatch(/<Pressable onPress=\{quandClique\w+\}><Image testID="\w+" source=\{\{ uri: 'https:\/\/exemple\.cd\/chat\.png' \}\} accessibilityLabel="Un chat" style=\{s\.image\} \/><\/Pressable>/);
  });

  it('ignore le survol, qui n’existe pas sur un téléphone', () => {
    const page = projet(
      programme('page "accueil" :', '>bouton "Aide"', '>quand l\'utilisateur survole "Aide" :', '>>afficher "Cliquez"'),
    ).get('app/index.tsx')!;
    expect(page).not.toContain('onMouseEnter');
    expect(page).not.toContain('quandSurvoleAide');
  });
});

describe('cible mobile — mémoire, coffre et serveur', () => {
  it('garde une variable memorisee avec AsyncStorage', () => {
    const fichiers = projet(programme('page "accueil" :', '>variable clics = 0 avec memorisee', '>texte "{clics}"'));
    expect(fichiers.get('app/index.tsx')).toContain("useMemorise(");
    const memoire = fichiers.get('humalis/memoire.ts')!;
    expect(memoire).toContain("import AsyncStorage from '@react-native-async-storage/async-storage';");
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['@react-native-async-storage/async-storage']).toBe('2.2.0');
  });

  it('garde un secret dans le coffre du téléphone', () => {
    const application = compile(programme('page "accueil" :', '>variable jeton = "" avec memorisee en secret', '>texte "ok"'));
    expect(verifierPourLeMobile(application).filter((d) => d.gravite === 'erreur')).toEqual([]);
    const fichiers = genererProjetMobile(application, { nom: 'essai', source: 'essai.humalis' });
    expect(fichiers.get('humalis/memoire.ts')).toContain("import * as SecureStore from 'expo-secure-store';");
    expect(fichiers.get('app/index.tsx')).toContain('useMemoriseSecret(');
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['expo-secure-store']).toBe('57.0.4');
  });

  it('appelle le serveur à EXPO_PUBLIC_HUMALIS_SERVEUR, avec le jeton Bearer des packs', () => {
    const fichiers = exemple('boutique-complete');
    const serveur = fichiers.get('humalis/serveur.ts')!;
    expect(serveur).toContain('process.env.EXPO_PUBLIC_HUMALIS_SERVEUR');
    expect(serveur).toContain("entetes.set('Authorization', `Bearer ${jeton}`);");
    expect(serveur).toContain("entetes.set('x-csrf-token'");
    expect(fichiers.get('humalis/donnees.ts')).toContain('export interface Produit {');
  });
});

describe('cible mobile — ce qui ne passe pas sur un téléphone', () => {
  const messages = (source: string) => verifierPourLeMobile(compile(source)).map((d) => `${d.gravite} ${d.ligne} : ${d.message}`);

  it('prévient que le CSS ne s’applique pas', () => {
    const avertis = messages(programme('style :', '>.doux { color: gray; }', '', 'page "accueil" :', '>texte "Bonjour" avec style "doux"'));
    expect(avertis.some((m) => m.startsWith('avertissement') && m.includes("le CSS ne s'applique pas sur le mobile"))).toBe(true);
  });

  it('prévient que le survol est ignoré', () => {
    const avertis = messages(
      programme('page "accueil" :', '>bouton "Aide"', '>quand l\'utilisateur survole "Aide" :', '>>afficher "Cliquez"'),
    );
    expect(avertis).toContain("avertissement 3 : sur un téléphone, il n'y a pas de souris : « survole » est ignoré sur le mobile.");
  });

  it('ne connaît pas de survol, de CSS ni de secret à signaler dans la boutique', () => {
    expect(messages(readFileSync('exemples/boutique.humalis', 'utf8'))).toEqual([]);
  });
});

describe('cible mobile — la connexion (décision L5)', () => {
  const fichiers = exemple('avis');
  const page = fichiers.get('app/index.tsx')!;

  it('range le jeton des packs dans le coffre et le présente en Bearer', () => {
    const session = fichiers.get('humalis/session.tsx')!;
    expect(session).toContain("fetch(BASE + '/auth/login'");
    expect(session).toContain('SecureStore.setItemAsync(CLE_JETON, corps.data.token)');
    expect(session).toContain('SecureStore.deleteItemAsync(CLE_JETON)');
    expect(session).toContain("'Email ou mot de passe incorrect.'");
    expect(fichiers.get('app/_layout.tsx')).toContain('<Session>');
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['expo-secure-store']).toBe('57.0.4');
  });

  it('masque le mot de passe et lit la session dans la page', () => {
    expect(page).toContain('secureTextEntry autoComplete="current-password"');
    expect(page).toContain('keyboardType="email-address"');
    expect(page).toContain('const utilisateur = useUtilisateur();');
    expect(page).toContain("import { useUtilisateur } from '../humalis/session';");
  });
});
