import { CONFIG } from "./config.js";

let loaderPromise;
let mapLibrariesPromise;
let placesLibraryPromise;

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
  if (loaderPromise) return loaderPromise;
  validateMapsConfig();

  loaderPromise = new Promise((resolve, reject) => {
    const callbackName = `__shortVideoMapsReady_${Date.now()}`;
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Google Maps 載入逾時，請檢查網路、API Key 與網站限制。"));
    }, 25000);

    window[callbackName] = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      if (window.google?.maps?.importLibrary) resolve(window.google.maps);
      else reject(new Error("Google Maps 已載入，但 importLibrary 無法使用。"));
    };

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: CONFIG.googleMapsApiKey,
      callback: callbackName,
      v: "weekly",
      language: "zh-TW",
      region: "TW",
      loading: "async"
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.dataset.shortVideoMapsLoader = "true";
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      loaderPromise = null;
      reject(new Error("Google Maps 載入失敗，請檢查 API Key、API 限制與網站限制。"));
    };
    document.head.append(script);
  });

  return loaderPromise;
}

export function loadMapLibraries() {
  if (mapLibrariesPromise) return mapLibrariesPromise;
  mapLibrariesPromise = (async () => {
    await loadGoogleMaps();
    const [mapsLibrary, markerLibrary] = await Promise.all([
      window.google.maps.importLibrary("maps"),
      window.google.maps.importLibrary("marker")
    ]);
    return {
      Map: mapsLibrary.Map,
      InfoWindow: mapsLibrary.InfoWindow,
      LatLngBounds: mapsLibrary.LatLngBounds,
      AdvancedMarkerElement: markerLibrary.AdvancedMarkerElement,
      PinElement: markerLibrary.PinElement
    };
  })().catch((error) => {
    mapLibrariesPromise = null;
    throw error;
  });
  return mapLibrariesPromise;
}

export function loadPlacesLibrary() {
  if (placesLibraryPromise) return placesLibraryPromise;
  placesLibraryPromise = (async () => {
    await loadGoogleMaps();
    return window.google.maps.importLibrary("places");
  })().catch((error) => {
    placesLibraryPromise = null;
    throw error;
  });
  return placesLibraryPromise;
}
