// ============================================================
//  PhotoViewer：全屏图片查看器
//  - 星空模糊暗化、照片带光晕居中
//  - 流动光带文字（FlowingText）：沿椭圆轨道环绕照片
//  - 捏合缩放、上下挥手切换、左右挥手旋转文案、张开手掌关闭
//  - 鼠标滚轮缩放、按钮切换 / 关闭 / 删除
// ============================================================

export class PhotoViewer {
  constructor(root, { onClose, onPrev, onNext, onScale, onDelete } = {}) {
    this.root = root;
    this.onClose = onClose;
    this.onPrev = onPrev;
    this.onNext = onNext;
    this.onScale = onScale;
    this.onDelete = onDelete;
    this.isOpen = false;
    this.scale = 1;
    this._build();
    this._bind();
  }

  _build() {
    this.root.classList.add('viewer');
    this.root.innerHTML =
      '<div class="viewer-backdrop"></div>' +
      '<div class="viewer-stage">' +
      '<div class="viewer-photo-wrap"><img class="viewer-photo" alt="" /></div>' +
      '</div>' +
      '<canvas class="flowing-canvas"></canvas>' +
      '<div class="viewer-caption">' +
      '<div class="vc-title"></div>' +
      '<div class="vc-meta"></div>' +
      '</div>' +
      '<button class="viewer-btn viewer-close" title="关闭 (ESC)">✕</button>' +
      '<button class="viewer-btn viewer-prev" title="上一张 (←)">‹</button>' +
      '<button class="viewer-btn viewer-next" title="下一张 (→)">›</button>' +
      '<button class="viewer-btn viewer-delete" title="删除">🗑</button>' +
      '<div class="viewer-hint">捏合缩放 · 上下挥手切换 · 张开手掌关闭</div>';

    this.photoEl = this.root.querySelector('.viewer-photo');
    this.wrapEl = this.root.querySelector('.viewer-photo-wrap');
    this.captionTitle = this.root.querySelector('.vc-title');
    this.captionMeta = this.root.querySelector('.vc-meta');
    this.flowing = new FlowingText(this.root.querySelector('.flowing-canvas'));

    this.root.querySelector('.viewer-close').onclick = () => this.onClose();
    this.root.querySelector('.viewer-prev').onclick = () => this.onPrev();
    this.root.querySelector('.viewer-next').onclick = () => this.onNext();
    this.root.querySelector('.viewer-delete').onclick = () => this.onDelete();
  }

  _bind() {
    this.root.addEventListener(
      'wheel',
      (e) => {
        if (!this.isOpen) return;
        e.preventDefault();
        this.onScale(e.deltaY < 0 ? 0.15 : -0.15);
      },
      { passive: false }
    );
  }

  open(photo, lines, keepOpen = false) {
    const wasOpen = this.isOpen;
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.photoEl.src = photo.imageUrl;
    this.captionTitle.textContent = photo.title;
    this.captionMeta.textContent = [photo.location, photo.takenAt, photo.author].filter(Boolean).join(' · ');
    this.flowing.setLines(lines);
    this.flowing.setActive(true);
    if (!keepOpen) this.setScale(1);
    if (wasOpen) {
      this.photoEl.classList.remove('swap');
      void this.photoEl.offsetWidth; // 强制 reflow 以重启动画
      this.photoEl.classList.add('swap');
    }
    requestAnimationFrame(() => this.flowing.resize());
  }

  close() {
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.flowing.setActive(false);
  }

  setScale(s) {
    this.scale = s;
    this.wrapEl.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }

  nudgeFlow(dir) {
    this.flowing.rotate(dir === 'left' ? -0.5 : 0.5);
  }
}

// ------------------------------------------------------------
//  FlowingText：Canvas 2D 绘制沿椭圆轨道流动的文字（渐变辉光 + 深度）
// ------------------------------------------------------------
class FlowingText {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lines = [];
    this.phase = 0;
    this.active = false;
    this.tiltOffset = 0;
    this.w = 0;
    this.h = 0;
    this._last = performance.now();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this._raf = requestAnimationFrame(this._loop);
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.dpr = dpr;
    this.w = rect.width;
    this.h = rect.height;
  }

  setLines(lines) {
    this.lines = lines || [];
  }

  setActive(a) {
    this.active = a;
  }

  rotate(delta) {
    this.tiltOffset += delta;
    this.lines = this.lines.map((l) => ({ ...l, dir: -l.dir }));
  }

  _loop = () => {
    requestAnimationFrame(this._loop);
    const now = performance.now();
    const dt = (now - this._last) / 1000;
    this._last = now;
    this.phase += dt * 0.22 * (this.active ? 1 : 0.12);
    this._draw();
  };

  _draw() {
    const ctx = this.ctx;
    if (!this.w) this.resize();
    ctx.clearRect(0, 0, this.w, this.h);
    const cx = this.w / 2;
    const cy = this.h / 2;
    const base = Math.min(this.w, this.h) / 2;
    for (let i = 0; i < this.lines.length; i++) {
      const l = this.lines[i];
      const a = l.rx * base;
      const b = l.ry * base;
      this._drawEllipse(l, cx, cy, a, b, i);
    }
  }

  _drawEllipse(l, cx, cy, a, b, i) {
    const ctx = this.ctx;
    const chars = Array.from(l.text);
    const n = chars.length;
    if (!n) return;
    const tilt = l.tilt + this.tiltOffset;
    const phase = this.phase * l.dir + i * 0.7;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.font = '500 13px "Noto Sans SC", -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + phase;
      const px = Math.cos(ang) * a;
      const py = Math.sin(ang) * b;
      const tangent = Math.atan2(Math.cos(ang) * b, -Math.sin(ang) * a);
      const depth = (Math.sin(ang) + 1) / 2;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(tangent);
      ctx.globalAlpha = 0.2 + depth * 0.8;
      ctx.shadowColor = l.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = l.color;
      ctx.fillText(chars[k], 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
}
