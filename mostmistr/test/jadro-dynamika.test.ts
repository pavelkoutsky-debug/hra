import { describe, expect, it } from "vitest";
import { kinetickaEnergie, krok, polohovaEnergie, spoctiSily, TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { nejvyssiFrekvence, vlastniTvarySoustavy } from "../src/jadro/matice";
import { deformacniEnergie } from "../src/jadro/sily";
import { sestavSoustavu, setrvacnostKonce, type Soustava } from "../src/jadro/soustava";
import { posunStupne, volneStupne } from "../src/jadro/stupne";
import { HEB200, HEB200_BEZ_SMYKU, nosnik } from "./pomucky-jadra";

/** Malé pseudonáhodné rychlosti ve všech volných stupních: vybudí všechny tvary včetně nejvyšších. */
function rozhybejNahodne(s: Soustava, velikost: number): void {
  let stav = 4242;
  const nahodne = (): number => {
    stav = (Math.imul(stav, 1103515245) + 12345) & 0x7fffffff;
    return stav / 0x7fffffff - 0.5;
  };
  for (let i = 0; i < s.pocetStycniku; i++) {
    if (s.invHmotaX[i] !== 0) s.vx[i] = velikost * nahodne();
    if (s.invHmotaY[i] !== 0) s.vy[i] = velikost * nahodne();
    if (s.invSetrvacnost[i] !== 0) s.omega[i] = velikost * nahodne();
  }
}

const celkovaEnergie = (s: Soustava, tiha: number): number =>
  kinetickaEnergie(s) + deformacniEnergie(s) + polohovaEnergie(s, tiha);

describe("mez stability explicitní integrace", () => {
  // Svařovaný nosník z metrových dílů: nejkratší pruty, jaké hra dovolí.
  const priprav = (): { s: Soustava; omegaMax: number } => {
    const s = sestavSoustavu(nosnik(HEB200, 4, 4, "prosty"));
    const omegaMax = nejvyssiFrekvence(s, volneStupne(s));
    rozhybejNahodne(s, 1e-3);
    spoctiSily(s, 0, 0);
    return { s, omegaMax };
  };

  it("těsně pod krokem 2/ω_max zůstává energie omezená", () => {
    const { s, omegaMax } = priprav();
    const pocatecni = celkovaEnergie(s, 0);
    const nastaveni = { dt: (0.98 * 2) / omegaMax, tiha: 0, alfa: 0 };
    let nejvetsi = 0;
    for (let i = 0; i < 20_000; i++) {
      krok(s, nastaveni);
      if (i % 50 === 0) nejvetsi = Math.max(nejvetsi, celkovaEnergie(s, 0));
    }
    // Blízko meze stability energie nejvyšších tvarů kolísá, ale neroste.
    expect(nejvetsi / pocatecni).toBeLessThan(30);
    expect(nejvetsi / pocatecni).toBeGreaterThan(0.5);
  });

  it("těsně nad krokem 2/ω_max výpočet diverguje", () => {
    const { s, omegaMax } = priprav();
    const pocatecni = celkovaEnergie(s, 0);
    const nastaveni = { dt: (1.02 * 2) / omegaMax, tiha: 0, alfa: 0 };
    for (let i = 0; i < 2_000; i++) krok(s, nastaveni);
    // Energie buď vyroste o mnoho řádů, nebo přeteče do neplatného čísla.
    const pomer = celkovaEnergie(s, 0) / pocatecni;
    expect(pomer > 1e6 || !Number.isFinite(pomer)).toBe(true);
  });

  it("nejvyšší frekvenci svařovaného nosníku určuje podélná vlna, ne ohyb", () => {
    const { omegaMax } = priprav();
    // Řetěz čtyř metrových prvků s jedním koncem volným v podélném směru má nejvyšší
    // osovou frekvenci nejvýš 2·c/L; ohyb by ji bez úpravy rotační setrvačnosti převýšil.
    const c = Math.sqrt(HEB200.EA / HEB200.hmotnostNaMetr);
    expect(omegaMax).toBeLessThanOrEqual(2 * c * 1.0001);
    expect(omegaMax).toBeGreaterThan(1.8 * c);
  });
});

describe("rotační setrvačnost konce prvku", () => {
  it("volný prvek má nejvyšší frekvenci rovnou své osové frekvenci", () => {
    // Samostatný prvek bez podpor; tři nulové frekvence tuhého pohybu mocninná metoda mine.
    for (const [delka, kloubA] of [[1, false], [3, false], [1, true], [6, true]] as const) {
      const popis = nosnik(HEB200, delka, 1, "prosty");
      for (const st of popis.stycniky) Object.assign(st, { pevneX: false, pevneY: false });
      if (kloubA) popis.prvky[0]!.kloubA = true;
      const s = sestavSoustavu(popis);
      const osova = Math.sqrt((4 * HEB200.EA) / (HEB200.hmotnostNaMetr * delka * delka));
      expect(nejvyssiFrekvence(s, volneStupne(s)) / osova).toBeCloseTo(1, 4);
    }
  });

  it("u štíhlého prutu je to zhruba 1,5·m·r², zlomek hodnoty m·L²/24", () => {
    const m = 100;
    const r = 0.1;
    const L = 6;
    const J = setrvacnostKonce(m, L, r, 0, false);
    expect(J / (1.5 * m * r * r)).toBeCloseTo(1, 1);
    expect(J).toBeLessThan((m * L * L) / 24 / 50);
  });

  it("nikdy není menší než skutečná setrvačnost průřezu", () => {
    for (const fi of [0, 1, 5, 50]) {
      expect(setrvacnostKonce(100, 1, 0.3, fi, false)).toBeGreaterThanOrEqual(0.5 * 100 * 0.09);
    }
  });
});

describe("přesnost vlastních frekvencí", () => {
  const L = 12;
  const presna = (n: number): number =>
    ((n * Math.PI) / L) ** 2 * Math.sqrt(HEB200.EI / HEB200.hmotnostNaMetr);
  const chyba = (dilu: number, tvar: number): number => {
    const s = sestavSoustavu(nosnik(HEB200_BEZ_SMYKU, L, dilu, "prosty"));
    const tvary = vlastniTvarySoustavy(s, volneStupne(s), 3)!;
    return tvary.omega[tvar - 1]! / presna(tvar) - 1;
  };

  it("prostý nosník ze dvou dílů má první frekvenci s chybou pod 1 %", () => {
    expect(Math.abs(chyba(2, 1))).toBeLessThan(0.01);
  });

  it("ze čtyř dílů má první frekvenci pod 0,2 % a druhou pod 1,5 %", () => {
    expect(Math.abs(chyba(4, 1))).toBeLessThan(0.002);
    expect(Math.abs(chyba(4, 2))).toBeLessThan(0.015);
  });

  it("frekvence se soustředěnou hmotou vychází vždy o něco níž, nikdy výš", () => {
    for (const dilu of [2, 4, 8]) expect(chyba(dilu, 1)).toBeLessThan(0);
  });
});

describe("volné kmitání v čase", () => {
  it("perioda prvního tvaru odpovídá maticovému výpočtu", () => {
    const dilu = 8;
    const s = sestavSoustavu(nosnik(HEB200, 12, dilu, "prosty"));
    const stupne = volneStupne(s);
    const tvary = vlastniTvarySoustavy(s, stupne, 1)!;
    const omega1 = tvary.omega[0]!;
    // Vychýlit do prvního tvaru s průhybem uprostřed kolem 1 mm a pustit.
    const tvar = tvary.tvary.subarray(0, stupne.length);
    const uprostred = Math.abs(tvar[stupne.indexOf(3 * (dilu / 2) + 1)]!);
    posunStupne(s, stupne, tvar, 1e-3 / uprostred);
    spoctiSily(s, 0, 0);

    const dt = 0.5 * (2 / nejvyssiFrekvence(s, stupne));
    const nastaveni = { dt, tiha: 0, alfa: 0 };
    const stred = dilu / 2;
    let predchozi = s.y[stred]!;
    const pruchody: number[] = [];
    for (let i = 1; pruchody.length < 11; i++) {
      krok(s, nastaveni);
      const y = s.y[stred]!;
      // Průchod nulou jedním směrem, čas dopočítaný lineárně mezi kroky.
      if (predchozi < 0 && y >= 0) pruchody.push((i - 1 + predchozi / (predchozi - y)) * dt);
      predchozi = y;
      if (i > 5_000_000) throw new Error("kmitání se nerozběhlo");
    }
    const perioda = (pruchody[10]! - pruchody[0]!) / 10;
    expect(perioda / ((2 * Math.PI) / omega1)).toBeCloseTo(1, 4);
  });

  it("energie se při velkých rotacích zachovává: prut padající jako kyvadlo", () => {
    // Vodorovný svařovaný prut zavěšený kloubově za levý konec, puštěný v tíhovém poli.
    const L = 4;
    const popis = nosnik(HEB200, L, 2, "prosty");
    popis.stycniky[2]!.pevneY = false;
    popis.prvky[0]!.kloubA = true;
    const s = sestavSoustavu(popis);
    const stupne = volneStupne(s);
    spoctiSily(s, TIHOVE_ZRYCHLENI, 0);
    const pocatecni = celkovaEnergie(s, TIHOVE_ZRYCHLENI);
    const meritko = HEB200.hmotnostNaMetr * L * TIHOVE_ZRYCHLENI * (L / 2); // energie uvolněná pádem

    const dt = 0.5 * (2 / nejvyssiFrekvence(s, stupne));
    const nastaveni = { dt, tiha: TIHOVE_ZRYCHLENI, alfa: 0 };
    let nejvetsiOdchylka = 0;
    let nejnizsiKonec = 0;
    const kroku = Math.round(3 / dt); // tři sekundy: víc než jeden celý kyv
    for (let i = 0; i < kroku; i++) {
      krok(s, nastaveni);
      nejnizsiKonec = Math.min(nejnizsiKonec, s.y[2]!);
      if (i % 20 === 0) {
        nejvetsiOdchylka = Math.max(nejvetsiOdchylka, Math.abs(celkovaEnergie(s, TIHOVE_ZRYCHLENI) - pocatecni));
      }
    }
    expect(nejnizsiKonec).toBeLessThan(-0.99 * L); // prut se opravdu překlopil do svislé polohy
    expect(nejvetsiOdchylka / meritko).toBeLessThan(1e-6);
  });
});
