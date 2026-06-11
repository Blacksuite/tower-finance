// Renders the Tower Finance app icon (a simple tower glyph) to the PNG sizes
// required by the web app manifest. Output is gitignored; runs as part of `npm run build`.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src/client/public/icons');
mkdirSync(outDir, { recursive: true });

// inset: extra padding for maskable icons (safe zone is the inner 80%)
function towerSvg(size, inset = 0) {
  const s = size;
  const pad = inset * s;
  const u = (s - 2 * pad) / 24; // 24-unit grid inside the safe area
  const x = (n) => pad + n * u;
  // A stepped tower of three blocks in the semantic colors, on the dark surface.
  return Buffer.from(`<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${s}" height="${s}" rx="${s * 0.22}" fill="#0A0A0B"/>
  <rect x="${x(9)}" y="${x(4)}" width="${6 * u}" height="${5 * u}" rx="${u * 0.8}" fill="#10B981"/>
  <rect x="${x(7.5)}" y="${x(10)}" width="${9 * u}" height="${4.5 * u}" rx="${u * 0.8}" fill="#3B82F6"/>
  <rect x="${x(6)}" y="${x(15.5)}" width="${12 * u}" height="${4.5 * u}" rx="${u * 0.8}" fill="#8B5CF6"/>
</svg>`);
}

await sharp(towerSvg(192)).png().toFile(join(outDir, 'icon-192.png'));
await sharp(towerSvg(512)).png().toFile(join(outDir, 'icon-512.png'));
await sharp(towerSvg(512, 0.1)).png().toFile(join(outDir, 'icon-512-maskable.png'));
await sharp(towerSvg(180)).png().toFile(join(outDir, 'apple-touch-icon.png'));
console.log('icons ok →', outDir);
