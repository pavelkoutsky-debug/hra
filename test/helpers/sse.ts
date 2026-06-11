/** Vypije SSE stream z workeru (delta/think/done/err) — sdílí smoke test a playtest harness. */
export async function drainSse(stream: ReadableStream<Uint8Array>): Promise<{ deltas: string; done: any }> {
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
