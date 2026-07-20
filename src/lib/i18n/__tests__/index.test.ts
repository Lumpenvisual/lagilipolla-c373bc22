import { describe, it, expect, beforeEach } from "vitest";
import { readLang, ENGLISH_ENABLED } from "@/lib/i18n";

const STORAGE_KEY = "polla-lang";

/**
 * El inglés está deshabilitado (ENGLISH_ENABLED = false, jul-2026): el catálogo
 * "en" no cubre landing/reglas/cronograma/dashboard/leaderboard/podio. Mientras
 * el flag siga en false, cualquier "en" persistido debe leerse como "es" — nadie
 * debe quedar atrapado en una app a medio traducir.
 */
describe("readLang — con ENGLISH_ENABLED = false", () => {
  beforeEach(() => localStorage.clear());

  it("el flag está apagado (documenta la decisión, no solo el comportamiento)", () => {
    expect(ENGLISH_ENABLED).toBe(false);
  });

  it("sin nada guardado, cae a español", () => {
    expect(readLang()).toBe("es");
  });

  it("con 'es' guardado, respeta español", () => {
    localStorage.setItem(STORAGE_KEY, "es");
    expect(readLang()).toBe("es");
  });

  it("con 'en' guardado de una sesión anterior, se sanea a español", () => {
    localStorage.setItem(STORAGE_KEY, "en");
    expect(readLang()).toBe("es");
  });

  it("un valor corrupto en localStorage no rompe, cae a español", () => {
    localStorage.setItem(STORAGE_KEY, "fr");
    expect(readLang()).toBe("es");
  });
});
