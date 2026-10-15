import { NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { addDays, classDayForDateStr, getCalendarBounds, nowInSchoolTZ } from "@/lib/schedule";

/**
 * Fechas de clase hábiles (martes, jueves y viernes) dentro del período lectivo
 * (desde 2026-09-01 hasta el límite futuro del calendario).
 * Incluye tanto clases pasadas como próximas clases que el profesor puede adelantar.
 */
export async function GET(req: Request) {
  const { error } = await requireSession(["PROFESOR", "ADMIN"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 30), 1), 100);

  const bounds = getCalendarBounds();
  const maxFutureDate = addDays(bounds.maxMonday, 6);
  const dates: { date: string; dayOfWeek: string; isFuture: boolean }[] = [];
  const today = nowInSchoolTZ().dateStr;

  // Recorremos desde la fecha máxima futura hacia atrás hasta 2026-09-01
  let cursor = maxFutureDate;
  for (let i = 0; i < 400 && dates.length < limit; i++) {
    if (cursor < "2026-09-01") break;
    const classDay = classDayForDateStr(cursor);
    if (classDay) {
      dates.push({
        date: cursor,
        dayOfWeek: classDay.dayOfWeek,
        isFuture: cursor > today,
      });
    }
    cursor = addDays(cursor, -1);
  }

  return NextResponse.json({ dates, today });
}
