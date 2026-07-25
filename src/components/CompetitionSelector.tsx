import { Link } from "@tanstack/react-router";
import { Trophy, Coins } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTournamentState } from "@/hooks/usePolla";
import { POLLA, fmtCOP } from "@/lib/polla";
import { useT } from "@/lib/i18n";

/**
 * Selector de inscripción: dos competencias, dos pozos, dos cuotas — presentadas como una
 * elección explícita en vez de dos rutas que alguien tiene que adivinar. Vive en /registro
 * (antes de mostrar el formulario) y se enlaza desde /revancha/registro para quien llegó al
 * formulario equivocado. No construye ningún alta nueva: solo decide a cuál de los dos
 * caminos YA existentes (RegistrationForm mode="polla" | "revancha") mandar a la persona.
 */
export function CompetitionSelector({ onChoosePolla }: { onChoosePolla: () => void }) {
  const t = useT();
  const { data: ts } = useTournamentState();
  const cuotaPolla = ts?.cuota_cop ?? POLLA.cuotaCOP;
  const cuotaRevancha = ts?.revancha_cuota_cop ?? 50_000;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="flex flex-col border-gold/40 bg-gold/5 p-6 card-shadow">
        <Trophy className="size-8 text-gold" />
        <h2 className="mt-3 font-display text-xl text-gold">{t("selector.polla.title")}</h2>
        <p className="mt-2 flex-1 text-sm text-muted-foreground">{t("selector.polla.desc")}</p>
        <p className="mt-4 inline-flex items-center gap-1.5 font-display text-2xl text-gold">
          <Coins className="size-5" /> {fmtCOP(cuotaPolla)} COP
        </p>
        <Button variant="hero" className="mt-4" onClick={onChoosePolla}>
          {t("selector.polla.cta")}
        </Button>
      </Card>

      <Card className="flex flex-col border-info/40 bg-info/5 p-6 card-shadow">
        <div className="text-3xl" aria-hidden>
          🔄
        </div>
        <h2 className="mt-3 font-display text-xl text-info">{t("selector.revancha.title")}</h2>
        <p className="mt-2 flex-1 text-sm text-muted-foreground">{t("selector.revancha.desc")}</p>
        <p className="mt-4 inline-flex items-center gap-1.5 font-display text-2xl text-info">
          <Coins className="size-5" /> {fmtCOP(cuotaRevancha)} COP
        </p>
        <Button asChild variant="secondary" className="mt-4">
          <Link to="/revancha/registro">{t("selector.revancha.cta")}</Link>
        </Button>
      </Card>

      <p className="col-span-full text-center text-xs text-muted-foreground">
        {t("selector.footnote")}
      </p>
    </div>
  );
}
