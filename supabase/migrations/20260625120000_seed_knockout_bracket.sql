-- Estructura CANÓNICA del bracket de eliminatorias (Mundial FIFA 2026, 48 equipos)
-- en tournament_state.extra_matches: 32 partidos (M73–M104) con sus cruces (placeholders),
-- sedes y fechas oficiales. Refleja exactamente el estado ya cargado en producción.
--
-- Fuente única en TS: src/lib/knockout-bracket.ts (buildExtraMatchesFromBracket()).
-- Este JSON debe coincidir con esa salida.
--
-- Idempotente y NO destructivo: solo siembra si extra_matches está vacío, para no
-- pisar cruces/marcadores ya cargados. Para REGENERAR a cero, el admin vacía primero
-- (UPDATE ... SET extra_matches='[]') o usa el botón "Generar" desde la UI.
--
-- No toca phases/visibility: las fases KO arrancan ocultas y el admin las activa
-- desde Cronograma cuando corresponda.

UPDATE public.tournament_state SET
  extra_matches = $JSON$
  [
    {"id":"m73","fase":"dieciseisavos","fecha":"2026-06-28T15:00:00-04:00","local":"Segundo A","visitante":"Segundo B","sede":"SoFi Stadium · Inglewood","gh":null,"ga":null},
    {"id":"m74","fase":"dieciseisavos","fecha":"2026-06-29T16:30:00-04:00","local":"Ganador E","visitante":"Mejor 3° (A/B/C/D/F)","sede":"Gillette Stadium · Foxborough","gh":null,"ga":null},
    {"id":"m75","fase":"dieciseisavos","fecha":"2026-06-29T21:00:00-04:00","local":"Ganador F","visitante":"Segundo C","sede":"Estadio BBVA · Monterrey","gh":null,"ga":null},
    {"id":"m76","fase":"dieciseisavos","fecha":"2026-06-29T13:00:00-04:00","local":"Ganador C","visitante":"Segundo F","sede":"NRG Stadium · Houston","gh":null,"ga":null},
    {"id":"m77","fase":"dieciseisavos","fecha":"2026-06-30T17:00:00-04:00","local":"Ganador I","visitante":"Mejor 3° (C/D/F/G/H)","sede":"MetLife Stadium · East Rutherford","gh":null,"ga":null},
    {"id":"m78","fase":"dieciseisavos","fecha":"2026-06-30T13:00:00-04:00","local":"Segundo E","visitante":"Segundo I","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
    {"id":"m79","fase":"dieciseisavos","fecha":"2026-06-30T21:00:00-04:00","local":"Ganador A","visitante":"Mejor 3° (C/E/F/H/I)","sede":"Estadio Azteca · Mexico City","gh":null,"ga":null},
    {"id":"m80","fase":"dieciseisavos","fecha":"2026-07-01T12:00:00-04:00","local":"Ganador L","visitante":"Mejor 3° (E/H/I/J/K)","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null},
    {"id":"m81","fase":"dieciseisavos","fecha":"2026-07-01T20:00:00-04:00","local":"Ganador D","visitante":"Mejor 3° (B/E/F/I/J)","sede":"Levi's Stadium · Santa Clara","gh":null,"ga":null},
    {"id":"m82","fase":"dieciseisavos","fecha":"2026-07-01T16:00:00-04:00","local":"Ganador G","visitante":"Mejor 3° (A/E/H/I/J)","sede":"Lumen Field · Seattle","gh":null,"ga":null},
    {"id":"m83","fase":"dieciseisavos","fecha":"2026-07-02T19:00:00-04:00","local":"Segundo K","visitante":"Segundo L","sede":"BMO Field · Toronto","gh":null,"ga":null},
    {"id":"m84","fase":"dieciseisavos","fecha":"2026-07-02T15:00:00-04:00","local":"Ganador H","visitante":"Segundo J","sede":"SoFi Stadium · Inglewood","gh":null,"ga":null},
    {"id":"m85","fase":"dieciseisavos","fecha":"2026-07-02T23:00:00-04:00","local":"Ganador B","visitante":"Mejor 3° (E/F/G/I/J)","sede":"BC Place · Vancouver","gh":null,"ga":null},
    {"id":"m86","fase":"dieciseisavos","fecha":"2026-07-03T18:00:00-04:00","local":"Ganador J","visitante":"Segundo H","sede":"Hard Rock Stadium · Miami Gardens","gh":null,"ga":null},
    {"id":"m87","fase":"dieciseisavos","fecha":"2026-07-03T21:30:00-04:00","local":"Ganador K","visitante":"Mejor 3° (D/E/I/J/L)","sede":"Arrowhead Stadium · Kansas City","gh":null,"ga":null},
    {"id":"m88","fase":"dieciseisavos","fecha":"2026-07-03T14:00:00-04:00","local":"Segundo D","visitante":"Segundo G","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
    {"id":"m89","fase":"octavos","fecha":"2026-07-04T17:00:00-04:00","local":"Ganador Partido 74","visitante":"Ganador Partido 77","sede":"Lincoln Financial Field · Philadelphia","gh":null,"ga":null},
    {"id":"m90","fase":"octavos","fecha":"2026-07-04T13:00:00-04:00","local":"Ganador Partido 73","visitante":"Ganador Partido 75","sede":"NRG Stadium · Houston","gh":null,"ga":null},
    {"id":"m91","fase":"octavos","fecha":"2026-07-05T16:00:00-04:00","local":"Ganador Partido 76","visitante":"Ganador Partido 78","sede":"MetLife Stadium · East Rutherford","gh":null,"ga":null},
    {"id":"m92","fase":"octavos","fecha":"2026-07-05T20:00:00-04:00","local":"Ganador Partido 79","visitante":"Ganador Partido 80","sede":"Estadio Azteca · Mexico City","gh":null,"ga":null},
    {"id":"m93","fase":"octavos","fecha":"2026-07-06T15:00:00-04:00","local":"Ganador Partido 83","visitante":"Ganador Partido 84","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
    {"id":"m94","fase":"octavos","fecha":"2026-07-06T20:00:00-04:00","local":"Ganador Partido 81","visitante":"Ganador Partido 82","sede":"Lumen Field · Seattle","gh":null,"ga":null},
    {"id":"m95","fase":"octavos","fecha":"2026-07-07T12:00:00-04:00","local":"Ganador Partido 86","visitante":"Ganador Partido 88","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null},
    {"id":"m96","fase":"octavos","fecha":"2026-07-07T16:00:00-04:00","local":"Ganador Partido 85","visitante":"Ganador Partido 87","sede":"BC Place · Vancouver","gh":null,"ga":null},
    {"id":"m97","fase":"cuartos","fecha":"2026-07-09T16:00:00-04:00","local":"Ganador Partido 89","visitante":"Ganador Partido 90","sede":"Gillette Stadium · Foxborough","gh":null,"ga":null},
    {"id":"m98","fase":"cuartos","fecha":"2026-07-10T15:00:00-04:00","local":"Ganador Partido 93","visitante":"Ganador Partido 94","sede":"SoFi Stadium · Inglewood","gh":null,"ga":null},
    {"id":"m99","fase":"cuartos","fecha":"2026-07-11T17:00:00-04:00","local":"Ganador Partido 91","visitante":"Ganador Partido 92","sede":"Hard Rock Stadium · Miami Gardens","gh":null,"ga":null},
    {"id":"m100","fase":"cuartos","fecha":"2026-07-11T21:00:00-04:00","local":"Ganador Partido 95","visitante":"Ganador Partido 96","sede":"Arrowhead Stadium · Kansas City","gh":null,"ga":null},
    {"id":"m101","fase":"semis","fecha":"2026-07-14T15:00:00-04:00","local":"Ganador Partido 97","visitante":"Ganador Partido 98","sede":"AT&T Stadium · Arlington","gh":null,"ga":null},
    {"id":"m102","fase":"semis","fecha":"2026-07-15T15:00:00-04:00","local":"Ganador Partido 99","visitante":"Ganador Partido 100","sede":"Mercedes-Benz Stadium · Atlanta","gh":null,"ga":null},
    {"id":"m103","fase":"tercero","fecha":"2026-07-18T17:00:00-04:00","local":"Perdedor Partido 101","visitante":"Perdedor Partido 102","sede":"Hard Rock Stadium · Miami Gardens","gh":null,"ga":null},
    {"id":"m104","fase":"final","fecha":"2026-07-19T15:00:00-04:00","local":"Ganador Partido 101","visitante":"Ganador Partido 102","sede":"MetLife Stadium · East Rutherford","gh":null,"ga":null}
  ]
  $JSON$::jsonb,
  updated_at = now()
WHERE id = 1
  AND (extra_matches IS NULL OR jsonb_array_length(extra_matches) = 0);
