// Vue « Parties » : historique complet des sessions, édition et suppression.

import { api } from '../api.js';
import { h, toast, confirmDialog, fmtDate, resultIcon, fmtPts } from '../ui.js';
import { openPartModal } from '../part-modal.js';
import { openPlayerStats } from '../player-modal.js';
import { openGameStats } from '../game-modal.js';

export function Parties(state, refresh) {
  const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  let q = '';

  const input = h('input', {
    type: 'search',
    placeholder: '🔍 Rechercher : jeu, joueur, note…',
    style: 'width:100%;border:1.5px solid var(--line);border-radius:9px;padding:.45rem .7rem;background:var(--surface);color:var(--ink);margin-bottom:.8rem',
    oninput: (e) => { q = e.target.value; renderList(); },
  });
  const listBox = h('div', {});
  const view = h('div', {},
    h('div', { class: 'spread', style: 'margin-bottom:.9rem' },
      h('h1', {}, `📝 Parties (${state.sessions.length})`),
      h('button', { class: 'btn primary', onclick: () => openPartModal(state, refresh) }, '➕ Enregistrer une partie'),
    ),
    sessions.length ? [input, listBox] : listBox,
  );

  renderList();
  return view;

  /** Recherche insensible à la casse et aux accents. */
  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function matches(s) {
    if (!q.trim()) return true;
    const needle = norm(q.trim());
    const g = state.games.find((x) => x.id === s.gameId);
    if (norm(g?.name).includes(needle) || norm(s.note).includes(needle)) return true;
    return s.results.some((r) => norm(state.players.find((p) => p.id === r.playerId)?.name).includes(needle));
  }

  function renderList() {
    const filtered = sessions.filter(matches);
    listBox.innerHTML = '';
    listBox.append(
      q.trim()
        ? h('p', { class: 'muted small', style: 'margin:0 0 .5rem' },
            `${filtered.length} partie${filtered.length > 1 ? 's' : ''} trouvée${filtered.length > 1 ? 's' : ''}`)
        : null,
      filtered.length
        ? h('section', { class: 'card' }, filtered.map((s) => sessionRow(s)))
        : h('p', { class: 'empty-note card' }, q.trim()
            ? 'Aucune partie ne correspond à cette recherche.'
            : 'Aucune partie enregistrée. Cliquez sur « Enregistrer une partie » après votre prochaine pause !'),
    );
  }

  function sessionRow(s) {
    const g = state.games.find((x) => x.id === s.gameId);
    const ranked = [...s.results].sort((a, b) => a.rank - b.rank);

    return h('div', { class: 'list-item' },
      h('span', { class: 'draw-emj', style: 'width:46px;height:46px;font-size:1.4rem;border-radius:12px' }, g?.emoji ?? '🎲'),
      h('div', { class: 'grow' },
        h('div', {
          class: `title${g ? ' clickable' : ''}`,
          title: g ? 'Voir la fiche du jeu' : undefined,
          onclick: g ? () => openGameStats(state, g.id) : undefined,
        }, g?.name ?? 'Jeu supprimé'),
        h('div', { class: 'sub' }, `${fmtDate(s.date)} · ${s.results.length} joueur${s.results.length > 1 ? 's' : ''}`),
        s.note ? h('div', { class: 'sub', style: 'font-style:italic' }, `« ${s.note} »`) : null,
        h('div', { class: 'result-chips' },
          ranked.map((r) => {
            const p = state.players.find((pl) => pl.id === r.playerId);
            if (!p) return h('span', { class: `rc r${r.rank <= 3 ? r.rank : ''}` }, `${resultIcon(s, r.rank)} ? ${fmtPts(r.points)}`);
            return h('span', {
              class: `rc r${r.rank <= 3 ? r.rank : ''} clickable`,
              title: `Voir la fiche de ${p.name}`,
              onclick: () => openPlayerStats(state, p.id),
            }, `${resultIcon(s, r.rank)} ${p.emoji} ${p.name} ${fmtPts(r.points)}`);
          }),
        ),
      ),
      h('div', { class: 'row', style: 'gap:.3rem' },
        h('button', {
          class: 'btn sm',
          title: 'Rejouer : même jeu, mêmes joueurs',
          onclick: () => openPartModal(state, refresh, { presetGameId: s.gameId, presetPlayerIds: s.results.map((r) => r.playerId) }),
        }, '♻️'),
        h('button', { class: 'btn sm', title: 'Modifier', onclick: () => openPartModal(state, refresh, { session: s }) }, '✏️'),
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
