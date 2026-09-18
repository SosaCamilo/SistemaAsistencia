"use client";

import type { HourBreakdown } from "@/lib/hours";
import {
  CalendarIcon,
  ClockIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  ChartPieIcon,
} from "@/components/Icons";

type Props = {
  breakdown: HourBreakdown;
  creditedCount: number;
};

export default function HoursDashboardCharts({ breakdown, creditedCount }: Props) {
  const total = breakdown.total || 0;

  const pctClasses = total > 0 ? Math.round((breakdown.classHours / total) * 100) : 0;
  const pctPrior = total > 0 ? Math.round((breakdown.priorHours / total) * 100) : 0;
  const pctCourses = total > 0 ? Math.round((breakdown.coursesHours / total) * 100) : 0;
  const pctInternships = total > 0 ? Math.round((breakdown.internshipHours / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Resumen Principal y Gráfico Proporcional */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Progreso General
            </h3>
            <p className="text-2xl font-black text-primary">
              {total} <span className="text-base font-semibold text-slate-500">horas acumuladas</span>
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
            <ChartPieIcon className="w-4 h-4 text-primary" />
            <span>Distribución de horas</span>
          </div>
        </div>

        {/* Barra de progreso segmentada proporcional */}
        <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
          {breakdown.classHours > 0 && (
            <div
              style={{ width: `${(breakdown.classHours / (total || 1)) * 100}%` }}
              className="bg-primary hover:opacity-90 transition-all"
              title={`Clases regulares: ${breakdown.classHours}hs (${pctClasses}%)`}
            />
          )}
          {breakdown.priorHours > 0 && (
            <div
              style={{ width: `${(breakdown.priorHours / (total || 1)) * 100}%` }}
              className="bg-amber-500 hover:opacity-90 transition-all"
              title={`Profesor anterior: ${breakdown.priorHours}hs (${pctPrior}%)`}
            />
          )}
          {breakdown.coursesHours > 0 && (
            <div
              style={{ width: `${(breakdown.coursesHours / (total || 1)) * 100}%` }}
              className="bg-sky-500 hover:opacity-90 transition-all"
              title={`Cursos y talleres: ${breakdown.coursesHours}hs (${pctCourses}%)`}
            />
          )}
          {breakdown.internshipHours > 0 && (
            <div
              style={{ width: `${(breakdown.internshipHours / (total || 1)) * 100}%` }}
              className="bg-emerald-600 hover:opacity-90 transition-all"
              title={`Pasantías: ${breakdown.internshipHours}hs (${pctInternships}%)`}
            />
          )}
          {total === 0 && (
            <div className="w-full h-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-500">
              Sin horas registradas
            </div>
          )}
        </div>

        {/* Leyenda del gráfico */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary shrink-0" />
            <span className="text-slate-600 truncate">Clases ({pctClasses}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shrink-0" />
            <span className="text-slate-600 truncate">Prof. anterior ({pctPrior}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 shrink-0" />
            <span className="text-slate-600 truncate">Cursos ({pctCourses}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 shrink-0" />
            <span className="text-slate-600 truncate">Pasantías ({pctInternships}%)</span>
          </div>
        </div>
      </section>

      {/* Cuadrícula de Métricas por Concepto */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Clases Regulares */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 mb-2 text-primary">
            <span className="text-xs font-bold uppercase tracking-wide">Clases</span>
            <CalendarIcon className="w-4 h-4 shrink-0" />
          </div>
          <div>
            <p className="text-2xl font-black text-primary leading-none">
              {breakdown.classHours}
              <span className="text-xs font-semibold text-slate-500 ml-0.5">hs</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {creditedCount} asistencias presenciales
            </p>
          </div>
        </div>

        {/* Profesor Anterior */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 mb-2 text-amber-800">
            <span className="text-xs font-bold uppercase tracking-wide">Prof. Anterior</span>
            <ClockIcon className="w-4 h-4 shrink-0" />
          </div>
          <div>
            <p className="text-2xl font-black text-amber-800 leading-none">
              {breakdown.priorHours}
              <span className="text-xs font-semibold text-slate-500 ml-0.5">hs</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Antes del 01-09-2026
            </p>
          </div>
        </div>

        {/* Cursos y Talleres */}
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 mb-2 text-sky-800">
            <span className="text-xs font-bold uppercase tracking-wide">Cursos</span>
            <AcademicCapIcon className="w-4 h-4 shrink-0" />
          </div>
          <div>
            <p className="text-2xl font-black text-sky-800 leading-none">
              {breakdown.coursesHours}
              <span className="text-xs font-semibold text-slate-500 ml-0.5">hs</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Capacitaciones externas
            </p>
          </div>
        </div>

        {/* Pasantías */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 mb-2 text-emerald-800">
            <span className="text-xs font-bold uppercase tracking-wide">Pasantías</span>
            <BuildingOfficeIcon className="w-4 h-4 shrink-0" />
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-800 leading-none">
              {breakdown.internshipHours}
              <span className="text-xs font-semibold text-slate-500 ml-0.5">hs</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Horas efectivas en empresas
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
