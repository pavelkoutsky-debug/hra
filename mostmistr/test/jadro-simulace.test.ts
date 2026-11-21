import { describe, expect, it } from "vitest";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { najdiRovnovahu } from "../src/jadro/matice";
import { ZPUSOB_TAH, ZPUSOB_VZPER } from "../src/jadro/namahani";
import { NASLEDEK_KLOUB, NASLEDEK_ROZLOMENI } from "../src/jadro/poruseni";
import { Simulace } from "../src/jadro/simulace";
import { sestavSoustavu, type PopisPrvku, type Soustava } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import { DREVENY_TRAM, OCELOVY_NOSNIK } from "./pomucky-jadra";

type Prut = Omit<PopisPrvku, "a" | "b">;
const DREVO: Prut = DREVENY_TRAM;
const OCEL: Prut = OCELOVY_NOSNIK;

const celkovaHmota = (s: Soustava): number => {
  let hmota = 0;
  for (let i = 0; i < s.pocetStycniku; i++) hmota += s.hmota[i]!;
  return hmota;
};

/** Svislý prut zavěšený nahoře, na dolním konci závaží; dolní konec se smí hýbat jen svisle. */
function zaves(prut: Prut, delka: number, zavazi: number): Soustava {
  const s = sestavSoustavu({
    stycniky: [
      { x: 0, y: 0, pevneX: true, pevneY: true },
      { x: 0, y: -delka, pevneX: true, hmota: zavazi },
    ],
    prvky: [{ ...prut, a: 0, b: 1, kloubA: true, kloubB: true }],
  });
  const stupne = volneStupne(s);
  expect(najdiRovnovahu(s, stupne, new Float64Array(stupne.length), TIHOVE_ZRYCHLENI)).toBeGreaterThanOrEqual(0);
  return s;
}

describe("simulace s porušením", () => {
  it("závaží pod únosností visí v klidu a nic se neporuší", () => {
    const zavazi = (0.8 * DREVO.unosnost!.tah) / TIHOVE_ZRYCHLENI;
    const sim = new Simulace(zaves(DREVO, 3, zavazi), { tiha: TIHOVE_ZRYCHLENI, utlum: 0.02 });
    const vychozi = sim.soustava.y[1]!;
    for (let i = 0; i < 4000; i++) sim.krok();
    expect(sim.porusena).toBe(false);
    expect(sim.rozpadla).toBe(false);
    expect(Math.abs(sim.soustava.y[1]! - vychozi)).toBeLessThan(1e-6);
    expect(sim.soustava.vyuziti[0]).toBeCloseTo(0.8, 2);
  });

  it("pomalu přitěžovaný dřevěný závěs se přetrhne při síle rovné únosnosti a závaží padá volným pádem", () => {
    const unosnost = DREVO.unosnost!.tah;
    const zavazi = (0.9 * unosnost) / TIHOVE_ZRYCHLENI;
    const s = zaves(DREVO, 3, zavazi);
    const hmotaPred = celkovaHmota(s);
    // Přídavná síla roste o 10 % únosnosti za sekundu. Těžké závaží na jediném prutu dává
    // dlouhý krok výpočtu, proto se přitěžuje pomalu.
    let silaPriPoruseni = 0;
    // Zatížení se volá už při zakládání simulace, kdy proměnná `sim` ještě neexistuje.
    const hotovo = (): boolean => zalozena && sim.porusena;
    let zalozena = false;
    const sim = new Simulace(s, {
      tiha: TIHOVE_ZRYCHLENI,
      utlum: 0.02,
      zatizeni: {
        pridejSily: (soustava, cas) => {
          if (hotovo()) return;
          soustava.fy[1] = soustava.fy[1]! - 0.1 * unosnost * cas;
          silaPriPoruseni = 0.9 * unosnost + 0.1 * unosnost * cas;
        },
      },
    });
    zalozena = true;
    const dtPred = sim.dt;
    while (!sim.porusena && sim.cas < 2) sim.krok();

    expect(sim.udalosti).toHaveLength(1);
    expect(sim.udalosti[0]).toMatchObject({ prut: 0, zpusob: ZPUSOB_TAH, nasledek: NASLEDEK_ROZLOMENI });
    // Vyhlazení využití porušení o pár milisekund zpozdí; síla je pak nejvýš o procento vyšší.
    expect(silaPriPoruseni / unosnost).toBeGreaterThan(0.995);
    expect(silaPriPoruseni / unosnost).toBeLessThan(1.02);
    expect(sim.dt).toBeLessThanOrEqual(dtPred);
    expect(celkovaHmota(sim.soustava)).toBeCloseTo(hmotaPred, 6);

    // Závaží i s dolním kusem prutu teď padá: za 0,2 s urazí ½·g·t² a zrychluje.
    const casPoruseni = sim.cas;
    const vyskaPriPoruseni = sim.soustava.y[1]!;
    const rychlostPriPoruseni = sim.soustava.vy[1]!;
    while (sim.cas < casPoruseni + 0.2) sim.krok();
    const t = sim.cas - casPoruseni;
    const pad = vyskaPriPoruseni + rychlostPriPoruseni * t - sim.soustava.y[1]!;
    expect(pad / (0.5 * TIHOVE_ZRYCHLENI * t * t)).toBeGreaterThan(0.9);
    expect(pad / (0.5 * TIHOVE_ZRYCHLENI * t * t)).toBeLessThan(1.15);
    expect(sim.rozpadla).toBe(false);
    expect(sim.udalosti).toHaveLength(1); // utržené kusy se dál nedrobí
  });

  it("ocelový závěs se nad mezí kluzu nejdřív protahuje a přetrhne se až po vyčerpání tažnosti", () => {
    const kluz = OCEL.unosnost!.tah;
    const pevnost = OCEL.tvarny!.silaPretrzeni;
    // Většinu zatížení tvoří síla, ne hmota: těžké závaží by při plastickém protahování
    // kmitalo tak pomalu, že by se přitěžování nedalo považovat za pozvolné.
    const zavazi = (0.2 * kluz) / TIHOVE_ZRYCHLENI;
    const stala = 0.7 * kluz;
    const s = sestavSoustavu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true },
        { x: 0, y: -2, pevneX: true, hmota: zavazi },
      ],
      prvky: [{ ...OCEL, a: 0, b: 1, kloubA: true, kloubB: true }],
    });
    const stupne = volneStupne(s);
    const vnejsi = new Float64Array(stupne.length);
    vnejsi[stupne.indexOf(3 * 1 + 1)] = -stala;
    expect(najdiRovnovahu(s, stupne, vnejsi, TIHOVE_ZRYCHLENI)).toBeGreaterThanOrEqual(0);

    let sila = 0.9 * kluz;
    // Zatížení se volá už při zakládání simulace, kdy proměnná `sim` ještě neexistuje.
    const hotovo = (): boolean => zalozena && sim.porusena;
    let zalozena = false;
    const sim = new Simulace(s, {
      tiha: TIHOVE_ZRYCHLENI,
      utlum: 0.02,
      zatizeni: {
        pridejSily: (soustava, cas) => {
          if (hotovo()) return;
          const pridavna = stala + 0.3 * kluz * cas;
          sila = 0.2 * kluz + pridavna;
          soustava.fy[1] = soustava.fy[1]! - pridavna;
        },
      },
    });
    zalozena = true;
    let silaPriKluzu = -1;
    while (!sim.porusena && sim.cas < 2.5) {
      sim.krok();
      if (silaPriKluzu < 0 && s.plastDelka[0]! > 0) silaPriKluzu = sila;
    }
    // Plastické protahování začne na mezi kluzu…
    expect(silaPriKluzu / kluz).toBeGreaterThan(0.99);
    expect(silaPriKluzu / kluz).toBeLessThan(1.02);
    // …a prut vydrží až do síly blízké pevnosti, kdy má vyčerpanou tažnost.
    expect(sim.udalosti[0]).toMatchObject({ zpusob: ZPUSOB_TAH, nasledek: NASLEDEK_ROZLOMENI });
    expect(sila / pevnost).toBeGreaterThan(0.97);
    expect(sila / pevnost).toBeLessThan(1.05);
    expect(sim.rozpadla).toBe(false);
  });

  it("přetížený ocelový sloup vybočí: vznikne kloub a sloup se složí", () => {
    // Sloup 8 m kloubově uložený, nahoře vedený svisle a zatížený závažím.
    const delka = 8;
    const s0 = sestavSoustavu({
      stycniky: [{ x: 0, y: 0, pevneX: true, pevneY: true }, { x: 0, y: delka, pevneX: true, hmota: 1000 }],
      prvky: [{ ...OCEL, a: 0, b: 1, kloubA: true, kloubB: true }],
    });
    const unosnost = 1 / (1 / OCEL.unosnost!.tlak + 1 / s0.kritickaSila[0]!);
    const stupne = volneStupne(s0);
    expect(najdiRovnovahu(s0, stupne, new Float64Array(stupne.length), TIHOVE_ZRYCHLENI)).toBeGreaterThanOrEqual(0);
    let sila = 0;
    const sim = new Simulace(s0, {
      tiha: TIHOVE_ZRYCHLENI,
      utlum: 0.02,
      zatizeni: {
        pridejSily: (soustava, cas) => {
          sila = Math.min(1.1, 2 * cas) * unosnost;
          soustava.fy[1] = soustava.fy[1]! - sila;
        },
      },
    });
    while (!sim.porusena && sim.cas < 1) sim.krok();
    expect(sim.udalosti[0]).toMatchObject({ zpusob: ZPUSOB_VZPER, nasledek: NASLEDEK_KLOUB });
    expect(sila / unosnost).toBeGreaterThan(0.98);
    expect(sila / unosnost).toBeLessThan(1.05);

    const vrchol = sim.soustava.y[1]!;
    const casPoruseni = sim.cas;
    while (sim.cas < casPoruseni + 0.3 && !sim.rozpadla) sim.krok();
    expect(sim.rozpadla).toBe(false);
    // Střed sloupu vybočil do strany a vrchol klesl.
    const stred = sim.soustava.prvekB[0]!;
    expect(Math.abs(sim.soustava.x[stred]!)).toBeGreaterThan(0.3);
    expect(vrchol - sim.soustava.y[1]!).toBeGreaterThan(0.05);
  });
});
