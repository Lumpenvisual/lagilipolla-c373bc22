import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { LanguageProvider } from "@/lib/i18n";
import { EspecialAuditChip } from "@/components/EspecialAuditChip";

/**
 * Regresión: EspecialAuditChip usaba <Tooltip> sin un <TooltipProvider> ancestro.
 * Radix lanza "`Tooltip` must be used within `TooltipProvider`" en cuanto se
 * renderiza un chip CON tooltip (typo/apellido/ambiguo/selección distinta) — eso
 * tiraba toda la página (/admin/resultados → desplegable de especiales) al error
 * boundary raíz en producción. Cada caso de abajo antes tiraba esa excepción.
 */
function renderChip(pick: string | null, oficial: string | null) {
  return render(
    createElement(LanguageProvider, null, createElement(EspecialAuditChip, { pick, oficial })),
  );
}

describe("EspecialAuditChip", () => {
  it("no revienta con selección distinta (tiene tooltip)", () => {
    expect(() => renderChip("Harry Kane (Inglaterra)", "Kylian Mbappé (Francia)")).not.toThrow();
  });

  it("no revienta con un typo (tiene tooltip)", () => {
    expect(() => renderChip("Kyllan Mbappé (Francia)", "Kylian Mbappé (Francia)")).not.toThrow();
  });

  it("no revienta con coincidencia por apellido (tiene tooltip)", () => {
    expect(() => renderChip("Mbappe (Francia)", "Kylian Mbappé (Francia)")).not.toThrow();
  });

  it("no revienta con nombre ambiguo, sin selección (tiene tooltip)", () => {
    expect(() => renderChip("Mbappe", "Kylian Mbappé (Francia)")).not.toThrow();
  });

  it("no revienta en el caso exacto (sin tooltip)", () => {
    expect(() => renderChip("Kylian Mbappé (Francia)", "Kylian Mbappé (Francia)")).not.toThrow();
  });

  it("no dibuja nada si aún no hay oficial", () => {
    const { container } = renderChip("Kylian Mbappé (Francia)", null);
    expect(container.innerHTML).toBe("");
  });

  it("muestra el motivo en el chip (selección distinta)", () => {
    const { container } = renderChip("Harry Kane (Inglaterra)", "Kylian Mbappé (Francia)");
    expect(container.textContent).toContain("0");
  });
});
