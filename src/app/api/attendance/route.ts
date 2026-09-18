import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { getAttendanceStatus } from "@/lib/schedule";
import {
  getCancelledDates,
  calculateStudentBreakdown,
  calculateInternshipHours,
} from "@/lib/hours";
import { logAudit } from "@/lib/audit";
import { formatDateDMY } from "@/lib/dateFormat";

// El alumno registra su propia asistencia del dia. Solo funciona si la
// ventana de la clase de hoy esta abierta (ya comenzo y no termino) y
// si se provee el codigo correcto de 4 digitos generado por el profesor.
export async function POST(req: Request) {
  const { session, error } = await requireSession(["ALUMNO"]);
  if (error) return error;

  const status = getAttendanceStatus();
  if (status.state !== "OPEN") {
    return NextResponse.json(
      { error: "El registro de asistencia no esta disponible en este momento." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();

  if (!code) {
    return NextResponse.json(
      { error: "Debes ingresar el código de 4 dígitos provisto por el profesor." },
      { status: 400 }
    );
  }

  const classCodeRecord = await prisma.classCode.findUnique({
    where: { date: status.date },
  });

  if (!classCodeRecord) {
    return NextResponse.json(
      { error: "El profesor aún no ha generado el código de asistencia para la clase de hoy." },
      { status: 400 }
    );
  }

  if (classCodeRecord.code !== code) {
    return NextResponse.json(
      { error: "El código de 4 dígitos ingresado es incorrecto." },
      { status: 400 }
    );
  }

  // La clase pudo haber sido anulada (feriado, paro) mientras estaba en curso.
  const cancelled = await prisma.cancelledClass.findUnique({ where: { date: status.date } });
  if (cancelled) {
    return NextResponse.json(
      { error: "La clase de hoy fue anulada, no corresponde registrar asistencia." },
      { status: 400 }
    );
  }

  const existing = await prisma.attendance.findUnique({
    where: { studentId_date: { studentId: session!.user.id, date: status.date } },
  });
  if (existing) {
    return NextResponse.json({ error: "Ya registraste tu asistencia de hoy." }, { status: 409 });
  }

  const attendance = await prisma.attendance.create({
    data: {
      studentId: session!.user.id,
      date: status.date,
      dayOfWeek: status.dayOfWeek,
      hours: status.hours,
      source: "ALUMNO",
    },
  });

  await logAudit({
    actorId: session!.user.id,
    action: "ATTENDANCE_SELF_CREATE",
    targetId: session!.user.id,
    details: `${status.dayOfWeek} ${formatDateDMY(status.date)} (+${status.hours}hs)`,
  });

  return NextResponse.json({ attendance });
}

// Historial de asistencias propias (alumno) o de cualquier alumno (profesor/admin via query studentId).
export async function GET(req: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const queryStudentId = searchParams.get("studentId");

  let studentId = session!.user.id;
  if (queryStudentId && queryStudentId !== session!.user.id) {
    if (session!.user.role === "ALUMNO") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    studentId = queryStudentId;
  }

  const [userRecord, rows, cancelledDates, hourConcepts, internships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      select: { previousTeacherHours: true, previousTeacherHoursLocked: true },
    }),
    prisma.attendance.findMany({
      where: { studentId },
      orderBy: { date: "desc" },
    }),
    getCancelledDates(),
    prisma.hourConcept.findMany({
      where: { studentId },
      include: {
        createdBy: {
          select: { id: true, nombre: true, apellido: true, role: true },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.internship.findMany({
      where: { studentId },
      include: {
        exceptions: { orderBy: { date: "desc" } },
        createdBy: {
          select: { id: true, nombre: true, apellido: true, role: true },
        },
      },
      orderBy: { startDate: "desc" },
    }),
  ]);

  const previousTeacherHours = userRecord?.previousTeacherHours ?? 0;
  const previousTeacherHoursLocked = userRecord?.previousTeacherHoursLocked ?? false;

  const breakdown = calculateStudentBreakdown({
    attendances: rows,
    cancelledDates,
    previousTeacherHours,
    concepts: hourConcepts,
    internships,
  });

  const enrichedInternships = internships.map((i) => ({
    ...i,
    calculation: calculateInternshipHours(i),
  }));

  // Se marcan las que caen en una clase anulada: siguen listadas pero no
  // acreditan horas.
  const attendances = rows.map((a) => ({ ...a, cancelled: cancelledDates.has(a.date) }));

  return NextResponse.json({
    attendances,
    totalHours: breakdown.total,
    hourConcepts,
    internships: enrichedInternships,
    breakdown,
    previousTeacherHours,
    previousTeacherHoursLocked,
  });
}
