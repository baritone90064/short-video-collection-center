import { CONFIG } from "./config.js";
import { loginWithGoogle, logout, observeAuth } from "./firebase-client.js";
import {
  addCategory,
  createBookmark,
  deleteCategoryAndMove,
  findDuplicateUrl,
  getBookmark,
  importBookmarks,
  listBookmarks,
  listCategories,
  queryNearbyBookmarks,
  removeBookmark,
  seedDefaultCategories,
  updateBookmark,
  updateCategory,
  upsertUserProfile
} from "./data.js";
import { distanceKm, getCurrentPosition, toGeohash } from "./geo.js";
import { loadMapLibraries, loadPlacesLibrary } from "./maps-loader.js";
import {
  ICON_OPTIONS,
  categoryColor,
  categoryIconHtml,
  categoryIconKey,
  confirmDialog,
  detectPlatform,
  downloadJson,
  escapeHtml,
  formatDate,
  iconSvg,
  normalizeUrl,
  parseTags,
  platformBadge,
  platformMeta,
  safeExternalUrl,
  showToast,
  timestampMs
} from "./utils.js";

const appRoot = document.querySelector("#app");

const state = {
  user: null,
  categories: [],
  bookmarks: [],
  cleanup: [],
  authReady: false,
  coreLoaded: false,
  corePromise: null
};

function registerCleanup(callback) {
  state.cleanup.push(callback);
}

function clearPage() {
  state.cleanup.splice(0).forEach((callback) => {
    try { callback(); } catch (error) { console.warn(error); }
  });
}

function routeName() {
  const hash = location.hash || "#/home";
  const [path, id] = hash.replace(/^#\//, "").split("/");
  return { path: path || "home", id: id || "" };
}

function go(path) {
  location.hash = path.startsWith("#") ? path : `#/${path.replace(/^\//, "")}`;
}

async function ensureCoreData(force = false) {
  if (!state.user) return;
  if (state.coreLoaded && !force) return;
  if (state.corePromise && !force) return state.corePromise;

  state.corePromise = (async () => {
    await seedDefaultCategories();
    const [categories, bookmarks] = await Promise.all([
      listCategories(),
      listBookmarks()
    ]);
    state.categories = categories;
    state.bookmarks = bookmarks;
    state.coreLoaded = true;
  })().finally(() => {
    state.corePromise = null;
  });

  return state.corePromise;
}

function navItems(active) {
  const items = [
    ["home", "home", "收藏"],
    ["map", "map", "地圖"],
    ["add", "plus", "新增"],
    ["settings", "user", "我的"]
  ];
  return items.map(([key, icon, label]) => `
    <button class="nav-item ${key === active ? "active" : ""} ${key === "add" ? "add-nav" : ""}" data-nav="${key}" aria-label="${escapeHtml(label)}">
      <span class="nav-icon">${iconSvg(icon)}</span>
      <span>${label}</span>
    </button>
  `).join("");
}

function renderShell({ title, subtitle = "", active, content, actions = "" }) {
  appRoot.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-title">
          <div class="brand-logo">▶</div>
          <div class="topbar-copy">
            <strong>${escapeHtml(title)}</strong>
            ${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ""}
          </div>
        </div>
        <div class="topbar-actions">${actions}</div>
      </header>
      <main class="page ${active === "map" ? "map-page" : ""}">${content}</main>
      <nav class="bottom-nav" aria-label="主要選單">${navItems(active)}</nav>
    </div>
  `;

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => go(button.dataset.nav));
  });
}

function renderLoading(title = "載入中…", active = "home") {
  renderShell({
    title,
    active,
    content: `<div class="card loading-card"><div class="spinner"></div><p>正在同步收藏資料…</p></div>`
  });
}

function renderLogin(errorMessage = "") {
  clearPage();
  appRoot.innerHTML = `
    <div class="login-page">
      <section class="login-card card">
        <div class="login-logo">▶</div>
        <h1>${escapeHtml(CONFIG.appName)}</h1>
        <p>把喜歡的短影音變成可搜尋、可分類、可在地圖探索的靈感收藏庫。</p>
        ${errorMessage ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>` : ""}
        <button id="google-login" class="btn google-btn">
          <span class="google-g">G</span> 使用 Google 帳號登入
        </button>
        <p class="small muted">兩位授權使用者共同編輯同一份收藏資料。</p>
      </section>
    </div>
  `;

  document.querySelector("#google-login")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      button.disabled = true;
      button.innerHTML = `<span class="spinner" style="width:20px;height:20px;border-width:3px"></span> 登入中…`;
      await loginWithGoogle();
    } catch (error) {
      console.error(error);
      renderLogin(error?.message || "Google 登入失敗。");
    }
  });
}

function categoryMap() {
  return new Map(state.categories.map((category) => [category.id, category]));
}

function categoryOptions(selectedId = "") {
  return state.categories
    .filter((category) => category.active || category.id === selectedId)
    .map((category) => `<option value="${escapeHtml(category.id)}" ${category.id === selectedId ? "selected" : ""}>${escapeHtml(category.name)}</option>`)
    .join("");
}

function fallbackThumb(platform) {
  const meta = platformMeta(platform);
  return `<div class="platform-fallback">${platformBadge(platform)}<span class="platform-name">${escapeHtml(meta.label)}</span></div>`;
}

function bookmarkCard(bookmark, categories, currentPosition = null) {
  const category = categories.get(bookmark.categoryId) || { id: "other", name: "其他", icon: "other" };
  const meta = platformMeta(bookmark.platform);
  const distance = currentPosition && bookmark.location ? distanceKm(currentPosition, bookmark.location) : null;
  const image = bookmark.thumbnailUrl
    ? `<img src="${escapeHtml(bookmark.thumbnailUrl)}" alt="" loading="lazy" data-thumb-platform="${escapeHtml(bookmark.platform)}" />`
    : fallbackThumb(bookmark.platform);

  return `
    <article class="bookmark-card card" data-bookmark-card="${escapeHtml(bookmark.id)}">
      <div class="bookmark-cover">
        ${image}
        <div class="bookmark-category-float">
          ${categoryIconHtml(category)}
          <span>${escapeHtml(category.name)}</span>
        </div>
      </div>
      <div class="bookmark-body">
        <h3 class="bookmark-title">${escapeHtml(bookmark.title || "未命名收藏")}</h3>
        <div class="bookmark-meta">
          <span class="meta-item">${platformBadge(bookmark.platform, "small")} ${escapeHtml(meta.label)}</span>
          ${bookmark.location?.placeName ? `<span class="meta-item">${iconSvg("location")} ${escapeHtml(bookmark.location.placeName)}</span>` : ""}
          ${distance != null ? `<span class="meta-item">${iconSvg("compass")} ${distance.toFixed(distance < 10 ? 1 : 0)} km</span>` : ""}
          ${bookmark.createdAt ? `<span class="meta-item">${formatDate(bookmark.createdAt)}</span>` : ""}
        </div>
        ${bookmark.tags?.length ? `<div class="tag-list">${bookmark.tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        ${bookmark.note ? `<div class="bookmark-note">${escapeHtml(bookmark.note)}</div>` : ""}
        <div class="card-actions">
          <a class="btn btn-coral-soft" href="${escapeHtml(safeExternalUrl(bookmark.url))}" target="_blank" rel="noreferrer">${iconSvg("play")} 開啟</a>
          <button class="btn btn-secondary" data-edit-bookmark="${escapeHtml(bookmark.id)}">${iconSvg("edit")} 編輯</button>
          <button class="btn btn-danger" data-delete-bookmark="${escapeHtml(bookmark.id)}" aria-label="刪除">${iconSvg("trash")}</button>
        </div>
      </div>
    </article>
  `;
}

function bindBookmarkCardActions(onChanged) {
  document.querySelectorAll("img[data-thumb-platform]").forEach((image) => {
    image.addEventListener("error", () => {
      image.parentElement.innerHTML = fallbackThumb(image.dataset.thumbPlatform);
    }, { once: true });
  });
  document.querySelectorAll("[data-edit-bookmark]").forEach((button) => {
    button.addEventListener("click", () => go(`edit/${button.dataset.editBookmark}`));
  });
  document.querySelectorAll("[data-delete-bookmark]").forEach((button) => {
    button.addEventListener("click", async () => {
      const bookmark = state.bookmarks.find((item) => item.id === button.dataset.deleteBookmark);
      if (!bookmark || !confirmDialog(`確定刪除「${bookmark.title || "未命名收藏"}」？`)) return;
      try {
        button.disabled = true;
        await removeBookmark(bookmark.id);
        state.bookmarks = state.bookmarks.filter((item) => item.id !== bookmark.id);
        showToast("收藏已刪除。", "success");
        onChanged?.();
      } catch (error) {
        console.error(error);
        showToast(error?.message || "刪除失敗。", "error");
        button.disabled = false;
      }
    });
  });
}

async function renderCollectionPage() {
  clearPage();
  await ensureCoreData();

  const local = { search: "", categoryId: "", sort: "newest", position: null };
  const categories = categoryMap();
  const locationCount = state.bookmarks.filter((item) => item.hasLocation).length;

  renderShell({
    title: "我的收藏",
    subtitle: "短影音靈感，一次整理",
    active: "home",
    actions: `<button class="btn btn-primary hide-mobile" id="top-add">${iconSvg("plus")} 新增收藏</button>`,
    content: `
      <section class="hero">
        <h1>今天想探索什麼？</h1>
        <p>從收藏影片快速找到景點、餐廳、知識與生活靈感。</p>
        <div class="hero-stats">
          <span class="hero-stat">${state.bookmarks.length} 筆收藏</span>
          <span class="hero-stat">${locationCount} 個地點</span>
          <span class="hero-stat">${state.categories.filter((item) => item.active).length} 種分類</span>
        </div>
      </section>
      <section>
        <div class="toolbar">
          <div class="search-box">${iconSvg("search")}<input id="collection-search" type="search" placeholder="搜尋標題、標籤、備註或地點" /></div>
          <select id="collection-sort" style="width:auto" aria-label="排序方式">
            <option value="newest">最新加入</option>
            <option value="name">名稱</option>
            <option value="distance">距離目前位置</option>
          </select>
        </div>
        <div class="chips" id="category-chips">
          <button class="chip active" data-category-filter="">全部</button>
          ${state.categories.filter((category) => category.active).map((category) => `<button class="chip" data-category-filter="${escapeHtml(category.id)}"><span class="category-chip-dot" style="--category-color:${escapeHtml(categoryColor(category))}"></span>${escapeHtml(category.name)}</button>`).join("")}
        </div>
        <div id="collection-result" style="margin-top:12px"></div>
      </section>
    `
  });

  document.querySelector("#top-add")?.addEventListener("click", () => go("add"));

  const update = () => {
    const queryText = local.search.trim().toLowerCase();
    let records = [...state.bookmarks];
    if (local.categoryId) records = records.filter((bookmark) => bookmark.categoryId === local.categoryId);
    if (queryText) {
      records = records.filter((bookmark) => [
        bookmark.title,
        bookmark.note,
        bookmark.location?.placeName,
        bookmark.location?.address,
        ...(bookmark.tags || [])
      ].some((value) => String(value || "").toLowerCase().includes(queryText)));
    }
    if (local.sort === "name") {
      records.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "zh-Hant"));
    } else if (local.sort === "distance" && local.position) {
      records.sort((a, b) => {
        const da = a.location ? distanceKm(local.position, a.location) : Number.POSITIVE_INFINITY;
        const db = b.location ? distanceKm(local.position, b.location) : Number.POSITIVE_INFINITY;
        return da - db;
      });
    } else {
      records.sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt));
    }

    const result = document.querySelector("#collection-result");
    result.innerHTML = records.length
      ? `<div class="bookmark-grid">${records.map((bookmark) => bookmarkCard(bookmark, categories, local.position)).join("")}</div>`
      : `<div class="empty-state card"><div class="empty-illustration">${iconSvg("sparkles")}</div><h3>還沒有符合條件的收藏</h3><p>換個分類或關鍵字看看。</p></div>`;
    bindBookmarkCardActions(update);
  };

  document.querySelector("#collection-search").addEventListener("input", (event) => {
    local.search = event.target.value;
    update();
  });
  document.querySelector("#collection-sort").addEventListener("change", async (event) => {
    local.sort = event.target.value;
    if (local.sort === "distance" && !local.position) {
      try {
        const position = await getCurrentPosition();
        local.position = { latitude: position.latitude, longitude: position.longitude };
      } catch (error) {
        showToast(error?.message || "無法取得位置。", "error");
        local.sort = "newest";
        event.target.value = "newest";
      }
    }
    update();
  });
  document.querySelectorAll("[data-category-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      local.categoryId = button.dataset.categoryFilter;
      document.querySelectorAll("[data-category-filter]").forEach((item) => item.classList.toggle("active", item === button));
      update();
    });
  });
  update();
}

function locationSection(place = null) {
  return `
    <section class="form-section location-section">
      <div class="location-head">
        <div class="location-head-copy">
          <span class="section-icon" style="background:var(--mint-soft);color:var(--mint-deep)">${iconSvg("location")}</span>
          <div><h3>地點資訊</h3><span class="small muted">選填；有座標才會顯示在收藏地圖</span></div>
        </div>
        <span class="location-badge">可手動輸入</span>
      </div>
      <div class="form-grid two">
        <label class="field">地點名稱<input id="place-name" type="text" value="${escapeHtml(place?.placeName || "")}" placeholder="例如：雙流國家森林遊樂區" /></label>
        <label class="field">地址<input id="place-address" type="text" value="${escapeHtml(place?.address || "")}" placeholder="可搜尋後自動帶入，也可自行輸入" /></label>
        <label class="field">緯度 Latitude<input id="place-latitude" type="text" inputmode="decimal" value="${place?.latitude ?? ""}" placeholder="例如：25.0478" /></label>
        <label class="field">經度 Longitude<input id="place-longitude" type="text" inputmode="decimal" value="${place?.longitude ?? ""}" placeholder="例如：121.5319" /></label>
      </div>
      <div class="place-tools">
        <button type="button" class="btn btn-soft" id="open-place-picker">${iconSvg("search")} 搜尋地點與地圖選點</button>
        <button type="button" class="btn btn-secondary" id="use-current-place">${iconSvg("compass")} 使用目前位置</button>
        <button type="button" class="btn btn-danger" id="clear-place">${iconSvg("trash")} 清除地點</button>
      </div>
      <div id="place-picker-panel" class="place-picker-wrap hidden">
        <div id="autocomplete-host" class="autocomplete-host"></div>
        <div id="place-map" class="place-picker-map"></div>
      </div>
      <p class="coordinate-note">搜尋不到時，可直接輸入地址與座標；系統會依緯度、經度產生 Geohash。</p>
    </section>
  `;
}

async function initPlacePicker(placeState) {
  const host = document.querySelector("#autocomplete-host");
  const mapNode = document.querySelector("#place-map");
  if (!host || !mapNode) return null;

  mapNode.innerHTML = `<div class="map-placeholder"><div><div class="spinner" style="margin:0 auto 10px"></div><p>正在載入 Google 地圖…</p></div></div>`;

  try {
    const [mapLibrary, placesLibrary] = await Promise.all([loadMapLibraries(), loadPlacesLibrary()]);
    const { Map, AdvancedMarkerElement, PinElement } = mapLibrary;
    const initial = Number.isFinite(Number(placeState.latitude)) && Number.isFinite(Number(placeState.longitude))
      ? { lat: Number(placeState.latitude), lng: Number(placeState.longitude) }
      : CONFIG.defaultCenter;

    mapNode.replaceChildren();
    const map = new Map(mapNode, {
      center: initial,
      zoom: Number.isFinite(Number(placeState.latitude)) ? 16 : 11,
      mapId: CONFIG.googleMapsMapId,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false
    });

    const pin = new PinElement({ background: "#f47b64", borderColor: "#ffffff", glyphColor: "#ffffff", glyphText: "●", scale: 1.12 });
    const marker = new AdvancedMarkerElement({
      map,
      position: Number.isFinite(Number(placeState.latitude)) ? initial : null,
      gmpDraggable: true,
      title: placeState.placeName || "選擇地點"
    });
    marker.append(pin);

    const syncInputs = () => {
      const name = document.querySelector("#place-name");
      const address = document.querySelector("#place-address");
      const lat = document.querySelector("#place-latitude");
      const lng = document.querySelector("#place-longitude");
      if (name) name.value = placeState.placeName || "";
      if (address) address.value = placeState.address || "";
      if (lat) lat.value = placeState.latitude ?? "";
      if (lng) lng.value = placeState.longitude ?? "";
    };

    const setPosition = (latitude, longitude, zoom = null) => {
      placeState.latitude = Number(latitude);
      placeState.longitude = Number(longitude);
      marker.position = { lat: placeState.latitude, lng: placeState.longitude };
      marker.title = placeState.placeName || "自訂地點";
      map.panTo({ lat: placeState.latitude, lng: placeState.longitude });
      if (zoom) map.setZoom(zoom);
      syncInputs();
    };

    marker.addListener("dragend", () => {
      const position = marker.position;
      if (!position) return;
      const latitude = typeof position.lat === "function" ? position.lat() : position.lat;
      const longitude = typeof position.lng === "function" ? position.lng() : position.lng;
      if (!placeState.placeName) placeState.placeName = "自訂地點";
      setPosition(latitude, longitude);
    });

    map.addListener("click", (event) => {
      if (!event.latLng) return;
      if (!placeState.placeName) placeState.placeName = "自訂地點";
      setPosition(event.latLng.lat(), event.latLng.lng());
    });

    const { PlaceAutocompleteElement } = placesLibrary;
    const autocomplete = new PlaceAutocompleteElement();
    autocomplete.placeholder = "搜尋店家、景點或地址";
    autocomplete.className = "google-place-autocomplete";
    host.replaceChildren(autocomplete);
    autocomplete.addEventListener("gmp-select", async (event) => {
      try {
        const prediction = event.placePrediction;
        if (!prediction) throw new Error("未取得地點搜尋結果。");
        const place = prediction.toPlace();
        await place.fetchFields({ fields: ["id", "displayName", "formattedAddress", "location", "viewport"] });
        if (!place.location) throw new Error("此地點沒有座標。");
        placeState.placeName = String(place.displayName || "未命名地點");
        placeState.address = String(place.formattedAddress || "");
        placeState.placeId = String(place.id || "");
        setPosition(place.location.lat(), place.location.lng(), 17);
        if (place.viewport) map.fitBounds(place.viewport);
      } catch (error) {
        console.error(error);
        showToast(error?.message || "無法取得地點資料。", "error");
      }
    });

    return { map, marker, syncInputs, setPosition };
  } catch (error) {
    console.error(error);
    mapNode.innerHTML = `<div class="map-placeholder"><div>${iconSvg("map")}<p>${escapeHtml(error?.message || "地圖載入失敗。")}</p><p class="small">你仍可手動填入地址、緯度與經度。</p></div></div>`;
    throw error;
  }
}

async function renderBookmarkForm(bookmarkId = "") {
  clearPage();
  await ensureCoreData();

  const existing = bookmarkId
    ? state.bookmarks.find((item) => item.id === bookmarkId) || await getBookmark(bookmarkId)
    : null;
  if (bookmarkId && !existing) {
    renderShell({ title: "編輯收藏", active: "add", content: `<div class="alert alert-error">找不到這筆收藏。</div>` });
    return;
  }

  const placeState = existing?.location ? { ...existing.location } : {
    placeName: "", address: "", latitude: null, longitude: null, placeId: ""
  };
  let picker = null;
  let pickerLoading = false;

  renderShell({
    title: existing ? "編輯收藏" : "新增收藏",
    subtitle: existing ? "更新內容與地點" : "把靈感收進你的收藏庫",
    active: "add",
    content: `
      <form id="bookmark-form" class="card form-page-card">
        <div class="form-banner">
          <h2>${existing ? "編輯這筆收藏" : "新增一筆短影音收藏"}</h2>
          <p>連結、標題與分類為必填；縮圖與地點都可以稍後補上。</p>
        </div>
        <div class="form-content form-grid">
          <section class="form-section">
            <div class="section-title"><div class="section-title-copy"><span class="section-icon">${iconSvg("link")}</span><h3>基本資料</h3></div></div>
            <div class="form-grid two">
              <label class="field">短影音連結<input id="bookmark-url" type="url" required value="${escapeHtml(existing?.url || "")}" placeholder="貼上 Threads、FB、IG、小紅書等連結" /></label>
              <label class="field">平台<select id="bookmark-platform">
                ${Object.entries({ threads:"Threads", instagram:"Instagram", facebook:"Facebook", xiaohongshu:"小紅書", tiktok:"TikTok", youtube:"YouTube", other:"其他" }).map(([value,label]) => `<option value="${value}" ${(existing?.platform || "other") === value ? "selected" : ""}>${label}</option>`).join("")}
              </select></label>
            </div>
            <div class="form-grid" style="margin-top:14px">
              <label class="field">標題<input id="bookmark-title" type="text" required maxlength="160" value="${escapeHtml(existing?.title || "")}" placeholder="請輸入便於日後辨識的標題" /></label>
              <div class="form-grid two">
                <label class="field">分類<select id="bookmark-category" required>${categoryOptions(existing?.categoryId || state.categories.find((category) => category.active)?.id || "other")}</select></label>
                <label class="field">標籤<small>以逗號分隔，例如：花蓮, 瀑布, 車宿</small><input id="bookmark-tags" type="text" value="${escapeHtml((existing?.tags || []).join(", "))}" /></label>
              </div>
            </div>
          </section>
          <section class="form-section">
            <div class="section-title"><div class="section-title-copy"><span class="section-icon" style="background:#fff1df;color:#a66a18">${iconSvg("image")}</span><h3>補充資訊</h3></div></div>
            <div class="form-grid">
              <label class="field">縮圖網址（選填）<small>只保存外部圖片網址；失效時會自動顯示平台圖示。</small><input id="bookmark-thumbnail" type="url" value="${escapeHtml(existing?.thumbnailUrl || "")}" /></label>
              <label class="field">個人備註<textarea id="bookmark-note" maxlength="3000" placeholder="記錄推薦餐點、交通方式、購買原因或重點摘要…">${escapeHtml(existing?.note || "")}</textarea></label>
            </div>
          </section>
          ${locationSection(placeState)}
          <div id="form-message"></div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" id="cancel-form">取消</button>
            <button type="submit" class="btn btn-primary" id="save-bookmark">${iconSvg("check")} ${existing ? "儲存修改" : "新增收藏"}</button>
          </div>
        </div>
      </form>
    `
  });

  const urlInput = document.querySelector("#bookmark-url");
  const platformSelect = document.querySelector("#bookmark-platform");
  urlInput.addEventListener("blur", () => {
    const detected = detectPlatform(urlInput.value);
    if (!existing || platformSelect.value === "other") platformSelect.value = detected;
  });
  document.querySelector("#cancel-form").addEventListener("click", () => history.length > 1 ? history.back() : go("home"));

  const syncPlaceStateFromInputs = () => {
    placeState.placeName = document.querySelector("#place-name").value.trim();
    placeState.address = document.querySelector("#place-address").value.trim();
    const lat = Number(document.querySelector("#place-latitude").value);
    const lng = Number(document.querySelector("#place-longitude").value);
    placeState.latitude = Number.isFinite(lat) ? lat : null;
    placeState.longitude = Number.isFinite(lng) ? lng : null;
  };

  ["#place-name", "#place-address"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", syncPlaceStateFromInputs);
  });
  ["#place-latitude", "#place-longitude"].forEach((selector) => {
    document.querySelector(selector).addEventListener("change", () => {
      syncPlaceStateFromInputs();
      if (picker && Number.isFinite(Number(placeState.latitude)) && Number.isFinite(Number(placeState.longitude))) {
        picker.setPosition(placeState.latitude, placeState.longitude, 16);
      }
    });
  });

  document.querySelector("#open-place-picker").addEventListener("click", async (event) => {
    const panel = document.querySelector("#place-picker-panel");
    panel.classList.remove("hidden");
    if (picker || pickerLoading) {
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    try {
      pickerLoading = true;
      event.currentTarget.disabled = true;
      event.currentTarget.innerHTML = `<span class="spinner" style="width:18px;height:18px;border-width:3px"></span> 載入地圖中…`;
      picker = await initPlacePicker(placeState);
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      // 錯誤已顯示在地圖區域；仍可手動輸入。
    } finally {
      pickerLoading = false;
      event.currentTarget.disabled = false;
      event.currentTarget.innerHTML = `${iconSvg("search")} 搜尋地點與地圖選點`;
    }
  });

  document.querySelector("#use-current-place").addEventListener("click", async (event) => {
    try {
      event.currentTarget.disabled = true;
      const position = await getCurrentPosition();
      if (!placeState.placeName) placeState.placeName = "目前位置";
      placeState.latitude = position.latitude;
      placeState.longitude = position.longitude;
      document.querySelector("#place-name").value = placeState.placeName;
      document.querySelector("#place-latitude").value = position.latitude;
      document.querySelector("#place-longitude").value = position.longitude;
      picker?.setPosition(position.latitude, position.longitude, 17);
      showToast("已填入目前位置座標。", "success");
    } catch (error) {
      showToast(error?.message || "無法取得位置。", "error");
    } finally {
      event.currentTarget.disabled = false;
    }
  });

  document.querySelector("#clear-place").addEventListener("click", () => {
    Object.assign(placeState, { placeName: "", address: "", latitude: null, longitude: null, placeId: "" });
    ["#place-name", "#place-address", "#place-latitude", "#place-longitude"].forEach((selector) => {
      document.querySelector(selector).value = "";
    });
    if (picker?.marker) picker.marker.position = null;
    showToast("地點資料已清除。", "success");
  });

  document.querySelector("#bookmark-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const saveButton = document.querySelector("#save-bookmark");
    const message = document.querySelector("#form-message");
    try {
      saveButton.disabled = true;
      message.innerHTML = "";
      const url = urlInput.value.trim();
      const normalizedUrl = normalizeUrl(url);
      const duplicate = await findDuplicateUrl(normalizedUrl);
      if (duplicate && duplicate.id !== existing?.id) {
        throw new Error(`這個連結已收藏：${duplicate.title || "未命名收藏"}`);
      }

      syncPlaceStateFromInputs();
      const hasAnyLocationInput = Boolean(placeState.placeName || placeState.address || placeState.latitude != null || placeState.longitude != null);
      const hasCoordinates = Number.isFinite(Number(placeState.latitude)) && Number.isFinite(Number(placeState.longitude));
      if (hasAnyLocationInput && !hasCoordinates) {
        throw new Error("已填入地點資料時，請同時提供有效的緯度與經度；也可以按「搜尋地點與地圖選點」。");
      }

      const location = hasCoordinates ? {
        placeName: placeState.placeName || "自訂地點",
        address: placeState.address || "",
        latitude: Number(placeState.latitude),
        longitude: Number(placeState.longitude),
        geohash: toGeohash(Number(placeState.latitude), Number(placeState.longitude)),
        placeId: placeState.placeId || ""
      } : null;

      const input = {
        title: document.querySelector("#bookmark-title").value.trim(),
        url,
        normalizedUrl,
        platform: platformSelect.value,
        thumbnailUrl: document.querySelector("#bookmark-thumbnail").value.trim(),
        categoryId: document.querySelector("#bookmark-category").value,
        tags: parseTags(document.querySelector("#bookmark-tags").value),
        note: document.querySelector("#bookmark-note").value.trim(),
        hasLocation: Boolean(location),
        location
      };

      const now = new Date();
      if (existing) {
        await updateBookmark(existing.id, input);
        state.bookmarks = state.bookmarks.map((item) => item.id === existing.id ? { ...item, ...input, updatedAt: now } : item);
      } else {
        const id = await createBookmark(input);
        state.bookmarks.unshift({ id, ...input, createdAt: now, updatedAt: now });
      }
      showToast(existing ? "收藏已更新。" : "收藏已新增。", "success");
      go("home");
    } catch (error) {
      console.error(error);
      message.innerHTML = `<div class="alert alert-error">${escapeHtml(error?.message || "儲存失敗。")}</div>`;
    } finally {
      saveButton.disabled = false;
    }
  });
}

function createMapPin(mapLibraries, { color, glyph, position, title, map, draggable = false, zIndex = undefined }) {
  const pin = new mapLibraries.PinElement({
    background: color,
    borderColor: "#ffffff",
    glyphColor: "#ffffff",
    glyphText: glyph,
    scale: 1.08
  });
  const marker = new mapLibraries.AdvancedMarkerElement({
    map,
    position,
    title,
    gmpDraggable: draggable,
    gmpClickable: !draggable,
    zIndex
  });
  marker.append(pin);
  return marker;
}

async function renderMapPage() {
  clearPage();
  await ensureCoreData();

  renderShell({
    title: "收藏地圖",
    subtitle: "探索目前位置附近的收藏",
    active: "map",
    content: `
      <div class="map-toolbar">
        <select id="map-radius" aria-label="搜尋半徑">
          <option value="10">10 km</option>
          <option value="20">20 km</option>
          <option value="30">30 km</option>
          <option value="50">50 km</option>
        </select>
        <button class="btn btn-secondary" id="search-map-center">${iconSvg("search")} 搜尋此區域</button>
        <button class="btn btn-soft" id="return-current">${iconSvg("compass")} 目前位置</button>
      </div>
      <div class="map-category-filter" id="map-category-filter">
        <button class="chip active" data-map-category="">全部</button>
        ${state.categories.filter((category) => category.active).map((category) => `<button class="chip" data-map-category="${escapeHtml(category.id)}"><span class="category-chip-dot" style="--category-color:${escapeHtml(categoryColor(category))}"></span>${escapeHtml(category.name)}</button>`).join("")}
      </div>
      <div class="main-map-wrap">
        <div id="main-map" class="main-map"></div>
        <div id="map-loading" class="map-loading-overlay"><div class="loading-card" style="min-height:auto"><div class="spinner"></div><p>正在載入地圖…</p></div></div>
      </div>
      <section class="map-bottom-sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-header"><strong id="map-result-title">準備搜尋…</strong><small id="map-center-label"></small></div>
        <div id="map-message"></div>
        <div id="nearby-list" class="nearby-list"></div>
      </section>
    `
  });

  const local = {
    map: null,
    infoWindow: null,
    center: null,
    radius: Number(CONFIG.defaultRadiusKm || 20),
    selectedCategories: new Set(),
    records: [],
    markers: [],
    currentMarker: null,
    mapLibraries: null
  };

  const messageNode = document.querySelector("#map-message");
  const listNode = document.querySelector("#nearby-list");
  const titleNode = document.querySelector("#map-result-title");
  const centerLabel = document.querySelector("#map-center-label");
  const loadingNode = document.querySelector("#map-loading");
  document.querySelector("#map-radius").value = String(local.radius);

  const clearRecordMarkers = () => {
    local.markers.forEach((marker) => {
      marker.map = null;
      marker.remove?.();
    });
    local.markers = [];
  };

  registerCleanup(() => {
    clearRecordMarkers();
    if (local.currentMarker) {
      local.currentMarker.map = null;
      local.currentMarker.remove?.();
    }
    local.map = null;
  });

  const visibleRecords = () => local.selectedCategories.size
    ? local.records.filter((bookmark) => local.selectedCategories.has(bookmark.categoryId))
    : local.records;

  const drawRecords = () => {
    if (!local.map || !local.mapLibraries) return;
    clearRecordMarkers();
    const records = visibleRecords();
    const categories = categoryMap();
    const groups = new Map();

    records.forEach((bookmark) => {
      const key = `${Number(bookmark.location.latitude).toFixed(5)},${Number(bookmark.location.longitude).toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bookmark);
    });

    groups.forEach((items) => {
      const first = items[0];
      const category = categories.get(first.categoryId) || { id: "other", name: "其他" };
      const glyph = items.length > 1 ? String(items.length) : String(category.name || "•").slice(0, 1);
      const marker = createMapPin(local.mapLibraries, {
        map: local.map,
        position: { lat: Number(first.location.latitude), lng: Number(first.location.longitude) },
        color: categoryColor(category),
        glyph,
        title: first.location.placeName || first.title
      });

      marker.addListener("click", () => {
        const wrapper = document.createElement("div");
        wrapper.className = "map-info";
        const heading = document.createElement("strong");
        heading.className = "map-info-title";
        heading.textContent = first.location.placeName || first.title || "收藏地點";
        const address = document.createElement("div");
        address.textContent = first.location.address || "";
        const list = document.createElement("ul");
        list.className = "map-info-list";
        items.slice(0, 6).forEach((bookmark) => {
          const li = document.createElement("li");
          const anchor = document.createElement("a");
          anchor.href = safeExternalUrl(bookmark.url);
          anchor.target = "_blank";
          anchor.rel = "noreferrer";
          anchor.textContent = bookmark.title || "開啟影片";
          li.append(anchor);
          list.append(li);
        });
        const nav = document.createElement("a");
        nav.href = `https://www.google.com/maps/dir/?api=1&destination=${first.location.latitude},${first.location.longitude}`;
        nav.target = "_blank";
        nav.rel = "noreferrer";
        nav.textContent = "Google Maps 導航";
        wrapper.append(heading, address, list, nav);
        local.infoWindow.setContent(wrapper);
        local.infoWindow.open({ map: local.map, anchor: marker });
      });
      local.markers.push(marker);
    });

    titleNode.textContent = `${local.radius} 公里內 ${records.length} 筆收藏`;
    listNode.innerHTML = records.length
      ? records.slice(0, 150).map((bookmark) => {
        const category = categories.get(bookmark.categoryId) || { id: "other", name: "其他" };
        return `<button class="nearby-item" data-nearby-id="${escapeHtml(bookmark.id)}">${categoryIconHtml(category)}<span class="nearby-text"><strong>${escapeHtml(bookmark.title || "未命名收藏")}</strong><small>${escapeHtml(bookmark.location.placeName || "未命名地點")}</small></span><span class="distance-pill">${bookmark.distanceKm.toFixed(1)} km</span></button>`;
      }).join("")
      : `<div class="empty-state"><div class="empty-illustration">${iconSvg("map")}</div><p>目前範圍沒有符合分類的收藏。</p></div>`;

    document.querySelectorAll("[data-nearby-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const bookmark = records.find((item) => item.id === button.dataset.nearbyId);
        if (!bookmark) return;
        local.map.panTo({ lat: Number(bookmark.location.latitude), lng: Number(bookmark.location.longitude) });
        local.map.setZoom(16);
      });
    });
  };

  const search = async (center) => {
    local.center = center;
    titleNode.textContent = "搜尋中…";
    messageNode.innerHTML = "";
    centerLabel.textContent = `${center.latitude.toFixed(3)}, ${center.longitude.toFixed(3)}`;
    try {
      local.records = await queryNearbyBookmarks(center, local.radius);
      drawRecords();
    } catch (error) {
      console.error(error);
      messageNode.innerHTML = `<div class="alert alert-error">${escapeHtml(error?.message || "附近收藏查詢失敗。")}</div>`;
      titleNode.textContent = "查詢失敗";
    }
  };

  try {
    local.mapLibraries = await loadMapLibraries();
    let position = null;
    try {
      position = await getCurrentPosition();
    } catch (error) {
      messageNode.innerHTML = `<div class="alert alert-info">${escapeHtml(error?.message || "無法取得目前位置。可拖曳地圖後按搜尋此區域。")}</div>`;
    }

    const initial = position
      ? { latitude: position.latitude, longitude: position.longitude }
      : { latitude: CONFIG.defaultCenter.lat, longitude: CONFIG.defaultCenter.lng };

    local.map = new local.mapLibraries.Map(document.querySelector("#main-map"), {
      center: { lat: initial.latitude, lng: initial.longitude },
      zoom: position ? 11 : 8,
      mapId: CONFIG.googleMapsMapId,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false
    });
    local.infoWindow = new local.mapLibraries.InfoWindow();

    if (position) {
      local.currentMarker = createMapPin(local.mapLibraries, {
        map: local.map,
        position: { lat: position.latitude, lng: position.longitude },
        color: "#3f8ee8",
        glyph: "我",
        title: "目前位置",
        zIndex: 1000
      });
    }
    loadingNode.classList.add("hidden");
    await search(initial);
  } catch (error) {
    console.error(error);
    loadingNode.classList.add("hidden");
    document.querySelector("#main-map").innerHTML = `<div class="empty-state"><div class="empty-illustration">${iconSvg("map")}</div><div class="alert alert-error">${escapeHtml(error?.message || "Google Maps 載入失敗。")}</div><button class="btn btn-primary" id="retry-map">${iconSvg("refresh")} 重新載入</button></div>`;
    document.querySelector("#retry-map")?.addEventListener("click", () => renderMapPage());
  }

  document.querySelector("#map-radius").addEventListener("change", async (event) => {
    local.radius = Number(event.target.value);
    if (local.center) await search(local.center);
  });
  document.querySelector("#search-map-center").addEventListener("click", async () => {
    const center = local.map?.getCenter();
    if (!center) return;
    await search({ latitude: center.lat(), longitude: center.lng() });
  });
  document.querySelector("#return-current").addEventListener("click", async () => {
    try {
      const position = await getCurrentPosition();
      const center = { latitude: position.latitude, longitude: position.longitude };
      local.map?.panTo({ lat: center.latitude, lng: center.longitude });
      local.map?.setZoom(11);
      if (local.currentMarker) local.currentMarker.position = { lat: center.latitude, lng: center.longitude };
      else if (local.map && local.mapLibraries) {
        local.currentMarker = createMapPin(local.mapLibraries, { map: local.map, position: { lat: center.latitude, lng: center.longitude }, color: "#3f8ee8", glyph: "我", title: "目前位置", zIndex: 1000 });
      }
      await search(center);
    } catch (error) {
      showToast(error?.message || "無法取得位置。", "error");
    }
  });
  document.querySelectorAll("[data-map-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.mapCategory;
      if (!id) {
        local.selectedCategories.clear();
        document.querySelectorAll("[data-map-category]").forEach((item) => item.classList.toggle("active", item === button));
      } else {
        const allButton = document.querySelector('[data-map-category=""]');
        allButton.classList.remove("active");
        if (local.selectedCategories.has(id)) local.selectedCategories.delete(id);
        else local.selectedCategories.add(id);
        button.classList.toggle("active", local.selectedCategories.has(id));
        if (local.selectedCategories.size === 0) allButton.classList.add("active");
      }
      drawRecords();
    });
  });
}

function serializeBookmark(bookmark) {
  return {
    title: bookmark.title || "",
    url: bookmark.url || "",
    normalizedUrl: bookmark.normalizedUrl || "",
    platform: bookmark.platform || "other",
    thumbnailUrl: bookmark.thumbnailUrl || "",
    categoryId: bookmark.categoryId || "other",
    tags: bookmark.tags || [],
    note: bookmark.note || "",
    hasLocation: Boolean(bookmark.hasLocation),
    location: bookmark.location || null,
    createdAt: bookmark.createdAt?.toDate ? bookmark.createdAt.toDate().toISOString() : bookmark.createdAt instanceof Date ? bookmark.createdAt.toISOString() : null,
    updatedAt: bookmark.updatedAt?.toDate ? bookmark.updatedAt.toDate().toISOString() : bookmark.updatedAt instanceof Date ? bookmark.updatedAt.toISOString() : null
  };
}

async function showDeleteCategoryModal(category) {
  const alternatives = state.categories.filter((item) => item.id !== category.id && item.active);
  if (!alternatives.length) {
    showToast("至少要保留一個其他分類。", "error");
    return;
  }
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>刪除分類：${escapeHtml(category.name)}</h3>
      <p>原本使用這個分類的收藏，會直接移到你指定的新分類。</p>
      <label class="field">移至<select id="move-category-target">${alternatives.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label>
      <div class="form-actions"><button class="btn btn-secondary" id="cancel-delete-category">取消</button><button class="btn btn-danger" id="confirm-delete-category">刪除分類</button></div>
    </div>
  `;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("#cancel-delete-category").addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector("#confirm-delete-category").addEventListener("click", async (event) => {
    try {
      event.currentTarget.disabled = true;
      const targetId = backdrop.querySelector("#move-category-target").value;
      const moved = await deleteCategoryAndMove(category.id, targetId);
      state.bookmarks = state.bookmarks.map((item) => item.categoryId === category.id ? { ...item, categoryId: targetId } : item);
      state.categories = state.categories.filter((item) => item.id !== category.id);
      showToast(`分類已刪除，${moved} 筆收藏已移至新分類。`, "success");
      close();
      await renderSettingsPage();
    } catch (error) {
      showToast(error?.message || "刪除分類失敗。", "error");
      event.currentTarget.disabled = false;
    }
  });
}

function iconOptions(selected = "other") {
  return ICON_OPTIONS.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

async function renderSettingsPage() {
  clearPage();
  await ensureCoreData();

  const tagCounts = new Map();
  state.bookmarks.forEach((bookmark) => (bookmark.tags || []).forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
  const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

  renderShell({
    title: "我的與設定",
    subtitle: "共同管理分類與資料",
    active: "settings",
    content: `
      <div class="settings-grid">
        <div class="form-grid">
          <section class="card panel">
            <div class="section-title"><div class="section-title-copy"><span class="section-icon">${iconSvg("settings")}</span><h2>分類管理</h2></div><span class="small muted">${state.categories.length} 個分類</span></div>
            <form id="add-category-form" class="toolbar">
              <select id="new-category-icon" style="width:120px">${iconOptions("sparkles")}</select>
              <input id="new-category-name" class="grow" required maxlength="20" placeholder="新增分類名稱" />
              <input id="new-category-color" class="category-color-input" type="color" value="#f47b64" aria-label="分類顏色" />
              <button class="btn btn-primary" type="submit">${iconSvg("plus")} 新增</button>
            </form>
            <div class="category-list">
              ${state.categories.map((category) => `
                <div class="category-row" data-category-row="${escapeHtml(category.id)}">
                  <select data-category-icon="${escapeHtml(category.id)}">${iconOptions(categoryIconKey(category))}</select>
                  <input data-category-name="${escapeHtml(category.id)}" value="${escapeHtml(category.name)}" maxlength="20" />
                  <input class="category-color-input" data-category-color="${escapeHtml(category.id)}" type="color" value="${escapeHtml(categoryColor(category))}" />
                  <label class="check-row small category-active"><input type="checkbox" data-category-active="${escapeHtml(category.id)}" ${category.active ? "checked" : ""} />啟用</label>
                  <button class="btn btn-danger category-delete" data-delete-category="${escapeHtml(category.id)}" ${category.system ? "disabled title='系統保留分類不可刪除'" : ""}>${iconSvg("trash")} 刪除</button>
                </div>
              `).join("")}
            </div>
          </section>
          <section class="card panel">
            <div class="section-title"><div class="section-title-copy"><span class="section-icon" style="background:#fff1df;color:#a66a18">${iconSvg("tag")}</span><h2>標籤統計</h2></div><span class="small muted">依使用次數排序</span></div>
            <div class="tag-stat-list">${sortedTags.length ? sortedTags.map(([tag,count]) => `<span class="tag-stat">#${escapeHtml(tag)}　${count}</span>`).join("") : `<span class="muted">尚未建立標籤。</span>`}</div>
          </section>
        </div>
        <div class="form-grid">
          <section class="card panel">
            <div class="user-card">
              ${state.user.photoURL ? `<img class="avatar" src="${escapeHtml(state.user.photoURL)}" alt="" />` : `<div class="avatar"></div>`}
              <div><strong>${escapeHtml(state.user.displayName || "Google 使用者")}</strong><div class="small muted">${escapeHtml(state.user.email || "")}</div></div>
            </div>
            <div class="form-actions" style="justify-content:flex-start"><button class="btn btn-secondary" id="logout-button">${iconSvg("logout")} 登出</button></div>
          </section>
          <section class="card panel">
            <div class="section-title"><div class="section-title-copy"><span class="section-icon" style="background:var(--mint-soft);color:var(--mint-deep)">${iconSvg("download")}</span><h2>資料備份</h2></div></div>
            <p class="muted small">匯出 JSON 可保存收藏內容；匯入會新增資料，不會覆蓋既有收藏。</p>
            <div class="form-grid">
              <button class="btn btn-secondary" id="export-data">${iconSvg("download")} 匯出 JSON 備份</button>
              <label class="btn btn-secondary" style="cursor:pointer">${iconSvg("upload")} 匯入 JSON<input id="import-data" type="file" accept="application/json,.json" class="hidden" /></label>
            </div>
          </section>
          <section class="card panel">
            <div class="section-title"><div class="section-title-copy"><span class="section-icon" style="background:#efeaff;color:var(--purple)">${iconSvg("sparkles")}</span><h2>使用統計</h2></div></div>
            <div class="stat-grid">
              <div class="stat-card"><strong>${state.bookmarks.length}</strong><small>收藏總數</small></div>
              <div class="stat-card"><strong>${state.bookmarks.filter((item) => item.hasLocation).length}</strong><small>有地點</small></div>
              <div class="stat-card"><strong>${state.categories.filter((item) => item.active).length}</strong><small>啟用分類</small></div>
              <div class="stat-card"><strong>${tagCounts.size}</strong><small>標籤數量</small></div>
            </div>
          </section>
        </div>
      </div>
    `
  });

  document.querySelector("#logout-button").addEventListener("click", () => logout());
  document.querySelector("#add-category-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.querySelector("#new-category-name").value.trim();
    const icon = document.querySelector("#new-category-icon").value;
    const color = document.querySelector("#new-category-color").value;
    if (!name) return;
    try {
      const id = await addCategory({ name, icon, color, sortOrder: state.categories.length });
      state.categories.push({ id, name, icon, color, sortOrder: state.categories.length, active: true, system: false });
      showToast("分類已新增。", "success");
      await renderSettingsPage();
    } catch (error) {
      showToast(error?.message || "新增分類失敗。", "error");
    }
  });

  const saveCategory = async (categoryId) => {
    const name = document.querySelector(`[data-category-name="${CSS.escape(categoryId)}"]`).value.trim();
    const icon = document.querySelector(`[data-category-icon="${CSS.escape(categoryId)}"]`).value;
    const color = document.querySelector(`[data-category-color="${CSS.escape(categoryId)}"]`).value;
    const active = document.querySelector(`[data-category-active="${CSS.escape(categoryId)}"]`).checked;
    if (!name) return showToast("分類名稱不可空白。", "error");
    try {
      await updateCategory(categoryId, { name, icon, color, active });
      const category = state.categories.find((item) => item.id === categoryId);
      if (category) Object.assign(category, { name, icon, color, active });
      showToast("分類已更新。", "success");
    } catch (error) {
      showToast(error?.message || "分類更新失敗。", "error");
    }
  };

  document.querySelectorAll("[data-category-name], [data-category-icon], [data-category-color], [data-category-active]").forEach((input) => {
    input.addEventListener("change", () => saveCategory(input.dataset.categoryName || input.dataset.categoryIcon || input.dataset.categoryColor || input.dataset.categoryActive));
  });
  document.querySelectorAll("[data-delete-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = state.categories.find((item) => item.id === button.dataset.deleteCategory);
      if (category) showDeleteCategoryModal(category);
    });
  });

  document.querySelector("#export-data").addEventListener("click", () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`short-video-bookmarks-${date}.json`, {
      version: 2,
      exportedAt: new Date().toISOString(),
      categories: state.categories.map(({ id, name, icon, color, sortOrder, active }) => ({ id, name, icon, color, sortOrder, active })),
      bookmarks: state.bookmarks.map(serializeBookmark)
    });
  });
  document.querySelector("#import-data").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.bookmarks)) throw new Error("備份檔格式不正確。");
      const count = await importBookmarks(data.bookmarks, state.categories);
      await ensureCoreData(true);
      showToast(`已匯入 ${count} 筆收藏。`, "success");
      await renderSettingsPage();
    } catch (error) {
      console.error(error);
      showToast(error?.message || "匯入失敗。", "error");
    }
  });
}

async function renderRoute() {
  if (!state.authReady) return;
  if (!state.user) return renderLogin();
  clearPage();
  const { path, id } = routeName();
  try {
    await ensureCoreData();
    if (path === "home") return await renderCollectionPage();
    if (path === "map") return await renderMapPage();
    if (path === "add") return await renderBookmarkForm();
    if (path === "edit") return await renderBookmarkForm(id);
    if (path === "settings") return await renderSettingsPage();
    go("home");
  } catch (error) {
    console.error(error);
    renderShell({
      title: "發生錯誤",
      active: "home",
      content: `<div class="alert alert-error">${escapeHtml(error?.message || "頁面載入失敗。")}</div><button class="btn btn-primary" id="back-home">回到首頁</button>`
    });
    document.querySelector("#back-home")?.addEventListener("click", () => go("home"));
  }
}

window.addEventListener("hashchange", renderRoute);

observeAuth(async (user) => {
  state.authReady = true;
  const allowedEmails = (CONFIG.allowedEmails || [])
    .map((email) => String(email || "").trim().toLowerCase())
    .filter((email) => email && !email.startsWith("請填入_"));

  if (user && !allowedEmails.includes(String(user.email || "").toLowerCase())) {
    const rejectedEmail = user.email || "此帳號";
    await logout();
    state.user = null;
    renderLogin(`${rejectedEmail} 未被授權使用此 App。`);
    return;
  }

  state.user = user;
  if (user) {
    try {
      renderLoading("正在開啟收藏中心", "home");
      await Promise.all([upsertUserProfile(user), ensureCoreData()]);
      if (!location.hash) location.hash = "#/home";
      await renderRoute();
    } catch (error) {
      console.error(error);
      renderShell({ title: "初始化失敗", active: "home", content: `<div class="alert alert-error">${escapeHtml(error?.message || "請檢查 Firestore 規則。")}</div>` });
    }
  } else {
    state.coreLoaded = false;
    state.corePromise = null;
    state.categories = [];
    state.bookmarks = [];
    renderLogin();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("Service Worker 註冊失敗", error));
  });
}
