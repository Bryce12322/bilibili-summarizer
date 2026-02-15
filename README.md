# BiliDigest — Bilibili 视频速读器

AI 驱动的 Bilibili 知识视频总结工具。粘贴视频链接，几分钟内获得结构化的核心内容总结。

## 功能

- 支持 Bilibili 公开视频链接（含 b23.tv 短链）
- 自动获取视频字幕（跳过语音识别，更快更便宜）
- 无字幕时自动下载音频并使用 Whisper 语音识别
- GPT-4o 生成结构化总结（核心观点、大纲、论据、适合人群）
- 流式进度反馈，实时展示处理步骤
- IP 频率限制，防止滥用

## 技术栈

- **前端**: Next.js + Tailwind CSS + TypeScript
- **后端**: Next.js API Routes (Serverless)
- **ASR**: OpenAI Whisper API
- **LLM**: GPT-4o

## 快速开始

### 1. 克隆项目

```bash
git clone <repo-url>
cd bilibili-summarizer
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`，填入你的 OpenAI API Key：

```
OPENAI_API_KEY=sk-your-api-key-here
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

## 使用说明

1. 打开页面
2. 粘贴 Bilibili 视频链接（如 `https://www.bilibili.com/video/BVxxxxxxxxxx`）
3. 点击「生成总结」
4. 等待处理完成，查看结构化总结

## 限制

- 仅支持 **公开** 的 Bilibili 视频
- 视频时长上限 **30 分钟**
- 不支持私有、付费、会员专享内容
- 总结质量取决于原视频音频质量
- Bilibili 接口可能变动，不保证 100% 成功率

## 成本估算

| 步骤 | 单次成本 |
|------|---------|
| 有字幕视频（跳过 Whisper） | ~$0.01-0.05 |
| 无字幕 10 分钟视频 | ~$0.10-0.20 |
| LLM 总结 | ~$0.02-0.10 |
| **总计** | **$0.03-0.30** |

## 部署

推荐部署到 [Vercel](https://vercel.com)：

1. Fork 本项目
2. 在 Vercel 导入项目
3. 配置环境变量 `OPENAI_API_KEY`
4. 部署

> 注意：Vercel Hobby 计划函数超时为 60 秒，Pro 计划可到 300 秒。建议使用 Pro 计划以处理更长的视频。

## 免责声明

- 本工具仅用于个人学习与研究用途
- 不保存、不分发原始视频内容
- 总结结果仅作为辅助理解参考
- 本工具与 Bilibili 无任何关联

## License

MIT
