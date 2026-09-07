// Vue « Joueurs » : profils, stats cumulées, historique individuel.

import { api } from '../api.js';
import { h, toast, openModal, confirmDialog, fmtDateShort, resultIcon } from '../ui.js';
import { playerTotals } from '../stats.js';
import { openPlayerStats } from '../player-modal.js';

const EMOJIS = ['🦊', '🐻', '🦉', '🐺', '🦁', '🐸', '🐙', '🦖', '🐼', '🦅', '🐧', '🦝', '🐨', '🦄', '🐢', '🤖'];
const COLORS = ['#e2593f', '#7c5cbf', '#0f766e', '#2563eb', '#d97706', '#059669', '#db2777', '#0891b2', '#65a30d', '#9333ea'];

export function Joueurs(state, refresh) {
  const totals = playerTotals(state);
  const sorted = [...state.players].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'fr'));

  return h('div', {},
    h('div', { class: 'spread', style: 'margin-bottom:.9rem' },
      h('h1', {}, `👥 Les joueurs (${state.players.length})`),
      h('button', { class: 'btn primary', onclick: () => openPlayerModal(null, refresh) }, '➕ Ajouter un joueur'),
    ),
    h('div', { class: 'grid-players' }, sorted.map((p) => playerCard(p, totals.get(p.id) || { games: 0, wins: 0, points: 0 }))),
  );

  function playerCard(p, t) {
    const rate = t.games ? Math.round((t.wins / t.games) * 100) : 0;
    return h('div', { class: `card tight${p.active ? '' : ' inactive'}` },
      h('div', {
        class: 'row clickable',
        style: 'gap:.7rem;cursor:pointer',
        title: `Voir la fiche de ${p.name}`,
        onclick: () => openPlayerStats(state, p.id),
      },
        h('span', { class: 'avatar', style: `background:${p.color}22;border:2px solid ${p.color}` }, p.emoji),
        h('div', { style: 'min-width:0' },
          h('h3', {}, p.name),
          h('div', { class: 'muted small' }, `${t.games} partie${t.games > 1 ? 's' : ''} · ${t.wins} victoire${t.wins > 1 ? 's' : ''} (${rate} %)`),
          h('div', { class: 'muted small' }, `${t.points} point${t.points > 1 ? 's' : ''} au total`),
        ),
        !p.active ? h('span', { class: 'chip coral', style: 'margin-left:auto' }, 'inactif') : null,
      ),
      h('div', { class: 'row', style: 'gap:.35rem;margin-top:.7rem' },
        h('button', { class: 'btn sm', onclick: () => openHistoryModal(state, p) }, '📜 Historique'),
        h('button', { class: 'btn sm', onclick: () => openPlayerModal(p, refresh) }, '✏️ Modifier'),
        h('button', {
          class: 'btn sm ghost',
          onclick: async () => {
            try {
              await api.savePlayer(p.id, { name: p.name, emoji: p.emoji, color: p.color, active: !p.active });
              toast(p.active ? 'Joueur désactivé' : 'Joueur réactivé');
              await refresh();
            } catch (err) { toast(err.message, 'err'); }
          },
        }, p.active ? '🚫 Désactiver' : '✅ Réactiver'),
      ),
    );
  }
}

/** Historique d'un joueur : toutes ses parties, du plus récent au plus ancien. */
function openHistoryModal(state, player) {
  const rows = state.sessions
    .filter((s) => s.results.some((r) => r.playerId === player.id))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const content = h('div', {},
    rows.length
      ? rows.map((s) => {
          const r = s.results.find((x) => x.playerId === player.id);
          const g = state.games.find((x) => x.id === s.gameId);
          return h('div', { class: 'list-item' },
            h('span', { class: 'rank-medal' }, resultIcon(s, r.rank)),
            h('div', { class: 'grow' },
              h('div', { class: 'title' }, `${g?.emoji ?? '🎲'} ${g?.name ?? 'Jeu supprimé'}`),
              h('div', { class: 'sub' }, `${fmtDateShort(s.date)} · ${s.results.length} joueur${s.results.length > 1 ? 's' : ''}`),
            ),
            h('span', { class: 'chip teal' }, `+${r.points} pt${r.points > 1 ? 's' : ''}`),
          );
        })
      : h('p', { class: 'empty-note' }, 'Aucune partie enregistrée pour ce joueur.'),
  );

  openModal(`📜 Historique — ${player.emoji} ${player.name}`, content, { wide: true });
}

/** Modale de création / modification d'un joueur. */
export function openPlayerModal(player, refresh) {
  const d = player || { name: '', emoji: '🙂', color: COLORS[0] };
  let emoji = d.emoji;
  let color = d.color;

  const nameI = h('input', { type: 'text', value: d.name, required: true, maxlength: 60, placeholder: 'Prénom / pseudo' });
  const preview = h('span', {
    class: 'avatar',
    style: `background:${color}22;border:2px solid ${color};margin-bottom:.5rem`,
  }, emoji);
  const syncPreview = () => {
    preview.style.background = `${color}22`;
    preview.style.borderColor = color;
    preview.textContent = emoji;
  };
  const emojiWrap = h('div', { class: 'emoji-picks' },
    EMOJIS.map((e) => h('button', {
      type: 'button',
      class: e === emoji ? 'on' : '',
      onclick: (ev) => {
        emoji = e;
        emojiWrap.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
        ev.currentTarget.classList.add('on');
        syncPreview();
      },
    }, e)),
  );
  const colorWrap = h('div', { class: 'emoji-picks' },
    COLORS.map((c) => h('button', {
      type: 'button',
      class: c === color ? 'on' : '',
      style: `font-size:0;padding:9px 14px;background:${c}`,
      onclick: (ev) => {
        color = c;
        colorWrap.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
        ev.currentTarget.classList.add('on');
        syncPreview();
      },
    })),
  );

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        await api.savePlayer(player?.id, { name: nameI.value, emoji, color });
        modal.close();
        toast(player ? 'Joueur mis à jour ✅' : 'Joueur ajouté 👥');
        await refresh();
      } catch (err) { toast(err.message, 'err'); }
    },
  },
    preview,
    h('label', { class: 'field' }, h('span', {}, 'Nom'), nameI),
    h('label', { class: 'field' }, h('span', {}, 'Avatar'), emojiWrap),
    h('label', { class: 'field' }, h('span', {}, 'Couleur'), colorWrap),
    h('div', { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => modal.close() }, 'Annuler'),
      h('button', { type: 'submit', class: 'btn primary' }, player ? '💾 Enregistrer' : '➕ Ajouter'),
    ),
  );

  const modal = openModal(player ? 'Modifier le joueur' : 'Nouveau joueur', form);
  return modal;
}
