// 星弧 STAR ARC — renderer.
// Look: "ink & light". The void is nearly black indigo, the frame is a faint
// astrolabe, and everything you touch glows like it is lit from inside.
import { TAU, clamp, lerp, rgba, smoothstep, angleDelta, hash2, easeOutCubic } from './utils.js';
import { C, NEBULA_HUES } from './palette.js';
import { CFG } from './const.js';
import { drawGlow, drawGlowMix } from './sprites.js';
import { glowAdd, sparkle, taperLine, roundRect, ring, text, FONT_NUM, FONT_CJK } from './gfx.js';
import { createOffscreen, getCtx } from './platform.js';

export class Renderer {
  constructor(sys) {
    this.sys = sys;
    this.w = sys.width;
    this.h = sys.height;
    this.bg = null;
    this.bgW = 0;
    this.bgH = 0;
    this.starsFar = [];
    this.starsNear = [];
    this.t = 0;
    this.flashAlpha = 0;
    this.flashColor = C.ivory;
    this.buildStarfield();
  }

  buildStarfield() {
    const { w, h, sys } = this;
    const rnd = (a, b) => a + Math.random() * (b - a);
    this.starsFar = [];
    this.starsNear = [];
    for (let i = 0; i < 190; i++) {
      this.starsFar.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: rnd(0.4, 1.25),
        a: rnd(0.12, 0.5),
        ph: rnd(0, TAU),
        sp: rnd(0.4, 1.4),
        par: rnd(0.015, 0.05),
      });
    }
    for (let i = 0; i < 54; i++) {
      this.starsNear.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: rnd(0.9, 2.1),
        a: rnd(0.3, 0.85),
        ph: rnd(0, TAU),
        sp: rnd(0.7, 2.1),
        par: rnd(0.06, 0.16),
        col: Math.random() < 0.24 ? C.gold : Math.random() < 0.2 ? C.cyan : C.ivory,
      });
    }
    this.nebula = [];
    for (let i = 0; i < 7; i++) {
      this.nebula.push({
        x: rnd(-0.1, 1.1) * w,
        y: rnd(-0.1, 1.1) * h,
        rx: rnd(0.28, 0.66) * w,
        ry: rnd(0.2, 0.52) * h,
        rot: rnd(0, TAU),
        col: NEBULA_HUES[i % NEBULA_HUES.length],
        a: rnd(0.22, 0.46),
        par: rnd(0.02, 0.085),
      });
    }
    this.bg = null;
  }

  /** Bake the static void: gradient + nebulae + a dust grain. Once per resize. */
  bakeBackground() {
    const { w, h } = this;
    const dpr = this.sys.dpr;
    const c = createOffscreen(w * Math.min(dpr, 2), h * Math.min(dpr, 2));
    const x = c.getContext('2d');
    x.scale(Math.min(dpr, 2), Math.min(dpr, 2));

    const g = x.createLinearGradient(0, 0, w * 0.35, h);
    g.addColorStop(0, '#05040F');
    g.addColorStop(0.45, '#070617');
    g.addColorStop(1, '#04030C');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);

    const rad = x.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.78);
    rad.addColorStop(0, rgba('#141033', 0.85));
    rad.addColorStop(0.5, rgba('#0A0820', 0.4));
    rad.addColorStop(1, rgba('#03030B', 0));
    x.fillStyle = rad;
    x.fillRect(0, 0, w, h);

    for (const n of this.nebula) {
      x.save();
      x.translate(n.x, n.y);
      x.rotate(n.rot);
      x.scale(1, n.ry / n.rx);
      const ng = x.createRadialGradient(0, 0, 0, 0, 0, n.rx);
      ng.addColorStop(0, rgba(n.col, n.a * 0.75));
      ng.addColorStop(0.4, rgba(n.col, n.a * 0.3));
      ng.addColorStop(0.72, rgba(n.col, n.a * 0.07));
      ng.addColorStop(1, rgba(n.col, 0));
      x.fillStyle = ng;
      x.beginPath();
      x.arc(0, 0, n.rx, 0, TAU);
      x.fill();
      x.restore();
    }

    // ink-wash wisps: a few thin, semi-transparent curves
    x.save();
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const y0 = hash2(i, 7) * h;
      const amp = 20 + hash2(i, 3) * 60;
      x.beginPath();
      for (let px = -20; px <= w + 20; px += 14) {
        const py = y0 + Math.sin(px * 0.006 + i * 1.7) * amp + Math.sin(px * 0.019 + i) * amp * 0.25;
        if (px === -20) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.strokeStyle = rgba(i % 3 === 0 ? C.violet : C.cyan, 0.018 + hash2(i, 11) * 0.02);
      x.lineWidth = 26 + hash2(i, 5) * 70;
      x.lineCap = 'round';
      x.stroke();
    }
    x.restore();

    // top & bottom falloff so HUD text always has contrast
    const top = x.createLinearGradient(0, 0, 0, h * 0.26);
    top.addColorStop(0, 'rgba(2,2,8,0.92)');
    top.addColorStop(1, 'rgba(2,2,8,0)');
    x.fillStyle = top;
    x.fillRect(0, 0, w, h * 0.26);
    const bot = x.createLinearGradient(0, h, 0, h * 0.7);
    bot.addColorStop(0, 'rgba(2,2,8,0.92)');
    bot.addColorStop(1, 'rgba(2,2,8,0)');
    x.fillStyle = bot;
    x.fillRect(0, h * 0.7, w, h * 0.3);

    this.bg = c;
    this.bgW = w;
    this.bgH = h;
  }

  drawBackground(tt, cam) {
    const { w, h } = this;
    if (!this.bg || this.bgW !== w || this.bgH !== h) this.bakeBackground();
    const ctx = this.ctx;
    ctx.drawImage(this.bg, 0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const n of this.nebula) {
      const px = (cam.x || 0) * n.par;
      const py = (cam.y || 0) * n.par;
      ctx.save();
      ctx.translate(n.x + px, n.y + py);
      ctx.rotate(n.rot + tt * 0.004);
      ctx.scale(1, n.ry / n.rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, n.rx * 0.55);
      g.addColorStop(0, rgba(n.col, 0.075));
      g.addColorStop(0.5, rgba(n.col, 0.032));
      g.addColorStop(1, rgba(n.col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, n.rx * 0.55, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // starfield, two parallax layers
    for (let i = 0; i < this.starsFar.length; i++) {
      const s = this.starsFar[i];
      const tw = 0.62 + 0.38 * Math.sin(tt * s.sp + s.ph);
      const x = s.x + (cam.x || 0) * s.par;
      const y = ((s.y + (cam.y || 0) * s.par) % (h + 40) + h + 40) % (h + 40) - 20;
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = C.ivory;
      ctx.fillRect(x, y, s.r, s.r);
    }
    for (let i = 0; i < this.starsNear.length; i++) {
      const s = this.starsNear[i];
      const tw = 0.5 + 0.5 * Math.sin(tt * s.sp + s.ph);
      const x = ((s.x + (cam.x || 0) * s.par * 3) % (w + 40) + w + 40) % (w + 40) - 20;
      const y = ((s.y + (cam.y || 0) * s.par * 3) % (h + 40) + h + 40) % (h + 40) - 20;
      drawGlow(ctx, x, y, s.r * 5.5, s.col, s.a * (0.28 + tw * 0.4));
      ctx.globalAlpha = s.a * (0.55 + tw * 0.45);
      ctx.fillStyle = s.col;
      ctx.beginPath();
      ctx.arc(x, y, s.r * 0.62, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawArenaFrame(world, tt) {
    const ctx = this.ctx;
    const a = world.arena;
    const S = world.S;
    const danger = world.state === 'play' ? clamp(world.difficulty(), 0, 1) : 0;
    const tint = danger > 0.55 ? C.rose : C.cyan;

    ctx.save();
    // inner vignette
    const vg = ctx.createRadialGradient(a.x + a.w / 2, a.y + a.h / 2, Math.min(a.w, a.h) * 0.28, a.x + a.w / 2, a.y + a.h / 2, Math.max(a.w, a.h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${0.34 + danger * 0.1})`);
    ctx.fillStyle = vg;
    ctx.beginPath();
    roundRect(ctx, a.x, a.y, a.w, a.h, CFG.corner * S);
    ctx.fill();

    // field grid: faint concentric astrolabe circles
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, a.x, a.y, a.w, a.h, CFG.corner * S);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const maxR = Math.hypot(a.w, a.h) * 0.5;
    for (let i = 1; i <= 5; i++) {
      const r = (maxR * i) / 5.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.strokeStyle = rgba(C.cyan, 0.028);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU + tt * 0.01;
      const r0 = maxR * 0.08;
      const r1 = maxR * 1.02;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.strokeStyle = rgba(C.ivory, 0.016);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // frame line
    const pulse = 0.5 + 0.5 * Math.sin(tt * 1.6);
    ctx.beginPath();
    roundRect(ctx, a.x, a.y, a.w, a.h, CFG.corner * S);
    ctx.strokeStyle = rgba(tint, 0.06 + danger * 0.13 + pulse * 0.02);
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // corner brackets
    const L = 26 * S;
    const inset = 9 * S;
    const corners = [
      [a.x + inset, a.y + inset, 1, 1],
      [a.x + a.w - inset, a.y + inset, -1, 1],
      [a.x + inset, a.y + a.h - inset, 1, -1],
      [a.x + a.w - inset, a.y + a.h - inset, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + sx * L, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * L);
      ctx.strokeStyle = rgba(tint, 0.4 + pulse * 0.14);
      ctx.lineWidth = 2 * S;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  drawStars(world, tt) {
    const ctx = this.ctx;
    const S = world.S;
    for (const s of world.stars) {
      const alive = clamp(s.dark > 0 ? 1 - s.dark / 1.5 : 1, 0, 1);
      const a = s.fuel <= 0 || s.dark > 0 ? 0.3 : 1;
      const hue = s.hue;
      const puls = 0.5 + 0.5 * Math.sin(s.glowPulse);

      ctx.save();
      ctx.globalAlpha = alive;

      // orbit ring
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.orbitR, 0, TAU);
      ctx.strokeStyle = rgba(hue.mid, 0.1 + puls * 0.05);
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3 * S, 7 * S]);
      ctx.stroke();
      ctx.setLineDash([]);

      // resonance arc
      if (s.dark <= 0) {
        const onArc = world.player.mode === 'orbit' && world.player.star === s && world.inArc();
        const glowAmt = 0.55 + puls * 0.45;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const w = s.arcW * (1 - i * 0.16);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.orbitR, s.arcA - w, s.arcA + w);
          ctx.strokeStyle = rgba(C.gold, 0.05 + i * 0.03);
          ctx.lineWidth = (14 - i * 4) * S;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.orbitR, s.arcA - s.arcW, s.arcA + s.arcW);
        ctx.strokeStyle = rgba(onArc ? '#FFFFFF' : C.gold, onArc ? 0.95 : 0.55 + puls * 0.25);
        ctx.lineWidth = (onArc ? 4.2 : 2.2) * S;
        ctx.lineCap = 'round';
        ctx.stroke();
        if (onArc) {
          // the window is now: a bright filled wedge says "let go HERE"
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const wg = ctx.createRadialGradient(s.x, s.y, s.orbitR * 0.8, s.x, s.y, s.orbitR * 1.15);
          wg.addColorStop(0, rgba(C.goldHot, 0));
          wg.addColorStop(0.5, rgba(C.goldHot, 0.22));
          wg.addColorStop(1, rgba(C.goldHot, 0));
          ctx.fillStyle = wg;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.orbitR * 1.15, s.arcA - s.arcW, s.arcA + s.arcW);
          ctx.arc(s.x, s.y, s.orbitR * 0.8, s.arcA + s.arcW, s.arcA - s.arcW, true);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        // arc terminals
        for (const sgn of [-1, 1]) {
          const aa = s.arcA + sgn * s.arcW;
          const tx = s.x + Math.cos(aa) * s.orbitR;
          const ty = s.y + Math.sin(aa) * s.orbitR;
          drawGlow(ctx, tx, ty, 12 * S, C.goldHot, (onArc ? 0.85 : 0.5) * glowAmt);
        }
      }

      // halo + core
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, s.x, s.y, s.r * 9.5, hue.deep, 0.4 * alive);
      drawGlow(ctx, s.x, s.y, s.r * 4.4, hue.mid, 0.6 * alive);
      // wide soft bloom keeps the star from reading as a hard cross
      drawGlow(ctx, s.x, s.y, s.r * 2.2, hue.core, 0.42 * alive);
      ctx.restore();

      // body: a lit sphere with a limb, so it has mass
      const bodyR = s.r * 1.35;
      const core = ctx.createRadialGradient(
        s.x - s.r * 0.3,
        s.y - s.r * 0.38,
        s.r * 0.05,
        s.x,
        s.y,
        bodyR
      );
      core.addColorStop(0, rgba('#FFFFFF', 0.98 * alive));
      core.addColorStop(0.3, rgba(hue.core, 0.95 * alive));
      core.addColorStop(0.62, rgba(hue.mid, 0.8 * alive));
      core.addColorStop(1, rgba(hue.deep, 0.5 * alive));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(s.x, s.y, bodyR, 0, TAU);
      ctx.fill();

      // crescent limb light — this is what makes a circle look 3D
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const limb = ctx.createRadialGradient(
        s.x - s.r * 0.55,
        s.y - s.r * 0.6,
        s.r * 0.1,
        s.x,
        s.y,
        s.r * 1.5
      );
      limb.addColorStop(0, rgba(hue.core, 0.3 * alive));
      limb.addColorStop(0.5, rgba(hue.mid, 0.08 * alive));
      limb.addColorStop(1, rgba(hue.deep, 0));
      ctx.fillStyle = limb;
      ctx.beginPath();
      ctx.arc(s.x, s.y, bodyR * 1.08, 0, TAU);
      ctx.fill();
      ctx.restore();

      // small, restrained flare
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      sparkle(ctx, s.x, s.y, s.r * (3.1 + puls * 0.7), hue.core, 0.2 * alive, s.glowPulse * 0.18, 0.055);
      ctx.restore();

      // fuel arc: depletes clockwise from the top
      if (s.fuel < 0.999) {
        const fa = -Math.PI / 2;
        const r = s.r + 11 * S;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, fa, fa + TAU * s.fuel);
        ctx.strokeStyle = rgba(s.fuel < 0.3 ? C.rose : C.cyanHot, 0.5 + (1 - s.fuel) * 0.35);
        ctx.lineWidth = 2 * S;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  drawMotes(world, tt) {
    const ctx = this.ctx;
    const S = world.S;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of world.motes) {
      const puls = 0.6 + 0.4 * Math.sin(m.ph);
      // small, warm-white ember: clearly food, not a star to orbit
      drawGlow(ctx, m.x, m.y, m.r * 2.7, C.cyan, 0.2 * puls);
      ctx.fillStyle = rgba(C.ivory, 0.9);
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 0.36, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(C.cyanHot, 0.22 * puls);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 0.95, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawShards(world, tt) {
    const ctx = this.ctx;
    const S = world.S;
    for (const s of world.shards) {
      const k = easeOutCubic(clamp(s.spawn, 0, 1));
      const dangerPulse = 0.5 + 0.5 * Math.sin(s.t * 3.1 + s.rot);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.scale(k, k);

      // danger halo
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, 0, s.r * 3.4, C.rose, 0.16 + dangerPulse * 0.1);
      ctx.restore();

      // crystalline body
      ctx.beginPath();
      for (let i = 0; i < s.pts.length; i++) {
        const p = s.pts[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(-s.r, -s.r, s.r, s.r);
      g.addColorStop(0, 'rgba(28,16,48,0.95)');
      g.addColorStop(0.55, 'rgba(56,26,66,0.92)');
      g.addColorStop(1, 'rgba(18,10,34,0.96)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = rgba(C.rose, 0.62 + dangerPulse * 0.3);
      ctx.lineWidth = 1.5 * S;
      ctx.stroke();

      // inner fracture lines
      ctx.beginPath();
      for (let i = 0; i < s.pts.length; i++) {
        ctx.moveTo(0, 0);
        ctx.lineTo(s.pts[i].x * 0.72, s.pts[i].y * 0.72);
      }
      ctx.strokeStyle = rgba(C.rose, 0.16 + dangerPulse * 0.12);
      ctx.lineWidth = 1 * S;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPlayer(world, tt) {
    const ctx = this.ctx;
    const p = world.player;
    const S = world.S;
    if (p.dead && world.deathT > 0.12) return;

    // trail
    if (p.trail.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pts = p.trail;
      for (let i = 0; i < pts.length - 1; i++) {
        const t = i / (pts.length - 1);
        const a = Math.pow(t, 1.7) * 0.5;
        const w = 1 + t * 7 * S * (0.55 + p.booster * 0.9);
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
        ctx.strokeStyle = rgba(p.booster > 0.2 ? C.goldHot : C.cyan, a);
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.restore();
    }

    const charging = p.mode === 'orbit' && p.charge > 0.02;
    const coreCol = p.booster > 0.2 ? C.goldHot : C.ivory;
    const auraCol = p.booster > 0.2 ? C.gold : C.cyan;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, p.x, p.y, 26 * S * (1 + p.booster * 0.5), auraCol, 0.34 + p.charge * 0.22);
    drawGlow(ctx, p.x, p.y, 11 * S, coreCol, 0.9);
    if (charging) {
      // charge ring, fills clockwise
      const r = 17 * S;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * p.charge);
      ctx.strokeStyle = rgba(C.gold, 0.22 + p.charge * 0.5);
      ctx.lineWidth = 2.4 * S;
      ctx.lineCap = 'round';
      ctx.stroke();
      drawGlow(ctx, p.x, p.y, r * 2.4, C.gold, p.charge * 0.24);
    }
    ctx.restore();

    // the spark itself
    const size = (10 + Math.sin(tt * 7) * 0.7 + p.charge * 2.6) * S;
    // soft body so it reads as a light source with volume
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, p.x, p.y, size * 4.6, coreCol, 0.5);
    ctx.restore();
    sparkle(ctx, p.x, p.y, size * 1.75, coreCol, 0.98, p.rot * 0.35, 0.075);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    sparkle(ctx, p.x, p.y, size * 3.1, auraCol, 0.24, -p.rot * 0.24, 0.035);
    ctx.restore();

    // orbit tether
    if (p.mode === 'orbit' && p.star) {
      const s = p.star;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = rgba(C.cyanHot, 0.1 + p.charge * 0.16);
      ctx.lineWidth = 1.4 * S;
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Aim guide: the arc your spark will fly along if you let go now, dotted
   * so it reads as a prediction and not a wall. This is what makes release
   * timing a skill instead of a guess.
   */
  drawGuide(world, tt) {
    const p = world.player;
    if (p.mode !== 'fly' || world.state !== 'play') return;
    const path = world.predictPath();
    if (!path || path.pts.length < 3) return;
    const ctx = this.ctx;
    const S = world.S;
    const pts = path.pts;
    const col = path.landing ? C.gold : C.cyan;
    const n = pts.length;

    // solid tapered spine: this is the honest reading of where you will go
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n - 1; i++) {
      const t = i / (n - 1);
      const w = (1 - t * 0.75) * 2.4 * S + 0.8;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.strokeStyle = rgba(col, (1 - t) * 0.42 + 0.06);
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    // travelling pulses read as motion along the predicted arc
    for (let i = 0; i < n; i += 4) {
      const t = i / n;
      const ph = (tt * 1.5 - t * 1.6) % 1;
      if (ph < 0) continue;
      const a = Math.max(0, 1 - Math.abs(ph - t) * 3) * 0.5;
      if (a <= 0.01) continue;
      drawGlow(ctx, pts[i].x, pts[i].y, 5.5 * S, col, a);
    }
    ctx.restore();

    // landing marker: a ring you are aiming at, so the target is unambiguous
    if (path.landing) {
      const L = path.landing;
      const pulse = 0.5 + 0.5 * Math.sin(tt * 5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(L.x, L.y, L.orbitR * 0.42, 0, TAU);
      ctx.strokeStyle = rgba(C.goldHot, 0.24 + pulse * 0.22);
      ctx.lineWidth = 1.6 * S;
      ctx.stroke();
      drawGlow(ctx, L.x, L.y, L.orbitR * 0.7, C.gold, 0.1);
      ctx.restore();
    }
    const last = pts[pts.length - 1];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, last.x, last.y, 8 * S, path.landing ? C.goldHot : C.cyanHot, 0.26);
    ctx.restore();
  }

  drawEffects(world) {
    const ctx = this.ctx;
    const S = world.S;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const q of world.particles) {
      const t = clamp(q.life / q.maxLife, 0, 1);
      if (q.kind === 'spark') {
        const len = Math.min(14 * S, Math.hypot(q.vx, q.vy) * 0.035);
        const nx = q.vx / (Math.hypot(q.vx, q.vy) || 1);
        const ny = q.vy / (Math.hypot(q.vx, q.vy) || 1);
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - nx * len, q.y - ny * len);
        ctx.strokeStyle = rgba(q.color, t * 0.85);
        ctx.lineWidth = q.size * 0.6;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        drawGlow(ctx, q.x, q.y, q.size * 6, q.color, t * 0.5);
        ctx.fillStyle = rgba(q.color, t * 0.8);
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * 0.7, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    // rings
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of world.rings) {
      const k = clamp(r.life / r.maxLife, 0, 1);
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(0.5, r.r), 0, TAU);
      ctx.strokeStyle = rgba(r.color, r.alpha * k * k);
      ctx.lineWidth = Math.max(0.6, r.width * k);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPopups(world, tt) {
    const ctx = this.ctx;
    const S = world.S;
    for (const p of world.popups) {
      const t = clamp(p.life / p.maxLife, 0, 1);
      const appear = clamp((1 - t) * 6, 0, 1);
      const scale = 1 + (1 - appear) * 0.35;
      // measure properly and keep the label on screen wherever it was born
      if (p._w == null) {
        ctx.font = `700 ${p.size}px ${p.style === 'word' ? FONT_CJK : FONT_NUM}`;
        p._w = ctx.measureText(p.text).width;
      }
      // small echo labels get a slight lateral offset so stacked gains do not
      // print on top of each other
      const drift = p.style === 'num' ? (hash2(Math.round(p.x), Math.round(p.y)) - 0.5) * 26 * S : 0;
      const margin = p._w / 2 + 10 * S;
      const px = clamp(p.x + drift, margin, this.w - margin);
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 1.7) * appear;
      ctx.translate(px, p.y);
      ctx.scale(scale, scale);
      ctx.shadowColor = rgba(p.color, 0.85);
      ctx.shadowBlur = 13;
      if (p.style === 'word') {
        text(ctx, p.text, 0, 0, { size: p.size, weight: 700, color: p.color, font: FONT_CJK, track: true, spacing: p.size * 0.06 });
      } else {
        text(ctx, p.text, 0, 0, { size: p.size, weight: 700, color: p.color });
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  /** Screen flash + vignette + chromatic edge — drawn last, over the UI too. */
  drawPost(world, tt) {
    const ctx = this.ctx;
    const { w, h } = this;
    if (world.flash > 0.005) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(world.flashColor, world.flash * 0.5);
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (world.chroma > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, rgba(C.rose, world.chroma * 0.3));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    // permanent edge falloff keeps the composition contained
    const v = ctx.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.42, w / 2, h * 0.48, Math.max(w, h) * 0.82);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  beginFrame(ctx) {
    this.ctx = ctx;
  }
}
