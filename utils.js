const ICON_PATHS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',
  map: '<path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  filter: '<path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"/>',
  play: '<path d="m9 7 8 5-8 5V7Z"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v7H4V6h7"/>',
  navigation: '<path d="m5 4 14 7-6 2-2 6L5 4Z"/>',
  location: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  tag: '<path d="M20 13 13 20 4 11V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  logout: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  sparkles: '<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14ZM19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13Z"/>',
  restaurant: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c3 2 4 5 4 8h-4"/>',
  scenic: '<path d="M3 19h18L15 9l-3 4-2-3-7 9Z"/><circle cx="17" cy="6" r="2"/>',
  lodging: '<path d="M3 12v8M21 12v8M3 17h18M6 12V7h6a4 4 0 0 1 4 4v1M6 12h15"/>',
  shopping: '<path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  knowledge: '<path d="M9 18h6M10 22h4"/><path d="M8.5 15.5A7 7 0 1 1 15.5 15.5C14.5 16.3 14 17 14 18h-4c0-1-.5-1.7-1.5-2.5Z"/>',
  learning: '<path d="m3 10 9-5 9 5-9 5-9-5Z"/><path d="M7 13v4c3 2 7 2 10 0v-4M21 10v6"/>',
  ai: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9h.01M15 9h.01M8 15c2.5 2 5.5 2 8 0M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/>',
  health: '<path d="M12 21S4 16 4 9a4 4 0 0 1 7-2.6L12 7.5l1-1.1A4 4 0 0 1 20 9c0 7-8 12-8 12Z"/><path d="M7.5 12h2l1-2 2.2 5 1.3-3h2.5"/>',
  entertainment: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="m8 2 2 3M14 2l-2 3M8 10l7 3-7 3v-6Z"/>',
  other: '<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  chevronDown: '<path d="m7 10 5 5 5-5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.7-2L20 12M4 12l2.2 5a7 7 0 0 0 11.7-2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4 4-2Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
};

export function iconSvg(name, className = "icon", title = "") {
  const paths = ICON_PATHS[name] || ICON_PATHS.other;
  return `<svg class="${escapeHtml(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="${title ? "false" : "true"}"${title ? ` role="img"><title>${escapeHtml(title)}</title>` : ">"}${paths}</svg>`;
}

export const ICON_OPTIONS = [
  ["scenic", "景點"], ["restaurant", "餐廳"], ["lodging", "住宿"], ["shopping", "購物"],
  ["knowledge", "知識"], ["learning", "學習"], ["ai", "AI工具"], ["work", "工作"],
  ["health", "健康"], ["entertainment", "娛樂"], ["sparkles", "靈感"], ["other", "其他"]
];

const LEGACY_ICON_ALIASES = {
  "📍": "scenic", "🍴": "restaurant", "🛏️": "lodging", "🛍️": "shopping",
  "💡": "knowledge", "📚": "learning", "✨": "ai", "💼": "work",
  "💪": "health", "🎬": "entertainment", "●": "other"
};

export function categoryIconKey(category = {}) {
  const raw = String(category.icon || "");
  if (ICON_PATHS[raw]) return raw;
  if (LEGACY_ICON_ALIASES[raw]) return LEGACY_ICON_ALIASES[raw];
  const id = String(category.id || "").toLowerCase();
  const name = String(category.name || "").toLowerCase();
  if (id.includes("scenic") || name.includes("景")) return "scenic";
  if (id.includes("restaurant") || name.includes("餐") || name.includes("食")) return "restaurant";
  if (id.includes("lodging") || name.includes("住")) return "lodging";
  if (id.includes("shopping") || name.includes("購")) return "shopping";
  if (id.includes("knowledge") || name.includes("知識")) return "knowledge";
  if (id.includes("learning") || name.includes("學")) return "learning";
  if (id.includes("ai") || name.includes("ai")) return "ai";
  if (id.includes("work") || name.includes("工作")) return "work";
  if (id.includes("health") || name.includes("健康")) return "health";
  if (id.includes("entertainment") || name.includes("娛樂")) return "entertainment";
  return "other";
}

const CATEGORY_COLORS = ["#f47b64", "#f5a623", "#67c7a3", "#41b7b2", "#8b78e6", "#ef6f9a", "#5aa7e8", "#f4bf4f"];

export function categoryColor(category = {}) {
  if (/^#[0-9a-f]{6}$/i.test(String(category.color || ""))) return category.color;
  const id = String(category.id || category.name || "other");
  let hash = 0;
  for (const char of id) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

export function categoryIconHtml(category, className = "category-icon") {
  const color = categoryColor(category);
  return `<span class="${escapeHtml(className)}" style="--category-color:${escapeHtml(color)}">${iconSvg(categoryIconKey(category), "icon")}</span>`;
}

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
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => url.searchParams.delete(key));
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
  threads: { label: "Threads", short: "Th", color: "#1f2937" },
  instagram: { label: "Instagram", short: "IG", color: "#ef6f9a" },
  facebook: { label: "Facebook", short: "FB", color: "#4b82db" },
  xiaohongshu: { label: "小紅書", short: "紅", color: "#f25555" },
  tiktok: { label: "TikTok", short: "TT", color: "#292d32" },
  youtube: { label: "YouTube", short: "YT", color: "#ef4444" },
  other: { label: "其他", short: "網", color: "#8b78e6" }
};

export function platformMeta(platform) {
  return PLATFORM_META[platform] || PLATFORM_META.other;
}

export function platformBadge(platform, size = "normal") {
  const meta = platformMeta(platform);
  return `<span class="platform-badge ${size === "small" ? "platform-badge-small" : ""}" style="--platform-color:${escapeHtml(meta.color)}">${escapeHtml(meta.short)}</span>`;
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
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
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
  window.setTimeout(() => item.remove(), 3600);
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
