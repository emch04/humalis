// Écrit, dans la page Exemples du site (site-public/pages/exemples.humalis), la section des
// applications complètes : le code de chaque fichier de exemples/applications/, recopié tel quel,
// avec son titre, sa description et les cibles où il marche. Les fichiers restent la seule source :
// on les modifie, puis on relance
//   npm run site:exemples
// tests/exemples-site.test.ts compile chaque application, sur chaque cible annoncée, et vérifie que
// la page est à jour. Avec --verifier, rien n'est écrit.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const PAGE = 'site-public/pages/exemples.humalis';
const DEBUT = '    # --- Les applications complètes : écrit par scripts/exemples-site.mjs, ne pas modifier à la main. ---';
const FIN = '    # --- Fin des applications complètes. ---';

/** Les cibles, avec leur nom affiché. */
export const NOMS_CIBLES = {
  web: ['Web', 'Web'],
  desktop: ['Bureau', 'Desktop'],
  apple: ['iPhone, iPad, Mac', 'iPhone, iPad, Mac'],
  android: ['Android', 'Android'],
  windows: ['Windows', 'Windows'],
};

/** Chaque application : son fichier, ce qu'elle montre, et les cibles où elle se construit. */
export const APPLICATIONS = [
  {
    fichier: 'support',
    titre: ['Un support client en direct', 'Live customer support'],
    texte: ['Les clients écrivent aux agents, voient qui est en ligne et passent un appel vidéo.', 'Customers write to agents, see who is online and start a video call.'],
    themes: [['Discussion', 'Chat'], ['Appel vidéo', 'Video call'], ['Présence', 'Presence']],
    cibles: ['web', 'desktop', 'apple', 'android', 'windows'],
  },
  {
    fichier: 'classe',
    titre: ['Une classe en ligne', 'An online class'],
    texte: ['Le professeur anime la réunion, les élèves lèvent la main et partagent leur écran.', 'The teacher runs the meeting, students raise their hand and share their screen.'],
    themes: [['Réunion', 'Meeting'], ['Modération', 'Moderation'], ['Partage d’écran', 'Screen sharing']],
    cibles: ['web', 'desktop', 'apple', 'android', 'windows'],
  },
  {
    fichier: 'carnet',
    titre: ['Un carnet qui marche sans réseau', 'A notebook that works offline'],
    texte: ['Les notes sont chiffrées sur l’appareil et partent au serveur quand le réseau revient. Connexion par Face ID, Touch ID ou Windows Hello.', 'Notes are encrypted on the device and reach the server when the network comes back. Sign in with Face ID, Touch ID or Windows Hello.'],
    themes: [['Hors ligne', 'Offline'], ['Chiffrement', 'Encryption'], ['Clés d’accès', 'Passkeys']],
    cibles: ['web', 'apple', 'android', 'windows'],
  },
  {
    fichier: 'reservations',
    titre: ['Des réservations payées en ligne', 'Bookings paid online'],
    texte: ['Chacun voit ses réservations et les paie par Stripe. Le serveur n’enregistre le paiement que lorsque Stripe le confirme.', 'Everyone sees their bookings and pays with Stripe. The server records the payment only once Stripe confirms it.'],
    themes: [['Comptes', 'Accounts'], ['Droits', 'Permissions'], ['Paiement', 'Payment']],
    cibles: ['web', 'desktop', 'apple', 'android'],
  },
  {
    fichier: 'terrain',
    titre: ['Un rapport de terrain', 'A field report'],
    texte: ['Une photo recadrée, un mémo vocal, un document scanné, un widget sur l’écran d’accueil, et chaque erreur envoyée à ta surveillance.', 'A cropped photo, a voice memo, a scanned document, a home screen widget, and every error sent to your monitoring.'],
    themes: [['Médias', 'Media'], ['Widget', 'Widget'], ['Erreurs', 'Errors']],
    cibles: ['apple', 'android'],
  },
];

/** Un texte Humalis entre guillemets : \" pour un guillemet. */
const guillemets = (texte) => `"${texte.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const deuxLangues = ([fr, en]) => (fr === en ? `${guillemets(fr)} sans traduction` : `${guillemets(fr)} en anglais ${guillemets(en)}`);

export const lireApplication = (fichier) => readFileSync(new URL(`../exemples/applications/${fichier}.humalis`, import.meta.url), 'utf8');

function section() {
  const l = [DEBUT];
  l.push('    bloc avec style "install-section" :');
  l.push('        colonne avec style "section-heading" :');
  l.push(`            soustitre ${deuxLangues(['Des applications complètes.', 'Complete apps.'])}`);
  l.push(`            texte ${deuxLangues(['Serveur, comptes, temps réel, médias, données hors ligne : de vraies applications en quelques dizaines de lignes.', 'Server, accounts, real time, media, offline data: real apps in a few dozen lines.'])}`);
  l.push('        colonne avec style "applis-liste" et animation montee au defilement et en cascade :');
  for (const a of APPLICATIONS) {
    l.push('            bloc avec style "appli-carte" :');
    l.push('                colonne avec style "appli-tete" :');
    l.push(`                    texte ${guillemets(`${a.fichier}.humalis`)} sans traduction avec style "vignette-fichier"`);
    l.push(`                    soustitre ${deuxLangues(a.titre)} avec niveau 3`);
    l.push(`                    texte ${deuxLangues(a.texte)}`);
    l.push('                    ligne avec style "exemple-tags" :');
    for (const t of a.themes) l.push(`                        texte ${deuxLangues(t)} avec style "tag"`);
    l.push('                    ligne avec style "appli-cibles" :');
    for (const c of a.cibles) l.push(`                        texte ${deuxLangues(NOMS_CIBLES[c])} avec style "tag tag-cible"`);
    l.push('                code humalis :');
    for (const ligne of lireApplication(a.fichier).replace(/\n+$/, '').split('\n')) l.push(ligne === '' ? '' : `                    ${ligne}`);
  }
  l.push(FIN);
  return l.join('\n');
}

export function produirePage() {
  const page = readFileSync(`${racine}${PAGE}`, 'utf8');
  const nouvelle = section();
  if (page.includes(DEBUT)) {
    const debut = page.indexOf(DEBUT);
    const fin = page.indexOf(FIN) + FIN.length;
    return page.slice(0, debut) + nouvelle + page.slice(fin);
  }
  // La première fois : juste avant l'appel final de la page.
  const appel = page.lastIndexOf('    bloc avec style "install-section" :\n        bloc avec style "call-panel"');
  if (appel < 0) throw new Error('La page Exemples n’a plus son appel final : où mettre les applications ?');
  return `${page.slice(0, appel)}${nouvelle}\n${page.slice(appel)}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], 'file://'))) {
  const page = produirePage();
  if (process.argv.includes('--verifier')) {
    if (readFileSync(`${racine}${PAGE}`, 'utf8') !== page) {
      console.error(`${PAGE} n’est plus à jour : lancez « npm run site:exemples ».`);
      process.exit(1);
    }
    console.log(`${PAGE} : à jour.`);
  } else {
    writeFileSync(`${racine}${PAGE}`, page);
    console.log(`${PAGE} : écrite.`);
  }
}
