-- Ajuste de la regla de ESPECIALES (decisión del admin, 19-jul-2026):
-- una coincidencia aproximada vale 10 SOLO si el participante acierta poniendo
-- el apellido o parte del nombre (con la selección presente en ambos lados y
-- coincidente). El typo de escritura del nombre ("Kyllan Mbappé") deja de puntuar:
-- se elimina la regla de levenshtein sobre el nombre introducida en 20260719220000.
--
-- Queda:
--  a) nombre completo igual (normalizado) → 10;
--  c) apellido solo / palabras de un lado contenidas en el otro + selección
--     coincidente en AMBOS lados → 10;
--  todo lo demás → 0. Se conservan el alias "Holanda" ≡ "Países Bajos", la
--  tolerancia de typo en la SELECCIÓN (levenshtein ≤ 1, "Brasill") y que
--  selecciones contradictorias nunca acierten.
--
-- Efecto en datos reales: Cuculeitodelbalon pierde los 10 del goleador (typo);
-- MiraLo ("Mbappe (Francia)") los conserva. Espejo TS: especialMatches en
-- src/lib/polla.ts. El cambio de función no dispara el trigger de recálculo,
-- por eso se recalcula explícitamente al final.

CREATE OR REPLACE FUNCTION public.especial_matches(_pick text, _oficial text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  m text[];
  pn text; ps text; onm text; osel text;
  sel_both boolean; sel_ok boolean;
BEGIN
  IF _pick IS NULL OR _oficial IS NULL OR btrim(_pick) = '' OR btrim(_oficial) = '' THEN
    RETURN false;
  END IF;

  -- Parse "Nombre (Selección)" — espejo de parseSpecial (TS)
  m := regexp_match(_pick, '^(.*?)\s*\(([^)]*)\)\s*$');
  IF m IS NULL THEN pn := _pick; ps := ''; ELSE pn := m[1]; ps := m[2]; END IF;
  m := regexp_match(_oficial, '^(.*?)\s*\(([^)]*)\)\s*$');
  IF m IS NULL THEN onm := _oficial; osel := ''; ELSE onm := m[1]; osel := m[2]; END IF;

  pn   := COALESCE(public.norm_especial(pn), '');
  ps   := COALESCE(public.norm_especial(ps), '');
  onm  := COALESCE(public.norm_especial(onm), '');
  osel := COALESCE(public.norm_especial(osel), '');
  IF pn = '' OR onm = '' THEN RETURN false; END IF;

  -- Alias de país
  IF ps = 'holanda' THEN ps := 'paises bajos'; END IF;
  IF osel = 'holanda' THEN osel := 'paises bajos'; END IF;

  sel_both := ps <> '' AND osel <> '';
  sel_ok := sel_both AND (ps = osel OR extensions.levenshtein(ps, osel) <= 1);

  -- Selecciones contradictorias → nunca acierta
  IF sel_both AND NOT sel_ok THEN RETURN false; END IF;

  -- a) Nombre completo igual (normalizado)
  IF pn = onm THEN RETURN true; END IF;

  -- c) Apellido solo / parte del nombre (subconjunto de palabras), con la
  --    selección confirmando en ambos lados
  IF sel_ok AND (
       (SELECT bool_and(w = ANY (string_to_array(onm, ' ')))
          FROM unnest(string_to_array(pn, ' ')) AS w)
    OR (SELECT bool_and(w = ANY (string_to_array(pn, ' ')))
          FROM unnest(string_to_array(onm, ' ')) AS w)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END; $$;

REVOKE ALL ON FUNCTION public.especial_matches(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.especial_matches(text, text) TO service_role;

SELECT public.recalc_all_picks_internal();
