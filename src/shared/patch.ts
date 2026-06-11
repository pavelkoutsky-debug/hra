import type { GameState, GmResult, StatePatch } from "./types";
import { TIME_LIMIT_MIN } from "./rules";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Aplikuje GM výstup na stav hry. Vrací NOVÝ stav (vstup nemutuje).
 * Vše se ořezává do bezpečných mezí — GM nemůže stav rozbít.
 */
export function applyGmResult(state: GameState, result: GmResult): GameState {
  const next: GameState = structuredClone(state);
  const p: StatePatch = result.state_patch ?? { time_cost_min: 0 };

  next.turn += 1;
  next.timeMinutes = clamp(next.timeMinutes + Math.max(0, p.time_cost_min ?? 0), 0, TIME_LIMIT_MIN);

  if (p.location) next.location = p.location;
  if (typeof p.hp_delta === "number") next.hp = clamp(next.hp + p.hp_delta, 0, next.maxHp);

  for (const item of p.inventory_add ?? []) {
    if (!next.inventory.includes(item)) next.inventory.push(item);
  }
  for (const item of p.inventory_remove ?? []) {
    next.inventory = next.inventory.filter((i) => i !== item);
  }

  Object.assign(next.flags, p.flags_set ?? {});

  for (const [axis, delta] of Object.entries(p.axes_delta ?? {})) {
    if (axis in next.axes && typeof delta === "number") {
      const key = axis as keyof GameState["axes"];
      next.axes[key] = clamp(next.axes[key] + delta, -10, 10);
    }
  }

  for (const [npc, delta] of Object.entries(p.npc_attitude_delta ?? {})) {
    next.npcAttitudes[npc] = clamp((next.npcAttitudes[npc] ?? 0) + delta, -5, 5);
  }

  if (p.combat !== undefined) next.combat = p.combat;
  if (result.chronicle_update) next.chronicle = result.chronicle_update;
  if (result.ending) next.ending = result.ending.id;

  // smrt postavy = konec, i kdyby ho GM nevrátil
  if (next.hp <= 0 && !next.ending) next.ending = "tmava-ulicka";

  return next;
}

/** Promítne výsledek NPC dialogu do stavu (fakta + vztah). */
export function applyNpcOutcome(
  state: GameState,
  npcId: string,
  facts: string[],
  attitudeDelta: number,
): GameState {
  const next = structuredClone(state);
  next.npcAttitudes[npcId] = clamp((next.npcAttitudes[npcId] ?? 0) + attitudeDelta, -5, 5);
  for (const fact of facts) {
    next.flags[`fakt:${fact}`] = true;
  }
  return next;
}
