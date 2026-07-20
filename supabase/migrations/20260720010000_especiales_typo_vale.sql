-- Ajuste final de la regla de ESPECIALES (decisión del admin, 19-jul-2026, 2ª ronda):
-- el participante que acierta el jugador tiene sus 10 puntos aunque lo escriba con un
-- error pequeño de tipeo, porque la parte reconocible del nombre + la selección
-- confirman el acierto (caso real: "Kyllan Mbappé (Francia)" → Kylian Mbappé).
-- Quien NO coincide con el oficial tiene 0.
--
-- Regla completa (revierte 20260720000000 y deja la de 20260719220000):
--  a) nombre completo igual (normalizado) → 10;
--  b) typo pequeño en el nombre (levenshtein ≤ 2) + selección coincidente → 10;
--  c) apellido solo / parte del nombre (subconjunto de palabras) + selección
--     presente en AMBOS lados y coincidente → 10 (garantizado);
--  todo lo demás → 0. Alias "Holanda" ≡ "Países Bajos"; typo de selección ≤ 1;
--  selecciones contradictorias nunca aciertan.
--
-- Efecto en datos reales: Cuculeitodelbalon recupera los 10 del goleador (115→125).
-- Espejo TS: especialMatches en src/lib/polla.ts. Recalc explícito al final.

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

  -- b) Typo pequeño en el nombre, con la selección confirmando
  IF sel_ok AND extensions.levenshtein(pn, onm) <= 2 THEN RETURN true; END IF;

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
