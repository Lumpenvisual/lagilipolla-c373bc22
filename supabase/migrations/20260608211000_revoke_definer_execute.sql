-- Lock down SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated
-- for internal helpers and triggers. Keep public-facing RPCs callable.

-- Internal helpers / triggers: nobody should call via PostgREST
REVOKE EXECUTE ON FUNCTION public.calc_pick_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.picks_recalc_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_picks_deadline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.comprobante_code(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Admin-only RPCs: only authenticated may call (function checks has_role internally),
-- never anon.
REVOKE EXECUTE ON FUNCTION public.recalc_all_picks() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_polla_demo() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_polla_demo() FROM PUBLIC, anon;

-- has_role is used inside RLS policies; authenticated needs it, anon doesn't
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

-- Public RPCs (keep accessible)
GRANT EXECUTE ON FUNCTION public.get_polla_leaderboard() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_comprobante_public(text) TO anon, authenticated;
