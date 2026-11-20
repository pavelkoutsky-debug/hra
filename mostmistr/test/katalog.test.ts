import { describe, expect, it } from "vitest";
import { ID_PRVKU, KATALOG, MATERIALY, vlastnostiPrutu } from "../src/data/katalog";

describe("katalog prvků", () => {
  it("ocelový nosník: dvojice HEB 200", () => {
    const v = vlastnostiPrutu("ocel-lehka", 4)!;
    expect(v.EA).toBeCloseTo(210e9 * 2 * 78.1e-4, -3);
    expect(v.EI).toBeCloseTo(210e9 * 2 * 5696e-8, -3);
    expect(v.hmotnostNaMetr).toBeCloseTo(122.6, 6);
    expect(v.polomerSetrvacnosti).toBeCloseTo(0.0854, 4);
    expect(v.tvarny).toBe(true);
    // Plastická únosnost v ohybu: 400 MPa · 2 · 642,5 cm³ = 514 kN·m.
    expect(v.unosnost.moment / 1e3).toBeCloseTo(514, 0);
    expect(v.unosnost.tah / 1e3).toBeCloseTo(6248, 0);
    expect(v.pretrzeni!.sila).toBeGreaterThan(v.unosnost.tah);
  });

  it("smyková plocha HEB odpovídá vzorci A − 2·b·t_f + (t_w + 2·r)·t_f", () => {
    const heb200 = 78.08e-4 - 2 * 0.2 * 0.015 + (0.009 + 2 * 0.018) * 0.015;
    const heb400 = 197.8e-4 - 2 * 0.3 * 0.024 + (0.0135 + 2 * 0.027) * 0.024;
    expect(KATALOG["ocel-lehka"].prurez!.As / 2 / heb200).toBeCloseTo(1, 2);
    expect(KATALOG["ocel-tezka"].prurez!.As / 2 / heb400).toBeCloseTo(1, 2);
  });

  it("dřevěný trám je křehký a jeho pevnost v ohybu je střední hodnota kolem 32 MPa", () => {
    const v = vlastnostiPrutu("drevo-lehke", 4)!;
    expect(v.tvarny).toBe(false);
    expect(v.pretrzeni).toBeUndefined();
    expect(MATERIALY.drevo.mez.ohyb / 1e6).toBeCloseTo(31.9, 1);
    // Křehký průřez selže při dosažení meze v krajním vlákně: pružný modul 2·b·h²/6.
    expect(v.unosnost.moment).toBeCloseTo(MATERIALY.drevo.mez.ohyb * ((2 * 0.14 * 0.28 ** 2) / 6), 3);
  });

  it("mostovka se násobí šířkou z úrovně", () => {
    const uzka = vlastnostiPrutu("mostovka-drevo", 2)!;
    const siroka = vlastnostiPrutu("mostovka-drevo", 6)!;
    expect(siroka.EA / uzka.EA).toBeCloseTo(3, 12);
    expect(siroka.hmotnostNaMetr / uzka.hmotnostNaMetr).toBeCloseTo(3, 12);
    expect(siroka.unosnost.moment / uzka.unosnost.moment).toBeCloseTo(3, 12);
    expect(siroka.polomerSetrvacnosti).toBeCloseTo(uzka.polomerSetrvacnosti, 12);
  });

  it("lano přenáší jen tah a nemá ohybovou ani smykovou tuhost", () => {
    const v = vlastnostiPrutu("lano", 4)!;
    expect(v.EI).toBe(0);
    expect(v.GAs).toBe(Infinity);
    expect(v.unosnost.tlak).toBe(0);
    expect(v.unosnost.tah / 1e3).toBeCloseTo(1400e3 * 2 * 942e-6, 0);
  });

  it("tlumič, pružina a píst průřez nemají", () => {
    for (const id of ["tlumic", "pruzina", "pist"] as const) expect(vlastnostiPrutu(id, 4)).toBeNull();
  });

  it("rychlost podélné vlny všech prutů je ve věrohodném rozmezí", () => {
    for (const id of ID_PRVKU) {
      const v = vlastnostiPrutu(id, 4);
      if (!v) continue;
      const rychlost = Math.sqrt(v.EA / v.hmotnostNaMetr);
      expect(rychlost, id).toBeGreaterThan(2500);
      expect(rychlost, id).toBeLessThan(5500);
    }
  });

  it("každý prvek s průřezem má materiál a kladnou únosnost v tahu", () => {
    for (const id of ID_PRVKU) {
      const polozka = KATALOG[id];
      expect(Boolean(polozka.material), id).toBe(Boolean(polozka.prurez));
      const v = vlastnostiPrutu(id, 4);
      if (v) expect(v.unosnost.tah, id).toBeGreaterThan(0);
    }
  });
});
