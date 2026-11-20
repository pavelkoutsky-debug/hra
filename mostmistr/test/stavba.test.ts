// Stavba výpočetní soustavy z návrhu mostu a úrovně.
import { describe, expect, it } from "vitest";
import { vlastnostiPrutu } from "../src/data/katalog";
import { zkontrolujNavrh } from "../src/data/navrh";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { najdiRovnovahu, vlastniTvarySoustavy } from "../src/jadro/matice";
import { LANO, NOSNIK, PRUZINA, sestavSoustavu } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import { utlumyTvaru } from "../src/jadro/tlumeni";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";
import { pocetDiluLana, pocetDiluNosniku, sestavMost } from "../src/zkouska/stavba";

const g = TIHOVE_ZRYCHLENI;

/** Dřevěná příhrada o šesti polích po 4 m s ocelovým horním pásem. */
function prihrada(svar = false): Kreslic {
  const k = new Kreslic();
  for (let x = 0; x < 24; x += 4) {
    k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    k.prut("ocel-lehka", [x, 4], [x + 4, 4]);
    k.prut("drevo-lehke", x < 12 ? [x, 4] : [x, 0], x < 12 ? [x + 4, 0] : [x + 4, 4]);
  }
  for (let x = 0; x <= 24; x += 4) k.prut("drevo-lehke", [x, 0], [x, 4]);
  if (svar) k.svarVse();
  return k;
}

describe("skryté dělení prutů", () => {
  it("krátký tuhý prut se nedělí, dlouhý podle počtu ohybových tvarů v pásmu do 30 Hz", () => {
    const ocel = vlastnostiPrutu("ocel-lehka", 4)!;
    // 2× HEB 200: první ohybová frekvence 4 m prutu je 43 Hz, 6 m prutu 19 Hz, 12 m prutu 4,8 Hz.
    expect(pocetDiluNosniku(4, ocel.EI, ocel.hmotnostNaMetr)).toBe(1);
    expect(pocetDiluNosniku(6, ocel.EI, ocel.hmotnostNaMetr)).toBe(2);
    // U 12 m prutu leží v pásmu dva tvary (4,8 a 19 Hz): čtyři díly.
    expect(pocetDiluNosniku(12, ocel.EI, ocel.hmotnostNaMetr)).toBe(4);
  });

  it("díl není nikdy kratší než metr", () => {
    // Velmi měkký prut by se podle frekvence dělil na desítky dílů.
    expect(pocetDiluNosniku(3, 1e3, 100)).toBe(3);
    expect(pocetDiluNosniku(1.9, 1e3, 100)).toBe(1);
    expect(pocetDiluNosniku(1, 1e3, 100)).toBe(1);
  });

  it("lano se dělí po dvou metrech, nejvýš na šestnáct dílů", () => {
    expect(pocetDiluLana(3)).toBe(1);
    expect(pocetDiluLana(9)).toBe(4);
    expect(pocetDiluLana(60)).toBe(16);
  });
});

describe("most sestavený z návrhu", () => {
  const uroven = urovenRegrese({ rozpeti: 24 });

  it("návrh z hotových prvků projde kontrolou a sestaví se", () => {
    const navrh = prihrada().navrh();
    // Kontrola návrhu hlídá pravidla úrovně; tady jde jen o to, že prvky jsou hotové.
    expect(zkontrolujNavrh(navrh, uroven).filter((p) => p.druh === "prvek-neni-hotovy")).toEqual([]);
    const stavba = sestavMost(uroven, navrh);
    expect(stavba.stycnikuNavrhu).toBe(navrh.stycniky.length);
    expect(() => sestavSoustavu(stavba.popis)).not.toThrow();
  });

  it("styčníky v kotvách jsou podepřené podle typu kotvy", () => {
    const k = prihrada();
    const stavba = sestavMost(uroven, k.navrh());
    const levy = stavba.popis.stycniky[k.bod(0, 0)]!;
    const pravy = stavba.popis.stycniky[k.bod(24, 0)]!;
    const volny = stavba.popis.stycniky[k.bod(12, 4)]!;
    expect(levy).toMatchObject({ pevneX: true, pevneY: true });
    expect(levy.pevneNatoceni).toBeUndefined();
    expect(pravy.pevneY).toBe(true);
    expect(pravy.pevneX).toBeUndefined();
    expect(volny.pevneX ?? volny.pevneY).toBeUndefined();
  });

  it("konce prutů jsou kloubové, ve svařeném styčníku tuhé", () => {
    for (const svar of [false, true]) {
      const navrh = prihrada(svar).navrh();
      const stavba = sestavMost(uroven, navrh);
      navrh.pruty.forEach((_, cislo) => {
        // Prut může být skrytě rozdělený; o spoji ve styčníku návrhu rozhoduje jeho první a poslední díl.
        const dily = stavba.popis.prvky.filter((p) => p.prut === cislo);
        expect(dily.length).toBeGreaterThan(0);
        expect(dily[0]!.kloubA).toBe(!svar);
        expect(dily.at(-1)!.kloubB).toBe(!svar);
      });
    }
  });

  it("dělené pruty jsou uvnitř spojité, sdílejí číslo prutu a vzpěr posuzují na celou délku", () => {
    const k = prihrada();
    const navrh = k.navrh();
    const stavba = sestavMost(uroven, navrh);
    // Diagonála 5,66 m z lehkého dřeva má první ohybovou frekvenci 9 Hz; v pásmu do 30 Hz leží
    // jeden její tvar, dělí se tedy na dva díly.
    const diagonala = navrh.pruty.findIndex((p) => p.prvek === "drevo-lehke" && navrh.stycniky[p.a]!.x !== navrh.stycniky[p.b]!.x);
    const dily = stavba.popis.prvky.filter((p) => p.prut === diagonala);
    const vlastnosti = vlastnostiPrutu("drevo-lehke", uroven.sirkaMostovky)!;
    expect(dily).toHaveLength(pocetDiluNosniku(Math.sqrt(32), vlastnosti.EI, vlastnosti.hmotnostNaMetr));
    expect(dily.length).toBeGreaterThanOrEqual(2);
    expect(dily[0]!.b).toBe(dily[1]!.a);
    expect(dily[0]!.b).toBeGreaterThanOrEqual(stavba.stycnikuNavrhu);
    expect(dily[0]).toMatchObject({ kloubA: true });
    expect(dily[0]!.kloubB).toBeUndefined();
    expect(dily[1]!.kloubA).toBeUndefined();
    expect(dily.at(-1)).toMatchObject({ kloubB: true });
    expect(dily[0]!.vzpernaDelka).toBeCloseTo(Math.sqrt(32), 12);
    expect(dily[0]!.klidovaDelka).toBeCloseTo(Math.sqrt(32) / dily.length, 12);

    const s = sestavSoustavu(stavba.popis);
    const e = stavba.popis.prvky.indexOf(dily[0]!);
    expect(s.kritickaSila[e]).toBeCloseTo((Math.PI ** 2 * dily[0]!.EI) / 32, 0);
  });

  it("hmotnost mostu je součet hmotností prutů, vybavení mostovky a závaží", () => {
    const k = prihrada();
    k.bod(12, 4, { zavazi: 750 });
    const navrh = k.navrh();
    const s = sestavSoustavu(sestavMost(uroven, navrh).popis);
    let ocekavana = 750;
    for (const prut of navrh.pruty) {
      const a = navrh.stycniky[prut.a]!;
      const b = navrh.stycniky[prut.b]!;
      const delka = Math.hypot(b.x - a.x, b.y - a.y);
      const naMetr = vlastnostiPrutu(prut.prvek, uroven.sirkaMostovky)!.hmotnostNaMetr;
      ocekavana += delka * (naMetr + (prut.prvek === "mostovka-drevo" ? uroven.hmotnostVybaveni : 0));
    }
    let hmota = 0;
    for (let i = 0; i < s.pocetStycniku; i++) hmota += s.hmota[i]!;
    expect(hmota).toBeCloseTo(ocekavana, 6);
  });

  it("mostovka ležící na spojnici trasy k ní patří, ostatní pruty ne", () => {
    const k = prihrada();
    const navrh = k.navrh();
    const stavba = sestavMost(uroven, navrh);
    expect(stavba.trasy).toHaveLength(1);
    const pruty = stavba.trasy[0]!.pruty;
    expect(pruty).toHaveLength(6);
    for (const cislo of pruty) expect(navrh.pruty[cislo]!.prvek).toBe("mostovka-drevo");
    // Mostovka postavená o patro výš k trase nepatří.
    k.prut("mostovka-drevo", [8, 4], [12, 4]);
    expect(sestavMost(uroven, k.navrh()).trasy[0]!.pruty).toHaveLength(6);
  });

  it("pod vlastní tíhou najde rovnováhu a reakce podpor unesou celou tíhu", () => {
    const s = sestavSoustavu(sestavMost(uroven, prihrada().navrh()).popis);
    const stupne = volneStupne(s);
    expect(najdiRovnovahu(s, stupne, new Float64Array(stupne.length), g)).toBeGreaterThanOrEqual(0);
    let hmota = 0;
    let reakce = 0;
    for (let i = 0; i < s.pocetStycniku; i++) {
      hmota += s.hmota[i]!;
      // Na zadržený styčník působí pruty silou, kterou podpora vyrovnává; k ní patří i jeho tíha.
      if (s.invHmotaY[i] === 0) reakce += -s.fy[i]! + s.hmota[i]! * g;
    }
    expect(reakce / (hmota * g)).toBeCloseTo(1, 6);
    // Střed se prohne o milimetry, ne o metry.
    const stred = [...Array(s.pocetStycniku).keys()].find((i) => s.x[i]! > 11.9 && s.x[i]! < 12.1 && s.y[i]! < 1)!;
    expect(-s.y[stred]!).toBeGreaterThan(0.0005);
    expect(-s.y[stred]!).toBeLessThan(0.02);
  });

  it("základ pilíře a vetknutá kotva drží i natočení a prut do nich vede tuze", () => {
    const sPilirem = urovenRegrese({ rozpeti: 24, zaklady: [{ x: 12, y: -8 }], kotvy: [{ x: 0, y: -4, typ: "vetknuti" }] });
    const k = new Kreslic();
    for (let x = 0; x < 24; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    const pilir = k.prut("pilir", [12, -8], [12, 0]);
    const vzpera = k.prut("ocel-lehka", [0, -4], [4, 0]);
    const stavba = sestavMost(sPilirem, k.navrh());
    expect(stavba.popis.stycniky[k.bod(12, -8)]).toMatchObject({ pevneX: true, pevneY: true, pevneNatoceni: true });
    expect(stavba.popis.stycniky[k.bod(0, -4)]).toMatchObject({ pevneX: true, pevneY: true, pevneNatoceni: true });
    const pata = stavba.popis.prvky.find((p) => p.prut === pilir && p.a === k.bod(12, -8))!;
    expect(pata.kloubA).toBe(false);
    const hlava = stavba.popis.prvky.filter((p) => p.prut === pilir).at(-1)!;
    expect(hlava.kloubB).toBe(true);
    expect(stavba.popis.prvky.find((p) => p.prut === vzpera)!.kloubA).toBe(false);
  });

  it("předepnuté lano je po ustálení napnuté zadanou silou", () => {
    const sKotvou = urovenRegrese({ rozpeti: 24, pravaPevna: true });
    const k = new Kreslic();
    const lano = k.prut("lano", [0, 0], [24, 0], { predpeti: 0.25 });
    const stavba = sestavMost(sKotvou, k.navrh());
    const dily = stavba.popis.prvky.filter((p) => p.prut === lano);
    expect(dily).toHaveLength(12);
    for (const dil of dily) expect(dil.druh).toBe(LANO);
    const s = sestavSoustavu(stavba.popis);
    const stupne = volneStupne(s);
    // Bez tíhy zůstane lano rovné a síla v něm je čtvrtina pevnosti.
    expect(najdiRovnovahu(s, stupne, new Float64Array(stupne.length), 0)).toBeGreaterThanOrEqual(0);
    const pevnost = vlastnostiPrutu("lano", 4)!.unosnost.tah;
    expect(s.osovaSila[5]! / (0.25 * pevnost)).toBeCloseTo(1, 9);
  });

  it("pružina a tlumič se převedou na pružinový prvek s parametry z návrhu", () => {
    const sKotvou = urovenRegrese({ rozpeti: 8, kotvy: [{ x: 4, y: -2, typ: "pevna" }] });
    const k = new Kreslic();
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    k.prut("mostovka-drevo", [4, 0], [8, 0]);
    const pruzina = k.prut("pruzina", [4, -2], [4, 0], { tuhost: 3e6 });
    const tlumic = k.prut("tlumic", [4, -2], [4, 0], { tlumeni: 5e4 });
    const stavba = sestavMost(sKotvou, k.navrh());
    const s = sestavSoustavu(stavba.popis);
    const ePruziny = stavba.popis.prvky.findIndex((p) => p.prut === pruzina);
    const eTlumice = stavba.popis.prvky.findIndex((p) => p.prut === tlumic);
    expect(s.druh[ePruziny]).toBe(PRUZINA);
    expect(s.tuhostOsova[ePruziny]).toBeCloseTo(3e6, 6);
    expect(s.tlumic[ePruziny]).toBe(0);
    expect(s.druh[eTlumice]).toBe(PRUZINA);
    expect(s.tuhostOsova[eTlumice]).toBe(0);
    expect(s.tlumic[eTlumice]).toBe(5e4);
    expect(stavba.utlumPrvku[ePruziny]).toBe(0);
    // Střed mostovky leží na pružině: pod tíhou si sedne o tíhu dělenou tuhostí (plus průhyb polí).
    const stupne = volneStupne(s);
    expect(najdiRovnovahu(s, stupne, new Float64Array(stupne.length), g)).toBeGreaterThanOrEqual(0);
    expect(s.osovaSila[ePruziny]!).toBeLessThan(0);
    expect(-s.y[k.bod(4, 0)]!).toBeCloseTo(-s.osovaSila[ePruziny]! / 3e6, 9);
  });

  it("píst zatím odmítne", () => {
    const k = new Kreslic();
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    k.prut("pist", [0, 0], [4, 3]);
    expect(() => sestavMost(urovenRegrese({ rozpeti: 4 }), k.navrh())).toThrow(/píst/);
  });
});

describe("útlum tvarů mostu z více materiálů", () => {
  it("leží mezi útlumy materiálů a tvar, ve kterém pracuje hlavně dřevo, tlumí víc", () => {
    const uroven = urovenRegrese({ rozpeti: 24 });
    const stavba = sestavMost(uroven, prihrada().navrh());
    const s = sestavSoustavu(stavba.popis);
    const stupne = volneStupne(s);
    expect(najdiRovnovahu(s, stupne, new Float64Array(stupne.length), g)).toBeGreaterThanOrEqual(0);
    const tvary = vlastniTvarySoustavy(s, stupne, 6)!;
    const utlumy = utlumyTvaru(s, stupne, tvary, stavba.utlumPrvku);
    const ocel = vlastnostiPrutu("ocel-lehka", 4)!.utlum;
    const drevo = vlastnostiPrutu("drevo-lehke", 4)!.utlum;
    for (const utlum of utlumy) {
      expect(utlum).toBeGreaterThan(ocel);
      expect(utlum).toBeLessThanOrEqual(drevo + 1e-12);
    }
    // Tvary se liší tím, kolik energie nese ocelový pás: útlumy nejsou všechny stejné.
    expect(Math.max(...utlumy) - Math.min(...utlumy)).toBeGreaterThan(1e-4);
  });

  it("most z jediného materiálu má útlum toho materiálu ve všech tvarech", () => {
    const k = new Kreslic();
    for (let x = 0; x < 12; x += 4) k.prut("ocel-lehka", [x, 0], [x + 4, 0]);
    k.svarVse();
    const stavba = sestavMost(urovenRegrese({ rozpeti: 12 }), k.navrh());
    const s = sestavSoustavu(stavba.popis);
    const stupne = volneStupne(s);
    const tvary = vlastniTvarySoustavy(s, stupne, 4)!;
    const utlumy = utlumyTvaru(s, stupne, tvary, stavba.utlumPrvku);
    for (const utlum of utlumy) expect(utlum).toBeCloseTo(vlastnostiPrutu("ocel-lehka", 4)!.utlum, 9);
  });
});

it("stavba používá jen prvky jádra, které zná", () => {
  const stavba = sestavMost(urovenRegrese({ rozpeti: 24 }), prihrada().navrh());
  for (const prvek of stavba.popis.prvky) expect([NOSNIK, LANO, PRUZINA]).toContain(prvek.druh);
});
