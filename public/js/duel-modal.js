// Modale « 🥊 Duel » : face-à-face entre deux joueurs — score, ex æquo,
// série en cours, détail par jeu et dernières confrontations.
// Ouverte depuis l'onglet Joueurs (« 🥊 Duel ») ou une fiche joueur
// (« 🥊 Défier… »). Ex æquo (coop, rescapés du pilipili) : match nul.

import { h, openModal, toast, fmtDateShort } from './ui.js';
import { standings } from './stats.js';
import { openPlayerStats } from './player-modal.js';
import { openGameStats } from './game-modal.js';

export function openDuelModal(state, idA = null, idB = null) {
  const actives = state.players.filter((p) => p.active);
  if (actives.length < 2) return toast('Il faut au moins deux joueurs pour un duel.', 'warn');

  // Défaut : les deux premiers du classement toutes périodes confondues.
  const top2 = standings(state, state.sessions).filter((r) => r.games > 0).map((r) => r.player.id);
  let A = actives.some((p) => p.id === idA) ? idA : top2[0];
  let B = idB && idB !== A && actives.some((p) => p.id === idB) ? idB
    : top2.find((id) => id !== A) || actives.find((p) => p.id !== A)?.id;
  if (!A || !B || A === B) return toast('Choisissez deux joueurs différents.', 'warn');

  const content = h('div', {});
  openModal('🥊 Duel', content, { wide: true });
  const rerender = () => {
    content.innerHTML = '';
    content.append(build());
  };

  function build() {
    const P = (id) => state.players.find((p) => p.id === id);

    // Confrontations, de la plus ancienne à la plus récente.
    const meetings = [];
    for (const s of [...state.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))) {
      const ra = s.results.find((r) => r.playerId === A);
      const rb = s.results.find((r) => r.playerId === B);
      if (!ra || !rb) continue;
      meetings.push({ s, ra, rb, w: ra.rank < rb.rank ? 'A' : rb.rank < ra.rank ? 'B' : null });
    }

    const wins = { A: 0, B: 0, d: 0 };
    const perGame = new Map(); // gameId -> { a, b, d }
    for (const m of meetings) {
      if (m.w) wins[m.w]++; else wins.d++;
      const st = perGame.get(m.s.gameId) || { a: 0, b: 0, d: 0 };
      if (m.w === 'A') st.a++;
      else if (m.w === 'B') st.b++;
      else st.d++;
      perGame.set(m.s.gameId, st);
    }

    // Série en cours dans le duel (un ex æquo l'arrête).
    let streak = null;
    for (const m of [...meetings].reverse()) {
      if (!m.w) break;
      if (!streak) streak = { who: m.w, n: 0 };
      if (m.w !== streak.who) break;
      streak.n++;
    }

    const pa = P(A), pb = P(B);
    const opt = (sel) => actives.map((p) => h('option', { value: p.id, selected: p.id === sel }, `${p.emoji} ${p.name}`));
    // Changer un camp pour l'adversaire les échange (jamais A contre A).
    const selA = h('select', {
      style: 'flex:1;min-width:0',
      onchange: (e) => { const v = e.target.value; if (v === B) B = A; A = v; rerender(); },
    }, opt(A));
    const selB = h('select', {
      style: 'flex:1;min-width:0',
      onchange: (e) => { const v = e.target.value; if (v === A) A = B; B = v; rerender(); },
    }, opt(B));

    return h('div', {},
      h('div', { class: 'row', style: 'gap:.6rem' }, selA, h('span', { style: 'font-size:1.4rem' }, '🥊'), selB),
      h('div', { style: 'text-align:center;margin:.9rem 0 .1rem' },
        h('div', { style: 'font-size:2.2rem;font-weight:800;letter-spacing:.06em' }, `${wins.A} – ${wins.B}`),
        h('div', { class: 'muted small' }, meetings.length
          ? `${wins.A} victoire${wins.A > 1 ? 's' : ''} pour ${pa.name} · ${wins.B} pour ${pb.name}${wins.d ? ` · ${wins.d} ex æquo` : ''}`
          : 'Pas encore de confrontation.'),
        streak && streak.n >= 2
          ? h('p', { class: 'small', style: 'margin:.35rem 0 0' },
              `🔥 ${(streak.who === 'A' ? pa : pb).name} a gagné les ${streak.n} dernières confrontations`)
          : null,
      ),
      meetings.length
        ? h('div', {},
            h('h4', { class: 'pm-title' }, '🎮 Par jeu'),
            h('div', { class: 'row', style: 'gap:.35rem;flex-wrap:wrap' },
              [...perGame.entries()].map(([gid, st]) => {
                const g = state.games.find((x) => x.id === gid);
                return h('button', {
                  class: 'toggle',
                  title: `${pa.name} ${st.a} – ${st.b} ${pb.name}${st.d ? ` · ${st.d} ex æquo` : ''} — voir la fiche du jeu`,
                  onclick: () => openGameStats(state, gid),
                }, `${g ? `${g.emoji} ${g.name}` : '🎲 Jeu supprimé'} ${st.a}–${st.b}`);
              }),
            ),
            h('h4', { class: 'pm-title' }, '📝 Dernières confrontations'),
            [...meetings].reverse().slice(0, 5).map((m) => {
              const g = state.games.find((x) => x.id === m.s.gameId);
              const winner = m.w === 'A' ? pa : m.w === 'B' ? pb : null;
              return h('div', { class: 'list-item' },
                h('div', { class: 'grow' },
                  h('div', { class: 'title' }, g ? `${g.emoji} ${g.name}` : '🎲 Jeu supprimé'),
                  h('div', { class: 'sub' }, `${fmtDateShort(m.s.date)} · ${m.s.results.length} joueur${m.s.results.length > 1 ? 's' : ''}`),
                ),
                winner
                  ? h('span', { class: 'chip teal' }, `🥇 ${winner.emoji} ${winner.name}`)
                  : h('span', { class: 'chip' }, '🤝 ex æquo'),
              );
            }),
          )
        : h('p', { class: 'empty-note' },
            `${pa.emoji} ${pa.name} et ${pb.emoji} ${pb.name} ne se sont encore jamais affrontés. À vos dés !`),
    );
  }

  rerender();
}
