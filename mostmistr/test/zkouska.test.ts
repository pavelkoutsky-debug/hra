import { describe, expect, it } from "vitest";
import { VERZE_NAVRHU } from "../src/data/navrh";
import { nactiUroven } from "../src/data/uroven";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { BehZkousky } from "../src/zkouska/beh";
import type { VstupZkousky, ZpravaZeZkousky } from "../src/zkouska/protokol";
import zkusebniVykres from "../urovne/0-00.json";

function beh(): { beh: BehZkousky; prijate: ZpravaZeZkousky[] } {
  const prijate: ZpravaZeZkousky[] = [];
  return { beh: new BehZkousky((zprava) => prijate.push(zprava)), prijate };
}

function vstup(verzeFyziky: number): VstupZkousky {
  return {
    uroven: nactiUroven(zkusebniVykres),
    navrh: { verze: VERZE_NAVRHU, uroven: "0-00", stycniky: [], pruty: [] },
    nasada: 1,
    verzeFyziky,
  };
}

describe("běh zkoušky", () => {
  it("na pozdrav odpoví verzí fyziky", () => {
    const { beh: b, prijate } = beh();
    b.prijmi({ typ: "ahoj" });
    expect(prijate).toEqual([{ typ: "pripraveno", verzeFyziky: VERZE_FYZIKY }]);
  });

  it("odmítne zkoušku pro jinou verzi fyziky, než sám má", () => {
    const { beh: b, prijate } = beh();
    b.prijmi({ typ: "start", vstup: vstup(VERZE_FYZIKY + 1) });
    expect(prijate).toHaveLength(1);
    expect(prijate[0]).toMatchObject({ typ: "chyba", kod: "jina-verze-fyziky" });
  });

  it("dokud zkouška s provozem neexistuje, poctivě ji odmítne místo předstíraného výsledku", () => {
    // Stav po milníku M1b: jádro je hotové, běh zkoušky podle jízdního řádu přijde v M2.
    expect(VERZE_FYZIKY).toBe(1);
    const { beh: b, prijate } = beh();
    b.prijmi({ typ: "start", vstup: vstup(VERZE_FYZIKY) });
    expect(prijate).toEqual([{ typ: "chyba", kod: "zkouska-neni-hotova" }]);
  });

  it("zásah hráče a zastavení bez běžící zkoušky nic neodešlou", () => {
    const { beh: b, prijate } = beh();
    b.prijmi({ typ: "stop" });
    b.prijmi({ typ: "vstup", vstup: { krok: 0, druh: "brnknuti", stycnik: 0, vychylka: { x: 0, y: -0.1 } } });
    expect(prijate).toEqual([]);
  });
});
