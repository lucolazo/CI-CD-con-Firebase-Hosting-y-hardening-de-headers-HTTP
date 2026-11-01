"use client";

// app/components/ResenasCurso.tsx — Práctica 4. Formulario + lista en tiempo real + resumen.
import { useEffect, useState, type FormEvent } from "react";
import { borrarResena, escucharMiResena, escucharResenas, guardarResena, resumenDe, type Resena, type Resumen } from "@/lib/resenas";

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function ResenasCurso({ cursoId, uid }: { cursoId: string; uid: string | null }) {
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [miResena, setMiResena] = useState<Resena | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [soloCinco, setSoloCinco] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // se incrementa tras guardar/borrar para refrescar el resumen

  // Suscripción en tiempo real: se cancela al desmontar o al cambiar de curso/filtro.
  useEffect(() => {
    return escucharResenas(cursoId, setResenas, (e) => setError(e.message), soloCinco);
  }, [cursoId, soloCinco]);

  // Mi reseña, en un listener aparte (no depende del filtro ni del límite de 20).
  useEffect(() => {
    if (!uid) return;
    return escucharMiResena(cursoId, uid, setMiResena, (e) => setError(e.message));
  }, [cursoId, uid]);
  const mia = uid ? miResena : null;

  // La agregación NO es en tiempo real: se vuelve a pedir cuando cambia el contenido ya confirmado
  // por el servidor (no solo la cantidad: con limit(20) la cantidad deja de crecer) o tras mis cambios.
  const firma = resenas
    .filter((r) => !r.pendiente)
    .map((r) => `${r.uid}:${r.puntaje}`)
    .join("|");
  useEffect(() => {
    let vigente = true;
    resumenDe(cursoId)
      .then((r) => vigente && setResumen(r))
      .catch((e: unknown) => vigente && setError(mensaje(e)));
    return () => {
      vigente = false;
    };
  }, [cursoId, firma, version]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const texto = String(f.get("texto")).trim();
    if (!texto) return setError("Escribí un comentario.");
    try {
      await guardarResena(cursoId, Number(f.get("puntaje")), texto, !mia);
      setError(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(mensaje(err));
    }
  }

  async function onBorrar() {
    try {
      await borrarResena(cursoId);
      setError(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(mensaje(err));
    }
  }

  return (
    <section className="resenas">
      <h3>
        Reseñas {resumen && resumen.cantidad > 0 && `· ★ ${resumen.promedio?.toFixed(1)} (${resumen.cantidad})`}
      </h3>
      <label className="resenas__filtro">
        <input type="checkbox" checked={soloCinco} onChange={(e) => setSoloCinco(e.target.checked)} /> Solo 5 estrellas
      </label>
      {uid ? (
        // key: al llegar (o desaparecer) mi reseña el formulario se recrea con los valores iniciales correctos.
        <form className="resenas__form" key={mia ? "editar" : "nueva"} onSubmit={onSubmit}>
          <select name="puntaje" defaultValue={mia?.puntaje ?? 5} aria-label="Puntaje">
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
              </option>
            ))}
          </select>
          <textarea name="texto" maxLength={500} defaultValue={mia?.texto ?? ""} placeholder="Tu comentario" required />
          <div className="resenas__acciones">
            <button type="submit" className="button button--small">
              {mia ? "Actualizar mi reseña" : "Publicar"}
            </button>
            {mia && (
              <button type="button" className="button button--small button--ghost" onClick={onBorrar}>
                Borrar mi reseña
              </button>
            )}
          </div>
        </form>
      ) : (
        <small className="hint">Ingresá para dejar tu reseña.</small>
      )}
      {error && (
        <p className="alerta alerta--error" role="alert">
          {error}
        </p>
      )}
      {resenas.length === 0 && !error && <p className="hint">Todavía no hay reseñas{soloCinco ? " de 5 estrellas" : ""}.</p>}
      <ul className="resenas__lista">
        {resenas.map((r) => (
          <li key={r.uid}>
            <strong>{"★".repeat(r.puntaje)}</strong> {r.texto} — <em>{r.autor}</em>
            {r.pendiente && <small className="hint"> (enviando…)</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}
