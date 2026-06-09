import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { aliasToEmail, pinToPassword, PIN_RE } from "@/lib/auth";
import { useT, tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: tStatic("login.meta.title") },
      { name: "description", content: tStatic("login.meta.desc") },
      { property: "og:title", content: tStatic("login.meta.title") },
      { property: "og:description", content: tStatic("login.meta.desc") },
      { property: "og:url", content: "https://lagilipolla.lovable.app/login" },
    ],
    links: [{ rel: "canonical", href: "https://lagilipolla.lovable.app/login" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [alias, setAlias] = useState("");
  const [pin, setPin] = useState("");
  const [orgMode, setOrgMode] = useState(false);
  const [orgEmail, setOrgEmail] = useState("");
  const [orgPass, setOrgPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const creds = orgMode
        ? { email: orgEmail.trim(), password: orgPass }
        : { email: aliasToEmail(alias.trim()), password: pinToPassword(pin) };

      if (!orgMode && !PIN_RE.test(pin)) {
        toast.error(t("login.pinError"));
        return;
      }

      const { error } = await supabase.auth.signInWithPassword(creds);
      if (error) throw error;
      toast.success(t("login.welcome"));
      router.navigate({ to: orgMode ? "/admin" : "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("login.genericError");
      toast.error(
        msg.includes("Invalid login") ? (orgMode ? t("login.badOrg") : t("login.badUser")) : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md items-center px-4">
      <Card className="w-full border-border bg-card p-8 card-shadow">
        <h1 className="font-display text-3xl tracking-wide">{t("login.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {orgMode ? t("login.orgSub") : t("login.userSub")}
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {orgMode ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">{t("login.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={orgEmail}
                  onChange={(e) => setOrgEmail(e.target.value)}
                  placeholder="tu@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pass">{t("login.password")}</Label>
                <div className="relative">
                  <Input
                    id="pass"
                    type={showSecret ? "text" : "password"}
                    value={orgPass}
                    onChange={(e) => setOrgPass(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label={showSecret ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="alias">{t("login.alias")}</Label>
                <Input
                  id="alias"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder={t("login.aliasPh")}
                  maxLength={24}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin">{t("login.pin")}</Label>
                <div className="relative">
                  <Input
                    id="pin"
                    type={showSecret ? "text" : "password"}
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label={showSecret ? "Ocultar PIN" : "Mostrar PIN"}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
          <Button type="submit" variant="hero" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {t("login.submit")}
          </Button>
        </form>
        <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
          <p>
            {t("login.noAccount")}{" "}
            <Link to="/registro" className="text-primary hover:underline">
              {t("login.register")}
            </Link>
          </p>
          <button
            type="button"
            onClick={() => setOrgMode((v) => !v)}
            className="text-xs text-muted-foreground/70 hover:text-foreground"
          >
            {orgMode ? t("login.toUser") : t("login.toOrg")}
          </button>
        </div>
      </Card>
    </main>
  );
}
