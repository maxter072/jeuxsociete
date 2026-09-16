// Modale « fiche jeu » : classement restreint à un seul jeu, ouvertes en
// cliquant sur un jeu dans l'onglet « Par jeu » des classements.
// podium implicite : la première ligne du tableau est le meilleur joueur.

import { h, openModal, medal, resultIcon, fmtPts, fmtDateShort } from './ui.js';
import { standings } from './stats.js';
import { openPlayerStats } from './player-modal.js';

export function openGameStats(state, gameId) {
  const g = state.games.find((x) => x.id === gameId);
  if (!g) return;

  // Parties de ce jeu, de la plus récente à la plus ancienne.
  const played = state.sessions
    .filter((s) => s.gameId === gameId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const players = new Set();
  let points = 0;
  for (const s of played) {
    for (const r of s.results) {
      players.add(r.playerId);
      points += r.points;
    }
  }

  // Classement uniquement sur les parties de ce jeu, joueurs ayant joué au moins une fois.
  const rows = standings(state, played).filter((r) => r.games > 0);

  const content = h('div', {},
    h('div', { class: 'mini-grid' },
      mini(played.length, 'partie' + (played.length > 1 ? 's' : '')),
      mini(players.size, `joueur${players.size > 1 ? 's' : ''}`),
      mini(points, 'points distribués'),
      mini(played.length ? fmtDateShort(played[0].date) : '—', 'dernière partie'),
    ),
    h('h4', { class: 'pm-title' }, '🏆 Classement de ce jeu'),
    rows.length
      ? h('div', { class: 'tbl-wrap' },
          h('table', { class: 'tbl' },
            h('thead', {}, h('tr', {},
              h('th', {}, '#'),
              h('th', {}, 'Joueur'),
              h('th', { class: 'num' }, 'Parties'),
              h('th', { class: 'num' }, 'Victoires'),
              h('th', { class: 'num' }, 'Défaites'),
              h('th', { class: 'num' }, 'Taux'),
              h('th', { class: 'num' }, 'Points'),
            )),
            h('tbody', {}, rows.map((r, i) =>
              h('tr', {
                class: `${i < 3 ? 'me-top' : ''} row-player`,
                title: `Voir la fiche de ${r.player.name}`,
                onclick: () => openPlayerStats(state, r.player.id),
              },
                h('td', {}, i < 3 ? medal(i + 1) : String(i + 1)),
                h('td', {}, `${r.player.emoji} ${r.player.name}`),
                h('td', { class: 'num' }, String(r.games)),
                h('td', { class: 'num' }, String(r.wins)),
                h('td', { class: 'num' }, String(r.losses)),
                h('td', { class: 'num muted' }, `${Math.round((r.wins / r.games) * 100)} %`),
                h('td', { class: 'num pts' }, String(r.points)),
              ),
            )),
          ),
        )
      : h('p', { class: 'empty-note' }, 'Aucune partie enregistrée pour ce jeu.'),
    h('h4', { class: 'pm-title' }, '📝 Dernières parties'),
    played.length
      ? played.slice(0, 6).map((s) =>
          h('div', { class: 'list-item' },
            h('div', { class: 'grow' },
              h('div', { class: 'title' }, fmtDateShort(s.date)),
              h('div', { class: 'sub' }, `${s.results.length} joueur${s.results.length > 1 ? 's' : ''}${s.note ? ` · « ${s.note} »` : ''}`),
              h('div', { class: 'result-chips' },
                [...s.results].sort((a, b) => a.rank - b.rank).map((r) => {
                  const p = state.players.find((pl) => pl.id === r.playerId);
                  if (!p) return h('span', { class: 'rc' }, `${resultIcon(s, r.rank)} ? ${fmtPts(r.points)}`);
                  return h('span', {
                    class: 'rc clickable',
                    title: `Voir la fiche de ${p.name}`,
                    onclick: () => openPlayerStats(state, p.id),
                  }, `${resultIcon(s, r.rank)} ${p.emoji} ${p.name} ${fmtPts(r.points)}`);
                }),
              ),
            ),
          ),
        )
      : null,
  );

  openModal(`${g.emoji} ${g.name}${g.active ? '' : ' — inactif'}`, content, { wide: true });
}

function mini(v, label) {
  return h('div', { class: 'mini' }, h('b', {}, String(v)), h('span', {}, label));
}
