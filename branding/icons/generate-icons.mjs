#!/usr/bin/env node
/**
 * SakaKrib icon generator.
 *
 * Reads the original SVG sources in branding/icons/{source,android}, applies the colours in
 * branding/icons/brand.json, and writes Android + iOS assets to branding/icons/generated/.
 * Source SVGs are only ever read, never written.
 *
 * Run from the repository root:
 *   npm run generate:icons                     # generate into branding/icons/generated
 *   npm run generate:icons -- --sync           # also copy into android/ and ios/ if they exist
 *   npm run generate:icons -- --sync --patch-manifest
 *   node branding/icons/generate-icons.mjs --help
 */
import { readFile, writeFile, mkdir, cp, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GENERATED = path.join(HERE, 'generated');
const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  console.log(`SakaKrib icon generator
  --sync            copy generated assets into android/ and ios/ (only if those projects exist)
  --patch-manifest  with --sync: add default notification icon + colour meta-data to AndroidManifest.xml
  --no-previews     skip writing previews/*.png
  --help            show this help`);
  process.exit(0);
}

const fail = (msg) => { console.error(`\n[icons] ERROR: ${msg}\n`); process.exit(1); };
const log = (msg) => console.log(`[icons] ${msg}`);

// ---- dependency check ------------------------------------------------------------------------
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  fail("The 'sharp' package is not installed. From the repository root run:  npm install --save-dev sharp");
}

// ---- inputs ----------------------------------------------------------------------------------
const SOURCES = {
  mark: 'source/sakakrib-mark.svg',
  logoLight: 'source/sakakrib-logo-light.svg',
  logoDark: 'source/sakakrib-logo-dark.svg',
  fg: 'android/adaptive-icon-foreground.svg',
  bg: 'android/adaptive-icon-background.svg',
  notif: 'android/notification-icon.svg',
};

async function loadBrand() {
  const file = path.join(HERE, 'brand.json');
  if (!existsSync(file)) fail(`Missing ${path.relative(REPO, file)}.`);
  let brand;
  try { brand = JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { fail(`brand.json is not valid JSON: ${e.message}`); }
  for (const k of ['primary', 'accent', 'paper', 'notification']) {
    if (!/^#[0-9a-fA-F]{6}$/.test(brand[k] ?? '')) fail(`brand.json: "${k}" must be a 6-digit hex colour like #0C3B2E.`);
  }
  return brand;
}

const brand = await loadBrand();

async function loadSvg(key) {
  const file = path.join(HERE, SOURCES[key]);
  if (!existsSync(file)) fail(`Missing source SVG: ${path.relative(REPO, file)}`);
  const text = await readFile(file, 'utf8');
  if (!/<svg[\s>]/.test(text)) fail(`${path.relative(REPO, file)} does not look like an SVG.`);
  const css =
    `.fill-primary{fill:${brand.primary}}.fill-accent{fill:${brand.accent}}.fill-paper{fill:${brand.paper}}` +
    `.fill-white{fill:${brand.notification}}.stroke-primary{stroke:${brand.primary}}` +
    `.stroke-accent{stroke:${brand.accent}}.stroke-paper{stroke:${brand.paper}}.stroke-white{stroke:${brand.notification}}`;
  return text.replace('</svg>', `<style>${css}</style></svg>`); // later rule wins over the file's defaults
}

const svgs = {};
for (const key of Object.keys(SOURCES)) svgs[key] = await loadSvg(key);

// ---- helpers ---------------------------------------------------------------------------------
const PNG = { compressionLevel: 9, adaptiveFiltering: false, palette: false };

async function raster(svg, size) {
  // Render the SVG natively at the target size (vector-sharp, not a bitmap resize).
  const density = Math.max(72, Math.ceil((72 * size) / 1024) + 1);
  return sharp(Buffer.from(svg), { density }).resize(size, size, { fit: 'fill' }).png(PNG).toBuffer();
}
async function put(rel, buf) {
  const out = path.join(GENERATED, rel);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, buf);
  return out;
}
const maskSvg = (size, shape) =>
  Buffer.from(shape === 'round'
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#fff"/></svg>`);

/** Background layer + foreground layer, centre-cropped so the glyph fills `fill` of the tile. */
async function composedTile(size, fgScale) {
  const fgSize = Math.round(size * fgScale);
  const bg = await raster(svgs.bg, size);
  let fg = await raster(svgs.fg, fgSize);
  if (fgSize > size) {
    const off = Math.floor((fgSize - size) / 2);
    fg = await sharp(fg).extract({ left: off, top: off, width: size, height: size }).png(PNG).toBuffer();
  }
  return sharp(bg).composite([{ input: fg }]).png(PNG).toBuffer();
}

// ---- Android ---------------------------------------------------------------------------------
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const NOTIF_PX = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
const written = [];

async function androidAssets() {
  for (const [d, m] of Object.entries(DENSITIES)) {
    const fgPx = Math.round(108 * m);
    const legacy = Math.round(48 * m);
    const fg = await raster(svgs.fg, fgPx);
    written.push(await put(`android/res/mipmap-${d}/ic_launcher_foreground.png`, fg));

    // Monochrome layer for Android 13+ themed icons: same silhouette, alpha only.
    const mono = await sharp({ create: { width: fgPx, height: fgPx, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
      .composite([{ input: fg, blend: 'dest-in' }]).png(PNG).toBuffer();
    written.push(await put(`android/res/mipmap-${d}/ic_launcher_monochrome.png`, mono));

    // Legacy (pre-API 26) icons: full tile with the mask drawn in.
    for (const [name, shape, scale] of [['ic_launcher', 'square', 1.1], ['ic_launcher_round', 'round', 1.0]]) {
      const tile = await composedTile(legacy, scale);
      const masked = await sharp(tile).composite([{ input: maskSvg(legacy, shape), blend: 'dest-in' }]).png(PNG).toBuffer();
      written.push(await put(`android/res/mipmap-${d}/${name}.png`, masked));
    }

    // Notification small icon: white silhouette on transparent, drawn from its own SVG.
    written.push(await put(`android/res/drawable-${d}/ic_stat_sakakrib.png`, await raster(svgs.notif, NOTIF_PX[d])));
  }

  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
  written.push(await put('android/res/mipmap-anydpi-v26/ic_launcher.xml', Buffer.from(adaptive)));
  written.push(await put('android/res/mipmap-anydpi-v26/ic_launcher_round.xml', Buffer.from(adaptive)));
  written.push(await put('android/res/values/ic_launcher_background.xml', Buffer.from(
`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${brand.primary}</color>
</resources>
`)));
  written.push(await put('android/res/values/sakakrib_notification_color.xml', Buffer.from(
`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="sakakrib_notification_color">${brand.notificationAccent ?? brand.primary}</color>
</resources>
`)));
  written.push(await put('android/play-store/ic_launcher-playstore.png', await composedTile(512, 1.1)));
  written.push(await put('android/AndroidManifest-notification-snippet.txt', Buffer.from(
`<!-- Add inside <application> in android/app/src/main/AndroidManifest.xml (or run with --sync --patch-manifest). -->
<meta-data
    android:name="com.google.firebase.messaging.default_notification_icon"
    android:resource="@drawable/ic_stat_sakakrib" />
<meta-data
    android:name="com.google.firebase.messaging.default_notification_color"
    android:resource="@color/sakakrib_notification_color" />
`)));
}

// ---- iOS -------------------------------------------------------------------------------------
const LEGACY_IOS = [
  ['iphone', 20, 2], ['iphone', 20, 3], ['iphone', 29, 2], ['iphone', 29, 3],
  ['iphone', 40, 2], ['iphone', 40, 3], ['iphone', 60, 2], ['iphone', 60, 3],
  ['ipad', 20, 1], ['ipad', 20, 2], ['ipad', 29, 1], ['ipad', 29, 2],
  ['ipad', 40, 1], ['ipad', 40, 2], ['ipad', 76, 1], ['ipad', 76, 2], ['ipad', 83.5, 2],
];

/** Full-bleed, opaque 1024 icon. iOS applies the rounded-corner mask itself. */
async function ios1024() {
  const bg = await raster(svgs.bg, 1024);
  const big = 1260; // glyph fills ~65% of the tile
  const off = (big - 1024) / 2;
  const fg = await sharp(await raster(svgs.fg, big)).extract({ left: off, top: off, width: 1024, height: 1024 }).png(PNG).toBuffer();
  return sharp(bg).composite([{ input: fg }]).flatten({ background: brand.primary }).removeAlpha().png(PNG).toBuffer();
}

async function iosAssets() {
  const master = await ios1024();
  const dir = 'ios/AppIcon.appiconset';
  written.push(await put(`${dir}/AppIcon-512@2x.png`, master));
  written.push(await put(`${dir}/Contents.json`, Buffer.from(JSON.stringify({
    images: [{ filename: 'AppIcon-512@2x.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  }, null, 2) + '\n')));

  // Legacy multi-size catalogue for older Xcode versions.
  const ldir = 'ios/legacy/AppIcon.appiconset';
  const images = [];
  const done = new Set();
  for (const [idiom, size, scale] of LEGACY_IOS) {
    const px = Math.round(size * scale);
    const filename = `AppIcon-${px}.png`;
    if (!done.has(px)) {
      done.add(px);
      written.push(await put(`${ldir}/${filename}`,
        await sharp(master).resize(px, px, { kernel: 'lanczos3' }).flatten({ background: brand.primary }).removeAlpha().png(PNG).toBuffer()));
    }
    images.push({ filename, idiom, scale: `${scale}x`, size: `${size}x${size}` });
  }
  written.push(await put(`${ldir}/AppIcon-1024.png`, master));
  images.push({ filename: 'AppIcon-1024.png', idiom: 'ios-marketing', scale: '1x', size: '1024x1024' });
  written.push(await put(`${ldir}/Contents.json`, Buffer.from(JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2) + '\n')));
}

// ---- previews --------------------------------------------------------------------------------
async function previews() {
  const onto = async (name, svg, bgColor, w) => {
    const logo = await sharp(Buffer.from(svg), { density: 144 }).resize({ width: w }).png(PNG).toBuffer();
    const meta = await sharp(logo).metadata();
    const pad = 80;
    const out = await sharp({ create: { width: meta.width + pad * 2, height: meta.height + pad * 2, channels: 4, background: bgColor } })
      .composite([{ input: logo, left: pad, top: pad }]).png(PNG).toBuffer();
    written.push(await put(`../previews/${name}`, out));
  };
  await onto('logo-light.png', svgs.logoLight, '#FFFFFF', 1100);
  await onto('logo-dark.png', svgs.logoDark, brand.primary, 1100);

  const T = 300, gap = 50, W = 4 * T + 5 * gap, H = T + 2 * gap + 190;
  const tiles = [];
  const ios = await sharp(await ios1024()).resize(T, T).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}"><rect width="${T}" height="${T}" rx="${T * 0.2237}" fill="#fff"/></svg>`), blend: 'dest-in' }]).png(PNG).toBuffer();
  tiles.push(ios);
  for (const shape of ['round', 'square']) {
    const tile = await composedTile(T, 1.0);
    // Adaptive masks crop the 108dp canvas to the inner 72dp; emulate that by zooming 1.5x.
    const zoomed = await sharp(await composedTile(T * 1.5 | 0, 1.0)).extract({ left: (T * 0.25) | 0, top: (T * 0.25) | 0, width: T, height: T }).png(PNG).toBuffer();
    const masked = shape === 'round'
      ? await sharp(zoomed).composite([{ input: maskSvg(T, 'round'), blend: 'dest-in' }]).png(PNG).toBuffer()
      : await sharp(zoomed).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}"><rect width="${T}" height="${T}" rx="${T * 0.3}" fill="#fff"/></svg>`), blend: 'dest-in' }]).png(PNG).toBuffer();
    tiles.push(masked); void tile;
  }
  // Themed (monochrome) Android 13 icon.
  const fgBig = await raster(svgs.fg, (T * 1.5) | 0);
  const mono = await sharp({ create: { width: (T * 1.5) | 0, height: (T * 1.5) | 0, channels: 4, background: brand.primary } }).composite([{ input: fgBig, blend: 'dest-in' }]).png(PNG).toBuffer();
  const monoCrop = await sharp(mono).extract({ left: (T * 0.25) | 0, top: (T * 0.25) | 0, width: T, height: T }).png(PNG).toBuffer();
  const themed = await sharp({ create: { width: T, height: T, channels: 4, background: '#CFE3D6' } }).composite([{ input: monoCrop }]).png(PNG).toBuffer();
  tiles.push(await sharp(themed).composite([{ input: maskSvg(T, 'round'), blend: 'dest-in' }]).png(PNG).toBuffer());

  const comps = tiles.map((input, i) => ({ input, left: gap + i * (T + gap), top: gap }));
  // Notification sizes on a dark strip.
  const stripW = W - 2 * gap, stripH = 130;
  const strip = await sharp({ create: { width: stripW, height: stripH, channels: 4, background: '#303030' } }).png(PNG).toBuffer();
  const stripComps = [];
  let x = 30;
  for (const px of [96, 72, 48, 36, 24]) {
    stripComps.push({ input: await raster(svgs.notif, px), left: x, top: Math.round((stripH - px) / 2) });
    x += px + 40;
  }
  const stripImg = await sharp(strip).composite(stripComps).png(PNG).toBuffer();
  comps.push({ input: stripImg, left: gap, top: T + 2 * gap });
  const sheet = await sharp({ create: { width: W, height: H, channels: 4, background: '#EFEBE0' } }).composite(comps).png(PNG).toBuffer();
  written.push(await put('../previews/app-icons.png', sheet));
}

// ---- validation ------------------------------------------------------------------------------
async function validate() {
  const problems = [];
  const expectPng = async (rel, w, h) => {
    const p = path.join(GENERATED, rel);
    if (!existsSync(p)) return problems.push(`missing ${rel}`);
    const m = await sharp(p).metadata();
    if (m.width !== w || m.height !== h) problems.push(`${rel} is ${m.width}x${m.height}, expected ${w}x${h}`);
    return m;
  };
  for (const [d, m] of Object.entries(DENSITIES)) {
    const f = Math.round(108 * m), l = Math.round(48 * m);
    await expectPng(`android/res/mipmap-${d}/ic_launcher_foreground.png`, f, f);
    await expectPng(`android/res/mipmap-${d}/ic_launcher_monochrome.png`, f, f);
    await expectPng(`android/res/mipmap-${d}/ic_launcher.png`, l, l);
    await expectPng(`android/res/mipmap-${d}/ic_launcher_round.png`, l, l);
    const n = await expectPng(`android/res/drawable-${d}/ic_stat_sakakrib.png`, NOTIF_PX[d], NOTIF_PX[d]);
    if (n && !n.hasAlpha) problems.push(`notification icon ${d} has no alpha channel`);
  }
  const ios = await expectPng('ios/AppIcon.appiconset/AppIcon-512@2x.png', 1024, 1024);
  if (ios?.hasAlpha) problems.push('iOS 1024 icon must not have an alpha channel');
  for (const set of ['ios/AppIcon.appiconset', 'ios/legacy/AppIcon.appiconset']) {
    const contents = JSON.parse(await readFile(path.join(GENERATED, set, 'Contents.json'), 'utf8'));
    for (const img of contents.images) if (!existsSync(path.join(GENERATED, set, img.filename))) problems.push(`${set}/Contents.json references missing ${img.filename}`);
  }
  // Android XML references must resolve to generated resources.
  const xml = await readFile(path.join(GENERATED, 'android/res/mipmap-anydpi-v26/ic_launcher.xml'), 'utf8');
  for (const [, type, name] of xml.matchAll(/@(mipmap|color|drawable)\/([A-Za-z0-9_]+)/g)) {
    const ok = type === 'color'
      ? (await readFile(path.join(GENERATED, 'android/res/values/ic_launcher_background.xml'), 'utf8')).includes(`name="${name}"`)
      : existsSync(path.join(GENERATED, `android/res/${type}-xxxhdpi/${name}.png`));
    if (!ok) problems.push(`ic_launcher.xml references unresolved @${type}/${name}`);
  }
  if (problems.length) fail(`Validation failed:\n  - ${problems.join('\n  - ')}`);
  log('Validation passed: all expected PNGs exist with correct sizes, iOS has no alpha, Contents.json and adaptive XML resolve.');
}

// ---- optional sync into native projects ------------------------------------------------------
async function sync() {
  const androidRes = path.join(REPO, 'android', 'app', 'src', 'main', 'res');
  const androidMain = path.join(REPO, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (existsSync(androidRes)) {
    await cp(path.join(GENERATED, 'android', 'res'), androidRes, { recursive: true, force: true });
    log(`Copied Android resources into ${path.relative(REPO, androidRes)}`);
    if (args.has('--patch-manifest')) {
      let m = await readFile(androidMain, 'utf8');
      if (m.includes('default_notification_icon')) log('AndroidManifest.xml already declares a default notification icon; left unchanged.');
      else {
        const snippet = `\n        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_sakakrib" />\n        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/sakakrib_notification_color" />\n    `;
        if (!m.includes('</application>')) fail('AndroidManifest.xml has no </application>; cannot patch.');
        await writeFile(androidMain, m.replace('</application>', `${snippet}</application>`));
        log('Added default notification icon and colour meta-data to AndroidManifest.xml');
      }
    }
  } else log('No android/ project found; skipped Android sync (run `npx cap add android` first).');

  const iosSet = path.join(REPO, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
  if (existsSync(path.dirname(iosSet))) {
    await cp(path.join(GENERATED, 'ios', 'AppIcon.appiconset'), iosSet, { recursive: true, force: true });
    log(`Copied iOS AppIcon.appiconset into ${path.relative(REPO, iosSet)}`);
  } else log('No ios/ project found; skipped iOS sync (run `npx cap add ios` first).');
}

// ---- run -------------------------------------------------------------------------------------
await androidAssets();
await iosAssets();
if (!args.has('--no-previews')) await previews();
await validate();
if (args.has('--sync')) await sync();
log(`Done. ${written.length} files written under ${path.relative(REPO, GENERATED) || '.'} (previews in branding/icons/previews).`);
