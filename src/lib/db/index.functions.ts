// Client-safe entry point: import server fns from here.
// Repos themselves live in *.repo.server.ts and are NEVER imported from the client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { rolesRepo } = await import("./roles.repo.server");
  if (!(await rolesRepo.isAdmin(userId))) throw new Error("forbidden");
}

// ---- Participants (admin) ----
export const listParticipants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { participantsRepo } = await import("./participants.repo.server");
    return participantsRepo.list();
  });

export const setParticipantPago = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        estado: z.enum(["pendiente", "aprobado", "rechazado"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { participantsRepo } = await import("./participants.repo.server");
    const { auditRepo } = await import("./audit.repo.server");
    const row = await participantsRepo.setEstadoPago(data.id, data.estado);
    await auditRepo.log({
      admin_id: context.userId,
      action: "set_estado_pago",
      payload: { participant_id: data.id, estado: data.estado },
    });
    return row;
  });

// ---- Tournament (admin) ----
export const getTournament = createServerFn({ method: "GET" }).handler(async () => {
  const { tournamentRepo } = await import("./tournament.repo.server");
  return tournamentRepo.get();
});

export const setPicksLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lockedAt: z.string().datetime().nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { tournamentRepo } = await import("./tournament.repo.server");
    const { auditRepo } = await import("./audit.repo.server");
    await tournamentRepo.setLock(data.lockedAt ? new Date(data.lockedAt) : null);
    await auditRepo.log({
      admin_id: context.userId,
      action: "set_picks_lock",
      payload: { locked_at: data.lockedAt },
    });
    return { ok: true as const };
  });

// ---- Picks (admin) ----
export const recalcAllPicks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { picksRepo } = await import("./picks.repo.server");
    const n = await picksRepo.recalcAll();
    return { recalculated: n };
  });

// ---- Audit (admin) ----
export const recentAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { auditRepo } = await import("./audit.repo.server");
    return auditRepo.recent(100);
  });