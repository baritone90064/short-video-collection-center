import { CONFIG } from "./config.js";

let mapsPromise;

function validateMapsConfig() {
  if (!CONFIG.googleMapsApiKey || CONFIG.googleMapsApiKey.startsWith("請填入_")) {
    throw new Error("請先在 config.js 填入 Google Maps API Key。");
  }
  if (!CONFIG.googleMapsMapId || CONFIG.googleMapsMapId.startsWith("請填入_")) {
    throw new Error("請先在 config.js 填入 Google Maps Map ID。");
  }
}

export function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;
  validateMapsConfig();
  mapsPromise = new Promise((resolve, reject) => {
    const callbackName = "__shortVideoMapsReady";
    const timer = window.setTimeout(() => reject(new Error("Google Maps 載入逾時。")), 20000);
    window[callbackName] = () => {
      window.clearTimeout(timer);
      delete window[callbackName];
      resolve(window.google.maps);
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: CONFIG.googleMapsApiKey,
      callback: callbackName,
      v: "weekly",
      libraries: "places,marker",
      language: "zh-TW",
      region: "TW",
      loading: "async"
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Google Maps 載入失敗，請檢查 API Key 與網站限制。"));
    };
    document.head.append(script);
  });
  return mapsPromise;
}

export async function loadMapLibraries() {
  await loadGoogleMaps();
  const [mapsLibrary, markerLibrary] = await Promise.all([
    google.maps.importLibrary("maps"),
    google.maps.importLibrary("marker")
  ]);
  return {
    Map: mapsLibrary.Map,
    InfoWindow: mapsLibrary.InfoWindow,
    LatLngBounds: mapsLibrary.LatLngBounds,
    AdvancedMarkerElement: markerLibrary.AdvancedMarkerElement
  };
}

export async function loadPlacesLibrary() {
  await loadGoogleMaps();
  return google.maps.importLibrary("places");
}
