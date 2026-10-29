import fs from 'fs';
import zlib from 'zlib';

const buf = fs.readFileSync('public/ref/display-reference.png');
let pos = 8;
let width = 0, height = 0;
const idatChunks = [];

while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  if (type === 'IHDR') {
    width = buf.readUInt32BE(pos + 8);
    height = buf.readUInt32BE(pos + 12);
  } else if (type === 'IDAT') {
    idatChunks.push(buf.subarray(pos + 8, pos + 8 + len));
  } else if (type === 'IEND') break;
  pos += 12 + len;
}

const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
const stride = 1 + width * 3;
const uncompressed = Buffer.alloc(height * width * 3);

for (let y = 0; y < height; y++) {
  const filter = decompressed[y * stride];
  const rowSrc = y * stride + 1;
  const rowDst = y * width * 3;
  const prevDst = (y - 1) * width * 3;
  for (let x = 0; x < width * 3; x++) {
    const raw = decompressed[rowSrc + x];
    const a = x >= 3 ? uncompressed[rowDst + x - 3] : 0;
    const b = y > 0 ? uncompressed[prevDst + x] : 0;
    const c = (y > 0 && x >= 3) ? uncompressed[prevDst + x - 3] : 0;
    let val = raw;
    if (filter === 1) val = (raw + a) & 0xff;
    else if (filter === 2) val = (raw + b) & 0xff;
    else if (filter === 3) val = (raw + Math.floor((a + b) / 2)) & 0xff;
    else if (filter === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      let pr = a;
      if (pb < pa && pb < pc) pr = b;
      else if (pc < pa) pr = c;
      val = (raw + pr) & 0xff;
    }
    uncompressed[rowDst + x] = val;
  }
}

let pathD = '';
for (let y = 0; y < height; y++) {
  let runStart = -1;
  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * 3;
    const br = (uncompressed[idx] + uncompressed[idx+1] + uncompressed[idx+2]) / 3;
    const isWhite = br > 140;
    if (isWhite && runStart === -1) {
      runStart = x;
    } else if (!isWhite && runStart !== -1) {
      pathD += `M${runStart} ${y}h${x - runStart}v1h-${x - runStart}z `;
      runStart = -1;
    }
  }
  if (runStart !== -1) {
    pathD += `M${runStart} ${y}h${width - runStart}v1h-${width - runStart}z `;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <title>Approved display lettering reference specimen</title>
  <path fill="#F5F7FA" d="${pathD.trim()}"/>
</svg>\n`;

fs.writeFileSync('public/assets/display-specimen-vector.svg', svg);
console.log('Saved public/assets/display-specimen-vector.svg, width:', width, 'height:', height);
