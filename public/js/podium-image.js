// Modale « 🖼️ Podium en PNG » : dessine le podium du mois (flammes et
// trophées compris) sur un canvas, puis propose de partager, copier ou
// télécharger l'image — à coller dans le canal de l'équipe.
// Ouverte depuis le bouton sous le classement mensuel.

import { h, openModal, toast, fmtDateShort, todayISO } from './ui.js';

// Palette claire de l'app, figée : l'image doit ressembler à la même chose
// quel que soit le thème (sombre ou clair) du navigateur au moment du partage.
const C = {
  bg: '#f4eee1', surface: '#fffdf7', surface2: '#f7f0e0',
  ink: '#2c251c', muted: '#8d806c', line: '#e6dbc4',
  gold: '#e89b1c', goldSoft: '#fbeccd', goldInk: '#4a3000',
  coral: '#d95740', coralSoft: '#fbe3dc',
};

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export function openPodiumImage(state, { periodLabel, rows, streaks, trophies }) {
  const canvas = drawPodium({ periodLabel, rows, streaks, trophies });
  canvas.toBlob((blob) => {
    if (!blob) return toast('Impossible de générer l’image.', 'err');
    const url = URL.createObjectURL(blob);
    const name = `podium-${periodLabel.toLowerCase().replace(/\s+/g, '-')}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    const canShare = !!navigator.canShare?.({ files: [file] });
    const canCopy = 'clipboard' in navigator && typeof ClipboardItem !== 'undefined';

    openModal(`🖼️ Podium — ${periodLabel}`, h('div', {},
      h('img', {
        src: url,
        alt: `Podium de ${periodLabel}`,
        style: 'width:100%;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)',
      }),
      h('p', { class: 'muted small', style: 'margin:.5rem 0 .8rem' },
        'Partagez l’image dans le canal de l’équipe, ou téléchargez-la.'),
      h('div', { class: 'row', style: 'gap:.5rem;flex-wrap:wrap' },
        canShare
          ? h('button', {
              class: 'btn',
              onclick: () => navigator.share({ files: [file], title: `Podium — ${periodLabel}` })
                .catch((err) => { if (err.name !== 'AbortError') toast('Partage impossible : ' + err.message, 'err'); }),
            }, '📤 Partager')
          : null,
        canCopy
          ? h('button', {
              class: 'btn',
              onclick: () => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                .then(() => toast('Image copiée 📋 — collez-la dans votre canal'))
                .catch(() => toast('Copie impossible ici — utilisez Télécharger.', 'warn')),
            }, '📋 Copier')
          : null,
        'clipboard' in navigator
          ? h('button', {
              class: 'btn',
              title: 'Version texte, pour coller dans un message',
              onclick: () => navigator.clipboard.writeText(podiumText({ periodLabel, rows, streaks, trophies }))
                .then(() => toast('Podium copié en texte 📝'))
                .catch(() => toast('Copie impossible ici.', 'warn')),
            }, '📝 Copier en texte')
          : null,
        h('a', { class: 'btn primary', href: url, download: name, style: 'text-decoration:none' }, '💾 Télécharger'),
      ),
    ), { wide: true });
  }, 'image/png');
}

/** Version texte du podium (avec flammes et trophées), à coller dans un message. */
function podiumText({ periodLabel, rows, streaks, trophies }) {
  const lines = [`🏆 ${periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}`];
  rows.filter((r) => r.games > 0).slice(0, 3).forEach((r, i) => {
    const flame = streaks.get(r.player.id) >= 2 ? ' 🔥' : '';
    lines.push(`${['🥇', '🥈', '🥉'][i]} ${r.player.emoji} ${r.player.name}${flame} ${r.points} pt${r.points > 1 ? 's' : ''}`);
  });
  for (const t of trophies) lines.push(`${t.emoji} ${t.label} : ${t.p.emoji} ${t.p.name} (${t.fmt(t.v)})`);
  return lines.join('\n');
}

/** Dessine le podium et renvoie le canvas (rendu x2 pour la netteté). */
function drawPodium({ periodLabel, rows, streaks, trophies }) {
  const S = 2;
  const W = 1000;
  const pad = 44;
  const top = rows.filter((r) => r.games > 0).slice(0, 3);

  // --- mise en page des trophées (besoin de mesures de texte)
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `17px ${FONT}`;
  const pills = trophies.map((t) => {
    const text = `${t.emoji} ${t.label} : ${t.p.emoji} ${t.p.name} (${t.fmt(t.v)})`;
    return { text, w: Math.ceil(measure.measureText(text).width) + 28 };
  });
  const inner = W - pad * 2;
  const pillLines = [];
  let line = [];
  for (const p of pills) {
    const lw = line.reduce((n, x) => n + x.w, 0) + (line.length ? 10 : 0) + p.w;
    if (line.length && lw > inner) { pillLines.push(line); line = []; }
    line.push(p);
  }
  if (line.length) pillLines.push(line);

  // --- hauteur totale
  const podiumTop = pad + 108; // pastille marque + titre
  const baseline = podiumTop + 230; // posé au sol du podium
  const trophiesTop = baseline + 24;
  const H = trophiesTop + pillLines.length * 46 + 58;

  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);

  // --- fond
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // --- pastille marque
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 17px ${FONT}`;
  const brandW = Math.ceil(ctx.measureText('🎲 Pause Jeux').width) + 30;
  ctx.fillStyle = C.surface;
  rr(ctx, pad, pad, brandW, 34, 17);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.fillText('🎲 Pause Jeux', pad + 15, pad + 18);

  // --- titre
  ctx.textAlign = 'center';
  ctx.font = `800 46px ${FONT}`;
  ctx.fillStyle = C.ink;
  ctx.fillText(`🏆 ${periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}`, W / 2, pad + 92);

  // --- marches du podium (2ᵉ, 1ᵉʳ, 3ᵉ)
  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
  const colW = 252;
  const gap = 18;
  const x0 = (W - (top.length * colW + (top.length - 1) * gap)) / 2;
  const stepH = { 0: 220, 1: 180, 2: 150 };
  const tint = {
    0: { fill: C.goldSoft, stroke: C.gold },
    1: { fill: C.surface2, stroke: C.line },
    2: { fill: C.coralSoft, stroke: C.coral },
  };
  order.forEach((place, col) => {
    const r = top[place];
    const x = x0 + col * (colW + gap);
    const hgt = stepH[place];
    ctx.fillStyle = tint[place].fill;
    rr(ctx, x, baseline - hgt, colW, hgt, 14);
    ctx.fill();
    ctx.strokeStyle = tint[place].stroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    const cx = x + colW / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.ink;
    ctx.font = '40px ' + FONT;
    ctx.fillText(medalOf(place), cx, baseline - hgt + 36);
    const flame = streaks.get(r.player.id) >= 2 ? ' 🔥' : '';
    ctx.font = `700 25px ${FONT}`;
    ctx.fillText(fit(ctx, `${r.player.emoji} ${r.player.name}${flame}`, colW - 22), cx, baseline - hgt + 76);
    ctx.font = `800 22px ${FONT}`;
    ctx.fillStyle = place === 0 ? C.goldInk : C.ink;
    ctx.fillText(`${r.points} pt${r.points > 1 ? 's' : ''}`, cx, baseline - hgt + 105);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(`${r.games} partie${r.games > 1 ? 's' : ''} · ${r.wins} victoire${r.wins > 1 ? 's' : ''}`, cx, baseline - hgt + 130);
  });

  // --- trophées (pastilles centrées, retours à la ligne automatiques)
  let ty = trophiesTop;
  ctx.textAlign = 'left';
  ctx.font = `17px ${FONT}`;
  for (const ln of pillLines) {
    const lw = ln.reduce((n, p) => n + p.w, 0) + (ln.length - 1) * 10;
    let px = (W - lw) / 2;
    for (const p of ln) {
      ctx.fillStyle = C.surface;
      rr(ctx, px, ty, p.w, 38, 19);
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.fillText(p.text, px + 14, ty + 20);
      px += p.w + 10;
    }
    ty += 46;
  }

  // --- pied de page
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'left';
  ctx.fillText('🎲 Pause Jeux — pauses jeux de société', pad, H - pad / 2);
  ctx.textAlign = 'right';
  ctx.fillText(`Généré le ${fmtDateShort(todayISO())}`, W - pad, H - pad / 2);

  return canvas;
}

function medalOf(place) {
  return ['🥇', '🥈', '🥉'][place] ?? '';
}

/** Raccourcit le texte (…) pour tenir dans la largeur donnée. */
function fit(ctx, text, max) {
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > max) t = t.slice(0, -2) + '…';
  return t;
}

/** Rectangle arrondi (compatible avec tous les navigateurs récents). */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
