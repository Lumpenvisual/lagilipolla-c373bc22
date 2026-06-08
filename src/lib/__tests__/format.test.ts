import { describe, it, expect } from "vitest";
import { isLocked, hoursUntil, dateLabelET, formatET, countdownTo, formatCAD } from "@/lib/format";

const NOW = Date.parse("2026-06-11T12:00:00Z");

describe("isLocked", () => {
  it("locks once kickoff has passed (kickoff <= now)", () => {
    expect(isLocked("2026-06-11T11:59:59Z", NOW)).toBe(true);
    expect(isLocked("2026-06-11T12:00:00Z", NOW)).toBe(true); // exactly at kickoff
  });

  it("stays open before kickoff", () => {
    expect(isLocked("2026-06-11T12:00:01Z", NOW)).toBe(false);
  });
});

describe("hoursUntil", () => {
  it("returns positive hours before kickoff and negative after", () => {
    expect(hoursUntil("2026-06-11T18:00:00Z", NOW)).toBeCloseTo(6, 6);
    expect(hoursUntil("2026-06-11T06:00:00Z", NOW)).toBeCloseTo(-6, 6);
  });
});

describe("ET conversion (UTC-4 fixed June offset)", () => {
  it("groups by the correct ET calendar day across the UTC midnight boundary", () => {
    // 2026-06-12 02:00 UTC = 2026-06-11 22:00 ET -> still 'Jun 11'
    expect(dateLabelET("2026-06-12T02:00:00Z")).toBe("Jun 11");
    // 2026-06-12 05:00 UTC = 2026-06-12 01:00 ET -> 'Jun 12'
    expect(dateLabelET("2026-06-12T05:00:00Z")).toBe("Jun 12");
  });

  it("formats the ET wall-clock time with AM/PM", () => {
    // 19:00 UTC -> 15:00 ET
    expect(formatET("2026-06-11T19:00:00Z")).toBe("Jun 11 · 3:00 PM ET");
    // 16:00 UTC -> 12:00 ET (noon)
    expect(formatET("2026-06-11T16:00:00Z")).toBe("Jun 11 · 12:00 PM ET");
    // 04:00 UTC -> 00:00 ET (midnight -> 12:00 AM)
    expect(formatET("2026-06-11T04:00:00Z")).toBe("Jun 11 · 12:00 AM ET");
  });
});

describe("countdownTo", () => {
  it("reports done at or past the target", () => {
    expect(countdownTo("2026-06-11T12:00:00Z", NOW).done).toBe(true);
  });

  it("breaks down remaining time correctly", () => {
    const c = countdownTo("2026-06-13T14:30:45Z", NOW);
    expect(c.done).toBe(false);
    expect(c.days).toBe(2);
    expect(c.hours).toBe(2);
    expect(c.minutes).toBe(30);
    expect(c.seconds).toBe(45);
  });
});

describe("formatCAD", () => {
  it("rounds and appends the currency label", () => {
    expect(formatCAD(180)).toBe("$180 CAD");
    expect(formatCAD(42.5)).toBe("$43 CAD");
    expect(formatCAD(1234.4)).toBe("$1,234 CAD");
  });
});
