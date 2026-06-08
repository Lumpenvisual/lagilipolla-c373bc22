import { useMemo, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Loader2, ArrowLeft, ArrowRight, Trophy, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useConcursosOverview, useMyInscripciones } from "@/hooks/useConcursos";
import { ConcursoGrid } from "@/components/ConcursoGrid";
import { ScoringExample } from "@/components/ScoringExample";
import { ModalidadRules } from "@/components/ModalidadRules";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dateLabelET } from "@/lib/format";
import { useT, tStatic } from "@/lib/i18n";
import {
  isModalidad,
  MODALIDAD_LABEL,
  MODALIDAD_ICON,
  MODALIDAD_ACCENT,
  MODALIDAD_TAGLINE,
  MODALIDAD_STEP,
  type Modalidad,
} from "@/lib/concursos";

export const Route = createFileRoute("/jugar/$modalidad")({
  beforeLoad: ({ params }) => {
    if (!isModalidad(params.modalidad)) throw notFound();
  },
  head: ({ params }) => {
    const name = tStatic(`modalidad.${params.modalidad}`);
    return {
      meta: [
        { title: tStatic("mod.meta.title", { name }) },
        { name: "description", content: tStatic("mod.meta.desc", { name }) },
        { property: "og:title", content: tStatic("mod.meta.title", { name }) },
        { property: "og:description", content: tStatic("mod.meta.desc", { name }) },
      ],
    };
  },
  component: ModalidadLandingPage,
  notFoundComponent: () => (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-muted-foreground">{tStatic("mod.notFound")}</p>
      <Button asChild className="mt-4" variant="secondary">
        <Link to="/jugar">{tStatic("mod.back")}</Link>
      </Button>
    </main>
  ),
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md px-4 py-16 text-center" role="alert">
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button asChild className="mt-4" variant="secondary">
        <Link to="/jugar">{tStatic("mod.back")}</Link>
      </Button>
    </main>
  ),
});

function ModalidadLandingPage() {
  const { modalidad } = Route.useParams();
  const m = modalidad as Modalidad;
  const t = useT();
  const { participant } = useAuth();
  const { data: concursos = [], isLoading } = useConcursosOverview();
  const { data: inscripciones = [] } = useMyInscripciones(participant?.id);

  const Icon = MODALIDAD_ICON[m];
  const a = MODALIDAD_ACCENT[m];

  const mine = useMemo(() => concursos.filter((c) => c.modalidad === m), [concursos, m]);
  const inscMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of inscripciones) map.set(i.concurso_id, i.estado_pago);
    return map;
  }, [inscripciones]);

  // Search & filter — only for the "partido" modality.
  const isPartido = m === "partido";
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");

  const dateOptions = useMemo(() => {
    if (!isPartido) return [] as string[];
    const set = new Set<string>();
    for (const c of mine) if (c.deadline) set.add(dateLabelET(c.deadline));
    return Array.from(set);
  }, [mine, isPartido]);

  const filtered = useMemo(() => {
    if (!isPartido) return mine;
    const q = query.trim().toLowerCase();
    return mine.filter((c) => {
      const matchesQuery = !q || c.nombre.toLowerCase().includes(q);
      const matchesDate =
        dateFilter === "all" || (c.deadline ? dateLabelET(c.deadline) === dateFilter : false);
      return matchesQuery && matchesDate;
    });
  }, [mine, query, dateFilter, isPartido]);

  const hasFilters = isPartido && (query.trim() !== "" || dateFilter !== "all");
  const clearFilters = () => {
    setQuery("");
    setDateFilter("all");
  };

  const steps = [1, 2, 3] as const;


  return (
    <main className="relative mx-auto max-w-5xl px-4 py-8">
      <div className={`ambient-blob -top-16 right-1/4 hidden sm:block ${a.bg}`} aria-hidden />

      <Button asChild variant="ghost" size="sm" className="mb-4 px-0 text-muted-foreground">
        <Link to="/jugar">
          <ArrowLeft className="size-4" /> {t("mod.back")}
        </Link>
      </Button>

      {/* Header */}
      <Card className="glass-card p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className={`flex size-14 items-center justify-center rounded-2xl border ${a.chip}`}>
            <Icon className="size-7" />
          </div>
          <div>
            <h1 className="font-display text-3xl tracking-wide sm:text-4xl">{t(MODALIDAD_LABEL[m])}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t(MODALIDAD_TAGLINE(m))}</p>
          </div>
        </div>
        <div className="mt-5">
          <Button
            variant="hero"
            className="cta-pulse"
            onClick={() => {
              const el = document.getElementById("concursos");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {t("mod.cta")} <ArrowRight className="size-4" />
          </Button>
        </div>
      </Card>

      {/* How it works */}
      <section className="mt-8">
        <h2 className="font-display text-2xl tracking-wide">{t("mod.how.title")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {steps.map((n) => (
            <Card key={n} className="glass-card p-5">
              <div className={`flex size-9 items-center justify-center rounded-full border font-display text-lg ${a.chip}`}>
                {n}
              </div>
              <p className="mt-3 text-sm text-foreground">{t(MODALIDAD_STEP(m, n))}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Scoring */}
      <section className="mt-8">
        <h2 className="font-display text-2xl tracking-wide">{t("mod.scoring.title")}</h2>
        <ScoringExample className="mt-4" />
      </section>

      {/* Rules & prizes */}
      <section className="mt-8">
        <h2 className="font-display text-2xl tracking-wide">{t("mod.rules.title")}</h2>
        <div className="mt-4">
          <ModalidadRules modalidad={m} />
        </div>
      </section>

      {/* Contests */}
      <section id="concursos" className="mt-10 scroll-mt-20">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-gold" />
          <h2 className="font-display text-2xl tracking-wide">{t("mod.contests.title")}</h2>
          {mine.length > 0 && (
            <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
              {t("mod.contests.count", { n: mine.length })}
            </span>
          )}
        </div>

        {/* Search & filter (partido only) */}
        {isPartido && mine.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("mod.search.placeholder")}
                className="pl-9"
                aria-label={t("mod.search.placeholder")}
              />
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="sm:w-56" aria-label={t("mod.search.allDates")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("mod.search.allDates")}</SelectItem>
                {dateOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="size-4" /> {t("mod.search.clear")}
              </Button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : mine.length === 0 ? (
          <Card className="mt-4 border-border bg-card p-10 text-center card-shadow">
            <div className="text-4xl">🗂️</div>
            <p className="mt-3 font-display text-xl tracking-wide">{t("mod.contests.empty")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("mod.contests.emptyDesc")}</p>
            <Button asChild variant="secondary" className="mt-5">
              <Link to="/jugar">{t("mod.back")}</Link>
            </Button>

          </Card>
        ) : filtered.length === 0 ? (
          <Card className="mt-4 border-border bg-card p-10 text-center card-shadow">
            <div className="text-4xl">🔍</div>
            <p className="mt-3 font-display text-xl tracking-wide">{t("mod.search.noResults")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("mod.search.noResultsDesc")}</p>
            <Button variant="secondary" className="mt-5" onClick={clearFilters}>
              {t("mod.search.clear")}
            </Button>
          </Card>
        ) : (
          <div className="mt-4">
            {isPartido && hasFilters && (
              <p className="mb-3 text-xs text-muted-foreground">
                {t("mod.search.results", { n: filtered.length, total: mine.length })}
              </p>
            )}
            <ConcursoGrid concursos={filtered} inscMap={inscMap} showModalidad={false} />
          </div>
        )}
      </section>
    </main>
  );
}
