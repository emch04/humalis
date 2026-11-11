/**
 * Ce que le web et le bureau partagent, quel que soit le rendu (moteur Humalis ou React) :
 * la base de l'appareil (IndexedDB, chiffrée avec une clé WebCrypto non extractible), la file
 * hors ligne, la synchronisation, WebAuthn et l'écran du code à six chiffres.
 * Du JavaScript en clair, sans dépendance : il est écrit tel quel dans le projet produit.
 */
import type { DonneeLocaleOptions } from '../../parser/ast.js';
import type { Application } from '../../ri/types.js';
import { camel } from '../web/noms.js';

/** Les réglages d'une donnée locale, écrits dans le projet. */
export function reglagesLocale(application: Application, nom: string, locale: DonneeLocaleOptions, cle: string): string {
  const route = locale.synchronisee !== undefined ? `/api/${locale.synchronisee.replace(/^\/+/, '')}` : null;
  const lue = application.serveurs.flatMap((s) => s.routes).find((r) => r.adresse.replace(/^\/+/, '') === locale.synchronisee?.replace(/^\/+/, ''));
  return `{ cle: ${JSON.stringify(cle)}, nom: ${JSON.stringify(nom)}, chiffree: ${locale.chiffree}, champs: ${JSON.stringify(locale.champs.map((c) => camel(c.nom)))}, route: ${JSON.stringify(route)}, public: ${lue?.droits.lire === 'tout_le_monde'} }`;
}

export const avecSecuriteWeb = (application: Application) => application.serveurs.some((s) => s.doubleAuthentification || s.connexionCleAcces);
export const avecDoubleWeb = (application: Application) => application.serveurs.some((s) => s.doubleAuthentification);
export const avecLocalesSynchro = (application: Application) => application.partages.some((p) => p.locale?.synchronisee !== undefined);

/** src/humalis/donnees-locales.js */
export const DONNEES_LOCALES_JS = String.raw`// Produit par Humalis : une donnée locale, une vraie base sur l'appareil, et sa synchronisation.

const LOT = 100;
const ATTENTE = 400;
const REPRISE_MINIMUM = 2000;
const REPRISE_MAXIMUM = 300000;
const VEILLE = 60000;

/**
 * Le cœur, sans navigateur : la liste affichée d'un côté, la base de l'autre.
 * La liste reste la vérité de la page : chaque changement y est comparé à ce que la base connaît,
 * et devient une écriture, puis une ligne de la file d'envoi.
 *
 * o : { champs, route, base, transport, lire(), ecrire(liste), signaler(message), maintenant(), nouvelId() }
 * base : { lire() → { fiches, file, curseur }, appliquer({ fiches, retirees, file, envoyees, curseur, vider }) }
 */
export function creerCoeur(o) {
  const maintenant = o.maintenant ?? (() => Date.now());
  const nouvelId = o.nouvelId ?? (() => crypto.randomUUID());
  const nouvelleOperation = () => nouvelId().replaceAll('-', '');
  let base = null;
  let pret = false;
  let connus = new Map();
  let objets = new Map();
  let ordres = new Map();
  let file = new Map();
  let curseur = 0;
  let prochain = 1;
  const enVol = new Set();
  let suite = Promise.resolve();
  let enCours = null;
  let encoreUneFois = false;

  const enOrdre = (travail) => {
    const resultat = suite.then(travail, travail);
    suite = resultat.catch(() => undefined);
    return resultat;
  };
  const valeursDe = (fiche) => {
    const valeurs = {};
    for (const champ of o.champs) valeurs[champ] = fiche[champ] ?? null;
    return valeurs;
  };
  const publier = () => {
    const liste = [...ordres.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => objets.get(id));
    o.ecrire(liste);
  };
  const adopter = (id, valeurs, ecritures) => {
    const propres = valeursDe(valeurs);
    const texte = JSON.stringify(propres);
    if (connus.get(id) === texte) return false;
    connus.set(id, texte);
    objets.set(id, { ...propres, id });
    if (!ordres.has(id)) ordres.set(id, prochain++);
    ecritures.fiches.push({ id, ordre: ordres.get(id), valeurs: propres });
    return true;
  };
  const oublier = (id, ecritures) => {
    if (!connus.has(id)) return false;
    connus.delete(id);
    objets.delete(id);
    ordres.delete(id);
    ecritures.retirees.push(id);
    return true;
  };
  const vide = () => ({ fiches: [], retirees: [], file: [], envoyees: [] });

  /** Compare la liste à la base : ce qui a changé part dans la base et dans la file. */
  function observer(liste) {
    if (!pret || !Array.isArray(liste)) return;
    const vus = new Set();
    let completee = false;
    const sortie = liste.map((fiche) => {
      if (fiche === null || typeof fiche !== 'object') return fiche;
      if (typeof fiche.id === 'string' && !vus.has(fiche.id)) {
        vus.add(fiche.id);
        return fiche;
      }
      completee = true;
      const id = nouvelId();
      vus.add(id);
      return { ...fiche, id };
    });
    const ecritures = vide();
    const moment = maintenant();
    let rang = 0;
    for (const fiche of sortie) {
      if (fiche === null || typeof fiche !== 'object') continue;
      rang++;
      const propres = valeursDe(fiche);
      const texte = JSON.stringify(propres);
      const connu = connus.get(fiche.id);
      const nouvelle = connu === undefined;
      const ordre = nouvelle ? prochain++ : ordres.get(fiche.id);
      if (connu !== texte) {
        connus.set(fiche.id, texte);
        objets.set(fiche.id, fiche);
        ordres.set(fiche.id, ordre);
        ecritures.fiches.push({ id: fiche.id, ordre, valeurs: propres });
        if (o.route) {
          const avant = file.get(fiche.id);
          const entree = { id: fiche.id, operation: nouvelleOperation(), modifieLe: moment, valeurs: propres, creation: nouvelle || avant?.creation === true };
          file.set(fiche.id, entree);
          ecritures.file.push(entree);
        }
      } else {
        objets.set(fiche.id, fiche);
      }
    }
    void rang;
    for (const id of [...connus.keys()]) {
      if (vus.has(id)) continue;
      oublier(id, ecritures);
      if (!o.route) continue;
      const avant = file.get(id);
      // Créée et supprimée sans avoir jamais quitté l'appareil : le serveur n'a pas à le savoir.
      if (avant?.creation && !enVol.has(id)) {
        file.delete(id);
        ecritures.envoyees.push(id);
      } else {
        const entree = { id, operation: nouvelleOperation(), modifieLe: moment, supprime: true, creation: false };
        file.set(id, entree);
        ecritures.file.push(entree);
      }
    }
    if (completee) o.ecrire(sortie);
    if (ecritures.fiches.length || ecritures.retirees.length || ecritures.file.length || ecritures.envoyees.length) {
      const cible = base;
      void enOrdre(() => cible.appliquer(ecritures)).then(() => o.apresEcriture?.(), (erreur) => o.signaler?.(erreur));
      if (o.route) o.planifier?.();
    }
  }

  /** Ouvre la base d'un compte et publie ce qu'elle contient. */
  async function ouvrir(nouvelleBase) {
    await enOrdre(async () => {
      const enAttente = pret ? [] : (o.lire() ?? []).filter((f) => f && typeof f === 'object' && typeof f.id !== 'string');
      pret = false;
      base = nouvelleBase;
      await charger();
      if (enAttente.length) {
        const liste = [...ordres.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => objets.get(id));
        pret = true;
        o.ecrire([...liste, ...enAttente]);
        return;
      }
      pret = true;
      publier();
    });
  }

  async function charger() {
    const lu = await base.lire();
    connus = new Map();
    objets = new Map();
    ordres = new Map();
    file = new Map(lu.file.map((e) => [e.id, e]));
    curseur = lu.curseur ?? 0;
    prochain = 1;
    for (const fiche of lu.fiches) {
      const propres = valeursDe(fiche.valeurs);
      connus.set(fiche.id, JSON.stringify(propres));
      objets.set(fiche.id, { ...propres, id: fiche.id });
      ordres.set(fiche.id, fiche.ordre);
      prochain = Math.max(prochain, fiche.ordre + 1);
    }
  }

  /** Un autre onglet a écrit : la base fait foi. */
  async function recharger() {
    if (!base) return;
    await enOrdre(async () => {
      if (!pret) return;
      await charger();
      publier();
    });
  }

  async function envoyer() {
    let taille = LOT;
    while (file.size > 0) {
      const lot = [...file.values()].slice(0, taille);
      for (const entree of lot) enVol.add(entree.id);
      let reponse;
      try {
        reponse = await o.transport.envoyer(o.route + '/synchro', {
          heure: maintenant(),
          envois: lot.map(({ id, operation, modifieLe, valeurs, supprime }) => ({ id, operation, modifieLe, ...(supprime ? { supprime: true } : { valeurs }) })),
        });
      } finally {
        for (const entree of lot) enVol.delete(entree.id);
      }
      if (reponse.statut === 401 || reponse.statut === 403) return false;
      if (reponse.statut === 413) {
        // Trop lourd : on coupe le lot en deux. Une fiche seule trop lourde ne bloque pas les suivantes.
        if (lot.length > 1) {
          taille = Math.ceil(lot.length / 2);
          continue;
        }
        const ecritures = vide();
        file.delete(lot[0].id);
        ecritures.envoyees.push(lot[0].id);
        const retiree = lot[0].creation && oublier(lot[0].id, ecritures);
        await enOrdre(() => base.appliquer(ecritures));
        if (retiree) publier();
        o.signaler?.('Cette fiche est trop lourde pour être envoyée au serveur.');
        continue;
      }
      if (!reponse.ok) throw new Error('envoi refusé (' + reponse.statut + ')');
      const ecritures = vide();
      let change = false;
      for (const resultat of reponse.corps.resultats) {
        const entree = file.get(resultat.id);
        const encoreLaMeme = entree?.operation === resultat.operation;
        if (encoreLaMeme) {
          file.delete(resultat.id);
          ecritures.envoyees.push(resultat.id);
        }
        // Le serveur a gardé autre chose : sa version remplace la nôtre, sauf si l'on a déjà rechangé cette fiche.
        if (resultat.etat !== 'applique' && encoreLaMeme) {
          if (resultat.actuelle) change = adopter(resultat.id, resultat.actuelle, ecritures) || change;
          else change = oublier(resultat.id, ecritures) || change;
          if (resultat.etat === 'refuse') o.signaler?.(resultat.raison ?? 'Le serveur a refusé une modification.');
        }
      }
      await enOrdre(() => base.appliquer(ecritures));
      if (change) publier();
      // Un serveur qui ne répond rien sur un lot : on ne boucle pas.
      if (reponse.corps.resultats.length === 0) break;
    }
    return true;
  }

  async function recevoir() {
    for (;;) {
      const reponse = await o.transport.lire(o.route + '/synchro?depuis=' + encodeURIComponent(curseur));
      if (reponse.statut === 401 || reponse.statut === 403) return;
      if (!reponse.ok) throw new Error('lecture refusée (' + reponse.statut + ')');
      const ecritures = vide();
      let change = false;
      const { changements, encore, reinitialiser } = reponse.corps;
      if (reinitialiser) {
        // Absent trop longtemps : seul ce qui attend encore d'être envoyé reste.
        for (const id of [...connus.keys()]) if (!file.has(id)) change = oublier(id, ecritures) || change;
      }
      for (const changement of changements) {
        // Une modification locale attend son tour : elle partira, et le serveur tranchera.
        if (file.has(changement.id)) continue;
        if (changement.supprime) change = oublier(changement.id, ecritures) || change;
        else change = adopter(changement.id, changement.valeurs, ecritures) || change;
      }
      curseur = reponse.corps.curseur;
      ecritures.curseur = curseur;
      await enOrdre(() => base.appliquer(ecritures));
      if (change) publier();
      if (!encore) return;
    }
  }

  /** Envoie ce qui attend, puis reçoit ce qui a changé. Une seule à la fois. */
  function synchroniser() {
    if (!o.route || !pret) return Promise.resolve(false);
    if (enCours) {
      encoreUneFois = true;
      return enCours;
    }
    enCours = (async () => {
      try {
        do {
          encoreUneFois = false;
          observer(o.lire());
          await suite;
          if (await envoyer()) await recevoir();
        } while (encoreUneFois);
        return true;
      } finally {
        enCours = null;
      }
    })();
    return enCours;
  }

  return {
    observer,
    ouvrir,
    recharger,
    synchroniser,
    fermer: () => {
      pret = false;
      base = null;
    },
    enAttente: () => file.size,
    fini: () => suite,
  };
}

// ─── Le navigateur ──────────────────────────────────────────────────

const demande = (requete) => new Promise((ok, echec) => {
  requete.onsuccess = () => ok(requete.result);
  requete.onerror = () => echec(requete.error);
});
const finie = (transaction) => new Promise((ok, echec) => {
  transaction.oncomplete = () => ok();
  transaction.onerror = () => echec(transaction.error);
  transaction.onabort = () => echec(transaction.error);
});

function ouvrirIndexee(nom) {
  return new Promise((ok, echec) => {
    const requete = indexedDB.open(nom, 1);
    requete.onupgradeneeded = () => {
      const base = requete.result;
      base.createObjectStore('fiches', { keyPath: 'id' });
      base.createObjectStore('file', { keyPath: 'id' });
      base.createObjectStore('meta');
    };
    requete.onsuccess = () => ok(requete.result);
    requete.onerror = () => echec(requete.error);
    requete.onblocked = () => echec(new Error('base bloquée'));
  });
}

/** La clé de cette base : créée une fois, non extractible, gardée dans la base elle-même : aucun script ne peut la lire. */
async function cleDe(db) {
  const lue = await demande(db.transaction('meta').objectStore('meta').get('cle'));
  if (lue) return lue;
  const cle = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const transaction = db.transaction('meta', 'readwrite');
  // Un autre onglet a pu la créer pendant ce temps : la première écrite reste.
  const magasin = transaction.objectStore('meta');
  const deja = await demande(magasin.get('cle'));
  if (deja) return deja;
  magasin.put(cle, 'cle');
  await finie(transaction);
  return cle;
}

const encodeur = new TextEncoder();
const decodeur = new TextDecoder();

function scelleur(cle) {
  if (!cle) return { sceller: async (_id, v) => v, ouvrir: async (_id, v) => v };
  return {
    async sceller(id, valeur) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const donnees = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encodeur.encode(id) }, cle, encodeur.encode(JSON.stringify(valeur)));
      return { iv, donnees };
    },
    async ouvrir(id, contenu) {
      const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: contenu.iv, additionalData: encodeur.encode(id) }, cle, contenu.donnees);
      return JSON.parse(decodeur.decode(clair));
    },
  };
}

/** La base IndexedDB, chiffrée si demandé ; chiffrer se fait avant d'ouvrir la transaction, qui ne supporte pas l'attente. */
async function baseIndexee(nom, chiffree) {
  const db = await ouvrirIndexee(nom);
  const scelle = scelleur(chiffree ? await cleDe(db) : null);
  return {
    async lire() {
      const transaction = db.transaction(['fiches', 'file', 'meta']);
      const [fiches, file, curseur] = await Promise.all([
        demande(transaction.objectStore('fiches').getAll()),
        demande(transaction.objectStore('file').getAll()),
        demande(transaction.objectStore('meta').get('curseur')),
      ]);
      return {
        fiches: await Promise.all(fiches.map(async (f) => ({ id: f.id, ordre: f.ordre, valeurs: await scelle.ouvrir(f.id, f.contenu) }))),
        file: await Promise.all(file.map(async (e) => ({ id: e.id, operation: e.operation, modifieLe: e.modifieLe, supprime: e.supprime, creation: e.creation, ...(e.contenu ? { valeurs: await scelle.ouvrir(e.id, e.contenu) } : {}) }))),
        curseur: curseur ?? 0,
      };
    },
    async appliquer({ fiches, retirees, file, envoyees, curseur }) {
      const lignes = await Promise.all(fiches.map(async (f) => ({ id: f.id, ordre: f.ordre, contenu: await scelle.sceller(f.id, f.valeurs) })));
      const entrees = await Promise.all(file.map(async ({ valeurs, ...e }) => ({ ...e, ...(valeurs ? { contenu: await scelle.sceller(e.id, valeurs) } : {}) })));
      const transaction = db.transaction(['fiches', 'file', 'meta'], 'readwrite');
      const magasinFiches = transaction.objectStore('fiches');
      const magasinFile = transaction.objectStore('file');
      for (const ligne of lignes) magasinFiches.put(ligne);
      for (const id of retirees) magasinFiches.delete(id);
      for (const id of envoyees) magasinFile.delete(id);
      for (const entree of entrees) magasinFile.put(entree);
      if (curseur !== undefined) transaction.objectStore('meta').put(curseur, 'curseur');
      await finie(transaction);
    },
    fermer: () => db.close(),
  };
}

/** Une base en mémoire : ce navigateur refuse la sienne, la page marche quand même le temps de la visite. */
function baseEnMemoire() {
  const fiches = new Map(), file = new Map();
  let curseur = 0;
  return {
    lire: async () => ({ fiches: [...fiches.values()], file: [...file.values()], curseur }),
    appliquer: async (e) => {
      for (const f of e.fiches) fiches.set(f.id, f);
      for (const id of e.retirees) fiches.delete(id);
      for (const id of e.envoyees) file.delete(id);
      for (const l of e.file) file.set(l.id, l);
      if (e.curseur !== undefined) curseur = e.curseur;
    },
    fermer() {},
  };
}

/**
 * Une donnée locale dans le navigateur. Une base par compte : une session n'en voit jamais une autre,
 * et ce qui attend d'être envoyé reste au compte qui l'a écrit.
 * reglages : { cle, nom, chiffree, champs, route } ; lien : { lire, ecrire, transport, dire }.
 */
export function creerDonneeLocale(reglages, lien) {
  let minuteur = null;
  let reprise = REPRISE_MINIMUM;
  let veille = null;
  let baseOuverte = null;
  let compteOuvert;
  let canal = null;
  let misEnGarde = false;
  const moi = Math.random().toString(36).slice(2);

  const planifier = (delai = ATTENTE) => {
    clearTimeout(minuteur);
    minuteur = setTimeout(lancer, delai);
  };
  const coeur = creerCoeur({
    champs: reglages.champs,
    route: reglages.route,
    transport: lien.transport,
    lire: lien.lire,
    ecrire: lien.ecrire,
    planifier: () => planifier(),
    apresEcriture: () => canal?.postMessage(moi),
    signaler: (raison) => {
      if (typeof raison === 'string') lien.dire?.(raison, 'erreur');
      else console.error(raison);
    },
  });

  async function lancer() {
    if (!reglages.route || navigator.onLine === false) return;
    // Sans session, une route réservée n'a rien à dire : on attend la connexion.
    if (compteOuvert === null && !reglages.public) return;
    const travail = () => coeur.synchroniser().then(() => { reprise = REPRISE_MINIMUM; }, () => {
      // Pas de réseau, serveur en panne : on recommence de plus en plus lentement, sans rien dire.
      planifier(reprise);
      reprise = Math.min(reprise * 2, REPRISE_MAXIMUM);
    });
    // Plusieurs onglets ouverts : un seul synchronise à la fois.
    if (navigator.locks) await navigator.locks.request('humalis-synchro:' + reglages.cle + ':' + reglages.nom, async () => { await coeur.recharger(); await travail(); });
    else await travail();
    canal?.postMessage(moi);
  }

  async function ouvrirCompte(compte) {
    const nomBase = 'humalis:' + reglages.cle + ':locale:' + reglages.nom + ':' + (compte ?? 'visiteur');
    let base;
    try {
      if (reglages.chiffree && !globalThis.crypto?.subtle) throw new Error('chiffrement indisponible');
      base = await baseIndexee(nomBase, reglages.chiffree);
    } catch (erreur) {
      console.error(erreur);
      if (!misEnGarde) lien.dire?.("Ce navigateur ne garde pas les données sur l'appareil : elles seront perdues à la fermeture.", 'avertissement');
      misEnGarde = true;
      base = baseEnMemoire();
    }
    baseOuverte?.fermer();
    baseOuverte = base;
    canal?.close();
    canal = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(nomBase);
    if (canal) canal.onmessage = (evenement) => { if (evenement.data !== moi) void coeur.recharger(); };
    await coeur.ouvrir(base);
    planifier(0);
  }

  return {
    observer: coeur.observer,
    /** Appelé quand on connaît le compte (null : personne) ; sans route, une seule base pour l'appareil. */
    changerCompte(compte) {
      const voulu = reglages.route ? compte ?? null : 'appareil';
      if (voulu === compteOuvert) return;
      compteOuvert = voulu;
      void ouvrirCompte(voulu);
    },
    demarrer() {
      if (veille !== null || !reglages.route) return;
      addEventListener('online', () => planifier(0));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) planifier(0); });
      veille = setInterval(() => { if (!document.hidden) void lancer(); }, VEILLE);
    },
  };
}
`;

/** src/humalis/compte-securise.js */
export const COMPTE_SECURISE_JS = String.raw`// Produit par Humalis : les clés d'accès (WebAuthn) et l'écran du code à six chiffres.

const enOctets = (texte) => Uint8Array.from(atob(texte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(texte.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const enTexte = (octets) => btoa(String.fromCharCode(...new Uint8Array(octets))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const majuscule = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1);

/** Une fenêtre du système de la page : un titre, du contenu, Échap ou la croix pour fermer. */
function ouvrirFenetre(titre, surFermeture) {
  const dialogue = document.createElement('dialog');
  dialogue.className = 'humalis-securite';
  dialogue.style.cssText = 'color-scheme:light dark;background:Canvas;color:CanvasText;border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:12px;padding:24px;width:min(380px,calc(100vw - 32px));font:inherit;display:grid;gap:14px';
  const entete = document.createElement('div');
  entete.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px';
  const h = document.createElement('h2');
  h.textContent = titre;
  h.style.cssText = 'margin:0;font-size:1.15rem';
  const croix = document.createElement('button');
  croix.type = 'button';
  croix.textContent = '×';
  croix.setAttribute('aria-label', 'Fermer');
  croix.style.cssText = 'border:0;background:none;color:inherit;font-size:1.4rem;line-height:1;cursor:pointer;padding:4px 8px';
  entete.append(h, croix);
  const corps = document.createElement('div');
  corps.style.cssText = 'display:grid;gap:12px';
  const alerte = document.createElement('p');
  alerte.setAttribute('role', 'alert');
  alerte.style.cssText = 'margin:0;color:#c0392b;font-size:.92rem';
  alerte.hidden = true;
  dialogue.append(entete, corps, alerte);
  document.body.append(dialogue);
  const fermer = () => {
    if (dialogue.open) dialogue.close();
    dialogue.remove();
  };
  croix.onclick = () => { fermer(); surFermeture(); };
  dialogue.addEventListener('cancel', (e) => { e.preventDefault(); fermer(); surFermeture(); });
  dialogue.showModal();
  return {
    corps,
    fermer,
    dire(message) { alerte.textContent = message; alerte.hidden = !message; },
    vider() { corps.replaceChildren(); alerte.hidden = true; },
  };
}

function paragraphe(texte) {
  const p = document.createElement('p');
  p.textContent = texte;
  p.style.cssText = 'margin:0;line-height:1.45';
  return p;
}
function bouton(texte, principal, action) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texte;
  b.style.cssText = 'padding:10px 14px;border-radius:8px;font:inherit;cursor:pointer;' + (principal ? 'border:0;background:CanvasText;color:Canvas' : 'border:1px solid color-mix(in srgb,CanvasText 25%,transparent);background:none;color:inherit');
  b.onclick = action;
  return b;
}
function saisie(etiquette, reglages) {
  const label = document.createElement('label');
  label.style.cssText = 'display:grid;gap:6px';
  label.append(etiquette);
  const entree = document.createElement('input');
  Object.assign(entree, reglages);
  entree.style.cssText = 'padding:10px;border-radius:8px;border:1px solid color-mix(in srgb,CanvasText 30%,transparent);background:none;color:inherit;font:inherit';
  label.append(entree);
  return { label, entree };
}
const saisieCode = () => saisie('Code à six chiffres', { inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 9, required: true });

function dessinerQr(cadre, texte) {
  const dessiner = () => {
    const code = globalThis.qrcode(0, 'M');
    code.addData(texte);
    code.make();
    const taille = code.getModuleCount();
    const espace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(espace, 'svg');
    svg.setAttribute('viewBox', '-2 -2 ' + (taille + 4) + ' ' + (taille + 4));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Code QR à scanner dans une application d\'authentification');
    svg.style.cssText = 'width:210px;height:210px;background:#fff;border-radius:8px;justify-self:center';
    let chemin = '';
    for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) if (code.isDark(y, x)) chemin += 'M' + x + ' ' + y + 'h1v1h-1z';
    const trace = document.createElementNS(espace, 'path');
    trace.setAttribute('d', chemin);
    trace.setAttribute('fill', '#000');
    svg.append(trace);
    cadre.replaceChildren(svg);
    cadre.style.display = 'grid';
  };
  if (globalThis.qrcode) return dessiner();
  const script = document.createElement('script');
  script.src = '/humalis/qrcode.js';
  script.onload = dessiner;
  document.head.append(script);
}

/** o : { base, credentials, entetes(), relire(), dire(message, genre) } */
export function creerCompteSecurise(o) {
  async function appeler(chemin, corps, methode = 'POST') {
    const reponse = await fetch(o.base + chemin, { method: methode, headers: o.entetes(), credentials: o.credentials, ...(methode === 'GET' ? {} : { body: JSON.stringify(corps ?? {}) }) });
    const donnees = await reponse.json().catch(() => ({}));
    return { ok: reponse.ok, statut: reponse.status, corps: donnees };
  }
  const raisonDe = (reponse, sinon) => (reponse.statut === 429 ? 'Trop de tentatives. Réessayez dans quelques minutes.' : typeof reponse.corps?.erreur === 'string' ? majuscule(reponse.corps.erreur) + '.' : sinon);
  const refuser = (message, dansUnEssai) => {
    if (dansUnEssai) throw new Error(message);
    o.dire(message, 'erreur');
    return false;
  };
  const sansReseau = "Le serveur n'a pas répondu. Réessayez dans un instant.";

  /** Après un mot de passe juste, quand le compte a le code : vrai si la session est ouverte. */
  function demanderCode(jeton) {
    return new Promise((resoudre) => {
      const fenetre = ouvrirFenetre('Code de vérification', () => resoudre(false));
      let secours = false;
      const dessiner = () => {
        fenetre.vider();
        const { label, entree } = secours ? saisie('Code de secours', { autocomplete: 'off', maxLength: 9, required: true }) : saisieCode();
        const formulaire = document.createElement('form');
        formulaire.style.cssText = 'display:grid;gap:12px';
        const envoi = bouton('Vérifier', true);
        envoi.type = 'submit';
        formulaire.append(label, envoi);
        formulaire.onsubmit = async (e) => {
          e.preventDefault();
          envoi.disabled = true;
          try {
            const reponse = await appeler('/auth/double/verifier', { jeton, code: entree.value });
            if (reponse.ok) {
              fenetre.fermer();
              await o.relire();
              return resoudre(true);
            }
            fenetre.dire(raisonDe(reponse, 'Ce code est incorrect.'));
            entree.value = '';
            entree.focus();
          } catch {
            fenetre.dire(sansReseau);
          }
          envoi.disabled = false;
        };
        fenetre.corps.append(paragraphe(secours ? 'Saisissez un de vos codes de secours : il ne servira qu’une fois.' : 'Saisissez le code affiché par votre application d’authentification.'), formulaire, bouton(secours ? 'Utiliser le code à six chiffres' : 'Utiliser un code de secours', false, () => { secours = !secours; dessiner(); }));
        entree.focus();
      };
      dessiner();
    });
  }

  function motDePasse(titre) {
    return new Promise((resoudre) => {
      const fenetre = ouvrirFenetre(titre, () => resoudre(null));
      const { label, entree } = saisie('Votre mot de passe', { type: 'password', autocomplete: 'current-password', required: true });
      const formulaire = document.createElement('form');
      formulaire.style.cssText = 'display:grid;gap:12px';
      const envoi = bouton('Continuer', true);
      envoi.type = 'submit';
      formulaire.append(label, envoi);
      formulaire.onsubmit = (e) => { e.preventDefault(); fenetre.fermer(); resoudre(entree.value); };
      fenetre.corps.append(formulaire);
      entree.focus();
    });
  }

  function montrerCodes(fenetre, codes, fin) {
    fenetre.vider();
    const liste = document.createElement('pre');
    liste.textContent = codes.join('\n');
    liste.style.cssText = 'margin:0;padding:12px;border-radius:8px;background:color-mix(in srgb,CanvasText 8%,transparent);columns:2;font-size:1rem';
    const copier = bouton('Copier', false, async () => {
      await navigator.clipboard?.writeText(codes.join('\n')).catch(() => undefined);
      copier.textContent = 'Copié';
    });
    fenetre.corps.append(paragraphe('Gardez ces codes en lieu sûr : chacun remplace une fois le code à six chiffres. Ils ne seront plus affichés.'), liste, copier, bouton('J’ai gardé ces codes', true, () => { fenetre.fermer(); fin(); }));
  }

  async function activer(dansUnEssai = false) {
    let etat;
    try { etat = await appeler('/auth/double', undefined, 'GET'); } catch { return refuser(sansReseau, dansUnEssai); }
    if (etat.statut === 401) return refuser('Connectez-vous pour continuer.', dansUnEssai);
    if (!etat.ok) return refuser(raisonDe(etat, sansReseau), dansUnEssai);
    if (etat.corps.actif) return gerer(etat.corps.codesRestants);
    let reponse;
    let preuve = {};
    if (etat.corps.motDePasseRequis) {
      const saisi = await motDePasse('Confirmez votre mot de passe');
      if (saisi === null) return false;
      preuve = { motDePasse: saisi };
    }
    try { reponse = await appeler('/auth/double/activer', preuve); } catch { return refuser(sansReseau, dansUnEssai); }
    if (!reponse.ok) return refuser(raisonDe(reponse, "La double authentification n'a pas pu commencer."), dansUnEssai);
    return new Promise((resoudre) => {
      const fenetre = ouvrirFenetre('Double authentification', () => resoudre(false));
      const qr = document.createElement('div');
      qr.style.cssText = 'display:grid;min-height:210px';
      dessinerQr(qr, reponse.corps.uri);
      const cle = paragraphe('Clé à saisir à la main : ' + reponse.corps.secret);
      cle.style.cssText += ';font-size:.85rem;overflow-wrap:anywhere';
      const { label, entree } = saisieCode();
      const formulaire = document.createElement('form');
      formulaire.style.cssText = 'display:grid;gap:12px';
      const envoi = bouton('Activer', true);
      envoi.type = 'submit';
      formulaire.append(label, envoi);
      formulaire.onsubmit = async (e) => {
        e.preventDefault();
        envoi.disabled = true;
        try {
          const fin = await appeler('/auth/double/confirmer', { code: entree.value });
          if (fin.ok) return montrerCodes(fenetre, fin.corps.codesSecours, () => resoudre(true));
          fenetre.dire(raisonDe(fin, 'Ce code est incorrect.'));
          entree.value = '';
        } catch {
          fenetre.dire(sansReseau);
        }
        envoi.disabled = false;
      };
      fenetre.corps.append(paragraphe('Scannez ce code dans votre application d’authentification, puis saisissez le code qu’elle affiche.'), qr, cle, formulaire);
      entree.focus();
    });
  }

  function gerer(codesRestants) {
    return new Promise((resoudre) => {
      const fenetre = ouvrirFenetre('Double authentification', () => resoudre(false));
      const { label, entree } = saisieCode();
      const agir = async (chemin) => {
        try {
          const reponse = await appeler(chemin, { code: entree.value });
          if (!reponse.ok) return fenetre.dire(raisonDe(reponse, 'Ce code est incorrect.'));
          if (reponse.corps.codesSecours) return montrerCodes(fenetre, reponse.corps.codesSecours, () => resoudre(true));
          fenetre.fermer();
          o.dire('La double authentification est désactivée.', 'reussite');
          resoudre(true);
        } catch {
          fenetre.dire(sansReseau);
        }
      };
      fenetre.corps.append(paragraphe('La double authentification est active. Codes de secours restants : ' + codesRestants + '.'), label, bouton('Nouveaux codes de secours', true, () => agir('/auth/double/codes')), bouton('Désactiver', false, () => agir('/auth/double/desactiver')));
      entree.focus();
    });
  }

  const reponseClef = (identite) => ({
    id: identite.id,
    rawId: enTexte(identite.rawId),
    type: identite.type,
    clientExtensionResults: identite.getClientExtensionResults(),
    authenticatorAttachment: identite.authenticatorAttachment ?? undefined,
  });

  async function ajouterCle(dansUnEssai = false) {
    if (!globalThis.PublicKeyCredential) return refuser("Cet appareil ne gère pas les clés d'accès.", dansUnEssai);
    let reponse;
    try {
      reponse = await appeler('/auth/cle-acces/inscription/options', {});
      if (reponse.statut === 403 && reponse.corps?.motDePasseRequis) {
        const saisi = await motDePasse('Confirmez votre mot de passe');
        if (saisi === null) return false;
        reponse = await appeler('/auth/cle-acces/inscription/options', { motDePasse: saisi });
      }
    } catch { return refuser(sansReseau, dansUnEssai); }
    if (reponse.statut === 401) return refuser('Connectez-vous pour continuer.', dansUnEssai);
    if (!reponse.ok) return refuser(raisonDe(reponse, "La clé d'accès n'a pas pu être préparée."), dansUnEssai);
    const options = reponse.corps;
    let identite;
    try {
      identite = await navigator.credentials.create({ publicKey: { ...options, challenge: enOctets(options.challenge), user: { ...options.user, id: enOctets(options.user.id) }, excludeCredentials: (options.excludeCredentials ?? []).map((c) => ({ ...c, id: enOctets(c.id) })) } });
    } catch (erreur) {
      return refuser(erreur?.name === 'InvalidStateError' ? "Cet appareil a déjà une clé d'accès pour ce compte." : "La création de la clé d'accès a été annulée.", dansUnEssai);
    }
    const r = identite.response;
    try {
      const fin = await appeler('/auth/cle-acces/inscription/verifier', {
        reponse: { ...reponseClef(identite), response: { clientDataJSON: enTexte(r.clientDataJSON), attestationObject: enTexte(r.attestationObject), transports: r.getTransports?.() ?? [] } },
        nom: navigator.userAgentData?.platform ?? navigator.platform ?? 'Appareil',
      });
      if (!fin.ok) return refuser(raisonDe(fin, "Cette clé d'accès n'a pas été acceptée."), dansUnEssai);
    } catch { return refuser(sansReseau, dansUnEssai); }
    o.dire("Clé d'accès ajoutée.", 'reussite');
    return true;
  }

  async function seConnecterParCle(dansUnEssai = false) {
    if (!globalThis.PublicKeyCredential) return refuser("Cet appareil ne gère pas les clés d'accès.", dansUnEssai);
    let debut;
    try { debut = await appeler('/auth/cle-acces/connexion/options', {}); } catch { return refuser(sansReseau, dansUnEssai); }
    if (!debut.ok) return refuser(raisonDe(debut, "La connexion n'a pas pu commencer."), dansUnEssai);
    const options = debut.corps.options;
    let identite;
    try {
      identite = await navigator.credentials.get({ publicKey: { ...options, challenge: enOctets(options.challenge), allowCredentials: [] } });
    } catch {
      return refuser("La connexion par clé d'accès a été annulée.", dansUnEssai);
    }
    const r = identite.response;
    try {
      const fin = await appeler('/auth/cle-acces/connexion/verifier', {
        ceremonie: debut.corps.ceremonie,
        reponse: { ...reponseClef(identite), response: { clientDataJSON: enTexte(r.clientDataJSON), authenticatorData: enTexte(r.authenticatorData), signature: enTexte(r.signature), ...(r.userHandle ? { userHandle: enTexte(r.userHandle) } : {}) } },
      });
      if (!fin.ok) return refuser(raisonDe(fin, "Cette clé d'accès n'est pas reconnue."), dansUnEssai);
    } catch { return refuser(sansReseau, dansUnEssai); }
    await o.relire();
    return true;
  }

  return { demanderCode, activer, ajouterCle, seConnecterParCle };
}
`;
