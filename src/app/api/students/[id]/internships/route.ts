import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { logAudit } from "@/lib/audit";
import { calculateInternshipHours } from "@/lib/hours";
import { normalizeDateInput, formatDateDMY } from "@/lib/dateFormat";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const isStaff = session!.user.role === "PROFESOR" || session!.user.role === "ADMIN";
  if (!isStaff && session!.user.id !== params.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const internships = await prisma.internship.findMany({
    where: { studentId: params.id },
    include: {
      exceptions: { orderBy: { date: "desc" } },
      createdBy: {
        select: { id: true, nombre: true, apellido: true, role: true },
      },
    },
    orderBy: { startDate: "desc" },
  });

  const enriched = internships.map((i) => ({
    ...i,
    calculation: calculateInternshipHours(i),
  }));

  return NextResponse.json({ internships: enriched });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const isStaff = session!.user.role === "PROFESOR" || session!.user.role === "ADMIN";
  if (!isStaff && session!.user.id !== params.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const student = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, nombre: true, apellido: true },
  });

  if (!student || student.role !== "ALUMNO") {
    return NextResponse.json({ error: "Alumno no encontrado." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const company = String(body?.company ?? "").trim();
  const roleOrTask = body?.roleOrTask ? String(body.roleOrTask).trim() : null;
  const startDate = String(body?.startDate ?? "").trim();
  const rawEndDate = body?.endDate ? String(body.endDate).trim() : "";
  const endDate = rawEndDate.length > 0 ? rawEndDate : null;
  const note = body?.note ? String(body.note).trim() : null;
  const weeklyScheduleInput = body?.weeklySchedule;

  if (!company) {
    return NextResponse.json({ error: "La empresa u organismo es obligatorio." }, { status: 400 });
  }

  const normalizedStart = normalizeDateInput(startDate);
  if (!normalizedStart) {
    return NextResponse.json(
      { error: "La fecha de inicio debe tener formato DD-MM-AAAA o YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const normalizedEnd = endDate ? normalizeDateInput(endDate) : null;
  if (endDate && !normalizedEnd) {
    return NextResponse.json(
      { error: "La fecha de fin debe tener formato DD-MM-AAAA o YYYY-MM-DD." },
      { status: 400 }
    );
  }
  if (normalizedEnd && normalizedStart > normalizedEnd) {
    return NextResponse.json(
      { error: "La fecha de inicio no puede ser posterior a la fecha de fin." },
      { status: 400 }
    );
  }

  let scheduleObj: Record<string, number> = {};
  if (typeof weeklyScheduleInput === "string") {
    try {
      scheduleObj = JSON.parse(weeklyScheduleInput);
    } catch {
      return NextResponse.json({ error: "El cronograma semanal no es válido." }, { status: 400 });
    }
  } else if (typeof weeklyScheduleInput === "object" && weeklyScheduleInput !== null) {
    scheduleObj = weeklyScheduleInput;
  } else {
    return NextResponse.json(
      { error: "Debes configurar los días y horas semanales de la pasantía." },
      { status: 400 }
    );
  }

  // Validar que solo haya días de semana (1 a 5: Lunes a Viernes). No se permite sábado (6) ni domingo (0).
  const hasWeekend = Object.keys(scheduleObj).some((day) => {
    const dNum = Number(day);
    return (dNum === 0 || dNum === 6) && Number(scheduleObj[day]) > 0;
  });

  if (hasWeekend) {
    return NextResponse.json(
      { error: "Solo se permite cargar horas en días de semana (lunes a viernes). Los sábados y domingos no están permitidos." },
      { status: 400 }
    );
  }

  // Validar que haya al menos un día de semana con horas > 0
  const validDays = Object.entries(scheduleObj).filter(([day, h]) => {
    const dNum = Number(day);
    return Number.isInteger(dNum) && dNum >= 1 && dNum <= 5 && Number(h) > 0;
  });

  if (validDays.length === 0) {
    return NextResponse.json(
      { error: "Debes asignar horas a por lo menos un día de la semana (lunes a viernes)." },
      { status: 400 }
    );
  }

  const cleanedSchedule: Record<string, number> = {};
  for (const [day, h] of validDays) {
    cleanedSchedule[day] = Number(h);
  }

  const internship = await prisma.internship.create({
    data: {
      studentId: params.id,
      company,
      roleOrTask,
      startDate: normalizedStart,
      endDate: normalizedEnd,
      weeklySchedule: JSON.stringify(cleanedSchedule),
      note,
      createdById: session!.user.id,
    },
    include: {
      exceptions: true,
      createdBy: {
        select: { id: true, nombre: true, apellido: true, role: true },
      },
    },
  });

  await logAudit({
    actorId: session!.user.id,
    action: "INTERNSHIP_CREATED",
    targetId: params.id,
    details: `Pasantía ${company} (${formatDateDMY(startDate)} a ${endDate ? formatDateDMY(endDate) : "actualidad"}) para ${student.apellido}, ${student.nombre}`,
  });

  return NextResponse.json(
    {
      internship: {
        ...internship,
        calculation: calculateInternshipHours(internship),
      },
    },
    { status: 201 }
  );
}
