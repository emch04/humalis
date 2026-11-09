// Un petit serveur d'essai pour les composants natifs.
import http from 'node:http';

const taches = [];
let suivant = 1;
http.createServer((q, r) => {
  let corps = '';
  q.on('data', (d) => { corps += d; });
  q.on('end', () => {
    r.setHeader('Content-Type', 'application/json');
    if (q.url === '/auth/me') return r.end(JSON.stringify({ data: null }));
    if (q.url === '/api/taches' && q.method === 'GET') return r.end(JSON.stringify(taches));
    if (q.url === '/api/taches' && q.method === 'POST') {
      const t = { id: String(suivant++), ...JSON.parse(corps) };
      taches.push(t);
      r.statusCode = 201;
      return r.end(JSON.stringify(t));
    }
    if (q.method === 'DELETE') {
      const i = taches.findIndex((t) => q.url.endsWith(`/${t.id}`));
      if (i >= 0) taches.splice(i, 1);
      return r.end('{}');
    }
    r.statusCode = 404;
    r.end('{}');
  });
}).listen(4990);
