// Modale « fiche joueur » : palmarès, points par semaine, jeux préférés,
// dernières parties. Ouverte en cliquant sur un joueur n'importe où
// (podiums, tableau des classements, puces de résultats, carte joueur).

import { h, openModal, medal, fmtDateShort } from './ui.js';
import { sessionsInRange, weekRange, shiftDays, isoWeekNumber } from './stats.js';

const WEEKS_SHOWN = 8;

export function openPlayerStats(state, playerId) {
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) return;

  // Sessions du joueur, de la plus récente à la plus ancienne.
  const played = state.sessions
    .filter((s) => s.results.some((r) => r.playerId === playerId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  let games = 0, wins = 0, podiums = 0, points = 0;
  const perGame = new Map();
  for (const s of played) {
    const r = s.results.find((x) => x.playerId === playerId);
    games++;
    points += r.points;
    if (r.rank === 1) wins++;
    if (r.rank <= 3) podiums++;
    perGame.set(s.gameId, (perGame.get(s.gameId) || 0) + 1);
  }

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

  const favs = [...perGame.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([gid, n]) => {
      const g = state.games.find((x) => x.id === gid);
      return h('span', { class: 'chip' }, `${g ? g.emoji : '🎲'} ${g ? g.name : 'Jeu supprimé'} ×${n}`);
    });

  const content = h('div', {},
    h('h4', { class: 'pm-title' }, '🏅 Palmarès'),
    h('div', { class: 'mini-grid' },
      mini(games, 'partie' + (games > 1 ? 's' : '')),
      mini(wins, 'victoire' + (wins > 1 ? 's' : '')),
      mini(podiums, 'podiums'),
      mini(points, 'points'),
    ),
    h('h4', { class: 'pm-title' }, `📈 Points par semaine (${WEEKS_SHOWN} dernières)`),
    h('div', { class: 'spark' }, weeks.map((w) =>
      h('div', { class: 'spark-col', title: `Semaine ${w.num} : ${w.pts} pt${w.pts > 1 ? 's' : ''}` },
        h('div', { class: 'spark-barbox' },
          h('div', {
            class: `spark-bar${w.pts ? '' : ' zero'}`,
            style: `height:${w.pts ? Math.max(8, Math.round((w.pts / maxPts) * 100)) : 3}%`,
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
            h('span', { class: 'rank-medal' }, medal(r.rank)),
            h('div', { class: 'grow' },
              h('div', { class: 'title' }, `${g?.emoji ?? '🎲'} ${g?.name ?? 'Jeu supprimé'}`),
              h('div', { class: 'sub' }, `${fmtDateShort(s.date)} · ${s.results.length} joueur${s.results.length > 1 ? 's' : ''}`),
            ),
            h('span', { class: 'chip teal' }, `+${r.points} pt${r.points > 1 ? 's' : ''}`),
          );
        })
      : h('p', { class: 'empty-note' }, 'Aucune partie enregistrée pour ce joueur.'),
  );

  openModal(`${p.emoji} ${p.name}${p.active ? '' : ' — inactif'}`, content);
}

function mini(v, label) {
  return h('div', { class: 'mini' }, h('b', {}, String(v)), h('span', {}, label));
}
