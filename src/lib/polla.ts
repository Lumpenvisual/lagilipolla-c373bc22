export const POLLA = {
  titulo: "LA GILIPOLLA 2026",
  sede: "Bar El Guanábano",
  cuotaCOP: 100_000,
  deadline: new Date("2026-06-11T10:00:00-05:00"),
  mundialStart: new Date("2026-06-11T11:00:00-05:00"),
  mundialEnd: new Date("2026-07-19T20:00:00-05:00"),
} as const;

export const fmtCOP = (n: number): string => "$" + (n ?? 0).toLocaleString("es-CO");

export const GROUP_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export type TeamCandidate = { id: string; n: string };
export type Team = {
  id: string;
  nombre: string;
  po?: string; // "UEFA-A"…"FIFA-2" when team is a play-off winner
  candidatos?: TeamCandidate[];
};
export type Group = { teams: Team[]; pos1: string | null; pos2: string | null };
export type Groups = Record<GroupKey, Group>;

export type GroupMatch = {
  id: string;
  fecha: string;
  local: string;
  visitante: string;
  sede: string;
  gh: number | null;
  ga: number | null;
};

export type SpecialPlayer = { id: string; nombre: string; seleccion: string };

/* ---- Especiales (goleador/arquero) como texto libre ----
 * El participante escribe nombre + selección; se persisten compuestos en el
 * mismo campo de texto (picks.goleador_id / arquero_id) como "Nombre (Selección)",
 * así el cálculo de puntos en SQL (igualdad de texto con el oficial) no cambia. */

export function composeSpecial(nombre: string, seleccion: string): string | null {
  const n = nombre.trim();
  const s = seleccion.trim();
  if (!n) return null;
  return s ? `${n} (${s})` : n;
}

export function parseSpecial(text: string | null | undefined): {
  nombre: string;
  seleccion: string;
} {
  if (!text) return { nombre: "", seleccion: "" };
  const m = text.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (m) return { nombre: m[1].trim(), seleccion: m[2].trim() };
  return { nombre: text.trim(), seleccion: "" };
}

export type Fase =
  | "grupos"
  | "dieciseisavos"
  | "octavos"
  | "cuartos"
  | "semis"
  | "tercero"
  | "final";

export type ExtraMatch = {
  id: string;
  fase: Fase;
  fecha: string;
  local: string;
  visitante: string;
  sede: string;
  gh: number | null;
  ga: number | null;
};

export type Phases = Record<Exclude<Fase, "grupos" | "tercero">, boolean> & {
  grupos: boolean;
  tercero?: boolean;
};

export type VisibilityKey = Fase | "goleador" | "arquero" | "historico";
/** Flags de visibilidad por fase/bloque. Ausente = visible. */
export type Visibility = Partial<Record<VisibilityKey, boolean>>;

/** Visible salvo apagado explícito. Tolera "false"/"true" string de registros jsonb antiguos. */
export function isSectionVisible(v: Visibility | undefined, key: VisibilityKey): boolean {
  const val = v?.[key] as boolean | string | undefined;
  return val !== false && val !== "false";
}

export type TournamentState = {
  id: number;
  groups: Groups;
  group_k_matches: GroupMatch[];
  extra_matches?: ExtraMatch[];
  phases?: Phases;
  visibility?: Visibility;
  goleadores: SpecialPlayer[];
  arqueros: SpecialPlayer[];
  goleador_id: string | null;
  arquero_id: string | null;
  deadline: string;
  cuota_cop: number;
  updated_at: string;
  picks_locked_at?: string | null;
};

export const FASE_LABEL: Record<Fase, string> = {
  grupos: "Fase de grupos",
  dieciseisavos: "Dieciseisavos de final",
  octavos: "Octavos de final",
  cuartos: "Cuartos de final",
  semis: "Semifinales",
  tercero: "Tercer puesto",
  final: "Final",
};

export type PickGroups = Partial<Record<GroupKey, { pos1: string | null; pos2: string | null }>>;
export type PickMatches = Record<string, { gh: number | null; ga: number | null }>;

export type PickRow = {
  participant_id: string;
  groups: PickGroups;
  group_k_matches: PickMatches;
  extra_matches?: PickMatches;
  goleador_id: string | null;
  arquero_id: string | null;
  puntos_grupos: number;
  puntos_partidos: number;
  puntos_especiales: number;
  puntos_total: number;
};

/** Find the display label of a "team slot" given the user's chosen candidate (if any). */
export function slotLabel(team: Team, chosenId: string | null | undefined): string {
  if (!team.po) return team.nombre;
  if (!chosenId || chosenId === team.id) return team.nombre;
  const cand = team.candidatos?.find((c) => c.id === chosenId);
  return cand ? cand.n : team.nombre;
}

/** All selectable ids for a team slot (the team itself + its candidates if PO). */
export function slotOptions(team: Team): { id: string; label: string; isCandidate: boolean }[] {
  const base = [{ id: team.id, label: team.nombre, isCandidate: false }];
  if (!team.po || !team.candidatos) return base;
  return [...base, ...team.candidatos.map((c) => ({ id: c.id, label: c.n, isCandidate: true }))];
}

/**
 * Nombre completo de un equipo a partir de su código (ISO3), buscándolo en TODOS los grupos.
 * Si el valor no es un código conocido (p.ej. un placeholder "Ganador Partido 74"), lo devuelve
 * tal cual. Las eliminatorias guardan códigos en `extra_matches.local/visitante`; esto los
 * resuelve a nombre para mostrar (mismo criterio que el Grupo K).
 */
export function teamNameByCode(groups: Groups, codeOrLabel: string | null | undefined): string {
  if (codeOrLabel == null || codeOrLabel === "") return "";
  for (const g of Object.values(groups)) {
    const t = g.teams.find((tm) => tm.id === codeOrLabel);
    if (t) return t.nombre;
  }
  return codeOrLabel;
}

export const FECHA_FMT = new Intl.DateTimeFormat("es-CO", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

export function fmtFecha(iso: string): string {
  return FECHA_FMT.format(new Date(iso)) + " COT";
}

/**
 * Reglamento: en 1ª ronda solo se predicen marcadores del Grupo de Colombia (K).
 * `group_k_matches` trae el fixture completo de la fase de grupos, así que se filtra
 * a los partidos cuyos dos equipos pertenecen al Grupo K. Fuente única usada por la
 * planilla y por los reportes (PDF/Excel) para no divergir.
 */
export function groupKMatches(ts: TournamentState): GroupMatch[] {
  const ids = new Set((ts.groups.K?.teams ?? []).map((t) => t.id));
  return ts.group_k_matches.filter((m) => ids.has(m.local) && ids.has(m.visitante));
}

/** Un partido queda bloqueado para edición de marcadores cuando faltan ≤ 24h para empezar. */
export function isMatchLocked(iso: string, nowMs: number = Date.now()): boolean {
  const start = new Date(iso).getTime();
  return start - nowMs <= 24 * 60 * 60 * 1000;
}

/** Antelación con que se cierra una ronda de eliminatorias: 1 h antes de su primer partido. */
export const KNOCKOUT_LOCK_BEFORE_MS = 60 * 60 * 1000;

/**
 * Reglamento eliminatorias: la RONDA completa se cierra 1 h antes de su primer partido
 * (no candado por-partido). Espejo TS de `is_extra_phase_locked` en SQL. Si la fase no
 * tiene ninguna fecha válida (aún sin programar), no bloquea.
 */
export function isExtraPhaseLocked(
  extra: ExtraMatch[],
  fase: Fase,
  nowMs: number = Date.now(),
): boolean {
  const times = extra
    .filter((m) => m.fase === fase)
    .map((m) => new Date(m.fecha).getTime())
    .filter((tms) => !Number.isNaN(tms));
  if (times.length === 0) return false;
  return nowMs >= Math.min(...times) - KNOCKOUT_LOCK_BEFORE_MS;
}

/**
 * Privacidad: una ronda KO se REVELA en la tabla pública recién cuando INICIA su primer
 * partido (`now >= MIN(fecha de la fase)`). Si la fase no tiene fechas válidas, no se
 * revela. Espejo de la redacción server-side en `get_public_pick`.
 */
export function isExtraPhaseRevealed(
  extra: ExtraMatch[],
  fase: Fase,
  nowMs: number = Date.now(),
): boolean {
  const times = extra
    .filter((m) => m.fase === fase)
    .map((m) => new Date(m.fecha).getTime())
    .filter((tms) => !Number.isNaN(tms));
  if (times.length === 0) return false;
  return nowMs >= Math.min(...times);
}

/** Ítems del checklist de cierre del campeonato (ver `tournamentCompletion`). */
export type CompletionItem = {
  key: "grupos" | "grupoK" | Exclude<Fase, "grupos"> | "goleador" | "arquero";
  label: string;
  done: boolean;
  /** Cuántos faltan (partidos sin resultado / grupos sin 1º-2º); 0 si done. */
  pending: number;
};

/**
 * Checklist del cierre del campeonato: el podio de LA GILIPOLLA se publica en la
 * pantalla de inicio SOLO cuando TODOS los datos oficiales están ingresados —
 * 1º/2º de los 12 grupos, marcadores del Grupo K, las 32 llaves de eliminatorias
 * (incluida la final) y los especiales (goleador y arquero oficiales).
 * Devuelve el detalle por ítem para el banner del admin (`done` + faltantes).
 */
export function tournamentCompletion(ts: TournamentState): {
  done: boolean;
  items: CompletionItem[];
} {
  const items: CompletionItem[] = [];

  const gruposPend = GROUP_KEYS.filter((k) => !ts.groups[k]?.pos1 || !ts.groups[k]?.pos2).length;
  items.push({
    key: "grupos",
    label: "1º y 2º oficiales de los 12 grupos",
    done: gruposPend === 0,
    pending: gruposPend,
  });

  const kMatches = groupKMatches(ts);
  const kPend = kMatches.filter((m) => m.gh == null || m.ga == null).length;
  items.push({
    key: "grupoK",
    label: "Marcadores del Grupo K",
    done: kMatches.length > 0 && kPend === 0,
    pending: kMatches.length === 0 ? 1 : kPend,
  });

  const extra = ts.extra_matches ?? [];
  const koFases: Exclude<Fase, "grupos">[] = [
    "dieciseisavos",
    "octavos",
    "cuartos",
    "semis",
    "tercero",
    "final",
  ];
  for (const fase of koFases) {
    const list = extra.filter((m) => m.fase === fase);
    const pend = list.filter((m) => m.gh == null || m.ga == null).length;
    items.push({
      key: fase,
      label: `Resultados · ${FASE_LABEL[fase]}`,
      done: list.length > 0 && pend === 0,
      pending: list.length === 0 ? 1 : pend,
    });
  }

  items.push({
    key: "goleador",
    label: "Goleador oficial",
    done: !!ts.goleador_id?.trim(),
    pending: ts.goleador_id?.trim() ? 0 : 1,
  });
  items.push({
    key: "arquero",
    label: "Arquero oficial",
    done: !!ts.arquero_id?.trim(),
    pending: ts.arquero_id?.trim() ? 0 : 1,
  });

  return { done: items.every((i) => i.done), items };
}

/**
 * El campeonato está COMPLETO cuando TODOS los datos oficiales están ingresados
 * (ver `tournamentCompletion`). Gate del podio final en la pantalla de inicio.
 */
export function isTournamentComplete(ts: TournamentState): boolean {
  return tournamentCompletion(ts).done;
}

/* ---- Validación de marcadores (reglamento: un solo dígito, 0–9) ----
 * Se usa tanto en la planilla del usuario como en los resultados del admin,
 * y se refleja en el servidor (trigger picks_validate + guard recalc_all_picks). */
export const MAX_GOLES = 9;

/** Un marcador válido es un entero entre 0 y 9 (un dígito). */
export function isValidGol(n: number | null | undefined): boolean {
  return n != null && Number.isInteger(n) && n >= 0 && n <= MAX_GOLES;
}

/**
 * Marcador de un solo dígito a partir de lo que se escribe en el input.
 * Toma el ÚLTIMO dígito tecleado, así cada tecla reemplaza al dígito anterior
 * (sin ceros a la izquierda ni concatenar: "0"+"5" → 5, "5"+"3" → 3). "" → null.
 */
export function lastGol(v: string): number | null {
  const digits = v.replace(/[^0-9]/g, "");
  if (digits === "") return null;
  return Number(digits[digits.length - 1]);
}

export type ScoreState = "vacio" | "completo" | "invalido";

/**
 * Estado de un marcador (gh/ga):
 *  - "vacio": ambos null (partido sin pronosticar / sin jugar) → permitido.
 *  - "completo": ambos enteros 0–9 → permitido.
 *  - "invalido": parcial (uno lleno y el otro no) o fuera de rango → se bloquea.
 */
export function scoreState(
  p: { gh: number | null; ga: number | null } | null | undefined,
): ScoreState {
  if (!p || (p.gh == null && p.ga == null)) return "vacio";
  return isValidGol(p.gh) && isValidGol(p.ga) ? "completo" : "invalido";
}

/** Un grupo tiene 1º y 2º repetidos (ambos elegidos e iguales). */
export function groupHasDup(
  sel: { pos1: string | null; pos2: string | null } | null | undefined,
): boolean {
  return !!(sel && sel.pos1 && sel.pos2 && sel.pos1 === sel.pos2);
}

/* ---- Puntuación (espejos TS de calc_pick_points en SQL) ----
 * La fuente de verdad de los puntos es SQL; estos espejos se usan solo para
 * MOSTRAR el puntaje (leaderboard, exports). Mantener sincronizados. */

/** Puntos de un grupo (1º/2º) según el reglamento: 5 exacto / 3 invertido / 1 uno acertado. */
export function groupPts(
  o1: string | null,
  o2: string | null,
  p1: string | null | undefined,
  p2: string | null | undefined,
): number {
  if (!o1 || !o2 || !p1 || !p2) return 0;
  if (p1 === o1 && p2 === o2) return 5;
  if (p1 === o2 && p2 === o1) return 3;
  if ([p1, p2].some((x) => x === o1 || x === o2)) return 1;
  return 0;
}

/** Puntos de un marcador según el reglamento: 5 exacto / 3 ganador+goles de un equipo / 2 ganador / 1 empate o goles de un equipo. */
export function matchPts(
  oh: number | null,
  oa: number | null,
  ph: number | null | undefined,
  pa: number | null | undefined,
): number {
  if (oh == null || oa == null || ph == null || pa == null) return 0;
  const so = Math.sign(oh - oa);
  const sp = Math.sign(ph - pa);
  if (ph === oh && pa === oa) return 5;
  if (so !== 0 && sp === so) return ph === oh || pa === oa ? 3 : 2;
  if (so === 0 && sp === 0) return 1;
  if (ph === oh || pa === oa) return 1;
  return 0;
}

/**
 * Normaliza el texto de un especial (goleador/arquero) para compararlo:
 * minúsculas, sin acentos, espacios colapsados. Espejo de norm_especial en SQL.
 */
export function normEspecial(t: string | null | undefined): string | null {
  if (t == null) return null;
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\u0300-\u036f]", "g"), "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const PAIS_ALIAS: Record<string, string> = { holanda: "paises bajos" };

/**
 * \u00bfEl especial de un pick acierta contra el oficial? Espejo de especial_matches en SQL
 * (migraci\u00f3n 20260720010000): compara POR PARTES (nombre + selecci\u00f3n, v\u00eda parseSpecial):
 *  a) nombre completo igual (normalizado);
 *  b) typo peque\u00f1o en el nombre (levenshtein \u2264 2) con la selecci\u00f3n coincidiendo;
 *  c) apellido solo / parte del nombre (palabras de un lado contenidas en el otro), con
 *     selecci\u00f3n presente en AMBOS lados y coincidente (sin selecci\u00f3n = ambiguo, no punt\u00faa).
 * Quien no coincide con el oficial tiene 0.
 * Alias "Holanda" \u2261 "Pa\u00edses Bajos"; typo de selecci\u00f3n tolerado (levenshtein \u2264 1).
 * Selecciones contradictorias \u2192 nunca acierta.
 */
export function especialMatches(
  pick: string | null | undefined,
  oficial: string | null | undefined,
): boolean {
  if (!pick?.trim() || !oficial?.trim()) return false;
  const p = parseSpecial(pick);
  const o = parseSpecial(oficial);
  const pn = normEspecial(p.nombre) ?? "";
  const onm = normEspecial(o.nombre) ?? "";
  let ps = normEspecial(p.seleccion) ?? "";
  let os = normEspecial(o.seleccion) ?? "";
  if (!pn || !onm) return false;
  ps = PAIS_ALIAS[ps] ?? ps;
  os = PAIS_ALIAS[os] ?? os;

  const selBoth = ps !== "" && os !== "";
  const selOk = selBoth && (ps === os || levenshtein(ps, os) <= 1);
  if (selBoth && !selOk) return false;

  if (pn === onm) return true;
  if (selOk && levenshtein(pn, onm) <= 2) return true;

  const pw = pn.split(" ");
  const ow = onm.split(" ");
  if (selOk && (pw.every((w) => ow.includes(w)) || ow.every((w) => pw.includes(w)))) {
    return true;
  }
  return false;
}
