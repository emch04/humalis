/**
 * Les réunions sur le web et le bureau, par LiveKit. La barre (micro, caméra, écran, main) s'écrit en
 * Humalis ; ici, seulement l'image des participants et les gestes. Un élément propre, <humalis-reunion>,
 * se branche sur la réunion en cours où qu'il soit dans la page.
 */
import type { Application } from '../../ri/types.js';

/** Publiée avant le 1er novembre 2026. */
export const VERSION_LIVEKIT_WEB = '2.23.0';

export const utiliseReunion = (application: Application): boolean => JSON.stringify([application.ecrans, application.composants]).includes('"type":"gesteReunion"');

/** Les images des participants : une grille qui suit la largeur. */
export const REUNION_CSS = `humalis-reunion { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); width: 100%; }
.humalis-reunion-tuile { position: relative; margin: 0; aspect-ratio: 16 / 9; background: #1c1c1e; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.humalis-reunion-tuile video { width: 100%; height: 100%; object-fit: cover; }
.humalis-reunion-tuile figcaption { position: absolute; left: 8px; bottom: 6px; color: #fff; font-size: 13px; text-shadow: 0 1px 2px #000; }
.humalis-reunion-initiale { color: #fff; font-size: 40px; }
`;

export const REUNION_JS = String.raw`// Produit par Humalis : la réunion en cours, par LiveKit.
import { DisconnectReason, Room, RoomEvent, Track } from 'livekit-client';
import { serveur } from './serveur.js';
import { afficherMessage } from './outils.js';
// Une feuille à part : la politique de contenu du bureau refuse les styles écrits dans la page.
import './reunion.css';

let salle = '';
let piece;
let vue;

function annoncer() {
  if (salle) serveur.envoyer('/api/salles_geste', { salle, participant: '', geste: 'etat' }).catch(() => undefined);
}

/**
 * Une seule image par piste, gardée d'un dessin à l'autre : LiveKit suspend une vidéo dont l'image a quitté la page
 * (« adaptiveStream »), il ne faut donc pas en créer une nouvelle à chaque changement.
 */
const videos = new Map();
function videoDe(track) {
  let video = videos.get(track.sid);
  if (!video) {
    video = track.attach();
    videos.set(track.sid, video);
  }
  return video;
}
function oublierVideo(track) {
  const video = videos.get(track.sid);
  if (video) track.detach(video);
  videos.delete(track.sid);
}

/**
 * Les tuiles, gardées d'un dessin à l'autre et seulement mises à jour : LiveKit juge une image visible d'après sa
 * place dans la page, une tuile retirée puis remise pourrait voir sa vidéo suspendue.
 */
const tuiles = new Map();

function mettreAJour(cadre, participant, publication, local) {
  const voulue = publication?.track && !publication.isMuted ? videoDe(publication.track) : undefined;
  let contenu = cadre.firstElementChild;
  if (voulue) {
    voulue.muted = local;
    voulue.setAttribute('aria-label', participant.name || participant.identity);
    if (contenu !== voulue) {
      if (contenu && contenu.tagName !== 'FIGCAPTION') contenu.remove();
      cadre.prepend(voulue);
    }
  } else if (!contenu || contenu.tagName === 'VIDEO') {
    contenu?.remove();
    const initiale = document.createElement('span');
    initiale.className = 'humalis-reunion-initiale';
    initiale.textContent = (participant.name || participant.identity || '?').charAt(0).toUpperCase();
    cadre.prepend(initiale);
  }
  const micro = participant.getTrackPublication(Track.Source.Microphone);
  cadre.querySelector('figcaption').textContent = (participant.name || participant.identity) + (participant.attributes?.main === '1' ? ' ✋' : '') + (!micro || micro.isMuted ? ' (micro coupé)' : '');
}

function dessiner() {
  if (!vue) return;
  if (!piece) {
    vue.replaceChildren();
    tuiles.clear();
    return;
  }
  const voulues = [];
  for (const p of [piece.localParticipant, ...piece.remoteParticipants.values()]) {
    const local = p === piece.localParticipant;
    const ecran = p.getTrackPublication(Track.Source.ScreenShare);
    const sortes = ecran?.track ? [['ecran', ecran], ['camera', p.getTrackPublication(Track.Source.Camera)]] : [['camera', p.getTrackPublication(Track.Source.Camera)]];
    for (const [sorte, publication] of sortes) {
      const cle = p.identity + ':' + sorte;
      let cadre = tuiles.get(cle);
      if (!cadre) {
        cadre = document.createElement('figure');
        cadre.className = 'humalis-reunion-tuile';
        cadre.append(document.createElement('figcaption'));
        tuiles.set(cle, cadre);
      }
      mettreAJour(cadre, p, publication, local || sorte === 'ecran');
      voulues.push(cadre);
    }
  }
  for (const [cle, cadre] of tuiles) {
    if (!voulues.includes(cadre)) {
      cadre.remove();
      tuiles.delete(cle);
    }
  }
  voulues.forEach((cadre, i) => {
    if (vue.children[i] !== cadre) vue.insertBefore(cadre, vue.children[i] ?? null);
  });
}

/** Le son des autres : hors de l'image, il continue quand la page se redessine. */
function brancherSon(track) {
  if (track.kind !== Track.Kind.Audio) return;
  const son = track.attach();
  son.dataset.humalisReunion = '1';
  document.body.append(son);
}

class HumalisReunion extends HTMLElement {
  connectedCallback() {
    // Une nouvelle image (la page s'est redessinée) : les tuiles y passent.
    if (vue !== this) {
      vue = this;
      tuiles.clear();
    }
    dessiner();
  }
  disconnectedCallback() {
    if (vue === this) vue = undefined;
  }
}
if (!customElements.get('humalis-reunion')) customElements.define('humalis-reunion', HumalisReunion);

const dire = (erreur) => {
  const refuse = erreur?.name === 'NotAllowedError';
  afficherMessage(refuse ? "L'accès à la caméra ou au micro est refusé : autorisez-le dans les réglages." : (erreur?.message || 'La réunion a rencontré un problème.'), 'erreur');
};

async function essayer(action) {
  try {
    await action();
    dessiner();
    annoncer();
  } catch (erreur) {
    dire(erreur);
  }
}

/** Pour le support : l'état des pistes, lisible dans la console (humalisReunion()). */
globalThis.humalisReunion = () => (piece ? [...piece.remoteParticipants.values()].map((p) => ({ qui: p.identity, pistes: [...p.trackPublications.values()].map((t) => ({ source: t.source, abonnee: t.isSubscribed, coupee: t.isMuted, active: t.isEnabled, etat: t.track?.mediaStreamTrack?.readyState, qualite: t.videoQuality, element: t.track?.attachedElements?.length })) })) : null);

export const reunion = {
  async rejoindre(nom) {
    if (piece && salle === nom) return;
    await reunion.quitter();
    let acces;
    try {
      acces = await serveur.envoyer('/api/salles_jeton', { salle: nom });
    } catch (erreur) {
      dire(erreur);
      return;
    }
    if (!acces?.jeton) return;
    // « dynacast » : on n'envoie que les qualités regardées. Pas d'« adaptiveStream » : il suspendait des images bien visibles.
    const nouvelle = new Room({ adaptiveStream: false, dynacast: true });
    for (const evenement of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ParticipantAttributesChanged]) nouvelle.on(evenement, dessiner);
    nouvelle.on(RoomEvent.TrackSubscribed, (track) => { brancherSon(track); dessiner(); });
    nouvelle.on(RoomEvent.TrackUnsubscribed, (track) => { oublierVideo(track); track.detach().forEach((e) => e.remove()); dessiner(); });
    nouvelle.on(RoomEvent.LocalTrackUnpublished, (publication) => { if (publication.track) oublierVideo(publication.track); dessiner(); });
    // Une personne qui anime coupe ce micro : la page l'apprend par le serveur.
    for (const evenement of [RoomEvent.TrackMuted, RoomEvent.TrackUnmuted]) nouvelle.on(evenement, (_publication, participant) => { if (participant === nouvelle.localParticipant) annoncer(); });
    nouvelle.on(RoomEvent.Disconnected, (raison) => {
      if (piece !== nouvelle) return;
      piece = undefined;
      dessiner();
      // Retirée par une personne qui anime, ou salle fermée : la personne le lit.
      if (raison === DisconnectReason.PARTICIPANT_REMOVED) afficherMessage('Vous avez été retiré de la réunion.', 'avertissement');
      else if (raison === DisconnectReason.ROOM_DELETED) afficherMessage('La réunion est terminée.', 'info');
    });
    piece = nouvelle;
    salle = nom;
    await essayer(async () => {
      await nouvelle.connect(acces.adresse, acces.jeton);
      await nouvelle.localParticipant.setMicrophoneEnabled(true);
      if (acces.video) await nouvelle.localParticipant.setCameraEnabled(true);
    });
  },
  async quitter() {
    const ancienne = piece;
    const ancienneSalle = salle;
    piece = undefined;
    salle = '';
    document.querySelectorAll('[data-humalis-reunion]').forEach((e) => e.remove());
    videos.clear();
    dessiner();
    if (ancienne) {
      await ancienne.disconnect();
      serveur.envoyer('/api/salles_geste', { salle: ancienneSalle, participant: '', geste: 'etat' }).catch(() => undefined);
    }
  },
  couperMicro: () => essayer(() => piece?.localParticipant.setMicrophoneEnabled(false)),
  activerMicro: () => essayer(() => piece?.localParticipant.setMicrophoneEnabled(true)),
  couperCamera: () => essayer(() => piece?.localParticipant.setCameraEnabled(false)),
  activerCamera: () => essayer(() => piece?.localParticipant.setCameraEnabled(true)),
  partagerEcran: () => essayer(() => piece?.localParticipant.setScreenShareEnabled(true)),
  arreterPartage: () => essayer(() => piece?.localParticipant.setScreenShareEnabled(false)),
  leverMain: () => essayer(() => piece?.localParticipant.setAttributes({ main: '1' })),
  baisserMain: () => essayer(() => piece?.localParticipant.setAttributes({ main: '0' })),
};
`;
