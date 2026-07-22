export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => {
      url.searchParams.delete(key);
    });
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return raw;
  }
}

export function detectPlatform(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("threads.net")) return "threads";
  if (normalized.includes("instagram.com")) return "instagram";
  if (normalized.includes("facebook.com") || normalized.includes("fb.watch")) return "facebook";
  if (normalized.includes("xiaohongshu.com") || normalized.includes("xhslink.com")) return "xiaohongshu";
  if (normalized.includes("tiktok.com")) return "tiktok";
  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) return "youtube";
  return "other";
}

export const PLATFORM_META = {
  threads: { label: "Threads", icon: "＠" },
  instagram: { label: "Instagram", icon: "◎" },
  facebook: { label: "Facebook", icon: "f" },
  xiaohongshu: { label: "小紅書", icon: "書" },
  tiktok: { label: "TikTok", icon: "♪" },
  youtube: { label: "YouTube", icon: "▶" },
  other: { label: "其他", icon: "🔗" }
};

export function platformMeta(platform) {
  return PLATFORM_META[platform] || PLATFORM_META.other;
}

export function parseTags(value) {
  return [...new Set(String(value || "")
    .split(/[,，;；\n]/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean))]
    .slice(0, 20);
}

export function formatDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function timestampMs(value) {
  if (value?.toMillis) return value.toMillis();
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

export function showToast(message, type = "") {
  const root = document.querySelector("#toast-root");
  if (!root) return;
  const item = document.createElement("div");
  item.className = `toast ${type}`.trim();
  item.textContent = message;
  root.append(item);
  window.setTimeout(() => item.remove(), 3400);
}

export function confirmDialog(message) {
  return window.confirm(message);
}

export function debounce(callback, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "#";
    return url.toString();
  } catch {
    return "#";
  }
}
