import { describe, expect, it } from "vitest";
import { ChybaDat } from "../src/data/kontrola";
import { VERZE_UROVNE, nactiUroven, vyskaTerenu } from "../src/data/uroven";
import { SOUBORY_UROVNI, nactiUrovne } from "../urovne/index";
import zkusebniVykres from "../urovne/0-00.json";

/** Hluboká kopie platné úrovně, kterou lze v testu pokazit. */
function platna(): Record<string, any> {
  return JSON.parse(JSON.stringify(zkusebniVykres)) as Record<string, any>;
}

function ocekavejChybu(data: unknown, cesta: string): void {
  let chyba: unknown;
  try {
    nactiUroven(data);
  } catch (zachycena) {
    chyba = zachycena;
  }
  expect(chyba).toBeInstanceOf(ChybaDat);
  expect((chyba as ChybaDat).cesta).toBe(cesta);
}

describe("soubory úrovní", () => {
  it("všechny projdou kontrolou", () => {
    expect(nactiUrovne()).toHaveLength(SOUBORY_UROVNI.length);
  });

  it("mají jedinečná id", () => {
    const id = nactiUrovne().map((u) => u.id);
    expect(new Set(id).size).toBe(id.length);
  });
});

describe("kontrola úrovně", () => {
  it("platná úroveň projde beze změny hodnot", () => {
    const u = nactiUroven(platna());
    expect(u.verze).toBe(VERZE_UROVNE);
    expect(u.id).toBe("0-00");
    expect(u.kotvy).toHaveLength(4);
    expect(u.trasy[0]?.konec).toEqual({ x: 24, y: 0 });
  });

  it("odmítne data, která nejsou objekt", () => {
    ocekavejChybu(null, "uroven");
    ocekavejChybu([], "uroven");
  });

  it("odmítne novější verzi formátu, než umí", () => {
    ocekavejChybu({ ...platna(), verze: VERZE_UROVNE + 1 }, "uroven.verze");
  });

  it("odmítne neznámý klíč, takže překlep neprojde potichu", () => {
    ocekavejChybu({ ...platna(), hladinna: -6 }, "uroven.hladinna");
  });

  it("odmítne chybějící povinný údaj", () => {
    const data = platna();
    delete data.nazev;
    ocekavejChybu(data, "uroven.nazev");
  });

  it("odmítne id ve špatném tvaru", () => {
    ocekavejChybu({ ...platna(), id: "prvni" }, "uroven.id");
  });

  it("odmítne terén, jehož x neroste", () => {
    const data = platna();
    data.teren[3].x = data.teren[2].x;
    ocekavejChybu(data, "uroven.teren[3]");
  });

  it("odmítne kotvu mimo rastr", () => {
    const data = platna();
    data.kotvy[0].x = 0.5;
    ocekavejChybu(data, "uroven.kotvy[0].x");
  });

  it("odmítne kotvu mimo výřez", () => {
    const data = platna();
    data.kotvy[2] = { x: 500, y: 0, typ: "pevna" };
    ocekavejChybu(data, "uroven.kotvy[2]");
  });

  it("odmítne neznámý typ kotvy", () => {
    const data = platna();
    data.kotvy[1].typ = "lepena";
    ocekavejChybu(data, "uroven.kotvy[1].typ");
  });

  it("odmítne trasu, která nekončí na kotvě", () => {
    const data = platna();
    data.trasy[0].konec = { x: 23, y: 0 };
    ocekavejChybu(data, "uroven.trasy[0].konec");
  });

  it("odmítne trasu vedoucí zprava doleva", () => {
    const data = platna();
    data.trasy[0].zacatek = { x: 24, y: 0 };
    data.trasy[0].konec = { x: 0, y: 0 };
    ocekavejChybu(data, "uroven.trasy[0]");
  });

  it("odmítne jízdní řád na neexistující trase", () => {
    const data = platna();
    data.jizdniRad = [{ cas: 0, trasa: "dalnice", smer: 1, druh: "auto" }];
    ocekavejChybu(data, "uroven.jizdniRad[0].trasa");
  });

  it("přijme položku jízdního řádu s počtem a kadencí", () => {
    const data = platna();
    data.jizdniRad = [{ cas: 5, trasa: "silnice", smer: -1, druh: "utvar", pocet: 30, kadence: 2 }];
    expect(nactiUroven(data).jizdniRad[0]).toEqual({
      cas: 5,
      trasa: "silnice",
      smer: -1,
      druh: "utvar",
      pocet: 30,
      kadence: 2,
    });
  });

  it("odmítne neznámý druh provozu", () => {
    const data = platna();
    data.jizdniRad = [{ cas: 0, trasa: "silnice", smer: 1, druh: "vzducholod" }];
    ocekavejChybu(data, "uroven.jizdniRad[0].druh");
  });

  it("odmítne inženýrský rozpočet vyšší než povolený", () => {
    ocekavejChybu({ ...platna(), rozpocet: 100_000, inzenyrskyRozpocet: 120_000 }, "uroven.inzenyrskyRozpocet");
  });

  it("odmítne prvek, který katalog nezná", () => {
    const data = platna();
    data.povolenePrvky.push("bambus");
    ocekavejChybu(data, `uroven.povolenePrvky[${data.povolenePrvky.length - 1}]`);
  });

  it("odmítne výřez s nulovou plochou", () => {
    const data = platna();
    data.vyrez.xMax = data.vyrez.xMin;
    ocekavejChybu(data, "uroven.vyrez");
  });
});

describe("výška terénu", () => {
  const u = nactiUroven(platna());

  it("v zadaných bodech odpovídá datům", () => {
    expect(vyskaTerenu(u, 0)).toBe(0);
    expect(vyskaTerenu(u, 5)).toBe(-8);
  });

  it("mezi body se mění lineárně", () => {
    expect(vyskaTerenu(u, 1)).toBeCloseTo(-2.5, 12);
    expect(vyskaTerenu(u, 12)).toBe(-8);
  });

  it("za krajními body pokračuje vodorovně", () => {
    expect(vyskaTerenu(u, -1000)).toBe(0);
    expect(vyskaTerenu(u, 1000)).toBe(0);
  });
});

describe("verze formátu úrovně", () => {
  it("soubor verze 1 se převede: závaží nedovoluje a osu frekvencí neukazuje", () => {
    const stara = platna();
    expect(stara.verze).toBe(1);
    const u = nactiUroven(stara);
    expect(u.verze).toBe(VERZE_UROVNE);
    expect(u.nejvetsiZavazi).toBe(0);
    expect(u.osaFrekvenci).toBe(false);
  });

  it("verze 2 nese největší závaží a osu frekvencí sama a bez nich neprojde", () => {
    const nova = { ...platna(), verze: 2, nejvetsiZavazi: 1500, osaFrekvenci: true };
    const u = nactiUroven(nova);
    expect(u.nejvetsiZavazi).toBe(1500);
    expect(u.osaFrekvenci).toBe(true);
    ocekavejChybu({ ...platna(), verze: 2, osaFrekvenci: true }, "uroven.nejvetsiZavazi");
    ocekavejChybu({ ...platna(), verze: 2, nejvetsiZavazi: -1, osaFrekvenci: true }, "uroven.nejvetsiZavazi");
  });

  it("úrovně druhé kapitoly jsou ve verzi 2 a ukazují osu frekvencí", () => {
    const druha = nactiUrovne().filter((u) => u.id.startsWith("2-"));
    expect(druha).toHaveLength(4);
    expect(druha.every((u) => u.osaFrekvenci)).toBe(true);
  });
});
