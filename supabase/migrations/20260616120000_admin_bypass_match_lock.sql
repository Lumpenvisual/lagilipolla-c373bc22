-- Permite al admin editar la planilla de cualquier participante AUNQUE el tiempo esté
-- bloqueado. El cierre global (picks_locked_at) ya eximía al admin; faltaba eximirlo del
-- bloqueo por-partido (24 h antes del kickoff). Aquí envolvemos los dos bucles de lock
-- por-partido (group_k_matches y extra_matches) en el mismo guard de admin.
--
-- Para usuarios normales NO cambia nada: siguen bloqueados 24 h antes de cada partido.
-- El resto del modelo de admin ya estaba: RLS picks_admin_all (escribe cualquier pick) y
-- picks_validate (admin exento de la inmutabilidad de lo ya guardado).
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
  -- Cierre global: el admin lo salta.
  IF NOT public.has_role(auth.uid(),'admin') THEN
    SELECT picks_locked_at INTO v_lock FROM public.tournament_state WHERE id = 1;
    IF v_lock IS NOT NULL AND now() >= v_lock THEN
      RAISE EXCEPTION 'Las planillas están cerradas. Habla con el admin si necesitas un cambio.';
    END IF;
  END IF;

  -- Bloqueo por-partido (24 h antes): el admin también lo salta.
  IF (TG_OP = 'UPDATE' OR TG_OP = 'INSERT') AND NOT public.has_role(auth.uid(),'admin') THEN
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
