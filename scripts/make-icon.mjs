// Generates resources/icon.png (1024x1024) without native deps:
// a rounded indigo square with a white envelope. electron-builder derives .icns/.ico from it.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const S = 1024
const px = Buffer.alloc(S * S * 4)
const lerp = (a, b, t) => Math.round(a + (b - a) * t)

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1
}
function distToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

const pad = 100, radius = 190
const ex0 = 250, ey0 = 330, ex1 = 774, ey1 = 694, stroke = 34
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4
    if (!inRoundRect(x, y, pad, pad, S - pad, S - pad, radius)) continue
    const t = (x + y) / (2 * S)
    let r = lerp(79, 124, t), g = lerp(70, 58, t), b = lerp(229, 237, t)
    // envelope outline + flap
    const inEnv = inRoundRect(x, y, ex0, ey0, ex1, ey1, 40)
    const inInner = inRoundRect(x, y, ex0 + stroke, ey0 + stroke, ex1 - stroke, ey1 - stroke, 12)
    const flap = Math.min(
      distToSegment(x, y, ex0 + 20, ey0 + 20, 512, 540),
      distToSegment(x, y, ex1 - 20, ey0 + 20, 512, 540)
    )
    if ((inEnv && !inInner) || (inEnv && flap < stroke / 2)) r = g = b = 255
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
  }
}

const raw = Buffer.alloc((S * 4 + 1) * S)
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])
mkdirSync('resources', { recursive: true })
writeFileSync('resources/icon.png', png)
writeFileSync('build/icon.png', png)
console.log('icon written', png.length, 'bytes')
