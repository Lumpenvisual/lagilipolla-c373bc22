import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { POLLA, fmtCOP } from "@/lib/polla";

export const Route = createFileRoute("/reglas")({
  head: () => ({
    meta: [
      { title: "Reglamento oficial · LA GILIPOLLA 2026" },
      {
        name: "description",
        content:
          "Reglamento oficial de la polla mundialista LA GILIPOLLA 2026 en Bar El Guanábano: cuota, puntos, desempates, premios y fechas.",
      },
      { property: "og:title", content: "Reglamento oficial · LA GILIPOLLA 2026" },
      {
        property: "og:description",
        content:
          "Cuota $100.000 COP, premio 60/20, cierre 11 de junio. Todas las reglas oficiales del Mundial 2026.",
      },
      { property: "og:url", content: "https://lagilipolla.lovable.app/reglas" },
    ],
    links: [{ rel: "canonical", href: "https://lagilipolla.lovable.app/reglas" }],
  }),
  component: ReglasPage,
});

function PtsRow({ pts, txt, color }: { pts: string; txt: string; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg font-display text-xl ${color}`}
      >
        {pts}
      </div>
      <p className="text-sm text-muted-foreground">{txt}</p>
    </div>
  );
}

function ReglasPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      {/* Hero / membrete */}
      <header className="text-center">
        <div className="bandera-stripe-h mx-auto h-1.5 w-24 rounded-sm" aria-hidden />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Reglamento oficial
        </p>
        <h1 className="mt-2 font-display text-4xl sm:text-6xl">
          LA <span className="gold-gradient-text">GILIPOLLA</span> 2026
        </h1>
        <p className="mt-2 text-base text-muted-foreground">Bar El Guanábano · Mundial FIFA 2026</p>
        <p className="mt-1 text-sm italic text-gold">"¡Qué Polla, por fin salió!"</p>
      </header>

      {/* Resumen rápido */}
      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <Card className="border-gold/40 bg-gold/5 p-5 text-center card-shadow">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Cuota</p>
          <p className="mt-1 font-display text-3xl text-gold">{fmtCOP(POLLA.cuotaCOP)}</p>
          <p className="text-xs text-muted-foreground">COP · "$100 Lukas"</p>
        </Card>
        <Card className="border-info/40 bg-info/5 p-5 text-center card-shadow">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Inscripciones</p>
          <p className="mt-1 font-display text-2xl">20 may → 11 jun</p>
          <p className="text-xs text-muted-foreground">2026 · cierre 10:00 a.m. COT</p>
        </Card>
        <Card className="border-destructive/40 bg-destructive/5 p-5 text-center card-shadow">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Premios</p>
          <p className="mt-1 font-display text-2xl text-destructive">60% / 20%</p>
          <p className="text-xs text-muted-foreground">1° y 2° lugar · 20% admin</p>
        </Card>
      </section>

      {/* Cómo funciona */}
      <Card className="mt-10 border-border bg-card p-6 card-shadow">
        <h2 className="font-display text-2xl">¿Cómo funciona?</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Por <span className="font-semibold text-gold">{fmtCOP(POLLA.cuotaCOP)} COP</span> tienes
          derecho a apostar en{" "}
          <strong className="text-foreground">todas las rondas del Mundial</strong>. En la primera
          ronda, en <strong className="text-foreground">los 12 grupos (A–L)</strong> eliges los{" "}
          <strong className="text-foreground">dos primeros clasificados</strong> (los terceros, a la
          mierda). El <strong className="text-foreground">Grupo K es uno más</strong>: también
          eliges 1° y 2°, y como Colombia está en él, adicionalmente predices el{" "}
          <strong className="text-foreground">marcador exacto de sus 6 partidos</strong>. En las
          siguientes rondas, hasta la final, se apuesta el marcador de todos los partidos. Los
          puntos se cuentan a los <em>90 minutos + reposición</em> — no alargue.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">
            Los ganadores serán quienes tengan los mayores puntajes al final del Mundial.
          </strong>
          Un apostador puede ir de polla en polla siempre y cuando pague los $100.000 de nuevo. Se
          permiten seudónimos. Si hay pollas compartidas, deben elegir un <em>capitán</em> que será
          quien haga preguntas, quejas y reclamos por el grupo.
        </p>
      </Card>

      {/* Info oficial FIFA */}
      <Card className="mt-6 border-info/30 bg-card p-6 card-shadow">
        <h2 className="font-display text-2xl text-info">🌎 Datos oficiales · FIFA World Cup 2026™</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Información tomada de{" "}
          <a
            href="https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026"
            target="_blank"
            rel="noopener noreferrer"
            className="text-info underline underline-offset-2"
          >
            fifa.com
          </a>
          .
        </p>
        <ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li>
            <strong className="text-foreground">Fechas:</strong> 11 de junio – 19 de julio de 2026
          </li>
          <li>
            <strong className="text-foreground">Anfitriones:</strong> Canadá 🇨🇦 · México 🇲🇽 · EE. UU. 🇺🇸
          </li>
          <li>
            <strong className="text-foreground">Selecciones:</strong> 48 (récord histórico)
          </li>
          <li>
            <strong className="text-foreground">Formato:</strong> 12 grupos de 4 (A–L)
          </li>
          <li>
            <strong className="text-foreground">Partidos:</strong> 104 en total
          </li>
          <li>
            <strong className="text-foreground">Sedes:</strong> 16 ciudades anfitrionas
          </li>
          <li>
            <strong className="text-foreground">Inauguración:</strong> Estadio Azteca, CDMX
          </li>
          <li>
            <strong className="text-foreground">Final:</strong> MetLife Stadium, New Jersey · 19 jul
          </li>
        </ul>
        <p className="mt-3 text-xs italic text-muted-foreground">
          Clasifican a octavos los <strong className="not-italic text-foreground">2 primeros</strong>{" "}
          de cada grupo y los <strong className="not-italic text-foreground">8 mejores terceros</strong>
          . Para LA GILIPOLLA solo cuentan 1° y 2° de cada grupo.
        </p>
      </Card>

      {/* Sistema de puntos */}
      <div className="mt-10 space-y-6">
        <h2 className="font-display text-3xl">📊 Sistema de puntos</h2>

        <Card className="border-gold/30 bg-card p-6 card-shadow">
          <h3 className="font-display text-2xl text-gold">Apuesta por grupos (1° y 2°)</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Para cada uno de los 12 grupos (A–L) eliges los dos primeros clasificados.
          </p>
          <div className="mt-4 grid gap-2">
            <PtsRow pts="5" color="bg-gold/20 text-gold" txt="Aciertas 1° y 2° exactos." />
            <PtsRow
              pts="3"
              color="bg-info/20 text-info"
              txt="Aciertas los dos primeros, pero en desorden."
            />
            <PtsRow
              pts="1"
              color="bg-muted text-foreground"
              txt="Aciertas solo uno (en cualquier posición)."
            />
            <PtsRow pts="0" color="bg-destructive/20 text-destructive" txt="No aciertas ninguno." />
          </div>
        </Card>

        <Card className="border-info/30 bg-card p-6 card-shadow">
          <h3 className="font-display text-2xl text-info">
            Apuesta por marcador · Grupo K y siguientes rondas
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Predices el marcador exacto de cada partido del Grupo K (Colombia) y, en las siguientes
            rondas, de todos los partidos hasta la final.
          </p>
          <div className="mt-4 grid gap-2">
            <PtsRow pts="5" color="bg-gold/20 text-gold" txt="Marcador exacto del partido." />
            <PtsRow
              pts="3"
              color="bg-info/20 text-info"
              txt="Aciertas el equipo ganador Y el número de goles de cualquier equipo."
            />
            <PtsRow
              pts="2"
              color="bg-success/20 text-success"
              txt="Aciertas solo el equipo ganador (sin importar los goles)."
            />
            <PtsRow
              pts="1"
              color="bg-muted text-foreground"
              txt="Aciertas el empate (sin importar el número de goles)."
            />
            <PtsRow
              pts="1"
              color="bg-muted text-foreground"
              txt="Aciertas la cantidad de goles de un equipo (sin importar el resultado final)."
            />
            <PtsRow pts="0" color="bg-destructive/20 text-destructive" txt="Ningún acierto." />
          </div>
          <p className="mt-3 text-xs italic text-muted-foreground">
            Los marcadores se cuentan a los 90 minutos + reposición.{" "}
            <strong className="not-italic">No alargue.</strong>
          </p>
        </Card>

        <Card className="border-destructive/30 bg-card p-6 card-shadow">
          <h3 className="font-display text-2xl text-destructive">Selecciones especiales</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Según los premios oficiales FIFA entregados en la final.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <PtsRow
              pts="10"
              color="bg-destructive/20 text-destructive"
              txt="Goleador del Mundial."
            />
            <PtsRow
              pts="10"
              color="bg-destructive/20 text-destructive"
              txt="Mejor arquero del Mundial."
            />
          </div>
        </Card>
      </div>

      {/* Premios */}
      <Card className="mt-10 border-gold/40 bg-gold/5 p-6 card-shadow">
        <h2 className="font-display text-2xl text-gold">🏆 Premios y reparto del pozo</h2>
        <ul className="mt-3 ml-5 list-disc space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">60%</strong> para el puntaje más alto.
          </li>
          <li>
            <strong className="text-foreground">20%</strong> para el segundo puesto.
          </li>
          <li>
            <strong className="text-foreground">20%</strong> restante para gastos de administración.
          </li>
        </ul>
        <p className="mt-3 text-xs italic text-muted-foreground">
          La ceremonia de premiación será minutos después de terminada la final.
        </p>
      </Card>

      {/* Desempates */}
      <Card className="mt-6 border-info/30 bg-card p-6 card-shadow">
        <h2 className="font-display text-2xl text-info">⚖️ Desempates</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Si hay empate en puntos en cualquiera de los puestos ganadores se aplica este orden:
        </p>
        <ol className="mt-3 ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
          <li>
            Gana quien tenga <strong className="text-foreground">más aciertos de 5 puntos</strong>.
          </li>
          <li>
            Si persiste, gana quien tenga{" "}
            <strong className="text-foreground">más aciertos de 3 puntos</strong>.
          </li>
          <li>
            Si aún persiste, gana quien tenga{" "}
            <strong className="text-foreground">más aciertos de 2 puntos</strong>.
          </li>
        </ol>
      </Card>

      {/* Inscripción y pago */}
      <Card className="mt-6 border-border bg-card p-6 card-shadow">
        <h2 className="font-display text-2xl">📝 Inscripción y pago</h2>
        <ul className="mt-3 ml-5 list-disc space-y-2 text-sm text-muted-foreground">
          <li>
            Inscripciones desde el <strong className="text-foreground">20 de mayo</strong> hasta el{" "}
            <strong className="text-foreground">11 de junio de 2026, 10:00 a.m. COT</strong>.
          </li>
          <li>
            Pago de inscripción{" "}
            <strong className="text-foreground">solamente con FIFA Uribe y El Rojo</strong>.
          </li>
          <li>Paopollas y Eduardo Colina se ocupan solo del fixture.</li>
          <li>Cada formulario será sellado con fecha y hora de entrega.</li>
          <li>
            No se aceptan tachones ni enmendaduras: debe venir con nombre y firma del participante,
            e incluir el sello de pago.
          </li>
          <li>Después del cierre no se aceptan cambios.</li>
          <li>Los formularios y resultados actualizados estarán en el tablero del Bar.</li>
        </ul>
      </Card>

      {/* Sede */}
      <Card className="mt-6 border-gold/30 bg-gold/5 p-6 text-center card-shadow">
        <h2 className="font-display text-2xl text-gold">PA' QUE VENGAN</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          La sede oficial es el{" "}
          <strong className="text-foreground">Centro Recreativo y Cultural "El Guanábano"</strong>,{" "}
          situado en la <strong className="text-foreground">Carrera 43 No. 53-21</strong>. Este año
          la intención es vernos más en el bar, por eso la información del Mundial estará
          físicamente en él.
        </p>
      </Card>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button asChild variant="hero" size="lg">
          <Link to="/registro">Inscribirme ahora</Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link to="/planilla">Ver la planilla</Link>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link to="/">Volver al inicio</Link>
        </Button>
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Las decisiones del organizador del bar son finales.
      </p>
    </main>
  );
}
