export const POLLA = {
  titulo: "LA GILIPOLLA 2026",
  sede: "Bar El Guanábano",
  cuotaCOP: 100_000,
  deadline: new Date("2026-06-11T10:00:00-05:00"),
  mundialStart: new Date("2026-06-11T11:00:00-05:00"),
  mundialEnd: new Date("2026-07-19T20:00:00-05:00"),
} as const;

export const fmtCOP = (n: number): string => "$" + (n ?? 0).toLocaleString("es-CO");

export const GROUP_KEYS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const;
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

export type TournamentState = {
  id: number;
  groups: Groups;
  group_k_matches: GroupMatch[];
  goleadores: SpecialPlayer[];
  arqueros: SpecialPlayer[];
  goleador_id: string | null;
  arquero_id: string | null;
  deadline: string;
  cuota_cop: number;
  updated_at: string;
};

export type PickGroups = Partial<Record<GroupKey, { pos1: string | null; pos2: string | null }>>;
export type PickMatches = Record<string, { gh: number | null; ga: number | null }>;

export type PickRow = {
  participant_id: string;
  groups: PickGroups;
  group_k_matches: PickMatches;
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