// Modale « Enregistrer une partie » : choix du jeu, des présents, puis
// classement tactile (on touche les joueurs dans l'ordre d'arrivée).
// Mode coopératif : tout le monde finit rang 1.
// Mode « plusieurs gagnants » (jeux à factions : pirates, mutins…) :
// on touche les gagnants (rang 1), les autres finissent ex æquo.
// Mode « perdants » (pilipili, Traître à bord…) : personne ne gagne, on
// touche le ou les perdants (dernier rang), les autres finissent ex æquo
// au rang 2.

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
  let multi = false;
  let loser = false;
  let present; // Set des ids présents
  let order = []; // ordre d'arrivée, liste des gagnants (multi) ou des perdants (loser)

  if (session) {
    present = new Set(session.results.map((r) => r.playerId));
    const sorted = [...session.results].sort((a, b) => a.rank - b.rank);
    coop = sorted.length > 1 && sorted.every((r) => r.rank === 1);
    const rank1 = sorted.filter((r) => r.rank === 1).length;
    // Perdants : aucune place de premier (personne ne gagne).
    loser = !coop && rank1 === 0 && sorted.length > 1;
    // Plusieurs gagnants : au moins deux rangs 1 sans que tout le monde gagne,
    // ou des rangs doublés (perdants ex æquo).
    multi = !coop && !loser && rank1 > 0 && (rank1 > 1 || new Set(sorted.map((r) => r.rank)).size !== sorted.length);
    order = loser
      ? sorted.filter((r) => r.rank === sorted[sorted.length - 1].rank).map((r) => r.playerId) // perdants = dernier rang
      : multi
        ? sorted.filter((r) => r.rank === 1).map((r) => r.playerId)
        : sorted.map((r) => r.playerId);
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
    const losers = [...present].filter((id) => !order.includes(id)); // perdants ex æquo (mode multi)
    // Mode perdant unique : personne ne gagne, les rescapés marquent juste
    // le point de participation, le perdant perd 1 point (figés côté serveur).
    const piliPts = state.config.participationPoints || 0;
    const piliMalus = -1;

    const ranked = order.map((id, i) => {
      const p = state.players.find((pl) => pl.id === id);
      const badge = loser ? '💀' : coop || multi ? '🥇' : String(i + 1);
      const pts = loser ? piliMalus : pointsForRank(coop || multi ? 1 : i + 1, state.config);
      const label = `${pts > 0 ? '+' : ''}${pts} pt${Math.abs(pts) > 1 ? 's' : ''}`;
      return h(
        'button',
        {
          type: 'button',
          class: 'toggle on',
          title: loser ? 'Retirer des perdants' : multi ? 'Retirer des gagnants' : 'Retirer du classement',
          onclick: () => {
            order = order.filter((x) => x !== id);
            rerender();
          },
        },
        h('span', { class: 'badge-rank' }, badge),
        h('span', {}, `${p.emoji} ${p.name}`),
        h('span', { class: 'muted small' }, label),
      );
    });

    const toRank = activePlayers.filter((p) => present.has(p.id) && !order.includes(p.id));
    const rankPool = toRank.map((p) =>
      h(
        'button',
        {
          type: 'button',
          class: 'toggle',
          title: loser ? 'Déclarer perdant' : multi ? 'Déclarer gagnant' : undefined,
          onclick: () => {
            if (loser) order = order.includes(p.id) ? order.filter((x) => x !== p.id) : [...order, p.id];
            else order.push(p.id);
            rerender();
          },
        },
        loser
          ? h('span', { class: 'badge-rank' }, '👍')
          : multi
            ? h('span', { class: 'badge-rank' }, String(order.length + 1))
            : h('span', {}, p.emoji),
        h('span', {}, loser ? `${p.emoji} ${p.name}` : multi ? `🏳️ ${p.emoji} ${p.name}` : p.name),
        loser
          ? h('span', { class: 'muted small' }, `+${piliPts} pt${piliPts > 1 ? 's' : ''}`)
          : multi
            ? h('span', { class: 'muted small' }, `+${pointsForRank(order.length + 1, state.config)} pt${pointsForRank(order.length + 1, state.config) > 1 ? 's' : ''}`)
            : null,
      ),
    );

    const missing = present.size - order.length;
    const loserNames = order.map((id) => state.players.find((pl) => pl.id === id)?.name).filter(Boolean).join(' et ');
    const rankHint =
      present.size === 0
        ? 'Cochez au moins un joueur présent.'
        : loser
          ? present.size < 3
            ? 'Le mode « perdants » demande au moins 3 joueurs.'
            : order.length === 0
              ? 'Touchez le ou les perdants — personne ne gagne, les autres finissent ex æquo au rang 2.'
              : `${loserNames} perdant${order.length > 1 ? 's' : ''} 💀 (−1 pt${order.length > 1 ? 's chacun' : ''}) · ${present.size - order.length} rescapé${present.size - order.length > 1 ? 's' : ''} ex æquo au rang 2, aucun gagnant.`
          : multi
            ? order.length === 0
              ? 'Touchez les gagnants — les autres présents finiront perdants ex æquo.'
              : `${order.length} gagnant${order.length > 1 ? 's' : ''} 🥇 · ${losers.length} perdant${losers.length > 1 ? 's' : ''} ex æquo au rang ${order.length + 1}.`
            : missing === 0
              ? `Tous les présents sont classés${coop ? ' (mode coopératif)' : ''}. ✅`
              : `Touchez les joueurs dans l’ordre d’arrivée — il en reste ${missing} à classer.`;

    const loserBtn = h(
      'button',
      {
        type: 'button',
        class: `btn sm${loser ? ' primary' : ''}`,
        title: 'Pilipili, Traître à bord… : personne ne gagne, un ou plusieurs perdants (−1 pt chacun)',
        onclick: () => {
          loser = !loser;
          if (loser) {
            multi = false;
            coop = false;
            order = [];
          }
          rerender();
        },
      },
      '💀 Perdants',
    );
    const multiBtn = h(
      'button',
      {
        type: 'button',
        class: `btn sm${multi ? ' primary' : ''}`,
        title: 'Jeux à factions : pirates, mutins, loups-garous…',
        onclick: () => {
          multi = !multi;
          if (multi) {
            coop = false;
            loser = false;
          }
          rerender();
        },
      },
      '⚔️ Plusieurs gagnants',
    );
    const coopBtn = h(
      'button',
      {
        type: 'button',
        class: `btn sm${coop ? ' primary' : ''}`,
        onclick: () => {
          coop = !coop;
          if (coop) {
            multi = false;
            loser = false;
            order = [...present];
          }
          rerender();
        },
      },
      '🤝 Partie coop : tout le monde gagne',
    );
    const resetBtn = h(
      'button',
      { type: 'button', class: 'btn sm ghost', onclick: () => { order = []; coop = false; multi = false; loser = false; rerender(); } },
      '↺ Effacer le classement',
    );

    // --- récapitulatif des points
    let total = 0;
    if (loser) {
      total = (present.size - order.length) * piliPts + order.length * piliMalus;
    } else if (multi) {
      total = order.length * pointsForRank(1, state.config)
        + losers.length * pointsForRank(order.length + 1, state.config);
    } else {
      for (const [i, id] of order.entries()) {
        total += pointsForRank(coop ? 1 : i + 1, state.config);
      }
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
        h('span', {}, loser ? '💀 Perdants' : multi ? '🏆 Gagnants & perdants' : '🏁 Classement'),
        h('p', { class: 'small muted', style: 'margin:.1rem 0 .55rem' }, rankHint),
        h('div', { class: 'row', style: 'gap:.4rem' }, ranked, rankPool),
        h('div', { class: 'row', style: 'gap:.4rem;margin-top:.7rem' }, loserBtn, multiBtn, coopBtn, resetBtn),
      ),
      h('p', { class: 'small muted' }, `${total} point${Math.abs(total) > 1 ? 's' : ''} distribués au total.`),
      h('div', { class: 'form-actions' },
        h('button', { type: 'button', class: 'btn ghost', onclick: modal.close }, 'Annuler'),
        h('button', { type: 'submit', class: 'btn primary' }, session ? '💾 Mettre à jour' : '💾 Enregistrer la partie'),
      ),
    );
  }

  async function save() {
    if (!gameId) return toast('Choisissez un jeu.', 'warn');
    if (present.size === 0) return toast('Cochez au moins un joueur présent.', 'warn');

    let results;
    if (loser) {
      if (present.size < 3) return toast('Le mode « perdants » demande au moins 3 joueurs.', 'warn');
      if (order.length === 0) return toast('Désignez au moins un perdant.', 'warn');
      if (order.length >= present.size) return toast('Il faut au moins un rescapé : tout le monde ne peut pas perdre.', 'warn');
      // Personne ne gagne : rescapés ex æquo au rang 2, perdants ex æquo au dernier rang.
      results = [...present].filter((id) => !order.includes(id)).map((playerId) => ({ playerId, rank: 2 }))
        .concat(order.map((playerId) => ({ playerId, rank: present.size })));
    } else if (multi) {
      if (order.length === 0) return toast('Désignez au moins un gagnant.', 'warn');
      const losingRank = order.length + 1;
      results = order.map((playerId) => ({ playerId, rank: 1 }))
        .concat([...present].filter((id) => !order.includes(id)).map((playerId) => ({ playerId, rank: losingRank })));
    } else {
      const missing = present.size - order.length;
      if (missing > 0) return toast(`Il reste ${missing} joueur(s) à classer.`, 'warn');
      results = order.map((playerId, i) => ({ playerId, rank: coop ? 1 : i + 1 }));
    }
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
