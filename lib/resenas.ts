"use client";

// lib/resenas.ts — Práctica 4 (Firestore). Capa de acceso a datos de reseñas.
// Los componentes NO importan firebase/firestore directamente: todo pasa por acá.
import {
  average,
  collection,
  connectFirestoreEmulator,
  count,
  deleteDoc,
  doc,
  getAggregateFromServer,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type Firestore,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { firebase, USA_EMULADORES } from "./firebase";

export interface Resena {
  uid: string; // = id del documento
  puntaje: number; // 1..5
  texto: string;
  autor: string;
  creadaEn: Timestamp | null; // null mientras el serverTimestamp está pendiente (escritura local)
  pendiente: boolean; // true mientras el servidor no confirmó la escritura (compensación de latencia)
}

export interface Resumen {
  cantidad: number;
  promedio: number | null;
}

let db: Firestore | null = null;
export function firestore(): Firestore {
  if (db) return db;
  const instancia = getFirestore(firebase().app);
  if (USA_EMULADORES) {
    try {
      connectFirestoreEmulator(instancia, "127.0.0.1", 8080);
    } catch {
      // Recarga en caliente de `npm run dev`: la instancia ya estaba conectada al emulador.
    }
  }
  db = instancia;
  return db;
}

const resenasDe = (cursoId: string) => collection(firestore(), "cursos", cursoId, "resenas");

function aResena(uid: string, data: DocumentData, pendiente: boolean): Resena {
  return {
    uid,
    puntaje: data.puntaje,
    texto: data.texto,
    autor: data.autor,
    creadaEn: data.creadaEn ?? null,
    pendiente,
  };
}

/** Paso 3 · Crear o editar MI reseña. El id del documento es mi UID: una reseña por persona y curso. */
export async function guardarResena(cursoId: string, puntaje: number, texto: string, esNueva: boolean): Promise<void> {
  const usuario = firebase().auth.currentUser;
  if (!usuario) throw new Error("Tenés que ingresar para dejar una reseña.");
  const ref = doc(resenasDe(cursoId), usuario.uid);
  // Se recorta al límite de las reglas (80) para que un nombre largo no rechace la escritura.
  const datos = { puntaje, texto, autor: (usuario.displayName ?? "Anónimo").slice(0, 80) };
  if (esNueva) await setDoc(ref, { ...datos, creadaEn: serverTimestamp() });
  else await setDoc(ref, datos, { merge: true }); // conserva creadaEn (las reglas lo exigen)
}

export async function borrarResena(cursoId: string): Promise<void> {
  const usuario = firebase().auth.currentUser;
  if (!usuario) return;
  await deleteDoc(doc(resenasDe(cursoId), usuario.uid));
}

/** Paso 4 · Últimas reseñas en tiempo real. Devuelve la función para cancelar la suscripción. */
export function escucharResenas(
  cursoId: string,
  alCambiar: (resenas: Resena[]) => void,
  alFallar: (e: Error) => void,
  soloCincoEstrellas = false,
): Unsubscribe {
  const filtros = soloCincoEstrellas ? [where("puntaje", "==", 5)] : [];
  const q = query(resenasDe(cursoId), ...filtros, orderBy("creadaEn", "desc"), limit(20));
  return onSnapshot(
    q,
    // includeMetadataChanges: avisa también cuando el servidor confirma una escritura local,
    // así la UI puede pasar de "enviando…" a "publicada" (hasPendingWrites).
    { includeMetadataChanges: true },
    (snap) =>
      alCambiar(
        snap.docs.map((d) =>
          // "estimate": mientras la escritura está pendiente, creadaEn usa una estimación en vez de null.
          aResena(d.id, d.data({ serverTimestamps: "estimate" }), d.metadata.hasPendingWrites),
        ),
      ),
    alFallar,
  );
}

/**
 * Escucha SOLO mi reseña (un documento). Sirve para precargar el formulario y decidir crear vs. editar
 * sin depender de la lista: mi reseña puede no estar en las últimas 20 ni pasar el filtro de 5 estrellas.
 */
export function escucharMiResena(
  cursoId: string,
  uid: string,
  alCambiar: (resena: Resena | null) => void,
  alFallar: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(resenasDe(cursoId), uid),
    { includeMetadataChanges: true },
    (snap) =>
      alCambiar(
        snap.exists() ? aResena(snap.id, snap.data({ serverTimestamps: "estimate" }), snap.metadata.hasPendingWrites) : null,
      ),
    alFallar,
  );
}

/** Paso 5 · Promedio y cantidad calculados por el servidor (consulta de agregación). */
export async function resumenDe(cursoId: string): Promise<Resumen> {
  const snap = await getAggregateFromServer(resenasDe(cursoId), { cantidad: count(), promedio: average("puntaje") });
  return snap.data();
}
