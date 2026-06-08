-- Datos OFICIALES Mundial 2026 con repechajes ya resueltos (a junio 2026).
--
-- Resuelve los 6 slots de repechaje del sorteo (5 dic 2025) a sus ganadores reales
-- (UEFA play-offs y repechaje intercontinental, marzo 2026):
--   Grupo A · UEFA-D  -> Chequia (CZE)
--   Grupo B · UEFA-A  -> Bosnia y Herzegovina (BIH)
--   Grupo D · UEFA-C  -> Turquía (TUR)
--   Grupo F · UEFA-B  -> Suecia (SWE)
--   Grupo I · FIFA-2  -> Irak (IRQ)
--   Grupo K · FIFA-1  -> RD Congo (COD)
--
-- Y corrige los partidos del Grupo K (Colombia) con sedes y local/visitante oficiales:
--   J1 17 jun: Portugal–RD Congo (NRG Stadium, Houston) · Uzbekistán–Colombia (Azteca, CDMX)
--   J2 23 jun: Portugal–Uzbekistán (NRG Stadium, Houston) · Colombia–RD Congo (Akron, Guadalajara)
--   J3 27 jun: Colombia–Portugal (Hard Rock, Miami) · RD Congo–Uzbekistán (Mercedes-Benz, Atlanta)
--
-- Seguro de re-ejecutar: hace UPDATE del singleton tournament_state (id=1).
-- Las picks aún no referencian estos equipos (datos demo ya limpiados).

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
