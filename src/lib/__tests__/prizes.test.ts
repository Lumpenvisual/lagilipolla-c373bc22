import { describe, it, expect } from "vitest";
import { calculatePrizes, positionLabel, type LeaderboardRow } from "@/lib/prizes";

/**
 * Helpers to build leaderboard rows. `posicion` mirrors the SQL RANK():
 * tied players share the same position and the next position skips.
 */
function row(id: string, posicion: number, pts = 0, exactos = 0): LeaderboardRow {
  return { participant_id: id, nombre: id, total_puntos: pts, exactos, ganadores: 0, posicion };
}

/** Sum of all payouts — must always equal the pot (no money created or lost). */
function totalPaid(prizes: Record<string, number>): number {
  return Object.values(prizes).reduce((a, b) => a + b, 0);
}

const POT = 1000;

describe("calculatePrizes — base 60/25/10/5 split", () => {
  it("pays the standard split with four distinct positions", () => {
    const lb = [row("a", 1), row("b", 2), row("c", 3), row("d", 4)];
    const p = calculatePrizes(lb, POT);
    expect(p.a).toBe(600);
    expect(p.b).toBe(250);
    expect(p.c).toBe(100);
    expect(p.d).toBe(50);
    expect(totalPaid(p)).toBeCloseTo(POT, 6);
  });

  it("never pays more or less than the pot", () => {
    const lb = [row("a", 1), row("b", 2), row("c", 3), row("d", 4)];
    expect(totalPaid(calculatePrizes(lb, 777))).toBeCloseTo(777, 6);
  });
});

describe("calculatePrizes — ties at 1st place", () => {
  it("2-way tie at 1st: split 85% (60+25), 3rd=10%, 4th=5%", () => {
    // RANK: two #1s, next is #3.
    const lb = [row("a", 1), row("b", 1), row("c", 3), row("d", 4)];
    const p = calculatePrizes(lb, POT);
    expect(p.a).toBeCloseTo(425, 6); // 85% / 2
    expect(p.b).toBeCloseTo(425, 6);
    expect(p.c).toBe(100);
    expect(p.d).toBe(50);
    expect(totalPaid(p)).toBeCloseTo(POT, 6);
  });

  it("3-way tie at 1st: split 95% (60+25+10), 4th=5%", () => {
    // RANK: three #1s, next is #4.
    const lb = [row("a", 1), row("b", 1), row("c", 1), row("d", 4)];
    const p = calculatePrizes(lb, POT);
    expect(p.a).toBeCloseTo(950 / 3, 6);
    expect(p.d).toBe(50);
    expect(totalPaid(p)).toBeCloseTo(POT, 6);
  });

  it("4-way tie at 1st: whole pot split evenly", () => {
    const lb = [row("a", 1), row("b", 1), row("c", 1), row("d", 1)];
    const p = calculatePrizes(lb, POT);
    expect(p.a).toBeCloseTo(250, 6);
    expect(totalPaid(p)).toBeCloseTo(POT, 6);
  });
});

describe("calculatePrizes — ties at 2nd and 3rd place", () => {
  it("2-way tie at 2nd: 1st=60%, split 35% (25+10), 4th=5%", () => {
    // RANK: #1, two #2s, next is #4.
    const lb = [row("a", 1), row("b", 2), row("c", 2), row("d", 4)];
    const p = calculatePrizes(lb, POT);
    expect(p.a).toBe(600);
    expect(p.b).toBeCloseTo(175, 6); // 35% / 2
    expect(p.c).toBeCloseTo(175, 6);
    expect(p.d).toBe(50);
    expect(totalPaid(p)).toBeCloseTo(POT, 6);
  });

  it("3-way tie at 2nd: 1st=60%, split 40% (25+10+5)", () => {
    const lb = [row("a", 1), row("b", 2), row("c", 2), row("d", 2)];
    const p = calculatePrizes(lb, POT);
    expect(p.a).toBe(600);
    expect(p.b).toBeCloseTo(400 / 3, 6);
    expect(totalPaid(p)).toBeCloseTo(POT, 6);
  });

  it("2-way tie at 3rd: 1st=60%, 2nd=25%, split 15% (10+5)", () => {
    // RANK: #1, #2, two #3s.
    const lb = [row("a", 1), row("b", 2), row("c", 3), row("d", 3)];
    const p = calculatePrizes(lb, POT);
    expect(p.a).toBe(600);
    expect(p.b).toBe(250);
    expect(p.c).toBeCloseTo(75, 6); // 15% / 2
    expect(p.d).toBeCloseTo(75, 6);
    expect(totalPaid(p)).toBeCloseTo(POT, 6);
  });
});

describe("calculatePrizes — degenerate fields", () => {
  it("pays nothing when the leaderboard is empty", () => {
    expect(calculatePrizes([], POT)).toEqual({});
  });

  it("single player takes 60% only (no 2nd/3rd/4th exist)", () => {
    const p = calculatePrizes([row("a", 1)], POT);
    expect(p.a).toBe(600);
    expect(totalPaid(p)).toBeCloseTo(600, 6);
  });
});

describe("positionLabel", () => {
  it("marks tied positions with '='", () => {
    const lb = [row("a", 1), row("b", 1), row("c", 3)];
    expect(positionLabel(1, lb)).toBe("=1°");
    expect(positionLabel(3, lb)).toBe("3°");
  });
});
