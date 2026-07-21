import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { POLLA, fmtCOP } from "@/lib/polla";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { ScoringRulesPanel, PtsRow } from "@/components/ScoringRulesPanel";

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
      { property: "og:url", content: `${import.meta.env.VITE_APP_URL}/reglas` },
    ],
    links: [{ rel: "canonical", href: `${import.meta.env.VITE_APP_URL}/reglas` }],
  }),
  component: ReglasPage,
});

function ReglasPage() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const L = lang === "en" ? RULES_EN : RULES_ES;
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      {/* Hero / membrete */}
      <header className="text-center">
        <div className="bandera-stripe-h mx-auto h-1.5 w-24 rounded-sm" aria-hidden />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          {L.officialRules}
        </p>
        <h1 className="mt-2 font-display text-4xl sm:text-6xl">
          LA <span className="gold-gradient-text">GILIPOLLA</span> 2026
        </h1>
        <p className="mt-2 text-base text-muted-foreground">Bar El Guanábano · {L.fifaWc2026}</p>
        <p className="mt-1 text-sm italic text-gold">"¡Qué Polla, por fin salió!"</p>
      </header>

      {/* Resumen rápido */}
      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <Card className="border-gold/40 bg-gold/5 p-5 text-center card-shadow">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{L.entryFee}</p>
          <p className="mt-1 font-display text-3xl text-gold">{fmtCOP(POLLA.cuotaCOP)}</p>
          <p className="text-xs text-muted-foreground">COP · "$100 Lukas"</p>
        </Card>
        <Card className="border-info/40 bg-info/5 p-5 text-center card-shadow">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {L.registrations}
          </p>
          <p className="mt-1 font-display text-2xl">{L.regDates}</p>
          <p className="text-xs text-muted-foreground">{L.regClose}</p>
        </Card>
        <Card className="border-destructive/40 bg-destructive/5 p-5 text-center card-shadow">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{L.prizes}</p>
          <p className="mt-1 font-display text-2xl text-destructive">60% / 20%</p>
          <p className="text-xs text-muted-foreground">{L.prizesSub}</p>
        </Card>
      </section>

      {/* Cómo funciona */}
      <Card className="mt-10 border-border bg-card p-6 card-shadow">
        <h2 className="font-display text-2xl">{L.howItWorks}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{L.how1}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{L.how2}</p>
      </Card>

      {/* Info oficial FIFA */}
      <Card className="mt-6 border-info/30 bg-card p-6 card-shadow">
        <h2 className="font-display text-2xl text-info">🌎 {L.fifaOfficial}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {L.infoFrom}{" "}
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
          {L.fifaFacts.map(([k, v]) => (
            <li key={k}>
              <strong className="text-foreground">{k}:</strong> {v}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs italic text-muted-foreground">{L.fifaNote}</p>
      </Card>

      {/* Sistema de puntos */}
      <div className="mt-10 space-y-6">
        <h2 className="font-display text-3xl">📊 {L.pointsSystem}</h2>

        <ScoringRulesPanel />

        <Card className="border-destructive/30 bg-card p-6 card-shadow">
          <h3 className="font-display text-2xl text-destructive">{L.specialTitle}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{L.specialDesc}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <PtsRow pts="10" color="bg-destructive/20 text-destructive" txt={L.topScorer} />
            <PtsRow pts="10" color="bg-destructive/20 text-destructive" txt={L.topKeeper} />
          </div>
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-sm font-semibold text-foreground">{L.specialHow}</p>
            <p className="mt-1.5 text-sm text-muted-foreground">{L.specialHowAnswer}</p>
          </div>
        </Card>
      </div>

      {/* Premios */}
      <Card className="mt-10 border-gold/40 bg-gold/5 p-6 card-shadow">
        <h2 className="font-display text-2xl text-gold">🏆 {L.prizesTitle}</h2>
        <ul className="mt-3 ml-5 list-disc space-y-2 text-sm text-muted-foreground">
          {L.prizesList.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs italic text-muted-foreground">{L.prizesCeremony}</p>
      </Card>

      {/* Desempates */}
      <Card className="mt-6 border-info/30 bg-card p-6 card-shadow">
        <h2 className="font-display text-2xl text-info">⚖️ {L.tiebreaksTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{L.tiebreaksDesc}</p>
        <ol className="mt-3 ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
          {L.tiebreaksList.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </Card>

      {/* Inscripción y pago */}
      <Card className="mt-6 border-border bg-card p-6 card-shadow">
        <h2 className="font-display text-2xl">📝 {L.regPayTitle}</h2>
        <ul className="mt-3 ml-5 list-disc space-y-2 text-sm text-muted-foreground">
          {L.regPayList.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </Card>

      {/* Sede */}
      <Card className="mt-6 border-gold/30 bg-gold/5 p-6 text-center card-shadow">
        <h2 className="font-display text-2xl text-gold">{L.venueTitle}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{L.venueDesc}</p>
      </Card>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button asChild variant="hero" size="lg">
          <Link to="/registro">{L.ctaRegister}</Link>
        </Button>
        {user && (
          <Button asChild variant="secondary" size="lg">
            <Link to="/planilla">{L.ctaSheet}</Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="lg">
          <Link to="/">{L.ctaHome}</Link>
        </Button>
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground">{L.finalNote}</p>
    </main>
  );
}

type Rules = {
  officialRules: string;
  fifaWc2026: string;
  entryFee: string;
  registrations: string;
  regDates: string;
  regClose: string;
  prizes: string;
  prizesSub: string;
  howItWorks: string;
  how1: string;
  how2: string;
  fifaOfficial: string;
  infoFrom: string;
  fifaFacts: [string, string][];
  fifaNote: string;
  pointsSystem: string;
  specialTitle: string;
  specialDesc: string;
  topScorer: string;
  topKeeper: string;
  specialHow: string;
  specialHowAnswer: string;
  prizesTitle: string;
  prizesList: string[];
  prizesCeremony: string;
  tiebreaksTitle: string;
  tiebreaksDesc: string;
  tiebreaksList: string[];
  regPayTitle: string;
  regPayList: string[];
  venueTitle: string;
  venueDesc: string;
  ctaRegister: string;
  ctaSheet: string;
  ctaHome: string;
  finalNote: string;
};

const RULES_ES: Rules = {
  officialRules: "Reglamento oficial",
  fifaWc2026: "Mundial FIFA 2026",
  entryFee: "Cuota",
  registrations: "Inscripciones",
  regDates: "20 may → 11 jun",
  regClose: "2026 · cierre 10:00 a.m. COT",
  prizes: "Premios",
  prizesSub: "1° y 2° lugar · 20% admin",
  howItWorks: "¿Cómo funciona?",
  how1: "Por la cuota tienes derecho a apostar en todas las rondas del Mundial. En la primera ronda, en los 12 grupos (A–L) eliges los dos primeros clasificados (los terceros, a la mierda). El Grupo K es uno más: también eliges 1° y 2°, y como Colombia está en él, adicionalmente predices el marcador exacto de sus 6 partidos. En las siguientes rondas, hasta la final, se apuesta el marcador de todos los partidos. Los puntos se cuentan a los 90 minutos + reposición — no alargue.",
  how2: "Los ganadores serán quienes tengan los mayores puntajes al final del Mundial. Un apostador puede ir de polla en polla siempre y cuando pague los $100.000 de nuevo. Se permiten seudónimos. Si hay pollas compartidas, deben elegir un capitán que será quien haga preguntas, quejas y reclamos por el grupo.",
  fifaOfficial: "Datos oficiales · FIFA World Cup 2026™",
  infoFrom: "Información tomada de",
  fifaFacts: [
    ["Fechas", "11 de junio – 19 de julio de 2026"],
    ["Anfitriones", "Canadá 🇨🇦 · México 🇲🇽 · EE. UU. 🇺🇸"],
    ["Selecciones", "48 (récord histórico)"],
    ["Formato", "12 grupos de 4 (A–L)"],
    ["Partidos", "104 en total"],
    ["Sedes", "16 ciudades anfitrionas"],
    ["Inauguración", "Estadio Azteca, CDMX"],
    ["Final", "MetLife Stadium, New Jersey · 19 jul"],
  ],
  fifaNote:
    "Clasifican a octavos los 2 primeros de cada grupo y los 8 mejores terceros. Para LA GILIPOLLA solo cuentan 1° y 2° de cada grupo.",
  pointsSystem: "Sistema de puntos",
  specialTitle: "Selecciones especiales",
  specialDesc: "Según los premios oficiales FIFA entregados en la final.",
  topScorer: "Goleador del Mundial.",
  topKeeper: "Mejor arquero del Mundial.",
  specialHow: "¿Y si escribiste el nombre distinto al oficial?",
  specialHowAnswer:
    'Vale igual. Si pusiste el equipo correcto, aceptamos errores pequeños de escritura ("Mbape", "Kyllan Mbappé") y también que hayas puesto solo el apellido ("Mbappé" a secas). Lo que no vale es un jugador de otro equipo: ahí el equipo manda.',
  prizesTitle: "Premios y reparto del pozo",
  prizesList: [
    "60% para el puntaje más alto.",
    "20% para el segundo puesto.",
    "20% restante para gastos de administración.",
  ],
  prizesCeremony: "La ceremonia de premiación será minutos después de terminada la final.",
  tiebreaksTitle: "Desempates",
  tiebreaksDesc:
    "Si hay empate en puntos en cualquiera de los puestos ganadores se aplica este orden:",
  tiebreaksList: [
    "Gana quien tenga más aciertos de 5 puntos.",
    "Si persiste, gana quien tenga más aciertos de 3 puntos.",
    "Si aún persiste, gana quien tenga más aciertos de 2 puntos.",
  ],
  regPayTitle: "Inscripción y pago",
  regPayList: [
    "Inscripciones desde el 20 de mayo hasta el 11 de junio de 2026, 10:00 a.m. COT.",
    "Pago de inscripción solamente con FIFA Uribe y El Rojo.",
    "Paopollas y Hackidevs se ocupan solo del fixture.",
    "Cada formulario será sellado con fecha y hora de entrega.",
    "No se aceptan tachones ni enmendaduras: debe venir con nombre y firma del participante, e incluir el sello de pago.",
    "Después del cierre no se aceptan cambios.",
    "Los formularios y resultados actualizados estarán en el tablero del Bar.",
  ],
  venueTitle: "PA' QUE VENGAN",
  venueDesc:
    'La sede oficial es el Centro Recreativo y Cultural "El Guanábano", situado en la Carrera 43 No. 53-21. Este año la intención es vernos más en el bar, por eso la información del Mundial estará físicamente en él.',
  ctaRegister: "Inscribirme ahora",
  ctaSheet: "Ver la planilla",
  ctaHome: "Volver al inicio",
  finalNote: "Las decisiones del organizador del bar son finales.",
};

const RULES_EN: Rules = {
  officialRules: "Official rules",
  fifaWc2026: "FIFA World Cup 2026",
  entryFee: "Entry fee",
  registrations: "Registrations",
  regDates: "May 20 → Jun 11",
  regClose: "2026 · closes 10:00 a.m. COT",
  prizes: "Prizes",
  prizesSub: "1st & 2nd place · 20% admin",
  howItWorks: "How does it work?",
  how1: "The entry fee lets you bet on every round of the World Cup. In the first round, for the 12 groups (A–L) you pick the top two qualifiers (third place doesn't matter). Group K is one more: you also pick 1st and 2nd, and since Colombia is in it, you additionally predict the exact score of its 6 matches. From the next rounds through the final you predict the exact score of every match. Points are counted at 90 minutes + stoppage time — no extra time.",
  how2: "The winners are the players with the highest scores at the end of the World Cup. A bettor can play several pools as long as they pay the entry fee each time. Pseudonyms are allowed. For shared entries, pick a captain who handles questions, complaints and claims for the group.",
  fifaOfficial: "Official data · FIFA World Cup 2026™",
  infoFrom: "Information taken from",
  fifaFacts: [
    ["Dates", "June 11 – July 19, 2026"],
    ["Hosts", "Canada 🇨🇦 · Mexico 🇲🇽 · USA 🇺🇸"],
    ["Teams", "48 (record number)"],
    ["Format", "12 groups of 4 (A–L)"],
    ["Matches", "104 in total"],
    ["Venues", "16 host cities"],
    ["Opening", "Estadio Azteca, Mexico City"],
    ["Final", "MetLife Stadium, New Jersey · Jul 19"],
  ],
  fifaNote:
    "The top 2 of each group plus the 8 best third-placed teams advance to the round of 16. For LA GILIPOLLA only 1st and 2nd of each group count.",
  pointsSystem: "Points system",
  specialTitle: "Special picks",
  specialDesc: "Based on the official FIFA awards given at the final.",
  topScorer: "Top scorer of the World Cup.",
  topKeeper: "Best goalkeeper of the World Cup.",
  specialHow: "What if you wrote the name differently from the official one?",
  specialHowAnswer:
    'It still counts. If you got the team right, we accept small spelling mistakes ("Mbape", "Kyllan Mbappé") and also just the last name on its own ("Mbappé"). What doesn\'t count is a player from another team — there, the team decides.',
  prizesTitle: "Prizes and pot split",
  prizesList: [
    "60% for the highest score.",
    "20% for second place.",
    "20% remaining for administration costs.",
  ],
  prizesCeremony: "The awards ceremony takes place minutes after the final ends.",
  tiebreaksTitle: "Tiebreakers",
  tiebreaksDesc:
    "If there is a tie on points for any of the winning positions, this order applies:",
  tiebreaksList: [
    "Whoever has more 5-point hits wins.",
    "If it persists, whoever has more 3-point hits wins.",
    "If it still persists, whoever has more 2-point hits wins.",
  ],
  regPayTitle: "Registration and payment",
  regPayList: [
    "Registrations open May 20 through June 11, 2026, 10:00 a.m. COT.",
    "Registration payment only with FIFA Uribe and El Rojo.",
    "Paopollas and Hackidevs only handle the fixture.",
    "Each form is stamped with the date and time of delivery.",
    "No cross-outs or amendments: it must include the participant's name and signature, plus the payment stamp.",
    "No changes accepted after the deadline.",
    "Updated forms and results will be on the Bar board.",
  ],
  venueTitle: "COME ON OVER",
  venueDesc:
    'The official venue is the "El Guanábano" Recreational and Cultural Center, at Carrera 43 No. 53-21. This year the idea is to see each other more at the bar, so the World Cup information will be physically there.',
  ctaRegister: "Register now",
  ctaSheet: "Open the sheet",
  ctaHome: "Back to home",
  finalNote: "The bar organizer's decisions are final.",
};
