// Render the platform share cards from the generated key art.
// WeChat / Douyin share cards want 5:4; the store cover is 2:3, so crop rather
// than squash. Also emits the small icons the listing forms ask for.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const src = path.resolve('assets/store');
const out = src;
await mkdir(out, { recursive: true });

const cover = path.join(src, 'cover.png');
const meta = await sharp(cover).metadata();
console.log('cover', meta.width, 'x', meta.height);

// 5:4 card, cropped around the comet's head (upper-middle third)
const cardW = 1000;
const cardH = 800;
await sharp(cover)
  .resize({ width: cardW, height: cardH, fit: 'cover', position: 'attention' })
  .png({ compressionLevel: 9 })
  .toFile(path.join(out, 'share.png'));

// 1:1 icon + 512 for listing
await sharp(path.join(src, 'icon.png'))
  .resize(512, 512, { fit: 'cover' })
  .png({ compressionLevel: 9 })
  .toFile(path.join(out, 'icon-512.png'));

// store screenshots strip is generated from the real game by tools/shoot.mjs

for (const f of ['share.png', 'icon-512.png']) {
  const m = await sharp(path.join(out, f)).metadata();
  console.log(f, m.width + 'x' + m.height);
}
