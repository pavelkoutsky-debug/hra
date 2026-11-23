// Čísla využití u prutů: co se kreslí, co se vynechá a jak se popisky vyhýbají jeden druhému.
import { describe, expect, it } from "vitest";
import { nakresliCislaVyuziti } from "../src/vykres/cisla";
import { barvaVyuziti } from "../src/vykres/skala";

/** Náhrada kreslicího kontextu, která si pamatuje napsané texty a jejich místa. */
function platno() {
  const texty: { text: string; x: number; y: number }[] = [];
  const ctx = {
    save() {},
    restore() {},
    fillRect() {},
    strokeRect() {},
    measureText: (text: string) => ({ width: 6 * text.length }),
    fillText: (text: string, x: number, y: number) => texty.push({ text, x, y }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, texty };
}

const prut = (ax: number, ay: number, bx: number, by: number, vyuziti: number) => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  vyuziti,
});

describe("čísla využití", () => {
  it("píše využití v celých procentech doprostřed prutu, bez ohledu na znaménko", () => {
    const { ctx, texty } = platno();
    nakresliCislaVyuziti(ctx, [prut(0, 0, 100, 0, -0.426), prut(0, 100, 100, 200, 1.35)]);
    expect(texty.map((t) => t.text).sort()).toEqual(["135 %", "43 %"]);
    const tlaceny = texty.find((t) => t.text === "43 %")!;
    expect(tlaceny.x).toBeCloseTo(50);
    expect(tlaceny.y).toBeCloseTo(0.5);
  });

  it("nenamáhaný prut a prut příliš krátký na obrazovce číslo nedostanou", () => {
    const { ctx, texty } = platno();
    nakresliCislaVyuziti(ctx, [prut(0, 0, 100, 0, 0.001), prut(0, 50, 20, 50, 0.8)]);
    expect(texty).toEqual([]);
  });

  it("zkřížené pruty: číslo méně namáhaného se posune podél prutu", () => {
    const { ctx, texty } = platno();
    nakresliCislaVyuziti(ctx, [prut(0, 0, 200, 200, 0.2), prut(0, 200, 200, 0, 0.7)]);
    const vic = texty.find((t) => t.text === "70 %")!;
    const min = texty.find((t) => t.text === "20 %")!;
    expect(vic.x).toBeCloseTo(100);
    expect(min.x).not.toBeCloseTo(100);
    // Posunuté číslo pořád leží na svém prutu (úhlopříčka x = y).
    expect(min.y - 0.5).toBeCloseTo(min.x);
  });

  it("když není kam, číslo méně namáhaného prutu vynechá", () => {
    const { ctx, texty } = platno();
    // Pět stejných prutů přes sebe: míst podél prutu je pět, ale sousední se překrývají.
    nakresliCislaVyuziti(
      ctx,
      [0.9, 0.8, 0.7, 0.6, 0.5, 0.4].map((u) => prut(0, 0, 40, 0, u)),
    );
    expect(texty.length).toBeLessThan(6);
    expect(texty[0]!.text).toBe("90 %");
  });
});

describe("škála využití", () => {
  it("jde od bílé přes žlutou a oranžovou k červené", () => {
    expect(barvaVyuziti(0)).toBe("rgb(255, 255, 255)");
    expect(barvaVyuziti(0.4)).toBe("rgb(255, 209, 102)");
    expect(barvaVyuziti(0.75)).toBe("rgb(255, 154, 77)");
    expect(barvaVyuziti(1)).toBe("rgb(255, 77, 61)");
  });

  it("tah a tlak mají stejnou barvu a přetížení zůstává červené", () => {
    expect(barvaVyuziti(-0.3)).toBe(barvaVyuziti(0.3));
    expect(barvaVyuziti(2.5)).toBe("rgb(255, 77, 61)");
  });

  it("už malé využití je od nenamáhaného prutu rozeznat", () => {
    expect(barvaVyuziti(0.1)).not.toBe(barvaVyuziti(0));
  });
});

describe("čísla využití u mostu z mnoha prutů", () => {
  it("popíše jen nejvíc namáhané pruty; prut u meze má číslo vždycky", async () => {
    const { NEJVIC_CISEL, VZDY_OD } = await import("../src/vykres/cisla");
    const texty: string[] = [];
    const ctx = {
      save() {},
      restore() {},
      fillRect() {},
      strokeRect() {},
      measureText: (text: string) => ({ width: 6 * text.length }),
      fillText: (text: string) => texty.push(text),
    } as unknown as CanvasRenderingContext2D;
    // Čtyřicet prutů pod sebou, daleko od sebe: nic se nepřekrývá. Využití 1 % až 40 %.
    const polozky = Array.from({ length: 40 }, (_, i) => ({ a: { x: 0, y: 40 * i }, b: { x: 200, y: 40 * i }, vyuziti: (i + 1) / 100 }));
    nakresliCislaVyuziti(ctx, polozky);
    expect(texty).toHaveLength(NEJVIC_CISEL);
    expect(texty[0]).toBe("40 %");
    expect(texty.at(-1)).toBe("25 %");
    // Pruty u meze se popíšou všechny, i když jich je víc než strop.
    texty.length = 0;
    nakresliCislaVyuziti(ctx, polozky.map((p) => ({ ...p, vyuziti: VZDY_OD + p.vyuziti })));
    expect(texty).toHaveLength(40);
    // Malý most se popíše celý.
    texty.length = 0;
    nakresliCislaVyuziti(ctx, polozky.slice(0, 9));
    expect(texty).toHaveLength(9);
  });
});
