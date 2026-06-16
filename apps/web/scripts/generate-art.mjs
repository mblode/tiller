// Pixel-art asset generator for the Tiller sailing game.
//
// Uses Gemini image generation for the hero sprites, then post-processes each
// into a crisp, limited-palette pixel sprite with sharp (chroma-key the flat
// magenta background to transparency, trim, downscale, quantise the palette).
//
// Usage:  GEMINI_API_KEY=... node scripts/generate-art.mjs [name...]
// Output: apps/web/public/sprites/*.png
//
// The API key is read from the environment only — never hardcode or commit it.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Set GEMINI_API_KEY in the environment first.");
  process.exit(1);
}
const MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const OUT_DIR = join(import.meta.dirname, "..", "public", "sprites");

// Shared style so every sprite reads as one cohesive set.
const STYLE =
  "16-bit SNES-era pixel art, clean limited palette, bold dark outline, soft cel shading, " +
  "no gradients, no text, crisp pixels, single subject centred with a little margin";
const CHROMA =
  "on a completely flat solid pure magenta background, RGB 255 0 255, no shadow, no gradient on the background";

/** @type {Array<{name:string,prompt:string,key:boolean,height?:number,width?:number,colours:number}>} */
const ASSETS = [
  {
    name: "hull",
    key: true,
    // Models reliably draw the boat lengthwise (bow-left); we size by length
    // then rotate 90° clockwise so the bow points UP (heading-0 convention).
    width: 150,
    rotateCW: 90,
    colours: 24,
    prompt: `Top-down bird's-eye view of a small single-handed sailing dinghy hull (like a Laser/Optimist) lying HORIZONTALLY with the pointed BOW on the LEFT and the flat STERN on the RIGHT, ${STYLE}. Cream-and-white hull with a wooden deck and gunwale, a small round mast hole near the bow third, a centreboard slot, and a short rudder + tiller arm off the stern. NO sail, NO mast pole, NO water. ${CHROMA}.`,
  },
  {
    colours: 16,
    height: 56,
    key: true,
    name: "buoy",
    prompt: `Top-down bird's-eye view of a single round inflatable racing mark buoy, ${STYLE}. Bright safety-orange sphere with a darker orange top band and a tiny white specular highlight, slightly tapered top. No water, no pole. ${CHROMA}.`,
  },
  {
    colours: 28,
    height: 256,
    key: false,
    name: "water",
    prompt:
      "Seamless tileable top-down deep-ocean water texture, retro 16-bit pixel art. Rich navy-to-ocean-blue palette (deep indigo, royal blue, ocean blue, a few brighter cyan glints) with DENSE fine 1-2px dithered ripple speckles and subtle larger lighter/darker tonal patches for a sense of depth and current. Evenly distributed so it tiles edge-to-edge with NO seams, no horizon, no objects, no foam lines, no boats. Flat overhead view, fills the whole frame, crisp pixels.",
    width: 256,
  },
  {
    colours: 32,
    key: false,
    name: "title",
    prompt: `A charming pixel-art scene for a sailing game title screen, ${STYLE} but a full illustrated scene (background allowed). A small white sailing dinghy with one triangular white mainsail, heeling slightly, cutting across sparkling blue water on a sunny day, seen from a low 3/4 bird's-eye angle. A few gulls, soft clouds, a hint of distant green shore. Warm, inviting, retro game-box art. No text.`,
    width: 720,
  },
];

async function generate(asset) {
  const body = {
    contents: [{ parts: [{ text: asset.prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
  const res = await fetch(ENDPOINT, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "X-goog-api-key": API_KEY },
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(
      `${asset.name}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`
    );
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData)?.inlineData?.data;
  if (!img) {
    throw new Error(
      `${asset.name}: no image in response (${JSON.stringify(parts).slice(0, 200)})`
    );
  }
  return Buffer.from(img, "base64");
}

// Replace flat magenta background pixels with transparency.
async function chromaKey(buf) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    // magenta: high red + high blue, low green
    const isMagenta = r > 140 && b > 120 && g < 120 && r - g > 55 && b - g > 35;
    if (isMagenta) {
      data[o + 3] = 0;
    }
  }
  return sharp(data, {
    raw: { channels: 4, height: info.height, width: info.width },
  }).png();
}

// Binarise alpha so edges are hard (no semi-transparent fringe after downscale).
async function hardenAlpha(buf) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    data[o + 3] = data[o + 3] < 128 ? 0 : 255;
  }
  return sharp(data, {
    raw: { channels: 4, height: info.height, width: info.width },
  }).png();
}

async function toSprite(asset, raw) {
  let img = sharp(raw);
  if (asset.key) {
    const keyed = await (await chromaKey(raw)).toBuffer();
    // trim the transparent border, then downscale to the pixel-art target
    let pipe = sharp(keyed).trim({ threshold: 10 }).resize({
      fit: "inside",
      height: asset.height,
      kernel: "lanczos3",
      width: asset.width,
      withoutEnlargement: true,
    });
    if (asset.rotateCW) {
      pipe = pipe.rotate(asset.rotateCW); // sharp rotates clockwise
    }
    img = await hardenAlpha(await pipe.toBuffer());
  } else {
    img = img.resize({
      fit: asset.name === "water" ? "cover" : "inside",
      height: asset.height,
      kernel: "lanczos3",
      width: asset.width,
    });
  }
  return img
    .png({ colours: asset.colours, dither: 0.4, palette: true })
    .toBuffer();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const wanted = process.argv.slice(2);
  const list = wanted.length
    ? ASSETS.filter((a) => wanted.includes(a.name))
    : ASSETS;
  const results = await Promise.allSettled(
    list.map(async (asset) => {
      const raw = await generate(asset);
      const out = await toSprite(asset, raw);
      const file = join(OUT_DIR, `${asset.name}.png`);
      await writeFile(file, out);
      const meta = await sharp(out).metadata();
      console.log(
        `✓ ${asset.name}.png  ${meta.width}x${meta.height}  ${(out.length / 1024) | 0}kb`
      );
    })
  );
  const failed = results.filter((r) => r.status === "rejected");
  for (const f of failed) {
    console.error("✗", f.reason?.message ?? f.reason);
  }
  process.exit(failed.length ? 1 : 0);
}

main();
