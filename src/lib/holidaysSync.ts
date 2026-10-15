import { prisma } from "@/lib/prisma";
import { classDayForDateStr } from "@/lib/schedule";
import { fetchArgentineHolidays } from "@/lib/holidays";
import { formatDateDMY } from "@/lib/dateFormat";
import { logAudit } from "@/lib/audit";

export type SyncHolidaysResult = {
  ok: boolean;
  totalHolidaysFound: number;
  newlyCancelled: number;
  synced: string[];
  skipped?: boolean;
  reason?: string;
};

// Cooldown para evitar sincronizaciones innecesarias repetidas (30 minutos)
const SYNC_COOLDOWN_MS = 30 * 60 * 1000;
let lastSyncTimestamp = 0;
let activeSyncPromise: Promise<SyncHolidaysResult> | null = null;

/**
 * Sincroniza los feriados oficiales nacionales como clases anuladas en la base de datos.
 *
 * Cuenta con protección integral contra concurrencia:
 * 1. Mutex / deduplicación en memoria (Promise sharing): Si varias personas inician sesión
 *    al mismo tiempo, todas comparten la misma sincronización en curso en lugar de ejecutarse en paralelo.
 * 2. Cooldown de sincronización: Si ya se sincronizó hace menos de 30 minutos y no se fuerza,
 *    se omite de inmediato para no saturar la base de datos ni hacer llamadas de red repetidas.
 * 3. Operaciones idempotentes y manejo de P2002: Protege contra condiciones de carrera
 *    a nivel de base de datos SQLite (Unique constraint en fecha).
 */
export async function syncClassHolidays(
  actorId?: string | null,
  options?: { force?: boolean }
): Promise<SyncHolidaysResult> {
  const force = options?.force ?? false;
  const now = Date.now();

  // Si no es forzado y ya se sincronizó recientemente, omitimos
  if (!force && now - lastSyncTimestamp < SYNC_COOLDOWN_MS) {
    return {
      ok: true,
      totalHolidaysFound: 0,
      newlyCancelled: 0,
      synced: [],
      skipped: true,
      reason: "COOLDOWN",
    };
  }

  // Si ya hay una sincronización en curso, reutilizamos la misma promesa
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    try {
      const currentYear = 2026;
      const holidays = await fetchArgentineHolidays(currentYear);

      // Filtrar feriados a partir del 1 de septiembre de 2026 que caigan en día de clase (martes, jueves o viernes)
      const classHolidays = holidays.filter((h) => {
        if (h.date < "2026-09-01") return false;
        const classDay = classDayForDateStr(h.date);
        return classDay !== null;
      });

      let createdCount = 0;
      const synced: string[] = [];

      for (const h of classHolidays) {
        const classDay = classDayForDateStr(h.date)!;

        try {
          const existing = await prisma.cancelledClass.findUnique({
            where: { date: h.date },
          });

          if (!existing) {
            await prisma.cancelledClass.create({
              data: {
                date: h.date,
                dayOfWeek: classDay.dayOfWeek,
                reason: `Feriado: ${h.name}`,
                cancelledById: actorId ?? null,
              },
            });
            createdCount++;
            synced.push(`${formatDateDMY(h.date)} (${h.name})`);
          }
        } catch (err: any) {
          // Si otra solicitud concurrente ya insertó este feriado, ignoramos el error de unicidad
          if (err?.code === "P2002") {
            continue;
          }
          throw err;
        }
      }

      if (createdCount > 0) {
        await logAudit({
          actorId: actorId ?? null,
          action: "HOLIDAYS_SYNCED",
          details: `Sincronizados ${createdCount} feriados oficiales como clases anuladas: ${synced.join(", ")}`,
        });
      }

      lastSyncTimestamp = Date.now();

      return {
        ok: true,
        totalHolidaysFound: classHolidays.length,
        newlyCancelled: createdCount,
        synced,
      };
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}
