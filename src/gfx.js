// 星弧 STAR ARC — drawing primitives built for speed & glow.
import { TAU, rgba } from './utils.js';

export const AMB = () => 1;

/** Radial soft glow. Cheaper than shadowBlur, looks better on mobile. */
export function glow(ctx, x, y, r, color, alpha = 1, inner = 0) {
  if (r <= 0 || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, r * inner, x, y, r);
  g.addColorStop(0, rgba(color, 0.95 * alpha));
  g.addColorStop(0.28, rgba(color, 0.42 * alpha));
  g.addColorStop(0.62, rgba(color, 0.12 * alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Additive glow: assumes caller set globalCompositeOperation = 'lighter'. */
export function glowAdd(ctx, x, y, r, color, alpha = 1) {
  if (r <= 0 || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, Math.min(1, alpha)));
  g.addColorStop(0.4, rgba(color, 0.35 * alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/**
 * Four-point star flare, built like a real lens glint: two needle-thin lenses
 * on the long axis and a shorter pair across them, both widest in their outer
 * third and tapering to points. `waist` is the half-width as a fraction of the
 * blade length — keep it small (0.03–0.08) or it turns into a flower.
 */
export function sparkle(ctx, x, y, size, color, alpha = 1, rot = 0, waist = 0.05) {
  if (size <= 0.2 || alpha <= 0.01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;

  const core = Math.max(1.1, size * waist);

  const blade = (len, halfW) => {
    ctx.beginPath();
    ctx.moveTo(len, 0);
    ctx.quadraticCurveTo(len * 0.28, halfW, -len * 0.1, 0);
    ctx.quadraticCurveTo(len * 0.28, -halfW, len, 0);
    ctx.closePath();
    ctx.fill();
  };

  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 2);
    if (i === 0) blade(size, core);
    else if (i === 2) blade(size * 0.82, core * 0.86);
    else blade(size * 0.5, core * 0.62);
    ctx.restore();
  }

  // hot core: the anchor that makes the needles feel emitted, not drawn
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, core * 3.4);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha *= 0.75;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, core * 3.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Ring arc with soft caps. */
export function arc(ctx, x, y, r, a0, a1, width, color, alpha = 1) {
  if (r <= 0 || alpha <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, a0, a1);
  ctx.lineWidth = width;
  ctx.strokeStyle = typeof color === 'string' && color[0] === '#' ? rgba(color, alpha) : color;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Polyline through points array [{x,y}] with per-vertex width/alpha taper. */
export function taperLine(ctx, pts, w0, w1, color, a0 = 1, a1 = 0) {
  const n = pts.length;
  if (n < 2) return;
  // draw in segments for a reliable taper
  for (let i = 0; i < n - 1; i++) {
    const t = i / (n - 1);
    const t2 = (i + 1) / (n - 1);
    const p = pts[i];
    const q = pts[i + 1];
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.lineWidth = w0 + (w1 - w0) * t;
    const a = a0 + (a1 - a0) * ((t + t2) / 2);
    ctx.strokeStyle = rgba(color, Math.max(0, a));
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function ring(ctx, x, y, r, width, color, alpha = 1) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.lineWidth = width;
  ctx.strokeStyle = rgba(color, alpha);
  ctx.stroke();
}

/** Resolve a CSS font stack; hosts have different defaults. */
export const FONT_NUM =
  '"SF Pro Display","Helvetica Neue",Helvetica,"PingFang SC",Arial,sans-serif';
export const FONT_CJK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

export function text(ctx, str, x, y, {
  size = 16,
  weight = 400,
  color = '#fff',
  align = 'center',
  baseline = 'middle',
  font = FONT_NUM,
  alpha = 1,
  spacing = 0,
  track = null,
} = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = track ? 'left' : align;
  ctx.textBaseline = baseline;
  if (track && spacing) {
    // manual letter spacing (host support for letterSpacing is spotty)
    let total = 0;
    const widths = [];
    for (const ch of str) {
      const w = ctx.measureText(ch).width;
      widths.push(w);
      total += w + spacing;
    }
    total -= spacing;
    let px = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    for (let i = 0; i < str.length; i++) {
      ctx.fillText(str[i], px, y);
      px += widths[i] + spacing;
    }
  } else {
    ctx.fillText(str, x, y);
  }
  ctx.restore();
}

export function measure(ctx, str, size, weight = 400, font = FONT_NUM) {
  ctx.font = `${weight} ${size}px ${font}`;
  return ctx.measureText(str).width;
}
