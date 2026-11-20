import { describe, expect, it } from "vitest";
import { BEZ_OPORY, NA_ZEMI, vytvorBremena, zatizeniBremeny, type PopisBremene } from "../src/jadro/bremena";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { vlastniTvarySoustavy } from "../src/jadro/matice";
import { Simulace, type Zatizeni } from "../src/jadro/simulace";
import { prepoctiHmoty, sestavSoustavu, type Soustava } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import { rozdelPrvek } from "../src/jadro/topologie";
import { vytvorTrasu } from "../src/jadro/trasa";
import { HEB200_BEZ_SMYKU, nosnik } from "./pomucky-jadra";

const L = 20;
const DILU = 20;
const STRED = DILU / 2;
const EI = HEB200_BEZ_SMYKU.EI;
const MU = HEB200_BEZ_SMYKU.hmotnostNaMetr;
/** Vlastní kruhová frekvence n-tého tvaru prostého nosníku. */
const omegaN = (n: number): number => ((n * Math.PI) / L) ** 2 * Math.sqrt(EI / MU);
/** Rychlost, při které doba přejezdu odpovídá půlperiodě prvního tvaru. */
const KRITICKA_RYCHLOST = (omegaN(1) * L) / Math.PI;

function most(): Soustava {
  return sestavSoustavu(nosnik(HEB200_BEZ_SMYKU, L, DILU, "prosty"));
}

function vsechnyPruty(s: Soustava): number[] {
  return Array.from({ length: s.pocetPrvku }, (_, e) => e);
}

/** Průhyb středu nosníku v čase při přejezdu; vzorky po `interval` sekundách. */
function prubeh(sim: Simulace, stycnik: number, trvani: number, interval: number): number[] {
  const vzorky: number[] = [];
  let dalsi = 0;
  while (sim.cas < trvani) {
    if (sim.cas >= dalsi) {
      vzorky.push(sim.soustava.y[stycnik]!);
      dalsi += interval;
    }
    sim.krok();
  }
  return vzorky;
}

/** Největší odchylka dvou průběhů vztažená k největší hodnotě druhého. */
function odchylka(namereno: number[], ocekavano: number[]): number {
  const meritko = Math.max(...ocekavano.map(Math.abs));
  let nejvetsi = 0;
  for (let i = 0; i < Math.min(namereno.length, ocekavano.length); i++) {
    nejvetsi = Math.max(nejvetsi, Math.abs(namereno[i]! - ocekavano[i]!));
  }
  return nejvetsi / meritko;
}

describe("přejezd stálé síly po prostém nosníku", () => {
  const P = 10_000;

  /** Frýbovo řešení netlumeného nosníku: průhyb v místě x a čase t (síla je na nosníku). */
  function frybuv(x: number, t: number, v: number): number {
    let w = 0;
    for (let n = 1; n <= 40; n++) {
      const omega = omegaN(n);
      const budici = (n * Math.PI * v) / L;
      w -=
        ((2 * P) / (MU * L)) *
        Math.sin((n * Math.PI * x) / L) *
        ((Math.sin(budici * t) - (budici / omega) * Math.sin(omega * t)) / (omega * omega - budici * budici));
    }
    return w;
  }

  for (const pomer of [0.1, 0.25, 0.5]) {
    it(`při rychlosti ${pomer}·v_kr odpovídá průhyb středu Frýbovu řešení`, () => {
      const v = pomer * KRITICKA_RYCHLOST;
      const s = most();
      const bremena = vytvorBremena(vytvorTrasu(s, vsechnyPruty(s)), [{ x: 0, rychlost: v, tiha: P }]);
      const sim = new Simulace(s, { tiha: 0, utlum: 0, zatizeni: zatizeniBremeny(bremena) });
      const interval = L / v / 200;
      const namereno = prubeh(sim, STRED, L / v, interval);
      const ocekavano = namereno.map((_, i) => frybuv(L / 2, i * interval, v));
      // Vzorky se berou v nejbližším kroku po zvoleném čase, což samo dělá zlomek procenta.
      expect(odchylka(namereno, ocekavano)).toBeLessThan(0.01);
      // Dynamický součinitel: největší průhyb proti statickému P·L³/(48·EI).
      const staticky = (P * L ** 3) / (48 * EI);
      const dynamicky = Math.max(...namereno.map(Math.abs)) / staticky;
      const ocekavany = Math.max(...ocekavano.map(Math.abs)) / staticky;
      expect(dynamicky).toBeCloseTo(ocekavany, 2);
    });
  }

  it("síla jedoucí zprava doleva dá zrcadlový výsledek", () => {
    const v = 0.25 * KRITICKA_RYCHLOST;
    const ctvrtina = DILU / 4;
    const behy = [
      { x: 0, rychlost: v, stycnik: ctvrtina },
      { x: L, rychlost: -v, stycnik: DILU - ctvrtina },
    ].map((b) => {
      const s = most();
      const bremena = vytvorBremena(vytvorTrasu(s, vsechnyPruty(s)), [{ x: b.x, rychlost: b.rychlost, tiha: P }]);
      const sim = new Simulace(s, { tiha: 0, utlum: 0, zatizeni: zatizeniBremeny(bremena) });
      return prubeh(sim, b.stycnik, L / v, L / v / 100);
    });
    // Podpory nejsou zrcadlové (kloub vlevo, posuv vpravo), ale na svislý průhyb to vliv nemá.
    expect(odchylka(behy[1]!, behy[0]!)).toBeLessThan(1e-3);
  });

  it("za koncem mostu síla nepůsobí a nosník dál volně kmitá", () => {
    const v = 0.5 * KRITICKA_RYCHLOST;
    const s = most();
    const bremena = vytvorBremena(vytvorTrasu(s, vsechnyPruty(s)), [{ x: 0, rychlost: v, tiha: P }]);
    const sim = new Simulace(s, { tiha: 0, utlum: 0, zatizeni: zatizeniBremeny(bremena) });
    while (sim.cas < L / v + 0.2) sim.krok();
    expect(bremena.prvek[0]).toBe(NA_ZEMI);
    expect(bremena.x[0]!).toBeGreaterThan(L);
    // Reakce podpor kmitají kolem nuly: žádná stálá síla na nosníku nezbyla.
    let soucet = 0;
    let kroku = 0;
    const perioda = (2 * Math.PI) / omegaN(1);
    const konec = sim.cas + 4 * perioda;
    while (sim.cas < konec) {
      sim.krok();
      soucet += s.fy[0]! + s.fy[DILU]!;
      kroku++;
    }
    expect(Math.abs(soucet / kroku)).toBeLessThan(0.01 * P);
  });

  it("rozdělení prvku mostovky za jízdy průběh nezmění", () => {
    const v = 0.25 * KRITICKA_RYCHLOST;
    const behy = [false, true].map((delit) => {
      const s = most();
      const bremena = vytvorBremena(vytvorTrasu(s, vsechnyPruty(s)), [{ x: 0, rychlost: v, tiha: P }]);
      const sim = new Simulace(s, { tiha: 0, utlum: 0, zatizeni: zatizeniBremeny(bremena) });
      const vzorky: number[] = [];
      let rozdeleno = false;
      // Po rozdělení se zkrátí krok, proto se vzorkuje podle času, ne podle počtu kroků.
      const interval = L / v / 100;
      let dalsi = interval;
      while (sim.cas < L / v) {
        if (delit && !rozdeleno && sim.cas > (0.3 * L) / v) {
          // Prvek před silou i prvek právě pod ní.
          rozdelPrvek(s, 12, 0.4);
          rozdelPrvek(s, bremena.prvek[0]!, 0.5);
          prepoctiHmoty(s);
          sim.poZmeneStavby();
          rozdeleno = true;
        }
        sim.krok();
        if (sim.cas >= dalsi) {
          vzorky.push(s.y[STRED]!);
          dalsi += interval;
        }
      }
      return vzorky;
    });
    // Dělení přesouvá hmotu mezi styčníky, proto shoda není bitová.
    expect(odchylka(behy[1]!, behy[0]!)).toBeLessThan(0.01);
  });
});

/** Krok Rungeho–Kuttovy metody čtvrtého řádu pro y' = f(t, y). */
function rk4(f: (t: number, y: number[]) => number[], t: number, y: number[], h: number): number[] {
  const k1 = f(t, y);
  const k2 = f(t + h / 2, y.map((v, i) => v + (h / 2) * k1[i]!));
  const k3 = f(t + h / 2, y.map((v, i) => v + (h / 2) * k2[i]!));
  const k4 = f(t + h, y.map((v, i) => v + h * k3[i]!));
  return y.map((v, i) => v + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!));
}

describe("přejezd odpružené hmoty", () => {
  const hmota = 1500;
  const tuhost = hmota * (2 * Math.PI * 1.9) ** 2; // vlastní frekvence 1,9 Hz, blízko první frekvence nosníku
  const tlumeni = 2 * 0.05 * Math.sqrt(tuhost * hmota);
  const v = 0.3 * KRITICKA_RYCHLOST;
  const NABEH = 1; // metry před mostem
  const TVARU = 8;

  /**
   * Nezávislé řešení: nosník rozložený do vlastních tvarů sin(nπx/L) a hmota na pružině,
   * integrováno metodou Rungeho–Kutty. Vrací průhyb středu a výšku hmoty v časech vzorků.
   */
  function reference(casy: number[]): { stred: number[]; hmotaY: number[] } {
    // Stav: q_1..q_N, q'_1..q'_N, z, z'. Čas 0 je okamžik vjezdu na most.
    const f = (t: number, y: number[]): number[] => {
      const x = v * t;
      let w = 0;
      let rychlostW = 0;
      const tvar: number[] = [];
      for (let n = 1; n <= TVARU; n++) {
        const k = (n * Math.PI) / L;
        const sn = Math.sin(k * x);
        tvar.push(sn);
        w += y[n - 1]! * sn;
        rychlostW += y[TVARU + n - 1]! * sn + y[n - 1]! * k * v * Math.cos(k * x);
      }
      const z = y[2 * TVARU]!;
      const rychlostZ = y[2 * TVARU + 1]!;
      const tlak = Math.max(0, tuhost * (w - z) + tlumeni * (rychlostW - rychlostZ));
      const d: number[] = [];
      for (let n = 1; n <= TVARU; n++) d.push(y[TVARU + n - 1]!);
      for (let n = 1; n <= TVARU; n++) d.push((-2 * tlak * tvar[n - 1]!) / (MU * L) - omegaN(n) ** 2 * y[n - 1]!);
      d.push(rychlostZ, tlak / hmota - TIHOVE_ZRYCHLENI);
      return d;
    };
    let y = new Array<number>(2 * TVARU + 2).fill(0);
    y[2 * TVARU] = (-hmota * TIHOVE_ZRYCHLENI) / tuhost;
    const h = 2e-5;
    let t = 0;
    const stred: number[] = [];
    const hmotaY: number[] = [];
    for (const cas of casy) {
      while (t < cas - 1e-12) {
        const krok = Math.min(h, cas - t);
        y = rk4(f, t, y, krok);
        t += krok;
      }
      let w = 0;
      for (let n = 1; n <= TVARU; n++) w += y[n - 1]! * Math.sin((n * Math.PI) / 2);
      stred.push(w);
      hmotaY.push(y[2 * TVARU]!);
    }
    return { stred, hmotaY };
  }

  it("průhyb nosníku i pohyb hmoty odpovídají nezávislému řešení", () => {
    const popis = nosnik(HEB200_BEZ_SMYKU, L, DILU, "prosty");
    const sedlo = (hmota * TIHOVE_ZRYCHLENI) / tuhost;
    // Hmota jede po zemi před mostem, už dosednutá na pružině.
    popis.stycniky.push({ x: -NABEH, y: -sedlo, pevneX: true, hmota });
    const s = sestavSoustavu(popis);
    const uzel = s.pocetStycniku - 1;
    s.vx[uzel] = v;
    const bremeno: PopisBremene = { stycnik: uzel, tuhost, tlumeni };
    const bremena = vytvorBremena(vytvorTrasu(s, vsechnyPruty(s)), [bremeno]);
    const kontakt = zatizeniBremeny(bremena);
    // Tíha působí jen na jedoucí hmotu, nosník je bez tíže jako v referenčním řešení.
    const zatizeni: Zatizeni = {
      ...kontakt,
      pridejSily: (soustava, cas) => {
        kontakt.pridejSily(soustava, cas);
        soustava.fy[uzel] = soustava.fy[uzel]! - hmota * TIHOVE_ZRYCHLENI;
      },
    };
    const sim = new Simulace(s, { tiha: 0, utlum: 0, zatizeni });

    const casy: number[] = [];
    const stred: number[] = [];
    const hmotaY: number[] = [];
    let dalsi = 0.01;
    while (s.x[uzel]! < L) {
      sim.krok();
      const naMoste = s.x[uzel]! / v; // čas od vjezdu na most
      if (naMoste >= dalsi) {
        casy.push(naMoste);
        stred.push(s.y[STRED]!);
        hmotaY.push(s.y[uzel]!);
        dalsi += 0.01;
      }
    }
    const ref = reference(casy);
    expect(odchylka(stred, ref.stred)).toBeLessThan(0.01);
    // Pohyb hmoty vztažený k jejímu největšímu vychýlení z klidové polohy.
    const zKlidu = (hodnoty: number[]): number[] => hodnoty.map((y) => y + sedlo);
    expect(odchylka(zKlidu(hmotaY), zKlidu(ref.hmotaY))).toBeLessThan(0.02);
    // Interakce je znatelná: hmota se na mostě rozhoupe o víc než pětinu svého sednutí.
    expect(Math.max(...zKlidu(ref.hmotaY).map(Math.abs)) / sedlo).toBeGreaterThan(0.2);
  });

  it("kde mostovka chybí, hmota ztratí oporu a padá volným pádem", () => {
    const popis = nosnik(HEB200_BEZ_SMYKU, L, DILU, "prosty");
    const sedlo = (hmota * TIHOVE_ZRYCHLENI) / tuhost;
    popis.stycniky.push({ x: -NABEH, y: -sedlo, pevneX: true, hmota });
    const s = sestavSoustavu(popis);
    const uzel = s.pocetStycniku - 1;
    s.vx[uzel] = 10;
    // Trasa bez tří prvků uprostřed: díra od 8 do 11 m.
    const pruty = vsechnyPruty(s).filter((e) => e < 8 || e > 10);
    const bremena = vytvorBremena(vytvorTrasu(s, pruty), [{ stycnik: uzel, tuhost, tlumeni }]);
    const kontakt = zatizeniBremeny(bremena);
    const zatizeni: Zatizeni = {
      ...kontakt,
      pridejSily: (soustava, cas) => {
        kontakt.pridejSily(soustava, cas);
        soustava.fy[uzel] = soustava.fy[uzel]! - hmota * TIHOVE_ZRYCHLENI;
      },
    };
    const sim = new Simulace(s, { tiha: 0, utlum: 0, zatizeni });
    while (s.x[uzel]! < 8.05) sim.krok();
    expect(bremena.prvek[0]).toBe(BEZ_OPORY);
    const y0 = s.y[uzel]!;
    const v0 = s.vy[uzel]!;
    const t0 = sim.cas;
    while (s.x[uzel]! < 10.5) sim.krok();
    const t = sim.cas - t0;
    expect(s.y[uzel]!).toBeCloseTo(y0 + v0 * t - 0.5 * TIHOVE_ZRYCHLENI * t * t, 4);
  });
});

describe("chodec v rezonanci", () => {
  const utlum = 0.01;
  const vaha = 800;

  it("pochod na místě uprostřed rozkmitá nosník na 1/(2ζ) statického průhybu prvního tvaru", () => {
    const s = most();
    const stupne = volneStupne(s);
    const tvary = vlastniTvarySoustavy(s, stupne, 1)!;
    const omega = tvary.omega[0]!;
    // Skutečný chodec (40 % váhy) by tento lehký nosník rozkmital o 22 cm a geometrická
    // nelinearita by odezvu snížila o 1,6 %. Vzorec 1/(2ζ) platí pro malé kmity, proto
    // tu chodec našlapuje stokrát lehčeji.
    const podil = 0.004;
    const bremena = vytvorBremena(vytvorTrasu(s, vsechnyPruty(s)), [
      { x: L / 2, rychlost: 0, tiha: vaha, buzeni: { frekvence: omega / (2 * Math.PI), amplitudy: [podil * vaha] } },
    ]);
    const sim = new Simulace(s, { tiha: 0, utlum, zatizeni: zatizeniBremeny(bremena) });
    // Ustálení trvá několik časových konstant 1/(ζω).
    const ustaleni = 8 / (utlum * omega);
    while (sim.cas < ustaleni) sim.krok();
    let nejvyse = -Infinity;
    let nejnize = Infinity;
    const konec = sim.cas + 3 * ((2 * Math.PI) / omega);
    while (sim.cas < konec) {
      sim.krok();
      nejvyse = Math.max(nejvyse, s.y[STRED]!);
      nejnize = Math.min(nejnize, s.y[STRED]!);
    }
    // Modální hmota prvního tvaru je μL/2; statický průhyb od amplitudy síly 2F/(μL·ω²).
    const ocekavana = ((2 * podil * vaha) / (MU * L * omega * omega)) / (2 * utlum);
    expect((nejvyse - nejnize) / 2 / ocekavana).toBeGreaterThan(0.995);
    expect((nejvyse - nejnize) / 2 / ocekavana).toBeLessThan(1.005);
    // Střed kmitá kolem statického průhybu od váhy chodce.
    const staticky = (vaha * L ** 3) / (48 * EI);
    expect(-(nejvyse + nejnize) / 2 / staticky).toBeCloseTo(1, 1);
  });

  it("chodec jdoucí v rytmu vlastní frekvence: odezva odpovídá nezávislému řešení", () => {
    const s = most();
    const stupne = volneStupne(s);
    const tvary = vlastniTvarySoustavy(s, stupne, 1)!;
    const omega = tvary.omega[0]!;
    const frekvence = omega / (2 * Math.PI);
    const v = 0.75 * frekvence; // délka kroku 0,75 m
    // Druhá a třetí harmonická jsou proti první posunuté o čtvrt periody (kosinové složky).
    const amplitudy = [0.4 * vaha, 0, 0, -0.1 * vaha, 0, -0.1 * vaha];
    const bremena = vytvorBremena(vytvorTrasu(s, vsechnyPruty(s)), [
      { x: 0, rychlost: v, tiha: vaha, buzeni: { frekvence, amplitudy } },
    ]);
    const sim = new Simulace(s, { tiha: 0, utlum, zatizeni: zatizeniBremeny(bremena) });
    const interval = 0.02;
    const namereno = prubeh(sim, STRED, L / v, interval);

    // Reference: pět tvarů s útlumem ζ; pro vyšší tvary útlum neznáme přesně (jádro tlumí
    // prvních deset tvarů stejným útlumem), takže se bere tentýž.
    const TVARU = 5;
    const f = (t: number, y: number[]): number[] => {
      const fi = omega * t;
      const sila =
        vaha +
        amplitudy[0]! * Math.sin(fi) +
        amplitudy[3]! * Math.cos(2 * fi) +
        amplitudy[5]! * Math.cos(3 * fi);
      const d: number[] = [];
      for (let n = 1; n <= TVARU; n++) d.push(y[TVARU + n - 1]!);
      for (let n = 1; n <= TVARU; n++) {
        // První frekvenci bere reference z jádra, aby rezonance seděla; vyšší z teorie.
        const om = n === 1 ? omega : omegaN(n);
        d.push(
          (-2 * sila * Math.sin((n * Math.PI * v * t) / L)) / (MU * L) -
            2 * utlum * om * y[TVARU + n - 1]! -
            om * om * y[n - 1]!,
        );
      }
      return d;
    };
    let y = new Array<number>(2 * TVARU).fill(0);
    let t = 0;
    const ocekavano: number[] = [];
    for (let i = 0; i < namereno.length; i++) {
      const cas = i * interval;
      while (t < cas - 1e-12) {
        const krok = Math.min(1e-4, cas - t);
        y = rk4(f, t, y, krok);
        t += krok;
      }
      let w = 0;
      for (let n = 1; n <= TVARU; n++) w += y[n - 1]! * Math.sin((n * Math.PI) / 2);
      ocekavano.push(w);
    }
    expect(odchylka(namereno, ocekavano)).toBeLessThan(0.02);
    // Rezonance je znát: průhyb je několikanásobkem statického průhybu od váhy.
    const staticky = (vaha * L ** 3) / (48 * EI);
    expect(Math.max(...ocekavano.map(Math.abs)) / staticky).toBeGreaterThan(3);
  });
});
