// ============================================================
//  数据访问层：Supabase 云端共享。
//  - 照片元数据存 public.photos 表
//  - 图片文件存 Storage bucket "photos"（公开读）
//  接口保持 fetchPhotos / uploadPhoto / deletePhoto 不变，UI 无需改动。
// ============================================================

import { uid, randomStarPosition, makeDemoImage } from './utils.js';

// ↓↓↓ Supabase 项目信息 ↓↓↓
const SUPABASE_URL = 'https://andruockdigegygqgnqj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZHJ1b2NrZGlnZWd5Z3FnbnFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0OTg0ODcsImV4cCI6MjEwMjA3NDQ4N30.uyNt8WEA5_v8lhxMwbtP6edpcYjDCLEg-I6J9rAaVGM';
const BUCKET = 'photos';
// ↑↑↑

const supabase = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- 字段映射：数据库 snake_case ↔ 前端 camelCase ----------
function rowToPhoto(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description || '',
    location: r.location || '',
    takenAt: r.taken_at || '',
    author: r.author || '旅行者',
    imageUrl: r.image_url,
    starPosition: r.star_position || { x: 0, y: 0, z: 0 },
    createdAt: r.created_at,
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
    star_position: p.starPosition,
  };
}

// ---------- 图片：dataURL → Storage → 公开 URL ----------
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function uploadImage(dataUrl, filename) {
  const blob = await dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage.from(BUCKET).upload(filename, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error('图片上传失败：' + error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(filename).data.publicUrl;
}

// ---------- 演示数据（首次为空时写入云端，固定 id 幂等，避免并发重复） ----------
const DEMO = [
  { title: '冰岛的极光之夜', description: '在雷克雅未克郊外，等到了整片天空的绿色极光。', location: '冰岛 · 雷克雅未克', takenAt: '2026-01-12', from: '#1a2a6c', to: '#0f4c5c', accent: '#7fe3ff' },
  { title: '富士山的黎明', description: '清晨五点的富士山，山顶被染成了粉色。', location: '日本 · 山梨县', takenAt: '2026-02-03', from: '#2c3e50', to: '#e96443', accent: '#ffb0d0' },
  { title: '撒哈拉的星空', description: '没有光污染的沙漠夜晚，银河清晰可见。', location: '摩洛哥 · 梅尔祖卡', takenAt: '2026-03-21', from: '#141e30', to: '#243b55', accent: '#b18bff' },
  { title: '圣托里尼的日落', description: '蓝顶白墙与爱琴海的日落，像一场梦。', location: '希腊 · 圣托里尼', takenAt: '2026-04-08', from: '#355c7d', to: '#c06c84', accent: '#ffe9c9' },
  { title: '京都的红叶', description: '哲学之道两旁，枫叶红得像火。', location: '日本 · 京都', takenAt: '2025-11-18', from: '#42275a', to: '#734b6d', accent: '#ff9a8b' },
  { title: '新西兰的星空', description: '特卡波湖畔，肉眼可见南十字星。', location: '新西兰 · 特卡波', takenAt: '2026-05-30', from: '#0f2027', to: '#2c5364', accent: '#7aa2ff' },
];

function demoPhotos() {
  return DEMO.map((d, i) => ({
    id: 'demo-' + (i + 1),
    title: d.title,
    description: d.description,
    location: d.location,
    takenAt: d.takenAt,
    author: '旅行者',
    imageUrl: makeDemoImage(d.title, d.from, d.to, d.accent),
    starPosition: randomStarPosition(),
    createdAt: new Date().toISOString(),
  }));
}

async function seedIfEmpty() {
  const { count, error } = await supabase
    .from('photos')
    .select('*', { count: 'exact', head: true });
  if (error) throw new Error('读取失败：' + error.message);
  if (count && count > 0) return;
  for (const d of demoPhotos()) {
    const url = await uploadImage(d.imageUrl, d.id + '.jpg');
    const { error: e } = await supabase
      .from('photos')
      .upsert(photoToRow({ ...d, imageUrl: url }), { onConflict: 'id' });
    if (e) throw new Error('初始化失败：' + e.message);
  }
}

export const PhotoService = {
  // 拉取全部照片（首次为空时写入演示数据）
  async fetchPhotos() {
    const { count, error: cErr } = await supabase
      .from('photos')
      .select('*', { count: 'exact', head: true });
    if (cErr) throw new Error('连接失败：' + cErr.message);
    if (!count) await seedIfEmpty();
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error('读取失败：' + error.message);
    return (data || []).map(rowToPhoto);
  },

  // 上传一张照片，返回完整 Photo 对象
  async uploadPhoto(input) {
    const photo = { id: uid(), createdAt: new Date().toISOString(), ...input };
    const url = await uploadImage(photo.imageUrl, photo.id + '.jpg');
    const { error } = await supabase
      .from('photos')
      .insert(photoToRow({ ...photo, imageUrl: url }));
    if (error) throw new Error('上传失败：' + error.message);
    return { ...photo, imageUrl: url };
  },

  // 删除照片，返回更新后的列表
  async deletePhoto(id) {
    const { data: row } = await supabase
      .from('photos')
      .select('image_url')
      .eq('id', id)
      .single();
    const { error } = await supabase.from('photos').delete().eq('id', id);
    if (error) throw new Error('删除失败：' + error.message);
    if (row && row.image_url) {
      try {
        const name = row.image_url.split('/').pop();
        await supabase.storage.from(BUCKET).remove([name]);
      } catch {}
    }
    const { data, error: rErr } = await supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false });
    if (rErr) throw new Error('读取失败：' + rErr.message);
    return (data || []).map(rowToPhoto);
  },
};
