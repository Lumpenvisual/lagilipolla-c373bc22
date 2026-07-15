import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import type { TournamentState } from "@/lib/polla";
import type { LbRow } from "@/hooks/usePolla";

// El podio consume el leaderboard público; se mockea el hook para probar solo el render.
const leaderboardMock = vi.fn<() => { data: LbRow[]; isLoading: boolean }>();
vi.mock("@/hooks/usePolla", () => ({
  usePollaLeaderboard: () => leaderboardMock(),
}));
// Link necesita RouterProvider; para el test basta un <a>.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) =>
    createElement("a", { href: to }, children),
}));

import { FinalPodium } from "@/components/FinalPodium";

const lbRow = (nombre: string, posicion: number, puntos_total: number): LbRow => ({
  participant_id: nombre.toLowerCase(),
  nombre,
  puntos_grupos: 0,
  puntos_partidos: 0,
  puntos_especiales: 0,
  puntos_total,
  aciertos_5: 0,
  aciertos_3: 0,
  aciertos_2: 0,
  posicion,
});

const mkTs = (finalScore: { gh: number | null; ga: number | null }): TournamentState =>
  ({
    id: 1,
    groups: {
      A: {
        teams: [
          { id: "ESP", nombre: "España" },
          { id: "ARG", nombre: "Argentina" },
        ],
        pos1: "ESP",
        pos2: "ARG",
      },
    },
    group_k_matches: [],
    extra_matches: [
      {
        id: "m104",
        fase: "final",
        fecha: "2026-07-19T18:00:00Z",
        local: "ESP",
        visitante: "ARG",
        sede: "MetLife",
        gh: finalScore.gh,
        ga: finalScore.ga,
      },
    ],
    goleadores: [],
    arqueros: [],
    goleador_id: "Kylian Mbappé (Francia)",
    arquero_id: "Emiliano Martínez (Argentina)",
    deadline: "2026-06-11T15:00:00Z",
    cuota_cop: 100000,
    updated_at: "2026-07-19T23:00:00Z",
  }) as unknown as TournamentState;

describe("FinalPodium — podio final en la pantalla de inicio", () => {
  it("muestra ganador, 2° y 3er lugar con puntos, campeón del Mundial y especiales", () => {
    leaderboardMock.mockReturnValue({
      data: [lbRow("Lucas", 1, 87), lbRow("Marta", 2, 80), lbRow("Pedro", 3, 74)],
      isLoading: false,
    });
    render(<FinalPodium ts={mkTs({ gh: 2, ga: 1 })} />);
    expect(screen.getByText(/Ganador de LA GILIPOLLA/i)).toBeTruthy();
    expect(screen.getByText(/Lucas/)).toBeTruthy();
    expect(screen.getByText("87 puntos")).toBeTruthy();
    expect(screen.getByText(/2° lugar/)).toBeTruthy();
    expect(screen.getByText("Marta")).toBeTruthy();
    expect(screen.getByText(/3er lugar/)).toBeTruthy();
    expect(screen.getByText("Pedro")).toBeTruthy();
    // Campeón del Mundial derivado del marcador de la final (ESP 2-1 ARG).
    expect(screen.getByText(/Campeón del Mundial: España/)).toBeTruthy();
    expect(screen.getByText(/Goleador: Kylian Mbappé/)).toBeTruthy();
    expect(screen.getByText(/Arquero: Emiliano Martínez/)).toBeTruthy();
  });

  it("empate en un puesto: muestra todos los nombres y el plural", () => {
    leaderboardMock.mockReturnValue({
      data: [lbRow("Lucas", 1, 87), lbRow("Marta", 1, 87), lbRow("Pedro", 3, 74)],
      isLoading: false,
    });
    render(<FinalPodium ts={mkTs({ gh: 2, ga: 1 })} />);
    expect(screen.getByText(/Ganadores de LA GILIPOLLA/i)).toBeTruthy();
    expect(screen.getByText(/Lucas · Marta/)).toBeTruthy();
  });

  it("final empatada en 90': omite la línea de Campeón del Mundial (no es derivable)", () => {
    leaderboardMock.mockReturnValue({
      data: [lbRow("Lucas", 1, 87)],
      isLoading: false,
    });
    render(<FinalPodium ts={mkTs({ gh: 1, ga: 1 })} />);
    expect(screen.queryByText(/Campeón del Mundial/)).toBeNull();
    expect(screen.getByText(/Goleador:/)).toBeTruthy();
  });

  it("sin filas de leaderboard no renderiza nada", () => {
    leaderboardMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<FinalPodium ts={mkTs({ gh: 2, ga: 1 })} />);
    expect(container.innerHTML).toBe("");
  });
});
