-- 1) Drop duplicate deadline trigger (kept picks_enforce_deadline)
DROP TRIGGER IF EXISTS picks_deadline_trigger ON public.picks;

-- 2) Harden is_match_locked against NULL extra_matches
CREATE OR REPLACE FUNCTION public.is_match_locked(_match_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_state ts,
         jsonb_array_elements(
           COALESCE(ts.group_k_matches, '[]'::jsonb)
           || COALESCE(ts.extra_matches, '[]'::jsonb)
         ) AS m
    WHERE ts.id = 1
      AND m->>'id' = _match_id
      AND (m->>'fecha')::timestamptz <= now() + interval '24 hours'
  );
$function$;