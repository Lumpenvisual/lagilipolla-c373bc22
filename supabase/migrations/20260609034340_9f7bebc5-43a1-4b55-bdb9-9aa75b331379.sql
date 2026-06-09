-- Revoke EXECUTE from internal SECURITY DEFINER functions for anon/authenticated/public.
-- Triggers and SQL-internal callers do NOT require EXECUTE grants, so this is safe.

DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'public.has_role(uuid, app_role)',
    'public.is_match_locked(text)',
    'public.calc_pick_points(uuid)',
    'public.comprobante_code(uuid, timestamptz)',
    'public.enforce_picks_deadline()',
    'public.handle_new_user_role()',
    'public.picks_recalc_trigger()',
    'public.update_updated_at_column()'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- Public-facing RPCs: keep callable by anon + authenticated.
REVOKE ALL ON FUNCTION public.get_polla_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_polla_leaderboard() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_comprobante_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_comprobante_public(text) TO anon, authenticated, service_role;

-- Admin-only RPC (function itself validates has_role(auth.uid(),'admin')).
REVOKE ALL ON FUNCTION public.recalc_all_picks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalc_all_picks() FROM anon;
GRANT EXECUTE ON FUNCTION public.recalc_all_picks() TO authenticated, service_role;