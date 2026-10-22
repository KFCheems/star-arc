// Boot a real mini-game build inside a fake host and prove it runs.
// The point is to catch browser-only APIs (document, window, localStorage)
// leaking into the mini-game path, which would only show up on a real device.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const host = process.argv[2] || 'wechat';
const hostName = host;

const code = await readFile(`dist/${host}/game.js`, 'utf8');
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('CE: ' + m.text()); });


const result = await p.evaluate(async ({ code, hostName }) => {
  // A minimal but faithful wx host: real canvas from the DOM, everything else
  // stubbed. Enough to prove the mini-game code path has no browser-only deps.
  const real = document.createElement('canvas');
  real.width = 750; real.height = 1334;
  const result0 = {};
  const store = {};
  let rafCb = null;

  const wx = {
    createCanvas: () => {
      const c = document.createElement('canvas');
      c.width = 750; c.height = 1334;
      return c;
    },
    createWebAudioContext: undefined,   // force the silent-audio fallback
    createInnerAudioContext: undefined,
    getSystemInfoSync: () => ({
      windowWidth: 375, windowHeight: 667, screenWidth: 375, screenHeight: 667,
      pixelRatio: 2, statusBarHeight: 20,
      safeArea: { top: 20, bottom: 667, left: 0, right: 375, width: 375, height: 647 },
    }),
    onTouchStart: (fn) => { wx._start = fn; },
    onTouchEnd: (fn) => { wx._end = fn; },
    onTouchMove: () => {},
    onTouchCancel: () => {},
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = v; },
    setPreferredFramesPerSecond: () => {},
    setKeepScreenOn: () => {},
    vibrateShort: () => {},
    showShareMenu: () => {},
    onShareAppMessage: () => {},
    onHide: () => {},
    onShow: () => {},
    hideLoading: () => {},
    requestAnimationFrame: (fn) => { rafCb = fn; setTimeout(() => rafCb && rafCb(Date.now()), 16); },
  };
  globalThis[hostName === 'wechat' ? 'wx' : 'tt'] = wx;

  // eslint-disable-next-line no-new-func
  new Function(code)();

  // pump ~40 frames
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 20));

  const g = globalThis.__GAME__ || null;
  let scene = null;
  if (g) scene = g.ui.scene;

  // simulate a touch that starts the game
  const touch = (x, y) => ({
    touches: [{ identifier: 0, clientX: x, clientY: y }],
    changedTouches: [{ identifier: 0, clientX: x, clientY: y }],
  });
  let started = null;
  const touchStart = wx._start, touchEnd = wx._end;
  result0.touchRegistered = !!(touchStart && touchEnd);
  if (touchStart && touchEnd) {
    touchStart(touch(187, 445));
    await new Promise((r) => setTimeout(r, 40));
    touchEnd(touch(187, 445));
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 20));
    started = g ? { scene: g.ui.scene, state: g.world.state, world: !!g.world } : null;
  }
  return { booted: !!g, scene, started, hasCanvas: !!g, host: g && g.host, ...result0 };
}, { code, hostName });

const ok = result.booted && result.scene === 'title' && result.started && result.started.scene === 'play' && errs.length === 0;
console.log(host.padEnd(8), ok ? 'OK' : 'FAIL', JSON.stringify(result));
if (errs.length) console.log('  errors:', errs.slice(0, 6));
await b.close();
process.exit(ok ? 0 : 1);
