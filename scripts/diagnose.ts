/**
 * 诊断脚本：检查整个流程
 *
 * 用法：
 * npx tsx scripts/diagnose.ts <B站视频URL>
 */

const BILIBILI_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://www.bilibili.com",
  Accept: "application/json, text/plain, */*",
};

async function diagnose(url: string) {
  console.log("=".repeat(80));
  console.log("🔍 BiliDigest 诊断工具");
  console.log("=".repeat(80));
  console.log();

  // 1. 解析 BV 号
  console.log("📝 步骤 1: 解析视频 URL");
  console.log("-".repeat(80));
  const bvidMatch = url.match(/BV[a-zA-Z0-9]+/);
  if (!bvidMatch) {
    console.error("❌ 无法从 URL 中提取 BV 号");
    process.exit(1);
  }
  const bvid = bvidMatch[0];
  console.log(`✅ BV 号: ${bvid}`);
  console.log();

  // 2. 获取视频信息
  console.log("📺 步骤 2: 获取视频信息");
  console.log("-".repeat(80));
  const infoUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  const infoRes = await fetch(infoUrl, { headers: BILIBILI_HEADERS });

  if (!infoRes.ok) {
    console.error(`❌ 获取视频信息失败 (HTTP ${infoRes.status})`);
    process.exit(1);
  }

  const info = await infoRes.json();
  if (info.code !== 0) {
    console.error(`❌ API 返回错误: ${info.message}`);
    process.exit(1);
  }

  const data = info.data;
  const cid = data.cid;
  const title = data.title;
  const duration = data.duration;

  console.log(`✅ 标题: ${title}`);
  console.log(`✅ 时长: ${Math.floor(duration / 60)} 分 ${duration % 60} 秒`);
  console.log(`✅ CID: ${cid}`);
  console.log();

  // 3. 获取音频 URL
  console.log("🎵 步骤 3: 获取音频流地址");
  console.log("-".repeat(80));

  // 策略 1: playurl API
  const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16&fnver=0&fourk=1`;
  const playRes = await fetch(playUrl, { headers: BILIBILI_HEADERS });

  let audioUrl: string | null = null;

  if (playRes.ok) {
    const playData = await playRes.json();
    if (playData.code === 0 && playData.data?.dash?.audio) {
      const audios = playData.data.dash.audio.sort((a: any, b: any) => a.bandwidth - b.bandwidth);
      audioUrl = audios[0].baseUrl || audios[0].base_url;
      if (audioUrl) {
        console.log(`✅ 音频 URL (playurl API): ${audioUrl.substring(0, 100)}...`);
      }
    }
  }

  if (!audioUrl) {
    console.log("⚠️  playurl API 未返回音频，尝试从页面 HTML 获取...");

    const pageUrl = `https://www.bilibili.com/video/${bvid}/`;
    const pageRes = await fetch(pageUrl, { headers: BILIBILI_HEADERS });
    const html = await pageRes.text();

    const match = html.match(/window\.__playinfo__\s*=\s*({.+?})\s*<\/script>/);
    if (match) {
      const playInfo = JSON.parse(match[1]);
      if (playInfo.data?.dash?.audio) {
        const audios = playInfo.data.dash.audio.sort((a: any, b: any) => a.bandwidth - b.bandwidth);
        audioUrl = audios[0].baseUrl || audios[0].base_url;
        if (audioUrl) {
          console.log(`✅ 音频 URL (页面 HTML): ${audioUrl.substring(0, 100)}...`);
        }
      }
    }
  }

  if (!audioUrl) {
    console.error("❌ 无法获取音频流地址");
    process.exit(1);
  }
  console.log();

  // 4. 测试音频下载
  console.log("⬇️  步骤 4: 测试音频下载");
  console.log("-".repeat(80));
  console.log(`正在测试下载: ${audioUrl.substring(0, 80)}...`);

  const audioRes = await fetch(audioUrl, {
    method: "HEAD",
    headers: BILIBILI_HEADERS
  });

  if (!audioRes.ok) {
    console.error(`❌ 音频 URL 无法访问 (HTTP ${audioRes.status}): ${audioRes.statusText}`);
    console.error();
    console.error("可能原因：");
    console.error("1. 音频 URL 已过期（B站 URL 通常几小时后失效）");
    console.error("2. IP 被 B站 临时封禁");
    console.error("3. 视频需要登录或大会员");
    console.error();
    console.error("解决方案：");
    console.error("- 尝试其他视频");
    console.error("- 等待几分钟后重试");
    process.exit(1);
  }

  const contentLength = audioRes.headers.get("content-length");
  const contentType = audioRes.headers.get("content-type");

  if (contentLength) {
    const sizeMB = parseInt(contentLength) / 1024 / 1024;
    console.log(`✅ 音频大小: ${sizeMB.toFixed(2)}MB`);
  }

  if (contentType) {
    console.log(`✅ 音频格式: ${contentType}`);
  }

  console.log(`✅ 音频 URL 可访问（HTTP ${audioRes.status}）`);
  console.log();

  // 5. 测试完整下载（可选）
  console.log("📥 步骤 5: 测试完整下载（可选）");
  console.log("-".repeat(80));
  console.log("正在下载音频...");

  const fullAudioRes = await fetch(audioUrl, { headers: BILIBILI_HEADERS });

  if (!fullAudioRes.ok) {
    console.error(`❌ 下载失败 (HTTP ${fullAudioRes.status})`);
    process.exit(1);
  }

  const audioBlob = await fullAudioRes.blob();
  console.log(`✅ 下载成功: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);
  console.log();

  // 总结
  console.log("=".repeat(80));
  console.log("✅ 诊断完成 - 所有检查通过！");
  console.log("=".repeat(80));
  console.log();
  console.log("📊 总结：");
  console.log(`  - 视频: ${title}`);
  console.log(`  - 时长: ${Math.floor(duration / 60)} 分钟`);
  console.log(`  - 音频大小: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  - 状态: 可以正常处理 ✅`);
  console.log();
  console.log("💡 下一步：在浏览器中访问 http://localhost:3000 并输入这个视频 URL");
}

// 主程序
const videoUrl = process.argv[2];

if (!videoUrl) {
  console.error("用法: npx tsx scripts/diagnose.ts <B站视频URL>");
  console.error();
  console.error("示例:");
  console.error("  npx tsx scripts/diagnose.ts https://www.bilibili.com/video/BV1GJ411x7h7");
  process.exit(1);
}

diagnose(videoUrl).catch((err) => {
  console.error();
  console.error("❌ 诊断过程中发生错误:");
  console.error(err);
  process.exit(1);
});
