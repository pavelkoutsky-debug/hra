import { describe, expect, it } from "vitest";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { najdiRovnovahu } from "../src/jadro/matice";
import { Simulace } from "../src/jadro/simulace";
import { popisPruziny, sestavSoustavu, type Soustava } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";

/** Závaží `hmota` na svislé pružině pod pevným bodem; styčník 1 se hýbe jen svisle. */
function zavaziNaPruzine(hmota: number, tuhost: number, tlumic = 0): Soustava {
  return sestavSoustavu({
    stycniky: [
      { x: 0, y: 0, pevneX: true, pevneY: true },
      { x: 0, y: -1, pevneX: true, hmota },
    ],
    prvky: [popisPruziny(0, 1, tuhost, tlumic)],
  });
}

function ustal(s: Soustava, tiha: number): void {
  const stupne = volneStupne(s);
  expect(najdiRovnovahu(s, stupne, new Float64Array(stupne.length), tiha)).toBeGreaterThanOrEqual(0);
}

/** Časy a hodnoty po sobě jdoucích maxim výchylky kolem `stred`. */
function maxima(sim: Simulace, stycnik: number, stred: number, trvani: number): { cas: number[]; hodnota: number[] } {
  const cas: number[] = [];
  const hodnota: number[] = [];
  const s = sim.soustava;
  let predminula = s.y[stycnik]! - stred;
  let minula = predminula;
  let casMinule = sim.cas;
  while (sim.cas < trvani) {
    sim.krok();
    const nyni = s.y[stycnik]! - stred;
    if (minula > predminula && minula >= nyni && minula > 0) {
      // Vrchol paraboly proložené třemi body.
      const jmenovatel = predminula - 2 * minula + nyni;
      const posun = jmenovatel !== 0 ? (0.5 * (predminula - nyni)) / jmenovatel : 0;
      cas.push(casMinule + posun * sim.dt);
      hodnota.push(minula - 0.25 * (predminula - nyni) * posun);
    }
    predminula = minula;
    minula = nyni;
    casMinule = sim.cas;
  }
  return { cas, hodnota };
}

describe("pružina", () => {
  it("se pod závažím protáhne o m·g/k", () => {
    const s = zavaziNaPruzine(200, 50_000);
    ustal(s, TIHOVE_ZRYCHLENI);
    expect(-1 - s.y[1]!).toBeCloseTo((200 * TIHOVE_ZRYCHLENI) / 50_000, 9);
    expect(s.osovaSila[0]).toBeCloseTo(200 * TIHOVE_ZRYCHLENI, 5);
  });

  it("tlačená pružina na rozdíl od lana tlačí", () => {
    const s = sestavSoustavu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true },
        { x: 0, y: 1, pevneX: true, hmota: 200 },
      ],
      prvky: [popisPruziny(0, 1, 50_000)],
    });
    ustal(s, TIHOVE_ZRYCHLENI);
    expect(1 - s.y[1]!).toBeCloseTo((200 * TIHOVE_ZRYCHLENI) / 50_000, 9);
    expect(s.osovaSila[0]).toBeCloseTo(-200 * TIHOVE_ZRYCHLENI, 5);
  });

  it("závaží kmitá s frekvencí √(k/m)/2π a bez tlumiče se amplituda nemění", () => {
    const hmota = 200;
    const tuhost = 50_000;
    const s = zavaziNaPruzine(hmota, tuhost);
    ustal(s, TIHOVE_ZRYCHLENI);
    const stred = s.y[1]!;
    s.y[1] = stred + 0.01;
    // Útlum nula: tlumení vlastních tvarů i tlumení úměrné tuhosti prvku tu být nesmí.
    const sim = new Simulace(s, { tiha: TIHOVE_ZRYCHLENI, utlum: 0 });
    s.beta.fill(0);
    const m = maxima(sim, 1, stred, 3);
    const perioda = (m.cas.at(-1)! - m.cas[0]!) / (m.cas.length - 1);
    expect(perioda).toBeCloseTo(2 * Math.PI * Math.sqrt(hmota / tuhost), 4);
    expect(m.hodnota.at(-1)! / 0.01).toBeCloseTo(1, 4);
  });

  it("tlumič dává útlum c/(2·√(k·m))", () => {
    const hmota = 200;
    const tuhost = 50_000;
    for (const utlum of [0.02, 0.1, 0.3]) {
      const tlumic = 2 * utlum * Math.sqrt(tuhost * hmota);
      const s = zavaziNaPruzine(hmota, tuhost, tlumic);
      ustal(s, TIHOVE_ZRYCHLENI);
      const stred = s.y[1]!;
      s.y[1] = stred + 0.01;
      const sim = new Simulace(s, { tiha: TIHOVE_ZRYCHLENI, utlum: 0 });
      s.beta.fill(0);
      const m = maxima(sim, 1, stred, 2);
      // Logaritmický dekrement δ = 2πζ/√(1 − ζ²).
      const dekrement = Math.log(m.hodnota[0]! / m.hodnota[1]!);
      const namereny = dekrement / Math.sqrt(4 * Math.PI ** 2 + dekrement ** 2);
      expect(namereny / utlum).toBeGreaterThan(0.99);
      expect(namereny / utlum).toBeLessThan(1.01);
    }
  });

  it("velmi tuhý tlumič výpočet nerozkmitá: závaží klesá pomalu a plynule", () => {
    const hmota = 200;
    const tuhost = 50_000;
    // Tisícinásobek kritického tlumení; explicitní výpočet by s tímto krokem divergoval.
    const tlumic = 1000 * 2 * Math.sqrt(tuhost * hmota);
    const s = zavaziNaPruzine(hmota, tuhost, tlumic);
    const sim = new Simulace(s, { tiha: TIHOVE_ZRYCHLENI, utlum: 0 });
    expect(tlumic * sim.dt / hmota).toBeGreaterThan(2);
    let predchozi = s.y[1]!;
    for (let i = 0; i < 2000; i++) {
      sim.krok();
      expect(s.y[1]!).toBeLessThanOrEqual(predchozi + 1e-12);
      predchozi = s.y[1]!;
    }
    // Rychlost klesání je síla dělená c; z tíhy závaží už kousek nese protažená pružina.
    const sila = hmota * TIHOVE_ZRYCHLENI - tuhost * (-1 - s.y[1]!);
    expect(-s.vy[1]! / (sila / tlumic)).toBeCloseTo(1, 4);
    expect(sim.rozpadla).toBe(false);
  });
});

describe("laděný tlumič podle Den Hartoga", () => {
  const M = 5000;
  const K = 2e6;
  const pomer = 0.05;
  const m = pomer * M;
  const omega0 = Math.sqrt(K / M);
  // Optimální ladění: frekvence tlumiče ω₀/(1 + μ) a tlumič c = 2·m·ω₀·√(3μ/(8(1 + μ)³)).
  // Den Hartog vztahuje útlum k frekvenci hlavní soustavy, ne tlumiče.
  const ladeni = 1 / (1 + pomer);
  const utlum = Math.sqrt((3 * pomer) / (8 * (1 + pomer) ** 3));
  const k = m * (ladeni * omega0) ** 2;
  const c = 2 * utlum * m * omega0;
  const sila = 1000;

  /** Ustálená amplituda hlavní hmoty při buzení silou o kruhové frekvenci `omega`, dělená F/K. */
  function zesileniSimulaci(omega: number, sTlumicem: boolean): number {
    // Hlavní hmota na pružině nad pevným bodem, tlumič zavěšený pod ní.
    const s = sestavSoustavu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true },
        { x: 0, y: 1, pevneX: true, hmota: M },
        ...(sTlumicem ? [{ x: 0, y: 0.5, pevneX: true, hmota: m }] : []),
      ],
      prvky: [popisPruziny(0, 1, K), ...(sTlumicem ? [popisPruziny(1, 2, k, c)] : [])],
    });
    const sim = new Simulace(s, {
      tiha: 0,
      utlum: 0,
      zatizeni: { pridejSily: (soustava, cas) => (soustava.fy[1] = soustava.fy[1]! + sila * Math.sin(omega * cas)) },
    });
    s.beta.fill(0);
    // Přechodový děj odezní za pár desítek period (útlum soustavy s tlumičem je několik procent).
    const perioda = (2 * Math.PI) / omega;
    while (sim.cas < 80 * perioda) sim.krok();
    let amplituda = 0;
    while (sim.cas < 84 * perioda) {
      sim.krok();
      amplituda = Math.max(amplituda, Math.abs(s.y[1]! - 1));
    }
    return amplituda / (sila / K);
  }

  /** Totéž z přesného řešení soustavy dvou hmot (Den Hartog, Mechanical Vibrations). */
  function zesileniPresne(omega: number): number {
    const g = omega / omega0;
    const f = ladeni;
    const citatel = (2 * utlum * g) ** 2 + (g * g - f * f) ** 2;
    const jmenovatel =
      (2 * utlum * g) ** 2 * (g * g - 1 + pomer * g * g) ** 2 +
      (pomer * f * f * g * g - (g * g - 1) * (g * g - f * f)) ** 2;
    return Math.sqrt(citatel / jmenovatel);
  }

  it("odezva hlavní hmoty odpovídá přesnému řešení v celém pásmu kolem rezonance", () => {
    for (const g of [0.8, 0.9, 0.95, 1.0, 1.05, 1.15]) {
      const namereno = zesileniSimulaci(g * omega0, true);
      expect(namereno / zesileniPresne(g * omega0)).toBeGreaterThan(0.99);
      expect(namereno / zesileniPresne(g * omega0)).toBeLessThan(1.01);
    }
  });

  it("největší zesílení je zhruba √(1 + 2/μ), mnohonásobně méně než bez tlumiče", () => {
    let nejvetsi = 0;
    for (let g = 0.85; g <= 1.1001; g += 0.0125) nejvetsi = Math.max(nejvetsi, zesileniSimulaci(g * omega0, true));
    const denHartog = Math.sqrt(1 + 2 / pomer);
    expect(nejvetsi / denHartog).toBeGreaterThan(0.97);
    expect(nejvetsi / denHartog).toBeLessThan(1.05);
  });
});
