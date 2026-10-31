import { describe, it, expect } from 'vitest';
import { stripTypeScriptTypes } from 'node:module';
import { compiler } from '../src/compilateur.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { verifierFichiersPourLeMobile } from '../src/cibles/mobile/fichiers.js';
import { verifierNavigationPourLaCible, verifierSourcesPourLaCible } from '../src/cibles/sources.js';
import { programme, erreurs } from './analyse/aide.js';

// Le programme de tests/profil.test.ts, avec l'aperçu de la photo choisie : il passe maintenant sur le mobile.
const source = () =>
  programme(
    'serveur "boutique" :',
    '>donnee profil :',
    '>>nom : texte',
    '>>photo : image',
    '>route "profils" :',
    '>>seul admin peut lire profil',
    '>>seul admin peut creer profil',
    '>>seul admin peut modifier profil',
    '',
    'page "profil" :',
    '>variable photo = rien',
    '>variable nom = "Rey"',
    '>fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo',
    '>image photo.apercu avec description "Aperçu de la photo choisie" et proportions 1 sur 1',
    '>bouton "Enregistrer la photo"',
    '>quand l\'utilisateur clique sur "Enregistrer la photo" :',
    '>>envoyer requete vers "profils" avec nom et photo',
    '>formulaire "secret" :',
    '>>champ mot de passe "Mot de passe actuel" avec obligatoire',
    '>>champ mot de passe "Nouveau mot de passe" avec obligatoire',
    '>>bouton "Changer le mot de passe"',
    '>quand le formulaire "secret" est soumis :',
    '>>essayer :',
    '>>>changer le mot de passe avec champ "Mot de passe actuel" et champ "Nouveau mot de passe"',
    '>>>afficher reussite "Mot de passe changé"',
    '>>si erreur :',
    '>>>afficher erreur "{raison}"',
  );

const application = (texte: string) => {
  const { application, diagnostics } = compiler(texte);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const mobile = (texte: string) => genererProjetMobile(application(texte), { nom: 'profil', source: 'profil.humalis' });

describe('mobile : la photo de profil', () => {
  it('le programme du profil n’est plus refusé sur le mobile', () => {
    expect(erreurs(source())).toEqual([]);
    const app = application(source());
    expect([...verifierSourcesPourLaCible(app, 'mobile'), ...verifierNavigationPourLaCible(app, 'mobile'), ...verifierFichiersPourLeMobile(app)]).toEqual([]);
  });

  it('la page choisit la photo, l’affiche et l’envoie avec la requête', () => {
    const page = mobile(source()).get('app/index.tsx')!;
    expect(page).toContain("import ChoixFichier from '../humalis/choix-fichier';");
    expect(page).toContain(
      "<ChoixFichier libelle={'Choisir une photo'} valeur={photo} onChange={setPhoto} familles={[{ nom: 'images', mime: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'] }]} maximum={5242880} apercu={true} />",
    );
    expect(page).toContain('source={{ uri: photo?.apercu }}');
    expect(page).toContain("await serveur.envoyer('/api/profils', { nom, photo });");
  });

  it('le choix ouvre la galerie et rend la même fiche que le web (nom, taille, type, apercu)', () => {
    const choix = mobile(source()).get('humalis/choix-fichier.tsx')!;
    expect(choix).toContain("import * as ImagePicker from 'expo-image-picker';");
    expect(choix).not.toContain('expo-document-picker');
    expect(choix).toContain('ImagePicker.launchImageLibraryAsync({ mediaTypes: types, allowsMultipleSelection: plusieurs, quality: 1 })');
    expect(choix).toContain("gardes.push({ nom: lu.nom, taille: lu.taille ?? 0, type: famille ? MOTS[famille.nom]");
    expect(choix).toContain('est trop gros');
    expect(choix).toContain('accessibilityLabel={libelle}');
  });

  it('le serveur réduit l’image (480 px, JPEG en data URL) avant l’envoi et la modification', () => {
    const serveur = mobile(source()).get('humalis/serveur.ts')!;
    expect(serveur).toContain("import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';");
    expect(serveur).toContain('contexte.resize(largeur >= hauteur ? { width: 480 } : { height: 480 })');
    expect(serveur).toContain("'data:image/jpeg;base64,'");
    expect(serveur).toContain('texte.length > 90_000');
    expect(serveur.match(/body: JSON\.stringify\(await preparer\(donnees\)\)/g)).toHaveLength(2);
  });

  it('les dépendances et la phrase de la galerie vont dans le projet', () => {
    const fichiers = mobile(source());
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.dependencies['expo-image-picker']).toBe('57.0.20');
    expect(paquet.dependencies['expo-image-manipulator']).toBe('57.0.21');
    expect(paquet.dependencies['expo-document-picker']).toBeUndefined();
    const plugins = JSON.parse(fichiers.get('app.json')!).expo.plugins;
    expect(plugins).toContainEqual(['expo-image-picker', expect.objectContaining({ cameraPermission: false, microphonePermission: false })]);
  });

  it('« modifier … avec photo = photo » passe aussi par la réduction', () => {
    const avecModification = source()
      .replace('    variable photo = rien', '    variable photo = rien\n    variable profils = []')
      .replace(
        '    formulaire "secret" :',
        '    quand la page se charge :\n        envoyer requete vers "profils" dans profils\n    pour chaque p dans profils :\n        bouton "Changer"\n        quand l\'utilisateur clique sur "Changer" :\n            modifier p dans "profils" avec photo = photo\n    formulaire "secret" :',
      );
    const fichiers = mobile(avecModification);
    expect(fichiers.get('app/index.tsx')).toContain("await serveur.modifier('/api/profils', p.id, { photo });");
    expect(fichiers.get('humalis/serveur.ts')).toContain('modifier: async (adresse: string');
  });

  it('« avec icone "photo" » : l’icône seule, le libellé pour le lecteur d’écran', () => {
    const fichiers = mobile(source().replace('accepte images avec maximum 5 Mo', 'accepte images avec maximum 5 Mo et icone "photo"'));
    const page = fichiers.get('app/index.tsx')!;
    expect(page).toContain('apercu={true} icone={CameraIcon} />');
    expect(page).toContain("import { CameraIcon } from 'lucide-react-native';");
    expect(fichiers.get('humalis/choix-fichier.tsx')).toContain('{Dessin ? <Dessin size={20} color={couleurs.encre} /> : <Text style={s.texteBouton}>{libelle}</Text>}');
  });

  it('un PDF passe par le sélecteur de fichiers, sans galerie ni réduction', () => {
    const fichiers = mobile(programme('page "p" :', '>variable doc = rien', '>fichier "Choisir un PDF" dans doc accepte pdf', '>si doc est different de rien :', '>>texte "{doc.nom}"'));
    const choix = fichiers.get('humalis/choix-fichier.tsx')!;
    expect(choix).toContain("import * as DocumentPicker from 'expo-document-picker';");
    expect(choix).toContain("DocumentPicker.getDocumentAsync({ type: mime.length > 0 ? mime : '*/*', multiple: plusieurs, copyToCacheDirectory: true })");
    expect(choix).not.toContain('expo-image-picker');
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.dependencies['expo-document-picker']).toBe('57.0.3');
    expect(paquet.dependencies['expo-image-picker']).toBeUndefined();
    expect(paquet.dependencies['expo-image-manipulator']).toBeUndefined();
    expect(JSON.stringify(JSON.parse(fichiers.get('app.json')!).expo.plugins)).not.toContain('expo-image-picker');
  });
});

describe('mobile : la réduction produite, exécutée', () => {
  /** reduireImage et preparer, tirés de humalis/serveur.ts, avec un faux expo-image-manipulator. */
  async function chargerPreparer(longueur: (qualite: number) => number) {
    const serveur = mobile(source()).get('humalis/serveur.ts')!;
    const debut = serveur.indexOf('/** Un fichier choisi dans la page');
    const fin = serveur.indexOf('/**\n * Les requêtes');
    const code = stripTypeScriptTypes(serveur.slice(debut, fin));
    const journal: unknown[] = [];
    const ImageManipulator = {
      manipulate: (uri: string) => {
        journal.push(['manipuler', uri]);
        const contexte = {
          resize: (taille: unknown) => (journal.push(['redimensionner', taille]), contexte),
          renderAsync: async () => ({
            width: 4000,
            height: 3000,
            release: () => undefined,
            saveAsync: async (options: { compress: number; base64: boolean; format: string }) => {
              journal.push(['enregistrer', options.format, options.compress]);
              return { base64: 'A'.repeat(longueur(options.compress)) };
            },
          }),
          release: () => undefined,
        };
        return contexte;
      },
    };
    // Le faux est lu à chaque appel : le module importé est gardé en cache d'un essai à l'autre.
    const module = `const ImageManipulator = { manipulate: (uri) => globalThis.__manipulateur.manipulate(uri) }; const SaveFormat = { JPEG: 'jpeg' };\n${code}\nexport { preparer };`;
    (globalThis as { __manipulateur?: unknown }).__manipulateur = ImageManipulator;
    const { preparer } = await import(`data:text/javascript;base64,${Buffer.from(module).toString('base64')}`);
    return { preparer: preparer as (d: Record<string, unknown>) => Promise<Record<string, unknown>>, journal };
  }

  const photo = { nom: 'rey.heic', taille: 3_000_000, type: 'image', apercu: 'file:///rey.heic', brut: { uri: 'file:///rey.heic', mime: 'image/heic', largeur: 4000, hauteur: 3000 } };

  it('une photo devient une data URL JPEG de 480 px de côté ; le reste part tel quel', async () => {
    const { preparer, journal } = await chargerPreparer(() => 50_000);
    const pret = await preparer({ nom: 'Rey', photo });
    expect(pret.nom).toBe('Rey');
    expect(pret.photo).toBe('data:image/jpeg;base64,' + 'A'.repeat(50_000));
    expect(journal).toEqual([['manipuler', 'file:///rey.heic'], ['redimensionner', { width: 480 }], ['enregistrer', 'jpeg', 0.85]]);
  });

  it('la qualité baisse jusqu’à tenir dans 90 000 caractères', async () => {
    const { preparer, journal } = await chargerPreparer((q) => (q > 0.6 ? 120_000 : 60_000));
    const pret = await preparer({ photo: { ...photo, brut: { ...photo.brut, largeur: 1000, hauteur: 2000 } } });
    expect(String(pret.photo).length).toBeLessThanOrEqual(90_000);
    expect(journal.filter((e) => (e as unknown[])[0] === 'enregistrer')).toHaveLength(3);
    expect(journal).toContainEqual(['redimensionner', { height: 480 }]);
  });

  it('un fichier qui n’est pas une image n’est pas réduit', async () => {
    const { preparer, journal } = await chargerPreparer(() => 10);
    const doc = { ...photo, brut: { uri: 'file:///a.pdf', mime: 'application/pdf', largeur: 0, hauteur: 0 } };
    expect((await preparer({ doc })).doc).toBe(doc);
    expect(journal).toEqual([]);
  });
});
