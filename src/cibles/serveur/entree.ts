/**
 * Le relais « entree » d'un projet en services (décidé avec le mainteneur le 17 novembre 2026) : une seule adresse publique
 * devant tous les services. Il envoie chaque chemin au service qui le sert (/api/produits au catalogue, /auth au
 * service des comptes…), avec les en-têtes d'un relais. Les pages, le web et les applications ne parlent qu'à lui :
 * une adresse, un cookie, pas de CORS.
 *
 * Un petit programme Node, sans aucune dépendance (node:http). Celui qui préfère son propre relais le peut : la table
 * des chemins est écrite dans le LISEZMOI.
 */
import type { ServeurRI } from '../../ri/types.js';
import { variableDuService } from './services.js';

/** Chaque début de chemin et son service, du plus précis au moins précis. */
export function tableDesChemins(serveurs: ServeurRI[]): { chemin: string; service: string }[] {
  const comptes = serveurs[0]?.projet?.comptes ?? serveurs[0]!.nom;
  const lignes: { chemin: string; service: string }[] = [];
  for (const s of serveurs) {
    for (const r of s.routes) if (!r.interne) lignes.push({ chemin: '/api/' + r.adresse.replace(/^\/+|\/+$/g, ''), service: s.nom });
    // Ce que l'analyse permet dans un seul service du projet.
    if (s.droitIa !== undefined) lignes.push({ chemin: '/auth/ia', service: s.nom });
    if (s.paiements) lignes.push({ chemin: '/paiements', service: s.nom });
    if (s.fidelite) lignes.push({ chemin: '/api/fidelite', service: s.nom });
    if (s.passerelles?.length) lignes.push({ chemin: '/api/passerelle', service: s.nom });
    if (s.relaisErreurs?.length) lignes.push({ chemin: '/humalis/erreurs', service: s.nom });
  }
  lignes.push({ chemin: '/auth', service: comptes }, { chemin: '/users', service: comptes }, { chemin: '/settings', service: comptes });
  // Le plus long d'abord : /auth/ia passe avant /auth.
  return lignes.sort((a, b) => b.chemin.length - a.chemin.length);
}

export function fichiersEntree(serveurs: ServeurRI[]): Map<string, string> {
  const table = tableDesChemins(serveurs);
  const services = serveurs.map((s) => s.nom);
  const fichiers = new Map<string, string>();
  fichiers.set(
    'package.json',
    JSON.stringify({ name: 'entree', version: '1.0.0', private: true, type: 'module', engines: { node: '>=22.9' }, scripts: { start: 'node --env-file-if-exists=.env entree.mjs' } }, null, 2) + '\n',
  );
  fichiers.set(
    'entree.mjs',
    String.raw`// Produit par Humalis : le relais « entree » du projet. Une adresse publique, et chaque chemin vers son service.
import { createServer, request } from 'node:http';
import { request as requeteChiffree } from 'node:https';
import { connect } from 'node:net';
import { connect as connecterChiffre } from 'node:tls';

/** Chaque début de chemin et son service (le plus précis d'abord). */
const TABLE = ${JSON.stringify(table, null, 2)};

/** L'adresse de chaque service, lue dans le .env. */
const ADRESSES = {
${services.map((n) => `  ${JSON.stringify(n)}: process.env.${variableDuService(n)}?.trim(),`).join('\n')}
};
// Le reste (le site web, s'il est servi à part) : HUMALIS_ENTREE_SITE ; sans lui, 404.
const SITE = process.env.HUMALIS_ENTREE_SITE?.trim();
for (const [nom, adresse] of Object.entries(ADRESSES)) {
  if (!adresse) {
    console.error("L'adresse du serveur « " + nom + " » manque dans le .env (voir .env.exemple).");
    process.exit(1);
  }
}

const destination = (chemin) => {
  const ligne = TABLE.find((l) => chemin === l.chemin || chemin.startsWith(l.chemin + '/') || chemin.startsWith(l.chemin + '?'));
  if (ligne) return new URL(ADRESSES[ligne.service]);
  return SITE ? new URL(SITE) : null;
};

// Les en-têtes qui ne regardent qu'une connexion ne passent pas d'un côté à l'autre.
const PROPRES_A_LA_CONNEXION = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer']);
const entetes = (req, cible) => {
  const sortie = {};
  for (const [nom, valeur] of Object.entries(req.headers)) if (!PROPRES_A_LA_CONNEXION.has(nom)) sortie[nom] = valeur;
  const adresse = req.socket.remoteAddress ?? '';
  sortie['x-forwarded-for'] = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'] + ', ' + adresse : adresse;
  sortie['x-forwarded-proto'] = req.headers['x-forwarded-proto'] ?? (req.socket.encrypted ? 'https' : 'http');
  sortie['x-forwarded-host'] = req.headers['x-forwarded-host'] ?? req.headers.host ?? '';
  sortie.host = cible.host;
  return sortie;
};

const serveur = createServer((req, res) => {
  const chemin = (req.url ?? '/').split('?')[0];
  // GET /sante : prêt quand chaque service répond prêt.
  if (chemin === '/sante' && req.method === 'GET') {
    void Promise.all(Object.values(ADRESSES).map((a) => fetch(new URL('/sante', a), { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false))).then((etats) => {
      const pret = etats.every(Boolean);
      res.writeHead(pret ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ etat: pret ? 'pret' : 'indisponible' }));
    });
    return;
  }
  const cible = destination(chemin);
  if (!cible) {
    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ erreur: 'aucun service ne sert cette adresse' }));
    return;
  }
  const envoi = (cible.protocol === 'https:' ? requeteChiffree : request)(
    { protocol: cible.protocol, hostname: cible.hostname, port: cible.port || (cible.protocol === 'https:' ? 443 : 80), method: req.method, path: (cible.pathname.replace(/\/+$/, '') || '') + req.url, headers: entetes(req, cible) },
    (reponse) => {
      res.writeHead(reponse.statusCode ?? 502, reponse.headers);
      // Une lecture « en direct » (text/event-stream) passe au fil de l'eau.
      reponse.pipe(res);
    },
  );
  envoi.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ erreur: 'le service ne répond pas' }));
    else res.end();
  });
  req.pipe(envoi);
});

// Une connexion qui change de protocole (WebSocket) passe telle quelle au service.
serveur.on('upgrade', (req, socket, tete) => {
  const cible = destination((req.url ?? '/').split('?')[0]);
  if (!cible) {
    socket.destroy();
    return;
  }
  const port = Number(cible.port || (cible.protocol === 'https:' ? 443 : 80));
  const vers = cible.protocol === 'https:' ? connecterChiffre({ host: cible.hostname, port, servername: cible.hostname }) : connect(port, cible.hostname);
  vers.on('connect', () => undefined);
  vers.once(cible.protocol === 'https:' ? 'secureConnect' : 'connect', () => {
    const lignes = [req.method + ' ' + req.url + ' HTTP/1.1', ...Object.entries({ ...req.headers, host: cible.host }).map(([n, v]) => n + ': ' + v), '', ''];
    vers.write(lignes.join('\r\n'));
    if (tete?.length) vers.write(tete);
    vers.pipe(socket).pipe(vers);
  });
  vers.on('error', () => socket.destroy());
  socket.on('error', () => vers.destroy());
});

const port = Number(process.env.PORT ?? 8080);
const ecoute = process.env.HUMALIS_ECOUTE?.trim();
const pret = () => console.log('Relais « entree » prêt : http://localhost:' + port + ' (' + Object.keys(ADRESSES).length + ' services).');
if (ecoute) serveur.listen(port, ecoute, pret);
else serveur.listen(port, pret);
// Un arrêt propre : les requêtes en cours finissent.
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => serveur.close(() => process.exit(0)));
`,
  );
  fichiers.set(
    '.env.exemple',
    `# Copie ce fichier en .env et remplis-le.
# L'adresse de chaque service, sans / à la fin (par exemple http://127.0.0.1:3001).
${services.map((n) => `${variableDuService(n)}=`).join('\n')}
# Le site web, s'il est servi à part (sinon, tout chemin hors des services répond 404).
HUMALIS_ENTREE_SITE=
# Le port du relais (8080 par défaut), et l'adresse d'écoute (127.0.0.1 derrière un autre relais).
PORT=
HUMALIS_ECOUTE=
`,
  );
  fichiers.set(
    'LISEZMOI.md',
    `# Le relais « entree »

Produit par Humalis. Une seule adresse publique devant les services du projet : les pages, le web et les applications
ne parlent qu'à lui (une adresse, un cookie, pas de CORS). Aucune dépendance : \`node:http\`.

\`\`\`sh
cp .env.exemple .env      # puis l'adresse de chaque service
npm start                 # http://localhost:8080
\`\`\`

Derrière ce relais, règle \`HUMALIS_RELAIS=1\` dans chaque service : leurs limites comptent alors chaque visiteur, pas le relais.

## La table des chemins

Ton propre relais peut la reprendre telle quelle (le chemin le plus précis d'abord) :

| Chemin | Service |
| --- | --- |
${table.map((l) => `| \`${l.chemin}\` | ${l.service} |`).join('\n')}

\`/sante\` répond 200 quand chaque service répond prêt.
`,
  );
  return fichiers;
}
