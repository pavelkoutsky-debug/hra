import { describe, expect, it } from "vitest";
import { kinetickaEnergie, krok, spoctiSily } from "../src/jadro/integrator";
import { nejvyssiFrekvence } from "../src/jadro/matice";
import { deformacniEnergie } from "../src/jadro/sily";
import { sestavSoustavu } from "../src/jadro/soustava";
import { betaProUtlum, mezKroku, zvolKrok } from "../src/jadro/stabilita";
import { volneStupne } from "../src/jadro/stupne";
import { HEB200, nosnik } from "./pomucky-jadra";

/** Svařený nosník z metrových dílů s tlumením úměrným tuhosti; vydrží 6000 kroků délky dt? */
function jeStabilni(beta: number, dt: number): boolean {
  const popis = nosnik(HEB200, 4, 4, "prosty");
  for (const p of popis.prvky) p.beta = beta;
  const s = sestavSoustavu(popis);
  let stav = 99;
  const nahodne = (): number => {
    stav = (Math.imul(stav, 1103515245) + 12345) & 0x7fffffff;
    return 1e-3 * (stav / 0x7fffffff - 0.5);
  };
  for (let i = 0; i < s.pocetStycniku; i++) {
    if (s.invHmotaX[i] !== 0) s.vx[i] = nahodne();
    if (s.invHmotaY[i] !== 0) s.vy[i] = nahodne();
    if (s.invSetrvacnost[i] !== 0) s.omega[i] = nahodne();
  }
  spoctiSily(s, 0, 0);
  const pocatecni = kinetickaEnergie(s) + deformacniEnergie(s);
  for (let i = 0; i < 6000; i++) krok(s, { dt, tiha: 0, alfa: 0 });
  const konecna = kinetickaEnergie(s) + deformacniEnergie(s);
  return Number.isFinite(konecna) && konecna < 50 * pocatecni;
}

describe("volba kroku", () => {
  const s = sestavSoustavu(nosnik(HEB200, 4, 4, "prosty"));
  const omegaMax = nejvyssiFrekvence(s, volneStupne(s));

  it("bez tlumení je mez 2/ω_max", () => {
    expect(mezKroku(omegaMax)).toBe(2 / omegaMax);
  });

  it("tlumení úměrné tuhosti mez zkracuje přesně podle vzorce", () => {
    for (const xi of [0.1, 0.5, 2]) {
      const beta = betaProUtlum(omegaMax, xi);
      const mez = mezKroku(omegaMax, xi);
      expect(jeStabilni(beta, 0.97 * mez)).toBe(true);
      expect(jeStabilni(beta, 1.03 * mez)).toBe(false);
    }
  });

  it("zvolený krok je stabilní a stojí asi o čtvrtinu kroků víc než holá mez", () => {
    const dt = zvolKrok(omegaMax);
    expect(jeStabilni(betaProUtlum(omegaMax), dt)).toBe(true);
    expect(2 / omegaMax / dt).toBeCloseTo(1.23, 2);
  });

  it("tlumit nízké frekvence přes tuhost by krok zkrátilo mnohonásobně", () => {
    // Půl procenta útlumu na 2 Hz znamená u této soustavy ξ ≈ 4 na nejvyšší frekvenci.
    const xi = (0.005 * omegaMax) / (2 * Math.PI * 2);
    expect(mezKroku(omegaMax) / mezKroku(omegaMax, xi)).toBeGreaterThan(7);
  });
});
