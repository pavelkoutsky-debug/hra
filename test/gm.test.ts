import { describe, expect, it } from "vitest";
import { buildTurnMessage, rawToGmResult, GAME_START_INPUT } from "../src/worker/gm";
import { buildNpcContext } from "../src/worker/npc";
import { NPC_CARDS } from "../src/worker/content";
import { newGameState } from "../src/shared/rules";

describe("rawToGmResult", () => {
  it("převádí pole dvojic na mapy a parsuje hodnoty flagů", () => {
    const result = rawToGmResult({
      narration: "Text.",
      checks: [],
      state_patch: {
        location: "krcma",
        time_cost_min: 25,
        hp_delta: -2,
        inventory_add: [],
        inventory_remove: [],
        flags_set: [
          { key: "knoflik", value: "true" },
          { key: "dluh", value: "30" },
          { key: "heslo", value: "u tří studní" },
        ],
        axes_delta: { povest: 0, golem: 0, odhaleni: 1, pogrom: 0 },
        npc_attitude_delta: [{ npc_id: "marketa", delta: 1 }],
        combat: null,
      },
      chronicle_update: null,
      npc_dialogue: null,
      ending: null,
      quick_actions: ["Rozhlédni se"],
    });
    expect(result.state_patch.location).toBe("krcma");
    expect(result.state_patch.flags_set).toEqual({ knoflik: true, dluh: 30, heslo: "u tří studní" });
    expect(result.state_patch.npc_attitude_delta).toEqual({ marketa: 1 });
  });

  it("location null se vynechá (žádný přesun)", () => {
    const result = rawToGmResult({
      narration: "x",
      checks: [],
      state_patch: {
        location: null, time_cost_min: 5, hp_delta: 0,
        inventory_add: [], inventory_remove: [], flags_set: [],
        axes_delta: { povest: 0, golem: 0, odhaleni: 0, pogrom: 0 },
        npc_attitude_delta: [], combat: null,
      },
      chronicle_update: null, npc_dialogue: null, ending: null, quick_actions: [],
    });
    expect(result.state_patch.location).toBeUndefined();
  });
});

describe("buildTurnMessage", () => {
  it("obsahuje stav, kostky a vstup hráče", () => {
    const s = newGameState("sikula");
    const msg = buildTurnMessage(s, "Prohlédnu okenici.", [14, 3, 18]);
    expect(msg).toContain("[STAV HRY]");
    expect(msg).toContain("14, 3, 18");
    expect(msg).toContain("Prohlédnu okenici.");
    expect(msg).toContain("do návratu rabiho zbývá 24 h 00 min");
  });

  it("značka začátku hry už žádný zvláštní pokyn nedostává (úvod je pevný text)", () => {
    const s = newGameState("ucenec");
    const msg = buildTurnMessage(s, GAME_START_INPUT, [1, 2, 3]);
    expect(msg).not.toContain("[POKYN]");
  });
});

describe("obsah", () => {
  it("existuje 12 NPC karet a všechny mají kontrakt dialogu", () => {
    expect(Object.keys(NPC_CARDS)).toHaveLength(12);
    for (const [id, card] of Object.entries(NPC_CARDS)) {
      expect(card, id).toContain("Pravidla dialogu");
      expect(card, id).toContain("learned_facts");
    }
  });

  it("NPC kontext zmiňuje vztah a archetyp", () => {
    const s = newGameState("presvedcivy");
    s.npcAttitudes["pinchas"] = 2;
    const ctx = buildNpcContext("pinchas", s);
    expect(ctx).toContain("vztah k němu: 2");
    expect(ctx).toContain("přesvědčivý");
  });
});
