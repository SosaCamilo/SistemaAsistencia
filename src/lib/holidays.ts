export type ArgentineHoliday = {
  date: string; // YYYY-MM-DD
  name: string;
  type: string;
};

const holidaysCache: Record<number, ArgentineHoliday[]> = {};

/** Días escolares sin clase y fechas no laborables específicas de CABA */
function getSchoolNonWorkingDays(year: number): ArgentineHoliday[] {
  const winterRecess: ArgentineHoliday[] = [];
  // Receso Invernal (20 de julio al 31 de julio)
  for (let d = 20; d <= 31; d++) {
    winterRecess.push({
      date: `${year}-07-${String(d).padStart(2, "0")}`,
      name: "Receso Invernal (Vacaciones de invierno)",
      type: "receso_invernal",
    });
  }

  return [
    ...winterRecess,
    {
      date: `${year}-09-11`,
      name: "Día del Maestro (Asueto escolar)",
      type: "asueto_escolar",
    },
    {
      date: `${year}-09-21`,
      name: "Día del Estudiante (Sin actividad escolar)",
      type: "asueto_escolar",
    },
    {
      date: `${year}-10-12`,
      name: "Día del Respeto a la Diversidad Cultural (Día de la Raza)",
      type: "trasladable",
    },
    {
      date: `${year}-11-20`,
      name: "Día de la Soberanía Nacional (20/11)",
      type: "inamovible",
    },
    {
      date: `${year}-11-23`,
      name: "Día de la Soberanía Nacional (Feriado trasladado)",
      type: "trasladable",
    },
    {
      date: `${year}-12-07`,
      name: "Día no laborable puente turístico",
      type: "puente",
    },
    {
      date: `${year}-12-08`,
      name: "Día de la Inmaculada Concepción de María",
      type: "inamovible",
    },
    {
      date: `${year}-12-25`,
      name: "Navidad",
      type: "inamovible",
    },
  ];
}

/**
 * Consulta los feriados nacionales oficiales de Argentina y días no laborables de la ciudad
 * para un año determinado. Utiliza api.argentinadatos.com con fallback y combinación con el calendario escolar.
 */
export async function fetchArgentineHolidays(year: number): Promise<ArgentineHoliday[]> {
  if (holidaysCache[year]) return holidaysCache[year];

  const mapByDate = new Map<string, ArgentineHoliday>();

  // 1. Calendario escolar y asuetos de la Ciudad
  for (const s of getSchoolNonWorkingDays(year)) {
    mapByDate.set(s.date, s);
  }

  // 2. Feriados oficiales de ArgentinaDatos
  try {
    const res = await fetch(`https://api.argentinadatos.com/v1/feriados/${year}`);
    if (res.ok) {
      const data = await res.json();
      for (const item of data) {
        if (!item.fecha) continue;
        let displayName = item.nombre;
        if (item.fecha.endsWith("-10-12")) {
          displayName = "Día del Respeto a la Diversidad Cultural (Día de la Raza)";
        } else if (item.fecha.endsWith("-11-20") || item.fecha.endsWith("-11-23")) {
          displayName = item.nombre.includes("20/11")
            ? item.nombre
            : `${item.nombre} (Soberanía Nacional)`;
        }

        const existing = mapByDate.get(item.fecha);
        mapByDate.set(item.fecha, {
          date: item.fecha,
          name: existing ? `${existing.name} / ${displayName}` : displayName,
          type: item.tipo || "feriado",
        });
      }
    }
  } catch (err) {
    console.error("[holidays] Error fetching from argentinadatos:", err);
  }

  // 3. Fallback estático adicional para 2026 en caso de no haber datos previos
  if (year === 2026 && mapByDate.size <= getSchoolNonWorkingDays(year).length) {
    const base2026: ArgentineHoliday[] = [
      { date: "2026-01-01", name: "Año nuevo", type: "inamovible" },
      { date: "2026-02-16", name: "Carnaval", type: "inamovible" },
      { date: "2026-02-17", name: "Carnaval", type: "inamovible" },
      { date: "2026-03-23", name: "Puente turístico no laborable", type: "puente" },
      { date: "2026-03-24", name: "Día Nacional de la Memoria por la Verdad y la Justicia", type: "inamovible" },
      { date: "2026-04-02", name: "Día del Veterano y de los Caídos en la Guerra de Malvinas", type: "inamovible" },
      { date: "2026-04-03", name: "Viernes Santo", type: "inamovible" },
      { date: "2026-05-01", name: "Día del Trabajador", type: "inamovible" },
      { date: "2026-05-25", name: "Día de la Revolución de Mayo", type: "inamovible" },
      { date: "2026-06-15", name: "Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes", type: "trasladable" },
      { date: "2026-06-20", name: "Paso a la Inmortalidad del Gral. Manuel Belgrano", type: "inamovible" },
      { date: "2026-07-09", name: "Día de la Independencia", type: "inamovible" },
      { date: "2026-07-10", name: "Puente turístico no laborable", type: "puente" },
      { date: "2026-08-17", name: "Paso a la Inmortalidad del Gral. José de San Martín", type: "trasladable" },
      { date: "2026-09-11", name: "Día del Maestro (Asueto escolar)", type: "asueto_escolar" },
      { date: "2026-09-21", name: "Día del Estudiante (Sin actividad escolar)", type: "asueto_escolar" },
      { date: "2026-10-12", name: "Día del Respeto a la Diversidad Cultural (Día de la Raza)", type: "trasladable" },
      { date: "2026-11-20", name: "Día de la Soberanía Nacional (20/11)", type: "inamovible" },
      { date: "2026-11-23", name: "Día de la Soberanía Nacional (Feriado trasladado)", type: "trasladable" },
      { date: "2026-12-07", name: "Día no laborable puente turístico", type: "puente" },
      { date: "2026-12-08", name: "Día de la Inmaculada Concepción de María", type: "inamovible" },
      { date: "2026-12-25", name: "Navidad", type: "inamovible" },
    ];
    for (const b of base2026) {
      if (!mapByDate.has(b.date)) {
        mapByDate.set(b.date, b);
      }
    }
  }

  const result = Array.from(mapByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  holidaysCache[year] = result;
  return result;
}

/**
 * Obtiene los feriados y días no laborables entre dos fechas (YYYY-MM-DD), inclusive.
 */
export async function getHolidaysBetween(startDate: string, endDate: string): Promise<ArgentineHoliday[]> {
  const startYear = parseInt(startDate.slice(0, 4), 10);
  const endYear = parseInt(endDate.slice(0, 4), 10);

  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    years.push(y);
  }

  const allHolidays: ArgentineHoliday[] = [];
  for (const y of years) {
    const list = await fetchArgentineHolidays(y);
    allHolidays.push(...list);
  }

  return allHolidays.filter((h) => h.date >= startDate && h.date <= endDate);
}
