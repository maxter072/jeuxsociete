// Calculs : classements par période, stats joueurs/jeux, points.
// Les dates des parties sont des YYYY-MM-DD : la comparaison lexicale suffit.

export function pointsForRank(rank, config) {
  const base = config.pointsByRank[String(rank)] ?? config.pointsByRank.default ?? 0;
  return base + (config.participationPoints || 0);
}

export function sessionsInRange(state, from, to) {
  return state.sessions
    .filter((s) => s.date >= from && s.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** ym = 'YYYY-MM' -> {from, to} bornes du mois. */
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(lastDay).padStart(2, '0')}` };
}

export function yearRange(y) {
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Semaine ISO (lundi → dimanche) contenant la date donnée. */
export function weekRange(ref) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = d.getDay() || 7; // dimanche = 7
  d.setDate(d.getDate() - dow + 1); // lundi
  const from = toISODate(d);
  d.setDate(d.getDate() + 6);
  return { from, to: toISODate(d) };
}

export function shiftDays(ref, delta) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  d.setDate(d.getDate() + delta);
  return d;
}

/** Numéro de semaine ISO-8601. */
export function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // jeudi de la semaine
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

export function shiftMonth(ym, delta) {
  let [y, m] = ym.split('-').map(Number);
  m += delta;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Classement d'un ensemble de sessions.
 * Défaite = partie perdue : pas gagné quand la partie a un gagnant
 * (coop exceptée : tous rang 1), ou être perdant quand elle n'en a pas
 * (mode « perdants » : les rescapés rang 2 ne gagnent ni ne perdent).
 * Tri : points, puis victoires, puis défaites, puis taux de victoire, puis nom.
 * Tous les joueurs actifs apparaissent, même à 0 partie.
 */
export function standings(state, sessions) {
  const rows = new Map();
  for (const p of state.players) {
    if (p.active) rows.set(p.id, { player: p, games: 0, wins: 0, losses: 0, points: 0 });
  }
  for (const s of sessions) {
    const hasWinner = s.results.some((r) => r.rank === 1);
    for (const r of s.results) {
      if (!rows.has(r.playerId)) {
        const p = state.players.find((pl) => pl.id === r.playerId);
        if (!p) continue; // joueur supprimé (normalement impossible)
        rows.set(p.id, { player: p, games: 0, wins: 0, losses: 0, points: 0 });
      }
      const row = rows.get(r.playerId);
      row.games++;
      if (r.rank === 1) row.wins++;
      else if (hasWinner || r.rank > 2) row.losses++;
      row.points += r.points;
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.games && a.games && b.wins / b.games - a.wins / a.games ||
      a.player.name.localeCompare(b.player.name, 'fr'),
  );
}

/** Totaux toutes périodes confondues, par joueur. */
export function playerTotals(state) {
  const map = new Map(state.players.map((p) => [p.id, { games: 0, wins: 0, points: 0, best: 0 }]));
  for (const s of state.sessions) {
    for (const r of s.results) {
      const t = map.get(r.playerId);
      if (!t) continue;
      t.games++;
      if (r.rank === 1) t.wins++;
      t.points += r.points;
      t.best = Math.max(t.best, r.rank);
    }
  }
  return map;
}

/** Nombre de parties par jeu. */
export function gamePlayCounts(state) {
  const map = new Map();
  for (const s of state.sessions) map.set(s.gameId, (map.get(s.gameId) || 0) + 1);
  return map;
}

/** Jeux éligibles au tirage : actifs, tenir dans le temps disponible, adaptés au nombre de présents. */
export function eligibleGames(state, presentCount, maxMinutes) {
  const limit = maxMinutes ?? state.config.breakMinutes;
  return state.games.filter(
    (g) =>
      g.active &&
      g.durationMin <= limit &&
      (presentCount === 0 || (presentCount >= g.minPlayers && presentCount <= g.maxPlayers)),
  );
}

// ------------------------------------------------------------------ présents (mémoire locale)

const PRESENTS_KEY = 'pj_presents';

export function getPresents(state) {
  let ids = [];
  try { ids = JSON.parse(localStorage.getItem(PRESENTS_KEY)) || []; } catch { ids = []; }
  const valid = new Set(ids.filter((id) => state.players.some((p) => p.id === id && p.active)));
  if (ids.length === 0) {
    // Premier usage : tout le monde est présent par défaut.
    for (const p of state.players) if (p.active) valid.add(p.id);
  }
  return valid;
}

export function setPresents(ids) {
  try { localStorage.setItem(PRESENTS_KEY, JSON.stringify([...ids])); } catch { /* stockage indisponible */ }
}
