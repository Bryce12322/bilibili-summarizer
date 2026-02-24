# 音频 403 问题解决方案对比

## 方案演进历史

### ❌ 原始方案：直接传 URL
```typescript
submitTranscription(biliAudioUrl)
  ↓ 传给 Paraformer
  ↓ Paraformer 直接访问 B站 CDN（无 Referer）
  ↓ 403 Forbidden ❌
```

**问题**：Paraformer 无法携带 `Referer` 头，被 B站 CDN 拒绝

---

### ✅ 方案 1：音频代理（适合生产环境）

**架构**：
```
B站 CDN → 你的代理服务器(带 Referer) → Paraformer
```

**实现**：
- 创建 `/api/audio-proxy` 端点
- 生成签名 token（防滥用）
- 代理从 B站 拉取音频，透传给 Paraformer

**优势**：
- ✅ 完全控制请求过程
- ✅ 可添加缓存、监控、限流
- ✅ 安全性高（HMAC 签名）
- ✅ 不占用 Serverless 函数内存

**劣势**：
- ❌ 本地测试不可行（Paraformer 无法访问 localhost）
- ❌ 增加一层网络中转
- ❌ 需要维护代理端点

**适用场景**：
- ✅ 部署到 Vercel/云服务器（公网访问）
- ✅ 需要缓存、监控、限流等高级功能
- ✅ 关注安全性

**文件**：
- `src/lib/audio-proxy-token.ts` - Token 签名
- `src/app/api/audio-proxy/route.ts` - 代理端点

---

### ✅ 方案 2：预下载上传（当前方案，推荐）⭐

**架构**：
```
B站 CDN → 你的服务器下载(带 Referer) → 上传给 Paraformer
```

**实现**：
```typescript
// 1. 下载音频（携带 Referer）
const audioResponse = await fetch(audioUrl, {
  headers: { Referer: "https://www.bilibili.com" }
});
const audioBlob = await audioResponse.blob();

// 2. 上传给 Paraformer
const formData = new FormData();
formData.append("file", audioBlob, "audio.m4s");
await fetch(paraformerAPI, { body: formData });
```

**优势**：
- ✅ 本地测试可行（不需要公网 URL）
- ✅ 完全控制下载过程
- ✅ 架构简单，无需额外端点
- ✅ 适合本地开发和调试

**劣势**：
- ⚠️ 占用 Serverless 函数内存（最大 1GB 免费版）
- ⚠️ 大文件可能超时（Vercel 免费版 10 秒）
- ⚠️ 增加函数执行时间

**内存和超时限制**：

| 环境 | 最大内存 | 超时限制 | 最大音频 |
|------|---------|---------|---------|
| Vercel Hobby | 1GB | 10s | ~30MB (约10分钟视频) |
| Vercel Pro | 3GB | 60s | ~200MB (约60分钟视频) |
| 本地开发 | 无限制 | 无限制 | ~200MB |

**适用场景**：
- ✅ 本地开发和测试
- ✅ 短视频（< 10 分钟）
- ✅ Vercel Pro 套餐（支持 60 分钟视频）
- ✅ 不需要缓存、限流等功能

**文件**：
- `src/lib/transcribe.ts` - 下载并上传音频

---

## 当前实现：方案 2（预下载上传）

### 为什么选择方案 2？

1. **本地测试需求**：方案 1 无法在本地测试（Paraformer 访问不了 localhost）
2. **简单性**：方案 2 无需维护额外的代理端点
3. **灵活性**：可以随时切换回方案 1（部署时）

### 代码位置

**核心实现**：[src/lib/transcribe.ts:33-118](src/lib/transcribe.ts#L33-L118)

```typescript
export async function submitTranscription(audioUrl: string): Promise<string> {
  // 1. 从 B站 CDN 下载音频（携带 Referer 头）
  const audioResponse = await fetch(audioUrl, {
    headers: BILIBILI_HEADERS, // 包含 Referer
  });

  // 2. 检查大小
  const audioBlob = await audioResponse.blob();

  // 3. 上传给 Paraformer
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.m4s");

  const res = await fetch(`${DASHSCOPE_BASE}/services/audio/asr/transcription`, {
    method: "POST",
    body: formData,
  });

  return taskId;
}
```

### 日志输出

**成功时**：
```
[Transcribe] Downloading audio from B站 CDN: https://upos-sz-...
[Transcribe] Audio size: 12.34MB
[Transcribe] Downloaded 12943567 bytes, uploading to Paraformer...
[Transcribe] Task submitted successfully: 20240224-xxx
```

---

## 切换方案指南

### 从方案 2 切换到方案 1

如果需要部署到生产环境，且希望使用代理方案：

**步骤 1**：恢复代理相关文件

```bash
# 这些文件已经存在，只是当前未使用
- src/lib/audio-proxy-token.ts ✅
- src/app/api/audio-proxy/route.ts ✅
```

**步骤 2**：修改 `transcribe.ts`

```typescript
export async function submitTranscription(
  audioUrl: string,
  useProxy = true  // 启用代理
): Promise<string> {
  if (useProxy) {
    const { generateAudioProxyUrl } = await import("@/lib/audio-proxy-token");
    audioUrl = generateAudioProxyUrl(audioUrl);
  }

  // 使用 URL 模式而不是上传模式
  const res = await fetch(`${DASHSCOPE_BASE}/services/audio/asr/transcription`, {
    body: JSON.stringify({
      model: "paraformer-v2",
      input: { file_urls: [audioUrl] },  // 传 URL
    }),
  });
}
```

**步骤 3**：设置环境变量

```bash
# Vercel Dashboard → Environment Variables
DASHSCOPE_API_KEY=sk-xxx
AUDIO_PROXY_SECRET=random-secret-key  # 可选
```

### 从方案 1 切换到方案 2

如果需要本地测试，或者想简化架构：

**当前已实现** ✅

---

## 性能对比

### 方案 1：音频代理

```
用户请求 → 解析视频 → 生成代理 URL → 提交任务 → Paraformer 请求代理
                                                  ↓
                                         代理下载音频 → 透传
时间：        1s          0.5s        0.2s          5-10s
                                                (取决于音频大小)
```

**总耗时**：约 6-12 秒（取决于音频大小）

### 方案 2：预下载上传

```
用户请求 → 解析视频 → 下载音频 → 上传音频 → Paraformer 处理
时间：        1s          5-10s      2-5s        0.5s
```

**总耗时**：约 8-16 秒（取决于音频大小和网络）

**结论**：方案 1 略快（少一次上传），但差异不大。

---

## 成本对比

### 方案 1：音频代理

**Vercel 函数调用**：
- `/api/summarize`：执行 30-60 秒
- `/api/audio-proxy`：执行 5-10 秒（传输音频）

**总执行时间**：35-70 秒
**函数调用次数**：2 次

**带宽消耗**：
- 下载音频：1 次（B站 → Vercel）
- 上传音频：1 次（Vercel → Paraformer）

### 方案 2：预下载上传

**Vercel 函数调用**：
- `/api/summarize`：执行 30-60 秒（包含下载上传时间）

**总执行时间**：30-60 秒
**函数调用次数**：1 次

**带宽消耗**：
- 下载音频：1 次（B站 → Vercel）
- 上传音频：1 次（Vercel → Paraformer）

**结论**：方案 2 成本更低（少一次函数调用）

---

## 推荐策略

### 开发阶段（当前）

✅ **使用方案 2（预下载上传）**

原因：
- 可以本地测试
- 架构简单
- 快速迭代

### 生产部署（小规模）

✅ **继续使用方案 2**

适用条件：
- 日访问量 < 1000 次
- 视频时长 < 10 分钟（Vercel Hobby）
- 或已升级 Vercel Pro（支持 60 分钟视频）

### 生产部署（大规模）

✅ **切换到方案 1（音频代理）**

适用条件：
- 日访问量 > 1000 次
- 需要缓存、监控、限流
- 需要更好的性能
- 预算允许（多一次函数调用）

---

## 最佳实践

### 当前配置（方案 2）

```typescript
// src/lib/transcribe.ts
export async function submitTranscription(audioUrl: string) {
  // 预下载上传模式（当前实现）
  const audioBlob = await fetch(audioUrl, {
    headers: { Referer: "https://www.bilibili.com" }
  }).then(r => r.blob());

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.m4s");

  return await uploadToParaformer(formData);
}
```

### 生产优化建议

1. **添加大小检查**（已实现 ✅）
   ```typescript
   if (sizeMB > 200) {
     throw new Error("音频文件过大");
   }
   ```

2. **添加超时控制**
   ```typescript
   const controller = new AbortController();
   setTimeout(() => controller.abort(), 30000); // 30 秒超时

   await fetch(audioUrl, { signal: controller.signal });
   ```

3. **添加重试逻辑**
   ```typescript
   let retries = 3;
   while (retries > 0) {
     try {
       return await downloadAndUpload();
     } catch (e) {
       retries--;
       if (retries === 0) throw e;
       await sleep(1000);
     }
   }
   ```

---

## 总结

| 特性 | 方案 1（代理） | 方案 2（预下载上传） |
|------|--------------|-------------------|
| 本地测试 | ❌ 不可行 | ✅ 可行 |
| 部署复杂度 | ⚠️ 中等（需要代理端点） | ✅ 简单 |
| 内存占用 | ✅ 低（流式传输） | ⚠️ 高（内存中处理） |
| 执行时间 | ✅ 较快 | ⚠️ 略慢 |
| 成本 | ⚠️ 高（2 次函数调用） | ✅ 低（1 次函数调用） |
| 扩展性 | ✅ 高（可加缓存、限流） | ⚠️ 低 |
| 安全性 | ✅ 高（token 签名） | ✅ 中等 |

**当前选择**：✅ 方案 2（预下载上传）

**原因**：
1. 适合本地开发和测试
2. 架构简单，易于维护
3. 成本较低
4. 满足当前需求（短视频）

**未来考虑**：
- 如果日访问量增加 → 切换到方案 1
- 如果需要处理长视频（> 30 分钟）→ 升级 Vercel Pro + 继续使用方案 2
- 如果需要高级功能（缓存、限流）→ 切换到方案 1

---

**最后更新**：2026-02-24
**当前方案**：方案 2（预下载上传）
**状态**：✅ 已实现，待测试
