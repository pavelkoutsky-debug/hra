import { describe, expect, it } from "vitest";
import { najdiRovnovahu } from "../src/jadro/matice";
import {
  MISTO_KONEC_B,
  vyhodnotNamahani,
  ZPUSOB_OHYB,
  ZPUSOB_SMYK,
  ZPUSOB_TAH,
  ZPUSOB_VZPER,
} from "../src/jadro/namahani";
import {
  najdiPoruseni,
  NASLEDEK_KLOUB,
  NASLEDEK_ODPOJENI,
  NASLEDEK_ROZLOMENI,
  provedPoruseni,
} from "../src/jadro/poruseni";
import { deformacniEnergie, spoctiVnitrniSily } from "../src/jadro/sily";
import { sestavSoustavu, type PopisPrvku, type Soustava } from "../src/jadro/soustava";
import { silyStupnu, volneStupne } from "../src/jadro/stupne";
import { odpojKonec, rozdelPrvek } from "../src/jadro/topologie";
import { pridejSiluNaPrvek } from "../src/jadro/zatizeni";
import { popisPrutu } from "../src/zkouska/stavba";

type Prut = Omit<PopisPrvku, "a" | "b">;
const OCEL: Prut = popisPrutu("ocel-lehka", 3);
const DREVO: Prut = popisPrutu("drevo-lehke", 3);
const LANO_PRUT: Prut = popisPrutu("lano", 3);

const celkovaHmota = (s: Soustava): number => {
  let hmota = 0;
  for (let i = 0; i < s.pocetStycniku; i++) hmota += s.hmota[i]!;
  return hmota;
};
const hybnost = (s: Soustava): [number, number] => {
  let px = 0;
  let py = 0;
  for (let i = 0; i < s.pocetStycniku; i++) {
    px += s.hmota[i]! * s.vx[i]!;
    py += s.hmota[i]! * s.vy[i]!;
  }
  return [px, py];
};

/** Konzola ze dvou prvků s tuhým spojem uprostřed, zatížená silou na konci a ustálená. */
function ohnutaKonzola(prut: Prut, sila: number): { s: Soustava; vnejsi: Float64Array; stupne: Int32Array } {
  const s = sestavSoustavu({
    stycniky: [{ x: 0, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true }, { x: 3, y: 0 }, { x: 6, y: 0 }],
    prvky: [
      { ...prut, a: 0, b: 1 },
      { ...prut, a: 1, b: 2 },
    ],
  });
  const stupne = volneStupne(s);
  const vnejsi = new Float64Array(stupne.length);
  vnejsi[stupne.indexOf(3 * 2 + 1)] = sila;
  expect(najdiRovnovahu(s, stupne, vnejsi, 0)).toBeGreaterThanOrEqual(0);
  return { s, vnejsi, stupne };
}

describe("rozdělení prvku", () => {
  it("zachová hmotu a hybnost", () => {
    const { s } = ohnutaKonzola(DREVO, -20_000);
    for (let i = 1; i < s.pocetStycniku; i++) {
      s.vx[i] = 0.3 * i;
      s.vy[i] = -0.7 * i;
    }
    const hmotaPred = celkovaHmota(s);
    const hybnostPred = hybnost(s);
    const { stycnik, prvek } = rozdelPrvek(s, 1, 0.25);

    expect(s.pocetStycniku).toBe(4);
    expect(s.pocetPrvku).toBe(3);
    expect([s.prvekA[1], s.prvekB[1]]).toEqual([1, stycnik]);
    expect([s.prvekA[prvek], s.prvekB[prvek]]).toEqual([stycnik, 2]);
    expect(celkovaHmota(s)).toBeCloseTo(hmotaPred, 9);
    expect(s.utrzeny[1]).toBe(0);
    // Rychlost nového styčníku je proložená, takže hybnost se změní jen o chybu soustředění hmot.
    const hybnostPo = hybnost(s);
    expect(hybnostPo[0] / hybnostPred[0]).toBeCloseTo(1, 1);
    expect(hybnostPo[1] / hybnostPred[1]).toBeCloseTo(1, 1);
    expect(s.klidovaDelka[1]! + s.klidovaDelka[prvek]!).toBeCloseTo(3, 4);
    expect(s.prut[prvek]).toBe(s.prut[1]);
  });

  it("ohnutý nosník po rozdělení zůstane v rovnováze a deformační energie se nezmění", () => {
    for (const podil of [0.25, 0.5, 0.75]) {
      const sila = -20_000;
      const { s, vnejsi } = ohnutaKonzola(OCEL, sila);
      const energiePred = deformacniEnergie(s);
      const { stycnik } = rozdelPrvek(s, 0, podil);

      spoctiVnitrniSily(s);
      const stupne = volneStupne(s);
      const sily = new Float64Array(stupne.length);
      silyStupnu(s, stupne, sily);
      // Nový styčník leží na ohybové čáře: síly na něj jsou zanedbatelné proti zatížení
      // a ostatní styčníky zůstávají v rovnováze se silou na konci. Zbytek pod procento
      // zatížení je druhého řádu: posouvající síly dílů míří kolmo k jejich spojnicím, které
      // spolu svírají malý úhel, a vyrovná ho osová síla při posunu v řádu nanometrů.
      for (let k = 0; k < stupne.length; k++) {
        const kod = stupne[k]!;
        const zatizeni = kod === 3 * 2 + 1 ? vnejsi[2 * 3 - 2]! : 0;
        const meritko = kod % 3 === 2 ? Math.abs(sila) * 6 : Math.abs(sila);
        expect(Math.abs(sily[k]! + zatizeni) / meritko, `stupeň ${kod}, podíl ${podil}`).toBeLessThan(1e-2);
      }
      expect(stycnik).toBe(3);
      expect(deformacniEnergie(s) / energiePred).toBeCloseTo(1, 4);
    }
  });

  it("se zalomením nezmění osovou sílu ani momenty", () => {
    const s = sestavSoustavu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
        { x: 4, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
      ],
      prvky: [{ ...OCEL, a: 0, b: 1 }],
    });
    s.x[1] = 3.998; // stlačený prut
    spoctiVnitrniSily(s);
    const osovaPred = s.osovaSila[0]!;
    const { prvek, stycnik } = rozdelPrvek(s, 0, 0.5, 0.04);
    expect(s.y[stycnik]).toBeCloseTo(0.04, 12);
    spoctiVnitrniSily(s);
    expect(s.osovaSila[0]! / osovaPred).toBeCloseTo(1, 9);
    expect(s.osovaSila[prvek]! / osovaPred).toBeCloseTo(1, 9);
    const meritko = Math.abs(osovaPred) * 0.04;
    for (const e of [0, prvek]) {
      expect(Math.abs(s.momentA[e]!) / meritko).toBeLessThan(1e-6);
      expect(Math.abs(s.momentB[e]!) / meritko).toBeLessThan(1e-6);
    }
  });
});

describe("odpojení konce", () => {
  it("prvek dostane vlastní styčník a původní si nechá ostatní prvky i podporu", () => {
    const { s } = ohnutaKonzola(DREVO, -20_000);
    const hmotaPred = celkovaHmota(s);
    const novy = odpojKonec(s, 0, false);
    expect(s.prvekA[0]).toBe(novy);
    expect(s.x[novy]).toBe(0);
    expect(s.podpora[0]).toBe(7);
    expect(s.podpora[novy]).toBe(0);
    expect(s.invHmotaX[novy]).toBeGreaterThan(0);
    expect(celkovaHmota(s)).toBeCloseTo(hmotaPred, 9);
  });
});

/** Jeden prut s konci držením; deformace se vnucuje. */
function prut(popis: Prut, L: number, upravy: Partial<Prut> = {}): Soustava {
  return sestavSoustavu({
    stycniky: [
      { x: 0, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
      { x: L, y: 0, pevneX: true, pevneY: true, pevneNatoceni: true },
    ],
    prvky: [{ ...popis, ...upravy, a: 0, b: 1 }],
  });
}

function vyhodnot(s: Soustava): void {
  spoctiVnitrniSily(s);
  vyhodnotNamahani(s, 0, 1);
}

describe("porušení křehkých prvků", () => {
  it("pod únosností se nic neporuší", () => {
    const s = prut(DREVO, 3);
    s.x[1] = 3 + (0.95 * DREVO.unosnost!.tah) / s.tuhostOsova[0]!;
    vyhodnot(s);
    expect(najdiPoruseni(s)).toBeNull();
  });

  it("tah: dřevěný prut se přetrhne na dva volné kusy, které už sílu nepřenesou", () => {
    const s = prut(DREVO, 3);
    s.x[1] = 3 + (1.05 * DREVO.unosnost!.tah) / s.tuhostOsova[0]!;
    vyhodnot(s);
    const p = najdiPoruseni(s)!;
    expect(p).toMatchObject({ prvek: 0, prut: 0, zpusob: ZPUSOB_TAH, nasledek: NASLEDEK_ROZLOMENI });
    provedPoruseni(s, p);
    expect(s.pocetPrvku).toBe(2);
    expect(s.pocetStycniku).toBe(4);
    expect(s.prvekB[0]).not.toBe(s.prvekA[1]); // kusy už nespojuje žádný styčník
    expect(s.prut[1]).toBe(0);
    expect([s.utrzeny[0], s.utrzeny[1]]).toEqual([1, 1]);
    vyhodnot(s);
    // Kusy jsou v prvním okamžiku ještě napjaté, ale podruhé se už neporušují.
    expect(s.vyuziti[0]).toBeGreaterThan(1);
    expect(najdiPoruseni(s)).toBeNull();
  });

  it("lano praskne", () => {
    const s = sestavSoustavu({
      stycniky: [{ x: 0, y: 0, pevneX: true, pevneY: true }, { x: 10, y: 0, pevneX: true, pevneY: true }],
      prvky: [{ ...LANO_PRUT, a: 0, b: 1 }],
    });
    s.x[1] = 10 + (1.02 * LANO_PRUT.unosnost!.tah) / s.tuhostOsova[0]!;
    vyhodnot(s);
    const p = najdiPoruseni(s)!;
    expect(p.nasledek).toBe(NASLEDEK_ROZLOMENI);
    provedPoruseni(s, p);
    expect(s.pocetPrvku).toBe(2);
  });

  it("vzpěr: štíhlý dřevěný prut se zlomí uprostřed", () => {
    const s = prut(DREVO, 6);
    const unosnost = 1 / (1 / DREVO.unosnost!.tlak + 1 / s.kritickaSila[0]!);
    s.x[1] = 6 - (1.03 * unosnost) / s.tuhostOsova[0]!;
    vyhodnot(s);
    const p = najdiPoruseni(s)!;
    expect(p).toMatchObject({ zpusob: ZPUSOB_VZPER, nasledek: NASLEDEK_ROZLOMENI, misto: 2 });
    provedPoruseni(s, p);
    expect(s.klidovaDelka[0]! / s.klidovaDelka[1]!).toBeCloseTo(1, 6);
  });

  it("ohyb pod silou ve čtvrtině pole: prut se zlomí právě tam", () => {
    const s = prut(DREVO, 4, { kloubA: true, kloubB: true });
    // Moment pod silou ve čtvrtině je 3·P·L/16.
    const P = (1.05 * DREVO.unosnost!.moment * 16) / (3 * 4);
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.25, 0, -P);
    vyhodnotNamahani(s, 0, 1);
    const p = najdiPoruseni(s)!;
    expect(p).toMatchObject({ zpusob: ZPUSOB_OHYB, misto: 1, nasledek: NASLEDEK_ROZLOMENI });
    provedPoruseni(s, p);
    expect(s.klidovaDelka[0]).toBeCloseTo(1, 9);
    expect(s.klidovaDelka[1]).toBeCloseTo(3, 9);
  });

  it("ohyb ve vetknutí: konec se utrhne", () => {
    const s = prut(DREVO, 4);
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.9, 0, -400_000);
    vyhodnotNamahani(s, 0, 1);
    const p = najdiPoruseni(s)!;
    expect(p).toMatchObject({ misto: MISTO_KONEC_B, nasledek: NASLEDEK_ODPOJENI });
    provedPoruseni(s, p);
    expect(s.pocetPrvku).toBe(1);
    expect(s.prvekB[0]).toBe(2);
    expect(s.podpora[s.prvekB[0]!]).toBe(0);
  });

  it("smyk: krátký prut se ustřihne u podpory", () => {
    const s = prut(DREVO, 1, { kloubA: true, kloubB: true });
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.1, 0, -1.2 * DREVO.unosnost!.smyk);
    vyhodnotNamahani(s, 0, 1);
    const p = najdiPoruseni(s)!;
    expect(p).toMatchObject({ zpusob: ZPUSOB_SMYK, misto: 0, nasledek: NASLEDEK_ODPOJENI });
  });

  it("z více přetížených prvků se vybere ten nejhorší", () => {
    const s = sestavSoustavu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true },
        { x: 3, y: 0, pevneX: true, pevneY: true },
        { x: 6, y: 0, pevneX: true, pevneY: true },
      ],
      prvky: [
        { ...DREVO, a: 0, b: 1, kloubA: true, kloubB: true },
        { ...DREVO, a: 1, b: 2, kloubA: true, kloubB: true },
      ],
    });
    s.x[1] = 3.008;
    s.x[2] = 6.024; // druhý prut je natažen dvakrát víc
    vyhodnot(s);
    expect(s.vyuziti[0]).toBeGreaterThan(1);
    expect(najdiPoruseni(s)!.prvek).toBe(1);
  });
});

describe("porušení tvárných prvků", () => {
  it("tah nad mezí kluzu porušením není, dokud se nevyčerpá tažnost", () => {
    const s = prut(OCEL, 4);
    const kluz = OCEL.unosnost!.tah / s.tuhostOsova[0]!;
    for (let i = 1; i <= 100; i++) {
      s.x[1] = 4 + (i / 100) * 10 * kluz;
      vyhodnot(s);
    }
    expect(s.plastDelka[0]).toBeGreaterThan(8 * kluz);
    expect(najdiPoruseni(s)).toBeNull();
  });

  it("po vyčerpání tažnosti se prut přetrhne", () => {
    const s = prut(OCEL, 4);
    const mezni = OCEL.tvarny!.mezniProtazeni * 4;
    for (let i = 1; i <= 300; i++) {
      s.x[1] = 4 + (i / 300) * 1.1 * mezni;
      vyhodnot(s);
    }
    const p = najdiPoruseni(s)!;
    expect(p).toMatchObject({ zpusob: ZPUSOB_TAH, nasledek: NASLEDEK_ROZLOMENI });
    expect(p.mira).toBeGreaterThanOrEqual(1);
  });

  it("plastický kloub se zlomí po vyčerpání mezního natočení", () => {
    const s = prut(OCEL, 4);
    const mezni = OCEL.tvarny!.mezniNatoceni;
    let poruseni = null;
    let uhel = 0;
    for (let i = 1; i <= 2000 && !poruseni; i++) {
      uhel = (i / 2000) * 0.3;
      s.cosN[1] = Math.cos(uhel);
      s.sinN[1] = Math.sin(uhel);
      vyhodnot(s);
      poruseni = najdiPoruseni(s);
    }
    expect(poruseni).toMatchObject({ zpusob: ZPUSOB_OHYB, misto: MISTO_KONEC_B, nasledek: NASLEDEK_ODPOJENI });
    // Kloub se natočil o mezní hodnotu; celkové natočení je o pružnou část větší.
    expect(Math.abs(s.plastB[0]!) / mezni).toBeCloseTo(1, 1);
    expect(uhel).toBeGreaterThan(mezni);
  });

  it("vzpěr: v ocelovém prutu vznikne kloub se zalomením a díly zůstanou spojené", () => {
    const s = prut(OCEL, 8);
    const unosnost = 1 / (1 / OCEL.unosnost!.tlak + 1 / s.kritickaSila[0]!);
    s.x[1] = 8 - (1.02 * unosnost) / s.tuhostOsova[0]!;
    vyhodnot(s);
    const osovaPred = s.osovaSila[0]!;
    const p = najdiPoruseni(s)!;
    expect(p).toMatchObject({ zpusob: ZPUSOB_VZPER, nasledek: NASLEDEK_KLOUB });
    provedPoruseni(s, p);
    expect(s.pocetPrvku).toBe(2);
    expect(s.pocetStycniku).toBe(3);
    expect(s.prvekB[0]).toBe(s.prvekA[1]); // díly sdílejí nový styčník
    expect(Math.abs(s.y[2]!)).toBeCloseTo(0.08, 6); // zalomení o setinu délky
    spoctiVnitrniSily(s);
    expect(s.osovaSila[0]! / osovaPred).toBeCloseTo(1, 6);
    vyhodnotNamahani(s, 0, 1);
    // Díly už se na vzpěr samostatně neposuzují.
    expect(s.kritickaSila[0]).toBe(Infinity);
  });

  it("ohyb uprostřed pole: v ocelovém prutu vznikne kloub, ne trhlina", () => {
    const s = prut(OCEL, 4, { kloubA: true, kloubB: true });
    const P = (1.05 * OCEL.unosnost!.moment * 4) / 4;
    spoctiVnitrniSily(s);
    pridejSiluNaPrvek(s, 0, 0.5, 0, -P);
    vyhodnotNamahani(s, 0, 1);
    const p = najdiPoruseni(s)!;
    expect(p).toMatchObject({ zpusob: ZPUSOB_OHYB, misto: 2, nasledek: NASLEDEK_KLOUB });
    provedPoruseni(s, p);
    expect(s.prvekB[0]).toBe(s.prvekA[1]);
    // Původní klouby na koncích zůstaly, uprostřed je tuhý spoj s plastickou únosností.
    expect(s.kloub[0]).toBe(1);
    expect(s.kloub[1]).toBe(2);
    expect(s.mezMomentu[1]).toBe(OCEL.unosnost!.moment);
  });

  it("ohyb na konci porušením není, řeší ho plastický kloub", () => {
    const s = prut(OCEL, 4);
    for (let i = 1; i <= 200; i++) {
      s.cosN[1] = Math.cos((i / 200) * 0.03);
      s.sinN[1] = Math.sin((i / 200) * 0.03);
      vyhodnot(s);
    }
    expect(s.vyuziti[0]).toBeGreaterThan(0.99);
    expect(Math.abs(s.plastB[0]!)).toBeGreaterThan(0);
    expect(najdiPoruseni(s)).toBeNull();
  });
});
