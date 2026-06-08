import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useConcursosOverview, useMyInscripciones } from "@/hooks/useConcursos";
import { ConcursoGrid } from "@/components/ConcursoGrid";
import { Card } from "@/components/ui/card";
import { useT, tStatic } from "@/lib/i18n";
import {
  MODALIDAD_LABEL,
  ESTADO_META,
  type Modalidad,
  type EstadoConcurso,
} from "@/lib/concursos";

export const Route = createFileRoute("/concursos/")({
  head: () => ({
    meta: [
      { title: tStatic("concursos.meta.title") },
      { name: "description", content: tStatic("concursos.meta.desc") },
      { property: "og:title", content: tStatic("concursos.meta.title") },
      { property: "og:description", content: tStatic("concursos.meta.desc") },
    ],
  }),
  component: ConcursosPage,
});

const MODALIDADES: ("todos" | Modalidad)[] = ["todos", "mundial", "fase", "dia", "partido"];
const ESTADOS: ("todos" | EstadoConcurso)[] = ["todos", "abierto", "cerrado", "finalizado"];

function ConcursosPage() {
  const t = useT();
  const { participant } = useAuth();
  const { data: concursos = [], isLoading } = useConcursosOverview();
  const { data: inscripciones = [] } = useMyInscripciones(participant?.id);

  const [modalidad, setModalidad] = useState<"todos" | Modalidad>("todos");
  const [estado, setEstado] = useState<"todos" | EstadoConcurso>("todos");

  const inscMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of inscripciones) m.set(i.concurso_id, i.estado_pago);
    return m;
  }, [inscripciones]);

  const filtered = concursos.filter(
    (c) =>
      (modalidad === "todos" || c.modalidad === modalidad) &&
      (estado === "todos" || c.estado === estado),
  );

  return (
    <main className="relative mx-auto max-w-6xl px-4 py-8">
      <div className="ambient-blob -top-20 left-1/4 hidden bg-primary/20 sm:block" aria-hidden />
      <div className="ambient-blob top-40 right-0 hidden bg-gold/15 sm:block" aria-hidden />

      <header className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
          <Trophy className="size-3.5" /> {t("concursos.badge")}
        </span>
        <h1 className="mt-3 font-display text-4xl tracking-wide sm:text-5xl">
          {t("concursos.titleA")} <span className="gold-gradient-text">{t("concursos.titleB")}</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("concursos.subtitle")}</p>
      </header>

      {/* Filters */}
      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          {MODALIDADES.map((m) => (
            <button
              key={m}
              onClick={() => setModalidad(m)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                modalidad === m
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "todos" ? t("concursos.allModalidades") : t(MODALIDAD_LABEL[m])}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {ESTADOS.map((e) => (
            <button
              key={e}
              onClick={() => setEstado(e)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                estado === e
                  ? "border-gold bg-gold/15 text-gold"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {e === "todos" ? t("concursos.allEstados") : t(ESTADO_META[e].labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="mt-8 border-border bg-card p-10 text-center card-shadow">
          <div className="text-4xl">🗂️</div>
          <p className="mt-3 font-display text-xl tracking-wide">{t("concursos.empty.title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("concursos.empty.desc")}</p>
        </Card>
      ) : (
        <div className="mt-8">
          <ConcursoGrid concursos={filtered} inscMap={inscMap} />
        </div>
      )}
    </main>
  );
}
