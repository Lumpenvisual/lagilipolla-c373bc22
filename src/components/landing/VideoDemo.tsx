import { lazy, Suspense, useState } from "react";
import { Play } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import heroStadium from "@/assets/hero-stadium.jpg";

// El reproductor de Remotion se carga solo al darle play (y solo en cliente).
const DemoPlayer = lazy(() => import("./DemoPlayer"));

type VideoDemoProps = {
  poster?: string;
  title?: string;
  subtitle?: string;
};

/**
 * Sección de "video demo" de la landing. Muestra una portada con botón de play;
 * al hacer clic reproduce el video demo animado hecho con Remotion (composición
 * GilipollaDemo). El JS de Remotion se carga de forma diferida solo al reproducir.
 */
export function VideoDemo({
  poster = heroStadium,
  title = "Mira cómo funciona",
  subtitle = "Un recorrido de 12 segundos por LA GILIPOLLA: inscripción, planilla y tabla en vivo.",
}: VideoDemoProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <section className="mx-auto max-w-5xl px-4 py-16">
      <div className="text-center">
        <div className="bandera-stripe-h mx-auto h-1 w-16 rounded-sm" aria-hidden />
        <h2 className="mt-4 font-display text-3xl tracking-wide sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="glow mt-8 overflow-hidden rounded-2xl border border-gold/30 bg-card">
        <AspectRatio ratio={16 / 9}>
          {playing ? (
            <Suspense
              fallback={
                <div className="flex size-full items-center justify-center bg-card text-sm text-muted-foreground">
                  Cargando video…
                </div>
              }
            >
              <DemoPlayer />
            </Suspense>
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label="Reproducir video demo"
              className="group relative block size-full"
            >
              <img
                src={poster}
                alt="Bar El Guanábano · ambiente de estadio"
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="cta-pulse flex size-16 items-center justify-center rounded-full bg-gold text-[#1a1200] shadow-lg transition-transform group-hover:scale-110 sm:size-20">
                  <Play className="ml-1 size-7 fill-current sm:size-8" />
                </span>
              </span>
            </button>
          )}
        </AspectRatio>
      </div>
    </section>
  );
}
