// Vue « Réglages » : barème de points, durée de pause, sauvegarde/restauration.

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

  // ------------------------------------------------ durée de la pause

  const breakI = h('input', { type: 'number', min: 5, max: 300, value: cfg.breakMinutes, style: 'width:110px' });
  const breakForm = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        await api.setConfig({ breakMinutes: Number(breakI.value) });
        toast('Durée de pause mise à jour ⏱');
        await refresh();
      } catch (err) { toast(err.message, 'err'); }
    },
  },
    h('div', { class: 'row' }, breakI, h('span', { class: 'muted' }, 'minutes')),
    h('p', { class: 'muted small' }, 'Le tirage au sort ne propose que les jeux dont la durée moyenne tient dans ce temps.'),
    h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn primary' }, '💾 Enregistrer')),
  );

  // ------------------------------------------------ données

  const fileI = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
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
    style: 'max-width:320px',
  });

  const dataCard = h('section', { class: 'card' },
    h('h2', {}, '💾 Données & sauvegarde'),
    h('p', { class: 'muted small' }, `Les données vivent dans un unique fichier côté serveur : ${state.meta?.dataFile ?? 'data/db.json'}. Une copie .bak est conservée automatiquement avant chaque modification.`),
    h('div', { class: 'row', style: 'margin-top:.6rem' },
      h('a', { href: '/api/export', class: 'btn' }, '⬇️ Télécharger une sauvegarde'),
      h('div', {}, h('span', { class: 'muted small' }, 'Restaurer : '), fileI),
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
    h('section', { class: 'card' },
      h('h2', {}, '⏱ Durée de la pause'),
      breakForm,
    ),
    dataCard,
    h('section', { class: 'card' },
      h('h2', {}, '🔄 Réinitialisations'),
      h('p', { class: 'muted' }, 'Rien à faire : les classements hebdomadaires, mensuels et annuels sont calculés automatiquement. '
        + 'Le bouton « Réinitialiser » de la page Classements permet d’effacer les parties d’une période si besoin.'),
    ),
  );
}
