import type { Tables } from "@/integrations/supabase/types";
import { Trophy, CalendarDays, Layers, Swords } from "lucide-react";

export type Concurso = Tables<"concursos">;
export type Inscripcion = Tables<"inscripciones">;

export type Modalidad = "partido" | "dia" | "fase" | "mundial";
export type EstadoConcurso = "proximo" | "abierto" | "cerrado" | "finalizado";
export type EstadoPago = "pendiente" | "aprobado" | "rechazado";

/** Modalities ordered by commitment level (low → total). */
export const MODALIDAD_ORDER: Modalidad[] = ["partido", "dia", "fase", "mundial"];

export function isModalidad(v: unknown): v is Modalidad {
  return v === "partido" || v === "dia" || v === "fase" || v === "mundial";
}

/** Per-modality accent tokens used to visually distinguish each landing. */
export const MODALIDAD_ACCENT: Record<
  Modalidad,
  { text: string; border: string; bg: string; dot: string; chip: string; ring: string }
> = {
  partido: {
    text: "text-info",
    border: "border-info/40",
    bg: "bg-info/10",
    dot: "bg-info",
    chip: "border-info/40 bg-info/10 text-info",
    ring: "hover:border-info/50 hover:shadow-[0_24px_60px_-30px_rgba(77,166,255,0.55)]",
  },
  dia: {
    text: "text-primary",
    border: "border-primary/40",
    bg: "bg-primary/10",
    dot: "bg-primary",
    chip: "border-primary/40 bg-primary/10 text-primary",
    ring: "hover:border-primary/50 hover:shadow-[0_24px_60px_-30px_rgba(76,202,114,0.55)]",
  },
  fase: {
    text: "text-gold",
    border: "border-gold/40",
    bg: "bg-gold/10",
    dot: "bg-gold",
    chip: "border-gold/40 bg-gold/10 text-gold",
    ring: "hover:border-gold/50 hover:shadow-[0_24px_60px_-30px_rgba(240,192,64,0.55)]",
  },
  mundial: {
    text: "text-gold",
    border: "border-gold/50",
    bg: "bg-gradient-to-br from-gold/15 to-primary/10",
    dot: "bg-gold",
    chip: "border-gold/50 bg-gold/15 text-gold",
    ring: "hover:border-gold/60 hover:shadow-[0_24px_70px_-28px_rgba(240,192,64,0.7)]",
  },
};

// i18n key helpers for per-modality copy.
export const MODALIDAD_IDEAL = (m: Modalidad) => `modalidad.${m}.ideal`;
export const MODALIDAD_COMMITMENT = (m: Modalidad) => `modalidad.${m}.commitment`;
export const MODALIDAD_TAGLINE = (m: Modalidad) => `modalidad.${m}.tagline`;
export const MODALIDAD_SCOPE = (m: Modalidad) => `modalidad.${m}.scope`;
export const MODALIDAD_STEP = (m: Modalidad, n: 1 | 2 | 3) => `modalidad.${m}.step${n}`;

export interface ConcursoOverview {
  id: string;
  nombre: string;
  modalidad: Modalidad;
  alcance: Record<string, unknown>;
  cuota: number;
  estado: EstadoConcurso;
  deadline: string | null;
  jugadores: number;
  partidos: number;
}

// i18n key maps — resolve with the t() helper in components.
export const MODALIDAD_LABEL: Record<Modalidad, string> = {
  partido: "modalidad.partido",
  dia: "modalidad.dia",
  fase: "modalidad.fase",
  mundial: "modalidad.mundial",
};

export const MODALIDAD_DESC: Record<Modalidad, string> = {
  partido: "modalidad.partido.desc",
  dia: "modalidad.dia.desc",
  fase: "modalidad.fase.desc",
  mundial: "modalidad.mundial.desc",
};

export const MODALIDAD_ICON = {
  partido: Swords,
  dia: CalendarDays,
  fase: Layers,
  mundial: Trophy,
} as const;

export const ESTADO_META: Record<
  EstadoConcurso,
  { labelKey: string; cls: string; dot: string }
> = {
  abierto: {
    labelKey: "estado.abierto",
    cls: "border-primary/40 bg-primary/15 text-primary",
    dot: "bg-primary",
  },
  cerrado: {
    labelKey: "estado.cerrado",
    cls: "border-gold/40 bg-gold/15 text-gold",
    dot: "bg-gold",
  },
  finalizado: {
    labelKey: "estado.finalizado",
    cls: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  proximo: {
    labelKey: "estado.proximo",
    cls: "border-info/40 bg-info/10 text-info",
    dot: "bg-info",
  },
};

export const PAGO_META: Record<
  EstadoPago,
  { labelKey: string; cls: string; emoji: string }
> = {
  pendiente: { labelKey: "pago.pendiente", cls: "border-gold/40 bg-gold/15 text-gold", emoji: "🟡" },
  aprobado: { labelKey: "pago.aprobado", cls: "border-primary/40 bg-primary/15 text-primary", emoji: "✅" },
  rechazado: { labelKey: "pago.rechazado", cls: "border-destructive/40 bg-destructive/15 text-destructive", emoji: "❌" },
};
