import Anthropic from "@anthropic-ai/sdk";
import type { GameState, GmRequestBody, GmResult, StatePatch, TurnRecord } from "../shared/types";
import { GM_MODEL, HISTORY_WINDOW, TIME_LIMIT_MIN, remainingTime } from "../shared/rules";
import { WORLD_BIBLE } from "./content";
import { preRollDice } from "./dice";
import { StringFieldExtractor, sseEvent } from "./stream";

/** Značka prvního záznamu historie — klient pod ní zasadí pevný úvodní text. */
export const GAME_START_INPUT = "[ZAČÁTEK HRY]";

// Strukturované výstupy: vše required, volitelnost přes null; mapy jako pole dvojic
// (additionalProperties musí být všude false). Pole `narration` je první — streamuje se.
const GM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["narration", "checks", "state_patch", "chronicle_update", "npc_dialogue", "ending", "quick_actions"],
  properties: {
    narration: { type: "string", description: "Vyprávění tahu česky. Při konci hry epilog." },
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["attribute", "action", "roll", "bonus", "total", "difficulty", "success"],
        properties: {
          attribute: { type: "string", enum: ["vedeni", "hbitost", "vymluvnost", "odvaha"] },
          action: { type: "string" },
          roll: { type: "integer" },
          bonus: { type: "integer" },
          total: { type: "integer" },
          difficulty: { type: "integer" },
          success: { type: "boolean" },
        },
      },
    },
    state_patch: {
      type: "object",
      additionalProperties: false,
      required: [
        "location", "time_cost_min", "hp_delta", "inventory_add", "inventory_remove",
        "flags_set", "axes_delta", "npc_attitude_delta", "combat",
      ],
      properties: {
        location: { anyOf: [{ type: "string" }, { type: "null" }], description: "Nové location id, nebo null bez přesunu." },
        time_cost_min: { type: "integer" },
        hp_delta: { type: "integer" },
        inventory_add: { type: "array", items: { type: "string" } },
        inventory_remove: { type: "array", items: { type: "string" } },
        flags_set: {
          type: "array",
          description: "Příznaky děje, např. {key: 'knoflik-nalezen', value: 'true'}",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "value"],
            properties: { key: { type: "string" }, value: { type: "string" } },
          },
        },
        axes_delta: {
          type: "object",
          additionalProperties: false,
          required: ["povest", "golem", "odhaleni", "pogrom"],
          properties: {
            povest: { type: "integer" },
            golem: { type: "integer" },
            odhaleni: { type: "integer" },
            pogrom: { type: "integer" },
          },
        },
        npc_attitude_delta: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["npc_id", "delta"],
            properties: { npc_id: { type: "string" }, delta: { type: "integer" } },
          },
        },
        combat: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["enemies", "round"],
              properties: {
                enemies: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "hp", "maxHp"],
                    properties: { name: { type: "string" }, hp: { type: "integer" }, maxHp: { type: "integer" } },
                  },
                },
                round: { type: "integer" },
              },
            },
            { type: "null" },
          ],
        },
      },
    },
    chronicle_update: { anyOf: [{ type: "string" }, { type: "null" }] },
    npc_dialogue: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["npc_id"],
          properties: { npc_id: { type: "string" } },
        },
        { type: "null" },
      ],
    },
    ending: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["id", "title"],
          properties: { id: { type: "string" }, title: { type: "string" } },
        },
        { type: "null" },
      ],
    },
    quick_actions: { type: "array", items: { type: "string" } },
  },
} as const;

/** Surová odpověď GM ve tvaru schématu (mapy jako pole dvojic). */
interface RawGmOutput {
  narration: string;
  checks: GmResult["checks"];
  state_patch: {
    location: string | null;
    time_cost_min: number;
    hp_delta: number;
    inventory_add: string[];
    inventory_remove: string[];
    flags_set: { key: string; value: string }[];
    axes_delta: { povest: number; golem: number; odhaleni: number; pogrom: number };
    npc_attitude_delta: { npc_id: string; delta: number }[];
    combat: StatePatch["combat"] | null;
  };
  chronicle_update: string | null;
  npc_dialogue: { npc_id: string } | null;
  ending: { id: string; title: string } | null;
  quick_actions: string[];
}

function parseFlagValue(v: string): boolean | number | string {
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  if (v.trim() !== "" && Number.isFinite(n)) return n;
  return v;
}

/** Převod surového výstupu schématu na GmResult (mapy z polí dvojic). */
export function rawToGmResult(raw: RawGmOutput): GmResult {
  const p = raw.state_patch;
  const patch: StatePatch = {
    time_cost_min: p.time_cost_min,
    hp_delta: p.hp_delta,
    inventory_add: p.inventory_add,
    inventory_remove: p.inventory_remove,
    flags_set: Object.fromEntries(p.flags_set.map((f) => [f.key, parseFlagValue(f.value)])),
    axes_delta: p.axes_delta,
    npc_attitude_delta: Object.fromEntries(p.npc_attitude_delta.map((n) => [n.npc_id, n.delta])),
    combat: p.combat ?? null,
  };
  if (p.location) patch.location = p.location;
  return {
    narration: raw.narration,
    checks: raw.checks,
    state_patch: patch,
    chronicle_update: raw.chronicle_update,
    npc_dialogue: raw.npc_dialogue,
    ending: raw.ending,
    quick_actions: raw.quick_actions,
  };
}

function describeTime(state: GameState): string {
  const startHour = 6;
  const total = startHour * 60 + state.timeMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const day = state.timeMinutes >= (24 - startHour) * 60 ? "2. den" : "1. den";
  return `${day}, ${h}:${m.toString().padStart(2, "0")} hodin; do návratu rabiho zbývá ${remainingTime(state).label}`;
}

/** Sestaví user zprávu aktuálního tahu (stav + kostky + vstup hráče). */
export function buildTurnMessage(state: GameState, playerInput: string, dice: number[]): string {
  const stateView = {
    archetyp: state.archetype,
    atributy: state.attributes,
    hp: `${state.hp}/${state.maxHp}`,
    lokace: state.location,
    cas: describeTime(state),
    inventar: state.inventory,
    osy: state.axes,
    vztahy_npc: state.npcAttitudes,
    priznaky: state.flags,
    boj: state.combat,
    tah: state.turn,
  };
  // Úvodní scéna je pevný text — klient ji zobrazí sám a zasadí do historie;
  // GM už dostává jen běžné tahy (případně vypršení času).
  let intro = "";
  if (state.timeMinutes >= TIME_LIMIT_MIN && !state.ending) {
    intro = "\n[POKYN] Čas vypršel — rabi Löw se vrací. Vyhlas odpovídající konec.\n";
  }
  return [
    `[STAV HRY]\n${JSON.stringify(stateView)}`,
    `[KRONIKA]\n${state.chronicle || "(zatím prázdná)"}`,
    `[PŘEDHOZENÉ KOSTKY]\n${dice.join(", ")}`,
    intro,
    `[VSTUP HRÁČE]\n${playerInput}`,
  ].join("\n\n");
}

export function buildGmMessages(body: GmRequestBody, dice: number[]): Anthropic.MessageParam[] {
  const history: TurnRecord[] = body.history.slice(-HISTORY_WINDOW);
  const messages: Anthropic.MessageParam[] = [];
  for (const t of history) {
    messages.push({ role: "user", content: t.player });
    messages.push({ role: "assistant", content: t.narration });
  }
  messages.push({ role: "user", content: buildTurnMessage(body.state, body.playerInput, dice) });
  return messages;
}

const OUTPUT_CONTRACT = `

## 10. Technický kontrakt výstupu
Odpovídáš VŽDY strukturovaným JSONem podle zadaného schématu. Pole \`narration\` piš jako první. Mapy předávej jako pole dvojic (flags_set, npc_attitude_delta). Osy, které se nemění, vracej s hodnotou 0. Nikdy nevkládej JSON ani technické poznámky do narration.`;

/**
 * Spustí jeden GM tah a vrátí SSE stream:
 * data: {"t":"delta","text":...} — kousky vyprávění
 * data: {"t":"done","result":GmResult,"dice":[...]}
 * data: {"t":"err","message":...}
 */
export async function runGmTurn(apiKey: string, body: GmRequestBody): Promise<ReadableStream<Uint8Array>> {
  const client = new Anthropic({ apiKey });
  const dice = preRollDice(3);
  const messages = buildGmMessages(body, dice);

  const params = {
    model: GM_MODEL,
    // Pozor: s adaptivním thinkingem se do max_tokens počítají i přemýšlecí tokeny —
    // nízký limit usekne JSON uprostřed a tah spadne. Streamujeme, takže velký limit nevadí.
    max_tokens: 16000,
    thinking: { type: "adaptive" as const },
    output_config: {
      effort: "medium", // svižnost interaktivní hry > maximální hloubka
      format: { type: "json_schema", schema: GM_SCHEMA },
    },
    system: [
      {
        type: "text" as const,
        text: WORLD_BIBLE + OUTPUT_CONTRACT,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages,
    stream: true,
  };

  // output_config zatím nemusí být v typech SDK — pošleme přes nevalidovaný vstup
  const stream = (await client.messages.create(params as never)) as unknown as AsyncIterable<{
    type: string;
    delta?: { type: string; text?: string };
  }>;

  const extractor = new StringFieldExtractor("narration");

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastBeat = 0;
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            const piece = extractor.push(event.delta.text);
            if (piece) controller.enqueue(sseEvent({ t: "delta", text: piece }));
          } else {
            // Model nejdřív přemýšlí (i desítky sekund) a žádný text neteče — posílej
            // heartbeat, ať klient ví, že tah žije, a spojení nevypadá mrtvé.
            const now = Date.now();
            if (now - lastBeat > 1000) {
              lastBeat = now;
              controller.enqueue(sseEvent({ t: "think" }));
            }
          }
        }
        let raw: RawGmOutput;
        try {
          raw = JSON.parse(extractor.full) as RawGmOutput;
        } catch {
          throw new Error("Vypravěč nedokončil odpověď. Zopakuj prosím svůj tah.");
        }
        controller.enqueue(sseEvent({ t: "done", result: rawToGmResult(raw), dice }));
      } catch (err) {
        controller.enqueue(sseEvent({ t: "err", message: err instanceof Error ? err.message : "Neznámá chyba" }));
      } finally {
        controller.close();
      }
    },
  });
}
