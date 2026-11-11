/**
 * L'inspecteur de « humalis developper » : un panneau dans la page, servi par
 * le serveur du mode développement et chargé en premier dans chaque page.
 * Il n'entre jamais dans un site produit : le compilateur ne l'ajoute que
 * pour `humalis developper` (--diagnostics-port).
 *
 * Il montre, en direct :
 * - les variables de chaque page affichée (le moteur les inscrit dans
 *   window.__humalisCouches, en développement seulement) ;
 * - les requêtes au serveur, avec leur corps et leur réponse ;
 * - les droits refusés (réponses 401 et 403) et leur message ;
 * - les notes (« noter … ») et les erreurs, avec leur ligne Humalis.
 *
 * Chaque lieu (« boutique.humalis:12 ») s'ouvre dans VS Code.
 */

/** Le script de l'inspecteur : JavaScript simple, sans module, isolé dans un Shadow DOM. */
export function inspecteurJs(dossierSources: string): string {
  return `// Produit par Humalis : l'inspecteur du mode développement.
(() => {
  if (window.__humalisInspecteur) return;
  const DOSSIER = ${JSON.stringify(dossierSources)};
  const LIMITE = 200;
  const etat = { requetes: [], notes: [], erreurs: [], ouvert: false, onglet: 'variables', choisie: null };
  window.__humalisInspecteur = etat;

  // ─── Les requêtes : fetch est suivi dès le début de la page ─────────────
  const fetchOriginal = window.fetch.bind(window);
  const interne = (adresse) => /\\/(humalis-lignes\\.json|@vite|@id|src\\/|node_modules\\/)|^https?:\\/\\/localhost:\\d+\\/(diagnostics|inspecteur)/.test(adresse);
  const lireCorps = (corps) => {
    if (corps === undefined || corps === null) return '';
    if (typeof corps === 'string') return corps;
    if (corps instanceof FormData) return '[formulaire : ' + [...corps.keys()].join(', ') + ']';
    if (corps instanceof Blob) return '[fichier, ' + corps.size + ' octets]';
    return String(corps);
  };
  window.fetch = async function (entree, options = {}) {
    const adresse = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
    if (interne(adresse)) return fetchOriginal(entree, options);
    const requete = { id: Date.now() + Math.random(), methode: (options.method || (entree instanceof Request ? entree.method : 'GET')).toUpperCase(), adresse, envoye: lireCorps(options.body), debut: performance.now(), statut: null, duree: null, reponse: '' };
    etat.requetes.unshift(requete);
    if (etat.requetes.length > LIMITE) etat.requetes.pop();
    redessiner();
    try {
      const reponse = await fetchOriginal(entree, options);
      requete.statut = reponse.status;
      requete.duree = Math.round(performance.now() - requete.debut);
      reponse.clone().text().then((texte) => { requete.reponse = texte.slice(0, 20000); redessiner(); }).catch(() => {});
      redessiner();
      return reponse;
    } catch (erreur) {
      requete.statut = 0;
      requete.duree = Math.round(performance.now() - requete.debut);
      requete.reponse = String(erreur && erreur.message || erreur);
      redessiner();
      throw erreur;
    }
  };

  // ─── Les notes et les erreurs ───────────────────────────────────────────
  window.addEventListener('humalis:note', (evenement) => {
    etat.notes.unshift(evenement.detail);
    if (etat.notes.length > LIMITE) etat.notes.pop();
    redessiner();
  });
  window.addEventListener('humalis:erreur', (evenement) => {
    etat.erreurs.unshift({ ...evenement.detail, date: Date.now() });
    if (etat.erreurs.length > LIMITE) etat.erreurs.pop();
    redessiner();
  });
  window.addEventListener('humalis:couches', () => redessiner());

  // ─── L'affichage ────────────────────────────────────────────────────────
  const apercu = (valeur, profondeur = 0) => {
    if (valeur === null || valeur === undefined) return 'rien';
    if (typeof valeur === 'boolean') return valeur ? 'vrai' : 'faux';
    if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur.toLocaleString('fr-FR', { maximumFractionDigits: 6 }) : String(valeur);
    if (typeof valeur === 'string') return JSON.stringify(valeur);
    if (Array.isArray(valeur)) return profondeur > 0 ? '[' + valeur.length + ' élément' + (valeur.length > 1 ? 's' : '') + ']' : '[' + valeur.slice(0, 5).map((v) => apercu(v, 1)).join(', ') + (valeur.length > 5 ? ', … ' + valeur.length + ' éléments' : '') + ']';
    if (typeof valeur === 'object') return profondeur > 0 ? '{…}' : '{ ' + Object.entries(valeur).slice(0, 6).map(([n, v]) => n + ': ' + apercu(v, 1)).join(', ') + (Object.keys(valeur).length > 6 ? ', …' : '') + ' }';
    return String(valeur);
  };
  const detail = (valeur) => { try { return JSON.stringify(valeur, null, 2); } catch { return String(valeur); } };
  const corpsLisible = (texte) => { try { return JSON.stringify(JSON.parse(texte), null, 2); } catch { return texte; } };
  const echapper = (texte) => String(texte).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const lienLieu = (lieu) => {
    if (!lieu) return '';
    const i = lieu.lastIndexOf(':');
    const fichier = lieu.slice(0, i);
    const ligne = lieu.slice(i + 1);
    return '<a class="lieu" href="vscode://file' + encodeURI(DOSSIER + '/' + fichier) + ':' + ligne + '" title="Ouvrir dans VS Code">' + echapper(fichier) + ':' + ligne + '</a>';
  };
  const lireBoite = (boite) => { try { return typeof boite === 'function' ? boite() : boite && ('v' in boite ? boite.v : boite.x); } catch (erreur) { return '⚠ ' + (erreur && erreur.message); } };
  const refusees = () => etat.requetes.filter((r) => r.statut === 401 || r.statut === 403);
  const messageDe = (r) => { try { const lu = JSON.parse(r.reponse); return lu.erreur || lu.message || lu.error || ''; } catch { return r.reponse.slice(0, 200); } };

  const hote = document.createElement('div');
  hote.id = 'humalis-inspecteur';
  const ombre = hote.attachShadow({ mode: 'open' });
  ombre.innerHTML = \`<style>
    :host { all: initial; }
    * { box-sizing: border-box; }
    .bouton { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; width: 44px; height: 44px; border-radius: 50%; border: 0; background: #0b6e4f; color: #fff; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.3); display: grid; place-items: center; }
    .bouton:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid #f2b705; outline-offset: 2px; }
    .pastille { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: #c0392b; color: #fff; font: 600 11px/18px system-ui, sans-serif; }
    .panneau { position: fixed; right: 16px; bottom: 72px; z-index: 2147483646; width: min(560px, calc(100vw - 32px)); height: min(70vh, 640px); display: flex; flex-direction: column; background: #fff; color: #1d2b24; border: 1px solid #c8d6cf; border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,.25); font: 13px/1.45 system-ui, sans-serif; }
    .panneau[hidden] { display: none; }
    .tete { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid #e3ebe7; }
    .tete strong { flex: 1; }
    .fermer { border: 0; background: none; font-size: 20px; line-height: 1; cursor: pointer; color: inherit; padding: 2px 6px; }
    [role=tablist] { display: flex; gap: 2px; padding: 6px 8px 0; border-bottom: 1px solid #e3ebe7; flex-wrap: wrap; }
    [role=tab] { border: 0; background: none; padding: 6px 10px; border-radius: 6px 6px 0 0; cursor: pointer; color: inherit; font: inherit; }
    [role=tab][aria-selected=true] { background: #e8f3ee; font-weight: 600; }
    .compte { display: inline-block; margin-left: 4px; padding: 0 6px; border-radius: 8px; background: #dfe8e4; font-size: 11px; }
    .compte.alerte { background: #c0392b; color: #fff; }
    .contenu { flex: 1; overflow: auto; padding: 8px 10px; }
    .vide { color: #5b6b63; padding: 12px 0; }
    .ligne { border-bottom: 1px solid #eef3f0; padding: 6px 0; }
    .ligne button.ouvrir { all: unset; cursor: pointer; display: flex; gap: 8px; width: 100%; align-items: baseline; }
    .nom { font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .valeur { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .methode { font: 600 11px ui-monospace, monospace; padding: 1px 5px; border-radius: 4px; background: #e8f3ee; }
    .statut { font: 600 12px ui-monospace, monospace; }
    .ok { color: #0b6e4f; } .refus { color: #c0392b; } .attente { color: #8a6d00; }
    .adresse { flex: 1; overflow-wrap: anywhere; }
    .duree, .heure { color: #5b6b63; font-size: 12px; }
    pre { margin: 6px 0 0; padding: 8px; background: #f5f8f6; border-radius: 6px; max-height: 260px; overflow: auto; font: 12px/1.4 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    h3 { font-size: 12px; margin: 10px 0 4px; color: #3c4d45; text-transform: uppercase; letter-spacing: .03em; }
    .lieu { color: #0b5cad; font: 12px ui-monospace, monospace; text-decoration: none; text-transform: none; letter-spacing: 0; }
    .lieu:hover { text-decoration: underline; }
    @media (prefers-color-scheme: dark) {
      .panneau { background: #18201c; color: #e4ece8; border-color: #34423b; }
      .tete, [role=tablist] { border-color: #2a352f; }
      [role=tab][aria-selected=true], .methode { background: #24342c; }
      .compte { background: #2d3a33; }
      .ligne { border-color: #26302b; }
      pre { background: #121815; }
      .lieu { color: #7fb8f0; }
      .vide, .duree, .heure { color: #9aaba2; }
    }
  </style>
  <button class="bouton" type="button" aria-label="Inspecteur Humalis" aria-expanded="false" aria-controls="panneau"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="pastille" hidden></span></button>
  <section class="panneau" id="panneau" role="dialog" aria-label="Inspecteur Humalis" hidden>
    <div class="tete"><strong>Inspecteur Humalis</strong><button class="fermer" type="button" aria-label="Fermer l’inspecteur">×</button></div>
    <div role="tablist" aria-label="Ce que montre l’inspecteur"></div>
    <div class="contenu" role="tabpanel" tabindex="0"></div>
  </section>\`;
  const bouton = ombre.querySelector('.bouton');
  const pastille = ombre.querySelector('.pastille');
  const panneau = ombre.querySelector('.panneau');
  const onglets = ombre.querySelector('[role=tablist]');
  const contenu = ombre.querySelector('.contenu');
  const basculer = (ouvert = !etat.ouvert) => {
    etat.ouvert = ouvert;
    panneau.hidden = !ouvert;
    bouton.setAttribute('aria-expanded', String(ouvert));
    redessiner();
  };
  bouton.addEventListener('click', () => basculer());
  ombre.querySelector('.fermer').addEventListener('click', () => { basculer(false); bouton.focus(); });
  panneau.addEventListener('keydown', (evenement) => { if (evenement.key === 'Escape') { basculer(false); bouton.focus(); } });
  // Alt + Maj + I ouvre et ferme l'inspecteur.
  window.addEventListener('keydown', (evenement) => { if (evenement.altKey && evenement.shiftKey && evenement.code === 'KeyI') { evenement.preventDefault(); basculer(); } });

  const ONGLETS = [
    ['variables', 'Variables', () => [...(window.__humalisCouches || [])].reduce((n, c) => n + Object.keys(c.variables).length, 0), false],
    ['requetes', 'Requêtes', () => etat.requetes.length, false],
    ['droits', 'Droits refusés', () => refusees().length, true],
    ['notes', 'Notes', () => etat.notes.length, false],
    ['erreurs', 'Erreurs', () => etat.erreurs.length, true],
  ];
  onglets.addEventListener('click', (evenement) => {
    const onglet = evenement.target.closest('[role=tab]');
    if (!onglet) return;
    etat.onglet = onglet.dataset.onglet;
    etat.choisie = null;
    redessiner();
  });
  onglets.addEventListener('keydown', (evenement) => {
    if (evenement.key !== 'ArrowRight' && evenement.key !== 'ArrowLeft') return;
    const i = ONGLETS.findIndex(([id]) => id === etat.onglet);
    etat.onglet = ONGLETS[(i + (evenement.key === 'ArrowRight' ? 1 : ONGLETS.length - 1)) % ONGLETS.length][0];
    redessiner();
    onglets.querySelector('[aria-selected=true]')?.focus();
  });
  contenu.addEventListener('click', (evenement) => {
    const ouvrir = evenement.target.closest('button.ouvrir');
    if (!ouvrir) return;
    etat.choisie = etat.choisie === ouvrir.dataset.cle ? null : ouvrir.dataset.cle;
    redessiner();
  });

  let dernier = '';
  let derniereBarre = '';
  function redessiner() {
    const alertes = refusees().length + etat.erreurs.length;
    pastille.hidden = alertes === 0;
    pastille.textContent = String(alertes);
    if (!etat.ouvert) return;
    const barre = ONGLETS.map(([id, titre, compte, alerte]) => {
      const n = compte();
      return '<button role="tab" type="button" data-onglet="' + id + '" aria-selected="' + (etat.onglet === id) + '" tabindex="' + (etat.onglet === id ? 0 : -1) + '">' + titre + '<span class="compte' + (alerte && n > 0 ? ' alerte' : '') + '">' + n + '</span></button>';
    }).join('');
    // Redessinée seulement si elle change : un clic en cours ne perd pas son bouton.
    if (barre !== derniereBarre) {
      derniereBarre = barre;
      onglets.innerHTML = barre;
    }
    let html = '';
    if (etat.onglet === 'variables') {
      const couches = [...(window.__humalisCouches || [])];
      if (couches.length === 0) html = '<p class="vide">Aucune variable dans cette page.</p>';
      for (const couche of couches) {
        html += '<h3>Page « ' + echapper(couche.page) + ' » ' + lienLieu(couche.lieu) + '</h3>';
        for (const [nom, { boite, lieu }] of Object.entries(couche.variables)) {
          const valeur = lireBoite(boite);
          const cle = couche.page + ':' + nom;
          html += '<div class="ligne"><button class="ouvrir" type="button" data-cle="' + echapper(cle) + '" aria-expanded="' + (etat.choisie === cle) + '"><span class="nom">' + echapper(nom) + '</span><span class="valeur">' + echapper(apercu(valeur)) + '</span></button>' + lienLieu(lieu) + (etat.choisie === cle ? '<pre>' + echapper(detail(valeur)) + '</pre>' : '') + '</div>';
        }
      }
    } else if (etat.onglet === 'requetes' || etat.onglet === 'droits') {
      const liste = etat.onglet === 'droits' ? refusees() : etat.requetes;
      if (liste.length === 0) html = '<p class="vide">' + (etat.onglet === 'droits' ? 'Aucun droit refusé.' : 'Aucune requête au serveur.') + '</p>';
      for (const r of liste) {
        const classe = r.statut === null ? 'attente' : r.statut >= 200 && r.statut < 400 ? 'ok' : 'refus';
        const cle = 'r' + r.id;
        html += '<div class="ligne"><button class="ouvrir" type="button" data-cle="' + cle + '" aria-expanded="' + (etat.choisie === cle) + '"><span class="methode">' + r.methode + '</span><span class="adresse">' + echapper(r.adresse) + '</span><span class="statut ' + classe + '">' + (r.statut === null ? '…' : r.statut === 0 ? 'échec' : r.statut) + '</span><span class="duree">' + (r.duree === null ? '' : r.duree + ' ms') + '</span></button>'
          + (etat.onglet === 'droits' && messageDe(r) ? '<div class="refus">' + echapper(messageDe(r)) + '</div>' : '')
          + (etat.choisie === cle ? (r.envoye ? '<h3>Envoyé</h3><pre>' + echapper(corpsLisible(r.envoye)) + '</pre>' : '') + '<h3>Réponse</h3><pre>' + echapper(corpsLisible(r.reponse) || '(vide)') + '</pre>' : '') + '</div>';
      }
    } else if (etat.onglet === 'notes') {
      if (etat.notes.length === 0) html = '<p class="vide">Aucune note. Écrivez « noter … » dans un événement.</p>';
      for (const note of etat.notes) {
        html += '<div class="ligne">' + lienLieu(note.lieu) + ' <span class="heure">' + new Date(note.date || Date.now()).toLocaleTimeString('fr-FR') + '</span><div class="valeur">' + note.valeurs.map((v) => v.titre ? echapper(String(v.valeur)) : '<span class="nom">' + echapper(v.libelle) + '</span> = ' + echapper(apercu(v.valeur))).join(' ; ') + '</div></div>';
      }
    } else {
      if (etat.erreurs.length === 0) html = '<p class="vide">Aucune erreur.</p>';
      for (const erreur of etat.erreurs) {
        html += '<div class="ligne"><span class="refus">' + echapper(erreur.message) + '</span> ' + lienLieu(erreur.ligne) + '<pre>' + echapper(erreur.pile || '') + '</pre></div>';
      }
    }
    if (html !== dernier) {
      dernier = html;
      contenu.innerHTML = html;
    }
  }
  // Les variables changent sans prévenir l'inspecteur : relues tant que l'onglet est ouvert.
  setInterval(() => { if (etat.ouvert && etat.onglet === 'variables') redessiner(); }, 400);
  const monter = () => document.body.append(hote);
  if (document.body) monter();
  else document.addEventListener('DOMContentLoaded', monter, { once: true });
})();
`;
}
