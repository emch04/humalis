/**
 * Les réunions sur le web et le bureau, par LiveKit. La barre (micro, caméra, écran, main) s'écrit en
 * Humalis ; ici, seulement l'image des participants et les gestes. Un élément propre, <humalis-reunion>,
 * se branche sur la réunion en cours où qu'il soit dans la page.
 */
import type { Application } from '../../ri/types.js';

/** Publiée avant le 1er novembre 2026. */
export const VERSION_LIVEKIT_WEB = '2.23.0';

export const utiliseReunion = (application: Application): boolean => JSON.stringify([application.ecrans, application.composants]).includes('"type":"gesteReunion"');

export const REUNION_JS = String.raw`// Produit par Humalis : la réunion en cours, par LiveKit.
import { Room, RoomEvent, Track } from 'livekit-client';
import { serveur } from './serveur.js';
import { afficherMessage } from './outils.js';

let salle = '';
let piece;
let vue;

function annoncer() {
  if (salle) serveur.envoyer('/api/salles_geste', { salle, participant: '', geste: 'etat' }).catch(() => undefined);
}

function tuile(participant, publication, local) {
  const cadre = document.createElement('figure');
  cadre.className = 'humalis-reunion-tuile';
  if (publication?.track && !publication.isMuted) {
    const video = publication.track.attach();
    video.muted = local;
    video.setAttribute('aria-label', participant.name || participant.identity);
    cadre.append(video);
  } else {
    const initiale = document.createElement('span');
    initiale.className = 'humalis-reunion-initiale';
    initiale.textContent = (participant.name || participant.identity || '?').charAt(0).toUpperCase();
    cadre.append(initiale);
  }
  const nom = document.createElement('figcaption');
  const micro = participant.getTrackPublication(Track.Source.Microphone);
  nom.textContent = (participant.name || participant.identity) + (participant.attributes?.main === '1' ? ' ✋' : '') + (!micro || micro.isMuted ? ' (micro coupé)' : '');
  cadre.append(nom);
  return cadre;
}

function dessiner() {
  if (!vue) return;
  vue.replaceChildren();
  if (!piece) return;
  const tous = [piece.localParticipant, ...piece.remoteParticipants.values()];
  for (const p of tous) {
    const local = p === piece.localParticipant;
    const ecran = p.getTrackPublication(Track.Source.ScreenShare);
    if (ecran?.track) vue.append(tuile(p, ecran, true));
    vue.append(tuile(p, p.getTrackPublication(Track.Source.Camera), local));
  }
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
    vue = this;
    dessiner();
  }
  disconnectedCallback() {
    if (vue === this) vue = undefined;
  }
}
if (!customElements.get('humalis-reunion')) customElements.define('humalis-reunion', HumalisReunion);

if (!document.getElementById('humalis-reunion-styles')) {
  const styles = document.createElement('style');
  styles.id = 'humalis-reunion-styles';
  styles.textContent = 'humalis-reunion{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));width:100%}.humalis-reunion-tuile{position:relative;margin:0;aspect-ratio:16/9;background:#1c1c1e;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center}.humalis-reunion-tuile video{width:100%;height:100%;object-fit:cover}.humalis-reunion-tuile figcaption{position:absolute;left:8px;bottom:6px;color:#fff;font-size:13px;text-shadow:0 1px 2px #000}.humalis-reunion-initiale{color:#fff;font-size:40px}';
  document.head.append(styles);
}

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
    const nouvelle = new Room({ adaptiveStream: true, dynacast: true });
    for (const evenement of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ParticipantAttributesChanged]) nouvelle.on(evenement, dessiner);
    nouvelle.on(RoomEvent.TrackSubscribed, (track) => { brancherSon(track); dessiner(); });
    nouvelle.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((e) => e.remove()); dessiner(); });
    nouvelle.on(RoomEvent.Disconnected, () => { if (piece === nouvelle) { piece = undefined; dessiner(); } });
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
