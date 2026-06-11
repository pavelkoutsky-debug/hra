import { describe, expect, it } from "vitest";
import { preRollDice, rollD20 } from "../src/worker/dice";

describe("kostky", () => {
  it("d20 vrací 1–20 přes celé spektrum rng", () => {
    expect(rollD20(() => 0)).toBe(1);
    expect(rollD20(() => 0.9999)).toBe(20);
    for (let i = 0; i < 1000; i++) {
      const r = rollD20();
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(20);
    }
  });

  it("předhazuje požadovaný počet kostek", () => {
    expect(preRollDice()).toHaveLength(3);
    expect(preRollDice(5, () => 0.5)).toEqual([11, 11, 11, 11, 11]);
  });
});
