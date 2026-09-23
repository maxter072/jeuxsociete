// « Pause Jeux » — serveur HTTP en Node pur, zéro dépendance.
// Sert le frontend statique (public/) et une API JSON sous /api/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
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

// En-têtes de sécurité sur toutes les réponses : l'app est 100 % locale
// (scripts, styles et données viennent d'ici — data:/blob: servent aux
// images générées côté navigateur), on interdit l'iframe et le reniflage.
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex', // app privée d'équipe : pas d'indexation moteur
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SEC_HEADERS,
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let over = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (over) return; // corps trop gros : on consomme sans stocker, pour que le client puisse lire le 413
      size += chunk.length;
      if (size > 2_000_000) {
        over = true;
        reject(new ApiError(413, 'Requête trop volumineuse'));
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

// --- protections des mutations --------------------------------------------
// Un POST cross-origin en text/plain n'est pas soumis au preflight CORS :
// une page Web piégée pourrait donc atteindre l'API depuis le navigateur
// d'un joueur. On n'accepte que du JSON (l'app envoie toujours ce type),
// et — si l'en-tête Origin est fourni — uniquement depuis notre hôte.

function checkMutation(req) {
  if (req.method === 'POST' || req.method === 'PUT') {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.startsWith('application/json')) {
      throw new ApiError(415, 'Content-Type application/json requis');
    }
  }
  const origin = req.headers.origin;
  if (origin) {
    // « Origin: null » accompagne les requêtes sensibles venues d'un contexte
    // opaque (sandbox iframe, fichier local) : jamais légitime ici.
    if (origin === 'null') throw new ApiError(403, 'Origine non autorisée');
    let originHost = null;
    try { originHost = new URL(origin).host; } catch { /* origine malformée */ }
    if (originHost !== (req.headers.host || '')) {
      throw new ApiError(403, 'Origine non autorisée');
    }
  }
}

// ------------------------------------------------------------------ hôte + IP

// IP réelle du client. Derrière le reverse proxy (nginx sur la même machine),
// toutes les requêtes arrivent depuis 127.0.0.1 : TRUST_PROXY=1 autorise alors
// l'en-tête X-Real-IP posé par nginx pour distinguer les clients (limite de
// débit, journal). Sans cet environnement, les en-têtes sont ignorés — un
// client direct ne peut pas se forger une fausse IP.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = String(req.headers['x-real-ip'] || '').trim()
      || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || '?';
}

// Allowlist des valeurs acceptées pour l'en-tête Host (séparées par des
// virgules). Bloque le « DNS rebinding », où un domaine attaquant résolu vers
// ce serveur enverrait son propre Host — ce qui contournerait la vérification
// d'Origine. Vide = filtrage désactivé (comportement historique, LAN direct).
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function checkHost(req) {
  if (!ALLOWED_HOSTS.length) return;
  const host = String(req.headers.host || '');
  if (!host) return; // HTTP/1.0 sans Host : rien à comparer
  const bare = host.split(':')[0].toLowerCase();
  const ok = ALLOWED_HOSTS.some((allowed) => {
    const a = allowed.toLowerCase();
    return a === bare || a === host.toLowerCase();
  });
  if (!ok) throw new ApiError(421, 'Hôte non autorisé');
}

// Mini limite de débit par IP sur les mutations (zéro dépendance) : borne
// l'usure disque (.bak + réécriture à chaque requête) et les boucles abusives.
const RATE_WINDOW = 10_000; // ms
const RATE_MAX = 60; // mutations par fenêtre et par IP
const buckets = new Map();

function rateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  if (buckets.size > 5000) {
    // Garde-fou mémoire : on ne vide pas tout (les clients légitimes gardent
    // leur compteur), on ne retire que les fenêtres expirées.
    for (const [k, b] of buckets) {
      if (now - b.t > RATE_WINDOW) buckets.delete(k);
    }
  }
  const b = buckets.get(ip);
  if (!b || now - b.t > RATE_WINDOW) {
    buckets.set(ip, { n: 1, t: now });
    return;
  }
  b.n += 1;
  if (b.n > RATE_MAX) throw new ApiError(429, 'Trop de requêtes — réessayez dans un instant.');
}

async function handleApi(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Journal des mutations (refusées comme acceptées) : une ligne lisible
    // dans journald / nohup pour retracer qui a fait quoi, et quand.
    console.log(`${new Date().toISOString()} ${clientIp(req)} ${req.method} ${url.pathname}`);
    checkMutation(req);
    rateLimit(req);
  }
  const { pathname } = url;
  const method = req.method;
  const body = method === 'POST' || method === 'PUT' ? await readBody(req) : null;

  // Sonde de vie : ne touche ni à la base ni aux en-têtes de sécurité spécifiques,
  // pensée pour nginx / systemd / toute sonde uptime côté VPS.
  if (pathname === '/api/health' && (method === 'GET' || method === 'HEAD')) {
    return json(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
  }

  if (pathname === '/api/state' && method === 'GET') return json(res, 200, store.publicState());

  if (pathname === '/api/export' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="pause-jeux-sauvegarde.json"',
      'X-Content-Type-Options': 'nosniff',
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
  // Comparaison avec le séparateur final : un dossier frère nommé
  // « public-quelquechose » ne doit jamais être servi.
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    return json(res, 403, { error: 'Accès interdit' });
  }

  let target = file;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    // Une URL avec extension (script, image…) qui n'existe pas est une vraie
    // 404 ; le repli SPA ne vaut que pour les routes de navigation.
    if (path.extname(rel)) return json(res, 404, { error: 'Fichier introuvable' });
    target = path.join(PUBLIC_DIR, 'index.html'); // repli SPA
  }

  const ext = path.extname(target).toLowerCase();
  const stat = fs.statSync(target);
  // ETag faible : le navigateur revalide à chaque visite (no-cache) mais ne
  // retélécharge le fichier que s'il a réellement changé (réponse 304).
  const etag = `W/"${stat.size.toString(36)}-${Math.round(stat.mtimeMs).toString(36)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache', ...SEC_HEADERS });
    return res.end();
  }

  const type = MIME[ext] || 'application/octet-stream';
  // Gzip : le JS/CSS domine le poids de la page, on divise le transfert par 3-4.
  const compressible = type.startsWith('text/') || type === 'application/json';
  const gz = compressible && String(req.headers['accept-encoding'] || '').includes('gzip');

  const headers = {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    ETag: etag,
    Vary: 'Accept-Encoding',
    ...SEC_HEADERS,
  };
  res.writeHead(200, gz ? { ...headers, 'Content-Encoding': 'gzip' } : headers);
  if (req.method === 'HEAD') return res.end();

  const raw = fs.createReadStream(target);
  raw.on('error', () => res.destroy()); // fichier disparu entre-temps : on coupe net
  if (gz) {
    const packed = raw.pipe(zlib.createGzip());
    packed.on('error', () => res.destroy());
    packed.pipe(res);
  } else {
    raw.pipe(res);
  }
}

// ------------------------------------------------------------------ serveur

const server = http.createServer(async (req, res) => {
  try {
    checkHost(req); // toutes les requêtes : API comme statique
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
if (major < 20) {
  console.error('Node.js >= 20 est requis (les versions antérieures ne sont plus maintenues).');
  process.exit(1);
}

store.load();
server.listen(PORT, HOST, () => {
  console.log(`🎲 Pause Jeux démarré : http://localhost:${PORT}`);
});
