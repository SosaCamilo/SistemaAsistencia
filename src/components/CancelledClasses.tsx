"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowPathIcon } from "@/components/Icons";
import { formatDateDMY } from "@/lib/dateFormat";

type CancelledClass = {
  id: string;
  date: string;
  dayOfWeek: string;
  reason: string | null;
};

export default function CancelledClasses({ onChange }: { onChange?: () => void }) {
  const [cancelled, setCancelled] = useState<CancelledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const data = await fetch("/api/classes").then((r) => r.json());
    setCancelled(data.cancelled ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [syncingHolidays, setSyncingHolidays] = useState(false);

  async function syncHolidays() {
    setSyncingHolidays(true);
    setMessage(null);
    try {
      const res = await fetch("/api/classes/sync-holidays", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "No se pudieron sincronizar los feriados.", ok: false });
      } else {
        setMessage({
          text:
            data.newlyCancelled > 0
              ? `¡Feriados sincronizados! Se anularon automáticamente ${data.newlyCancelled} clases por feriados nacionales.`
              : "Todos los feriados nacionales ya se encuentran anulados o reactivados.",
          ok: true,
        });
        await load();
        onChange?.();
      }
    } catch {
      setMessage({ text: "Error de conexión al sincronizar feriados.", ok: false });
    } finally {
      setSyncingHolidays(false);
    }
  }

  async function cancelClass() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, reason }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setMessage({ text: data.error ?? "No se pudo anular la clase.", ok: false });
      return;
    }

    const afectadas = data.affected ?? 0;
    setMessage({
      text:
        afectadas > 0
          ? `Clase anulada. ${afectadas} ${afectadas === 1 ? "asistencia ya registrada dejó" : "asistencias ya registradas dejaron"} de acreditar horas.`
          : "Clase anulada.",
      ok: true,
    });
    setDate("");
    setReason("");
    await load();
    onChange?.();
  }

  async function reactivate(d: string) {
    setMessage(null);
    const res = await fetch("/api/classes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: d }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ text: data.error ?? "No se pudo reactivar la clase.", ok: false });
      return;
    }
    setMessage({ text: "Clase reactivada. Las asistencias de esa fecha vuelven a contar.", ok: true });
    await load();
    onChange?.();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 max-w-xl">
          Si una clase no se dicta (feriado, paro, suspensión), anulala acá. Podés anular clases que
          ya pasaron y también futuras. Los feriados oficiales se sincronizan automáticamente al iniciar sesión, o podés forzar la sincronización con el botón. Las asistencias registradas dejan de acreditar horas, pero no se borran: si reactivás la clase, vuelven a contar.
        </p>
        <button
          type="button"
          onClick={syncHolidays}
          disabled={syncingHolidays}
          className="btn-outline text-xs !py-2 !px-3 font-semibold text-indigo-700 border-indigo-200 hover:bg-indigo-50 inline-flex items-center gap-1.5"
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${syncingHolidays ? "animate-spin" : ""}`} />
          <span>{syncingHolidays ? "Sincronizando..." : "Sincronizar feriados y asuetos"}</span>
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Fecha de la clase</label>
          <input
            type="date"
            min="2026-09-01"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="label">Motivo (opcional)</label>
          <input
            type="text"
            className="input"
            placeholder="Ej: feriado nacional"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={cancelClass} disabled={!date || saving}>
          {saving ? "Anulando..." : "Anular clase"}
        </button>
      </div>

      {message && (
        <p className={`mb-4 text-sm font-medium ${message.ok ? "text-green-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      <h4 className="mb-2 text-sm font-semibold text-slate-600">Clases anuladas</h4>
      {loading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : cancelled.length === 0 ? (
        <p className="text-sm text-slate-500">No hay clases anuladas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Día</th>
                <th>Motivo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cancelled.map((c) => (
                <tr key={c.id}>
                  <td>{formatDateDMY(c.date)}</td>
                  <td>{c.dayOfWeek}</td>
                  <td className="text-slate-500">{c.reason ?? "—"}</td>
                  <td>
                    <button className="btn-outline !px-3 !py-1 !text-sm" onClick={() => reactivate(c.date)}>
                      Reactivar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
