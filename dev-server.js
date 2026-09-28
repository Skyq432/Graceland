// Local preview server with live reload. No dependencies.
// Usage: node dev-server.js [port]   (or ./dev.sh, or npm run dev)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 5500);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
};

const RELOAD_SNIPPET = `<script>(function(){var s=new EventSource('/__livereload');s.onmessage=function(){location.reload()};})();</script>`;

const clients = new Set();

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url.replace(/^\/+/, '/'), 'http://localhost');
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (url.pathname === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  let filePath = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      // Match Netlify: /admin -> /admin/ so relative URLs resolve correctly
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { Location: url.pathname + '/' + url.search });
        res.end();
        return;
      }
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      if (ext === '.html') {
        const html = data.toString('utf8');
        const out = html.includes('</body>')
          ? html.replace('</body>', RELOAD_SNIPPET + '</body>')
          : html + RELOAD_SNIPPET;
        res.end(out);
      } else {
        res.end(data);
      }
    });
  });
});

let timer = null;
fs.watch(ROOT, { recursive: true }, (_event, file) => {
  if (!file || file.startsWith('.git') || file.includes('node_modules')) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`[reload] ${file}`);
    for (const c of clients) c.write('data: reload\n\n');
  }, 100);
});

server.listen(PORT, () => {
  console.log(`\n  De-Graceland local preview`);
  console.log(`  Approval portal: http://localhost:${PORT}/`);
  console.log(`  Admin:           http://localhost:${PORT}/admin/`);
  console.log(`\n  Watching for changes... (Ctrl+C to stop)\n`);
});
