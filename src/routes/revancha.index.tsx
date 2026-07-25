import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, ArrowRight, Trophy, Coins } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTournamentState } from "@/hooks/usePolla";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RevanchaPlanillaEditor } from "@/components/RevanchaPlanillaEditor";
import { POLLA, fmtCOP } from "@/lib/polla";
import { useT, tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/revancha/")({
  head: () => ({
    meta: [
      { title: tStatic("revancha.hub.title") },
      { name: "description", content: tStatic("revancha.hub.subtitle") },
    ],
  }),
  component: RevanchaHub,
});

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4">{children}</main>;
}

function RevanchaHub() {
  const t = useT();
  const { user, participant, isAdmin, loading, refresh } = useAuth();
  const { data: ts } = useTournamentState();
  const [requesting, setRequesting] = useState(false);

  if (loading) {
    return (
      <Centered>
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  const cuota = ts?.revancha_cuota_cop ?? 50_000;

  if (!user) {
    return (
      <Centered>
        <Card className="w-full border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <div className="text-4xl">🔄</div>
          <h1 className="mt-3 font-display text-2xl">{t("revancha.hub.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("revancha.hub.intro")}</p>
          <p className="mt-4 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
            {t("revancha.hub.banner", { amount: fmtCOP(cuota) })}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild variant="hero">
              <Link to="/login">{t("revancha.hub.haveAccount")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/revancha/registro">{t("revancha.hub.newSignup")}</Link>
            </Button>
          </div>
        </Card>
      </Centered>
    );
  }

  if (isAdmin && !participant) {
    return (
      <Centered>
        <Card className="w-full border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <div className="text-4xl">🛠️</div>
          <p className="mt-2 text-sm text-muted-foreground">{t("revancha.hub.adminNote")}</p>
          <Button asChild variant="hero" className="mt-6">
            <Link to="/admin/revancha">{t("nav.admin")}</Link>
          </Button>
        </Card>
      </Centered>
    );
  }

  if (!participant) {
    return (
      <Centered>
        <Card className="w-full border-border bg-card p-8 text-center card-shadow">
          <p className="text-sm text-muted-foreground">{t("revancha.hub.noParticipant")}</p>
          <Button asChild variant="hero" className="mt-6">
            <Link to="/revancha/registro">{t("revancha.hub.newSignup")}</Link>
          </Button>
        </Card>
      </Centered>
    );
  }

  const handleEntrar = async () => {
    setRequesting(true);
    try {
      const { error } = await supabase
        .from("participants")
        .update({ estado_pago_revancha: "pendiente" })
        .eq("id", participant.id);
      if (error) throw error;
      await refresh();
      toast.success(t("revancha.hub.requested"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("revancha.hub.requestFailed"));
    } finally {
      setRequesting(false);
    }
  };

  // Nunca pidió entrar: CTA para pedirlo.
  if (participant.estado_pago_revancha == null) {
    return (
      <Centered>
        <Card className="w-full border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <div className="flex justify-center">
            <Trophy className="size-10 text-gold" />
          </div>
          <h1 className="mt-3 font-display text-2xl">{t("revancha.hub.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("revancha.hub.intro")}</p>
          <p className="mt-4 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
            {t("revancha.hub.banner", { amount: fmtCOP(cuota) })}
          </p>
          <Button variant="hero" className="mt-6" disabled={requesting} onClick={handleEntrar}>
            {requesting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {t("revancha.hub.enter")} <ArrowRight className="ml-2 size-4" />
          </Button>
        </Card>
      </Centered>
    );
  }

  if (participant.estado_pago_revancha === "pendiente") {
    return (
      <Centered>
        <Card className="w-full border-gold/40 bg-gold/5 p-8 text-center card-shadow">
          <div className="text-4xl">⏳</div>
          <h1 className="mt-3 font-display text-2xl">{t("revancha.hub.pendingTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("revancha.hub.pendingBody", { sede: POLLA.sede, amount: fmtCOP(cuota) })}
          </p>
        </Card>
      </Centered>
    );
  }

  if (participant.estado_pago_revancha === "rechazado") {
    return (
      <Centered>
        <Card className="w-full border-destructive/40 bg-destructive/5 p-8 text-center card-shadow">
          <div className="text-4xl">❌</div>
          <h1 className="mt-3 font-display text-2xl">{t("revancha.hub.rejectedTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("revancha.hub.rejectedBody", { sede: POLLA.sede })}
          </p>
        </Card>
      </Centered>
    );
  }

  // Aprobado: la planilla reducida.
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <div className="bandera-stripe-h h-1 w-16 rounded-sm" aria-hidden />
      <h1 className="mt-3 font-display text-3xl sm:text-4xl">
        <Coins className="mr-2 inline size-7 text-gold" />
        {t("revancha.hub.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("revancha.hub.intro")}</p>
      <div className="mt-6">
        <RevanchaPlanillaEditor participantId={participant.id} />
      </div>
    </main>
  );
}
