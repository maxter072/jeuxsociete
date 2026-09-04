// Client HTTP de l'API. Toute mutation renvoie l'état complet à jour.

async function req(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  state: () => req('GET', '/api/state'),

  savePlayer: (id, data) => (id ? req('PUT', `/api/players/${id}`, data) : req('POST', '/api/players', data)),
  deletePlayer: (id) => req('DELETE', `/api/players/${id}`),

  saveGame: (id, data) => (id ? req('PUT', `/api/games/${id}`, data) : req('POST', '/api/games', data)),
  deleteGame: (id) => req('DELETE', `/api/games/${id}`),

  saveSession: (id, data) => (id ? req('PUT', `/api/sessions/${id}`, data) : req('POST', '/api/sessions', data)),
  deleteSession: (id) => req('DELETE', `/api/sessions/${id}`),
  resetSessions: (data) => req('POST', '/api/sessions/reset', data),

  setConfig: (data) => req('PUT', '/api/config', data),
  setDraw: (data) => req('POST', '/api/draw', data),
  importState: (data) => req('POST', '/api/import', data),
};
