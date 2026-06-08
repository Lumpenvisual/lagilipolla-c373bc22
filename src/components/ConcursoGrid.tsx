import { Link } from "@tanstack/react-router";
import { Users, ListChecks, Clock, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCAD, formatET } from "@/lib/format";
import { useT, type TFunc } from "@/lib/i18n";
import {
  MODALIDAD_LABEL,
  MODALIDAD_ICON,
  ESTADO_META,
  PAGO_META,
  type ConcursoOverview,
} from "@/lib/concursos";

/** Reusable contest card — used in the lobby and modality landings. */
export function ConcursoCard({
  c,
  pago,
  index = 0,
  showModalidad = true,
  t,
}: {
  c: ConcursoOverview;
  pago?: string;
  index?: number;
  showModalidad?: boolean;
  t: TFunc;
}) {
  const Icon = MODALIDAD_ICON[c.modalidad];
  const estadoMeta = ESTADO_META[c.estado];
  const pozo = c.cuota * c.jugadores;
  const pagoMeta = pago ? PAGO_META[pago as keyof typeof PAGO_META] : null;

  return (
    <Link
      to="/concursos/$id"
      params={{ id: c.id }}
      className="animate-fade-up group block"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <Card className="glass-card flex h-full flex-col p-5 transition-transform duration-200 group-hover:-translate-y-1 group-hover:border-primary/40">
        <div className="flex items-start justify-between gap-2">
          {showModalidad ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground">
              <Icon className="size-3.5" /> {t(MODALIDAD_LABEL[c.modalidad])}
            </span>
          ) : (
            <span />
          )}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${estadoMeta.cls}`}
          >
            <span className={`size-1.5 rounded-full ${estadoMeta.dot}`} /> {t(estadoMeta.labelKey)}
          </span>
        </div>

        <h3 className="mt-3 font-display text-xl leading-tight tracking-wide">{c.nombre}</h3>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border bg-muted/30 p-2.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("common.pozo")}</p>
            <p className="font-display text-lg text-gold">{formatCAD(pozo)}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-2.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("common.cuota")}</p>
            <p className="font-display text-lg text-foreground">{formatCAD(c.cuota)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" /> {c.jugadores}{" "}
            {t(c.jugadores === 1 ? "common.player_one" : "common.player_other")}
          </span>
          <span className="inline-flex items-center gap-1">
            <ListChecks className="size-3.5" /> {c.partidos}{" "}
            {t(c.partidos === 1 ? "common.match_one" : "common.match_other")}
          </span>
          {c.deadline && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {formatET(c.deadline)}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          {pagoMeta ? (
            <span className={`rounded-full border px-2 py-0.5 text-xs ${pagoMeta.cls}`}>
              {pagoMeta.emoji} {t(pagoMeta.labelKey)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{t("concursos.notEnrolled")}</span>
          )}
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            {t("common.see")} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Card>
    </Link>
  );
}

/** Grid of contest cards with payment status overlay. */
export function ConcursoGrid({
  concursos,
  inscMap,
  showModalidad = true,
}: {
  concursos: ConcursoOverview[];
  inscMap?: Map<string, string>;
  showModalidad?: boolean;
}) {
  const t = useT();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {concursos.map((c, i) => (
        <ConcursoCard
          key={c.id}
          c={c}
          pago={inscMap?.get(c.id)}
          index={i}
          showModalidad={showModalidad}
          t={t}
        />
      ))}
    </div>
  );
}
