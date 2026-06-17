import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlanillaEditor } from "@/components/PlanillaEditor";

export const Route = createFileRoute("/planilla")({
  head: () => ({
    meta: [
      { title: "Planilla · LA GILIPOLLA 2026" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Planilla,
});

function Planilla() {
  const t = useT();
  const { user, participant, loading } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  // Estados del perfil: sin inscripción → registro; pendiente/rechazado → cuenta; aprobado → planilla.
  if (!participant) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <p className="text-sm text-muted-foreground">{t("planilla.noParticipant")}</p>
          <Button className="mt-4" asChild>
            <Link to="/registro">{t("planilla.goRegister")}</Link>
          </Button>
        </Card>
      </main>
    );
  }
  if (participant.estado_pago !== "aprobado") {
    const msgKey =
      participant.estado_pago === "rechazado"
        ? "planilla.pagoRechazado"
        : participant.estado_pago === "pendiente"
          ? "planilla.pagoPendiente"
          : "planilla.notApproved";
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card className="border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <p className="text-sm text-muted-foreground">{t(msgKey)}</p>
          <Button className="mt-4" asChild>
            <Link to="/dashboard">{t("planilla.goAccount")}</Link>
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <PlanillaEditor participantId={participant.id} />
    </main>
  );
}
