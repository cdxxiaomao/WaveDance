# WaveDance 官网

这是一个独立的静态官网目录，不影响现有 Tauri 前端代码。

## 目录结构

- `index.html`：官网主页面
- `styles.css`：样式文件
- `main.js`：基础交互逻辑
- `assets/`：静态资源（预览图等）

## 本地预览（热更新）

首次进入 `website` 目录后安装依赖：

```bash
cd website
npm install
```

启动开发服务器：

```bash
npm run dev
```

浏览器访问：`http://localhost:8080`

## 发布建议

可直接部署到 GitHub Pages、Netlify、Vercel 等静态托管平台，发布根目录设置为 `website` 即可。

## 上线前需要替换

1. `index.html` 中 `#downloadButton` 的下载链接（目前是占位符 `#`）
2. “查看源码仓库”链接（目前默认指向 `https://github.com`）
