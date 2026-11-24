import { describe, expect, it } from "vitest";
import { ChybaDat } from "../src/data/kontrola";
import { VERZE_UROVNE, nactiUroven, vyskaTerenu } from "../src/data/uroven";
import { cenaNavrhu } from "../src/data/cena";
import { TEXTY } from "../src/ui/slovnik";
import { SOUBORY_UROVNI, nactiKampan, nactiUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";
import { ukazkaUrovne } from "../urovne/ukazky";
import { RESENI_ZKOUSEK } from "../urovne/zkousky/index";
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

  it("verze 2 se převede: laděný tlumič nedovoluje, rezonanční křivku a budič nemá", () => {
    const druha = nactiUroven({ ...platna(), verze: 2, nejvetsiZavazi: 1500, osaFrekvenci: true });
    expect(druha.verze).toBe(VERZE_UROVNE);
    expect(druha.nejvetsiTlumic).toBe(0);
    expect(druha.rezonancniKrivka).toBe(false);
    expect(druha.budic).toBe(false);
    // Dřív neobstál jen most s nepřijatelným kmitáním; tak to starším úrovním zůstává.
    expect(druha.nejhorsiKomfort).toBe(3);
  });

  it("verze 3 nese laděný tlumič, rezonanční křivku a budič sama a bez nich neprojde", () => {
    const zaklad = { ...platna(), verze: 3, nejvetsiZavazi: 0, osaFrekvenci: true, nejhorsiKomfort: 2 };
    const u = nactiUroven({ ...zaklad, nejvetsiTlumic: 800, rezonancniKrivka: true, budic: true });
    expect(u).toMatchObject({ nejvetsiTlumic: 800, rezonancniKrivka: true, budic: true, nejhorsiKomfort: 2 });
    const uplna = { ...zaklad, nejvetsiTlumic: 0, rezonancniKrivka: false, budic: false };
    ocekavejChybu({ ...uplna, nejhorsiKomfort: 4 }, "uroven.nejhorsiKomfort");
    ocekavejChybu({ ...uplna, nejhorsiKomfort: 1.5 }, "uroven.nejhorsiKomfort");
    ocekavejChybu({ ...zaklad, rezonancniKrivka: true, budic: true }, "uroven.nejvetsiTlumic");
    ocekavejChybu({ ...zaklad, nejvetsiTlumic: -1, rezonancniKrivka: true, budic: true }, "uroven.nejvetsiTlumic");
    ocekavejChybu({ ...zaklad, nejvetsiTlumic: 0, budic: true }, "uroven.rezonancniKrivka");
    ocekavejChybu({ ...zaklad, nejvetsiTlumic: 0, rezonancniKrivka: false }, "uroven.budic");
  });

  it("skákající dav může mít zadanou dobu skákání", () => {
    const zaklad = { ...platna(), verze: 3, nejvetsiZavazi: 0, osaFrekvenci: false, nejvetsiTlumic: 0, rezonancniKrivka: false, budic: false, nejhorsiKomfort: 3 };
    const polozka = { cas: 0, trasa: (platna().trasy as { id: string }[])[0]!.id, smer: 1, druh: "skakajici-dav", pocet: 30, kadence: 2.4, trvani: 8 };
    const u = nactiUroven({ ...zaklad, jizdniRad: [polozka] });
    expect(u.jizdniRad[0]).toMatchObject({ druh: "skakajici-dav", trvani: 8, kadence: 2.4 });
    ocekavejChybu({ ...zaklad, jizdniRad: [{ ...polozka, trvani: 0 }] }, "uroven.jizdniRad[0].trvani");
  });

  it("úrovně druhé kapitoly jsou ve verzi 2 a ukazují osu frekvencí", () => {
    const druha = nactiUrovne().filter((u) => u.id.startsWith("2-"));
    // Čtyři úrovně kapitoly a její zkouška.
    expect(druha).toHaveLength(5);
    expect(druha.every((u) => u.osaFrekvenci)).toBe(true);
  });
  it("zkouška kapitoly je pátá úroveň, nemá ukázku ani nápovědu a její rozpočty jsou těsné", () => {
    const kampan = nactiKampan();
    const zkousky = kampan.filter((u) => u.zkouskova);
    // Zkouškové jsou právě páté úrovně kapitol, každá kapitola má jednu.
    expect(zkousky.map((u) => u.id)).toEqual(kampan.filter((u) => u.id.endsWith("-05")).map((u) => u.id));
    expect(zkousky.map((u) => u.id).sort()).toEqual(Object.keys(RESENI_ZKOUSEK).sort());
    // Každá kapitola kromě závěrečné osmé (ta nic neučí a zkoušku nemá) má jednu.
    const kapitoly = [...new Set(kampan.map((u) => u.id.split("-")[0]!))];
    expect(zkousky.map((u) => u.id.split("-")[0])).toEqual(kapitoly.filter((k) => k !== "8"));
    for (const u of zkousky) {
      // Nic neučí: žádná ukázka, žádné „Více o úloze“, žádný odstavec o skutečných mostech.
      expect(ukazkaUrovne(u), u.id).toBeNull();
      for (const jazyk of ["cs", "en"] as const) {
        const texty = TEXTY[jazyk] as Record<string, string | undefined>;
        expect(texty[`zadani.${u.id}`], `${u.id} ${jazyk}`).toBeTruthy();
        expect(texty[`zadani.${u.id}.vice`], `${u.id} ${jazyk}`).toBeUndefined();
        expect(texty[`skutecnost.${u.id}`], `${u.id} ${jazyk}`).toBeUndefined();
      }
      // Rozpočet nejvýš 20 % nad inženýrským a ten 2,5 až 3 % nad mostem pro mistrovskou.
      expect(u.rozpocet! / u.inzenyrskyRozpocet!, u.id).toBeLessThanOrEqual(1.2);
      const nadMistrovskou = u.inzenyrskyRozpocet! / cenaNavrhu(RESENI[u.id]!.mistrovska) - 1;
      expect(nadMistrovskou, u.id).toBeGreaterThanOrEqual(0.025);
      expect(nadMistrovskou, u.id).toBeLessThanOrEqual(0.03);
    }
  });

  it("verze 3 se převede: nerovnost vozovky žádná, i když ji soubor uváděl", () => {
    // Starší úrovně třídu nerovnosti nesly, ale hra ji nepočítala; jsou vyladěné na rovné vozovce.
    const treti = {
      ...platna(),
      verze: 3,
      nerovnost: "C",
      nejvetsiZavazi: 0,
      osaFrekvenci: false,
      nejvetsiTlumic: 0,
      rezonancniKrivka: false,
      budic: false,
      nejhorsiKomfort: 3,
    };
    const u = nactiUroven(treti);
    expect(u.verze).toBe(VERZE_UROVNE);
    expect(u.nerovnost).toBe("zadna");
  });

  it("verze 4 nese nerovnost vozovky a u vozidel rozestup, rychlost a brzdění", () => {
    const zaklad = {
      ...platna(),
      verze: 4,
      nejvetsiZavazi: 0,
      osaFrekvenci: false,
      nejvetsiTlumic: 0,
      rezonancniKrivka: false,
      budic: false,
      nejhorsiKomfort: 3,
    };
    const trasa = (platna().trasy as { id: string }[])[0]!.id;
    const jizda = { cas: 0, trasa, smer: 1, druh: "nakladni" };
    const u = nactiUroven({
      ...zaklad,
      nerovnost: "B",
      jizdniRad: [{ ...jizda, pocet: 3, rozestup: 12, rychlost: 5, brzdeni: { misto: 2, stani: 3, zpomaleni: 4 } }],
    });
    expect(u.nerovnost).toBe("B");
    expect(u.jizdniRad[0]).toMatchObject({ rozestup: 12, rychlost: 5, brzdeni: { misto: 2, stani: 3, zpomaleni: 4 } });
    expect(nactiUroven({ ...zaklad, nerovnost: "zadna" }).nerovnost).toBe("zadna");
    ocekavejChybu({ ...zaklad, nerovnost: "D" }, "uroven.nerovnost");
    ocekavejChybu({ ...zaklad, jizdniRad: [{ ...jizda, rychlost: 0 }] }, "uroven.jizdniRad[0].rychlost");
    ocekavejChybu({ ...zaklad, jizdniRad: [{ ...jizda, rozestup: 1 }] }, "uroven.jizdniRad[0].rozestup");
    ocekavejChybu({ ...zaklad, jizdniRad: [{ ...jizda, brzdeni: { misto: 2 } }] }, "uroven.jizdniRad[0].brzdeni.stani");
    ocekavejChybu(
      { ...zaklad, jizdniRad: [{ ...jizda, brzdeni: { misto: 2, stani: 1, zpomaleni: 20 } }] },
      "uroven.jizdniRad[0].brzdeni.zpomaleni",
    );
  });

  it("verze 6 se převede beze změny; od verze 7 smí být kotva vyhrazená tlumiči", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zaklad: Record<string, any> = { ...platna(), verze: 6, nejvetsiZavazi: 0, osaFrekvenci: false, nejvetsiTlumic: 0, rezonancniKrivka: false, budic: false, nejhorsiKomfort: 3, nerovnost: "zadna", pohyb: null, lode: [] };
    const sesta = nactiUroven(zaklad);
    expect(sesta.verze).toBe(VERZE_UROVNE);
    expect(sesta.kotvy.every((k) => k.jen === undefined)).toBe(true);
    const kotvy = (zaklad.kotvy as { x: number; y: number; typ: string }[]).map((k, i) => (i === 0 ? { ...k, jen: "tlumic" } : k));
    const sedma = nactiUroven({ ...zaklad, verze: 7, kotvy });
    expect(sedma.kotvy[0]!.jen).toBe("tlumic");
    // Kotva smí být vyhrazená i lanu (kotevní blok zavěšeného mostu, 8-01).
    expect(nactiUroven({ ...zaklad, verze: 7, kotvy: kotvy.map((k, i) => (i === 0 ? { ...k, jen: "lano" } : k)) }).kotvy[0]!.jen).toBe("lano");
    expect(sedma.kotvy[1]!.jen).toBeUndefined();
    ocekavejChybu({ ...zaklad, verze: 7, kotvy: kotvy.map((k, i) => (i === 0 ? { ...k, jen: "pilir" } : k)) }, "uroven.kotvy[0].jen");
  });

  it("verze 7 se převede jako úroveň, která zkoušková není; od verze 8 to soubor říká sám", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zaklad: Record<string, any> = { ...platna(), verze: 7, nejvetsiZavazi: 0, osaFrekvenci: false, nejvetsiTlumic: 0, rezonancniKrivka: false, budic: false, nejhorsiKomfort: 3, nerovnost: "zadna", pohyb: null, lode: [] };
    const sedma = nactiUroven(zaklad);
    expect(sedma.verze).toBe(VERZE_UROVNE);
    expect(sedma.zkouskova).toBe(false);
    expect(nactiUroven({ ...zaklad, verze: 8, zkouskova: true }).zkouskova).toBe(true);
    expect(nactiUroven({ ...zaklad, verze: 8, zkouskova: false }).zkouskova).toBe(false);
    // Ve verzi 8 je pole povinné a starší verze ho neznají.
    ocekavejChybu({ ...zaklad, verze: 8 }, "uroven.zkouskova");
    ocekavejChybu({ ...zaklad, verze: 8, zkouskova: "ano" }, "uroven.zkouskova");
  });

  it("verze 8 se převede jako úroveň, která průhyb mostovky nehlídá; od verze 9 to soubor říká sám", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zaklad: Record<string, any> = { ...platna(), verze: 8, nejvetsiZavazi: 0, osaFrekvenci: false, nejvetsiTlumic: 0, rezonancniKrivka: false, budic: false, nejhorsiKomfort: 3, nerovnost: "zadna", pohyb: null, lode: [], zkouskova: false };
    const osma = nactiUroven(zaklad);
    expect(osma.verze).toBe(VERZE_UROVNE);
    expect(osma.nejvetsiPruhyb).toBeNull();
    expect(nactiUroven({ ...zaklad, verze: 9, nejvetsiPruhyb: 0.1 }).nejvetsiPruhyb).toBe(0.1);
    expect(nactiUroven({ ...zaklad, verze: 9, nejvetsiPruhyb: null }).nejvetsiPruhyb).toBeNull();
    // Ve verzi 9 je pole povinné, starší verze ho neznají a mez musí dávat smysl.
    ocekavejChybu({ ...zaklad, verze: 9 }, "uroven.nejvetsiPruhyb");
    // Soubor verze 8 mez mít nemůže: převod ji nastaví na „nehlídá se“.
    expect(nactiUroven({ ...zaklad, verze: 8, nejvetsiPruhyb: 0.1 }).nejvetsiPruhyb).toBeNull();
    ocekavejChybu({ ...zaklad, verze: 9, nejvetsiPruhyb: 0 }, "uroven.nejvetsiPruhyb");
    ocekavejChybu({ ...zaklad, verze: 9, nejvetsiPruhyb: 2 }, "uroven.nejvetsiPruhyb");
    // U mostu, který se zvedá, průhyb proti výkresu hlídat nejde.
    ocekavejChybu({ ...zaklad, verze: 9, nejvetsiPruhyb: 0.1, pohyb: { zvednout: 5, sklopit: 20 } }, "uroven.nejvetsiPruhyb");
  });
});
