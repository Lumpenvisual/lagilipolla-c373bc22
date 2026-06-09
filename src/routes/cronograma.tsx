import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Calendar, MapPin, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTournamentState } from "@/hooks/usePolla";
import {
  isMatchLocked,
  FASE_LABEL,
  GROUP_KEYS,
  type ExtraMatch,
  type Fase,
} from "@/lib/polla";

export const Route = createFileRoute("/cronograma")({
  head: () => ({
    meta: [
      { title: "Cronograma · LA GILIPOLLA 2026" },
      {
        name: "description",
        content:
          "Cronograma de partidos del Mundial 2026 en hora Colombia (COT). Fechas, sedes y resultados.",
      },
      { property: "og:title", content: "Cronograma · LA GILIPOLLA 2026" },
      {
        property: "og:description",
        content: "Fechas, sedes y resultados del Mundial 2026 en hora Colombia.",
      },
      { property: "og:url", content: "https://lagilipolla.lovable.app/cronograma" },
    ],
    links: [{ rel: "canonical", href: "https://lagilipolla.lovable.app/cronograma" }],
  }),
  component: Cronograma,
});

type Row = ExtraMatch & {
  isGroupK: boolean;
  localId: string;
  visitanteId: string;
  badge: string;
};

/* ISO3 → flag emoji (covers the WC2026 fixture squads + common placeholders). */
const FLAG: Record<string, string> = {
  ARG: "🇦🇷", AUS: "🇦🇺", AUT: "🇦🇹", BEL: "🇧🇪", BRA: "🇧🇷", CAN: "🇨🇦",
  CHI: "🇨🇱", COD: "🇨🇩", COL: "🇨🇴", CRC: "🇨🇷", CRO: "🇭🇷", CUW: "🇨🇼",
  DEN: "🇩🇰", ECU: "🇪🇨", EGY: "🇪🇬", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", ESP: "🇪🇸", FRA: "🇫🇷",
  GER: "🇩🇪", GHA: "🇬🇭", HAI: "🇭🇹", IRN: "🇮🇷", ITA: "🇮🇹", JOR: "🇯🇴",
  JPN: "🇯🇵", KOR: "🇰🇷", KSA: "🇸🇦", MAR: "🇲🇦", MEX: "🇲🇽", NED: "🇳🇱",
  NGA: "🇳🇬", NOR: "🇳🇴", NZL: "🇳🇿", PAN: "🇵🇦", PAR: "🇵🇾", POL: "🇵🇱",
  POR: "🇵🇹", QAT: "🇶🇦", RSA: "🇿🇦", SEN: "🇸🇳", SRB: "🇷🇸", SUI: "🇨🇭",
  TUN: "🇹🇳", URU: "🇺🇾", USA: "🇺🇸", UZB: "🇺🇿", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", ALG: "🇩🇿",
  CMR: "🇨🇲", CIV: "🇨🇮", JAM: "🇯🇲", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", TUR: "🇹🇷", UAE: "🇦🇪",
  IRQ: "🇮🇶", BOL: "🇧🇴", NCL: "🇳🇨", SUR: "🇸🇷", LCA: "🇱🇨", DRC: "🇨🇩",
};
const flagFor = (id: string): string => FLAG[id?.toUpperCase?.()] ?? "🏳️";

const DAY_FMT = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  timeZone: "America/Bogota",
});
const TIME_FMT = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "America/Bogota",
});
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : DAY_FMT.format(d).toUpperCase().replace(".", "");
};
const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : TIME_FMT.format(d).toLowerCase();
};

const badgeFor = (fase: Fase, m: { id: string }): string => {
  if (fase === "grupos") {
    const k = GROUP_KEYS.find((g) => m.id.startsWith(`${g}-`) || m.id.startsWith(`g-${g}`));
    return k ? `GRUPO ${k}` : "GRUPOS";
  }
  return FASE_LABEL[fase].toUpperCase();
};

function Cronograma() {
  const { data: ts, isLoading } = useTournamentState();

  const rows = useMemo<Row[]>(() => {
    if (!ts) return [];
    const teamName = (id: string) =>
      ts.groups.K.teams.find((t) => t.id === id)?.nombre ?? id;
    const groupK: Row[] = ts.group_k_matches.map((m) => ({
      id: m.id,
      fase: "grupos" as Fase,
      fecha: m.fecha,
      local: teamName(m.local),
      visitante: teamName(m.visitante),
      sede: m.sede,
      gh: m.gh,
      ga: m.ga,
      isGroupK: true,
      localId: m.local,
      visitanteId: m.visitante,
      badge: badgeFor("grupos", m),
    }));
    const extra: Row[] = (ts.extra_matches ?? []).map((m) => ({
      ...m,
      isGroupK: false,
      localId: m.local,
      visitanteId: m.visitante,
      badge: badgeFor(m.fase, m),
    }));
    return [...groupK, ...extra].sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
    );
  }, [ts]);

  /* Group by day for the fixture-style layout. */
  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const k = dayKey(r.fecha);
      const list = map.get(k) ?? [];
      list.push(r);
      map.set(k, list);
    }
    return Array.from(map.entries());
  }, [rows]);

  if (isLoading || !ts) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
      <h1 className="mt-3 font-display text-3xl sm:text-4xl">📅 Cronograma y fechas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Todos los horarios en hora Colombia (COT). Los marcadores se bloquean 24h antes de cada
        partido.
      </p>

      <div className="mt-8 space-y-10">
        {byDay.map(([day, list]) => (
          <section key={day}>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border border-gold/40 bg-gold/10 text-gold">
                <Calendar className="size-5" />
              </div>
              <div>
                <h2 className="font-display text-xl sm:text-2xl tracking-wide">{day}</h2>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {list.length} {list.length === 1 ? "partido" : "partidos"}
                </p>
              </div>
              <div className="ml-2 h-px flex-1 bg-border" />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {list.map((m) => {
                const locked = isMatchLocked(m.fecha);
                const played = m.gh != null && m.ga != null;
                const [stadium] = (m.sede || "").split(" · ");
                return (
                  <Card
                    key={`${m.fase}-${m.id}`}
                    className="relative overflow-hidden border-border bg-card/60 p-0 card-shadow transition-colors hover:border-gold/40"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-gold/70 via-gold/30 to-transparent"
                    />
                    {/* Header: hora + badge fase */}
                    <div className="flex items-center justify-between px-4 pt-4">
                      <span className="rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-xs text-foreground/80">
                        {timeLabel(m.fecha)}
                      </span>
                      <span className="rounded-md border border-gold/40 bg-gold/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                        {m.badge}
                      </span>
                    </div>

                    {/* Equipos */}
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-5">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <span className="text-3xl leading-none" aria-hidden>
                          {flagFor(m.localId)}
                        </span>
                        <span className="font-display text-sm uppercase tracking-wide">
                          {m.local || "Por definir"}
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        {played ? (
                          <span className="rounded-md bg-gold/15 px-3 py-1 font-display text-base text-gold">
                            {m.gh} – {m.ga}
                          </span>
                        ) : (
                          <span className="font-display text-sm font-bold tracking-widest text-muted-foreground">
                            VS
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-2 text-center">
                        <span className="text-3xl leading-none" aria-hidden>
                          {flagFor(m.visitanteId)}
                        </span>
                        <span className="font-display text-sm uppercase tracking-wide">
                          {m.visitante || "Por definir"}
                        </span>
                      </div>
                    </div>

                    {/* Sede */}
                    <div className="flex items-center justify-center gap-1.5 border-t border-border/60 bg-background/40 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <MapPin className="size-3" />
                      <span>{stadium || "Sede por definir"}</span>
                      {locked && !played && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-medium text-destructive">
                          <Lock className="size-3" /> Bloqueado
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}