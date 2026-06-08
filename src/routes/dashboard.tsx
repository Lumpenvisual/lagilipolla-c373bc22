import { useMemo } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Loader2, Trophy, Target, ListChecks, Coins, ArrowRight, Ticket } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMatches, useMyPredictions, useLeaderboard } from "@/hooks/useData";
import { useMyInscripciones, useConcursosOverview } from "@/hooks/useConcursos";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { flag } from "@/lib/flags";
import { formatET, isLocked, formatCAD } from "@/lib/format";
import { calculatePrizes, MEDALS, positionLabel } from "@/lib/prizes";
import { getMatchStatus } from "@/lib/matchStatus";
import { ENTRY_FEE, TOTAL_MATCHES, ADMIN_EMAIL } from "@/lib/constants";
import { useT, tStatic, type TFunc } from "@/lib/i18n";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: tStatic("dash.meta.title") }] }),
  component: Dashboard,
});

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4">{children}</main>;
}

function Dashboard() {
  const router = useRouter();
  const t = useT();
  const { user, participant, isAdmin, loading, signOut } = useAuth();

  if (loading) {
    return (
      <Centered>
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  if (!user) {
    return (
      <Centered>
        <Card className="w-full border-border bg-card p-8 text-center card-shadow">
          <p className="text-foreground">{t("dash.mustLogin")}</p>
          <Button className="mt-4" onClick={() => router.navigate({ to: "/login" })}>
            {t("nav.login")}
          </Button>
        </Card>
      </Centered>
    );
  }

  // Organizer (admin) without a participant entry: send them to the admin panel.
  if (isAdmin && !participant) {
    return (
      <Centered>
        <Card className="w-full border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <div className="text-4xl">🛠️</div>
          <h1 className="mt-3 font-display text-2xl tracking-wide">{t("dash.org.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("dash.org.body")}</p>
          <Button variant="hero" className="mt-6" onClick={() => router.navigate({ to: "/admin" })}>
            {t("dash.org.cta")}
          </Button>
        </Card>
      </Centered>
    );
  }

  const estado = participant?.estado_pago ?? "pendiente";

  if (estado === "pendiente") {
    return (
      <Centered>
        <Card className="w-full border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <div className="text-4xl">⏳</div>
          <h1 className="mt-3 font-display text-2xl tracking-wide">{t("dash.pending.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("dash.pending.body")}</p>
          <Button variant="secondary" className="mt-6" onClick={() => signOut().then(() => router.navigate({ to: "/" }))}>
            {t("nav.logout")}
          </Button>
        </Card>
      </Centered>
    );
  }

  if (estado === "rechazado") {
    return (
      <Centered>
        <Card className="w-full border-destructive/40 bg-destructive/5 p-8 text-center card-shadow">
          <div className="text-4xl">❌</div>
          <h1 className="mt-3 font-display text-2xl tracking-wide">{t("dash.rejected.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("dash.rejected.body", { email: ADMIN_EMAIL })}</p>
          <Button variant="secondary" className="mt-6" onClick={() => signOut().then(() => router.navigate({ to: "/" }))}>
            {t("nav.logout")}
          </Button>
        </Card>
      </Centered>
    );
  }

  return <ApprovedDashboard participantId={participant!.id} nombre={participant!.nombre} t={t} />;
}

function ApprovedDashboard({ participantId, nombre, t }: { participantId: string; nombre: string; t: TFunc }) {
  const { data: matches = [] } = useMatches();
  const { data: preds = [] } = useMyPredictions(participantId);
  const { data: leaderboard = [] } = useLeaderboard();
  const { data: inscripciones = [] } = useMyInscripciones(participantId);
  const { data: concursos = [] } = useConcursosOverview();

  const concursoById = useMemo(() => {
    const m = new Map<string, (typeof concursos)[number]>();
    for (const c of concursos) m.set(c.id, c);
    return m;
  }, [concursos]);

  const misConcursos = inscripciones.length;
  const adeudado = inscripciones
    .filter((i) => i.estado_pago === "pendiente")
    .reduce((s, i) => s + (concursoById.get(i.concurso_id)?.cuota ?? 0), 0);

  const predByMatch = useMemo(() => {
    const m = new Map<number, (typeof preds)[number]>();
    for (const p of preds) m.set(p.match_id, p);
    return m;
  }, [preds]);

  const myRow = leaderboard.find((r) => r.participant_id === participantId);
  const totalPot = leaderboard.length * ENTRY_FEE;
  const prizes = useMemo(() => calculatePrizes(leaderboard, totalPot), [leaderboard, totalPot]);
  const myPrize = prizes[participantId] ?? 0;

  const predicted = preds.filter((p) => p.goles_local_pred != null && p.goles_visitante_pred != null).length;

  const now = Date.now();
  const upcoming = matches
    .filter((m) => !isLocked(m.kickoff_time, now))
    .filter((m) => {
      const p = predByMatch.get(m.id);
      return !p || p.goles_local_pred == null;
    })
    .slice(0, 3);

  const recent = matches
    .filter((m) => m.goles_local != null && m.goles_visitante != null)
    .sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime())
    .slice(0, 5);

  const top5 = leaderboard.slice(0, 5);

  const stats = [
    { icon: Trophy, label: t("dash.stat.points"), value: myRow?.total_puntos ?? 0, gold: true },
    {
      icon: Target,
      label: t("dash.stat.position"),
      value: myRow ? `${MEDALS[myRow.posicion] ?? ""} ${positionLabel(myRow.posicion, leaderboard)}` : "—",
    },
    { icon: ListChecks, label: t("dash.stat.predicted"), value: `${predicted} / ${TOTAL_MATCHES}` },
    { icon: Coins, label: t("dash.stat.prize"), value: formatCAD(myPrize), gold: true },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-4xl tracking-wide">
        {t("dash.hello")} <span className="gold-gradient-text">{nombre}</span>
      </h1>

      {/* STATS */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={i} className="border-border bg-card p-5 card-shadow">
            <div className="flex items-center gap-2 text-muted-foreground">
              <s.icon className="size-4" />
              <span className="text-xs uppercase tracking-wider">{s.label}</span>
            </div>
            <div className={`mt-2 font-display text-3xl ${s.gold ? "text-gold" : "text-foreground"}`}>
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      {/* MIS CONCURSOS */}
      <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 border-gold/30 bg-card p-5 card-shadow">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <Ticket className="size-5" />
          </div>
          <div>
            <p className="font-display text-xl tracking-wide">{t("dash.myContests")}</p>
            <p className="text-sm text-muted-foreground">
              {t(misConcursos === 1 ? "dash.enroll_one" : "dash.enroll_other", { n: misConcursos })}
              {adeudado > 0 && (
                <>
                  {" · "}
                  <span className="text-gold">{t("dash.toPay", { amount: formatCAD(adeudado) })}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <Button asChild variant="hero" size="sm">
          <Link to="/concursos">
            {t("dash.explore")} <ArrowRight className="size-4" />
          </Link>
        </Button>
      </Card>

      {/* NEXT MATCHES */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl tracking-wide">{t("dash.next.title")}</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/predictions">{t("common.viewAll")} <ArrowRight className="size-4" /></Link>
          </Button>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("dash.next.upToDate")}</p>
        ) : (
          <div className="mt-4 flex gap-4 overflow-x-auto pb-2 no-scrollbar">
            {upcoming.map((m) => (
              <Card key={m.id} className="min-w-[260px] border-border bg-card p-5 card-shadow">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("dash.group", { g: m.grupo })}</span>
                  <span>{t("dash.matchNo", { n: m.numero_partido })}</span>
                </div>
                <div className="mt-3 flex items-center justify-center gap-2 text-center">
                  <span className="flex-1 text-sm font-medium">{flag(m.equipo_local)} {m.equipo_local}</span>
                  <span className="text-muted-foreground">{t("common.vs")}</span>
                  <span className="flex-1 text-sm font-medium">{m.equipo_visitante} {flag(m.equipo_visitante)}</span>
                </div>
                <p className="mt-3 text-center text-xs text-muted-foreground">{formatET(m.kickoff_time)}</p>
                <Button asChild variant="hero" size="sm" className="mt-4 w-full">
                  <Link to="/predictions">{t("dash.predictBtn")} <ArrowRight className="size-4" /></Link>
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {/* RECENT RESULTS */}
        <section>
          <h2 className="font-display text-2xl tracking-wide">{t("dash.recent.title")}</h2>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("dash.recent.empty")}</p>
          ) : (
            <Card className="mt-4 divide-y divide-border border-border bg-card card-shadow">
              {recent.map((m) => {
                const p = predByMatch.get(m.id) ?? null;
                const st = getMatchStatus(m, p);
                const ptColor =
                  st.key === "exacto" ? "text-primary" : st.key === "ganador" ? "text-success" : "text-muted-foreground";
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {flag(m.equipo_local)} {m.equipo_local} {t("common.vs")} {m.equipo_visitante} {flag(m.equipo_visitante)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("dash.yourPred")}: {p?.goles_local_pred ?? "–"}–{p?.goles_visitante_pred ?? "–"} · {t("dash.realResult")}:{" "}
                        <span className="text-gold">{m.goles_local}–{m.goles_visitante}</span>
                      </p>
                    </div>
                    <span className={`font-display text-xl ${ptColor}`}>+{p?.puntos_obtenidos ?? 0}</span>
                  </div>
                );
              })}
            </Card>
          )}
        </section>

        {/* QUICK LEADERBOARD */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl tracking-wide">{t("dash.top5")}</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/leaderboard">{t("dash.fullTable")} <ArrowRight className="size-4" /></Link>
            </Button>
          </div>
          <Card className="mt-4 divide-y divide-border border-border bg-card card-shadow">
            {top5.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t("dash.noParticipants")}</p>
            ) : (
              top5.map((r) => (
                <div
                  key={r.participant_id}
                  className={`flex items-center justify-between gap-3 p-4 text-sm ${
                    r.participant_id === participantId ? "bg-info/10" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-8 font-display text-lg text-muted-foreground">
                      {MEDALS[r.posicion] ?? r.posicion}
                    </span>
                    <span className="truncate font-medium">{r.nombre}</span>
                  </span>
                  <span className="font-display text-lg text-gold">{r.total_puntos}</span>
                </div>
              ))
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}
