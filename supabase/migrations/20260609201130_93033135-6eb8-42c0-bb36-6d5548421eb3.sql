ALTER TABLE public.picks REPLICA IDENTITY FULL;
ALTER TABLE public.pick_history REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_state REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.picks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pick_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;