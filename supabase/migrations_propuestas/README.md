# Migraciones propuestas (NO aplicadas)

Esta carpeta es **intencionalmente distinta** de `supabase/migrations/`: los archivos aquí
son propuestas evaluadas pero **no aplicadas a producción**, y a propósito viven fuera de
`migrations/` para que ningún mecanismo de sincronización automática (histórico: Lovable
Cloud aplicaba migraciones al sincronizar `main` — ver skill `gilipolla-ops`) las recoja por
accidente. `scripts/dump_schema.sh` tampoco las lee.

Cuando se decida aplicar una: moverla a `supabase/migrations/` con el patrón de siempre
(Management API + PAT), o descartarla si ya no aplica.

| Archivo | Qué propone | Estado |
|---|---|---|
| ~~`20260721000000_ts_validate_scores_propuesta.sql`~~ | Trigger `BEFORE UPDATE` en `tournament_state` que rechaza marcadores oficiales a medio llenar (`_gp_score_invalid`), pero **solo** para los partidos que el UPDATE actual modifica (diff OLD vs NEW). | **Aplicada** 21-jul-2026 como `supabase/migrations/20260723000000_ts_validate_scores.sql`, tras E2E transaccional (`scripts/e2e_ts_validate_scores.mjs`, 3 casos verdes: marcador nuevo a medias rechazado, guardado que no toca un marcador viejo a medias pasa sin verse afectado, reescritura masiva de `extra_matches` tipo `seed_knockout_bracket` pasa) y confirmación contra el trigger real ya instalado. Este archivo se eliminó de aquí. |
| `20260725000000_repechaje_schema_propuesta.sql` | Esquema (solo esquema, sin UI) para el "Repechaje": competencia de segunda oportunidad sobre semis+final, 100% separada de la polla original. `participants.en_polla_original` + `estado_pago_repechaje`, tabla `repechaje_picks`, candado propio (`repechaje_abierto`/`repechaje_locked_at`, `BEFORE UPDATE OF extra_matches` desde el día uno), `_match_pts` (regla de marcador extraída como función nueva, sin tocar `calc_pick_points`), `calc_repechaje_points`, `get_repechaje_leaderboard`, y la guarda B (`en_polla_original`) agregada a `get_polla_leaderboard`. | Evaluada, recomendada, **no aplicada** — a la espera de decisión. E2E transaccional (`scripts/e2e_repechaje_schema.mjs`) verde: los 37 actuales idénticos fila por fila, participante ficticio solo-repechaje excluido de la principal incluso tras el error humano de aprobarle el pago principal, participante real en ambos leaderboards con puntuaciones independientes, hallazgo #20 probado en vivo (UPDATE de solo puntaje pasa con el repechaje cerrado; UPDATE de predicción sigue rechazado). `_match_pts` verificado contra `matchPts()` (TS) en 16 900 combinaciones, coincide en el 100%. **Ojo de nombre**: "Repechaje" ya se usa en este código para otra cosa (resolución de cupos de clasificación FIFA en Cronograma/Resultados) — señalado en el chat, no resuelto en el esquema. |
