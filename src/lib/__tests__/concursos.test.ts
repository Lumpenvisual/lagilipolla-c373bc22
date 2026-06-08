import { describe, it, expect } from "vitest";
import {
  MODALIDAD_ORDER,
  MODALIDAD_LABEL,
  MODALIDAD_DESC,
  MODALIDAD_ICON,
  MODALIDAD_ACCENT,
  isModalidad,
  type Modalidad,
} from "@/lib/concursos";
import { translations } from "@/lib/i18n/translations";

describe("modality configuration completeness", () => {
  it("exposes exactly the four supported modalities", () => {
    expect(MODALIDAD_ORDER).toEqual(["partido", "dia", "fase", "mundial"]);
  });

  it.each(MODALIDAD_ORDER)("modality %s has full UI config", (m: Modalidad) => {
    expect(MODALIDAD_LABEL[m]).toBeTruthy();
    expect(MODALIDAD_DESC[m]).toBeTruthy();
    expect(MODALIDAD_ICON[m]).toBeTruthy();
    expect(MODALIDAD_ACCENT[m].chip).toBeTruthy();
  });

  it("isModalidad guards correctly", () => {
    for (const m of MODALIDAD_ORDER) expect(isModalidad(m)).toBe(true);
    for (const bad of ["", "torneo", null, undefined, 42]) {
      expect(isModalidad(bad)).toBe(false);
    }
  });
});

describe("modality labels are translated in every language", () => {
  const langs = ["es", "en", "fr"] as const;
  it.each(langs)("language %s resolves every modality label", (lang) => {
    const dict = translations[lang] as Record<string, string>;
    for (const m of MODALIDAD_ORDER) {
      expect(dict[MODALIDAD_LABEL[m]]).toBeTruthy();
    }
  });
});
