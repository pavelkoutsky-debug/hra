/**
 * Živý smoke test proti Anthropic API — spouští se jen ručně:
 *   ANTHROPIC_API_KEY=... npm run smoke
 * Odehraje první skutečný tah (GM/Opus, navazuje na pevný úvod) a jednu repliku NPC (Haiku).
 * Stojí pár korun.
 */
import { describe, expect, it } from "vitest";
import { runGmTurn, GAME_START_INPUT } from "../src/worker/gm";
import { runNpcTurn } from "../src/worker/npc";
import { newGameState } from "../src/shared/rules";
import { archetypeIntro } from "../src/shared/canon";
import { drainSse } from "./helpers/sse";
import type { GmResult, NpcResult } from "../src/shared/types";

const apiKey = process.env.ANTHROPIC_API_KEY;

describe.skipIf(!apiKey)("živý smoke test", () => {
  it("GM naváže na pevný úvod a vrátí validní strukturu", { timeout: 180_000 }, async () => {
    const state = newGameState("ucenec");
    const { intro } = archetypeIntro("ucenec");
    const history = [{ player: GAME_START_INPUT, narration: intro }];
    const stream = await runGmTurn(apiKey!, {
      state,
      history,
      playerInput: "Otevřu Avramovi dveře a zeptám se, co se na půdě stalo.",
    });
    const { deltas, done } = await drainSse(stream);

    expect(done, "stream musí skončit done zprávou").toBeTruthy();
    const result = done.result as GmResult;
    console.log("\n--- GM první tah ---\n" + result.narration + "\n");

    expect(result.narration.length).toBeGreaterThan(100);
    expect(deltas).toBe(result.narration); // streaming extrakce sedí s finálním JSONem
    expect(result.state_patch.time_cost_min).toBeGreaterThanOrEqual(0);
    expect(result.quick_actions.length).toBeGreaterThan(0);
    expect(result.ending).toBeNull();
  });

  it("NPC (šámes Avram) odpoví v roli", { timeout: 120_000 }, async () => {
    const state = newGameState("ucenec");
    state.chronicle = "Učedník ráno zjistil, že z půdy zmizel šém.";
    const stream = await runNpcTurn(apiKey!, {
      npcId: "avram",
      state,
      dialogue: [],
      playerInput: "Avrame, co se v noci stalo? Vypadáš hrozně.",
    });
    const { done } = await drainSse(stream);
    const result = done.result as NpcResult;
    console.log("\n--- Avram ---\n" + result.reply + "\n");

    expect(result.reply.length).toBeGreaterThan(10);
    expect(typeof result.end_dialogue).toBe("boolean");
    expect(Array.isArray(result.learned_facts)).toBe(true);
  });
});
