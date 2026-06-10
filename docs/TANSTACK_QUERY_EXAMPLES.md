# Ejemplos de TanStack Query — La Gilipolla 2026

Esta guía recoge los patrones reales usados en el proyecto y cómo replicarlos
para nuevas pantallas. Todos los hooks viven en `src/hooks/usePolla.ts` y
consumen Supabase a través de `@/integrations/supabase/client`.

## 1. Query singleton (estado del torneo)

Una única fila (`tournament_state` con `id = 1`) que se cachea agresivamente.

```ts
export function useTournamentState() {
  return useQuery({
    queryKey: ["tournament-state"],
    queryFn: async (): Promise<TournamentState> => {
      const { data, error } = await supabase
        .from("tournament_state")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data as unknown as TournamentState;
    },
    staleTime: 60_000, // 1 min fresco
    gcTime: 10 * 60_000, // 10 min en cache
    refetchOnWindowFocus: false, // evita refetch al cambiar de pestaña
  });
}
```

Uso:

```tsx
const { data: ts, isLoading } = useTournamentState();
if (isLoading || !ts) return <Skeleton />;
return <Cronograma matches={ts.group_k_matches} />;
```

## 2. Query dependiente (`enabled`)

Solo dispara la query cuando hay `participantId`. Evita 401/null queries.

```ts
export function useMyPick(participantId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-pick", participantId],
    enabled: !!participantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("picks")
        .select("*")
        .eq("participant_id", participantId!)
        .maybeSingle(); // 0 o 1 fila → nunca tira si no hay match
      if (error) throw error;
      return data ?? null;
    },
  });
}
```

## 3. Mutation + invalidación

`upsert` con `onConflict`, e invalidación de queries dependientes en `onSuccess`.

```ts
export function useSavePick(participantId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavePickInput) => {
      if (!participantId) throw new Error("Sin participante");
      const { error } = await supabase
        .from("picks")
        .upsert({ participant_id: participantId, ...input }, { onConflict: "participant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-pick", participantId] });
      qc.invalidateQueries({ queryKey: ["polla-leaderboard"] });
    },
  });
}
```

Uso desde un componente:

```tsx
const save = useSavePick(participantId);

<Button
  disabled={save.isPending}
  onClick={() => save.mutate({ groups, group_k_matches, extra_matches, goleador_id, arquero_id })}
>
  {save.isPending ? "Guardando…" : "Guardar planilla"}
</Button>;
```

## 4. RPC + transformación de respuesta

`get_polla_leaderboard` es una función `SECURITY DEFINER`. La query ordena la
respuesta del lado del cliente para mantener `posicion` ascendente aunque el
RPC cambie.

```ts
export function usePollaLeaderboard() {
  return useQuery({
    queryKey: ["polla-leaderboard"],
    queryFn: async (): Promise<LbRow[]> => {
      const { data, error } = await supabase.rpc("get_polla_leaderboard");
      if (error) throw error;
      return ((data ?? []) as LbRow[]).sort((a, b) => a.posicion - b.posicion);
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
```

## 5. Convención de `queryKey`

| Recurso             | Key                               |
| ------------------- | --------------------------------- |
| Estado del torneo   | `["tournament-state"]`            |
| Pick del usuario    | `["my-pick", participantId]`      |
| Tabla de posiciones | `["polla-leaderboard"]`           |
| Historial de picks  | `["pick-history", participantId]` |

Reglas:

- El primer elemento es un sustantivo en kebab-case.
- IDs/filtros que cambian la respuesta van en los siguientes elementos.
- Invalidar siempre por el prefijo más general que cubra todas las variantes:
  `qc.invalidateQueries({ queryKey: ["my-pick"] })`.

## 6. Tests

Ver `src/hooks/__tests__/usePolla.test.tsx` para ejemplos completos:
mock de `supabase`, `QueryClientProvider` con `retry: false`, `renderHook` y
`waitFor`.
