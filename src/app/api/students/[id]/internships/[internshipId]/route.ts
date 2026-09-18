import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { logAudit } from "@/lib/audit";
import { calculateInternshipHours } from "@/lib/hours";
import { normalizeDateInput } from "@/lib/dateFormat";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; internshipId: string } }
) {
  const { session, error } = await requireSession();
  if (error) return error;

  const internship = await prisma.internship.findUnique({
    where: { id: params.internshipId },
    include: { student: { select: { nombre: true, apellido: true } } },
  });

  if (!internship || internship.studentId !== params.id) {
    return NextResponse.json({ error: "Pasantía no encontrada." }, { status: 404 });
  }

  const isStaff = session!.user.role === "PROFESOR" || session!.user.role === "ADMIN";
  if (!isStaff) {
    if (session!.user.id !== params.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (internship.createdById && internship.createdById !== session!.user.id) {
      return NextResponse.json(
        { error: "No podés eliminar una pasantía registrada por el docente." },
        { status: 403 }
      );
    }
  }

  await prisma.internship.delete({
    where: { id: params.internshipId },
  });

  await logAudit({
    actorId: session!.user.id,
    action: "INTERNSHIP_DELETED",
    targetId: params.id,
    details: `Pasantía ${internship.company} de ${internship.student.apellido}, ${internship.student.nombre}`,
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(
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
    include: { exceptions: true },
  });

  if (!internship || internship.studentId !== params.id) {
    return NextResponse.json({ error: "Pasantía no encontrada." }, { status: 404 });
  }

  if (!isStaff && internship.createdById && internship.createdById !== session!.user.id) {
    return NextResponse.json(
      { error: "No podés modificar una pasantía creada por el docente." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const dataToUpdate: Record<string, any> = {};

  if (typeof body?.company === "string" && body.company.trim()) {
    dataToUpdate.company = body.company.trim();
  }

  if (body?.roleOrTask !== undefined) {
    dataToUpdate.roleOrTask = body.roleOrTask ? String(body.roleOrTask).trim() : null;
  }

  if (body?.startDate !== undefined) {
    const norm = normalizeDateInput(body.startDate);
    if (!norm) {
      return NextResponse.json({ error: "La fecha de inicio debe tener formato DD-MM-AAAA o YYYY-MM-DD." }, { status: 400 });
    }
    dataToUpdate.startDate = norm;
  }

  if (body?.endDate !== undefined) {
    if (body.endDate === null || body.endDate === "") {
      dataToUpdate.endDate = null;
    } else {
      const norm = normalizeDateInput(body.endDate);
      if (!norm) {
        return NextResponse.json({ error: "La fecha de fin debe tener formato DD-MM-AAAA o YYYY-MM-DD, o estar vacía." }, { status: 400 });
      }
      dataToUpdate.endDate = norm;
    }
  }

  const effectiveStart = dataToUpdate.startDate || internship.startDate;
  const effectiveEnd = dataToUpdate.endDate !== undefined ? dataToUpdate.endDate : internship.endDate;

  if (effectiveEnd && effectiveStart > effectiveEnd) {
    return NextResponse.json({ error: "La fecha de inicio no puede ser posterior a la fecha de fin." }, { status: 400 });
  }

  if (body?.weeklySchedule !== undefined) {
    let scheduleObj: Record<string, number> = {};
    if (typeof body.weeklySchedule === "string") {
      try {
        scheduleObj = JSON.parse(body.weeklySchedule);
      } catch {
        return NextResponse.json({ error: "El cronograma semanal no es válido." }, { status: 400 });
      }
    } else if (typeof body.weeklySchedule === "object" && body.weeklySchedule !== null) {
      scheduleObj = body.weeklySchedule;
    }

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
    dataToUpdate.weeklySchedule = JSON.stringify(cleanedSchedule);
  }

  if (typeof body?.active === "boolean") {
    dataToUpdate.active = body.active;
  }

  if (body?.note !== undefined) {
    dataToUpdate.note = body.note ? String(body.note).trim() : null;
  }

  const updated = await prisma.internship.update({
    where: { id: params.internshipId },
    data: dataToUpdate,
    include: {
      exceptions: { orderBy: { date: "desc" } },
      createdBy: {
        select: { id: true, nombre: true, apellido: true, role: true },
      },
    },
  });

  return NextResponse.json({
    internship: {
      ...updated,
      calculation: calculateInternshipHours(updated),
    },
  });
}
