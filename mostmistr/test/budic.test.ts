// Budič: harmonická síla, která se plynule přelaďuje a hledá, kde most rezonuje.
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { nastavLadenyTlumic } from "../src/editor/upravy";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { BehZkousky } from "../src/zkouska/beh";
import { frekvenceBudice, jeStaly, vyhodnotBudic } from "../src/zkouska/budic";
import type { BudicZkousky, VysledekZkousky, ZpravaZeZkousky } from "../src/zkouska/protokol";
import { KROK_KRIVKY, KRIVKA_OD, rozeberMost } from "../src/zkouska/rozbor";
import { Zaznam } from "../src/zkouska/zaznam";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const uroven: Uroven = { ...nactiKampan().find((u) => u.id === "2-03")!, nejvetsiTlumic: 1000, rezonancniKrivka: true, budic: true };
const lavka = RESENI["2-03"]!.pady.find((p) => p.nazev === "nízká příhrada bez závaží")!.navrh;
const stred = lavka.stycniky.findIndex((s) => s.x === 16 && s.y === 0);
const budic: BudicZkousky = { stycnik: stred, sila: 2000, od: 0.5, do: 6, trvani: 80 };

function zkousej(navrh: NavrhMostu, b: BudicZkousky = budic): { vysledek: VysledekZkousky; zaznam: Zaznam } {
  const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven), undefined, b);
  const zaznam = new Zaznam();
  let pojistka = 0;
  while (!zkouska.hotovo) {
    const davka = zkouska.pokracuj(1);
    for (const stavba of davka.topologie) zaznam.pridejTopologii(stavba);
    for (const snimek of davka.snimky) zaznam.pridej(snimek);
    expect(pojistka++).toBeLessThan(200);
  }
  return { vysledek: zkouska.vysledek(), zaznam };
}

describe("rytmus budiče", () => {
  it("při přelaďování roste polovinu doby a druhou polovinu se vrací; stálý rytmus se nemění", () => {
    expect(jeStaly(budic)).toBe(false);
    expect(frekvenceBudice(budic, 0)).toBe(0.5);
    expect(frekvenceBudice(budic, 20)).toBeCloseTo(3.25, 9);
    expect(frekvenceBudice(budic, 40)).toBeCloseTo(6, 9);
    expect(frekvenceBudice(budic, 60)).toBeCloseTo(3.25, 9);
    expect(frekvenceBudice(budic, 80)).toBeCloseTo(0.5, 9);
    expect(frekvenceBudice(budic, 500)).toBeCloseTo(0.5, 9);
    const staly = { ...budic, od: 2.4, do: 2.4, trvani: 14 };
    expect(jeStaly(staly)).toBe(true);
    for (const cas of [0, 3, 14, 99]) expect(frekvenceBudice(staly, cas)).toBe(2.4);
  });

  it("vyhodnocení: průměr špiček z cesty nahoru a dolů; různé rezonance nemíchá", () => {
    const body = [
      { f: 1, a: 0.1 },
      { f: 2, a: 0.2 },
      { f: 3, a: 2 },
      { f: 4, a: 0.3 },
      { f: 3, a: 0.2 },
      { f: 2.4, a: 1.8 },
      { f: 1, a: 0.1 },
    ];
    expect(vyhodnotBudic(budic, body)).toEqual({ frekvence: 2.7, zrychleni: 2 });
    // Cesta dolů našla něco úplně jinde: platí silnější špička.
    const jinde = body.map((bod) => (bod.f === 2.4 ? { f: 1.2, a: 1.8 } : bod));
    expect(vyhodnotBudic(budic, jinde).frekvence).toBe(3);
    expect(vyhodnotBudic(budic, [])).toEqual({ frekvence: null, zrychleni: 0 });
    expect(vyhodnotBudic({ ...budic, od: 2, do: 2 }, [{ f: 2, a: 0.4 }, { f: 2, a: 0.9 }])).toEqual({ frekvence: 2, zrychleni: 0.9 });
  });
});

describe("pokus s budičem", () => {
  const { vysledek, zaznam } = zkousej(lavka);
  const rozbor = rozeberMost(uroven, lavka);

  it("je pokus, ne zkouška: provoz nejede, medaile se neudělují a komfort se nehodnotí", () => {
    expect(vysledek.ucastniku).toBe(0);
    expect(vysledek.medaile).toEqual({ pruchod: false, rozpocet: false, mistrovska: false });
    expect(vysledek.komfort).toBeNull();
    expect(vysledek.brnknuti).toBeNull();
    expect(vysledek.budic).not.toBeNull();
    expect(vysledek.poruseni).toBe(0);
    expect(vysledek.trvani).toBeCloseTo(81, 1);
  });

  it("najde rezonanci na první vlastní frekvenci mostu", () => {
    const b = vysledek.budic!;
    // Při přelaďování se odezva mostu za budičem zpožďuje: cestou nahoru vyjde špička
    // výš, než kde rezonance je, cestou dolů níž. Průměr obou ji trefí na desetinu hertzu.
    expect(Math.abs(b.frekvence! - rozbor.frekvence[0]!)).toBeLessThan(0.1);
    expect(b.zrychleni).toBeGreaterThan(0.5);
    const zlom = b.krivka.findIndex((bod, i) => i > 0 && bod.f < b.krivka[i - 1]!.f);
    const vrchol = (body: typeof b.krivka) => body.reduce((x, y) => (y.a > x.a ? y : x));
    const nahoru = vrchol(b.krivka.slice(0, zlom));
    const dolu = vrchol(b.krivka.slice(zlom));
    expect(nahoru.f).toBeGreaterThan(rozbor.frekvence[0]! + 0.15);
    expect(dolu.f).toBeLessThan(rozbor.frekvence[0]! - 0.15);
  });

  it("změřená křivka pokrývá celý rozsah a řádově odpovídá spočítané", () => {
    const b = vysledek.budic!;
    expect(b.krivka.length).toBeGreaterThan(700);
    // Tam a zpět: začíná i končí na dolním okraji rozsahu a uprostřed je na horním.
    expect(b.krivka[0]!.f).toBeCloseTo(0.5, 1);
    expect(b.krivka.at(-1)!.f).toBeCloseTo(0.5, 1);
    expect(Math.max(...b.krivka.map((bod) => bod.f))).toBeCloseTo(6, 1);
    for (const bod of b.krivka) expect(Number.isFinite(bod.a) && bod.a >= 0).toBe(true);
    const spocitana = rozbor.krivka!.prazdny;
    const spocitanyVrchol = Math.max(...spocitana.slice(0, Math.round((4 - KRIVKA_OD) / KROK_KRIVKY)));
    // Rychlé přelaďování špičku sníží, ale ne řádově.
    expect(b.zrychleni).toBeLessThan(1.2 * spocitanyVrchol);
    expect(b.zrychleni).toBeGreaterThan(0.15 * spocitanyVrchol);
    // Daleko od rezonance je odezva mnohem menší než na ní. Platí to cestou nahoru; cestou
    // dolů most po průchodu rezonancí ještě dlouho doznívá.
    const zlom = b.krivka.findIndex((bod, i) => i > 0 && bod.f < b.krivka[i - 1]!.f);
    const mimo = b.krivka.slice(0, zlom).filter((bod) => bod.f > 1 && bod.f < 1.6).map((bod) => bod.a);
    expect(Math.max(...mimo)).toBeLessThan(0.1 * b.zrychleni);
  });

  it("záznam nese okamžité kmitání a šipku síly budiče", () => {
    const sSilou = zaznam.snimky.filter((s) => s.sily.length === 4);
    expect(sSilou.length).toBeGreaterThan(4000);
    for (const snimek of sSilou.slice(0, 500)) {
      expect(snimek.sily[0]).toBeCloseTo(16, 1);
      expect(snimek.sily[2]).toBe(0);
      expect(Math.abs(snimek.sily[3]!)).toBeLessThanOrEqual(2000 + 1e-3);
    }
    expect(Math.max(...sSilou.map((s) => Math.abs(s.sily[3]!)))).toBeGreaterThan(1900);
    expect(Math.max(...zaznam.snimky.map((s) => s.kmitani))).toBeGreaterThan(1);
    // Po dojetí budiče na konec rozsahu síla zmizí.
    expect(zaznam.snimky.at(-1)!.sily).toHaveLength(0);
  });

  it("ve stálém rytmu na vlastní frekvenci rozkmitá most naplno, o půl hertzu vedle skoro vůbec", () => {
    const f0 = rozbor.frekvence[0]!;
    const stale = (f: number) => zkousej(lavka, { ...budic, od: f, do: f, trvani: 14 }).vysledek.budic!;
    const naRezonanci = stale(f0);
    expect(naRezonanci.krivka).toHaveLength(1);
    expect(naRezonanci.frekvence).toBeCloseTo(f0, 9);
    // Ustálená odezva odpovídá spočítané rezonanční křivce.
    const spocitana = rozbor.krivka!.prazdny[Math.round((f0 - KRIVKA_OD) / KROK_KRIVKY)]!;
    expect(naRezonanci.zrychleni).toBeGreaterThan(0.6 * spocitana);
    expect(naRezonanci.zrychleni).toBeLessThan(1.4 * spocitana);
    // Stálý rytmus rozkmitá most víc než přelaďování, které se u rezonance jen mihne.
    expect(naRezonanci.zrychleni).toBeGreaterThan(vysledek.budic!.zrychleni);
    for (const vedle of [f0 - 0.5, f0 + 0.5]) expect(stale(vedle).zrychleni).toBeLessThan(0.2 * naRezonanci.zrychleni);
  }, 120_000);

  it("s laděným tlumičem je rezonance mnohem slabší", () => {
    const sTlumicem = nastavLadenyTlumic(lavka, new Set([lavka.stycniky[stred]!.id]), () => ({ hmota: 600, frekvence: 2.6 }));
    const tlumeny = zkousej(sTlumicem).vysledek.budic!;
    expect(tlumeny.zrychleni).toBeLessThan(0.5 * vysledek.budic!.zrychleni);
  }, 120_000);

  it("stejný pokus dá stejný výsledek a jde spustit zprávou", () => {
    const zpravy: ZpravaZeZkousky[] = [];
    const beh = new BehZkousky((zprava) => zpravy.push(zprava));
    beh.prijmi({ typ: "start", vstup: { uroven, navrh: lavka, nasada: nasadaUrovne(uroven), verzeFyziky: VERZE_FYZIKY, budic } });
    let pojistka = 0;
    while (beh.pokracuj(2)) expect(pojistka++).toBeLessThan(100);
    const konec = zpravy.at(-1)!;
    expect(konec.typ).toBe("konec");
    if (konec.typ === "konec") {
      expect(konec.vysledek.otisk).toBe(vysledek.otisk);
      expect(konec.vysledek.budic!.frekvence).toBe(vysledek.budic!.frekvence);
    }
  }, 120_000);

  it("pokus jde pustit i na mostě dražším než rozpočet; zkouška s provozem ne", () => {
    const chuda: Uroven = { ...uroven, rozpocet: 1000, inzenyrskyRozpocet: null };
    const prvniOdpoved = (vstup: { budic?: BudicZkousky; brnknuti?: { stycnik: number; sila: number } }): ZpravaZeZkousky => {
      const zpravy: ZpravaZeZkousky[] = [];
      const beh = new BehZkousky((zprava) => zpravy.push(zprava));
      beh.prijmi({ typ: "start", vstup: { uroven: chuda, navrh: lavka, nasada: 1, verzeFyziky: VERZE_FYZIKY, ...vstup } });
      return zpravy[0]!;
    };
    expect(prvniOdpoved({})).toMatchObject({ typ: "chyba", kod: "neplatny-vstup", podrobnosti: "nad-rozpocet" });
    expect(prvniOdpoved({ budic }).typ).toBe("zacatek");
    expect(prvniOdpoved({ brnknuti: { stycnik: stred, sila: 3000 } }).typ).toBe("zacatek");
  });

  it("budič ve styčníku, který v návrhu není, nedělá nic a zkouška proběhne jako bez provozu", () => {
    const { vysledek: bez } = zkousej(lavka, { ...budic, stycnik: 999 });
    expect(bez.budic).toBeNull();
    expect(bez.trvani).toBeLessThan(5);
  });
});
