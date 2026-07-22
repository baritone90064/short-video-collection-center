import { CONFIG } from "./config.js";
import { auth, loginWithGoogle, logout, observeAuth } from "./firebase-client.js";
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
import { categoryEmoji, distanceKm, getCurrentPosition, toGeohash } from "./geo.js";
import { loadMapLibraries, loadPlacesLibrary } from "./maps-loader.js";
import {
  confirmDialog,
  detectPlatform,
  downloadJson,
  escapeHtml,
  formatDate,
  normalizeUrl,
  parseTags,
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
  authReady: false
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

function navItems(active) {
  const items = [
    ["home", "⌂", "收藏"],
    ["map", "⌖", "地圖"],
    ["add", "+", "新增"],
    ["pending", "◷", "待整理"],
    ["settings", "⚙", "我的"]
  ];
  return items.map(([key, icon, label]) => `
    <button class="nav-item ${key === active ? "active" : ""} ${key === "add" ? "add-nav" : ""}" data-nav="${key}">
      <span class="nav-icon">${icon}</span>
      ${key === "add" ? "" : `<span>${label}</span>`}
    </button>
  `).join("");
}

function renderShell({ title, active, content, actions = "" }) {
  appRoot.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-title">
          <div class="brand-mark" style="width:40px;height:40px;border-radius:13px;font-size:17px">▶</div>
          <strong>${escapeHtml(title)}</strong>
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
    content: `<div class="empty-state"><div class="empty-icon">⏳</div><p>資料載入中…</p></div>`
  });
}

function renderLogin(errorMessage = "") {
  clearPage();
  appRoot.innerHTML = `
    <div class="login-page">
      <section class="login-card card">
        <div class="login-logo">▶</div>
        <h1>${escapeHtml(CONFIG.appName)}</h1>
        <p>收藏 Threads、Facebook、Instagram、小紅書等短影音連結，並在地圖查看附近的景點、餐廳與其他收藏。</p>
        ${errorMessage ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>` : ""}
        <button id="google-login" class="btn google-btn">
          <span style="font-size:20px">G</span> 使用 Google 帳號登入
        </button>
        <p class="small muted">僅限指定的兩個 Google 帳號登入，兩人共同編輯同一份收藏資料。</p>
      </section>
    </div>
  `;
  document.querySelector("#google-login")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      button.disabled = true;
      button.textContent = "登入中…";
      await loginWithGoogle();
    } catch (error) {
      console.error(error);
      renderLogin(error?.message || "Google 登入失敗。");
    } finally {
      button.disabled = false;
    }
  });
}

async function refreshCoreData() {
  if (!state.user) return;
  await seedDefaultCategories(state.user.uid);
  [state.categories, state.bookmarks] = await Promise.all([
    listCategories(state.user.uid),
    listBookmarks(state.user.uid)
  ]);
}

function categoryMap() {
  return new Map(state.categories.map((category) => [category.id, category]));
}

function categoryOptions(selectedId = "") {
  return state.categories
    .filter((category) => category.active || category.id === selectedId)
    .map((category) => `<option value="${escapeHtml(category.id)}" ${category.id === selectedId ? "selected" : ""}>${escapeHtml(category.icon)} ${escapeHtml(category.name)}</option>`)
    .join("");
}

function fallbackThumb(platform) {
  const meta = platformMeta(platform);
  return `<div class="platform-fallback"><span class="platform-icon">${escapeHtml(meta.icon)}</span><small>${escapeHtml(meta.label)}</small></div>`;
}

function bookmarkCard(bookmark, categories, currentPosition = null) {
  const category = categories.get(bookmark.categoryId);
  const meta = platformMeta(bookmark.platform);
  const distance = currentPosition && bookmark.location
    ? distanceKm(currentPosition, bookmark.location)
    : null;
  const image = bookmark.thumbnailUrl
    ? `<img src="${escapeHtml(bookmark.thumbnailUrl)}" alt="" loading="lazy" data-thumb-platform="${escapeHtml(bookmark.platform)}" />`
    : fallbackThumb(bookmark.platform);
  return `
    <article class="bookmark-card card" data-bookmark-card="${escapeHtml(bookmark.id)}">
      <div class="thumb-wrap">${image}</div>
      <div class="bookmark-body">
        <h3 class="bookmark-title">${escapeHtml(bookmark.title || "未命名收藏")}</h3>
        <div class="bookmark-meta">
          <span>${escapeHtml(meta.label)}</span>
          <span>${escapeHtml(category?.icon || "●")} ${escapeHtml(category?.name || "未分類")}</span>
          ${bookmark.location?.placeName ? `<span>📌 ${escapeHtml(bookmark.location.placeName)}</span>` : ""}
          ${distance != null ? `<span>${distance.toFixed(distance < 10 ? 1 : 0)} km</span>` : ""}
        </div>
        ${bookmark.tags?.length ? `<div class="tag-list">${bookmark.tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        ${bookmark.note ? `<div class="bookmark-note">${escapeHtml(bookmark.note)}</div>` : ""}
        <div>
          <span class="status-pill ${bookmark.status === "pending" ? "status-pending" : "status-active"}">${bookmark.status === "pending" ? "待整理" : "已整理"}</span>
        </div>
        <div class="card-actions">
          <a class="btn btn-soft" href="${escapeHtml(safeExternalUrl(bookmark.url))}" target="_blank" rel="noreferrer">開啟影片</a>
          <button class="btn btn-secondary" data-edit-bookmark="${escapeHtml(bookmark.id)}">編輯</button>
          <button class="btn btn-danger" data-delete-bookmark="${escapeHtml(bookmark.id)}">刪除</button>
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
        await removeBookmark(state.user.uid, bookmark.id);
        state.bookmarks = state.bookmarks.filter((item) => item.id !== bookmark.id);
        showToast("收藏已刪除。", "success");
        onChanged?.();
      } catch (error) {
        console.error(error);
        showToast(error?.message || "刪除失敗。", "error");
      }
    });
  });
}

async function renderCollectionPage({ pendingOnly = false }) {
  clearPage();
  renderLoading(pendingOnly ? "待整理" : "我的收藏", pendingOnly ? "pending" : "home");
  try {
    await refreshCoreData();
  } catch (error) {
    console.error(error);
    renderShell({
      title: pendingOnly ? "待整理" : "我的收藏",
      active: pendingOnly ? "pending" : "home",
      content: `<div class="alert alert-error">${escapeHtml(error?.message || "無法讀取資料。")}</div>`
    });
    return;
  }

  const local = {
    search: "",
    categoryId: "",
    sort: "newest",
    position: null
  };
  const categories = categoryMap();

  renderShell({
    title: pendingOnly ? "待整理" : "我的收藏",
    active: pendingOnly ? "pending" : "home",
    actions: `<button class="btn btn-primary hide-mobile" id="top-add">＋ 新增收藏</button>`,
    content: `
      <section>
        <div class="toolbar">
          <input class="grow" id="collection-search" type="search" placeholder="搜尋標題、標籤、備註或地點" />
          <select id="collection-sort" style="width:auto">
            <option value="newest">最新加入</option>
            <option value="name">名稱</option>
            <option value="distance">距離目前位置</option>
          </select>
        </div>
        <div class="chips" id="category-chips">
          <button class="chip active" data-category-filter="">全部</button>
          ${state.categories.filter((category) => category.active).map((category) => `<button class="chip" data-category-filter="${escapeHtml(category.id)}">${escapeHtml(category.icon)} ${escapeHtml(category.name)}</button>`).join("")}
        </div>
        <div id="collection-result" style="margin-top:12px"></div>
      </section>
    `
  });

  document.querySelector("#top-add")?.addEventListener("click", () => go("add"));

  const update = () => {
    const queryText = local.search.trim().toLowerCase();
    let records = state.bookmarks.filter((bookmark) => pendingOnly ? bookmark.status === "pending" : true);
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
      : `<div class="empty-state card"><div class="empty-icon">${pendingOnly ? "✓" : "☆"}</div><p>${pendingOnly ? "目前沒有待整理的收藏。" : "尚未找到符合條件的收藏。"}</p></div>`;
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

function locationFields(place = null) {
  return `
    <div class="form-grid two">
      <label class="field">地點名稱<input id="place-name" type="text" value="${escapeHtml(place?.placeName || "")}" placeholder="例如：雙流國家森林遊樂區" /></label>
      <label class="field">地址<input id="place-address" type="text" value="${escapeHtml(place?.address || "")}" placeholder="搜尋後會自動帶入，也可手動修改" /></label>
      <label class="field">緯度<input id="place-latitude" type="text" inputmode="decimal" value="${place?.latitude ?? ""}" /></label>
      <label class="field">經度<input id="place-longitude" type="text" inputmode="decimal" value="${place?.longitude ?? ""}" /></label>
    </div>
    <div class="toolbar" style="margin-top:10px">
      <button type="button" class="btn btn-secondary" id="use-current-place">使用目前位置</button>
      <button type="button" class="btn btn-danger" id="clear-place">清除地點</button>
    </div>
    <div id="autocomplete-host" class="autocomplete-host"></div>
    <div id="place-map" class="place-picker-map"></div>
    <p class="small muted">搜尋不到時，可直接點地圖或拖曳圖釘；最終以緯度、經度作為地圖標記位置。</p>
  `;
}

async function initPlacePicker(placeState) {
  const host = document.querySelector("#autocomplete-host");
  const mapNode = document.querySelector("#place-map");
  if (!host || !mapNode) return null;
  try {
    const [{ Map, AdvancedMarkerElement }, placesLibrary] = await Promise.all([
      loadMapLibraries(),
      loadPlacesLibrary()
    ]);
    const initial = placeState.latitude != null && placeState.longitude != null
      ? { lat: Number(placeState.latitude), lng: Number(placeState.longitude) }
      : CONFIG.defaultCenter;
    const map = new Map(mapNode, {
      center: initial,
      zoom: placeState.latitude != null ? 16 : 11,
      mapId: CONFIG.googleMapsMapId,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });
    const marker = new AdvancedMarkerElement({
      map,
      position: placeState.latitude != null ? initial : null,
      gmpDraggable: true,
      title: placeState.placeName || "選擇地點"
    });

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

    const setPosition = (latitude, longitude) => {
      placeState.latitude = Number(latitude);
      placeState.longitude = Number(longitude);
      marker.position = { lat: placeState.latitude, lng: placeState.longitude };
      marker.title = placeState.placeName || "自訂地點";
      map.panTo({ lat: placeState.latitude, lng: placeState.longitude });
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
        const place = event.placePrediction.toPlace();
        await place.fetchFields({
          fields: ["id", "displayName", "formattedAddress", "location", "viewport"]
        });
        if (!place.location) throw new Error("此地點沒有座標。");
        placeState.placeName = place.displayName || "未命名地點";
        placeState.address = place.formattedAddress || "";
        placeState.placeId = place.id || "";
        setPosition(place.location.lat(), place.location.lng());
        if (place.viewport) map.fitBounds(place.viewport);
        else map.setZoom(17);
      } catch (error) {
        console.error(error);
        showToast(error?.message || "無法取得地點資料。", "error");
      }
    });

    return { map, marker, syncInputs, setPosition };
  } catch (error) {
    console.error(error);
    mapNode.innerHTML = `<div class="empty-state"><p>${escapeHtml(error?.message || "地圖載入失敗。")}</p><p class="small">仍可手動填入地點名稱、地址與經緯度。</p></div>`;
    return null;
  }
}

async function renderBookmarkForm(bookmarkId = "") {
  clearPage();
  renderLoading(bookmarkId ? "編輯收藏" : "新增收藏", "add");
  try {
    await refreshCoreData();
  } catch (error) {
    renderShell({ title: "新增收藏", active: "add", content: `<div class="alert alert-error">${escapeHtml(error?.message || "無法讀取資料。")}</div>` });
    return;
  }
  const existing = bookmarkId ? await getBookmark(state.user.uid, bookmarkId) : null;
  if (bookmarkId && !existing) {
    renderShell({ title: "編輯收藏", active: "add", content: `<div class="alert alert-error">找不到這筆收藏。</div>` });
    return;
  }
  const placeState = existing?.location ? { ...existing.location } : {
    placeName: "",
    address: "",
    latitude: null,
    longitude: null,
    placeId: ""
  };
  let picker = null;

  renderShell({
    title: existing ? "編輯收藏" : "新增收藏",
    active: "add",
    content: `
      <form id="bookmark-form" class="card panel form-grid">
        <div class="form-grid two">
          <label class="field">短影音連結
            <input id="bookmark-url" type="url" required value="${escapeHtml(existing?.url || "")}" placeholder="貼上 Threads、FB、IG、小紅書等連結" />
          </label>
          <label class="field">平台
            <select id="bookmark-platform">
              ${Object.entries({ threads:"Threads", instagram:"Instagram", facebook:"Facebook", xiaohongshu:"小紅書", tiktok:"TikTok", youtube:"YouTube", other:"其他" }).map(([value,label]) => `<option value="${value}" ${(existing?.platform || "other") === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
        </div>
        <label class="field">標題<input id="bookmark-title" type="text" required maxlength="160" value="${escapeHtml(existing?.title || "")}" placeholder="請輸入便於日後辨識的標題" /></label>
        <div class="form-grid two">
          <label class="field">分類<select id="bookmark-category" required>${categoryOptions(existing?.categoryId || state.categories.find((category) => category.active)?.id || "other")}</select></label>
          <label class="field">狀態<select id="bookmark-status"><option value="active" ${existing?.status !== "pending" ? "selected" : ""}>已整理</option><option value="pending" ${existing?.status === "pending" ? "selected" : ""}>待整理</option></select></label>
        </div>
        <label class="field">標籤<small>以逗號分隔，例如：花蓮, 瀑布, 車宿</small><input id="bookmark-tags" type="text" value="${escapeHtml((existing?.tags || []).join(", "))}" /></label>
        <label class="field">縮圖網址（選填）<small>只儲存外部網址；讀取失敗時顯示平台圖示。</small><input id="bookmark-thumbnail" type="url" value="${escapeHtml(existing?.thumbnailUrl || "")}" /></label>
        <label class="field">個人備註<textarea id="bookmark-note" maxlength="3000">${escapeHtml(existing?.note || "")}</textarea></label>
        <label class="check-row"><input id="has-location" type="checkbox" ${existing?.hasLocation ? "checked" : ""} /><strong>這筆收藏包含特定地點</strong></label>
        <section id="location-section" class="place-section ${existing?.hasLocation ? "" : "hidden"}">${existing?.hasLocation ? locationFields(placeState) : ""}</section>
        <div id="form-message"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="cancel-form">取消</button>
          <button type="submit" class="btn btn-primary" id="save-bookmark">${existing ? "儲存修改" : "新增收藏"}</button>
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

  const bindLocationInputs = () => {
    const name = document.querySelector("#place-name");
    const address = document.querySelector("#place-address");
    const latitude = document.querySelector("#place-latitude");
    const longitude = document.querySelector("#place-longitude");
    name?.addEventListener("input", (event) => { placeState.placeName = event.target.value; });
    address?.addEventListener("input", (event) => { placeState.address = event.target.value; });
    latitude?.addEventListener("change", (event) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value)) {
        placeState.latitude = value;
        if (Number.isFinite(Number(placeState.longitude))) picker?.setPosition(placeState.latitude, Number(placeState.longitude));
      }
    });
    longitude?.addEventListener("change", (event) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value)) {
        placeState.longitude = value;
        if (Number.isFinite(Number(placeState.latitude))) picker?.setPosition(Number(placeState.latitude), placeState.longitude);
      }
    });
    document.querySelector("#use-current-place")?.addEventListener("click", async () => {
      try {
        const position = await getCurrentPosition();
        if (!placeState.placeName) placeState.placeName = "目前位置";
        placeState.latitude = position.latitude;
        placeState.longitude = position.longitude;
        picker?.setPosition(position.latitude, position.longitude);
        picker?.map?.setZoom(17);
      } catch (error) {
        showToast(error?.message || "無法取得位置。", "error");
      }
    });
    document.querySelector("#clear-place")?.addEventListener("click", () => {
      placeState.placeName = "";
      placeState.address = "";
      placeState.latitude = null;
      placeState.longitude = null;
      placeState.placeId = "";
      document.querySelector("#place-name").value = "";
      document.querySelector("#place-address").value = "";
      document.querySelector("#place-latitude").value = "";
      document.querySelector("#place-longitude").value = "";
      if (picker?.marker) picker.marker.position = null;
    });
  };

  const showLocation = async () => {
    const section = document.querySelector("#location-section");
    section.classList.remove("hidden");
    if (!section.innerHTML.trim()) section.innerHTML = locationFields(placeState);
    bindLocationInputs();
    picker = await initPlacePicker(placeState);
  };
  if (existing?.hasLocation) {
    bindLocationInputs();
    picker = await initPlacePicker(placeState);
  }
  document.querySelector("#has-location").addEventListener("change", async (event) => {
    if (event.target.checked) await showLocation();
    else document.querySelector("#location-section").classList.add("hidden");
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
      const duplicate = await findDuplicateUrl(state.user.uid, normalizedUrl);
      if (duplicate && duplicate.id !== existing?.id) {
        throw new Error(`這個連結已收藏：${duplicate.title || "未命名收藏"}`);
      }
      const hasLocation = document.querySelector("#has-location").checked;
      let location = null;
      if (hasLocation) {
        const latitude = Number(document.querySelector("#place-latitude")?.value ?? placeState.latitude);
        const longitude = Number(document.querySelector("#place-longitude")?.value ?? placeState.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error("已勾選包含地點，請搜尋地點、地圖選點或填入有效經緯度。");
        }
        location = {
          placeName: String(document.querySelector("#place-name")?.value || placeState.placeName || "自訂地點").trim(),
          address: String(document.querySelector("#place-address")?.value || placeState.address || "").trim(),
          latitude,
          longitude,
          geohash: toGeohash(latitude, longitude),
          placeId: placeState.placeId || ""
        };
      }
      const input = {
        title: document.querySelector("#bookmark-title").value.trim(),
        url,
        normalizedUrl,
        platform: platformSelect.value,
        thumbnailUrl: document.querySelector("#bookmark-thumbnail").value.trim(),
        categoryId: document.querySelector("#bookmark-category").value,
        tags: parseTags(document.querySelector("#bookmark-tags").value),
        note: document.querySelector("#bookmark-note").value.trim(),
        status: document.querySelector("#bookmark-status").value,
        hasLocation,
        location
      };
      if (existing) await updateBookmark(state.user.uid, existing.id, input);
      else await createBookmark(state.user.uid, input);
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

async function renderMapPage() {
  clearPage();
  renderLoading("收藏地圖", "map");
  try {
    await seedDefaultCategories(state.user.uid);
    state.categories = await listCategories(state.user.uid);
  } catch (error) {
    renderShell({ title: "收藏地圖", active: "map", content: `<div class="alert alert-error">${escapeHtml(error?.message || "無法讀取分類。")}</div>` });
    return;
  }

  renderShell({
    title: "收藏地圖",
    active: "map",
    content: `
      <div class="map-toolbar">
        <select id="map-radius">
          <option value="10">10 km</option>
          <option value="20" selected>20 km</option>
          <option value="30">30 km</option>
          <option value="50">50 km</option>
        </select>
        <button class="btn btn-secondary" id="search-map-center">搜尋此區域</button>
        <button class="btn btn-secondary" id="return-current">目前位置</button>
      </div>
      <div class="map-category-filter" id="map-category-filter">
        <button class="chip active" data-map-category="">全部</button>
        ${state.categories.filter((category) => category.active).map((category) => `<button class="chip" data-map-category="${escapeHtml(category.id)}">${escapeHtml(category.icon)} ${escapeHtml(category.name)}</button>`).join("")}
      </div>
      <div id="main-map" class="main-map"></div>
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
    radius: 20,
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

  const clearRecordMarkers = () => {
    local.markers.forEach((marker) => { marker.map = null; });
    local.markers = [];
  };
  registerCleanup(() => {
    clearRecordMarkers();
    if (local.currentMarker) local.currentMarker.map = null;
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
      const category = categories.get(first.categoryId);
      const pin = document.createElement("div");
      pin.className = "bookmark-map-pin";
      const inner = document.createElement("span");
      inner.textContent = items.length > 1 ? String(items.length) : (category?.icon || categoryEmoji(category?.name));
      pin.append(inner);
      const marker = new local.mapLibraries.AdvancedMarkerElement({
        map: local.map,
        position: { lat: first.location.latitude, lng: first.location.longitude },
        content: pin,
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
        const category = categories.get(bookmark.categoryId);
        return `<button class="nearby-item" data-nearby-id="${escapeHtml(bookmark.id)}"><span>${escapeHtml(category?.icon || "●")}</span><span class="nearby-text"><strong>${escapeHtml(bookmark.title || "未命名收藏")}</strong><small>${escapeHtml(bookmark.location.placeName || "未命名地點")}</small></span><span>${bookmark.distanceKm.toFixed(1)} km</span></button>`;
      }).join("")
      : `<div class="empty-state"><p>目前範圍沒有符合分類的收藏。</p></div>`;
    document.querySelectorAll("[data-nearby-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const bookmark = records.find((item) => item.id === button.dataset.nearbyId);
        if (!bookmark) return;
        local.map.panTo({ lat: bookmark.location.latitude, lng: bookmark.location.longitude });
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
      local.records = await queryNearbyBookmarks(state.user.uid, center, local.radius);
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
    try { position = await getCurrentPosition(); } catch (error) {
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
      fullscreenControl: false
    });
    local.infoWindow = new local.mapLibraries.InfoWindow();
    if (position) {
      const current = document.createElement("div");
      current.className = "current-location-pin";
      local.currentMarker = new local.mapLibraries.AdvancedMarkerElement({
        map: local.map,
        position: { lat: position.latitude, lng: position.longitude },
        content: current,
        title: "目前位置",
        zIndex: 1000
      });
    }
    await search(initial);
  } catch (error) {
    console.error(error);
    document.querySelector("#main-map").innerHTML = `<div class="empty-state"><div class="alert alert-error">${escapeHtml(error?.message || "Google Maps 載入失敗。")}</div></div>`;
  }

  document.querySelector("#map-radius").value = String(CONFIG.defaultRadiusKm || 20);
  local.radius = Number(document.querySelector("#map-radius").value);
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
      local.map.panTo({ lat: center.latitude, lng: center.longitude });
      local.map.setZoom(11);
      if (local.currentMarker) local.currentMarker.position = { lat: center.latitude, lng: center.longitude };
      else {
        const current = document.createElement("div");
        current.className = "current-location-pin";
        local.currentMarker = new local.mapLibraries.AdvancedMarkerElement({ map: local.map, position: { lat: center.latitude, lng: center.longitude }, content: current, title: "目前位置", zIndex: 1000 });
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
    status: bookmark.status || "active",
    hasLocation: Boolean(bookmark.hasLocation),
    location: bookmark.location || null,
    createdAt: bookmark.createdAt?.toDate ? bookmark.createdAt.toDate().toISOString() : null,
    updatedAt: bookmark.updatedAt?.toDate ? bookmark.updatedAt.toDate().toISOString() : null
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
      <p>使用這個分類的收藏必須移至其他分類，並標記為待整理。</p>
      <label class="field">移至<select id="move-category-target">${alternatives.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.icon)} ${escapeHtml(item.name)}</option>`).join("")}</select></label>
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
      const moved = await deleteCategoryAndMove(state.user.uid, category.id, targetId);
      showToast(`分類已刪除，${moved} 筆收藏移至其他分類。`, "success");
      close();
      await renderSettingsPage();
    } catch (error) {
      showToast(error?.message || "刪除分類失敗。", "error");
      event.currentTarget.disabled = false;
    }
  });
}

async function renderSettingsPage() {
  clearPage();
  renderLoading("我的與設定", "settings");
  try {
    await refreshCoreData();
  } catch (error) {
    renderShell({ title: "我的與設定", active: "settings", content: `<div class="alert alert-error">${escapeHtml(error?.message || "無法讀取資料。")}</div>` });
    return;
  }
  const tagCounts = new Map();
  state.bookmarks.forEach((bookmark) => (bookmark.tags || []).forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
  const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

  renderShell({
    title: "我的與設定",
    active: "settings",
    content: `
      <div class="settings-grid">
        <div class="form-grid">
          <section class="card panel">
            <div class="section-title"><h2>分類管理</h2><span class="small muted">${state.categories.length} 個分類</span></div>
            <form id="add-category-form" class="toolbar">
              <input id="new-category-icon" style="width:72px" value="●" maxlength="4" aria-label="圖示" />
              <input id="new-category-name" class="grow" required maxlength="20" placeholder="新增分類名稱" />
              <button class="btn btn-primary" type="submit">新增</button>
            </form>
            <div class="category-list">
              ${state.categories.map((category) => `
                <div class="category-row" data-category-row="${escapeHtml(category.id)}">
                  <input class="category-icon-input" data-category-icon="${escapeHtml(category.id)}" value="${escapeHtml(category.icon)}" maxlength="4" />
                  <input data-category-name="${escapeHtml(category.id)}" value="${escapeHtml(category.name)}" maxlength="20" />
                  <label class="check-row small"><input type="checkbox" data-category-active="${escapeHtml(category.id)}" ${category.active ? "checked" : ""} />啟用</label>
                  <button class="btn btn-danger category-delete" data-delete-category="${escapeHtml(category.id)}" ${category.system ? "disabled title='系統保留分類不可刪除'" : ""}>刪除</button>
                </div>
              `).join("")}
            </div>
          </section>
          <section class="card panel">
            <div class="section-title"><h2>標籤統計</h2><span class="small muted">依使用次數排序</span></div>
            <div class="tag-stat-list">${sortedTags.length ? sortedTags.map(([tag,count]) => `<span class="tag-stat">#${escapeHtml(tag)}　${count}</span>`).join("") : `<span class="muted">尚未建立標籤。</span>`}</div>
          </section>
        </div>
        <div class="form-grid">
          <section class="card panel">
            <div class="user-card">
              ${state.user.photoURL ? `<img class="avatar" src="${escapeHtml(state.user.photoURL)}" alt="" />` : `<div class="avatar"></div>`}
              <div><strong>${escapeHtml(state.user.displayName || "Google 使用者")}</strong><div class="small muted">${escapeHtml(state.user.email || "")}</div></div>
            </div>
            <div class="form-actions" style="justify-content:flex-start"><button class="btn btn-secondary" id="logout-button">登出</button></div>
          </section>
          <section class="card panel">
            <h2 style="margin-top:0">資料備份</h2>
            <p class="muted small">匯出 JSON 可保存收藏內容；匯入會新增資料，不會覆蓋既有收藏。</p>
            <div class="form-grid">
              <button class="btn btn-secondary" id="export-data">匯出 JSON 備份</button>
              <label class="btn btn-secondary" style="cursor:pointer">匯入 JSON<input id="import-data" type="file" accept="application/json,.json" class="hidden" /></label>
            </div>
          </section>
          <section class="card panel">
            <h2 style="margin-top:0">使用統計</h2>
            <div class="form-grid two">
              <div><strong style="font-size:28px">${state.bookmarks.length}</strong><div class="small muted">收藏總數</div></div>
              <div><strong style="font-size:28px">${state.bookmarks.filter((item) => item.hasLocation).length}</strong><div class="small muted">有地點</div></div>
              <div><strong style="font-size:28px">${state.bookmarks.filter((item) => item.status === "pending").length}</strong><div class="small muted">待整理</div></div>
              <div><strong style="font-size:28px">${tagCounts.size}</strong><div class="small muted">標籤數量</div></div>
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
    const icon = document.querySelector("#new-category-icon").value.trim() || "●";
    if (!name) return;
    try {
      await addCategory(state.user.uid, { name, icon, sortOrder: state.categories.length });
      showToast("分類已新增。", "success");
      await renderSettingsPage();
    } catch (error) {
      showToast(error?.message || "新增分類失敗。", "error");
    }
  });

  const saveCategory = async (categoryId) => {
    const name = document.querySelector(`[data-category-name="${CSS.escape(categoryId)}"]`).value.trim();
    const icon = document.querySelector(`[data-category-icon="${CSS.escape(categoryId)}"]`).value.trim() || "●";
    const active = document.querySelector(`[data-category-active="${CSS.escape(categoryId)}"]`).checked;
    if (!name) return showToast("分類名稱不可空白。", "error");
    try {
      await updateCategory(state.user.uid, categoryId, { name, icon, active });
      showToast("分類已更新。", "success");
    } catch (error) {
      showToast(error?.message || "分類更新失敗。", "error");
    }
  };
  document.querySelectorAll("[data-category-name], [data-category-icon]").forEach((input) => {
    input.addEventListener("change", () => saveCategory(input.dataset.categoryName || input.dataset.categoryIcon));
  });
  document.querySelectorAll("[data-category-active]").forEach((input) => {
    input.addEventListener("change", () => saveCategory(input.dataset.categoryActive));
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
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: state.categories.map(({ id, name, icon, sortOrder, active }) => ({ id, name, icon, sortOrder, active })),
      bookmarks: state.bookmarks.map(serializeBookmark)
    });
  });
  document.querySelector("#import-data").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.bookmarks)) throw new Error("備份檔格式不正確。");
      const count = await importBookmarks(state.user.uid, data.bookmarks, state.categories);
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
    if (path === "home") return await renderCollectionPage({ pendingOnly: false });
    if (path === "pending") return await renderCollectionPage({ pendingOnly: true });
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
      await Promise.all([upsertUserProfile(user), seedDefaultCategories(user.uid)]);
      if (!location.hash) location.hash = "#/home";
      await renderRoute();
    } catch (error) {
      console.error(error);
      renderShell({ title: "初始化失敗", active: "home", content: `<div class="alert alert-error">${escapeHtml(error?.message || "請檢查 Firestore 規則。")}</div>` });
    }
  } else {
    renderLogin();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("Service Worker 註冊失敗", error));
  });
}
