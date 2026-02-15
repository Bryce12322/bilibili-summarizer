/**
 * Bilibili 视频解析模块
 *
 * 功能：
 * 1. 解析 Bilibili 视频 URL，提取 BV 号
 * 2. 获取视频基本信息（标题、时长、封面等）
 * 3. 尝试获取已有字幕（AI 字幕 / 人工字幕）
 * 4. 获取音频流 URL 并下载音频
 */

const BILIBILI_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
  Accept: "application/json, text/plain, */*",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoInfo {
  bvid: string;
  cid: number;
  title: string;
  description: string;
  duration: number; // 秒
  owner: string;
  pic: string; // 封面 URL
}

// ---------------------------------------------------------------------------
// 1. URL 解析
// ---------------------------------------------------------------------------

/**
 * 从各种格式的 Bilibili 链接中提取 BV 号
 *
 * 支持格式：
 * - https://www.bilibili.com/video/BV1xx...
 * - https://bilibili.com/video/BV1xx...
 * - https://m.bilibili.com/video/BV1xx...
 * - https://b23.tv/BV1xx... (短链)
 * - 直接输入 BV 号
 */
export function parseBilibiliUrl(url: string): string | null {
  const trimmed = url.trim();

  // 匹配 BV 号（12 位字母数字）
  const bvMatch = trimmed.match(/(?:BV|bv)([a-zA-Z0-9]{10,12})/);
  if (bvMatch) {
    return `BV${bvMatch[1]}`;
  }

  return null;
}

/**
 * 处理 b23.tv 短链接 → 解析到完整 URL 后提取 BV 号
 */
export async function resolveShortUrl(url: string): Promise<string | null> {
  if (!url.includes("b23.tv")) return null;

  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: BILIBILI_HEADERS,
    });
    const finalUrl = res.url;
    return parseBilibiliUrl(finalUrl);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. 获取视频信息
// ---------------------------------------------------------------------------

export async function getVideoInfo(bvid: string): Promise<VideoInfo> {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  const res = await fetch(url, { headers: BILIBILI_HEADERS });
  const json = await res.json();

  if (json.code !== 0) {
    throw new Error(`获取视频信息失败: ${json.message || "未知错误"}`);
  }

  const data = json.data;
  return {
    bvid: data.bvid,
    cid: data.cid,
    title: data.title,
    description: data.desc || "",
    duration: data.duration,
    owner: data.owner?.name || "",
    pic: data.pic?.startsWith("//") ? `https:${data.pic}` : data.pic,
  };
}

// ---------------------------------------------------------------------------
// 3. 获取字幕（优先使用，跳过 Whisper 节省成本）
// ---------------------------------------------------------------------------

export async function getSubtitles(
  bvid: string,
  cid: number
): Promise<string | null> {
  try {
    const url = `https://api.bilibili.com/x/player/v2?bvid=${bvid}&cid=${cid}`;
    const res = await fetch(url, { headers: BILIBILI_HEADERS });
    const json = await res.json();

    if (json.code !== 0) return null;

    const subtitles = json.data?.subtitle?.subtitles;
    if (!subtitles || subtitles.length === 0) return null;

    // 优先选择中文字幕（AI 生成或人工上传）
    const zhSub =
      subtitles.find(
        (s: { lan: string }) =>
          s.lan === "zh-CN" ||
          s.lan === "ai-zh" ||
          s.lan === "zh-Hans"
      ) || subtitles[0];

    if (!zhSub?.subtitle_url) return null;

    // 获取字幕内容
    let subUrl = zhSub.subtitle_url;
    if (subUrl.startsWith("//")) {
      subUrl = `https:${subUrl}`;
    }

    const subRes = await fetch(subUrl, { headers: BILIBILI_HEADERS });
    const subJson = await subRes.json();

    if (!subJson?.body?.length) return null;

    // 提取纯文本
    const text = subJson.body
      .map((item: { content: string }) => item.content)
      .join("\n");

    return text.length > 0 ? text : null;
  } catch (e) {
    console.error("获取字幕失败:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. 获取音频流 URL
// ---------------------------------------------------------------------------

/**
 * 获取视频的音频流 URL
 *
 * 策略 1: 通过 playurl API 获取 DASH 音频流
 * 策略 2: 通过抓取视频页面 HTML 中的 __playinfo__ 获取
 */
export async function getAudioUrl(
  bvid: string,
  cid: number
): Promise<string> {
  // 策略 1: playurl API
  try {
    const apiUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16&fnver=0&fourk=1`;
    const res = await fetch(apiUrl, { headers: BILIBILI_HEADERS });
    const json = await res.json();

    if (json.code === 0 && json.data?.dash?.audio?.length) {
      const audios = [...json.data.dash.audio].sort(
        (a: { bandwidth: number }, b: { bandwidth: number }) =>
          a.bandwidth - b.bandwidth
      );
      const url = audios[0].baseUrl || audios[0].base_url;
      if (url) return url;
    }
  } catch (e) {
    console.error("playurl API 失败:", e);
  }

  // 策略 2: 页面抓取
  try {
    const pageUrl = `https://www.bilibili.com/video/${bvid}/`;
    const pageRes = await fetch(pageUrl, {
      headers: {
        ...BILIBILI_HEADERS,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const html = await pageRes.text();

    const playInfoMatch = html.match(
      /window\.__playinfo__\s*=\s*({.+?})\s*<\/script>/
    );
    if (playInfoMatch) {
      const playInfo = JSON.parse(playInfoMatch[1]);
      const audios = playInfo?.data?.dash?.audio;
      if (audios?.length) {
        audios.sort(
          (a: { bandwidth: number }, b: { bandwidth: number }) =>
            a.bandwidth - b.bandwidth
        );
        const url = audios[0].baseUrl || audios[0].base_url;
        if (url) return url;
      }
    }
  } catch (e) {
    console.error("页面抓取失败:", e);
  }

  throw new Error(
    "无法获取音频流，可能是视频不可用或 Bilibili 接口发生变动"
  );
}

// ---------------------------------------------------------------------------
// 5. 下载音频
// ---------------------------------------------------------------------------

/**
 * 下载音频文件到 Buffer
 *
 * 使用 Bilibili 特定的请求头（Referer 等）下载音频，
 * 因为 CDN 会拒绝不带 Referer 的请求。
 * DashScope 文件上传限制为 1GB，这里限制 200MB 已足够 60 分钟视频。
 */
export async function downloadAudio(audioUrl: string): Promise<Buffer> {
  const res = await fetch(audioUrl, {
    headers: {
      ...BILIBILI_HEADERS,
      Range: "bytes=0-",
    },
  });

  if (!res.ok && res.status !== 206) {
    throw new Error(`下载音频失败: HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const sizeMB = buffer.length / (1024 * 1024);
  if (sizeMB > 200) {
    throw new Error(
      `音频文件过大（${sizeMB.toFixed(1)} MB），超过 200MB 限制，请尝试更短的视频`
    );
  }

  return buffer;
}
