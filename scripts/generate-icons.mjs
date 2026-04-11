/**
 * Generates PWA PNG icons from camperflow-logo.png using sharp.
 * Run: node scripts/generate-icons.mjs
 * Outputs: public/icons/icon-192.png, icon-512.png, apple-touch-icon.png
 *
 * Pipeline per icon size:
 *   1. Load logo (1024×1024 RGB, white bg, coloured CF mark)
 *   2. Remove white background → transparent
 *   3. Recolour all non-transparent pixels to white (#fff)
 *      → clean white CF silhouette (Stripe/Linear style)
 *   4. Scale silhouette to 70% of target canvas (generous padding)
 *   5. Composite centred on #2563EB deep-blue square canvas
 *   6. Write PNG
 */

import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = resolve('C:/Users/kevjm/Desktop/camperflow-logo.png');
const OUT_DIR   = resolve(__dirname, '../public/icons');

// Background colour — #2563EB
const BG = { r: 37, g: 99, b: 235 };

// White-threshold: pixels with all channels ≥ this are treated as background
const WHITE_THRESH = 230;

/**
 * Process raw RGBA pixels:
 *  - near-white  → fully transparent
 *  - everything else → solid white  (CF silhouette for icon use)
 */
function processPixels(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r >= WHITE_THRESH && g >= WHITE_THRESH && b >= WHITE_THRESH) {
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = 0;          // transparent
    } else {
      data[i] = data[i + 1] = data[i + 2] = 255;   // white
      data[i + 3] = 255;        // opaque
    }
  }
  return data;
}

async function generateIcon(targetSize) {
  // 1. Load source logo as raw RGBA
  const { data, info } = await sharp(LOGO_PATH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2. Remove white bg + recolour mark to white
  const processed = processPixels(Buffer.from(data));

  // 3. Reconstruct as PNG from processed raw pixels
  const silhouette = await sharp(processed, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .png()
    .toBuffer();

  // 4. Scale silhouette to 70% of target canvas (keeps generous padding)
  const logoSize = Math.round(targetSize * 0.70);
  const scaledLogo = await sharp(silhouette)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // 5. Create blue background, composite logo centred
  const offset = Math.round((targetSize - logoSize) / 2);
  const finalPng = await sharp({
    create: {
      width:    targetSize,
      height:   targetSize,
      channels: 4,
      background: { ...BG, alpha: 255 }
    }
  })
    .composite([{ input: scaledLogo, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return finalPng;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const sizes = [
    { name: 'icon-192.png',         size: 192 },
    { name: 'icon-512.png',         size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  for (const { name, size } of sizes) {
    const buf = await generateIcon(size);
    const outPath = `${OUT_DIR}/${name}`;
    require('fs').writeFileSync(outPath, buf);
    console.log(`✓ public/icons/${name}  (${size}×${size}, ${buf.length} bytes)`);
  }

  console.log('Done.');
}

// sharp is a CJS module; use createRequire for writeFileSync workaround
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

main().catch(err => { console.error(err); process.exit(1); });
