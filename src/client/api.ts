import type { GmRequestBody, GmResult, NpcRequestBody, NpcResult } from "../shared/types";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function readError(res: Response): Promise<never> {
  let msg = `Chyba serveru (${res.status})`;
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) msg = data.error;
  } catch { /* ponech výchozí hlášku */ }
  throw new ApiError(msg, res.status);
}

export async function login(code: string): Promise<string> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) await readError(res);
  const { token } = (await res.json()) as { token: string };
  return token;
}

type SseMessage =
  | { t: "delta"; text: string }
  | { t: "think" }
  | { t: "done"; result: unknown; dice?: number[]; npcName?: string }
  | { t: "err"; message: string };

/** Přečte SSE stream z fetch odpovědi a volá onDelta; vrátí finální payload. */
async function consumeSse(
  res: Response,
  onDelta: (text: string) => void,
  onThink?: () => void,
): Promise<SseMessage & { t: "done" }> {
  if (!res.ok) await readError(res);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: (SseMessage & { t: "done" }) | null = null;

  for (;;) {
    const { value, done: eof } = await reader.read();
    if (eof) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const msg = JSON.parse(line.slice(6)) as SseMessage;
      if (msg.t === "delta") onDelta(msg.text);
      else if (msg.t === "think") onThink?.();
      else if (msg.t === "done") done = msg;
      else if (msg.t === "err") throw new ApiError(msg.message, 502);
    }
  }
  if (!done) throw new ApiError("Spojení bylo přerušeno. Zkus to znovu.", 502);
  return done;
}

export async function gmTurn(
  token: string,
  body: GmRequestBody,
  onDelta: (text: string) => void,
  onThink?: () => void,
): Promise<{ result: GmResult; dice: number[] }> {
  const res = await fetch("/api/gm", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const done = await consumeSse(res, onDelta, onThink);
  return { result: done.result as GmResult, dice: done.dice ?? [] };
}

export async function npcTurn(
  token: string,
  body: NpcRequestBody,
  onDelta: (text: string) => void,
  onThink?: () => void,
): Promise<{ result: NpcResult; npcName: string }> {
  const res = await fetch("/api/npc", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const done = await consumeSse(res, onDelta, onThink);
  return { result: done.result as NpcResult, npcName: done.npcName ?? body.npcId };
}
