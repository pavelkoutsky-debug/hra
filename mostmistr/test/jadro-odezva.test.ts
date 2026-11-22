// Rezonanční křivka proti analytickým řešením: jedna hmota na pružině a hmota s laděným tlumičem.
import { describe, expect, it } from "vitest";
import { rezonancniKrivka } from "../src/jadro/odezva";
import { popisPruziny, sestavSoustavu } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";

/** Frekvence 0,5 až 6 Hz po 0,01 Hz. */
const FREKVENCE = Array.from({ length: 551 }, (_, i) => 0.5 + 0.01 * i);

/** Hmota M na pružině K nad pevným bodem; volitelně na ní visí menší hmota m na pružině k s tlumičem c. */
function soustava(M: number, K: number, c0: number, tlumic?: { m: number; k: number; c: number }) {
  const stycniky = [
    { x: 0, y: 0, pevneX: true, pevneY: true },
    { x: 0, y: 1, pevneX: true, hmota: M },
  ];
  const prvky = [popisPruziny(0, 1, K, c0)];
  if (tlumic) {
    stycniky.push({ x: 0, y: 2, pevneX: true, hmota: tlumic.m });
    prvky.push(popisPruziny(1, 2, tlumic.k, tlumic.c));
  }
  const s = sestavSoustavu({ stycniky, prvky });
  return { s, stupne: volneStupne(s) };
}

function vrcholy(krivka: Float64Array): { f: number; hodnota: number }[] {
  const nalezene: { f: number; hodnota: number }[] = [];
  for (let i = 1; i + 1 < krivka.length; i++) {
    if (krivka[i]! > krivka[i - 1]! && krivka[i]! >= krivka[i + 1]!) nalezene.push({ f: FREKVENCE[i]!, hodnota: krivka[i]! });
  }
  return nalezene;
}

describe("jedna hmota na pružině", () => {
  const M = 2000;
  const f0 = 2;
  const K = M * (2 * Math.PI * f0) ** 2;

  it("s viskózním tlumičem odpovídá vzorci ω²/√((K − Mω²)² + (cω)²)", () => {
    const c = 2 * 0.05 * Math.sqrt(K * M);
    const { s, stupne } = soustava(M, K, c);
    const krivka = rezonancniKrivka(s, stupne, [1], FREKVENCE, 0)!;
    FREKVENCE.forEach((f, i) => {
      const w = 2 * Math.PI * f;
      const presne = (w * w) / Math.sqrt((K - M * w * w) ** 2 + (c * w) ** 2);
      expect(krivka[i]! / presne).toBeCloseTo(1, 6);
    });
    const v = vrcholy(krivka);
    expect(v).toHaveLength(1);
    expect(v[0]!.f).toBeCloseTo(f0, 1);
    // Na vrcholu je odezva 1/(2ζ)krát větší než 1/M, které by dala volná hmota.
    expect(v[0]!.hodnota * M).toBeCloseTo(1 / (2 * 0.05), 0);
  });

  it("poměrný útlum konstrukce dá stejnou křivku jako stejně silný tlumič", () => {
    const c = 2 * 0.02 * Math.sqrt(K * M);
    const tlumicem = soustava(M, K, c);
    const utlumem = soustava(M, K, 0);
    const a = rezonancniKrivka(tlumicem.s, tlumicem.stupne, [1], FREKVENCE, 0)!;
    const b = rezonancniKrivka(utlumem.s, utlumem.stupne, [1], FREKVENCE, 0.02)!;
    for (let i = 0; i < a.length; i++) expect(b[i]! / a[i]!).toBeCloseTo(1, 6);
  });

  it("silnější tlumení špičku snižuje a neposouvá", () => {
    let minula = Infinity;
    for (const zeta of [0.01, 0.02, 0.05, 0.1]) {
      const { s, stupne } = soustava(M, K, 0);
      const v = vrcholy(rezonancniKrivka(s, stupne, [1], FREKVENCE, zeta)!);
      expect(v).toHaveLength(1);
      expect(v[0]!.f).toBeCloseTo(f0, 1);
      expect(v[0]!.hodnota).toBeLessThan(minula);
      minula = v[0]!.hodnota;
    }
  });

  it("místo se zadrženým posunem neodpovídá a prázdný seznam míst dá nulovou křivku", () => {
    const { s, stupne } = soustava(M, K, 0);
    expect([...rezonancniKrivka(s, stupne, [0], FREKVENCE, 0.01)!].every((h) => h === 0)).toBe(true);
    expect([...rezonancniKrivka(s, stupne, [], FREKVENCE, 0.01)!].every((h) => h === 0)).toBe(true);
  });
});

describe("laděný tlumič podle Den Hartoga", () => {
  const M = 5000;
  const f0 = 2;
  const K = M * (2 * Math.PI * f0) ** 2;
  const mi = 0.05;
  const m = mi * M;
  // Optimální ladění: frekvence tlumiče f₀/(1 + μ), poměrný útlum √(3μ/(8(1 + μ)³)).
  const ft = f0 / (1 + mi);
  const k = m * (2 * Math.PI * ft) ** 2;
  const zeta = Math.sqrt((3 * mi) / (8 * (1 + mi) ** 3));
  const c = 2 * zeta * m * 2 * Math.PI * ft;
  const utlum = 0.005;

  const bez = soustava(M, K, 0);
  const s = soustava(M, K, 0, { m, k, c });
  const krivkaBez = rezonancniKrivka(bez.s, bez.stupne, [1], FREKVENCE, utlum)!;
  const krivkaS = rezonancniKrivka(s.s, s.stupne, [1], FREKVENCE, utlum)!;

  it("odpovídá přesnému řešení soustavy dvou hmot", () => {
    // Bez útlumu konstrukce, aby šlo porovnat s učebnicovým vzorcem.
    const krivka = rezonancniKrivka(s.s, s.stupne, [1], FREKVENCE, 0)!;
    FREKVENCE.forEach((f, i) => {
      const w = 2 * Math.PI * f;
      // X/F = (k − mω² + icω) / ((K − Mω²)(k − mω²) − kmω² + icω(K − Mω² − mω²))
      const citatelRe = k - m * w * w;
      const citatelIm = c * w;
      const jmenovatelRe = (K - M * w * w) * (k - m * w * w) - k * m * w * w;
      const jmenovatelIm = c * w * (K - M * w * w - m * w * w);
      const presne = (w * w * Math.hypot(citatelRe, citatelIm)) / Math.hypot(jmenovatelRe, jmenovatelIm);
      expect(krivka[i]! / presne).toBeCloseTo(1, 6);
    });
  });

  it("rozdělí rezonanční špičku na dvě mnohem nižší, jednu pod původní frekvencí a jednu nad ní", () => {
    const puvodni = vrcholy(krivkaBez);
    const rozdelene = vrcholy(krivkaS);
    expect(puvodni).toHaveLength(1);
    expect(rozdelene).toHaveLength(2);
    expect(rozdelene[0]!.f).toBeLessThan(puvodni[0]!.f);
    expect(rozdelene[1]!.f).toBeGreaterThan(puvodni[0]!.f);
    for (const vrchol of rozdelene) expect(vrchol.hodnota).toBeLessThan(0.1 * puvodni[0]!.hodnota);
    // Při optimálním ladění jsou obě špičky výchylky skoro stejně vysoké (křivka je ve
    // zrychlení, proto se dělí čtvercem kruhové frekvence).
    const vychylka = rozdelene.map((v) => v.hodnota / (2 * Math.PI * v.f) ** 2);
    expect(vychylka[0]! / vychylka[1]!).toBeGreaterThan(0.85);
    expect(vychylka[0]! / vychylka[1]!).toBeLessThan(1.18);
    // Den Hartog: největší zesílení statické výchylky je √(1 + 2/μ).
    const staticka = 1 / K;
    const zesileni = Math.max(...rozdelene.map((v) => v.hodnota / (2 * Math.PI * v.f) ** 2)) / staticka;
    expect(zesileni).toBeGreaterThan(0.85 * Math.sqrt(1 + 2 / mi));
    expect(zesileni).toBeLessThan(1.1 * Math.sqrt(1 + 2 / mi));
  });

  it("tlumič naladěný jinam nechá původní špičku skoro, jak byla", () => {
    const vedle = soustava(M, K, 0, { m, k: m * (2 * Math.PI * 4.5) ** 2, c });
    const v = vrcholy(rezonancniKrivka(vedle.s, vedle.stupne, [1], FREKVENCE, utlum)!);
    const puvodni = vrcholy(krivkaBez)[0]!;
    expect(Math.max(...v.map((x) => x.hodnota))).toBeGreaterThan(0.5 * puvodni.hodnota);
  });
});
