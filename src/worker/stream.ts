/**
 * Inkrementální extrakce jednoho string pole z proudícího JSONu.
 * Strukturované výstupy garantují validní JSON a pole `narration`/`reply` je
 * ve schématu první — můžeme jeho obsah streamovat hráči dřív, než dorazí zbytek.
 */
export class StringFieldExtractor {
  private buffer = "";
  private phase: "search" | "in-string" | "done" = "search";
  private pos = 0;
  private readonly keyMarker: string;

  constructor(fieldName: string) {
    this.keyMarker = `"${fieldName}"`;
  }

  /** Vrátí nově dekódovaný kus obsahu pole (nebo ""). */
  push(chunk: string): string {
    this.buffer += chunk;
    if (this.phase === "done") return "";

    if (this.phase === "search") {
      const keyIdx = this.buffer.indexOf(this.keyMarker);
      if (keyIdx === -1) return "";
      // najdi otevírací uvozovku hodnoty: za klíčem dvojtečka a `"`
      const after = this.buffer.slice(keyIdx + this.keyMarker.length);
      const m = after.match(/^\s*:\s*"/);
      if (!m) return ""; // dvojtečka/uvozovka ještě nedorazila
      this.pos = keyIdx + this.keyMarker.length + m[0].length;
      this.phase = "in-string";
    }

    let out = "";
    while (this.pos < this.buffer.length) {
      const ch = this.buffer[this.pos];
      if (ch === "\\") {
        if (this.pos + 1 >= this.buffer.length) break; // escape ještě nekompletní
        const next = this.buffer[this.pos + 1];
        if (next === "u") {
          if (this.pos + 6 > this.buffer.length) break;
          const hex = this.buffer.slice(this.pos + 2, this.pos + 6);
          out += String.fromCharCode(parseInt(hex, 16));
          this.pos += 6;
        } else {
          const map: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };
          out += map[next] ?? next;
          this.pos += 2;
        }
      } else if (ch === '"') {
        this.phase = "done";
        break;
      } else {
        out += ch;
        this.pos += 1;
      }
    }
    return out;
  }

  /** Celý dosud přijatý text (pro finální JSON.parse). */
  get full(): string {
    return this.buffer;
  }
}

export function sseEvent(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}
