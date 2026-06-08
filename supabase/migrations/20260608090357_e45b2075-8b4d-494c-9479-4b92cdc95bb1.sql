DO $$
DECLARE
  r record;
  v_alcance jsonb; v_estado text; v_nombre text; fase_label text;
BEGIN
  -- Mundial completo
  v_alcance := jsonb_build_object('todos', true);
  IF NOT EXISTS (SELECT 1 FROM public.concursos WHERE alcance = v_alcance) THEN
    INSERT INTO public.concursos(nombre, modalidad, alcance, cuota, estado, deadline)
    SELECT 'Mundial completo', 'mundial', v_alcance, 50,
      CASE WHEN MIN(kickoff_time) > now() THEN 'abierto' ELSE 'cerrado' END, MIN(kickoff_time)
    FROM public.matches;
  END IF;

  -- Por fase
  FOR r IN SELECT fase, MIN(kickoff_time) AS dl, bool_and(equipo_local = 'Por definir') AS undefined
           FROM public.matches GROUP BY fase LOOP
    v_alcance := jsonb_build_object('fase', r.fase);
    IF NOT EXISTS (SELECT 1 FROM public.concursos WHERE alcance = v_alcance) THEN
      fase_label := CASE r.fase
        WHEN 'grupos' THEN 'Fase de grupos'
        WHEN 'dieciseisavos' THEN 'Dieciseisavos'
        WHEN 'octavos' THEN 'Octavos de final'
        WHEN 'cuartos' THEN 'Cuartos de final'
        WHEN 'semis' THEN 'Semifinales'
        WHEN 'tercer_puesto' THEN 'Tercer puesto'
        WHEN 'final' THEN 'Final'
        ELSE initcap(r.fase) END;
      v_estado := CASE WHEN r.undefined THEN 'proximo' WHEN r.dl > now() THEN 'abierto' ELSE 'cerrado' END;
      INSERT INTO public.concursos(nombre, modalidad, alcance, cuota, estado, deadline)
      VALUES (fase_label, 'fase', v_alcance, 20, v_estado, r.dl);
    END IF;
  END LOOP;

  -- Día de partidos
  FOR r IN SELECT ((kickoff_time AT TIME ZONE 'UTC') - INTERVAL '4 hours')::date AS d,
                  MIN(kickoff_time) AS dl, bool_and(equipo_local = 'Por definir') AS undefined
           FROM public.matches GROUP BY 1 ORDER BY 1 LOOP
    v_alcance := jsonb_build_object('fecha', to_char(r.d,'YYYY-MM-DD'));
    IF NOT EXISTS (SELECT 1 FROM public.concursos WHERE alcance = v_alcance) THEN
      v_estado := CASE WHEN r.undefined THEN 'proximo' WHEN r.dl > now() THEN 'abierto' ELSE 'cerrado' END;
      v_nombre := 'Día de partidos — ' || to_char(r.d, 'DD Mon YYYY');
      INSERT INTO public.concursos(nombre, modalidad, alcance, cuota, estado, deadline)
      VALUES (v_nombre, 'dia', v_alcance, 10, v_estado, r.dl);
    END IF;
  END LOOP;
END $$;