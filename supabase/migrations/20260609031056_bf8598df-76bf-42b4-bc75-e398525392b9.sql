
-- 1. Columnas para fases futuras y partidos extra (sin tocar puntos ya calculados)
ALTER TABLE public.tournament_state
  ADD COLUMN IF NOT EXISTS phases jsonb NOT NULL DEFAULT
    '{"grupos":true,"octavos":false,"cuartos":false,"semis":false,"final":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_matches jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Helper: ¿este partido está bloqueado? (≤24h para que empiece)
CREATE OR REPLACE FUNCTION public.is_match_locked(_match_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_state ts,
         jsonb_array_elements(ts.group_k_matches || ts.extra_matches) AS m
    WHERE ts.id = 1
      AND m->>'id' = _match_id
      AND (m->>'fecha')::timestamptz <= now() + interval '24 hours'
  );
$$;

-- 3. Trigger reforzado: bloqueo global + bloqueo 24h por partido (sin bypass admin)
CREATE OR REPLACE FUNCTION public.enforce_picks_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock TIMESTAMPTZ;
  v_key  text;
  v_old  jsonb;
  v_new  jsonb;
BEGIN
  -- Bloqueo global (deadline general): admin SÍ tiene bypass aquí
  IF NOT public.has_role(auth.uid(),'admin') THEN
    SELECT picks_locked_at INTO v_lock FROM public.tournament_state WHERE id = 1;
    IF v_lock IS NOT NULL AND now() >= v_lock THEN
      RAISE EXCEPTION 'Las planillas están cerradas. Habla con el admin si necesitas un cambio.';
    END IF;
  END IF;

  -- Bloqueo por partido (24h): aplica a TODOS, incluido admin
  IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
    FOR v_key IN
      SELECT jsonb_object_keys(COALESCE(NEW.group_k_matches, '{}'::jsonb))
    LOOP
      v_new := NEW.group_k_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.group_k_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_match_locked(v_key) THEN
        RAISE EXCEPTION 'El partido % está bloqueado: faltan menos de 24 horas para que empiece.', v_key;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- (Asegurar que el trigger exista — idempotente)
DROP TRIGGER IF EXISTS picks_enforce_deadline ON public.picks;
CREATE TRIGGER picks_enforce_deadline
  BEFORE INSERT OR UPDATE ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_picks_deadline();

-- 4. Realtime para que el frontend reciba resultados y leaderboard al instante
ALTER TABLE public.tournament_state REPLICA IDENTITY FULL;
ALTER TABLE public.picks REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournament_state'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_state';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'picks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.picks';
  END IF;
END $$;
