// Písty: prvek s řízenou klidovou délkou a omezenou silou zvedá a sklápí křídlo mostu.
import { describe, expect, it } from "vitest";
import { TIHOVE_ZRYCHLENI as g } from "../src/jadro/integrator";
import { najdiRovnovahu } from "../src/jadro/matice";
import { pistyVCili, posunPisty, vytvorPisty, type Pisty } from "../src/jadro/pisty";
import { Simulace } from "../src/jadro/simulace";
import { popisPruziny, sestavSoustavu, type Soustava } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import { HEB200 } from "./pomucky-jadra";

const ZAVAZI = 2000;
const TUHOST = 50e6;
const ZDVIH = 1.2;
const ZASUNUTY = Math.sqrt(13);

/**
 * Křídlo sklopného mostu: svařený nosník 8 m s čepem v počátku a se závažím na volném
 * konci. Píst vede z pevného bodu (2, −3) do středu křídla (4, 0). Prvek 2 je píst.
 */
function kridlo(): Soustava {
  return sestavSoustavu({
    stycniky: [
      { x: 0, y: 0, pevneX: true, pevneY: true },
      { x: 4, y: 0 },
      { x: 8, y: 0, hmota: ZAVAZI },
      { x: 2, y: -3, pevneX: true, pevneY: true },
    ],
    prvky: [
      { ...HEB200, a: 0, b: 1, kloubA: true },
      { ...HEB200, a: 1, b: 2, kloubB: true },
      popisPruziny(3, 1, TUHOST, 2e5, 50),
    ],
  });
}

function spust(nejvetsiSila: number): { sim: Simulace; s: Soustava; pisty: Pisty } {
  const s = kridlo();
  const stupne = volneStupne(s);
  expect(najdiRovnovahu(s, stupne, new Float64Array(stupne.length), g)).toBeGreaterThanOrEqual(0);
  const pisty = vytvorPisty([{ prvek: 2, zasunuty: s.klidovaDelka[2]!, vysunuty: s.klidovaDelka[2]! + ZDVIH }], 0.25, nejvetsiSila);
  const sim = new Simulace(s, {
    tiha: g,
    utlum: 0.02,
    zatizeni: { pridejSily: () => undefined, posun: (soustava, _cas, dt) => posunPisty(soustava, pisty, dt) },
  });
  return { sim, s, pisty };
}

/** Úhel křídla, při kterém je střed křídla od paty pístu vzdálen `delka`. */
function uhelKridla(delka: number): number {
  // delka² = 29 − 16·cos θ + 24·sin θ; řeší se půlením.
  let od = 0;
  let po = 1.2;
  for (let i = 0; i < 60; i++) {
    const stred = (od + po) / 2;
    if (29 - 16 * Math.cos(stred) + 24 * Math.sin(stred) < delka * delka) od = stred;
    else po = stred;
  }
  return (od + po) / 2;
}

describe("píst", () => {
  it("v klidu drží křídlo silou, jakou dává rovnováha momentů k čepu", () => {
    const { s } = spust(200_000);
    // Moment tíhy k čepu: závaží na 8 m a nosník (8 m po 61,3 kg) na 4 m.
    const moment = ZAVAZI * g * 8 + 8 * 61.3 * g * 4;
    // Rameno pístu k čepu: svislá složka jeho směru (3/√13) krát 4 m.
    const sila = moment / ((4 * 3) / ZASUNUTY);
    expect(-s.osovaSila[2]!).toBeGreaterThan(0.97 * sila);
    expect(-s.osovaSila[2]!).toBeLessThan(1.05 * sila);
    // Klidová délka je o stlačení delší než vzdálenost styčníků.
    expect(s.klidovaDelka[2]!).toBeCloseTo(ZASUNUTY, 9);
  });

  it("vysune se rovnoměrnou rychlostí, zvedne křídlo do úhlu daného svou délkou a zase ho sklopí", () => {
    const { sim, s, pisty } = spust(200_000);
    const klid = s.y[2]!;
    pisty.vysunout = true;
    // Zdvih 1,2 m rychlostí 0,25 m/s trvá 4,8 s.
    while (sim.cas < 2.4) sim.krok();
    expect(s.klidovaDelka[2]!).toBeCloseTo(ZASUNUTY + 0.6, 3);
    expect(pistyVCili(s, pisty)).toBe(false);
    while (sim.cas < 4.9) sim.krok();
    expect(pistyVCili(s, pisty)).toBe(true);
    while (sim.cas < 8) sim.krok();
    const uhel = uhelKridla(ZASUNUTY + ZDVIH);
    expect(uhel).toBeGreaterThan(0.3);
    // Konec křídla je tam, kam ho píst natočil, až na průhyb: čtyři metry nosníku za pístem
    // se pod dvoutunovým závažím prohnou o několik centimetrů.
    expect(s.x[2]!).toBeCloseTo(8 * Math.cos(uhel), 1);
    expect(s.y[2]!).toBeGreaterThan(8 * Math.sin(uhel) - 0.12);
    expect(s.y[2]!).toBeLessThan(8 * Math.sin(uhel) + 0.01);
    // Po zastavení pístu se konec křídla se závažím ještě chvíli houpe, ale doznívá.
    expect(Math.abs(s.vy[2]!)).toBeLessThan(0.2);

    pisty.vysunout = false;
    while (sim.cas < 26) sim.krok();
    expect(pistyVCili(s, pisty)).toBe(true);
    expect(s.y[2]!).toBeCloseTo(klid, 2);
    expect(s.klidovaDelka[2]!).toBe(ZASUNUTY);
    expect(sim.rozpadla).toBe(false);
  });

  it("slabý píst těžké křídlo nezvedne: přetlakový ventil ho zastaví a křídlo zůstane dole", () => {
    // K držení je potřeba asi 53 kN; píst na 60 kN křídlo udrží, ale při zvedání rameno síly
    // klesá a tíha na volném konci ne, takže ho nezvedne celé.
    const { sim, s, pisty } = spust(60_000);
    const klid = s.y[2]!;
    pisty.vysunout = true;
    while (sim.cas < 10) sim.krok();
    expect(pistyVCili(s, pisty)).toBe(false);
    expect(pisty.pretizen[0]).toBe(1);
    expect(s.y[2]!).toBeLessThan(8 * Math.sin(uhelKridla(ZASUNUTY + ZDVIH)) - 0.5);
    expect(s.y[2]!).toBeGreaterThan(klid - 0.05);
    // Síla v pístu nepřekročí jeho největší sílu (až na tlumič, který za pohybu přidá málo).
    expect(-s.osovaSila[2]!).toBeLessThan(1.05 * 60_000);
    expect(sim.rozpadla).toBe(false);
  });

  it("píst slabší, než kolik váží křídlo, ho neudrží ani v klidu: křídlo klesá", () => {
    const { sim, s } = spust(30_000);
    const klid = s.y[2]!;
    while (sim.cas < 1.5) sim.krok();
    expect(s.y[2]!).toBeLessThan(klid - 0.3);
  });
});
