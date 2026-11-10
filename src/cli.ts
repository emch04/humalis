#!/usr/bin/env node
import { mediasLocaux, type InfoMedia } from './ri/medias.js';
import { dimensionsImage } from './image/entete.js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { compilerProjet, situer } from './fichiers.js';
import type { Diagnostic } from './analyse/erreurs.js';
import { appliquerExigence, resumerQualite } from './analyse/diagnosticsQualite.js';
import { prevenirDesTuiles } from './analyse/carte.js';
import { cheminsDesPages, genererProjetWeb, genererComposantsWeb, verifierPourLeWeb, adressesDeRequetes, MARQUE } from './cibles/web/projet.js';
import { genererProjetServeur, MARQUE_SERVEUR } from './cibles/serveur/projet.js';
import { verifierSourcesPourLaCible, verifierNavigationPourLaCible, verifierFichiersPourLaCible, verifierNomsPourLeWeb, verifierAdresseParLangue } from './cibles/sources.js';
import { genererProjetMobile, verifierPourLeMobile, verifierModulesPourLeMobile, MARQUE_MOBILE } from './cibles/mobile/projet.js';
import { verifierFichiersPourLeMobile } from './cibles/mobile/fichiers.js';
import { genererProjetMoteur, verifierPourLeMoteur, MARQUE_MOTEUR } from './cibles/moteur/projet.js';
import { lecturesPermises, lireLesDonnees, type ReglageLecture } from './cibles/moteur/lecture-construction.js';
import { genererProjetStatique, verifierPourLeStatique, MARQUE_STATIQUE } from './cibles/statique/projet.js';
import { genererProjetDesktop, bureauSurLeMoteur, MARQUE_DESKTOP, SERVEUR_PAR_DEFAUT } from './cibles/desktop/projet.js';
import { genererProjetApple, MARQUE_APPLE } from './cibles/apple/projet.js';
import { genererProjetAndroid, identifiantDe, MARQUE_ANDROID } from './cibles/android/projet.js';
import { lireFirebase, type Firebase } from './cibles/android/comptes.js';
import { genererProjetWindows, MARQUE_WINDOWS } from './cibles/windows/projet.js';
import { verifierAppareilPourLaCible } from './cibles/appareil.js';
import { verifierFormesPourLaCible } from './cibles/formes.js';
import { verifierFormesBureau } from './cibles/desktop/formes.js';
import { pourLaCible } from './ri/plateforme.js';
import { gestionnairesDuProgramme, contientAction } from './cibles/web/interactions.js';
import type { Application } from './ri/types.js';
import { etatDesPacks, verifierProjet, ErreurPackageJson } from './packs.js';
import { creerProjet } from './outils/nouveau.js';
import { formaterSource } from './outils/formatage.js';
import { developper, trouverPrincipal } from './outils/developpement.js';
import { lancer } from './machine/lancer.js';
import { extraitDeCode } from './outils/extrait.js';
import { ecrireSiChange, retirerAnciensProduits } from './outils/ecriture.js';
import { testerProjet } from './outils/tests.js';
import { reponseSimple } from './outils/version.js';

const AIDE = `Utilisation :
  humalis --version
  humalis nouveau <nom>
  humalis formater <fichier.humalis> [--verifier]
  humalis developper [<fichier.humalis>] [--port <nombre>]
  humalis lancer [<fichier.humalis>] [--port <nombre>] [--ouvrir]
  humalis tester [<dossier-ou-fichier.test.humalis>] [--detail]
  humalis verifier <fichier.humalis> [--exigeant] [--ri]
  humalis compile <fichier.humalis> --cible web --sortie <dossier> [--adresse https://…] [--exigeant]
  humalis compile <fichier.humalis> --cible web --composants <dossier>
  humalis compile <fichier.humalis> --cible mobile --sortie <dossier>
  humalis compile <fichier.humalis> --cible desktop --sortie <dossier> [--serveur https://…]
  humalis compile <fichier.humalis> --cible apple --sortie <dossier> [--serveur https://…] [--identifiant com.exemple.app] [--equipe ABCDE12345]
  humalis compile <fichier.humalis> --cible android --sortie <dossier> [--serveur https://…] [--identifiant com.exemple.app] [--empreinte AA:BB:…] [--firebase google-services.json]
  humalis compile <fichier.humalis> --cible windows --sortie <dossier> [--serveur https://…] [--identifiant dev.exemple.app]
  humalis compile <fichier.humalis> --cible serveur --sortie <dossier>
  humalis compile <fichier.humalis> --cible web [--moteur humalis|react] --sortie <dossier> [--adresse https://…] [--lire-serveur https://…]
  humalis compile <fichier.humalis> --cible statique --sortie <dossier> [--adresse https://…]
  humalis packs [--verifier <dossier>]

lancer    fait tourner un fichier tout de suite, sans projet produit, sans
          npm install et sans construction : le programme est compilé en
          mémoire, son bloc « serveur » tourne aussi en mémoire (données,
          droits, comptes d'essai), et la page change à chaque
          enregistrement en gardant l'état des variables quand c'est
          possible. Les e-mails et notifications sont gardés dans le panneau
          /__machine au lieu de partir ; paiement, PDF et IA ne sont pas
          simulés (la commande le dit au démarrage). Rien n'est écrit sur
          le disque. Pour un vrai projet avec npm, voir developper.
verifier  affiche les erreurs et les avertissements avec leur ligne. Avec
          --ri, affiche aussi la représentation intermédiaire (pour qui
          travaille sur le compilateur).
compile   produit un projet complet pour la cible choisie : web (Vite + React
          prérendu), mobile (Expo, iPhone et Android), desktop (Electron, Mac,
          Windows et Linux), apple (SwiftUI natif, iPhone, iPad et Mac), windows (C# et WPF natif,
          Windows 10 et 11), serveur (Node + packs Astratra) ou statique (HTML,
          CSS, JavaScript, sans construction).
          Avec --composants, seulement les pages web et leurs outils, à
          déposer dans un projet React existant.
packs     compare les packs Astratra du compilateur à leur dernière version
          sur npm. Avec --verifier, dit si un projet déjà produit est en retard.`;

/** Les fichiers du projet compilé, pour situer les diagnostics des cibles (« panier.humalis, ligne 6 »). */
let fichiersDuProjet: string[] = [];

function afficherDiagnostics(diagnostics: Diagnostic[]): void {
  for (const brut of diagnostics) {
    const d = situer(brut, fichiersDuProjet);
    const genre = d.gravite === 'erreur' ? 'Erreur' : 'Avertissement';
    const ou = d.fichier === undefined ? '' : `${d.fichier}, `;
    console.error(`${genre}, ${ou}ligne ${d.ligne} : ${d.message}`);
    // Une erreur montre le code en cause ; les avertissements restent sur une ligne.
    if (d.gravite === 'erreur') {
      const extrait = extraitDuFichier(d.fichier, d.ligne, d.message);
      if (extrait) console.error(`${extrait}\n`);
    }
  }
}

let cheminPrincipal: string | undefined;

function extraitDuFichier(fichier: string | undefined, ligne: number, message: string): string | undefined {
  if (cheminPrincipal === undefined) return undefined;
  try {
    return extraitDeCode(readFileSync(fichier === undefined ? cheminPrincipal : join(dirname(cheminPrincipal), fichier), 'utf8'), ligne, message);
  } catch {
    return undefined;
  }
}

/** « ligne 3 », ou « pages/panier.humalis, ligne 3 » pour une ligne d'un fichier utilisé. */
function position(ligne: number): string {
  const d = situer({ gravite: 'erreur', message: '', ligne }, fichiersDuProjet);
  return d.fichier === undefined ? `ligne ${d.ligne}` : `${d.fichier}, ligne ${d.ligne}`;
}

/** Compile le fichier et ceux qu'il utilise (« utiliser fichier "…" »), lus sur le disque. */
function compilerLeFichier(chemin: string, source: string) {
  cheminPrincipal = chemin;
  const resultat = compilerProjet(chemin, (autre) => {
    try {
      return statSync(autre).isFile() ? readFileSync(autre, 'utf8') : undefined;
    } catch {
      return undefined;
    }
  }, source);
  fichiersDuProjet = resultat.fichiers ?? [];
  return resultat;
}

function lire(chemin: string): string | undefined {
  try {
    return readFileSync(chemin, 'utf8');
  } catch {
    console.error(`Impossible de lire le fichier « ${chemin} ».`);
    return undefined;
  }
}

/** Lit « --nom valeur » dans les arguments. */
function option(arguments_: string[], nom: string): string | undefined {
  const position = arguments_.indexOf(`--${nom}`);
  return position === -1 ? undefined : arguments_[position + 1];
}

function compile(arguments_: string[]): number | Promise<number> {
  const [chemin] = arguments_;
  const cible = option(arguments_, 'cible');
  const composants = option(arguments_, 'composants');
  const sortie = composants ?? option(arguments_, 'sortie');
  if (!chemin || !sortie) {
    console.error(AIDE);
    return 2;
  }
  if (cible !== 'web' && cible !== 'mobile' && cible !== 'desktop' && cible !== 'apple' && cible !== 'android' && cible !== 'windows' && cible !== 'serveur' && cible !== 'statique') {
    console.error(
      cible === undefined
        ? 'Précisez la cible avec --cible web, --cible mobile, --cible desktop, --cible apple, --cible android, --cible windows, --cible serveur ou --cible statique.'
        : `La cible « ${cible} » n'existe pas encore. Cibles disponibles : web, mobile, desktop, apple, android, windows, serveur, statique.`,
    );
    return 2;
  }

  const source = lire(chemin);
  if (source === undefined) return 2;

  const resultat = compilerLeFichier(chemin, source);
  const application = resultat.application ? pourLaCible(resultat.application, cible) : undefined;
  const diagnostics = appliquerExigence(resultat.diagnostics, arguments_.includes('--exigeant'));
  afficherDiagnostics(diagnostics);
  const resume = resumerQualite(diagnostics);
  if (resume) console.error(resume);
  if (!application || diagnostics.some((d) => d.gravite === 'erreur')) {
    console.error('\nLe programme a des erreurs : rien n\'a été écrit.');
    return 1;
  }

  // « avec animation » et « en direct » n'existent que sur le web : dit plutôt que perdu en silence.
  const programme = JSON.stringify(application.ecrans);
  if (programme.includes('"animation":true') && cible !== 'web' && cible !== 'serveur' && cible !== 'apple' && cible !== 'android') {
    console.error('Avertissement : « avec animation » n\'a d\'effet que sur le web : ici, les lignes changent sans glisser.');
  }
  if (programme.includes('"direct":true') && cible !== 'web' && cible !== 'serveur' && cible !== 'apple' && cible !== 'android') {
    console.error('Avertissement : « en direct » n\'a d\'effet que sur le web : ici, la liste est lue une fois.');
  }

  // Les tuiles d'une carte viennent d'un fournisseur qui reçoit l'adresse IP des visiteurs : dit une fois.
  if (cible === 'web' || cible === 'statique' || cible === 'desktop' || cible === 'android' || cible === 'windows') afficherDiagnostics(prevenirDesTuiles(application));

  // Les formes d'application spéciales (widget, tuile, clavier…) : refusées là où elles ne sont pas encore écrites.
  const formes = verifierFormesPourLaCible(application, cible);
  if (formes.length > 0) afficherDiagnostics(formes);
  if (formes.some((d) => d.gravite === 'erreur')) {
    console.error('\nLe programme ne peut pas être produit pour cette cible : rien n\'a été écrit.');
    return 1;
  }

  if (cible !== 'apple' && cible !== 'serveur') {
    const appareil = verifierAppareilPourLaCible(application, cible);
    if (appareil.length > 0) afficherDiagnostics(appareil);
    if (appareil.some((d) => d.gravite === 'erreur')) {
      console.error('\nLe programme ne peut pas être produit pour cette cible : rien n\'a été écrit.');
      return 1;
    }
  }

  if (cible === 'serveur') return compileServeur(application, chemin, sortie);
  if (cible === 'mobile') return compileMobile(application, chemin, sortie);
  if (cible === 'statique') return compileStatique(application, chemin, sortie, option(arguments_, 'adresse'));
  if (cible === 'desktop') return compileDesktop(application, chemin, sortie, option(arguments_, 'serveur'), option(arguments_, 'moteur') ?? moteurDuProjet(chemin));
  if (cible === 'apple') return compileApple(application, chemin, sortie, arguments_);
  if (cible === 'android') return compileAndroid(application, chemin, sortie, arguments_);
  if (cible === 'windows') return compileWindows(application, chemin, sortie, arguments_);

  // Ce que la cible web ne sait pas faire (« memorisee en secret »).
  const pourLeWeb = verifierPourLeWeb(application);
  if (pourLeWeb.length > 0) {
    afficherDiagnostics(pourLeWeb);
    console.error('\nLe programme ne peut pas être produit pour le web : rien n\'a été écrit.');
    return 1;
  }

  // Le moteur de Humalis est le défaut : le site sans React. « --moteur react » garde React.
  const demande = option(arguments_, 'moteur') ?? moteurDuProjet(chemin);
  if (demande !== undefined && demande !== 'humalis' && demande !== 'react') {
    console.error(`Le moteur « ${demande} » n'existe pas. Moteurs disponibles : humalis (par défaut), react.`);
    return 2;
  }
  let moteur = demande;
  if (moteur === undefined) {
    const refusMoteur = verifierPourLeMoteur(application).filter((d) => d.gravite === 'erreur');
    if (composants !== undefined) moteur = 'react';
    else if (existsSync(join(sortie, MARQUE))) {
      // Un dossier déjà produit avec React le reste : rien n'est mélangé.
      moteur = 'react';
      console.error(`Note : « ${sortie} » a été produit avec React ; il le reste. Pour passer au moteur Humalis, videz le dossier ou écrivez --moteur humalis dans un dossier neuf.`);
    } else if (refusMoteur.length > 0) {
      moteur = 'react';
      console.error(`Note : ce programme utilise ce que le moteur Humalis ne sait pas encore faire ; il est produit avec React.\n${refusMoteur.map((d) => `  - ${d.message}`).join('\n')}`);
    } else moteur = 'humalis';
  }
  // « --composants » écrit des composants React pour un projet React : le moteur n'a pas de sens ici.
  if (moteur === 'humalis' && composants === undefined) return compileMoteur(application, chemin, sortie, option(arguments_, 'adresse'), option(arguments_, 'diagnostics-port'), option(arguments_, 'lire-serveur'));

  // Ne jamais écraser un travail fait à la main : un dossier non vide doit
  // porter la marque d'un projet produit par Humalis.
  if (existsSync(sortie) && readdirSync(sortie).length > 0 && !existsSync(join(sortie, MARQUE))) {
    console.error(
      `Le dossier « ${sortie} » n'est pas vide et n'a pas été produit par Humalis : rien n'a été écrit. Choisissez un dossier vide.`,
    );
    return 1;
  }

  // --adresse remplace celle du bloc « site » (on prévisualise sans écrire l'adresse de production).
  let adresse = option(arguments_, 'adresse') ?? application.site?.adresse;
  if (adresse === undefined && composants === undefined) {
    adresse = 'http://localhost';
    console.error('Avertissement : sans --adresse, le prérendu et le plan du site utilisent http://localhost.');
  }

  // Les fichiers de « utiliser style "…" », cherchés à côté du fichier Humalis.
  const fichiersStyle = lireFichiersStyle(application, chemin);
  if (!fichiersStyle) return 1;

  const nomsPris = verifierNomsPourLeWeb(application);
  if (nomsPris.length > 0) {
    afficherDiagnostics(nomsPris);
    console.error('\nLe programme a des erreurs : rien n\'a été écrit.');
    return 1;
  }
  const composantsReact = lireComposantsReact(application, chemin);
  if (!composantsReact) return 1;

  const nom = basename(chemin).replace(/\.humalis$/, '');
  const polices = lirePolices(application, chemin);
  if (!polices) return 1;
  const images = lireImagesDuSite(application, chemin);
  if (!images) return 1;
  const medias = lireMedias(application, chemin);
  if (!medias) return 1;
  // --diagnostics-port n'est passé que par « humalis developper » : le mode développement, où chaque
  // élément porte son fichier et sa ligne Humalis (data-humalis-source). Jamais dans une compilation normale.
  const portDiagnostics = option(arguments_, 'diagnostics-port');
  const optionsWeb = {
    nom, adresse: adresse ?? 'http://localhost', source: basename(chemin), fichiersStyle, composantsReact, polices, images, medias,
    ...(portDiagnostics !== undefined ? { sources: fichiersDuProjet } : {}),
  };
  const fichiers = composants
    ? genererComposantsWeb(application, optionsWeb)
    : genererProjetWeb(application, optionsWeb);
  if (portDiagnostics !== undefined && fichiers.has('index.html')) {
    const index = fichiers.get('index.html')!;
    fichiers.set('index.html', index.replace('</body>', `<script type="module" src="http://localhost:${portDiagnostics}/diagnostics.js"></script></body>`));
  }
  ecrire(sortie, fichiers);

  if (composants) {
    console.error(`Pages React écrites dans « ${sortie} » (${fichiers.size} fichiers). Mode d'emploi : ${join(sortie, 'LISEZMOI.md')}`);
  } else {
    console.error(`Projet web écrit dans « ${sortie} » (${fichiers.size} fichiers).`);
    console.error(`Pour le lancer : cd ${sortie} && npm install && npm run dev`);
  }
  return 0;
}

/** Un dossier non vide doit porter la marque d'un projet produit par Humalis. */
function dossierLibre(sortie: string, marque: string): boolean {
  if (existsSync(sortie) && readdirSync(sortie).length > 0 && !existsSync(join(sortie, marque))) {
    console.error(
      `Le dossier « ${sortie} » n'est pas vide et n'a pas été produit par Humalis : rien n'a été écrit. Choisissez un dossier vide.`,
    );
    return false;
  }
  return true;
}

function ecrire(sortie: string, fichiers: Map<string, string>): void {
  const dependances = (): string => {
    try {
      const { dependencies, devDependencies } = JSON.parse(readFileSync(join(sortie, 'package.json'), 'utf8'));
      return JSON.stringify({ dependencies, devDependencies });
    } catch {
      return '';
    }
  };
  const avant = dependances();
  for (const [relatif, contenu] of fichiers) ecrireSiChange(join(sortie, relatif), contenu);
  retirerAnciensProduits(sortie, fichiers);
  if (avant && avant !== dependances() && existsSync(join(sortie, 'node_modules'))) {
    console.error('Les dépendances ont changé : relancez npm install dans ce dossier.');
  }
}

/** Les fichiers de « utiliser style "…" », cherchés à côté du fichier Humalis ; undefined si l'un manque (le message est affiché). */
function lireFichiersStyle(application: Application, chemin: string): Map<string, string> | undefined {
  const fichiersStyle = new Map<string, string>();
  for (const style of application.fichiersStyle) {
    try {
      fichiersStyle.set(style.chemin, readFileSync(join(dirname(chemin), style.chemin), 'utf8'));
    } catch {
      console.error(`Erreur, ${position(style.ligne)} : le fichier de style « ${style.chemin} » est introuvable (il est cherché à côté de ${basename(chemin)}).`);
      return undefined;
    }
  }
  return fichiersStyle;
}

/**
 * Les images locales des pages (décision M5), cherchées à côté du fichier Humalis : leur taille,
 * leurs dimensions (lues à la main) et leurs octets, recopiés dans le projet produit.
 */
function lireMedias(application: Application, chemin: string): Map<string, InfoMedia> | undefined {
  const medias = new Map<string, InfoMedia>();
  for (const media of mediasLocaux(application)) {
    let octets: Buffer;
    try {
      octets = readFileSync(join(dirname(chemin), media.chemin));
    } catch {
      const quoi = media.genre === 'audio' ? 'le son' : media.genre === 'video' ? 'la vidéo' : "l'image";
      console.error(`Erreur, ${position(media.ligne)} : ${quoi} « ${media.chemin} » est introuvable (${media.genre === 'audio' ? 'il est cherché' : 'elle est cherchée'} à côté de ${basename(chemin)}).`);
      return undefined;
    }
    if (media.genre === 'audio' && octets.length > 10 * 1024 * 1024) {
      console.error(`Avertissement, ${position(media.ligne)} : le son « ${media.chemin} » pèse ${Math.round(octets.length / (1024 * 1024))} Mo : c'est lourd à télécharger, surtout sur un téléphone.`);
    }
    if (media.genre === 'video' && octets.length > 50 * 1024 * 1024) {
      console.error(`Avertissement, ${position(media.ligne)} : la vidéo « ${media.chemin} » pèse ${Math.round(octets.length / (1024 * 1024))} Mo : c'est lourd à télécharger, surtout sur un téléphone. Une adresse vers un service vidéo peut convenir mieux.`);
    }
    const dimensions = media.genre === 'image' ? dimensionsImage(octets) : undefined;
    medias.set(media.chemin, { octets: octets.length, genre: media.genre, ...(dimensions ? { largeur: dimensions.largeur, hauteur: dimensions.hauteur } : {}), contenu: octets.toString('base64') });
  }
  return medias;
}

/**
 * Le logo et l'image de partage du bloc « site », cherchés à côté du fichier Humalis, en base 64.
 * Leurs dimensions sont lues dans l'en-tête (à la main) pour prévenir d'un aperçu pauvre.
 */
function lireImagesDuSite(application: Application, chemin: string): Map<string, string> | undefined {
  const images = new Map<string, string>();
  const site = application.site;
  if (!site) return images;
  for (const [role, fichier] of [['logo', site.logo], ['image', site.image]] as const) {
    if (!fichier || /^https?:\/\//.test(fichier)) continue;
    let octets: Buffer;
    try {
      octets = readFileSync(join(dirname(chemin), fichier));
    } catch {
      console.error(`Erreur, ${position(site.ligne)} : le fichier « ${fichier} » (${role} du bloc « site ») est introuvable (il est cherché à côté de ${basename(chemin)}).`);
      return undefined;
    }
    images.set(fichier, octets.toString('base64'));
    const dimensions = dimensionsImage(octets);
    if (role === 'logo' && dimensions && (dimensions.largeur !== dimensions.hauteur || dimensions.largeur < 512)) {
      console.error(`Avertissement : le logo « ${fichier} » fait ${dimensions.largeur}×${dimensions.hauteur} : une icône nette demande un carré de 512×512 au moins.`);
    }
    if (role === 'image' && dimensions && (dimensions.largeur < 600 || dimensions.hauteur < 315)) {
      console.error(`Avertissement : l'image de partage « ${fichier} » fait ${dimensions.largeur}×${dimensions.hauteur} : les réseaux sociaux la montrent mal en dessous de 600×315 (1200×630 conseillé).`);
    }
    if (octets.length > 5 * 1024 * 1024) console.error(`Avertissement : « ${fichier} » pèse plus de 5 Mo : les aperçus de partage risquent de l'ignorer.`);
  }
  return images;
}

/** Les fichiers de police du thème (police … depuis "…"), cherchés à côté du fichier Humalis, en base 64. */
function lirePolices(application: Application, chemin: string): Map<string, string> | undefined {
  const polices = new Map<string, string>();
  for (const police of application.theme?.polices ?? []) {
    if (!police.fichier) continue;
    try {
      polices.set(police.fichier, readFileSync(join(dirname(chemin), police.fichier)).toString('base64'));
    } catch {
      console.error(`Erreur : le fichier de police « ${police.fichier} » est introuvable (il est cherché à côté de ${basename(chemin)}).`);
      return undefined;
    }
  }
  return polices;
}

/**
 * Les fichiers React de « utiliser composant … depuis "…" », cherchés à côté
 * du fichier Humalis, avec ou sans leur extension.
 */
function lireComposantsReact(application: Application, chemin: string, extensions = ['', '.tsx', '.ts', '.jsx', '.js']): Map<string, { nom: string; contenu: string }> | undefined {
  const composantsReact = new Map<string, { nom: string; contenu: string }>();
  for (const composant of application.composantsReact) {
    if (composant.chemin === undefined) continue; // sans fichier pour le web : refusé avant
    const base = join(dirname(chemin), composant.chemin);
    const trouve = extensions.map((ext) => base + ext).find((c) => existsSync(c) && !statSync(c).isDirectory());
    if (!trouve) {
      console.error(
        `Erreur, ${position(composant.ligne)} : le fichier du composant « ${composant.nom} » est introuvable (${composant.chemin}, cherché à côté de ${basename(chemin)}, avec ou sans .tsx, .ts, .jsx, .js).`,
      );
      return undefined;
    }
    composantsReact.set(composant.chemin, { nom: basename(trouve), contenu: readFileSync(trouve, 'utf8') });
  }
  return composantsReact;
}

function compileMobile(application: Application, chemin: string, sortie: string): number {
  if (application.ecrans.length === 0) {
    console.error(`Le fichier ${basename(chemin)} ne contient aucune page : rien n'a été écrit.`);
    return 1;
  }
  // Ce qui n'existe pas sur un téléphone (CSS, survol…) : signalé, sans bloquer.
  afficherDiagnostics(verifierPourLeMobile(application));
  const sansSources = [...verifierModulesPourLeMobile(application), ...verifierSourcesPourLaCible(application, 'mobile'), ...verifierNavigationPourLaCible(application, 'mobile'), ...verifierFichiersPourLeMobile(application)];
  if (sansSources.length > 0) {
    afficherDiagnostics(sansSources);
    console.error('\nLe programme ne peut pas être produit pour le mobile : rien n\'a été écrit.');
    return 1;
  }
  if (!dossierLibre(sortie, MARQUE_MOBILE)) return 1;
  const composantsReact = lireComposantsReact(application, chemin);
  if (!composantsReact) return 1;
  const nom = basename(chemin).replace(/\.humalis$/, '');
  const images = lireImagesDuSite(application, chemin);
  if (!images) return 1;
  const medias = lireMedias(application, chemin);
  if (!medias) return 1;
  const fichiers = genererProjetMobile(application, { nom, source: basename(chemin), composantsReact, images, medias });
  ecrire(sortie, fichiers);
  console.error(`Projet mobile (Expo) écrit dans « ${sortie} » (${fichiers.size} fichiers).`);
  console.error(`Pour le lancer : cd ${sortie} && npm install && npx expo start (voir LISEZMOI.md)`);
  return 0;
}

function compileDesktop(application: Application, chemin: string, sortie: string, serveur: string | undefined, moteurDemande?: string): number {
  if (application.ecrans.length === 0) {
    console.error(`Le fichier ${basename(chemin)} ne contient aucune page : rien n'a été écrit.`);
    return 1;
  }
  if (serveur !== undefined && !/^https?:\/\/[^/\s]+/.test(serveur)) {
    console.error(`L'adresse du serveur « ${serveur} » doit commencer par http:// ou https:// (par exemple --serveur https://mon-serveur.cd).`);
    return 2;
  }
  if (!dossierLibre(sortie, MARQUE_DESKTOP)) return 1;
  // L'application est une origine sûre (humalis://) : le moteur bloque une adresse http:// (sauf sur cet ordinateur).
  const enClair = [...application.ecrans, ...application.composants]
    .flatMap((e) => adressesDeRequetes(e))
    .filter((a) => /^http:\/\//i.test(a) && !/^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(a));
  for (const adresse of new Set(enClair)) {
    console.error(`Avertissement : l'application de bureau ne peut pas appeler « ${adresse} » : une adresse http:// est bloquée par Electron. Utilisez https://.`);
  }
  // Electron n'a pas de feuille de partage du système : « partager » copie le lien.
  const partage = gestionnairesDuProgramme(application).find((g) => contientAction(g.actions, (a) => a.type === 'partage'));
  if (partage) {
    console.error(`Avertissement (ligne ${partage.ligne}) : sur l'application de bureau, « partager » copie le lien (ou le texte) et le dit : Electron n'a pas de feuille de partage.`);
  }
  // Les fichiers de « utiliser style "…" », cherchés à côté du fichier Humalis.
  const fichiersStyle = lireFichiersStyle(application, chemin);
  if (!fichiersStyle) return 1;
  const nomsPris = verifierNomsPourLeWeb(application);
  if (nomsPris.length > 0) {
    afficherDiagnostics(nomsPris);
    console.error('\nLe programme a des erreurs : rien n\'a été écrit.');
    return 1;
  }
  const composantsReact = lireComposantsReact(application, chemin);
  if (!composantsReact) return 1;
  const nom = basename(chemin).replace(/\.humalis$/, '');
  const polices = lirePolices(application, chemin);
  if (!polices) return 1;
  const images = lireImagesDuSite(application, chemin);
  if (!images) return 1;
  const medias = lireMedias(application, chemin);
  if (!medias) return 1;
  // Le moteur Humalis est le défaut : l'application de bureau sans React. « --moteur react » garde React.
  const options = { nom, source: basename(chemin), fichiersStyle, composantsReact, serveur, polices, images, medias, moteur: moteurDemande === 'react' ? ('react' as const) : ('humalis' as const) };
  const surLeMoteur = bureauSurLeMoteur(application, options);
  // Les formes spéciales : la limite du Finder, et ce qui demande le moteur Humalis.
  const formesBureau = verifierFormesBureau(application, surLeMoteur);
  if (formesBureau.length > 0) afficherDiagnostics(formesBureau);
  if (formesBureau.some((d) => d.gravite === 'erreur')) {
    console.error('\nLe programme ne peut pas être produit pour cette cible : rien n\'a été écrit.');
    return 1;
  }
  if (!surLeMoteur && moteurDemande !== 'react') console.error('Note : ce programme emploie ce que le moteur Humalis ne sait pas encore faire (un composant React, « memorisee en secret »…) : l\'application de bureau est produite avec React.');
  const fichiers = genererProjetDesktop(application, options);
  ecrire(sortie, fichiers);
  console.error(`Projet desktop (Electron) écrit dans « ${sortie} » avec ${surLeMoteur ? 'le moteur Humalis' : 'React'} (${fichiers.size} fichiers).`);
  // Les requêtes passent par le relais du processus principal (décision D5).
  const pages = [...fichiers].filter(([f]) => f.startsWith('src/pages/') || f.startsWith('src/composants/'));
  if (pages.some(([, code]) => /\buse(Serveur|Utilisateur)\(\)/.test(code))) {
    console.error(`Les requêtes vers le serveur partent de l'application vers ${serveur ?? SERVEUR_PAR_DEFAUT} ; HUMALIS_SERVEUR la remplace au lancement.`);
  }
  console.error(`Pour la lancer : cd ${sortie} && npm install && npm start (voir LISEZMOI.md)`);
  return 0;
}

/** « "moteur": "humalis" » dans le humalis.projet.json à côté du fichier. */
/** « lireServeur » et « lireSources » du humalis.projet.json, ou --lire-serveur : rien par défaut. */
function reglageDeLecture(chemin: string, adresse: string | undefined): ReglageLecture | undefined {
  let lu: { lireServeur?: unknown; lireSources?: unknown } = {};
  try {
    lu = JSON.parse(readFileSync(join(dirname(chemin), 'humalis.projet.json'), 'utf8')) as typeof lu;
  } catch {
    // Pas de projet : seule la commande peut le demander.
  }
  const serveur = adresse ?? (typeof lu.lireServeur === 'string' ? lu.lireServeur : undefined);
  const sources = Array.isArray(lu.lireSources) ? lu.lireSources.filter((s): s is string => typeof s === 'string') : [];
  return serveur !== undefined || sources.length > 0 ? { ...(serveur !== undefined ? { adresse: serveur } : {}), sources } : undefined;
}

function moteurDuProjet(chemin: string): string | undefined {
  try {
    const manifeste = JSON.parse(readFileSync(join(dirname(chemin), 'humalis.projet.json'), 'utf8')) as { moteur?: unknown };
    return typeof manifeste.moteur === 'string' ? manifeste.moteur : undefined;
  } catch {
    return undefined;
  }
}

async function compileMoteur(application: Application, chemin: string, sortie: string, adresse?: string, portDiagnostics?: string, lireServeur?: string): Promise<number> {
  if (application.ecrans.length === 0) {
    console.error(`Le fichier ${basename(chemin)} ne contient aucune page : rien n'a été écrit.`);
    return 1;
  }
  const refus = verifierPourLeMoteur(application);
  afficherDiagnostics(refus);
  if (refus.some((d) => d.gravite === 'erreur')) {
    console.error('\nLe programme ne peut pas encore être produit avec le moteur Humalis : rien n\'a été écrit.');
    return 1;
  }
  if (!dossierLibre(sortie, MARQUE_MOTEUR)) return 1;
  const fichiersStyle = lireFichiersStyle(application, chemin);
  if (!fichiersStyle) return 1;
  const externes = lireComposantsReact(application, chemin, ['', '.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte']);
  if (!externes) return 1;
  const polices = lirePolices(application, chemin);
  if (!polices) return 1;
  const images = lireImagesDuSite(application, chemin);
  if (!images) return 1;
  const medias = lireMedias(application, chemin);
  if (!medias) return 1;
  const nom = basename(chemin).replace(/\.humalis$/, '');
  // Lire le serveur à la construction : seulement si le projet le demande, jamais en développement.
  let donnees: Map<string, unknown> | undefined;
  const reglage = portDiagnostics === undefined ? reglageDeLecture(chemin, lireServeur) : undefined;
  if (reglage) {
    const { lectures, refus } = lecturesPermises(application, reglage);
    for (const raison of refus) console.error(`Avertissement : ${raison}`);
    const lu = await lireLesDonnees(lectures);
    for (const raison of lu.avertissements) console.error(`Avertissement : ${raison}`);
    donnees = lu.donnees;
    console.error(`Lu à la construction : ${donnees.size} sur ${lectures.length}.`);
  }
  const fichiers = genererProjetMoteur(application, { nom, source: basename(chemin), fichiersStyle, polices, images, medias, externes, ...(adresse ?? application.site?.adresse ? { adresse: adresse ?? application.site?.adresse } : {}), ...(portDiagnostics !== undefined ? { sources: fichiersDuProjet } : {}), ...(donnees ? { donnees } : {}) });
  // « humalis developper » : l'aide au survol et le panneau des erreurs, dans chaque page.
  if (portDiagnostics !== undefined) {
    for (const [nom, contenu] of fichiers) {
      if (nom.endsWith('.html')) fichiers.set(nom, contenu.replace('</body>', `<script type="module" src="http://localhost:${portDiagnostics}/diagnostics.js"></script></body>`));
    }
  }
  ecrire(sortie, fichiers);
  console.error(`Site écrit dans « ${sortie} » avec le moteur Humalis (${fichiers.size} fichiers).`);
  console.error(`Pour le lancer : cd ${sortie} && npm install && npm run dev`);
  return 0;
}

function compileApple(application: Application, chemin: string, sortie: string, arguments_: string[]): number {
  if (application.ecrans.length === 0) {
    console.error(`Le fichier ${basename(chemin)} ne contient aucune page : rien n'a été écrit.`);
    return 1;
  }
  const serveur = option(arguments_, 'serveur');
  if (serveur !== undefined && !/^https?:\/\/[^/\s]+/.test(serveur)) {
    console.error(`L'adresse du serveur « ${serveur} » doit commencer par http:// ou https:// (par exemple --serveur https://mon-serveur.fr).`);
    return 2;
  }
  if (!dossierLibre(sortie, MARQUE_APPLE)) return 1;
  const nom = basename(chemin).replace(/\.humalis$/, '');
  const styles = lireFichiersStyle(application, chemin);
  if (!styles) return 1;
  const images = lireImagesDuSite(application, chemin);
  if (!images) return 1;
  const medias = lireMedias(application, chemin);
  if (!medias) return 1;
  const natifs = new Map<string, { nom: string; contenu: string }>();
  for (const c of application.composantsReact) {
    if (c.apple === undefined) continue;
    const fichier = join(dirname(chemin), c.apple);
    if (!existsSync(fichier) || statSync(fichier).isDirectory()) {
      console.error(`Erreur, ${position(c.ligne)} : le fichier Swift du composant « ${c.nom} » est introuvable (${c.apple}, cherché à côté de ${basename(chemin)}).`);
      return 1;
    }
    natifs.set(c.nom, { nom: basename(fichier), contenu: readFileSync(fichier, 'utf8') });
  }
  const polices = lirePolices(application, chemin);
  if (!polices) return 1;
  const identifiant = option(arguments_, 'identifiant');
  const equipe = option(arguments_, 'equipe');
  // « --essais-ui » : un test XCUITest ajouté au projet, pour l'essai de bout en bout (scripts/essai-apple-parcours.mjs).
  const essaisUi = option(arguments_, 'essais-ui');
  const { fichiers, diagnostics } = genererProjetApple(application, { nom, source: basename(chemin), fichiersStyle: styles, images, medias, natifs, polices, ...(essaisUi ? { essaisUi: readFileSync(essaisUi, 'utf8') } : {}), ...(serveur ? { serveur } : {}), ...(identifiant ? { identifiant } : {}), ...(equipe ? { equipe } : {}) });
  afficherDiagnostics(diagnostics);
  if (diagnostics.some((d) => d.gravite === 'erreur')) {
    console.error('\nLe programme ne peut pas être produit pour Apple : rien n\'a été écrit.');
    return 1;
  }
  ecrire(sortie, fichiers);
  console.error(`Projet Apple (SwiftUI) écrit dans « ${sortie} » (${fichiers.size} fichiers).`);
  console.error(`Pour le lancer : ouvrez le fichier .xcodeproj dans Xcode (voir LISEZMOI.md).`);
  return 0;
}

/** Les vues écrites à la main pour une plateforme (« sur windows "Carte.cs" »), cherchées à côté du fichier Humalis. */
function lireNatifs(application: Application, chemin: string, plateforme: 'apple' | 'android' | 'windows', langue: string): Map<string, { nom: string; contenu: string }> | undefined {
  const natifs = new Map<string, { nom: string; contenu: string }>();
  for (const c of application.composantsReact) {
    const relatif = c[plateforme];
    if (relatif === undefined) continue;
    const fichier = join(dirname(chemin), relatif);
    if (!existsSync(fichier) || statSync(fichier).isDirectory()) {
      console.error(`Erreur, ${position(c.ligne)} : le fichier ${langue} du composant « ${c.nom} » est introuvable (${relatif}, cherché à côté de ${basename(chemin)}).`);
      return undefined;
    }
    natifs.set(c.nom, { nom: basename(fichier), contenu: readFileSync(fichier, 'utf8') });
  }
  return natifs;
}

function compileWindows(application: Application, chemin: string, sortie: string, arguments_: string[]): number {
  if (application.ecrans.length === 0) {
    console.error(`Le fichier ${basename(chemin)} ne contient aucune page : rien n'a été écrit.`);
    return 1;
  }
  const serveur = option(arguments_, 'serveur');
  if (serveur !== undefined && !/^https?:\/\/[^/\s]+/.test(serveur)) {
    console.error(`L'adresse du serveur « ${serveur} » doit commencer par http:// ou https:// (par exemple --serveur https://mon-serveur.fr).`);
    return 2;
  }
  if (!dossierLibre(sortie, MARQUE_WINDOWS)) return 1;
  const nom = basename(chemin).replace(/\.humalis$/, '');
  const fichiersStyle = lireFichiersStyle(application, chemin);
  if (!fichiersStyle) return 1;
  const medias = lireMedias(application, chemin);
  if (!medias) return 1;
  const natifs = lireNatifs(application, chemin, 'windows', 'C#');
  if (!natifs) return 1;
  const identifiant = option(arguments_, 'identifiant');
  const { fichiers, diagnostics } = genererProjetWindows(application, { nom, source: basename(chemin), fichiersStyle, medias, natifs, ...(serveur ? { serveur } : {}), ...(identifiant ? { identifiant } : {}) });
  afficherDiagnostics(diagnostics);
  if (diagnostics.some((d) => d.gravite === 'erreur')) {
    console.error('\nLe programme ne peut pas être produit pour Windows : rien n\'a été écrit.');
    return 1;
  }
  ecrire(sortie, fichiers);
  console.error(`Projet Windows (C# et WPF) écrit dans « ${sortie} » (${fichiers.size} fichiers).`);
  console.error('Pour le construire : dotnet build, puis dotnet publish -c Release -r win-x64 pour un seul fichier .exe (voir LISEZMOI.md).');
  return 0;
}

function compileAndroid(application: Application, chemin: string, sortie: string, arguments_: string[]): number {
  if (application.ecrans.length === 0) {
    console.error(`Le fichier ${basename(chemin)} ne contient aucune page : rien n'a été écrit.`);
    return 1;
  }
  const serveur = option(arguments_, 'serveur');
  if (serveur !== undefined && !/^https?:\/\/[^/\s]+/.test(serveur)) {
    console.error(`L'adresse du serveur « ${serveur} » doit commencer par http:// ou https:// (par exemple --serveur https://mon-serveur.fr).`);
    return 2;
  }
  if (!dossierLibre(sortie, MARQUE_ANDROID)) return 1;
  const nom = basename(chemin).replace(/\.humalis$/, '');
  const images = lireImagesDuSite(application, chemin);
  if (!images) return 1;
  const medias = lireMedias(application, chemin);
  if (!medias) return 1;
  const fichiersStyle = lireFichiersStyle(application, chemin);
  if (!fichiersStyle) return 1;
  const polices = lirePolices(application, chemin);
  if (!polices) return 1;
  const identifiant = option(arguments_, 'identifiant');
  const empreinte = option(arguments_, 'empreinte');
  // --firebase google-services.json : les identifiants publics du projet Firebase, pour les notifications.
  const cheminFirebase = option(arguments_, 'firebase');
  let firebase: Firebase | undefined;
  if (cheminFirebase !== undefined) {
    if (!existsSync(cheminFirebase)) {
      console.error(`Le fichier « ${cheminFirebase} » est introuvable : donnez le google-services.json téléchargé depuis la console Firebase.`);
      return 2;
    }
    firebase = lireFirebase(readFileSync(cheminFirebase, 'utf8'), identifiantDe(nom, identifiant));
    if (!firebase) {
      console.error(`« ${cheminFirebase} » ne contient pas d'application Android « ${identifiantDe(nom, identifiant)} » : ajoutez-la dans la console Firebase, ou compilez avec le bon --identifiant.`);
      return 2;
    }
  }
  const natifs = lireNatifs(application, chemin, 'android', 'Kotlin');
  if (!natifs) return 1;
  const { fichiers, diagnostics } = genererProjetAndroid(application, { natifs, nom, source: basename(chemin), images, medias, fichiersStyle, polices, ...(empreinte ? { empreinte } : {}), ...(firebase ? { firebase } : {}), ...(serveur ? { serveur } : {}), ...(identifiant ? { identifiant } : {}) });
  afficherDiagnostics(diagnostics);
  if (diagnostics.some((d) => d.gravite === 'erreur')) {
    console.error('\nLe programme ne peut pas être produit pour Android : rien n\'a été écrit.');
    return 1;
  }
  ecrire(sortie, fichiers);
  console.error(`Projet Android (Kotlin et Jetpack Compose) écrit dans « ${sortie} » (${fichiers.size} fichiers).`);
  console.error(`Pour le lancer : ouvrez le dossier dans Android Studio (voir LISEZMOI.md).`);
  return 0;
}

function compileStatique(application: Application, chemin: string, sortie: string, adresse?: string): number {
  if (application.ecrans.length === 0) {
    console.error(`Le fichier ${basename(chemin)} ne contient aucune page : rien n'a été écrit.`);
    return 1;
  }
  // Ce qu'un site statique ne sait pas faire (React, secret…) : décision T9.
  const pourLeStatique = [...verifierAdresseParLangue(application, 'statique'), ...verifierPourLeStatique(application), ...verifierSourcesPourLaCible(application, 'statique'), ...verifierNavigationPourLaCible(application, 'statique'), ...verifierFichiersPourLaCible(application, 'statique')];
  afficherDiagnostics(pourLeStatique);
  if (pourLeStatique.some((d) => d.gravite === 'erreur')) {
    console.error('\nLe programme ne peut pas être produit en site statique : rien n\'a été écrit.');
    return 1;
  }
  if (!dossierLibre(sortie, MARQUE_STATIQUE)) return 1;
  // Les fichiers de « utiliser style "…" », cherchés à côté du fichier Humalis.
  const fichiersStyle = lireFichiersStyle(application, chemin);
  if (!fichiersStyle) return 1;
  const nom = basename(chemin).replace(/\.humalis$/, '');
  const polices = lirePolices(application, chemin);
  if (!polices) return 1;
  const images = lireImagesDuSite(application, chemin);
  if (!images) return 1;
  const medias = lireMedias(application, chemin);
  if (!medias) return 1;
  const fichiers = genererProjetStatique(application, { nom, source: basename(chemin), fichiersStyle, polices, images, medias, ...(adresse ? { adresse } : {}) });
  ecrire(sortie, fichiers);
  console.error(`Site statique écrit dans « ${sortie} » (${fichiers.size} fichiers).`);
  console.error(`Pour le voir : ouvrez ${join(sortie, 'index.html')} dans un navigateur, ou servez le dossier (voir LISEZMOI.md).`);
  return 0;
}

function compileServeur(application: Application, chemin: string, sortie: string): number {
  if (application.serveurs.length === 0) {
    console.error(`Le fichier ${basename(chemin)} ne contient aucun bloc « serveur "…" : ».`);
    return 1;
  }
  if (application.serveurs.length > 1) {
    console.error('Un seul serveur par fichier pour l\'instant : rien n\'a été écrit.');
    return 1;
  }
  if (!dossierLibre(sortie, MARQUE_SERVEUR)) return 1;
  const fichiers = genererProjetServeur(application.serveurs[0], {
    nom: application.serveurs[0].nom,
    source: basename(chemin),
    chemins: cheminsDesPages(application),
  });
  ecrire(sortie, fichiers);
  console.error(`Serveur écrit dans « ${sortie} » (${fichiers.size} fichiers).`);
  console.error(`Pour le lancer : cd ${sortie} && npm install && npm test && npm run build && npm start (voir LISEZMOI.md)`);
  return 0;
}

/** La dernière version publiée d'un paquet, lue par npm ; undefined sans réponse. */
function derniereVersion(nom: string): string | undefined {
  try {
    return execFileSync('npm', ['view', nom, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function packs(arguments_: string[]): number {
  const dossier = option(arguments_, 'verifier');
  if (arguments_.includes('--verifier')) {
    if (!dossier) {
      console.error(AIDE);
      return 2;
    }
    const paquet = lire(join(dossier, 'package.json'));
    if (paquet === undefined) return 2;
    let retards: ReturnType<typeof verifierProjet>;
    try {
      retards = verifierProjet(paquet);
    } catch (erreur) {
      if (!(erreur instanceof ErreurPackageJson)) throw erreur;
      console.error(`Erreur, ${join(dossier, 'package.json')} : ${erreur.message}`);
      return 1;
    }
    for (const r of retards) console.error(`Avertissement : ${r.message}`);
    if (retards.length === 0) console.error(`Les packs Astratra de « ${dossier} » sont à la version de ce Humalis.`);
    console.error(`Pour les failles connues des autres dépendances : cd ${dossier} && npm audit`);
    return retards.length > 0 ? 1 : 0;
  }

  for (const ligne of etatDesPacks(derniereVersion)) {
    const derniere = ligne.derniere === undefined || ligne.derniere === ligne.epinglee ? '' : ` → ${ligne.derniere}`;
    console.log(`${ligne.nom} (${ligne.cible}) : ${ligne.epinglee}${derniere} — ${ligne.conseil}`);
  }
  return 0;
}

function principal(arguments_: string[]): number | Promise<number> {
  const [commande, chemin] = arguments_;

  if (commande === 'nouveau') {
    if (!chemin || arguments_.length !== 2) { console.error(AIDE); return 2; }
    try {
      const dossier = creerProjet(process.cwd(), chemin);
      console.log(`Projet créé dans « ${dossier} ».\ncd ${chemin}\nhumalis developper\nhumalis tester`);
      return 0;
    } catch (erreur) { console.error((erreur as Error).message); return 1; }
  }
  if (commande === 'formater') {
    if (!chemin || !chemin.endsWith('.humalis') || arguments_.length > 3 || (arguments_.length === 3 && arguments_[2] !== '--verifier')) { console.error(AIDE); return 2; }
    const source = lire(chemin);
    if (source === undefined) return 1;
    try {
      const resultat = formaterSource(source);
      if (resultat === source) { console.log('Déjà bien formaté.'); return 0; }
      if (arguments_[2] === '--verifier') { console.error('Formatage nécessaire.'); return 1; }
      const temporaire = `${chemin}.humalis-temp-${process.pid}`;
      writeFileSync(temporaire, resultat, { flag: 'wx' });
      renameSync(temporaire, chemin);
      console.log('Fichier formaté.');
      return 0;
    } catch (erreur) { console.error(`Erreur, ${chemin} : ${(erreur as Error).message}`); return 1; }
  }

  if (commande === 'compile') return compile(arguments_.slice(1));
  if (commande === 'packs') return packs(arguments_.slice(1));

  if (commande !== 'verifier' || !chemin) {
    console.error(AIDE);
    return 2;
  }

  const source = lire(chemin);
  if (source === undefined) return 2;

  const resultat = compilerLeFichier(chemin, source);
  const { application } = resultat;
  const diagnostics = appliquerExigence(resultat.diagnostics, arguments_.includes('--exigeant'));
  afficherDiagnostics(diagnostics);
  const resume = resumerQualite(diagnostics);
  if (resume) console.error(resume);

  if (!application || diagnostics.some((d) => d.gravite === 'erreur')) {
    const nombre = diagnostics.filter((d) => d.gravite === 'erreur').length;
    console.error(`\n${nombre} erreur${nombre > 1 ? 's' : ''} : le programme n'est pas compilé.`);
    return 1;
  }

  console.error(diagnostics.length === 0 ? 'Aucune erreur.' : 'Aucune erreur (voir les avertissements).');
  if (arguments_.includes('--ri')) console.log(JSON.stringify(application, null, 2));
  return 0;
}

const argumentsCli = process.argv.slice(2);
const reponse = reponseSimple(argumentsCli, AIDE);
if (reponse !== undefined) {
  console.log(reponse);
} else if (argumentsCli[0] === 'tester') {
  const optionsTester = argumentsCli.slice(1);
  const ciblesTester = optionsTester.filter((argument) => argument !== '--detail');
  if (ciblesTester.length > 1 || optionsTester.filter((argument) => argument === '--detail').length > 1 || ciblesTester.some((argument) => argument.startsWith('--'))) { console.error(AIDE); process.exitCode = 2; }
  else { try { process.exitCode = await testerProjet(ciblesTester[0] ?? process.cwd(), optionsTester.includes('--detail')); }
    catch (erreur) { console.error((erreur as Error).message); process.exitCode = 1; } }
} else if (argumentsCli[0] === 'developper') {
  const autres = argumentsCli.slice(1);
  const valeurPort = option(autres, 'port');
  const fichiers = autres.filter((argument) => !argument.startsWith('--') && argument !== valeurPort);
  const port = valeurPort === undefined ? 5173 : Number(valeurPort);
  if (fichiers.length > 1 || !Number.isInteger(port) || port < 1 || port > 65534 || autres.some((argument) => argument.startsWith('--') && argument !== '--port')) {
    console.error(AIDE);
    process.exitCode = 2;
  } else {
    try { process.exitCode = await developper(fichiers[0] ?? trouverPrincipal(process.cwd()), port); }
    catch (erreur) { console.error((erreur as Error).message); process.exitCode = 1; }
  }
} else if (argumentsCli[0] === 'lancer') {
  const autres = argumentsCli.slice(1);
  const valeurPort = option(autres, 'port');
  const fichiers = autres.filter((argument) => !argument.startsWith('--') && argument !== valeurPort);
  const port = valeurPort === undefined ? 5173 : Number(valeurPort);
  if (fichiers.length > 1 || !Number.isInteger(port) || port < 0 || port > 65515 || autres.some((argument) => argument.startsWith('--') && argument !== '--port' && argument !== '--ouvrir')) {
    console.error(AIDE);
    process.exitCode = 2;
  } else {
    try { process.exitCode = await lancer(fichiers[0] ?? trouverPrincipal(process.cwd()), { port, ouvrir: autres.includes('--ouvrir'), dire: (m) => console.error(m) }); }
    catch (erreur) { console.error((erreur as Error).message); process.exitCode = 1; }
  }
} else process.exitCode = await principal(argumentsCli);
