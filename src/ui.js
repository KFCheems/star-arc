// 星弧 STAR ARC — UI & scenes. Everything is drawn, nothing is a DOM widget,
// so the same file runs on WeChat, Douyin and the browser.
import { TAU, clamp, lerp, rand, rgba, fmtScore, easeOutCubic, easeOutBack, easeOutQuint, smoothstep, mix, hash2 } from './utils.js';
import { C } from './palette.js';
import { CFG } from './const.js';
import { drawGlow } from './sprites.js';
import { glowAdd, sparkle, roundRect, ring, text, measure, FONT_NUM, FONT_CJK } from './gfx.js';
import { HOST, isMini, load, save, share, vibrate, now } from './platform.js';
import { Audio } from './audio.js';

const K_BEST = 'stararc.best';
const K_MUTE = 'stararc.mute';
const K_SEEN = 'stararc.seen';
const K_RUNS = 'stararc.runs';
const K_TOTAL = 'stararc.total';

export class UI {
  constructor(sys, world, renderer) {
    this.sys = sys;
    this.w = sys.width;
    this.h = sys.height;
    this.world = world;
    this.R = renderer;
    this.scene = 'title';
    this.t = 0;
    this.sceneT = 0;
    this.best = Number(load(K_BEST, 0)) || 0;
    this.muted = !!load(K_MUTE, false);
    this.seenTutorial = !!load(K_SEEN, false);
    this.runs = Number(load(K_RUNS, 0)) || 0;
    this.totalScore = Number(load(K_TOTAL, 0)) || 0;

    this.btn = null;
    this.hoverBtn = null;
    this.pressT = 0;
    this.pressPos = null;

    this.safeTop = Math.max(sys.top, 0) + 8;
    this.safeBottom = Math.max(sys.bottom, 0) + 8;

    this.newBest = false;
    this.overT = 0;
    this.overData = null;
    this.titleAnim = 0;
    this.coachT = 0;
    this.lastMult = 1;

    this.statsAnim = 0;
    this.shareFlash = 0;
    this.settingsOpen = false;
    this.rateScore = 0;
  }

  // --------------------------------------------------------------- helpers
  font(size, weight = 400, cjk = false) {
    return { size, weight, font: cjk ? FONT_CJK : FONT_NUM };
  }

  button(id, x, y, w, h, label, opt = {}) {
    return { id, x, y, w, h, label, ...opt };
  }

  hit(b, px, py) {
    const pad = 8;
    return px > b.x - pad && px < b.x + b.w + pad && py > b.y - pad && py < b.y + b.h + pad;
  }

  setScene(s) {
    this.scene = s;
    this.sceneT = 0;
    this.btn = null;
  }

  resetRunState() {
    this.newBest = false;
    this.overT = 0;
    this.overData = null;
    this.shareFlash = 0;
  }

  saveBest() {
    const w = this.world;
    if (w.score > this.best) {
      this.best = Math.floor(w.score);
      save(K_BEST, this.best);
      return true;
    }
    return false;
  }

  // ----------------------------------------------------------- run lifecycle
  startRun() {
    const w = this.world;
    this.resetRunState();
    this.R.clearCache && this.R.clearCache();
    w.start();
    this.setScene('play');
    this.statsAnim = 0;
    this.seenTutorial = true;
    save(K_SEEN, true);
    Audio.resume();
  }

  onDead() {
    const w = this.world;
    this.newBest = this.saveBest();
    this.runs++;
    save(K_RUNS, this.runs);
    this.totalScore += Math.floor(w.score);
    save(K_TOTAL, this.totalScore);
    this.overData = {
      score: Math.floor(w.score),
      best: this.best,
      streak: w.peakStreak,
      perfects: w.perfects,
      motes: w.motesTaken,
      time: w.runTime,
      newBest: this.newBest,
    };
    this.setScene('over');
    this.overT = 0;
    if (this.newBest) {
      Audio.sfx('newbest');
      vibrate(40);
    }
  }

  // ------------------------------------------------------------------ input
  pointerDown(p) {
    Audio.resume();
    this.pressT = 0;
    this.pressPos = p;
    if (this.scene === 'title') {
      const b = this.titleButtons();
      const hit = b.find((x) => this.hit(x, p.x, p.y));
      if (hit) {
        this.hoverBtn = hit;
        return;
      }
      this.startRun();
    } else if (this.scene === 'play') {
      this.world.press();
    } else if (this.scene === 'over') {
      if (this.overT < 0.9) return;
      const b = this.overButtons();
      const hit = b.find((x) => this.hit(x, p.x, p.y));
      this.hoverBtn = hit || null;
    } else if (this.scene === 'paused') {
      const b = this.pauseButtons();
      const hit = b.find((x) => this.hit(x, p.x, p.y));
      this.hoverBtn = hit || null;
    }
  }

  pointerUp(p) {
    if (this.scene === 'play') {
      this.world.release();
      return;
    }
    const hit = this.hoverBtn;
    this.hoverBtn = null;
    if (!hit) {
      if (this.scene === 'title') this.startRun();
      return;
    }
    if (!this.hit(hit, p.x, p.y)) return;
    this.activate(hit.id);
  }

  activate(id) {
    Audio.sfx('ui');
    if (id === 'play') {
      this.startRun();
    } else if (id === 'mute') {
      this.muted = !this.muted;
      save(K_MUTE, this.muted);
      Audio.setMuted(this.muted);
      if (!this.muted) Audio.setMusicOn(true);
    } else if (id === 'music') {
      Audio.setMusicOn(!Audio.musicOn);
    } else if (id === 'share') {
      this.doShare();
    } else if (id === 'again') {
      this.startRun();
    } else if (id === 'home') {
      this.setScene('title');
      this.world.reset();
    } else if (id === 'resume') {
      this.setScene('play');
    } else if (id === 'rank') {
      this.openRank();
    }
  }

  doShare() {
    const d = this.overData || { score: Math.floor(this.world.score) };
    const title = `我在《星弧》拿到了 ${fmtScore(d.score)} 分，你能超过我吗？`;
    if (isMini) {
      share(title, 'share.png');
      this.shareFlash = 1;
    } else {
      const url = location.href;
      const fallback = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = title + ' ' + url;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        } catch (e) {}
        this.shareFlash = 1;
      };
      if (navigator.share) {
        navigator.share({ title: '星弧 STAR ARC', text: title, url }).catch(() => fallback());
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(title + ' ' + url).then(
          () => (this.shareFlash = 1),
          () => fallback()
        );
      } else fallback();
    }
  }

  openRank() {
    if (HOST === 'wechat' && typeof wx !== 'undefined') {
      try {
        wx.postMessage && wx.postMessage({ type: 'openRank' });
      } catch (e) {}
    }
  }

  // ----------------------------------------------------------------- update
  update(dt) {
    this.t += dt;
    this.sceneT += dt;
    this.shareFlash = Math.max(0, this.shareFlash - dt * 1.6);
    this.titleAnim = Math.min(1, this.titleAnim + dt * 2.2);
    if (this.scene === 'over') this.overT += dt;
    if (this.scene === 'play') this.statsAnim += dt;
  }

  // ------------------------------------------------------------------ draw
  draw(ctx, tt) {
    const { w, h } = this;
    if (this.scene === 'title') this.drawTitle(ctx, tt);
    else if (this.scene === 'play') this.drawHUD(ctx, tt);
    else if (this.scene === 'over') this.drawOver(ctx, tt);
  }

  // ------------------------------------------------------------------ title
  titleButtons() {
    const { w, h } = this;
    const S = this.world.S;
    const bw = Math.min(w * 0.58, 260);
    const bh = 56 * S;
    const by = h * 0.665;
    return [
      this.button('play', (w - bw) / 2, by, bw, bh, '开始', { primary: true }),
      this.button('mute', w - 62, this.safeTop + 8, 44, 44, '', { icon: this.muted ? 'mute' : 'sound', primary: false, small: true }),
    ];
  }

  drawTitle(ctx, tt) {
    const { w, h } = this;
    const S = this.world.S;
    const inAnim = easeOutCubic(clamp(this.sceneT * 1.6, 0, 1));
    const a = clamp(this.sceneT * 1.2, 0, 1);

    // pull the living board back so the type owns the frame
    ctx.fillStyle = 'rgba(3,3,10,0.5)';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.66);
    g.addColorStop(0, 'rgba(4,4,16,0.72)');
    g.addColorStop(0.5, 'rgba(3,3,11,0.5)');
    g.addColorStop(1, 'rgba(3,3,10,0.1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const cy = h * 0.245 + (1 - inAnim) * 26;

    // eyebrow
    ctx.globalAlpha = a * 0.62;
    text(ctx, 'O N E   T H U M B   O R B I T A L   G A M E', w / 2, cy - 74 * S, {
      size: 8.6 * S,
      weight: 500,
      color: C.ivoryDim,
      track: true,
      spacing: 1.6 * S,
    });

    // title: 星弧
    const titleSize = Math.min(w * 0.2, 96 * S);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, w / 2, cy, titleSize * 2.2, C.cyan, 0.075 * a);
    drawGlow(ctx, w / 2, cy, titleSize * 1.05, C.gold, 0.06 * a);
    ctx.restore();

    const tg = ctx.createLinearGradient(0, cy - titleSize * 0.62, 0, cy + titleSize * 0.62);
    tg.addColorStop(0, '#FFFFFF');
    tg.addColorStop(0.36, C.ivory);
    tg.addColorStop(0.66, C.goldHot);
    tg.addColorStop(1, C.goldDeep);
    ctx.font = `600 ${titleSize}px ${FONT_CJK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chs = ['星', '弧'];
    const gap = titleSize * 0.1;
    const widths = chs.map((c) => ctx.measureText(c).width);
    const tw = widths[0] + widths[1] + gap;
    let px = w / 2 - tw / 2;
    ctx.fillStyle = tg;
    for (let i = 0; i < chs.length; i++) {
      ctx.fillText(chs[i], px + widths[i] / 2, cy);
      px += widths[i] + gap;
    }

    // a single hairline rule under the title, marks the composition
    const ruleW = tw * 0.62;
    const ry = cy + titleSize * 0.74;
    const ruleG = ctx.createLinearGradient(w / 2 - ruleW, 0, w / 2 + ruleW, 0);
    ruleG.addColorStop(0, rgba(C.gold, 0));
    ruleG.addColorStop(0.5, rgba(C.gold, 0.5));
    ruleG.addColorStop(1, rgba(C.gold, 0));
    ctx.fillStyle = ruleG;
    ctx.fillRect(w / 2 - ruleW, ry, ruleW * 2, 1);
    ctx.restore();

    // latin subtitle
    ctx.globalAlpha = a * 0.9;
    text(ctx, 'S T A R   A R C', w / 2, ry + 22 * S, {
      size: 11 * S,
      weight: 500,
      color: C.cyan,
      track: true,
      spacing: 3.4 * S,
    });

    // one-line pitch on its own plate so nothing behind can fight it
    const pitch = '按住环绕 · 松手疾行 · 金色弧上脱手即为完美';
    const pw = measure(ctx, pitch, 11 * S, 400, FONT_CJK) + 30 * S;
    const ph = 30 * S;
    const py = h * 0.558;
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = 'rgba(6,6,18,0.66)';
    roundRect(ctx, w / 2 - pw / 2, py - ph / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, pitch, w / 2, py + 0.5, {
      size: 11 * S,
      weight: 400,
      color: C.ivoryDim,
      font: FONT_CJK,
    });

    // best score badge
    if (this.best > 0) {
      ctx.globalAlpha = a * 0.95;
      const label = `最高  ${fmtScore(this.best)}`;
      const bw = measure(ctx, label, 12 * S, 600, FONT_CJK) + 30 * S;
      const bh = 28 * S;
      const bx = w / 2 - bw / 2;
      const by = h * 0.618;
      ctx.fillStyle = 'rgba(245,203,124,0.07)';
      roundRect(ctx, bx, by - bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.strokeStyle = rgba(C.gold, 0.26);
      ctx.lineWidth = 1;
      ctx.stroke();
      text(ctx, label, w / 2, by, { size: 12 * S, weight: 600, color: C.gold, font: FONT_CJK });
    }

    // buttons
    const btns = this.titleButtons();
    for (const b of btns) this.drawButton(ctx, b, tt);

    // bottom hint
    ctx.globalAlpha = a * 0.34;
    text(ctx, HOST === 'web' ? 'v1.0  ·  单指操作  ·  空格键亦可' : 'v1.0  ·  单指操作', w / 2, h - this.safeBottom - 22 * S, {
      size: 9.5 * S,
      weight: 400,
      color: C.ivoryDim,
      font: FONT_CJK,
    });
    ctx.globalAlpha = 1;
  }

  // -------------------------------------------------------------------- HUD
  drawHUD(ctx, tt) {
    const { w, h } = this;
    const S = this.world.S;
    const world = this.world;
    const top = this.safeTop;

    // score
    const scoreStr = fmtScore(world.displayScore);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.min(w * 0.115, 46 * S)}px ${FONT_NUM}`;
    const sc = Math.min(w * 0.115, 46 * S);
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = C.ivory;
    ctx.globalAlpha = 0.96;
    ctx.fillText(scoreStr, w / 2, top + 2);
    ctx.restore();

    // best under it
    if (this.best > 0) {
      ctx.globalAlpha = 0.5;
      text(ctx, 'BEST ' + fmtScore(this.best), w / 2, top + 4 + sc * 1.06, {
        size: 9 * S,
        weight: 600,
        color: C.ivoryDim,
        track: true,
        spacing: 1.4 * S,
      });
    }

    // multiplier chip, left
    const m = world.mult();
    if (m > 1) {
      const pop = clamp(1.25 - (this.multPop || 0), 1, 1.25);
      ctx.save();
      ctx.globalAlpha = 0.95;
      const cx = 24 * S;
      const cy = top + 22 * S;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, cx + 14 * S, cy, 40 * S, C.gold, 0.14 + (m > 3 ? 0.1 : 0));
      ctx.restore();
      const label = '×' + m;
      const bw = measure(ctx, label, 19 * S, 700) + 22 * S;
      ctx.fillStyle = 'rgba(245,203,124,0.1)';
      roundRect(ctx, cx, cy - 15 * S, bw, 30 * S, 15 * S);
      ctx.fill();
      ctx.strokeStyle = rgba(C.gold, 0.4);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      text(ctx, label, cx + bw / 2, cy + 1, { size: 19 * S, weight: 700, color: C.goldHot });
      this.multPop = Math.max(0, (this.multPop || 0) - 0.04);
      ctx.restore();
    }
    if (world.lastMult !== m) {
      this.multPop = 1;
      world.lastMult = m;
    }

    // pause button right
    const pb = this.button('pause', w - 54 * S, top + 4, 38 * S, 38 * S, '', { icon: 'pause' });
    this.drawButton(ctx, pb, tt, true);

    // tutorial coach
    if (this.sceneT < 9 && !world.perfects) {
      this.drawCoach(ctx, tt);
    }

    // danger tint at the edges when shards appear
    if (world.shards.length > 0) {
      const intensity = clamp(world.shards.length / 5, 0, 1) * 0.5 + 0.3;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.36, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, rgba(C.rose, 0.05 * intensity));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawCoach(ctx, tt) {
    const { w, h } = this;
    const S = this.world.S;
    const world = this.world;
    const k = clamp((9 - this.sceneT) / 1.4, 0, 1) * clamp(this.sceneT * 2.2, 0, 1);
    if (k <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = k;

    // A ring drawn around the player that explains the release window
    const p = world.player;
    if (p.mode === 'orbit' && p.star) {
      const s = p.star;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.orbitR, s.arcA - s.arcW, s.arcA + s.arcW);
      ctx.strokeStyle = rgba(C.goldHot, 0.24 + 0.16 * Math.sin(tt * 4));
      ctx.lineWidth = 9 * S;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
      const gr = s.orbitR + 46 * S;
      const ax = s.x + Math.cos(s.arcA) * (s.orbitR + 22 * S);
      const ay = s.y + Math.sin(s.arcA) * (s.orbitR + 22 * S);
      ctx.globalCompositeOperation = 'source-over';
      text(ctx, '金色弧上松手', ax, ay, { size: 10.5 * S, weight: 600, color: C.goldHot, font: FONT_CJK });
    }

    const tips = [
      { at: 0.0, t: '按住屏幕 → 绕星环绕' },
      { at: 2.2, t: '转到金色弧上，松手 = PERFECT' },
      { at: 4.6, t: '别让光点撞到边框或碎星' },
    ];
    let cur = null;
    for (const tip of tips) if (this.sceneT >= tip.at) cur = tip;
    if (cur) {
      const ty = h - this.safeBottom - 46 * S;
      const fade = cur.at === 4.6 ? 1 - clamp((this.sceneT - 6.6) / 2.4, 0, 1) : 1;
      ctx.globalAlpha = k * fade * 0.9;
      const bw = measure(ctx, cur.t, 12 * S, 500, FONT_CJK) + 34 * S;
      ctx.fillStyle = 'rgba(4,4,14,0.55)';
      roundRect(ctx, w / 2 - bw / 2, ty - 17 * S, bw, 34 * S, 17 * S);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.stroke();
      text(ctx, cur.t, w / 2, ty + 1, { size: 12 * S, weight: 500, color: C.ivory, font: FONT_CJK });
    }
    ctx.restore();
  }

  // ------------------------------------------------------------- game over
  overButtons() {
    const { w, h } = this;
    const S = this.world.S;
    const bw = Math.min(w * 0.66, 268);
    const bh = 54 * S;
    const gap = 12 * S;
    const bx = (w - bw) / 2;
    const by = h * 0.7;
    return [
      this.button('again', bx, by, bw, bh, '再来一次', { primary: true }),
      this.button('share', bx, by + bh + gap, bw, bh * 0.88, '炫耀一下', {}),
      this.button('home', bx + bw * 0.5 + gap * 0.5, by + (bh + gap) * 2, bw * 0.5 - gap * 0.5, bh * 0.8, '返回', { small2: true }),
      this.button('rank', bx, by + (bh + gap) * 2, bw * 0.5 - gap * 0.5, bh * 0.8, '排行榜', { small2: true }),
    ];
  }

  drawOver(ctx, tt) {
    const { w, h } = this;
    const S = this.world.S;
    const d = this.overData;
    if (!d) return;
    const k = easeOutCubic(clamp(this.overT / 0.7, 0, 1));

    // scrim
    ctx.save();
    ctx.fillStyle = `rgba(2,2,9,${0.62 * k})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const cx = w / 2;
    const topY = h * 0.235 - (1 - k) * 18;

    // label
    ctx.globalAlpha = k * 0.8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, cx, topY - 34 * S, 150 * S, this.newBest ? C.gold : C.rose, 0.11 * k);
    ctx.restore();
    text(ctx, this.newBest ? '新 纪 录' : '星 程 终 结', cx, topY - 34 * S, {
      size: 12 * S,
      weight: 600,
      color: this.newBest ? C.goldHot : C.rose,
      font: FONT_CJK,
      track: true,
      spacing: 4 * S,
    });

    // score, counting up
    const countK = easeOutQuint(clamp((this.overT - 0.12) / 0.95, 0, 1));
    const shown = Math.floor(d.score * countK);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ss = Math.min(w * 0.2, 74 * S);
    ctx.font = `700 ${ss}px ${FONT_NUM}`;
    const grad = ctx.createLinearGradient(0, topY - ss * 0.5, 0, topY + ss * 0.5);
    grad.addColorStop(0, C.ivory);
    grad.addColorStop(1, this.newBest ? C.gold : C.ivoryDim);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 20;
    ctx.globalAlpha = k;
    ctx.fillText(fmtScore(shown), cx, topY);
    ctx.restore();

    ctx.globalAlpha = k * 0.55;
    text(ctx, 'BEST  ' + fmtScore(d.best), cx, topY + ss * 0.72, {
      size: 10 * S,
      weight: 500,
      color: C.ivoryDim,
      track: true,
      spacing: 1.8 * S,
    });

    // stat row
    const stats = [
      { v: d.streak, l: '最高连击' },
      { v: d.perfects, l: '完美脱手' },
      { v: d.motes.toFixed(0), l: '光点' },
      { v: d.time.toFixed(0) + 's', l: '存活' },
    ];
    const sy = topY + ss * 1.42;
    const colW = w / (stats.length + 0.6);
    const startX = (w - colW * stats.length) / 2 + colW / 2;
    ctx.globalAlpha = k;
    for (let i = 0; i < stats.length; i++) {
      const st = stats[i];
      const stK = clamp((this.overT - 0.55 - i * 0.09) / 0.4, 0, 1);
      const x = startX + i * colW;
      ctx.globalAlpha = k * stK;
      text(ctx, String(st.v), x, sy, { size: 20 * S, weight: 700, color: C.ivory });
      text(ctx, st.l, x, sy + 22 * S, { size: 9 * S, weight: 400, color: C.ivoryDim, font: FONT_CJK });
      if (i < stats.length - 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + colW / 2, sy - 8 * S, 1, 36 * S);
      }
    }
    ctx.globalAlpha = 1;

    if (this.overT > 0.85) {
      for (const b of this.overButtons()) this.drawButton(ctx, b, tt);
    }

    if (this.shareFlash > 0) {
      ctx.globalAlpha = clamp(this.shareFlash, 0, 1) * 0.8;
      text(ctx, isMini ? '已调起分享' : '分数已复制', cx, h - this.safeBottom - 24 * S, {
        size: 10.5 * S,
        weight: 500,
        color: C.mint,
        font: FONT_CJK,
      });
      ctx.globalAlpha = 1;
    }
  }

  // ----------------------------------------------------------------- button
  drawButton(ctx, b, tt, iconOnly = false) {
    const pressed = this.hoverBtn && this.hoverBtn.id === b.id;
    const S = this.world.S;

    if (b.icon || iconOnly) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const r = b.w / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      roundRect(ctx, b.x, b.y, b.w, b.h, r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.translate(cx, cy);
      const ic = b.icon === 'pause' ? 3 : b.icon === 'mute' ? 3 : 4;
      ctx.fillStyle = rgba(C.ivory, 0.72);
      if (b.icon === 'pause') {
        ctx.fillRect(-5, -6, 3.2, 12);
        ctx.fillRect(1.8, -6, 3.2, 12);
      } else if (b.icon === 'mute') {
        ctx.beginPath();
        ctx.moveTo(-8, -3.5);
        ctx.lineTo(-4, -3.5);
        ctx.lineTo(1, -7.5);
        ctx.lineTo(1, 7.5);
        ctx.lineTo(-4, 3.5);
        ctx.lineTo(-8, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rgba(C.rose, 0.85);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(4, -4);
        ctx.lineTo(9, 4);
        ctx.moveTo(9, -4);
        ctx.lineTo(4, 4);
        ctx.stroke();
      } else {
        // sound on: speaker + waves
        ctx.beginPath();
        ctx.moveTo(-8, -3.5);
        ctx.lineTo(-4, -3.5);
        ctx.lineTo(1, -7.5);
        ctx.lineTo(1, 7.5);
        ctx.lineTo(-4, 3.5);
        ctx.lineTo(-8, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rgba(C.ivory, 0.6);
        ctx.lineWidth = 1.4;
        for (let i = 1; i <= 2; i++) {
          ctx.beginPath();
          ctx.arc(2, 0, 3 + i * 3.2, -0.85, 0.85);
          ctx.stroke();
        }
      }
      ctx.restore();
      return;
    }

    const { x, y, w, h } = b;
    const primary = !!b.primary;
    const scale = pressed ? 0.965 : 1;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);

    if (primary) {
      // glowing gradient pill
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, w / 2, h / 2, w * 0.72, C.gold, 0.12 + Math.sin(tt * 1.8) * 0.03);
      ctx.restore();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,241,208,0.98)');
      g.addColorStop(0.5, 'rgba(245,203,124,0.95)');
      g.addColorStop(1, 'rgba(214,164,86,0.96)');
      ctx.fillStyle = g;
      roundRect(ctx, 0, 0, w, h, h / 2);
      ctx.fill();
      // inner top highlight
      const hl = ctx.createLinearGradient(0, 0, 0, h * 0.55);
      hl.addColorStop(0, 'rgba(255,255,255,0.5)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      roundRect(ctx, 2, 2, w - 4, h * 0.52, h / 2);
      ctx.fill();
      text(ctx, b.label, w / 2, h / 2 + 1, {
        size: (b.small2 ? 14 : 17) * S,
        weight: 700,
        color: '#2A1606',
        font: FONT_CJK,
      });
    } else {
      ctx.fillStyle = pressed ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)';
      roundRect(ctx, 0, 0, w, h, h / 2);
      ctx.fill();
      ctx.strokeStyle = rgba(C.ivory, pressed ? 0.24 : 0.12);
      ctx.lineWidth = 1;
      ctx.stroke();
      text(ctx, b.label, w / 2, h / 2 + 1, {
        size: (b.small2 ? 13.5 : 15) * S,
        weight: 500,
        color: rgba(C.ivory, 0.92),
        font: FONT_CJK,
      });
    }
    ctx.restore();
  }
}
