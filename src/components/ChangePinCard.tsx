import { useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PIN_RE, pinToPassword } from "@/lib/auth";
import { useT } from "@/lib/i18n";

/* Cambiar el PIN de 4 dígitos. La clave inicial la asigna el admin/registro;
 * aquí el usuario la cambia a su gusto. El PIN deriva el password real de la
 * cuenta (pinToPassword), así que el próximo login usa el PIN nuevo. */
export function ChangePinCard() {
  const t = useT();
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!PIN_RE.test(pin)) {
      toast.error(t("pin.err.format"));
      return;
    }
    if (pin !== pin2) {
      toast.error(t("pin.err.match"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pinToPassword(pin) });
      if (error) throw error;
      toast.success(t("pin.success"));
      setPin("");
      setPin2("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("pin.err.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-border bg-card p-5 card-shadow">
      <p className="font-display text-lg">
        <KeyRound className="mr-1.5 inline size-4 text-gold" /> {t("pin.title")}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{t("pin.desc")}</p>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="newpin">{t("pin.new")}</Label>
          <div className="relative">
            <Input
              id="newpin"
              type={show ? "text" : "password"}
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(onlyDigits(e.target.value))}
              placeholder="••••"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Ocultar PIN" : "Mostrar PIN"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="newpin2">{t("pin.confirm")}</Label>
          <Input
            id="newpin2"
            type={show ? "text" : "password"}
            inputMode="numeric"
            value={pin2}
            onChange={(e) => setPin2(onlyDigits(e.target.value))}
            placeholder="••••"
          />
        </div>
        <Button type="submit" variant="hero" disabled={busy}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {t("pin.submit")}
        </Button>
      </form>
    </Card>
  );
}
