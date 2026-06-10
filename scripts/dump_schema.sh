#!/usr/bin/env bash
# Concatena todas las migraciones en un único archivo para inspección rápida
# (útil para trabajar en Claude Code sin saltar entre 30+ archivos).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/supabase/schema.snapshot.sql"
{
  echo "-- AUTO-GENERATED snapshot · $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "-- Fuente única de verdad: supabase/migrations/*.sql (NO editar este archivo)"
  echo "-- Regenerar: bash scripts/dump_schema.sh"
  echo
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo
    echo "-- ============================================================"
    echo "-- $(basename "$f")"
    echo "-- ============================================================"
    cat "$f"
  done
} > "$OUT"
echo "✅ Escrito $OUT ($(wc -l < "$OUT") líneas, $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migraciones)"
