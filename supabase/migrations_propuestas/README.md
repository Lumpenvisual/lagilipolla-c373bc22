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
