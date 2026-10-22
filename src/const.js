// 星弧 STAR ARC — tuning constants. Everything the feel depends on lives here.
export const CFG = {
  // --- orbit ------------------------------------------------------------
  orbitOmega: 6.05, // rad/s, constant so release timing is predictable
  captureRadius: 96, // px you can grab a star from
  orbitMin: 46,
  orbitMax: 88,
  releasePause: 0.16, // star is uncapturable briefly after launch

  // --- flight -----------------------------------------------------------
  speedStart: 352,
  speedEnd: 548,
  speedRampSeconds: 110,
  steerRate: 2.55, // rad/s of gravitational turn toward the nearest star
  steerNear: 0.42, // steering weakens this close (avoids orbiting the target)
  wallBounce: 0.82,
  predSteps: 26,
  predStride: 0.028,

  // --- stars ------------------------------------------------------------
  starFuel: 3,
  starTargetStart: 4,
  starTargetEnd: 5,
  starLifeFade: 0.42,
  starRespawn: 0.5,

  // --- resonance pulse --------------------------------------------------
  pulseStart: 3.55,
  pulseEnd: 2.15,
  pulseRampSeconds: 100,
  pulseSpeed: 690,
  chargeWindow: 0.5, // seconds of "charged" after the ring touches you
  chargeMin: 0.12,

  // --- arena ------------------------------------------------------------
  insetStart: 0.062,
  insetEnd: 0.168,
  insetRampSeconds: 84,
  corner: 46,

  // --- scoring ----------------------------------------------------------
  scoreTravel: 0.045, // per px
  scoreMote: 12,
  scoreResonance: 62,
  chordMulStep: 0.5,
  chordCap: 14,
  surgeAt: [4, 7, 11, 15, 20, 26],
  surgeBonus: 240,

  // --- motes ------------------------------------------------------------
  moteRadius: 11,
  magnetRadius: 34,

  // --- camera -----------------------------------------------------------
  shakeMax: 22,
  slowmo: 0.055, // fraction of a second on big hits
};

export const HUE = {
  cyan: { core: '#D6FBFF', mid: '#8FE9EF', deep: '#2E7E8C' },
  gold: { core: '#FFF3D6', mid: '#F5CB7C', deep: '#9A5F1E' },
  violet: { core: '#E7DFFF', mid: '#A28CFA', deep: '#4B3A96' },
  rose: { core: '#FFE1E7', mid: '#FF5E7D', deep: '#8E2238' },
};
