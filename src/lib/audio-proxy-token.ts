import crypto from "crypto";

const SECRET = process.env.AUDIO_PROXY_SECRET || "";

if (!SECRET) {
  // 不抛出错误以便本地开发继续工作，但建议在部署时设置此环境变量
  console.warn(
    "Warning: AUDIO_PROXY_SECRET is not set. Audio proxy tokens will be unsigned in this environment."
  );
}

export function generateAudioProxyToken(url: string, ttlSeconds = 300): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${url}|${expires}`;
  if (!SECRET) return Buffer.from(payload).toString("base64url");

  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(payload);
  const sig = hmac.digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyAudioProxyToken(token: string): { valid: boolean; url?: string } {
  try {
    if (!token) return { valid: false };
    if (!SECRET) {
      // unsigned token format: base64url(payload)
      const payload = Buffer.from(token, "base64url").toString();
      const [url, expiresStr] = payload.split("|");
      const expires = Number(expiresStr);
      if (Date.now() / 1000 > expires) return { valid: false };
      return { valid: true, url };
    }

    const parts = token.split(".");
    if (parts.length !== 2) return { valid: false };
    const payloadB64 = parts[0];
    const sig = parts[1];
    const payload = Buffer.from(payloadB64, "base64url").toString();
    const [url, expiresStr] = payload.split("|");
    const expires = Number(expiresStr);
    if (Date.now() / 1000 > expires) return { valid: false };

    const hmac = crypto.createHmac("sha256", SECRET);
    hmac.update(payload);
    const expected = hmac.digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return { valid: false };
    }

    return { valid: true, url };
  } catch (e) {
    return { valid: false };
  }
}
