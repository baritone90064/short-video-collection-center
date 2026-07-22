import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { CONFIG } from "./config.js";

function validateConfig() {
  const values = Object.values(CONFIG.firebase);
  if (values.some((value) => !value || String(value).startsWith("請填入_"))) {
    throw new Error("請先在 config.js 填入完整 Firebase 設定值。");
  }
}

validateConfig();

export const firebaseApp = initializeApp(CONFIG.firebase);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: "select_account" });
await setPersistence(auth, browserLocalPersistence);

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle() {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Google login error:", error);

    if (error?.code === "auth/popup-blocked") {
      throw new Error(
        "Google 登入視窗被瀏覽器阻擋，請使用 Safari 直接開啟網站後再登入。"
      );
    }

    if (
      error?.code === "auth/popup-closed-by-user" ||
      error?.code === "auth/cancelled-popup-request"
    ) {
      throw new Error("Google 登入視窗已關閉，請再試一次。");
    }

    if (error?.code === "auth/operation-not-supported-in-this-environment") {
      throw new Error(
        "目前的瀏覽器環境不支援 Google 登入，請複製網站網址並改用 Safari 開啟。"
      );
    }

    throw error;
  }
}

export function logout() {
  return signOut(auth);
}
