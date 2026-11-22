import { describe, expect, it } from "vitest";
import { spoctiSily, TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { najdiRovnovahu } from "../src/jadro/matice";
import { spoctiVnitrniSily } from "../src/jadro/sily";
import { sestavSoustavu, type PopisSoustavy, type Soustava } from "../src/jadro/soustava";
import { silyStupnu, volneStupne } from "../src/jadro/stupne";
import {
  MISTA_POSUDKU,
  momentNaKonciA,
  momentNaKonciB,
  momentVPoli,
  posouvajiciNaKonciA,
  posouvajiciNaKonciB,
  pridejSiluNaPrvek,
} from "../src/jadro/zatizeni";
import { HEB200, HEB200_BEZ_SMYKU, type Prurez } from "./pomucky-jadra";

const P = -1000; // síla dolů; malá, aby platila lineární teorie
const MISTO_SILY = 0.75; // metry od levého konce
const natoceni = (s: Soustava, i: number): number => Math.atan2(s.sinN[i]!, s.cosN[i]!);

type Ulozeni = "vetknuti" | "kloub";

/**
 * Nosník 0–2–5 m: levý prut 2 m nese sílu, pravý 3 m je navazující pole.
 * `dilek` je délka prvku levého prutu; hrubý model má dilek 2 (jediný prvek),
 * jemný 0,25 (síla i místa posudku pak leží ve styčnících).
 */
function nosnik(prurez: Prurez, levy: Ulozeni, vnitrniKloub: boolean, dilek: number): PopisSoustavy {
  const popis: PopisSoustavy = { stycniky: [], prvky: [] };
  const dilu = Math.round(2 / dilek);
  for (let i = 0; i <= dilu; i++) popis.stycniky.push({ x: i * dilek, y: 0 });
  popis.stycniky.push({ x: 5, y: 0 });
  for (let i = 0; i < dilu; i++) popis.prvky.push({ ...prurez, a: i, b: i + 1 });
  popis.prvky.push({ ...prurez, a: dilu, b: dilu + 1 });

  const prvni = popis.stycniky[0]!;
  prvni.pevneX = true;
  prvni.pevneY = true;
  if (levy === "vetknuti") prvni.pevneNatoceni = true;
  else popis.prvky[0]!.kloubA = true;
  // Kloub mezi levým a pravým prutem: levý prut v něm moment nepřenáší.
  if (vnitrniKloub) popis.prvky[dilu - 1]!.kloubB = true;
  const posledni = popis.stycniky[dilu + 1]!;
  posledni.pevneY = true;
  posledni.pevneNatoceni = true;
  return popis;
}

/** Zatíží prvek silou a najde rovnováhu; po návratu jsou v soustavě síly i záznam zatížení. */
function zatizPrvek(s: Soustava, prvek: number, xi: number): void {
  const stupne = volneStupne(s);
  spoctiVnitrniSily(s);
  pridejSiluNaPrvek(s, prvek, xi, 0, P);
  const vnejsi = new Float64Array(stupne.length);
  silyStupnu(s, stupne, vnejsi);
  expect(najdiRovnovahu(s, stupne, vnejsi, 0)).toBeGreaterThanOrEqual(0);
  spoctiVnitrniSily(s);
  pridejSiluNaPrvek(s, prvek, xi, 0, P);
}

/** Zatíží styčník silou a najde rovnováhu. */
function zatizStycnik(s: Soustava, stycnik: number): void {
  const stupne = volneStupne(s);
  const vnejsi = new Float64Array(stupne.length);
  vnejsi[stupne.indexOf(3 * stycnik + 1)] = P;
  expect(najdiRovnovahu(s, stupne, vnejsi, 0)).toBeGreaterThanOrEqual(0);
  spoctiVnitrniSily(s);
}

const VARIANTY: readonly { nazev: string; prurez: Prurez; levy: Ulozeni; vnitrniKloub: boolean }[] = [
  { nazev: "oba konce tuhé, bez smyku", prurez: HEB200_BEZ_SMYKU, levy: "vetknuti", vnitrniKloub: false },
  { nazev: "oba konce tuhé, se smykem", prurez: HEB200, levy: "vetknuti", vnitrniKloub: false },
  { nazev: "kloub vlevo, bez smyku", prurez: HEB200_BEZ_SMYKU, levy: "kloub", vnitrniKloub: false },
  { nazev: "kloub vlevo, se smykem", prurez: HEB200, levy: "kloub", vnitrniKloub: false },
  { nazev: "kloub vpravo, se smykem", prurez: HEB200, levy: "vetknuti", vnitrniKloub: true },
  { nazev: "klouby na obou koncích", prurez: HEB200, levy: "kloub", vnitrniKloub: true },
];

describe("síla uvnitř prvku proti jemně dělenému nosníku", () => {
  for (const v of VARIANTY) {
    describe(v.nazev, () => {
      const hruby = sestavSoustavu(nosnik(v.prurez, v.levy, v.vnitrniKloub, 2));
      zatizPrvek(hruby, 0, MISTO_SILY / 2);
      const jemny = sestavSoustavu(nosnik(v.prurez, v.levy, v.vnitrniKloub, 0.25));
      zatizStycnik(jemny, MISTO_SILY / 0.25);
      const stred = 8; // styčník jemného modelu v místě x = 2 m

      it("posun a natočení styčníku na konci prutu vyjdou stejně", () => {
        expect(Math.abs(jemny.y[stred]!)).toBeGreaterThan(1e-7);
        expect(hruby.y[1]! / jemny.y[stred]!).toBeCloseTo(1, 7);
        // Natočení styčníku určuje navazující (tuhý) prut; platí i s kloubem na konci levého prutu.
        expect(natoceni(hruby, 1) / natoceni(jemny, stred)).toBeCloseTo(1, 7);
      });

      it("momenty na koncích prutu vyjdou stejně", () => {
        const meritko = Math.abs(P) * 2;
        expect((momentNaKonciA(hruby, 0) - momentNaKonciA(jemny, 0)) / meritko).toBeCloseTo(0, 8);
        expect((momentNaKonciB(hruby, 0) - momentNaKonciB(jemny, stred - 1)) / meritko).toBeCloseTo(0, 8);
        if (v.levy === "kloub") expect(Math.abs(momentNaKonciA(hruby, 0))).toBeLessThan(1e-9 * meritko);
        if (v.vnitrniKloub) expect(Math.abs(momentNaKonciB(hruby, 0))).toBeLessThan(1e-9 * meritko);
      });

      it("moment ve čtvrtinách prutu vyjde stejně", () => {
        const meritko = Math.abs(P) * 2;
        MISTA_POSUDKU.forEach((misto, k) => {
          const stycnik = (misto * 2) / 0.25;
          const presny = momentNaKonciB(jemny, stycnik - 1);
          expect((momentVPoli(hruby, 0, k, 0) - presny) / meritko, `místo ${misto}`).toBeCloseTo(0, 8);
        });
      });

      it("posouvající síly na koncích prutu vyjdou stejně", () => {
        const meritko = Math.abs(P);
        expect((posouvajiciNaKonciA(hruby, 0) - posouvajiciNaKonciA(jemny, 0)) / meritko).toBeCloseTo(0, 8);
        expect((posouvajiciNaKonciB(hruby, 0) - posouvajiciNaKonciB(jemny, stred - 1)) / meritko).toBeCloseTo(0, 8);
      });
    });
  }
});

describe("síla uvnitř prvku: známé hodnoty", () => {
  it("vetknutý nosník se silou uprostřed: momenty ±P·L/8", () => {
    const s = sestavSoustavu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
        { x: 4, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
      ],
      prvky: [{ ...HEB200_BEZ_SMYKU, a: 0, b: 1 }],
    });
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.5, 0, P);
    const PL = Math.abs(P) * 4;
    // Síla dolů: nad podporami tah nahoře (záporný moment), uprostřed tah dole (kladný).
    expect(momentNaKonciA(s, 0) / PL).toBeCloseTo(-1 / 8, 12);
    expect(momentNaKonciB(s, 0) / PL).toBeCloseTo(-1 / 8, 12);
    expect(momentVPoli(s, 0, 1, 0) / PL).toBeCloseTo(1 / 8, 12);
    expect(Math.abs(posouvajiciNaKonciA(s, 0) / P)).toBeCloseTo(0.5, 12);
  });

  it("prostý nosník se silou uprostřed: moment P·L/4 a žádné momenty ve styčnících", () => {
    const s = sestavSoustavu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true },
        { x: 4, y: 0, pevneY: true },
      ],
      prvky: [{ ...HEB200, a: 0, b: 1, kloubA: true, kloubB: true }],
    });
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.5, 0, P);
    expect(momentVPoli(s, 0, 1, 0) / (Math.abs(P) * 4)).toBeCloseTo(1 / 4, 12);
    expect(s.moment[0]).toBe(0);
    expect(s.moment[1]).toBe(0);
    // Každá podpora nese polovinu síly.
    expect(s.fy[0]! / P).toBeCloseTo(0.5, 12);
    expect(s.fy[1]! / P).toBeCloseTo(0.5, 12);
  });

  it("síla podél prutu se dělí pákovým pravidlem a ohyb nevyvolá", () => {
    const s = sestavSoustavu({
      stycniky: [{ x: 0, y: 0 }, { x: 4, y: 0 }],
      prvky: [{ ...HEB200, a: 0, b: 1 }],
    });
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.25, 800, 0);
    expect(s.fx[0]).toBeCloseTo(600, 9);
    expect(s.fx[1]).toBeCloseTo(200, 9);
    expect(s.fy[0]).toBeCloseTo(0, 9);
    expect(s.moment[0]).toBeCloseTo(0, 9);
    expect(momentVPoli(s, 0, 1, 0)).toBeCloseTo(0, 9);
  });

  it("výslednice náhradních sil a jejich moment odpovídají původní síle", () => {
    // Šikmý prut, šikmá síla, všechny kombinace kloubů.
    for (const klouby of [{}, { kloubA: true }, { kloubB: true }, { kloubA: true, kloubB: true }]) {
      const s = sestavSoustavu({
        stycniky: [{ x: 1, y: 2 }, { x: 4, y: 6 }],
        prvky: [{ ...HEB200, a: 0, b: 1, ...klouby }],
      });
      spoctiVnitrniSily(s);
      const xi = 0.3;
      const [Fx, Fy] = [700, -1300];
      pridejSiluNaPrvek(s, 0, xi, Fx, Fy);
      expect(s.fx[0]! + s.fx[1]!).toBeCloseTo(Fx, 8);
      expect(s.fy[0]! + s.fy[1]!).toBeCloseTo(Fy, 8);
      const [px, py] = [1 + 3 * xi, 2 + 4 * xi];
      const momentSily = px * Fy - py * Fx;
      const momentNahrady =
        1 * s.fy[0]! - 2 * s.fx[0]! + 4 * s.fy[1]! - 6 * s.fx[1]! + s.moment[0]! + s.moment[1]!;
      expect(momentNahrady).toBeCloseTo(momentSily, 7);
    }
  });

  it("vlastní tíha přidá v poli moment q·L²/8", () => {
    const s = sestavSoustavu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true },
        { x: 4, y: 0, pevneY: true },
      ],
      prvky: [{ ...HEB200, a: 0, b: 1, kloubA: true, kloubB: true }],
    });
    spoctiVnitrniSily(s);
    const q = HEB200.hmotnostNaMetr * 9.80665;
    expect(momentVPoli(s, 0, 1, 9.80665)).toBeCloseTo((q * 16) / 8, 9);
    // Ve čtvrtině je parabola na třech čtvrtinách vrcholu.
    expect(momentVPoli(s, 0, 0, 9.80665)).toBeCloseTo((0.75 * q * 16) / 8, 9);
  });

  it("zatížení z minulého kroku se s novým výpočtem sil zapomene", () => {
    const s = sestavSoustavu({
      stycniky: [{ x: 0, y: 0 }, { x: 4, y: 0 }],
      prvky: [{ ...HEB200, a: 0, b: 1 }],
    });
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.5, 0, P);
    expect(s.pocetZatizenych).toBe(1);
    expect(momentVPoli(s, 0, 1, 0)).not.toBe(0);
    spoctiVnitrniSily(s);
    expect(s.pocetZatizenych).toBe(0);
    expect(momentVPoli(s, 0, 1, 0)).toBe(0);
  });
});

describe("vlastní tíha rozložená po délce prutu", () => {
  const g = TIHOVE_ZRYCHLENI;
  const q = HEB200.hmotnostNaMetr * g;
  const vKlidu = (popis: PopisSoustavy): Soustava => {
    const s = sestavSoustavu(popis);
    const stupne = volneStupne(s);
    expect(najdiRovnovahu(s, stupne, new Float64Array(stupne.length), g)).toBeGreaterThanOrEqual(0);
    spoctiSily(s, g, 0);
    return s;
  };

  it("nosník vetknutý na obou koncích: v podporách −q·L²/12, uprostřed q·L²/24", () => {
    const L = 6;
    const s = vKlidu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
        { x: L, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
      ],
      prvky: [{ ...HEB200, a: 0, b: 1 }],
    });
    expect(momentNaKonciA(s, 0)).toBeCloseTo((-q * L * L) / 12, 6);
    expect(momentNaKonciB(s, 0)).toBeCloseTo((-q * L * L) / 12, 6);
    expect(momentVPoli(s, 0, 1, g)).toBeCloseTo((q * L * L) / 24, 6);
  });

  it("spojitý nosník o dvou polích má nad střední podporou −q·L²/8, i když je každé pole jediný prvek", () => {
    const L = 5;
    const s = vKlidu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true },
        { x: L, y: 0, pevneY: true },
        { x: 2 * L, y: 0, pevneY: true },
      ],
      prvky: [
        { ...HEB200_BEZ_SMYKU, a: 0, b: 1, kloubA: true },
        { ...HEB200_BEZ_SMYKU, a: 1, b: 2, kloubB: true },
      ],
    });
    expect(momentNaKonciB(s, 0) / ((-q * L * L) / 8)).toBeCloseTo(1, 6);
    expect(momentNaKonciA(s, 1) / ((-q * L * L) / 8)).toBeCloseTo(1, 6);
    // Největší moment v poli je 9/128·q·L² ve vzdálenosti 3/8·L od krajní podpory; ve čtvrtinách
    // pole se posuzuje q·L²/16 uprostřed a 9/128·q·L² − … u kraje, tedy vždy méně.
    expect(momentVPoli(s, 0, 1, g) / ((q * L * L) / 16)).toBeCloseTo(1, 6);
  });

  it("prostý nosník ze dvou dílů se prohne o 5·q·L⁴/(384·E·I), ne o pětinu méně", () => {
    const L = 8;
    const popis: PopisSoustavy = {
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true },
        { x: L / 2, y: 0 },
        { x: L, y: 0, pevneY: true },
      ],
      prvky: [
        { ...HEB200_BEZ_SMYKU, a: 0, b: 1, kloubA: true },
        { ...HEB200_BEZ_SMYKU, a: 1, b: 2, kloubB: true },
      ],
    };
    const s = vKlidu(popis);
    expect(s.y[1]! / ((-5 * q * L ** 4) / (384 * HEB200.EI))).toBeCloseTo(1, 4);
    expect(momentNaKonciB(s, 0) / ((q * L * L) / 8)).toBeCloseTo(1, 6);
  });

  it("šikmý a svislý prut: příčně působí jen průmět tíhy, svislý sloup ohyb nedostane", () => {
    const sloup = vKlidu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
        { x: 0, y: 5 },
      ],
      prvky: [{ ...HEB200, a: 0, b: 1 }],
    });
    expect(Math.abs(momentNaKonciA(sloup, 0))).toBeLessThan(1e-6);
    // Konzola skloněná pod 45°: moment ve vetknutí je tíha krát vodorovné rameno těžiště.
    const d = 3;
    const sikma = vKlidu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
        { x: d, y: d },
      ],
      prvky: [{ ...HEB200_BEZ_SMYKU, a: 0, b: 1 }],
    });
    const tiha = q * Math.hypot(d, d);
    // (Na tři platná místa: konzola se tíhou prohne a rameno se o zlomek milimetru změní.)
    expect(momentNaKonciA(sikma, 0) / ((-tiha * d) / 2)).toBeCloseTo(1, 3);
  });
});
