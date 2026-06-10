import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";

// --- Mock Supabase client BEFORE importing the hooks ---
const upsertMock = vi.fn();
const rpcMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "tournament_state") {
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { id: 1, deadline: "2026-06-11T15:00:00Z", groups: {} },
            error: null,
          }),
        }),
      }),
    };
  }
  if (table === "picks") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              participant_id: "p1",
              groups: { A: { pos1: "x", pos2: "y" } },
              group_k_matches: {},
              extra_matches: {},
              goleador_id: null,
              arquero_id: null,
              puntos_total: 12,
            },
            error: null,
          }),
        }),
      }),
      upsert: upsertMock,
    };
  }
  return {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => fromMock(t),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { useTournamentState, useMyPick, useSavePick, usePollaLeaderboard } from "@/hooks/usePolla";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  upsertMock.mockReset();
  rpcMock.mockReset();
});

describe("useTournamentState", () => {
  it("fetches the singleton tournament row", async () => {
    const { result } = renderHook(() => useTournamentState(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe(1);
  });
});

describe("useMyPick", () => {
  it("is disabled when there is no participant id", () => {
    const { result } = renderHook(() => useMyPick(null), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches picks for a participant", async () => {
    const { result } = renderHook(() => useMyPick("p1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.participant_id).toBe("p1");
  });
});

describe("useSavePick", () => {
  it("throws if no participantId is provided", async () => {
    const { result } = renderHook(() => useSavePick(null), { wrapper: makeWrapper() });
    await expect(
      result.current.mutateAsync({
        groups: {},
        group_k_matches: {},
        extra_matches: {},
        goleador_id: null,
        arquero_id: null,
      } as never),
    ).rejects.toThrow(/Sin participante/);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upserts picks for the given participant", async () => {
    upsertMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useSavePick("p1"), { wrapper: makeWrapper() });
    await result.current.mutateAsync({
      groups: { A: { pos1: "x", pos2: "y" } },
      group_k_matches: {},
      extra_matches: {},
      goleador_id: null,
      arquero_id: null,
    } as never);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsertMock.mock.calls[0];
    expect(payload.participant_id).toBe("p1");
    expect(opts).toEqual({ onConflict: "participant_id" });
  });
});

describe("usePollaLeaderboard", () => {
  it("calls the RPC and sorts rows by posicion ascending", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          participant_id: "b",
          nombre: "B",
          posicion: 3,
          puntos_total: 10,
          puntos_grupos: 0,
          puntos_partidos: 0,
          puntos_especiales: 0,
          aciertos_5: 0,
          aciertos_3: 0,
          aciertos_2: 0,
        },
        {
          participant_id: "a",
          nombre: "A",
          posicion: 1,
          puntos_total: 30,
          puntos_grupos: 0,
          puntos_partidos: 0,
          puntos_especiales: 0,
          aciertos_5: 0,
          aciertos_3: 0,
          aciertos_2: 0,
        },
        {
          participant_id: "c",
          nombre: "C",
          posicion: 2,
          puntos_total: 20,
          puntos_grupos: 0,
          puntos_partidos: 0,
          puntos_especiales: 0,
          aciertos_5: 0,
          aciertos_3: 0,
          aciertos_2: 0,
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => usePollaLeaderboard(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith("get_polla_leaderboard");
    expect(result.current.data?.map((r) => r.participant_id)).toEqual(["a", "c", "b"]);
  });

  it("propagates RPC errors", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    const { result } = renderHook(() => usePollaLeaderboard(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/boom/);
  });
});
