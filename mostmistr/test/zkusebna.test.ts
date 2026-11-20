// Ověřovací případy zkušebny musí sedět s teorií i bez prohlížeče.
import { describe, expect, it } from "vitest";
import { BehZkusebny, SNIMKU_ZA_SEKUNDU } from "../src/zkusebna/beh";
import { PRIPADY, vyhovuje } from "../src/zkusebna/pripady";
import { jeKlicTextu } from "../src/ui/slovnik";
import { Zaznam, prazdnySnimek } from "../src/zkouska/zaznam";

describe("případy zkušebny", () => {
  for (const pripad of PRIPADY) {
    it(`${pripad.id}: výsledek odpovídá teorii`, () => {
      const pripraveny = pripad.priprav();
      const beh = new BehZkusebny(pripraveny);
      const zaznam = new Zaznam();
      while (!beh.hotovo) beh.pokracuj(1, (snimek) => zaznam.pridej(snimek));

      const overeni = beh.vyhodnot();
      expect(overeni.length).toBeGreaterThan(0);
      for (const o of overeni) {
        expect(jeKlicTextu(o.nazev), o.nazev).toBe(true);
        expect(vyhovuje(o), `${o.nazev}: vyšlo ${o.namereno}, má vyjít ${o.ocekavano} ${o.jednotka}`).toBe(true);
      }

      // Záznam pokrývá celý děj, zhruba šedesát snímků na sekundu, a neobsahuje neplatná čísla.
      expect(zaznam.konec).toBeGreaterThan(pripraveny.trvani - 2 / SNIMKU_ZA_SEKUNDU);
      expect(zaznam.snimky.length).toBeGreaterThan(pripraveny.trvani * SNIMKU_ZA_SEKUNDU * 0.95);
      for (const snimek of zaznam.snimky) {
        expect(snimek.polohy.every(Number.isFinite)).toBe(true);
        expect(snimek.vyuziti.every(Number.isFinite)).toBe(true);
      }
      expect(jeKlicTextu(pripad.nazev) && jeKlicTextu(pripad.popis)).toBe(true);
    }, 120_000);
  }

  it("případ, jehož výsledek teorii neodpovídá, se pozná", () => {
    expect(vyhovuje({ nazev: "zkusebna.overeni.perioda", namereno: 1.05, ocekavano: 1, jednotka: "s", mist: 2, tolerance: 0.01 })).toBe(false);
    expect(vyhovuje({ nazev: "zkusebna.overeni.perioda", namereno: 1.005, ocekavano: 1, jednotka: "s", mist: 2, tolerance: 0.01 })).toBe(true);
    expect(vyhovuje({ nazev: "zkusebna.overeni.odchylkaEnergie", namereno: 12, ocekavano: 0, jednotka: "ppm", mist: 2, tolerance: 10, absolutni: true })).toBe(false);
  });
});

describe("záznam", () => {
  const zaznam = new Zaznam();
  const snimek = (cas: number, x: number) => ({
    cas,
    polohy: Float32Array.from([x, 2 * x]),
    vyuziti: Float32Array.from([x / 10]),
    kola: new Float32Array(0),
  });
  zaznam.pridej(snimek(0, 0));
  zaznam.pridej(snimek(1, 10));
  zaznam.pridej(snimek(2, 30));

  it("mezi snímky prokládá lineárně", () => {
    const cil = prazdnySnimek(1, 1, 0);
    expect(zaznam.stavV(0.25, cil)).toBe(true);
    expect(Array.from(cil.polohy)).toEqual([2.5, 5]);
    expect(cil.vyuziti[0]).toBeCloseTo(0.25, 6);
    zaznam.stavV(1.5, cil);
    expect(cil.polohy[0]).toBe(20);
    expect(cil.cas).toBe(1.5);
  });

  it("mimo rozsah vrací krajní snímek", () => {
    const cil = prazdnySnimek(1, 1, 0);
    zaznam.stavV(-5, cil);
    expect(cil.polohy[0]).toBe(0);
    zaznam.stavV(99, cil);
    expect(cil.polohy[0]).toBe(30);
    expect(zaznam.konec).toBe(2);
  });

  it("prázdný záznam nic nevrátí", () => {
    expect(new Zaznam().stavV(0, prazdnySnimek(1, 1, 0))).toBe(false);
  });
});
