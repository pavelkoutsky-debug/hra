import { afterEach, describe, expect, it } from "vitest";
import { celeCislo, cislo, datum, delka, hmotnost, koruny, meritkoVykresu, procenta, vyskovaKota } from "../src/ui/formaty";
import { nastavJazyk } from "../src/ui/slovnik";

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

describe("částky, procenta a hmotnosti", () => {
  it("tisíce odděluje úzká nedělitelná mezera", () => {
    expect(celeCislo(0)).toBe("0");
    expect(celeCislo(999)).toBe("999");
    expect(celeCislo(33500)).toBe("33\u202f500");
    expect(celeCislo(1234567.4)).toBe("1\u202f234\u202f567");
    expect(celeCislo(-2500)).toBe("−2\u202f500");
  });

  it("koruny mají jednotku za nedělitelnou mezerou", () => {
    expect(koruny(33133)).toBe("33\u202f133\u00a0Kč");
    expect(koruny(0)).toBe("0\u00a0Kč");
  });

  it("podíl se píše jako celá procenta", () => {
    expect(procenta(0.756)).toBe("76\u00a0%");
    expect(procenta(1.35)).toBe("135\u00a0%");
  });

  it("hmotnost do tuny v kilogramech, výš v tunách", () => {
    expect(hmotnost(924.4)).toBe("924\u00a0kg");
    expect(hmotnost(3400)).toBe("3,4\u00a0t");
  });
});

describe("čísla anglicky", () => {
  afterEach(() => nastavJazyk("cs"));

  it("desetinná tečka, čárka mezi tisíci, minus zůstává typografické", () => {
    nastavJazyk("en");
    expect(cislo(24, 2)).toBe("24.00");
    expect(cislo(-6.5, 1)).toBe("−6.5");
    expect(delka(32)).toBe("32.00 m");
    expect(vyskovaKota(2)).toBe("+2.00");
    expect(vyskovaKota(0)).toBe("0.00");
    expect(celeCislo(1234567.4)).toBe("1,234,567");
    expect(celeCislo(-2500)).toBe("−2,500");
    expect(koruny(33133)).toBe("33,133\u00a0Kč");
    expect(hmotnost(1250)).toBe("1.3\u00a0t");
    expect(procenta(0.756)).toBe("76%");
  });

  it("datum má měsíc slovem, aby se nespletl den s měsícem", () => {
    nastavJazyk("en");
    expect(datum(new Date(2026, 10, 3))).toBe("3 Nov 2026");
  });
});
