// ============================================================
//  数据访问层：腾讯云开发 CloudBase（国内直连）。
//  - 照片元数据存 SQL 型数据库（MySQL）photos 表
//  - 图片文件存云存储 photos/ 目录（表里存 fileID，读取时换临时链接）
//  接口保持 fetchPhotos / uploadPhoto / deletePhoto 不变，UI 无需改动。
// ============================================================

import { uid, makeDemoImage } from './utils.js';

const ENV_ID = 'star-journey-d4g9eulgn1ef88daa';
const STORAGE_DIR = 'photos/';

const app = globalThis.cloudbase.init({ env: ENV_ID });
const auth = app.auth();
const db = app.rdb(); // 关系型数据库（MySQL）

// ---------- 匿名登录（幂等，兼容新旧 SDK 写法） ----------
let loginPromise;
function ensureLogin() {
  if (!loginPromise) loginPromise = doLogin();
  return loginPromise;
}
async function doLogin() {
  if (typeof auth.signInAnonymously === 'function') {
    const r = await auth.signInAnonymously();
    if (r && r.error) throw new Error('登录失败：' + (r.error.message || r.error));
    return;
  }
  if (typeof auth.anonymousAuthProvider === 'function') {
    await auth.anonymousAuthProvider().signIn();
    return;
  }
  throw new Error('当前 SDK 不支持匿名登录');
}

// ---------- 字段映射：数据库 snake_case ↔ 前端 camelCase ----------
function rowToPhoto(r) {
  return {
    id: r.id,
    title: r.title || '',
    description: r.description || '',
    location: r.location || '',
    takenAt: r.taken_at || '',
    author: r.author || '旅行者',
    imageUrl: r.image_url || '',
    createdAt: r.created_at || '',
  };
}

function photoToRow(p) {
  return {
    id: p.id,
    title: p.title,
    description: p.description || '',
    location: p.location || '',
    taken_at: p.takenAt || null,
    author: p.author || '旅行者',
    image_url: p.imageUrl,
  };
}

// ---------- 图片：dataURL → File → 云存储 ----------
function dataUrlToFile(dataUrl, filename) {
  const m = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!m) throw new Error('图片数据格式错误');
  const mime = m[1] || 'image/jpeg';
  const bin = atob(m[2]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

async function uploadImage(dataUrl, filename) {
  const file = dataUrlToFile(dataUrl, filename);
  const res = await app.uploadFile({ cloudPath: STORAGE_DIR + filename, filePath: file });
  return res.fileID; // cloud://...
}

// fileID 批量换临时链接（供 img.src 直接显示）
async function resolveUrls(list) {
  const ids = list.map((p) => p.imageUrl).filter(Boolean);
  if (!ids.length) return list;
  try {
    const res = await app.getTempFileURL({ fileList: ids });
    const map = {};
    for (const it of res.fileList || []) map[it.fileID] = it.tempFileURL;
    return list.map((p) => ({ ...p, imageUrl: map[p.imageUrl] || p.imageUrl }));
  } catch {
    return list;
  }
}

// ---------- 演示数据（首次为空时写入云端） ----------
const DEMO = [
  { title: '冰岛的极光之夜', description: '在雷克雅未克郊外，等到了整片天空的绿色极光。', location: '冰岛 · 雷克雅未克', takenAt: '2026-01-12', from: '#1a2a6c', to: '#0f4c5c', accent: '#7fe3ff' },
  { title: '富士山的黎明', description: '清晨五点的富士山，山顶被染成了粉色。', location: '日本 · 山梨县', takenAt: '2026-02-03', from: '#2c3e50', to: '#e96443', accent: '#ffb0d0' },
  { title: '撒哈拉的星空', description: '没有光污染的沙漠夜晚，银河清晰可见。', location: '摩洛哥 · 梅尔祖卡', takenAt: '2026-03-21', from: '#141e30', to: '#243b55', accent: '#b18bff' },
  { title: '圣托里尼的日落', description: '蓝顶白墙与爱琴海的日落，像一场梦。', location: '希腊 · 圣托里尼', takenAt: '2026-04-08', from: '#355c7d', to: '#c06c84', accent: '#ffe9c9' },
  { title: '京都的红叶', description: '哲学之道两旁，枫叶红得像火。', location: '日本 · 京都', takenAt: '2025-11-18', from: '#42275a', to: '#734b6d', accent: '#ff9a8b' },
  { title: '新西兰的星空', description: '特卡波湖畔，肉眼可见南十字星。', location: '新西兰 · 特卡波', takenAt: '2026-05-30', from: '#0f2027', to: '#2c5364', accent: '#7aa2ff' },
];

function demoPhotos() {
  return DEMO.map((d) => ({
    title: d.title,
    description: d.description,
    location: d.location,
    takenAt: d.takenAt,
    author: '旅行者',
    imageUrl: makeDemoImage(d.title, d.from, d.to, d.accent),
  }));
}

async function seedIfEmpty() {
  for (const d of demoPhotos()) {
    const id = uid();
    const fileId = await uploadImage(d.imageUrl, 'demo-' + id + '.jpg');
    const { error } = await db
      .from('photos')
      .insert(photoToRow({ ...d, id, imageUrl: fileId }));
    if (error) throw new Error('初始化失败：' + (error.message || error));
  }
}

async function queryAll() {
  const { data, error } = await db
    .from('photos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || error);
  return (data || []).map(rowToPhoto);
}

export const PhotoService = {
  // 拉取全部照片（首次为空时写入演示数据）
  async fetchPhotos() {
    await ensureLogin();
    let photos = [];
    try {
      photos = await queryAll();
    } catch (e) {
      throw new Error('读取失败：' + (e.message || e));
    }
    if (!photos.length) {
      try {
        await seedIfEmpty();
        photos = await queryAll();
      } catch (e) {
        throw new Error('初始化失败：' + (e.message || e));
      }
    }
    return resolveUrls(photos);
  },

  // 上传一张照片，返回完整 Photo 对象
  async uploadPhoto(input) {
    await ensureLogin();
    const id = uid();
    const fileId = await uploadImage(input.imageUrl, id + '.jpg');
    const photo = {
      id,
      title: input.title,
      description: input.description || '',
      location: input.location || '',
      takenAt: input.takenAt || '',
      author: input.author || '旅行者',
      imageUrl: fileId,
      createdAt: new Date().toISOString(),
    };
    const { error } = await db.from('photos').insert(photoToRow(photo));
    if (error) throw new Error('上传失败：' + (error.message || error));
    const [resolved] = await resolveUrls([photo]);
    return resolved;
  },

  // 删除照片，返回更新后的列表
  async deletePhoto(id) {
    await ensureLogin();
    try {
      const { data } = await db.from('photos').select('image_url').eq('id', id).single();
      if (data && data.image_url) {
        await app.deleteFile({ fileList: [data.image_url] });
      }
    } catch (e) {}
    await db.from('photos').delete().eq('id', id);
    return resolveUrls(await queryAll());
  },
};
