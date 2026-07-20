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
| `20260721000000_ts_validate_scores_propuesta.sql` | Trigger `BEFORE UPDATE` en `tournament_state` que rechaza marcadores oficiales a medio llenar (`_gp_score_invalid`), pero **solo** para los partidos que el UPDATE actual modifica (diff OLD vs NEW) — no revalida partidos viejos que el guardado no toca, para no bloquear el flujo que T4 dejó a propósito no-bloqueante. | Evaluada, recomendada, **no aplicada**. Antes de aplicar: correr un E2E transaccional (patrón `scripts/e2e_recalc_categorias.mjs`) confirmando que (a) un marcador nuevo a medias se rechaza y (b) un guardado que no toca un marcador viejo a medias no se ve afectado por él. |
