// ============================================================
//  Starfield：Three.js 真实银河星空
//  - 深空背景星（真实黑体色温分布）
//  - 银河带：核球 + 旋臂尘埃带 + 暖核冷臂渐变 + 少量粉色 HII 区
//  - 核球辉光 + 星云光斑
//  - 照片以「粒子星」形式融入星空（微弱，悬停才高亮 + 显示标题）
//  - 鼠标拖拽旋转、滚轮缩放、点击粒子打开照片
// ============================================================

import * as THREE from 'three';

const TAU = Math.PI * 2;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.72 + 0.28 * sin(uTime * (0.6 + aPhase * 2.0) + aPhase * 6.2831);
  vColor = aColor;
  vAlpha = tw;
  float ps = aSize * uPixelRatio * (60.0 / -mv.z) * tw;
  gl_PointSize = clamp(ps, 0.5, 36.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  float a = smoothstep(0.5, 0.0, d);
  a = pow(a, 1.8);
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function randomDir(out) {
  const z = Math.random() * 2 - 1;
  const a = Math.random() * TAU;
  const r = Math.sqrt(1 - z * z);
  out.set(r * Math.cos(a), r * Math.sin(a), z);
  return out;
}

export class Starfield {
  constructor(container, { photos = [], onSelectPhoto = () => {} } = {}) {
    this.container = container;
    this.photos = photos;
    this.onSelectPhoto = onSelectPhoto;
    this.projections = new Map();
    this.targetId = null;
    this.photoSprites = new Map();

    this.yaw = 0;
    this.pitch = 0.18;
    this.fov = 62;
    this.autoRotate = 0.025; // rad/s
    this.userRotVel = 0;

    // 银河带倾斜角，让它斜挂在天空中
    this._tilt = new THREE.Euler(0.16, 0, 0.42, 'YXZ');
    this._tmpDir = new THREE.Vector3();
    this._tmpColor = new THREE.Color();

    this._init();
  }

  _isMobile() {
    return window.innerWidth < 768;
  }

  _init() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.canvas = this.renderer.domElement;
    this.container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, w / h, 0.1, 200);
    this.camera.rotation.order = 'YXZ';

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.starMaterial = this._makeStarMaterial();

    this._createBackgroundStars();
    this._createMilkyWay();
    this._createNebula();
    this._createMeteors();
    this._rebuildPhotoStars();

    this._buildLabel();
    this._bindPointer();

    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);

    this._lastNow = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  _makeStarMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  _pushPoints(group, positions, colors, sizes, phases) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    const pts = new THREE.Points(geo, this.starMaterial);
    pts.frustumCulled = false;
    group.add(pts);
    return geo;
  }

  // 深空背景星：均匀分布在球面上，颜色符合真实黑体色温分布
  _createBackgroundStars() {
    const count = this._isMobile() ? 3500 : 6500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const dir = this._tmpDir;
    for (let i = 0; i < count; i++) {
      randomDir(dir);
      const r = 34 + Math.random() * 8;
      positions[i * 3] = dir.x * r;
      positions[i * 3 + 1] = dir.y * r;
      positions[i * 3 + 2] = dir.z * r;
      const c = this._starColor();
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      sizes[i] = 0.4 + Math.random() * 1.1;
      phases[i] = Math.random();
    }
    this._pushPoints(this.root, positions, colors, sizes, phases);
  }

  // 真实星色：少数蓝白 → 多数白 → 部分黄 → 少量橙红
  _starColor() {
    const t = Math.random();
    if (t < 0.06) return this._tmpColor.setHex(0x9db4ff);
    if (t < 0.25) return this._tmpColor.setHex(0xccd9ff);
    if (t < 0.78) return this._tmpColor.setHex(0xffffff);
    if (t < 0.93) return this._tmpColor.setHex(0xffe2b0);
    return this._tmpColor.setHex(0xffb873);
  }

  // 银河带：核球集中在 theta≈0，向外变冷；尘埃带用拒绝采样压暗
  _createMilkyWay() {
    const count = this._isMobile() ? 8000 : 17000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    const core = new THREE.Color(1.0, 0.86, 0.62);
    const cool = new THREE.Color(0.64, 0.77, 1.0);
    const pink = new THREE.Color(1.0, 0.7, 0.82);
    const dir = this._tmpDir;

    let i = 0;
    let guard = 0;
    while (i < count && guard < count * 30) {
      guard++;
      let theta;
      if (Math.random() < 0.3) {
        theta = randn() * 0.42; // 核球附近（高斯）
      } else {
        theta = Math.random() * TAU;
      }
      let d = Math.abs(theta);
      d = Math.min(d, TAU - d);
      const bulge = Math.exp(-(d * d) / (2 * 0.5 * 0.5));
      const sigma = 0.045 + 0.17 * bulge;
      const phi = randn() * sigma;

      // 尘埃带：沿带方向周期性压暗，形成暗缝
      const dust =
        0.5 +
        0.5 *
          (0.55 + 0.45 * Math.cos(3.1 * theta + 1.1)) *
          (0.6 + 0.4 * Math.cos(5.3 * theta - 0.6));
      if (Math.random() > dust) continue;

      dir.set(Math.cos(theta) * Math.cos(phi), Math.sin(phi), Math.sin(theta) * Math.cos(phi));
      dir.applyEuler(this._tilt);
      const r = 31 + (Math.random() - 0.5) * 6;

      positions[i * 3] = dir.x * r;
      positions[i * 3 + 1] = dir.y * r;
      positions[i * 3 + 2] = dir.z * r;

      const t = 1 - bulge;
      const mix = Math.max(0, 1 - t * 1.5);
      this._tmpColor.copy(cool).lerp(core, mix);
      if (Math.random() < 0.04) this._tmpColor.copy(pink);
      this._tmpColor.offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.12);
      colors[i * 3] = this._tmpColor.r;
      colors[i * 3 + 1] = this._tmpColor.g;
      colors[i * 3 + 2] = this._tmpColor.b;

      sizes[i] = 0.5 + bulge * 1.4 + Math.random() * 0.8;
      phases[i] = Math.random();
      i++;
    }

    // 若拒绝采样不足，用已填充部分重建
    this._pushPoints(
      this.root,
      positions.subarray(0, i * 3),
      colors.subarray(0, i * 3),
      sizes.subarray(0, i),
      phases.subarray(0, i)
    );
  }

  // 核球辉光 + 两处星云光斑
  _createNebula() {
    const coreDir = new THREE.Vector3(1, 0, 0).applyEuler(this._tilt).multiplyScalar(29);
    this._addGlow(coreDir, 14, '255,224,178', 0.5);

    const n1 = new THREE.Vector3(1, 0.25, 0.6).applyEuler(this._tilt).multiplyScalar(28);
    const n2 = new THREE.Vector3(0.7, -0.3, -0.8).applyEuler(this._tilt).multiplyScalar(27);
    this._addGlow(n1, 8, '180,140,255', 0.24);
    this._addGlow(n2, 7, '255,150,180', 0.2);
  }

  _addGlow(position, scale, rgb, alpha) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')');
    g.addColorStop(0.45, 'rgba(' + rgb + ',' + (alpha * 0.35).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.set(scale, scale, 1);
    this.root.add(sprite);
    this._glowSprites = this._glowSprites || [];
    this._glowSprites.push(sprite);
  }

  _createMeteors() {
    const n = 5;
    this.meteors = [];
    for (let i = 0; i < n; i++) this.meteors.push(this._spawnMeteor());
    const positions = new Float32Array(n * 2 * 3);
    const colors = new Float32Array(n * 2 * 3);
    this.meteorGeo = new THREE.BufferGeometry();
    this.meteorGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.meteorGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.meteorLine = new THREE.LineSegments(
      this.meteorGeo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.meteorLine.frustumCulled = false;
    this.root.add(this.meteorLine);
  }

  _spawnMeteor() {
    const dir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).normalize();
    const head = dir.clone().multiplyScalar(10 + Math.random() * 10);
    return {
      head,
      dir,
      speed: 3 + Math.random() * 4,
      length: 0.6 + Math.random() * 1.1,
      life: Math.random(),
      duration: 2 + Math.random() * 3,
    };
  }

  // 照片 → 微弱粒子星，确定性方位（基于 id 哈希），稳定不跳变
  _photoDir(id) {
    const theta = this._hash(id + ':a') * TAU;
    const phi = (this._hash(id + ':b') - 0.5) * 0.55;
    const dir = new THREE.Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(phi), Math.sin(theta) * Math.cos(phi));
    return dir.applyEuler(this._tilt);
  }

  _hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }

  _makeGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,224,178,0.9)');
    g.addColorStop(0.6, 'rgba(255,180,120,0.25)');
    g.addColorStop(1, 'rgba(255,160,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  _rebuildPhotoStars() {
    for (const s of this.photoSprites.values()) this.root.remove(s);
    this.photoSprites.clear();
    if (!this.photoGlowTexture) this.photoGlowTexture = this._makeGlowTexture();

    for (const p of this.photos) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.photoGlowTexture,
          color: 0xffd9a0,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sprite.position.copy(this._photoDir(p.id).multiplyScalar(27));
      sprite.scale.set(0.3, 0.3, 1);
      sprite.userData.id = p.id;
      this.root.add(sprite);
      this.photoSprites.set(p.id, sprite);
    }
  }

  setPhotos(photos) {
    this.photos = photos;
    this.targetId = null;
    this._rebuildPhotoStars();
  }

  setTarget(id, x, y) {
    if (this.targetId !== id) this.targetId = id;
    if (id && x != null) {
      const p = this.photos.find((pp) => pp.id === id);
      this.label.textContent = p ? p.title : '';
      this.label.style.opacity = '1';
      this.label.style.transform = 'translate(-50%, -130%) translate(' + x + 'px, ' + y + 'px)';
    } else {
      this.label.style.opacity = '0';
    }
  }

  _buildLabel() {
    this.label = document.createElement('div');
    this.label.className = 'photo-label';
    this.container.appendChild(this.label);
  }

  setDimmed(dimmed) {
    this.canvas.style.filter = dimmed ? 'blur(9px) brightness(0.32) saturate(0.8)' : 'none';
  }

  zoom(deltaY) {
    this.fov = Math.max(24, Math.min(80, this.fov + (deltaY > 0 ? 3 : -3)));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  _bindPointer() {
    let dragging = false;
    let lastX = 0, lastY = 0, dragDist = 0;

    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      dragDist = 0;
    });
    window.addEventListener('pointermove', (e) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        dragDist += Math.abs(dx) + Math.abs(dy);
        lastX = e.clientX;
        lastY = e.clientY;
        this.yaw -= dx * 0.0045;
        this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch + dy * 0.0045));
      } else {
        this._hover(e.clientX, e.clientY);
      }
    });
    window.addEventListener('pointerup', () => {
      if (dragging && dragDist < 5 && this.targetId) {
        this.onSelectPhoto(this.targetId);
      }
      dragging = false;
    });
  }

  _hover(x, y) {
    let best = null;
    let bestD = 26 * 26;
    for (const [id, p] of this.projections) {
      if (p.behind) continue;
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    this.setTarget(best, x, y);
  }

  _tick = (now) => {
    this._raf = requestAnimationFrame(this._tick);
    const dt = Math.min(0.05, (now - this._lastNow) / 1000) || 0;
    this._lastNow = now;

    this.starMaterial.uniforms.uTime.value = now / 1000;

    this.userRotVel *= 0.94;
    this.yaw += (this.autoRotate + this.userRotVel) * dt;
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    this._updateMeteors(dt);
    this._updatePhotoStars(now);
    this._projectPhotos();

    this.renderer.render(this.scene, this.camera);
  };

  _updateMeteors(dt) {
    const pos = this.meteorGeo.attributes.position.array;
    const col = this.meteorGeo.attributes.color.array;
    for (let i = 0; i < this.meteors.length; i++) {
      const m = this.meteors[i];
      m.life += dt / m.duration;
      if (m.life >= 1) {
        this.meteors[i] = this._spawnMeteor();
        this.meteors[i].life = 0;
        continue;
      }
      m.head.addScaledVector(m.dir, m.speed * dt);
      const tail = m.head.clone().addScaledVector(m.dir, -m.length);
      pos[i * 6] = m.head.x;
      pos[i * 6 + 1] = m.head.y;
      pos[i * 6 + 2] = m.head.z;
      pos[i * 6 + 3] = tail.x;
      pos[i * 6 + 4] = tail.y;
      pos[i * 6 + 5] = tail.z;
      const a = Math.sin(m.life * Math.PI);
      col[i * 6] = 1 * a;
      col[i * 6 + 1] = 0.9 * a;
      col[i * 6 + 2] = 0.7 * a;
      col[i * 6 + 3] = 0;
      col[i * 6 + 4] = 0;
      col[i * 6 + 5] = 0;
    }
    this.meteorGeo.attributes.position.needsUpdate = true;
    this.meteorGeo.attributes.color.needsUpdate = true;
  }

  _updatePhotoStars(now) {
    const pulse = 0.85 + 0.15 * Math.sin((now / 1000) * 1.6);
    for (const [id, sprite] of this.photoSprites) {
      const isTarget = id === this.targetId;
      const ts = (isTarget ? 0.55 : 0.3) * pulse;
      sprite.scale.x += (ts - sprite.scale.x) * 0.14;
      sprite.scale.y = sprite.scale.x;
      sprite.material.opacity += ((isTarget ? 1 : 0.75) - sprite.material.opacity) * 0.14;
    }
  }

  _projectPhotos() {
    const v = new THREE.Vector3();
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.projections.clear();
    for (const p of this.photos) {
      v.copy(this._photoDir(p.id)).multiplyScalar(27);
      v.project(this.camera);
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      this.projections.set(p.id, { x, y, behind });
    }
  }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.starMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.starMaterial.dispose();
    if (this.meteorGeo) this.meteorGeo.dispose();
    if (this.meteorLine) this.meteorLine.material.dispose();
    if (this.photoGlowTexture) this.photoGlowTexture.dispose();
    if (this._glowSprites) {
      for (const s of this._glowSprites) {
        s.material.map.dispose();
        s.material.dispose();
      }
    }
    this.renderer.dispose();
    this.canvas.remove();
    if (this.label) this.label.remove();
  }
}
