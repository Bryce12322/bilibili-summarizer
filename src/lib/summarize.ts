/**
 * LLM 结构化总结模块 — 通义千问 Qwen3
 *
 * 通过阿里云百炼平台的 OpenAI 兼容接口调用 Qwen3 模型。
 * API Key 从环境变量 DASHSCOPE_API_KEY 读取。
 *
 * 模型：qwen3-235b-a22b（Qwen3 旗舰 MoE 模型）
 * 平台：阿里云百炼 https://bailian.console.aliyun.com/
 *
 * 优势（相比 GPT-4o）：
 * - 成本低
 * - Qwen3 中文理解与生成能力出色
 * - 国内网络延迟更低
 */

import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "未配置 DASHSCOPE_API_KEY 环境变量，请在 .env.local 中设置千问百炼平台 API Key"
      );
    }
    _client = new OpenAI({
      apiKey,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
  }
  return _client;
}

const SYSTEM_PROMPT = `你是一个专业的视频学习笔记助手。你的任务是根据视频的转写文本，生成一份**详尽的结构化学习笔记**，帮助用户在不看视频的情况下也能完整学习到视频中的知识和信息。

## 你的工作方式

1. **先判断视频类型**：根据转写文本的内容风格，判断视频属于哪种类型（如：知识讲解、教程演示、人物访谈、圆桌讨论、经验分享、故事叙述、新闻评论、产品评测等），并在笔记开头标注。
2. **根据视频类型选择最合适的笔记结构**（见下方不同类型的输出模板）。
3. **尽可能保留信息**：这是学习笔记而非摘要提炼。重要的细节、数据、案例、论证过程都应该被记录下来，而不是被压缩成一句话。

## 不同视频类型的输出模板（使用 Markdown）

### 如果是知识讲解 / 教程类视频：

**## 📌 主题概述**
一句话说明这个视频讲了什么。

**## 📖 知识点整理**
按视频讲解顺序，逐个罗列知识点。每个知识点包含：要点说明、关键细节或公式/步骤、讲者给出的例子（如有）。使用层级列表，保留讲解的逻辑链条。

**## 🔑 重点与易错点**
讲者特别强调的重点、反复提及的注意事项、常见误区。

**## 🛠 实操步骤**（如果视频包含操作演示）
按顺序记录具体操作步骤。

---

### 如果是访谈 / 对话类视频：

**## 📌 访谈背景**
简要说明访谈双方是谁、访谈主题和背景。

**## 🗣 访谈要点**
按对话推进顺序，整理每个话题段落的核心问答。保留有价值的原话或观点表述，标注是谁说的。

**## 💡 关键观点与金句**
提取受访者/嘉宾提出的独到见解、有启发性的表述。

**## 📊 提到的事实与数据**
访谈中引用的数据、事件、案例等客观信息。

---

### 如果是经验分享 / 故事叙述类视频：

**## 📌 主题概述**
一句话说明这个视频讲了什么。

**## 📝 完整内容梳理**
按视频叙述顺序，完整还原故事线或经验分享的脉络。保留关键转折、因果关系和细节。

**## 💡 核心经验与教训**
提炼分享者总结的经验、建议、反思。

**## 🔗 提到的资源与参考**
视频中提到的书籍、工具、网站、人物等。

---

### 如果不属于以上类型，你可以自行设计最适合该内容的笔记结构，但需遵循相同的详尽原则。

---

### 如果视频是英文内容（转写文本主要为英文）：

在笔记末尾额外增加以下板块：

**## 📝 英文词汇与短语**

从视频中提取有学习价值的英文单词和短语，按以下格式整理：

- **核心词汇**：视频主题相关的关键术语，附中文释义和视频中的原句示例
- **高频短语/搭配**：视频中反复出现或值得学习的短语表达，附中文释义
- **地道表达/俚语**：口语化的、书本上不常见的表达方式，附中文释义和使用语境说明

每个词条格式：**英文** - 中文释义 - （原句示例，如有）

注意：只收录有学习价值的词汇，不要罗列 the / is / have 等基础词汇。优先收录专业术语、学术词汇、地道搭配和高级表达。

## 通用要求

1. **信息完整优先**：宁可记多，不要遗漏重要信息。这是学习笔记，不是电梯演讲。
2. 保持客观，忠实于原视频内容，不添加个人评价或延伸解读。
3. 如果转写文本质量较差（大量乱码、断句混乱），请在开头用 ⚠️ 标注，并尽力还原。
4. 全部使用中文输出（英文词汇短语板块除外）。
5. 视频中提到的专有名词、术语、人名、书名等保留原始表述（如有英文则保留英文）。`;

/**
 * 对视频转写文本生成结构化总结
 *
 * @param transcript    - 视频转写文本（字幕或 ASR 输出）
 * @param videoTitle    - 视频标题
 * @param videoDuration - 视频时长（秒）
 */
export async function summarizeTranscript(
  transcript: string,
  videoTitle: string,
  videoDuration: number
): Promise<string> {
  const client = getClient();
  const durationMin = Math.round(videoDuration / 60);

  // 截断过长的转写文本以控制 token 成本
  // Qwen3-235B 上下文窗口 128k tokens，中文约 1.5 token/字
  // 限制在 ~50k 字符以内，留足输出空间
  const maxChars = 50_000;
  let trimmedTranscript = transcript;
  if (transcript.length > maxChars) {
    trimmedTranscript =
      transcript.slice(0, maxChars) +
      "\n\n[... 文本过长，已截断后续内容 ...]";
  }

  const userPrompt = `视频标题：${videoTitle}
视频时长：约 ${durationMin} 分钟

以下是视频的转写文本：

${trimmedTranscript}`;

  const response = await client.chat.completions.create({
    model: "qwen3-235b-a22b",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 8000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("总结生成失败，Qwen3 模型未返回有效内容");
  }

  return content;
}
