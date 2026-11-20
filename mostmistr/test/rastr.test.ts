import { describe, expect, it } from "vitest";
import { krokyRastru, roztecSrafovani } from "../src/vykres/rastr";

describe("kroky rastru", () => {
  it("při běžném přiblížení je rastr po metru se zvýrazněním po pěti", () => {
    expect(krokyRastru(20)).toEqual({ jemny: 1, hlavni: 5 });
    expect(krokyRastru(8)).toEqual({ jemny: 1, hlavni: 5 });
  });

  it("při oddálení rozteč roste, aby čáry nesplynuly", () => {
    expect(krokyRastru(7.9)).toEqual({ jemny: 5, hlavni: 25 });
    expect(krokyRastru(1)).toEqual({ jemny: 25, hlavni: 100 });
  });

  it("jemné čáry jsou na obrazovce vždy aspoň 8 px od sebe", () => {
    for (const meritko of [0.5, 1, 2, 3, 7.9, 8, 20, 240]) {
      expect(krokyRastru(meritko).jemny * meritko).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("rozteč šrafování", () => {
  it("drží čáry aspoň 9 px od sebe", () => {
    for (const meritko of [3, 8, 20, 60, 240]) {
      expect(roztecSrafovani(meritko) * meritko).toBeGreaterThanOrEqual(9);
    }
  });

  it("volí nejmenší vyhovující rozteč", () => {
    expect(roztecSrafovani(20)).toBe(0.5);
    expect(roztecSrafovani(240)).toBe(0.25);
  });
});
