import { describe, expect, it } from "vitest";
import { KATALOG } from "../src/data/katalog";
import { ChybaDat } from "../src/data/kontrola";
import { Kreslic } from "../src/data/kreslic";
import {
  NEJVETSI_ID_NAVRHU,
  NEJVETSI_SOURADNICE,
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

  it("odmítne id a souřadnice mimo rozumné meze (podvržený odkaz nebo Import)", () => {
    // Id kolem 2^53: editor dává novému prutu id o jedna větší a u takových čísel by dvě
    // id splynula; uložený most by pak nešel přečíst.
    const velkeId = trojuhelnik();
    velkeId.pruty[2]!.id = 2 ** 53 - 1;
    ocekavejChybu(velkeId, "navrh.pruty[2].id");
    const velkyStycnik = trojuhelnik();
    velkyStycnik.stycniky[2]!.id = NEJVETSI_ID_NAVRHU + 1;
    ocekavejChybu(velkyStycnik, "navrh.stycniky[2].id");
    const naHrane = trojuhelnik();
    naHrane.pruty[2]!.id = NEJVETSI_ID_NAVRHU;
    expect(nactiNavrh(naHrane).pruty[2]!.id).toBe(NEJVETSI_ID_NAVRHU);
    // Souřadnice 1e300 dala cenu „Infinity Kč“ a zdržela zkoušku na sekundy.
    const daleko = trojuhelnik();
    daleko.stycniky[2]!.x = 1e300;
    ocekavejChybu(daleko, "navrh.stycniky[2].x");
    const hluboko = trojuhelnik();
    hluboko.stycniky[2]!.y = -(NEJVETSI_SOURADNICE + 1);
    ocekavejChybu(hluboko, "navrh.stycniky[2].y");
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

  it("starší verze formátu se převedou: návrh verze 1 až 3 se čte dál", () => {
    // Návrh, jak ho hra ukládala ve verzi 1 (před laděným tlumičem), 2 a 3.
    for (const verze of [1, 2, 3]) {
      const stary = { ...trojuhelnik(), verze };
      expect(nactiNavrh(JSON.parse(JSON.stringify(stary)))).toEqual(trojuhelnik());
    }
    // Verze 3 s předpětím lana a laděným tlumičem: převod na verzi 4 je nemění.
    const sLanem = {
      verze: 3,
      uroven: "0-00",
      stycniky: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 4, y: 0, tlumic: { hmota: 200, frekvence: 2.1 } },
        { id: 2, x: 2, y: 3 },
      ],
      pruty: [
        { id: 0, a: 0, b: 1, prvek: "mostovka-drevo" },
        { id: 1, a: 0, b: 2, prvek: "lano", predpeti: -0.25 },
      ],
    };
    const nacteny = nactiNavrh(sLanem);
    expect(nacteny.verze).toBe(VERZE_NAVRHU);
    expect(nacteny.pruty[1]).toEqual({ id: 1, a: 0, b: 2, prvek: "lano", predpeti: -0.25 });
    expect(nacteny.stycniky[1]).toEqual({ id: 1, x: 4, y: 0, tlumic: { hmota: 200, frekvence: 2.1 } });
  });

  it("verze 3 → 4: píst nese zdvih; délka po vysunutí ze starého zápisu se zahodí", () => {
    // Rozpracovaná verze 3 zapisovala k pístu délku po vysunutí. Hra písty tehdy neuměla,
    // takže takový návrh mohl vzniknout jen ručně; údaj se zahodí a píst dostane výchozí zdvih.
    const stary = {
      verze: 3,
      uroven: "0-00",
      stycniky: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 4, y: 0 },
        { id: 2, x: 0, y: -3 },
      ],
      pruty: [
        { id: 0, a: 0, b: 1, prvek: "mostovka-drevo" },
        { id: 1, a: 2, b: 1, prvek: "pist", vysunuti: 6.5 },
      ],
    };
    const nacteny = nactiNavrh(stary);
    expect(nacteny.pruty[1]).toEqual({ id: 1, a: 2, b: 1, prvek: "pist" });
    // Ve verzi 4 je `vysunuti` neznámý klíč a zdvih smí být i záporný.
    ocekavejChybu({ ...stary, verze: 4 }, "navrh.pruty[1].vysunuti");
    const novy = { ...stary, verze: 4, pruty: [stary.pruty[0], { id: 1, a: 2, b: 1, prvek: "pist", zdvih: -1.5 }] };
    expect(nactiNavrh(novy).pruty[1]).toEqual({ id: 1, a: 2, b: 1, prvek: "pist", zdvih: -1.5 });
    expect(navrhZTextu(navrhNaText(nactiNavrh(novy)))).toEqual(nactiNavrh(novy));
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

  it("všechny prvky katalogu už hra umí; nehotový by kontrola odmítla", () => {
    // Hotové jsou prvky s ustálenými vlastnostmi. Posledním byl píst (milník M6).
    const hotove = Object.entries(KATALOG)
      .filter(([, polozka]) => polozka.hotovo)
      .map(([id]) => id);
    expect(hotove).toEqual([
      "mostovka-drevo",
      "mostovka-ocelobeton",
      "mostovka-ocel",
      "kolejiste",
      "drevo-lehke",
      "drevo-tezke",
      "ocel-lehka",
      "ocel-tezka",
      "lano",
      "lano-nosne",
      "pilir",
      "tlumic",
      "pruzina",
      "pist",
    ]);
    for (const polozka of Object.values(KATALOG)) {
      if (polozka.predbezne) expect(polozka.hotovo).toBe(false);
    }
    // Píst hra umí, ale tahle úroveň ho nedovoluje.
    const sPistem = trojuhelnik();
    sPistem.pruty[1]!.prvek = "pist";
    const problemy = zkontrolujNavrh(sPistem, uroven).map((p) => p.druh);
    expect(problemy).toContain("prvek-nepovoleny");
    expect(problemy).not.toContain("prvek-neni-hotovy");
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

  it("tuhost patří jen pružině: tlumič s tuhostí je vzpěra za cenu tlumiče a kontrola ho odmítne", () => {
    const navrh = trojuhelnik();
    navrh.pruty[1] = { ...navrh.pruty[1]!, prvek: "tlumic", tuhost: 1e9 };
    expect(druhy(nactiNavrh(navrh))).toContain("tuhost-nepatri");
    // Nulová tuhost nic nedělá a pružina tuhost mít smí.
    navrh.pruty[1] = { ...navrh.pruty[1]!, tuhost: 0 };
    expect(druhy(nactiNavrh(navrh))).not.toContain("tuhost-nepatri");
    navrh.pruty[1] = { ...navrh.pruty[1]!, prvek: "pruzina", tuhost: 4e6 };
    expect(druhy(nactiNavrh(navrh))).not.toContain("tuhost-nepatri");
    navrh.pruty[1] = { ...navrh.pruty[1]!, prvek: "ocel-lehka", tuhost: 5 };
    expect(druhy(nactiNavrh(navrh))).toContain("tuhost-nepatri");
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
