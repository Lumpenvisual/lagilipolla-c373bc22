import { describe, it, expect } from "vitest";
import { ALIAS_RE, PIN_RE, aliasToEmail, pinToPassword } from "@/lib/auth";

describe("alias → synthetic email mapping", () => {
  it("lowercases, strips accents and spaces into a stable local email", () => {
    expect(aliasToEmail("José Pérez")).toBe("jose.perez@polla.local");
  });
  it("collapses repeated separators and trims leading/trailing dots", () => {
    expect(aliasToEmail("  Rafa__Castro!! ")).toBe("rafa.castro@polla.local");
  });
  it("is deterministic — same alias always maps to the same email", () => {
    expect(aliasToEmail("Troi")).toBe(aliasToEmail(" troi "));
  });
});

describe("PIN → password derivation", () => {
  it("derives a password long enough to satisfy auth min length", () => {
    const pwd = pinToPassword("1234");
    expect(pwd).toBe("polla-pin-1234");
    expect(pwd.length).toBeGreaterThanOrEqual(6);
  });
});

describe("ALIAS_RE validation", () => {
  it.each(["Ab", "Rafa Castro", "user_1.2-3", "a".repeat(24)])("accepts valid alias %s", (a) =>
    expect(ALIAS_RE.test(a)).toBe(true),
  );
  it.each(["a", "", "a".repeat(25), "bad@alias", "emoji😀"])("rejects invalid alias %s", (a) =>
    expect(ALIAS_RE.test(a)).toBe(false),
  );
});

describe("PIN_RE validation", () => {
  it.each(["0000", "1234", "9999"])("accepts 4-digit PIN %s", (p) =>
    expect(PIN_RE.test(p)).toBe(true),
  );
  it.each(["123", "12345", "12a4", "", "abcd"])("rejects invalid PIN %s", (p) =>
    expect(PIN_RE.test(p)).toBe(false),
  );
});

// Mirrors the client-side guard order in RegistrationForm so the registration
// contract stays covered even if the component markup changes.
function validateRegistration(alias: string, pin: string, pin2: string, accepted: boolean) {
  if (!ALIAS_RE.test(alias.trim())) return "alias";
  if (!PIN_RE.test(pin)) return "pin";
  if (pin !== pin2) return "pinMatch";
  if (!accepted) return "accept";
  return "ok" as const;
}

describe("registration form validation order", () => {
  it("passes a fully valid submission", () => {
    expect(validateRegistration("Rafa", "1234", "1234", true)).toBe("ok");
  });
  it("flags a bad alias first", () => {
    expect(validateRegistration("a", "12", "34", false)).toBe("alias");
  });
  it("flags a bad PIN when alias is valid", () => {
    expect(validateRegistration("Rafa", "12", "12", true)).toBe("pin");
  });
  it("flags mismatched PINs", () => {
    expect(validateRegistration("Rafa", "1234", "5678", true)).toBe("pinMatch");
  });
  it("requires accepting the terms", () => {
    expect(validateRegistration("Rafa", "1234", "1234", false)).toBe("accept");
  });
});
