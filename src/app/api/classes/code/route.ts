import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { nowInSchoolTZ, classDayForDateStr } from "@/lib/schedule";
import { logAudit } from "@/lib/audit";
import { formatDateDMY } from "@/lib/dateFormat";

export async function GET(req: Request) {
  const { session, error } = await requireSession(["PROFESOR", "ADMIN"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || nowInSchoolTZ().dateStr;

  const classDay = classDayForDateStr(date);
  const cancelled = await prisma.cancelledClass.findUnique({ where: { date } });
  const classCode = await prisma.classCode.findUnique({
    where: { date },
  });

  return NextResponse.json({
    date,
    code: classCode ? classCode.code : null,
    isClassDay: !!classDay,
    isCancelled: !!cancelled,
  });
}

export async function POST(req: Request) {
  const { session, error } = await requireSession(["PROFESOR", "ADMIN"]);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const date = String(body?.date ?? nowInSchoolTZ().dateStr);

  const classDay = classDayForDateStr(date);
  if (!classDay) {
    return NextResponse.json(
      { error: "Esa fecha no corresponde a un día de clase (martes, jueves o viernes)." },
      { status: 400 }
    );
  }

  const cancelled = await prisma.cancelledClass.findUnique({ where: { date } });
  if (cancelled) {
    return NextResponse.json(
      { error: "La clase está anulada. Reactivala primero si querés generar el código de asistencia." },
      { status: 400 }
    );
  }

  // Generar un código de 4 dígitos si no se provee uno válido
  let code = String(body?.code ?? "").trim();
  if (!/^\d{4}$/.test(code)) {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  }

  const classCode = await prisma.classCode.upsert({
    where: { date },
    create: {
      date,
      code,
      createdById: session!.user.id,
    },
    update: {
      code,
      createdById: session!.user.id,
    },
  });

  await logAudit({
    actorId: session!.user.id,
    action: "CLASS_CODE_GENERATED",
    details: `Fecha: ${formatDateDMY(date)}, Código: ${code}`,
  });

  return NextResponse.json({
    date: classCode.date,
    code: classCode.code,
    isClassDay: true,
    isCancelled: false,
  });
}
