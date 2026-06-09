-- Remove picks from the realtime publication: with realtime.messages RLS not configured,
-- subscribing to picks would let any authenticated user see every other user's picks.
-- Leaderboard updates continue to flow because tournament_state changes still publish.
ALTER PUBLICATION supabase_realtime DROP TABLE public.picks;