// 星弧 STAR ARC — one runtime, three hosts: WeChat mini game (wx), Douyin mini game (tt), browser.

const G = typeof globalThis !== 'undefined' ? globalThis : window;

export const HOST = (() => {
  if (typeof G.wx !== 'undefined' && G.wx && G.wx.createCanvas) return 'wechat';
  if (typeof G.tt !== 'undefined' && G.tt && G.tt.createCanvas) return 'douyin';
  return 'web';
})();

export const isMini = HOST !== 'web';
const api = () => (HOST === 'wechat' ? G.wx : HOST === 'douyin' ? G.tt : null);
const S = () => api();

let canvas = null;
let ctx = null;
let system = null;

export function getCanvas() {
  return canvas;
}
export function getCtx() {
  return ctx;
}

/** Screen info normalised across hosts. */
export function getSystem() {
  if (system) return system;
  if (isMini) {
    let info = {};
    try {
      info = S().getSystemInfoSync() || {};
    } catch (e) {
      info = {};
    }
    const sw = info.windowWidth || info.screenWidth || 375;
    const sh = info.windowHeight || info.screenHeight || 667;
    // Tablets and some foldables report a landscape-ish canvas. The game is
    // portrait, so we keep a vertical play field and centre it rather than
    // stretching everything wide.
    const MAX_AR = 0.72;
    let w = sw;
    let h = sh;
    let offX = 0;
    if (sw / sh > MAX_AR) {
      w = Math.round(sh * MAX_AR);
      offX = Math.round((sw - w) / 2);
    }
    const dpr = Math.min(info.pixelRatio || 2, 3);
    const safe = info.safeArea;
    system = {
      width: w,
      height: h,
      dpr,
      offX,
      // distance from the physical top/bottom of the screen to the safe area
      top: safe && safe.top != null ? safe.top : info.statusBarHeight || 0,
      bottom: safe && safe.bottom != null ? h - safe.bottom : 0,
    };
  } else {
    // Web: let the page letterbox us. The shell sets the wrapper size.
    const wrap = document.getElementById('wrap');
    const w = wrap ? wrap.clientWidth : Math.min(window.innerWidth, 720);
    const h = wrap ? wrap.clientHeight : window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    system = { width: w, height: h, dpr, top: 0, bottom: 0 };
  }
  return system;
}

/** Recompute geometry after an orientation change or resize. */
export function refreshSystem() {
  system = null;
  return getSystem();
}

export function initCanvas() {
  const sys = getSystem();
  const offX = sys.offX || 0;
  if (isMini) {
    canvas = S().createCanvas();
  } else {
    const el = document.getElementById('c');
    canvas = el || document.createElement('canvas');
    if (!el) document.body.appendChild(canvas);
  }
  canvas.width = Math.round((sys.width + offX * 2) * sys.dpr);
  canvas.height = Math.round(sys.height * sys.dpr);
  if (!isMini) {
    canvas.style.width = sys.width + offX * 2 + 'px';
    canvas.style.height = sys.height + 'px';
  }
  ctx = canvas.getContext('2d');
  // offX centres a portrait play field on a wide (tablet / foldable) screen
  ctx.setTransform(sys.dpr, 0, 0, sys.dpr, offX * sys.dpr, 0);
  return { canvas, ctx, sys };
}

/** Create a second offscreen canvas of the same host type. */
export function createOffscreen(w, h) {
  let c;
  if (isMini) c = S().createCanvas();
  else c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function setPreferredFPS(n) {
  if (HOST === 'wechat' && S().setPreferredFramesPerSecond) {
    try {
      S().setPreferredFramesPerSecond(n);
    } catch (e) {}
  }
}

export function keepAwake() {
  if (HOST === 'wechat' && S().setKeepScreenOn) {
    try {
      S().setKeepScreenOn({ keepScreenOn: true });
    } catch (e) {}
  } else if (HOST === 'douyin' && S().setKeepScreenOn) {
    try {
      S().setKeepScreenOn({ keepScreenOn: true });
    } catch (e) {}
  }
}

// ---------------------------------------------------------------- input
const pointers = new Map();
const listeners = { down: [], up: [], move: [], cancel: [] };
const emit = (k, p) => listeners[k].forEach((f) => f(p));

export function onPointer(kind, fn) {
  listeners[kind].push(fn);
}

export function primaryPointer() {
  let best = null;
  pointers.forEach((p) => {
    if (!best || p.id < best.id) best = p;
  });
  return best;
}

export function initInput() {
  const sys = getSystem();
  const norm = (t, id) => ({
    id: id == null ? 0 : id,
    x: (t.clientX != null ? t.clientX : t.x || 0),
    y: (t.clientY != null ? t.clientY : t.y || 0),
    nx: (t.clientX != null ? t.clientX : t.x || 0) / sys.width,
    ny: (t.clientY != null ? t.clientY : t.y || 0) / sys.height,
  });

  const down = (e) => {
    const list = e.touches || e.changedTouches || [e];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const p = norm(t, t.identifier != null ? t.identifier : i);
      pointers.set(p.id, p);
      emit('down', p);
    }
  };
  const move = (e) => {
    const list = e.touches || e.changedTouches || [e];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const id = t.identifier != null ? t.identifier : i;
      const prev = pointers.get(id);
      const p = norm(t, id);
      if (prev) {
        p.dx = p.x - prev.x;
        p.dy = p.y - prev.y;
      } else {
        p.dx = 0;
        p.dy = 0;
      }
      pointers.set(id, p);
      emit('move', p);
    }
  };
  const up = (e) => {
    const list = e.changedTouches || e.touches || [e];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const id = t.identifier != null ? t.identifier : i;
      const p = pointers.get(id) || norm(t, id);
      pointers.delete(id);
      emit('up', p);
    }
  };

  if (isMini) {
    S().onTouchStart(down);
    S().onTouchMove(move);
    S().onTouchEnd(up);
    if (S().onTouchCancel) S().onTouchCancel(up);
  } else {
    const el = canvas || document;
    const md = (e) => {
      const p = norm({ clientX: e.clientX, clientY: e.clientY }, 0);
      pointers.set(0, p);
      emit('down', p);
    };
    const mm = (e) => {
      const prev = pointers.get(0);
      const p = norm({ clientX: e.clientX, clientY: e.clientY }, 0);
      if (prev) {
        p.dx = p.x - prev.x;
        p.dy = p.y - prev.y;
      } else {
        p.dx = 0;
        p.dy = 0;
      }
      if (prev) {
        pointers.set(0, p);
        emit('move', p);
      }
    };
    const mu = (e) => {
      const p = pointers.get(0) || norm({ clientX: e.clientX, clientY: e.clientY }, 0);
      pointers.delete(0);
      emit('up', p);
    };
    el.addEventListener('mousedown', md);
    el.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    const ev = (fn, id) => (e) => {
      e.preventDefault();
      fn(e);
    };
    el.addEventListener('touchstart', ev(down), { passive: false });
    el.addEventListener('touchmove', ev(move), { passive: false });
    el.addEventListener('touchend', ev(up), { passive: false });
    el.addEventListener('touchcancel', ev(up), { passive: false });
    window.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        const p = { id: 99, x: sys.width / 2, y: sys.height / 2, nx: 0.5, ny: 0.5, key: e.key };
        if (e.key === ' ') {
          pointers.set(99, p);
          emit('down', p);
        } else emit('tapEnter', p);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') {
        pointers.delete(99);
        emit('up', { id: 99, x: sys.width / 2, y: sys.height / 2, nx: 0.5, ny: 0.5 });
      }
    });
  }
}

// ---------------------------------------------------------------- storage
const mem = {};
export function load(key, fallback) {
  try {
    let v;
    if (isMini) v = S().getStorageSync(key);
    else v = G.localStorage ? G.localStorage.getItem(key) : null;
    if (v === '' || v == null) return fallback;
    if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch (e) {
        return v;
      }
    }
    return v;
  } catch (e) {
    return key in mem ? mem[key] : fallback;
  }
}

export function save(key, value) {
  mem[key] = value;
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    if (isMini) S().setStorageSync(key, s);
    else if (G.localStorage) G.localStorage.setItem(key, s);
  } catch (e) {}
}

// ---------------------------------------------------------------- social
export function vibrate(ms = 12) {
  try {
    if (HOST === 'wechat' && S().vibrateShort) S().vibrateShort({ type: ms > 20 ? 'heavy' : 'light' });
    else if (HOST === 'douyin' && S().vibrateShort) S().vibrateShort({});
    else if (!isMini && G.navigator && G.navigator.vibrate) G.navigator.vibrate(ms);
  } catch (e) {}
}

export function share(title, imageUrl) {
  const payload = { title, imageUrl };
  try {
    if (isMini && S().shareAppMessage) {
      S().shareAppMessage(payload);
      return true;
    }
  } catch (e) {}
  return false;
}

/** Register the native "share from menu" handler. */
export function bindShare(getPayload) {
  if (!isMini) return;
  try {
    if (S().showShareMenu) {
      S().showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline'],
      });
    }
    if (S().onShareAppMessage) {
      S().onShareAppMessage(() => {
        const p = getPayload();
        return { title: p.title, imageUrl: p.imageUrl, query: p.query || '' };
      });
    }
  } catch (e) {}
}

export function hideLoading() {
  try {
    if (isMini && S().hideLoading) S().hideLoading();
  } catch (e) {}
}

export function toast(title) {
  try {
    if (isMini && S().showToast) S().showToast({ title, icon: 'none', duration: 1200 });
  } catch (e) {}
}

/** Audio context when the host can give us WebAudio; otherwise null. */
export function createAudioContext() {
  try {
    if (isMini && S().createWebAudioContext) return S().createWebAudioContext();
    if (!isMini) {
      const AC = G.AudioContext || G.webkitAudioContext;
      if (AC) return new AC();
    }
  } catch (e) {}
  return null;
}

/** InnerAudioContext for asset fallback / looping beds. */
export function createInnerAudio() {
  try {
    if (isMini && S().createInnerAudioContext) {
      const a = S().createInnerAudioContext();
      return a;
    }
  } catch (e) {}
  return null;
}

export const now = () =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
