/**
 * La machine dans un navigateur (le bac à sable du site) : la machine tourne dans la page, et un
 * Service Worker répond aux requêtes d'une iframe d'aperçu en les lui passant. L'iframe voit une
 * vraie adresse du même site (/panier, /api/produits…) : le moteur, ses liens et son historique
 * marchent comme sur la commande `humalis lancer`, sans serveur ni installation.
 *
 * Deux fichiers à mettre à la racine du site : le Service Worker (SERVICE_WORKER_JS, un fichier
 * à servir tel quel, par exemple /machine-sw.js) et le script de la page (dist/navigateur.js).
 * Seules l'iframe ouverte par `ouvrir` et ses requêtes sont prises ; le reste du site n'est jamais touché.
 */
import type { Machine, ReponseHttp } from './machine.js';

export const MARQUE_APERCU = '__apercu';

export const SERVICE_WORKER_JS = String.raw`// Le Service Worker de la machine Humalis : ne prend que l'iframe d'aperçu.
var apercus = new Set();
var proprietaire = null;
var actif = false;
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'humalis-proprietaire' && e.source) proprietaire = e.source.id;
  if (e.data && e.data.type === 'humalis-apercu') actif = e.data.actif === true;
});
self.addEventListener('fetch', function (event) {
  var requete = event.request;
  var url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;
  var marque = requete.mode === 'navigate' && url.searchParams.get('${MARQUE_APERCU}');
  var dedans = event.clientId && apercus.has(event.clientId);
  // Le moteur efface la marque de l'adresse : un rechargement ou un lien de l'iframe (même site) reste dans l'aperçu tant qu'il est ouvert.
  var iframe = actif && requete.mode === 'navigate' && requete.destination === 'iframe';
  if (!marque && !dedans && !iframe) return;
  // Le document qui naît de cette navigation (première ouverture ou rechargement) est aussi un aperçu.
  if (event.resultingClientId) apercus.add(event.resultingClientId);
  event.respondWith(repondre(requete, url));
});

async function repondre(requete, url) {
  var client = proprietaire ? await self.clients.get(proprietaire) : null;
  if (!client) return new Response('La page du bac à sable n\'est plus ouverte : rechargez-la.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  var entetes = {};
  requete.headers.forEach(function (v, k) { entetes[k] = v; });
  var corps = requete.method === 'GET' || requete.method === 'HEAD' ? undefined : await requete.text();
  var canal = new MessageChannel();
  var chercheur = new URLSearchParams(url.search);
  chercheur.delete('${MARQUE_APERCU}');
  return new Promise(function (resoudre) {
    var flux = null, controleur = null;
    canal.port1.onmessage = function (e) {
      var m = e.data;
      if (m.type === 'reponse') {
        var tete = new Headers();
        Object.keys(m.entetes).forEach(function (k) { if (k.toLowerCase() !== 'set-cookie') tete.set(k, [].concat(m.entetes[k]).join(', ')); });
        if (m.direct) {
          flux = new ReadableStream({
            start: function (c) { controleur = c; },
            cancel: function () { canal.port1.postMessage({ type: 'annuler' }); },
          });
          resoudre(new Response(flux, { status: m.statut, headers: tete }));
        } else resoudre(new Response(m.statut === 204 || m.statut === 304 ? null : m.corps, { status: m.statut, headers: tete }));
      } else if (m.type === 'morceau' && controleur) controleur.enqueue(new TextEncoder().encode(m.texte));
      else if (m.type === 'fin' && controleur) { try { controleur.close(); } catch (x) { /* déjà fermé */ } }
    };
    client.postMessage({ type: 'humalis-requete', methode: requete.method, chemin: url.pathname, requete: chercheur.toString(), entetes: entetes, corps: corps }, [canal.port2]);
  });
}
`;

export interface OptionsApercu {
  /** L'adresse du Service Worker, à la racine du site (par exemple /machine-sw.js). */
  serviceWorker: string;
  /** La portée du Service Worker ; la racine par défaut. */
  portee?: string;
}

export interface Apercu {
  /** Ouvre l'application dans cette iframe, sur cette page. */
  ouvrir(iframe: HTMLIFrameElement, chemin?: string): void;
  arreter(): void;
}

interface MessageRequete {
  type: 'humalis-requete';
  methode: string;
  chemin: string;
  requete: string;
  entetes: Record<string, string>;
  corps?: string;
}

/** Les cookies de l'aperçu : le navigateur ne les voit pas (la réponse ne vient pas du réseau), la page les garde. */
class Pot {
  private readonly valeurs = new Map<string, string>();
  entete(): string {
    return [...this.valeurs].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  recevoir(lignes: string[]): void {
    for (const ligne of lignes) {
      const [paire, ...attributs] = ligne.split('; ');
      const egal = paire.indexOf('=');
      const nom = paire.slice(0, egal);
      const valeur = paire.slice(egal + 1);
      const efface = attributs.some((a) => /^max-age=0$/i.test(a));
      if (efface) this.valeurs.delete(nom);
      else this.valeurs.set(nom, valeur);
      // Un cookie lisible par la page (le jeton CSRF) l'est aussi dans le document ; un cookie HttpOnly reste dans le pot.
      if (!attributs.some((a) => /^httponly$/i.test(a))) document.cookie = `${nom}=${efface ? '' : valeur}; Path=/; SameSite=Lax${efface ? '; Max-Age=0' : ''}`;
    }
  }
}

/** Branche la machine sur un Service Worker : à partir de là, une iframe ouverte par `ouvrir` montre l'application. */
export async function brancherApercu(machine: Machine, options: OptionsApercu): Promise<Apercu> {
  if (!('serviceWorker' in navigator)) throw new Error("Ce navigateur n'a pas de Service Worker : l'aperçu ne peut pas tourner ici.");
  const enregistrement = await navigator.serviceWorker.register(options.serviceWorker, { scope: options.portee ?? '/' });
  await navigator.serviceWorker.ready;
  const pot = new Pot();
  const dire = () => (enregistrement.active ?? navigator.serviceWorker.controller)?.postMessage({ type: 'humalis-proprietaire' });
  dire();
  navigator.serviceWorker.addEventListener('controllerchange', dire);

  const ecoute = async (e: MessageEvent<MessageRequete>) => {
    const m = e.data;
    if (m?.type !== 'humalis-requete') return;
    const port = e.ports[0];
    let corps: unknown;
    if (m.corps) {
      try { corps = JSON.parse(m.corps); }
      catch { port.postMessage({ type: 'reponse', statut: 400, entetes: { 'content-type': 'application/json' }, corps: JSON.stringify({ erreur: 'les données envoyées doivent être un objet JSON' }) }); return; }
    }
    const cookie = pot.entete();
    const reponse: ReponseHttp = await machine.traiter({ methode: m.methode, chemin: m.chemin, requete: new URLSearchParams(m.requete), entetes: { ...m.entetes, ...(cookie ? { cookie } : {}) }, corps });
    pot.recevoir(([] as string[]).concat(reponse.entetes['set-cookie'] ?? []));
    if (reponse.direct) {
      port.postMessage({ type: 'reponse', statut: reponse.statut, entetes: reponse.entetes, direct: true });
      const fin = reponse.direct((texte) => port.postMessage({ type: 'morceau', texte }));
      port.onmessage = (a) => { if (a.data?.type === 'annuler') { fin(); port.onmessage = null; } };
      return;
    }
    const octets = reponse.corps;
    port.postMessage({ type: 'reponse', statut: reponse.statut, entetes: reponse.entetes, corps: typeof octets === 'string' ? octets : octets ? new Uint8Array(octets) : undefined });
  };
  navigator.serviceWorker.addEventListener('message', ecoute as unknown as EventListener);

  return {
    ouvrir(iframe, chemin = '/') {
      const sw = enregistrement.active ?? navigator.serviceWorker.controller;
      sw?.postMessage({ type: 'humalis-apercu', actif: true });
      iframe.src = `${chemin}${chemin.includes('?') ? '&' : '?'}${MARQUE_APERCU}=1`;
    },
    arreter() {
      (enregistrement.active ?? navigator.serviceWorker.controller)?.postMessage({ type: 'humalis-apercu', actif: false });
      navigator.serviceWorker.removeEventListener('message', ecoute as unknown as EventListener);
    },
  };
}
