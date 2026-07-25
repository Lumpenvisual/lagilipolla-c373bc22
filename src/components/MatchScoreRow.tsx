import { Lock, MapPin, Calendar } from "lucide-react";
import { TeamWithFlag } from "@/components/TeamWithFlag";
import { getFlagCode } from "@/utils/countryFlags";
import { Input } from "@/components/ui/input";
import { fmtFecha, teamNameByCode, type ExtraMatch, type Groups } from "@/lib/polla";

/**
 * Una fila de "equipo — marcador — equipo" para un partido de eliminatorias. Extraída de
 * `PlanillaEditor` (que la usa para semis/final igual que cualquier otra fase KO) para que
 * la planilla reducida de La Revancha reutilice exactamente el mismo control en vez de
 * duplicar el JSX.
 */
export function MatchScoreRow({
  match,
  groups,
  value,
  ghDisabled,
  gaDisabled,
  onChange,
  locked,
  lockLabel,
}: {
  match: ExtraMatch;
  groups: Groups;
  value: { gh: number | null; ga: number | null };
  ghDisabled: boolean;
  gaDisabled: boolean;
  onChange: (field: "gh" | "ga", raw: string) => void;
  locked?: boolean;
  lockLabel?: string;
}) {
  const lName = teamNameByCode(groups, match.local);
  const vName = teamNameByCode(groups, match.visitante);
  const [stadium, city] = match.sede.split(" · ");
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:max-w-[45%]">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="size-3" /> {fmtFecha(match.fecha)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3" />
          <span className="text-foreground/80">{stadium}</span>
          {city && <span className="text-muted-foreground">· {city}</span>}
        </span>
        {locked && lockLabel && (
          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
            <Lock className="size-3" /> {lockLabel}
          </span>
        )}
      </div>
      <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:shrink-0">
        <div className="flex min-w-0 flex-1 justify-center sm:w-[180px] sm:flex-none">
          <TeamWithFlag
            teamName={lName}
            flagCode={getFlagCode(lName)}
            size="sm"
            wrap
            className="min-w-0 justify-center text-center"
          />
        </div>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]"
          disabled={ghDisabled}
          value={value.gh ?? ""}
          onChange={(e) => onChange("gh", e.target.value)}
          className="h-9 w-14 shrink-0 text-center"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]"
          disabled={gaDisabled}
          value={value.ga ?? ""}
          onChange={(e) => onChange("ga", e.target.value)}
          className="h-9 w-14 shrink-0 text-center"
        />
        <div className="flex min-w-0 flex-1 justify-center sm:w-[180px] sm:flex-none">
          <TeamWithFlag
            teamName={vName}
            flagCode={getFlagCode(vName)}
            size="sm"
            wrap
            className="min-w-0 justify-center text-center"
          />
        </div>
      </div>
    </div>
  );
}
