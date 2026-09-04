// Point d'entrée : état global, routeur par hash, navigation, thème.

import { api } from './api.js';
import { h, toast } from './ui.js';
import { Dashboard } from './views/dashboard.js';
import { Jeux } from './views/jeux.js';
import { Joueurs } from './views/joueurs.js';
import { Parties } from './views/parties.js';
import { Classements } from './views/classements.js';
import { Reglages } from './views/reglages.js';

const ROUTES = [
  { path: '', label: 'Accueil', icon: '🏠', render: Dashboard },
  { path: 'jeux', label: 'Jeux', icon: '🎲', render: Jeux },
  { path: 'joueurs', label: 'Joueurs', icon: '👥', render: Joueurs },
  { path: 'parties', label: 'Parties', icon: '📝', render: Parties },
  { path: 'classements', label: 'Classements', icon: '🏆', render: Classements },
  { path: 'reglages', label: 'Réglages', icon: '⚙️', render: Reglages },
];

let state = null;

// ---------------------------------------------------------------- thème

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('pj_theme'); } catch { /* pas de stockage */ }
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  const btn = document.getElementById('theme-toggle');
  const sync = () => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches || document.documentElement.dataset.theme === 'dark';
    const light = document.documentElement.dataset.theme === 'light';
    btn.textContent = dark && !light ? '☀️' : '🌙';
  };
  btn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const next = (cur === 'dark' || (!cur && systemDark)) ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pj_theme', next); } catch { /* pas de stockage */ }
    sync();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
  sync();
}

// ---------------------------------------------------------------- navigation

function currentPath() {
  return location.hash.replace(/^#\/?/, '').split('?')[0];
}

function buildNavs() {
  const path = currentPath();
  const tabs = document.getElementById('tabs');
  const bottom = document.getElementById('bottomnav');
  tabs.innerHTML = '';
  bottom.innerHTML = '';
  for (const r of ROUTES) {
    const href = `#/${r.path}`;
    for (const nav of [tabs, bottom]) {
      const a = h('a', { href, class: path === r.path ? 'active' : '' },
        nav === bottom ? h('span', { class: 'ico' }, r.icon) : `${r.icon} ${r.label}`,
        nav === bottom ? r.label : null,
      );
      nav.append(a);
    }
  }
}

// ---------------------------------------------------------------- rendu

function render() {
  const path = currentPath();
  const route = ROUTES.find((r) => r.path === path) || ROUTES[0];
  const view = document.getElementById('view');
  view.innerHTML = '';
  try {
    view.append(route.render(state, refresh));
  } catch (err) {
    console.error(err);
    view.append(h('p', { class: 'empty-note' }, `Erreur d'affichage : ${err.message}`));
  }
  buildNavs();
}

async function refresh() {
  state = await api.state();
  render();
}

// Re-rendu léger (sélection des présents sans aller-retour serveur).
document.getElementById('view').addEventListener('pj:rerender', render);
window.addEventListener('hashchange', () => {
  buildNavs();
  render();
});

initTheme();
refresh().catch((err) => {
  document.getElementById('view').innerHTML = '';
  document.getElementById('view').append(
    h('p', { class: 'empty-note' }, `Impossible de joindre le serveur : ${err.message}`),
    h('p', { class: 'center' }, h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Réessayer')),
  );
});
