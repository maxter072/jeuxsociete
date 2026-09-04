// Persistance des données : un simple fichier JSON (data/db.json).
// Écriture atomique (fichier temporaire + renommage) + copie .bak avant chaque
// modification. Aucune dépendance externe.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/** Erreur métier renvoyée au client avec son code HTTP. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const uid = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const DIFFICULTIES = ['Facile', 'Moyen', 'Expert'];

// Barème par défaut : points selon le rang + point de participation.
const DEFAULT_CONFIG = {
  breakMinutes: 40,
  participationPoints: 1,
  pointsByRank: { '1': 5, '2': 3, '3': 2, '4': 1, default: 0 },
};

function seedState() {
  const now = nowISO();
  // 10 profils créés d'office (8 joueurs annoncés, 10 prénoms fournis) — désactivables dans l'app.
  const players = [
    ['Maxime', '🦊', '#e2593f'],
    ['Xavier', '🐻', '#7c5cbf'],
    ['Arnaud', '🦉', '#0f766e'],
    ['Jordan', '🐺', '#2563eb'],
    ['Logan', '🦁', '#d97706'],
    ['Florian', '🐸', '#059669'],
    ['Gaetan', '🐙', '#db2777'],
    ['Julien Roger', '🦖', '#0891b2'],
    ['Taeffic', '🐼', '#65a30d'],
    ['Damien', '🦅', '#9333ea'],
  ].map(([name, emoji, color]) => ({ id: uid(), name, emoji, color, active: true, createdAt: now }));

  // Valeurs plausibles par défaut : à ajuster librement dans l'onglet Jeux.
  const games = [
    { name: 'Auberge des pirates', emoji: '🏴‍☠️', minPlayers: 2, maxPlayers: 5, durationMin: 20, category: 'Cartes', difficulty: 'Facile' },
    { name: 'Love Letter', emoji: '💌', minPlayers: 2, maxPlayers: 6, durationMin: 15, category: 'Déduction', difficulty: 'Facile' },
    { name: 'Soupçons', emoji: '🕵️', minPlayers: 3, maxPlayers: 6, durationMin: 20, category: 'Déduction', difficulty: 'Facile' },
    { name: 'Tacta', emoji: '🎭', minPlayers: 3, maxPlayers: 6, durationMin: 15, category: 'Ambiance', difficulty: 'Facile' },
    { name: 'Trio', emoji: '🃏', minPlayers: 3, maxPlayers: 6, durationMin: 15, category: 'Cartes', difficulty: 'Facile' },
    { name: 'La cour des mirages', emoji: '🪞', minPlayers: 2, maxPlayers: 5, durationMin: 30, category: 'Cartes', difficulty: 'Moyen' },
    { name: 'Traite à Bord', emoji: '🚢', minPlayers: 4, maxPlayers: 8, durationMin: 20, category: 'Ambiance', difficulty: 'Moyen' },
    { name: 'Moustache', emoji: '🥸', minPlayers: 2, maxPlayers: 6, durationMin: 15, category: 'Ambiance', difficulty: 'Facile' },
  ].map((g) => ({ id: uid(), ...g, description: '', active: true, createdAt: now }));

  return {
    version: 1,
    config: structuredClone(DEFAULT_CONFIG),
    players,
    games,
    sessions: [],
    draw: null,
    createdAt: now,
  };
}

// ---------------------------------------------------------------- état + disque

let state = null;

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, `${DB_FILE}.bak`);
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function load() {
  if (fs.existsSync(DB_FILE)) {
    state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    state = seedState();
    save();
  }
}

// ---------------------------------------------------------------- validations

function str(v, field, { max = 80, optional = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (optional) return '';
    throw new ApiError(400, `Champ manquant : ${field}`);
  }
  if (typeof v !== 'string') throw new ApiError(400, `Champ invalide : ${field}`);
  return v.trim().slice(0, max);
}

function int(v, field, { min = 0, max = 100000 } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ApiError(400, `Valeur invalide pour ${field} (entier entre ${min} et ${max})`);
  }
  return n;
}

function pointsForRank(rank, config) {
  const base = config.pointsByRank[String(rank)] ?? config.pointsByRank.default ?? 0;
  return base + (config.participationPoints || 0);
}

function normalizePlayer(body, existing = {}) {
  return {
    name: str(body.name ?? existing.name, 'Nom'),
    emoji: str(body.emoji ?? existing.emoji, 'Emoji', { optional: true, max: 8 }) || '🙂',
    color: str(body.color ?? existing.color, 'Couleur', { optional: true, max: 20 }) || '#0f766e',
  };
}

function normalizeGame(body, existing = {}) {
  const name = str(body.name ?? existing.name, 'Nom');
  const minPlayers = int(body.minPlayers ?? existing.minPlayers ?? 2, 'Joueurs min', { min: 1, max: 20 });
  const maxPlayers = int(body.maxPlayers ?? existing.maxPlayers ?? 6, 'Joueurs max', { min: 1, max: 20 });
  if (maxPlayers < minPlayers) throw new ApiError(400, 'Le maximum de joueurs doit être supérieur ou égal au minimum');
  return {
    name,
    minPlayers,
    maxPlayers,
    durationMin: int(body.durationMin ?? existing.durationMin ?? 20, 'Durée', { min: 1, max: 600 }),
    category: str(body.category ?? existing.category, 'Catégorie', { optional: true, max: 40 }),
    difficulty: DIFFICULTIES.includes(body.difficulty ?? existing.difficulty) ? (body.difficulty ?? existing.difficulty) : 'Facile',
    emoji: str(body.emoji ?? existing.emoji, 'Emoji', { optional: true, max: 8 }) || '🎲',
    description: str(body.description ?? existing.description, 'Description', { optional: true, max: 300 }),
  };
}

function normalizeResults(body, config) {
  const list = Array.isArray(body.results) ? body.results : [];
  if (!list.length) throw new ApiError(400, 'Il faut au moins un joueur classé');
  if (list.length > 20) throw new ApiError(400, 'Trop de joueurs dans une partie (20 max)');
  const seen = new Set();
  return list.map((r) => {
    const player = state.players.find((p) => p.id === r.playerId);
    if (!player) throw new ApiError(400, 'Joueur inconnu dans les résultats');
    if (seen.has(player.id)) throw new ApiError(400, `${player.name} apparaît deux fois dans les résultats`);
    seen.add(player.id);
    const rank = int(r.rank, 'Rang', { min: 1, max: 20 });
    // Les points sont figés à l'enregistrement : changer le barème plus tard
    // ne réécrit jamais l'historique.
    return { playerId: player.id, rank, points: pointsForRank(rank, config) };
  });
}

// ---------------------------------------------------------------- API du store

export const store = {
  load,

  /** État complet envoyé au client (avec quelques métadonnées serveur). */
  publicState() {
    return { ...state, meta: { dataFile: DB_FILE } };
  },

  // ------- joueurs

  addPlayer(body) {
    const player = { id: uid(), ...normalizePlayer(body), active: true, createdAt: nowISO() };
    state.players.push(player);
    save();
    return player;
  },

  updatePlayer(id, body) {
    const player = state.players.find((p) => p.id === id);
    if (!player) throw new ApiError(404, 'Joueur introuvable');
    Object.assign(player, normalizePlayer(body, player));
    if (body.active !== undefined) player.active = Boolean(body.active);
    save();
    return player;
  },

  removePlayer(id) {
    const used = state.sessions.some((s) => s.results.some((r) => r.playerId === id));
    if (used) {
      throw new ApiError(409, 'Ce joueur a participé à des parties : suppression impossible pour préserver l’historique. Désactivez-le plutôt.');
    }
    const before = state.players.length;
    state.players = state.players.filter((p) => p.id !== id);
    if (state.players.length === before) throw new ApiError(404, 'Joueur introuvable');
    save();
  },

  // ------- jeux

  addGame(body) {
    const game = { id: uid(), ...normalizeGame(body), active: true, createdAt: nowISO() };
    state.games.push(game);
    save();
    return game;
  },

  updateGame(id, body) {
    const game = state.games.find((g) => g.id === id);
    if (!game) throw new ApiError(404, 'Jeu introuvable');
    Object.assign(game, normalizeGame(body, game));
    if (body.active !== undefined) game.active = Boolean(body.active);
    save();
    return game;
  },

  removeGame(id) {
    const used = state.sessions.some((s) => s.gameId === id);
    if (used) {
      throw new ApiError(409, 'Ce jeu a déjà été joué : suppression impossible pour préserver l’historique. Désactivez-le plutôt.');
    }
    const before = state.games.length;
    state.games = state.games.filter((g) => g.id !== id);
    if (state.games.length === before) throw new ApiError(404, 'Jeu introuvable');
    save();
  },

  // ------- parties (sessions)

  addSession(body) {
    const game = state.games.find((g) => g.id === body.gameId);
    if (!game) throw new ApiError(400, 'Jeu inconnu');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : todayLocal();
    const session = {
      id: uid(),
      gameId: game.id,
      date,
      results: normalizeResults(body, state.config),
      note: str(body.note, 'Note', { optional: true, max: 300 }),
      createdAt: nowISO(),
    };
    state.sessions.push(session);
    save();
    return session;
  },

  updateSession(id, body) {
    const session = state.sessions.find((s) => s.id === id);
    if (!session) throw new ApiError(404, 'Partie introuvable');
    const game = state.games.find((g) => g.id === body.gameId);
    if (!game) throw new ApiError(400, 'Jeu inconnu');
    session.gameId = game.id;
    if (/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) session.date = body.date;
    session.results = normalizeResults(body, state.config); // recalculés avec le barème actuel
    session.note = str(body.note, 'Note', { optional: true, max: 300 });
    save();
    return session;
  },

  removeSession(id) {
    const before = state.sessions.length;
    state.sessions = state.sessions.filter((s) => s.id !== id);
    if (state.sessions.length === before) throw new ApiError(404, 'Partie introuvable');
    save();
  },

  /** Supprime les parties d'une période [from, to] (dates YYYY-MM-DD incluses). */
  resetSessions(from, to) {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(from || '') && /^\d{4}-\d{2}-\d{2}$/.test(to || '') && from <= to;
    if (!ok) throw new ApiError(400, 'Période invalide');
    const before = state.sessions.length;
    state.sessions = state.sessions.filter((s) => s.date < from || s.date > to);
    const removed = before - state.sessions.length;
    save();
    return { removed };
  },

  // ------- configuration

  setConfig(body) {
    if (body.breakMinutes !== undefined) {
      state.config.breakMinutes = int(body.breakMinutes, 'Durée de la pause', { min: 5, max: 300 });
    }
    if (body.participationPoints !== undefined) {
      state.config.participationPoints = int(body.participationPoints, 'Points de participation', { min: 0, max: 50 });
    }
    if (body.pointsByRank !== undefined) {
      if (typeof body.pointsByRank !== 'object' || body.pointsByRank === null) {
        throw new ApiError(400, 'Barème invalide');
      }
      const clean = {};
      for (const [k, v] of Object.entries(body.pointsByRank)) {
        if (!(k === 'default' || (/^[1-9]\d*$/.test(k) && Number(k) <= 20))) continue;
        clean[k] = int(v, `Points du rang ${k}`, { min: 0, max: 100 });
      }
      if (!('default' in clean)) clean.default = 0;
      state.config.pointsByRank = clean;
    }
    save();
    return state.config;
  },

  // ------- tirage du jour

  setDraw(body) {
    if (!body.gameId) {
      state.draw = null;
    } else {
      const game = state.games.find((g) => g.id === body.gameId);
      if (!game) throw new ApiError(400, 'Jeu inconnu');
      state.draw = { gameId: game.id, date: /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : todayLocal(), at: nowISO() };
    }
    save();
    return state.draw;
  },

  // ------- sauvegarde / restauration

  importState(body) {
    const ok =
      body &&
      typeof body === 'object' &&
      typeof body.config === 'object' &&
      Array.isArray(body.players) &&
      Array.isArray(body.games) &&
      Array.isArray(body.sessions);
    if (!ok) throw new ApiError(400, 'Fichier de sauvegarde invalide');
    state = { ...seedState(), ...body };
    save();
    return { ok: true };
  },
};
