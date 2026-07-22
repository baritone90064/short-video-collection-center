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
  ["scenic", "景點", "📍"],
  ["restaurant", "餐廳", "🍴"],
  ["lodging", "住宿", "🛏️"],
  ["shopping", "購物", "🛍️"],
  ["knowledge", "知識", "💡"],
  ["learning", "學習", "📚"],
  ["ai-tools", "AI工具", "✨"],
  ["work", "工作", "💼"],
  ["health", "健康", "💪"],
  ["entertainment", "娛樂", "🎬"],
  ["other", "其他", "●"]
];

function categoriesRef(uid) {
  return collection(db, "users", uid, "categories");
}

function bookmarksRef(uid) {
  return collection(db, "users", uid, "bookmarks");
}

function withId(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function seedDefaultCategories(uid) {
  const existing = await getDocs(query(categoriesRef(uid), limit(1)));
  if (!existing.empty) return;
  const batch = writeBatch(db);
  DEFAULT_CATEGORIES.forEach(([id, name, icon], index) => {
    batch.set(doc(categoriesRef(uid), id), {
      name,
      icon,
      sortOrder: index,
      active: true,
      system: id === "other",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
}

export async function listCategories(uid) {
  const snapshot = await getDocs(query(categoriesRef(uid), orderBy("sortOrder", "asc")));
  return withId(snapshot);
}

export async function addCategory(uid, { name, icon, sortOrder }) {
  await addDoc(categoriesRef(uid), {
    name: String(name || "").trim(),
    icon: String(icon || "●").trim() || "●",
    sortOrder: Number(sortOrder) || 0,
    active: true,
    system: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateCategory(uid, categoryId, patch) {
  await updateDoc(doc(db, "users", uid, "categories", categoryId), {
    ...patch,
    updatedAt: serverTimestamp()
  });
}

export async function deleteCategoryAndMove(uid, sourceCategoryId, targetCategoryId) {
  if (!sourceCategoryId || !targetCategoryId || sourceCategoryId === targetCategoryId) {
    throw new Error("請選擇不同的替代分類。");
  }
  const affected = await getDocs(query(bookmarksRef(uid), where("categoryId", "==", sourceCategoryId)));
  const docs = affected.docs;
  for (let index = 0; index < docs.length; index += 450) {
    const batch = writeBatch(db);
    docs.slice(index, index + 450).forEach((item) => {
      batch.update(item.ref, {
        categoryId: targetCategoryId,
        status: "pending",
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
  }
  await deleteDoc(doc(db, "users", uid, "categories", sourceCategoryId));
  return docs.length;
}

export async function listBookmarks(uid, maxResults = CONFIG.pageSize) {
  const snapshot = await getDocs(
    query(bookmarksRef(uid), orderBy("createdAt", "desc"), limit(maxResults))
  );
  return withId(snapshot);
}

export async function getBookmark(uid, bookmarkId) {
  const snapshot = await getDoc(doc(db, "users", uid, "bookmarks", bookmarkId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function findDuplicateUrl(uid, normalizedUrl) {
  if (!normalizedUrl) return null;
  const snapshot = await getDocs(
    query(bookmarksRef(uid), where("normalizedUrl", "==", normalizedUrl), limit(1))
  );
  return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

export async function createBookmark(uid, input) {
  const result = await addDoc(bookmarksRef(uid), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return result.id;
}

export async function updateBookmark(uid, bookmarkId, input) {
  await updateDoc(doc(db, "users", uid, "bookmarks", bookmarkId), {
    ...input,
    updatedAt: serverTimestamp()
  });
}

export async function removeBookmark(uid, bookmarkId) {
  await deleteDoc(doc(db, "users", uid, "bookmarks", bookmarkId));
}

export async function queryNearbyBookmarks(uid, center, radiusKm) {
  const bounds = geoBounds(center, radiusKm);
  const snapshots = await Promise.all(
    bounds.map(([start, end]) => getDocs(
      query(
        bookmarksRef(uid),
        orderBy("location.geohash"),
        startAt(start),
        endAt(end)
      )
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

export async function importBookmarks(uid, records, categories) {
  const valid = Array.isArray(records) ? records : [];
  const categoryIds = new Set(categories.map((category) => category.id));
  let count = 0;
  for (let index = 0; index < valid.length; index += 400) {
    const batch = writeBatch(db);
    valid.slice(index, index + 400).forEach((record) => {
      const ref = doc(bookmarksRef(uid));
      const categoryId = categoryIds.has(record.categoryId) ? record.categoryId : "other";
      batch.set(ref, {
        title: String(record.title || "未命名收藏").slice(0, 160),
        url: String(record.url || ""),
        normalizedUrl: String(record.normalizedUrl || record.url || ""),
        platform: String(record.platform || "other"),
        thumbnailUrl: String(record.thumbnailUrl || ""),
        categoryId,
        tags: Array.isArray(record.tags) ? record.tags.map(String).slice(0, 20) : [],
        note: String(record.note || "").slice(0, 3000),
        status: record.status === "pending" ? "pending" : "active",
        hasLocation: Boolean(record.hasLocation && record.location),
        location: record.hasLocation && record.location ? {
          placeName: String(record.location.placeName || "自訂地點"),
          address: String(record.location.address || ""),
          latitude: Number(record.location.latitude),
          longitude: Number(record.location.longitude),
          geohash: String(record.location.geohash || toGeohash(Number(record.location.latitude), Number(record.location.longitude))),
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
