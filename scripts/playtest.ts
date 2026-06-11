/**
 * Playtest harness — řízení hry tah po tahu z CLI (volá worker funkce přímo,
 * potřebuje jen ANTHROPIC_API_KEY; produkční denní limit se nečerpá).
 *
 *   npm run playtest -- new <archetyp> <run-id>   založí běh (pevný úvod, jako klient)
 *   npm run playtest -- gm "<vstup hráče>"        jeden GM tah + diff stavu
 *   npm run playtest -- npc <id> "<replika>"      replika v NPC dialogu
 *   npm run playtest -- end-dialogue              ukončí dialog (souhrn → GM tah)
 *   npm run playtest -- show [run-id]             stav aktuálního běhu
 *
 * Stav běhu: playtest/<run-id>.json, aktivní běh v playtest/.current.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { runGmTurn, GAME_START_INPUT } from "../src/worker/gm";
import { runNpcTurn } from "../src/worker/npc";
import { newGameState, remainingTime } from "../src/shared/rules";
import { applyGmResult, applyNpcOutcome } from "../src/shared/patch";
import { archetypeIntro, firstVisitText, npcIntro } from "../src/shared/canon";
import { NPC_NAMES } from "../src/worker/content";
import { drainSse } from "../test/helpers/sse";
import type { ArchetypeId, GameState, GmResult, NpcResult, TurnRecord } from "../src/shared/types";

const DIR = join(process.cwd(), "playtest");
const CURRENT = join(DIR, ".current");

interface DialogueState {
  npcId: string;
  npcName: string;
  lines: { speaker: "hrac" | "npc"; text: string }[];
  facts: string[];
  attitudeDelta: number;
}

interface RunFile {
  runId: string;
  state: GameState;
  history: TurnRecord[];
  dialogue: DialogueState | null;
  lastQuickActions: string[];
  transcript: { kind: string; text: string }[];
  createdAt: string;
  updatedAt: string;
}

function die(msg: string): never {
  console.error(`CHYBA: ${msg}`);
  process.exit(1);
}

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) die("Chybí ANTHROPIC_API_KEY v prostředí.");
  return key;
}

function runPath(id: string): string {
  return join(DIR, `${id}.json`);
}

function loadRun(id?: string): RunFile {
  const runId = id ?? (existsSync(CURRENT) ? readFileSync(CURRENT, "utf-8").trim() : "");
  if (!runId) die("Žádný aktivní běh. Založ: npm run playtest -- new <archetyp> <run-id>");
  const p = runPath(runId);
  if (!existsSync(p)) die(`Běh '${runId}' neexistuje (${p}).`);
  return JSON.parse(readFileSync(p, "utf-8")) as RunFile;
}

function saveRun(run: RunFile): void {
  mkdirSync(DIR, { recursive: true });
  run.updatedAt = new Date().toISOString();
  writeFileSync(runPath(run.runId), JSON.stringify(run, null, 2));
  writeFileSync(CURRENT, run.runId);
}

function clock(state: GameState): string {
  const total = 6 * 60 + state.timeMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const day = state.timeMinutes >= 18 * 60 ? " (2. den)" : "";
  return `${h}:${m.toString().padStart(2, "0")}${day}`;
}

function header(run: RunFile): void {
  const s = run.state;
  console.log(
    `\n═══ ${run.runId} · tah ${s.turn} · ${clock(s)} · ${s.location} · HP ${s.hp}/${s.maxHp} · zbývá ${remainingTime(s).label} ═══`,
  );
}

/** Diff dvou stavů pro rychlé posouzení testérem. */
function printDiff(prev: GameState, next: GameState): void {
  const parts: string[] = [];
  if (next.timeMinutes !== prev.timeMinutes) parts.push(`čas +${next.timeMinutes - prev.timeMinutes} min → ${clock(next)}`);
  if (next.hp !== prev.hp) parts.push(`HP ${prev.hp}→${next.hp}`);
  if (next.location !== prev.location) parts.push(`lokace ${prev.location}→${next.location}`);
  for (const [k, v] of Object.entries(next.flags)) {
    if (prev.flags[k] !== v) parts.push(`flag ${k}=${v}`);
  }
  for (const item of next.inventory) if (!prev.inventory.includes(item)) parts.push(`+inv ${item}`);
  for (const item of prev.inventory) if (!next.inventory.includes(item)) parts.push(`−inv ${item}`);
  for (const ax of Object.keys(next.axes) as (keyof GameState["axes"])[]) {
    if (next.axes[ax] !== prev.axes[ax]) parts.push(`osa ${ax} ${prev.axes[ax]}→${next.axes[ax]}`);
  }
  for (const [npc, v] of Object.entries(next.npcAttitudes)) {
    if (prev.npcAttitudes[npc] !== v) parts.push(`vztah ${npc}→${v}`);
  }
  if (JSON.stringify(next.combat) !== JSON.stringify(prev.combat)) {
    parts.push(`boj: ${next.combat ? next.combat.enemies.map((e) => `${e.name} ${e.hp}/${e.maxHp}`).join(", ") + ` (kolo ${next.combat.round})` : "konec"}`);
  }
  console.log(`[DIFF] ${parts.length ? parts.join(" | ") : "(beze změn)"}`);
}

function note(run: RunFile, kind: string, text: string): void {
  run.transcript.push({ kind, text });
}

async function gmTurn(run: RunFile, playerInput: string, echo = true): Promise<void> {
  if (run.state.ending) die(`Hra už skončila (${run.state.ending}).`);
  if (echo) {
    console.log(`\n[HRÁČ] ${playerInput}`);
    note(run, "hrac", playerInput);
  }
  const stream = await runGmTurn(apiKey(), { state: run.state, history: run.history, playerInput });
  const { done } = await drainSse(stream);
  const result = done.result as GmResult;
  const dice = (done.dice as number[]) ?? [];

  console.log(`\n[NARACE]\n${result.narration}`);
  note(run, "gm", result.narration);
  console.log(`\n[KOSTKY PŘEDHOZENÉ] ${dice.join(", ")}`);
  for (const c of result.checks) {
    const line = `🎲 ${c.action} — ${c.attribute}: hod ${c.roll} + ${c.bonus} = ${c.total} proti ${c.difficulty} → ${c.success ? "ÚSPĚCH" : "NEÚSPĚCH"}`;
    console.log(line);
    note(run, "check", line);
  }

  // zrcadlení klienta: kánon první návštěvy (před aplikací patche)
  const newLoc = result.state_patch?.location;
  const canon =
    newLoc && newLoc !== run.state.location && !run.state.flags[`navstiveno:${newLoc}`]
      ? firstVisitText(newLoc)
      : null;

  const prev = run.state;
  run.history.push({ player: playerInput, narration: result.narration });
  run.state = applyGmResult(run.state, result);

  if (canon && !run.state.ending) {
    console.log(`\n[KANON LOKACE ${newLoc}]\n${canon}`);
    note(run, "kanon", canon);
  }

  printDiff(prev, run.state);

  if (run.state.ending) {
    console.log(`\n████ KONEC HRY: ${result.ending?.id ?? run.state.ending} — ${result.ending?.title ?? ""} ████`);
    note(run, "konec", `${run.state.ending}: ${result.ending?.title ?? ""}`);
  } else if (result.npc_dialogue) {
    const npcId = result.npc_dialogue.npc_id;
    const name = NPC_NAMES[npcId] ?? npcId;
    run.dialogue = { npcId, npcName: name, lines: [], facts: [], attitudeDelta: 0 };
    if (!run.state.flags[`potkal:${npcId}`]) {
      const intro = npcIntro(npcId);
      if (intro) {
        console.log(`\n[KANON NPC ${npcId}]\n${intro}`);
        note(run, "kanon-npc", intro);
      }
      run.state.flags[`potkal:${npcId}`] = true;
    }
    console.log(`\n>>> DIALOG OTEVŘEN: ${name} (${npcId}) — pokračuj: npm run playtest -- npc ${npcId} "..."`);
  } else {
    run.lastQuickActions = result.quick_actions ?? [];
    console.log(`\n[QUICK] ${run.lastQuickActions.map((q, i) => `${i + 1}) ${q}`).join("  ")}`);
  }
  saveRun(run);
  header(run);
}

async function npcTurn(run: RunFile, npcId: string, playerInput: string): Promise<void> {
  if (run.state.ending) die(`Hra už skončila (${run.state.ending}).`);
  if (!run.dialogue) {
    // testovací pohodlí: dialog lze otevřít i přímo (sonda mimo GM předávku)
    run.dialogue = { npcId, npcName: NPC_NAMES[npcId] ?? npcId, lines: [], facts: [], attitudeDelta: 0 };
    if (!run.state.flags[`potkal:${npcId}`]) {
      const intro = npcIntro(npcId);
      if (intro) console.log(`\n[KANON NPC ${npcId}]\n${intro}`);
      run.state.flags[`potkal:${npcId}`] = true;
    }
  }
  if (run.dialogue.npcId !== npcId) die(`Otevřený dialog je s '${run.dialogue.npcId}', ne '${npcId}'.`);

  console.log(`\n[HRÁČ → ${run.dialogue.npcName}] ${playerInput}`);
  note(run, "hrac-npc", playerInput);

  const stream = await runNpcTurn(apiKey(), {
    npcId,
    state: run.state,
    dialogue: run.dialogue.lines,
    playerInput,
  });
  const { done } = await drainSse(stream);
  const result = done.result as NpcResult;

  console.log(`\n[${run.dialogue.npcName}] ${result.reply}`);
  note(run, "npc", `${run.dialogue.npcName}: ${result.reply}`);
  if (result.learned_facts.length) console.log(`[FAKTA] ${result.learned_facts.join(" | ")}`);
  console.log(`[postoj ${result.attitude_delta >= 0 ? "+" : ""}${result.attitude_delta}] [end_dialogue: ${result.end_dialogue}]`);

  run.dialogue.lines.push({ speaker: "hrac", text: playerInput });
  run.dialogue.lines.push({ speaker: "npc", text: result.reply });
  run.dialogue.facts.push(...result.learned_facts);
  run.dialogue.attitudeDelta += result.attitude_delta;
  saveRun(run);

  if (result.end_dialogue) {
    console.log(`\n>>> NPC dialog ukončilo — předávám souhrn GM…`);
    await endDialogue(run);
  }
}

async function endDialogue(run: RunFile): Promise<void> {
  const d = run.dialogue;
  if (!d) die("Žádný otevřený dialog.");
  run.dialogue = null;
  run.state = applyNpcOutcome(run.state, d.npcId, d.facts, d.attitudeDelta);
  const factsText = d.facts.length ? `Hráč se dozvěděl: ${d.facts.join("; ")}.` : "Nic podstatného nepadlo.";
  const summary = `[SHRNUTÍ ROZHOVORU s ${d.npcName}] ${factsText} Posun vztahu: ${d.attitudeDelta}. Naváž krátce na konec rozhovoru a vrať se k ději (započítej čas rozhovoru).`;
  note(run, "souhrn", summary);
  await gmTurn(run, summary, false);
}

function show(run: RunFile): void {
  header(run);
  const s = run.state;
  console.log(`osy: ${JSON.stringify(s.axes)}`);
  console.log(`inventář: ${s.inventory.join(", ") || "(prázdný)"}`);
  console.log(`vztahy: ${JSON.stringify(s.npcAttitudes)}`);
  console.log(`flagy:\n${Object.entries(s.flags).map(([k, v]) => `  ${k} = ${v}`).join("\n") || "  (žádné)"}`);
  console.log(`kronika: ${s.chronicle}`);
  if (run.dialogue) console.log(`OTEVŘENÝ DIALOG: ${run.dialogue.npcId} (${run.dialogue.lines.length} replik)`);
  if (run.lastQuickActions.length) console.log(`quick: ${run.lastQuickActions.join(" | ")}`);
  if (s.ending) console.log(`KONEC: ${s.ending}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const COMMANDS = ["new", "gm", "npc", "end-dialogue", "show"];
  const idx = argv.findIndex((a) => COMMANDS.includes(a));
  const [cmd, ...rest] = idx >= 0 ? argv.slice(idx) : [];

  switch (cmd) {
    case "new": {
      const [archetype, runId] = rest;
      if (!archetype || !runId) die("Použití: new <ucenec|sikula|presvedcivy> <run-id>");
      if (existsSync(runPath(runId))) die(`Běh '${runId}' už existuje.`);
      const state = newGameState(archetype as ArchetypeId);
      const { intro, quickActions } = archetypeIntro(archetype as ArchetypeId);
      const run: RunFile = {
        runId,
        state,
        history: [{ player: GAME_START_INPUT, narration: intro }],
        dialogue: null,
        lastQuickActions: quickActions,
        transcript: [{ kind: "uvod", text: intro }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveRun(run);
      console.log(`\n[ÚVOD — pevný text]\n${intro}`);
      console.log(`\n[QUICK] ${quickActions.map((q, i) => `${i + 1}) ${q}`).join("  ")}`);
      header(run);
      break;
    }
    case "gm": {
      const input = rest.join(" ").trim();
      if (!input) die('Použití: gm "<vstup hráče>"');
      const run = loadRun();
      if (run.dialogue) die(`Je otevřený dialog s '${run.dialogue.npcId}' — použij npc/end-dialogue.`);
      await gmTurn(run, input);
      break;
    }
    case "npc": {
      const [npcId, ...words] = rest;
      const input = words.join(" ").trim();
      if (!npcId || !input) die('Použití: npc <id> "<replika>"');
      const run = loadRun();
      await npcTurn(run, npcId, input);
      break;
    }
    case "end-dialogue": {
      const run = loadRun();
      await endDialogue(run);
      break;
    }
    case "show": {
      show(loadRun(rest[0]));
      break;
    }
    default:
      die(`Neznámý příkaz '${cmd ?? ""}'. Příkazy: ${COMMANDS.join(", ")}`);
  }
}

void main();
