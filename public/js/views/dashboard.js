// Vue « Accueil » : jeu du jour (tirage animé ou choix manuel), temps disponible,
// présents, top 3, stats, dernières parties (édition/suppression rapides).

import { api } from '../api.js';
import { h, toast, confetti, fmtDateShort, medal, openModal, confirmDialog } from '../ui.js';
import { standings, sessionsInRange, monthRange, yearRange, weekRange, eligibleGames, gamePlayCounts, playerTotals, getPresents, setPresents } from '../stats.js';
import { openPartModal } from '../part-modal.js';

// Temps disponible pour le tirage : mémorisé localement, réglable sur l'accueil.
const DRAW_MIN_KEY = 'pj_draw_minutes';

function getDrawMinutes(state) {
  let v = null;
  try { v = Number(localStorage.getItem(DRAW_MIN_KEY)); } catch { v = null; }
  if (!Number.isInteger(v) || v < 5 || v > 300) v = state.config.breakMinutes;
  return v;
}

function setDrawMinutes(min) {
  try { localStorage.setItem(DRAW_MIN_KEY, String(min)); } catch { /* pas de stockage */ }
}

export function Dashboard(state, refresh) {
  const now = new Date();
  const todayISOstr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const view = h('div', {});
  view.append(buildHero());
  view.append(buildPresents());
  view.append(buildTops());
  view.append(buildStats());
  view.append(buildRecent());
  return view;

  function rerender() {
    document.getElementById('view').dispatchEvent(new CustomEvent('pj:rerender'));
  }

  // ------------------------------------------------ jeu du jour

  function buildHero() {
    const drawn = state.draw && state.draw.date === todayISOstr ? state.games.find((g) => g.id === state.draw.gameId) : null;

    if (!drawn) {
      const minutes = getDrawMinutes(state);
      return h('section', { class: 'card hero-draw' },
        h('div', { class: 'draw-emj floaty' }, '🎲'),
        h('div', { class: 'draw-info' },
          h('h1', {}, 'Quel jeu aujourd’hui ?'),
          h('p', { class: 'muted' }, `Tirage parmi les jeux de ${minutes} min max, adaptés aux joueurs présents.`),
        ),
        h('div', { class: 'draw-actions' },
          h('button', { class: 'btn gold big', onclick: startDraw }, '🎲 Tirer le jeu du jour'),
          h('button', { class: 'btn primary', onclick: openPickGameModal }, '✋ Choisir manuellement'),
          h('button', { class: 'btn coral', onclick: () => openPartModal(state, refresh) }, '📝 Enregistrer une partie'),
        ),
      );
    }

    return h('section', { class: 'card hero-draw' },
      h('div', { class: 'draw-emj' }, drawn.emoji),
      h('div', { class: 'draw-info' },
        h('p', { class: 'chip gold', style: 'width:fit-content' }, '🎯 Jeu du jour'),
        h('div', { class: 'game-name' }, drawn.name),
        h('div', { class: 'row', style: 'gap:.35rem' },
          h('span', { class: 'chip teal' }, `⏱ ${drawn.durationMin} min`),
          h('span', { class: 'chip' }, `👥 ${drawn.minPlayers}–${drawn.maxPlayers}`),
          drawn.category ? h('span', { class: 'chip' }, drawn.category) : null,
          h('span', { class: 'chip' }, `📶 ${drawn.difficulty}`),
        ),
      ),
      h('div', { class: 'draw-actions' },
        h('button', { class: 'btn primary', onclick: () => openPartModal(state, refresh, { presetGameId: drawn.id }) }, '📝 Enregistrer une partie'),
        h('button', { class: 'btn', onclick: openPickGameModal }, '✋ Choisir manuellement'),
        h('button', { class: 'btn ghost', onclick: startDraw }, '🎲 Choisir un autre jeu'),
        h('button', { class: 'btn ghost', onclick: cancelDraw }, '✕ Annuler le tirage'),
      ),
    );
  }

  async function startDraw() {
    const presents = getPresents(state);
    const minutes = getDrawMinutes(state);
    const eligible = eligibleGames(state, presents.size, minutes);
    if (!eligible.length) {
      toast(`Aucun jeu de ${minutes} min max pour ${presents.size} joueur(s) : ajustez le temps ou les présents, ou choisissez manuellement.`, 'warn');
      return;
    }
    const chosen = eligible[Math.floor(Math.random() * eligible.length)];
    await animateDraw(eligible, chosen);
    try {
      await api.setDraw({ gameId: chosen.id, date: todayISOstr });
      confetti();
      await refresh();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  async function cancelDraw() {
    try {
      await api.setDraw({ gameId: null });
      toast('Tirage annulé — à vous de choisir !');
      await refresh();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  /** Sélection manuelle du jeu du jour (on peut sortir des critères du tirage). */
  function openPickGameModal() {
    const minutes = getDrawMinutes(state);
    const presents = getPresents(state);
    const games = state.games
      .filter((g) => g.active)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    const content = h('div', {},
      h('p', { class: 'muted small', style: 'margin-top:0' },
        `Filtre actuel : ${minutes} min max, ${presents.size} joueur(s). Les jeux hors critères restent choisissables.`),
      games.length
        ? games.map((g) => {
            const fits = g.durationMin <= minutes &&
              (presents.size === 0 || (presents.size >= g.minPlayers && presents.size <= g.maxPlayers));
            return h('div', {
              class: 'list-item pick-row',
              onclick: async () => {
                try {
                  await api.setDraw({ gameId: g.id, date: todayISOstr });
                  modal.close();
                  toast(`Jeu du jour : ${g.name} 🎯`);
                  await refresh();
                } catch (err) { toast(err.message, 'err'); }
              },
            },
              h('span', { class: 'draw-emj', style: 'width:44px;height:44px;font-size:1.3rem;border-radius:12px' }, g.emoji),
              h('div', { class: 'grow' },
                h('div', { class: 'title' }, g.name),
                h('div', { class: 'row', style: 'gap:.3rem;margin-top:.2rem' },
                  h('span', { class: 'chip teal' }, `⏱ ${g.durationMin} min`),
                  h('span', { class: 'chip' }, `👥 ${g.minPlayers}–${g.maxPlayers}`),
                  fits ? null : h('span', { class: 'chip coral' }, 'hors critères'),
                ),
              ),
              h('span', { class: 'muted' }, '›'),
            );
          })
        : h('p', { class: 'empty-note' }, 'Aucun jeu actif — ajoutez-en dans l’onglet Jeux.'),
    );

    const modal = openModal('✋ Choisir le jeu du jour', content, { wide: true });
  }

  /** Petite machine à sous : les cartes défilent, ralentissent, puis la carte gagnante sort. */
  function animateDraw(eligible, chosen) {
    return new Promise((resolve) => {
      const card = h('div', { class: 'draw-card spinning' });
      const cta = h('div', { class: 'draw-cta' }, h('button', { class: 'btn gold big', onclick: finish }, 'C’est parti !'));
      const overlay = h('div', { class: 'draw-overlay', onclick: (e) => { if (e.target === overlay) finish(); } },
        h('div', { class: 'draw-stage' },
          h('div', { class: 'draw-title' }, '🎲 Tirage en cours…'),
          card,
          cta,
        ),
      );
      document.body.append(overlay);

      const delays = [70, 70, 80, 90, 100, 115, 135, 160, 195, 240, 300, 380];
      let i = 0;
      let done = false;

      function finish() {
        if (done) return;
        done = true;
        overlay.remove();
        resolve();
      }

      function tick() {
        if (i < delays.length) {
          const g = eligible[i % eligible.length];
          card.className = 'draw-card spinning';
          card.innerHTML = '';
          card.append(
            h('div', { class: 'dc-emoji' }, g.emoji),
            h('div', { class: 'dc-name' }, g.name),
            h('div', { class: 'dc-meta' }, h('span', {}, `⏱ ${g.durationMin} min`), h('span', {}, `👥 ${g.minPlayers}–${g.maxPlayers}`)),
          );
          setTimeout(tick, delays[i]);
          i++;
        } else {
          card.className = 'draw-card won';
          card.innerHTML = '';
          card.append(
            h('div', { class: 'dc-emoji' }, chosen.emoji),
            h('div', { class: 'dc-name' }, chosen.name),
            h('div', { class: 'dc-meta' },
              h('span', {}, `⏱ ${chosen.durationMin} min`),
              h('span', {}, `👥 ${chosen.minPlayers}–${chosen.maxPlayers}`),
              chosen.category ? h('span', {}, chosen.category) : null,
            ),
          );
          document.querySelector('.draw-title').textContent = '🎯 Le hasard a choisi !';
          cta.classList.add('show');
          confetti(0.5, 0.45);
          setTimeout(finish, 2600); // fermeture automatique pour aller vite
        }
      }
      tick();
    });
  }

  // ------------------------------------------------ joueurs présents + temps

  function buildPresents() {
    const presents = getPresents(state);
    const minutes = getDrawMinutes(state);

    const timeOptions = [...new Set([15, 20, 30, 40, 45, 60, state.config.breakMinutes])].sort((a, b) => a - b);

    return h('section', { class: 'card tight' },
      h('div', { class: 'spread' },
        h('h2', {}, `👥 Joueurs présents (${presents.size})`),
        h('span', { class: 'muted small' }, 'le tirage tient compte de ces choix'),
      ),
      h('div', { class: 'row', style: 'gap:.4rem' },
        state.players.filter((p) => p.active).map(chipFor)),
      h('div', { class: 'row', style: 'gap:.4rem;margin-top:.6rem' },
        h('span', { class: 'muted small', style: 'font-weight:700' }, '⏱ Temps disponible :'),
        timeOptions.map((v) =>
          h('button', {
            type: 'button',
            class: `toggle${v === minutes ? ' on' : ''}`,
            onclick: () => { setDrawMinutes(v); rerender(); },
          }, `${v} min`)),
      ),
    );

    function chipFor(p) {
      return h('button', {
        type: 'button',
        class: `toggle${presents.has(p.id) ? ' on' : ''}`,
        onclick: () => {
          const cur = getPresents(state);
          if (cur.has(p.id)) cur.delete(p.id); else cur.add(p.id);
          setPresents(cur);
          rerender();
        },
      }, h('span', {}, p.emoji), p.name);
    }
  }

  // ------------------------------------------------ top 3 mois / année

  function podium(title, rows, linkLabel, href) {
    const top = rows.filter((r) => r.games > 0).slice(0, 3);
    const steps = [];
    if (top.length) {
      const heights = { 0: 'p1', 1: 'p2', 2: 'p3' };
      top.forEach((r, i) => {
        steps.push(h('div', { class: `step ${heights[i]}` },
          h('span', { class: 'medal' }, medal(i + 1)),
          h('span', { class: 'pname' }, `${r.player.emoji} ${r.player.name}`),
          h('span', { class: 'ppts' }, `${r.points} pt${r.points > 1 ? 's' : ''}`),
          h('span', { class: 'pstats' }, `${r.games} partie${r.games > 1 ? 's' : ''} · ${r.wins} victoire${r.wins > 1 ? 's' : ''}`),
        ));
      });
    }
    return h('section', { class: 'card tight' },
      h('div', { class: 'spread' },
        h('h2', {}, title),
        h('a', { href, class: 'small' }, linkLabel),
      ),
      top.length ? h('div', { class: 'podium' }, steps) : h('p', { class: 'empty-note' }, 'Aucune partie enregistrée sur la période.'),
    );
  }

  function buildTops() {
    const week = weekRange(now);
    const month = monthRange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const year = yearRange(now.getFullYear());
    const weekRows = standings(state, sessionsInRange(state, week.from, week.to));
    const monthRows = standings(state, sessionsInRange(state, month.from, month.to));
    const yearRows = standings(state, sessionsInRange(state, year.from, year.to));
    return h('div', { class: 'grid3' },
      podium('⚡ Top 3 de la semaine', weekRows, 'semaine →', '#/classements?mode=week'),
      podium('🏆 Top 3 du mois', monthRows, 'mois →', '#/classements?mode=month'),
      podium('👑 Top 3 de l’année', yearRows, 'année →', '#/classements?mode=year'),
    );
  }

  // ------------------------------------------------ statistiques

  function buildStats() {
    const month = monthRange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const monthSessions = sessionsInRange(state, month.from, month.to);
    const counts = gamePlayCounts(state);
    const totals = playerTotals(state);

    let favGame = null;
    let favCount = 0;
    for (const [gid, n] of counts) {
      if (n > favCount) {
        const g = state.games.find((x) => x.id === gid);
        if (g) { favGame = g; favCount = n; }
      }
    }

    const monthTop = standings(state, monthSessions)[0];

    const tiles = [
      { label: 'Parties au total', value: state.sessions.length, sub: 'depuis le début' },
      { label: 'Ce mois-ci', value: monthSessions.length, sub: 'parties jouées' },
      favGame
        ? { label: 'Jeu favori', value: `${favGame.emoji} ${favGame.name}`, sub: `${favCount} partie${favCount > 1 ? 's' : ''}` }
        : { label: 'Jeu favori', value: '—', sub: 'aucune partie encore' },
      monthTop
        ? { label: 'Joueur du moment', value: `${monthTop.player.emoji} ${monthTop.player.name}`, sub: `${monthTop.points} pts ce mois-ci` }
        : { label: 'Joueur du moment', value: '—', sub: 'classement à venir' },
    ];

    return h('section', { class: 'tiles' },
      tiles.map((t) => h('div', { class: 'tile' },
        h('div', { class: 't-label' }, t.label),
        h('div', { class: 't-value' }, t.value),
        h('div', { class: 't-sub' }, t.sub),
      )),
    );
  }

  // ------------------------------------------------ dernières parties

  function buildRecent() {
    const recent = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
    return h('section', { class: 'card' },
      h('div', { class: 'spread' },
        h('h2', {}, '📝 Dernières parties'),
        h('a', { href: '#/parties', class: 'small' }, 'tout voir →'),
      ),
      recent.length
        ? h('div', {}, recent.map((s) => {
            const g = state.games.find((x) => x.id === s.gameId);
            return h('div', { class: 'list-item' },
              h('span', { class: 'draw-emj', style: 'width:46px;height:46px;font-size:1.4rem;border-radius:12px' }, g?.emoji ?? '🎲'),
              h('div', { class: 'grow' },
                h('div', { class: 'title' }, g?.name ?? 'Jeu supprimé'),
                h('div', { class: 'sub' }, fmtDateShort(s.date)),
                h('div', { class: 'result-chips' },
                  [...s.results].sort((a, b) => a.rank - b.rank).map((r) => {
                    const p = state.players.find((pl) => pl.id === r.playerId);
                    return h('span', { class: `rc r${r.rank <= 3 ? r.rank : ''}` }, `${medal(r.rank)} ${p ? `${p.emoji} ${p.name}` : '?'} +${r.points}`);
                  }),
                ),
              ),
              h('div', { class: 'row', style: 'gap:.3rem' },
                h('button', { class: 'btn sm', title: 'Modifier', onclick: () => openPartModal(state, refresh, { session: s }) }, '✏️'),
                h('button', {
                  class: 'btn sm danger',
                  title: 'Supprimer',
                  onclick: async () => {
                    if (await confirmDialog('Supprimer la partie', `Supprimer la partie « ${g?.name ?? '?'} » du ${fmtDateShort(s.date)} ?`)) {
                      try { await api.deleteSession(s.id); toast('Partie supprimée'); await refresh(); }
                      catch (err) { toast(err.message, 'err'); }
                    }
                  },
                }, '🗑'),
              ),
            );
          }))
        : h('p', { class: 'empty-note' }, 'Aucune partie pour l’instant. Lancez un tirage et amusez-vous !'),
    );
  }
}
