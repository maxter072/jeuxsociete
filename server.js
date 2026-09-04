// « Pause Jeux » — serveur HTTP en Node pur, zéro dépendance.
// Sert le frontend statique (public/) et une API JSON sous /api/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store, ApiError } from './lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(new ApiError(413, 'Requête trop volumineuse'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ApiError(400, 'JSON invalide'));
      }
    });
    req.on('error', () => reject(new ApiError(400, 'Requête interrompue')));
  });
}

// ------------------------------------------------------------------ API

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;
  const body = method === 'POST' || method === 'PUT' ? await readBody(req) : null;

  if (pathname === '/api/state' && method === 'GET') return json(res, 200, store.publicState());

  if (pathname === '/api/export' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="pause-jeux-sauvegarde.json"',
    });
    return res.end(JSON.stringify(store.publicState(), null, 2));
  }

  if (pathname === '/api/import' && method === 'POST') return json(res, 200, store.importState(body));

  if (pathname === '/api/config' && method === 'PUT') {
    store.setConfig(body);
    return json(res, 200, store.publicState());
  }

  if (pathname === '/api/draw' && method === 'POST') {
    store.setDraw(body);
    return json(res, 200, store.publicState());
  }

  if (pathname === '/api/sessions/reset' && method === 'POST') {
    const result = store.resetSessions(body.from, body.to);
    return json(res, 200, result);
  }

  const m = pathname.match(/^\/api\/(players|games|sessions)(?:\/([A-Za-z0-9-]+))?$/);
  if (m) {
    const [, coll, id] = m;
    const kind = { players: 'Player', games: 'Game', sessions: 'Session' }[coll];
    if (method === 'POST' && !id) return json(res, 201, store[`add${kind}`](body));
    if (method === 'PUT' && id) return json(res, 200, store[`update${kind}`](id, body));
    if (method === 'DELETE' && id) {
      store[`remove${kind}`](id);
      return json(res, 200, store.publicState());
    }
  }

  throw new ApiError(404, 'Route inconnue');
}

// ------------------------------------------------------------------ statique

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Méthode non autorisée' });
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'Accès interdit' });

  let target = file;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    target = path.join(PUBLIC_DIR, 'index.html'); // repli SPA
  }
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(target);
  stream.on('error', () => res.destroy()); // fichier disparu entre-temps : on coupe net
  stream.pipe(res);
}

// ------------------------------------------------------------------ serveur

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    if (err instanceof ApiError) return json(res, err.status, { error: err.message });
    console.error(err);
    return json(res, 500, { error: 'Erreur interne du serveur' });
  }
});

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error('Node.js >= 18 est requis.');
  process.exit(1);
}

store.load();
server.listen(PORT, HOST, () => {
  console.log(`🎲 Pause Jeux démarré : http://localhost:${PORT}`);
});
