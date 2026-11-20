import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jeKlicTextu, t } from "../src/ui/slovnik";

describe("slovník", () => {
  it("doplní hodnoty na označená místa", () => {
    expect(t("souradnice.bod", { x: "3", y: "−2" })).toBe("x = 3 m · y = −2 m");
  });

  it("chybějící hodnotu nechá viditelnou, aby se na ni přišlo", () => {
    expect(t("souradnice.bod", { x: "3" })).toBe("x = 3 m · y = {y} m");
  });

  it("stránka odkazuje jen na texty, které ve slovníku jsou", () => {
    const stranka = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
    const klice = [...stranka.matchAll(/data-(?:text|popis)="([^"]+)"/g)].map((nalez) => nalez[1]!);
    expect(klice.length).toBeGreaterThan(5);
    for (const klic of klice) expect(jeKlicTextu(klic), klic).toBe(true);
  });
});
