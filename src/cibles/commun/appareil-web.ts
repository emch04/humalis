/**
 * Les fonctions de l'appareil sur le web, avec les API du navigateur. Le même fichier sert
 * au moteur de Humalis et à React. Aucune simulation : si le navigateur ne sait pas faire,
 * la personne le lit, et la suite ne s'exécute pas.
 */
import type { Application } from '../../ri/types.js';

const MOTIF = /"type":"(prisePhoto|enregistrerAudio|enregistrerVideo|recadrerPhoto|scanCode|verificationIdentite|vibration|localisation)"|"genre":"signature"|"enAttente":true|"horsLigne":true/;
const texte = (a: Application) => JSON.stringify([a.ecrans, a.composants, a.disposition, a.partages]);

export const utiliseAppareil = (application: Application) => MOTIF.test(texte(application));
export const utiliseFileEnvois = (application: Application) => /"enAttente":true|"horsLigne":true/.test(texte(application));

/** src/humalis/appareil.d.ts (React) */
export const APPAREIL_TYPES = `export const appareil: {
  prendrePhoto(): Promise<File | null>;
  enregistrerMedia(media: 'audio' | 'video'): Promise<File | null>;
  recadrerPhoto(fichier: File): Promise<File | null>;
  scannerCode(): Promise<string | null>;
  position(): Promise<{ latitude: number; longitude: number; precision: number } | null>;
  verifierIdentite(): Promise<boolean>;
  vibrer(): void;
  signature(cadre: HTMLElement, surChange: (valeur: string) => void): HTMLElement;
  envoyerHorsLigne(methode: 'POST' | 'PATCH' | 'DELETE', adresse: string, corps?: unknown): Promise<void>;
};
`;

/** Le module partagé : du JavaScript sans dépendance. */
export const APPAREIL_JS = String.raw`// Produit par Humalis : les fonctions de l'appareil, avec les API du navigateur.
const BASE = import.meta.env.VITE_HUMALIS_SERVEUR ?? '';
const dire = (texte, genre = 'erreur') => window.dispatchEvent(new CustomEvent('humalis:message', { detail: { texte, genre } }));

function prendrePhoto() {
  return new Promise((ok) => {
    const champ = document.createElement('input');
    champ.type = 'file';
    champ.accept = 'image/*';
    champ.capture = 'environment';
    champ.addEventListener('change', () => ok(champ.files?.[0] ?? null), { once: true });
    champ.addEventListener('cancel', () => ok(null), { once: true });
    champ.click();
  });
}

/** Enregistrement avec aperçu, durée, arrêt, validation et annulation. */
async function enregistrerMedia(media) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    dire('Cet appareil ne permet pas cet enregistrement.');
    return null;
  }
  let flux;
  try {
    flux = await navigator.mediaDevices.getUserMedia(media === 'audio' ? { audio: true } : { audio: true, video: { facingMode: 'environment' } });
  } catch {
    dire("L'accès au micro ou à la caméra est refusé sur cet appareil.");
    return null;
  }
  return new Promise((resolve) => {
    const dialogue = document.createElement('dialog');
    const titre = document.createElement('h2');
    titre.textContent = media === 'audio' ? 'Enregistrer un audio' : 'Enregistrer une vidéo';
    const duree = document.createElement('p');
    duree.setAttribute('role', 'timer');
    duree.textContent = '00:00';
    const apercu = document.createElement(media === 'audio' ? 'audio' : 'video');
    apercu.controls = true;
    apercu.style.cssText = 'display:block;max-width:100%;max-height:60vh';
    const demarrer = document.createElement('button'); demarrer.textContent = 'Démarrer';
    const arreter = document.createElement('button'); arreter.textContent = 'Arrêter'; arreter.disabled = true;
    const valider = document.createElement('button'); valider.textContent = 'Valider'; valider.disabled = true;
    const annuler = document.createElement('button'); annuler.textContent = 'Annuler';
    for (const bouton of [demarrer, arreter, valider, annuler]) bouton.type = 'button';
    dialogue.append(titre, duree, apercu, demarrer, arreter, valider, annuler);
    document.body.append(dialogue);
    dialogue.showModal();
    let enregistreur;
    let fichier = null;
    let url;
    let horloge;
    let debut;
    let fini = false;
    const nettoyer = (resultat) => {
      if (fini) return;
      fini = true;
      clearInterval(horloge);
      for (const piste of flux.getTracks()) piste.stop();
      if (enregistreur?.state === 'recording') enregistreur.stop();
      if (url) URL.revokeObjectURL(url);
      dialogue.close(); dialogue.remove();
      resolve(resultat);
    };
    demarrer.onclick = () => {
      const morceaux = [];
      fichier = null;
      if (url) URL.revokeObjectURL(url);
      url = undefined;
      apercu.removeAttribute('src');
      try { enregistreur = new MediaRecorder(flux); }
      catch { dire('Le format demandé ne peut pas être enregistré.'); nettoyer(null); return; }
      enregistreur.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data); };
      enregistreur.onstop = () => {
        if (fini) return;
        const type = enregistreur.mimeType || (media === 'audio' ? 'audio/webm' : 'video/webm');
        const blob = new Blob(morceaux, { type });
        if (!blob.size) { dire("L'enregistrement est vide."); demarrer.disabled = false; return; }
        const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
        fichier = new File([blob], media + '.' + ext, { type });
        url = URL.createObjectURL(fichier);
        apercu.src = url;
        apercu.controls = true;
        valider.disabled = false;
        demarrer.disabled = false;
      };
      enregistreur.onerror = () => { dire("L'enregistrement a échoué."); nettoyer(null); };
      enregistreur.start();
      debut = Date.now();
      const afficherDuree = () => { const s = Math.floor((Date.now() - debut) / 1000); duree.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
      horloge = setInterval(afficherDuree, 250);
      demarrer.disabled = true; arreter.disabled = false; valider.disabled = true;
      if (media === 'video') { apercu.srcObject = flux; apercu.muted = true; apercu.play().catch(() => undefined); }
    };
    arreter.onclick = () => {
      if (enregistreur?.state !== 'recording') return;
      clearInterval(horloge);
      arreter.disabled = true;
      apercu.pause(); apercu.srcObject = null; apercu.muted = false;
      enregistreur.stop();
    };
    valider.onclick = () => { if (fichier) nettoyer(fichier); };
    annuler.onclick = () => nettoyer(null);
    dialogue.addEventListener('cancel', (e) => { e.preventDefault(); nettoyer(null); });
  });
}

async function recadrerPhoto(fichier) {
  if (!(fichier instanceof Blob) || !fichier.type.startsWith('image/')) {
    dire('La variable ne contient pas une image à recadrer.');
    return null;
  }
  const url = URL.createObjectURL(fichier);
  const image = new Image();
  try { image.src = url; await image.decode(); }
  catch { URL.revokeObjectURL(url); dire("L'image ne peut pas être ouverte."); return null; }
  return new Promise((resolve) => {
    const dialogue = document.createElement('dialog');
    const titre = document.createElement('h2'); titre.textContent = 'Recadrer la photo';
    const canvas = document.createElement('canvas');
    const largeur = Math.min(800, image.naturalWidth);
    const echelle = largeur / image.naturalWidth;
    canvas.width = largeur; canvas.height = Math.round(image.naturalHeight * echelle);
    canvas.style.cssText = 'display:block;max-width:90vw;max-height:65vh;touch-action:none;cursor:crosshair';
    const ctx = canvas.getContext('2d');
    let selection = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    let depart;
    const dessiner = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
    };
    const point = (e) => { const r = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(canvas.width, (e.clientX - r.left) * canvas.width / r.width)), y: Math.max(0, Math.min(canvas.height, (e.clientY - r.top) * canvas.height / r.height)) }; };
    canvas.onpointerdown = (e) => { depart = point(e); canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = (e) => { if (!depart) return; const p = point(e); selection = { x: Math.min(depart.x,p.x), y: Math.min(depart.y,p.y), w: Math.abs(p.x-depart.x), h: Math.abs(p.y-depart.y) }; dessiner(); };
    canvas.onpointerup = () => { depart = undefined; };
    const aide = document.createElement('p'); aide.textContent = 'Tracez un rectangle sur la photo.';
    const valider = document.createElement('button'); valider.type = 'button'; valider.textContent = 'Valider';
    const annuler = document.createElement('button'); annuler.type = 'button'; annuler.textContent = 'Annuler';
    dialogue.append(titre, aide, canvas, valider, annuler); document.body.append(dialogue); dialogue.showModal(); dessiner();
    let fini = false;
    const fermer = (resultat) => { if (fini) return; fini = true; URL.revokeObjectURL(url); dialogue.close(); dialogue.remove(); resolve(resultat); };
    annuler.onclick = () => fermer(null);
    dialogue.addEventListener('cancel', (e) => { e.preventDefault(); fermer(null); });
    valider.onclick = () => {
      if (selection.w < 2 || selection.h < 2) { dire('Tracez une zone à conserver.'); return; }
      const sortie = document.createElement('canvas');
      sortie.width = Math.round(selection.w / echelle); sortie.height = Math.round(selection.h / echelle);
      sortie.getContext('2d').drawImage(image, selection.x / echelle, selection.y / echelle, selection.w / echelle, selection.h / echelle, 0, 0, sortie.width, sortie.height);
      sortie.toBlob((blob) => {
        if (!blob) { dire('Le recadrage a échoué.'); return; }
        fermer(new File([blob], (fichier.name || 'photo').replace(/\.[^.]+$/, '') + '-recadree.png', { type: 'image/png' }));
      }, 'image/png');
    };
  });
}

async function scannerCode() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    dire('Ce navigateur ne sait pas lire les codes.');
    return null;
  }
  let flux;
  try {
    flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    dire("L'accès à la caméra est refusé sur cet appareil.");
    return null;
  }
  const fenetre = document.createElement('dialog');
  const video = document.createElement('video');
  const annuler = document.createElement('button');
  video.muted = true;
  video.setAttribute('playsinline', '');
  video.style.cssText = 'display:block;max-width:100%;max-height:70vh';
  video.setAttribute('aria-label', 'Image de la caméra');
  annuler.type = 'button';
  annuler.textContent = 'Annuler';
  fenetre.append(video, annuler);
  document.body.append(fenetre);
  fenetre.showModal();
  video.srcObject = flux;
  await video.play().catch(() => undefined);
  const lecteur = new BarcodeDetector();
  return new Promise((ok) => {
    let fini = false;
    const finir = (valeur) => {
      if (fini) return;
      fini = true;
      for (const piste of flux.getTracks()) piste.stop();
      fenetre.close();
      fenetre.remove();
      ok(valeur);
    };
    annuler.addEventListener('click', () => finir(null));
    fenetre.addEventListener('cancel', () => finir(null));
    const regarder = async () => {
      if (fini) return;
      const trouves = await lecteur.detect(video).catch(() => []);
      if (trouves.length > 0) finir(trouves[0].rawValue);
      else setTimeout(regarder, 200);
    };
    void regarder();
  });
}

function position() {
  return new Promise((ok) => {
    if (!navigator.geolocation) {
      dire('Cet appareil ne donne pas sa position.');
      ok(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => ok({ latitude: coords.latitude, longitude: coords.longitude, precision: coords.accuracy }),
      (erreur) => {
        dire(erreur.code === 1 ? "L'accès à la position est refusé sur cet appareil." : "La position n'a pas pu être lue.");
        ok(null);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

const CLE_IDENTITE = 'humalis-identite';
const hasard = (n) => crypto.getRandomValues(new Uint8Array(n));
const verifie = (donnees) => (new Uint8Array(donnees)[32] & 4) !== 0;

/** Touch ID, Face ID, Windows Hello ou le code de l'appareil. Cette vérification reste sur l'appareil : elle ne protège pas le serveur. */
async function verifierIdentite() {
  try {
    if (!window.PublicKeyCredential || !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return false;
    const gardee = localStorage.getItem(CLE_IDENTITE);
    if (gardee) {
      const id = Uint8Array.from(atob(gardee), (c) => c.charCodeAt(0));
      const preuve = await navigator.credentials.get({ publicKey: { challenge: hasard(32), allowCredentials: [{ type: 'public-key', id }], userVerification: 'required', timeout: 60000 } });
      return verifie(preuve.response.authenticatorData);
    }
    const creee = await navigator.credentials.create({
      publicKey: {
        rp: { name: document.title || location.hostname },
        user: { id: hasard(16), name: 'humalis', displayName: 'Humalis' },
        challenge: hasard(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000,
      },
    });
    localStorage.setItem(CLE_IDENTITE, btoa(String.fromCharCode(...new Uint8Array(creee.rawId))));
    return true;
  } catch {
    return false;
  }
}

function vibrer() {
  navigator.vibrate?.(60);
}

function signature(cadre, surChange) {
  if (cadre.humalisSignature) {
    cadre.humalisSignature.surChange = surChange;
    return cadre;
  }
  const etat = { surChange };
  cadre.humalisSignature = etat;
  const feuille = document.createElement('canvas');
  const effacer = document.createElement('button');
  feuille.width = 600;
  feuille.height = 200;
  feuille.setAttribute('role', 'img');
  feuille.setAttribute('aria-label', 'Zone de signature');
  feuille.style.cssText = 'display:block;width:100%;max-width:600px;height:200px;border:1px solid currentColor;border-radius:6px;touch-action:none;background:#fff';
  effacer.type = 'button';
  effacer.textContent = 'Effacer la signature';
  cadre.append(feuille, effacer);
  const crayon = feuille.getContext('2d');
  crayon.lineWidth = 2;
  crayon.lineCap = 'round';
  crayon.strokeStyle = '#111';
  const point = (e) => {
    const r = feuille.getBoundingClientRect();
    return [((e.clientX - r.left) * feuille.width) / r.width, ((e.clientY - r.top) * feuille.height) / r.height];
  };
  let trace = false;
  feuille.addEventListener('pointerdown', (e) => {
    trace = true;
    feuille.setPointerCapture(e.pointerId);
    crayon.beginPath();
    crayon.moveTo(...point(e));
  });
  feuille.addEventListener('pointermove', (e) => {
    if (!trace) return;
    crayon.lineTo(...point(e));
    crayon.stroke();
  });
  const lever = () => {
    if (!trace) return;
    trace = false;
    etat.surChange(feuille.toDataURL('image/png'));
  };
  feuille.addEventListener('pointerup', lever);
  feuille.addEventListener('pointercancel', lever);
  effacer.addEventListener('click', () => {
    crayon.clearRect(0, 0, feuille.width, feuille.height);
    etat.surChange('');
  });
  return cadre;
}

// ─── Les envois qui attendent le réseau ──────────────────────────────
// Chaque envoi appartient au compte qui l'a fait : il attend, même après une déconnexion, que cette personne revienne.
const TRENTE_JOURS = 30 * 24 * 60 * 60 * 1000;
let compte;
let enCours = false;
let relance;

const cleFile = () => 'humalis-envois:' + (compte ?? 'visiteur');
const lireFile = () => {
  try {
    return JSON.parse(localStorage.getItem(cleFile()) ?? '[]');
  } catch {
    return [];
  }
};
const ecrireFile = (file) => {
  try {
    localStorage.setItem(cleFile(), JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
};

function entetes(id) {
  const liste = new Headers({ 'Content-Type': 'application/json', 'X-Humalis-Envoi': id });
  const jeton = document.cookie.match(/(?:^|; )astratra_csrf=([^;]*)/)?.[1];
  if (jeton) liste.set('x-csrf-token', decodeURIComponent(jeton));
  return liste;
}

const parti = (envoi) =>
  fetch(BASE + envoi.adresse, { method: envoi.methode, headers: entetes(envoi.id), credentials: BASE ? 'include' : 'same-origin', ...(envoi.corps === undefined ? {} : { body: JSON.stringify(envoi.corps) }) });

const raison = async (reponse) => {
  const corps = await reponse.json().catch(() => null);
  return typeof corps?.erreur === 'string' ? corps.erreur.charAt(0).toUpperCase() + corps.erreur.slice(1) + '.' : "L'envoi a été refusé.";
};

/** Les envois partent dans l'ordre. On s'arrête au premier qui ne peut pas partir maintenant. */
async function viderFile() {
  if (enCours || compte === undefined) return;
  enCours = true;
  clearTimeout(relance);
  try {
    let file = lireFile();
    const avant = file.length;
    file = file.filter((envoi) => Date.now() - envoi.depuis < TRENTE_JOURS);
    if (file.length < avant) {
      ecrireFile(file);
      dire('Des envois trop anciens ont été effacés.', 'avertissement');
    }
    while (file.length > 0) {
      let reponse;
      try {
        reponse = await parti(file[0]);
      } catch {
        return;
      }
      if (reponse.status === 401 || reponse.status === 409 || reponse.status === 429 || reponse.status >= 500) {
        relance = setTimeout(viderFile, 15000);
        return;
      }
      if (!reponse.ok) dire(await raison(reponse));
      file = file.slice(1);
      ecrireFile(file);
    }
  } finally {
    enCours = false;
  }
}

async function envoyerHorsLigne(methode, adresse, corps) {
  const envoi = { id: crypto.randomUUID(), methode, adresse, corps, depuis: Date.now() };
  const garder = () => {
    if (ecrireFile([...lireFile(), envoi])) dire('Pas de réseau : ce sera envoyé au retour de la connexion.', 'info');
    else dire("Cet envoi n'a pas pu être gardé sur cet appareil.");
  };
  // Ce qui attend part d'abord : l'ordre des envois est gardé.
  if (!navigator.onLine || lireFile().length > 0) {
    garder();
    void viderFile();
    return;
  }
  try {
    const reponse = await parti(envoi);
    if (!reponse.ok && reponse.status < 500) dire(await raison(reponse));
    else if (!reponse.ok) garder();
  } catch {
    // Parti ou pas, on ne sait pas : le même identifiant évite un doublon au renvoi.
    garder();
  }
}

// Ce qui a été lu « hors ligne » appartient à ce compte : la personne suivante ne le verra pas.
window.addEventListener('humalis:deconnexion', () => {
  try {
    for (const cle of Object.keys(localStorage)) if (cle.startsWith('humalis-hors-ligne:')) localStorage.removeItem(cle);
  } catch {
    // Le navigateur refuse l'accès au stockage : il n'y a rien à effacer.
  }
});
window.addEventListener('online', () => void viderFile());
window.addEventListener('humalis:session', (e) => {
  compte = e.detail ?? null;
  void viderFile();
});

export const appareil = { prendrePhoto, enregistrerMedia, recadrerPhoto, scannerCode, position, verifierIdentite, vibrer, signature, envoyerHorsLigne };
`;
