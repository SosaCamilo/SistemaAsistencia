import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { logAudit } from "@/lib/audit";
import { HOUR_CONCEPT_CATEGORIES, HourConceptCategory } from "@/lib/hours";
import { normalizeDateInput } from "@/lib/dateFormat";

const VALID_CATEGORIES = new Set<string>(HOUR_CONCEPT_CATEGORIES.map((c) => c.value));

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const isStaff = session!.user.role === "PROFESOR" || session!.user.role === "ADMIN";
  if (!isStaff && session!.user.id !== params.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const concepts = await prisma.hourConcept.findMany({
    where: { studentId: params.id },
    include: {
      createdBy: {
        select: { id: true, nombre: true, apellido: true, role: true },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ concepts });
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
  const categoryRaw = String(body?.category ?? "OTRO").trim().toUpperCase();
  const category: HourConceptCategory = VALID_CATEGORIES.has(categoryRaw)
    ? (categoryRaw as HourConceptCategory)
    : "OTRO";

  const title = String(body?.title ?? "").trim();
  const institution = body?.institution ? String(body.institution).trim() : null;
  const hours = Number(body?.hours);
  const date = body?.date ? String(body.date).trim() : null;
  const note = body?.note ? String(body.note).trim() : null;

  if (!title) {
    return NextResponse.json({ error: "El título o concepto es obligatorio." }, { status: 400 });
  }

  if (!Number.isInteger(hours) || hours <= 0) {
    return NextResponse.json(
      { error: "La cantidad de horas debe ser un número entero mayor a 0." },
      { status: 400 }
    );
  }

  const normalizedDate = date ? normalizeDateInput(date) : null;
  if (date && !normalizedDate) {
    return NextResponse.json(
      { error: "La fecha debe tener formato DD-MM-AAAA o YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const concept = await prisma.hourConcept.create({
    data: {
      studentId: params.id,
      category,
      title,
      institution,
      hours,
      date: normalizedDate,
      note,
      createdById: session!.user.id,
    },
    include: {
      createdBy: {
        select: { id: true, nombre: true, apellido: true, role: true },
      },
    },
  });

  await logAudit({
    actorId: session!.user.id,
    action: "HOUR_CONCEPT_CREATED",
    targetId: params.id,
    details: `${category} "${title}" (+${hours}hs) para ${student.apellido}, ${student.nombre}`,
  });

  return NextResponse.json({ concept }, { status: 201 });
}
