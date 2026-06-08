import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { ModalidadCard } from "@/components/ModalidadCard";
import { useT, tStatic } from "@/lib/i18n";
import { MODALIDAD_ORDER } from "@/lib/concursos";

export const Route = createFileRoute("/jugar/")({
  head: () => ({
    meta: [
      { title: tStatic("play.meta.title") },
      { name: "description", content: tStatic("play.meta.desc") },
      { property: "og:title", content: tStatic("play.meta.title") },
      { property: "og:description", content: tStatic("play.meta.desc") },
    ],
  }),
  component: JugarPage,
});

function JugarPage() {
  const t = useT();
  return (
    <main className="relative mx-auto max-w-5xl px-4 py-12">
      <div className="ambient-blob -top-20 left-1/3 hidden bg-primary/15 sm:block" aria-hidden />
      <div className="ambient-blob top-32 right-0 hidden bg-gold/15 sm:block" aria-hidden />

      <header className="relative text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="size-3.5" /> {t("play.eyebrow")}
        </span>
        <h1 className="mt-3 font-display text-4xl tracking-wide sm:text-5xl">{t("play.title")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">{t("play.subtitle")}</p>
      </header>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {MODALIDAD_ORDER.map((m, i) => (
          <ModalidadCard key={m} modalidad={m} index={i} />
        ))}
      </div>
    </main>
  );
}
