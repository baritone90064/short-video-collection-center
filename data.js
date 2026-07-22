import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAt,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { db } from "./firebase-client.js";
import { CONFIG } from "./config.js";
import { distanceKm, geoBounds, toGeohash } from "./geo.js";

const DEFAULT_CATEGORIES = [
  ["scenic", "景點", "scenic", "#67c7a3"],
  ["restaurant", "餐廳", "restaurant", "#f47b64"],
  ["lodging", "住宿", "lodging", "#8b78e6"],
  ["shopping", "購物", "shopping", "#f5a623"],
  ["knowledge", "知識", "knowledge", "#41b7b2"],
  ["learning", "學習", "learning", "#5aa7e8"],
  ["ai-tools", "AI工具", "ai", "#ef6f9a"],
  ["work", "工作", "work", "#6e8bd8"],
  ["health", "健康", "health", "#64b98a"],
  ["entertainment", "娛樂", "entertainment", "#e97b9b"],
  ["other", "其他", "other", "#9a91a8"]
];

function categoriesRef() {
  return collection(db, "workspaces", CONFIG.sharedWorkspaceId, "categories");
}

function bookmarksRef() {
  return collection(db, "workspaces", CONFIG.sharedWorkspaceId, "bookmarks");
}

function withId(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function seedDefaultCategories() {
  const existing = await getDocs(query(categoriesRef(), limit(1)));
  if (!existing.empty) return;
  const batch = writeBatch(db);
  DEFAULT_CATEGORIES.forEach(([id, name, icon, color], index) => {
    batch.set(doc(categoriesRef(), id), {
      name,
      icon,
      color,
      sortOrder: index,
      active: true,
      system: id === "other",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
}

export async function listCategories() {
  const snapshot = await getDocs(query(categoriesRef(), orderBy("sortOrder", "asc")));
  return withId(snapshot);
}

export async function addCategory({ name, icon, color, sortOrder }) {
  const result = await addDoc(categoriesRef(), {
    name: String(name || "").trim(),
    icon: String(icon || "other").trim() || "other",
    color: /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : "#f47b64",
    sortOrder: Number(sortOrder) || 0,
    active: true,
    system: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return result.id;
}

export async function updateCategory(categoryId, patch) {
  await updateDoc(doc(db, "workspaces", CONFIG.sharedWorkspaceId, "categories", categoryId), {
    ...patch,
    updatedAt: serverTimestamp()
  });
}

export async function deleteCategoryAndMove(sourceCategoryId, targetCategoryId) {
  if (!sourceCategoryId || !targetCategoryId || sourceCategoryId === targetCategoryId) {
    throw new Error("請選擇不同的替代分類。");
  }
  const affected = await getDocs(query(bookmarksRef(), where("categoryId", "==", sourceCategoryId)));
  const docs = affected.docs;
  for (let index = 0; index < docs.length; index += 450) {
    const batch = writeBatch(db);
    docs.slice(index, index + 450).forEach((item) => {
      batch.update(item.ref, {
        categoryId: targetCategoryId,
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
  }
  await deleteDoc(doc(db, "workspaces", CONFIG.sharedWorkspaceId, "categories", sourceCategoryId));
  return docs.length;
}

export async function listBookmarks(maxResults = CONFIG.pageSize) {
  const snapshot = await getDocs(query(bookmarksRef(), orderBy("createdAt", "desc"), limit(maxResults)));
  return withId(snapshot);
}

export async function getBookmark(bookmarkId) {
  const snapshot = await getDoc(doc(db, "workspaces", CONFIG.sharedWorkspaceId, "bookmarks", bookmarkId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function findDuplicateUrl(normalizedUrl) {
  if (!normalizedUrl) return null;
  const snapshot = await getDocs(query(bookmarksRef(), where("normalizedUrl", "==", normalizedUrl), limit(1)));
  return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

export async function createBookmark(input) {
  const result = await addDoc(bookmarksRef(), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return result.id;
}

export async function updateBookmark(bookmarkId, input) {
  await updateDoc(doc(db, "workspaces", CONFIG.sharedWorkspaceId, "bookmarks", bookmarkId), {
    ...input,
    updatedAt: serverTimestamp()
  });
}

export async function removeBookmark(bookmarkId) {
  await deleteDoc(doc(db, "workspaces", CONFIG.sharedWorkspaceId, "bookmarks", bookmarkId));
}

export async function queryNearbyBookmarks(center, radiusKm) {
  const bounds = geoBounds(center, radiusKm);
  const snapshots = await Promise.all(
    bounds.map(([start, end]) => getDocs(
      query(bookmarksRef(), orderBy("location.geohash"), startAt(start), endAt(end))
    ))
  );

  const unique = new Map();
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((item) => {
      const bookmark = { id: item.id, ...item.data() };
      if (bookmark.hasLocation && bookmark.location?.latitude != null && bookmark.location?.longitude != null) {
        unique.set(bookmark.id, bookmark);
      }
    });
  });

  return [...unique.values()]
    .map((bookmark) => ({
      ...bookmark,
      distanceKm: distanceKm(center, {
        latitude: bookmark.location.latitude,
        longitude: bookmark.location.longitude
      })
    }))
    .filter((bookmark) => bookmark.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function upsertUserProfile(user) {
  if (!user) return;
  await setDoc(doc(db, "users", user.uid), {
    email: user.email || "",
    displayName: user.displayName || "",
    photoURL: user.photoURL || "",
    lastLoginAt: serverTimestamp()
  }, { merge: true });
}

export async function importBookmarks(records, categories) {
  const valid = Array.isArray(records) ? records : [];
  const categoryIds = new Set(categories.map((category) => category.id));
  let count = 0;
  for (let index = 0; index < valid.length; index += 400) {
    const batch = writeBatch(db);
    valid.slice(index, index + 400).forEach((record) => {
      const ref = doc(bookmarksRef());
      const categoryId = categoryIds.has(record.categoryId) ? record.categoryId : "other";
      const hasLocation = Boolean(record.hasLocation && record.location);
      const latitude = Number(record.location?.latitude);
      const longitude = Number(record.location?.longitude);
      batch.set(ref, {
        title: String(record.title || "未命名收藏").slice(0, 160),
        url: String(record.url || ""),
        normalizedUrl: String(record.normalizedUrl || record.url || ""),
        platform: String(record.platform || "other"),
        thumbnailUrl: String(record.thumbnailUrl || ""),
        categoryId,
        tags: Array.isArray(record.tags) ? record.tags.map(String).slice(0, 20) : [],
        note: String(record.note || "").slice(0, 3000),
        hasLocation: hasLocation && Number.isFinite(latitude) && Number.isFinite(longitude),
        location: hasLocation && Number.isFinite(latitude) && Number.isFinite(longitude) ? {
          placeName: String(record.location.placeName || "自訂地點"),
          address: String(record.location.address || ""),
          latitude,
          longitude,
          geohash: String(record.location.geohash || toGeohash(latitude, longitude)),
          placeId: String(record.location.placeId || "")
        } : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      count += 1;
    });
    await batch.commit();
  }
  return count;
}
