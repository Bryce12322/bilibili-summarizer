/**
 * GET /api/audio-proxy?token=xxx
 *
 * 音频代理端点 — 解决 Bilibili CDN 防盗链问题。
 *
 * Paraformer 语音识别服务无法直接访问 B站 CDN（需要 Referer 头），
 * 本端点作为中转：Paraformer 请求我们 → 我们带 Referer 从 B站拉取音频 → 透传回去。
 *
 * 安全：使用 HMAC-SHA256 签名 + 过期时间防止滥用。
 */

import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const BILIBILI_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
  Accept: "*/*",
};

function getSecret(): string {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error("DASHSCOPE_API_KEY not configured");
  return key;
}

// ---------------------------------------------------------------------------
// 签名工具（供 route.ts 调用）
// ---------------------------------------------------------------------------

/**
 * 为音频 URL 生成带签名的代理 token
 * @param audioUrl - Bilibili CDN 音频 URL
 * @param ttlMs    - token 有效期（默认 15 分钟）
 */
export function signAudioToken(audioUrl: string, ttlMs = 15 * 60 * 1000): string {
  const payload = JSON.stringify({
    url: audioUrl,
    exp: Date.now() + ttlMs,
  });
  const token = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(token).digest("base64url");
  return `${token}.${sig}`;
}

/** 验证 token 并返回原始音频 URL */
function verifyToken(token: string): string | null {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return null;

  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  const expectedSig = createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  if (sig !== expectedSig) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    if (typeof data.url !== "string" || !data.url.startsWith("http")) return null;
    return data.url;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const audioUrl = verifyToken(token);
  if (!audioUrl) {
    return new Response("Invalid or expired token", { status: 403 });
  }

  // 从 Bilibili CDN 拉取音频（带正确 Headers）
  const upstream = await fetch(audioUrl, {
    headers: { ...BILIBILI_HEADERS, Range: "bytes=0-" },
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Upstream error: ${upstream.status}`, {
      status: 502,
    });
  }

  // 透传音频流给 Paraformer
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "audio/mp4",
      ...(upstream.headers.get("Content-Length")
        ? { "Content-Length": upstream.headers.get("Content-Length")! }
        : {}),
      "Cache-Control": "no-store",
    },
  });
}
