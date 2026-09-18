import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { logAudit } from "@/lib/audit";
import { formatDateDMY, normalizeDateInput } from "@/lib/dateFormat";
import { calculateInternshipHours } from "@/lib/hours";

export async function POST(
  req: Request,
  { params }: { params: { id: string; internshipId: string } }
) {
  const { session, error } = await requireSession();
  if (error) return error;

  const isStaff = session!.user.role === "PROFESOR" || session!.user.role === "ADMIN";
  if (!isStaff && session!.user.id !== params.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const internship = await prisma.internship.findUnique({
    where: { id: params.internshipId },
    include: { student: { select: { nombre: true, apellido: true } } },
  });

  if (!internship || internship.studentId !== params.id) {
    return NextResponse.json({ error: "Pasantía no encontrada." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const date = String(body?.date ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  const note = body?.note ? String(body.note).trim() : null;

  const normalizedDate = normalizeDateInput(date);
  if (!normalizedDate) {
    return NextResponse.json(
      { error: "La fecha debe tener formato DD-MM-AAAA o YYYY-MM-DD." },
      { status: 400 }
    );
  }

  if (!reason) {
    return NextResponse.json(
      { error: "El motivo de la inasistencia es obligatorio (ej. Feriado, Día de estudio)." },
      { status: 400 }
    );
  }

  if (normalizedDate < internship.startDate || (internship.endDate && normalizedDate > internship.endDate)) {
    return NextResponse.json(
      {
        error: `La fecha ${formatDateDMY(normalizedDate)} está fuera del período de la pasantía (${formatDateDMY(internship.startDate)} a ${internship.endDate ? formatDateDMY(internship.endDate) : "actualidad"}).`,
      },
      { status: 400 }
    );
  }

  // Verificar si ya existe una excepción para esa fecha en esta pasantía
  const existing = await prisma.internshipException.findUnique({
    where: {
      internshipId_date: {
        internshipId: params.internshipId,
        date: normalizedDate,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: `Ya existe una excepción registrada para el día ${formatDateDMY(normalizedDate)}.` },
      { status: 409 }
    );
  }

  const exception = await prisma.internshipException.create({
    data: {
      internshipId: params.internshipId,
      date: normalizedDate,
      reason,
      note,
    },
  });

  await logAudit({
    actorId: session!.user.id,
    action: "INTERNSHIP_EXCEPTION_CREATED",
    targetId: params.id,
    details: `${formatDateDMY(normalizedDate)} (${reason}) - Pasantía ${internship.company} de ${internship.student.apellido}, ${internship.student.nombre}`,
  });

  const updatedInternship = await prisma.internship.findUnique({
    where: { id: params.internshipId },
    include: {
      exceptions: { orderBy: { date: "desc" } },
      createdBy: {
        select: { id: true, nombre: true, apellido: true, role: true },
      },
    },
  });

  return NextResponse.json(
    {
      exception,
      internship: updatedInternship
        ? {
            ...updatedInternship,
            calculation: calculateInternshipHours(updatedInternship),
          }
        : null,
    },
    { status: 201 }
  );
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; internshipId: string } }
) {
  const { session, error } = await requireSession();
  if (error) return error;

  const isStaff = session!.user.role === "PROFESOR" || session!.user.role === "ADMIN";
  if (!isStaff && session!.user.id !== params.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const exceptionId = searchParams.get("exceptionId");

  if (!exceptionId) {
    return NextResponse.json(
      { error: "Falta el identificador de la excepción." },
      { status: 400 }
    );
  }

  const exception = await prisma.internshipException.findUnique({
    where: { id: exceptionId },
    include: {
      internship: {
        include: { student: { select: { nombre: true, apellido: true } } },
      },
    },
  });

  if (!exception || exception.internshipId !== params.internshipId || exception.internship.studentId !== params.id) {
    return NextResponse.json({ error: "Excepción no encontrada." }, { status: 404 });
  }

  await prisma.internshipException.delete({
    where: { id: exceptionId },
  });

  await logAudit({
    actorId: session!.user.id,
    action: "INTERNSHIP_EXCEPTION_DELETED",
    targetId: params.id,
    details: `${formatDateDMY(exception.date)} (${exception.reason}) - Pasantía ${exception.internship.company}`,
  });

  const updatedInternship = await prisma.internship.findUnique({
    where: { id: params.internshipId },
    include: {
      exceptions: { orderBy: { date: "desc" } },
      createdBy: {
        select: { id: true, nombre: true, apellido: true, role: true },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    internship: updatedInternship
      ? {
          ...updatedInternship,
          calculation: calculateInternshipHours(updatedInternship),
        }
      : null,
  });
}
