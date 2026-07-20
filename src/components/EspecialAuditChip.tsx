import { especialMatchMotivo, parseSpecial } from "@/lib/polla";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n";

const STYLES: Record<string, string> = {
  exacto: "border-success/40 bg-success/10 text-success",
  typo: "border-gold/40 bg-gold/10 text-gold",
  "parte-nombre": "border-gold/40 bg-gold/10 text-gold",
  ambiguo: "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  default: "border-border bg-muted/30 text-muted-foreground",
};

/**
 * Chip de auditoría para un especial (goleador/arquero): explica POR QUÉ un pick
 * acertó o no contra el oficial vigente — no solo el booleano. Fuente única de la
 * regla: `especialMatchMotivo` (src/lib/polla.ts); este componente solo la presenta.
 *
 * `null` si aún no hay oficial cargado para esa categoría (nada contra qué comparar
 * — no es "sin acierto", es "no evaluable todavía").
 *
 * Exportable a propósito: pensado para reusarse en el detalle de `/leaderboard`
 * (hoy usa `PtsBadge`, que solo dice "+10 pts" sin motivo) — no se cambió ese uso
 * todavía, ver docs/auditoria-puntuacion-2026-07-20.md.
 */
export function EspecialAuditChip({
  pick,
  oficial,
}: {
  pick: string | null | undefined;
  oficial: string | null | undefined;
}) {
  const t = useT();
  if (!oficial?.trim()) return null;

  const motivo = especialMatchMotivo(pick, oficial);
  const p = parseSpecial(pick ?? "");
  const o = parseSpecial(oficial);

  let emoji: string;
  let label: string;
  let styleKey = "default";
  let tooltip: string | null = null;

  switch (motivo.tipo) {
    case "exacto":
      emoji = "🟢";
      label = t("admin.t.esp.chip.exacto");
      styleKey = "exacto";
      break;
    case "typo":
      emoji = "🟡";
      label = t("admin.t.esp.chip.typo");
      styleKey = "typo";
      tooltip = t("admin.t.esp.chip.typoTip", {
        pick: p.nombre,
        oficial: o.nombre,
        distancia: motivo.distancia,
      });
      break;
    case "parte-nombre":
      emoji = "🟡";
      label = t("admin.t.esp.chip.apellido");
      styleKey = "parte-nombre";
      tooltip = t("admin.t.esp.chip.apellidoTip", { pick: (pick ?? "").trim() });
      break;
    case "sin-acierto":
      emoji = motivo.causa === "ambiguo" ? "🟠" : "⚪";
      label = "0";
      styleKey = motivo.causa === "ambiguo" ? "ambiguo" : "default";
      if (motivo.causa === "seleccion-distinta") {
        tooltip = t("admin.t.esp.chip.seleccionDistintaTip", {
          pick: p.seleccion,
          oficial: o.seleccion,
        });
      } else if (motivo.causa === "ambiguo") {
        tooltip = t("admin.t.esp.chip.ambiguoTip");
      }
      break;
  }

  const badge = (
    <Badge variant="outline" className={STYLES[styleKey]}>
      {emoji} {label}
    </Badge>
  );

  if (!tooltip) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** Prioridad de revisión de un motivo: más alto = más urgente que el admin lo mire. */
export function especialMotivoPrioridad(
  pick: string | null | undefined,
  oficial: string | null | undefined,
): number {
  if (!oficial?.trim()) return 0;
  const motivo = especialMatchMotivo(pick, oficial);
  if (motivo.tipo === "sin-acierto" && motivo.causa === "ambiguo") return 2;
  if (motivo.tipo === "typo" || motivo.tipo === "parte-nombre") return 1;
  return 0;
}
