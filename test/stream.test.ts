import { describe, expect, it } from "vitest";
import { StringFieldExtractor } from "../src/worker/stream";

function feedInChunks(extractor: StringFieldExtractor, text: string, size: number): string {
  let out = "";
  for (let i = 0; i < text.length; i += size) {
    out += extractor.push(text.slice(i, i + size));
  }
  return out;
}

describe("StringFieldExtractor", () => {
  const json = '{"narration":"Vstupuješ do tmy.\\nSvíce \\"prská\\".","checks":[]}';

  it("extrahuje obsah pole po znacích i po velkých kusech", () => {
    for (const size of [1, 3, 7, 1000]) {
      const ex = new StringFieldExtractor("narration");
      const out = feedInChunks(ex, json, size);
      expect(out).toBe('Vstupuješ do tmy.\nSvíce "prská".');
    }
  });

  it("zvládne escape sekvence rozseknuté mezi chunky", () => {
    const ex = new StringFieldExtractor("narration");
    let out = ex.push('{"narration":"a\\');
    out += ex.push('nb\\u0041c"');
    out += ex.push("}");
    expect(out).toBe("a\nbAc");
  });

  it("ignoruje text po uzavření pole a uchová celý buffer", () => {
    const ex = new StringFieldExtractor("narration");
    const out = feedInChunks(ex, json, 5);
    expect(out).toContain("Vstupuješ");
    expect(JSON.parse(ex.full).checks).toEqual([]);
  });

  it("nevrací nic, dokud pole nezačne", () => {
    const ex = new StringFieldExtractor("reply");
    expect(ex.push('{"jine_pole":"x", ')).toBe("");
    expect(ex.push('"reply": "Ahoj')).toBe("Ahoj");
  });
});
