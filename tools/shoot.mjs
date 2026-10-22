// Playwright driver: drives the game with a real pointer, captures screenshots,
// and reports console errors. Used to verify the build before each push.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8123/';
const out = path.resolve('shots');
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);

const shot = async (name) => {
  await page.screenshot({ path: path.join(out, name + '.png') });
  console.log('shot', name);
};

const state = async () => page.evaluate(() => {
  const g = window.__GAME__;
  if (!g) return null;
  const { world, ui } = g;
  return {
    scene: ui.scene,
    state: world.state,
    stars: world.stars.length,
    shards: world.shards.length,
    mode: world.player.mode,
    score: Math.round(world.score),
    score2: Math.round(world.displayScore),
    streak: world.streak,
    mult: world.mult(),
    x: Math.round(world.player.x),
    y: Math.round(world.player.y),
    particles: world.particles.length,
    inArc: world.player.star ? world.inArc() : false,
    fuel: world.player.star ? +world.player.star.fuel.toFixed(2) : null,
    runTime: +world.runTime.toFixed(1),
    perf: world.perfects,
  };
});

await shot('01-title');
console.log('title', await state());

// start the run
await page.mouse.click(195, 560);
await page.waitForTimeout(500);
await shot('02-play-start');
console.log('play', await state());

// Simulate a competent player: hold until in-arc, then release toward a star.
const results = [];
for (let i = 0; i < 26; i++) {
  const s = await state();
  if (!s || s.state === 'dead') {
    results.push({ i, dead: true, scene: s && s.scene });
    break;
  }
  // hold
  await page.mouse.down();
  await page.waitForTimeout(90);
  const s2 = await state();
  if (s2.mode === 'orbit') {
    // wait until the resonance arc lines up, then let go
    let waited = 0;
    while (waited < 2400) {
      const s3 = await state();
      if (!s3 || s3.state === 'dead' || s3.mode !== 'orbit') break;
      if (s3.inArc) break;
      await page.waitForTimeout(40);
      waited += 40;
    }
  }
  await page.mouse.up();
  await page.waitForTimeout(360);
  const s4 = await state();
  results.push({ i, mode: s4.mode, streak: s4.streak, score: s4.score, shards: s4.shards });
  if (i === 3) await shot('03-playing');
}

await page.waitForTimeout(2500);
await shot('04-later');
console.log('later', await state());
console.log('turns', JSON.stringify(results.slice(0, 10)));

// force a death to capture the game over screen
await page.evaluate(() => {
  const w = window.__GAME__.world;
  if (w.state === 'play') w.die('test');
});
await page.waitForTimeout(2600);
await shot('05-over');
console.log('over', await state());

// title again
await page.mouse.click(195, 705);
await page.waitForTimeout(900);
await shot('06-title-back');

console.log('ERRORS:', errors.length ? errors.slice(0, 12) : 'none');
await browser.close();
