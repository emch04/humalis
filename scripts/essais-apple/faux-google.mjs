// Un faux Google : la page de connexion renvoie un code à l'application, puis le code devient un jeton signé.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const prive = readFileSync(process.env.HUMALIS_FAUSSE_CLE, 'utf8');
const base64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const nonces = new Map();

http.createServer((q, r) => {
  let corps = '';
  q.on('data', (d) => { corps += d; });
  q.on('end', () => {
    const adresse = new URL(q.url, 'http://localhost');
    if (adresse.pathname === '/auth') {
      const code = `code-${nonces.size}`;
      nonces.set(code, { nonce: adresse.searchParams.get('nonce'), client: adresse.searchParams.get('client_id') });
      r.writeHead(302, { location: `${adresse.searchParams.get('redirect_uri')}?code=${code}&state=${adresse.searchParams.get('state')}` });
      return r.end();
    }
    if (adresse.pathname === '/token') {
      const lu = new URLSearchParams(corps);
      const connu = nonces.get(lu.get('code'));
      if (!connu || !lu.get('code_verifier')) { r.statusCode = 400; return r.end('{}'); }
      const maintenant = Math.floor(Date.now() / 1000);
      const debut = `${base64({ alg: 'RS256', kid: 'essai' })}.${base64({ iss: 'https://accounts.google.com', aud: connu.client, sub: 'google-1', email: 'admin@essai.test', email_verified: true, iat: maintenant, exp: maintenant + 600, nonce: connu.nonce })}`;
      r.setHeader('Content-Type', 'application/json');
      return r.end(JSON.stringify({ id_token: `${debut}.${createSign('RSA-SHA256').update(debut).sign(prive).toString('base64url')}` }));
    }
    r.statusCode = 404;
    r.end('{}');
  });
}).listen(4982);
