/**
 * Les formes d'application spéciales, en haut du fichier (validées par Emch le 10 novembre 2026) :
 * widget, activité en direct, raccourcis de l'icône, commande vocale, lancement au démarrage,
 * recherche du système, tuile, mini-application, voiture, menu clic droit, clavier, et les
 * événements de l'application (partage reçu, fichier ouvert, bouton d'une notification).
 * Ce qui s'affiche (widget, activité) s'écrit comme une page ; ce qui agit, comme un événement.
 */
import { ErreurSyntaxique } from './erreurs.js';
import type { FluxTokens } from './fluxTokens.js';
import type { Formes, Instruction } from './ast.js';
import { analyserBloc, analyserInstruction, chaqueLigne, estLeMot } from './parser.js';
import { estMot } from './miseEnPage.js';

export const formesVides = (): Formes => ({
  widgets: [],
  activites: [],
  raccourcisIcone: [],
  commandesVocales: [],
  recherches: [],
  tuiles: [],
  minis: [],
  voitures: [],
  menusClicDroit: [],
  claviers: [],
  fichiersOuverts: [],
  boutonsNotification: [],
});

const chaine = (flux: FluxTokens, attendu: string) => flux.attendre('CHAINE', undefined, attendu).valeur;
const deuxPoints = (flux: FluxTokens, apres: string) => flux.attendre('PONCTUATION', ':', `deux-points à la fin de « ${apres} »`);
const nom = (flux: FluxTokens, attendu: string) => {
  const jeton = flux.actuel();
  if (!estMot(jeton)) flux.attendre('IDENTIFIANT', undefined, attendu);
  return flux.avancer().valeur;
};

/** « avec icone "horloge" », s'il est écrit. */
function icone(flux: FluxTokens): string | undefined {
  if (!estLeMot(flux.actuel(), 'avec') || !estLeMot(flux.regarder(1), 'icone')) return undefined;
  flux.avancer();
  flux.avancer();
  return chaine(flux, 'le nom de l’icône entre guillemets');
}

/** « vers "page" », s'il est écrit. */
function vers(flux: FluxTokens): string | undefined {
  if (!estLeMot(flux.actuel(), 'vers')) return undefined;
  flux.avancer();
  return chaine(flux, 'le nom de la page entre guillemets');
}

/** Des extensions de fichier : « ".csv" ou ".pdf" », « ".jpg" et ".png" ». */
function extensions(flux: FluxTokens, exemple: string): string[] {
  const lues: string[] = [];
  do {
    const ext = chaine(flux, `l’extension entre guillemets : ${exemple}`).toLowerCase();
    if (!/^\.[a-z0-9]{1,10}$/.test(ext)) throw new ErreurSyntaxique(`« ${ext} » n’est pas une extension de fichier : écrivez-la avec son point, par exemple ".csv".`, flux.actuel().ligne);
    lues.push(ext);
  } while ((estLeMot(flux.actuel(), 'ou') || estLeMot(flux.actuel(), 'et')) && flux.regarder(1).type === 'CHAINE' && flux.avancer());
  return lues;
}

/** « liste livraisons avec titre adresse et texte client vers "livraison" ». */
function listeAvecTitre(flux: FluxTokens, exemple: string): { liste: string; titre: string; texte?: string; vers?: string } {
  const liste = nom(flux, `la liste à montrer : ${exemple}`);
  flux.attendre('MOT_CLE', 'avec', `« avec titre … » après la liste : ${exemple}`);
  if (!estLeMot(flux.actuel(), 'titre')) throw new ErreurSyntaxique(`il manque « titre » et le champ à montrer : ${exemple}`, flux.actuel().ligne);
  flux.avancer();
  const titre = nom(flux, `le champ du titre : ${exemple}`);
  let texte: string | undefined;
  if (estLeMot(flux.actuel(), 'et') && estLeMot(flux.regarder(1), 'texte')) {
    flux.avancer();
    flux.avancer();
    texte = nom(flux, `le champ du texte : ${exemple}`);
  }
  const page = vers(flux);
  return { liste, titre, ...(texte ? { texte } : {}), ...(page ? { vers: page } : {}) };
}

/** Le corps d'un widget : des éléments de page, et « actualiser toutes les 30 minutes ». */
function corpsDeWidget(flux: FluxTokens): { corps: Instruction[]; actualiser?: { nombre: number; unite: 'minutes' | 'heures' } } {
  const corps: Instruction[] = [];
  let actualiser: { nombre: number; unite: 'minutes' | 'heures' } | undefined;
  chaqueLigne(flux, () => {
    if (estLeMot(flux.actuel(), 'actualiser') && estLeMot(flux.regarder(1), 'toutes')) {
      flux.avancer();
      flux.avancer();
      const nombre = Number(flux.attendre('NOMBRE', undefined, 'le délai : actualiser toutes les 30 minutes').valeur);
      const unite = flux.avancer();
      const lue = /^minutes?$/.test(unite.valeur) ? 'minutes' : /^heures?$/.test(unite.valeur) ? 'heures' : undefined;
      if (!lue) throw new ErreurSyntaxique('un widget s’actualise en minutes ou en heures : actualiser toutes les 30 minutes.', unite.ligne);
      if (lue === 'minutes' && nombre < 15) throw new ErreurSyntaxique('un widget s’actualise au plus toutes les 15 minutes : le système refuse plus souvent.', unite.ligne);
      actualiser = { nombre, unite: lue };
      return;
    }
    corps.push(analyserInstruction(flux));
  });
  return { corps, ...(actualiser ? { actualiser } : {}) };
}

/** Vrai si la ligne commence une forme du haut du fichier. */
export function estUneForme(flux: FluxTokens): boolean {
  const [a, b, c] = [flux.actuel(), flux.regarder(1), flux.regarder(2)];
  return (
    (estLeMot(a, 'widget') && b.type === 'CHAINE') ||
    (estLeMot(a, 'activite') && estLeMot(b, 'en') && estLeMot(c, 'direct')) ||
    (estLeMot(a, 'raccourcis') && estLeMot(b, 'icone')) ||
    (estLeMot(a, 'commande') && estLeMot(b, 'vocale')) ||
    (estLeMot(a, 'lancer') && estLeMot(b, 'demarrage')) ||
    (estLeMot(a, 'recherche') && estLeMot(b, 'systeme')) ||
    (estLeMot(a, 'tuile') && b.type === 'CHAINE') ||
    (estLeMot(a, 'mini') && estLeMot(b, 'application')) ||
    (estLeMot(a, 'voiture') && b.type === 'CHAINE') ||
    (estLeMot(a, 'menu') && estLeMot(b, 'clic') && estLeMot(c, 'droit')) ||
    (estLeMot(a, 'clavier') && b.type === 'CHAINE') ||
    (estLeMot(a, 'quand') && estLeMot(b, 'on') && (estLeMot(c, 'partage') || estLeMot(c, 'ouvre'))) ||
    (estLeMot(a, 'quand') && estLeMot(b, 'erreur') && estLeMot(c, 'arrive')) ||
    (estLeMot(a, 'quand') && estLeMot(b, 'utilisateur') && estLeMot(c, 'touche') && flux.regarder(3).type === 'CHAINE')
  );
}

/** Lit une forme du haut du fichier et la range dans `formes`. */
export function analyserForme(flux: FluxTokens, formes: Formes): void {
  const debut = flux.actuel();
  const ligne = debut.ligne;

  if (estLeMot(debut, 'quand') && estLeMot(flux.regarder(1), 'erreur') && estLeMot(flux.regarder(2), 'arrive')) {
    flux.avancer(); flux.avancer(); flux.avancer();
    deuxPoints(flux, 'quand une erreur arrive');
    if (formes.erreurArrive) throw new ErreurSyntaxique(`« quand une erreur arrive » est déjà écrit ligne ${formes.erreurArrive.ligne}.`, ligne);
    formes.erreurArrive = { corps: analyserBloc(flux), ligne };
    return;
  }

  if (estLeMot(debut, 'widget')) {
    flux.avancer();
    const nomWidget = chaine(flux, 'le nom du widget entre guillemets');
    let taille: 'petite' | 'moyenne' | 'grande' | undefined;
    if (estLeMot(flux.actuel(), 'avec') && estLeMot(flux.regarder(1), 'taille')) {
      flux.avancer();
      flux.avancer();
      const lue = flux.avancer();
      if (!['petite', 'moyenne', 'grande'].includes(lue.valeur)) throw new ErreurSyntaxique(`« ${lue.valeur} » n’est pas une taille de widget : petite, moyenne ou grande.`, lue.ligne);
      taille = lue.valeur as 'petite' | 'moyenne' | 'grande';
    }
    const page = vers(flux);
    deuxPoints(flux, `widget "${nomWidget}"`);
    const { corps, actualiser } = corpsDeWidget(flux);
    formes.widgets.push({ nom: nomWidget, ...(taille ? { taille } : {}), ...(page ? { vers: page } : {}), ...(actualiser ? { actualiser } : {}), corps, ligne });
    return;
  }

  if (estLeMot(debut, 'activite')) {
    flux.avancer();
    flux.avancer();
    flux.avancer();
    const nomActivite = chaine(flux, 'le nom de l’activité entre guillemets');
    deuxPoints(flux, `activite en direct "${nomActivite}"`);
    formes.activites.push({ nom: nomActivite, corps: analyserBloc(flux), ligne });
    return;
  }

  if (estLeMot(debut, 'raccourcis')) {
    flux.avancer();
    flux.avancer();
    deuxPoints(flux, 'raccourcis de l’icone');
    chaqueLigne(flux, () => {
      const exemple = 'raccourci "Nouvelle commande" vers "commande" avec icone "plus"';
      if (!estLeMot(flux.actuel(), 'raccourci')) throw new ErreurSyntaxique(`sous « raccourcis de l’icone », chaque ligne est un raccourci : ${exemple}`, flux.actuel().ligne);
      const l = flux.avancer().ligne;
      const titre = chaine(flux, `le titre du raccourci : ${exemple}`);
      const page = vers(flux);
      if (!page) throw new ErreurSyntaxique(`un raccourci ouvre une page : ${exemple}`, l);
      const nomIcone = icone(flux);
      formes.raccourcisIcone.push({ titre, page, ...(nomIcone ? { icone: nomIcone } : {}), ligne: l });
    });
    return;
  }

  if (estLeMot(debut, 'commande')) {
    flux.avancer();
    flux.avancer();
    const phrase = chaine(flux, 'la phrase à dire entre guillemets : commande vocale "Mon solde" :');
    const parametres = [...phrase.matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1]!);
    const page = vers(flux);
    if (page) {
      formes.commandesVocales.push({ phrase, parametres, vers: page, corps: [], ligne });
      return;
    }
    deuxPoints(flux, `commande vocale "${phrase}"`);
    formes.commandesVocales.push({ phrase, parametres, corps: analyserBloc(flux), ligne });
    return;
  }

  if (estLeMot(debut, 'lancer')) {
    flux.avancer();
    flux.avancer();
    if (!estLeMot(flux.actuel(), 'ordinateur')) throw new ErreurSyntaxique('on écrit : lancer au demarrage de l’ordinateur', flux.actuel().ligne);
    flux.avancer();
    let discret = false;
    if (estLeMot(flux.actuel(), 'avec') && estLeMot(flux.regarder(1), 'discret')) {
      flux.avancer();
      flux.avancer();
      discret = true;
    }
    formes.demarrage = { discret, ligne };
    return;
  }

  if (estLeMot(debut, 'recherche')) {
    flux.avancer();
    flux.avancer();
    deuxPoints(flux, 'recherche du systeme');
    chaqueLigne(flux, () => {
      const exemple = 'produits avec titre nom et texte description vers "produit"';
      const l = flux.actuel().ligne;
      const lu = listeAvecTitre(flux, exemple);
      if (!lu.vers) throw new ErreurSyntaxique(`un résultat de recherche ouvre une page : ${exemple}`, l);
      formes.recherches.push({ liste: lu.liste, titre: lu.titre, ...(lu.texte ? { texte: lu.texte } : {}), vers: lu.vers, ligne: l });
    });
    return;
  }

  if (estLeMot(debut, 'tuile')) {
    flux.avancer();
    const nomTuile = chaine(flux, 'le nom de la tuile entre guillemets');
    const nomIcone = icone(flux);
    deuxPoints(flux, `tuile "${nomTuile}"`);
    formes.tuiles.push({ nom: nomTuile, ...(nomIcone ? { icone: nomIcone } : {}), corps: analyserBloc(flux), ligne });
    return;
  }

  if (estLeMot(debut, 'mini')) {
    flux.avancer();
    flux.avancer();
    const nomMini = chaine(flux, 'le nom de la mini-application entre guillemets');
    deuxPoints(flux, `mini application "${nomMini}"`);
    let page: string | undefined;
    chaqueLigne(flux, () => {
      if (!flux.verifier('MOT_CLE', 'page') || page !== undefined) throw new ErreurSyntaxique('une mini-application montre une seule page : page "commande"', flux.actuel().ligne);
      flux.avancer();
      page = chaine(flux, 'le nom de la page entre guillemets');
    });
    if (page === undefined) throw new ErreurSyntaxique('une mini-application montre une page : écrivez dessous, décalé, page "commande"', ligne);
    formes.minis.push({ nom: nomMini, page, ligne });
    return;
  }

  if (estLeMot(debut, 'voiture')) {
    flux.avancer();
    const nomVoiture = chaine(flux, 'le nom de l’écran de voiture entre guillemets');
    deuxPoints(flux, `voiture "${nomVoiture}"`);
    let lu: ReturnType<typeof listeAvecTitre> | undefined;
    chaqueLigne(flux, () => {
      const exemple = 'liste livraisons avec titre adresse et texte client vers "livraison"';
      if (!estLeMot(flux.actuel(), 'liste') || lu) throw new ErreurSyntaxique(`l’écran de voiture montre une liste : ${exemple}`, flux.actuel().ligne);
      flux.avancer();
      lu = listeAvecTitre(flux, exemple);
    });
    if (!lu) throw new ErreurSyntaxique('l’écran de voiture montre une liste : liste livraisons avec titre adresse et texte client', ligne);
    formes.voitures.push({ nom: nomVoiture, ...lu, ligne });
    return;
  }

  if (estLeMot(debut, 'menu')) {
    flux.avancer();
    flux.avancer();
    flux.avancer();
    const exemple = 'menu clic droit "Envoyer" pour les fichiers ".jpg" et ".png" :';
    const titre = chaine(flux, `le titre du menu : ${exemple}`);
    flux.attendre('MOT_CLE', 'pour', `« pour les fichiers ".jpg" » après le titre : ${exemple}`);
    if (!estLeMot(flux.actuel(), 'fichiers')) throw new ErreurSyntaxique(`il manque « les fichiers » : ${exemple}`, flux.actuel().ligne);
    flux.avancer();
    const lues = extensions(flux, exemple);
    deuxPoints(flux, `menu clic droit "${titre}"`);
    formes.menusClicDroit.push({ titre, extensions: lues, corps: analyserBloc(flux), ligne });
    return;
  }

  if (estLeMot(debut, 'clavier')) {
    flux.avancer();
    const nomClavier = chaine(flux, 'le nom du clavier entre guillemets');
    deuxPoints(flux, `clavier "${nomClavier}"`);
    const touches: { texte: string; ecrit: string; ligne: number }[] = [];
    chaqueLigne(flux, () => {
      const exemple = 'touche "Merci" ecrit "Merci beaucoup !"';
      if (!estLeMot(flux.actuel(), 'touche')) throw new ErreurSyntaxique(`sous « clavier », chaque ligne est une touche : ${exemple}`, flux.actuel().ligne);
      const l = flux.avancer().ligne;
      const texte = chaine(flux, `le texte de la touche : ${exemple}`);
      if (!estLeMot(flux.actuel(), 'ecrit')) throw new ErreurSyntaxique(`il manque « ecrit "…" » : ${exemple}`, flux.actuel().ligne);
      flux.avancer();
      touches.push({ texte, ecrit: chaine(flux, `ce que la touche écrit : ${exemple}`), ligne: l });
    });
    if (touches.length === 0) throw new ErreurSyntaxique('un clavier a au moins une touche : écrivez dessous, décalé, touche "Merci" ecrit "Merci beaucoup !"', ligne);
    formes.claviers.push({ nom: nomClavier, touches, ligne });
    return;
  }

  // « quand on partage vers l'application : », « quand on ouvre un fichier ".csv" : »
  if (estLeMot(debut, 'quand') && estLeMot(flux.regarder(1), 'on')) {
    flux.avancer();
    flux.avancer();
    if (estLeMot(flux.avancer(), 'partage')) {
      if (!estLeMot(flux.actuel(), 'vers') || !estLeMot(flux.regarder(1), 'application')) throw new ErreurSyntaxique('on écrit : quand on partage vers l’application :', flux.actuel().ligne);
      flux.avancer();
      flux.avancer();
      deuxPoints(flux, 'quand on partage vers l’application');
      if (formes.partageRecu) throw new ErreurSyntaxique(`« quand on partage vers l’application » est déjà écrit ligne ${formes.partageRecu.ligne}.`, ligne);
      formes.partageRecu = { corps: analyserBloc(flux), ligne };
      return;
    }
    const exemple = 'quand on ouvre un fichier ".csv" ou ".pdf" :';
    if (!estLeMot(flux.actuel(), 'fichier')) throw new ErreurSyntaxique(`on écrit : ${exemple}`, flux.actuel().ligne);
    flux.avancer();
    const lues = extensions(flux, exemple);
    deuxPoints(flux, 'quand on ouvre un fichier');
    formes.fichiersOuverts.push({ extensions: lues, corps: analyserBloc(flux), ligne });
    return;
  }

  // « quand l'utilisateur touche "Accepter" dans une notification : »
  flux.avancer();
  flux.avancer();
  flux.avancer();
  const bouton = chaine(flux, 'le bouton de la notification entre guillemets');
  if (!estLeMot(flux.actuel(), 'dans') || !estLeMot(flux.regarder(1), 'notification')) throw new ErreurSyntaxique(`on écrit : quand l’utilisateur touche "${bouton}" dans une notification :`, flux.actuel().ligne);
  flux.avancer();
  flux.avancer();
  deuxPoints(flux, `quand l’utilisateur touche "${bouton}" dans une notification`);
  formes.boutonsNotification.push({ bouton, corps: analyserBloc(flux), ligne });
}
