import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/reports.functions";
import { pinToPassword } from "@/lib/auth";

/**
 * Resetea el PIN de un participante (cambia su password en auth.users).
 * Solo admin. Requiere service_role porque toca a OTRO usuario, no al llamador.
 * El PIN se mapea al password con `pinToPassword` (mismo esquema que login).
 */
export const adminResetPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ userId: z.string().uuid(), newPin: z.string().regex(/^\d{4}$/) })
      .strict()
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: pinToPassword(data.newPin),
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
