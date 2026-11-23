// Laděný tlumič: závaží na pružině s tlumičem zavěšené pod styčníkem.
import { describe, expect, it } from "vitest";
import { cenaLadenehoTlumice, cenaNavrhu, hmotnostNavrhu } from "../src/data/cena";
import { LADENY_TLUMIC } from "../src/data/katalog";
import { nactiNavrh, navrhNaText, navrhZTextu, VERZE_NAVRHU, zkontrolujNavrh, type NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { Editor } from "../src/editor/editor";
import { nastavLadenyTlumic } from "../src/editor/upravy";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { najdiRovnovahu } from "../src/jadro/matice";
import { PRUZINA, sestavSoustavu } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import { frekvenceKrivky, KRIVKA_DO, KRIVKA_OD, KROK_KRIVKY, rozeberMost } from "../src/zkouska/rozbor";
import { sestavMost } from "../src/zkouska/stavba";
import { STYCNIK_ZAVAZI, Zaznam } from "../src/zkouska/zaznam";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

/** Úroveň 2-03 (útvar pochodem 2,3 Hz přes lávku 32 m), ve které je laděný tlumič dovolený. */
const uroven: Uroven = { ...nactiKampan().find((u) => u.id === "2-03")!, nejvetsiTlumic: 1000 };
/** Nízká příhrada, kterou útvar rozhoupe přes mez. */
const lavka = RESENI["2-03"]!.pady.find((p) => p.nazev === "nízká příhrada bez závaží")!.navrh;
const stred = lavka.stycniky.find((s) => s.x === 16 && s.y === 0)!;
const indexStredu = lavka.stycniky.indexOf(stred);

function sTlumicem(hmota: number, frekvence: number, navrh = lavka): NavrhMostu {
  return nastavLadenyTlumic(navrh, new Set([stred.id]), () => ({ hmota, frekvence }));
}

function zkousej(u: Uroven, navrh: NavrhMostu) {
  const zkouska = new Zkouska(u, navrh, nasadaUrovne(u));
  const zaznam = new Zaznam();
  let pojistka = 0;
  while (!zkouska.hotovo) {
    const davka = zkouska.pokracuj(1);
    for (const stavba of davka.topologie) zaznam.pridejTopologii(stavba);
    for (const snimek of davka.snimky) zaznam.pridej(snimek);
    expect(pojistka++).toBeLessThan(300);
  }
  return { zkouska, zaznam, vysledek: zkouska.vysledek() };
}

describe("formát návrhu", () => {
  it("návrhy verze 1 a 2 se převedou beze změny; od verze 2 návrh nese laděný tlumič", () => {
    expect(VERZE_NAVRHU).toBeGreaterThanOrEqual(3);
    const stary = { ...JSON.parse(navrhNaText(lavka)), verze: 1 };
    expect(nactiNavrh(stary)).toEqual(lavka);
    const starsi = { ...JSON.parse(navrhNaText(sTlumicem(600, 2.3))), verze: 2 };
    expect(nactiNavrh(starsi)).toEqual(sTlumicem(600, 2.3));
    const novy = sTlumicem(600, 2.3);
    const zpet = navrhZTextu(navrhNaText(novy));
    expect(zpet).toEqual(novy);
    expect(zpet.stycniky[indexStredu]!.tlumic).toEqual({ hmota: 600, frekvence: 2.3 });
  });

  it("neúplný nebo přebytečný údaj o tlumiči neprojde", () => {
    const data = JSON.parse(navrhNaText(sTlumicem(600, 2.3)));
    delete data.stycniky[indexStredu].tlumic.frekvence;
    expect(() => nactiNavrh(data)).toThrow();
    data.stycniky[indexStredu].tlumic = { hmota: 600, frekvence: 2.3, barva: "modrá" };
    expect(() => nactiNavrh(data)).toThrow();
  });
});

describe("pravidla a cena", () => {
  it("úroveň, která laděný tlumič nedovoluje, ho odmítne; těžší než dovolený taky", () => {
    const bez = { ...uroven, nejvetsiTlumic: 0 };
    expect(zkontrolujNavrh(sTlumicem(600, 2.3), bez).map((p) => p.druh)).toContain("ladeny-tlumic-nepovoleny");
    expect(zkontrolujNavrh(sTlumicem(600, 2.3), uroven)).toEqual([]);
    expect(zkontrolujNavrh(sTlumicem(1050, 2.3), uroven).map((p) => p.druh)).toEqual(["ladeny-tlumic-nepovoleny"]);
  });

  it("tlumič mimo vyrobitelný rozsah neprojde", () => {
    for (const [hmota, frekvence] of [
      [20, 2.3],
      [600, 0.5],
      [600, 7],
    ] as const) {
      const problemy = zkontrolujNavrh(sTlumicem(hmota, frekvence), uroven);
      expect(problemy).toEqual([{ druh: "ladeny-tlumic-mimo-rozsah", stycnik: stred.id }]);
    }
  });

  it("stojí paušál a korunu za každý kilogram a počítá se do hmotnosti mostu", () => {
    expect(cenaLadenehoTlumice(600)).toBe(LADENY_TLUMIC.cenaZaKus + 600 * LADENY_TLUMIC.cenaZaKg);
    expect(cenaNavrhu(sTlumicem(600, 2.3)) - cenaNavrhu(lavka)).toBe(cenaLadenehoTlumice(600));
    expect(hmotnostNavrhu(sTlumicem(600, 2.3), uroven) - hmotnostNavrhu(lavka, uroven)).toBeCloseTo(600, 9);
  });
});

describe("stavba mostu s laděným tlumičem", () => {
  const stavba = sestavMost(uroven, sTlumicem(600, 2.3));
  const bez = sestavMost(uroven, lavka);

  it("přidá závaží metr pod styčníkem a pružinu s tlumičem, která ho nese", () => {
    expect(stavba.tlumice).toHaveLength(1);
    expect(bez.tlumice).toEqual([]);
    const { stycnik, zavazi, prvek } = stavba.tlumice[0]!;
    expect(stycnik).toBe(indexStredu);
    expect(stavba.popis.stycniky).toHaveLength(bez.popis.stycniky.length + 1);
    expect(stavba.popis.stycniky[zavazi]).toMatchObject({ x: 16, y: -LADENY_TLUMIC.zaves, hmota: 600, pevneX: true });
    const pruzina = stavba.popis.prvky[prvek]!;
    expect(pruzina).toMatchObject({ a: indexStredu, b: zavazi, druh: PRUZINA, prut: -1 });
    // Tuhost a tlumič podle zadané frekvence: f = √(k/m)/2π, c = 2·ζ·m·ω.
    const omega = 2 * Math.PI * 2.3;
    expect(pruzina.tuhost).toBeCloseTo(600 * omega * omega, 3);
    expect(pruzina.tlumic).toBeCloseTo(2 * LADENY_TLUMIC.utlum * 600 * omega, 6);
    expect(Math.sqrt(pruzina.tuhost! / 600) / (2 * Math.PI)).toBeCloseTo(2.3, 9);
  });

  it("v klidu visí závaží přesně o délku závěsu pod styčníkem, ať je naladěné jakkoli", () => {
    for (const frekvence of [0.8, 2.3, 6]) {
      const s = sestavSoustavu(sestavMost(uroven, sTlumicem(600, frekvence)).popis);
      const stupne = volneStupne(s);
      expect(najdiRovnovahu(s, stupne, new Float64Array(stupne.length), TIHOVE_ZRYCHLENI)).toBeGreaterThanOrEqual(0);
      const zavazi = s.pocetStycniku - 1;
      expect(s.hmota[zavazi]).toBe(600);
      expect(s.y[indexStredu]! - s.y[zavazi]!).toBeCloseTo(LADENY_TLUMIC.zaves, 4);
      expect(s.x[zavazi]).toBe(16);
    }
  });
});

describe("vlastní frekvence", () => {
  it("laděný tlumič rozdělí první vlastní frekvenci mostu na dvě: jednu pod ní a jednu nad ní", () => {
    const bez = rozeberMost(uroven, lavka);
    const s = rozeberMost(uroven, sTlumicem(600, 2.3));
    expect(s.stabilni).toBe(true);
    expect(s.frekvence[0]!).toBeLessThan(2.3);
    expect(s.frekvence[1]!).toBeGreaterThan(bez.frekvence[0]!);
    expect(s.frekvence[1]!).toBeLessThan(bez.frekvence[1]!);
    // Vyšší tvary kmitání tlumič uprostřed skoro neovlivní.
    expect(s.frekvence[2]!).toBeCloseTo(bez.frekvence[1]!, 1);
    // Těžší závaží roztáhne obě frekvence dál od sebe.
    const tezsi = rozeberMost(uroven, sTlumicem(1000, 2.3));
    expect(tezsi.frekvence[1]! - tezsi.frekvence[0]!).toBeGreaterThan(s.frekvence[1]! - s.frekvence[0]!);
  });
});

describe("rezonanční křivka mostu", () => {
  // Kritérium milníku M3b: laděný tlumič rozdělí rezonanční špičku.
  const sKrivkou: Uroven = { ...uroven, rezonancniKrivka: true };
  const frekvence = frekvenceKrivky();

  /** Vrcholy křivky v pásmu kolem první vlastní frekvence, od nejnižší frekvence. */
  function vrcholy(krivka: number[], od: number, po: number): { f: number; hodnota: number }[] {
    const nalezene: { f: number; hodnota: number }[] = [];
    for (let i = 1; i + 1 < krivka.length; i++) {
      const f = frekvence[i]!;
      if (f < od || f > po) continue;
      if (krivka[i]! > krivka[i - 1]! && krivka[i]! >= krivka[i + 1]!) nalezene.push({ f, hodnota: krivka[i]! });
    }
    return nalezene;
  }

  it("úroveň bez křivky ji nepočítá; s křivkou ji vrátí pro prázdný i obsazený most", () => {
    expect(rozeberMost(uroven, lavka).krivka).toBeNull();
    const rozbor = rozeberMost(sKrivkou, lavka);
    const krivka = rozbor.krivka!;
    expect(krivka.od).toBe(KRIVKA_OD);
    expect(krivka.krok).toBe(KROK_KRIVKY);
    expect(krivka.prazdny).toHaveLength(frekvence.length);
    expect(krivka.obsazeny).toHaveLength(frekvence.length);
    expect(frekvence.at(-1)).toBeCloseTo(KRIVKA_DO, 9);
    for (const hodnota of [...krivka.prazdny, ...krivka.obsazeny!]) {
      expect(Number.isFinite(hodnota)).toBe(true);
      expect(hodnota).toBeGreaterThan(0);
    }
  });

  it("má špičku na první vlastní frekvenci; s lidmi je špička níž a je nižší", () => {
    const rozbor = rozeberMost(sKrivkou, lavka);
    const prazdny = vrcholy(rozbor.krivka!.prazdny, 1.5, 4)[0]!;
    const obsazeny = vrcholy(rozbor.krivka!.obsazeny!, 1.5, 4)[0]!;
    expect(Math.abs(prazdny.f - rozbor.frekvence[0]!)).toBeLessThanOrEqual(KROK_KRIVKY);
    expect(Math.abs(obsazeny.f - rozbor.frekvenceObsazeneho[0]!)).toBeLessThanOrEqual(KROK_KRIVKY);
    expect(obsazeny.f).toBeLessThan(prazdny.f);
    // Těžší most se stejnou silou rozhoupe hůř.
    expect(obsazeny.hodnota).toBeLessThan(prazdny.hodnota);
  });

  it("laděný tlumič rozdělí rezonanční špičku na dvě mnohem nižší", () => {
    const bez = rozeberMost(sKrivkou, lavka);
    // Prázdný most: tlumič naladěný na jeho vlastní frekvenci, závaží kolem pěti procent kmitající hmoty.
    const f0 = bez.frekvence[0]!;
    const puvodni = vrcholy(bez.krivka!.prazdny, 1.5, 4);
    expect(puvodni).toHaveLength(1);
    const s = rozeberMost(sKrivkou, sTlumicem(600, Math.round(f0 * 20) / 20));
    const rozdelene = vrcholy(s.krivka!.prazdny, 1.5, 4);
    expect(rozdelene).toHaveLength(2);
    expect(rozdelene[0]!.f).toBeLessThan(puvodni[0]!.f);
    expect(rozdelene[1]!.f).toBeGreaterThan(puvodni[0]!.f);
    for (const vrchol of rozdelene) expect(vrchol.hodnota).toBeLessThan(0.4 * puvodni[0]!.hodnota);
    // Kde byla špička, je teď mezi oběma novými sedlo.
    const naPuvodni = s.krivka!.prazdny[Math.round((puvodni[0]!.f - KRIVKA_OD) / KROK_KRIVKY)]!;
    expect(naPuvodni).toBeLessThan(0.2 * puvodni[0]!.hodnota);
    // S lidmi je špička už bez tlumiče nižší (těla tlumí); tlumič naladěný na most s lidmi ji srazí dál.
    const sLidmi = Math.max(...bez.krivka!.obsazeny!.slice(40, 140));
    expect(sLidmi).toBeLessThan(puvodni[0]!.hodnota);
    const naladeny = rozeberMost(sKrivkou, sTlumicem(600, Math.round(bez.frekvenceObsazeneho[0]! * 20) / 20));
    expect(Math.max(...naladeny.krivka!.obsazeny!.slice(40, 140))).toBeLessThan(0.9 * sLidmi);
  });

  it("viskózní tlumiče do kotev špičku sníží, ale nerozdělí", () => {
    const prehlidka: Uroven = { ...nactiKampan().find((u) => u.id === "2-04")!, rezonancniKrivka: true };
    const reseni = RESENI["2-04"]!;
    const bez = rozeberMost(prehlidka, reseni.pady.find((p) => p.nazev === "nízká příhrada bez tlumičů")!.navrh);
    const s = rozeberMost(prehlidka, reseni.mistrovska);
    // Prázdný most: tlumiče jeho špičku srazí pod polovinu a žádnou druhou nepřidají.
    const vrcholBez = Math.max(...vrcholy(bez.krivka!.prazdny, 1.5, 4).map((v) => v.hodnota));
    expect(vrcholy(s.krivka!.prazdny, 1.5, 4).length).toBeLessThanOrEqual(1);
    expect(Math.max(...s.krivka!.prazdny.slice(40, 140))).toBeLessThan(0.5 * vrcholBez);
    // S lidmi (ti tlumí taky, a hodně) je rozdíl menší, ale je.
    const sLidmiBez = Math.max(...bez.krivka!.obsazeny!.slice(40, 140));
    expect(Math.max(...s.krivka!.obsazeny!.slice(40, 140))).toBeLessThan(0.9 * sLidmiBez);
  });

  it("tvary kmitání: první je půlvlna s největší výchylkou uprostřed, druhý má uprostřed uzel", () => {
    const rozbor = rozeberMost(sKrivkou, lavka);
    expect(rozbor.tvary).toHaveLength(rozbor.frekvence.length);
    for (const tvar of rozbor.tvary) {
      expect(tvar).toHaveLength(2 * lavka.stycniky.length);
      const nejvetsi = Math.max(...lavka.stycniky.map((_, i) => Math.hypot(tvar[2 * i]!, tvar[2 * i + 1]!)));
      expect(nejvetsi).toBeCloseTo(1, 9);
    }
    const svisle = (tvar: number[], x: number): number => tvar[2 * lavka.stycniky.findIndex((st) => st.x === x && st.y === 0) + 1]!;
    const prvni = rozbor.tvary[0]!;
    // Největší svislá výchylka míří dolů a je uprostřed; konce v podporách stojí.
    expect(svisle(prvni, 16)).toBeLessThan(-0.9);
    expect(Math.abs(svisle(prvni, 0))).toBeLessThan(1e-9);
    expect(Math.abs(svisle(prvni, 32))).toBeLessThan(1e-9);
    expect(Math.abs(svisle(prvni, 8))).toBeLessThan(Math.abs(svisle(prvni, 16)));
    const druhy = rozbor.tvary[1]!;
    expect(Math.abs(svisle(druhy, 16))).toBeLessThan(0.2);
    expect(svisle(druhy, 8) * svisle(druhy, 24)).toBeLessThan(0);
  });
});

describe("zkouška s laděným tlumičem", () => {
  const bez = zkousej(uroven, lavka);
  const s = zkousej(uroven, sTlumicem(600, 2.3));

  it("lávka, kterou útvar rozhoupe přes mez, s naladěným tlumičem obstojí", () => {
    expect(bez.vysledek.pruchod).toBe(false);
    expect(bez.vysledek.komfort!.zrychleni).toBeGreaterThan(2.5);
    expect(s.vysledek.pruchod).toBe(true);
    expect(s.vysledek.komfort!.zrychleni).toBeLessThan(0.6 * bez.vysledek.komfort!.zrychleni);
    expect(s.vysledek.cena - bez.vysledek.cena).toBe(cenaLadenehoTlumice(600));
    // Tlumič výpočet nezpomalí: krok určuje most, ne měkká pružina.
    expect(s.vysledek.kroku).toBe(bez.vysledek.kroku);
  }, 120_000);

  it("špatně naladěný tlumič pomůže mnohem méně", () => {
    const mimo = zkousej(uroven, sTlumicem(600, 4.5));
    expect(mimo.vysledek.komfort!.zrychleni).toBeGreaterThan(1.5 * s.vysledek.komfort!.zrychleni);
    expect(mimo.vysledek.pruchod).toBe(false);
  }, 120_000);

  it("závaží se v záznamu kreslí jako závaží a kmitá proti mostu", () => {
    const stavba = s.zaznam.topologie[0]!;
    const zavazi = stavba.stycniku - 1 - s.zkouska.ucastnici.reduce((n, u) => n + u.kola.length + u.karoserie.length, 0);
    expect(stavba.znacky[zavazi]).toBe(STYCNIK_ZAVAZI);
    let nejvic = 0;
    let nejmin = Infinity;
    for (const snimek of s.zaznam.snimky) {
      const zaves = snimek.polohy[2 * indexStredu + 1]! - snimek.polohy[2 * zavazi + 1]!;
      nejvic = Math.max(nejvic, zaves);
      nejmin = Math.min(nejmin, zaves);
      // Vedení drží závaží ve svislici pod styčníkem.
      expect(snimek.polohy[2 * zavazi]).toBe(16);
    }
    // Závaží se proti mostu hýbe o centimetry: tím energii kmitání pohlcuje.
    expect(nejvic - nejmin).toBeGreaterThan(0.02);
    expect(nejvic - nejmin).toBeLessThan(0.6);
  });

  it("když most spadne, závaží tlumiče spadne s ním a neuletí", () => {
    // Samotná mostovka bez příhrady: mechanismus, který se zřítí.
    const jenMostovka = RESENI["2-03"]!.pady.find((p) => p.nazev === "jen mostovka")!.navrh;
    const uzel = jenMostovka.stycniky.find((st) => st.x === 16 && st.y === 0)!;
    const navrh = nastavLadenyTlumic(jenMostovka, new Set([uzel.id]), () => ({ hmota: 600, frekvence: 2.3 }));
    const { zaznam, vysledek, zkouska } = zkousej(uroven, navrh);
    expect(vysledek.pruchod).toBe(false);
    expect(vysledek.rozpad).toBe(false);
    const posledni = zaznam.snimky.at(-1)!;
    for (const hodnota of posledni.polohy) expect(Number.isFinite(hodnota)).toBe(true);
    const zavazi = sestavMost(uroven, navrh).tlumice[0]!.zavazi;
    const dno = Math.min(...uroven.teren.map((b) => b.y));
    expect(zkouska.simulace.soustava.y[zavazi]!).toBeLessThan(-2);
    expect(zkouska.simulace.soustava.y[zavazi]!).toBeGreaterThan(dno - 1.5);
  }, 120_000);
});

describe("editor", () => {
  function editor(navrh = lavka): Editor {
    return new Editor(uroven, navrh, () => undefined);
  }

  it("zavěsí tlumič pod vybraný styčník, znovu ho odebere a jde to vrátit", () => {
    const e = editor();
    expect(e.ladenyTlumicVyberu).toBeNull();
    expect(e.prepniLadenyTlumic(300, 2.31)).toBe(false);
    e.stiskni({ x: 16, y: 0 }, { bezKresleni: true });
    e.pust();
    expect(e.vybraneStycniky.has(stred.id)).toBe(true);
    expect(e.ladenyTlumicVyberu).toBeUndefined();
    expect(e.prepniLadenyTlumic(300, 2.31)).toBe(true);
    // Frekvence se zaokrouhlí na krok ladění.
    expect(e.ladenyTlumicVyberu).toEqual({ hmota: 300, frekvence: 2.3 });
    expect(e.prepniLadenyTlumic(300, 2.3)).toBe(true);
    expect(e.ladenyTlumicVyberu).toBeUndefined();
    e.zpet();
    expect(e.ladenyTlumicVyberu).toEqual({ hmota: 300, frekvence: 2.3 });
  });

  it("závaží se krokuje po padesáti kilogramech v mezích úrovně, frekvence po pěti setinách hertzu", () => {
    const e = editor(sTlumicem(950, 2.3));
    e.stiskni({ x: 16, y: 0 }, { bezKresleni: true });
    e.pust();
    expect(e.zmenHmotuTlumice(1)).toBe(true);
    expect(e.ladenyTlumicVyberu!.hmota).toBe(1000);
    expect(e.zmenHmotuTlumice(1)).toBe(false);
    for (let i = 0; i < 40; i++) e.zmenHmotuTlumice(-1);
    expect(e.ladenyTlumicVyberu!.hmota).toBe(LADENY_TLUMIC.nejmensiHmota);
    expect(e.zmenFrekvenciTlumice(1)).toBe(true);
    expect(e.ladenyTlumicVyberu!.frekvence).toBe(2.35);
    expect(e.zmenFrekvenciTlumice(-3)).toBe(true);
    expect(e.ladenyTlumicVyberu!.frekvence).toBe(2.2);
    for (let i = 0; i < 200; i++) e.zmenFrekvenciTlumice(-1);
    expect(e.ladenyTlumicVyberu!.frekvence).toBe(LADENY_TLUMIC.nejmensiFrekvence);
    for (let i = 0; i < 200; i++) e.zmenFrekvenciTlumice(1);
    expect(e.ladenyTlumicVyberu!.frekvence).toBe(LADENY_TLUMIC.nejvetsiFrekvence);
  });

  it("úroveň bez laděného tlumiče ho zavěsit nedovolí", () => {
    const e = new Editor({ ...uroven, nejvetsiTlumic: 0 }, lavka, () => undefined);
    e.stiskni({ x: 16, y: 0 }, { bezKresleni: true });
    e.pust();
    expect(e.prepniLadenyTlumic(300, 2.3)).toBe(false);
    expect(e.navrh).toBe(lavka);
  });

  it("zrcadlení přenese tlumič na druhou stranu mostu", () => {
    const vlevo = lavka.stycniky.find((st) => st.x === 8 && st.y === 0)!;
    const vpravo = lavka.stycniky.find((st) => st.x === 24 && st.y === 0)!;
    const e = editor(nastavLadenyTlumic(lavka, new Set([vlevo.id]), () => ({ hmota: 200, frekvence: 3 })));
    expect(e.zrcadli()).toBe(true);
    expect(e.navrh.stycniky.find((st) => st.id === vpravo.id)!.tlumic).toEqual({ hmota: 200, frekvence: 3 });
  });
});
