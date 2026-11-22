import { describe, expect, it } from "vitest";
import { KATALOG } from "../src/data/katalog";
import { ChybaDat } from "../src/data/kontrola";
import { Kreslic } from "../src/data/kreslic";
import {
  VERZE_NAVRHU,
  nactiNavrh,
  navrhNaText,
  navrhZTextu,
  zkontrolujNavrh,
  type NavrhMostu,
} from "../src/data/navrh";
import { nactiUroven } from "../src/data/uroven";
import zkusebniVykres from "../urovne/0-00.json";

const uroven = nactiUroven(zkusebniVykres);

/** Trojúhelník nad levým břehem: tři styčníky, tři pruty. */
function trojuhelnik(): NavrhMostu {
  return {
    verze: VERZE_NAVRHU,
    uroven: "0-00",
    stycniky: [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 4, y: 0 },
      { id: 2, x: 2, y: 3 },
    ],
    pruty: [
      { id: 0, a: 0, b: 1, prvek: "mostovka-drevo" },
      { id: 1, a: 0, b: 2, prvek: "drevo-lehke" },
      { id: 2, a: 1, b: 2, prvek: "drevo-lehke" },
    ],
  };
}

function ocekavejChybu(data: unknown, cesta: string): void {
  let chyba: unknown;
  try {
    nactiNavrh(data);
  } catch (zachycena) {
    chyba = zachycena;
  }
  expect(chyba).toBeInstanceOf(ChybaDat);
  expect((chyba as ChybaDat).cesta).toBe(cesta);
}

describe("čtení návrhu", () => {
  it("platný návrh projde beze změny", () => {
    expect(nactiNavrh(trojuhelnik())).toEqual(trojuhelnik());
  });

  it("zápis do textu a zpět dá stejný návrh", () => {
    const navrh = trojuhelnik();
    navrh.stycniky[2]!.svar = true;
    navrh.stycniky[1]!.zavazi = 250;
    navrh.pruty[1]!.predpeti = 0.3;
    expect(navrhZTextu(navrhNaText(navrh))).toEqual(navrh);
  });

  it("odmítne text, který není zápis mostu", () => {
    expect(() => navrhZTextu("tohle není most")).toThrow(ChybaDat);
  });

  it("odmítne styčník mimo rastr", () => {
    const navrh = trojuhelnik();
    navrh.stycniky[2]!.x = 2.5;
    ocekavejChybu(navrh, "navrh.stycniky[2].x");
  });

  it("odmítne opakované id styčníku", () => {
    const navrh = trojuhelnik();
    navrh.stycniky[1]!.id = 0;
    ocekavejChybu(navrh, "navrh.stycniky[1].id");
  });

  it("odmítne prut do neexistujícího styčníku", () => {
    const navrh = trojuhelnik();
    navrh.pruty[2]!.b = 99;
    ocekavejChybu(navrh, "navrh.pruty[2].b");
  });

  it("odmítne prut, který začíná i končí ve stejném styčníku", () => {
    const navrh = trojuhelnik();
    navrh.pruty[0]!.b = 0;
    ocekavejChybu(navrh, "navrh.pruty[0]");
  });

  it("odmítne neznámý prvek", () => {
    ocekavejChybu({ ...trojuhelnik(), pruty: [{ id: 0, a: 0, b: 1, prvek: "bambus" }] }, "navrh.pruty[0].prvek");
  });

  it("odmítne napínák lana mimo rozsah; povolené lano (záporné předpětí) přečte", () => {
    const navrh = trojuhelnik();
    navrh.pruty[0]!.predpeti = 60;
    ocekavejChybu(navrh, "navrh.pruty[0].predpeti");
    navrh.pruty[0]!.predpeti = -60;
    ocekavejChybu(navrh, "navrh.pruty[0].predpeti");
    navrh.pruty[0]!.predpeti = -2.5;
    expect(nactiNavrh(JSON.parse(JSON.stringify(navrh))).pruty[0]!.predpeti).toBe(-2.5);
  });

  it("odmítne novější verzi formátu, než umí", () => {
    ocekavejChybu({ ...trojuhelnik(), verze: VERZE_NAVRHU + 1 }, "navrh.verze");
  });
});

describe("kontrola návrhu proti úrovni", () => {
  const druhy = (navrh: NavrhMostu): string[] => zkontrolujNavrh(navrh, uroven).map((p) => p.druh);

  it("návrh z hotových prvků projde bez výhrad", () => {
    expect(zkontrolujNavrh(trojuhelnik(), uroven)).toEqual([]);
  });

  it("prvek, jehož vlastnosti jsou zatím jen předběžné, odmítne", () => {
    // Hotové jsou prvky s ustálenými vlastnostmi; ostatní se zpřístupní s milníkem, kdy přijdou do hry.
    const hotove = Object.entries(KATALOG)
      .filter(([, polozka]) => polozka.hotovo)
      .map(([id]) => id);
    expect(hotove).toEqual([
      "mostovka-drevo",
      "mostovka-ocelobeton",
      "drevo-lehke",
      "drevo-tezke",
      "ocel-lehka",
      "ocel-tezka",
      "lano",
      "lano-nosne",
      "pilir",
      "tlumic",
      "pruzina",
    ]);
    for (const polozka of Object.values(KATALOG)) {
      if (polozka.predbezne) expect(polozka.hotovo).toBe(false);
    }
    const sPistem = trojuhelnik();
    sPistem.pruty[1]!.prvek = "pist";
    expect(zkontrolujNavrh(sPistem, uroven)).toContainEqual({ druh: "prvek-neni-hotovy", prut: 1 });
  });

  it("pilíř musí stát na základu nebo na pilíři, který na základu stojí", () => {
    // Zkušební výkres má základ v bodě (9, −8).
    const k = new Kreslic(uroven.id);
    const dolni = k.prut("pilir", [9, -8], [9, 0]);
    const horni = k.prut("pilir", [9, 0], [9, 6]);
    expect(zkontrolujNavrh(k.navrh(), uroven)).toEqual([]);
    // Bez dolního dílu visí horní pilíř ve vzduchu; pilíř z kotvy mostu na základu také nestojí.
    const bezDolniho = { ...k.navrh(), pruty: k.navrh().pruty.filter((p) => p.id !== dolni) };
    expect(zkontrolujNavrh(bezDolniho, uroven)).toContainEqual({ druh: "pilir-mimo-zaklad", prut: horni });
    const zKotvy = new Kreslic(uroven.id);
    const mimo = zKotvy.prut("pilir", [0, 0], [0, 4]);
    expect(zkontrolujNavrh(zKotvy.navrh(), uroven)).toEqual([{ druh: "pilir-mimo-zaklad", prut: mimo }]);
  });

  it("pozná návrh pro jinou úroveň", () => {
    expect(druhy({ ...trojuhelnik(), uroven: "1-01" })).toContain("jina-uroven");
  });

  it("pozná styčník mimo výřez", () => {
    const navrh = trojuhelnik();
    navrh.stycniky[2] = { id: 2, x: 2, y: 400 };
    expect(zkontrolujNavrh(navrh, uroven)).toContainEqual({ druh: "stycnik-mimo-vyrez", stycnik: 2 });
  });

  it("pozná styčník uvnitř zakázané zóny, ale ne na její hraně", () => {
    const uvnitr = trojuhelnik();
    uvnitr.stycniky.push({ id: 3, x: 15, y: -3 });
    expect(zkontrolujNavrh(uvnitr, uroven)).toContainEqual({ druh: "stycnik-v-zakazane-zone", stycnik: 3 });

    const naHrane = trojuhelnik();
    naHrane.stycniky.push({ id: 3, x: 13, y: -3 });
    expect(druhy(naHrane)).not.toContain("stycnik-v-zakazane-zone");
  });

  it("pozná dva styčníky na stejném místě", () => {
    const navrh = trojuhelnik();
    navrh.stycniky.push({ id: 3, x: 4, y: 0 });
    expect(zkontrolujNavrh(navrh, uroven)).toContainEqual({ druh: "stycniky-na-stejnem-miste", stycnik: 3 });
  });

  it("pozná dvojitý prut mezi stejnými styčníky bez ohledu na směr", () => {
    const navrh = trojuhelnik();
    navrh.pruty.push({ id: 3, a: 1, b: 0, prvek: "drevo-lehke" });
    expect(zkontrolujNavrh(navrh, uroven)).toContainEqual({ druh: "prut-dvakrat", prut: 3 });
  });

  it("pozná prut delší, než prvek dovoluje", () => {
    const navrh = trojuhelnik();
    navrh.stycniky[1] = { id: 1, x: 5, y: 0 }; // dřevěná mostovka smí mít nejvýš 4 m
    expect(zkontrolujNavrh(navrh, uroven)).toContainEqual({ druh: "prut-dlouhy", prut: 0 });
  });

  it("prut přesně na největší délce je v pořádku", () => {
    expect(KATALOG["mostovka-drevo"].nejvetsiDelka).toBe(4);
    expect(druhy(trojuhelnik())).not.toContain("prut-dlouhy");
  });

  it("pozná prvek, který úroveň nepovoluje", () => {
    const navrh = trojuhelnik();
    navrh.pruty[1]!.prvek = "kolejiste";
    expect(zkontrolujNavrh(navrh, uroven)).toContainEqual({ druh: "prvek-nepovoleny", prut: 1 });
  });

  it("pozná svar tam, kde svary nejsou povolené", () => {
    const navrh = trojuhelnik();
    navrh.stycniky[2]!.svar = true;
    expect(druhy(navrh)).not.toContain("svar-nepovoleny");
    const bezSvaru = { ...uroven, povoleneSvary: false };
    expect(zkontrolujNavrh(navrh, bezSvaru)).toContainEqual({ druh: "svar-nepovoleny", stycnik: 2 });
  });
});
