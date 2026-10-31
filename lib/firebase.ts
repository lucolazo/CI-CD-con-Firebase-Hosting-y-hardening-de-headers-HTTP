"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from "firebase/auth";
import { connectDataConnectEmulator, getDataConnect, type DataConnect } from "firebase/data-connect";
import { firebaseConfig, sqlConnectConfig } from "./firebase-config";

/**
 * En `npm run dev` (NODE_ENV=development) la app habla con los emuladores locales:
 *   Auth → 127.0.0.1:9099   ·   SQL Connect → 127.0.0.1:9399
 * En el build de producción (`npm run build`) habla con los servicios reales.
 */
export const USA_EMULADORES = process.env.NODE_ENV === "development";

let cache: { app: FirebaseApp; auth: Auth; dc: DataConnect } | null = null;

/** Inicialización perezosa: solo en el navegador, nunca durante el build estático. */
export function firebase() {
  if (cache) return cache;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  // initializeAuth SIN popupRedirectResolver: solo usamos email/contraseña, así el SDK no abre el
  // iframe de `authDomain` ni carga apis.google.com. Menos orígenes en la CSP (frame-src/script-src).
  let auth: Auth;
  try {
    auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  } catch {
    auth = getAuth(app); // ya inicializado (p. ej. recarga en caliente en `npm run dev`)
  }
  const dc = getDataConnect(app, sqlConnectConfig);
  if (USA_EMULADORES) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectDataConnectEmulator(dc, "127.0.0.1", 9399);
  }
  cache = { app, auth, dc };
  return cache;
}
