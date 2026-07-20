import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

/**
 * RealtimeSync abre un canal de Supabase y registra un handler por tabla vía
 * `.on("postgres_changes", { table }, handler)`. El mock captura esos handlers
 * por nombre de tabla para poder invocarlos directamente, como si Realtime
 * hubiera entregado un evento — sin necesitar un socket real.
 */
const handlers: Record<string, (payload: unknown) => void> = {};
const removeChannelMock = vi.fn();

const channelMock = {
  on: (_event: string, filter: { table: string }, handler: (payload: unknown) => void) => {
    handlers[filter.table] = handler;
    return channelMock;
  },
  subscribe: () => channelMock,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => channelMock,
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
  },
}));

const authMock = vi.fn(() => ({ participant: null as { id: string } | null }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authMock(),
}));

import { RealtimeSync } from "@/components/RealtimeSync";

function renderSync(qc: QueryClient) {
  return render(createElement(QueryClientProvider, { client: qc }, createElement(RealtimeSync)));
}

function mkClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  removeChannelMock.mockClear();
  authMock.mockReturnValue({ participant: null });
});

describe("RealtimeSync — invalidación de public-pick por id concreto", () => {
  it("un evento de picks con participant_id invalida SOLO esa key, no la de otro participante", () => {
    const qc = mkClient();
    qc.setQueryData(["public-pick", "p1"], { puntos_total: 10 });
    qc.setQueryData(["public-pick", "p2"], { puntos_total: 20 });
    renderSync(qc);

    handlers.picks({ new: { participant_id: "p1" }, old: null });

    expect(qc.getQueryState(["public-pick", "p1"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["public-pick", "p2"])?.isInvalidated ?? false).toBe(false);
  });

  it("tampoco invalida otras keys no relacionadas (admin-specials-picks se debounce aparte)", () => {
    const qc = mkClient();
    qc.setQueryData(["polla-leaderboard"], []);
    renderSync(qc);

    handlers.picks({ new: { participant_id: "p1" }, old: null });

    // public-pick es inmediato; polla-leaderboard pasa por el debounce de 1.5s,
    // así que justo después del evento todavía NO debería estar invalidado.
    expect(qc.getQueryState(["polla-leaderboard"])?.isInvalidated ?? false).toBe(false);
  });

  it("un evento sin participant_id en el payload no revienta", () => {
    const qc = mkClient();
    renderSync(qc);

    expect(() => handlers.picks({ new: {}, old: null })).not.toThrow();
    expect(() => handlers.picks({ new: null, old: null })).not.toThrow();
    expect(() => handlers.picks({})).not.toThrow();
  });

  it("la invalidación no dispara refetch de una query sin observador activo (fila colapsada)", async () => {
    const qc = mkClient();
    const queryFn = vi.fn(async () => ({ puntos_total: 10 }));
    // prefetchQuery llena el caché y llama queryFn una vez, sin dejar un
    // observer activo — exactamente el estado de una fila colapsada en
    // /leaderboard (nadie la está mirando en este momento).
    await qc.prefetchQuery({ queryKey: ["public-pick", "p1"], queryFn });
    expect(queryFn).toHaveBeenCalledTimes(1);

    renderSync(qc);
    handlers.picks({ new: { participant_id: "p1" }, old: null });

    // Queda marcada stale (se refrescará la próxima vez que alguien la
    // observe, es decir, cuando se vuelva a expandir la fila)...
    expect(qc.getQueryState(["public-pick", "p1"])?.isInvalidated).toBe(true);
    // ...pero sin un observador activo, invalidateQueries no dispara un
    // refetch por sí solo.
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("invalida my-pick/pick-history solo cuando el evento es del propio participante autenticado", () => {
    authMock.mockReturnValue({ participant: { id: "yo" } });
    const qc = mkClient();
    qc.setQueryData(["my-pick", "yo"], {});
    qc.setQueryData(["my-pick", "otro"], {});
    renderSync(qc);

    handlers.picks({ new: { participant_id: "otro" }, old: null });
    expect(qc.getQueryState(["my-pick", "yo"])?.isInvalidated ?? false).toBe(false);

    handlers.picks({ new: { participant_id: "yo" }, old: null });
    expect(qc.getQueryState(["my-pick", "yo"])?.isInvalidated).toBe(true);
  });
});

describe("RealtimeSync — debounce de admin-specials-picks", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("varios eventos de picks seguidos solo invalidan admin-specials-picks UNA vez, tras el timer", () => {
    vi.useFakeTimers();
    const qc = mkClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    renderSync(qc);

    for (let i = 0; i < 5; i++) {
      handlers.picks({ new: { participant_id: `p${i}` }, old: null });
    }

    const countFor = (key: string) =>
      invalidateSpy.mock.calls.filter(
        (c) => JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey) === JSON.stringify([key]),
      ).length;

    // Antes de que pase la ventana de debounce: cero invalidaciones de esa key.
    expect(countFor("admin-specials-picks")).toBe(0);

    vi.advanceTimersByTime(1500);

    // Tras la ventana: exactamente UNA invalidación, no cinco.
    expect(countFor("admin-specials-picks")).toBe(1);
  });

  it("public-pick de cada participante NO pasa por el debounce: se invalida de inmediato por evento", () => {
    vi.useFakeTimers();
    const qc = mkClient();
    qc.setQueryData(["public-pick", "p1"], {});
    qc.setQueryData(["public-pick", "p2"], {});
    renderSync(qc);

    handlers.picks({ new: { participant_id: "p1" }, old: null });
    handlers.picks({ new: { participant_id: "p2" }, old: null });

    // Sin avanzar ningún timer: ambas ya deben estar invalidadas.
    expect(qc.getQueryState(["public-pick", "p1"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["public-pick", "p2"])?.isInvalidated).toBe(true);
  });
});
