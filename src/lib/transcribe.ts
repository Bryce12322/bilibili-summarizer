/**
 * 语音转文本模块 — 阿里云百炼平台 Paraformer
 *
 * 使用千问百炼平台（DashScope）的 Paraformer-v2 模型进行语音识别。
 * API Key 从环境变量 DASHSCOPE_API_KEY 读取。
 * 采用异步文件转写 API：提交任务 → 轮询结果。
 *
 * 平台：阿里云百炼 https://bailian.console.aliyun.com/
 *
 * 优势（相比 OpenAI Whisper）：
 * - 成本低 ~9 倍（¥0.288/小时 vs $0.36/小时）
 * - 中文识别质量优秀（达摩院专为中文优化）
 * - 国内网络延迟更低
 * - 每月 10 小时免费额度
 */

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1";

function getApiKey(): string {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) {
    throw new Error(
      "未配置 DASHSCOPE_API_KEY 环境变量，请在 .env.local 中设置千问百炼平台 API Key"
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// 1. 提交转写任务
// ---------------------------------------------------------------------------

/**
 * 向 DashScope 提交文件转写任务
 *
 * @param audioUrl - 音频文件的公开可访问 URL（如 Bilibili CDN 地址）
 * @returns 任务 ID
 */
export async function submitTranscription(audioUrl: string): Promise<string> {
  const res = await fetch(
    `${DASHSCOPE_BASE}/services/audio/asr/transcription`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model: "paraformer-v2",
        input: {
          file_urls: [audioUrl],
        },
        parameters: {
          language_hints: ["zh"],
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`提交语音识别任务失败 (HTTP ${res.status}): ${text}`);
  }

  const data = await res.json();

  if (data.output?.task_id) {
    return data.output.task_id;
  }

  throw new Error(
    `提交语音识别任务失败: ${data.message || data.output?.message || JSON.stringify(data)}`
  );
}

// ---------------------------------------------------------------------------
// 2. 轮询任务结果
// ---------------------------------------------------------------------------

/**
 * 轮询转写任务直到完成或失败
 *
 * @param taskId    - 任务 ID
 * @param onProgress - 可选的进度回调，用于向前端推送状态
 * @returns 转写后的纯文本
 */
export async function pollTranscription(
  taskId: string,
  onProgress?: (message: string) => void
): Promise<string> {
  const maxAttempts = 60; // 最多轮询 60 次
  const interval = 3_000; // 每 3 秒轮询一次 → 最长等待 180 秒

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));

    const res = await fetch(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });

    if (!res.ok) {
      // 网络错误不立即失败，继续重试
      console.error(`轮询失败 (HTTP ${res.status})，将继续重试...`);
      continue;
    }

    const data = await res.json();
    const status = data.output?.task_status;

    // ---- 成功 ----
    if (status === "SUCCEEDED") {
      const resultUrl = data.output?.results?.[0]?.transcription_url;
      if (!resultUrl) {
        throw new Error("语音识别任务完成但未返回结果 URL");
      }

      const resultRes = await fetch(resultUrl);
      const resultData = await resultRes.json();
      return extractTranscript(resultData);
    }

    // ---- 失败 ----
    if (status === "FAILED") {
      const msg = data.output?.message || "未知错误";
      throw new Error(
        `语音识别失败: ${msg}。可能原因：音频 URL 无法访问或音频格式不支持。`
      );
    }

    // ---- 进行中 → 推送进度 ----
    const elapsed = ((i + 1) * interval) / 1000;
    if (i > 0 && i % 4 === 0) {
      onProgress?.(`语音识别进行中... 已等待 ${elapsed} 秒`);
    }
  }

  throw new Error("语音识别超时（超过 180 秒），请尝试更短的视频");
}

// ---------------------------------------------------------------------------
// 3. 解析转写结果
// ---------------------------------------------------------------------------

/**
 * 从 DashScope 转写结果 JSON 中提取纯文本
 *
 * 结果格式：
 * {
 *   "transcripts": [{
 *     "channel_id": 0,
 *     "text": "完整文本...",
 *     "sentences": [{ "text": "...", "begin_time": 0, "end_time": 3500 }, ...]
 *   }]
 * }
 */
function extractTranscript(data: unknown): string {
  const obj = data as {
    transcripts?: Array<{
      text?: string;
      sentences?: Array<{ text?: string }>;
    }>;
  };

  const transcripts = obj?.transcripts;
  if (!transcripts?.length) {
    throw new Error("语音识别返回了空结果，可能是音频中没有可识别的语音内容");
  }

  const text = transcripts
    .map(
      (t) =>
        t.text ||
        t.sentences?.map((s) => s.text || "").join("") ||
        ""
    )
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("语音识别结果为空文本");
  }

  return text;
}
