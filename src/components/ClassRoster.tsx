"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import RefreshIndicator from "@/components/RefreshIndicator";
import { useAutoRefresh } from "@/lib/useAutoRefresh";
import { formatDateDMY, getTodaySchoolTZ } from "@/lib/dateFormat";

type RosterEntry = {
  id: string;
  dni: string;
  nombre: string;
  apellido: string;
  attended: boolean;
  hours: number;
  source: string | null;
};

type Roster = {
  date: string;
  dayOfWeek: string;
  start: string;
  end: string;
  cancelled: boolean;
  reason: string | null;
  isFuture: boolean;
  isOpen?: boolean;
  presentes: number;
  ausentes: number;
  total: number;
  roster: RosterEntry[];
  error?: string;
};

type ClassDate = { date: string; dayOfWeek: string; isFuture?: boolean };

export default function ClassRoster({ canEdit = false }: { canEdit?: boolean }) {
  const { data: session } = useSession();
  const [dates, setDates] = useState<ClassDate[]>([]);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<Roster | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"TODOS" | "PRESENTES" | "AUSENTES">("TODOS");
  // DNI del alumno cuya fila se está guardando, para deshabilitar su botón.
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isProf = session?.user?.role === "PROFESOR";
  const canRemove = !isProf || !!data?.isOpen || !!data?.isFuture;

  useEffect(() => {
    fetch("/api/classes/dates?limit=50")
      .then((r) => r.json())
      .then((d) => {
        const list: ClassDate[] = d.dates ?? [];
        setDates(list);
        const today = d.today || getTodaySchoolTZ();
        // Selecciona automáticamente la fecha actual en el combobox si está en la lista.
        const todayClass = list.find((c) => c.date === today);
        if (todayClass) {
          setSelected(todayClass.date);
        } else {
          // Si hoy no es día de clase, arranca en la clase más reciente ya transcurrida (<= hoy), o la primera disponible.
          const mostRecentPast = list.find((c) => c.date <= today);
          if (mostRecentPast) {
            setSelected(mostRecentPast.date);
          } else if (list.length) {
            setSelected(list[0].date);
          } else {
            setLoading(false);
          }
        }
      });
  }, []);

  const load = useCallback(async () => {
    if (!selected) return;
    const d = await fetch(`/api/classes/roster?date=${selected}`).then((r) => r.json());
    setData(d);
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const { lastUpdate, refreshing, refreshNow } = useAutoRefresh(load);

  // Acredita o quita las horas de un alumno en la clase seleccionada.
  async function toggleAttendance(studentId: string, attended: boolean) {
    setSaving(studentId);
    setError(null);
    const res = await fetch("/api/admin/attendance", {
      method: attended ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, date: selected }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo guardar el cambio.");
    }
    await load();
    setSaving(null);
  }

  // Se puede editar cualquier clase que no esté anulada (incluyendo clases adelantadas).
  const editable = canEdit && !!data && !data.cancelled;

  const visible = (data?.roster ?? []).filter((r) =>
    filter === "TODOS" ? true : filter === "PRESENTES" ? r.attended : !r.attended
  );

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">
        Elegí una clase para ver quiénes registraron asistencia y quiénes no.
        {canEdit && " Podés tomar lista, acreditar o corregir las horas de cada alumno (incluso en clases adelantadas)."}
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="clase">Clase</label>
          <select
            id="clase"
            className="input"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {selected && !dates.some((d) => d.date === selected) && (
              <option value={selected}>
                {formatDateDMY(selected)} (Otra fecha)
              </option>
            )}
            {dates.map((d) => (
              <option key={d.date} value={d.date}>
                {d.dayOfWeek} {formatDateDMY(d.date)}{d.isFuture ? " (Adelantada / Próxima)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="otraFecha">Otra fecha</label>
          <input
            id="otraFecha"
            type="date"
            className="input"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          />
        </div>
        <div className="pb-2">
          <RefreshIndicator lastUpdate={lastUpdate} refreshing={refreshing} onRefresh={refreshNow} />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : !data ? null : data.error ? (
        <p className="text-sm font-medium text-red-600">{data.error}</p>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-primary">
                {data.dayOfWeek} {formatDateDMY(data.date)} · {data.start} a {data.end}
              </p>
              {data.isFuture && (
                <span className="badge bg-primary/10 text-primary border border-primary/20">
                  Clase adelantada / Próxima
                </span>
              )}
            </div>
            {data.cancelled ? (
              <p className="mt-1 text-sm font-medium text-amber-700">
                Clase anulada{data.reason ? `: ${data.reason}` : ""} — no acredita horas.
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                <strong className="text-green-700">{data.presentes} presentes</strong> ·{" "}
                <strong className="text-red-600">{data.ausentes} sin registrar</strong> de{" "}
                {data.total} alumnos
              </p>
            )}
          </div>

          {error && <p className="mb-3 text-sm font-medium text-red-600">{error}</p>}

          <div className="mb-3 flex flex-wrap gap-2">
            {([
              ["TODOS", `Todos (${data.total})`],
              ["PRESENTES", `Presentes (${data.presentes})`],
              ["AUSENTES", `Sin registrar (${data.ausentes})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  filter === key
                    ? "bg-primary text-white"
                    : "border border-primary/30 bg-white text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>DNI</th>
                  <th>Asistencia</th>
                  <th>Horas</th>
                  {editable && <th></th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.apellido}, {r.nombre}</td>
                    <td>{r.dni}</td>
                    <td>
                      {r.attended ? (
                        <span className="badge bg-green-100 text-green-700">Presente</span>
                      ) : (
                        <span className="badge bg-red-100 text-red-700">Sin registrar</span>
                      )}
                    </td>
                    <td>
                      {r.attended && !data.cancelled
                        ? `${r.hours}hs`
                        : r.attended
                          ? "—"
                          : ""}
                    </td>
                    {editable && (
                      <td>
                        <button
                          onClick={() => toggleAttendance(r.id, r.attended)}
                          disabled={saving === r.id || (r.attended && !canRemove)}
                          title={r.attended && !canRemove ? "Solo se pueden remover presentes durante la clase activa o en clases adelantadas" : undefined}
                          className={
                            r.attended
                              ? !canRemove
                                ? "rounded-lg border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-400 cursor-not-allowed"
                                : "btn-danger"
                              : "btn-outline !px-3 !py-1 !text-sm"
                          }
                        >
                          {saving === r.id
                            ? "Guardando..."
                            : r.attended
                              ? "Quitar"
                              : "Acreditar"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={editable ? 5 : 4} className="text-center text-slate-500">
                      No hay alumnos en este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
