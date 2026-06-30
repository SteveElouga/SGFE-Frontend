import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logoPath = join(root, 'public', 'logo.svg');
const iconsDir = join(root, 'public', 'icons');
const sizes = [16, 32, 48, 72, 96, 128, 144, 152, 192, 384, 512];

await mkdir(iconsDir, { recursive: true });

const pngBuffers = new Map();

for (const size of sizes) {
  const buffer = await sharp(logoPath).resize(size, size).png().toBuffer();
  pngBuffers.set(size, buffer);
  const filename = `icon-${size}x${size}.png`;
  await writeFile(join(iconsDir, filename), buffer);
}

const faviconBuffer = await pngToIco([
  pngBuffers.get(16),
  pngBuffers.get(32),
  pngBuffers.get(48),
]);

await writeFile(join(root, 'public', 'favicon.ico'), faviconBuffer);
