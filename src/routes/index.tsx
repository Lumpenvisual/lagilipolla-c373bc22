import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import heroImg from "@/assets/hero-stadium.jpg";
import { Countdown } from "@/components/Countdown";
import { ModalidadCard } from "@/components/ModalidadCard";
import { ScoringExample } from "@/components/ScoringExample";
import { Button } from "@/components/ui/button";
import { ADMIN_EMAIL } from "@/lib/constants";
import { MODALIDAD_ORDER } from "@/lib/concursos";
import { useT, tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: tStatic("home.meta.title") },
      { name: "description", content: tStatic("home.meta.desc") },
    ],
  }),
  component: Landing,
});

function Landing() {
  const t = useT();

  return (
    <main>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <img
          src={heroImg}
          alt={t("home.hero.alt")}
          width={1920}
          height={1080}
          className="absolute inset-0 size-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        <div className="ambient-blob -top-24 left-1/2 size-[600px] -translate-x-1/2 bg-gold/15" />
        <div className="ambient-blob bottom-[-15%] right-[-10%] size-[480px] bg-primary/10" />

        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:py-28">
          <h1 className="animate-fade-up font-display text-5xl leading-none sm:text-7xl">
            <span aria-hidden>⚽ </span>
            <span className="gold-gradient-text drop-shadow-[0_4px_14px_rgba(240,192,64,0.3)]">
              POLLA MUNDIAL FIFA 2026
            </span>
          </h1>
          <p
            className="mx-auto mt-5 max-w-2xl animate-fade-up text-lg text-muted-foreground sm:text-xl"
            style={{ animationDelay: "0.08s" }}
          >
            {t("home.hero.promise")}
          </p>
          <p
            className="mt-10 animate-fade-up text-[11px] uppercase tracking-[0.4em] text-muted-foreground"
            style={{ animationDelay: "0.16s" }}
          >
            {t("home.hero.gloryStarts")}
          </p>
          <div className="mt-5 animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <Countdown />
          </div>
          <div
            className="mt-12 flex animate-fade-up flex-wrap justify-center gap-4"
            style={{ animationDelay: "0.28s" }}
          >
            <Button asChild variant="hero" size="lg" className="cta-pulse h-12 px-10 text-base uppercase tracking-wider">
              <Link to="/jugar">
                {t("home.hero.startPlaying")} <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              size="lg"
              className="h-12 border border-border px-10 text-base uppercase tracking-wider backdrop-blur-md"
            >
              <Link to="/concursos">{t("home.hero.viewAll")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* MODES */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
            <Sparkles className="size-3.5" /> {t("home.modes.eyebrow")}
          </span>
          <h2 className="mt-3 font-display text-3xl tracking-wide sm:text-4xl">{t("home.modes.title")}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">{t("home.modes.subtitle")}</p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {MODALIDAD_ORDER.map((m, i) => (
            <ModalidadCard key={m} modalidad={m} index={i} ctaKey="common.see" />
          ))}
        </div>
      </section>

      {/* SCORING */}
      <section className="mx-auto max-w-4xl px-4 pb-16">
        <h2 className="text-center font-display text-3xl tracking-wide sm:text-4xl">{t("home.scoring.title")}</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">{t("home.scoringNote")}</p>
        <ScoringExample className="mt-8" />
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        {t("home.footer", { email: ADMIN_EMAIL })}
      </footer>
    </main>
  );
}
