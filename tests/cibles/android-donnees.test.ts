import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { pourLaCible } from '../../src/ri/plateforme.js';
import { genererProjetAndroid } from '../../src/cibles/android/projet.js';
import { VERSIONS } from '../../src/cibles/android/gradle.js';

const CODE = 'app/src/main/java/local/humalis/essai';

const projet = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  const produit = genererProjetAndroid(pourLaCible(application!, 'android'), { nom: 'essai', source: 'essai.humalis' });
  expect(produit.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return produit.fichiers;
};
const kt = (f: Map<string, string>, nom: string) => f.get(`${CODE}/${nom}.kt`)!;

const NOTES = readFileSync('essais/donnees-comptes/notes.humalis', 'utf8');
const SANS_SERVEUR = `donnee locale courses :
    titre : texte

page "accueil" :
    formulaire "ajout" :
        champ "Titre"
        bouton "Ajouter"
    quand le formulaire "ajout" est soumis :
        ajouter fiche avec titre champ "Titre" a courses
    pour chaque c dans courses :
        texte c.titre
`;
const SIMPLE = `page "accueil" :
    titre "Bonjour"
`;

describe('Android — une donnée locale', () => {
  const f = projet(NOTES);
  const base = kt(f, 'DonneesLocales');

  it('reste une liste partagée pour les pages, et sa base est déclarée à la compilation', () => {
    const partage = kt(f, 'Partage');
    expect(partage).toContain('val locale_notes = DonneeLocale(ReglagesLocale("notes", true, listOf("titre", "lu"), "/api/notes", false), ');
    expect(partage).toContain('var notes by locale_notes');
    expect(kt(f, 'PageAccueil')).toContain('Partage.notes = liste(Partage.notes) + listOf(');
    expect(base).toContain('listOf(Partage.locale_notes)');
    expect(base).not.toMatch(/LOCALES_DU_PROJET|CONFIER_AU_SYSTEME|PAQUET|#\{/);
  });

  it('écrit une vraie base : fiches, file, meta, une par compte', () => {
    expect(base).toContain('SQLiteOpenHelper');
    expect(base).toContain('CREATE TABLE fiches (id TEXT PRIMARY KEY NOT NULL, ordre INTEGER NOT NULL, contenu BLOB NOT NULL)');
    expect(base).toContain('CREATE TABLE file (id TEXT PRIMARY KEY NOT NULL, operation TEXT NOT NULL, modifieLe INTEGER NOT NULL, supprime INTEGER NOT NULL, creation INTEGER NOT NULL, contenu BLOB)');
    expect(base).toContain('CREATE TABLE meta');
    expect(base).toContain('reglages.nom + ":" + (voulu ?: "visiteur")');
    expect(base).toContain('db.beginTransaction()');
  });

  it('chiffre chaque contenu en AES-256-GCM, clé non exportable, id en données associées', () => {
    expect(base).toContain('KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")');
    expect(base).toContain('.setKeySize(256)');
    expect(base).toContain('.setBlockModes(KeyProperties.BLOCK_MODE_GCM)');
    expect(base.match(/updateAAD\(id\.toByteArray/g)).toHaveLength(2);
    expect(base).toContain('if (chiffree) contexte.noBackupFilesDir');
    expect(base).not.toMatch(/getEncoded|\.encoded\b/);
  });

  it('une base illisible est mise de côté, jamais détruite', () => {
    expect(base).toContain('fichier.renameTo(File(fichier.path + ".illisible"))');
    expect(base).toContain("elles ont été mises de côté");
  });

  it('la file : une ligne par fiche, et ce qui n\'est jamais parti ne part pas', () => {
    expect(base).toContain('nouvelle || file[id]?.creation == true');
    expect(base).toContain('if (file[id]?.creation == true && id !in enVol)');
    expect(base).toContain('ecritures.envoyees.add(id)');
  });

  it('suit le contrat de synchronisation : envoyer, puis recevoir, une seule à la fois', () => {
    expect(base).toContain('private const val LOT = 100');
    expect(base).toContain('private const val ATTENTE = 400L');
    expect(base).toContain('private const val REPRISE_MINIMUM = 2000L');
    expect(base).toContain('private const val REPRISE_MAXIMUM = 300000L');
    expect(base).toContain('transport.envoyer(route + "/synchro"');
    expect(base).toContain('route + "/synchro?depuis="');
    expect(base).toContain('if (envoyer(cible)) recevoir(cible)');
    expect(base).toContain('enCours?.let');
    expect(base.match(/reponse\.statut == 401 \|\| reponse\.statut == 403/g)).toHaveLength(2);
    expect(base).toContain('if (vrai(champ(reponse.corps, "reinitialiser")))');
    expect(base).toContain('if (file.containsKey(id)) continue');
    expect(base).toContain('if (etat != "applique")');
  });

  it('une réponse d\'un autre compte n\'écrit pas dans la base ouverte depuis', () => {
    expect(base.match(/if \(base !== cible\) return/g)!.length).toBeGreaterThanOrEqual(4);
  });

  it('passe par le renouvellement de session commun, confiné au fil de l\'écran', () => {
    const serveur = kt(f, 'Serveur');
    expect(base).toContain('Serveur.echange(chemin, "POST", corps)');
    expect(serveur).toContain('suspend fun renouveler(): Boolean = withContext(Dispatchers.Main.immediate)');
    expect(kt(f, 'SynchroFond')).toContain('withContext(Dispatchers.Main)');
  });

  it('reprend au retour du réseau, même application fermée', () => {
    const fond = kt(f, 'SynchroFond');
    expect(fond).toContain('setRequiredNetworkType(NetworkType.CONNECTED)');
    expect(fond).toContain('enqueueUniqueWork("humalis-synchro", ExistingWorkPolicy.KEEP, demande)');
    expect(fond).toContain('Result.retry()');
    expect(base).toContain('SynchroFond.planifier(Appli.contexte)');
    expect(base).toContain('registerDefaultNetworkCallback');
    expect(base).toContain('registerActivityLifecycleCallbacks');
    expect(f.get('app/build.gradle.kts')).toContain(`androidx.work:work-runtime-ktx:${VERSIONS.travail}`);
    expect(f.get('app/src/main/AndroidManifest.xml')).toContain('android.permission.ACCESS_NETWORK_STATE');
  });

  it('démarre avec l\'application, et change de base avec le compte', () => {
    expect(kt(f, 'MainActivity')).toContain('DonneesLocales.demarrer()');
    expect(base).toContain('snapshotFlow { Session.pret to Session.compteDeLAppareil }');
    expect(kt(f, 'Serveur')).toContain('Coffre.effacer(CLE_COMPTE)\n        relire()');
  });

  it('sans route : une base pour l\'appareil, ni réseau ni WorkManager', () => {
    const g = projet(SANS_SERVEUR);
    expect(kt(g, 'Partage')).toContain('ReglagesLocale("courses", false, listOf("titre"), null, false)');
    expect(g.has(`${CODE}/SynchroFond.kt`)).toBe(false);
    expect(kt(g, 'DonneesLocales')).not.toContain('SynchroFond');
    expect(g.get('app/build.gradle.kts')).not.toContain('work-runtime');
    expect(g.get('app/src/main/AndroidManifest.xml')).not.toContain('ACCESS_NETWORK_STATE');
  });
});

describe('Android — le code à six chiffres', () => {
  const f = projet(NOTES);
  const double = kt(f, 'DoubleAuthentification');

  it('après le mot de passe, l\'étape « code » ouvre l\'écran, sans session', () => {
    const serveur = kt(f, 'Serveur');
    expect(serveur).toContain('if (texte(champ(donnees, "etape")) == "code")');
    expect(serveur).toContain('if (!demander(texte(champ(donnees, "jeton"))))');
    expect(kt(f, 'MainActivity')).toContain('Session.demanderCode = { demanderCodeDeConnexion(it) }');
    expect(double).toContain('Session.brut("/auth/double/verifier", "POST", fiche("jeton" to jeton, "code" to code.trim()))');
    expect(double).toContain('Session.ouvrir(champ(reponse.second, "data"))');
    expect(double).toContain('Utiliser un code de secours');
  });

  it('l\'activation : mot de passe, QR, clé en texte, confirmation, codes montrés une fois', () => {
    expect(double).toContain('Serveur.echange("/auth/double", "GET")');
    expect(double).toContain('demanderMotDePasse("Confirmez votre mot de passe")');
    expect(double).toContain('Serveur.echange("/auth/double/activer", "POST", preuve)');
    expect(double).toContain('QrHumalis(uri,');
    expect(double).toContain('Clé à saisir à la main : ${secret}');
    expect(double).toContain('"/auth/double/confirmer"');
    expect(double).toContain('"codesSecours"');
    expect(double).toContain('"/auth/double/codes"');
    expect(double).toContain('"/auth/double/desactiver"');
    expect(f.has(`${CODE}/Qr.kt`)).toBe(true);
    expect(f.get('app/build.gradle.kts')).toContain('com.google.zxing:core');
  });

  it('la page appelle l\'action, et la fenêtre est dessinée', () => {
    expect(kt(f, 'PageAccueil')).toContain('if (!Session.gere { activerDoubleAuthentification() }) return');
    expect(kt(f, 'MainActivity')).toMatch(/ConfirmationHumalis\(\)\n\s+FenetreSecuriteHumalis\(\)/);
  });

  it('dans « essayer », un refus passe à la suite du bloc', () => {
    const g = projet(`serveur "carnet" :
    double authentification

page "accueil" :
    bouton "Code"
    quand l'utilisateur clique sur "Code" :
        essayer :
            activer double authentification
        si erreur :
            afficher "non"
`);
    expect(kt(g, 'PageAccueil')).toContain('if (!activerDoubleAuthentification()) return');
  });
});

describe('Android — les clés d\'accès', () => {
  const f = projet(NOTES);
  const cles = kt(f, 'ClesAcces');

  it('passent par Credential Manager', () => {
    expect(cles).toContain('CreatePublicKeyCredentialRequest(versJson(options.second))');
    expect(cles).toContain('GetPublicKeyCredentialOption(versJson(champ(debut.second, "options")))');
    expect(cles).toContain('creee.registrationResponseJson');
    expect(cles).toContain('lue.authenticationResponseJson');
    expect(f.get('app/build.gradle.kts')).toContain(`androidx.credentials:credentials:${VERSIONS.identifiants}`);
    expect(f.get('app/build.gradle.kts')).toContain(`androidx.credentials:credentials-play-services-auth:${VERSIONS.identifiants}`);
  });

  it('envoient l\'origine de l\'application sur les deux « options »', () => {
    expect(cles).toContain('"android:apk-key-hash:" + Base64.encodeToString(empreinte, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)');
    expect(cles.match(/x-humalis-origine/g)).toHaveLength(2);
    expect(cles).toContain('"/auth/cle-acces/inscription/options"');
    expect(cles).toContain('"/auth/cle-acces/connexion/options"');
  });

  it('demandent le mot de passe si le serveur l\'exige, et disent chaque refus', () => {
    expect(cles).toContain('options.first == 403 && vrai(champ(options.second, "motDePasseRequis"))');
    expect(cles).toContain("La création de la clé d'accès a été annulée.");
    expect(cles).toContain("Cet appareil a déjà une clé d'accès pour ce compte.");
    expect(cles).toContain("Cet appareil ne gère pas les clés d'accès.");
    expect(cles).toContain('Build.VERSION.SDK_INT < 28');
  });

  it('les pages appellent les deux actions', () => {
    const page = kt(f, 'PageAccueil');
    expect(page).toContain('if (!Session.gere { seConnecterParCle() }) return');
    expect(page).toContain('if (!Session.gere { ajouterCleAcces() }) return');
  });
});

describe('Android — sans ces fonctions, rien de plus dans le projet', () => {
  const f = projet(SIMPLE);

  it('ni fichier ni dépendance', () => {
    for (const nom of ['DonneesLocales', 'SynchroFond', 'FenetresSecurite', 'DoubleAuthentification', 'ClesAcces']) expect(f.has(`${CODE}/${nom}.kt`), nom).toBe(false);
    expect(f.get('app/build.gradle.kts')).not.toMatch(/androidx\.credentials|work-runtime|zxing/);
    expect(kt(f, 'MainActivity')).not.toMatch(/DonneesLocales|FenetreSecuriteHumalis|demanderCode/);
  });

  it('un compte qui demande le code sans que l\'application le sache est dit clairement', () => {
    expect(kt(f, 'Serveur')).toContain('que cette application ne sait pas saisir');
  });
});
