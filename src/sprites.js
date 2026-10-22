// 星弧 STAR ARC — cached glow sprites.
// Building a radial gradient every frame is the main mobile cost, so each
// (colour, size bucket) pair is baked once into a small offscreen canvas.
import { createOffscreen, getCtx } from './platform.js';
import { TAU, rgba, rgbOf, mix, clamp } from './utils.js';

const SIZE_BUCKETS = [16, 24, 36, 52, 76, 112, 160, 232, 340, 480];
const cache = new Map();

function nearestSize(r) {
  let best = SIZE_BUCKETS[0];
  for (let i = 0; i < SIZE_BUCKETS.length; i++) {
    if (SIZE_BUCKETS[i] >= r * 2) return SIZE_BUCKETS[i];
    best = SIZE_BUCKETS[i];
  }
  return best;
}

function bake(size, color, softness) {
  const c = createOffscreen(size, size);
  const cx = c.getContext('2d');
  const half = size / 2;
  const g = cx.createRadialGradient(half, half, 0, half, half, half);
  const [r, gg, b] = rgbOf(color);
  const stops = softness === 'hard'
    ? [[0, 1], [0.45, 0.62], [0.72, 0.14], [1, 0]]
    : [[0, 1], [0.2, 0.55], [0.45, 0.2], [0.72, 0.055], [1, 0]];
  for (const [p, a] of stops) {
    g.addColorStop(p, `rgba(${r},${gg},${b},${a})`);
  }
  cx.fillStyle = g;
  cx.beginPath();
  cx.arc(half, half, half, 0, TAU);
  cx.fill();
  return c;
}

function getSprite(color, size, softness = 'soft') {
  const s = nearestSize(size);
  const key = color + '|' + s + '|' + softness;
  let sp = cache.get(key);
  if (!sp) {
    sp = bake(s, color, softness);
    cache.set(key, sp);
  }
  return { canvas: sp, px: s };
}

/** Draw a soft round glow. `ctx.globalCompositeOperation` is respected. */
export function drawGlow(ctx, x, y, radius, color, alpha = 1, softness = 'soft') {
  if (alpha <= 0.004 || radius <= 0.5) return;
  const { canvas, px } = getSprite(color, radius, softness);
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.drawImage(canvas, x - px / 2, y - px / 2, px, px);
  ctx.globalAlpha = 1;
}

/** Draw a glow tinted between two colours (star cores, heated trails). */
export function drawGlowMix(ctx, x, y, radius, colorA, colorB, t, alpha = 1) {
  const c = mix(colorA, colorB, t);
  drawGlow(ctx, x, y, radius, c, alpha);
}

/** Blend the whole frame (used for a bloom pass on the browser build). */
export function clearCache() {
  cache.clear();
}

export function spriteCount() {
  return cache.size;
}
