// 星弧 STAR ARC — main loop.
import { initCanvas, initInput, onPointer, getSystem, setPreferredFPS, keepAwake, bindShare, isMini, hideLoading, primaryPointer, now, HOST } from './platform.js';
import { World } from './world.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { clamp } from './utils.js';
import { C } from './palette.js';
import { fmtScore } from './utils.js';

export function boot() {
  const { canvas, ctx, sys } = initCanvas();
  initInput();
  setPreferredFPS(60);
  keepAwake();

  const world = new World(sys);
  const renderer = new Renderer(sys);
  const ui = new UI(sys, world, renderer);

  world.onOver = () => ui.onDead();
  Audio.setMuted(ui.muted);

  bindShare(() => {
    const s = Math.floor(world.score);
    return {
      title: `我在《星弧》拿到了 ${fmtScore(s)} 分，你能超过我吗？`,
      imageUrl: 'share.png',
      query: '',
    };
  });

  // pointer routing: UI first, world second
  onPointer('down', (p) => {
    ui.pointerDown(p);
  });
  onPointer('up', (p) => {
    ui.pointerUp(p);
  });

  // resume audio on any interaction (iOS/WeChat require a gesture)
  const unlock = () => {
    Audio.init();
    Audio.setMuted(ui.muted);
    if (Audio.musicOn) Audio.startMusic();
    Audio.resume();
  };
  onPointer('down', unlock);

  // pause on hide
  let paused = false;
  const doPause = () => {
    if (ui.scene === 'play') {
      ui.pauseRun();
      paused = true;
    }
  };


  if (isMini) {
    try {
      const api = typeof wx !== 'undefined' && wx.createCanvas ? wx : tt;
      api.onHide && api.onHide(doPause);
      api.onShow && api.onShow(() => {
        Audio.resume();
        if (paused) {
          paused = false;
          world.paused = false;
          ui.setScene('play');
        }
      });
    } catch (e) {}
  } else {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) doPause();
    });
    window.addEventListener('blur', doPause);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onPointer('down', () => {
    if (paused && ui.scene !== 'paused') paused = false;
  });

  hideLoading();

  let last = now();
  let acc = 0;
  let frames = 0;
  let fpsT = 0;
  let fps = 60;
  const debug = /[?&]debug/.test(typeof location !== 'undefined' ? location.search : '');

  function frame() {
    const t = now();
    let dt = (t - last) / 1000;
    last = t;
    if (!isFinite(dt)) dt = 0.016;
    // clamp: a background tab must not teleport the simulation
    dt = clamp(dt, 0, 1 / 20);

    ui.update(dt);
    world.update(dt);
    renderer.beginFrame(ctx);

    // camera shake offset, applied to the world layer only
    const camX = world.shakeX;
    const camY = world.shakeY;

    // clear
    // clear everything (including the letterbox gutters) in device space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#04030C';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(sys.dpr, 0, 0, sys.dpr, (sys.offX || 0) * sys.dpr, 0);

    // death zoom: pull the camera back slightly
    let zoom = 1;
    if (world.state === 'dead') {
      const k = clamp(world.deathT * 1.3, 0, 1);
      zoom = 1 - 0.045 * (1 - Math.exp(-k * 2));
    }

    ctx.save();
    if (zoom !== 1) {
      ctx.translate(sys.width / 2, sys.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-sys.width / 2, -sys.height / 2);
    }
    ctx.translate(camX, camY);

    renderer.drawBackground(world.t, { x: camX, y: camY });
    renderer.drawArenaFrame(world, world.t);
    renderer.drawMotes(world, world.t);
    renderer.drawEffects(world);
    renderer.drawStars(world, world.t);
    renderer.drawShards(world, world.t);
    renderer.drawGuide(world, world.t);
    renderer.drawPlayer(world, world.t);
    renderer.drawPopups(world, world.t);
    ctx.restore();

    renderer.drawPost(world, world.t);

    // UI on top, unshaken
    ui.draw(ctx, world.t);

    if (debug) {
      frames++;
      fpsT += dt;
      if (fpsT > 0.5) {
        fps = Math.round(frames / fpsT);
        frames = 0;
        fpsT = 0;
      }
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(6, 6, 132, 54);
      ctx.fillStyle = '#9CF7C4';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`fps ${fps}`, 12, 10);
      ctx.fillText(`stars ${world.stars.length} shards ${world.shards.length}`, 12, 24);
      ctx.fillText(`parts ${world.particles.length} rings ${world.rings.length}`, 12, 38);
      ctx.restore();
    }

    requestFrame(frame);
  }

  function requestFrame(fn) {
    if (isMini) {
      const api = typeof wx !== 'undefined' && wx.createCanvas ? wx : tt;
      api.requestAnimationFrame(fn);
    } else {
      requestAnimationFrame(fn);
    }
  }

  requestAnimationFrame(frame);

  const api = { world, renderer, ui, sys, ctx, audio: Audio, host: HOST, isMini };
  if (typeof window !== 'undefined') window.__GAME__ = api;
  return api;
}

boot();
