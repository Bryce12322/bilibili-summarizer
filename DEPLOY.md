# 🚀 部署到 Vercel

## ✅ 部署前检查清单

### 1. 代码检查

- [x] ✅ 方案 2（预下载上传）已实现
- [x] ✅ 构建成功（`npm run build`）
- [x] ✅ TypeScript 无错误
- [x] ✅ 核心功能完成

### 2. 环境变量

在 Vercel Dashboard 中设置以下环境变量：

**必需**：
```
DASHSCOPE_API_KEY=sk-xxx
```

**可选**：
```
# 如果要使用方案 1（代理模式），需要设置
AUDIO_PROXY_SECRET=your-random-secret-key
```

### 3. 文件清单

**核心代码**（已修改）：
- ✅ `src/lib/transcribe.ts` - 预下载上传实现
- ✅ `src/app/api/summarize/route.ts` - 删除旧代理逻辑
- ✅ `next.config.ts` - Next.js 配置

**新增文件**（文档和工具）：
- ✅ `src/lib/audio-proxy-token.ts` - Token 工具（方案1备用）
- ✅ `src/app/api/audio-proxy/route.ts` - 代理端点（方案1备用）
- ✅ `scripts/diagnose.ts` - 诊断工具
- ✅ `SOLUTION_2_READY.md` - 方案说明
- ✅ `SOLUTION_COMPARISON.md` - 方案对比
- ✅ `TESTING_GUIDE.md` - 测试指南
- ✅ `BUGFIX.md` - Bug 修复记录
- ✅ `DEPLOY.md` - 本文档

## 📦 部署步骤

### 步骤 1: 提交代码

```bash
# 添加所有修改的文件
git add .

# 创建提交
git commit -m "feat: 使用预下载上传方案解决 B站 403 问题（方案2）

- 实现预下载上传模式：从 B站 下载音频后上传给 Paraformer
- 移除旧的代理逻辑，避免递归代理 URL 问题
- 添加详细日志和错误处理
- 支持本地开发测试（不需要公网 URL）
- 支持最大 200MB 音频（约 60 分钟视频）

修复：
- 修复递归代理 URL 导致的 FILE_DOWNLOAD_FAILED 错误
- 修复 HEAD 请求状态码范围错误

文档：
- 添加测试指南和诊断工具
- 添加方案对比文档
- 添加 Bug 修复记录"
```

### 步骤 2: 推送到 GitHub

```bash
# 推送到当前分支（dev）
git push

# 或者推送到 main 分支（如果你想部署 main）
git checkout main
git merge dev
git push
```

### 步骤 3: Vercel 自动部署

Vercel 会自动检测到推送并开始部署：

1. **访问 Vercel Dashboard**
2. **找到你的项目**
3. **查看部署进度**

### 步骤 4: 配置环境变量

**在 Vercel Dashboard 中**：

1. 进入项目 → Settings → Environment Variables
2. 添加环境变量：
   - Name: `DASHSCOPE_API_KEY`
   - Value: `sk-xxx`（你的阿里云百炼 API Key）
3. 选择 Environment: Production, Preview, Development（全选）
4. 点击 Save

### 步骤 5: 重新部署（如果需要）

如果是在部署后才添加的环境变量：

1. 进入项目 → Deployments
2. 找到最新的部署
3. 点击 "Redeploy"

## 🧪 部署后测试

### 1. 访问部署的应用

```
https://your-project.vercel.app
```

### 2. 测试视频

输入任意 B站 视频 URL（推荐短视频 < 5 分钟）：

```
示例：使用 B站 热门视频
https://www.bilibili.com/v/popular/all
```

### 3. 验证日志

在 Vercel Dashboard → Functions → 查看日志：

**期待看到**：
```
✅ [Transcribe] Downloading audio from B站 CDN: https://...
✅ [Transcribe] Audio size: XX.XXMB
✅ [Transcribe] Downloaded XXXXXX bytes, uploading to Paraformer...
✅ [Transcribe] Task submitted successfully: xxx
```

**不应看到**：
```
❌ FILE_403_FORBIDDEN  # 已解决
❌ FILE_DOWNLOAD_FAILED  # 已解决（除非 URL 过期）
```

## ⚙️ Vercel 配置检查

### vercel.json

当前配置（香港区域）：
```json
{
  "regions": ["hkg1"]
}
```

这个配置对方案 2 也有帮助（更接近 B站 CDN）。

### next.config.ts

当前配置：
```typescript
{
  output: "standalone",  // Docker 部署支持
  images: {
    remotePatterns: [
      {
        hostname: "i0.hdslb.com",  // B站 图片域名
      },
    ],
  },
}
```

## 📊 性能考虑

### Vercel 限制

| 套餐 | 最大内存 | 执行超时 | 推荐视频时长 |
|------|---------|---------|-------------|
| Hobby (免费) | 1GB | 10s | < 10 分钟 |
| Pro | 3GB | 60s | < 60 分钟 |

### 当前配置

```typescript
// src/app/api/summarize/route.ts
export const maxDuration = 300;  // 5 分钟最大执行时间
```

**注意**：
- Vercel Hobby 套餐**实际超时是 10 秒**
- 上面的 300 秒配置在 Hobby 套餐无效
- Pro 套餐才能支持更长执行时间

### 建议

**Hobby 套餐**：
- 限制视频时长 < 10 分钟
- 或者在前端添加警告

**Pro 套餐**：
- 可支持 60 分钟视频
- 修改 `maxDuration` 为 60

## 🔧 故障排查

### 问题 1: 部署成功但无法访问

**检查**：
- Vercel URL 是否正确
- DNS 是否解析（如果使用自定义域名）

### 问题 2: 环境变量未生效

**解决**：
- 确认环境变量已保存
- 重新部署应用

### 问题 3: 仍然出现 403/404 错误

**排查**：

1. **403 错误**：
   - 检查代码是否正确部署
   - 查看 Vercel 函数日志

2. **404 错误**：
   - 正常现象（B站 URL 过期）
   - 让用户使用最新的视频

### 问题 4: 超时错误（Hobby 套餐）

**原因**：
- 视频太长（> 10 分钟）
- 下载/上传速度慢

**解决**：
- 限制视频时长
- 升级到 Pro 套餐
- 在前端添加时长检查

## 🎯 推荐的前端改进

### 1. 添加视频时长检查

```typescript
// 在前端提交前检查
if (videoDuration > 600) {  // 10 分钟
  alert("视频时长超过限制（最大 10 分钟）");
  return;
}
```

### 2. 添加进度提示

```typescript
// 显示详细进度
"正在下载音频... (这可能需要 30-60 秒)"
"正在上传音频..."
"正在语音识别..."
```

### 3. 添加错误处理

```typescript
// 针对常见错误提供友好提示
if (error.includes("404")) {
  showError("视频 URL 已过期，请尝试其他视频");
} else if (error.includes("timeout")) {
  showError("处理超时，请尝试更短的视频");
}
```

## 📈 监控建议

### Vercel Analytics

启用 Vercel Analytics 来监控：
- 函数执行时间
- 错误率
- 用户使用情况

### 关键指标

监控这些指标：
- ✅ 成功率：语音识别成功的比例
- ⏱️ 平均处理时间：从提交到完成的时间
- 📊 视频时长分布：了解用户使用习惯
- ❌ 错误类型分布：找到常见问题

## 🔄 未来优化

### 短期（已完成）

- [x] 实现预下载上传模式
- [x] 添加详细日志
- [x] 创建诊断工具
- [x] 编写完整文档

### 中期（建议）

- [ ] 添加前端时长检查
- [ ] 优化错误提示
- [ ] 添加重试逻辑
- [ ] 监控和分析

### 长期（可选）

- [ ] 添加音频缓存（如果频繁请求相同视频）
- [ ] 支持批量处理
- [ ] 支持更多视频平台
- [ ] 提供 API 接口

## 🎉 部署完成

部署成功后，你的应用将：

1. ✅ 解决 B站 403 防盗链问题
2. ✅ 支持本地和生产环境
3. ✅ 完整的错误处理和日志
4. ✅ 支持 60 分钟视频（200MB）

**访问你的应用**：
```
https://your-project.vercel.app
```

**分享给用户**，享受 AI 学习笔记生成！🎊

---

**部署时间**：约 2-3 分钟
**状态**：准备就绪 ✅
**下一步**：运行 `git add . && git commit && git push`
