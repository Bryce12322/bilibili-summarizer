/**
 * POST /api/summarize
 *
 * 接收 Bilibili 视频链接，返回 SSE 流式处理进度 + 最终总结结果。
 *
 * 请求体: { url: string }
 * 响应: text/event-stream (SSE)
 *
 * 事件格式: data: { step, message, info?, data? }
 *
 * 技术栈：千问百炼平台 Paraformer ASR + Qwen3 大模型
 */

import { NextRequest } from "next/server";
import {
  parseBilibiliUrl,
  resolveShortUrl,
  getVideoInfo,
  getSubtitles,
  getAudioUrl,
} from "@/lib/bilibili";
import {
  submitTranscription,
  pollTranscription,
} from "@/lib/transcribe";
import { summarizeTranscript } from "@/lib/summarize";
import { checkRateLimit } from "@/lib/rate-limit";

// Vercel Serverless 最大执行时间（秒）
// Hobby: 最大 60s | Pro: 最大 300s
export const maxDuration = 180;

// ---------------------------------------------------------------------------
// SSE 流工具
// ---------------------------------------------------------------------------

function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  function send(payload: Record<string, unknown>) {
    try {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
      );
    } catch {
      // 流已关闭，忽略
    }
  }

  function close() {
    try {
      controller.close();
    } catch {
      // 已关闭
    }
  }

  return { stream, send, close };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // ---- 频率限制 ----
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const rateResult = checkRateLimit(ip);
  if (!rateResult.allowed) {
    return Response.json({ error: rateResult.message }, { status: 429 });
  }

  // ---- 参数校验 ----
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const inputUrl = body.url?.trim();
  if (!inputUrl) {
    return Response.json({ error: "请提供视频链接" }, { status: 400 });
  }

  // ---- 创建 SSE 流 & 异步处理 ----
  const { stream, send, close } = createSSEStream();

  // 不 await — 让处理在后台进行，流持续推送
  void processVideo(inputUrl, send, close);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-RateLimit-Remaining": String(rateResult.remaining),
    },
  });
}

// ---------------------------------------------------------------------------
// 核心处理流程
// ---------------------------------------------------------------------------

async function processVideo(
  inputUrl: string,
  send: (payload: Record<string, unknown>) => void,
  close: () => void
) {
  try {
    // ---- Step 1: 解析 URL ----
    send({ step: "parse", message: "正在解析视频链接..." });

    let bvid = parseBilibiliUrl(inputUrl);

    // 尝试解析短链接
    if (!bvid && inputUrl.includes("b23.tv")) {
      bvid = await resolveShortUrl(inputUrl);
    }

    if (!bvid) {
      send({
        step: "error",
        message:
          "无效的 Bilibili 视频链接。请确认链接格式，例如：https://www.bilibili.com/video/BVxxxxxxxxxx",
      });
      close();
      return;
    }

    // ---- Step 2: 获取视频信息 ----
    send({ step: "info", message: "正在获取视频信息..." });

    const info = await getVideoInfo(bvid);
    const durationMin = Math.round(info.duration / 60);

    send({
      step: "info_done",
      message: `📺 ${info.title}（${durationMin} 分钟 · UP主: ${info.owner}）`,
      info,
    });

    // ---- 时长校验 ----
    if (info.duration > 30 * 60) {
      send({
        step: "error",
        message: `视频时长 ${durationMin} 分钟，超过 MVP 阶段 30 分钟上限。请选择更短的视频。`,
      });
      close();
      return;
    }

    if (info.duration < 30) {
      send({
        step: "error",
        message: "视频时长不足 30 秒，内容过短，不需要总结。",
      });
      close();
      return;
    }

    // ---- Step 3: 尝试获取字幕 ----
    send({ step: "subtitle", message: "正在尝试获取视频字幕..." });

    let transcript = await getSubtitles(bvid, info.cid);
    let source: "subtitle" | "asr" = "subtitle";

    if (transcript && transcript.length > 50) {
      send({
        step: "subtitle_done",
        message: `✅ 已获取视频字幕（${transcript.length} 字）`,
      });
    } else {
      // ---- Step 4: 通过 Paraformer 进行语音识别 ----
      transcript = null;

      send({
        step: "audio",
        message: "未找到可用字幕，正在获取音频流地址...",
      });

      const audioUrl = await getAudioUrl(bvid, info.cid);

      send({
        step: "transcribe_submit",
        message: "正在提交语音识别任务（百炼 Paraformer）...",
      });

      const taskId = await submitTranscription(audioUrl);

      send({
        step: "transcribe_poll",
        message: "语音识别处理中，请耐心等待...",
      });

      transcript = await pollTranscription(taskId, (msg) => {
        send({ step: "transcribe_progress", message: msg });
      });

      source = "asr";
      send({
        step: "transcribe_done",
        message: `✅ 语音识别完成（${transcript.length} 字）`,
      });
    }

    // ---- Step 5: Qwen 总结 ----
    send({
      step: "summarize",
      message: "正在通过 Qwen3 生成结构化总结...",
    });

    const summary = await summarizeTranscript(
      transcript,
      info.title,
      info.duration
    );

    // ---- Step 6: 完成 ----
    send({
      step: "done",
      message: "✅ 总结生成完成",
      data: {
        info,
        summary,
        source,
        transcriptLength: transcript.length,
      },
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "处理过程中发生未知错误";
    console.error("处理失败:", error);
    send({ step: "error", message: msg });
  } finally {
    close();
  }
}
