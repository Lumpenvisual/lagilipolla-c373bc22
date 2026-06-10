import { MapPin, Trophy, Users, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { POLLA, fmtCOP } from "@/lib/polla";
import heroStadium from "@/assets/hero-stadium.jpg";

const HIGHLIGHTS: Array<{
  icon: typeof Users;
  value: string;
  label: string;
  sub?: string;
}> = [
  { icon: Users, value: "48", label: "selecciones · 12 grupos" },
  {
    icon: Trophy,
    value: "60% / 20%",
    label: "1° y 2° lugar",
    sub: "20% administración",
  },
  { icon: CalendarDays, value: "Jun–Jul", label: "todo el Mundial 2026" },
];

/** Sección "Sobre LA GILIPOLLA": qué es la polla y el bar que la organiza. */
export function AboutSection() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        {/* Texto */}
        <div>
          <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Sobre la polla
          </p>
          <h2 className="mt-2 font-display text-3xl tracking-wide sm:text-4xl">
            La tradición mundialista del{" "}
            <span className="gold-gradient-text">Bar El Guanábano</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            LA GILIPOLLA es la polla oficial del Mundial 2026 del bar. Por{" "}
            <span className="font-semibold text-gold">{fmtCOP(POLLA.cuotaCOP)} COP</span> tienes
            derecho a apostar en <strong className="text-foreground">todas las rondas</strong>: en
            la primera, los marcadores del Grupo K (Colombia) y los dos primeros de cada grupo; en
            las siguientes, todos los partidos hasta la final. Cada acierto suma y la tabla se
            actualiza partido a partido.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Es una competencia que acumula puntos a lo largo de todo el Mundial: gana quien logre el
            mayor puntaje al final. <em className="text-gold">"¡Qué Polla, por fin salió!"</em>
          </p>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, value, label, sub }) => (
              <Card key={label} className="border-border bg-card p-4 text-center card-shadow">
                <Icon className="mx-auto size-5 text-gold" />
                <p className="mt-2 font-display text-2xl leading-none">{value}</p>
                <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{label}</p>
                {sub && (
                  <p className="mt-0.5 text-[9px] leading-tight text-muted-foreground/70">{sub}</p>
                )}
              </Card>
            ))}
          </div>

          <Card className="mt-4 flex items-start gap-3 border-gold/30 bg-gold/5 p-4 card-shadow">
            <MapPin className="mt-0.5 size-5 shrink-0 text-gold" />
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Sede oficial:</span> {POLLA.sede}.
              Toda la información del Mundial está físicamente en el bar — la idea es vernos más por
              allá. <span className="font-semibold text-foreground">¡PA' QUE VENGAN!</span>
            </p>
          </Card>
        </div>

        {/* Imagen */}
        <div className="relative">
          <div className="ambient-blob -right-10 top-1/4 size-72 bg-gold/15" aria-hidden />
          <div className="relative overflow-hidden rounded-2xl border border-gold/30 card-shadow">
            <img
              src={heroStadium}
              alt="Ambiente de estadio en el Bar El Guanábano"
              className="aspect-[4/3] w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-5">
              <p className="font-display text-2xl">El Guanábano</p>
              <p className="text-xs text-muted-foreground">
                Centro Recreativo y Cultural · Carrera 43 No. 53-21
              </p>
            </div>
            <div className="bandera-stripe-h absolute inset-x-0 top-0 h-1.5" aria-hidden />
          </div>
        </div>
      </div>
    </section>
  );
}
