import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { POLLA, fmtCOP } from "@/lib/polla";

export const Route = createFileRoute("/reglas")({
  head: () => ({ meta: [{ title: "Reglas · LA GILIPOLLA 2026" }] }),
  component: ReglasPage,
});

function PtsRow({ pts, txt, color }: { pts: string; txt: string; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg font-display text-xl ${color}`}>{pts}</div>
      <p className="text-sm text-muted-foreground">{txt}</p>
    </div>
  );
}

function ReglasPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
      <h1 className="mt-3 font-display text-4xl sm:text-5xl">📋 Reglas</h1>
      <p className="mt-2 text-muted-foreground">Polla del Mundial 2026 · cuota {fmtCOP(POLLA.cuotaCOP)} COP · {POLLA.sede}.</p>

      <div className="mt-8 space-y-6">
        <Card className="border-gold/30 bg-card p-6 card-shadow">
          <h2 className="font-display text-2xl text-gold">1ª ronda · Grupos</h2>
          <p className="mt-2 text-sm text-muted-foreground">Acierta el 1° y 2° de cada uno de los 12 grupos.</p>
          <div className="mt-4 grid gap-2">
            <PtsRow pts="5" color="bg-gold/20 text-gold" txt="Aciertas 1° y 2° exactos." />
            <PtsRow pts="3" color="bg-info/20 text-info" txt="Aciertas ambos pero invertidos." />
            <PtsRow pts="1" color="bg-muted text-foreground" txt="Aciertas solo uno (en cualquier posición)." />
            <PtsRow pts="0" color="bg-destructive/20 text-destructive" txt="No aciertas ninguno." />
          </div>
        </Card>

        <Card className="border-info/30 bg-card p-6 card-shadow">
          <h2 className="font-display text-2xl text-info">Apuesta · Grupo K (Colombia)</h2>
          <p className="mt-2 text-sm text-muted-foreground">Predice el marcador de cada uno de los 6 partidos del Grupo K.</p>
          <div className="mt-4 grid gap-2">
            <PtsRow pts="5" color="bg-gold/20 text-gold" txt="Marcador exacto." />
            <PtsRow pts="3" color="bg-info/20 text-info" txt="Acierta ganador y diferencia de goles." />
            <PtsRow pts="2" color="bg-success/20 text-success" txt="Acierta solo el ganador (o el empate)." />
            <PtsRow pts="1" color="bg-muted text-foreground" txt="Acierta solo un marcador (local o visitante)." />
            <PtsRow pts="0" color="bg-destructive/20 text-destructive" txt="No acierta nada." />
          </div>
        </Card>

        <Card className="border-destructive/30 bg-card p-6 card-shadow">
          <h2 className="font-display text-2xl text-destructive">Especiales</h2>
          <p className="mt-2 text-sm text-muted-foreground">Cada acierto vale 10 puntos.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <PtsRow pts="10" color="bg-destructive/20 text-destructive" txt="Goleador del Mundial." />
            <PtsRow pts="10" color="bg-destructive/20 text-destructive" txt="Mejor arquero del Mundial." />
          </div>
        </Card>

        <Card className="border-border bg-card p-6 card-shadow">
          <h2 className="font-display text-2xl">Reglas generales</h2>
          <ul className="mt-3 ml-5 list-disc space-y-2 text-sm text-muted-foreground">
            <li>Cuota: <span className="font-semibold text-gold">{fmtCOP(POLLA.cuotaCOP)} COP</span> · se paga en {POLLA.sede}.</li>
            <li>Cierre de planilla: <span className="font-semibold text-foreground">11 de junio de 2026 · 10:00 a.m. (COT)</span>.</li>
            <li>Después del cierre no se aceptan cambios.</li>
            <li>Los repechajes (UEFA y FIFA) se resuelven en marzo. Si tu candidato no gana el repechaje, no suma puntos en ese grupo.</li>
            <li>El que más puntos al final del Mundial: gana el pozo.</li>
            <li>Decisiones del organizador del bar son finales.</li>
          </ul>
        </Card>
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button asChild variant="hero" size="lg"><Link to="/registro">Inscribirme</Link></Button>
        <Button asChild variant="secondary" size="lg"><Link to="/">Volver</Link></Button>
      </div>
    </main>
  );
}