// Ověřovací případy zkušebny musí sedět s teorií i bez prohlížeče.
import { describe, expect, it } from "vitest";
import { BehZkusebny, SNIMKU_ZA_SEKUNDU } from "../src/zkusebna/beh";
import { PRIPADY, vyhovuje } from "../src/zkusebna/pripady";
import { jeKlicTextu } from "../src/ui/slovnik";
import { Zaznam, prazdnySnimek, type Snimek, type Topologie } from "../src/zkouska/zaznam";

/** Případy, ve kterých se má konstrukce porušit. */
const S_PORUSENIM = new Set(["pretizeni", "plast"]);

describe("případy zkušebny", () => {
  for (const pripad of PRIPADY) {
    it(`${pripad.id}: výsledek odpovídá teorii`, () => {
      const pripraveny = pripad.priprav();
      const beh = new BehZkusebny(pripraveny);
      const zaznam = new Zaznam();
      while (!beh.hotovo) {
        const davka = beh.pokracuj(1);
        davka.topologie.forEach((t) => zaznam.pridejTopologii(t));
        davka.snimky.forEach((s) => zaznam.pridej(s));
        zaznam.udalosti.push(...davka.udalosti);
      }

      const overeni = beh.vyhodnot();
      expect(overeni.length).toBeGreaterThan(0);
      for (const o of overeni) {
        expect(jeKlicTextu(o.nazev), o.nazev).toBe(true);
        expect(vyhovuje(o), `${o.nazev}: vyšlo ${o.namereno}, má vyjít ${o.ocekavano} ${o.jednotka}`).toBe(true);
      }

      // Záznam pokrývá celý děj, zhruba šedesát snímků na sekundu, a neobsahuje neplatná čísla.
      expect(pripraveny.simulace.rozpadla).toBe(false);
      expect(zaznam.konec).toBeGreaterThan(beh.konec - 2 / SNIMKU_ZA_SEKUNDU);
      expect(zaznam.snimky.length).toBeGreaterThan(beh.konec * SNIMKU_ZA_SEKUNDU * 0.95);
      for (const snimek of zaznam.snimky) {
        const stavba = zaznam.topologie[snimek.topologie]!;
        expect(snimek.polohy.length).toBe(2 * stavba.stycniku);
        expect(snimek.vyuziti.length).toBe(stavba.prvekA.length);
        expect(snimek.polohy.every(Number.isFinite)).toBe(true);
        expect(snimek.vyuziti.every(Number.isFinite)).toBe(true);
        expect(snimek.sily.every(Number.isFinite)).toBe(true);
      }
      expect(jeKlicTextu(pripad.nazev) && jeKlicTextu(pripad.popis)).toBe(true);

      // Porušení je jen tam, kde být má; každé přidá novou stavbu a děj po něm brzy skončí.
      if (S_PORUSENIM.has(pripad.id)) {
        expect(zaznam.udalosti.length).toBeGreaterThan(0);
        expect(zaznam.topologie.length).toBeGreaterThan(1);
        expect(beh.konec).toBeLessThan(pripraveny.trvani);
        expect(beh.konec - zaznam.udalosti[0]!.cas).toBeCloseTo(pripraveny.dobehPoPoruseni!, 1);
      } else {
        expect(zaznam.udalosti).toEqual([]);
        expect(zaznam.topologie.length).toBe(1);
      }
    }, 120_000);
  }

  it("případ, jehož výsledek teorii neodpovídá, se pozná", () => {
    expect(vyhovuje({ nazev: "zkusebna.overeni.perioda", namereno: 1.05, ocekavano: 1, jednotka: "s", mist: 2, tolerance: 0.01 })).toBe(false);
    expect(vyhovuje({ nazev: "zkusebna.overeni.perioda", namereno: 1.005, ocekavano: 1, jednotka: "s", mist: 2, tolerance: 0.01 })).toBe(true);
    expect(vyhovuje({ nazev: "zkusebna.overeni.odchylkaEnergie", namereno: 12, ocekavano: 0, jednotka: "ppm", mist: 2, tolerance: 10, absolutni: true })).toBe(false);
  });
});

describe("záznam", () => {
  const stavba = (stycniku: number): Topologie => ({
    stycniku,
    prvekA: new Int32Array(1),
    prvekB: new Int32Array(1),
    cara: new Uint8Array(1),
    klouby: new Uint8Array(1),
    podpory: new Uint8Array(stycniku),
    znacky: new Uint8Array(stycniku),
  });
  const snimek = (cas: number, x: number, topologie = 0): Snimek => ({
    cas,
    topologie,
    polohy: topologie === 0 ? Float32Array.from([x, 2 * x]) : Float32Array.from([x, 2 * x, 7, 7]),
    vyuziti: Float32Array.from([x / 10]),
    kola: new Float32Array(0),
    sily: new Float32Array(0),
  });
  const zaznam = new Zaznam();
  zaznam.pridejTopologii(stavba(1));
  zaznam.pridej(snimek(0, 0));
  zaznam.pridej(snimek(1, 10));
  zaznam.pridej(snimek(2, 30));

  it("mezi snímky prokládá lineárně", () => {
    const cil = prazdnySnimek();
    expect(zaznam.stavV(0.25, cil)).toBe(zaznam.topologie[0]);
    expect(Array.from(cil.polohy)).toEqual([2.5, 5]);
    expect(cil.vyuziti[0]).toBeCloseTo(0.25, 6);
    zaznam.stavV(1.5, cil);
    expect(cil.polohy[0]).toBe(20);
    expect(cil.cas).toBe(1.5);
  });

  it("mimo rozsah vrací krajní snímek", () => {
    const cil = prazdnySnimek();
    zaznam.stavV(-5, cil);
    expect(cil.polohy[0]).toBe(0);
    zaznam.stavV(99, cil);
    expect(cil.polohy[0]).toBe(30);
    expect(zaznam.konec).toBe(2);
  });

  it("prázdný záznam nic nevrátí", () => {
    expect(new Zaznam().stavV(0, prazdnySnimek())).toBeNull();
  });

  it("přes porušení neprokládá: před ním platí stará stavba, po něm nová", () => {
    const sPorusenim = new Zaznam();
    sPorusenim.pridejTopologii(stavba(1));
    sPorusenim.pridejTopologii(stavba(2));
    sPorusenim.pridej(snimek(0, 0));
    sPorusenim.pridej(snimek(1, 10));
    sPorusenim.pridej(snimek(1.01, 11, 1));
    sPorusenim.pridej(snimek(2, 20, 1));
    const cil = prazdnySnimek();

    expect(sPorusenim.stavV(1.005, cil)).toBe(sPorusenim.topologie[0]);
    expect(Array.from(cil.polohy)).toEqual([10, 20]);
    expect(sPorusenim.stavV(1.505, cil)).toBe(sPorusenim.topologie[1]);
    expect(cil.polohy.length).toBe(4);
    expect(cil.polohy[0]).toBeCloseTo(15.5, 4);
    // Návrat před porušení pole zase zmenší.
    expect(sPorusenim.stavV(0.5, cil)).toBe(sPorusenim.topologie[0]);
    expect(Array.from(cil.polohy)).toEqual([5, 10]);
  });
});
