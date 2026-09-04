// Vue « Classements » : podium + tableau complet, par mois ou par année,
// avec navigation dans toutes les périodes passées (l'historique est conservé)
// et réinitialisation par mois, par année ou totale.

import { h, medal, monthLabel, openModal, confirmDialog, toast, fmtDateShort } from '../ui.js';
import { api } from '../api.js';
import { standings, sessionsInRange, monthRange, yearRange, weekRange, shiftDays, isoWeekNumber, shiftMonth } from '../stats.js';

export function Classements(state, refresh) {
  let mode = initialMode(); // 'month' | 'week' | 'year' (surchargé par ?mode= dans l'URL)
  let ym = currentYM();
  let year = new Date().getFullYear();
  let weekRef = new Date(); // date de référence de la semaine affichée

  const wrap = h('div', {});
  render();
  return wrap;

  function currentYM() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function initialMode() {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    return ['month', 'week', 'year'].includes(q.get('mode')) ? q.get('mode') : 'month';
  }

  function render() {
    wrap.innerHTML = '';
    wrap.append(
      h('div', { class: 'spread' },
        h('h1', {}, '🏆 Classements'),
        h('button', { class: 'btn sm danger', onclick: openResetModal }, '🗑 Réinitialiser…'),
      ),
      buildTabs(),
      mode === 'month' ? buildMonthNav() : mode === 'week' ? buildWeekNav() : buildYearNav(),
      buildBoard(),
    );
  }

  // ------------------------------------------------ réinitialisation

  function openResetModal() {
    const wRange = weekRange(weekRef);
    const mRange = monthRange(ym);
    const yRange = yearRange(year);
    const weekCount = sessionsInRange(state, wRange.from, wRange.to).length;
    const monthCount = sessionsInRange(state, mRange.from, mRange.to).length;
    const yearCount = sessionsInRange(state, yRange.from, yRange.to).length;
    const total = state.sessions.length;

    const option = (label, sub, range, { strong = false } = {}) =>
      h('div', {
        class: 'list-item pick-row',
        onclick: () => askReset(label, range, strong),
      },
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, label),
          h('div', { class: 'sub' }, sub),
        ),
        h('span', { class: `chip ${strong ? 'coral' : ''}` }, strong ? 'irréversible' : '›'),
      );

    const content = h('div', {},
      h('p', { class: 'muted small', style: 'margin-top:0' },
        'Les parties effacées disparaissent de tous les classements (mois, année, historique) et des stats. Joueurs, jeux et réglages sont conservés. Pensez à télécharger une sauvegarde dans Réglages.'),
      weekCount
        ? option(`🗓 La semaine affichée — semaine ${isoWeekNumber(weekRef)}`, `${weekCount} partie${weekCount > 1 ? 's' : ''} sera supprimée`, wRange)
        : h('p', { class: 'muted small' }, `🗓 Semaine ${isoWeekNumber(weekRef)} : aucune partie.`),
      monthCount
        ? option(`📅 Le mois affiché — ${monthLabel(ym)}`, `${monthCount} partie${monthCount > 1 ? 's' : ''} sera supprimée`, mRange)
        : h('p', { class: 'muted small' }, `📅 ${monthLabel(ym)} : aucune partie.`),
      mode === 'year' || yearCount
        ? option(`🗓 L'année affichée — ${year}`, `${yearCount} partie${yearCount > 1 ? 's' : ''} sera supprimée`, yRange)
        : null,
      total
        ? option('🧹 Tout l’historique', `${total} partie${total > 1 ? 's' : ''} — tous les classements repartent de zéro`, { from: '0001-01-01', to: '9999-12-31' }, { strong: true })
        : h('p', { class: 'empty-note' }, 'Aucune partie enregistrée.'),
    );

    openModal('🗑 Réinitialiser les classements', content, { wide: true });
  }

  async function askReset(label, range, strong) {
    const yes = await confirmDialog(
      'Confirmer la suppression',
      `${label} : les parties concernées seront définitivement supprimées. Continuer ?`,
      { okLabel: strong ? 'Tout supprimer' : 'Oui, supprimer' },
    );
    if (!yes) return;
    try {
      const r = await api.resetSessions(range);
      toast(`${r.removed} partie${r.removed > 1 ? 's' : ''} supprimée${r.removed > 1 ? 's' : ''} — classements mis à jour`);
      await refresh();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  function buildTabs() {
    const tab = (id, label) =>
      h('button', {
        class: `btn sm ${mode === id ? 'primary' : 'ghost'}`,
        onclick: () => { mode = id; render(); },
      }, label);
    return h('div', { class: 'row', style: 'margin-bottom:.7rem' },
      tab('month', '📅 Par mois'),
      tab('week', '🗓 Par semaine'),
      tab('year', '📆 Par année'),
    );
  }

  function navBtn(label, fn) {
    return h('button', { class: 'icon-btn', onclick: fn, 'aria-label': label }, label);
  }

  function buildMonthNav() {
    const isCurrent = ym === currentYM();
    return h('div', { class: 'row', style: 'margin-bottom:.9rem;gap:.5rem' },
      navBtn('‹', () => { ym = shiftMonth(ym, -1); render(); }),
      h('strong', { style: 'min-width:150px;text-align:center;text-transform:capitalize' }, monthLabel(ym)),
      navBtn('›', () => { ym = shiftMonth(ym, 1); render(); }),
      !isCurrent ? h('button', { class: 'btn sm ghost', onclick: () => { ym = currentYM(); render(); } }, "Aujourd'hui") : null,
      h('input', {
        type: 'month',
        value: ym,
        style: 'margin-left:auto;border:1.5px solid var(--line);border-radius:9px;padding:.3rem .5rem;background:var(--surface);color:var(--ink)',
        onchange: (e) => { if (e.target.value) { ym = e.target.value; render(); } },
      }),
    );
  }

  function buildWeekNav() {
    const r = weekRange(weekRef);
    const isCurrent = weekRange(new Date()).from === r.from;
    return h('div', { class: 'row', style: 'margin-bottom:.9rem;gap:.5rem' },
      navBtn('‹', () => { weekRef = shiftDays(weekRef, -7); render(); }),
      h('strong', { style: 'min-width:230px;text-align:center' },
        `Semaine ${isoWeekNumber(weekRef)} · ${fmtDateShort(r.from)} → ${fmtDateShort(r.to)}`),
      navBtn('›', () => { weekRef = shiftDays(weekRef, 7); render(); }),
      !isCurrent ? h('button', { class: 'btn sm ghost', onclick: () => { weekRef = new Date(); render(); } }, "Aujourd'hui") : null,
    );
  }

  function buildYearNav() {
    const isCurrent = year === new Date().getFullYear();
    return h('div', { class: 'row', style: 'margin-bottom:.9rem;gap:.5rem' },
      navBtn('‹', () => { year--; render(); }),
      h('strong', { style: 'min-width:150px;text-align:center' }, `Année ${year}`),
      navBtn('›', () => { year++; render(); }),
      !isCurrent ? h('button', { class: 'btn sm ghost', onclick: () => { year = new Date().getFullYear(); render(); } }, "Aujourd'hui") : null,
    );
  }

  function buildBoard() {
    const range = mode === 'month' ? monthRange(ym) : mode === 'week' ? weekRange(weekRef) : yearRange(year);
    const rows = standings(state, sessionsInRange(state, range.from, range.to));
    const total = rows.reduce((n, r) => n + r.games, 0);
    const periodLabel = mode === 'month' ? monthLabel(ym) : mode === 'week' ? `semaine ${isoWeekNumber(weekRef)}` : `l'année ${year}`;

    const card = h('section', { class: 'card' });
    if (!total) {
      card.append(h('p', { class: 'empty-note' }, `Aucune partie enregistrée en ${periodLabel}.`));
      return card;
    }

    // --- podium
    const top = rows.filter((r) => r.games > 0).slice(0, 3);
    const heights = { 0: 'p1', 1: 'p2', 2: 'p3' };
    card.append(
      h('div', { class: 'podium', style: 'margin-bottom:1.1rem' },
        top.map((r, i) => h('div', { class: `step ${heights[i]}` },
          h('span', { class: 'medal' }, medal(i + 1)),
          h('span', { class: 'pname' }, `${r.player.emoji} ${r.player.name}`),
          h('span', { class: 'ppts' }, `${r.points} pt${r.points > 1 ? 's' : ''}`),
          h('span', { class: 'pstats' }, `${r.games} partie${r.games > 1 ? 's' : ''} · ${r.wins} victoire${r.wins > 1 ? 's' : ''}`),
        )),
      ),
    );

    // --- tableau complet
    let displayRank = 0;
    card.append(
      h('div', { class: 'tbl-wrap' },
        h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {},
            h('th', {}, '#'),
            h('th', {}, 'Joueur'),
            h('th', { class: 'num' }, 'Parties'),
            h('th', { class: 'num' }, 'Victoires'),
            h('th', { class: 'num' }, 'Taux'),
            h('th', { class: 'num' }, 'Points'),
          )),
          h('tbody', {}, rows.map((r) => {
            if (r.games > 0) displayRank++;
            const rate = r.games ? `${Math.round((r.wins / r.games) * 100)} %` : '—';
            return h('tr', { class: r.games > 0 && displayRank <= 3 ? 'me-top' : '' },
              h('td', {}, r.games > 0 ? (displayRank <= 3 ? medal(displayRank) : String(displayRank)) : '—'),
              h('td', {}, `${r.player.emoji} ${r.player.name}`),
              h('td', { class: 'num' }, String(r.games)),
              h('td', { class: 'num' }, String(r.wins)),
              h('td', { class: 'num muted' }, rate),
              h('td', { class: 'num pts' }, String(r.points)),
            );
          })),
        ),
      ),
    );

    // --- rappel du barème
    const pb = state.config.pointsByRank;
    const bareme = Object.entries(pb)
      .filter(([k]) => k !== 'default')
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => `${k === '1' ? '1ᵉʳ' : `${k}ᵉ`} ${v} pt${v > 1 ? 's' : ''}`)
      .join(' · ');
    card.append(
      h('p', { class: 'muted small', style: 'margin-top:.8rem' },
        `Barème actuel : ${bareme} · autres rangs ${pb.default ?? 0} pt · participation +${state.config.participationPoints} pt — modifiable dans Réglages. Points figés à l'enregistrement de chaque partie.`),
    );

    return card;
  }
}
