import type { ArchetypeId, GameState, TurnRecord } from "../shared/types";
import { newGameState } from "../shared/rules";
import { applyGmResult, applyNpcOutcome } from "../shared/patch";
import { gmTurn, npcTurn, login, ApiError } from "./api";
import * as ui from "./ui";
import { saveGame, loadGame, clearSave, exportSave, importSave, saveToken, loadToken, type LogEntry } from "./save";
import { music } from "./audio/music";

const CRT_KEY = "ucednikova-noc:crt";

const GAME_START_INPUT = "[ZAČÁTEK HRY]";

interface Dialogue {
  npcId: string;
  npcName: string;
  lines: { speaker: "hrac" | "npc"; text: string }[];
  facts: string[];
  attitudeDelta: number;
}

let token = "";
let state: GameState | null = null;
let history: TurnRecord[] = [];
let logEntries: LogEntry[] = [];
let dialogue: Dialogue | null = null;

function addLog(kind: LogEntry["kind"], text: string, speaker?: string): void {
  logEntries.push({ kind, text, speaker });
}

function persist(): void {
  if (state) saveGame({ state, history, log: logEntries });
}

function syncUi(): void {
  if (!state) return;
  ui.updateHud(state);
  ui.setLocation(state);
  ui.renderSidebar(state);
  music.playForState(state);
}

function showError(err: unknown): void {
  const msg = err instanceof Error ? err.message : "Něco se pokazilo.";
  ui.appendEntry("system", `⚠ ${msg}`);
  addLog("system", `⚠ ${msg}`);
}

/** Jeden tah GM: streamuje vyprávění, aplikuje výsledek, řeší konce a předání dialogu. */
async function playGmTurn(playerInput: string, opts: { echo?: boolean } = {}): Promise<void> {
  if (!state) return;
  ui.setBusy(true);
  ui.setQuickActions([], () => {});

  if (opts.echo !== false && playerInput !== GAME_START_INPUT) {
    ui.appendEntry("player", playerInput);
    addLog("player", playerInput);
  }

  const entry = ui.appendEntry("gm");
  entry.classList.add("streaming");

  try {
    const { result } = await gmTurn(token, { state, history, playerInput }, (text) => ui.appendToEntry(entry, text));
    entry.classList.remove("streaming");
    entry.textContent = result.narration; // sjednocení s finálním textem
    ui.scrollLog();
    addLog("gm", result.narration);
    ui.renderChecks(result.checks);
    if (result.checks.length) music.sfx("dice");

    history.push({ player: playerInput, narration: result.narration });
    const before = state;
    state = applyGmResult(state, result);
    if (state.inventory.length > before.inventory.length) music.sfx("item");
    if (state.hp < before.hp) music.sfx("hurt");
    syncUi();

    if (state.ending && result.ending) {
      persist();
      ui.showEnding(result.ending.title, result.narration, state.ending);
      return;
    }
    if (state.ending) {
      // pojistka (smrt bez explicitního konce od GM)
      persist();
      ui.showEnding("Tmavá ulička", result.narration, state.ending);
      return;
    }

    if (result.npc_dialogue) {
      startDialogue(result.npc_dialogue.npc_id);
    } else {
      ui.setQuickActions(result.quick_actions ?? [], (text) => void submitInput(text));
    }
    persist();
  } catch (err) {
    entry.classList.remove("streaming");
    if (!entry.textContent) entry.remove();
    showError(err);
    if (err instanceof ApiError && err.status === 401) backToLogin();
  } finally {
    if (!state?.ending) ui.setBusy(false);
  }
}

function startDialogue(npcId: string): void {
  dialogue = { npcId, npcName: npcId, lines: [], facts: [], attitudeDelta: 0 };
  ui.setDialogueBanner(npcId, npcId);
  ui.setQuickActions([], () => {});
}

async function playNpcTurn(playerInput: string): Promise<void> {
  if (!state || !dialogue) return;
  ui.setBusy(true);
  ui.appendEntry("player", playerInput);
  addLog("player", playerInput);

  const entry = ui.appendEntry("npc-line", "", dialogue.npcName);
  entry.classList.add("streaming");

  try {
    const { result, npcName } = await npcTurn(
      token,
      { npcId: dialogue.npcId, state, dialogue: dialogue.lines, playerInput },
      (text) => ui.appendToEntry(entry, text),
    );
    entry.classList.remove("streaming");
    if (dialogue.npcName !== npcName) {
      dialogue.npcName = npcName;
      ui.setDialogueBanner(npcName, dialogue.npcId);
      const speakerEl = entry.querySelector(".speaker");
      if (speakerEl) speakerEl.textContent = `${npcName}: `;
    }
    addLog("npc-line", result.reply, npcName);

    dialogue.lines.push({ speaker: "hrac", text: playerInput });
    dialogue.lines.push({ speaker: "npc", text: result.reply });
    dialogue.facts.push(...result.learned_facts);
    dialogue.attitudeDelta += result.attitude_delta;
    persist();

    if (result.end_dialogue) {
      await endDialogue();
    }
  } catch (err) {
    entry.classList.remove("streaming");
    if (!entry.querySelector(".speaker")?.nextSibling) entry.remove();
    showError(err);
  } finally {
    if (!state?.ending) ui.setBusy(false);
  }
}

/** Ukončí dialog: promítne fakta/vztah do stavu a předá slovo GM se shrnutím. */
async function endDialogue(): Promise<void> {
  if (!state || !dialogue) return;
  const d = dialogue;
  dialogue = null;
  ui.setDialogueBanner(null);

  state = applyNpcOutcome(state, d.npcId, d.facts, d.attitudeDelta);
  const factsText = d.facts.length ? `Hráč se dozvěděl: ${d.facts.join("; ")}.` : "Nic podstatného nepadlo.";
  const summary = `[SHRNUTÍ ROZHOVORU s ${d.npcName}] ${factsText} Posun vztahu: ${d.attitudeDelta}. Naváž krátce na konec rozhovoru a vrať se k ději (započítej čas rozhovoru).`;
  await playGmTurn(summary, { echo: false });
}

async function submitInput(raw: string): Promise<void> {
  const text = raw.trim();
  if (!text || !state || state.ending) return;
  (ui.$("player-input") as HTMLInputElement).value = "";
  if (dialogue) await playNpcTurn(text);
  else await playGmTurn(text);
}

function startNewGame(archetype: ArchetypeId): void {
  state = newGameState(archetype);
  history = [];
  logEntries = [];
  dialogue = null;
  ui.clearLog();
  ui.setDialogueBanner(null);
  ui.showScreen("screen-game");
  syncUi();
  void playGmTurn(GAME_START_INPUT);
}

function continueGame(): void {
  const save = loadGame();
  if (!save) return;
  state = save.state;
  history = save.history;
  logEntries = save.log;
  dialogue = null;
  ui.showScreen("screen-game");
  ui.restoreLog(logEntries);
  ui.setDialogueBanner(null);
  syncUi();
  if (state.ending) {
    ui.appendEntry("system", "Tato hra už skončila. Začni novou.");
  } else {
    ui.appendEntry("system", "Hra obnovena z uložené pozice.");
    ui.setBusy(false);
  }
}

function backToLogin(): void {
  ui.showScreen("screen-login");
  (ui.$("continue-row") as HTMLElement).hidden = !loadGame();
  music.play("title");
}

/** Retro přepínače ve stavové liště + odemčení zvuku prvním gestem (autoplay policy). */
function wireRetroControls(): void {
  const unlock = () => music.unlock();
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });

  const musicBtn = ui.$("btn-music");
  musicBtn.classList.toggle("off", music.isMuted);
  musicBtn.addEventListener("click", () => {
    music.setMuted(!music.isMuted);
    musicBtn.classList.toggle("off", music.isMuted);
  });

  const crt = ui.$("crt-overlay");
  const crtBtn = ui.$("btn-crt");
  const applyCrt = (on: boolean) => {
    crt.hidden = !on;
    crtBtn.classList.toggle("off", !on);
  };
  applyCrt(localStorage.getItem(CRT_KEY) === "1");
  crtBtn.addEventListener("click", () => {
    const on = crt.hidden;
    localStorage.setItem(CRT_KEY, on ? "1" : "0");
    applyCrt(on);
  });

  // titulní pixel art (pokud už je vygenerovaný)
  const art = document.querySelector<HTMLElement>(".title-art");
  if (art) {
    const img = new Image();
    img.onload = () => {
      art.style.backgroundImage = `url(${img.src})`;
      art.classList.add("loaded");
    };
    img.src = "/img/screens/screen-title.png";
  }
}

function wireEvents(): void {
  ui.$("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = (ui.$("access-code") as HTMLInputElement).value.trim();
    const errEl = ui.$("login-error");
    errEl.hidden = true;
    try {
      token = await login(code);
      saveToken(token);
      ui.showScreen("screen-archetype");
    } catch (err) {
      errEl.textContent = err instanceof Error ? err.message : "Přihlášení selhalo.";
      errEl.hidden = false;
    }
  });

  ui.$("btn-continue").addEventListener("click", () => {
    const saved = loadToken();
    if (saved) {
      token = saved;
      continueGame();
    }
  });

  ui.$("input-form").addEventListener("submit", (e) => {
    e.preventDefault();
    void submitInput((ui.$("player-input") as HTMLInputElement).value);
  });

  ui.$("btn-end-dialogue").addEventListener("click", () => {
    if (dialogue) void endDialogue();
  });

  ui.$("btn-save-export").addEventListener("click", () => {
    persist();
    exportSave();
  });

  (ui.$("save-import") as HTMLInputElement).addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const data = await importSave(file);
    if (data) continueGame();
    else ui.appendEntry("system", "⚠ Soubor se nepodařilo načíst.");
  });

  ui.$("btn-new-game").addEventListener("click", () => {
    if (confirm("Opravdu začít novou hru? Uložená pozice bude smazána.")) {
      clearSave();
      ui.showScreen("screen-archetype");
      music.play("title");
    }
  });

  ui.$("btn-restart").addEventListener("click", () => {
    clearSave();
    ui.showScreen("screen-archetype");
    music.play("title");
  });

  ui.renderArchetypeCards((id) => startNewGame(id as ArchetypeId));
}

function init(): void {
  wireEvents();
  wireRetroControls();
  backToLogin();
}

init();
