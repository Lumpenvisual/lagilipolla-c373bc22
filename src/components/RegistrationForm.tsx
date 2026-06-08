import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { ALIAS_RE, PIN_RE, aliasToEmail, pinToPassword } from "@/lib/auth";

export function RegistrationForm() {
  const router = useRouter();
  const t = useT();
  const { refresh } = useAuth();
  const [alias, setAlias] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

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

      const { error: insErr } = await supabase.from("participants").insert({
        user_id: user.id,
        nombre: name,
        email,
      });
      if (insErr) throw insErr;

      await refresh();
      setDone(true);
      toast.success(t("reg.success"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("reg.err.generic");
      toast.error(
        msg.includes("already registered") || msg.includes("already been registered")
          ? t("reg.err.aliasTaken")
          : msg,
      );
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
        <h3 className="font-display text-2xl text-foreground">{t("reg.done.title")}</h3>
        <p className="mt-3 text-sm text-muted-foreground">{t("reg.done.body")}</p>
        <Button className="mt-6" onClick={() => router.navigate({ to: "/dashboard" })}>
          {t("reg.done.cta")}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg border-border bg-card p-6 card-shadow sm:p-8">
      <h3 className="font-display text-2xl tracking-wide text-foreground">{t("reg.title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("reg.subtitle")}</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="alias">{t("reg.alias")}</Label>
          <Input
            id="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder={t("reg.aliasPh")}
            maxLength={24}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="pin">{t("reg.pin")}</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pin2">{t("reg.pin2")}</Label>
            <Input
              id="pin2"
              type="password"
              inputMode="numeric"
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
            />
          </div>
        </div>

        <label className="flex items-start gap-3 text-sm text-muted-foreground">
          <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" />
          <span>{t("reg.accept")}</span>
        </label>

        <Button type="submit" variant="hero" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {t("reg.submit")}
        </Button>
      </form>
    </Card>
  );
}
