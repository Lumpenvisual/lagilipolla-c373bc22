import { isLocked } from "@/lib/format";

export type StatusKey = "exacto" | "ganador" | "fallido" | "bloqueado" | "guardado" | "pendiente";

export interface MatchLike {
  kickoff_time: string;
  goles_local: number | null;
  goles_visitante: number | null;
}
export interface PredLike {
  goles_local_pred: number | null;
  goles_visitante_pred: number | null;
  puntos_obtenidos?: number | null;
}

export interface StatusInfo {
  key: StatusKey;
  labelKey: string;
  emoji: string;
  className: string;
}

const STYLES: Record<StatusKey, { labelKey: string; emoji: string; className: string }> = {
  exacto: { labelKey: "status.exacto", emoji: "✅", className: "bg-primary/15 text-primary border-primary/40" },
  ganador: { labelKey: "status.ganador", emoji: "🟢", className: "bg-success/10 text-success border-success/30" },
  fallido: { labelKey: "status.fallido", emoji: "❌", className: "bg-destructive/15 text-destructive border-destructive/40" },
  bloqueado: { labelKey: "status.bloqueado", emoji: "🔒", className: "bg-muted text-muted-foreground border-border" },
  guardado: { labelKey: "status.guardado", emoji: "💾", className: "bg-info/15 text-info border-info/40" },
  pendiente: { labelKey: "status.pendiente", emoji: "⚪", className: "bg-transparent text-muted-foreground border-border" },
};

export function getMatchStatus(match: MatchLike, pred: PredLike | null, now = Date.now()): StatusInfo {
  const hasResult = match.goles_local != null && match.goles_visitante != null;
  const hasPred = !!pred && pred.goles_local_pred != null && pred.goles_visitante_pred != null;
  const locked = isLocked(match.kickoff_time, now);

  let key: StatusKey;
  if (hasResult && hasPred) {
    const pts = pred!.puntos_obtenidos ?? 0;
    key = pts === 3 ? "exacto" : pts === 1 ? "ganador" : "fallido";
  } else if (hasResult && !hasPred) {
    key = "fallido";
  } else if (locked) {
    key = "bloqueado";
  } else if (hasPred) {
    key = "guardado";
  } else {
    key = "pendiente";
  }

  return { key, ...STYLES[key] };
}
