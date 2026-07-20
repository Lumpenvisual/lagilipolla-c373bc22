import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { LanguageProvider } from "@/lib/i18n";
import type { TournamentState } from "@/lib/polla";
import { MarcadoresInvalidosBanner } from "@/components/admin/tabs";

/** Banner PERSISTENTE (aviso de resultados oficiales incompletos): aparece mientras
 * haya al menos un marcador oficial a medio llenar y desaparece únicamente cuando ese
 * dato queda corregido — nunca por un dismiss de sesión. */

const mkTs = (overrides: Partial<TournamentState["group_k_matches"][number]>[]): TournamentState =>
  ({
    id: 1,
    groups: {
      K: {
        teams: [
          { id: "COL", nombre: "Colombia" },
          { id: "BRA", nombre: "Brasil" },
        ],
        pos1: "COL",
        pos2: "BRA",
      },
    },
    group_k_matches: overrides.map((o, i) => ({
      id: `k${i}`,
      fecha: "2026-06-15T18:00:00Z",
      local: "COL",
      visitante: "BRA",
      sede: "",
      gh: null,
      ga: null,
      ...o,
    })),
    extra_matches: [],
    goleadores: [],
    arqueros: [],
    goleador_id: null,
    arquero_id: null,
    deadline: "2026-06-11T15:00:00Z",
    cuota_cop: 100000,
    updated_at: "2026-07-19T23:00:00Z",
  }) as unknown as TournamentState;

const renderWithProvider = (ts: TournamentState) =>
  render(createElement(LanguageProvider, null, createElement(MarcadoresInvalidosBanner, { ts })));

describe("MarcadoresInvalidosBanner — persistente, no un toast", () => {
  it("no renderiza nada si no hay marcadores a medio llenar (partidos sin jugar = normal)", () => {
    const { container } = renderWithProvider(
      mkTs([
        { gh: null, ga: null },
        { gh: 2, ga: 1 },
      ]),
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText(/medio llenar/i)).toBeNull();
  });

  it("aparece con un partido a medias, mostrando equipos por nombre y el valor parcial", () => {
    renderWithProvider(mkTs([{ gh: 2, ga: null }]));
    expect(screen.getByText(/1 marcador oficial a medio llenar/i)).toBeTruthy();
    expect(screen.getByText(/Colombia/)).toBeTruthy();
    expect(screen.getByText(/Brasil/)).toBeTruthy();
    expect(screen.getByText("2-—")).toBeTruthy();
  });

  it("pluraliza el título con más de un caso", () => {
    renderWithProvider(
      mkTs([
        { gh: 2, ga: null },
        { gh: null, ga: 0 },
      ]),
    );
    expect(screen.getByText(/2 marcadores oficiales a medio llenar/i)).toBeTruthy();
  });

  it("desaparece en cuanto el dato queda corregido (ambos campos llenos)", () => {
    const { rerender, container } = renderWithProvider(mkTs([{ gh: 2, ga: null }]));
    expect(screen.getByText(/medio llenar/i)).toBeTruthy();
    rerender(
      createElement(
        LanguageProvider,
        null,
        createElement(MarcadoresInvalidosBanner, { ts: mkTs([{ gh: 2, ga: 1 }]) }),
      ),
    );
    expect(container.innerHTML).toBe("");
  });
});
