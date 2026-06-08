import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// AI auto-prediction. Given a list of matches, an AI football analyst returns
// the most realistic score it can estimate for each. The model call (and the
// LOVABLE_API_KEY) stay server-side; the client only sends match metadata and
// renders/saves the returned scores.

const MatchInput = z.object({
  id: z.number().int(),
  equipo_local: z.string().min(1).max(60),
  equipo_visitante: z.string().min(1).max(60),
  grupo: z.string().max(4).optional().default(""),
  fase: z.string().max(40).optional().default("grupos"),
});

const Input = z.object({
  matches: z.array(MatchInput).min(1).max(80),
});

export type AutoPrediction = {
  match_id: number;
  goles_local_pred: number;
  goles_visitante_pred: number;
};

function clamp(n: unknown): number {
  const v = Math.round(Number(n));
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(9, v));
}

export const autoPredict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(Input)
  .handler(async ({ data }): Promise<AutoPrediction[]> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI no disponible: falta la configuración del servidor.");

    const list = data.matches
      .map(
        (m) =>
          `#${m.id} | ${m.equipo_local} vs ${m.equipo_visitante} | grupo ${m.grupo || "-"} | ${m.fase}`,
      )
      .join("\n");

    const system =
      "Eres un analista experto de fútbol internacional (selecciones, Copa del Mundo). " +
      "Estima el marcador FINAL más probable para cada partido en tiempo reglamentario, " +
      "basándote en la fuerza histórica, ranking FIFA, plantilla y desempeño reciente de cada selección. " +
      "Los marcadores deben ser realistas (la mayoría 0-3 goles por equipo). " +
      "Responde ÚNICAMENTE con JSON válido, sin texto adicional.";

    const userPrompt =
      `Predice el marcador de estos ${data.matches.length} partidos:\n${list}\n\n` +
      `Devuelve un objeto JSON con esta forma exacta:\n` +
      `{"predicciones":[{"id":<numero del partido>,"local":<goles equipo local>,"visitante":<goles equipo visitante>}]}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) {
      throw new Error("Demasiadas solicitudes a la IA. Intenta de nuevo en unos minutos.");
    }
    if (res.status === 402) {
      throw new Error("Se agotaron los créditos de IA. Contacta al organizador.");
    }
    if (!res.ok) {
      throw new Error("La IA no pudo generar las predicciones. Intenta de nuevo.");
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";

    let parsed: { predicciones?: { id: number; local: number; visitante: number }[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Respuesta de IA no válida. Intenta de nuevo.");
    }

    const allowed = new Set(data.matches.map((m) => m.id));
    const out: AutoPrediction[] = [];
    for (const p of parsed.predicciones ?? []) {
      const id = Number(p.id);
      if (!allowed.has(id)) continue;
      out.push({
        match_id: id,
        goles_local_pred: clamp(p.local),
        goles_visitante_pred: clamp(p.visitante),
      });
    }
    if (out.length === 0) {
      throw new Error("La IA no devolvió predicciones válidas. Intenta de nuevo.");
    }
    return out;
  });
