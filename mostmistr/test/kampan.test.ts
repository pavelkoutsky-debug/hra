// Odemykání úrovní kampaně: po jedné uvnitř kapitoly, další kapitola po dvou projitých úrovních.
import { describe, expect, it } from "vitest";
import { kapitolaUrovne, zamkyKampane, type StavUrovne } from "../src/data/kampan";

const KAMPAN = ["1-01", "1-02", "1-03", "1-04", "2-01", "2-02", "2-03", "2-04", "3-01"];

function zamky(projite: string[], rozestavene: string[] = []): Record<string, string> {
  const stav = (id: string): StavUrovne => ({ projita: projite.includes(id), rozestavena: rozestavene.includes(id) });
  const vysledek = zamkyKampane(KAMPAN, stav);
  return Object.fromEntries(
    KAMPAN.map((id, i) => {
      const z = vysledek[i]!;
      return [id, z === null ? "volno" : z.druh === "uroven" ? `po ${z.uroven}` : `kapitola ${z.kapitola}: zbývá ${z.zbyva}`];
    }),
  );
}

describe("odemykání kampaně", () => {
  it("kapitola je číslo před pomlčkou", () => {
    expect(kapitolaUrovne("1-03")).toBe("1");
    expect(kapitolaUrovne("7-04")).toBe("7");
  });

  it("nový hráč má otevřenou jen první úroveň a ví, na co ostatní čekají", () => {
    expect(zamky([])).toEqual({
      "1-01": "volno",
      "1-02": "po 1-01",
      "1-03": "po 1-02",
      "1-04": "po 1-03",
      "2-01": "kapitola 1: zbývá 2",
      "2-02": "po 2-01",
      "2-03": "po 2-02",
      "2-04": "po 2-03",
      "3-01": "kapitola 2: zbývá 2",
    });
  });

  it("uvnitř kapitoly se jde po jedné", () => {
    const z = zamky(["1-01"]);
    expect(z["1-02"]).toBe("volno");
    expect(z["1-03"]).toBe("po 1-02");
    expect(z["2-01"]).toBe("kapitola 1: zbývá 1");
  });

  it("dvě projité úrovně kapitoly otevřou první úroveň kapitoly další, ne až celá kapitola", () => {
    const z = zamky(["1-01", "1-02"]);
    expect(z["1-03"]).toBe("volno");
    expect(z["1-04"]).toBe("po 1-03");
    expect(z["2-01"]).toBe("volno");
    expect(z["2-02"]).toBe("po 2-01");
    // Další kapitola čeká na dvě úrovně té druhé, ne té první.
    expect(z["3-01"]).toBe("kapitola 2: zbývá 2");
  });

  it("zásek na konci kapitoly další kapitoly nezavře", () => {
    const z = zamky(["1-01", "1-02", "1-03", "2-01", "2-02"]);
    expect(z["1-04"]).toBe("volno");
    expect(z["2-03"]).toBe("volno");
    expect(z["2-04"]).toBe("po 2-03");
    expect(z["3-01"]).toBe("volno");
  });

  it("projitá nebo rozestavěná úroveň zůstává odemčená, i když by podle pravidel nebyla", () => {
    // Kapitola 2 projitá dřív, než před ni přibyla kapitola 1: zůstává otevřená.
    const z = zamky(["2-01", "2-02"], ["2-04"]);
    expect(z["2-01"]).toBe("volno");
    expect(z["2-02"]).toBe("volno");
    expect(z["2-03"]).toBe("volno");
    expect(z["2-04"]).toBe("volno");
    expect(z["3-01"]).toBe("volno");
    expect(z["1-02"]).toBe("po 1-01");
  });

  it("kapitola s jedinou úrovní chce jen tu jednu", () => {
    const stav = (id: string): StavUrovne => ({ projita: id === "1-01", rozestavena: false });
    expect(zamkyKampane(["1-01", "2-01", "3-01"], stav)).toEqual([null, null, { druh: "kapitola", kapitola: "2", zbyva: 1 }]);
  });
});
