import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTournamentState } from "@/hooks/usePolla";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { FASE_LABEL, isSectionVisible, type Fase } from "@/lib/polla";

type Row = {
  id: string;
  changed_at: string;
  participant_id: string;
  match_id: string;
  fase: string;
  gh_anterior: number | null;
  ga_anterior: number | null;
  gh_nuevo: number | null;
  ga_nuevo: number | null;
};

function fmtScore(h: number | null, a: number | null): string {
  if (h == null && a == null) return "—";
  return `${h ?? "-"}–${a ?? "-"}`;
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("es-CO", { timeZone: "America/Bogota" });
}
function faseLabel(f: string): string {
  return FASE_LABEL[f as Fase] ?? f;
}

export function PickHistoryCard({
  scope,
  participantId,
}: {
  scope: "mine" | "all";
  participantId?: string | null;
}) {
  const t = useT();
  const { data: ts } = useTournamentState();
  const visible = isSectionVisible(ts?.visibility, "historico");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["pick-history", scope, participantId ?? null],
    enabled: visible && (scope === "all" || !!participantId),
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("pick_history")
        .select(
          "id, changed_at, participant_id, match_id, fase, gh_anterior, ga_anterior, gh_nuevo, ga_nuevo",
        )
        .order("changed_at", { ascending: false })
        .limit(500);
      if (scope === "mine" && participantId) {
        q = q.eq("participant_id", participantId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["history-participants"],
    enabled: visible && scope === "all",
    queryFn: async () => {
      const { data, error } = await supabase.from("participants").select("id, nombre");
      if (error) throw error;
      return data ?? [];
    },
  });
  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.id, p.nombre);
    return m;
  }, [participants]);

  if (!visible) {
    return (
      <Card className="border-border bg-card p-5 card-shadow text-sm text-muted-foreground">
        {t("history.hidden")}
      </Card>
    );
  }

  const downloadCsv = () => {
    const header = [
      t("history.col.when"),
      t("history.col.who"),
      t("history.col.fase"),
      t("history.col.match"),
      t("history.col.from"),
      t("history.col.to"),
    ];
    const lines = rows.map((r) =>
      [
        fmtWhen(r.changed_at),
        nameMap.get(r.participant_id) ?? r.participant_id,
        faseLabel(r.fase),
        r.match_id,
        fmtScore(r.gh_anterior, r.ga_anterior),
        fmtScore(r.gh_nuevo, r.ga_nuevo),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = scope === "mine" ? `mi-historico-${stamp}.csv` : `historico-marcadores-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-border bg-card p-5 card-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl flex items-center gap-2">
            <History className="size-5" /> {t("history.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope === "mine" ? t("history.descMine") : t("history.descAll")}
          </p>
        </div>
        <Button onClick={downloadCsv} variant="secondary" size="sm" disabled={rows.length === 0}>
          <Download className="mr-2 size-4" /> {t("history.csv")}
        </Button>
      </div>

      <div className="mt-4 overflow-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="p-2">{t("history.col.when")}</th>
                {scope === "all" && <th className="p-2">{t("history.col.who")}</th>}
                <th className="p-2">{t("history.col.fase")}</th>
                <th className="p-2">{t("history.col.match")}</th>
                <th className="p-2 text-center">{t("history.col.from")}</th>
                <th className="p-2 text-center">{t("history.col.to")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-2 text-muted-foreground">{fmtWhen(r.changed_at)}</td>
                  {scope === "all" && (
                    <td className="p-2">{nameMap.get(r.participant_id) ?? "—"}</td>
                  )}
                  <td className="p-2">{faseLabel(r.fase)}</td>
                  <td className="p-2 font-mono text-xs">{r.match_id}</td>
                  <td className="p-2 text-center font-mono">
                    {fmtScore(r.gh_anterior, r.ga_anterior)}
                  </td>
                  <td className="p-2 text-center font-mono text-gold">
                    {fmtScore(r.gh_nuevo, r.ga_nuevo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}