import { describe, it, expect } from "vitest";
import { getMatchStatus, type MatchLike, type PredLike } from "@/lib/matchStatus";

const NOW = Date.parse("2026-06-11T12:00:00Z");
const FUTURE = "2026-06-11T18:00:00Z";
const PAST = "2026-06-11T06:00:00Z";

function match(kickoff: string, gl: number | null = null, gv: number | null = null): MatchLike {
  return { kickoff_time: kickoff, goles_local: gl, goles_visitante: gv };
}
function pred(gl: number | null, gv: number | null, pts?: number | null): PredLike {
  return { goles_local_pred: gl, goles_visitante_pred: gv, puntos_obtenidos: pts };
}

describe("getMatchStatus — result + prediction maps points to label", () => {
  it("3 points -> exacto", () => {
    expect(getMatchStatus(match(PAST, 2, 1), pred(2, 1, 3), NOW).key).toBe("exacto");
  });
  it("1 point -> ganador", () => {
    expect(getMatchStatus(match(PAST, 2, 1), pred(1, 0, 1), NOW).key).toBe("ganador");
  });
  it("0 points -> fallido", () => {
    expect(getMatchStatus(match(PAST, 2, 1), pred(0, 2, 0), NOW).key).toBe("fallido");
  });
});

describe("getMatchStatus — no prediction", () => {
  it("result with no prediction -> fallido", () => {
    expect(getMatchStatus(match(PAST, 2, 1), null, NOW).key).toBe("fallido");
  });
  it("locked with no prediction and no result -> bloqueado", () => {
    expect(getMatchStatus(match(PAST), null, NOW).key).toBe("bloqueado");
  });
  it("open with no prediction -> pendiente", () => {
    expect(getMatchStatus(match(FUTURE), null, NOW).key).toBe("pendiente");
  });
});

describe("getMatchStatus — saved but not yet played", () => {
  it("open match with a saved prediction -> guardado", () => {
    expect(getMatchStatus(match(FUTURE), pred(1, 1), NOW).key).toBe("guardado");
  });
});
