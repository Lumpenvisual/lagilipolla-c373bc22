-- Internal/admin & trigger functions: remove the implicit PUBLIC EXECUTE grant.
REVOKE EXECUTE ON FUNCTION public.calc_points() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_concursos(boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_demo_data() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_demo_data(integer, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.selftest_concursos() FROM PUBLIC, anon, authenticated;

-- Participant predictions: signed-in only (close the implicit PUBLIC/anon grant).
REVOKE EXECUTE ON FUNCTION public.get_participant_predictions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_participant_predictions(uuid) TO authenticated;