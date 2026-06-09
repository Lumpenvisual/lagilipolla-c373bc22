
-- 1. Extender picks con extra_matches
ALTER TABLE public.picks
  ADD COLUMN IF NOT EXISTS extra_matches jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Extender tournament_state con visibility
ALTER TABLE public.tournament_state
  ADD COLUMN IF NOT EXISTS visibility jsonb NOT NULL DEFAULT
    jsonb_build_object(
      'grupos', true, 'octavos', true, 'cuartos', true,
      'semis', true, 'tercero', true, 'final', true,
      'goleador', true, 'arquero', true, 'historico', true
    );

-- 3. Tabla pick_history
CREATE TABLE IF NOT EXISTS public.pick_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  match_id text NOT NULL,
  fase text NOT NULL,
  gh_anterior int,
  ga_anterior int,
  gh_nuevo int,
  ga_nuevo int,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pick_history_participant_idx
  ON public.pick_history(participant_id, changed_at DESC);

GRANT SELECT ON public.pick_history TO authenticated;
GRANT ALL ON public.pick_history TO service_role;

ALTER TABLE public.pick_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participant reads own history"
  ON public.pick_history FOR SELECT
  TO authenticated
  USING (
    participant_id IN (
      SELECT id FROM public.participants WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- 4. Trigger: registrar cambios de marcador
CREATE OR REPLACE FUNCTION public.log_pick_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  v_old jsonb; v_new jsonb;
  fase_lookup text;
BEGIN
  -- group_k_matches (fase grupos)
  FOR k IN SELECT jsonb_object_keys(COALESCE(NEW.group_k_matches, '{}'::jsonb)) LOOP
    v_new := NEW.group_k_matches -> k;
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.group_k_matches -> k ELSE NULL END;
    IF v_new IS DISTINCT FROM v_old THEN
      INSERT INTO public.pick_history(participant_id, match_id, fase,
        gh_anterior, ga_anterior, gh_nuevo, ga_nuevo, changed_by)
      VALUES (NEW.participant_id, k, 'grupos',
        NULLIF(v_old->>'gh','')::int, NULLIF(v_old->>'ga','')::int,
        NULLIF(v_new->>'gh','')::int, NULLIF(v_new->>'ga','')::int,
        auth.uid());
    END IF;
  END LOOP;

  -- extra_matches (fases eliminatorias)
  FOR k IN SELECT jsonb_object_keys(COALESCE(NEW.extra_matches, '{}'::jsonb)) LOOP
    v_new := NEW.extra_matches -> k;
    v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.extra_matches -> k ELSE NULL END;
    IF v_new IS DISTINCT FROM v_old THEN
      SELECT m->>'fase' INTO fase_lookup
      FROM public.tournament_state ts,
           jsonb_array_elements(COALESCE(ts.extra_matches, '[]'::jsonb)) m
      WHERE ts.id = 1 AND m->>'id' = k
      LIMIT 1;
      INSERT INTO public.pick_history(participant_id, match_id, fase,
        gh_anterior, ga_anterior, gh_nuevo, ga_nuevo, changed_by)
      VALUES (NEW.participant_id, k, COALESCE(fase_lookup, 'extra'),
        NULLIF(v_old->>'gh','')::int, NULLIF(v_old->>'ga','')::int,
        NULLIF(v_new->>'gh','')::int, NULLIF(v_new->>'ga','')::int,
        auth.uid());
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS picks_log_history ON public.picks;
CREATE TRIGGER picks_log_history
  AFTER INSERT OR UPDATE ON public.picks
  FOR EACH ROW EXECUTE FUNCTION public.log_pick_history();

-- 5. Extender enforce_picks_deadline para extra_matches
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
  IF NOT public.has_role(auth.uid(),'admin') THEN
    SELECT picks_locked_at INTO v_lock FROM public.tournament_state WHERE id = 1;
    IF v_lock IS NOT NULL AND now() >= v_lock THEN
      RAISE EXCEPTION 'Las planillas están cerradas. Habla con el admin si necesitas un cambio.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
    FOR v_key IN SELECT jsonb_object_keys(COALESCE(NEW.group_k_matches, '{}'::jsonb)) LOOP
      v_new := NEW.group_k_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.group_k_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_match_locked(v_key) THEN
        RAISE EXCEPTION 'El partido % está bloqueado: faltan menos de 24 horas para que empiece.', v_key;
      END IF;
    END LOOP;

    FOR v_key IN SELECT jsonb_object_keys(COALESCE(NEW.extra_matches, '{}'::jsonb)) LOOP
      v_new := NEW.extra_matches -> v_key;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.extra_matches -> v_key ELSE NULL END;
      IF v_new IS DISTINCT FROM v_old AND public.is_match_locked(v_key) THEN
        RAISE EXCEPTION 'El partido % está bloqueado: faltan menos de 24 horas para que empiece.', v_key;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Extender calc_pick_points para sumar puntos de extra_matches
CREATE OR REPLACE FUNCTION public.calc_pick_points(_pick_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record; p record; k text; gobj jsonb;
  pos1_o text; pos2_o text; pos1_p text; pos2_p text;
  pts_g int := 0; pts_m int := 0; pts_e int := 0;
  c5 int := 0; c3 int := 0; c2 int := 0;
  match_o jsonb; match_p jsonb;
  oh int; oa int; ph int; pa int;
  sign_o int; sign_p int;
BEGIN
  SELECT * INTO s FROM public.tournament_state WHERE id = 1;
  SELECT * INTO p FROM public.picks WHERE participant_id = _pick_id;
  IF NOT FOUND OR s IS NULL THEN RETURN; END IF;

  -- Grupos: posiciones
  FOR k IN SELECT jsonb_object_keys(s.groups) LOOP
    gobj := s.groups->k;
    pos1_o := gobj->>'pos1'; pos2_o := gobj->>'pos2';
    pos1_p := (p.groups->k)->>'pos1'; pos2_p := (p.groups->k)->>'pos2';
    IF pos1_o IS NULL OR pos2_o IS NULL OR pos1_p IS NULL OR pos2_p IS NULL THEN CONTINUE; END IF;
    IF pos1_p = pos1_o AND pos2_p = pos2_o THEN
      pts_g := pts_g + 5; c5 := c5 + 1;
    ELSIF pos1_p = pos2_o AND pos2_p = pos1_o THEN
      pts_g := pts_g + 3; c3 := c3 + 1;
    ELSIF pos1_p = pos1_o OR pos1_p = pos2_o OR pos2_p = pos1_o OR pos2_p = pos2_o THEN
      pts_g := pts_g + 1;
    END IF;
  END LOOP;

  -- Partidos de fase de grupos
  FOR match_o IN SELECT jsonb_array_elements(s.group_k_matches) LOOP
    oh := NULLIF(match_o->>'gh','')::int;
    oa := NULLIF(match_o->>'ga','')::int;
    IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
    match_p := p.group_k_matches -> (match_o->>'id');
    IF match_p IS NULL THEN CONTINUE; END IF;
    ph := NULLIF(match_p->>'gh','')::int;
    pa := NULLIF(match_p->>'ga','')::int;
    IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
    sign_o := sign(oh - oa); sign_p := sign(ph - pa);
    IF ph = oh AND pa = oa THEN
      pts_m := pts_m + 5; c5 := c5 + 1;
    ELSIF sign_o <> 0 AND sign_p = sign_o THEN
      IF ph = oh OR pa = oa THEN
        pts_m := pts_m + 3; c3 := c3 + 1;
      ELSE
        pts_m := pts_m + 2; c2 := c2 + 1;
      END IF;
    ELSIF sign_o = 0 AND sign_p = 0 THEN
      pts_m := pts_m + 1;
    ELSIF ph = oh OR pa = oa THEN
      pts_m := pts_m + 1;
    END IF;
  END LOOP;

  -- Partidos extra (eliminatorias)
  IF s.extra_matches IS NOT NULL THEN
    FOR match_o IN SELECT jsonb_array_elements(s.extra_matches) LOOP
      oh := NULLIF(match_o->>'gh','')::int;
      oa := NULLIF(match_o->>'ga','')::int;
      IF oh IS NULL OR oa IS NULL THEN CONTINUE; END IF;
      match_p := p.extra_matches -> (match_o->>'id');
      IF match_p IS NULL THEN CONTINUE; END IF;
      ph := NULLIF(match_p->>'gh','')::int;
      pa := NULLIF(match_p->>'ga','')::int;
      IF ph IS NULL OR pa IS NULL THEN CONTINUE; END IF;
      sign_o := sign(oh - oa); sign_p := sign(ph - pa);
      IF ph = oh AND pa = oa THEN
        pts_m := pts_m + 5; c5 := c5 + 1;
      ELSIF sign_o <> 0 AND sign_p = sign_o THEN
        IF ph = oh OR pa = oa THEN
          pts_m := pts_m + 3; c3 := c3 + 1;
        ELSE
          pts_m := pts_m + 2; c2 := c2 + 1;
        END IF;
      ELSIF sign_o = 0 AND sign_p = 0 THEN
        pts_m := pts_m + 1;
      ELSIF ph = oh OR pa = oa THEN
        pts_m := pts_m + 1;
      END IF;
    END LOOP;
  END IF;

  -- Especiales
  IF s.goleador_id IS NOT NULL AND p.goleador_id = s.goleador_id THEN pts_e := pts_e + 10; END IF;
  IF s.arquero_id IS NOT NULL AND p.arquero_id = s.arquero_id THEN pts_e := pts_e + 10; END IF;

  UPDATE public.picks SET
    puntos_grupos = pts_g, puntos_partidos = pts_m, puntos_especiales = pts_e,
    aciertos_5 = c5, aciertos_3 = c3, aciertos_2 = c2
  WHERE participant_id = _pick_id;
END;
$$;
