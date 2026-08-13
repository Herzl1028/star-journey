# 星旅 · 旅行相册社区

所有上传的照片都会化作星空中的一粒星尘。通过鼠标在银河中漫游、缩放，点击星尘查看完整照片。

## 特性

- **真实银河**：深空背景星（真实黑体色温分布）+ 银河带（核球、旋臂尘埃带、暖核冷臂渐变、粉色 HII 区）+ 核球辉光与星云光斑，缓慢自转。
- **粒子化照片**：照片化作微弱的星尘粒子融入银河，悬停时微微变亮并显示标题，点击打开完整大图。
- **鼠标交互**：拖拽旋转视角、滚轮缩放远近。
- **图片查看器**：星空自动模糊暗化，照片带光晕，周边 3–5 条椭圆轨道流动光带文字（标题 / 描述 / 地点 / 时间 / 昵称），滚轮缩放、方向键切换、ESC 关闭。
- **本地持久化**：默认 `localStorage`，数据访问层封装为 `PhotoService`，预留 Supabase 接口。

## 运行

本包无需 npm 构建。任选其一：

```bash
# 方式 1：npx 静态服务器
npx serve star-journey

# 方式 2：Python
cd star-journey && python -m http.server 8000

# 方式 3：VS Code 右键 index.html → Open with Live Server
```

然后浏览器打开 `http://localhost:8000`。

> Three.js 通过 CDN（jsDelivr）加载，首次打开需联网。

## 目录结构

```
star-journey/
├── index.html            入口 + import map + UI 骨架
├── styles.css            全部样式
└── js/
    ├── main.js           应用编排（状态、查看器、上传、鼠标交互）
    ├── Starfield.js      Three.js 真实银河星空（背景星/银河带/星云/流星/照片粒子）
    ├── PhotoViewer.js    图片查看器 + 流动光带文字
    ├── PhotoService.js   数据存储层（localStorage，预留 Supabase）
    └── utils.js          压缩、随机星位、演示图等工具
```

## 接入 Supabase

`PhotoService.js` 已把数据读写收敛为 `fetchPhotos / uploadPhoto / deletePhoto` 三个方法。接入真实后端时，只需将方法体替换为 Supabase 调用（`@supabase/supabase-js`），接口签名保持不变：

```js
// fetchPhotos   -> supabase.from('photos').select('*').order('created_at')
// uploadPhoto   -> supabase.from('photos').insert({...}).select().single()
// deletePhoto   -> supabase.from('photos').delete().eq('id', id)
```

## 浏览器支持

需支持 ES Modules、Import Map、WebGL（Chrome / Edge / Safari 现代版本）。
