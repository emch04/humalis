// Un petit serveur d'essai : il numérote ce qu'il reçoit, pour vérifier l'ordre et l'absence de doublon.
import http from 'node:http';

const messages = [];
http.createServer((q, r) => {
  let corps = '';
  q.on('data', (d) => { corps += d; });
  q.on('end', () => {
    r.setHeader('Content-Type', 'application/json');
    if (q.url === '/auth/me') return r.end(JSON.stringify({ data: null }));
    if (q.url === '/api/messages' && q.method === 'GET') return r.end(JSON.stringify(messages));
    if (q.url === '/api/messages' && q.method === 'POST') {
      const lu = JSON.parse(corps);
      const message = { id: String(messages.length + 1), contenu: `${messages.length + 1}-${lu.contenu}` };
      messages.push(message);
      return r.end(JSON.stringify(message));
    }
    r.statusCode = 404;
    r.end('{}');
  });
}).listen(4979);
