// 星弧 STAR ARC — world simulation.
//
// DESIGN
//   Hold  → you latch onto the nearest star and orbit it. Safe.
//   Release → you fly off on the tangent. That is the only way to score.
//   So the only thing that can kill you is your own greed.
//
//   Each star carries a resonance arc on its orbit ring. Release while your
//   spark is standing on that arc → PERFECT: streak +1, multiplier up,
//   shockwave that clears shards, a speed kick.
//   Orbiting burns the star's fuel. A burnt-out star goes dark for a moment,
//   so you can never camp on one star forever.
//
//   Flight is not ballistic: your spark bends toward the nearest lit star, so
//   travel reads as arcs and the next capture is always reachable. The frame
//   edge is a wall you bounce off — it costs your whole multiplier, never a
//   life. The only thing that actually kills you is a shard, which means the
//   only real threat is your own appetite for one more perfect.
import {
  TAU,
  clamp,
  lerp,
  rand,
  randInt,
  pick,
  chance,
  dist,
  angleDelta,
  easeOutCubic,
  hash2,
} from './utils.js';
import { CFG, HUE } from './const.js';
import { C } from './palette.js';
import { Audio } from './audio.js';
import { vibrate } from './platform.js';

const ORBIT_OMEGA = 5.2;

export class World {
  constructor(sys) {
    this.sys = sys;
    this.w = sys.width;
    this.h = sys.height;
    this.S = clamp(this.h / 760, 0.78, 1.32);
    this.reset();
  }

  // ------------------------------------------------------------------ setup
  reset(seedShift = 0) {
    const { w, h, S } = this;
    this.t = 0;
    this.runTime = 0;
    this.state = 'ready';
    this.timeScale = 1;
    this.hitstop = 0;
    this.flash = 0;
    this.flashColor = C.ivory;
    this.vignette = 0;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.chroma = 0;

    this.score = 0;
    this.displayScore = 0;
    this.streak = 0;
    this.peakStreak = 0;
    this.perfects = 0;
    this.captures = 0;
    this.motesTaken = 0;
    this.bestStreakFx = 0;
    this.surgeCount = 0;

    this.arena = {
      x: w * CFG.insetStart,
      y: h * 0.19,
      w: w * (1 - CFG.insetStart * 2),
      h: h * (1 - 0.19 - 0.13),
    };

    this.player = {
      x: w / 2,
      y: h * 0.55,
      vx: 0,
      vy: 0,
      mode: 'fly',
      star: null,
      theta: 0,
      dir: 1,
      charge: 0,
      orbitR: CFG.orbitMax * S,
      trail: [],
      invuln: 0,
      booster: 0,
      dead: false,
      rot: 0,
      spawnT: 0,
    };

    this.stars = [];
    this.motes = [];
    this.shards = [];
    this.particles = [];
    this.rings = [];
    this.popups = [];
    this.streaks = [];

    this.pulseT = 0.9;
    this.pulseGlow = 0;

    this.deathT = 0;
    this.deathReason = '';
    this.started = false;
    this.frozen = false;
    this.travelAcc = 0;
    this.overShown = false;
    this.deathCamera = 0;
    this.lastWall = -9;
    this.lastMult = 1;

    this.hint = null;
    this.hintT = 0;

    this.buildStars(seedShift);
    this.scatterMotes(18);
    this.spawnPlayer();
    this.bg = null;
  }

  spawnPlayer() {
    const a = this.arena;
    const p = this.player;
    // start on the left, flying in horizontally toward the middle
    const s0 = this.stars[0];
    if (s0) {
      p.x = s0.x + s0.orbitR;
      p.y = s0.y;
      p.vx = 0;
      p.vy = 0;
      p.mode = 'orbit';
      p.star = s0;
      p.theta = 0;
      p.dir = 1;
      p.orbitR = s0.orbitR;
      p.charge = 0;
    } else {
      p.x = a.x + a.w * 0.5;
      p.y = a.y + a.h * 0.5;
    }
  }

  buildStars(shift = 0) {
    this.stars.length = 0;
    const a = this.arena;
    const n = 4;
    const margin = 78 * this.S;
    for (let i = 0; i < n; i++) {
      // place around a ring so the board reads at a glance
      const ang = (i / n) * TAU + 0.6;
      const rx = a.w * 0.31;
      const ry = a.h * 0.29;
      const x = a.x + a.w / 2 + Math.cos(ang) * rx;
      const y = a.y + a.h / 2 + Math.sin(ang) * ry;
      this.stars.push(this.makeStar(clamp(x, a.x + margin, a.x + a.w - margin), clamp(y, a.y + margin, a.y + a.h - margin), i));
    }
  }

  makeStar(x, y, i = 0) {
    const S = this.S;
    const orbitR = (CFG.orbitMin + rand(0, CFG.orbitMax - CFG.orbitMin)) * S * 0.92;
    return {
      x,
      y,
      vx: rand(-1, 1) * 7 * S,
      vy: rand(-1, 1) * 7 * S,
      r: (11 + rand(0, 4)) * S,
      orbitR,
      fuel: 1,
      arcA: rand(0, TAU),
      arcW: 1.05, // half-width in radians
      arcSpeed: rand(0.3, 0.62) * (chance(0.5) ? 1 : -1),
      hue: i % 3 === 0 ? HUE.gold : i % 3 === 1 ? HUE.cyan : HUE.violet,
      worldSeed: randInt(0, 9999),
      dark: 0,
      glowPulse: rand(0, TAU),
      used: 0,
      born: 0,
      _px: x,
      _py: y,
    };
  }

  scatterMotes(n) {
    const a = this.arena;
    let made = 0;
    let guard = 0;
    while (made < n && guard++ < n * 30) {
      const x = rand(a.x + 40, a.x + a.w - 40);
      const y = rand(a.y + 40, a.y + a.h - 40);
      let ok = true;
      for (const s of this.stars) {
        if (dist(x, y, s.x, s.y) < s.orbitR + 74 * this.S) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      for (const m of this.motes) {
        if (dist(x, y, m.x, m.y) < 62 * this.S) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      this.motes.push(this.makeMote(x, y));
      made++;
    }
  }

  makeMote(x, y) {
    return {
      x,
      y,
      vx: rand(-8, 8),
      vy: rand(-8, 8),
      r: CFG.moteRadius * this.S * rand(0.75, 1.15),
      ph: rand(0, TAU),
      taken: false,
      t: 0,
    };
  }

  // ------------------------------------------------------------- difficulty
  /** 0..1 ramp over the run. */
  difficulty() {
    return clamp(this.runTime / CFG.speedRampSeconds, 0, 1);
  }

  baseSpeed() {
    const d = this.difficulty();
    return lerp(CFG.speedStart, CFG.speedEnd, easeOutCubic(d)) * this.S;
  }

  targetStars() {
    const d = this.difficulty();
    return d > 0.35 ? 5 : 4;
  }

  targetShards() {
    if (this.runTime < 11) return 0;
    const d = this.difficulty();
    return clamp(Math.floor((this.runTime - 11) / 24) + 1, 0, 6);
  }

  // ------------------------------------------------------------------ input
  press() {
    const p = this.player;
    if (p.mode === 'orbit' && p.star) {
      p.hold = true;
      return;
    }
    p.hold = true;
    // grab the nearest capturable star within reach
    const s = this.starInReach();
    if (s && p.mode === 'fly') {
      this.capture(s);
    }
  }

  release() {
    const p = this.player;
    p.hold = false;
    if (p.mode === 'orbit' && p.star && this.state === 'play') this.launch();
  }

  starInReach() {
    const p = this.player;
    let best = null;
    let bd = Infinity;
    for (const s of this.stars) {
      if (s.dark > 0) continue;
      const d = dist(p.x, p.y, s.x, s.y);
      const reach = s.orbitR + CFG.captureRadius * this.S * 0.62;
      if (d < reach && d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  capture(s) {
    const p = this.player;
    if (this.state === 'dead') return;
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    let theta = Math.atan2(dy, dx);
    // orbit the way the player was already travelling
    const tang = p.mode === 'fly' ? p.vx * -Math.sin(theta) + p.vy * Math.cos(theta) : 0;
    const dir = p.mode === 'fly' ? (tang > 0 ? 1 : -1) : p.dir;

    p.mode = 'orbit';
    p.star = s;
    p.theta = theta;
    p.dir = dir;
    p.orbitR = s.orbitR;
    p.charge = p.mode === 'fly' ? 0 : p.charge;
    p.charge = 0;
    p.vx = 0;
    p.vy = 0;
    p.booster = 0;

    this.captures++;
    s.used++;
    s.glowPulse = 0;
    this.ring(s.x, s.y, s.orbitR, s.hue.mid, 0.5, 0.34);
    this.burst(p.x, p.y, 8, s.hue.mid, 0.5, 150);
    Audio.sfx('launch');
    vibrate(8);
    if (this.started) this.addScore(10 * this.mult(), s.x, s.y - 20 * this.S, C.ivoryDim, '+' + 10 * this.mult());
  }

  inArc() {
    const p = this.player;
    const s = p.star;
    if (!s) return false;
    const d = Math.abs(angleDelta(s.arcA, p.theta));
    return d < s.arcW;
  }

  launch() {
    const p = this.player;
    const s = p.star;
    if (!s) return;
    const perfect = this.inArc();
    const boostCharge = p.charge;
    let speed = this.baseSpeed() * (0.94 + boostCharge * 0.3);

    // tangent
    const tx = -Math.sin(p.theta) * p.dir;
    const ty = Math.cos(p.theta) * p.dir;

    if (perfect) {
      speed *= 1.16;
      this.perfectLaunch(s, speed);
    } else {
      if (this.streak > 0) {
        this.popups.push({
          x: p.x,
          y: p.y - 26 * this.S,
          text: this.streak >= 3 ? '连击中断' : 'MISS',
          color: C.rose,
          size: 17,
          life: 0.85,
          maxLife: 0.85,
          vy: -34,
          style: 'word',
        });
        this.streak = 0;
        this.ring(p.x, p.y, 30 * this.S, C.rose, 0.4, 26 * this.S);
      }
      Audio.sfx('release', { power: 0.8 + boostCharge * 0.5 });
    }

    p.mode = 'fly';
    p.star = null;
    p.vx = tx * speed;
    p.vy = ty * speed;
    p.charge = 0;
    p.booster = perfect ? 1 : 0;
    p.lockT = 0.12;
    p.dir = p.dir;

    this.burst(p.x, p.y, perfect ? 20 : 9, perfect ? C.gold : s.hue.mid, perfect ? 0.9 : 0.5, perfect ? 320 : 170);
    this.ring(p.x, p.y, 18 * this.S, perfect ? C.goldHot : s.hue.mid, 0.7, perfect ? 70 * this.S : 34 * this.S);
    vibrate(perfect ? 18 : 9);
  }

  perfectLaunch(s, speed) {
    const p = this.player;
    this.streak++;
    this.perfects++;
    this.peakStreak = Math.max(this.peakStreak, this.streak);
    const m = this.mult();
    const bonus = Math.round(CFG.scoreResonance * m);
    this.addScore(bonus, p.x, p.y - 30 * this.S, C.gold, 'PERFECT  +' + bonus);

    this.hitstop = 0.07;
    this.timeScale = 0.28;
    this.flash = Math.min(1, 0.5 + this.streak * 0.05);
    this.flashColor = C.goldHot;
    this.shake = Math.max(this.shake, 7 + Math.min(12, this.streak));
    this.ring(s.x, s.y, s.orbitR, C.gold, 0.95, 150 * this.S, 0.55, 3);
    this.ring(s.x, s.y, s.orbitR * 0.4, C.goldHot, 0.9, 110 * this.S, 0.4, 2);
    this.shockwave(p.x, p.y, 210 * this.S);
    Audio.sfx('resonate', { grade: Math.min(6, Math.floor(this.streak / 2)) });
    Audio.sfx('collect', { step: Math.min(12, this.streak + 2) });

    // surge every few perfects
    const thresholds = [4, 8, 13, 19, 26, 34];
    if (thresholds.includes(this.streak)) {
      this.surgeCount++;
      const sb = 420 * m;
      this.addScore(sb, this.arena.x + this.arena.w / 2, this.arena.y + this.arena.h * 0.36, C.mint, 'SURGE  +' + sb, 26);
      this.shockwave(this.arena.x + this.arena.w / 2, this.arena.y + this.arena.h / 2, 420 * this.S);
      this.flash = 0.75;
      this.flashColor = C.cyanHot;
      this.shake = 18;
      this.timeScale = 0.2;
      this.scatterMotes(5);
      Audio.sfx('newbest');
      vibrate(30);
    }
  }

  mult() {
    return Math.min(1 + this.streak, 20);
  }

  addScore(v, x, y, color, label, size) {
    // nothing scores after the run is over; the tally is frozen at death
    if (this.state === 'dead' || this.frozen) return;
    this.score += v;
    if (label) {
      this.popups.push({
        x,
        y,
        text: label,
        color: color || C.ivory,
        size: (size || 18) * this.S,
        life: 1.05,
        maxLife: 1.05,
        vy: -52 * this.S,
        style: 'num',
      });
    }
  }

  // -------------------------------------------------------------- effects
  burst(x, y, n, color, power = 0.6, speed = 200) {
    const S = this.S;
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 460) break;
      const a = rand(0, TAU);
      const sp = speed * rand(0.25, 1) * S;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.28, 0.7) * (0.6 + power),
        maxLife: 1,
        size: rand(1.4, 4.2) * S * (0.7 + power * 0.6),
        color,
        drag: rand(1.2, 3.4),
        kind: chance(0.72) ? 'glow' : 'spark',
      });
      this.particles[this.particles.length - 1].maxLife = this.particles[this.particles.length - 1].life;
    }
  }

  ring(x, y, r0, color, alpha = 0.8, toR = 80, dur = 0.45, width = 2) {
    this.rings.push({ x, y, r: r0, r0, toR, life: dur, maxLife: dur, color, alpha, width: width * this.S });
  }

  shockwave(x, y, radius) {
    this.rings.push({ x, y, r: 10, r0: 10, toR: radius, life: 0.62, maxLife: 0.62, color: C.goldHot, alpha: 0.95, width: 4 * this.S, shatter: true });
    this.rings.push({ x, y, r: 10, r0: 10, toR: radius * 0.66, life: 0.5, maxLife: 0.5, color: C.cyanHot, alpha: 0.7, width: 2 * this.S });
  }

  // ------------------------------------------------------------------- flow
  start() {
    this.reset();
    this.state = 'play';
    this.started = true;
    this.runTime = 0;
    this.player.mode = 'orbit';
    this.player.star = this.stars[0];
    this.player.theta = 0;
    this.player.dir = 1;
    this.player.orbitR = this.stars[0].orbitR;
    this.pulseT = 1.6;
    Audio.sfx('start');
    Audio.setIntensity(0.1);
    Audio.startMusic();
  }

  update(dtRaw) {
    // global time scaling
    if (this.hitstop > 0) {
      this.hitstop -= dtRaw;
      this.timeScale = 0;
    }
    const dt = dtRaw * (this.hitstop > 0 ? 0 : this.timeScale);
    const S = this.S;

    this.t += dtRaw;
    this.timeScale += (1 - this.timeScale) * Math.min(1, dtRaw * 7.5);
    this.flash *= Math.exp(-dtRaw * 5.5);
    this.shake *= Math.exp(-dtRaw * 6.2);
    this.shakeX = rand(-1, 1) * this.shake;
    this.shakeY = rand(-1, 1) * this.shake;
    this.chroma *= Math.exp(-dtRaw * 4);

    if (this.state === 'play') {
      this.runTime += dt;
      Audio.setIntensity(clamp(0.12 + this.difficulty() * 0.55 + this.streak * 0.03, 0, 1));
    }

    this.updateArena(dt);
    this.updateStars(dt);
    if (this.state === 'play' || this.state === 'ready') this.updatePlayer(dt);
    this.updateMotes(dt);
    this.updateShards(dt);
    this.updateEffects(dt, dtRaw);
    this.updatePulse(dt);

    this.displayScore += (this.score - this.displayScore) * Math.min(1, dtRaw * 9);
    if (Math.abs(this.score - this.displayScore) < 0.6) this.displayScore = this.score;

    if (this.state === 'dead') {
      this.deathT += dtRaw;
      this.deathCamera += (1 - this.deathCamera) * Math.min(1, dtRaw * 2.2);
      if (this.deathT > 1.55 && !this.overShown) {
        this.overShown = true;
        this.onOver && this.onOver();
      }
    }
  }

  updateArena(dt) {
    const d = this.difficulty();
    const inset = lerp(CFG.insetStart, CFG.insetEnd, easeOutCubic(d));
    const a = this.arena;
    const topFrac = lerp(0.19, 0.235, d);
    const botFrac = lerp(0.13, 0.165, d);
    const tx = this.w * inset;
    const ty = this.h * topFrac;
    const tw = this.w * (1 - inset * 2);
    const th = this.h * (1 - topFrac - botFrac);
    const k = Math.min(1, dt * 1.4);
    a.x = lerp(a.x, tx, k);
    a.y = lerp(a.y, ty, k);
    a.w = lerp(a.w, tw, k);
    a.h = lerp(a.h, th, k);
  }

  updateStars(dt) {
    const a = this.arena;
    const S = this.S;
    const p = this.player;
    const maxV = lerp(9, 26, this.difficulty()) * S;

    for (const s of this.stars) {
      s._px = s.x;
      s._py = s.y;
      if (s.dark > 0) s.dark -= dt;
      if (s.fuel < 1 && (p.star !== s || p.mode !== 'orbit')) s.fuel = Math.min(1, s.fuel + dt * 0.19);
      if (s.fuel < 1 && p.star === s && p.mode === 'orbit') s.fuel = Math.max(0, s.fuel - dt / CFG.starFuel);

      s.glowPulse += dt * 2.1;

      // the resonance arc drifts; nudge it toward the player's angle so a
      // perfect is always reachable without feeling telepathic
      s.arcA += s.arcSpeed * dt;
      if (p.star === s && p.mode === 'orbit') {
        const d = angleDelta(s.arcA, p.theta);
        if (Math.abs(d) > 2.5) {
          s.arcA += Math.sign(d) * dt * 1.15;
        }
      }

      // drift
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > maxV) {
        s.vx *= maxV / sp;
        s.vy *= maxV / sp;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      const pad = s.orbitR + 26 * S;
      if (s.x < a.x + pad) {
        s.x = a.x + pad;
        s.vx = Math.abs(s.vx);
      }
      if (s.x > a.x + a.w - pad) {
        s.x = a.x + a.w - pad;
        s.vx = -Math.abs(s.vx);
      }
      if (s.y < a.y + pad) {
        s.y = a.y + pad;
        s.vy = Math.abs(s.vy);
      }
      if (s.y > a.y + a.h - pad) {
        s.y = a.y + a.h - pad;
        s.vy = -Math.abs(s.vy);
      }

      // keep stars apart
      for (const o of this.stars) {
        if (o === s) continue;
        const dx = o.x - s.x;
        const dy = o.y - s.y;
        const d2 = dx * dx + dy * dy;
        const min = (s.orbitR + o.orbitR) * 0.86;
        if (d2 < min * min && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (min - d) / d * 0.5;
          s.x -= dx * push;
          s.y -= dy * push;
          o.x += dx * push;
          o.y += dy * push;
        }
      }
    }

    // spawn/despawn to keep the count steady
    const want = this.targetStars();
    while (this.stars.length < want) {
      const pos = this.findOpenSpot();
      if (pos) {
        const s = this.makeStar(pos.x, pos.y, this.stars.length);
        s.born = 0.001;
        this.stars.push(s);
        this.ring(s.x, s.y, 10, s.hue.mid, 0.6, s.orbitR, 0.8, 2);
      } else break;
    }
    while (this.stars.length > want) {
      const s = this.stars.pop();
      this.burst(s.x, s.y, 10, s.hue.mid, 0.5, 150);
    }
  }

  findOpenSpot() {
    const a = this.arena;
    for (let i = 0; i < 26; i++) {
      const s = CFG.orbitMax * this.S + 30;
      const x = rand(a.x + 70 * this.S, a.x + a.w - 70 * this.S);
      const y = rand(a.y + 70 * this.S, a.y + a.h - 70 * this.S);
      let ok = true;
      if (this.player) {
        if (dist(x, y, this.player.x, this.player.y) < 150 * this.S) ok = false;
      }
      for (const o of this.stars) {
        if (dist(x, y, o.x, o.y) < o.orbitR + CFG.orbitMax * this.S * 1.5) ok = false;
      }
      if (ok) return { x, y };
    }
    return null;
  }

  updatePlayer(dt) {
    const p = this.player;
    const S = this.S;
    if (!this.started) {
      this.updateDemo(dt);
      return;
    }
    if (p.mode === 'orbit' && p.star) {
      const s = p.star;
      // follow the star's drift
      s.x += 0;
      p.orbitR += (s.orbitR - p.orbitR) * Math.min(1, dt * 8);
      p.theta += p.dir * ORBIT_OMEGA * dt;
      p.charge = Math.min(1, p.charge + dt / 0.82);
      p.x = s.x + Math.cos(p.theta) * p.orbitR;
      p.y = s.y + Math.sin(p.theta) * p.orbitR;
      p.vx = 0;
      p.vy = 0;
      p.rot += dt * 2.4 * p.dir;

      // burnt-out star: kicked off, no death
      if (s.fuel <= 0.0001 && !s.burned) {
        s.burned = true;
        s.dark = 1.5;
        s.fuel = 0;
        this.popups.push({
          x: s.x,
          y: s.y - s.orbitR - 24 * S,
          text: '星熄灭',
          color: C.rose,
          size: 16 * S,
          life: 1.1,
          maxLife: 1.1,
          vy: -40 * S,
          style: 'word',
        });
        this.burst(s.x, s.y, 18, C.rose, 0.9, 260);
        this.ring(s.x, s.y, s.orbitR, C.rose, 0.8, s.orbitR * 2.4, 0.5, 2);
        Audio.sfx('die');
        vibrate(24);
        this.flash = 0.4;
        this.flashColor = C.rose;
        if (p.hold) this.launch();
        else {
          p.mode = 'fly';
          p.star = null;
          const tx = -Math.sin(p.theta) * p.dir;
          const ty = Math.cos(p.theta) * p.dir;
          p.vx = tx * this.baseSpeed() * 0.8;
          p.vy = ty * this.baseSpeed() * 0.8;
        }
        return;
      }
      if (s.fuel > 0.02) s.burned = false;
    } else if (p.mode === 'fly') {
      const a = this.arena;
      const speed = Math.hypot(p.vx, p.vy) || this.baseSpeed();
      let ang = Math.atan2(p.vy, p.vx);

      // steer toward the nearest lit star: flight arcs, it does not drift
      const tgt = this.nearestStar();
      if (tgt) {
        const want = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        const d = angleDelta(ang, want);
        const near = clamp(dist(p.x, p.y, tgt.x, tgt.y) / (tgt.orbitR + 190 * S), 0, 1);
        // steering is strongest when far away and fades as you close in, so
        // you curve into the target without spiralling around it
        const grip = CFG.steerNear + (1 - CFG.steerNear) * easeOutCubic(near);
        ang += clamp(d, -1, 1) * CFG.steerRate * grip * dt;
      }

      p.vx = Math.cos(ang) * speed;
      p.vy = Math.sin(ang) * speed;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // cruise-speed decay
      const base = this.baseSpeed();
      if (speed > base) {
        const target = Math.max(base, speed - 92 * dt);
        const k = target / speed;
        p.vx *= k;
        p.vy *= k;
      }

      p.charge = Math.max(0, p.charge - dt * 2.6);
      p.booster = Math.max(0, p.booster - dt * 0.9);
      p.rot += dt * 4.2;

      // walls bounce: they cost your streak, not your life
      const m = 8 * S;
      let bounced = 0;
      if (p.x < a.x + m) {
        p.x = a.x + m;
        p.vx = Math.abs(p.vx) * CFG.wallBounce;
        bounced = 1;
      } else if (p.x > a.x + a.w - m) {
        p.x = a.x + a.w - m;
        p.vx = -Math.abs(p.vx) * CFG.wallBounce;
        bounced = 1;
      }
      if (p.y < a.y + m) {
        p.y = a.y + m;
        p.vy = Math.abs(p.vy) * CFG.wallBounce;
        bounced = 1;
      } else if (p.y > a.y + a.h - m) {
        p.y = a.y + a.h - m;
        p.vy = -Math.abs(p.vy) * CFG.wallBounce;
        bounced = 1;
      }
      if (bounced) this.hitWall();

      if (!this.started) {
        // demo loop on the title screen
      }

      // travel score, accumulated in a float so small per-frame gains survive
      if (this.started && this.state === 'play') {
        this.travelAcc = (this.travelAcc || 0) + speed * dt * CFG.scoreTravel * this.mult() * 0.5;
        if (this.travelAcc >= 1) {
          const whole = Math.floor(this.travelAcc);
          this.travelAcc -= whole;
          this.score += whole;
        }
      }
    }

    // trail
    p.trail.push({ x: p.x, y: p.y, t: this.t });
    if (p.trail.length > 26) p.trail.shift();
    while (p.trail.length && this.t - p.trail[0].t > 0.34) p.trail.shift();

    if (this.state !== 'play' && this.state !== 'ready') return;

    // capture check while flying
    if (p.mode === 'fly') {
      if (p.lockT > 0) p.lockT -= dt;
      else {
        for (const s of this.stars) {
          if (s.dark > 0) continue;
          const d = dist(p.x, p.y, s.x, s.y);
          const grab = s.orbitR + 26 * S;
          if (d < grab) {
            if (p.hold) {
              this.capture(s);
              break;
            } else if (d < s.orbitR + 9 * S) {
              // grazed the star while not holding — small nudge + hint
              const nx = (p.x - s.x) / (d || 1);
              const ny = (p.y - s.y) / (d || 1);
              p.x = s.x + nx * (s.orbitR + 10 * S);
              p.y = s.y + ny * (s.orbitR + 10 * S);
            }
          }
        }
      }
    }

    if (this.state !== 'play' || !this.started) return;
  }

  /**
   * Simulate the next ~0.8s of flight for the aim guide. Uses the same
   * steering rule as the live update so the line never lies.
   */
  predictPath() {
    const p = this.player;
    if (p.mode !== 'fly') return null;
    const S = this.S;
    const a = this.arena;
    let x = p.x;
    let y = p.y;
    let ang = Math.atan2(p.vy, p.vx);
    let speed = Math.hypot(p.vx, p.vy);
    const pts = [{ x, y }];
    for (let i = 0; i < CFG.predSteps; i++) {
      // steer toward whichever star is nearest from the simulated point
      let tgt = null;
      let bd = Infinity;
      for (const s of this.stars) {
        if (s.dark > 0) continue;
        const d = dist(x, y, s.x, s.y);
        if (d < bd) {
          bd = d;
          tgt = s;
        }
      }
      if (tgt) {
        const want = Math.atan2(tgt.y - y, tgt.x - x);
        const d = angleDelta(ang, want);
        const near = clamp(bd / (tgt.orbitR + 190 * S), 0, 1);
        const grip = CFG.steerNear + (1 - CFG.steerNear) * easeOutCubic(near);
        ang += clamp(d, -1, 1) * CFG.steerRate * grip * CFG.predStride;
      }
      x += Math.cos(ang) * speed * CFG.predStride;
      y += Math.sin(ang) * speed * CFG.predStride;
      if (x < a.x + 4 || x > a.x + a.w - 4 || y < a.y + 4 || y > a.y + a.h - 4) break;
      pts.push({ x, y });
      // stop the guide once it would be captured
      for (const s of this.stars) {
        if (s.dark <= 0 && dist(x, y, s.x, s.y) < s.orbitR) {
          return { pts, landing: s };
        }
      }
    }
    return { pts, landing: null };
  }

  /**
   * Title-screen attract mode: a bot plays the real rules — hold, wait for the
   * gold arc, release. It uses the same physics, so what the menu shows is
   * literally the game.
   */
  updateDemo(dt) {
    const p = this.player;
    const S = this.S;
    this.demoT = (this.demoT || 0) + dt;
    this.demoHold = this.demoHold == null ? true : this.demoHold;

    if (p.mode === 'orbit' && p.star) {
      const s = p.star;
      p.orbitR += (s.orbitR - p.orbitR) * Math.min(1, dt * 8);
      p.theta += p.dir * ORBIT_OMEGA * dt;
      p.charge = Math.min(1, p.charge + dt / 0.82);
      p.x = s.x + Math.cos(p.theta) * p.orbitR;
      p.y = s.y + Math.sin(p.theta) * p.orbitR;
      p.rot += dt * 2.4 * p.dir;

      p.trail.push({ x: p.x, y: p.y, t: this.t });
      if (p.trail.length > 22) p.trail.shift();

      // the bot releases the instant it is centred on the arc
      if (this.inArc() && Math.abs(angleDelta(s.arcA, p.theta)) < s.arcW * 0.45) {
        this.demoLaunch();
      }
      if (s.fuel <= 0.02) this.demoLaunch();
      return;
    }

    // flying
    const speed = Math.hypot(p.vx, p.vy) || this.baseSpeed();
    let ang = Math.atan2(p.vy, p.vx);
    const tgt = this.nearestStar();
    if (tgt) {
      const want = Math.atan2(tgt.y - p.y, tgt.x - p.x);
      const d = angleDelta(ang, want);
      const near = clamp(dist(p.x, p.y, tgt.x, tgt.y) / (tgt.orbitR + 190 * S), 0, 1);
      const grip = CFG.steerNear + (1 - CFG.steerNear) * easeOutCubic(near);
      ang += clamp(d, -1, 1) * CFG.steerRate * grip * dt;
    }
    p.vx = Math.cos(ang) * speed;
    p.vy = Math.sin(ang) * speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += dt * 4.2;
    p.charge = Math.max(0, p.charge - dt * 2.6);
    p.booster = Math.max(0, p.booster - dt * 0.9);

    p.trail.push({ x: p.x, y: p.y, t: this.t });
    if (p.trail.length > 22) p.trail.shift();

    const a = this.arena;
    const m = 10 * S;
    if (p.x < a.x + m) { p.x = a.x + m; p.vx = Math.abs(p.vx); }
    if (p.x > a.x + a.w - m) { p.x = a.x + a.w - m; p.vx = -Math.abs(p.vx); }
    if (p.y < a.y + m) { p.y = a.y + m; p.vy = Math.abs(p.vy); }
    if (p.y > a.y + a.h - m) { p.y = a.y + a.h - m; p.vy = -Math.abs(p.vy); }

    for (const s of this.stars) {
      if (s.dark > 0) continue;
      if (dist(p.x, p.y, s.x, s.y) < s.orbitR + 22 * S) {
        this.demoCapture(s);
        break;
      }
    }
  }

  demoCapture(s) {
    const p = this.player;
    const theta = Math.atan2(p.y - s.y, p.x - s.x);
    const tang = p.vx * -Math.sin(theta) + p.vy * Math.cos(theta);
    p.mode = 'orbit';
    p.star = s;
    p.theta = theta;
    p.dir = tang >= 0 ? 1 : -1;
    p.orbitR = s.orbitR;
    p.charge = 0;
    p.vx = 0;
    p.vy = 0;
    s.glowPulse = 0;
    this.ring(s.x, s.y, s.orbitR, s.hue.mid, 0.4, 0.3);
    this.burst(p.x, p.y, 7, s.hue.mid, 0.45, 140);
  }

  demoLaunch() {
    const p = this.player;
    const s = p.star;
    if (!s) return;
    const perfect = Math.abs(angleDelta(s.arcA, p.theta)) < s.arcW;
    const tx = -Math.sin(p.theta) * p.dir;
    const ty = Math.cos(p.theta) * p.dir;
    const speed = this.baseSpeed() * (perfect ? 1.08 : 0.95);
    p.mode = 'fly';
    p.star = null;
    p.vx = tx * speed;
    p.vy = ty * speed;
    p.charge = 0;
    p.booster = perfect ? 1 : 0;
    p.lockT = 0.14;
    this.burst(p.x, p.y, perfect ? 14 : 7, perfect ? C.gold : s.hue.mid, perfect ? 0.6 : 0.4, perfect ? 240 : 140);
    this.ring(p.x, p.y, 14 * this.S, perfect ? C.goldHot : s.hue.mid, 0.55, perfect ? 56 * this.S : 28 * this.S);
  }

  nearestStar() {
    const p = this.player;
    let best = null;
    let bd = Infinity;
    for (const s of this.stars) {
      if (s.dark > 0) continue;
      const d = dist(p.x, p.y, s.x, s.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Flying into the frame is a bounce, not a death. It costs the multiplier. */
  hitWall() {
    const p = this.player;
    if (this.t - (this.lastWall || -9) < 0.42) return;
    this.lastWall = this.t;
    this.shake = Math.max(this.shake, 8);
    this.chroma = Math.min(1, this.chroma + 0.45);
    this.flash = Math.max(this.flash, 0.14);
    this.flashColor = C.rose;
    this.burst(p.x, p.y, 12, C.rose, 0.55, 210);
    this.ring(p.x, p.y, 14 * this.S, C.rose, 0.35, 52 * this.S, 0.34, 2);
    vibrate(22);
    if (this.streak > 0) {
      this.streak = 0;
      this.popups.push({
        x: p.x,
        y: p.y - 24 * this.S,
        text: '撞击 · 连击中断',
        color: C.rose,
        size: 13 * this.S,
        life: 0.9,
        maxLife: 0.9,
        vy: -40,
        style: 'word',
      });
    }
    Audio.sfx('die');
  }

  demoReset() {
    const s = this.stars[0];
    const p = this.player;
    p.mode = 'orbit';
    p.star = s;
    p.theta = 0;
    p.dir = 1;
    p.orbitR = s.orbitR;
    p.charge = rand(0.2, 0.9);
    p.trail.length = 0;
  }

  updateMotes(dt) {
    const p = this.player;
    const S = this.S;
    const magnet = (p.mode === 'fly' ? CFG.magnetRadius : CFG.magnetRadius * 0.6) * S * (1 + p.booster * 0.9);
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.t += dt;
      m.ph += dt * 1.9;
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d < magnet && d > 0.1) {
        const k = (1 - d / magnet) * 620 * dt;
        m.x += (dx / d) * k;
        m.y += (dy / d) * k;
      } else {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.vx *= 1 - dt * 0.9;
        m.vy *= 1 - dt * 0.9;
      }
      if (d < 15 * S + m.r * 0.4) {
        this.motes.splice(i, 1);
        this.motesTaken++;
        if (this.started) {
          const v = Math.round(CFG.scoreMote * this.mult());
          this.addScore(v, m.x, m.y, C.cyanHot, '+' + v);
        }
        this.burst(m.x, m.y, 5, C.cyan, 0.35, 110);
        Audio.sfx('collect', { step: Math.min(10, this.motesTaken % 6) });
      }
    }
    // keep populated — spaced out, so they read as scattered food and not a blob
    if (this.motes.length < 14) {
      const a = this.arena;
      const S = this.S;
      let guard = 0;
      while (this.motes.length < 18 && guard++ < 120) {
        const x = rand(a.x + 34 * S, a.x + a.w - 34 * S);
        const y = rand(a.y + 34 * S, a.y + a.h - 34 * S);
        let ok = true;
        for (const s of this.stars) {
          if (dist(x, y, s.x, s.y) < s.orbitR + 44 * S) {
            ok = false;
            break;
          }
        }
        if (ok) {
          for (const m of this.motes) {
            if (dist(x, y, m.x, m.y) < 62 * S) {
              ok = false;
              break;
            }
          }
        }
        if (ok) this.motes.push(this.makeMote(x, y));
      }
    }
  }

  updateShards(dt) {
    const p = this.player;
    const S = this.S;
    const want = this.state === 'play' ? this.targetShards() : 0;
    while (this.shards.length < want) {
      const a = this.arena;
      let guard = 0;
      while (guard++ < 40) {
        const x = rand(a.x + 50, a.x + a.w - 50);
        const y = rand(a.y + 50, a.y + a.h - 50);
        if (dist(x, y, p.x, p.y) < 190 * S) continue;
        let ok = true;
        for (const s of this.stars) if (dist(x, y, s.x, s.y) < s.orbitR + 70 * S) ok = false;
        for (const o of this.shards) if (dist(x, y, o.x, o.y) < 110 * S) ok = false;
        for (const m of this.motes) if (dist(x, y, m.x, m.y) < 26 * S) ok = false;
        if (!ok) continue;
        this.shards.push(this.makeShard(x, y));
        break;
      }
      if (guard >= 40) break;
    }
    while (this.shards.length > want) this.shards.pop();

    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.t += dt;
      s.rot += s.spin * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const a = this.arena;
      if (s.x < a.x + 30 * S || s.x > a.x + a.w - 30 * S) s.vx *= -1;
      if (s.y < a.y + 30 * S || s.y > a.y + a.h - 30 * S) s.vy *= -1;
      s.x = clamp(s.x, a.x + 30 * S, a.x + a.w - 30 * S);
      s.y = clamp(s.y, a.y + 30 * S, a.y + a.h - 30 * S);
      s.spawn = Math.min(1, s.spawn + dt * 3.2);

      if (this.state !== 'play') continue;

      const d = dist(p.x, p.y, s.x, s.y);
      if (d < s.r + 8 * S) {
        if (p.booster > 0.25) {
          // perfect-release shield ploughs through
          this.shards.splice(i, 1);
          this.burst(s.x, s.y, 16, C.rose, 0.8, 260);
          this.ring(s.x, s.y, 8, C.rose, 0.6, 60 * S, 0.4, 2);
          this.addScore(40 * this.mult(), s.x, s.y, C.mint, '+' + 40 * this.mult());
          this.shake = Math.max(this.shake, 5);
          Audio.sfx('near');
          vibrate(10);
          continue;
        }
        this.die('shard');
        return;
      }
      if (d < s.r + 46 * S) {
        if (!s.near) {
          s.near = true;
          if (p.mode === 'fly' && this.started) {
            this.addScore(15 * this.mult(), p.x, p.y - 18 * S, C.violet, 'CLOSE', 13);
            this.chroma = Math.min(1, this.chroma + 0.5);
            Audio.sfx('near');
          }
        }
      } else s.near = false;
    }
  }

  makeShard(x, y) {
    const S = this.S;
    const n = randInt(3, 4);
    const r = rand(13, 20) * S;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.18, 0.18);
      const rr = r * rand(0.72, 1.16);
      pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
    }
    return {
      x,
      y,
      vx: rand(-1, 1) * lerp(9, 30, this.difficulty()) * S,
      vy: rand(-1, 1) * lerp(9, 30, this.difficulty()) * S,
      r,
      pts,
      rot: rand(0, TAU),
      spin: rand(-0.9, 0.9),
      t: rand(0, 10),
      spawn: 0,
      near: false,
    };
  }

  updateEffects(dt, dtRaw) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt;
      if (q.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const dr = 1 - Math.min(0.95, q.drag * dt);
      q.vx *= dr;
      q.vy *= dr;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const k = 1 - r.life / r.maxLife;
      r.r = r.r0 + (r.toR - r.r0) * easeOutCubic(k);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.popups.splice(i, 1);
        continue;
      }
      p.y += p.vy * dt;
      p.vy *= 1 - dt * 1.6;
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.life -= dt;
      if (s.life <= 0) this.streaks.splice(i, 1);
    }
  }

  updatePulse(dt) {
    if (this.state !== 'play') return;
    this.pulseT -= dt;
    if (this.pulseT <= 0) {
      const d = this.difficulty();
      this.pulseT = lerp(CFG.pulseStart, CFG.pulseEnd, easeOutCubic(d));
      this.pulseGlow = 1;
      const list = this.stars.filter((s) => s.dark <= 0);
      if (list.length) {
        const s = pick(list);
        this.rings.push({
          x: this.arena.x + this.arena.w / 2,
          y: this.arena.y + this.arena.h / 2,
          r: 12,
          r0: 12,
          toR: Math.hypot(this.arena.w, this.arena.h) * 0.62,
          life: 1.1,
          maxLife: 1.1,
          color: C.cyanDim,
          alpha: 0.4,
          width: 1.6 * this.S,
        });
        for (const s2 of this.stars) s2.arcW = 1.75;
        Audio.sfx('streak');
      }
    }
    this.pulseGlow = Math.max(0, this.pulseGlow - dt * 2.4);
    // arcs relax back to normal width
    for (const s of this.stars) {
      if (s.arcW > 1.05) s.arcW = Math.max(1.05, s.arcW - dt * 1.5);
    }
  }

  die(reason) {
    if (this.state === 'dead') return;
    const p = this.player;
    this.frozen = true;
    this.state = 'dead';
    this.deathT = 0;
    this.deathCamera = 0;
    this.overShown = false;
    this.deathReason = reason;
    this.hitstop = 0.09;
    this.timeScale = 0.16;
    this.flash = 0.85;
    this.flashColor = C.rose;
    this.shake = 20;
    this.chroma = 1;
    this.burst(p.x, p.y, 46, C.rose, 1.2, 430);
    this.burst(p.x, p.y, 26, C.ivory, 1, 260);
    this.ring(p.x, p.y, 8, C.rose, 0.95, 200 * this.S, 0.75, 4);
    this.ring(p.x, p.y, 8, C.ivory, 0.8, 120 * this.S, 0.5, 2);
    Audio.sfx('die');
    Audio.setIntensity(0);
    vibrate(60);
    p.dead = true;
  }
}
