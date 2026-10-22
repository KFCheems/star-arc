// 星弧 STAR ARC — procedural audio. No audio files: everything is synthesised,
// so the bundle stays tiny and the music can react to play.
import { createAudioContext } from './platform.js';
import { clamp, rand } from './utils.js';

const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic — always consonant
const ROOTS = [55, 58.27, 49, 65.41, 43.65]; // A1, Bb1, G1, C2, F1

const midiHz = (semi, root) => root * Math.pow(2, semi / 12);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.musicOn = true;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.convolver = null;
    this.delay = null;
    this.intensity = 0; // 0..1 drives the music
    this.step = 0;
    this.nextNoteTime = 0;
    this.bpm = 84;
    this.root = ROOTS[0];
    this.timer = null;
    this.started = false;
  }

  init() {
    if (this.ctx) return true;
    const ctx = createAudioContext();
    if (!ctx) return false;
    this.ctx = ctx;
    const A = ctx;

    const master = A.createGain();
    master.gain.value = 0.9;

    const comp = A.createDynamicsCompressor
      ? A.createDynamicsCompressor()
      : null;
    if (comp) {
      comp.threshold.value = -16;
      comp.knee.value = 24;
      comp.ratio.value = 3;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
    }

    const limit = A.createDynamicsCompressor
      ? A.createDynamicsCompressor()
      : null;
    if (limit) {
      limit.threshold.value = -3;
      limit.ratio.value = 20;
      limit.attack.value = 0.002;
      limit.release.value = 0.12;
    }

    // reverb from a generated impulse
    let wet = null;
    try {
      const conv = A.createConvolver();
      const len = Math.floor(A.sampleRate * 3.2);
      const buf = A.createBuffer(2, len, A.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.1) * (t < 0.01 ? t * 100 : 1);
        }
      }
      conv.buffer = buf;
      const wetGain = A.createGain();
      wetGain.gain.value = 0.34;
      conv.connect(wetGain);
      wet = wetGain;
      this.convolver = conv;
    } catch (e) {
      this.convolver = null;
    }

    const music = A.createGain();
    music.gain.value = 0.42;
    const sfx = A.createGain();
    sfx.gain.value = 0.68;

    master.connect(comp ? comp : A.destination);
    if (comp) comp.connect(limit ? limit : A.destination);
    if (limit) limit.connect(A.destination);

    music.connect(master);
    sfx.connect(master);
    if (wet) {
      music.connect(wet);
      sfx.connect(wet);
      wet.connect(master);
    } else if (comp) {
      // nothing extra: dry is fine
    }

    // ping-pong-ish delay for the arpeggio
    try {
      const dl = A.createDelay(1.0);
      dl.delayTime.value = 60 / this.bpm / 2;
      const fb = A.createGain();
      fb.gain.value = 0.28;
      const dlp = A.createBiquadFilter();
      dlp.type = 'lowpass';
      dlp.frequency.value = 2600;
      dl.connect(fb);
      fb.connect(dlp);
      dlp.connect(dl);
      const dlOut = A.createGain();
      dlOut.gain.value = 0.3;
      dl.connect(dlOut);
      dlOut.connect(master);
      if (wet) dlOut.connect(wet);
      this.delay = dl;
      this.delayIn = A.createGain();
      this.delayIn.gain.value = 1;
      this.delayIn.connect(dl);
    } catch (e) {
      this.delay = null;
    }

    this.master = master;
    this.musicGain = music;
    this.sfxGain = sfx;
    this.ready = true;
    return true;
  }

  resume() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended' && this.ctx.resume) {
      try {
        this.ctx.resume();
      } catch (e) {}
    }
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, t, 0.08);
  }

  // ------------------------------------------------------------- primitives
  tone({ freq = 440, freq2 = null, type = 'sine', dur = 0.3, gain = 0.3, attack = 0.005, decay = null, delay = 0, bus = 'sfx', pan = 0, detune = 0, slideCurve = 'exp' }) {
    if (!this.ready) return;
    const A = this.ctx;
    const t0 = A.currentTime + delay;
    const osc = A.createOscillator();
    const g = A.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (detune) osc.detune.setValueAtTime(detune, t0);
    if (freq2 != null) {
      if (slideCurve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t0 + dur);
      else osc.frequency.linearRampToValueAtTime(Math.max(20, freq2), t0 + dur);
    }
    const d = decay == null ? dur : decay;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.02, d));
    let node = osc;
    if (pan && A.createStereoPanner) {
      try {
        const p = A.createStereoPanner();
        p.pan.value = clamp(pan, -1, 1);
        osc.connect(p);
        node = p;
      } catch (e) {}
    }
    node.connect(g);
    g.connect(bus === 'music' ? this.musicGain : this.sfxGain);
    if (this.delay && bus === 'music') g.connect(this.delayIn);
    osc.start(t0);
    osc.stop(t0 + Math.max(dur, d) + 0.08);
  }

  noise({ dur = 0.25, gain = 0.2, type = 'bandpass', f0 = 900, f1 = null, q = 1.2, delay = 0, bus = 'sfx' }) {
    if (!this.ready) return;
    const A = this.ctx;
    const t0 = A.currentTime + delay;
    const len = Math.max(1, Math.floor(A.sampleRate * (dur + 0.05)));
    const buf = A.createBuffer(1, len, A.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = A.createBufferSource();
    src.buffer = buf;
    const f = A.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = A.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus === 'music' ? this.musicGain : this.sfxGain);
    src.start(t0);
  }

  // ------------------------------------------------------------- sfx
  sfx(name, opt = {}) {
    if (!this.ready || this.muted) return;
    switch (name) {
      case 'release': {
        const p = opt.power || 1;
        this.noise({ dur: 0.22 + 0.1 * p, gain: 0.13 * p, type: 'bandpass', f0: 500 + 350 * p, f1: 2600 + 1200 * p, q: 1.6 });
        this.tone({ freq: 320 * p, freq2: 660 * p, type: 'triangle', dur: 0.16, gain: 0.09, attack: 0.004 });
        break;
      }
      case 'collect': {
        const step = clamp(opt.step || 0, 0, 12);
        const semi = SCALE[step % 5] + 12 * Math.floor(step / 5);
        const f = midiHz(semi + 12, 220);
        this.tone({ freq: f, type: 'sine', dur: 0.4, gain: 0.16, attack: 0.003, bus: 'sfx' });
        this.tone({ freq: f * 2, type: 'sine', dur: 0.22, gain: 0.07, attack: 0.002 });
        this.tone({ freq: f * 3.01, type: 'triangle', dur: 0.12, gain: 0.032, attack: 0.002 });
        break;
      }
      case 'resonate': {
        const g = opt.grade || 0;
        const base = 440 * Math.pow(2, (g * 4) / 12);
        [1, 1.5, 2, 3].forEach((m, i) => {
          this.tone({ freq: base * m, type: 'sine', dur: 0.9 - i * 0.12, gain: 0.1 - i * 0.018, attack: 0.004, delay: i * 0.014 });
        });
        this.noise({ dur: 0.5, gain: 0.07, type: 'highpass', f0: 3200, q: 0.8 });
        break;
      }
      case 'streak': {
        this.tone({ freq: 880, freq2: 1760, type: 'sine', dur: 0.28, gain: 0.07, attack: 0.01 });
        break;
      }
      case 'die': {
        this.tone({ freq: 180, freq2: 42, type: 'sine', dur: 0.8, gain: 0.34, attack: 0.004 });
        this.tone({ freq: 90, freq2: 30, type: 'triangle', dur: 1.0, gain: 0.2, attack: 0.006 });
        this.noise({ dur: 0.7, gain: 0.16, type: 'lowpass', f0: 1800, f1: 180, q: 0.9 });
        break;
      }
      case 'near': {
        this.noise({ dur: 0.18, gain: 0.05, type: 'highpass', f0: 2600, q: 0.7 });
        break;
      }
      case 'ui': {
        this.tone({ freq: 620, freq2: 720, type: 'sine', dur: 0.1, gain: 0.07, attack: 0.003 });
        break;
      }
      case 'start': {
        this.tone({ freq: 180, freq2: 720, type: 'sine', dur: 0.55, gain: 0.11, attack: 0.02 });
        this.noise({ dur: 0.6, gain: 0.09, type: 'bandpass', f0: 400, f1: 4200, q: 0.7 });
        break;
      }
      case 'newbest': {
        [0, 4, 7, 12, 16].forEach((s, i) => {
          this.tone({ freq: midiHz(s, 330), type: 'triangle', dur: 0.5, gain: 0.1, attack: 0.004, delay: i * 0.07 });
        });
        break;
      }
      case 'launch': {
        this.noise({ dur: 0.3, gain: 0.06, type: 'bandpass', f0: 300, f1: 2200, q: 2.2 });
        break;
      }
    }
  }

  // ------------------------------------------------------------- music
  startMusic() {
    if (!this.ready || !this.musicOn) return;
    if (this.started) return;
    this.started = true;
    this.step = 0;
    this.root = ROOTS[(Math.random() * ROOTS.length) | 0];
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    this.pump();
    this.pad();
  }

  setIntensity(v) {
    this.intensity = clamp(v, 0, 1);
    this.bpm = 78 + this.intensity * 46;
    if (this.delay) {
      try {
        this.delay.delayTime.setTargetAtTime(60 / this.bpm / 2, this.ctx.currentTime, 0.3);
      } catch (e) {}
    }
  }

  pump() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 60);
  }

  /** Slow evolving pad — two detuned sines an octave apart plus a fifth. */
  pad() {
    if (!this.ready) return;
    const A = this.ctx;
    const make = (freq, det, gain) => {
      const osc = A.createOscillator();
      const g = A.createGain();
      const f = A.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 620;
      f.Q.value = 0.6;
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = det;
      g.gain.value = gain;
      osc.connect(f);
      f.connect(g);
      g.connect(this.musicGain);
      osc.start();
      return { osc, g, f };
    };
    const root = this.root / 2;
    this.padVoices = [
      make(root, -6, 0.055),
      make(root * 1.5, 5, 0.036),
      make(root * 1.005, 9, 0.03),
      make(root * 3, -3, 0.012),
    ];
    const lfo = A.createOscillator();
    const lfoG = A.createGain();
    lfo.frequency.value = 0.055;
    lfoG.gain.value = 190;
    const target = this.padVoices[0].f.frequency;
    lfo.connect(lfoG);
    if (target) lfoG.connect(target);
    lfo.start();
    this.padLfo = lfo;
  }

  schedule() {
    if (!this.ready || !this.musicOn) return;
    const A = this.ctx;
    const lookahead = 0.2;
    const spb = 60 / this.bpm;
    while (this.nextNoteTime < A.currentTime + lookahead) {
      this.playStep(this.step, this.nextNoteTime);
      const gate = spb / 2;
      this.nextNoteTime += gate;
      this.step++;
    }
  }

  playStep(i, t) {
    const A = this.ctx;
    const inten = this.intensity;
    // sparse when calm, busier as the run heats up
    const density = 0.22 + inten * 0.7;
    if (Math.random() > density) return;
    const bar = Math.floor(i / 16) % 4;
    const semi = SCALE[(Math.floor(Math.random() * SCALE.length) + bar) % SCALE.length];
    const octave = Math.random() < 0.3 - inten * 0.12 ? 2 : 1;
    const f = midiHz(semi + 12 * octave + 12, this.root * 2);
    const t0 = Math.max(t, A.currentTime + 0.01);
    const osc = A.createOscillator();
    const g = A.createGain();
    const flt = A.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 1400 + inten * 3200;
    osc.type = Math.random() < 0.5 ? 'sine' : 'triangle';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.035 + inten * 0.03, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    osc.connect(flt);
    flt.connect(g);
    g.connect(this.musicGain);
    if (this.delayIn) g.connect(this.delayIn);
    osc.start(t0);
    osc.stop(t0 + 1.3);

    // heartbeat on downbeats once it gets tense
    if (inten > 0.45 && i % 8 === 0) {
      this.tone({ freq: 92, freq2: 46, type: 'sine', dur: 0.34, gain: 0.1 + inten * 0.11, attack: 0.006, delay: Math.max(0, t0 - A.currentTime), bus: 'music' });
    }
  }

  setMusicOn(on) {
    this.musicOn = on;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(on ? 0.42 : 0, t, 0.15);
  }
}

export const Audio = new AudioEngine();
