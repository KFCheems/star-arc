// Produce the store screenshot set from real gameplay.
// Each shot is staged: drive the real game into the state we want, then capture.
// This is the same build players get, so nothing here can drift from the product.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8123/';
const out = path.resolve('store-shots');
await mkdir(out, { recursive: true });

const W = 390;
const H = 844;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text());
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1500);

const shot = async (n) => {
  await page.screenshot({ path: path.join(out, n + '.png') });
  console.log('  ' + n);
};

console.log('capturing store shots:');

// 1. title
await shot('01-title');

// 2. onboarding: player on the arc with the coach visible
await page.mouse.click(W / 2, H * 0.66);
await page.waitForTimeout(600);
await page.mouse.down();
await page.waitForTimeout(900);
await shot('02-teach');

// 3. perfect release, captured on the flash
for (let i = 0; i < 70; i++) {
  const near = await page.evaluate(() => {
    const w = window.__GAME__.world;
    return w.player.star ? w.inArc() : false;
  });
  if (near) break;
  await page.waitForTimeout(25);
}
await page.mouse.up();
await page.waitForTimeout(110);
await shot('03-perfect');
await page.waitForTimeout(1200);

// 4. mid-run flight with the guide line visible
await page.waitForTimeout(1500);
await shot('04-flight');

// 5. late game: shards on the field, high multiplier
await page.evaluate(() => {
  const w = window.__GAME__.world;
  w.runTime = 150;
  w.streak = 11;
  w.score = 42800;
  w.shards.length = 0;
  const spots = [
    [w.arena.x + w.arena.w * 0.26, w.arena.y + w.arena.h * 0.22],
    [w.arena.x + w.arena.w * 0.72, w.arena.y + w.arena.h * 0.34],
    [w.arena.x + w.arena.w * 0.4, w.arena.y + w.arena.h * 0.72],
    [w.arena.x + w.arena.w * 0.78, w.arena.y + w.arena.h * 0.82],
  ];
  for (const [x, y] of spots) {
    const s = w.makeShard(x, y);
    s.spawn = 1;
    w.shards.push(s);
  }
});
await page.mouse.down();
await page.waitForTimeout(500);
await page.mouse.up();
await page.waitForTimeout(1200);
await shot('05-late');

// 6. game over
await page.evaluate(() => {
  const w = window.__GAME__.world;
  w.peakStreak = 11;
  w.perfects = 64;
  w.motesTaken = 58;
  w.die('shard');
});
await page.waitForTimeout(3000);
await shot('06-over');

console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
await browser.close();
