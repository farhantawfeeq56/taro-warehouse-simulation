const fs = require('fs');
const zlib = require('zlib');

function decodePNG(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let pos = 8, ihdr = null, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9] };
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { w, h, colorType } = ihdr;
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  let off = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[off++];
    const line = raw.slice(off, off + stride);
    off += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      switch (filter) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); break; }
      }
      out[y * stride + x] = v & 0xff;
    }
    prev = out.slice(y * stride, (y + 1) * stride);
  }
  return { w, h, bpp, out };
}

const T = 'C:/Users/Welcome/AppData/Local/Temp/';
for (const f of process.argv.slice(2)) {
  const { w, h, bpp, out } = decodePNG(T + f + '.png');
  const px = (x, y) => { const o = (y * w + x) * bpp; return [out[o], out[o + 1], out[o + 2]]; };
  // find worker (green) row: scan all rows for green clusters
  let worker = [];
  for (let y = 0; y < h; y++) {
    let run = null;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      if (g > 120 && r < 90 && b < 150) { run = run || [x, y]; }
    }
    // only report rows with contiguous-ish green (worker is a ~14px dot)
    if (run) worker.push([y, run]);
  }
  // dark shelf pixels in row0 band (y 547-599)
  let shelf0 = null;
  for (let x = 0; x < w; x++) {
    const [r, g, b] = px(x, 560);
    if (r < 40 && g < 40 && b < 40) { shelf0 = shelf0 || [x, x]; shelf0[1] = x; }
  }
  // title accent green (#4C5C2D) at "Taro" area
  let taro = null;
  for (let y = 200; y < 420; y++) {
    for (let x = 0; x < w; x += 4) {
      const [r, g, b] = px(x, y);
      if (r > 55 && r < 90 && g > 75 && g < 110 && b < 70) { taro = [x, y]; break; }
    }
    if (taro) break;
  }
  console.log(`frame ${f}: workerRows=${JSON.stringify(worker.slice(0, 6))} shelfDark@560=${JSON.stringify(shelf0)} taroAccent=${JSON.stringify(taro)}`);
}