// Minimaler statischer Server für lokale Tests der PWA (keine Abhängigkeiten).
// Aufruf: node tests/server.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..');
const port = Number(process.argv[2]) || 8765;
const typen = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.js': 'text/javascript' };

http.createServer((req, res) => {
  const pfad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const datei = path.normalize(path.join(wurzel, pfad === '/' ? 'index.html' : pfad));
  if (!datei.startsWith(wurzel)) { res.writeHead(403).end(); return; }
  fs.readFile(datei, (err, inhalt) => {
    if (err) { res.writeHead(404).end('nicht gefunden'); return; }
    res.writeHead(200, { 'Content-Type': typen[path.extname(datei)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(inhalt);
  });
}).listen(port, () => console.log('http://localhost:' + port));
