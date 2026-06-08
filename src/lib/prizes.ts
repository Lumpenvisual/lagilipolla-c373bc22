export interface LeaderboardRow {
  participant_id: string;
  nombre: string;
  total_puntos: number;
  exactos: number;
  ganadores: number;
  posicion: number;
}

function distribute(players: LeaderboardRow[], amount: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (players.length === 0) return out;
  const each = amount / players.length;
  for (const p of players) out[p.participant_id] = each;
  return out;
}

function groupByPosition(rows: LeaderboardRow[]): Record<number, LeaderboardRow[]> {
  const g: Record<number, LeaderboardRow[]> = {};
  for (const r of rows) {
    (g[r.posicion] ??= []).push(r);
  }
  return g;
}

/**
 * Calculate prize amount per participant, applying tie-breaking rules.
 * Base split is 60/25/10/5. Ties redistribute as specified.
 */
export function calculatePrizes(leaderboard: LeaderboardRow[], totalPot: number): Record<string, number> {
  const positions = groupByPosition(leaderboard);
  const rank1 = positions[1] ?? [];
  const rank2 = positions[2] ?? [];
  const rank3 = positions[3] ?? [];
  const rank4 = positions[4] ?? [];

  let prizes: Record<string, number> = {};
  const merge = (m: Record<string, number>) => {
    for (const k in m) prizes[k] = (prizes[k] ?? 0) + m[k];
  };

  if (rank1.length >= 4) {
    merge(distribute(rank1, totalPot * 1.0));
  } else if (rank1.length === 3) {
    merge(distribute(rank1, totalPot * 0.95));
    merge(distribute(rank4, totalPot * 0.05));
  } else if (rank1.length === 2) {
    merge(distribute(rank1, totalPot * 0.85));
    merge(distribute(rank3, totalPot * 0.1));
    merge(distribute(rank4, totalPot * 0.05));
  } else {
    merge(distribute(rank1, totalPot * 0.6));
    if (rank2.length >= 3) {
      merge(distribute(rank2, totalPot * 0.4));
    } else if (rank2.length === 2) {
      merge(distribute(rank2, totalPot * 0.35));
      merge(distribute(rank4, totalPot * 0.05));
    } else {
      merge(distribute(rank2, totalPot * 0.25));
      if (rank3.length >= 2) {
        merge(distribute(rank3, totalPot * 0.15));
      } else {
        merge(distribute(rank3, totalPot * 0.1));
        merge(distribute(rank4, totalPot * 0.05));
      }
    }
  }
  return prizes;
}

/** Position label with tie marker, e.g. "=2°". */
export function positionLabel(posicion: number, leaderboard: LeaderboardRow[]): string {
  const tied = leaderboard.filter((r) => r.posicion === posicion).length > 1;
  return `${tied ? "=" : ""}${posicion}°`;
}

export const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉", 4: "4️⃣" };
