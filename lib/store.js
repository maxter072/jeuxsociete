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
// Garde-fous anti-abus : volume maximal de l'historique et forme des ids.
const MAX_SESSIONS = 10_000;
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

// Barème par défaut : points selon le rang + point de participation.
const DEFAULT_CONFIG = {
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
  // Premier lancement : pas de fichier, on part sur les données d'exemple.
  if (!fs.existsSync(DB_FILE)) {
    state = seedState();
    save();
    return;
  }

  // Parse strict d'un fichier : un JSON valide mais de forme inattendue est
  // traité comme corrompu (on ne démarre jamais sur un état inutilisable).
  const tryParse = (file) => {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      !parsed || typeof parsed !== 'object' ||
      !Array.isArray(parsed.players) || !Array.isArray(parsed.games) || !Array.isArray(parsed.sessions)
    ) {
      throw new Error('structure inattendue');
    }
    return parsed;
  };

  try {
    state = tryParse(DB_FILE);
    return;
  } catch (err) {
    console.error(`⚠️ ${DB_FILE} illisible (${err.message}) — tentative avec la copie .bak…`);
  }

  try {
    state = tryParse(`${DB_FILE}.bak`);
    save(); // répare db.json immédiatement depuis la copie
    console.error('✅ Données restaurées depuis db.json.bak');
    return;
  } catch (err) {
    // Dernier recours : on met le fichier corrompu de côté au lieu de
    // l'écraser (il reste analysable), puis on repart sur des données neuves.
    try { fs.renameSync(DB_FILE, `${DB_FILE}.corrupt-${Date.now()}`); } catch { /* rien à archiver */ }
    console.error(`❌ db.json.bak illisible aussi (${err.message}) — démarrage sur des données neuves.`);
  }

  state = seedState();
  save();
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
  // '' et null sont refusés explicitement : Number('') vaudrait 0.
  if (v === undefined || v === null || v === '') throw new ApiError(400, `Champ manquant : ${field}`);
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
  const color = str(body.color ?? existing.color, 'Couleur', { optional: true, max: 20 }) || '#0f766e';
  return {
    name: str(body.name ?? existing.name, 'Nom'),
    emoji: str(body.emoji ?? existing.emoji, 'Emoji', { optional: true, max: 8 }) || '🙂',
    // La couleur finit dans des attributs style inline côté frontend : on
    // n'accepte que des hexadécimaux CSS, tout le reste retombe au défaut.
    color: /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : '#0f766e',
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

function normalizeResults(body, config, players = state.players) {
  const list = Array.isArray(body.results) ? body.results : [];
  if (!list.length) throw new ApiError(400, 'Il faut au moins un joueur classé');
  if (list.length > 20) throw new ApiError(400, 'Trop de joueurs dans une partie (20 max)');
  const seen = new Set();
  const cleaned = list.map((r) => {
    const player = players.find((p) => p.id === r.playerId);
    if (!player) throw new ApiError(400, 'Joueur inconnu dans les résultats');
    if (seen.has(player.id)) throw new ApiError(400, `${player.name} apparaît deux fois dans les résultats`);
    seen.add(player.id);
    const rank = int(r.rank, 'Rang', { min: 1, max: 20 });
    return { playerId: player.id, rank };
  });
  // Les points sont figés à l'enregistrement : changer le barème plus tard
  // ne réécrit jamais l'historique.
  const hasWinner = cleaned.some((r) => r.rank === 1);
  if (hasWinner) {
    return cleaned.map((r) => ({ ...r, points: pointsForRank(r.rank, config) }));
  }
  // Partie sans gagnant (mode « un seul perdant », pilipili) : les rescapés
  // marquent seulement le point de participation, le perdant (dernier rang)
  // perd 1 point.
  const worst = Math.max(...cleaned.map((r) => r.rank));
  return cleaned.map((r) => ({
    ...r,
    points: r.rank === worst ? -1 : (config.participationPoints || 0),
  }));
}

/** Valide un patch de configuration et renvoie la config résultante (sans muter). */
function normalizeConfig(patch, base = DEFAULT_CONFIG) {
  const cfg = structuredClone(base);
  if (patch.participationPoints !== undefined) {
    cfg.participationPoints = int(patch.participationPoints, 'Points de participation', { min: 0, max: 50 });
  }
  if (patch.pointsByRank !== undefined) {
    if (typeof patch.pointsByRank !== 'object' || patch.pointsByRank === null) {
      throw new ApiError(400, 'Barème invalide');
    }
    const clean = {};
    for (const [k, v] of Object.entries(patch.pointsByRank)) {
      // Clés filtrées strictement : pas d'injection de clés exotiques (__proto__…).
      if (!(k === 'default' || (/^[1-9]\d*$/.test(k) && Number(k) <= 20))) continue;
      clean[k] = int(v, `Points du rang ${k}`, { min: 0, max: 100 });
    }
    if (!('default' in clean)) clean.default = 0;
    cfg.pointsByRank = clean;
  }
  return cfg;
}

// ---------------------------------------------------------------- API du store

export const store = {
  load,

  /** État complet envoyé au client (avec quelques métadonnées serveur).
   *  Pas de chemin disque ici : le serveur n'expose pas son arborescence. */
  publicState() {
    return { ...state, meta: { dataFile: `data/${path.basename(DB_FILE)}` } };
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
    if (state.sessions.length >= MAX_SESSIONS) {
      throw new ApiError(409, `Nombre maximum de parties atteint (${MAX_SESSIONS}) : réinitialisez ou supprimez d'anciennes parties.`);
    }
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
    state.config = normalizeConfig(body, state.config);
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

  /** Restaure une sauvegarde. Chaque entité repasse par les mêmes validations
   *  que l'API (et les points sont recalculés) : une sauvegarde corrompue ou
   *  forgée est refusée au lieu de casser l'app. Seules des données de la
   *  bonne forme entrent dans l'état — aucune clé libre du fichier. */
  importState(body) {
    const ok =
      body &&
      typeof body === 'object' &&
      typeof body.config === 'object' &&
      body.config !== null &&
      Array.isArray(body.players) &&
      Array.isArray(body.games) &&
      Array.isArray(body.sessions);
    if (!ok) throw new ApiError(400, 'Fichier de sauvegarde invalide');
    if (body.players.length > 500) throw new ApiError(400, 'Trop de joueurs dans la sauvegarde (500 max)');
    if (body.games.length > 500) throw new ApiError(400, 'Trop de jeux dans la sauvegarde (500 max)');
    if (body.sessions.length > MAX_SESSIONS) throw new ApiError(400, `Trop de parties dans la sauvegarde (${MAX_SESSIONS} max)`);

    const config = normalizeConfig(body.config);
    const idOf = (v) => (typeof v === 'string' && ID_RE.test(v) ? v : uid());
    const metaOf = (v, fallback) => (typeof v === 'string' && v.length <= 40 ? v : fallback);

    const players = body.players.map((p) => ({
      id: idOf(p?.id),
      ...normalizePlayer(p || {}),
      active: p?.active !== false,
      createdAt: metaOf(p?.createdAt, nowISO()),
    }));
    const games = body.games.map((g) => ({
      id: idOf(g?.id),
      ...normalizeGame(g || {}),
      active: g?.active !== false,
      createdAt: metaOf(g?.createdAt, nowISO()),
    }));
    const noDupe = (arr, label) => {
      const ids = new Set();
      for (const x of arr) {
        if (ids.has(x.id)) throw new ApiError(400, `${label} en double dans la sauvegarde`);
        ids.add(x.id);
      }
    };
    noDupe(players, 'Joueur');
    noDupe(games, 'Jeu');

    const sessions = body.sessions.map((s) => {
      const game = games.find((g) => g.id === s?.gameId);
      if (!game) throw new ApiError(400, 'Partie liée à un jeu inconnu dans la sauvegarde');
      return {
        id: idOf(s?.id),
        gameId: game.id,
        date: /^\d{4}-\d{2}-\d{2}$/.test(s?.date || '') ? s.date : todayLocal(),
        results: normalizeResults(s || {}, config, players),
        note: str(s?.note, 'Note', { optional: true, max: 300 }),
        createdAt: metaOf(s?.createdAt, nowISO()),
      };
    });
    noDupe(sessions, 'Partie');

    const draw =
      body.draw && games.some((g) => g.id === body.draw.gameId)
        ? {
            gameId: body.draw.gameId,
            date: /^\d{4}-\d{2}-\d{2}$/.test(body.draw.date || '') ? body.draw.date : todayLocal(),
            at: metaOf(body.draw.at, nowISO()),
          }
        : null;

    state = {
      version: 1,
      config,
      players,
      games,
      sessions,
      draw,
      createdAt: metaOf(body.createdAt, nowISO()),
    };
    save();
    return { ok: true };
  },
};
