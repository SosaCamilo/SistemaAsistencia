import { NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { syncClassHolidays } from "@/lib/holidaysSync";

export async function POST(req: Request) {
  const { session, error } = await requireSession(["PROFESOR", "ADMIN"]);
  if (error) return error;

  const result = await syncClassHolidays(session!.user.id, { force: true });

  return NextResponse.json(result);
}
