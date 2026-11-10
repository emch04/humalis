/**
 * Le script que la machine ajoute à chaque page : le rechargement à chaud (l'état des variables est
 * gardé d'un rechargement à l'autre quand leur déclaration n'a pas changé), les erreurs du programme
 * et de la page affichées par-dessus, et un lien vers le panneau de la machine.
 * C'est du JavaScript sans bibliothèque, servi sous /__machine/client.js.
 */
export const CLIENT_MACHINE_JS = String.raw`// La machine Humalis : rechargement à chaud et erreurs.
(function () {
  var CLE = 'humalis:machine:etat';
  var RESTAUREES = /^\/src\/(couches\/|humalis\/(partages|composants)\.js)/;
  var boites = [], compteurs = {}, sauve = null, ouvert = false, rechargement = false;
  try {
    var brut = sessionStorage.getItem(CLE);
    if (brut) { sauve = JSON.parse(brut); sessionStorage.removeItem(CLE); }
  } catch (e) { sauve = null; }

  function fichierDe(pile) {
    var lignes = String(pile || '').split('\n');
    for (var i = 0; i < lignes.length; i++) {
      var m = /(\/src\/[^\s:)]*\.js)/.exec(lignes[i]);
      if (m && m[1].indexOf('/src/humalis/moteur.js') < 0) return m[1];
    }
    return '?';
  }
  function instantane(v) {
    try { var t = JSON.stringify(v); return t === undefined ? null : t; } catch (e) { return null; }
  }

  // Chaque variable du moteur se signale à sa création : son fichier et son rang disent qui elle est.
  window.__machine = {
    boite: function (b) {
      var f = fichierDe(new Error().stack);
      compteurs[f] = (compteurs[f] || 0) + 1;
      var cle = f + '#' + compteurs[f];
      var initial = instantane(b.x);
      boites.push({ b: b, cle: cle, initial: initial });
      var ancien = sauve && sauve.boites && sauve.boites[cle];
      // Rendue seulement si sa déclaration n'a pas changé : une valeur de départ modifiée gagne.
      if (ancien && initial !== null && ancien.initial === initial && ancien.valeur !== null && RESTAUREES.test(cle)) {
        try { b.x = JSON.parse(ancien.valeur); } catch (e) { /* la valeur de départ reste */ }
      }
    }
  };

  function sauver() {
    var etat = { scroll: [window.scrollX, window.scrollY], boites: {} };
    boites.forEach(function (e) {
      if (!RESTAUREES.test(e.cle)) return;
      etat.boites[e.cle] = { initial: e.initial, valeur: instantane(e.b.x) };
    });
    try { sessionStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) { /* le stockage peut être interdit */ }
  }
  function recharger() {
    if (rechargement) return;
    rechargement = true;
    sauver();
    location.reload();
  }
  if (sauve && sauve.scroll) {
    var remettre = function () { window.scrollTo(sauve.scroll[0], sauve.scroll[1]); };
    addEventListener('load', function () { remettre(); setTimeout(remettre, 250); });
  }

  // Les erreurs : celles du programme (avec leur ligne) et celles de la page (au moment où elle tourne).
  var programme = '', page = [];
  function cadre() {
    var el = document.getElementById('humalis-machine-erreurs');
    if (!el) {
      el = document.createElement('div');
      el.id = 'humalis-machine-erreurs';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;inset:0 0 auto 0;max-height:70vh;overflow:auto;z-index:2147483647;background:#3b1212;color:#fff;font:13px/1.5 ui-monospace,Menlo,monospace;padding:14px 18px;box-shadow:0 4px 24px rgba(0,0,0,.4)';
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }
  function afficher() {
    var texte = [];
    if (programme) texte.push('Humalis : le programme a des erreurs\n\n' + programme);
    if (page.length) texte.push('Dans la page :\n' + page.join('\n'));
    var el = document.getElementById('humalis-machine-erreurs');
    if (!texte.length) { if (el) el.remove(); return; }
    el = cadre();
    el.textContent = '';
    var pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;white-space:pre-wrap';
    pre.textContent = texte.join('\n\n');
    var fermer = document.createElement('button');
    fermer.type = 'button';
    fermer.textContent = 'Fermer';
    fermer.style.cssText = 'float:right;margin-left:12px;font:inherit;cursor:pointer';
    fermer.onclick = function () { page = []; el.remove(); };
    el.append(fermer, pre);
  }
  addEventListener('error', function (e) {
    if (e.target !== window) return;
    page.push(e.message + (e.filename ? '  (' + e.filename.replace(location.origin, '') + ':' + e.lineno + ')' : ''));
    afficher();
  });
  addEventListener('unhandledrejection', function (e) {
    page.push('Promesse refusée : ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
    afficher();
  });

  // Le lien vers le panneau : comptes d'essai, boîte d'envoi, données, ce que la machine ne fait pas.
  addEventListener('DOMContentLoaded', function () {
    var a = document.createElement('a');
    a.href = '/__machine';
    a.textContent = 'machine Humalis';
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483646;font:11px/1 system-ui,sans-serif;padding:5px 8px;border-radius:12px;background:rgba(20,20,20,.72);color:#fff;text-decoration:none;opacity:.55';
    a.onmouseenter = function () { a.style.opacity = '1'; };
    a.onmouseleave = function () { a.style.opacity = '.55'; };
    document.body.appendChild(a);
  });

  var flux = new EventSource('/__machine/evenements');
  flux.onopen = function () { if (ouvert) recharger(); ouvert = true; };
  flux.onmessage = function (e) {
    var m;
    try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.type === 'recharger') recharger();
    else if (m.type === 'erreurs') { programme = m.texte; afficher(); }
    else if (m.type === 'ok' && programme) { programme = ''; afficher(); }
  };
})();
`;

/** Les deux modules que la page importe sans les avoir dans ses fichiers : le client de session des packs Astratra. */
export const CLIENT_SESSION_JS = String.raw`// Le client de session de la machine : un 401 renouvelle la session une fois, puis rejoue la requête.
export class SessionExpiredError extends Error {
  constructor(message) { super(message || 'session expirée'); this.name = 'SessionExpiredError'; }
}
export function createSessionClient(options) {
  var renouvellement = null;
  function renouveler() {
    if (!renouvellement) renouvellement = Promise.resolve().then(function () { return options.refresh(); }).finally(function () { renouvellement = null; });
    return renouvellement;
  }
  return {
    call: async function (chemin, lancer) {
      try {
        return await options.request(chemin, lancer);
      } catch (erreur) {
        if (!erreur || erreur.status !== 401) throw erreur;
        try { await renouveler(); } catch (e) { throw new SessionExpiredError(); }
        try { return await options.request(chemin, lancer); }
        catch (suite) { if (suite && suite.status === 401) throw new SessionExpiredError(); throw suite; }
      }
    },
  };
}
`;
