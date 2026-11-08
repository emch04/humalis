// Un petit serveur d'essai : il numérote ce qu'il reçoit, pour vérifier l'ordre et l'absence de doublon.
// Le message « coupe » est enregistré, puis la connexion est coupée avant la réponse. S'il revient avec
// le même en-tête X-Humalis-Envoi, il est marqué « rejoue » ; sans cet en-tête, il compterait deux fois.
import http from 'node:http';

const messages = [];
const deja = new Map();
let coupe = false;
http.createServer((q, r) => {
  let corps = '';
  q.on('data', (d) => { corps += d; });
  q.on('end', () => {
    r.setHeader('Content-Type', 'application/json');
    if (q.url === '/auth/me') return r.end(JSON.stringify({ data: null }));
    if (q.url === '/api/messages' && q.method === 'GET') return r.end(JSON.stringify(messages));
    if (q.url === '/api/messages' && q.method === 'POST') {
      const lu = JSON.parse(corps);
      const cle = q.headers['x-humalis-envoi'];
      if (cle && deja.has(cle)) {
        const connu = deja.get(cle);
        connu.contenu = connu.contenu.replace(/-rejoue$/, '') + '-rejoue';
        r.setHeader('X-Humalis-Rejoue', '1');
        return r.end(JSON.stringify(connu));
      }
      const message = { id: String(messages.length + 1), contenu: `${messages.length + 1}-${lu.contenu}` };
      messages.push(message);
      if (cle) deja.set(cle, message);
      if (lu.contenu === 'coupe' && !coupe) {
        coupe = true;
        return q.socket.destroy();
      }
      return r.end(JSON.stringify(message));
    }
    r.statusCode = 404;
    r.end('{}');
  });
}).listen(4979);
