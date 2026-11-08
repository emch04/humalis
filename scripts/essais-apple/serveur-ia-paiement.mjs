// Un petit serveur d'essai : la réponse d'une IA par morceaux, et un paiement qui rend une adresse.
import http from 'node:http';

http.createServer((q, r) => {
  q.resume();
  q.on('end', async () => {
    r.setHeader('Content-Type', 'application/json');
    if (q.url === '/api/produits') return r.end(JSON.stringify([{ id: '1', nom: 'Exemple', total: 5 }]));
    if (q.url === '/auth/me') { r.statusCode = 200; return r.end(JSON.stringify({ data: null })); }
    if (q.url === '/auth/ia') {
      r.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const t of ['Bonjour', ' tout', ' le', ' monde']) {
        r.write(`data: ${JSON.stringify({ t })}\n\n`);
        await new Promise((f) => setTimeout(f, 1500));
      }
      return r.end();
    }
    if (q.url?.includes('/payer/')) return r.end(JSON.stringify({ url: 'https://example.com/paiement' }));
    r.statusCode = 404;
    r.end('{}');
  });
}).listen(4979);
