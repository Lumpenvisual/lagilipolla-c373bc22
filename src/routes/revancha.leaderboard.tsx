import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRevanchaLeaderboard } from "@/hooks/usePolla";
import { LeaderboardTable, type LeaderboardRow } from "@/components/LeaderboardTable";
import { ParticipantPickDetail } from "@/components/ParticipantPickDetail";
import { useT, tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/revancha/leaderboard")({
  head: () => ({
    meta: [
      { title: tStatic("revancha.lb.title") },
      { name: "description", content: tStatic("revancha.lb.subtitle") },
    ],
  }),
  component: RevanchaLb,
});

function RevanchaLb() {
  const t = useT();
  const { participant } = useAuth();
  const { data: rows = [], isLoading } = useRevanchaLeaderboard();

  const tableRows: LeaderboardRow[] = rows.map((r) => ({
    participant_id: r.participant_id,
    nombre: r.nombre,
    posicion: r.posicion,
    total: r.puntos,
  }));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <div className="h-1 w-16 rounded-sm bg-info" aria-hidden />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl sm:text-4xl">
          <span aria-hidden>🔄 </span>
          <span className="text-info">{t("revancha.lb.title")}</span>
        </h1>
        <span className="rounded-full border border-info/40 bg-info/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-info">
          {t("revancha.lb.badge")}
        </span>
      </div>

      <p className="mt-2 rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-info">
        {t("revancha.lb.distinctBanner")}
      </p>

      <p className="mt-3 text-sm text-muted-foreground">
        {t("revancha.lb.count", { n: rows.length })}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{t("revancha.lb.hint")}</p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("revancha.lb.empty")}</p>
      ) : (
        <div className="mt-6">
          <LeaderboardTable
            rows={tableRows}
            meParticipantId={participant?.id}
            renderDetail={(participantId) => (
              <ParticipantPickDetail
                participantId={participantId}
                rpc="get_public_revancha_pick"
                phases={["semis", "final"]}
                emptyLabel={t("revancha.lb.detailEmpty")}
              />
            )}
          />
        </div>
      )}

      <div className="mt-8 text-center">
        <Link to="/revancha" className="text-sm text-primary hover:underline">
          {t("revancha.lb.backToHub")}
        </Link>
      </div>
    </main>
  );
}
