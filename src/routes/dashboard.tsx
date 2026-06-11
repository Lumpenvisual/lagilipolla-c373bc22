import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Loader2, ArrowRight, Trophy, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyPick, usePollaLeaderboard } from "@/hooks/usePolla";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { POLLA, fmtCOP } from "@/lib/polla";
import { DownloadButton } from "@/components/DownloadButton";
import { generateComprobantePDF } from "@/lib/reports.functions";
import { PickHistoryCard } from "@/components/PickHistoryCard";
import { ChangePinCard } from "@/components/ChangePinCard";

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

  const estado = participant?.estado_pago ?? "pendiente";

  if (estado === "pendiente") {
    return (
      <Centered>
        <Card className="w-full border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <div className="text-4xl">⏳</div>
          <h1 className="mt-3 font-display text-2xl">Pago pendiente</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acércate a {POLLA.sede} y paga tu cuota de{" "}
            <span className="text-gold font-semibold">{fmtCOP(POLLA.cuotaCOP)} COP</span>. Cuando el
            admin marque tu pago, podrás llenar tu planilla.
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

  return <Approved participantId={participant!.id} nombre={participant!.nombre} />;
}

function Approved({ participantId, nombre }: { participantId: string; nombre: string }) {
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

      <div className="mt-6 flex justify-center">
        <Button asChild variant="secondary">
          <Link to="/leaderboard">
            Ver la tabla <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

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

      <div className="mt-6">
        <ChangePinCard />
      </div>

      <div className="mt-6">
        <PickHistoryCard scope="mine" participantId={participantId} />
      </div>
    </main>
  );
}
