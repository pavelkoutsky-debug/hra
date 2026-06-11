import { describe, expect, it } from "vitest";
import { applyGmResult, applyNpcOutcome } from "../src/shared/patch";
import { newGameState, TIME_LIMIT_MIN } from "../src/shared/rules";
import type { GmResult } from "../src/shared/types";

function gmResult(overrides: Partial<GmResult> = {}, patch: Partial<GmResult["state_patch"]> = {}): GmResult {
  return {
    narration: "Test.",
    checks: [],
    state_patch: { time_cost_min: 10, ...patch },
    chronicle_update: null,
    npc_dialogue: null,
    ending: null,
    quick_actions: [],
    ...overrides,
  };
}

describe("applyGmResult", () => {
  it("posune čas, tah a nemutuje vstup", () => {
    const s = newGameState("ucenec");
    const next = applyGmResult(s, gmResult());
    expect(next.timeMinutes).toBe(10);
    expect(next.turn).toBe(1);
    expect(s.timeMinutes).toBe(0);
  });

  it("ořezává HP do mezí a smrt nastaví konec", () => {
    const s = newGameState("ucenec");
    const hurt = applyGmResult(s, gmResult({}, { hp_delta: -999 }));
    expect(hurt.hp).toBe(0);
    expect(hurt.ending).toBe("tmava-ulicka");
    const healed = applyGmResult(s, gmResult({}, { hp_delta: +999 }));
    expect(healed.hp).toBe(healed.maxHp);
  });

  it("inventář: přidává bez duplicit, odebírá", () => {
    const s = newGameState("sikula");
    const a = applyGmResult(s, gmResult({}, { inventory_add: ["nůž", "knoflík"] }));
    expect(a.inventory.filter((i) => i === "nůž")).toHaveLength(1);
    expect(a.inventory).toContain("knoflík");
    const b = applyGmResult(a, gmResult({}, { inventory_remove: ["knoflík"] }));
    expect(b.inventory).not.toContain("knoflík");
  });

  it("osy se ořezávají na −10..10 a flagy se slučují", () => {
    const s = newGameState("presvedcivy");
    const next = applyGmResult(s, gmResult({}, {
      axes_delta: { pogrom: 99, povest: -99, golem: 1, odhaleni: 2 },
      flags_set: { "knoflik-nalezen": true },
    }));
    expect(next.axes.pogrom).toBe(10);
    expect(next.axes.povest).toBe(-10);
    expect(next.axes.odhaleni).toBe(2);
    expect(next.flags["knoflik-nalezen"]).toBe(true);
  });

  it("čas nepřeteče limit a kronika/konec se přebírají", () => {
    const s = newGameState("ucenec");
    const next = applyGmResult(s, gmResult(
      { chronicle_update: "Nová kronika.", ending: { id: "navrat-mistra", title: "Návrat mistra" } },
      { time_cost_min: TIME_LIMIT_MIN * 2 },
    ));
    expect(next.timeMinutes).toBe(TIME_LIMIT_MIN);
    expect(next.chronicle).toBe("Nová kronika.");
    expect(next.ending).toBe("navrat-mistra");
  });

  it("combat se nastaví i vynuluje", () => {
    const s = newGameState("sikula");
    const fight = applyGmResult(s, gmResult({}, {
      combat: { enemies: [{ name: "rváč", hp: 4, maxHp: 4 }], round: 1 },
    }));
    expect(fight.combat?.enemies[0].name).toBe("rváč");
    const calm = applyGmResult(fight, gmResult({}, { combat: null }));
    expect(calm.combat).toBeNull();
  });
});

describe("sledování návštěv lokací", () => {
  it("přesun do nové lokace nastaví navstiveno: flag", () => {
    const s = newGameState("ucenec");
    const next = applyGmResult(s, gmResult({}, { location: "synagoga" }));
    expect(next.location).toBe("synagoga");
    expect(next.flags["navstiveno:synagoga"]).toBe(true);
  });

  it("startovní lokace je navštívená od začátku a flag se drží i bez přesunu", () => {
    const s = newGameState("sikula");
    expect(s.flags["navstiveno:rabinuv-dum"]).toBe(true);
    const next = applyGmResult(s, gmResult());
    expect(next.flags["navstiveno:rabinuv-dum"]).toBe(true);
  });

  it("vymyšlené id lokace flag nedostane", () => {
    const s = newGameState("ucenec");
    const next = applyGmResult(s, gmResult({}, { location: "atlantida" }));
    expect(next.flags["navstiveno:atlantida"]).toBeUndefined();
  });
});

describe("applyNpcOutcome", () => {
  it("zapisuje fakta jako flagy a posouvá vztah s ořezem", () => {
    const s = newGameState("ucenec");
    const next = applyNpcOutcome(s, "pinchas", ["Avram dluží Pinchasovi"], 7);
    expect(next.flags["fakt:Avram dluží Pinchasovi"]).toBe(true);
    expect(next.npcAttitudes["pinchas"]).toBe(5);
  });
});
