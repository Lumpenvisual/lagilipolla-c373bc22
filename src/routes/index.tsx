import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPin, Coins, Calendar, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { POLLA, fmtCOP } from "@/lib/polla";
import { useAuth } from "@/hooks/useAuth";
import { AboutSection } from "@/components/landing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LA GILIPOLLA 2026 · Bar El Guanábano" },
      {
        name: "description",
        content: `Polla del Mundial 2026 · cuota ${fmtCOP(POLLA.cuotaCOP)} COP · Bar El Guanábano.`,
      },
      { property: "og:title", content: "LA GILIPOLLA 2026 · Bar El Guanábano" },
      {
        property: "og:description",
        content: `Polla del Mundial 2026 · cuota ${fmtCOP(POLLA.cuotaCOP)} COP · Bar El Guanábano.`,
      },
      { property: "og:url", content: "https://lagilipolla.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://lagilipolla.lovable.app/" }],
  }),
  component: Landing,
});

function useCountdown(target: Date) {
  // Start at target time so SSR renders 00s and avoids hydration mismatches.
  const [now, setNow] = useState(() => target.getTime());
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [target]);
  const ms = Math.max(0, target.getTime() - now);
  const s = Math.floor(ms / 1000);
  return {
    done: ms <= 0,
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

function Unit({ v, label, accent }: { v: number; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`glass-card flex h-20 w-16 items-center justify-center rounded-xl font-display text-3xl tabular-nums sm:h-28 sm:w-24 sm:text-5xl ${accent ? "text-destructive" : "text-gold"}`}
      >
        {v.toString().padStart(2, "0")}
      </div>
      <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Landing() {
  const { user, participant } = useAuth();
  const cd = useCountdown(POLLA.deadline);
  const approved = participant?.estado_pago === "aprobado";

  return (
    <main>
      <div className="bandera-stripe-h h-1.5 w-full" aria-hidden />

      <section className="relative overflow-hidden">
        <div className="ambient-blob -top-20 left-1/2 size-[520px] -translate-x-1/2 bg-gold/15" />
        <div className="ambient-blob bottom-[-15%] right-[-10%] size-[480px] bg-destructive/15" />
        <div className="ambient-blob top-1/3 left-[-15%] size-[420px] bg-info/15" />

        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
            <Trophy className="size-3.5" /> POLLA OFICIAL DEL BAR
          </span>
          <h1 className="mt-5 font-display text-5xl leading-none sm:text-7xl">
            <span className="gold-gradient-text drop-shadow-[0_4px_14px_rgba(252,209,22,0.35)]">
              LA GILIPOLLA
            </span>
            <span className="ml-2 text-foreground">2026</span>
          </h1>
          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" /> {POLLA.sede}
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-gold">
              <Coins className="size-4" /> {fmtCOP(POLLA.cuotaCOP)} COP
            </span>
          </p>

          <p className="mt-8 text-[11px] uppercase tracking-[0.4em] text-muted-foreground">
            Cierre de inscripciones
          </p>
          {cd.done ? (
            <p className="mt-2 font-display text-3xl text-destructive">¡INSCRIPCIONES CERRADAS!</p>
          ) : (
            <div className="mt-3 flex items-end justify-center gap-3 sm:gap-5">
              <Unit v={cd.d} label="días" />
              <Unit v={cd.h} label="horas" />
              <Unit v={cd.m} label="min" />
              <Unit v={cd.s} label="seg" accent />
            </div>
          )}
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3.5" /> 11 jun 2026 · 10:00 a.m. (COT)
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {!user ? (
              <>
                <Button
                  asChild
                  variant="hero"
                  size="lg"
                  className="h-12 px-10 text-base uppercase tracking-wider"
                >
                  <Link to="/registro">
                    Inscribirme <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  size="lg"
                  className="h-12 px-10 text-base uppercase tracking-wider"
                >
                  <Link to="/login">Ya estoy inscrito</Link>
                </Button>
              </>
            ) : approved ? (
              <Button
                asChild
                variant="hero"
                size="lg"
                className="h-12 px-10 text-base uppercase tracking-wider"
              >
                <Link to="/planilla">
                  Llenar mi planilla <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button
                asChild
                variant="hero"
                size="lg"
                className="h-12 px-10 text-base uppercase tracking-wider"
              >
                <Link to="/dashboard">
                  Mi cuenta <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <AboutSection />

      <section className="mx-auto max-w-5xl px-4 pb-16">
        <h2 className="text-center font-display text-3xl tracking-wide sm:text-4xl">
          Cómo se juega
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card className="border-border bg-card p-6 card-shadow">
            <div className="text-3xl">1️⃣</div>
            <h3 className="mt-3 font-display text-xl">Pagas tu cuota</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {fmtCOP(POLLA.cuotaCOP)} COP en el bar. El admin aprueba tu inscripción.
            </p>
          </Card>
          <Card className="border-border bg-card p-6 card-shadow">
            <div className="text-3xl">2️⃣</div>
            <h3 className="mt-3 font-display text-xl">Llenas la planilla</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              12 grupos · 6 partidos del Grupo K · goleador y arquero. Antes del 11 de junio.
            </p>
          </Card>
          <Card className="border-border bg-card p-6 card-shadow">
            <div className="text-3xl">3️⃣</div>
            <h3 className="mt-3 font-display text-xl">Sumas puntos</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Cada acierto suma. La tabla se actualiza después de cada partido. El que más puntos:
              gana.
            </p>
          </Card>
        </div>
        <div className="mt-8 text-center">
          <Button asChild variant="secondary">
            <Link to="/reglas">
              Ver reglas completas <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        <div className="bandera-stripe-h mx-auto mb-4 h-1 w-24 rounded-sm" aria-hidden />
        LA GILIPOLLA · {POLLA.sede} · Polla privada · Solo mayores de edad
      </footer>
    </main>
  );
}
