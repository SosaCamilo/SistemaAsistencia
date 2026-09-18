import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { classDayForDateStr } from "@/lib/schedule";
import { logAudit } from "@/lib/audit";
import { formatDateDMY } from "@/lib/dateFormat";

// Listado de clases anuladas. Lo consultan todos los roles: el alumno lo
// necesita para saber por qué no puede registrar asistencia.
export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const cancelled = await prisma.cancelledClass.findMany({
    orderBy: { date: "desc" },
    select: { id: true, date: true, dayOfWeek: true, reason: true, createdAt: true },
  });

  return NextResponse.json({ cancelled });
}

// Anula una clase (feriado, paro, suspensión). Admite fechas pasadas y
// futuras: lo único que se valida es que sea un día de clase real.
export async function POST(req: Request) {
  const { session, error } = await requireSession(["PROFESOR", "ADMIN"]);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const date = String(body?.date ?? "");
  const reasonRaw = String(body?.reason ?? "").trim();
  const reason = reasonRaw.length > 0 ? reasonRaw.slice(0, 200) : null;

  const classDay = classDayForDateStr(date);
  if (!classDay) {
    return NextResponse.json(
      { error: "Esa fecha no corresponde a un día de clase (martes, jueves o viernes)." },
      { status: 400 }
    );
  }

  const existing = await prisma.cancelledClass.findUnique({ where: { date } });
  if (existing) {
    return NextResponse.json({ error: "Esa clase ya está anulada." }, { status: 409 });
  }

  const cancelledClass = await prisma.cancelledClass.create({
    data: {
      date,
      dayOfWeek: classDay.dayOfWeek,
      reason,
      cancelledById: session!.user.id,
    },
  });

  // Cuántas asistencias quedan sin acreditar por esta anulación (no se
  // borran: si la clase se reactiva, vuelven a contar).
  const affected = await prisma.attendance.count({ where: { date } });

  await logAudit({
    actorId: session!.user.id,
    action: "CLASS_CANCELLED",
    details: `${classDay.dayOfWeek} ${formatDateDMY(date)}${reason ? ` - ${reason}` : ""} (${affected} asistencias afectadas)`,
  });

  return NextResponse.json({ cancelledClass, affected });
}

// Reactiva una clase previamente anulada: las asistencias de esa fecha
// vuelven a acreditar horas.
export async function DELETE(req: Request) {
  const { session, error } = await requireSession(["PROFESOR", "ADMIN"]);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const date = String(body?.date ?? "");

  const existing = await prisma.cancelledClass.findUnique({ where: { date } });
  if (!existing) {
    return NextResponse.json({ error: "Esa clase no está anulada." }, { status: 404 });
  }

  await prisma.cancelledClass.delete({ where: { id: existing.id } });

  await logAudit({
    actorId: session!.user.id,
    action: "CLASS_REACTIVATED",
    details: `${existing.dayOfWeek} ${formatDateDMY(existing.date)}`,
  });

  return NextResponse.json({ ok: true });
}
