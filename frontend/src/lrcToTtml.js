/** @param {number} ms */
function formatTtmlTime(ms) {
  const safe = Math.max(0, Math.floor(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const milliseconds = safe % 1000;
  const pad2 = (n) => String(n).padStart(2, "0");
  const pad3 = (n) => String(n).padStart(3, "0");
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(milliseconds)}`;
}

/** @param {string} text */
function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 将 WaveDance 行级歌词转为 am-lyrics 可解析的 TTML。
 * @param {{ timeMs: number, text: string }[]} lines
 * @param {number | null | undefined} durationMs
 */
export function linesToTtml(lines, durationMs) {
  if (!Array.isArray(lines) || lines.length === 0) return "";

  const sorted = [...lines]
    .filter((line) => line?.text)
    .sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
  if (sorted.length === 0) return "";

  const fallbackEnd =
    typeof durationMs === "number" && durationMs > 0
      ? durationMs
      : sorted[sorted.length - 1].timeMs + 8_000;

  let body = '<?xml version="1.0" encoding="UTF-8"?>\n';
  body +=
    '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyrics">\n';
  body += "  <body>\n    <div>\n";

  for (let i = 0; i < sorted.length; i += 1) {
    const line = sorted[i];
    const beginMs = Math.max(0, line.timeMs || 0);
    const nextBegin =
      i + 1 < sorted.length ? sorted[i + 1].timeMs : fallbackEnd;
    const endMs = Math.max(beginMs + 500, nextBegin);
    body += `      <p begin="${formatTtmlTime(beginMs)}" end="${formatTtmlTime(endMs)}">${escapeXml(line.text)}</p>\n`;
  }

  body += "    </div>\n  </body>\n</tt>";
  return body;
}

/**
 * 纯文本歌词按固定间隔生成 TTML（与主窗 plainLyrics 逻辑一致）。
 * @param {string} plainLyrics
 * @param {number | null | undefined} durationMs
 */
export function plainLyricsToTtml(plainLyrics, durationMs) {
  const rows = String(plainLyrics || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (rows.length === 0) return "";

  const intervalMs = 4_000;
  const lines = rows.map((text, index) => ({
    timeMs: index * intervalMs,
    text,
  }));
  const totalMs =
    typeof durationMs === "number" && durationMs > 0
      ? durationMs
      : rows.length * intervalMs;
  return linesToTtml(lines, totalMs);
}
