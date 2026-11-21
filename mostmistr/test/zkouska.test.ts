// Zkouška mostu v úrovni: rozhraní zpráv, průjezd, pád, medaile a opakovatelnost.
import { describe, expect, it } from "vitest";
import { cenaNavrhu } from "../src/data/cena";
import { navrhNaText, navrhZTextu, type NavrhMostu } from "../src/data/navrh";
import type { PolozkaJizdnihoRadu, Uroven } from "../src/data/uroven";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { BehZkousky } from "../src/zkouska/beh";
import { JEDE, PREJEL, SPADL } from "../src/zkouska/provoz";
import type { Udalost, VstupZkousky, VysledekZkousky, ZpravaZeZkousky } from "../src/zkouska/protokol";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";
import { Zaznam } from "../src/zkouska/zaznam";
import { Zkouska } from "../src/zkouska/zkouska";

const PRVKY = ["mostovka-drevo", "drevo-lehke", "drevo-tezke"] as const;

function uroven(jizdniRad: PolozkaJizdnihoRadu[], uprava: Partial<Uroven> = {}): Uroven {
  return { ...urovenRegrese({ rozpeti: 12, sirka: 3, vybaveni: 100 }), povolenePrvky: [...PRVKY], jizdniRad, ...uprava };
}

/** Mostovka ze tří polí podepřená příhradou s horním pásem ve výšce 3 m. */
function prihrada(): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < 12; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
  k.prut("drevo-lehke", [0, 0], [4, 3]);
  k.prut("drevo-lehke", [4, 3], [8, 3]);
  k.prut("drevo-lehke", [8, 3], [12, 0]);
  k.prut("drevo-lehke", [4, 0], [4, 3]);
  k.prut("drevo-lehke", [8, 0], [8, 3]);
  k.prut("drevo-lehke", [4, 3], [8, 0]);
  return k.navrh();
}

/** Jen mostovka: tři kloubově spojená pole bez ztužení, tedy mechanismus. */
function jenMostovka(): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < 12; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
  return k.navrh();
}

const AUTO: PolozkaJizdnihoRadu = { cas: 0.5, trasa: "silnice", smer: 1, druh: "auto" };
const CHODEC: PolozkaJizdnihoRadu = { cas: 0, trasa: "silnice", smer: -1, druh: "chodec", pocet: 2, kadence: 2 };
const CYKLISTA: PolozkaJizdnihoRadu = { cas: 1, trasa: "silnice", smer: 1, druh: "cyklista" };

interface Prubeh {
  zpravy: ZpravaZeZkousky[];
  udalosti: Udalost[];
  zaznam: Zaznam;
  vysledek: VysledekZkousky;
}

/** Projede celou zkoušku přes rozhraní zpráv tak, jak to dělá pracovní vlákno. */
function zkousej(u: Uroven, navrh: NavrhMostu, nasada = 7): Prubeh {
  const zpravy: ZpravaZeZkousky[] = [];
  const beh = new BehZkousky((zprava) => zpravy.push(zprava));
  beh.prijmi({ typ: "start", vstup: { uroven: u, navrh, nasada, verzeFyziky: VERZE_FYZIKY } });
  expect(zpravy[0]!.typ, JSON.stringify(zpravy[0])).toBe("zacatek");
  let pojistka = 0;
  while (beh.pokracuj(0.5)) expect(pojistka++).toBeLessThan(400);
  const zaznam = new Zaznam();
  const udalosti: Udalost[] = [];
  for (const zprava of zpravy) {
    if (zprava.typ !== "zaznam") continue;
    zprava.topologie.forEach((t) => zaznam.pridejTopologii(t));
    zprava.snimky.forEach((s) => zaznam.pridej(s));
    udalosti.push(...zprava.udalosti);
  }
  const konec = zpravy.at(-1)!;
  if (konec.typ !== "konec") throw new Error(`Zkouška neskončila výsledkem: ${JSON.stringify(konec)}`);
  return { zpravy, udalosti, zaznam, vysledek: konec.vysledek };
}

describe("rozhraní zkoušky", () => {
  const vstup = (verzeFyziky: number, navrh = prihrada()): VstupZkousky => ({
    uroven: uroven([AUTO]),
    navrh,
    nasada: 1,
    verzeFyziky,
  });

  it("na pozdrav ohlásí verzi fyziky", () => {
    const zpravy: ZpravaZeZkousky[] = [];
    new BehZkousky((z) => zpravy.push(z)).prijmi({ typ: "ahoj" });
    expect(zpravy).toEqual([{ typ: "pripraveno", verzeFyziky: VERZE_FYZIKY }]);
  });

  it("odmítne vstup pro jinou verzi fyziky", () => {
    const zpravy: ZpravaZeZkousky[] = [];
    const beh = new BehZkousky((z) => zpravy.push(z));
    beh.prijmi({ typ: "start", vstup: vstup(VERZE_FYZIKY + 1) });
    expect(zpravy).toHaveLength(1);
    expect(zpravy[0]).toMatchObject({ typ: "chyba", kod: "jina-verze-fyziky" });
    expect(beh.bezi).toBe(false);
  });

  it("odmítne návrh, který porušuje pravidla úrovně", () => {
    const zpravy: ZpravaZeZkousky[] = [];
    const beh = new BehZkousky((z) => zpravy.push(z));
    const k = new Kreslic();
    k.prut("ocel-lehka", [0, 0], [4, 0]); // ocel v této úrovni povolená není
    beh.prijmi({ typ: "start", vstup: vstup(VERZE_FYZIKY, k.navrh()) });
    expect(zpravy[0]).toMatchObject({ typ: "chyba", kod: "neplatny-vstup", podrobnosti: "prvek-nepovoleny" });
  });

  it("druh provozu, který hra neumí, ohlásí jako chybu výpočtu", () => {
    const zpravy: ZpravaZeZkousky[] = [];
    const beh = new BehZkousky((z) => zpravy.push(z));
    const u = uroven([{ cas: 0, trasa: "silnice", smer: 1, druh: "lokomotiva" }]);
    beh.prijmi({ typ: "start", vstup: { uroven: u, navrh: prihrada(), nasada: 1, verzeFyziky: VERZE_FYZIKY } });
    expect(zpravy[0]).toMatchObject({ typ: "chyba", kod: "vypocet-selhal" });
    expect((zpravy[0] as { podrobnosti: string }).podrobnosti).toContain("lokomotiva");
  });

  it("zastavení zkoušku ukončí bez výsledku", () => {
    const zpravy: ZpravaZeZkousky[] = [];
    const beh = new BehZkousky((z) => zpravy.push(z));
    beh.prijmi({ typ: "start", vstup: vstup(VERZE_FYZIKY) });
    expect(beh.pokracuj(0.1)).toBe(true);
    beh.prijmi({ typ: "stop" });
    expect(beh.pokracuj(0.1)).toBe(false);
    expect(zpravy.some((z) => z.typ === "konec")).toBe(false);
  });
});

describe("zkouška příhradového mostu", () => {
  const u = uroven([CHODEC, AUTO, CYKLISTA], { inzenyrskyRozpocet: 70_000, mistrovska: { druh: "rezerva", limit: 0.5 } });
  const { zpravy, udalosti, zaznam, vysledek } = zkousej(u, prihrada());

  it("všichni přejdou a přejedou, nic se neporuší", () => {
    expect(vysledek).toMatchObject({ pruchod: true, ucastniku: 4, prejelo: 4, spadlo: 0, poruseni: 0, bezRovnovahy: false, rozpad: false });
    expect(udalosti.filter((x) => x.druh === "prujezd")).toHaveLength(4);
    expect(udalosti.filter((x) => x.druh !== "prujezd")).toEqual([]);
  });

  it("začátek ohlásí účastníky a očekávanou délku", () => {
    const zacatek = zpravy[0]!;
    if (zacatek.typ !== "zacatek") throw new Error("chybí začátek");
    expect(zacatek.ucastnici.map((x) => x.druh)).toEqual(["chodec", "chodec", "auto", "cyklista"]);
    expect(zacatek.ucastnici[0]).toMatchObject({ smer: -1, kadence: 2 });
    expect(zacatek.ucastnici[2]!.kola).toHaveLength(2);
    expect(zacatek.ucastnici[2]!.karoserie).toHaveLength(2);
    // Chodci jdou 12 m rychlostí 1,5 m/s; děj trvá kolem deseti sekund.
    expect(zacatek.trvani).toBeGreaterThan(9);
    expect(zacatek.trvani).toBeLessThan(15);
    expect(Math.abs(vysledek.trvani - zacatek.trvani)).toBeLessThan(0.5);
  });

  it("záznam pokrývá celý děj a ukazuje stav každého účastníka", () => {
    expect(zaznam.topologie).toHaveLength(1);
    expect(zaznam.konec).toBeGreaterThan(vysledek.trvani - 0.05);
    expect(zaznam.snimky.length).toBeGreaterThan(vysledek.trvani * 55);
    const stavyAuta = new Set(zaznam.snimky.map((s) => s.provoz[2]));
    expect(stavyAuta.has(JEDE)).toBe(true);
    expect(zaznam.snimky.at(-1)!.provoz.every((stav) => stav === PREJEL)).toBe(true);
    for (const snimek of zaznam.snimky) expect(snimek.polohy.every(Number.isFinite)).toBe(true);
  });

  it("obálka má položku pro každý prut a největší využití je malé", () => {
    expect(vysledek.obalka).toHaveLength(prihrada().pruty.length);
    expect(vysledek.nejvetsiVyuziti).toBeGreaterThan(0.005);
    expect(vysledek.nejvetsiVyuziti).toBeLessThan(0.5);
    expect(Math.max(...vysledek.obalka.map((o) => o.vyuziti))).toBe(vysledek.nejvetsiVyuziti);
    // Mostovka je nejvíc namáhaná, když po ní jede auto, tedy během zkoušky, ne na začátku.
    expect(vysledek.obalka[1]!.cas).toBeGreaterThan(0.5);
  });

  it("medaile: průchod, rozpočet podle ceny, mistrovská podle rezervy únosnosti", () => {
    expect(vysledek.cena).toBe(cenaNavrhu(prihrada()));
    expect(vysledek.cena).toBeLessThan(70_000);
    expect(vysledek.medaile).toEqual({ pruchod: true, rozpocet: true, mistrovska: true });
    const prisna = uroven([AUTO], { inzenyrskyRozpocet: 20_000, mistrovska: { druh: "rezerva", limit: 0.001 } });
    expect(zkousej(prisna, prihrada()).vysledek.medaile).toEqual({ pruchod: true, rozpocet: false, mistrovska: false });
    const bezMedaili = uroven([AUTO]);
    expect(zkousej(bezMedaili, prihrada()).vysledek.medaile).toEqual({ pruchod: true, rozpocet: false, mistrovska: false });
  });
});

describe("most bez ztužení", () => {
  const { udalosti, zaznam, vysledek } = zkousej(uroven([AUTO, CHODEC]), jenMostovka());

  it("nemá klidovou polohu, zřítí se a všichni spadnou", () => {
    expect(vysledek.bezRovnovahy).toBe(true);
    expect(vysledek).toMatchObject({ pruchod: false, prejelo: 0, spadlo: 3, rozpad: false });
    expect(vysledek.medaile).toEqual({ pruchod: false, rozpocet: false, mistrovska: false });
    expect(udalosti.filter((x) => x.druh === "pad")).toHaveLength(3);
    expect(zaznam.snimky.at(-1)!.provoz.every((stav) => stav === SPADL)).toBe(true);
  });

  it("konec mostu sjede z posuvné podpory a záznam to ohlásí i s novou stavbou", () => {
    const sjeti = udalosti.filter((x) => x.druh === "sjeti");
    expect(sjeti).toHaveLength(1);
    // Posuvná podpora je na pravém břehu; styčník v ní je poslední z mostovky.
    expect(jenMostovka().stycniky[sjeti[0]!.druh === "sjeti" ? sjeti[0]!.stycnik : -1]).toMatchObject({ x: 12, y: 0 });
    expect(sjeti[0]!.cas).toBeLessThan(2);
    // Před sjetím stavba podporu má, po něm už ne.
    expect(zaznam.topologie.length).toBeGreaterThanOrEqual(2);
    const stycnik = sjeti[0]!.druh === "sjeti" ? sjeti[0]!.stycnik : -1;
    expect(zaznam.topologie[0]!.podpory[stycnik]).toBe(2);
    expect(zaznam.topologie.at(-1)!.podpory[stycnik]).toBe(0);
  });

  it("stavba v záznamu říká, ke kterému prutu návrhu každý prvek patří", () => {
    const stavba = zaznam.topologie[0]!;
    expect(stavba.prut).toHaveLength(stavba.prvekA.length);
    const pruty = new Set([...stavba.prut].filter((p) => p >= 0));
    expect([...pruty].sort()).toEqual([0, 1, 2]);
    // Pérování vozidla a chodců k žádnému prutu nepatří.
    expect([...stavba.prut].some((p) => p < 0)).toBe(true);
  });

  it("děj neskončí, dokud ti, kdo spadli, nedopadnou na dno údolí", () => {
    // Údolí regresní úrovně je dvacet metrů hluboké: pád trvá dvě sekundy, déle než doběh.
    const u = uroven([AUTO, CHODEC]);
    const zkouska = new Zkouska(u, jenMostovka(), 7);
    while (!zkouska.hotovo) zkouska.pokracuj(0.5);
    const s = zkouska.simulace.soustava;
    expect(zkouska.provoz.spadliDopadli(s)).toBe(true);
    const posledniPad = Math.max(...udalosti.filter((x) => x.druh === "pad").map((x) => x.cas));
    expect(vysledek.trvani).toBeGreaterThan(posledniPad + 2);
    for (const ucastnik of zkouska.ucastnici) {
      for (const i of ucastnik.kola) expect(s.y[i]!).toBeLessThan(-18);
    }
  });

  it("trosky a spadlí účastníci skončí na dně údolí, ne v nekonečnu", () => {
    const posledni = zaznam.snimky.at(-1)!;
    for (let i = 1; i < posledni.polohy.length; i += 2) {
      expect(posledni.polohy[i]!).toBeGreaterThan(-21.5); // dno údolí regresní úrovně je v −20 m
      expect(posledni.polohy[i]!).toBeLessThan(2);
    }
  });
});

describe("zkouška bez provozu", () => {
  it("most, který pod vlastní tíhou stojí, projde; most bez ztužení ne", () => {
    const stoji = zkousej(uroven([]), prihrada()).vysledek;
    expect(stoji).toMatchObject({ pruchod: true, ucastniku: 0, poruseni: 0 });
    expect(stoji.trvani).toBeCloseTo(3, 1);
    expect(zkousej(uroven([]), jenMostovka()).vysledek.pruchod).toBe(false);
  });

  it("trasa bez mostovky: účastníci spadnou hned za břehem", () => {
    const k = new Kreslic();
    k.prut("drevo-lehke", [0, 0], [4, 3]);
    const { vysledek } = zkousej(uroven([CYKLISTA]), k.navrh());
    expect(vysledek).toMatchObject({ pruchod: false, spadlo: 1 });
  });
});

describe("opakovatelnost", () => {
  const u = uroven([CHODEC, AUTO, CYKLISTA]);

  it("stejný vstup dá stejný otisk, jiná násada náhody jiný", () => {
    const prvni = zkousej(u, prihrada(), 7).vysledek;
    expect(zkousej(u, prihrada(), 7).vysledek.otisk).toBe(prvni.otisk);
    // Násada mění fázi kroku chodců.
    expect(zkousej(u, prihrada(), 8).vysledek.otisk).not.toBe(prvni.otisk);
  });

  it("most uložený do textu a načtený zpět dá shodný otisk", () => {
    const puvodni = prihrada();
    const nacteny = navrhZTextu(navrhNaText(puvodni));
    expect(zkousej(u, nacteny).vysledek.otisk).toBe(zkousej(u, puvodni).vysledek.otisk);
  });

  it("výsledek nezávisí na tom, po jak velkých dávkách se počítá", () => {
    const poKouskach = new Zkouska(u, prihrada(), 7);
    while (!poKouskach.hotovo) poKouskach.pokracuj(0.07);
    const naraz = new Zkouska(u, prihrada(), 7);
    while (!naraz.hotovo) naraz.pokracuj(100);
    expect(poKouskach.vysledek().otisk).toBe(naraz.vysledek().otisk);
  });
});
