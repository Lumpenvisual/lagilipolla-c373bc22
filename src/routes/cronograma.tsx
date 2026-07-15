import { useMemo, useState, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Calendar, MapPin, Lock, ChevronDown, Search, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTournamentState } from "@/hooks/usePolla";
import {
  isMatchLocked,
  isSectionVisible,
  FASE_LABEL,
  GROUP_KEYS,
  type ExtraMatch,
  type Fase,
  type GroupKey,
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
      { property: "og:url", content: `${import.meta.env.VITE_APP_URL}/cronograma` },
    ],
    links: [{ rel: "canonical", href: `${import.meta.env.VITE_APP_URL}/cronograma` }],
  }),
  component: Cronograma,
});

type Row = ExtraMatch & {
  isGroupK: boolean;
  localId: string;
  visitanteId: string;
  badge: string;
  groupKey: GroupKey | null;
};

/* ISO3 → flag emoji (cubre el fixture WC2026). */
const FLAG: Record<string, string> = {
  ALG: "🇩🇿",
  ARG: "🇦🇷",
  AUS: "🇦🇺",
  AUT: "🇦🇹",
  BEL: "🇧🇪",
  BIH: "🇧🇦",
  BOL: "🇧🇴",
  BRA: "🇧🇷",
  CAN: "🇨🇦",
  CHI: "🇨🇱",
  CIV: "🇨🇮",
  CMR: "🇨🇲",
  COD: "🇨🇩",
  COL: "🇨🇴",
  CPV: "🇨🇻",
  CRC: "🇨🇷",
  CRO: "🇭🇷",
  CUW: "🇨🇼",
  CZE: "🇨🇿",
  DEN: "🇩🇰",
  DRC: "🇨🇩",
  ECU: "🇪🇨",
  EGY: "🇪🇬",
  ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  ESP: "🇪🇸",
  FRA: "🇫🇷",
  GER: "🇩🇪",
  GHA: "🇬🇭",
  HAI: "🇭🇹",
  IRN: "🇮🇷",
  IRQ: "🇮🇶",
  ITA: "🇮🇹",
  JAM: "🇯🇲",
  JOR: "🇯🇴",
  JPN: "🇯🇵",
  KOR: "🇰🇷",
  KSA: "🇸🇦",
  LCA: "🇱🇨",
  MAR: "🇲🇦",
  MEX: "🇲🇽",
  NCL: "🇳🇨",
  NED: "🇳🇱",
  NGA: "🇳🇬",
  NOR: "🇳🇴",
  NZL: "🇳🇿",
  PAN: "🇵🇦",
  PAR: "🇵🇾",
  POL: "🇵🇱",
  POR: "🇵🇹",
  QAT: "🇶🇦",
  RSA: "🇿🇦",
  SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  SEN: "🇸🇳",
  SRB: "🇷🇸",
  SUI: "🇨🇭",
  SUR: "🇸🇷",
  SWE: "🇸🇪",
  TUN: "🇹🇳",
  TUR: "🇹🇷",
  UAE: "🇦🇪",
  URU: "🇺🇾",
  USA: "🇺🇸",
  UZB: "🇺🇿",
  WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
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
  return isNaN(d.getTime()) ? "POR DEFINIR" : DAY_FMT.format(d).toUpperCase().replace(/\./g, "");
};
/** ms para ordenar; las fechas sin definir van al final. */
const sortMs = (iso: string) => {
  const t = new Date(iso).getTime();
  return isNaN(t) ? Number.POSITIVE_INFINITY : t;
};
const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : TIME_FMT.format(d).toLowerCase();
};

const badgeFor = (fase: Fase, groupKey: GroupKey | null): string => {
  if (fase === "grupos") return groupKey ? `GRUPO ${groupKey}` : "GRUPOS";
  return FASE_LABEL[fase].toUpperCase();
};

/* Desplegables por fase: orden del torneo + emoji amigable de cada etapa. */
const FASE_ORDER: Fase[] = [
  "grupos",
  "dieciseisavos",
  "octavos",
  "cuartos",
  "semis",
  "tercero",
  "final",
];
const FASE_EMOJI: Record<Fase, string> = {
  grupos: "⚽",
  dieciseisavos: "🔥",
  octavos: "⚡",
  cuartos: "🎯",
  semis: "🚀",
  tercero: "🥉",
  final: "🏆",
};

function Cronograma() {
  const { data: ts, isLoading } = useTournamentState();
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<"all" | GroupKey>("all");
  /* null = aún sin inicializar; al cargar, solo la fase actual arranca desplegada. */
  const [openFases, setOpenFases] = useState<Record<string, boolean> | null>(null);
  const [dateJump, setDateJump] = useState<string>("all");
  const dayRefs = useRef<Record<string, HTMLElement | null>>({});

  const rows = useMemo<Row[]>(() => {
    if (!ts) return [];
    /* Registro de todos los equipos en los 12 grupos para resolver nombres + grupo. */
    const teamIndex = new Map<string, { nombre: string; group: GroupKey }>();
    for (const k of GROUP_KEYS) {
      const g = ts.groups[k];
      if (!g) continue;
      for (const team of g.teams) teamIndex.set(team.id, { nombre: team.nombre, group: k });
    }
    const teamName = (id: string) => teamIndex.get(id)?.nombre ?? id;
    const groupOf = (a: string, b: string): GroupKey | null =>
      teamIndex.get(a)?.group ?? teamIndex.get(b)?.group ?? null;

    const groupK: Row[] = ts.group_k_matches.map((m) => {
      const gk = groupOf(m.local, m.visitante);
      return {
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
        groupKey: gk,
        badge: badgeFor("grupos", gk),
      };
    });
    // KO guarda CÓDIGOS (ISO3) en local/visitante → se resuelven a nombre completo
    // para mostrar; los placeholders ("Ganador Partido 102") pasan tal cual.
    const extra: Row[] = (ts.extra_matches ?? []).map((m) => ({
      ...m,
      local: teamName(m.local),
      visitante: teamName(m.visitante),
      isGroupK: false,
      localId: m.local,
      visitanteId: m.visitante,
      groupKey: null,
      badge: badgeFor(m.fase, null),
    }));
    // Una fase solo aparece en el cronograma si el admin la dejó activa (visible).
    return [...groupK, ...extra]
      .filter((r) => isSectionVisible(ts.visibility, r.fase))
      .sort((a, b) => sortMs(a.fecha) - sortMs(b.fecha));
  }, [ts]);

  /* Fase "actual": la del próximo partido por jugar; si el Mundial terminó, la última con partidos. */
  const currentFase = useMemo<Fase | null>(() => {
    if (rows.length === 0) return null;
    const next = rows.find((r) => sortMs(r.fecha) > Date.now());
    if (next) return next.fase;
    const conPartidos = FASE_ORDER.filter((f) => rows.some((r) => r.fase === f));
    return conPartidos[conPartidos.length - 1] ?? null;
  }, [rows]);

  useEffect(() => {
    if (openFases === null && currentFase) setOpenFases({ [currentFase]: true });
  }, [openFases, currentFase]);

  /* Con búsqueda o filtro activo se despliegan todas las fases con coincidencias. */
  const filtering = query.trim() !== "" || groupFilter !== "all";

  type FaseBlock = {
    fase: Fase;
    days: [string, Row[]][];
    total: number;
    jugados: number;
    rango: string;
  };
  const byFase = useMemo<FaseBlock[]>(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const filtered = rows.filter((r) => {
      if (groupFilter !== "all" && r.groupKey !== groupFilter) return false;
      if (!q) return true;
      return (
        r.local.toLowerCase().includes(q) ||
        r.visitante.toLowerCase().includes(q) ||
        (r.sede || "").toLowerCase().includes(q)
      );
    });
    const blocks: FaseBlock[] = [];
    for (const fase of FASE_ORDER) {
      const list = filtered.filter((r) => r.fase === fase);
      if (list.length === 0) continue;
      const map = new Map<string, Row[]>();
      for (const r of list) {
        const k = dayKey(r.fecha);
        const dl = map.get(k) ?? [];
        dl.push(r);
        map.set(k, dl);
      }
      const first = dayKey(list[0].fecha);
      const last = dayKey(list[list.length - 1].fecha);
      blocks.push({
        fase,
        days: Array.from(map.entries()),
        total: list.length,
        jugados: list.filter((r) => sortMs(r.fecha) <= now).length,
        rango: first === last ? first : `${first} – ${last}`,
      });
    }
    return blocks;
  }, [rows, query, groupFilter]);

  /* Índice día → fase, para abrir el desplegable correcto al saltar a una fecha. */
  const faseOfDay = useMemo(() => {
    const m = new Map<string, Fase>();
    for (const b of byFase) for (const [day] of b.days) if (!m.has(day)) m.set(day, b.fase);
    return m;
  }, [byFase]);
  const allDays = useMemo(() => byFase.flatMap((b) => b.days.map(([d]) => d)), [byFase]);

  const isFaseOpen = (f: Fase) => filtering || !!openFases?.[f];

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

      {/* Filtros */}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por país o estadio..."
            className="h-11 rounded-full border-border bg-card pl-10"
          />
        </div>
        <div className="relative sm:w-48">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={dateJump}
            onChange={(e) => {
              const val = e.target.value;
              setDateJump(val);
              if (val !== "all") {
                const fase = faseOfDay.get(val);
                if (fase) setOpenFases((s) => ({ ...(s ?? {}), [fase]: true }));
                setTimeout(() => {
                  dayRefs.current[val]?.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 120);
              }
            }}
            className="h-11 w-full appearance-none rounded-full border border-border bg-card pl-10 pr-10 text-sm"
          >
            <option value="all">Todas las fechas</option>
            {allDays.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative sm:w-48">
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as "all" | GroupKey)}
            className="h-11 w-full appearance-none rounded-full border border-border bg-card px-4 pr-10 text-sm"
          >
            <option value="all">Todos los Grupos</option>
            {GROUP_KEYS.map((k) => (
              <option key={k} value={k}>
                Grupo {k}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Expandir/contraer todas las fases de una */}
      <div className="mt-4 flex items-center justify-end gap-3 text-xs">
        <button
          type="button"
          onClick={() => setOpenFases(Object.fromEntries(FASE_ORDER.map((f) => [f, true])))}
          className="text-muted-foreground underline-offset-2 hover:text-gold hover:underline"
        >
          Expandir todo
        </button>
        <span className="text-border">·</span>
        <button
          type="button"
          onClick={() => setOpenFases({})}
          className="text-muted-foreground underline-offset-2 hover:text-gold hover:underline"
        >
          Contraer todo
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {byFase.length === 0 && (
          <Card className="border-border bg-card p-6 text-center text-sm text-muted-foreground card-shadow">
            No hay partidos que coincidan con los filtros.
          </Card>
        )}
        {byFase.map(({ fase, days, total, jugados, rango }) => {
          const isCurrent = fase === currentFase;
          return (
            <Card
              key={fase}
              className={`overflow-hidden bg-card p-0 card-shadow ${
                isCurrent ? "border-gold/50" : "border-border"
              }`}
            >
              <Collapsible
                open={isFaseOpen(fase)}
                onOpenChange={(o) => setOpenFases((s) => ({ ...(s ?? {}), [fase]: o }))}
              >
                <CollapsibleTrigger className="group flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/20 sm:p-5">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-gold/10 text-2xl"
                    aria-hidden
                  >
                    {FASE_EMOJI[fase]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl tracking-wide sm:text-2xl">
                        {FASE_LABEL[fase]}
                      </h2>
                      {isCurrent && (
                        <span className="rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                          Fase actual
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                      {rango} · {jugados}/{total} jugados
                    </p>
                    <div className="mt-2 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gold/70 transition-[width]"
                        style={{ width: `${Math.round((jugados / total) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t border-border/60 px-4 pb-5 sm:px-5">
                    {days.map(([day, list]) => (
                      <div
                        key={day}
                        ref={(el) => {
                          dayRefs.current[day] = el;
                        }}
                        id={`day-${day}`}
                      >
                        <div className="mt-4 flex items-center gap-2">
                          <Calendar className="size-4 text-gold" aria-hidden />
                          <h3 className="font-display text-sm tracking-wide">{day}</h3>
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            {list.length} {list.length === 1 ? "partido" : "partidos"}
                          </span>
                          <div className="h-px flex-1 bg-border/60" />
                        </div>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
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
                                <div className="flex items-center justify-between px-4 pt-4">
                                  <span className="rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-xs text-foreground/80">
                                    {timeLabel(m.fecha)}
                                  </span>
                                  <span className="rounded-md border border-gold/40 bg-gold/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                                    {m.badge}
                                  </span>
                                </div>

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
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
