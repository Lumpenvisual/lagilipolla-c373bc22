-- Mejora el mensaje de error de ts_validate_scores (20260723000000). El original solo
-- decía "Marcador oficial inválido en group_k_matches (partido 1): ..." — un admin con
-- prisa una noche de partido no sabe qué partido es "1" sin abrir la BD o el código.
--
-- No toca el TRIGGER (ya correcto y verificado, ver 20260723000000): solo CREATE OR
-- REPLACE de la función que invoca, más una función auxiliar nueva.
--
-- Elegí (a) — resolver el nombre del equipo en SQL — sobre (b) —solo dar fase/fecha/
-- códigos—: la resolución es una función SQL de un solo SELECT (~10 líneas,
-- _ts_team_name), no la complejidad "apreciable" que haría preferible (b). group_k_matches
-- y extra_matches usan códigos de 3 letras que SÍ están en NEW.groups.<letra>.teams (id →
-- nombre), disponible sin cambiar el trigger. Para los cruces de eliminatorias aún sin
-- resolver (p.ej. "Ganador Partido 74"), la búsqueda no encuentra coincidencia y el
-- COALESCE devuelve el texto tal cual — que ya es legible por sí solo, así que la misma
-- función sirve para ambos casos sin lógica condicional extra.
--
-- El mensaje ahora dice fase (o "fase de grupos"), fecha, ambos nombres de equipo, el id
-- del partido (para cruzar con la UI si hace falta), y CUÁL de los dos goles falta —no
-- solo que algo está mal.
--
-- Mensajes reales, capturados con un E2E transaccional (ROLLBACK garantizado) contra
-- producción antes de aplicar esto:
--   group_k_matches (id "1", MEX-RSA, gh=2/ga=null):
--     "Marcador oficial inválido — fase de grupos · 2026-06-11 · México vs Sudáfrica
--      (partido 1): falta el gol del visitante."
--   extra_matches (id "m99", cuartos NOR-ENG, gh=null/ga=3):
--     "Marcador oficial inválido — cuartos · 2026-07-11 · Noruega vs Inglaterra
--      (partido m99): falta el gol del local."
-- Y el fallback para un cruce KO aún sin resolver se confirmó por separado:
-- _ts_team_name(groups, 'Ganador Partido 74') devuelve 'Ganador Partido 74' tal cual
-- (no encuentra ese código en groups.teams, COALESCE cae al texto original).

CREATE OR REPLACE FUNCTION public._ts_team_name(_groups jsonb, _code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (SELECT t->>'nombre'
       FROM jsonb_each(_groups) g(gk, gv), jsonb_array_elements(gv->'teams') t
      WHERE t->>'id' = _code
      LIMIT 1),
    _code
  );
$$;

REVOKE ALL ON FUNCTION public._ts_team_name(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ts_team_name(jsonb, text) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public._ts_validate_scores()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  m jsonb;
  old_m jsonb;
  mid text;
  v_falta text;
  v_local text;
  v_visitante text;
BEGIN
  -- group_k_matches: array de partidos (no objeto por id, a diferencia de picks) —
  -- se casa OLD↔NEW por el campo "id" de cada elemento.
  FOR m IN SELECT jsonb_array_elements(COALESCE(NEW.group_k_matches, '[]'::jsonb)) LOOP
    mid := m->>'id';
    SELECT e INTO old_m
      FROM jsonb_array_elements(COALESCE(OLD.group_k_matches, '[]'::jsonb)) e
      WHERE e->>'id' = mid;
    IF (old_m IS NULL
        OR (old_m->'gh') IS DISTINCT FROM (m->'gh')
        OR (old_m->'ga') IS DISTINCT FROM (m->'ga'))
       AND public._gp_score_invalid(m) THEN
      v_falta := CASE
        WHEN (m->>'gh') IS NULL THEN 'falta el gol del local'
        WHEN (m->>'ga') IS NULL THEN 'falta el gol del visitante'
        ELSE 'el marcador debe ser un solo dígito (0–9) en ambos campos'
      END;
      v_local := public._ts_team_name(NEW.groups, m->>'local');
      v_visitante := public._ts_team_name(NEW.groups, m->>'visitante');
      RAISE EXCEPTION
        'Marcador oficial inválido — fase de grupos · % · % vs % (partido %): %.',
        split_part(m->>'fecha', 'T', 1), v_local, v_visitante, mid, v_falta;
    END IF;
  END LOOP;

  -- extra_matches: mismo criterio (también array, con "fase" además de "id").
  FOR m IN SELECT jsonb_array_elements(COALESCE(NEW.extra_matches, '[]'::jsonb)) LOOP
    mid := m->>'id';
    SELECT e INTO old_m
      FROM jsonb_array_elements(COALESCE(OLD.extra_matches, '[]'::jsonb)) e
      WHERE e->>'id' = mid;
    IF (old_m IS NULL
        OR (old_m->'gh') IS DISTINCT FROM (m->'gh')
        OR (old_m->'ga') IS DISTINCT FROM (m->'ga'))
       AND public._gp_score_invalid(m) THEN
      v_falta := CASE
        WHEN (m->>'gh') IS NULL THEN 'falta el gol del local'
        WHEN (m->>'ga') IS NULL THEN 'falta el gol del visitante'
        ELSE 'el marcador debe ser un solo dígito (0–9) en ambos campos'
      END;
      v_local := public._ts_team_name(NEW.groups, m->>'local');
      v_visitante := public._ts_team_name(NEW.groups, m->>'visitante');
      RAISE EXCEPTION
        'Marcador oficial inválido — % · % · % vs % (partido %): %.',
        m->>'fase', split_part(m->>'fecha', 'T', 1), v_local, v_visitante, mid, v_falta;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._ts_validate_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ts_validate_scores() TO service_role, authenticated;
