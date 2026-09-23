// Vue « Réglages » : barème de points, sauvegarde/restauration.

import { api } from '../api.js';
import { h, toast, confirmDialog } from '../ui.js';

export function Reglages(state, refresh) {
  const cfg = state.config;

  // ------------------------------------------------ barème de points

  const rankKeys = Object.keys(cfg.pointsByRank)
    .filter((k) => k !== 'default')
    .sort((a, b) => Number(a) - Number(b));
  const wanted = Array.from({ length: Math.max(8, rankKeys.length) }, (_, i) => String(i + 1));

  const rankInputs = new Map();
  const defaultI = h('input', { type: 'number', min: 0, max: 100, value: cfg.pointsByRank.default ?? 0 });
  const partI = h('input', { type: 'number', min: 0, max: 50, value: cfg.participationPoints });

  const pointsForm = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const pb = {};
      for (const [k, input] of rankInputs) pb[k] = Number(input.value);
      pb.default = Number(defaultI.value);
      try {
        await api.setConfig({ pointsByRank: pb, participationPoints: Number(partI.value) });
        toast('Barème enregistré ✅ (les parties passées ne bougent pas)');
        await refresh();
      } catch (err) { toast(err.message, 'err'); }
    },
  },
    h('div', { class: 'tbl-wrap' },
      h('table', { class: 'tbl', style: 'max-width:420px' },
        h('tbody', {},
          wanted.map((k) => {
            const input = h('input', {
              type: 'number', min: 0, max: 100, value: cfg.pointsByRank[k] ?? '',
              style: 'width:90px;padding:.35rem .5rem;border:1.5px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink)',
            });
            rankInputs.set(k, input);
            return h('tr', {},
              h('td', {}, k === '1' ? '🥇 1ᵉʳ' : k === '2' ? '🥈 2ᵉ' : k === '3' ? '🥉 3ᵉ' : `${k}ᵉ`),
              h('td', { class: 'num' }, input),
            );
          }),
          h('tr', {},
            h('td', {}, 'Autres rangs'),
            h('td', { class: 'num' }, defaultI),
          ),
          h('tr', {},
            h('td', {}, 'Participation (chaque joueur présent)'),
            h('td', { class: 'num' }, partI),
          ),
        ),
      ),
    ),
    h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn primary' }, '💾 Enregistrer le barème')),
  );

  // ------------------------------------------------ données

  const fileI = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    style: 'display:none', // déclenché par le bouton « ⬆️ Restaurer »
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = ''; // permet de re-choisir le même fichier
      try {
        const parsed = JSON.parse(await file.text());
        if (!(await confirmDialog('Restaurer la sauvegarde', 'Cette action remplace TOUTES les données actuelles (joueurs, jeux, parties, réglages). Continuer ?', { okLabel: 'Restaurer' }))) return;
        await api.importState(parsed);
        toast('Sauvegarde restaurée ✅');
        await refresh();
      } catch (err) {
        toast(`Import impossible : ${err.message}`, 'err');
      }
    },
  });

  /** Export CSV des parties (une ligne par joueur et par partie), prêt pour
   *  Excel/LibreOffice : BOM UTF-8 et séparateur « ; » pour les coller fr. */
  function exportCsv() {
    const rows = [['date', 'jeu', 'joueur', 'rang', 'points', 'note']];
    for (const s of [...state.sessions].sort((a, b) => a.date.localeCompare(b.date))) {
      const g = state.games.find((x) => x.id === s.gameId);
      for (const r of s.results) {
        const p = state.players.find((x) => x.id === r.playerId);
        rows.push([s.date, g?.name ?? '?', p?.name ?? '?', r.rank, r.points, s.note || '']);
      }
    }
    const csv = '﻿' + rows
      .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: 'pause-jeux-parties.csv' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${state.sessions.length} partie(s) exportée(s) en CSV 📊`);
  }

  const dataCard = h('section', { class: 'card' },
    h('h2', {}, '💾 Données & sauvegarde'),
    h('p', { class: 'muted small' }, `Les données vivent dans un unique fichier côté serveur : ${state.meta?.dataFile ?? 'data/db.json'}. Une copie .bak est conservée automatiquement avant chaque modification.`),
    h('div', { class: 'row', style: 'margin-top:.6rem' },
      h('a', { href: '/api/export', class: 'btn' }, '⬇️ Télécharger une sauvegarde'),
      h('button', {
        class: 'btn',
        title: 'Remplace toutes les données actuelles (joueurs, jeux, parties, réglages) par le fichier choisi',
        onclick: () => fileI.click(),
      }, '⬆️ Restaurer une sauvegarde'),
      h('button', {
        class: 'btn',
        title: 'Toutes les parties en CSV (une ligne par joueur) : date, jeu, joueur, rang, points',
        onclick: exportCsv,
      }, '📊 Export CSV'),
      fileI,
    ),
  );

  // ------------------------------------------------ assemblage

  return h('div', {},
    h('h1', {}, '⚙️ Réglages'),
    h('section', { class: 'card' },
      h('h2', {}, '🏅 Système de points'),
      h('p', { class: 'muted small' },
        'Points attribués selon le rang d’arrivée, plus un point de participation facultatif. '
        + 'Les points sont figés au moment de l’enregistrement : modifier le barème n’affecte que les futures parties.'),
      pointsForm,
    ),
    dataCard,
    h('section', { class: 'card' },
      h('h2', {}, '🔄 Réinitialisations'),
      h('p', { class: 'muted' }, 'Rien à faire : les classements hebdomadaires, mensuels et annuels sont calculés automatiquement. '
        + 'Le bouton « Réinitialiser » de la page Classements permet d’effacer les parties d’une période si besoin.'),
    ),
  );
}
