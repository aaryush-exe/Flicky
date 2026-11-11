export async function makeSampleFile(): Promise<File> {
  const w = 1280;
  const h = 800;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#0b0b0b');
  bg.addColorStop(1, '#2a2a2a');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.09)';
  g.lineWidth = 2;
  for (let r = 80; r < 700; r += 80) {
    g.beginPath();
    g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 260);
  rg.addColorStop(0, 'rgba(255,255,255,0.35)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
  const s = 150;
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(w / 2, h / 2 - s);
  g.bezierCurveTo(w / 2 + s * 0.08, h / 2 - s * 0.32, w / 2 + s * 0.32, h / 2 - s * 0.08, w / 2 + s, h / 2);
  g.bezierCurveTo(w / 2 + s * 0.32, h / 2 + s * 0.08, w / 2 + s * 0.08, h / 2 + s * 0.32, w / 2, h / 2 + s);
  g.bezierCurveTo(w / 2 - s * 0.08, h / 2 + s * 0.32, w / 2 - s * 0.32, h / 2 + s * 0.08, w / 2 - s, h / 2);
  g.bezierCurveTo(w / 2 - s * 0.32, h / 2 - s * 0.08, w / 2 - s * 0.08, h / 2 - s * 0.32, w / 2, h / 2 - s);
  g.fill();
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Sample failed'))), 'image/png'));
  return new File([blob], 'sample.png', { type: 'image/png' });
}
