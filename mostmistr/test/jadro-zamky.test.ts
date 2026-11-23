// Dělicí zámky: konec křídla na opěře a zámek mezi dvěma křídly sklopného mostu.
import { describe, expect, it } from "vitest";
import { TIHOVE_ZRYCHLENI as g } from "../src/jadro/integrator";
import { najdiRovnovahu } from "../src/jadro/matice";
import { pistyVCili, posunPisty, vytvorPisty, type Pisty } from "../src/jadro/pisty";
import { Simulace } from "../src/jadro/simulace";
import { popisPruziny, prepoctiHmoty, sestavSoustavu, type PopisSoustavy, type Soustava } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import {
  odemkniZamky,
  pridavnaFrekvenceZamku,
  pridejSilyZamku,
  vytvorZamky,
  zamkniZamky,
  zamkyZamcene,
  ZAMEK_ODEMCENY,
  ZAMEK_ZAPADLY,
  type PopisZamku,
  type Zamky,
} from "../src/jadro/zamky";
import { HEB200 } from "./pomucky-jadra";

const TUHOST_PISTU = 50e6;
const ZDVIH = 1;

interface Most {
  sim: Simulace;
  s: Soustava;
  pisty: Pisty;
  zamky: Zamky;
}

function postav(popis: PopisSoustavy, pistyPrvky: number[], zamkyPopis: PopisZamku[], rychlost = 0.25): Most {
  const s = sestavSoustavu(popis);
  const stupne = volneStupne(s);
  expect(najdiRovnovahu(s, stupne, new Float64Array(stupne.length), g)).toBeGreaterThanOrEqual(0);
  const pisty = vytvorPisty(
    pistyPrvky.map((prvek) => ({ prvek, zasunuty: s.klidovaDelka[prvek]!, vysunuty: s.klidovaDelka[prvek]! + ZDVIH })),
    rychlost,
    400_000,
  );
  const zamky = vytvorZamky(s, zamkyPopis, 200e6, 0.3);
  const sim = new Simulace(s, {
    tiha: g,
    utlum: 0.02,
    zatizeni: {
      pridejSily: (soustava) => pridejSilyZamku(soustava, zamky),
      posun: (soustava, _cas, dt) => posunPisty(soustava, pisty, dt),
      pridavnaFrekvence: (soustava) => pridavnaFrekvenceZamku(soustava, zamky),
    },
  });
  return { sim, s, pisty, zamky };
}

/** Jedno křídlo: čep v počátku, konec (8, 0) leží na posuvné opěře, píst z (2, −3) do (4, 0). */
function jednoKridlo(): PopisSoustavy {
  return {
    stycniky: [
      { x: 0, y: 0, pevneX: true, pevneY: true },
      { x: 4, y: 0 },
      { x: 8, y: 0, pevneY: true, hmota: 500 },
      { x: 2, y: -3, pevneX: true, pevneY: true },
    ],
    prvky: [
      { ...HEB200, a: 0, b: 1, kloubA: true },
      { ...HEB200, a: 1, b: 2, kloubB: true },
      popisPruziny(3, 1, TUHOST_PISTU, 2e5, 50),
    ],
  };
}

/** Dvě křídla s čepy v (0, 0) a (16, 0), která se potkávají ve společném styčníku (8, 0). */
function dveKridla(): PopisSoustavy {
  return {
    stycniky: [
      { x: 0, y: 0, pevneX: true, pevneY: true },
      { x: 4, y: 0 },
      { x: 8, y: 0, hmota: 200 },
      { x: 12, y: 0 },
      { x: 16, y: 0, pevneX: true, pevneY: true },
      { x: 2, y: -3, pevneX: true, pevneY: true },
      { x: 14, y: -3, pevneX: true, pevneY: true },
    ],
    prvky: [
      { ...HEB200, a: 0, b: 1, kloubA: true },
      { ...HEB200, a: 1, b: 2, kloubB: true },
      { ...HEB200, a: 2, b: 3, kloubA: true },
      { ...HEB200, a: 3, b: 4, kloubB: true },
      popisPruziny(5, 1, TUHOST_PISTU, 2e5, 50),
      popisPruziny(6, 3, TUHOST_PISTU, 2e5, 50),
    ],
  };
}

function bez(most: Most, doCasu: number): void {
  while (most.sim.cas < doCasu) most.sim.krok();
}

describe("zámek na opěře", () => {
  it("zamčený je podpora; odemčený pustí konec křídla vzhůru a při sklopení ho zachytí dosedací plocha", () => {
    const most = postav(jednoKridlo(), [2], [{ stycnik: 2, prvky: [] }]);
    const { s, sim, pisty, zamky } = most;
    expect(zamkyZamcene(zamky)).toBe(true);
    expect(s.invHmotaY[2]).toBe(0);
    // Zamčený konec se nezvedne, ani když píst tlačí: drží ho podpora.
    pisty.vysunout = true;
    bez(most, 1);
    expect(s.y[2]).toBe(0);
    pisty.vysunout = false;
    bez(most, 3);

    expect(odemkniZamky(s, zamky)).toBe(1);
    sim.poZmeneStavby();
    expect(zamky.stav[0]).toBe(ZAMEK_ODEMCENY);
    expect(s.invHmotaY[2]!).toBeGreaterThan(0);
    pisty.vysunout = true;
    bez(most, 9);
    expect(pistyVCili(s, pisty)).toBe(true);
    expect(s.y[2]!).toBeGreaterThan(2);
    // Zvednutý konec nezamkneš: opěra je daleko.
    expect(zamkniZamky(s, zamky)).toBe(0);

    pisty.vysunout = false;
    zamky.nejvetsiSila[0] = 0;
    bez(most, 20);
    expect(pistyVCili(s, pisty)).toBe(true);
    // Konec leží zpátky na opěře (dosedací plocha se pod ním stlačí o zlomek milimetru).
    expect(s.y[2]!).toBeLessThan(0.002);
    expect(s.y[2]!).toBeGreaterThan(-0.005);
    expect(Math.abs(s.vy[2]!)).toBeLessThan(0.05);
    expect(zamkniZamky(s, zamky)).toBe(1);
    sim.poZmeneStavby();
    expect(zamky.stav[0]).toBe(ZAMEK_ZAPADLY);
    expect(zamkyZamcene(zamky)).toBe(true);
    expect(s.invHmotaY[2]).toBe(0);
    // Vodorovně zůstal konec volný jako na posuvném ložisku.
    expect(s.invHmotaX[2]!).toBeGreaterThan(0);
    const dosedl = s.y[2]!;
    bez(most, 22);
    expect(s.y[2]).toBe(dosedl);
    expect(sim.rozpadla).toBe(false);
  });

  it("rychlé sklápění udeří do opěry víc než pomalé", () => {
    const raz = (rychlost: number): number => {
      const most = postav(jednoKridlo(), [2], [{ stycnik: 2, prvky: [] }], rychlost);
      odemkniZamky(most.s, most.zamky);
      most.sim.poZmeneStavby();
      most.pisty.vysunout = true;
      bez(most, ZDVIH / rychlost + 2);
      most.pisty.vysunout = false;
      bez(most, 2 * (ZDVIH / rychlost) + 6);
      expect(most.s.y[2]!).toBeLessThan(0.002);
      return most.zamky.nejvetsiSila[0]!;
    };
    const pomalu = raz(0.1);
    const rychle = raz(0.5);
    // Klidová reakce konce je řádu kilonewtonů; ráz ji mnohonásobně převýší a roste s rychlostí.
    expect(pomalu).toBeGreaterThan(5_000);
    expect(rychle).toBeGreaterThan(2 * pomalu);
  });
});

describe("zámek mezi křídly", () => {
  it("zamčená křídla nesou břemeno uprostřed společně; odemčená se rozejdou a po sklopení zase zapadnou", () => {
    // Prvky 2 a 3 jsou pravé křídlo: při odemknutí přejdou na nový styčník.
    const most = postav(dveKridla(), [4, 5], [{ stycnik: 2, prvky: [2] }]);
    const { s, sim, pisty, zamky } = most;
    const stycniku = s.pocetStycniku;
    const klid = s.y[2]!;

    expect(odemkniZamky(s, zamky)).toBe(1);
    sim.poZmeneStavby();
    expect(s.pocetStycniku).toBe(stycniku + 1);
    const pravy = zamky.druhy[0]!;
    expect(pravy).toBe(stycniku);
    expect(s.prvekA[2]).toBe(pravy);
    pisty.vysunout = true;
    bez(most, 6);
    expect(pistyVCili(s, pisty)).toBe(true);
    // Konce křídel se zvedly a rozešly: levý ujel doleva, pravý doprava.
    expect(s.y[2]!).toBeGreaterThan(1.5);
    expect(s.y[pravy]!).toBeGreaterThan(1.5);
    expect(s.x[pravy]! - s.x[2]!).toBeGreaterThan(0.5);
    expect(zamkniZamky(s, zamky)).toBe(0);

    pisty.vysunout = false;
    bez(most, 14);
    expect(pistyVCili(s, pisty)).toBe(true);
    expect(Math.abs(s.x[pravy]! - s.x[2]!)).toBeLessThan(0.03);
    expect(Math.abs(s.y[pravy]! - s.y[2]!)).toBeLessThan(0.03);
    expect(zamkniZamky(s, zamky)).toBe(1);
    sim.poZmeneStavby();
    expect(zamky.stav[0]).toBe(ZAMEK_ZAPADLY);
    bez(most, 18);
    // Čep drží konce u sebe na zlomek milimetru a most se vrátil do původní výšky.
    expect(Math.abs(s.y[pravy]! - s.y[2]!)).toBeLessThan(0.001);
    expect(s.y[2]!).toBeCloseTo(klid, 2);

    // Tuna na levém konci: přes zamčený čep ji nesou obě křídla, takže klesnou oba konce stejně.
    s.hmotaNavic[2] = s.hmotaNavic[2]! + 1000;
    prepoctiHmoty(s);
    sim.poZmeneStavby();
    bez(most, 24);
    const pokles = klid - s.y[2]!;
    expect(pokles).toBeGreaterThan(0.0005);
    expect(klid - s.y[pravy]!).toBeGreaterThan(0.8 * pokles);
    expect(sim.rozpadla).toBe(false);
  });
});
