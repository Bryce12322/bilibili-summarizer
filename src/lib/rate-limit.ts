/**
 * 简易 IP 频率限制模块
 *
 * 基于内存的滑动窗口限流，适用于单实例 Serverless 部署。
 * 注意：Serverless 冷启动会重置计数，不适用于严格的防滥用场景。
 */

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const ipMap = new Map<string, RateLimitRecord>();

// 限流参数
const WINDOW_MS = 60 * 60 * 1000; // 1 小时窗口
const MAX_REQUESTS = 10; // 每 IP 每小时最多 10 次请求

// 定期清理过期记录（防止内存泄漏）
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 分钟
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [ip, record] of ipMap.entries()) {
    if (now > record.resetTime) {
      ipMap.delete(ip);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  message?: string;
}

/**
 * 检查给定 IP 是否允许请求
 */
export function checkRateLimit(ip: string): RateLimitResult {
  cleanup();

  const now = Date.now();
  const record = ipMap.get(ip);

  // 新 IP 或窗口已过期 → 重置
  if (!record || now > record.resetTime) {
    ipMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  // 超过限额
  if (record.count >= MAX_REQUESTS) {
    const remainingMin = Math.ceil((record.resetTime - now) / 60_000);
    return {
      allowed: false,
      remaining: 0,
      message: `请求过于频繁，请在 ${remainingMin} 分钟后重试（每小时最多 ${MAX_REQUESTS} 次）`,
    };
  }

  // 正常消费
  record.count++;
  return { allowed: true, remaining: MAX_REQUESTS - record.count };
}
