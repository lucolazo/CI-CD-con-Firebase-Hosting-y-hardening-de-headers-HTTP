// tests/reglas.test.mjs — Práctica 4. Se ejecuta contra el emulador de Firestore:
//   npm run test:reglas      (= firebase emulators:exec --only firestore "node --test tests/*.test.mjs")
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc, deleteDoc } from "firebase/firestore";

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let env;
const CURSO = "seguridad-web";
const resena = (extra = {}) => ({ puntaje: 5, texto: "Muy bueno", autor: "Ana", creadaEn: serverTimestamp(), ...extra });
const refDe = (db, uid) => doc(db, "cursos", CURSO, "resenas", uid);

// emulators:exec define FIRESTORE_EMULATOR_HOST ("127.0.0.1:8080"); si se corre a mano, se usa el puerto de firebase.json.
const [host, puerto] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

before(async () => {
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT ?? "demo-resenas",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(puerto) },
  });
});
beforeEach(() => env.clearFirestore());
after(() => env.cleanup());

/** Deja una reseña ya creada (saltando las reglas) para probar edición y borrado. */
async function sembrar(uid, datos = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(refDe(ctx.firestore(), uid), {
      puntaje: 4,
      texto: "Sembrada",
      autor: uid,
      creadaEn: Timestamp.fromDate(new Date(2025, 0, 1)),
      ...datos,
    });
  });
}

// ── Los 8 casos del enunciado ────────────────────────────────────────────────

test("cualquiera puede leer reseñas, incluso sin login", async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(refDe(anon, "ana")));
});

test("Ana puede crear SU reseña", async () => {
  const db = env.authenticatedContext("ana").firestore();
  await assertSucceeds(setDoc(refDe(db, "ana"), resena()));
});

test("Ana NO puede crear una reseña a nombre de Bruno", async () => {
  const db = env.authenticatedContext("ana").firestore();
  await assertFails(setDoc(refDe(db, "bruno"), resena()));
});

test("sin login no se puede escribir", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(setDoc(refDe(db, "ana"), resena()));
});

test("puntaje fuera de rango o con decimales se rechaza", async () => {
  const db = env.authenticatedContext("ana").firestore();
  const ref = refDe(db, "ana");
  await assertFails(setDoc(ref, resena({ puntaje: 6 })));
  await assertFails(setDoc(ref, resena({ puntaje: 4.5 })));
});

test("no se pueden agregar campos extra (p. ej. destacada: true)", async () => {
  const db = env.authenticatedContext("ana").firestore();
  await assertFails(setDoc(refDe(db, "ana"), resena({ destacada: true })));
});

test("la fecha de creación la pone el servidor y no se puede cambiar", async () => {
  const db = env.authenticatedContext("ana").firestore();
  const ref = refDe(db, "ana");
  await assertFails(setDoc(ref, resena({ creadaEn: Timestamp.fromDate(new Date(2020, 0, 1)) })));
  await assertSucceeds(setDoc(ref, resena()));
  await assertFails(updateDoc(ref, { creadaEn: Timestamp.now() }));
  await assertSucceeds(updateDoc(ref, { puntaje: 4 }));
});

test("el cliente no puede escribir el documento del curso", async () => {
  const db = env.authenticatedContext("ana").firestore();
  await assertFails(setDoc(doc(db, "cursos", CURSO), { resumen: { cantidad: 999, promedio: 5 } }));
});

// ── Tests adicionales propios ────────────────────────────────────────────────

test("Bruno NO puede editar la reseña de Ana", async () => {
  await sembrar("ana");
  const db = env.authenticatedContext("bruno").firestore();
  await assertFails(updateDoc(refDe(db, "ana"), { puntaje: 1, texto: "Pésimo" }));
});

test("Ana puede editar SU reseña conservando la fecha (setDoc con merge)", async () => {
  await sembrar("ana");
  const db = env.authenticatedContext("ana").firestore();
  await assertSucceeds(setDoc(refDe(db, "ana"), { puntaje: 3, texto: "Cambié de opinión", autor: "Ana" }, { merge: true }));
});

test("reescribir la reseña con serverTimestamp() (sin merge) se rechaza: la fecha cambiaría", async () => {
  await sembrar("ana");
  const db = env.authenticatedContext("ana").firestore();
  await assertFails(setDoc(refDe(db, "ana"), resena()));
});

test("solo el dueño puede borrar su reseña", async () => {
  await sembrar("ana");
  await assertFails(deleteDoc(refDe(env.authenticatedContext("bruno").firestore(), "ana")));
  await assertFails(deleteDoc(refDe(env.unauthenticatedContext().firestore(), "ana")));
  await assertSucceeds(deleteDoc(refDe(env.authenticatedContext("ana").firestore(), "ana")));
});

test("puntaje como string se rechaza (\"5\" no es int)", async () => {
  const db = env.authenticatedContext("ana").firestore();
  await assertFails(setDoc(refDe(db, "ana"), resena({ puntaje: "5" })));
});

test("texto de más de 500 caracteres y autor de más de 80 se rechazan; en el límite se acepta", async () => {
  const db = env.authenticatedContext("ana").firestore();
  const ref = refDe(db, "ana");
  await assertFails(setDoc(ref, resena({ texto: "x".repeat(501) })));
  await assertFails(setDoc(ref, resena({ autor: "a".repeat(81) })));
  await assertSucceeds(setDoc(ref, resena({ texto: "x".repeat(500), autor: "a".repeat(80) })));
});

test("faltar un campo obligatorio se rechaza (hasAll)", async () => {
  const db = env.authenticatedContext("ana").firestore();
  await assertFails(setDoc(refDe(db, "ana"), { puntaje: 5, texto: "Sin autor ni fecha" }));
});

test("la edición tampoco admite campos extra", async () => {
  await sembrar("ana");
  const db = env.authenticatedContext("ana").firestore();
  await assertFails(updateDoc(refDe(db, "ana"), { verificada: true }));
});

test("cualquier otra ruta está cerrada (lectura y escritura)", async () => {
  const db = env.authenticatedContext("ana").firestore();
  await assertFails(getDoc(doc(db, "usuarios", "ana")));
  await assertFails(setDoc(doc(db, "usuarios", "ana"), { admin: true }));
});
