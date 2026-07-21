import { Card } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n";

/* Tablas del sistema de puntos del reglamento (grupos 5/3/1/0 y marcador
 * 5/3/2/1/1/0 + nota de los 90 minutos). Se muestra en /reglas y debajo de
 * la tabla de posiciones (/leaderboard). */

export function PtsRow({ pts, txt, color }: { pts: string; txt: string; color: string }) {
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

type ScoringTexts = {
  groupBetTitle: string;
  groupBetDesc: string;
  gp5: string;
  gp3: string;
  gp1: string;
  gp0: string;
  scoreBetTitle: string;
  scoreBetDesc: string;
  sc5: string;
  sc3: string;
  sc2a: string;
  sc1a: string;
  sc1b: string;
  sc0: string;
  scoreNote: string;
};

const SCORING_ES: ScoringTexts = {
  groupBetTitle: "Apuesta por grupos (1° y 2°)",
  groupBetDesc: "Para cada uno de los 12 grupos (A–L) eliges los dos primeros clasificados.",
  gp5: "Aciertas clasificados en su orden.",
  gp3: "Aciertas clasificados en desorden.",
  gp1: "Aciertas únicamente uno de los clasificados.",
  gp0: "No aciertas ninguno.",
  scoreBetTitle: "Apuesta por marcador · Grupo K y siguientes rondas",
  scoreBetDesc:
    "Predices el marcador exacto de cada partido del Grupo K (Colombia) y, en las siguientes rondas, de todos los partidos hasta la final.",
  sc5: "Marcador exacto del partido.",
  sc3: "Aciertas el equipo ganador Y el número de goles de cualquier equipo.",
  sc2a: "Aciertas solo el equipo ganador (sin importar los goles).",
  sc1a: "Aciertas el empate (sin importar el número de goles).",
  sc1b: "Aciertas la cantidad de goles de un equipo (sin importar el resultado final).",
  sc0: "Ningún acierto.",
  scoreNote:
    "Los marcadores se cuentan a los 90 minutos + reposición. Si hay alargue o penales, no cuenta: solo vale el resultado de los primeros 90 minutos.",
};

const SCORING_EN: ScoringTexts = {
  groupBetTitle: "Group bet (1st & 2nd)",
  groupBetDesc: "For each of the 12 groups (A–L) you pick the two qualifiers.",
  gp5: "Exact 1st and 2nd.",
  gp3: "Both qualifiers, but in the wrong order.",
  gp1: "Only one right (either position).",
  gp0: "Neither right.",
  scoreBetTitle: "Score bet · Group K and later rounds",
  scoreBetDesc:
    "Predict the exact score of every Group K match (Colombia) and, in later rounds, every match through the final.",
  sc5: "Exact match score.",
  sc3: "Correct winner AND the goal count of either team.",
  sc2a: "Correct winner only (regardless of goals).",
  sc1a: "Correct draw (regardless of goals).",
  sc1b: "Correct goal count of one team (regardless of result).",
  sc0: "Nothing right.",
  scoreNote: "Scores count at 90 minutes + stoppage time. No extra time.",
};

export function ScoringRulesPanel() {
  const { lang } = useLanguage();
  const L = lang === "en" ? SCORING_EN : SCORING_ES;
  return (
    <div className="space-y-6">
      <Card className="border-gold/30 bg-card p-6 card-shadow">
        <h3 className="font-display text-2xl text-gold">{L.groupBetTitle}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{L.groupBetDesc}</p>
        <div className="mt-4 grid gap-2">
          <PtsRow pts="5" color="bg-gold/20 text-gold" txt={L.gp5} />
          <PtsRow pts="3" color="bg-info/20 text-info" txt={L.gp3} />
          <PtsRow pts="1" color="bg-muted text-foreground" txt={L.gp1} />
          <PtsRow pts="0" color="bg-destructive/20 text-destructive" txt={L.gp0} />
        </div>
      </Card>

      <Card className="border-info/30 bg-card p-6 card-shadow">
        <h3 className="font-display text-2xl text-info">{L.scoreBetTitle}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{L.scoreBetDesc}</p>
        <div className="mt-4 grid gap-2">
          <PtsRow pts="5" color="bg-gold/20 text-gold" txt={L.sc5} />
          <PtsRow pts="3" color="bg-info/20 text-info" txt={L.sc3} />
          <PtsRow pts="2" color="bg-success/20 text-success" txt={L.sc2a} />
          <PtsRow pts="1" color="bg-muted text-foreground" txt={L.sc1a} />
          <PtsRow pts="1" color="bg-muted text-foreground" txt={L.sc1b} />
          <PtsRow pts="0" color="bg-destructive/20 text-destructive" txt={L.sc0} />
        </div>
        <p className="mt-3 text-xs italic text-muted-foreground">{L.scoreNote}</p>
      </Card>
    </div>
  );
}
