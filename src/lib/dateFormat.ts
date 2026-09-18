/**
 * Utilidades centralizadas para formateo de fechas en el sistema.
 * El formato oficial y consistente para toda la aplicación es DD-MM-AAAA.
 */

/**
 * Formatea una fecha en formato DD-MM-AAAA.
 * Es inmune a desfases horarios para strings YYYY-MM-DD.
 *
 * Ejemplos:
 * - "2026-09-08" -> "08-09-2026"
 * - "2026-11-20" -> "20-11-2026"
 * - null / undefined / "" -> "—"
 */
export function formatDateDMY(date: string | Date | null | undefined): string {
  if (!date) return "—";

  if (typeof date === "string") {
    const trimmed = date.trim();
    if (!trimmed) return "—";

    // Si ya está en DD-MM-AAAA
    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    // Formato estándar ISO YYYY-MM-DD (ej: "2026-09-08" o "2026-09-08T...")
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (match) {
      const [, y, m, d] = match;
      return `${d}-${m}-${y}`;
    }

    // Fallback: objeto Date
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const d = String(parsed.getDate()).padStart(2, "0");
      const m = String(parsed.getMonth() + 1).padStart(2, "0");
      const y = parsed.getFullYear();
      return `${d}-${m}-${y}`;
    }

    return trimmed;
  }

  if (date instanceof Date && !isNaN(date.getTime())) {
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  }

  return "—";
}

/**
 * Formatea fecha y hora en formato DD-MM-AAAA HH:mm:ss o DD-MM-AAAA HH:mm.
 */
export function formatDateTimeDMY(
  date: string | Date | null | undefined,
  includeSeconds = true
): string {
  if (!date) return "—";

  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return typeof date === "string" ? date : "—";

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  if (includeSeconds) {
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  }
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

/**
 * Normaliza una entrada de fecha (ya sea en formato DD-MM-AAAA o YYYY-MM-DD)
 * al formato estándar de almacenamiento interno YYYY-MM-DD.
 * Retorna null si el formato es inválido o no reconocible.
 */
export function normalizeDateInput(d?: string | null): string | null {
  if (!d) return null;
  const trimmed = d.trim();
  if (!trimmed) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // DD-MM-AAAA o DD/MM/AAAA
  const match = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  return null;
}
