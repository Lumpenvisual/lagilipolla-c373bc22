import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Loader2, ArrowRight, Trophy, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyPick, usePollaLeaderboard, useTournamentState } from "@/hooks/usePolla";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { POLLA, fmtCOP, puedeVerTablaPolla, puedeVerTablaRevancha } from "@/lib/polla";
import { DownloadButton } from "@/components/DownloadButton";
import { generateComprobantePDF } from "@/lib/reports.functions";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Mi cuenta · LA GILIPOLLA 2026" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Dashboard,
});

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4">{children}</main>;
}

function Dashboard() {
  const router = useRouter();
  const { user, participant, isAdmin, loading, signOut } = useAuth();
  const { data: ts } = useTournamentState();

  if (loading) {
    return (
      <Centered>
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  if (!user) {
    return (
      <Centered>
        <Card className="w-full border-border bg-card p-8 text-center card-shadow">
          <p>Debes iniciar sesión.</p>
          <Button className="mt-4" onClick={() => router.navigate({ to: "/login" })}>
            Iniciar sesión
          </Button>
        </Card>
      </Centered>
    );
  }

  if (isAdmin && !participant) {
    return (
      <Centered>
        <Card className="w-full border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <div className="text-4xl">🛠️</div>
          <h1 className="mt-3 font-display text-2xl">Modo organizador</h1>
          <p className="mt-2 text-sm text-muted-foreground">Estás logueado como admin del bar.</p>
          <Button variant="hero" className="mt-6" onClick={() => router.navigate({ to: "/admin" })}>
            Ir al admin
          </Button>
        </Card>
      </Centered>
    );
  }

  // Regla de visibilidad de tablas (una sola fuente de verdad en src/lib/polla.ts, no
  // repetida en cada vista): quién ve el link a CADA tabla según su tipo de inscripción.
  const canViewRevanchaTable = puedeVerTablaRevancha(participant, isAdmin);

  // Solo-revancha: nunca pasó por la polla principal, así que su estado_pago es NULL —
  // no "pendiente" de nada. Rama aparte para no mostrarle el mensaje de pago de la polla.
  if (participant && !participant.en_polla_original) {
    return (
      <SoloRevanchaDashboard
        nombre={participant.nombre}
        canViewRevanchaTable={canViewRevanchaTable}
      />
    );
  }

  const estado = participant?.estado_pago ?? "pendiente";
  const cuota = ts?.cuota_cop ?? POLLA.cuotaCOP;

  if (estado === "pendiente") {
    return (
      <Centered>
        <Card className="w-full border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <div className="text-4xl">⏳</div>
          <h1 className="mt-3 font-display text-2xl">Pago pendiente</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acércate a {POLLA.sede} y paga tu cuota de{" "}
            <span className="text-gold font-semibold">{fmtCOP(cuota)} COP</span>. Cuando el admin
            marque tu pago, podrás llenar tu planilla.
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => signOut().then(() => router.navigate({ to: "/" }))}
          >
            Cerrar sesión
          </Button>
        </Card>
      </Centered>
    );
  }

  if (estado === "rechazado") {
    return (
      <Centered>
        <Card className="w-full border-destructive/40 bg-destructive/5 p-8 text-center card-shadow">
          <div className="text-4xl">❌</div>
          <h1 className="mt-3 font-display text-2xl">Pago rechazado</h1>
          <p className="mt-2 text-sm text-muted-foreground">Habla con el admin en {POLLA.sede}.</p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => signOut().then(() => router.navigate({ to: "/" }))}
          >
            Cerrar sesión
          </Button>
        </Card>
      </Centered>
    );
  }

  return (
    <Approved
      participantId={participant!.id}
      nombre={participant!.nombre}
      estadoRevancha={participant!.estado_pago_revancha}
      canViewRevanchaTable={canViewRevanchaTable}
      canViewPollaTable={puedeVerTablaPolla(participant, isAdmin)}
    />
  );
}

function Approved({
  participantId,
  nombre,
  estadoRevancha,
  canViewRevanchaTable,
  canViewPollaTable,
}: {
  participantId: string;
  nombre: string;
  estadoRevancha: string | null;
  canViewRevanchaTable: boolean;
  canViewPollaTable: boolean;
}) {
  const { data: pick } = useMyPick(participantId);
  const { data: lb = [] } = usePollaLeaderboard();
  const myRow = lb.find((r) => r.participant_id === participantId);
  const planillaCompleta = !!pick && !!pick.goleador_id && !!pick.arquero_id;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
      <h1 className="mt-3 font-display text-3xl sm:text-4xl">
        Hola, <span className="gold-gradient-text">{nombre}</span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Bienvenido a LA GILIPOLLA 2026.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="border-border bg-card p-5 card-shadow">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Mi estado</p>
          <p className="mt-1 font-display text-2xl text-success">✅ Aprobado</p>
        </Card>
        <Card className="border-border bg-card p-5 card-shadow">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Planilla</p>
          <p
            className={`mt-1 font-display text-2xl ${planillaCompleta ? "text-success" : "text-gold"}`}
          >
            {planillaCompleta ? "Completa" : pick ? "En curso" : "Sin llenar"}
          </p>
        </Card>
        <Card className="border-border bg-card p-5 card-shadow">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Puntos</p>
          <p className="mt-1 font-display text-2xl text-gold">{myRow?.puntos_total ?? 0}</p>
        </Card>
      </div>

      <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 border-gold/30 bg-card p-5 card-shadow">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <Trophy className="size-6" />
          </div>
          <div>
            <p className="font-display text-xl">Tu planilla</p>
            <p className="text-sm text-muted-foreground">
              {planillaCompleta
                ? "Puedes editarla hasta el cierre."
                : "Llénala antes del 11 de junio."}
            </p>
          </div>
        </div>
        <Button asChild variant="hero">
          <Link to="/planilla">
            {planillaCompleta ? "Editar planilla" : "Llenar planilla"}{" "}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </Card>

      {canViewPollaTable && (
        <div className="mt-6 flex justify-center">
          <Button asChild variant="secondary">
            <Link to="/leaderboard">
              Ver la tabla <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      )}

      <RevanchaPromoCard
        estadoRevancha={estadoRevancha}
        canViewRevanchaTable={canViewRevanchaTable}
      />

      {!!pick && (
        <Card className="mt-6 border-info/30 bg-card p-5 card-shadow">
          <p className="font-display text-lg">📄 Comprobante oficial</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Descarga tu comprobante oficial en PDF con los datos de tu planilla y un código QR de
            verificación. Cada vez que actualices tu planilla puedes volver a descargarlo con los
            datos al día.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <DownloadButton
              fn={generateComprobantePDF}
              label="Descargar comprobante PDF"
              variant="hero"
              icon={<FileText className="mr-2 size-4" />}
            />
          </div>
        </Card>
      )}
    </main>
  );
}

/** Promo de La Revancha en el dashboard principal — competencia aparte, nunca cambia lo de arriba. */
function RevanchaPromoCard({
  estadoRevancha,
  canViewRevanchaTable,
}: {
  estadoRevancha: string | null;
  canViewRevanchaTable: boolean;
}) {
  const t = useT();
  if (estadoRevancha === "rechazado") return null;

  const label =
    estadoRevancha === "aprobado"
      ? t("revancha.promo.approved")
      : estadoRevancha === "pendiente"
        ? t("revancha.promo.pending")
        : t("revancha.promo.cta");

  return (
    <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 border-gold/30 bg-gold/5 p-5 card-shadow">
      <div>
        <p className="font-display text-lg">🔄 {t("revancha.promo.title")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("revancha.promo.subtitle")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canViewRevanchaTable && (
          <Button asChild variant="ghost">
            <Link to="/revancha/leaderboard">{t("nav.revanchaTabla")}</Link>
          </Button>
        )}
        <Button asChild variant="secondary">
          <Link to="/revancha">
            {label} <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/** Dashboard de quien está SOLO en La Revancha (nunca pasó por la polla principal). */
function SoloRevanchaDashboard({
  nombre,
  canViewRevanchaTable,
}: {
  nombre: string;
  canViewRevanchaTable: boolean;
}) {
  const router = useRouter();
  const { signOut } = useAuth();
  const t = useT();
  return (
    <Centered>
      <Card className="w-full border-gold/40 bg-gold/5 p-8 text-center card-shadow">
        <div className="text-4xl">🔄</div>
        <h1 className="mt-3 font-display text-2xl">{t("dashboard.solorevancha.hi", { nombre })}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("dashboard.solorevancha.body")}</p>
        <Button asChild variant="hero" className="mt-6">
          <Link to="/revancha">
            {t("revancha.hub.title")} <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
        {canViewRevanchaTable && (
          <Button asChild variant="secondary" className="mt-3 w-full">
            <Link to="/revancha/leaderboard">{t("nav.revanchaTabla")}</Link>
          </Button>
        )}
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => signOut().then(() => router.navigate({ to: "/" }))}
        >
          Cerrar sesión
        </Button>
      </Card>
    </Centered>
  );
}
