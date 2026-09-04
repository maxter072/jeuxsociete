// Vue « Parties » : historique complet des sessions, édition et suppression.

import { api } from '../api.js';
import { h, toast, confirmDialog, fmtDate, medal } from '../ui.js';
import { openPartModal } from '../part-modal.js';
import { openPlayerStats } from '../player-modal.js';

export function Parties(state, refresh) {
  const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return h('div', {},
    h('div', { class: 'spread', style: 'margin-bottom:.9rem' },
      h('h1', {}, `📝 Parties (${state.sessions.length})`),
      h('button', { class: 'btn primary', onclick: () => openPartModal(state, refresh) }, '➕ Enregistrer une partie'),
    ),
    sessions.length
      ? h('section', { class: 'card' }, sessions.map((s) => sessionRow(s)))
      : h('p', { class: 'empty-note card' }, 'Aucune partie enregistrée. Cliquez sur « Enregistrer une partie » après votre prochaine pause !'),
  );

  function sessionRow(s) {
    const g = state.games.find((x) => x.id === s.gameId);
    const ranked = [...s.results].sort((a, b) => a.rank - b.rank);

    return h('div', { class: 'list-item' },
      h('span', { class: 'draw-emj', style: 'width:46px;height:46px;font-size:1.4rem;border-radius:12px' }, g?.emoji ?? '🎲'),
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, g?.name ?? 'Jeu supprimé'),
        h('div', { class: 'sub' }, `${fmtDate(s.date)} · ${s.results.length} joueur${s.results.length > 1 ? 's' : ''}`),
        s.note ? h('div', { class: 'sub', style: 'font-style:italic' }, `« ${s.note} »`) : null,
        h('div', { class: 'result-chips' },
          ranked.map((r) => {
            const p = state.players.find((pl) => pl.id === r.playerId);
            if (!p) return h('span', { class: `rc r${r.rank <= 3 ? r.rank : ''}` }, `${medal(r.rank)} ? +${r.points}`);
            return h('span', {
              class: `rc r${r.rank <= 3 ? r.rank : ''} clickable`,
              title: `Voir la fiche de ${p.name}`,
              onclick: () => openPlayerStats(state, p.id),
            }, `${medal(r.rank)} ${p.emoji} ${p.name} +${r.points}`);
          }),
        ),
      ),
      h('div', { class: 'row', style: 'gap:.3rem' },
        h('button', { class: 'btn sm', onclick: () => openPartModal(state, refresh, { session: s }) }, '✏️'),
        h('button', {
          class: 'btn sm danger',
          onclick: async () => {
            if (await confirmDialog('Supprimer la partie', `Supprimer la partie « ${g?.name ?? '?'} » du ${fmtDate(s.date)} ? Les points seront retirés des classements.`)) {
              try { await api.deleteSession(s.id); toast('Partie supprimée'); await refresh(); }
              catch (err) { toast(err.message, 'err'); }
            }
          },
        }, '🗑'),
      ),
    );
  }
}
