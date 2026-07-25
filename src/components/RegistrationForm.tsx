import { useState } from "react";
import { useRouter, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useTournamentState } from "@/hooks/usePolla";
import { useT } from "@/lib/i18n";
import { ALIAS_RE, PIN_RE, aliasToEmail, pinToPassword } from "@/lib/auth";
import { POLLA, fmtCOP } from "@/lib/polla";

export function RegistrationForm({ mode = "polla" }: { mode?: "polla" | "revancha" }) {
  const router = useRouter();
  const t = useT();
  const { refresh } = useAuth();
  const { data: ts } = useTournamentState();
  const cuota =
    mode === "revancha" ? (ts?.revancha_cuota_cop ?? 50_000) : (ts?.cuota_cop ?? POLLA.cuotaCOP);
  const [alias, setAlias] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showPin2, setShowPin2] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Alias ya registrado (por CUALQUIERA — no sabemos si es de quien está viendo esto). El
  // mensaje no debe insinuar que la cuenta existente es suya ni mostrar ningún dato de ella
  // (nombre, email, estado): solo que el alias está tomado, con un enlace a login para quien
  // sí sea su cuenta. Ver tarea "mensaje y prevención cuando el alias ya existe".
  const [aliasTaken, setAliasTaken] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = alias.trim();
    if (!ALIAS_RE.test(name)) {
      toast.error(t("reg.err.alias"));
      return;
    }
    if (!PIN_RE.test(pin)) {
      toast.error(t("reg.err.pin"));
      return;
    }
    if (pin !== pin2) {
      toast.error(t("reg.err.pinMatch"));
      return;
    }
    if (!accepted) {
      toast.error(t("reg.err.accept"));
      return;
    }
    setSubmitting(true);
    try {
      const email = aliasToEmail(name);
      const { data: signUp, error: signErr } = await supabase.auth.signUp({
        email,
        password: pinToPassword(pin),
        options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { nombre: name } },
      });
      if (signErr) throw signErr;
      const user = signUp.user;
      if (!user) throw new Error(t("reg.err.noAccount"));

      const { error: insErr } = await supabase.from("participants").insert(
        mode === "revancha"
          ? {
              user_id: user.id,
              nombre: name,
              email,
              en_polla_original: false,
              estado_pago: null,
              estado_pago_revancha: "pendiente",
            }
          : {
              user_id: user.id,
              nombre: name,
              email,
              en_polla_original: true,
              estado_pago: "pendiente",
            },
      );
      if (insErr) throw insErr;

      await refresh();
      setDone(true);
      toast.success(mode === "revancha" ? t("reg.revancha.success") : t("reg.success"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("reg.err.generic");
      if (msg.includes("already registered") || msg.includes("already been registered")) {
        // Mensaje persistente (no un toast que desaparece) con el enlace a login justo al
        // lado — es lo que la persona necesita hacer si la cuenta es suya.
        setAliasTaken(true);
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Card className="mx-auto max-w-lg border-primary/30 bg-card p-8 text-center card-shadow">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary/15 text-3xl">
          ✅
        </div>
        <h3 className="font-display text-2xl text-foreground">
          {mode === "revancha" ? t("reg.revancha.done.title") : t("reg.done.title")}
        </h3>
        <p className="mt-3 text-sm text-muted-foreground">
          {mode === "revancha" ? t("reg.revancha.done.body") : t("reg.done.body")}
        </p>
        <Button
          className="mt-6"
          onClick={() => router.navigate({ to: mode === "revancha" ? "/revancha" : "/dashboard" })}
        >
          {mode === "revancha" ? t("reg.revancha.done.cta") : t("reg.done.cta")}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg border-border bg-card p-6 card-shadow sm:p-8">
      <h3 className="font-display text-2xl tracking-wide text-foreground">
        {mode === "revancha" ? t("reg.revancha.title") : t("reg.title")}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "revancha" ? t("reg.revancha.subtitle") : t("reg.subtitle")}
      </p>
      {mode === "revancha" && (
        <div className="mt-4 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm text-gold">
          {t("reg.revancha.banner")}
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="alias">{t("reg.alias")}</Label>
          <Input
            id="alias"
            value={alias}
            onChange={(e) => {
              setAlias(e.target.value);
              setAliasTaken(false);
            }}
            placeholder={t("reg.aliasPh")}
            maxLength={24}
          />
          {aliasTaken && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <p>
                {mode === "revancha" ? t("reg.err.aliasTakenRevancha") : t("reg.err.aliasTaken")}
              </p>
              <Link to="/login" className="mt-1 inline-block font-medium underline">
                {t("nav.login")}
              </Link>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pin">{t("reg.pin")}</Label>
            <div className="relative">
              <Input
                id="pin"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pin2">{t("reg.pin2")}</Label>
            <div className="relative">
              <Input
                id="pin2"
                type={showPin2 ? "text" : "password"}
                inputMode="numeric"
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPin2((v) => !v)}
                aria-label={showPin2 ? "Ocultar PIN" : "Mostrar PIN"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {showPin2 ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
        </div>

        <label className="flex items-start gap-3 text-sm text-muted-foreground">
          <Checkbox
            checked={accepted}
            onCheckedChange={(v) => setAccepted(v === true)}
            className="mt-0.5"
          />
          <span>{t("reg.accept")}</span>
        </label>

        <Button type="submit" variant="hero" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {mode === "revancha"
            ? t("reg.revancha.submit", { amount: fmtCOP(cuota) })
            : t("reg.submit", { amount: fmtCOP(cuota) })}
        </Button>
      </form>
    </Card>
  );
}
