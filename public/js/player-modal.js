// Modale « fiche joueur » : palmarès, points par semaine, jeux préférés,
// dernières parties. Ouverte en cliquant sur un joueur n'importe où
// (podiums, tableau des classements, puces de résultats, carte joueur).

import { h, openModal, resultIcon, fmtPts, fmtDateShort } from './ui.js';
import { sessionsInRange, weekRange, shiftDays, isoWeekNumber, winStreak } from './stats.js';
import { openDuelModal } from './duel-modal.js';

const WEEKS_SHOWN = 8;

export function openPlayerStats(state, playerId) {
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) return;

  // Sessions du joueur, de la plus récente à la plus ancienne.
  const played = state.sessions
    .filter((s) => s.results.some((r) => r.playerId === playerId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  let games = 0, wins = 0, podiums = 0, points = 0;
  let best = null; // meilleur score en une partie
  const perGame = new Map();
  for (const s of played) {
    const r = s.results.find((x) => x.playerId === playerId);
    games++;
    points += r.points;
    if (r.rank === 1) wins++;
    if (r.rank <= 3) podiums++;
    if (!best || r.points > best.points) best = { points: r.points, date: s.date, gameId: s.gameId };
    perGame.set(s.gameId, (perGame.get(s.gameId) || 0) + 1);
  }
  // Première partie du joueur (« joueur depuis le … ») — played est triée du
  // plus récent au plus ancien, donc la dernière entrée est la plus vieille.
  const since = played.length ? played[played.length - 1].date : null;

  // Points par semaine (les 8 dernières, semaine courante comprise).
  const now = new Date();
  const weeks = [];
  for (let i = WEEKS_SHOWN - 1; i >= 0; i--) {
    const ref = shiftDays(now, -7 * i);
    const range = weekRange(ref);
    const pts = sessionsInRange(state, range.from, range.to)
      .reduce((n, s) => {
        const r = s.results.find((x) => x.playerId === playerId);
        return n + (r ? r.points : 0);
      }, 0);
    weeks.push({ num: isoWeekNumber(ref), pts });
  }
  const maxPts = Math.max(...weeks.map((w) => w.pts), 1);

  // Série de victoires en cours / record.
  const streak = winStreak(state, playerId);

  const favs = [...perGame.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([gid, n]) => {
      const g = state.games.find((x) => x.id === gid);
      return h('span', { class: 'chip' }, `${g ? g.emoji : '🎲'} ${g ? g.name : 'Jeu supprimé'} ×${n}`);
    });

  const content = h('div', {},
    h('div', { class: 'spread' },
      h('h4', { class: 'pm-title', style: 'margin:0' }, '🏅 Palmarès'),
      state.players.filter((p) => p.active).length >= 2
        ? h('button', { class: 'btn sm ghost', title: 'Face-à-face avec un autre joueur', onclick: () => openDuelModal(state, playerId) }, '🥊 Défier…')
        : null,
    ),
    h('div', { class: 'mini-grid' },
      mini(games, 'partie' + (games > 1 ? 's' : '')),
      mini(wins, 'victoire' + (wins > 1 ? 's' : '')),
      mini(podiums, 'podiums'),
      mini(points, 'points'),
    ),
    streak.current >= 2
      ? h('p', { class: 'small', style: 'margin:.5rem 0 0' },
          `🔥 Série en cours : ${streak.current} victoire${streak.current > 1 ? 's' : ''} — record : ${streak.best}`)
      : null,
    best
      ? h('p', { class: 'small', style: 'margin:.35rem 0 0' },
          `🏅 Record : ${fmtPts(best.points)} pt${Math.abs(best.points) > 1 ? 's' : ''} en une partie (${
            state.games.find((g) => g.id === best.gameId)?.name ?? 'jeu supprimé'
          }, ${fmtDateShort(best.date)})`)
      : null,
    since
      ? h('p', { class: 'small', style: 'margin:.35rem 0 0' }, `📅 Joueur depuis le ${fmtDateShort(since)}`)
      : null,
    h('h4', { class: 'pm-title' }, `📈 Points par semaine (${WEEKS_SHOWN} dernières)`),
    h('div', { class: 'spark' }, weeks.map((w) =>
      h('div', { class: 'spark-col', title: `Semaine ${w.num} : ${w.pts} pt${Math.abs(w.pts) > 1 ? 's' : ''}` },
        h('div', { class: 'spark-barbox' },
          h('div', {
            class: `spark-bar${w.pts ? '' : ' zero'}${w.pts < 0 ? ' neg' : ''}`,
            style: `height:${w.pts ? Math.max(8, Math.round((Math.abs(w.pts) / maxPts) * 100)) : 3}%`,
          }),
        ),
        h('span', { class: 'spark-lab' }, `S${w.num}`),
      ),
    )),
    h('h4', { class: 'pm-title' }, '🎮 Jeux préférés'),
    favs.length
      ? h('div', { class: 'row', style: 'gap:.35rem;flex-wrap:wrap' }, favs)
      : h('p', { class: 'muted small', style: 'margin:0' }, 'Aucun jeu pour l’instant.'),
    h('h4', { class: 'pm-title' }, '📝 Dernières parties'),
    played.length
      ? played.slice(0, 6).map((s) => {
          const r = s.results.find((x) => x.playerId === playerId);
          const g = state.games.find((x) => x.id === s.gameId);
          return h('div', { class: 'list-item' },
            h('span', { class: 'rank-medal' }, resultIcon(s, r.rank)),
            h('div', { class: 'grow' },
              h('div', { class: 'title' }, `${g?.emoji ?? '🎲'} ${g?.name ?? 'Jeu supprimé'}`),
              h('div', { class: 'sub' }, `${fmtDateShort(s.date)} · ${s.results.length} joueur${s.results.length > 1 ? 's' : ''}`),
            ),
            h('span', { class: 'chip teal' }, `${fmtPts(r.points)} pt${Math.abs(r.points) > 1 ? 's' : ''}`),
          );
        })
      : h('p', { class: 'empty-note' }, 'Aucune partie enregistrée pour ce joueur.'),
  );

  openModal(`${p.emoji} ${p.name}${p.active ? '' : ' — inactif'}`, content);
}

function mini(v, label) {
  return h('div', { class: 'mini' }, h('b', {}, String(v)), h('span', {}, label));
}
