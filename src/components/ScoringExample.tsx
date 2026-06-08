import { useT } from "@/lib/i18n";

/** Visual explainer of the 3 / 1 / 0 scoring system, reused across pages. */
export function ScoringExample({ className = "" }: { className?: string }) {
  const t = useT();
  const items = [
    {
      pts: "3",
      color: "text-primary",
      box: "border-primary/30 bg-primary/5",
      label: t("reglas.pts.exact"),
      desc: t("reglas.pts.exactDesc"),
    },
    {
      pts: "1",
      color: "text-success",
      box: "border-success/30 bg-success/5",
      label: t("reglas.pts.result"),
      desc: t("reglas.pts.resultDesc"),
    },
    {
      pts: "0",
      color: "text-muted-foreground",
      box: "border-border bg-muted/40",
      label: t("reglas.pts.miss"),
      desc: t("reglas.pts.missDesc"),
    },
  ];

  return (
    <div className={`grid gap-3 sm:grid-cols-3 ${className}`}>
      {items.map((it) => (
        <div key={it.pts} className={`rounded-xl border p-4 text-center ${it.box}`}>
          <div className={`font-display text-4xl ${it.color}`}>{it.pts}</div>
          <p className="mt-1 text-sm font-semibold text-foreground">{it.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{it.desc}</p>
        </div>
      ))}
    </div>
  );
}
