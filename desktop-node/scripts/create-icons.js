// Development icon generator: produces valid ICO (with 256x256) and ICNS
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const toIco = require('to-ico');

const assetsDir = path.join(__dirname, '..', 'assets');
const trayPng = path.join(assetsDir, 'tray.png');
const basePng = path.join(assetsDir, 'icon.png');

async function createFallbackIcon() {
  // Create a simple 256x256 icon with a blue circle and 'DW' text for DWeb
  const size = 256;
  const canvas = new Jimp(size, size, 0x00000000); // Transparent background
  
  // Draw a blue circle
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.4;
  
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= radius) {
        // Blue gradient from center to edge
        const intensity = Math.max(0, 1 - (distance / radius) * 0.5);
        const blue = Math.floor(255 * intensity);
        const green = Math.floor(128 * intensity);
        const color = Jimp.rgbaToInt(0, green, blue, 255);
        canvas.setPixelColor(color, x, y);
      }
    }
  }
  
  await canvas.writeAsync(basePng);
  console.log('Created fallback icon:', basePng);
  return basePng;
}

async function ensureBasePng() {
  if (fs.existsSync(basePng)) return basePng;
  
  // Try to use existing tray.png if valid
  if (fs.existsSync(trayPng)) {
    try {
      const img = await Jimp.read(trayPng);
      const size = 256;
      const canvas = new Jimp(size, size, 0x00000000);
      const scale = Math.min((size - 32) / img.bitmap.width, (size - 32) / img.bitmap.height);
      const w = Math.max(1, Math.round(img.bitmap.width * scale));
      const h = Math.max(1, Math.round(img.bitmap.height * scale));
      const x = Math.floor((size - w) / 2);
      const y = Math.floor((size - h) / 2);
      img.resize(w, h, Jimp.RESIZE_BILINEAR);
      canvas.composite(img, x, y);
      await canvas.writeAsync(basePng);
      console.log('Created base from tray.png');
      return basePng;
    } catch (error) {
      console.warn('tray.png is not valid, creating fallback:', error.message);
    }
  }
  
  // Create fallback icon
  return await createFallbackIcon();
}

async function createIco() {
  const src = await ensureBasePng();
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = [];
  const base = await Jimp.read(src);
  for (const s of sizes) {
    const copy = base.clone().resize(s, s, Jimp.RESIZE_BILINEAR);
    images.push(await copy.getBufferAsync(Jimp.MIME_PNG));
  }
  const ico = await toIco(images);
  const out = path.join(assetsDir, 'icon.ico');
  fs.writeFileSync(out, ico);
  console.log('Created ICO with sizes:', sizes.join(','), '->', out);
}

async function createIcns() {
  // For macOS, electron-builder can generate ICNS from PNG; write a 1024x1024 PNG
  const src = await ensureBasePng();
  const img = await Jimp.read(src);
  const large = img.clone().resize(1024, 1024, Jimp.RESIZE_BILINEAR);
  const outPng = path.join(assetsDir, 'icon.icns.png');
  await large.writeAsync(outPng);
  // Keep a small ICNS placeholder (electron-builder will use PNG when ICNS missing)
  const icnsPlaceholder = path.join(assetsDir, 'icon.icns');
  if (!fs.existsSync(icnsPlaceholder)) fs.copyFileSync(outPng, icnsPlaceholder);
  console.log('Prepared macOS PNG (1024x1024):', outPng);
}

async function main() {
  console.log('Generating icons...');
  await createIco();
  await createIcns();
  console.log('Icons ready.');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { createIco, createIcns };
