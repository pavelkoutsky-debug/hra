import { describe, expect, it } from "vitest";
import { kinetickaEnergie, krok, spoctiSily, type NastaveniKroku } from "../src/jadro/integrator";
import { nejvyssiFrekvence, vlastniTvarySoustavy, type VlastniTvary } from "../src/jadro/matice";
import { deformacniEnergie } from "../src/jadro/sily";
import { sestavSoustavu, type Soustava } from "../src/jadro/soustava";
import { posunStupne, volneStupne } from "../src/jadro/stupne";
import { vytvorModalniTlumeni } from "../src/jadro/tlumeni";
import { HEB200, nosnik } from "./pomucky-jadra";

const DILU = 8;
const energie = (s: Soustava): number => kinetickaEnergie(s) + deformacniEnergie(s);

interface Pripraveno {
  s: Soustava;
  stupne: Int32Array;
  tvary: VlastniTvary;
  dt: number;
}

/** Prostý nosník 12 m, případně s tlumením úměrným tuhosti. */
function priprav(beta = 0): Pripraveno {
  const popis = nosnik(HEB200, 12, DILU, "prosty");
  for (const p of popis.prvky) p.beta = beta;
  const s = sestavSoustavu(popis);
  const stupne = volneStupne(s);
  const tvary = vlastniTvarySoustavy(s, stupne, 3)!;
  const dt = 0.4 * (2 / nejvyssiFrekvence(s, stupne));
  return { s, stupne, tvary, dt };
}

/**
 * Vychýlí nosník do daného tvaru, nechá ho kmitat `period` period a vrátí poměrný
 * útlum ζ odvozený z úbytku energie: E(t) = E₀·exp(−2·ζ·ω·t).
 */
function zmerUtlum(p: Pripraveno, tvar: number, nastaveni: NastaveniKroku, period = 10): number {
  const { s, stupne, tvary } = p;
  const n = stupne.length;
  const omega = tvary.omega[tvar]!;
  posunStupne(s, stupne, tvary.tvary.subarray(tvar * n, (tvar + 1) * n), 0.05);
  spoctiSily(s, 0, 0);
  const pocatecni = energie(s);
  const kroku = Math.round((period * 2 * Math.PI) / omega / nastaveni.dt);
  for (let i = 0; i < kroku; i++) krok(s, nastaveni);
  return -Math.log(energie(s) / pocatecni) / (2 * omega * kroku * nastaveni.dt);
}

describe("tlumení úměrné hmotě", () => {
  it("dává tvaru útlum α/(2ω): nižším tvarům víc, vyšším míň", () => {
    const zeta1 = 0.01;
    const a = priprav();
    const alfa = 2 * zeta1 * a.tvary.omega[0]!;
    expect(zmerUtlum(a, 0, { dt: a.dt, tiha: 0, alfa }) / zeta1).toBeCloseTo(1, 2);
    const b = priprav();
    const ocekavany = alfa / (2 * b.tvary.omega[1]!);
    expect(zmerUtlum(b, 1, { dt: b.dt, tiha: 0, alfa }) / ocekavany).toBeCloseTo(1, 2);
    expect(ocekavany).toBeLessThan(zeta1 / 3.5); // druhý tvar má čtyřnásobnou frekvenci
  });
});

describe("tlumení úměrné tuhosti", () => {
  it("dává tvaru útlum β·ω/2: vyšším tvarům víc", () => {
    const beta = 1e-4;
    for (const tvar of [0, 1]) {
      const p = priprav(beta);
      const ocekavany = (beta * p.tvary.omega[tvar]!) / 2;
      expect(zmerUtlum(p, tvar, { dt: p.dt * 0.5, tiha: 0, alfa: 0 }) / ocekavany).toBeCloseTo(1, 2);
    }
  });

  it("pohyb prvku jako tuhého celku netlumí", () => {
    // Volný prut letící a rotující prostorem si drží energii i s velkým β.
    const popis = nosnik(HEB200, 4, 2, "prosty");
    for (const st of popis.stycniky) Object.assign(st, { pevneX: false, pevneY: false });
    for (const p of popis.prvky) p.beta = 1e-3;
    const s = sestavSoustavu(popis);
    const uhlova = 2;
    for (let i = 0; i < s.pocetStycniku; i++) {
      // Posuv rychlostí (3; 1) m/s a otáčení kolem prostředního styčníku.
      s.vx[i] = 3 - uhlova * (s.y[i]! - 0);
      s.vy[i] = 1 + uhlova * (s.x[i]! - 2);
      s.omega[i] = uhlova;
    }
    spoctiSily(s, 0, 0);
    const pocatecni = energie(s);
    const dt = 0.1 * (2 / nejvyssiFrekvence(s, volneStupne(s)));
    for (let i = 0; i < 40_000; i++) krok(s, { dt, tiha: 0, alfa: 0 });
    // Odstředivá síla prut nepatrně natáhne a toto kmitání se utlumí; ztráta je zlomek promile.
    expect(energie(s) / pocatecni).toBeGreaterThan(0.9995);
    expect(energie(s) / pocatecni).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("tlumení vlastních tvarů", () => {
  const zeta = 0.01;

  it("dává každému tlumenému tvaru přesně zadaný útlum", () => {
    for (const tvar of [0, 1, 2]) {
      const p = priprav();
      const modalni = vytvorModalniTlumeni(p.s, p.stupne, p.tvary, zeta, p.dt);
      expect(zmerUtlum(p, tvar, { dt: p.dt, tiha: 0, alfa: 0, modalni }) / zeta).toBeCloseTo(1, 2);
    }
  });

  it("umí jiný útlum pro každý tvar", () => {
    const utlumy = Float64Array.from([0.005, 0.02, 0.01]);
    for (const tvar of [0, 1]) {
      const p = priprav();
      const modalni = vytvorModalniTlumeni(p.s, p.stupne, p.tvary, utlumy, p.dt);
      expect(zmerUtlum(p, tvar, { dt: p.dt, tiha: 0, alfa: 0, modalni }) / utlumy[tvar]!).toBeCloseTo(1, 2);
    }
  });

  it("síly stačí přepočítávat jednou za několik kroků", () => {
    const p = priprav();
    const modalni = vytvorModalniTlumeni(p.s, p.stupne, p.tvary, zeta, p.dt);
    expect(modalni.interval).toBeGreaterThan(1);
    // Nejrychlejší tlumený tvar se za dobu držení síly pootočí nejvýš o 0,1 rad.
    expect(modalni.interval * p.dt * p.tvary.omega[2]!).toBeLessThanOrEqual(0.1);
  });

  it("tvar, který tlumený není, nechá kmitat dál", () => {
    const p = priprav();
    const jenPrvni: VlastniTvary = {
      omega: p.tvary.omega.subarray(0, 1),
      tvary: p.tvary.tvary.subarray(0, p.stupne.length),
      stupnu: p.stupne.length,
    };
    const modalni = vytvorModalniTlumeni(p.s, p.stupne, jenPrvni, zeta, p.dt);
    expect(Math.abs(zmerUtlum(p, 1, { dt: p.dt, tiha: 0, alfa: 0, modalni }))).toBeLessThan(1e-5);
  });
});
