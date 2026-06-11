/**
 * Živý smoke test proti Anthropic API — spouští se jen ručně:
 *   ANTHROPIC_API_KEY=... npm run smoke
 * Odehraje úvodní scénu (GM/Opus) a jednu repliku NPC (Haiku). Stojí pár korun.
 */
import { describe, expect, it } from "vitest";
import { runGmTurn, GAME_START_INPUT } from "../src/worker/gm";
import { runNpcTurn } from "../src/worker/npc";
import { newGameState } from "../src/shared/rules";
import type { GmResult, NpcResult } from "../src/shared/types";

const apiKey = process.env.ANTHROPIC_API_KEY;

async function drainSse(stream: ReadableStream<Uint8Array>): Promise<{ deltas: string; done: any }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let deltas = "";
  let done: any = null;
  for (;;) {
    const { value, done: eof } = await reader.read();
    if (eof) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const line = buf.slice(0, i).split("\n").find((l) => l.startsWith("data: "));
      buf = buf.slice(i + 2);
      if (!line) continue;
      const msg = JSON.parse(line.slice(6));
      if (msg.t === "delta") deltas += msg.text;
      if (msg.t === "done") done = msg;
      if (msg.t === "err") throw new Error(msg.message);
    }
  }
  return { deltas, done };
}

describe.skipIf(!apiKey)("živý smoke test", () => {
  it("GM odehraje úvodní scénu česky a vrátí validní strukturu", { timeout: 180_000 }, async () => {
    const state = newGameState("ucenec");
    const stream = await runGmTurn(apiKey!, { state, history: [], playerInput: GAME_START_INPUT });
    const { deltas, done } = await drainSse(stream);

    expect(done, "stream musí skončit done zprávou").toBeTruthy();
    const result = done.result as GmResult;
    console.log("\n--- GM úvod ---\n" + result.narration + "\n");

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
