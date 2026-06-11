import type { GameState, TurnRecord } from "../shared/types";

export interface LogEntry {
  kind: "gm" | "player" | "npc-line" | "system" | "kanon";
  text: string;
  speaker?: string;
}

export interface SaveData {
  state: GameState;
  history: TurnRecord[];
  log: LogEntry[];
  savedAt: string;
}

const SAVE_KEY = "ucednikova-noc:save";
const TOKEN_KEY = "ucednikova-noc:token";

export function saveGame(data: Omit<SaveData, "savedAt">): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch { /* plné úložiště — hra běží dál bez autosave */ }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data?.state?.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function exportSave(): void {
  const data = loadGame();
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ucednikova-noc-${data.savedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importSave(file: File): Promise<SaveData | null> {
  try {
    const data = JSON.parse(await file.text()) as SaveData;
    if (data?.state?.version !== 1) return null;
    saveGame(data);
    return data;
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function loadToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
