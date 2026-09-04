// Modale « Enregistrer une partie » : choix du jeu, des présents, puis
// classement tactile (on touche les joueurs dans l'ordre d'arrivée).
// Mode coopératif : tout le monde finit rang 1 (ex-æquo gérées par l'API).

import { api } from './api.js';
import { h, openModal, toast, todayISO } from './ui.js';
import { pointsForRank, getPresents, setPresents } from './stats.js';

export function openPartModal(state, refresh, { session = null, presetGameId = null } = {}) {
  const activePlayers = state.players.filter((p) => p.active);
  const games = [...state.games].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  // État local de la modale
  let gameId = session?.gameId || presetGameId || games[0]?.id || '';
  let date = session?.date || todayISO();
  let note = session?.note || '';
  let coop = false;
  let present; // Set des ids présents
  let order = []; // ids dans l'ordre d'arrivée

  if (session) {
    present = new Set(session.results.map((r) => r.playerId));
    const sorted = [...session.results].sort((a, b) => a.rank - b.rank);
    order = sorted.map((r) => r.playerId);
    coop = sorted.length > 1 && sorted.every((r) => r.rank === 1);
  } else {
    present = new Set(getPresents(state));
    order = [];
  }

  const content = h('div', {});
  const modal = openModal(session ? 'Modifier la partie' : 'Enregistrer une partie', content, { wide: true });

  const rerender = () => {
    content.innerHTML = '';
    content.append(buildForm());
  };

  function buildForm() {
    // --- sélection du jeu
    const gameField = h(
      'label',
      { class: 'field' },
      h('span', {}, '🎲 Jeu'),
      h(
        'select',
        { onchange: (e) => { gameId = e.target.value; } },
        games.map((g) =>
          h('option', { value: g.id, selected: g.id === gameId }, `${g.emoji} ${g.name} — ${g.durationMin} min, ${g.minPlayers}–${g.maxPlayers} j.`),
        ),
      ),
    );

    // --- date + note
    const dateField = h(
      'label',
      { class: 'field' },
      h('span', {}, '📅 Date'),
      h('input', { type: 'date', value: date, onchange: (e) => { date = e.target.value; } }),
    );
    const noteField = h(
      'label',
      { class: 'field' },
      h('span', {}, '💬 Note (facultatif)'),
      h('input', {
        type: 'text',
        value: note,
        placeholder: 'Variante maison, anecdote…',
        maxlength: 300,
        oninput: (e) => { note = e.target.value; },
      }),
    );

    // --- présents
    const presentChips = activePlayers.map((p) =>
      h(
        'button',
        {
          type: 'button',
          class: `toggle${present.has(p.id) ? ' on' : ''}`,
          onclick: () => {
            if (present.has(p.id)) {
              present.delete(p.id);
              order = order.filter((id) => id !== p.id);
            } else {
              present.add(p.id);
            }
            setPresents(present);
            rerender();
          },
        },
        h('span', {}, p.emoji),
        p.name,
      ),
    );

    // --- classement
    const ranked = order.map((id, i) => {
      const p = state.players.find((pl) => pl.id === id);
      const rank = coop ? 1 : i + 1;
      return h(
        'button',
        {
          type: 'button',
          class: 'toggle on',
          title: 'Retirer du classement',
          onclick: () => {
            order = order.filter((x) => x !== id);
            rerender();
          },
        },
        h('span', { class: 'badge-rank' }, coop ? '🥇' : String(i + 1)),
        h('span', {}, `${p.emoji} ${p.name}`),
        h('span', { class: 'muted small' }, `+${pointsForRank(rank, state.config)} pt${pointsForRank(rank, state.config) > 1 ? 's' : ''}`),
      );
    });

    const toRank = activePlayers.filter((p) => present.has(p.id) && !order.includes(p.id));
    const rankPool = toRank.map((p) =>
      h(
        'button',
        {
          type: 'button',
          class: 'toggle',
          onclick: () => {
            order.push(p.id);
            rerender();
          },
        },
        h('span', {}, p.emoji),
        p.name,
      ),
    );

    const missing = present.size - order.length;
    const rankHint =
      present.size === 0
        ? 'Cochez au moins un joueur présent.'
        : missing === 0
          ? `Tous les présents sont classés${coop ? ' (mode coopératif)' : ''}. ✅`
          : `Touchez les joueurs dans l’ordre d’arrivée — il en reste ${missing} à classer.`;

    const coopBtn = h(
      'button',
      {
        type: 'button',
        class: `btn sm${coop ? ' primary' : ''}`,
        onclick: () => {
          coop = !coop;
          if (coop) order = [...present];
          rerender();
        },
      },
      '🤝 Partie coop : tout le monde gagne',
    );
    const resetBtn = h(
      'button',
      { type: 'button', class: 'btn sm ghost', onclick: () => { order = []; coop = false; rerender(); } },
      '↺ Effacer le classement',
    );

    // --- récapitulatif des points
    let total = 0;
    for (const [i, id] of order.entries()) {
      total += pointsForRank(coop ? 1 : i + 1, state.config);
    }

    // --- assemblage
    return h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        save();
      },
    },
      gameField,
      h('div', { class: 'field-row' }, dateField, h('div')),
      noteField,
      h('div', { class: 'field' },
        h('span', {}, `👥 Présents (${present.size})`),
        h('div', { class: 'row', style: 'gap:.4rem' }, presentChips),
      ),
      h('div', { class: 'field' },
        h('span', {}, '🏁 Classement'),
        h('p', { class: 'small muted', style: 'margin:.1rem 0 .55rem' }, rankHint),
        h('div', { class: 'row', style: 'gap:.4rem' }, ranked, rankPool),
        h('div', { class: 'row', style: 'gap:.4rem;margin-top:.7rem' }, coopBtn, resetBtn),
      ),
      h('p', { class: 'small muted' }, `${total} point${total > 1 ? 's' : ''} distribués au total.`),
      h('div', { class: 'form-actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: modal.close }, 'Annuler'),
        h('button', { type: 'submit', class: 'btn primary' }, session ? '💾 Mettre à jour' : '💾 Enregistrer la partie'),
      ),
    );
  }

  async function save() {
    const missing = present.size - order.length;
    if (!gameId) return toast('Choisissez un jeu.', 'warn');
    if (present.size === 0) return toast('Cochez au moins un joueur présent.', 'warn');
    if (missing > 0) return toast(`Il reste ${missing} joueur(s) à classer.`, 'warn');

    const results = order.map((playerId, i) => ({ playerId, rank: coop ? 1 : i + 1 }));
    try {
      await api.saveSession(session?.id, { gameId, date, note, results });
      modal.close();
      toast(session ? 'Partie mise à jour ✅' : 'Partie enregistrée 🎉');
      await refresh();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  rerender();
}
