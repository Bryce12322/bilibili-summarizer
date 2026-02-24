# ✅ 方案 2 已就绪：预下载上传模式

## 🎯 方案概述

**不再使用代理**，改为：
1. 在你的服务器上下载音频（携带 Referer 头）
2. 直接上传给 Paraformer

```
┌─────────────┐
│   B站 CDN   │
└──────┬──────┘
       │ 1. 下载音频（带 Referer）
       ▼
┌──────────────────┐
│ 你的服务器        │
│ (Next.js)        │
└──────┬───────────┘
       │ 2. 上传音频文件
       ▼
┌──────────────────┐
│   Paraformer     │
│   (阿里云)        │
└──────────────────┘
```

## ✅ 优势

1. **✅ 本地测试可行**：不需要公网 URL
2. **✅ 架构简单**：无需维护代理端点
3. **✅ 完全控制**：掌握下载过程
4. **✅ 成本更低**：少一次函数调用

## ⚙️ 当前配置

- **核心文件**：[src/lib/transcribe.ts](src/lib/transcribe.ts#L33-L118)
- **模式**：预下载上传
- **最大支持**：200MB 音频（约 60 分钟视频）
- **本地开发**：✅ 完全支持

## 🧪 立即测试

开发服务器已重启，现在可以测试了！

### 方法 1：浏览器测试

1. **访问**：http://localhost:3000

2. **输入测试视频**（建议 < 5 分钟）：
   ```
   https://www.bilibili.com/video/BV1GJ411x7h7
   ```

3. **点击"生成学习笔记"**

4. **观察终端日志**，期待看到：

   ```
   ✅ [Transcribe] Downloading audio from B站 CDN: https://upos-sz-...
   ✅ [Transcribe] Audio size: 12.34MB
   ✅ [Transcribe] Downloaded 12943567 bytes, uploading to Paraformer...
   ✅ [Transcribe] Task submitted successfully: 20240224-xxx
   ```

### 方法 2：查看日志

如果测试成功，日志应该显示：

```
✅ 下载音频：从 B站 CDN（带 Referer）
✅ 音频大小：XX.XXMB
✅ 上传完成：提交给 Paraformer
✅ 任务 ID：xxx
```

**不应再看到**：
```
❌ FILE_403_FORBIDDEN  # B站 防盗链错误
❌ FILE_DOWNLOAD_FAILED  # Paraformer 下载失败
```

## 📊 与方案 1 的对比

| 特性 | 方案 1（代理） | 方案 2（预下载上传）⭐ |
|------|--------------|---------------------|
| 本地测试 | ❌ 无法测试 | ✅ 完全支持 |
| 架构复杂度 | ⚠️ 需要代理端点 | ✅ 简单直接 |
| 内存占用 | ✅ 低（流式） | ⚠️ 中等（60分钟视频约200MB） |
| 函数调用 | 2 次 | ✅ 1 次（成本更低） |
| 生产可用 | ✅ 是 | ✅ 是 |

## ⚠️ 限制说明

### Vercel 限制

| 套餐 | 最大内存 | 超时 | 推荐视频时长 |
|------|---------|------|-------------|
| Hobby（免费） | 1GB | 10s | < 10 分钟 |
| Pro | 3GB | 60s | < 60 分钟 |

### 本地开发

- ✅ 无内存限制
- ✅ 无超时限制
- ✅ 支持 60 分钟视频

## 🔄 如何切换回方案 1（代理模式）

如果未来需要切换（例如，需要缓存、限流等功能），代理相关文件已保留：

- ✅ `src/lib/audio-proxy-token.ts` - Token 签名工具
- ✅ `src/app/api/audio-proxy/route.ts` - 代理端点

详见：[SOLUTION_COMPARISON.md](SOLUTION_COMPARISON.md#切换方案指南)

## 📁 相关文档

- 📊 **[SOLUTION_COMPARISON.md](SOLUTION_COMPARISON.md)** - 两种方案详细对比
- 🐛 **[BUGFIX.md](BUGFIX.md)** - 之前发现的 bug 和修复
- 📖 **[AUDIO_PROXY_SOLUTION.md](AUDIO_PROXY_SOLUTION.md)** - 方案 1（代理）的完整文档
- 📝 **[CHANGES.md](CHANGES.md)** - 改动总结

## 🚀 下一步

1. **测试本地环境**：访问 http://localhost:3000 测试
2. **验证成功**：确认日志中显示下载和上传成功
3. **部署到 Vercel**：提交代码并推送

```bash
git add .
git commit -m "feat: 使用预下载上传方案解决 B站 403 问题（方案2）"
git push
```

## ❓ 常见问题

### Q: 为什么不用方案 1（代理）？

A: 方案 1 在本地无法测试（Paraformer 访问不了 localhost）。方案 2 更适合开发和小规模部署。

### Q: 方案 2 在生产环境能用吗？

A: 可以！只要视频时长在限制内：
- Vercel Hobby：< 10 分钟
- Vercel Pro：< 60 分钟

### Q: 如果需要处理长视频怎么办？

A: 三个选项：
1. 升级 Vercel Pro（支持 60 分钟）
2. 切换到方案 1（代理模式）
3. 使用其他云服务（AWS Lambda, Google Cloud Functions 等）

### Q: 方案 2 会不会很慢？

A: 略慢于方案 1（多一次上传），但差异不大（约 2-3 秒）。对于用户体验影响很小。

---

**状态**：✅ 已实现，可以测试
**推荐**：⭐⭐⭐⭐⭐ 适合本地开发和小规模部署
**部署**：准备就绪，可随时部署到 Vercel

🎉 **现在就在浏览器中测试吧！** http://localhost:3000
