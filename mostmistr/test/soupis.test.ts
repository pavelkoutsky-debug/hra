// Soupis mostu pro nápovědu: z čeho je most, který úrovní projde.
import { describe, expect, it } from "vitest";
import { cenaNavrhu } from "../src/data/cena";
import { soupisMostu } from "../src/data/soupis";
import { nactiKampan } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

describe("soupis mostu", () => {
  it("sečte pruty podle prvků v pořadí, v jakém je most použil, a jejich délky", () => {
    const soupis = soupisMostu(RESENI["1-01"]!.pruchod);
    expect(soupis.prvky.map((p) => p.prvek)).toEqual(["mostovka-drevo", "drevo-lehke"]);
    expect(soupis.prvky[0]).toEqual({ prvek: "mostovka-drevo", prutu: 2, metru: 8 });
    expect(soupis.prvky[1]!.prutu).toBe(3);
    // Věšadlo vysoké 2 m: dvě šikminy po √20 m a svislice 2 m.
    expect(soupis.prvky[1]!.metru).toBeCloseTo(2 * Math.sqrt(20) + 2, 1);
    expect(soupis).toMatchObject({ svaru: 0, zamku: 0, zavazi: 0, tlumicu: 0, napinaku: 0 });
    expect(soupis.cena).toBe(cenaNavrhu(RESENI["1-01"]!.pruchod));
  });

  it("počítá i přídavky: svary, zámky, závaží, laděné tlumiče a dotažené napínáky", () => {
    const sklopny = soupisMostu(RESENI["7-01"]!.pruchod);
    expect(sklopny.zamku).toBe(1);
    expect(sklopny.svaru).toBeGreaterThan(0);
    expect(sklopny.prvky.map((p) => p.prvek)).toContain("pist");
    const visuty = soupisMostu(RESENI["4-03"]!.pruchod);
    expect(visuty.napinaku).toBeGreaterThan(0);
    expect(soupisMostu(RESENI["5-04"]!.mistrovska).tlumicu).toBe(2);
    expect(soupisMostu(RESENI["2-03"]!.pruchod).zavazi).toBe(3);
  });

  it("každá úroveň kampaně má most pro nápovědu a soupis mu sedí s počtem prutů", () => {
    for (const uroven of nactiKampan()) {
      const most = RESENI[uroven.id]!.pruchod;
      const soupis = soupisMostu(most);
      expect(soupis.prvky.reduce((s, p) => s + p.prutu, 0), uroven.id).toBe(most.pruty.length);
      expect(soupis.cena, uroven.id).toBeLessThanOrEqual(uroven.rozpocet!);
    }
  });
});
