import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { isPastOrCurrentClassDate, getAttendanceStatus, nowInSchoolTZ } from "@/lib/schedule";
import { logAudit } from "@/lib/audit";
import { formatDateDMY } from "@/lib/dateFormat";

// Crea o corrige la asistencia de un alumno en una fecha de clase (pasada o adelantada).
export async function POST(req: Request) {
  const { session, error } = await requireSession(["ADMIN", "PROFESOR"]);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const studentId = String(body?.studentId ?? "");
  const date = String(body?.date ?? "");
  const hoursRaw = body?.hours;

  const validation = isPastOrCurrentClassDate(date);
  if (!validation.ok) {
    const messages: Record<string, string> = {
      BEFORE_MIN_DATE: "No se pueden cargar asistencias de clases regulares previas al 01-09-2026. Las horas anteriores se configuran como horas previas en la ficha del alumno.",
      AFTER_MAX_DATE: "No podés cargar asistencia de una clase que supera el límite del calendario escolar habilitado.",
      NOT_CLASS_DAY: "Esa fecha no corresponde a un día de clase (martes, jueves o viernes).",
    };
    return NextResponse.json({ error: messages[validation.reason] ?? "Fecha de clase inválida." }, { status: 400 });
  }

  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== "ALUMNO") {
    return NextResponse.json({ error: "Alumno no encontrado." }, { status: 404 });
  }

  const cancelled = await prisma.cancelledClass.findUnique({ where: { date } });
  if (cancelled) {
    return NextResponse.json(
      { error: "Esa clase está anulada. Reactivala primero si querés acreditar horas." },
      { status: 400 }
    );
  }

  const hours = hoursRaw === undefined || hoursRaw === null || hoursRaw === "" ? validation.maxHours : Number(hoursRaw);
  if (!Number.isInteger(hours) || hours < 0 || hours > validation.maxHours) {
    return NextResponse.json(
      { error: `Las horas deben ser un entero entre 0 y ${validation.maxHours} para ese día.` },
      { status: 400 }
    );
  }

  const existing = await prisma.attendance.findUnique({
    where: { studentId_date: { studentId, date } },
  });

  const attendance = await prisma.attendance.upsert({
    where: { studentId_date: { studentId, date } },
    create: {
      studentId,
      date,
      dayOfWeek: validation.dayOfWeek,
      hours,
      source: "ADMIN",
      note: body?.note ?? null,
    },
    update: {
      hours,
      source: "ADMIN",
      note: body?.note ?? null,
    },
  });

  await logAudit({
    actorId: session!.user.id,
    action: existing ? "ATTENDANCE_ADMIN_UPDATE" : "ATTENDANCE_ADMIN_CREATE",
    targetId: studentId,
    details: `${validation.dayOfWeek} ${formatDateDMY(date)}: ${existing ? `${existing.hours}hs -> ` : ""}${hours}hs`,
  });

  return NextResponse.json({ attendance });
}

export async function DELETE(req: Request) {
  const { session, error } = await requireSession(["ADMIN", "PROFESOR"]);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const studentId = String(body?.studentId ?? "");
  const date = String(body?.date ?? "");

  if (session!.user.role === "PROFESOR") {
    const today = nowInSchoolTZ();
    const status = getAttendanceStatus();
    const isOpenNow = status.state === "OPEN" && status.date === date;
    const isFutureOrAdelantada =
      date > today.dateStr || (date === today.dateStr && status.state === "NOT_STARTED");
    if (!isOpenNow && !isFutureOrAdelantada) {
      return NextResponse.json(
        { error: "Los profesores solo pueden remover presentes en la clase activa o en clases adelantadas." },
        { status: 400 }
      );
    }
  }

  const existing = await prisma.attendance.findUnique({
    where: { studentId_date: { studentId, date } },
  });
  if (!existing) {
    return NextResponse.json({ error: "No existe esa asistencia." }, { status: 404 });
  }

  await prisma.attendance.delete({ where: { id: existing.id } });

  await logAudit({
    actorId: session!.user.id,
    action: "ATTENDANCE_ADMIN_DELETE",
    targetId: studentId,
    details: `${existing.dayOfWeek} ${formatDateDMY(existing.date)}: -${existing.hours}hs`,
  });

  return NextResponse.json({ ok: true });
}
