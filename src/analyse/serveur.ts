import type { Regle, Serveur, ActionDonnee, Route, Qui, Page, EnvoiEmail, CreationLiee, Donnee, TypeChamp, ValeurFixe } from '../parser/ast.js';
import type { Diagnostic } from './erreurs.js';
import { simplifier } from './elements.js';
import { proposerNom } from './suggestions.js';
import { traduireAction, traduireApresPaiement, traduireDocument, traduireNotification, traduireResume, traduireTache } from './logique.js';

const ACTIONS: ActionDonnee[] = ['lire', 'creer', 'modifier', 'supprimer'];

/**
 * Vérifie un bloc « serveur » : données et champs uniques, règles qui
 * visent une donnée existante, une seule donnée par route, et les
 * actions que personne ne pourra faire (la porte est fermée par défaut).
 */
export function analyserServeur(serveur: Serveur, diagnostics: Diagnostic[], pages: Page[] = []): void {
  const erreur = (message: string, ligne: number) => diagnostics.push({ gravite: 'erreur', message, ligne });
  const avertissement = (message: string, ligne: number) => diagnostics.push({ gravite: 'avertissement', message, ligne });

  const donnees = new Map<string, number>();
  for (const donnee of serveur.donnees) {
    if (donnees.has(donnee.nom)) {
      erreur(`la donnée « ${donnee.nom} » est déjà déclarée (ligne ${donnees.get(donnee.nom)}).`, donnee.ligne);
    }
    donnees.set(donnee.nom, donnee.ligne);
    const champs = new Map<string, number>();
    for (const champ of donnee.champs) {
      if (champs.has(champ.nom)) erreur(`le champ « ${champ.nom} » est déjà déclaré (ligne ${champs.get(champ.nom)}).`, champ.ligne);
      champs.set(champ.nom, champ.ligne);
    }
  }

  for (const donnee of serveur.donnees) for (const champ of donnee.champs) verifierRegleChamp(champ, donnee, serveur, erreur);

  // « donnees de depart pour produit : » : la donnée existe, chaque champ aussi, avec une valeur de son type.
  for (const depart of serveur.departs ?? []) {
    const donnee = serveur.donnees.find((d) => d.nom === depart.donnee);
    if (!donnee) {
      erreur(`la donnée « ${depart.donnee} » n'existe pas dans ce serveur. Données : ${serveur.donnees.map((d) => d.nom).join(', ') || 'aucune'}.`, depart.ligne);
      continue;
    }
    for (const fiche of depart.fiches) {
      for (const { champ, valeur, ligne } of fiche.champs) {
        const lu = donnee.champs.find((c) => simplifier(c.nom) === simplifier(champ));
        if (!lu) {
          erreur(`la donnée « ${donnee.nom} » n'a pas de champ « ${champ} ». Champs : ${donnee.champs.map((c) => c.nom).join(', ')}.`, ligne);
          continue;
        }
        const attendu = lu.type.genre === 'nombre' ? 'number' : lu.type.genre === 'booleen' ? 'boolean' : lu.type.genre === 'texte' ? 'string' : undefined;
        if (attendu !== undefined && typeof valeur !== attendu) erreur(`« ${champ} » de « ${donnee.nom} » attend ${attendu === 'number' ? 'un nombre' : attendu === 'boolean' ? 'vrai ou faux' : 'un texte entre guillemets'}.`, ligne);
      }
      const manquants = donnee.champs.filter((c) => !c.regle && !fiche.champs.some((f) => simplifier(f.champ) === simplifier(c.nom)));
      if (manquants.length) erreur(`cette fiche de départ n'a pas ${manquants.map((c) => `« ${c.nom} »`).join(', ')} : chaque champ demandé à la création doit avoir une valeur.`, fiche.ligne);
    }
  }

  for (const tache of serveur.taches ?? []) traduireTache(tache, serveur, erreur);
  if (serveur.ia && !serveur.droitIa) erreur(`chaque question à l'IA coûte : dites qui peut la poser, par exemple « connecte peut demander a ia ».`, serveur.ia.ligne);
  if (serveur.droitIa && !serveur.ia) erreur(`« peut demander a ia » demande la ligne « ia par anthropic » dans le serveur "${serveur.nom}".`, serveur.droitIa.ligne);
  if (serveur.droitIa?.qui === 'tout_le_monde') erreur(`chaque question à l'IA coûte : réservez-la à des comptes connectés, par exemple « connecte peut demander a ia ».`, serveur.droitIa.ligne);
  const RESERVES_COMPTE = new Set(['id', 'email', 'role', 'statut', 'password', 'passwordhash', 'invitation', 'googlesubject', 'applesubject', ...serveur.donnees.flatMap((d) => (d.par ? [simplifier(d.par)] : []))]);
  for (const champ of serveur.champsCompte ?? []) {
    if (RESERVES_COMPTE.has(simplifier(champ.nom))) erreur(`« ${champ.nom} » existe déjà sur un compte : donnez un autre nom à ce champ.`, champ.ligne);
  }
  const nomsDocuments = new Map<string, number>();
  for (const document of serveur.documents ?? []) {
    traduireDocument(document, serveur, erreur);
    if (nomsDocuments.has(document.nom)) erreur(`le document « ${document.nom} » est déjà écrit (ligne ${nomsDocuments.get(document.nom)}) : donnez-lui un autre nom.`, document.ligne);
    nomsDocuments.set(document.nom, document.ligne);
    if (document.lignes.length === 0) erreur(`le document « ${document.nom} » est vide : écrivez au moins un titre "…" ou un texte "…".`, document.ligne);
  }

  const adresses = new Map<string, number>();
  const servies = new Set<string>();
  const nomsActions = new Map<string, number>();
  for (const route of serveur.routes) {
    if (adresses.has(route.adresse)) {
      erreur(`la route « ${route.adresse} » est déjà déclarée (ligne ${adresses.get(route.adresse)}).`, route.ligne);
    }
    adresses.set(route.adresse, route.ligne);

    let servie: string | undefined;
    const permises = new Set<ActionDonnee>();
    for (const regle of route.regles) {
      if (!donnees.has(regle.donnee)) {
        erreur(
          `la donnée « ${regle.donnee} » n'existe pas dans le serveur « ${serveur.nom} ». Données : ${[...donnees.keys()].join(', ') || 'aucune'}.${proposerNom(regle.donnee, donnees.keys())}`,
          regle.ligne,
        );
        continue;
      }
      if (servie !== undefined && servie !== regle.donnee) {
        erreur(
          `une route ne sert qu'une donnée : la route « ${route.adresse} » sert déjà « ${servie} ». Écrivez une autre route pour « ${regle.donnee} ».`,
          regle.ligne,
        );
        continue;
      }
      servie = regle.donnee;
      servies.add(regle.donnee);
      const lue = serveur.donnees.find((d) => d.nom === regle.donnee);
      if (lue?.par !== undefined && regle.qui === 'tout_le_monde' && regle.actions.some((a) => a !== 'lire')) {
        erreur(`« ${lue.nom} » est séparée par ${lue.par} : un visiteur n'y appartient pas. Réservez ${regle.actions.join(' et ')} aux comptes connectés.`, regle.ligne);
      } else if (lue?.par !== undefined && regle.qui === 'tout_le_monde') {
        avertissement(`tout le monde peut lire « ${lue.nom} » : les fiches de chaque ${lue.par} sont publiques. Seules les écritures restent séparées.`, regle.ligne);
      }
      if (regle.si) verifierConditionRegle(regle, lue, [...serveur.donnees.flatMap((d) => (d.par ? [simplifier(d.par)] : [])), ...(serveur.champsCompte ?? []).map((c) => simplifier(c.nom))], erreur, avertissement);
      for (const action of regle.actions) permises.add(action);
      if (serveur.donnees.find((d) => d.nom === regle.donnee)?.comptes) {
        // Les comptes de la connexion : qui s'y trouve ne regarde que l'administration, et ils naissent d'une invitation.
        if (regle.soi) {
          if (regle.qui === 'tout_le_monde') erreur('un visiteur n’a pas de compte : écrivez « connecte peut lire son compte ».', regle.ligne);
        } else if (regle.qui === 'tout_le_monde' || regle.qui === 'connecte') erreur(`les comptes se réservent à un rôle : écrivez par exemple « seul gerant peut ${regle.actions.join(' et ')} comptes ».`, regle.ligne);
      }
    }

    if (route.apresPaiement) {
      const { donnee, ligne } = route.apresPaiement;
      const payee = serveur.donnees.find((d) => d.nom === donnee);
      if (!serveur.paiements) erreur(`« quand ${donnee} est payee » demande la ligne « paiements par stripe » dans le serveur "${serveur.nom}".`, ligne);
      if (donnee !== (servie ?? route.regles[0]?.donnee) || !payee) erreur(`la route « ${route.adresse} » sert « ${servie ?? 'aucune donnée'} » : elle ne voit pas le paiement de « ${donnee} ».`, ligne);
      else traduireApresPaiement(route.apresPaiement, payee, serveur, erreur);
    }

    for (const resume of route.resumes ?? []) {
      traduireResume(resume, serveur, erreur);
      if (resume.donnee !== (servie ?? route.regles[0]?.donnee)) erreur(`la route « ${route.adresse} » sert « ${servie ?? 'aucune donnée'} » : le résumé « ${resume.nom} » ne peut pas lire « ${resume.donnee} ».`, resume.ligne);
      if (resume.qui === 'tout_le_monde' && serveur.donnees.find((d) => d.nom === resume.donnee)?.par) erreur(`« ${resume.donnee} » est séparée par groupe : réservez ce résumé à des comptes connectés.`, resume.ligne);
    }

    for (const action of route.actions ?? []) {
      traduireAction(action, serveur, erreur);
      if (nomsActions.has(action.nom)) erreur(`l'action « ${action.nom} » est déjà écrite (ligne ${nomsActions.get(action.nom)}) : donnez-lui un autre nom.`, action.ligne);
      nomsActions.set(action.nom, action.ligne);
      const donneeRoute = servie ?? route.regles[0]?.donnee;
      if (action.donnee !== donneeRoute) erreur(`la route « ${route.adresse} » sert « ${donneeRoute ?? 'aucune donnée'} » : l'action « ${action.nom} » ne peut pas agir sur « ${action.donnee} ».`, action.ligne);
      if (action.qui === 'tout_le_monde') erreur(`« ${action.nom} » écrit sur le serveur : réservez-la à des comptes connectés.`, action.ligne);
    }

    if (route.apresCreation) {
      const { donnee, envois, creations, ligne } = route.apresCreation;
      if (!serveur.emails && envois.length > 0) erreur(`« envoyer email » demande la ligne « emails par brevo » dans le serveur "${serveur.nom}".`, ligne);
      if (donnee !== servie) erreur(`la route « ${route.adresse} » sert « ${servie ?? 'aucune donnée'} » : elle ne voit pas la création de « ${donnee} ».`, ligne);
      else {
        for (const envoi of envois) verifierEnvoiEmail(envoi, donnee, serveur, droitsDeRoute(route).creer ?? droitsDeRoute(route).modifier, erreur, avertissement);
        for (const creation of creations) verifierCreationLiee(creation, donnee, serveur, erreur);
        const cible = serveur.donnees.find((d) => d.nom === donnee);
        if (cible) for (const envoi of route.apresCreation.notifications ?? []) traduireNotification(envoi, cible, serveur, erreur);
      }
    }

    if (servie !== undefined && !serveur.donnees.find((d) => d.nom === servie)?.comptes) {
      // « modifier » couvre aussi créer et supprimer (décision S2).
      const couvertes = new Set(permises);
      if (permises.has('modifier')) {
        couvertes.add('creer');
        couvertes.add('supprimer');
      }
      const refusees = ACTIONS.filter((a) => !couvertes.has(a));
      if (refusees.length > 0) {
        avertissement(`personne ne peut ${refusees.join(', ')} « ${servie} » : ces actions seront refusées.`, route.ligne);
      }
    }
  }

  for (const lien of [
    { nom: 'invitations', ...serveur.invitations },
    { nom: 'mot de passe oublie', ...serveur.motDePasseOublie },
  ]) {
    if (lien.page === undefined || lien.ligne === undefined) continue;
    if (!serveur.emails) erreur(`« ${lien.nom} » envoie un lien par e-mail : ajoutez la ligne « emails par brevo » dans le serveur "${serveur.nom}".`, lien.ligne);
    const page = pages.find((p) => p.nom === lien.page);
    if (!page) {
      erreur(`« ${lien.nom} vers "${lien.page}" » : cette page n'existe pas.${proposerNom(lien.page, pages.map((p) => p.nom))}`, lien.ligne);
    } else if (page.parametres.length > 0) {
      erreur(`« ${lien.nom} vers "${lien.page}" » : un lien d'e-mail ne peut pas ouvrir une page qui attend une valeur dans son adresse.`, lien.ligne);
    }
  }

  if (serveur.fidelite) {
    const fidelite = serveur.fidelite;
    const { gain, objectif } = fidelite;
    if (adresses.has('fidelite') || adresses.has('/fidelite') || adresses.has('api/fidelite') || adresses.has('/api/fidelite')) {
      erreur(`le bloc « fidelite » sert déjà l'adresse /api/fidelite : donnez un autre nom à la route « fidelite ».`, fidelite.ligne);
    }
    const donnee = serveur.donnees.find((d) => d.nom === fidelite.donnee);
    const champDe = (nom: string) => donnee?.champs.find((c) => simplifier(c.nom) === simplifier(nom));
    const estUnTexte = (nom: string) => { const type = champDe(nom)?.type; return type?.genre === 'texte' && !type.image; };
    if (!donnee) {
      erreur(`la donnée « ${fidelite.donnee} » n'existe pas dans le serveur « ${serveur.nom} ». Données : ${[...donnees.keys()].join(', ') || 'aucune'}.${proposerNom(fidelite.donnee, donnees.keys())}`, fidelite.ligne);
    } else if (!estUnTexte(fidelite.champ)) {
      erreur(`« fidelite par ${fidelite.champ} » : la donnée « ${donnee.nom} » doit avoir un champ « ${fidelite.champ} » de type texte. Champs : ${donnee.champs.map((c) => c.nom).join(', ')}.${proposerNom(fidelite.champ, donnee.champs.map((c) => c.nom))}`, fidelite.ligne);
    }
    if (!gain) {
      erreur(`il manque la ligne qui donne les tampons, par exemple : 1 tampon par ${fidelite.donnee} livree`, fidelite.ligne);
    } else {
      if (!Number.isInteger(gain.tampons) || gain.tampons < 1) {
        erreur(`« ${gain.tampons} tampon par ${gain.donnee} … » : le nombre de tampons doit être un entier positif.`, gain.ligne);
      }
      if (gain.donnee !== fidelite.donnee) {
        erreur(`les tampons se comptent sur la donnée de l'en-tête : écrivez « par ${fidelite.donnee} ${gain.statut} », pas « par ${gain.donnee} ${gain.statut} ».`, gain.ligne);
      } else if (donnee && !estUnTexte('statut')) {
        erreur(`« par ${gain.donnee} ${gain.statut} » compare le champ « statut » : la donnée « ${donnee.nom} » doit avoir un champ « statut » de type texte.`, gain.ligne);
      }
    }
    if (!objectif) {
      erreur(`il manque la ligne de la récompense, par exemple : apres 5 tampons, recompense "Un cadeau"`, fidelite.ligne);
    } else if (!Number.isInteger(objectif.tampons) || objectif.tampons < 1) {
      erreur(`« apres ${objectif.tampons} tampons » : le nombre de tampons doit être un entier positif.`, objectif.ligne);
    }
  }

  for (const donnee of serveur.donnees) {
    if (!servies.has(donnee.nom) && !donnee.comptes) avertissement(`aucune route ne donne accès à la donnée « ${donnee.nom} ».`, donnee.ligne);
  }
}

/** Une valeur écrite va-t-elle dans ce type de champ ? */
function valeurVaDans(valeur: ValeurFixe, type: TypeChamp): boolean {
  if (valeur.genre === 'aujourdhui') return type.genre === 'date';
  if (type.genre === 'date') return typeof valeur.valeur === 'string' && !Number.isNaN(Date.parse(valeur.valeur));
  const attendu = type.genre === 'nombre' ? 'number' : type.genre === 'booleen' ? 'boolean' : type.genre === 'texte' ? 'string' : null;
  return typeof valeur.valeur === attendu;
}

/** « au depart », « du site », « calcule », « au plus » : chacun sur le bon type, et ce qu'ils lisent existe. */
function verifierRegleChamp(champ: Donnee['champs'][number], donnee: Donnee, serveur: Serveur, erreur: (message: string, ligne: number) => void): void {
  const { regle, type, nom, ligne } = champ;
  if (champ.nonVide && !((type.genre === 'texte' && !type.image) || type.genre === 'liste') ) {
    erreur(`« ${nom} » : « non vide » vaut pour un texte ou une liste.`, ligne);
  } else if (champ.nonVide && (regle?.genre === 'depart' || regle?.genre === 'nombreDe' || regle?.genre === 'somme')) {
    erreur(`« ${nom} » : le serveur donne déjà cette valeur, « non vide » ne sert à rien ici.`, ligne);
  }
  if (!regle || regle.genre === 'groupe' || regle.genre === 'auteur') return;
  const champDe = (d: Donnee | undefined, c: string) => d?.champs.find((x) => simplifier(x.nom) === simplifier(c));
  const prixDe = (donneeLue: string, prix: string) => {
    const lue = serveur.donnees.find((d) => d.nom === donneeLue);
    if (!lue) erreur(`« ${nom} » lit la donnée « ${donneeLue} », qui n'existe pas. Données : ${serveur.donnees.map((d) => d.nom).join(', ')}.`, ligne);
    else if (champDe(lue, prix)?.type.genre !== 'nombre') erreur(`« ${nom} » lit « ${prix} » de « ${donneeLue} » : ce doit être un champ nombre.`, ligne);
    return lue;
  };
  if (regle.genre === 'depart') {
    if (!valeurVaDans(regle.valeur, type)) erreur(`« ${nom} » : cette valeur « au depart » ne convient pas à son type.`, ligne);
  } else if (regle.genre === 'site') {
    const base = type.genre === 'liste' ? type.de : type;
    if (base.genre !== 'texte') erreur(`« ${nom} » : « du site » vaut pour un texte, une image ou une liste de textes.`, ligne);
  } else {
    if (type.genre !== 'nombre') erreur(`« ${nom} » : ce calcul ou ce plafond donne un nombre, le champ doit être de type nombre.`, ligne);
    if (regle.genre === 'auPlus') {
      const lue = prixDe(regle.donnee, regle.prix);
      if (lue && (!champDe(lue, regle.par) || !champDe(donnee, regle.par))) {
        erreur(`« ${nom} » compare « ${regle.par} » : les données « ${donnee.nom} » et « ${regle.donnee} » doivent toutes deux avoir ce champ.`, ligne);
      }
    } else {
      if (champDe(donnee, regle.liste)?.type.genre !== 'liste') erreur(`« ${nom} » lit « ${regle.liste} » : ce doit être un champ « liste de … » de « ${donnee.nom} ».`, ligne);
      if (regle.genre === 'somme') {
        prixDe(regle.donnee, regle.prix);
        const plus = regle.plus === undefined ? undefined : champDe(donnee, regle.plus);
        if (regle.plus !== undefined && (plus?.type.genre !== 'nombre' || plus.regle?.genre === 'somme')) {
          erreur(`« ${nom} » ajoute « ${regle.plus} » : ce doit être un champ nombre de « ${donnee.nom} », qui n'est pas lui-même une somme.`, ligne);
        }
      }
    }
  }
}

/** « si facture.compte est dans utilisateur.comptes_lies » : la fiche nommée est celle de la règle, et ses champs existent. */
function verifierConditionRegle(regle: Regle, donnee: Donnee | undefined, serveurGroupes: string[], erreur: (message: string, ligne: number) => void, avertissement: (message: string, ligne: number) => void): void {
  const { qui, si, ligne, parIdentifiant } = regle;
  if (!si || !donnee) return;
  if (qui === 'tout_le_monde' || parIdentifiant) erreur('une règle avec « si » regarde qui est connecté : elle ne vaut pas pour « tout le monde », ni « par identifiant ».', ligne);
  if (donnee.comptes) erreur('les comptes ne prennent pas de règle avec « si ».', ligne);
  for (const o of [si.gauche, si.droite]) {
    if (o.genre !== 'fiche') continue;
    if (o.donnee !== donnee.nom) erreur(`« ${o.donnee}.${o.champ} » : cette règle parle de « ${donnee.nom} ».`, ligne);
    else if (!donnee.champs.some((c) => simplifier(c.nom) === simplifier(o.champ)) && simplifier(o.champ) !== 'id') {
      erreur(`la donnée « ${donnee.nom} » n'a pas de champ « ${o.champ} ». Champs : ${donnee.champs.map((c) => c.nom).join(', ')}.${proposerNom(o.champ, donnee.champs.map((c) => c.nom))}`, ligne);
    }
  }
  const champsCompte = new Set(['id', 'email', 'role', ...serveurGroupes]);
  for (const o of [si.gauche, si.droite]) {
    if (o.genre === 'utilisateur' && !champsCompte.has(simplifier(o.champ))) avertissement(`aucune phrase n'écrit « ${o.champ} » sur un compte : cette condition restera fausse. Une liste de comptes dans la fiche fonctionne : si utilisateur.id est dans ${donnee.nom}.clients`, ligne);
  }
  if (si.dans && si.droite.genre === 'valeur') erreur('« est dans » demande une liste : le champ d\'une fiche ou de l\'utilisateur.', ligne);
  if (si.dans && si.droite.genre === 'fiche' && donnee.champs.find((c) => simplifier(c.nom) === simplifier((si.droite as { champ: string }).champ))?.type.genre !== 'liste') {
    erreur(`« ${si.droite.champ} » doit être un champ « liste de … » pour « est dans ».`, ligne);
  }
}

/** « creer suivi avec … dans commande.suivi » : la fiche liée a tout ce qu'il lui faut, et le serveur seul la remplit. */
function verifierCreationLiee(creation: CreationLiee, parent: string, serveur: Serveur, erreur: (message: string, ligne: number) => void): void {
  const { donnee, valeurs, dans, ligne } = creation;
  const liee = serveur.donnees.find((d) => d.nom === donnee);
  if (!liee || liee.comptes) {
    erreur(`« creer ${donnee} » : cette donnée n'existe pas. Données : ${serveur.donnees.filter((d) => !d.comptes).map((d) => d.nom).join(', ')}.`, ligne);
    return;
  }
  const source = serveur.donnees.find((d) => d.nom === parent);
  const existe = (d: Donnee | undefined, c: string) => d?.champs.find((x) => simplifier(x.nom) === simplifier(c));
  for (const { champ, valeur } of valeurs) {
    const cible = existe(liee, champ);
    if (!cible) erreur(`« creer ${donnee} » : la donnée « ${donnee} » n'a pas de champ « ${champ} ». Champs : ${liee.champs.map((c) => c.nom).join(', ')}.`, ligne);
    else if (cible.regle?.genre === 'depart' || cible.regle?.genre === 'nombreDe' || cible.regle?.genre === 'somme') erreur(`« creer ${donnee} » : le serveur donne déjà « ${champ} » : retirez-le de cette ligne.`, ligne);
    if (valeur.genre === 'champ' && (valeur.donnee !== parent || !existe(source, valeur.champ))) {
      erreur(`« ${valeur.donnee}.${valeur.champ} » : une fiche liée lit les champs de la fiche créée (« ${parent} »).`, ligne);
    }
  }
  if (liee.par !== undefined && liee.par !== source?.par) erreur(`« creer ${donnee} » : « ${donnee} » est séparée par ${liee.par}, mais « ${parent} » ${source?.par ? `par ${source.par}` : "ne l'est pas"}. Les deux doivent l'être de la même façon.`, ligne);
  const manquants = liee.champs.filter((c) => !valeurs.some((v) => simplifier(v.champ) === simplifier(c.nom)) && c.regle?.genre !== 'depart' && c.regle?.genre !== 'nombreDe' && c.regle?.genre !== 'somme' && c.regle?.genre !== 'groupe');
  if (manquants.length > 0) erreur(`« creer ${donnee} » : il manque ${manquants.map((c) => `« ${c.nom} »`).join(', ')}.`, ligne);
  if (dans && (dans.donnee !== parent || existe(source, dans.champ)?.type.genre !== 'texte')) {
    erreur(`« dans ${dans.donnee}.${dans.champ} » : l'identifiant va dans un champ texte de « ${parent} ».`, ligne);
  }
}

/** Le destinataire et les « {message.nom} » d'un e-mail : des champs de la fiche qui vient d'être créée. */
function verifierEnvoiEmail(
  envoi: EnvoiEmail,
  donnee: string,
  serveur: Serveur,
  createur: Qui | null,
  erreur: (message: string, ligne: number) => void,
  avertissement: (message: string, ligne: number) => void,
): void {
  const champs = serveur.donnees.find((d) => d.nom === donnee)?.champs ?? [];
  const existe = (champ: string) => champs.some((c) => simplifier(c.nom) === simplifier(champ));
  const { destinataire } = envoi;
  if (destinataire.genre === 'adresse' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinataire.adresse)) {
    erreur(`« ${destinataire.adresse} » n'est pas une adresse e-mail.`, envoi.ligne);
  }
  if (destinataire.genre === 'champ') {
    if (destinataire.donnee !== donnee || !existe(destinataire.champ)) {
      erreur(`« ${destinataire.donnee}.${destinataire.champ} » : le destinataire est un champ de « ${donnee} ». Champs : ${champs.map((c) => c.nom).join(', ')}.`, envoi.ligne);
    } else if (createur === 'tout_le_monde') {
      avertissement(`tout le monde peut creer « ${donnee} » : n'importe qui peut faire partir cet e-mail vers l'adresse de son choix. Réservez la création, ou écrivez aux admins.`, envoi.ligne);
    }
  }
  for (const partie of [...envoi.sujet, ...envoi.texte]) {
    if (partie.type !== 'variable') continue;
    const [nom, champ, ...reste] = partie.valeur.split('.');
    if (nom !== donnee || champ === undefined || reste.length > 0 || !existe(champ)) {
      erreur(`« {${partie.valeur}} » : un e-mail montre les champs de la fiche créée, par exemple {${donnee}.${champs[0]?.nom ?? 'nom'}}.`, envoi.ligne);
    }
  }
}

export type Droits = Record<ActionDonnee, Qui | null> & { lireUn?: Qui };

/**
 * Qui peut faire chaque action d'une route. « modifier » couvre créer et
 * supprimer quand ils n'ont pas leur propre règle (décision S2) ; une
 * action sans règle reste fermée (null).
 */
export function droitsDeRoute(route: Route): Droits {
  const droits: Droits = { lire: null, creer: null, modifier: null, supprimer: null };
  for (const regle of route.regles) {
    if (regle.si) continue;
    if (regle.parIdentifiant) droits.lireUn = regle.qui;
    else for (const action of regle.actions) droits[action] = regle.qui;
  }
  if (droits.modifier) {
    droits.creer ??= droits.modifier;
    droits.supprimer ??= droits.modifier;
  }
  return droits;
}

/** Les règles avec « si », action par action ; « modifier » couvre créer et supprimer, comme pour les autres règles. */
export function conditionsDeRoute(route: Route): Partial<Record<ActionDonnee, { qui: Qui; si: NonNullable<Regle['si']> }[]>> {
  const resultat: Partial<Record<ActionDonnee, { qui: Qui; si: NonNullable<Regle['si']> }[]>> = {};
  const ajouter = (action: ActionDonnee, regle: Regle) => (resultat[action] ??= []).push({ qui: regle.qui, si: regle.si! });
  for (const regle of route.regles) {
    if (!regle.si) continue;
    for (const action of regle.actions) {
      ajouter(action, regle);
      if (action === 'modifier') {
        if (!route.regles.some((r) => r.actions.includes('creer'))) ajouter('creer', regle);
        if (!route.regles.some((r) => r.actions.includes('supprimer'))) ajouter('supprimer', regle);
      }
    }
  }
  return resultat;
}

/** « /api/produits », « /produits » et « produits » désignent la même route. */
export const adresseNormalisee = (adresse: string) => adresse.replace(/^\/+/, '').replace(/^api\//, '');
