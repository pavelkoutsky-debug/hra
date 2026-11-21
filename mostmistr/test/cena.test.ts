import { describe, expect, it } from "vitest";
import { cenaNavrhu, cenaPrutu, hmotnostNavrhu } from "../src/data/cena";
import { CENA_SVARU, CENA_ZAVAZI, ID_PRVKU, KATALOG, vlastnostiPrutu } from "../src/data/katalog";
import { useckaProtinaVnitrek, zkontrolujNavrh } from "../src/data/navrh";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";

describe("cena návrhu", () => {
  it("každý prvek katalogu má kladnou cenu", () => {
    for (const id of ID_PRVKU) {
      const cena = KATALOG[id].cena;
      expect("zaMetr" in cena ? cena.zaMetr : cena.zaKus, id).toBeGreaterThan(0);
    }
  });

  it("nosné prvky se platí za metr, tlumič a pružina za kus", () => {
    expect(cenaPrutu("drevo-lehke", 5)).toBe(5 * 1200);
    expect(cenaPrutu("mostovka-drevo", 4)).toBe(4 * 2500);
    expect(cenaPrutu("tlumic", 1)).toBe(cenaPrutu("tlumic", 6));
  });

  it("sčítá pruty, svary za každý připojený prut a závaží", () => {
    const k = new Kreslic();
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    k.prut("drevo-lehke", [0, 0], [4, 3]); // délka 5 m
    k.prut("drevo-lehke", [4, 0], [4, 3]); // délka 3 m
    const zaklad = 4 * 2500 + 8 * 1200;
    expect(cenaNavrhu(k.navrh())).toBe(zaklad);
    k.bod(4, 3, { svar: true }); // dva připojené pruty
    expect(cenaNavrhu(k.navrh())).toBe(zaklad + 2 * CENA_SVARU);
    k.bod(4, 0, { zavazi: 250 });
    expect(cenaNavrhu(k.navrh())).toBe(zaklad + 2 * CENA_SVARU + 250 * CENA_ZAVAZI);
  });

  it("těžší průřez je dražší a ocel dražší než dřevo", () => {
    expect(cenaPrutu("drevo-tezke", 1)).toBeGreaterThan(cenaPrutu("drevo-lehke", 1));
    expect(cenaPrutu("ocel-lehka", 1)).toBeGreaterThan(cenaPrutu("drevo-tezke", 1));
    expect(cenaPrutu("ocel-tezka", 1)).toBeGreaterThan(cenaPrutu("ocel-lehka", 1));
  });
});

describe("hmotnost návrhu", () => {
  it("počítá pruty podle katalogu, mostovku s vybavením a závaží", () => {
    const uroven = urovenRegrese({ rozpeti: 4, sirka: 3, vybaveni: 200 });
    const k = new Kreslic();
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    k.prut("drevo-lehke", [0, 0], [4, 3]);
    k.bod(4, 3, { zavazi: 100 });
    const mostovka = vlastnostiPrutu("mostovka-drevo", 3)!.hmotnostNaMetr + 200;
    const tram = vlastnostiPrutu("drevo-lehke", 3)!.hmotnostNaMetr;
    expect(hmotnostNavrhu(k.navrh(), uroven)).toBeCloseTo(4 * mostovka + 5 * tram + 100, 9);
  });
});

describe("pravidla úrovně navíc", () => {
  it("most dražší než rozpočet úrovně hlásí překročení", () => {
    const k = new Kreslic();
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    const navrh = k.navrh();
    const levna = { ...urovenRegrese({ rozpeti: 4 }), povolenePrvky: ["mostovka-drevo" as const], rozpocet: 9999 };
    expect(zkontrolujNavrh(navrh, levna)).toEqual([{ druh: "nad-rozpocet" }]);
    expect(zkontrolujNavrh(navrh, { ...levna, rozpocet: 10000 })).toEqual([]);
    expect(zkontrolujNavrh(navrh, { ...levna, rozpocet: null })).toEqual([]);
  });

  it("styčník pod povrchem terénu smí být jen v kotvě nebo na základu", () => {
    const uroven = {
      ...urovenRegrese({ rozpeti: 8, kotvy: [{ x: 1, y: -3, typ: "pevna" }], zaklady: [{ x: 4, y: -20 }] }),
      povolenePrvky: ["drevo-lehke" as const],
    };
    const k = new Kreslic();
    k.prut("drevo-lehke", [0, 0], [1, -3]); // do kotvy: v pořádku
    k.prut("drevo-lehke", [0, 0], [4, -3]); // nad dnem údolí: v pořádku
    const pruty = (navrh = k.navrh()) => zkontrolujNavrh(navrh, uroven).filter((p) => p.druh === "stycnik-v-terenu");
    expect(pruty()).toEqual([]);
    const zabodnuty = k.bod(-3, -2);
    k.prut("drevo-lehke", [0, 0], [-3, -2]);
    expect(pruty()).toEqual([{ druh: "stycnik-v-terenu", stycnik: zabodnuty }]);
  });

  it("prut nesmí procházet vnitřkem zakázané zóny, po její hraně smí", () => {
    const zona = { xMin: 2, yMin: -4, xMax: 6, yMax: -1 };
    expect(useckaProtinaVnitrek({ x: 0, y: -2 }, { x: 8, y: -2 }, zona)).toBe(true);
    expect(useckaProtinaVnitrek({ x: 0, y: 0 }, { x: 4, y: -3 }, zona)).toBe(true);
    expect(useckaProtinaVnitrek({ x: 3, y: -3 }, { x: 5, y: -2 }, zona)).toBe(true); // celý uvnitř
    expect(useckaProtinaVnitrek({ x: 0, y: -1 }, { x: 8, y: -1 }, zona)).toBe(false); // po horní hraně
    expect(useckaProtinaVnitrek({ x: 2, y: -6 }, { x: 2, y: 2 }, zona)).toBe(false); // po levé hraně
    expect(useckaProtinaVnitrek({ x: 0, y: 1 }, { x: 4, y: -1 }, zona)).toBe(false); // končí na hraně
    expect(useckaProtinaVnitrek({ x: 0, y: -3 }, { x: 2, y: -1 }, zona)).toBe(false); // dotyk rohu
    expect(useckaProtinaVnitrek({ x: 0, y: 0 }, { x: 8, y: 0 }, zona)).toBe(false); // mimo

    const uroven = { ...urovenRegrese({ rozpeti: 8 }), zakazaneZony: [zona], povolenePrvky: ["drevo-lehke" as const] };
    const k = new Kreslic();
    const skrz = k.prut("drevo-lehke", [0, 0], [4, -4]);
    k.prut("drevo-lehke", [0, 0], [2, -1]);
    expect(zkontrolujNavrh(k.navrh(), uroven).filter((p) => p.druh === "prut-v-zakazane-zone")).toEqual([
      { druh: "prut-v-zakazane-zone", prut: skrz },
    ]);
  });
});
