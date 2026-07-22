import {
  distanceBetween,
  geohashForLocation,
  geohashQueryBounds
} from "https://cdn.jsdelivr.net/npm/geofire-common@6.0.0/+esm";

export function toGeohash(latitude, longitude) {
  return geohashForLocation([Number(latitude), Number(longitude)]);
}

export function geoBounds(center, radiusKm) {
  return geohashQueryBounds(
    [Number(center.latitude), Number(center.longitude)],
    Number(radiusKm) * 1000
  );
}

export function distanceKm(a, b) {
  return distanceBetween(
    [Number(a.latitude), Number(a.longitude)],
    [Number(b.latitude), Number(b.longitude)]
  );
}

export function getCurrentPosition(options = {}) {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("此瀏覽器不支援定位功能。"));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      }),
      (error) => {
        const messages = {
          1: "定位權限被拒絕，請在瀏覽器設定中允許定位。",
          2: "目前無法取得位置。",
          3: "取得位置逾時，請稍後重試。"
        };
        reject(new Error(messages[error.code] || "無法取得目前位置。"));
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 120000,
        ...options
      }
    );
  });
}

export function categoryEmoji(name = "") {
  const text = String(name).toLowerCase();
  if (text.includes("餐")) return "🍴";
  if (text.includes("景")) return "📍";
  if (text.includes("住")) return "🛏️";
  if (text.includes("購")) return "🛍️";
  if (text.includes("ai")) return "✨";
  if (text.includes("知識")) return "💡";
  if (text.includes("學")) return "📚";
  if (text.includes("工作")) return "💼";
  if (text.includes("健康")) return "💪";
  if (text.includes("娛樂")) return "🎬";
  return "●";
}
