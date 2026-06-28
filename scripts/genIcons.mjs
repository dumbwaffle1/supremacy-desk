// Generate PWA PNG icons from the brand mark. Run: node scripts/genIcons.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0c1a10"/>
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#g)"/>
  <defs>
    <radialGradient id="g" cx="0.2" cy="0.15" r="1">
      <stop offset="0" stop-color="#163a22"/>
      <stop offset="1" stop-color="#0a1410"/>
    </radialGradient>
  </defs>
  <g transform="translate(${pad ? 96 : 64} ${pad ? 96 : 64}) scale(${pad ? 13.3 : 16})"
     fill="none" stroke="#19e07c" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 16.5L8.5 11L12 14L21 5"/>
    <path d="M21 5L21 10.5M21 5L15.5 5"/>
  </g>
</svg>`;

await mkdir("public", { recursive: true });
await sharp(Buffer.from(mark(false))).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(Buffer.from(mark(false))).resize(512, 512).png().toFile("public/icon-512.png");
await sharp(Buffer.from(mark(true))).resize(512, 512).png().toFile("public/icon-maskable.png");
await sharp(Buffer.from(mark(false))).resize(180, 180).png().toFile("public/apple-touch-icon.png");
console.log("icons written to public/");
