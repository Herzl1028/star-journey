// ============================================================
//  应用编排：状态管理、照片查看器、上传、鼠标 / 键盘交互
//  （已移除手势识别：仅保留鼠标拖拽旋转、滚轮缩放、点击粒子打开）
// ============================================================

import { Starfield } from './Starfield.js';
import { PhotoViewer } from './PhotoViewer.js';
import { PhotoService } from './PhotoService.js';
import { randomStarPosition, fileToCompressedDataUrl, clamp } from './utils.js';

const $ = (id) => document.getElementById(id);

// ---------- 状态 ----------
let photos = [];
let selectedIndex = null;
let viewerScale = 1;

// ---------- DOM ----------
const starfieldEl = $('starfield');
const viewerEl = $('viewer');
const uploadBtn = $('upload-btn');
const uploadModal = $('upload-modal');
const toast = $('toast');
const hintText = $('hint-text');
const photoCount = $('photo-count');

const viewer = new PhotoViewer(viewerEl, {
  onClose: closeViewer,
  onPrev: () => stepViewer(-1),
  onNext: () => stepViewer(1),
  onScale: (d) => setScale(viewerScale + d),
  onDelete: deleteCurrent,
});

let starfield;

init();

async function init() {
  try {
    photos = await PhotoService.fetchPhotos();
  } catch (e) {
    toastMsg(e.message);
    photos = [];
  }
  photoCount.textContent = photos.length + ' 颗星';

  starfield = new Starfield(starfieldEl, {
    photos,
    onSelectPhoto: (id) => openPhoto(id),
  });

  hintText.textContent = '拖拽旋转 · 滚轮缩放 · 点击星尘打开照片';

  setupUpload();
  window.addEventListener('keydown', onKey);
  window.addEventListener(
    'wheel',
    (e) => {
      if (!viewer.isOpen) starfield.zoom(e.deltaY);
    },
    { passive: true }
  );
}

// ---------- 查看器 ----------
function openPhoto(id) {
  selectedIndex = photos.findIndex((p) => p.id === id);
  if (selectedIndex < 0) return;
  viewerScale = 1;
  const photo = photos[selectedIndex];
  viewer.open(photo, buildFlowingLines(photo));
  starfield.setDimmed(true);
  starfield.setTarget(null);
}

function closeViewer() {
  viewer.close();
  starfield.setDimmed(false);
}

function stepViewer(dir) {
  if (!photos.length) return;
  selectedIndex = (selectedIndex + dir + photos.length) % photos.length;
  viewerScale = 1;
  viewer.open(photos[selectedIndex], buildFlowingLines(photos[selectedIndex]), true);
  viewer.setScale(1);
}

function setScale(s) {
  viewerScale = clamp(s, 0.5, 3);
  viewer.setScale(viewerScale);
}

async function deleteCurrent() {
  if (selectedIndex == null) return;
  const id = photos[selectedIndex].id;
  if (!confirm('删除这颗照片星星？')) return;
  photos = await PhotoService.deletePhoto(id);
  photoCount.textContent = photos.length + ' 颗星';
  starfield.setPhotos(photos);
  if (!photos.length) {
    closeViewer();
    return;
  }
  selectedIndex = Math.min(selectedIndex, photos.length - 1);
  viewer.open(photos[selectedIndex], buildFlowingLines(photos[selectedIndex]));
}

function buildFlowingLines(photo) {
  const lines = [
    { text: photo.title || '未命名', color: '#ffe9c9', rx: 1.05, ry: 0.75, tilt: -0.1, dir: 1 },
    { text: photo.location || '未知地点', color: '#7fe3ff', rx: 1.25, ry: 0.9, tilt: 0.18, dir: -1 },
    { text: photo.description || '这段旅程，值得被记住', color: '#b18bff', rx: 1.45, ry: 1.05, tilt: -0.22, dir: 1 },
    { text: (photo.takenAt ? photo.takenAt + ' · ' : '') + (photo.author || '旅行者'), color: '#7aa2ff', rx: 1.65, ry: 1.2, tilt: 0.12, dir: -1 },
    { text: '✦ 星旅 · 旅行相册 ✦', color: '#ffb0d0', rx: 1.85, ry: 1.35, tilt: -0.06, dir: 1 },
  ];
  return lines.filter((l) => l.text.trim().length > 0);
}

// ---------- 键盘 fallback ----------
function onKey(e) {
  if (!viewer.isOpen) return;
  if (e.key === 'Escape') closeViewer();
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') stepViewer(-1);
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') stepViewer(1);
}

// ---------- 上传 ----------
function setupUpload() {
  const form = $('upload-form');
  const fileInput = $('file-input');
  const dropZone = $('drop-zone');
  const previewImg = $('preview-img');
  const dropHint = $('drop-hint');
  const submit = $('upload-submit');
  let file = null;

  uploadBtn.onclick = () => uploadModal.classList.remove('hidden');
  $('upload-cancel').onclick = () => uploadModal.classList.add('hidden');
  dropZone.onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    file = e.target.files[0];
    if (file) showPreview(file);
  };
  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('drag');
  };
  dropZone.ondragleave = () => dropZone.classList.remove('drag');
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag');
    file = e.dataTransfer.files[0];
    if (file) showPreview(file);
  };

  function showPreview(f) {
    const reader = new FileReader();
    reader.onload = () => {
      previewImg.src = reader.result;
      previewImg.classList.remove('hidden');
      dropHint.classList.add('hidden');
      submit.disabled = false;
    };
    reader.readAsDataURL(f);
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const title = $('f-title').value.trim();
    if (!title) {
      toastMsg('请填写标题');
      return;
    }
    if (!file) {
      toastMsg('请选择照片');
      return;
    }
    submit.disabled = true;
    submit.textContent = '上传中…';
    try {
      const imageUrl = await fileToCompressedDataUrl(file);
      const author = $('f-author').value.trim() || '旅行者';
      localStorage.setItem('star-journey:nickname', author);
      const photo = await PhotoService.uploadPhoto({
        title,
        description: $('f-desc').value.trim(),
        location: $('f-location').value.trim(),
        takenAt: $('f-taken').value || undefined,
        author,
        imageUrl,
        starPosition: randomStarPosition(),
      });
      photos.push(photo);
      photoCount.textContent = photos.length + ' 颗星';
      starfield.setPhotos(photos);
      uploadModal.classList.add('hidden');
      resetForm();
      toastMsg('✨ 照片已化作星尘');
      setTimeout(() => {
        const p = starfield.projections.get(photo.id);
        if (p) animateFly(imageUrl, uploadBtn.getBoundingClientRect(), p);
      }, 120);
    } catch (err) {
      toastMsg(err.message || '上传失败');
    } finally {
      submit.disabled = false;
      submit.textContent = '上传';
    }
  };

  function resetForm() {
    form.reset();
    file = null;
    previewImg.classList.add('hidden');
    previewImg.src = '';
    dropHint.classList.remove('hidden');
    submit.disabled = true;
  }
}

function animateFly(image, fromRect, toPoint) {
  const el = document.createElement('img');
  el.src = image;
  el.className = 'fly-photo';
  el.style.left = fromRect.left + 'px';
  el.style.top = fromRect.top + 'px';
  el.style.width = '36px';
  el.style.height = '36px';
  document.body.appendChild(el);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.style.transform =
        'translate(' +
        (toPoint.x - fromRect.left - 18) +
        'px, ' +
        (toPoint.y - fromRect.top - 18) +
        'px) scale(0.6) rotate(30deg)';
      el.style.opacity = '0.95';
    })
  );
  setTimeout(() => el.remove(), 1400);
}

// ---------- Toast ----------
let toastTimer;
function toastMsg(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
