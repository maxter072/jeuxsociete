// Vue « Jeux » : grille de fiches, ajout / modification / (dés)activation / suppression.

import { api } from '../api.js';
import { h, toast, openModal, confirmDialog } from '../ui.js';

const EMOJIS = ['🎲', '🃏', '🏰', '🕵️', '💌', '🚢', '🥸', '🏴‍☠️', '🪞', '🎭', '🐻', '🧩', '♟️', '🧭', '⚔️', '🔮'];
const CATEGORIES = ['Ambiance', 'Cartes', 'Coopération', 'Déduction', 'Dés', 'Stratégie', 'Réflexion', 'Lettres'];

export function Jeux(state, refresh) {
  const counts = new Map();
  for (const s of state.sessions) counts.set(s.gameId, (counts.get(s.gameId) || 0) + 1);

  const sorted = [...state.games].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'fr'));

  return h('div', {},
    h('div', { class: 'spread', style: 'margin-bottom:.9rem' },
      h('h1', {}, `🎲 Les jeux (${state.games.length})`),
      h('button', { class: 'btn primary', onclick: () => openGameModal(null, refresh) }, '➕ Ajouter un jeu'),
    ),
    h('div', { class: 'grid-games' }, sorted.map((g) => gameCard(g))),
    h('p', { class: 'muted small', style: 'margin-top:.6rem' },
      `Le tirage n’utilise que les jeux actifs d’une durée ≤ ${state.config.breakMinutes} min (modifiable dans Réglages).`),
  );

  function gameCard(g) {
    const played = counts.get(g.id) || 0;
    return h('div', { class: `card tight${g.active ? '' : ' list-item inactive'}` },
      h('div', { class: 'spread' },
        h('div', { class: 'row', style: 'gap:.6rem' },
          h('span', { class: 'draw-emj', style: 'width:54px;height:54px;font-size:1.7rem;border-radius:14px' }, g.emoji),
          h('div', {},
            h('h3', {}, g.name),
            h('div', { class: 'row', style: 'gap:.3rem' },
              h('span', { class: 'chip teal' }, `⏱ ${g.durationMin} min`),
              h('span', { class: 'chip' }, `👥 ${g.minPlayers}–${g.maxPlayers}`),
              g.category ? h('span', { class: 'chip' }, g.category) : null,
              h('span', { class: 'chip violet' }, `📶 ${g.difficulty}`),
            ),
          ),
        ),
        !g.active ? h('span', { class: 'chip coral' }, 'inactif') : null,
      ),
      g.description ? h('p', { class: 'muted small' }, g.description) : null,
      h('div', { class: 'spread', style: 'margin-top:.6rem' },
        h('span', { class: 'muted small' }, played ? `joué ${played} fois` : 'jamais joué'),
        h('div', { class: 'row', style: 'gap:.35rem' },
          h('button', { class: 'btn sm', onclick: () => openGameModal(g, refresh) }, '✏️ Modifier'),
          h('button', {
            class: 'btn sm ghost',
            onclick: async () => {
              try {
                await api.saveGame(g.id, { ...g, active: !g.active });
                toast(g.active ? 'Jeu désactivé' : 'Jeu réactivé');
                await refresh();
              } catch (err) { toast(err.message, 'err'); }
            },
          }, g.active ? '🚫 Désactiver' : '✅ Réactiver'),
          h('button', {
            class: 'btn sm danger',
            onclick: async () => {
              const msg = played
                ? `« ${g.name} » a été joué ${played} fois. La suppression est refusée afin de préserver l’historique : désactivez-le plutôt.`
                : `Supprimer « ${g.name} » définitivement ?`;
              if (!played && (await confirmDialog('Supprimer le jeu', msg))) {
                try { await api.deleteGame(g.id); toast('Jeu supprimé'); await refresh(); }
                catch (err) { toast(err.message, 'err'); }
              }
            },
          }, '🗑'),
        ),
      ),
    );
  }
}

/** Modale de création / modification d'un jeu. */
export function openGameModal(game, refresh) {
  const d = game || { name: '', emoji: '🎲', minPlayers: 2, maxPlayers: 6, durationMin: 20, category: '', difficulty: 'Facile', description: '' };
  let emoji = d.emoji;

  const nameI = h('input', { type: 'text', value: d.name, required: true, maxlength: 80, placeholder: 'Nom du jeu' });
  const durI = h('input', { type: 'number', value: d.durationMin, min: 1, max: 600 });
  const minI = h('input', { type: 'number', value: d.minPlayers, min: 1, max: 20 });
  const maxI = h('input', { type: 'number', value: d.maxPlayers, min: 1, max: 20 });
  const catI = h('input', { type: 'text', value: d.category, list: 'cat-list', maxlength: 40, placeholder: 'Catégorie' });
  const diffS = h('select', {},
    ['Facile', 'Moyen', 'Expert'].map((x) => h('option', { value: x, selected: x === d.difficulty }, x)),
  );
  const descI = h('input', { type: 'text', value: d.description, maxlength: 300, placeholder: 'Résumé, variante… (facultatif)' });

  const emojiWrap = h('div', { class: 'emoji-picks' },
    EMOJIS.map((e) =>
      h('button', {
        type: 'button',
        class: e === emoji ? 'on' : '',
        onclick: (ev) => {
          emoji = e;
          emojiWrap.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
          ev.currentTarget.classList.add('on');
        },
      }, e),
    ),
  );

  const datalist = h('datalist', { id: 'cat-list' }, CATEGORIES.map((c) => h('option', { value: c })));

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        await api.saveGame(game?.id, {
          name: nameI.value,
          emoji,
          durationMin: Number(durI.value),
          minPlayers: Number(minI.value),
          maxPlayers: Number(maxI.value),
          category: catI.value,
          difficulty: diffS.value,
          description: descI.value,
        });
        modal.close();
        toast(game ? 'Jeu mis à jour ✅' : 'Jeu ajouté 🎲');
        await refresh();
      } catch (err) { toast(err.message, 'err'); }
    },
  },
    h('label', { class: 'field' }, h('span', {}, 'Nom'), nameI),
    h('label', { class: 'field' }, h('span', {}, 'Icône'), emojiWrap),
    h('div', { class: 'field-row3' },
      h('label', { class: 'field' }, h('span', {}, 'Durée moyenne (min)'), durI),
      h('label', { class: 'field' }, h('span', {}, 'Joueurs min'), minI),
      h('label', { class: 'field' }, h('span', {}, 'Joueurs max'), maxI),
    ),
    h('div', { class: 'field-row' },
      h('label', { class: 'field' }, h('span', {}, 'Catégorie'), catI),
      h('label', { class: 'field' }, h('span', {}, 'Difficulté'), diffS),
    ),
    h('label', { class: 'field' }, h('span', {}, 'Description'), descI),
    datalist,
    h('div', { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => modal.close() }, 'Annuler'),
      h('button', { type: 'submit', class: 'btn primary' }, game ? '💾 Enregistrer' : '➕ Ajouter'),
    ),
  );

  const modal = openModal(game ? 'Modifier le jeu' : 'Nouveau jeu', form);
  return modal;
}
