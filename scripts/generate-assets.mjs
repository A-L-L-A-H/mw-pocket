import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = join(process.cwd(), "assets");
mkdirSync(ASSETS_DIR, { recursive: true });

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let idx = 0; idx < 256; idx += 1) {
    let crc = idx;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[idx] = crc >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let idx = 0; idx < buffer.length; idx += 1) {
    crc = CRC_TABLE[(crc ^ buffer[idx]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const typeBytes = Buffer.from(type, "ascii");
  const lengthBytes = Buffer.alloc(4);
  lengthBytes.writeUInt32BE(payload.length, 0);
  const crcInput = Buffer.concat([typeBytes, payload]);
  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lengthBytes, typeBytes, payload, crcBytes]);
}

function renderCrescentPng(size, backgroundHex, foregroundHex, ringHex) {
  const parseHex = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];

  const [bgR, bgG, bgB] = parseHex(backgroundHex);
  const [fgR, fgG, fgB] = parseHex(foregroundHex);
  const [ringR, ringG, ringB] = parseHex(ringHex);

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);

  const center = size / 2;
  const outerRadius = size * 0.28;
  const cutRadius = size * 0.24;
  const cutOffsetX = size * 0.095;
  const cutOffsetY = -size * 0.03;
  const orbitRadius = size * 0.39;
  const orbitWidth = Math.max(2, size * 0.015);

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.hypot(dx, dy);

      const cutDx = x - (center + cutOffsetX);
      const cutDy = y - (center + cutOffsetY);
      const cutDist = Math.hypot(cutDx, cutDy);

      let red = bgR;
      let green = bgG;
      let blue = bgB;

      if (Math.abs(dist - orbitRadius) <= orbitWidth) {
        red = ringR;
        green = ringG;
        blue = ringB;
      }

      if (dist <= outerRadius && cutDist >= cutRadius) {
        red = fgR;
        green = fgG;
        blue = fgB;
      }

      const pixelOffset = rowStart + 1 + x * 4;
      raw[pixelOffset] = red;
      raw[pixelOffset + 1] = green;
      raw[pixelOffset + 2] = blue;
      raw[pixelOffset + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

writeFileSync(
  join(ASSETS_DIR, "icon.png"),
  renderCrescentPng(512, "#0A0B0F", "#F5B731", "#22D3EE")
);
writeFileSync(
  join(ASSETS_DIR, "adaptive-icon.png"),
  renderCrescentPng(512, "#0A0B0F", "#F5B731", "#FF2A5F")
);
writeFileSync(
  join(ASSETS_DIR, "splash-icon.png"),
  renderCrescentPng(512, "#0A0B0F", "#F5B731", "#10B981")
);

const crescentSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="48" fill="#0A0B0F"/>
  <circle cx="128" cy="128" r="96" stroke="#22D3EE" stroke-width="4" stroke-dasharray="10 8"/>
  <path d="M148 58a70 70 0 1 0 0 140 54 54 0 1 1 0-140Z" fill="#F5B731"/>
  <circle cx="182" cy="84" r="5" fill="#FF2A5F"/>
</svg>
`;
writeFileSync(join(ASSETS_DIR, "crescent-mark.svg"), crescentSvg, "utf8");
console.log("Generated CAN-0011 celestial geometric assets in assets/.");
