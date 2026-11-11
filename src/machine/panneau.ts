/**
 * Le panneau de la machine (/__machine) : ce qui n'est pas dans la page de l'application. Les comptes
 * d'essai, la boîte d'envoi (les e-mails et notifications gardés au lieu d'être envoyés), les données
 * en mémoire, les tâches et les paiements à lancer à la main, et ce que la machine ne fait pas.
 * Tout ce qui vient du programme est écrit avec textContent : jamais de HTML.
 */
export const PANNEAU_HTML = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Machine Humalis</title>
<style>
  :root { color-scheme: light dark; --fond:#fafaf9; --encre:#1c1917; --doux:#78716c; --ligne:#e7e5e4; --carte:#fff; --accent:#4338ca; --alerte:#b45309; }
  @media (prefers-color-scheme: dark) { :root { --fond:#1c1917; --encre:#f5f5f4; --doux:#a8a29e; --ligne:#44403c; --carte:#292524; --accent:#a5b4fc; --alerte:#fbbf24; } }
  body { margin:0; background:var(--fond); color:var(--encre); font:15px/1.55 system-ui,sans-serif; }
  main { max-width:56rem; margin:0 auto; padding:1.5rem 1rem 4rem; }
  h1 { font-size:1.4rem; margin:0 0 .25rem; } h2 { font-size:1.05rem; margin:2rem 0 .6rem; }
  p.doux, .doux { color:var(--doux); margin:.2rem 0; }
  section { background:var(--carte); border:1px solid var(--ligne); border-radius:10px; padding:.8rem 1rem; }
  table { border-collapse:collapse; width:100%; font-size:.9rem; } th,td { text-align:left; padding:.35rem .5rem; border-bottom:1px solid var(--ligne); vertical-align:top; word-break:break-word; }
  code { font:13px ui-monospace,Menlo,monospace; } button,input,select { font:inherit; padding:.3rem .6rem; border-radius:6px; border:1px solid var(--ligne); background:var(--carte); color:inherit; }
  button { cursor:pointer; border-color:var(--accent); color:var(--accent); } a { color:var(--accent); }
  .limite { border-left:3px solid var(--alerte); padding-left:.7rem; margin:.5rem 0; } .vide { color:var(--doux); font-style:italic; }
  form { display:flex; flex-wrap:wrap; gap:.4rem; margin-top:.6rem; } details { margin:.3rem 0; } summary { cursor:pointer; }
</style>
</head>
<body>
<main>
  <h1>Machine Humalis</h1>
  <p class="doux">Votre programme tourne ici, en mémoire : rien n'est écrit sur le disque, rien ne part sur Internet. <a href="/">Retour à l'application</a></p>

  <h2>Ce que la machine ne fait pas pour de vrai</h2>
  <section id="limites"></section>

  <h2>Comptes d'essai</h2>
  <section>
    <p class="doux">Créés au démarrage : un administrateur et un compte par rôle. Le mot de passe est tiré au hasard à chaque lancement.</p>
    <table id="comptes"></table>
    <form id="nouveau-compte">
      <input name="email" type="email" placeholder="adresse e-mail" required>
      <input name="role" placeholder="rôle (admin, …)" required>
      <input name="groupes" placeholder="groupe (facultatif)">
      <button type="submit">Créer un compte d'essai</button>
    </form>
    <p class="doux" id="message-compte"></p>
  </section>

  <h2>Boîte d'envoi <button type="button" id="vider">Vider</button></h2>
  <section id="boite"></section>

  <h2>À lancer à la main</h2>
  <section id="actions"></section>

  <h2>Données en mémoire</h2>
  <section id="donnees"></section>
</main>
<script>
(function () {
  var motsDePasse = {};
  function el(nom, texte, attrs) { var e = document.createElement(nom); if (texte !== undefined) e.textContent = texte; for (var k in (attrs || {})) e.setAttribute(k, attrs[k]); return e; }
  function vider(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function envoyer(chemin, corps) {
    return fetch(chemin, { method: 'POST', headers: { 'content-type': 'application/json', 'x-humalis-machine': '1' }, body: JSON.stringify(corps || {}) }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  function dessiner(etat) {
    var limites = document.getElementById('limites'); vider(limites);
    if (!etat.limites.length) limites.appendChild(el('p', 'Rien : ce programme ne demande rien que la machine ne sache faire.', { class: 'vide' }));
    etat.limites.forEach(function (l) {
      var d = el('div', undefined, { class: 'limite' });
      d.appendChild(el('strong', l.fonction + ' — ' + (l.traitement === 'capte' ? 'capté, pas envoyé' : 'refusé, pas simulé')));
      d.appendChild(el('div', l.explication, { class: 'doux' }));
      limites.appendChild(d);
    });
    var t = document.getElementById('comptes'); vider(t);
    var tete = el('tr'); ['E-mail', 'Rôle', 'Mot de passe d’essai'].forEach(function (h) { tete.appendChild(el('th', h)); }); t.appendChild(tete);
    etat.comptes.forEach(function (c) {
      var l = el('tr'); l.appendChild(el('td', c.email + (c.invitation ? ' (invité)' : ''))); l.appendChild(el('td', c.role));
      l.appendChild(el('td', motsDePasse[c.email] || (c.invitation ? 'pas encore choisi' : '—')));
      t.appendChild(l);
    });
    var b = document.getElementById('boite'); vider(b);
    if (!etat.boite.length) b.appendChild(el('p', 'Aucun envoi pour l’instant.', { class: 'vide' }));
    etat.boite.slice().reverse().forEach(function (e) {
      var d = el('details'); var s = el('summary', (e.genre === 'email' ? 'E-mail' : e.genre === 'notification' ? 'Notification' : 'Activité') + ' pour ' + e.a + (e.sujet ? ' — ' + e.sujet : ''));
      d.appendChild(s); d.appendChild(el('div', e.texte));
      if (e.lien) { var p = el('div'); var a = el('a', e.lien, { href: e.lien }); p.appendChild(a); d.appendChild(p); }
      d.appendChild(el('div', new Date(e.quand).toLocaleTimeString(), { class: 'doux' }));
      b.appendChild(d);
    });
    var act = document.getElementById('actions'); vider(act);
    if (!etat.taches.length && !etat.paiements.length) act.appendChild(el('p', 'Ce programme n’a ni tâche planifiée ni paiement.', { class: 'vide' }));
    etat.taches.forEach(function (nom) {
      var bt = el('button', 'Lancer la tâche « ' + nom + ' » maintenant', { type: 'button' });
      bt.onclick = function () { envoyer('/__machine/taches/' + encodeURIComponent(nom)).then(function (r) { alert(r.ok ? 'Tâche terminée.' : 'Échec : ' + r.erreur); }); };
      var p = el('p'); p.appendChild(bt); act.appendChild(p);
    });
    etat.paiements.forEach(function (pa) {
      var f = el('form'); var i = el('input', undefined, { placeholder: 'identifiant de la fiche', required: 'required' });
      var bt = el('button', 'Marquer « ' + pa.donnee + ' » payé (à la main, sans Stripe)', { type: 'submit' });
      f.appendChild(i); f.appendChild(bt);
      f.onsubmit = function (e) { e.preventDefault(); envoyer('/__machine/paye', { route: pa.route, id: i.value }).then(function (r) { alert(r.ok ? 'La fiche est payée : ce que le programme fait après le paiement a été lancé.' : 'Échec : ' + r.erreur); }); };
      act.appendChild(f);
    });
    var dn = document.getElementById('donnees'); vider(dn);
    if (!etat.donnees.length) dn.appendChild(el('p', 'Pas de serveur dans ce programme.', { class: 'vide' }));
    etat.donnees.forEach(function (d) {
      var det = el('details'); det.appendChild(el('summary', d.nom + ' — ' + d.fiches.length + ' fiche' + (d.fiches.length > 1 ? 's' : '')));
      det.appendChild(el('pre', JSON.stringify(d.fiches, null, 2), { style: 'overflow:auto;font-size:12px' }));
      dn.appendChild(det);
    });
  }
  function relire() { fetch('/__machine/etat.json').then(function (r) { return r.json(); }).then(function (e) { for (var k in (e.comptesDEssai || {})) motsDePasse[k] = e.comptesDEssai[k]; dessiner(e); }).catch(function () {}); }
  document.getElementById('vider').onclick = function () { envoyer('/__machine/boite/vider').then(relire); };
  document.getElementById('nouveau-compte').onsubmit = function (e) {
    e.preventDefault(); var f = e.target;
    var groupe = f.groupes.value.trim();
    envoyer('/__machine/comptes', { email: f.email.value, role: f.role.value, groupe: groupe || undefined }).then(function (r) {
      document.getElementById('message-compte').textContent = r.erreur ? 'Échec : ' + r.erreur : 'Compte créé. Mot de passe : ' + r.motDePasse;
      if (r.motDePasse) motsDePasse[f.email.value.trim().toLowerCase()] = r.motDePasse;
      relire();
    });
  };
  relire(); setInterval(relire, 2000);
})();
</script>
</body>
</html>
`;
