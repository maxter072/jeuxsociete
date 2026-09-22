// Test de fumée de l'API — lancer avec le serveur démarré :
//   PORT=3999 node server.js &  puis  node scripts/smoke-test.mjs 3999
// Attention : le test crée puis supprime des entrées. Prévoir un dossier de
// données de test (DATA_DIR=$(mktemp -d) PORT=3999 node server.js).
const base = `http://localhost:${process.argv[2] || 3000}`;
let failures = 0;

async function req(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function check(label, ok, extra = '') {
  console.log(`${ok ? '✅' : '❌'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}

const state0 = await req('GET', '/api/state');
if (state0.data.sessions?.length || state0.data.draw) {
  console.log('⚠️  Des données existantes sont présentes : le test y ajoutera et en retirera des entrées.');
}
check('GET /api/state', state0.status === 200);
check('seed: 10 joueurs', state0.data.players?.length === 10, `${state0.data.players?.length}`);
check('seed: 8 jeux', state0.data.games?.length === 8, `${state0.data.games?.length}`);
check('barème par défaut', state0.data.config?.pointsByRank?.['1'] === 5);

const [p1, p2, p3] = state0.data.players;
const game = state0.data.games[1];

// Joueur jetable : tous les tests de suppression se font dessus, le seed reste intact.
const tmp = await req('POST', '/api/players', { name: 'Test Auto', emoji: '🤖', color: '#123456' });
check('POST /api/players', tmp.status === 201);

const sess = await req('POST', '/api/sessions', {
  gameId: game.id,
  date: '2026-09-04',
  results: [
    { playerId: p1.id, rank: 1 },
    { playerId: p2.id, rank: 2 },
    { playerId: p3.id, rank: 3 },
    { playerId: tmp.data.id, rank: 4 },
  ],
});
check('POST /api/sessions', sess.status === 201);
const points = sess.data?.results?.map((r) => r.points);
check('points figés (6/4/3/2 avec participation +1)', JSON.stringify(points) === '[6,4,3,2]', JSON.stringify(points));

const blocked = await req('DELETE', `/api/players/${tmp.data.id}`);
check('DELETE joueur utilisé bloqué (409)', blocked.status === 409);

const del = await req('DELETE', `/api/sessions/${sess.data.id}`);
check('DELETE session', del.status === 200);
check('joueur libéré supprimable', (await req('DELETE', `/api/players/${tmp.data.id}`)).status === 200);

const upd = await req('PUT', `/api/players/${p1.id}`, { name: p1.name, active: false });
check('PUT /api/players (désactivation)', upd.status === 200 && upd.data.active === false);
await req('PUT', `/api/players/${p1.id}`, { name: p1.name, active: true });

const badRank = await req('POST', '/api/sessions', { gameId: game.id, date: '2026-09-04', results: [{ playerId: p2.id, rank: 0 }] });
check('rang invalide refusé (400)', badRank.status === 400);
const badCfg = await req('PUT', '/api/config', { breakMinutes: 'abc' });
check('config invalide refusée (400)', badCfg.status === 400);
const unknown = await req('GET', '/api/inconnu');
check('route inconnue (404)', unknown.status === 404);
const delUnknown = await req('DELETE', '/api/players/inconnu');
check('DELETE joueur inexistant (404)', delUnknown.status === 404);

const draw = await req('POST', '/api/draw', { gameId: game.id, date: '2026-09-04' });
check('POST /api/draw', draw.status === 200 && draw.data.draw?.gameId === game.id);
await req('POST', '/api/draw', { gameId: null });

const coopsess = await req('POST', '/api/sessions', {
  gameId: game.id,
  results: [ { playerId: p2.id, rank: 1 }, { playerId: p3.id, rank: 1 } ],
});
const coopPoints = coopsess.data?.results?.map((r) => r.points);
check('coop : tous rang 1 -> mêmes points', JSON.stringify(coopPoints) === '[6,6]', JSON.stringify(coopPoints));
await req('DELETE', `/api/sessions/${coopsess.data.id}`);

// Reset par période : deux sessions de dates différentes, on efface l'une puis tout.
const sA = await req('POST', '/api/sessions', { gameId: game.id, date: '2026-09-04', results: [{ playerId: p2.id, rank: 1 }] });
const sB = await req('POST', '/api/sessions', { gameId: game.id, date: '2025-01-10', results: [{ playerId: p3.id, rank: 1 }] });
const rMonth = await req('POST', '/api/sessions/reset', { from: '2026-09-01', to: '2026-09-30' });
check('reset du mois affiché (1 partie)', rMonth.status === 200 && rMonth.data.removed === 1, `removed=${rMonth.data?.removed}`);
const rAll = await req('POST', '/api/sessions/reset', { from: '0001-01-01', to: '9999-12-31' });
check('reset total (1 partie)', rAll.status === 200 && rAll.data.removed === 1, `removed=${rAll.data?.removed}`);
const rBad = await req('POST', '/api/sessions/reset', { from: 'nimp', to: '2026-09-30' });
check('reset période invalide refusé (400)', rBad.status === 400);

// ---- Sécurité : anti-CSRF, validation d'import, en-têtes, limite de débit

// Un POST cross-origin « simple » (text/plain, sans preflight) doit être refusé.
const csrf = await fetch(base + '/api/players', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: JSON.stringify({ name: 'CSRF' }),
});
check('POST text/plain refusé (415)', csrf.status === 415, `status=${csrf.status}`);

// Origine étrangère refusée, même origine acceptée.
const evil = await fetch(base + '/api/players', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'http://site-pirate.example' },
  body: JSON.stringify({ name: 'Pirate' }),
});
check('POST origine étrangère refusé (403)', evil.status === 403, `status=${evil.status}`);
const friend = await fetch(base + '/api/players', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: base },
  body: JSON.stringify({ name: 'Test Auto', emoji: '🧪' }),
});
check('POST même origine accepté', friend.status === 201, `status=${friend.status}`);
await req('DELETE', `/api/players/${(await friend.json()).id}`);

// Import corrompu refusé (jeu inconnu), puis aller-retour export → import OK.
const badImport = await req('POST', '/api/import', {
  config: {}, players: [], games: [],
  sessions: [{ gameId: 'inconnu', results: [{ playerId: 'x', rank: 1 }] }],
});
check('import corrompu refusé (400)', badImport.status === 400, `status=${badImport.status}`);
const backup = await (await fetch(base + '/api/export')).json();
const reImport = await req('POST', '/api/import', backup);
check('ré-import de la sauvegarde accepté (200)', reImport.status === 200, `status=${reImport.status}`);

// Le serveur n'expose pas son chemin disque.
const st = await req('GET', '/api/state');
check('chemin serveur non exposé', !String(st.data.meta?.dataFile || '').startsWith('/'), st.data.meta?.dataFile);

// En-têtes de sécurité sur la page.
const page2 = await fetch(base + '/');
check(
  'en-têtes de sécurité présents',
  page2.headers.get('x-content-type-options') === 'nosniff' && !!page2.headers.get('content-security-policy'),
);

// int('') ne vaut plus 0 : champ vide refusé.
const emptyCfg = await req('PUT', '/api/config', { participationPoints: '' });
check('config vide refusée (400)', emptyCfg.status === 400, `status=${emptyCfg.status}`);

// Rafale de mutations : la limite de débit finit par répondre 429.
let got429 = false;
for (let i = 0; i < 120 && !got429; i++) {
  const r = await req('POST', '/api/draw', { gameId: null });
  if (r.status === 429) got429 = true;
}
check('limite de débit en rafale (429)', got429);

// État final : identique à l'état initial (les entrées de test ont été retirées)
const stateF = await req('GET', '/api/state');
check(
  'état final = état initial',
  stateF.data.players.length === state0.data.players.length &&
    stateF.data.sessions.length === state0.data.sessions.length,
  `joueurs ${stateF.data.players.length}/${state0.data.players.length}, parties ${stateF.data.sessions.length}/${state0.data.sessions.length}`,
);

const page = await fetch(base + '/');
const html = await page.text();
check('page d\'accueil servie', page.status === 200 && html.includes('<title>'));

console.log(failures ? `\n${failures} test(s) en échec` : '\n🎉 Tous les tests passent');
process.exit(failures ? 1 : 0);
