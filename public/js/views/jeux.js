// Vue « Jeux » : grille de fiches, ajout / modification / (dés)activation / suppression.

import { api } from '../api.js';
import { h, toast, openModal, confirmDialog, norm, debounce } from '../ui.js';

const EMOJIS = ['🎲', '🃏', '🏰', '🕵️', '💌', '🚢', '🥸', '🏴‍☠️', '🪞', '🎭', '🐻', '🧩', '♟️', '🧭', '⚔️', '🔮'];
const CATEGORIES = ['Ambiance', 'Cartes', 'Coopération', 'Déduction', 'Dés', 'Stratégie', 'Réflexion', 'Lettres'];

export function Jeux(state, refresh) {
  const counts = new Map();
  for (const s of state.sessions) counts.set(s.gameId, (counts.get(s.gameId) || 0) + 1);

  // Tri : « 🔤 A→Z » ou « 🔥 Plus joués » (les inactifs restent toujours en fin de liste).
  let sort = 'name'; // 'name' | 'plays'
  const grid = h('div', { class: 'grid-games' });

  // Filtres : catégorie (puces) + recherche insensible à la casse et aux accents.
  let cat = ''; // '' = toutes les catégories
  let q = '';

  function sortedGames() {
    return [...state.games].sort((a, b) =>
      Number(b.active) - Number(a.active)
        || (sort === 'plays'
          ? ((counts.get(b.id) || 0) - (counts.get(a.id) || 0) || a.name.localeCompare(b.name, 'fr'))
          : a.name.localeCompare(b.name, 'fr')));
  }

  function visibleGames() {
    const nq = norm(q.trim());
    return sortedGames().filter((g) =>
      (!cat || g.category === cat)
      && (!nq || norm(g.name).includes(nq) || norm(g.category).includes(nq) || norm(g.description).includes(nq)));
  }

  function renderGrid() {
    grid.innerHTML = '';
    const list = visibleGames();
    if (list.length) grid.append(...list.map((g) => gameCard(g)));
    else grid.append(h('p', { class: 'empty-note' }, 'Aucun jeu ne correspond à ces critères.'));
  }

  const btnName = h('button', { class: 'btn sm primary', onclick: () => { if (sort !== 'name') { sort = 'name'; syncSort(); renderGrid(); } } }, '🔤 A→Z');
  const btnPlays = h('button', { class: 'btn sm ghost', onclick: () => { if (sort !== 'plays') { sort = 'plays'; syncSort(); renderGrid(); } } }, '🔥 Plus joués');
  function syncSort() {
    btnName.className = `btn sm ${sort === 'name' ? 'primary' : 'ghost'}`;
    btnPlays.className = `btn sm ${sort === 'plays' ? 'primary' : 'ghost'}`;
  }
  renderGrid();
  const runSearch = debounce(renderGrid);

  const searchI = h('input', {
    type: 'search',
    placeholder: '🔍 Rechercher un jeu…',
    style: 'width:100%;padding:.45rem .7rem;border:1.5px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink)',
    oninput: (e) => { q = e.target.value; runSearch(); },
  });

  // Puces de catégorie : celles de la liste de référence, plus toute catégorie
  // saisie librement dans les fiches (le filtre reste cliquable pour chacune).
  const cats = [...new Set([...CATEGORIES, ...state.games.map((g) => g.category).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b, 'fr'));
  const catRow = h('div', { class: 'row', style: 'gap:.4rem;flex-wrap:wrap;margin-bottom:.9rem' },
    h('span', { class: 'muted small', style: 'font-weight:700' }, 'Catégorie :'),
    ['', ...cats].map((c) =>
      h('button', {
        type: 'button',
        class: `toggle${c === cat ? ' on' : ''}`,
        onclick: (ev) => {
          cat = c;
          catRow.querySelectorAll('.toggle').forEach((b) => b.classList.remove('on'));
          ev.currentTarget.classList.add('on');
          renderGrid();
        },
      }, c || 'Toutes'),
    ),
  );

  return h('div', {},
    h('div', { class: 'spread', style: 'margin-bottom:.9rem' },
      h('h1', {}, `🎲 Les jeux (${state.games.length})`),
      h('button', { class: 'btn primary', onclick: () => openGameModal(null, refresh) }, '➕ Ajouter un jeu'),
    ),
    h('div', { class: 'row', style: 'gap:.4rem;margin-bottom:.9rem' }, searchI),
    h('div', { class: 'row', style: 'gap:.4rem;margin-bottom:.9rem;flex-wrap:wrap' },
      h('span', { class: 'muted small' }, 'Trier :'), btnName, btnPlays,
    ),
    catRow,
    grid,
    h('p', { class: 'muted small', style: 'margin-top:.6rem' },
      'Le tirage n’utilise que les jeux actifs, adaptés aux joueurs cochés sur l’accueil.'),
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
        played
          ? h('span', { class: 'muted small' }, `joué ${played} fois`)
          : h('span', { class: 'chip gold', title: 'Pas encore tiré — une bonne occasion de le découvrir !' }, '🌱 Jamais joué'),
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
