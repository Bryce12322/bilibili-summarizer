# 🧪 测试指南 - 方案 2（预下载上传）

## ✅ 当前状态

- ✅ **代码已更新**：使用预下载上传模式
- ✅ **构建成功**：无编译错误
- ✅ **服务器运行**：http://localhost:3000
- ⚠️ **测试注意**：需要使用有效的视频 URL

## 🔍 诊断工具

我已经创建了一个诊断脚本来帮助你测试视频 URL 是否有效：

```bash
npx tsx scripts/diagnose.ts <B站视频URL>
```

**示例**：
```bash
npx tsx scripts/diagnose.ts "https://www.bilibili.com/video/BV1234567890"
```

这个脚本会：
1. ✅ 解析 BV 号
2. ✅ 获取视频信息（标题、时长）
3. ✅ 获取音频流地址
4. ✅ 测试音频是否可下载
5. ✅ 完整下载测试

## ⚠️ 常见问题：音频 URL 404

### 问题症状

```
❌ 音频 URL 无法访问 (HTTP 404): Not Found
```

或者在 Web 界面看到：
```
从 B站 CDN 下载音频失败 (HTTP 404): Not Found
```

### 根本原因

**B站的音频 CDN URL 有时效性**：
- 获取的音频 URL 通常在 **2-6 小时** 后失效
- URL 中包含时间戳和签名参数
- 过期后 B站 CDN 返回 404

### 解决方案

#### 方案 1：使用最新的视频 ✅

1. **找一个最近上传的视频**（24小时内）
2. **使用诊断脚本验证**：
   ```bash
   npx tsx scripts/diagnose.ts "你的视频URL"
   ```
3. **如果通过诊断，立即测试 Web 界面**

#### 方案 2：使用热门/推荐视频 ✅

访问 B站 首页，选择：
- 热门视频
- 推荐视频
- 直播回放（最近的）

#### 方案 3：重新获取 URL ✅

如果视频本身没问题，只是 URL 过期了：
1. 刷新视频页面
2. 重新解析视频信息（应用会自动做）
3. 获取新的音频 URL

## 🎯 推荐测试流程

### 步骤 1: 诊断视频

```bash
# 使用诊断脚本验证视频
npx tsx scripts/diagnose.ts "https://www.bilibili.com/video/BVXXXXXXXXX"
```

**期待输出**：
```
✅ 标题: [视频标题]
✅ 时长: X 分 Y 秒
✅ 音频大小: XX.XXMB
✅ 音频 URL 可访问（HTTP 200）
✅ 下载成功: XX.XXMB
✅ 诊断完成 - 所有检查通过！
```

### 步骤 2: Web 界面测试

1. **访问**：http://localhost:3000

2. **输入视频 URL**（刚才诊断通过的）

3. **观察终端日志**，期待看到：

```
✅ [Transcribe] Downloading audio from B站 CDN: https://...
✅ [Transcribe] Audio size: XX.XXMB
✅ [Transcribe] Downloaded XXXXXX bytes, uploading to Paraformer...
✅ [Transcribe] Task submitted successfully: 20240224-xxx
```

### 步骤 3: 验证结果

- ✅ 语音识别成功
- ✅ 生成学习笔记
- ✅ 没有 403 或 404 错误

## 📝 寻找有效视频的技巧

### 方法 1: 使用 B站 热门榜

1. 访问：https://www.bilibili.com/v/popular/all
2. 选择任意热门视频
3. 复制 URL

### 方法 2: 使用 B站 搜索

1. 搜索关键词（如"编程"、"科技"）
2. 筛选：
   - 时长：< 10 分钟
   - 发布时间：今天/本周
3. 复制 URL

### 方法 3: 使用 B站 UP 主

选择活跃的 UP 主，找他们最近的视频：
- 官方账号（如 @哔哩哔哩弹幕网）
- 科技区 UP 主
- 知识区 UP 主

## 🚀 部署到 Vercel

### 为什么要部署？

**在 Vercel 上，音频 URL 失效的问题会更少**：
- 用户实时获取视频 → 音频 URL 是最新的
- 不存在"提前获取 URL 然后过期"的问题

### 部署步骤

```bash
# 1. 提交代码
git add .
git commit -m "feat: 使用预下载上传方案解决 B站 403 问题（方案2）"

# 2. 推送到 GitHub
git push

# 3. Vercel 自动部署
```

### 环境变量

确保在 Vercel Dashboard 设置：
```
DASHSCOPE_API_KEY=sk-xxx
```

### 部署后测试

1. 访问你的 Vercel URL
2. 输入任意 B站 视频（不需要提前诊断）
3. 应该能正常工作

## 🔧 调试技巧

### 查看详细日志

在 `transcribe.ts` 中已经添加了详细日志：

```typescript
[Transcribe] Downloading audio from B站 CDN: https://...
[Transcribe] Audio size: XX.XXMB
[Transcribe] Downloaded XXXXXX bytes, uploading to Paraformer...
[Transcribe] Task submitted successfully: xxx
```

### 如果仍然 404

1. **检查视频是否需要登录/大会员**
   - 使用公开、免费的视频测试

2. **检查 IP 是否被封**
   - 等待 10-30 分钟
   - 更换网络

3. **检查视频是否被删除/下架**
   - 使用诊断脚本验证

### 如果遇到其他错误

**403 错误**：
- 检查 `BILIBILI_HEADERS` 中的 Referer
- 确认代码正确使用了请求头

**超时错误**：
- 视频可能太长（> 10 分钟）
- 网络速度太慢

**内存错误**（Vercel）：
- 视频太长（> 30 分钟）
- 考虑升级 Vercel Pro

## 📊 方案 2 限制

| 环境 | 最大内存 | 超时 | 最大视频时长 |
|------|---------|------|-------------|
| 本地开发 | 无限制 | 无限制 | ~60 分钟 |
| Vercel Hobby | 1GB | 10s | ~10 分钟 |
| Vercel Pro | 3GB | 60s | ~60 分钟 |

## 💡 最佳实践

1. **本地测试时**：
   - 先用诊断脚本验证视频
   - 使用短视频（< 5 分钟）
   - 选择最近上传的视频

2. **生产部署后**：
   - 用户实时输入 → URL 总是最新的
   - 不需要担心 URL 过期
   - 建议限制视频时长（根据 Vercel 套餐）

3. **如果经常遇到 404**：
   - 考虑添加自动重试逻辑
   - 考虑缓存有效的音频（成本考虑）
   - 考虑切换到方案 1（代理模式）

## 🎉 成功案例

**如果一切正常，你会看到**：

```
用户输入视频 URL
  ↓
解析视频信息
  ↓
获取最新的音频 URL
  ↓
下载音频（带 Referer） ✅
  ↓
上传给 Paraformer ✅
  ↓
语音识别成功 ✅
  ↓
生成学习笔记 ✅
```

**日志示例**：
```
[Transcribe] Downloading audio from B站 CDN: https://upos-sz-...
[Transcribe] Audio size: 8.34MB
[Transcribe] Downloaded 8743567 bytes, uploading to Paraformer...
[Transcribe] Task submitted successfully: 20240224-abcd1234
语音识别进行中... 已等待 12 秒
✅ 语音识别完成
🤖 正在生成学习笔记...
```

---

**总结**：代码本身没有问题，只是测试时使用的视频 URL 已过期。使用诊断脚本找到有效的视频，或者直接部署到 Vercel 让用户实时输入。

**最后更新**：2026-02-24
**当前方案**：方案 2（预下载上传）✅
**状态**：代码就绪，等待有效视频测试
