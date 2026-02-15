"use client";

import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoInfo {
  bvid: string;
  cid: number;
  title: string;
  description: string;
  duration: number;
  owner: string;
  pic: string;
}

interface SummaryResult {
  info: VideoInfo;
  summary: string;
  source: "subtitle" | "whisper" | "asr";
  transcriptLength: number;
}

interface ProcessStep {
  step: string;
  message: string;
  info?: VideoInfo;
  data?: SummaryResult;
}

// ---------------------------------------------------------------------------
// 状态类型
// ---------------------------------------------------------------------------

type AppState = "idle" | "processing" | "done" | "error";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Home() {
  const [url, setUrl] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ---- 提交处理 ----
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!url.trim()) return;

      // 重置状态
      setAppState("processing");
      setSteps([]);
      setResult(null);
      setError(null);
      setVideoInfo(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
          signal: controller.signal,
        });

        // 非流式错误（429 等）
        if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
          const errData = await response.json();
          setError(errData.error || `请求失败 (${response.status})`);
          setAppState("error");
          return;
        }

        // 读取 SSE 流
        const reader = response.body?.getReader();
        if (!reader) throw new Error("无法读取响应流");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const lines = part.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;

              try {
                const data = JSON.parse(line.slice(6)) as ProcessStep;

                // 更新步骤
                setSteps((prev) => [...prev, data]);

                // 保存视频信息
                if (data.info) {
                  setVideoInfo(data.info);
                }

                // 处理完成
                if (data.step === "done" && data.data) {
                  setResult(data.data);
                  setAppState("done");
                }

                // 处理错误
                if (data.step === "error") {
                  setError(data.message);
                  setAppState("error");
                }
              } catch {
                // JSON 解析失败，跳过
              }
            }
          }
        }

        // 流结束但没有明确的 done/error 状态
        setAppState((prev) => (prev === "processing" ? "error" : prev));
        if (appState === "processing") {
          setError("连接意外断开，请重试");
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "请求失败";
        setError(msg);
        setAppState("error");
      }
    },
    [url, appState]
  );

  // ---- 重新开始 ----
  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setUrl("");
    setAppState("idle");
    setSteps([]);
    setResult(null);
    setError(null);
    setVideoInfo(null);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ========== Hero / Header ========== */}
      <header className="w-full pt-16 pb-10 px-4 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm text-muted shadow-sm border border-card-border">
          <span className="inline-block w-2 h-2 rounded-full bg-bili-pink" />
          AI 视频总结工具 · MVP
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-4">
          <span className="bg-gradient-to-r from-bili-blue to-bili-pink bg-clip-text text-transparent">
            BiliDigest
          </span>
        </h1>
        <p className="mt-3 text-lg text-muted max-w-xl mx-auto leading-relaxed">
          粘贴 Bilibili 视频链接，AI 帮你在几分钟内掌握核心内容
        </p>
      </header>

      {/* ========== Main Content ========== */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pb-20">
        {/* ---- 输入表单 ---- */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="relative rounded-2xl bg-white shadow-lg border border-card-border overflow-hidden">
            {/* 顶部渐变条（处理中时显示动画） */}
            <div
              className={`h-1 w-full ${
                appState === "processing"
                  ? "gradient-border-animated"
                  : "bg-gradient-to-r from-bili-blue to-bili-pink opacity-60"
              }`}
            />

            <div className="p-5">
              <label
                htmlFor="video-url"
                className="block text-sm font-medium text-gray-500 mb-2"
              >
                Bilibili 视频链接
              </label>
              <div className="flex gap-3">
                <input
                  id="video-url"
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.bilibili.com/video/BVxxxxxxxxxx"
                  disabled={appState === "processing"}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-base
                             placeholder:text-gray-300 focus:outline-none focus:ring-2
                             focus:ring-bili-blue/30 focus:border-bili-blue
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all"
                />
                {appState === "processing" ? (
                  <button
                    type="button"
                    onClick={() => {
                      abortRef.current?.abort();
                      setAppState("error");
                      setError("已取消处理");
                    }}
                    className="rounded-xl px-6 py-3 text-base font-medium text-white
                               bg-gray-400 hover:bg-gray-500 transition-colors cursor-pointer
                               whitespace-nowrap"
                  >
                    取消
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!url.trim()}
                    className="rounded-xl px-6 py-3 text-base font-medium text-white
                               bg-gradient-to-r from-bili-blue to-bili-pink
                               hover:shadow-lg hover:shadow-bili-pink/20
                               disabled:opacity-40 disabled:cursor-not-allowed
                               transition-all cursor-pointer whitespace-nowrap"
                  >
                    生成总结
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-400">
                仅支持公开的 Bilibili 视频，时长不超过 60 分钟
              </p>
            </div>
          </div>
        </form>

        {/* ---- 视频信息卡片 ---- */}
        {videoInfo && (
          <div className="mb-6 animate-fade-in-up">
            <div className="rounded-xl bg-white border border-card-border shadow-sm overflow-hidden">
              <div className="flex gap-4 p-4">
                {videoInfo.pic && (
                  <div className="flex-shrink-0 w-40 h-24 rounded-lg overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={videoInfo.pic}
                      alt={videoInfo.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-base leading-snug line-clamp-2">
                    {videoInfo.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-3 text-sm text-muted">
                    <span>UP主: {videoInfo.owner}</span>
                    <span>·</span>
                    <span>{Math.round(videoInfo.duration / 60)} 分钟</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---- 处理进度 ---- */}
        {steps.length > 0 && appState !== "idle" && (
          <div className="mb-6">
            <div className="rounded-xl bg-white border border-card-border shadow-sm p-5">
              <h3 className="text-sm font-medium text-gray-500 mb-3">
                处理进度
              </h3>
              <div className="space-y-2.5">
                {steps
                  .filter((s) => s.step !== "done")
                  .map((step, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 animate-fade-in-up"
                    >
                      {/* 状态图标 */}
                      {step.step === "error" ? (
                        <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                          <span className="text-red-500 text-xs">✕</span>
                        </span>
                      ) : i === steps.filter((s) => s.step !== "done").length - 1 &&
                        appState === "processing" ? (
                        <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-bili-blue/10 flex items-center justify-center">
                          <span className="w-2 h-2 rounded-full bg-bili-blue animate-pulse-dot" />
                        </span>
                      ) : (
                        <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                          <span className="text-green-600 text-xs">✓</span>
                        </span>
                      )}
                      {/* 消息 */}
                      <span
                        className={`text-sm leading-relaxed ${
                          step.step === "error"
                            ? "text-red-600"
                            : "text-gray-600"
                        }`}
                      >
                        {step.message}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ---- 错误提示 ---- */}
        {appState === "error" && error && (
          <div className="mb-6 animate-fade-in-up">
            <div className="rounded-xl bg-red-50 border border-red-200 p-5">
              <div className="flex items-start gap-3">
                <span className="text-red-500 text-xl mt-0.5">⚠</span>
                <div>
                  <h3 className="font-medium text-red-800 mb-1">处理失败</h3>
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="mt-4 rounded-lg px-4 py-2 text-sm font-medium text-red-700
                           bg-red-100 hover:bg-red-200 transition-colors cursor-pointer"
              >
                重新开始
              </button>
            </div>
          </div>
        )}

        {/* ---- 总结结果 ---- */}
        {appState === "done" && result && (
          <div className="animate-fade-in-up">
            {/* 元信息标签 */}
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-medium text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                总结完成
              </span>
              <span className="text-xs text-muted">
                内容来源:{" "}
                {result.source === "subtitle"
                  ? "视频字幕"
                  : result.source === "asr"
                    ? "Paraformer 语音识别"
                    : "Whisper 语音识别"}
              </span>
              <span className="text-xs text-muted">
                · 原文 {result.transcriptLength.toLocaleString()} 字
              </span>
            </div>

            {/* Markdown 总结内容 */}
            <div className="rounded-xl bg-white border border-card-border shadow-sm p-6 sm:p-8">
              <article className="prose-custom">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h2: ({ children }) => (
                      <h2 className="text-xl font-bold mt-8 mb-4 text-gray-900 first:mt-0 pb-2 border-b border-gray-100">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-lg font-semibold mt-5 mb-2 text-gray-800">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-gray-700 mb-3 leading-relaxed text-[15px]">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc pl-6 mb-4 space-y-1.5">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal pl-6 mb-4 space-y-1.5">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-gray-700 text-[15px] leading-relaxed">
                        {children}
                      </li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-gray-900">
                        {children}
                      </strong>
                    ),
                    hr: () => <hr className="my-6 border-gray-100" />,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-3 border-bili-blue pl-4 my-4 text-gray-600 italic">
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {result.summary}
                </ReactMarkdown>
              </article>
            </div>

            {/* 操作按钮 */}
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => {
                  if (result?.summary) {
                    navigator.clipboard.writeText(result.summary);
                  }
                }}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700
                           bg-white border border-card-border hover:bg-gray-50
                           transition-colors cursor-pointer shadow-sm"
              >
                📋 复制总结
              </button>
              <button
                onClick={handleReset}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-bili-blue
                           bg-bili-blue/5 border border-bili-blue/20 hover:bg-bili-blue/10
                           transition-colors cursor-pointer"
              >
                ↻ 总结另一个视频
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ========== Footer ========== */}
      <footer className="w-full py-8 px-4 border-t border-card-border bg-white/50">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs text-gray-400 leading-relaxed">
            ⚠️ 本工具仅用于个人学习与研究用途，不保存、不分发原始视频内容。
            <br />
            总结结果仅作为辅助理解参考，质量取决于原视频音频质量。
            <br />
            本工具与 Bilibili 无任何关联。
          </p>
          <p className="mt-3 text-xs text-gray-300">
            BiliDigest MVP · Powered by 百炼 Paraformer & Qwen3
          </p>
        </div>
      </footer>
    </div>
  );
}
