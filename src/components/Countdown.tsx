import { useEffect, useState } from "react";
import { countdownTo, type Countdown as CD } from "@/lib/format";
import { TOURNAMENT_START_UTC } from "@/lib/constants";
import { useT } from "@/lib/i18n";

function Unit({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  const text = value.toString().padStart(2, "0");
  return (
    <div className="flex flex-col items-center">
      <div
        className={`glass-card relative flex h-20 w-16 items-center justify-center overflow-hidden rounded-xl font-display text-3xl tabular-nums shadow-2xl sm:h-28 sm:w-24 sm:text-5xl ${
          accent ? "text-primary" : "text-gold"
        }`}
      >
        {/* glossy top sheen */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/30" />
        {/* center split line */}
        <div className="pointer-events-none absolute left-0 top-1/2 h-px w-full bg-white/10" />
        <span key={text} className="digit-pop relative">
          {text}
        </span>
      </div>
      <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function Countdown() {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const [cd, setCd] = useState<CD>(() => countdownTo(TOURNAMENT_START_UTC));

  useEffect(() => {
    setMounted(true);
    setCd(countdownTo(TOURNAMENT_START_UTC));
    const timer = setInterval(() => setCd(countdownTo(TOURNAMENT_START_UTC)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Avoid SSR/client hydration mismatch: render placeholder until mounted.
  if (!mounted) {
    return (
      <div className="flex items-end justify-center gap-3 sm:gap-5">
        <Unit value={0} label={t("countdown.days")} />
        <Unit value={0} label={t("countdown.hours")} />
        <Unit value={0} label={t("countdown.min")} />
        <Unit value={0} label={t("countdown.sec")} accent />
      </div>
    );
  }

  if (cd.done) {
    return <p className="font-display text-3xl text-primary">{t("countdown.started")}</p>;
  }

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-5">
      <Unit value={cd.days} label={t("countdown.days")} />
      <Unit value={cd.hours} label={t("countdown.hours")} />
      <Unit value={cd.minutes} label={t("countdown.min")} />
      <Unit value={cd.seconds} label={t("countdown.sec")} accent />
    </div>
  );
}
