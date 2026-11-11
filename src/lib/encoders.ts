export interface EncCtx {
  signal: AbortSignal;
  onProgress: (f: number) => void;
}

export const tick = () => new Promise<void>((r) => setTimeout(r, 0));
export function throwIfAborted(s: AbortSignal) {
  if (s.aborted) throw new DOMException('Cancelled', 'AbortError');
}

export async function encodeBmp(img: ImageData, ctx: EncCtx, from = 0.4): Promise<Blob> {
  const { width: w, height: h, data } = img;
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + rowSize * h;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x42;
  buf[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, rowSize * h, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  const step = Math.max(1, Math.floor(2_000_000 / Math.max(1, w)));
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    let o = 54 + y * rowSize;
    for (let x = 0; x < w; x++) {
      const s = src + x * 4;
      buf[o++] = data[s + 2];
      buf[o++] = data[s + 1];
      buf[o++] = data[s];
    }
    if (y % step === 0) {
      throwIfAborted(ctx.signal);
      ctx.onProgress(from + (1 - from) * (y / h));
      await tick();
    }
  }
  return new Blob([buf as BlobPart], { type: 'image/bmp' });
}

export async function encodeTiff(img: ImageData, ctx: EncCtx, from = 0.4): Promise<Blob> {
  const { width: w, height: h, data } = img;
  const NE = 13;
  const ifdSize = 2 + NE * 12 + 4;
  const bpsOff = 8 + ifdSize;
  const xresOff = bpsOff + 8;
  const yresOff = xresOff + 8;
  const pixOff = yresOff + 8;
  const total = pixOff + w * h * 4;
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x49;
  buf[1] = 0x49;
  dv.setUint16(2, 42, true);
  dv.setUint32(4, 8, true);
  dv.setUint16(8, NE, true);
  let p = 10;
  const entry = (tag: number, type: number, count: number, value: number) => {
    dv.setUint16(p, tag, true);
    dv.setUint16(p + 2, type, true);
    dv.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) dv.setUint16(p + 8, value, true);
    else dv.setUint32(p + 8, value, true);
    p += 12;
  };
  entry(256, 4, 1, w);
  entry(257, 4, 1, h);
  entry(258, 3, 4, bpsOff);
  entry(259, 3, 1, 1);
  entry(262, 3, 1, 2);
  entry(273, 4, 1, pixOff);
  entry(277, 3, 1, 4);
  entry(278, 4, 1, h);
  entry(279, 4, 1, w * h * 4);
  entry(282, 5, 1, xresOff);
  entry(283, 5, 1, yresOff);
  entry(296, 3, 1, 2);
  entry(338, 3, 1, 2);
  dv.setUint32(p, 0, true);
  for (let i = 0; i < 4; i++) dv.setUint16(bpsOff + i * 2, 8, true);
  dv.setUint32(xresOff, 72, true);
  dv.setUint32(xresOff + 4, 1, true);
  dv.setUint32(yresOff, 72, true);
  dv.setUint32(yresOff + 4, 1, true);
  const rowsPerChunk = Math.max(1, Math.floor(4_000_000 / Math.max(1, w * 4)));
  for (let y = 0; y < h; y += rowsPerChunk) {
    const rows = Math.min(rowsPerChunk, h - y);
    buf.set(data.subarray(y * w * 4, (y + rows) * w * 4), pixOff + y * w * 4);
    throwIfAborted(ctx.signal);
    ctx.onProgress(from + (1 - from) * ((y + rows) / h));
    await tick();
  }
  return new Blob([buf as BlobPart], { type: 'image/tiff' });
}

export function decodeTiff(buf: ArrayBuffer): ImageData {
  const dv = new DataView(buf);
  const le = dv.getUint16(0, false) === 0x4949;
  if (dv.getUint16(2, le) !== 42) throw new Error('Not a valid TIFF file');
  const ifd = dv.getUint32(4, le);
  const n = dv.getUint16(ifd, le);
  const tags: Record<number, number[]> = {};
  const sizes: Record<number, number> = { 1: 1, 3: 2, 4: 4 };
  for (let i = 0; i < n; i++) {
    const p = ifd + 2 + i * 12;
    const tag = dv.getUint16(p, le);
    const type = dv.getUint16(p + 2, le);
    const count = dv.getUint32(p + 4, le);
    const sz = sizes[type] ?? 1;
    const off = sz * count <= 4 ? p + 8 : dv.getUint32(p + 8, le);
    const vals: number[] = [];
    for (let k = 0; k < count; k++) {
      vals.push(type === 3 ? dv.getUint16(off + k * 2, le) : type === 4 ? dv.getUint32(off + k * 4, le) : dv.getUint8(off + k));
    }
    tags[tag] = vals;
  }
  const w = tags[256]?.[0];
  const h = tags[257]?.[0];
  if (!w || !h) throw new Error('TIFF is missing its dimensions');
  const bps = tags[258] || [1];
  const comp = (tags[259] || [1])[0];
  const photo = (tags[262] || [2])[0];
  const spp = (tags[277] || [1])[0];
  const offs = tags[273] || [];
  const rps = (tags[278] || [h])[0];
  if (comp !== 1 || bps.some((b) => b !== 8) || (tags[284] || [1])[0] !== 1 || photo > 2) {
    throw new Error('Only uncompressed 8-bit TIFF can be read without an extended image engine');
  }
  const out = new ImageData(w, h);
  let y = 0;
  for (const start of offs) {
    const rows = Math.min(rps, h - y);
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < w; x++) {
        const b = start + (r * w + x) * spp;
        const o = ((y + r) * w + x) * 4;
        if (photo <= 1 || spp < 3) {
          let v = dv.getUint8(b);
          if (photo === 0) v = 255 - v;
          out.data[o] = out.data[o + 1] = out.data[o + 2] = v;
          out.data[o + 3] = spp > 1 ? dv.getUint8(b + 1) : 255;
        } else {
          out.data[o] = dv.getUint8(b);
          out.data[o + 1] = dv.getUint8(b + 1);
          out.data[o + 2] = dv.getUint8(b + 2);
          out.data[o + 3] = spp >= 4 ? dv.getUint8(b + 3) : 255;
        }
      }
    }
    y += rows;
    if (y >= h) break;
  }
  return out;
}

export interface PdfPage {
  jpeg: Uint8Array;
  w: number;
  h: number;
}
export interface PdfOpts {
  size: 'fit' | 'a4' | 'letter';
  orientation: 'auto' | 'portrait' | 'landscape';
  marginMm: number;
}

export function buildPdf(pages: PdfPage[], o: PdfOpts): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let off = 0;
  const push = (u: Uint8Array | string) => {
    const b = typeof u === 'string' ? enc.encode(u) : u;
    parts.push(b);
    off += b.length;
  };
  const begin = (n: number) => {
    offsets[n] = off;
    push(`${n} 0 obj\n`);
  };
  const m = (o.marginMm * 72) / 25.4;
  const f = (n: number) => n.toFixed(2);
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  begin(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  begin(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>\nendobj\n`);
  pages.forEach((pg, i) => {
    const pn = 3 + i * 3;
    let pw: number, ph: number;
    if (o.size === 'fit') {
      pw = pg.w * 0.75 + 2 * m;
      ph = pg.h * 0.75 + 2 * m;
    } else {
      [pw, ph] = o.size === 'a4' ? [595.28, 841.89] : [612, 792];
      const land = o.orientation === 'landscape' || (o.orientation === 'auto' && pg.w > pg.h);
      if (land) [pw, ph] = [ph, pw];
    }
    const aw = Math.max(1, pw - 2 * m);
    const ah = Math.max(1, ph - 2 * m);
    const sc = Math.min(aw / pg.w, ah / pg.h);
    const iw = pg.w * sc;
    const ih = pg.h * sc;
    const x = (pw - iw) / 2;
    const y = (ph - ih) / 2;
    const content = `q ${f(iw)} 0 0 ${f(ih)} ${f(x)} ${f(y)} cm /Im0 Do Q`;
    begin(pn);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] /Resources << /XObject << /Im0 ${pn + 2} 0 R >> >> /Contents ${pn + 1} 0 R >>\nendobj\n`);
    begin(pn + 1);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    begin(pn + 2);
    push(`<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
    push(pg.jpeg);
    push('\nendstream\nendobj\n');
  });
  const count = 3 + pages.length * 3;
  const xref = off;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

export async function encodeWav(
  file: File,
  opts: { sampleRate: number; channels: number },
  ctx: EncCtx,
): Promise<Blob> {
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) throw new Error('Audio decoding is not available in this environment');
  const ac = new AC();
  try {
    const ab = await file.arrayBuffer();
    throwIfAborted(ctx.signal);
    ctx.onProgress(0.1);
    let buf: AudioBuffer;
    try {
      buf = await ac.decodeAudioData(ab);
    } catch {
      throw new Error('The audio could not be decoded (corrupt or unsupported codec)');
    }
    throwIfAborted(ctx.signal);
    ctx.onProgress(0.35);
    const sr = opts.sampleRate || buf.sampleRate;
    const ch = opts.channels || buf.numberOfChannels;
    if (sr !== buf.sampleRate || ch !== buf.numberOfChannels) {
      const off = new OfflineAudioContext(ch, Math.max(1, Math.ceil(buf.duration * sr)), sr);
      const src = off.createBufferSource();
      src.buffer = buf;
      src.connect(off.destination);
      src.start();
      buf = await off.startRendering();
      throwIfAborted(ctx.signal);
    }
    ctx.onProgress(0.6);
    const len = buf.length;
    const dataSize = len * ch * 2;
    const out = new ArrayBuffer(44 + dataSize);
    const dv = new DataView(out);
    const str = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    dv.setUint32(4, 36 + dataSize, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, ch, true);
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * ch * 2, true);
    dv.setUint16(32, ch * 2, true);
    dv.setUint16(34, 16, true);
    str(36, 'data');
    dv.setUint32(40, dataSize, true);
    const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
    const chunk = 65536;
    let o = 44;
    for (let i = 0; i < len; i += chunk) {
      const end = Math.min(len, i + chunk);
      for (let k = i; k < end; k++) {
        for (let c = 0; c < ch; c++) {
          const s = Math.max(-1, Math.min(1, chans[c][k]));
          dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
          o += 2;
        }
      }
      throwIfAborted(ctx.signal);
      ctx.onProgress(0.6 + 0.4 * (end / len));
      await tick();
    }
    return new Blob([out], { type: 'audio/wav' });
  } finally {
    ac.close().catch(() => undefined);
  }
}
