import { getHost } from './host';
import type { Settings } from './settings';
import {
  buildPdf,
  decodeTiff,
  encodeBmp,
  encodeTiff,
  encodeWav,
  throwIfAborted,
  type EncCtx,
} from './encoders';

export type Category = 'image' | 'audio' | 'video' | 'document' | 'archive';

export interface Format {
  id: string;
  label: string;
  ext: string;
  category: Category;

  orbit?: boolean;

  from?: string[];
}

export interface ConvertCtx extends EncCtx {
  settings: Settings;
}

export interface Engine {
  id: string;
  name: string;
  description: string;
  origin: 'Bundled' | 'Downloaded engine' | 'Detected application';
  license: string;
  formats: Format[];
  available: () => boolean;
  convert?: (file: File, target: Format, ctx: ConvertCtx) => Promise<Blob>;
  combine?: (files: File[], target: Format, ctx: ConvertCtx) => Promise<Blob>;
}

const F = (id: string, label: string, category: Category, orbit = true, ext = id, from?: string[]): Format => ({
  id,
  label,
  ext,
  category,
  orbit,
  from,
});

const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus', 'wma'];
const VIDEO_EXTS = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'm4v', 'flv'];
const WRITER_EXTS = ['doc', 'docx', 'odt', 'rtf', 'txt', 'html', 'htm'];
const CALC_EXTS = ['xls', 'xlsx', 'ods', 'csv'];
const SLIDE_EXTS = ['ppt', 'pptx', 'odp'];

interface Decoded {
  src: CanvasImageSource;
  w: number;
  h: number;
}

async function decodeSvg(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('The SVG could not be decoded'));
      img.src = url;
    });
    const w = img.naturalWidth || 1024;
    const h = img.naturalHeight || 1024;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return { src: c, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decode(file: File): Promise<Decoded> {
  if (/\.svg$/i.test(file.name)) return decodeSvg(file);
  try {
    const bmp = await createImageBitmap(file);
    return { src: bmp, w: bmp.width, h: bmp.height };
  } catch {
    if (/\.tiff?$/i.test(file.name)) {
      const img = decodeTiff(await file.arrayBuffer());
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.putImageData(img, 0, 0);
      return { src: c, w: img.width, h: img.height };
    }
    throw new Error('The image could not be decoded (corrupt or unsupported)');
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob | null>((res) => c.toBlob(res, type, q));

async function rasterize(file: File, flatten: boolean, ctx: ConvertCtx) {
  ctx.onProgress(0.05);
  const d = await decode(file);
  throwIfAborted(ctx.signal);
  ctx.onProgress(0.25);
  const max = ctx.settings.imageMaxDim;
  const sc = max > 0 && Math.max(d.w, d.h) > max ? max / Math.max(d.w, d.h) : 1;
  const w = Math.max(1, Math.round(d.w * sc));
  const h = Math.max(1, Math.round(d.h * sc));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  if (flatten) {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
  }
  g.drawImage(d.src, 0, 0, w, h);
  ctx.onProgress(0.4);
  return { c, g, w, h };
}

async function jpegBytes(file: File, ctx: ConvertCtx) {
  const { c, w, h } = await rasterize(file, true, ctx);
  const b = await toBlob(c, 'image/jpeg', ctx.settings.imageQuality / 100);
  if (!b) throw new Error('JPEG encoding failed');
  return { jpeg: new Uint8Array(await b.arrayBuffer()), w, h };
}

const pdfOpts = (s: Settings) => ({ size: s.docPageSize, orientation: s.docOrientation, marginMm: s.docMarginMm });

const imageEngine: Engine = {
  id: 'image',
  name: 'Image engine',
  description: 'PNG, JPG, WEBP, SVG, BMP, TIFF and PDF using built-in codecs. Optional quality and maximum-resolution controls.',
  origin: 'Bundled',
  license: 'Flicky (MIT)',
  formats: [
    F('webp', 'WEBP', 'image'),
    F('jpg', 'JPG', 'image'),
    F('svg', 'SVG', 'image'),
    F('jpeg', 'JPEG', 'image', false),
    F('bmp', 'BMP', 'image'),
    F('tiff', 'TIFF', 'image'),
    F('png', 'PNG', 'image'),
    F('pdf', 'PDF', 'image', false),
  ],
  available: () => true,
  async convert(file, t, ctx) {
    const q = ctx.settings.imageQuality / 100;
    if (t.id === 'pdf') {
      const p = await jpegBytes(file, ctx);
      ctx.onProgress(0.9);
      return buildPdf([p], pdfOpts(ctx.settings));
    }
    if (t.id === 'svg') {

      const { c, w, h } = await rasterize(file, false, ctx);
      const png = c.toDataURL('image/png');
      ctx.onProgress(1);
      return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image width="${w}" height="${h}" href="${png}" xlink:href="${png}"/></svg>`], { type: 'image/svg+xml' });
    }
    const flatten = t.id === 'jpg' || t.id === 'jpeg' || t.id === 'bmp';
    const { c, g, w, h } = await rasterize(file, flatten, ctx);
    if (t.id === 'bmp') return encodeBmp(g.getImageData(0, 0, w, h), ctx);
    if (t.id === 'tiff') return encodeTiff(g.getImageData(0, 0, w, h), ctx);
    const mime = t.id === 'png' ? 'image/png' : t.id === 'webp' ? 'image/webp' : 'image/jpeg';
    const b = await toBlob(c, mime, t.id === 'png' ? undefined : q);
    throwIfAborted(ctx.signal);
    if (!b || b.type !== mime) throw new Error(`${t.label} encoding is not supported by this browser`);
    ctx.onProgress(1);
    return b;
  },
  async combine(files, _t, ctx) {
    const pages = [];
    for (let i = 0; i < files.length; i++) {
      const sub: ConvertCtx = {
        ...ctx,
        onProgress: (f) => ctx.onProgress((i + Math.min(0.95, f)) / files.length),
      };
      pages.push(await jpegBytes(files[i], sub));
      throwIfAborted(ctx.signal);
    }
    ctx.onProgress(0.98);
    return buildPdf(pages, pdfOpts(ctx.settings));
  },
};

const audioEngine: Engine = {
  id: 'wav',
  name: 'Audio engine (WAV)',
  description: 'Decodes any audio your system supports and writes 16-bit PCM WAV. Optional sample rate and channels.',
  origin: 'Bundled',
  license: 'Flicky (MIT)',
  formats: [F('wav', 'WAV', 'audio')],
  available: () => true,
  convert: (file, _t, ctx) =>
    encodeWav(file, { sampleRate: ctx.settings.audioSampleRate, channels: ctx.settings.audioChannels }, ctx),
};

const hostHas = (id: string) => !!getHost()?.engines?.has(id);

const ffmpegEngine: Engine = {
  id: 'ffmpeg',
  name: 'FFmpeg engine',
  description: 'Video and compressed-audio conversion: MP4, MKV, WEBM, MOV, GIF, MP3, AAC, FLAC, OGG.',
  origin: 'Downloaded engine',
  license: 'LGPL / GPL builds (ffmpeg.org)',
  formats: [
    F('mp4', 'MP4', 'video'),
    F('mkv', 'MKV', 'video'),
    F('webm', 'WEBM', 'video'),
    F('mov', 'MOV', 'video'),
    F('gif', 'GIF', 'video'),
    F('mp3', 'MP3', 'audio', true, 'mp3', [...AUDIO_EXTS, ...VIDEO_EXTS]),
    F('aac', 'AAC', 'audio', true, 'aac', [...AUDIO_EXTS, ...VIDEO_EXTS]),
    F('flac', 'FLAC', 'audio', true, 'flac', [...AUDIO_EXTS, ...VIDEO_EXTS]),
    F('ogg', 'OGG', 'audio', true, 'ogg', [...AUDIO_EXTS, ...VIDEO_EXTS]),
  ],
  available: () => hostHas('ffmpeg'),
};

const docEngine: Engine = {
  id: 'documents',
  name: 'Document engine',
  description: 'Office and text documents to PDF and back, preserving layout. Uses a detected office suite or a downloaded engine.',
  origin: 'Detected application',
  license: 'MPL-2.0 (LibreOffice)',
  formats: [
    F('doc-pdf', 'PDF', 'document', true, 'pdf', [...WRITER_EXTS, ...SLIDE_EXTS, ...CALC_EXTS]),
    F('docx', 'WORD', 'document', true, 'docx', ['pdf', ...WRITER_EXTS]),
    F('pptx', 'PPT', 'document', true, 'pptx', ['pdf', ...SLIDE_EXTS]),
    F('xlsx', 'EXCEL', 'document', true, 'xlsx', CALC_EXTS),
    F('odt', 'ODT', 'document', false, 'odt', ['pdf', ...WRITER_EXTS]),
    F('txt', 'TXT', 'document', false, 'txt', ['pdf', ...WRITER_EXTS]),
    F('html', 'HTML', 'document', false, 'html', ['pdf', ...WRITER_EXTS]),
    F('odp', 'ODP', 'document', false, 'odp', SLIDE_EXTS),
    F('ods', 'ODS', 'document', false, 'ods', CALC_EXTS),
    F('csv', 'CSV', 'document', false, 'csv', CALC_EXTS),
  ],
  available: () => hostHas('documents'),
};

const winRarEngine: Engine = {
  id: 'winrar', name: 'WinRAR',
  description: 'Archive creation and extraction for formats supported by WinRAR. Commercial/shareware product; install through its publisher package.',
  origin: 'Detected application', license: 'Proprietary (RARLAB)', formats: [],
  available: () => hostHas('winrar'),
};

export const ENGINES: Engine[] = [imageEngine, audioEngine, ffmpegEngine, docEngine, winRarEngine];

const EXT_CATEGORY: Record<string, Category> = {};
const reg = (cat: Category, exts: string) => exts.split(' ').forEach((e) => (EXT_CATEGORY[e] = cat));
reg('image', 'jpg jpeg png webp bmp gif tif tiff avif svg');
reg('audio', 'mp3 wav ogg flac aac m4a opus wma');
reg('video', 'mp4 mkv mov avi webm wmv m4v flv');
reg('document', 'pdf docx doc odt txt rtf html htm ppt pptx odp xls xlsx ods csv');
reg('archive', 'zip rar 7z');

export const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
export const baseName = (name: string) => name.replace(/\.[^.]+$/, '');
export const categoryOf = (f: File | string): Category | null =>
  EXT_CATEGORY[extOf(typeof f === 'string' ? f : f.name)] ?? null;

export const normExt = (e: string) => (e === 'jpeg' ? 'jpg' : e === 'tif' ? 'tiff' : e);

export function getFormat(id: string): Format | undefined {
  for (const e of ENGINES) {
    const f = e.formats.find((x) => x.id === id);
    if (f) return f;
  }
}
export const engineForFormat = (id: string) => ENGINES.find((e) => e.formats.some((f) => f.id === id));

export function selectionCategory(files: File[]): Category | null {
  const counts = new Map<Category, number>();
  for (const f of files) {
    const c = categoryOf(f);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: Category | null = null;
  let n = 0;
  counts.forEach((v, k) => {
    if (v > n) {
      n = v;
      best = k;
    }
  });
  return best;
}

export function canConvert(file: File, fmt: Format): boolean {
  const ext = normExt(extOf(file.name));
  if (!ext || ext === normExt(fmt.ext)) return false;
  if (fmt.from) return fmt.from.map(normExt).includes(ext);
  return categoryOf(file) === fmt.category;
}

const PREFERRED: Record<string, string[]> = {
  pdf: ['docx', 'pptx', 'xlsx', 'txt', 'html', 'odt'],
  doc: ['doc-pdf', 'docx', 'odt', 'txt'], docx: ['doc-pdf', 'odt', 'txt', 'html'], odt: ['doc-pdf', 'docx', 'txt'],
  txt: ['doc-pdf', 'docx', 'odt'], rtf: ['doc-pdf', 'docx', 'txt'],
  ppt: ['doc-pdf', 'pptx', 'odp'], pptx: ['doc-pdf', 'odp'], odp: ['doc-pdf', 'pptx'],
  xls: ['xlsx', 'doc-pdf', 'csv'], xlsx: ['doc-pdf', 'csv', 'ods'], ods: ['xlsx', 'doc-pdf', 'csv'], csv: ['xlsx', 'doc-pdf', 'ods'],
  png: ['jpg', 'svg', 'webp', 'bmp', 'tiff', 'pdf'], jpg: ['png', 'svg', 'webp', 'pdf', 'bmp'],
  webp: ['png', 'jpg', 'svg'], svg: ['png', 'jpg', 'webp'], gif: ['png', 'jpg', 'webp'],
  mp4: ['mp3', 'mov', 'mkv', 'webm', 'gif', 'aac'], mov: ['mp4', 'mp3', 'mkv', 'webm', 'gif'],
  mkv: ['mp4', 'mp3', 'mov', 'webm'], webm: ['mp4', 'mp3', 'mov'], avi: ['mp4', 'mp3', 'mkv', 'mov'],
  mp3: ['wav', 'aac', 'flac', 'ogg'], wav: ['mp3', 'flac', 'aac', 'ogg'], flac: ['mp3', 'wav', 'aac', 'ogg'],
  m4a: ['mp3', 'wav', 'flac', 'ogg'], ogg: ['mp3', 'wav', 'flac', 'aac'], aac: ['mp3', 'wav', 'flac', 'ogg'],
};

function ordered<T>(items: T[], idOf: (t: T) => string, sample: File | undefined): T[] {
  const pref = (sample && PREFERRED[normExt(extOf(sample.name))]) || [];
  const rank = (t: T, i: number) => {
    const p = pref.indexOf(idOf(t));
    return p >= 0 ? p : 100 + i;
  };
  return items.map((t, i) => ({ t, r: rank(t, i) })).sort((a, b) => a.r - b.r).map((x) => x.t);
}

const poolOf = (files: File[]) => {
  const cat = selectionCategory(files);
  return cat ? files.filter((f) => categoryOf(f) === cat) : [];
};

export function orbitFormats(files: File[]): Format[] {
  const pool = poolOf(files);
  if (!pool.length) return [];
  const all = ENGINES.flatMap((e) => e.formats).filter((f) => f.orbit !== false && pool.some((x) => canConvert(x, f)));
  return ordered(all, (f) => f.id, pool[0]);
}

export function catalogueFor(files: File[]) {
  const pool = poolOf(files);
  if (!pool.length) return [];
  const all = ENGINES.flatMap((e) =>
    e.formats.filter((f) => pool.some((x) => canConvert(x, f))).map((f) => ({ format: f, engine: e, available: e.available() })),
  );
  return ordered(all, (c) => c.format.id, pool[0]);
}
