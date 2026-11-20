import { describe, expect, it } from "vitest";
import { najdiRovnovahu } from "../src/jadro/matice";
import { NOSNIK, sestavSoustavu, type Soustava } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import { HEB200, HEB200_BEZ_SMYKU, nosnik, type Prurez } from "./pomucky-jadra";

/** Zatíží styčník svislou silou (kladná míří nahoru) a najde rovnováhu bez tíhy. */
function zatiz(s: Soustava, stycnik: number, sila: number): void {
  const stupne = volneStupne(s);
  const vnejsi = new Float64Array(stupne.length);
  vnejsi[stupne.indexOf(3 * stycnik + 1)] = sila;
  expect(najdiRovnovahu(s, stupne, vnejsi, 0)).toBeGreaterThanOrEqual(0);
}

/** Natočení styčníku v radiánech; v testu si goniometrii dovolit můžeme. */
const natoceni = (s: Soustava, i: number): number => Math.atan2(s.sinN[i]!, s.cosN[i]!);

describe("statika nosníku", () => {
  const L = 4;
  const P = 1000; // malá síla: průhyb zůstává v oboru, kde platí lineární vzorce
  const { EI, GAs } = HEB200;

  it("konzola se silou na konci: průhyb včetně smyku a natočení konce", () => {
    for (const dilu of [1, 4]) {
      const s = sestavSoustavu(nosnik(HEB200, L, dilu, "konzola"));
      zatiz(s, dilu, -P);
      const ocekavany = (P * L ** 3) / (3 * EI) + (P * L) / GAs;
      expect(-s.y[dilu]! / ocekavany).toBeCloseTo(1, 6);
      expect(-natoceni(s, dilu) / ((P * L ** 2) / (2 * EI))).toBeCloseTo(1, 6);
    }
  });

  it("smyk průhyb krátké konzoly znatelně zvětšuje", () => {
    const kratka = 1;
    const ohyb = (P * kratka ** 3) / (3 * EI);
    const smyk = (P * kratka) / GAs;
    expect(smyk / ohyb).toBeGreaterThan(0.15);
    const s = sestavSoustavu(nosnik(HEB200, kratka, 1, "konzola"));
    zatiz(s, 1, -P);
    expect(-s.y[1]! / (ohyb + smyk)).toBeCloseTo(1, 6);
  });

  it("prostý nosník se silou uprostřed", () => {
    const s = sestavSoustavu(nosnik(HEB200, L, 2, "prosty"));
    zatiz(s, 1, -P);
    const ocekavany = (P * L ** 3) / (48 * EI) + (P * L) / (4 * GAs);
    expect(-s.y[1]! / ocekavany).toBeCloseTo(1, 6);
  });

  it("nosník vlevo kloubově uložený a vpravo vetknutý: kloub na konci prvku", () => {
    // Levý prvek má na podpoře kloub, takže se ověřuje statická kondenzace tuhosti.
    const popis = nosnik(HEB200_BEZ_SMYKU, L, 2, "prosty");
    popis.prvky[0]!.kloubA = true;
    popis.stycniky[2]!.pevneX = true;
    popis.stycniky[2]!.pevneNatoceni = true;
    const s = sestavSoustavu(popis);
    expect(s.invSetrvacnost[0]).toBe(0); // do podpory nevede žádný tuhý konec
    zatiz(s, 1, -P);
    expect(-s.y[1]! / ((7 * P * L ** 3) / (768 * EI))).toBeCloseTo(1, 6);
  });
});

describe("statika příhrady", () => {
  it("trojúhelník se silou ve vrcholu: síly v prutech podle styčníkové metody", () => {
    const prut: Prurez = { ...HEB200, druh: NOSNIK, kloubA: true, kloubB: true };
    const s = sestavSoustavu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true },
        { x: 4, y: 0, pevneY: true },
        { x: 2, y: 1.5 },
      ],
      prvky: [
        { ...prut, a: 0, b: 1 },
        { ...prut, a: 0, b: 2 },
        { ...prut, a: 1, b: 2 },
      ],
    });
    const P = 10_000;
    zatiz(s, 2, -P);
    // Šikmé pruty svírají s vodorovnou úhel se sinem 0,6 a kosinem 0,8.
    expect(s.osovaSila[1]! / (-P / 2 / 0.6)).toBeCloseTo(1, 4);
    expect(s.osovaSila[2]! / (-P / 2 / 0.6)).toBeCloseTo(1, 4);
    expect(s.osovaSila[0]! / (((P / 2) * 0.8) / 0.6)).toBeCloseTo(1, 4);
  });

  it("mechanismus rovnováhu nemá", () => {
    // Čtyřkloubový rám bez úhlopříčky.
    const prut: Prurez = { ...HEB200, kloubA: true, kloubB: true };
    const s = sestavSoustavu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true },
        { x: 4, y: 0, pevneX: true, pevneY: true },
        { x: 0, y: 3 },
        { x: 4, y: 3 },
      ],
      prvky: [
        { ...prut, a: 0, b: 2 },
        { ...prut, a: 1, b: 3 },
        { ...prut, a: 2, b: 3 },
      ],
    });
    const stupne = volneStupne(s);
    const vnejsi = new Float64Array(stupne.length);
    vnejsi[stupne.indexOf(3 * 2)] = 1000;
    expect(najdiRovnovahu(s, stupne, vnejsi, 0)).toBe(-1);
  });
});

describe("rovnováha pod vlastní tíhou", () => {
  it("prostý nosník: průhyb uprostřed odpovídá rovnoměrnému zatížení", () => {
    // Hmota soustředěná do styčníků dává při jemném dělení průhyb 5·q·L⁴/(384·EI).
    const L = 12;
    const dilu = 24;
    const s = sestavSoustavu(nosnik(HEB200_BEZ_SMYKU, L, dilu, "prosty"));
    const stupne = volneStupne(s);
    expect(najdiRovnovahu(s, stupne, new Float64Array(stupne.length), 9.80665)).toBeGreaterThanOrEqual(0);
    const q = HEB200.hmotnostNaMetr * 9.80665;
    const ocekavany = (5 * q * L ** 4) / (384 * HEB200.EI);
    expect(-s.y[dilu / 2]! / ocekavany).toBeCloseTo(1, 2);
  });
});
