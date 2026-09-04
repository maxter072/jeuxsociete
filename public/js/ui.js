// Petits utilitaires d'interface : création DOM, modales, toasts, confettis, dates.

/** Crée un élément : h('div', {class:'x', onclick: fn}, enfant1, enfant2) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

/** Date du jour en heure locale, au format YYYY-MM-DD. */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dateFmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

export function fmtDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

export function fmtDateShort(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : dateFmtShort.format(d);
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export const MEDALS = ['🥇', '🥈', '🥉'];
export function medal(rank) {
  return MEDALS[rank - 1] || `#${rank}`;
}

// ------------------------------------------------------------------ toasts

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const el = h('div', { class: `toast ${kind}` }, msg);
  root.append(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 320);
  }, 2800);
}

// ------------------------------------------------------------------ modales

export function openModal(title, content, { wide = false } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  let overlay;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const box = h(
    'div',
    { class: `modal-box${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h('header', {}, h('h3', {}, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Fermer' }, '✕')),
    h('div', { class: 'modal-body' }, content),
  );
  overlay = h('div', {
    class: 'modal-overlay',
    onclick: (e) => { if (e.target === overlay) close(); },
  }, box);
  root.append(overlay);
  document.addEventListener('keydown', onKey);
  return { close, box };
}

/** Demande une confirmation dans une vraie modale. Résout true/false. */
export function confirmDialog(title, message, { danger = true, okLabel = 'Supprimer' } = {}) {
  return new Promise((resolve) => {
    const content = h('div', {},
      h('p', {}, message),
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn ghost', onclick: () => { m.close(); resolve(false); } }, 'Annuler'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => { m.close(); resolve(true); } }, okLabel),
      ),
    );
    const m = openModal(title, content);
  });
}

// ------------------------------------------------------------------ confettis

const CONFETTI_COLORS = ['#e89b1c', '#d95740', '#7c5cbf', '#0f766e', '#2e86de', '#2fae60'];

export function confetti(cx = 0.5, cy = 0.42, count = 70) {
  for (let i = 0; i < count; i++) {
    const el = h('span', { class: 'confetti' });
    el.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    el.style.left = `${cx * 100}vw`;
    el.style.top = `${cy * 100}vh`;
    document.body.append(el);
    const angle = Math.random() * Math.PI * 2;
    const dist = 90 + Math.random() * 240;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 120;
    const rot = (Math.random() - 0.5) * 900;
    el.animate(
      [
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy + 180}px) rotate(${rot}deg)`, opacity: 1, offset: 0.7 },
        { transform: `translate(${dx * 1.15}px, ${dy + 420}px) rotate(${rot * 1.4}deg)`, opacity: 0 },
      ],
      { duration: 1300 + Math.random() * 900, easing: 'cubic-bezier(.15,.6,.4,1)' },
    ).onfinish = () => el.remove();
  }
}
