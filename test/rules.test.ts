import { describe, expect, it } from "vitest";
import { evaluateCheck, newGameState, remainingTime, ARCHETYPES, TIME_LIMIT_MIN } from "../src/shared/rules";

describe("evaluateCheck", () => {
  it("počítá bonus atribut × 3", () => {
    const r = evaluateCheck(2, 10, 12);
    expect(r.bonus).toBe(6);
    expect(r.total).toBe(16);
    expect(r.success).toBe(true);
  });

  it("atribut 0 = automatické selhání i při hodu 20", () => {
    const r = evaluateCheck(0, 20, 8);
    expect(r.success).toBe(false);
  });

  it("nedosažení obtížnosti = neúspěch", () => {
    expect(evaluateCheck(1, 5, 12).success).toBe(false);
    expect(evaluateCheck(1, 9, 12).success).toBe(true);
  });
});

describe("archetypy", () => {
  it("existují tři a mají atributy v rozsahu 0–3", () => {
    expect(ARCHETYPES).toHaveLength(3);
    for (const a of ARCHETYPES) {
      for (const v of Object.values(a.attributes)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(3);
      }
    }
  });

  it("nový stav má HP podle Odvahy a startovní lokaci", () => {
    const s = newGameState("ucenec");
    expect(s.maxHp).toBe(12); // 10 + odvaha 1 × 2
    expect(s.hp).toBe(s.maxHp);
    expect(s.location).toBe("rabinuv-dum");
    expect(s.ending).toBeNull();
  });
});

describe("remainingTime", () => {
  it("odečítá uplynulý čas od 24 hodin", () => {
    const s = newGameState("sikula");
    s.timeMinutes = 90;
    const r = remainingTime(s);
    expect(r.minutes).toBe(TIME_LIMIT_MIN - 90);
    expect(r.label).toBe("22 h 30 min");
  });

  it("nejde do záporu", () => {
    const s = newGameState("sikula");
    s.timeMinutes = TIME_LIMIT_MIN + 500;
    expect(remainingTime(s).minutes).toBe(0);
  });
});
