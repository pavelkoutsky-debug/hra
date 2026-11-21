import { describe, expect, it } from "vitest";
import {
  MISTO_KONEC_B,
  vyhodnotNamahani,
  ZPUSOB_OHYB,
  ZPUSOB_SMYK,
  ZPUSOB_TAH,
  ZPUSOB_TLAK,
  ZPUSOB_VZPER,
  ZPUSOB_ZADNY,
} from "../src/jadro/namahani";
import { spoctiVnitrniSily } from "../src/jadro/sily";
import { sestavSoustavu, type PopisPrvku, type Soustava } from "../src/jadro/soustava";
import { pridejSiluNaPrvek } from "../src/jadro/zatizeni";
import { popisPrutu } from "../src/zkouska/stavba";
import { DREVENY_TRAM } from "./pomucky-jadra";

type Prut = Omit<PopisPrvku, "a" | "b">;
const TRAM: Prut = DREVENY_TRAM;
const U = TRAM.unosnost!;

/** Jeden prut délky L s konci v zadané poloze; styčníky jsou držené, deformace se vnucuje posunem. */
function prut(L: number, upravy: Partial<Prut> = {}): Soustava {
  return sestavSoustavu({
    stycniky: [
      { x: 0, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
      { x: L, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
    ],
    prvky: [{ ...TRAM, ...upravy, a: 0, b: 1 }],
  });
}

/** Protáhne prut tak, aby v něm byla osová síla N (kladná tah), a vyhodnotí namáhání. */
function sOsovouSilou(s: Soustava, N: number): Soustava {
  s.x[1] = s.x[1]! + N / s.tuhostOsova[0]!;
  spoctiVnitrniSily(s);
  vyhodnotNamahani(s, 0, 1);
  return s;
}

describe("posouzení namáhání", () => {
  it("nenamáhaný prut má nulové využití", () => {
    const s = prut(3);
    spoctiVnitrniSily(s);
    vyhodnotNamahani(s, 0, 1);
    expect(s.vyuziti[0]).toBe(0);
    expect(s.zpusob[0]).toBe(ZPUSOB_ZADNY);
  });

  it("tah: využití je podíl síly a únosnosti v tahu", () => {
    const s = sOsovouSilou(prut(3), 0.5 * U.tah);
    expect(s.vyuziti[0]).toBeCloseTo(0.5, 9);
    expect(s.zpusob[0]).toBe(ZPUSOB_TAH);
  });

  it("tlak štíhlého prutu: rozhoduje vzpěr a únosnost dává Rankinův vzorec", () => {
    const L = 6;
    const s = prut(L);
    const kriticka = (Math.PI ** 2 * TRAM.EI) / L ** 2;
    expect(s.kritickaSila[0]).toBeCloseTo(kriticka, 3);
    expect(kriticka).toBeLessThan(U.tlak);
    // Při síle 1/(1/N_tlak + 1/N_cr) je využití právě 1.
    const unosnost = 1 / (1 / U.tlak + 1 / kriticka);
    sOsovouSilou(s, -unosnost);
    expect(s.vyuziti[0]).toBeCloseTo(1, 9);
    expect(s.zpusob[0]).toBe(ZPUSOB_VZPER);
    expect(unosnost).toBeLessThan(0.6 * U.tlak); // vzpěr únosnost výrazně snižuje
  });

  it("tlak krátkého prutu: rozhoduje pevnost materiálu", () => {
    const s = sOsovouSilou(prut(1), -0.4 * U.tlak);
    expect(s.zpusob[0]).toBe(ZPUSOB_TLAK);
    expect(s.vyuziti[0]).toBeGreaterThan(0.4);
    expect(s.vyuziti[0]).toBeLessThan(0.45);
  });

  it("vzpěrná délka skrytě děleného prutu je délka celého prutu", () => {
    const dilek = prut(1.5, { vzpernaDelka: 6 });
    expect(dilek.kritickaSila[0]).toBeCloseTo((Math.PI ** 2 * TRAM.EI) / 36, 3);
  });

  it("ohyb od síly uprostřed kloubového prutu: moment P·L/4 uprostřed", () => {
    const L = 4;
    const s = prut(L, { kloubA: true, kloubB: true });
    const P = (0.6 * U.moment * 4) / L;
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.5, 0, -P);
    vyhodnotNamahani(s, 0, 1);
    expect(s.vyuziti[0]).toBeCloseTo(0.6, 9);
    expect(s.zpusob[0]).toBe(ZPUSOB_OHYB);
    expect(s.mistoNamahani[0]).toBe(2); // střed prutu
  });

  it("ohyb vetknutého prutu se silou u konce b: rozhoduje moment na konci b", () => {
    const s = prut(4);
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.8, 0, -50_000);
    vyhodnotNamahani(s, 0, 1);
    expect(s.zpusob[0]).toBe(ZPUSOB_OHYB);
    expect(s.mistoNamahani[0]).toBe(MISTO_KONEC_B);
    // Moment ve vetknutí blíž k síle. Bez smyku by byl P·a²·b/L²; smyková poddajnost
    // dřeva (Φ ≈ 0,1) ho o pár procent sníží: P·L·ξ·η·(ξ + Φ/2)/(1 + Φ).
    const fi = s.fi[0]!;
    expect(fi).toBeGreaterThan(0.05);
    const seSmykem = (50_000 * 4 * 0.8 * 0.2 * (0.8 + fi / 2)) / (1 + fi);
    expect(s.vyuziti[0]! * U.moment).toBeCloseTo(seSmykem, 3);
    expect(seSmykem).toBeLessThan((50_000 * 3.2 ** 2 * 0.8) / 16);
  });

  it("vlastní tíha přidává ohyb", () => {
    const L = 6;
    const s = prut(L, { kloubA: true, kloubB: true });
    spoctiVnitrniSily(s);
    vyhodnotNamahani(s, 9.80665, 1);
    const q = TRAM.hmotnostNaMetr * 9.80665;
    expect(s.vyuziti[0]! * U.moment).toBeCloseTo((q * L * L) / 8, 6);
  });

  it("krátký prut se silou u podpory: rozhoduje smyk dřív než ohyb", () => {
    const L = 1;
    const s = prut(L, { kloubA: true, kloubB: true });
    const P = 250_000;
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.1, 0, -P);
    vyhodnotNamahani(s, 0, 1);
    expect(s.zpusob[0]).toBe(ZPUSOB_SMYK);
    expect(s.mistoNamahani[0]).toBe(0);
    expect(s.vyuziti[0]).toBeCloseTo((0.9 * P) / U.smyk, 9);
    // Táž síla uprostřed by v ohybu vyšla méně nebezpečná než tento smyk.
    expect((P * L) / 4 / U.moment).toBeLessThan(s.vyuziti[0]!);
  });

  it("tlak s ohybem: moment se zvětší součinitelem 1/(1 − N/N_cr) a oba podíly se sečtou", () => {
    const L = 4;
    const s = prut(L, { kloubA: true, kloubB: true });
    const kriticka = (Math.PI ** 2 * TRAM.EI) / L ** 2;
    const N = 0.3 * kriticka;
    const P = 20_000;
    s.x[1] = L - N / s.tuhostOsova[0]!;
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.5, 0, -P);
    vyhodnotNamahani(s, 0, 1);
    const delka = s.x[1]!;
    const ocekavane = N / U.tlak + N / kriticka + ((P * delka) / 4 / (1 - 0.3)) / U.moment;
    expect(s.vyuziti[0]).toBeCloseTo(ocekavane, 6);
  });

  it("lano se posuzuje jen na tah", () => {
    const lano = popisPrutu("lano", 3);
    const s = sestavSoustavu({
      stycniky: [{ x: 0, y: 0, pevneX: true, pevneY: true }, { x: 10, y: 0, pevneX: true, pevneY: true }],
      prvky: [{ ...lano, a: 0, b: 1 }],
    });
    sOsovouSilou(s, 0.7 * lano.unosnost!.tah);
    expect(s.vyuziti[0]).toBeCloseTo(0.7, 9);
    expect(s.zpusob[0]).toBe(ZPUSOB_TAH);
  });

  it("vyhlazení v čase: hodnota se k okamžité blíží postupně", () => {
    const s = sOsovouSilou(prut(3), 0.8 * U.tah);
    s.vyuziti[0] = 0;
    vyhodnotNamahani(s, 0, 0.25);
    expect(s.vyuziti[0]).toBeCloseTo(0.2, 9);
    vyhodnotNamahani(s, 0, 0.25);
    expect(s.vyuziti[0]).toBeCloseTo(0.35, 9);
    for (let i = 0; i < 60; i++) vyhodnotNamahani(s, 0, 0.25);
    expect(s.vyuziti[0]).toBeCloseTo(0.8, 6);
  });

  it("prvek bez zadané únosnosti se neposuzuje", () => {
    const { unosnost: _, ...bezUnosnosti } = TRAM;
    const s = sestavSoustavu({
      stycniky: [{ x: 0, y: 0, pevneX: true, pevneY: true }, { x: 3, y: 0, pevneX: true, pevneY: true }],
      prvky: [{ ...bezUnosnosti, a: 0, b: 1 }],
    });
    s.x[1] = 3.01;
    spoctiVnitrniSily(s);
    vyhodnotNamahani(s, 9.80665, 1);
    expect(s.vyuziti[0]).toBe(0);
  });
});
