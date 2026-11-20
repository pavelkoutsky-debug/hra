import { describe, expect, it } from "vitest";
import { cislo, datum, delka, meritkoVykresu, vyskovaKota } from "../src/ui/formaty";

describe("čísla po česku", () => {
  it("desetinná čárka", () => {
    expect(cislo(24, 2)).toBe("24,00");
    expect(cislo(1.005, 1)).toBe("1,0");
  });

  it("typografické minus", () => {
    expect(cislo(-6, 2)).toBe("−6,00");
  });

  it("záporná nula se píše jako nula", () => {
    expect(cislo(-0.001, 2)).toBe("0,00");
    expect(cislo(-0, 0)).toBe("0");
  });

  it("délka má jednotku", () => {
    expect(delka(32)).toBe("32,00 m");
  });

  it("výšková kóta má u kladných hodnot plus", () => {
    expect(vyskovaKota(2)).toBe("+2,00");
    expect(vyskovaKota(-6)).toBe("−6,00");
    expect(vyskovaKota(0)).toBe("0,00");
  });
});

describe("měřítko výkresu", () => {
  it("vychází z velikosti CSS pixelu 1/96 palce", () => {
    // 1 m světa = 1000 mm; při 37,795 px/m je to 10 mm obrazovky, tedy 1 : 100.
    expect(meritkoVykresu(3779.5275 / 100)).toBe("1 : 100");
  });

  it("zaokrouhluje na hezká čísla", () => {
    expect(meritkoVykresu(20)).toBe("1 : 190");
    expect(meritkoVykresu(240)).toBe("1 : 16");
    expect(meritkoVykresu(3)).toBe("1 : 1250");
  });
});

describe("datum", () => {
  it("den, měsíc a rok s tečkami", () => {
    expect(datum(new Date(2026, 10, 20))).toBe("20. 11. 2026");
  });
});
