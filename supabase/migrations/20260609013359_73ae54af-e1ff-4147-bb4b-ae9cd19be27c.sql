-- === 211000: revoke execute on internal definer functions ===
REVOKE EXECUTE ON FUNCTION public.calc_pick_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.picks_recalc_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_picks_deadline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.comprobante_code(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_all_picks() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_polla_leaderboard() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_comprobante_public(text) TO anon, authenticated;

-- === 220000: remove demo data + demo seed functions ===
DELETE FROM auth.users WHERE email LIKE 'demo%@gilipolla.co';
DELETE FROM public.participants WHERE nombre LIKE '[DEMO]%';
DROP FUNCTION IF EXISTS public.seed_polla_demo();
DROP FUNCTION IF EXISTS public.reset_polla_demo();

-- === 221000: official Mundial 2026 data (playoffs resolved + Group K matches) ===
UPDATE public.tournament_state SET
  groups = $JSON$
  {
    "A": {"teams":[
      {"id":"MEX","nombre":"México"},
      {"id":"RSA","nombre":"Sudáfrica"},
      {"id":"KOR","nombre":"Corea del Sur"},
      {"id":"CZE","nombre":"Chequia"}
    ],"pos1":null,"pos2":null},
    "B": {"teams":[
      {"id":"CAN","nombre":"Canadá"},
      {"id":"BIH","nombre":"Bosnia y Herzegovina"},
      {"id":"QAT","nombre":"Catar"},
      {"id":"SUI","nombre":"Suiza"}
    ],"pos1":null,"pos2":null},
    "C": {"teams":[
      {"id":"BRA","nombre":"Brasil"},
      {"id":"MAR","nombre":"Marruecos"},
      {"id":"HAI","nombre":"Haití"},
      {"id":"SCO","nombre":"Escocia"}
    ],"pos1":null,"pos2":null},
    "D": {"teams":[
      {"id":"USA","nombre":"Estados Unidos"},
      {"id":"PAR","nombre":"Paraguay"},
      {"id":"AUS","nombre":"Australia"},
      {"id":"TUR","nombre":"Turquía"}
    ],"pos1":null,"pos2":null},
    "E": {"teams":[
      {"id":"GER","nombre":"Alemania"},
      {"id":"CUW","nombre":"Curazao"},
      {"id":"CIV","nombre":"Costa de Marfil"},
      {"id":"ECU","nombre":"Ecuador"}
    ],"pos1":null,"pos2":null},
    "F": {"teams":[
      {"id":"NED","nombre":"Países Bajos"},
      {"id":"JPN","nombre":"Japón"},
      {"id":"SWE","nombre":"Suecia"},
      {"id":"TUN","nombre":"Túnez"}
    ],"pos1":null,"pos2":null},
    "G": {"teams":[
      {"id":"BEL","nombre":"Bélgica"},
      {"id":"EGY","nombre":"Egipto"},
      {"id":"IRN","nombre":"Irán"},
      {"id":"NZL","nombre":"Nueva Zelanda"}
    ],"pos1":null,"pos2":null},
    "H": {"teams":[
      {"id":"ESP","nombre":"España"},
      {"id":"CPV","nombre":"Cabo Verde"},
      {"id":"KSA","nombre":"Arabia Saudita"},
      {"id":"URU","nombre":"Uruguay"}
    ],"pos1":null,"pos2":null},
    "I": {"teams":[
      {"id":"FRA","nombre":"Francia"},
      {"id":"SEN","nombre":"Senegal"},
      {"id":"IRQ","nombre":"Irak"},
      {"id":"NOR","nombre":"Noruega"}
    ],"pos1":null,"pos2":null},
    "J": {"teams":[
      {"id":"ARG","nombre":"Argentina"},
      {"id":"ALG","nombre":"Argelia"},
      {"id":"AUT","nombre":"Austria"},
      {"id":"JOR","nombre":"Jordania"}
    ],"pos1":null,"pos2":null},
    "K": {"teams":[
      {"id":"POR","nombre":"Portugal"},
      {"id":"COD","nombre":"RD Congo"},
      {"id":"UZB","nombre":"Uzbekistán"},
      {"id":"COL","nombre":"Colombia"}
    ],"pos1":null,"pos2":null},
    "L": {"teams":[
      {"id":"ENG","nombre":"Inglaterra"},
      {"id":"CRO","nombre":"Croacia"},
      {"id":"GHA","nombre":"Ghana"},
      {"id":"PAN","nombre":"Panamá"}
    ],"pos1":null,"pos2":null}
  }
  $JSON$::jsonb,
  group_k_matches = $JSON$
  [
    {"id":"1","fecha":"2026-06-17T21:00:00-05:00","local":"UZB","visitante":"COL","sede":"Estadio Azteca · Ciudad de México","gh":null,"ga":null},
    {"id":"2","fecha":"2026-06-17T12:00:00-05:00","local":"POR","visitante":"COD","sede":"NRG Stadium · Houston","gh":null,"ga":null},
    {"id":"3","fecha":"2026-06-23T21:00:00-05:00","local":"COL","visitante":"COD","sede":"Estadio Akron · Guadalajara","gh":null,"ga":null},
    {"id":"4","fecha":"2026-06-23T12:00:00-05:00","local":"POR","visitante":"UZB","sede":"NRG Stadium · Houston","gh":null,"ga":null},
    {"id":"5","fecha":"2026-06-27T18:30:00-05:00","local":"COL","visitante":"POR","sede":"Hard Rock Stadium · Miami","gh":null,"ga":null},
    {"id":"6","fecha":"2026-06-27T18:30:00-05:00","local":"COD","visitante":"UZB","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null}
  ]
  $JSON$::jsonb,
  updated_at = now()
WHERE id = 1;