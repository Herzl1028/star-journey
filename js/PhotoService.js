// ============================================================
//  数据访问层：默认 localStorage，接口已收敛，可无缝切换到 Supabase。
//  切换时只需替换下面三个方法的方法体（fetchPhotos / uploadPhoto / deletePhoto），
//  方法签名保持不变，其余 UI 无需改动。
// ============================================================

import { uid, randomStarPosition, makeDemoImage } from './utils.js';

const STORAGE_KEY = 'star-journey:photos';

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeStore(photos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
  } catch (e) {
    throw new Error('本地存储空间不足，请删除部分照片后重试');
  }
}

const DEMO = [
  { title: '冰岛的极光之夜', description: '在雷克雅未克郊外，等到了整片天空的绿色极光。', location: '冰岛 · 雷克雅未克', takenAt: '2026-01-12', from: '#1a2a6c', to: '#0f4c5c', accent: '#7fe3ff' },
  { title: '富士山的黎明', description: '清晨五点的富士山，山顶被染成了粉色。', location: '日本 · 山梨县', takenAt: '2026-02-03', from: '#2c3e50', to: '#e96443', accent: '#ffb0d0' },
  { title: '撒哈拉的星空', description: '没有光污染的沙漠夜晚，银河清晰可见。', location: '摩洛哥 · 梅尔祖卡', takenAt: '2026-03-21', from: '#141e30', to: '#243b55', accent: '#b18bff' },
  { title: '圣托里尼的日落', description: '蓝顶白墙与爱琴海的日落，像一场梦。', location: '希腊 · 圣托里尼', takenAt: '2026-04-08', from: '#355c7d', to: '#c06c84', accent: '#ffe9c9' },
  { title: '京都的红叶', description: '哲学之道两旁，枫叶红得像火。', location: '日本 · 京都', takenAt: '2025-11-18', from: '#42275a', to: '#734b6d', accent: '#ff9a8b' },
  { title: '新西兰的星空', description: '特卡波湖畔，肉眼可见南十字星。', location: '新西兰 · 特卡波', takenAt: '2026-05-30', from: '#0f2027', to: '#2c5364', accent: '#7aa2ff' },
];

function seedPhotos() {
  return DEMO.map((d) => ({
    id: uid(),
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

export const PhotoService = {
  // 拉取全部照片（首次为空时写入演示数据）
  async fetchPhotos() {
    let photos = readStore();
    if (!photos.length) {
      photos = seedPhotos();
      writeStore(photos);
    }
    return photos;
  },

  // 上传一张照片，返回完整 Photo 对象
  async uploadPhoto(input) {
    const photo = {
      id: uid(),
      createdAt: new Date().toISOString(),
      ...input,
    };
    const photos = readStore();
    photos.push(photo);
    writeStore(photos);
    return photo;
  },

  // 删除照片，返回更新后的列表
  async deletePhoto(id) {
    const photos = readStore().filter((p) => p.id !== id);
    writeStore(photos);
    return photos;
  },
};
