// La revue de sécurité de la 3.0.0 (17 novembre 2026), sur un serveur produit et lancé pour de vrai :
//   node serveur-attaques-revue-300-seul.mjs <dossier du serveur produit> [port de départ]
// DATABASE_URL (ou HUMALIS_BASE) choisit la base ; sans elle, tout reste en mémoire. La dernière ligne écrite est un
// relevé JSON : ce que chaque essai a obtenu.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';

const dossier = process.argv[2];
const depart = Number(process.argv[3] ?? 4811);
const MOT_DE_PASSE = 'Essai-Solide-2026!';
const SECRET_SMTP = 'Secret-Du-Serveur-Envoi-2026';
const pause = (ms) => new Promise((p) => setTimeout(p, ms));
const json = { 'content-type': 'application/json' };

// Un faux serveur d'envoi, sur cette machine : il note ce qu'on lui présente pour s'identifier.
const presentes = [];
const faux = createServer((socket) => {
  let attente = '';
  let etape = 'commande';
  socket.write('220 essai ESMTP\r\n');
  socket.on('error', () => undefined);
  socket.on('data', (morceau) => {
    attente += morceau.toString('utf8');
    let fin;
    while ((fin = attente.indexOf('\r\n')) >= 0) {
      const ligne = attente.slice(0, fin);
      attente = attente.slice(fin + 2);
      if (etape === 'corps') {
        if (ligne === '.') {
          etape = 'commande';
          socket.write('250 pris\r\n');
        }
        continue;
      }
      if (etape === 'identifiant') {
        etape = 'secret';
        socket.write('334 UGFzc3dvcmQ6\r\n');
        continue;
      }
      if (etape === 'secret') {
        presentes.push(Buffer.from(ligne, 'base64').toString('utf8'));
        etape = 'commande';
        socket.write('235 identifié\r\n');
        continue;
      }
      const mot = ligne.split(' ')[0].toUpperCase();
      if (mot === 'EHLO') socket.write('250-essai\r\n250 AUTH PLAIN LOGIN\r\n');
      else if (mot === 'HELO') socket.write('250 essai\r\n');
      else if (mot === 'AUTH' && /^AUTH PLAIN /i.test(ligne)) {
        presentes.push(Buffer.from(ligne.slice(11), 'base64').toString('utf8'));
        socket.write('235 identifié\r\n');
      } else if (mot === 'AUTH') {
        etape = 'identifiant';
        socket.write('334 VXNlcm5hbWU6\r\n');
      } else if (mot === 'DATA') {
        etape = 'corps';
        socket.write('354 allez-y\r\n');
      } else if (mot === 'QUIT') socket.end('221 au revoir\r\n');
      else socket.write('250 bien\r\n');
    }
  });
}).listen(depart + 2, '127.0.0.1');

// Comme « npm start » : NODE_ENV n'est pas réglé (vitest le règle à « test »).
const { NODE_ENV: _sansNodeEnv, ...environnement } = process.env;
const commun = { JWT_SECRET: 'x'.repeat(40), HUMALIS_ADMIN_EMAIL: 'admin@essai.test', HUMALIS_ADMIN_MOT_DE_PASSE: MOT_DE_PASSE };
const enfants = [];
const journaux = [];
const lancer = (port, env) => {
  const e = spawn('node', ['dist/src/demarrer.js'], { cwd: dossier, env: { ...environnement, ...commun, ...env, PORT: String(port) } });
  const journal = { texte: '' };
  e.stdout.on('data', (d) => (journal.texte += d));
  e.stderr.on('data', (d) => (journal.texte += d));
  enfants.push(e);
  journaux.push(journal);
  return 'http://127.0.0.1:' + port;
};
const pret = async (base) => {
  for (let i = 0; i < 120; i++) {
    if (await fetch(base + '/sante').then((x) => x.ok, () => false)) return;
    await pause(150);
  }
  throw new Error('le serveur ne démarre pas :\n' + journaux.map((j) => j.texte).join('\n---\n'));
};
const connecter = async (base) => ({ ...json, authorization: 'Bearer ' + (await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@essai.test', password: MOT_DE_PASSE }) })).json()).data.token });

const r = {};
try {
  // Le serveur : ses e-mails partent vers un serveur d'envoi lointain, avec un identifiant et un mot de passe du .env.
  const base = lancer(depart, {
    HUMALIS_LIMITE_API: '100000',
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    HUMALIS_ADRESSE_SITE: 'https://site.essai.test',
    HUMALIS_EMAILS_HOTE: 'envoi.essai.invalid',
    HUMALIS_EMAILS_PORT: '587',
    HUMALIS_EMAILS_EXPEDITEUR: 'envoi@essai.test',
    HUMALIS_EMAILS_UTILISATEUR: 'compte-envoi',
    HUMALIS_EMAILS_MOT_DE_PASSE: SECRET_SMTP,
  });
  // Le témoin des limites : un serveur seul, lancé de la même façon, limite bien les requêtes venues de cette machine.
  const limite = lancer(depart + 1, { HUMALIS_LIMITE_API: '5', DATABASE_URL: '', HUMALIS_BASE: '' });
  await pret(base);
  await pret(limite);
  const A = await connecter(base);

  // 1. Dix « participer » en même temps sur un événement d'une seule place.
  {
    r.courses = [];
    for (let tour = 0; tour < 3; tour++) {
      const evenement = await (await fetch(base + '/api/evenements', { method: 'POST', headers: A, body: JSON.stringify({ nom: 'Atelier ' + tour, places: 1 }) })).json();
      await Promise.all(Array.from({ length: 10 }, () => fetch(base + '/api/evenements/faire/participer/' + evenement.id, { method: 'PATCH', headers: A, body: '{}' })));
      r.courses.push((await (await fetch(base + '/api/inscriptions?evenement=' + evenement.id, { headers: A })).json()).length);
    }
  }

  // 2. Le coffre des clés : un admin de l'application change l'hôte du serveur d'envoi, pas son mot de passe.
  {
    const regler = (cle, value) => fetch(base + '/auth/cles/' + cle, { method: 'PUT', headers: A, body: JSON.stringify({ value }) }).then((x) => x.status);
    r.coffreLu = JSON.stringify(await (await fetch(base + '/auth/cles', { headers: A })).json()).includes(SECRET_SMTP);
    r.changerHote = await regler('HUMALIS_EMAILS_HOTE', '127.0.0.1');
    r.changerPort = await regler('HUMALIS_EMAILS_PORT', String(depart + 2));
    await fetch(base + '/auth/forgot-password', { method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@essai.test' }) });
    for (let i = 0; i < 40 && presentes.length === 0; i++) await pause(150);
    r.motDePasseSmtpPresente = presentes.some((p) => p.includes(SECRET_SMTP));
  }

  // 3. Le témoin des limites.
  {
    const B = await connecter(limite);
    const statuts = [];
    for (let i = 0; i < 12; i++) statuts.push((await fetch(limite + '/api/evenements', { headers: B })).status);
    r.limiteLocaleServeurSeul = statuts.filter((s) => s === 429).length;
  }
} catch (erreur) {
  r.erreur = String(erreur?.stack ?? erreur);
  for (const j of journaux) console.error('---\n' + j.texte.slice(-3000));
  process.exitCode = 1;
} finally {
  for (const e of enfants) e.kill('SIGTERM');
  faux.close();
}
console.log(JSON.stringify(r));
