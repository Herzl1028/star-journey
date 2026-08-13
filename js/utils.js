// 通用工具函数

export function uid() {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 照片星星位置：随机生成，避开银河中心区域（|x|<0.8 且 |y|<0.8 时重采样）
export function randomStarPosition() {
  const r = 3.1 + Math.random() * 0.9;
  const theta = Math.random() * Math.PI * 2;
  const x = Math.cos(theta) * r;
  const y = (Math.random() - 0.5) * 3.2;
  const z = Math.sin(theta) * r - 0.5;
  if (Math.abs(x) < 0.8 && Math.abs(y) < 0.8) return randomStarPosition();
  return { x, y, z };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

// 压缩到最大边长 maxSide，输出 JPEG base64
export async function fileToCompressedDataUrl(file, maxSide = 1200, quality = 0.82) {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

// 生成演示图片（渐变星空 + 标题）
export function makeDemoImage(title, from, to, accent) {
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 600;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 900, 600);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 900, 600);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + Math.random() * 0.7) + ')';
    ctx.beginPath();
    ctx.arc(Math.random() * 900, Math.random() * 600, Math.random() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = accent;
  ctx.font = 'bold 54px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,255,255,0.6)';
  ctx.shadowBlur = 26;
  ctx.fillText(title, 450, 300);
  return c.toDataURL('image/jpeg', 0.8);
}

export function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
