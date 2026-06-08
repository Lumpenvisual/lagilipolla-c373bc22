import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Scroll,
  Shield,
  Trophy,
  Clock,
  AlertTriangle,
  Users,
  CheckCircle,
  Layers,
} from "lucide-react";
import { ADMIN_EMAIL } from "@/lib/constants";
import { MODALIDAD_LABEL, MODALIDAD_DESC, MODALIDAD_ICON, type Modalidad } from "@/lib/concursos";
import { useT, tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/reglas")({
  head: () => ({
    meta: [
      { title: tStatic("reglas.meta.title") },
      { name: "description", content: tStatic("reglas.meta.desc") },
    ],
  }),
  component: ReglasPage,
});

const MODALIDADES: Modalidad[] = ["partido", "dia", "fase", "mundial"];

function ReglasPage() {
  const t = useT();
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="text-center">
        <h1 className="font-display text-4xl tracking-wide sm:text-5xl">
          <span aria-hidden>📋 </span>
          <span className="gold-gradient-text">{t("reglas.title")}</span>
        </h1>
        <p className="mt-3 text-muted-foreground">{t("reglas.subtitle")}</p>
      </div>

      <div className="mt-10 space-y-8">
        {/* MODALIDADES */}
        <Card className="border-border bg-card card-shadow">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Layers className="size-5" />
            </div>
            <CardTitle className="font-display text-xl tracking-wide">{t("reglas.mod.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              {t("reglas.mod.p1a")}{" "}
              <span className="font-semibold text-foreground">{t("reglas.mod.p1b")}</span>{" "}
              {t("reglas.mod.p1c")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODALIDADES.map((m) => {
                const Icon = MODALIDAD_ICON[m];
                return (
                  <Link
                    key={m}
                    to="/jugar/$modalidad"
                    params={{ modalidad: m }}
                    className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 transition-colors hover:border-primary/40 hover:bg-muted/60"
                  >
                    <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">{t(MODALIDAD_LABEL[m])}</p>
                      <p className="text-xs">{t(MODALIDAD_DESC[m])}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
            <p className="text-xs">
              {t("reglas.mod.p2a")}{" "}
              <span className="font-semibold text-foreground">{t("reglas.mod.p2b")}</span>
              {t("reglas.mod.p2c")}
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link to="/jugar">{t("reglas.mod.cta")}</Link>
            </Button>

          </CardContent>
        </Card>

        {/* INSCRIPCIÓN */}
        <Card className="border-border bg-card card-shadow">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Users className="size-5" />
            </div>
            <CardTitle className="font-display text-xl tracking-wide">{t("reglas.ins.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="ml-4 list-disc space-y-2">
              <li>
                {t("reglas.ins.li1a")} <span className="font-semibold text-foreground">{t("reglas.ins.li1b")}</span>{" "}
                {t("reglas.ins.li1c")} <span className="font-semibold text-foreground">{t("reglas.ins.li1d")}</span>.
              </li>
              <li>
                {t("reglas.ins.li2a")}{" "}
                <Link
                  to="/concursos"
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  {t("reglas.ins.li2b")}
                </Link>
                {t("reglas.ins.li2c")}
              </li>
              <li>
                {t("reglas.ins.li3a")}{" "}
                <span className="font-semibold text-foreground">{ADMIN_EMAIL}</span> {t("reglas.ins.li3c")}
              </li>
              <li>
                {t("reglas.ins.li4a")}{" "}
                <span className="font-semibold text-success">{t("reglas.ins.li4b")}</span>
                {t("reglas.ins.li4c")}
              </li>
              <li>{t("reglas.ins.li5")}</li>
            </ul>
          </CardContent>
        </Card>

        {/* PRONÓSTICOS */}
        <Card className="border-border bg-card card-shadow">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Scroll className="size-5" />
            </div>
            <CardTitle className="font-display text-xl tracking-wide">{t("reglas.pro.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="ml-4 list-disc space-y-2">
              <li>
                {t("reglas.pro.li1a")}{" "}
                <span className="font-semibold text-foreground">{t("reglas.pro.li1b")}</span>{" "}
                {t("reglas.pro.li1c")}
              </li>
              <li>
                {t("reglas.pro.li2a")}{" "}
                <span className="font-semibold text-foreground">{t("reglas.pro.li2b")}</span>{" "}
                {t("reglas.pro.li2c")}
              </li>
              <li>
                <span className="font-semibold text-destructive">{t("reglas.pro.li3")}</span>{" "}
                {t("reglas.pro.li3b")}
              </li>
              <li>
                {t("reglas.pro.li4a")}{" "}
                <span className="font-semibold text-foreground">{t("reglas.pro.li4b")}</span>{" "}
                {t("reglas.pro.li4c")}
              </li>
              <li>
                {t("reglas.pro.li5a")}{" "}
                <span className="font-semibold text-success">{t("reglas.pro.li5b")}</span>{" "}
                {t("reglas.pro.li5c")}
              </li>
              <li>{t("reglas.pro.li6")}</li>
            </ul>
          </CardContent>
        </Card>

        {/* SISTEMA DE PUNTOS */}
        <Card className="border-border bg-card card-shadow">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <CheckCircle className="size-5" />
            </div>
            <CardTitle className="font-display text-xl tracking-wide">{t("reglas.pts.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>{t("reglas.pts.intro")}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
                <div className="font-display text-4xl text-primary">3</div>
                <p className="mt-1 font-semibold text-foreground">{t("reglas.pts.exact")}</p>
                <p className="text-xs">{t("reglas.pts.exactDesc")}</p>
              </div>
              <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-center">
                <div className="font-display text-4xl text-success">1</div>
                <p className="mt-1 font-semibold text-foreground">{t("reglas.pts.result")}</p>
                <p className="text-xs">{t("reglas.pts.resultDesc")}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-center">
                <div className="font-display text-4xl text-muted-foreground">0</div>
                <p className="mt-1 font-semibold text-foreground">{t("reglas.pts.miss")}</p>
                <p className="text-xs">{t("reglas.pts.missDesc")}</p>
              </div>
            </div>
            <p>
              {t("reglas.pts.example1")}{" "}
              <span className="font-semibold text-primary">{t("reglas.pts.example2")}</span>
              {t("reglas.pts.example3")}{" "}
              <span className="font-semibold text-success">{t("reglas.pts.example4")}</span>
              {t("reglas.pts.example5")}{" "}
              <span className="font-semibold text-muted-foreground">{t("reglas.pts.example6")}</span>.
            </p>
          </CardContent>
        </Card>

        {/* PREMIOS */}
        <Card className="border-gold/30 bg-card card-shadow">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gold/15 text-gold">
              <Trophy className="size-5" />
            </div>
            <CardTitle className="font-display text-xl tracking-wide">{t("reglas.prizes.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              {t("reglas.prizes.intro1")}{" "}
              <span className="font-semibold text-foreground">{t("reglas.prizes.intro2")}</span>{" "}
              {t("reglas.prizes.intro3")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4">
                <span className="text-2xl">🥇</span>
                <div>
                  <p className="font-semibold text-foreground">{t("reglas.prizes.p1")}</p>
                  <p className="text-gold font-display text-xl">60%</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4">
                <span className="text-2xl">🥈</span>
                <div>
                  <p className="font-semibold text-foreground">{t("reglas.prizes.p2")}</p>
                  <p className="text-gold font-display text-xl">25%</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4">
                <span className="text-2xl">🥉</span>
                <div>
                  <p className="font-semibold text-foreground">{t("reglas.prizes.p3")}</p>
                  <p className="text-gold font-display text-xl">10%</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4">
                <span className="text-2xl">4️⃣</span>
                <div>
                  <p className="font-semibold text-foreground">{t("reglas.prizes.p4")}</p>
                  <p className="text-gold font-display text-xl">5%</p>
                </div>
              </div>
            </div>
            <p className="text-xs">{t("reglas.prizes.tie")}</p>
          </CardContent>
        </Card>

        {/* DESEMPATES */}
        <Card className="border-border bg-card card-shadow">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Shield className="size-5" />
            </div>
            <CardTitle className="font-display text-xl tracking-wide">{t("reglas.tie.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{t("reglas.tie.intro")}</p>
            <ol className="ml-4 list-decimal space-y-2">
              <li>
                <span className="font-semibold text-foreground">{t("reglas.tie.li1")}</span>{" "}
                {t("reglas.tie.li1b")}
              </li>
              <li>
                {t("reglas.tie.li2a")}{" "}
                <span className="font-semibold text-foreground">{t("reglas.tie.li2b")}</span>.
              </li>
            </ol>
            <div className="rounded-xl border border-info/30 bg-info/5 p-4 text-xs">
              <p className="font-semibold text-info">{t("reglas.tie.exTitle")}</p>
              <p className="mt-1">{t("reglas.tie.exBody")}</p>
            </div>
          </CardContent>
        </Card>

        {/* REGLAS GENERALES */}
        <Card className="border-border bg-card card-shadow">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <AlertTriangle className="size-5" />
            </div>
            <CardTitle className="font-display text-xl tracking-wide">{t("reglas.gen.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="ml-4 list-disc space-y-2">
              <li>{t("reglas.gen.li1")}</li>
              <li>{t("reglas.gen.li2")}</li>
              <li>{t("reglas.gen.li3")}</li>
              <li>{t("reglas.gen.li4")}</li>
            </ul>
          </CardContent>
        </Card>

        {/* CALENDARIO */}
        <Card className="border-border bg-card card-shadow">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Clock className="size-5" />
            </div>
            <CardTitle className="font-display text-xl tracking-wide">{t("reglas.cal.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="ml-4 list-disc space-y-2">
              <li>
                <span className="font-semibold text-foreground">{t("reglas.cal.li1a")}</span> {t("reglas.cal.li1b")}
              </li>
              <li>
                <span className="font-semibold text-foreground">{t("reglas.cal.li2a")}</span> {t("reglas.cal.li2b")}
              </li>
              <li>
                <span className="font-semibold text-foreground">{t("reglas.cal.li3a")}</span> {t("reglas.cal.li3b")}
              </li>
              <li>
                <span className="font-semibold text-foreground">{t("reglas.cal.li4a")}</span> {t("reglas.cal.li4b")}
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button asChild variant="hero" size="lg">
          <Link to="/concursos">{t("reglas.footer.viewContests")}</Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link to="/">{t("reglas.footer.home")}</Link>
        </Button>
      </div>
    </main>
  );
}
