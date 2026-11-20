import { describe, expect, it } from "vitest";
import { deformacniEnergie, spoctiVnitrniSily } from "../src/jadro/sily";
import { LANO, NOSNIK, sestavSoustavu, type PopisPrvku, type PopisSoustavy, type Soustava } from "../src/jadro/soustava";
import { obnovPolohu, posunStupne, silyStupnu, ulozPolohu, volneStupne } from "../src/jadro/stupne";

/** Ocelový nosník podobný HEB 200; přesné hodnoty tu nejsou podstatné. */
const OCEL: Omit<PopisPrvku, "a" | "b"> = {
  druh: NOSNIK,
  EA: 210e9 * 78.1e-4,
  EI: 210e9 * 5696e-8,
  GAs: 81e9 * 24.8e-4,
  hmotnostNaMetr: 61.3,
  polomerSetrvacnosti: 0.0854,
};

/** Rám ze tří tuhých nosníků, jednoho kloubového a lana; všechny styčníky volné. */
function ram(): PopisSoustavy {
  return {
    stycniky: [
      { x: 0, y: 0 },
      { x: 3, y: 0.4 },
      { x: 5, y: 2 },
      { x: 2, y: 3 },
      { x: -1, y: 2.5 },
    ],
    prvky: [
      { ...OCEL, a: 0, b: 1 },
      { ...OCEL, a: 1, b: 2 },
      { ...OCEL, a: 2, b: 3, kloubB: true },
      { ...OCEL, a: 3, b: 4, kloubA: true, kloubB: true },
      { ...OCEL, a: 4, b: 0 },
      { ...OCEL, druh: LANO, a: 0, b: 3, EI: 0 },
    ],
  };
}

/** Vychýlí soustavu do obecné deformované polohy s velkými posuny i natočeními. */
function zdeformuj(s: Soustava): void {
  const posuny = [0.02, -0.01, 0.015, 0.03, -0.025, 0.01, 0.04, 0.02, -0.03, 0.035];
  const natoceni = [0.01, -0.02, 0.015, 0.03, -0.01];
  for (let i = 0; i < s.pocetStycniku; i++) {
    s.x[i] = s.x[i]! + posuny[2 * i]!;
    s.y[i] = s.y[i]! + posuny[2 * i + 1]!;
    s.cosN[i] = Math.cos(natoceni[i]!);
    s.sinN[i] = Math.sin(natoceni[i]!);
  }
}

/** Otočí a posune celou soustavu jako tuhé těleso. */
function pohniTuhym(s: Soustava, uhel: number, tx: number, ty: number): void {
  const c = Math.cos(uhel);
  const sn = Math.sin(uhel);
  for (let i = 0; i < s.pocetStycniku; i++) {
    const x = s.x[i]!;
    const y = s.y[i]!;
    s.x[i] = c * x - sn * y + tx;
    s.y[i] = sn * x + c * y + ty;
    const cn = s.cosN[i]!;
    const sN = s.sinN[i]!;
    s.cosN[i] = cn * c - sN * sn;
    s.sinN[i] = sN * c + cn * sn;
  }
}

describe("vnitřní síly prvků", () => {
  it("v nedeformované poloze jsou nulové", () => {
    const s = sestavSoustavu(ram());
    spoctiVnitrniSily(s);
    for (let i = 0; i < s.pocetStycniku; i++) {
      expect(s.fx[i]).toBe(0);
      expect(s.fy[i]).toBe(0);
      expect(s.moment[i]).toBe(0);
    }
    expect(deformacniEnergie(s)).toBe(0);
  });

  it("jsou přesným gradientem deformační energie", () => {
    const s = sestavSoustavu(ram());
    zdeformuj(s);
    const stupne = volneStupne(s);
    const sily = new Float64Array(stupne.length);
    spoctiVnitrniSily(s);
    silyStupnu(s, stupne, sily);
    const zaloha = ulozPolohu(s);

    const smer = new Float64Array(stupne.length);
    const krok = 1e-6;
    let nejvetsiSila = 0;
    for (const sila of sily) nejvetsiSila = Math.max(nejvetsiSila, Math.abs(sila));
    expect(nejvetsiSila).toBeGreaterThan(1e5); // deformace je opravdu velká

    for (let k = 0; k < stupne.length; k++) {
      smer.fill(0);
      smer[k] = 1;
      posunStupne(s, stupne, smer, krok);
      const plus = deformacniEnergie(s);
      obnovPolohu(s, zaloha);
      posunStupne(s, stupne, smer, -krok);
      const minus = deformacniEnergie(s);
      obnovPolohu(s, zaloha);
      const gradient = (plus - minus) / (2 * krok);
      // Síla je záporný gradient energie.
      expect(Math.abs(sily[k]! + gradient) / nejvetsiSila).toBeLessThan(1e-6);
    }
  });

  it("pohyb soustavy jako tuhého celku žádné síly nevyvolá", () => {
    const s = sestavSoustavu(ram());
    pohniTuhym(s, 2.3, 7, -4);
    spoctiVnitrniSily(s);
    const meritkoSil = OCEL.EA * 1e-12;
    for (let i = 0; i < s.pocetStycniku; i++) {
      expect(Math.abs(s.fx[i]!)).toBeLessThan(meritkoSil);
      expect(Math.abs(s.fy[i]!)).toBeLessThan(meritkoSil);
      expect(Math.abs(s.moment[i]!)).toBeLessThan(meritkoSil);
    }
  });

  it("deformační energie nezávisí na poloze a natočení celku", () => {
    const a = sestavSoustavu(ram());
    zdeformuj(a);
    const b = sestavSoustavu(ram());
    zdeformuj(b);
    pohniTuhym(b, -1.1, 3, 9);
    expect(deformacniEnergie(b)).toBeCloseTo(deformacniEnergie(a), 4);
    expect(deformacniEnergie(a)).toBeGreaterThan(1000);
  });

  it("výslednice sil i moment k počátku jsou nulové", () => {
    const s = sestavSoustavu(ram());
    zdeformuj(s);
    spoctiVnitrniSily(s);
    let sx = 0;
    let sy = 0;
    let m = 0;
    let meritko = 0;
    for (let i = 0; i < s.pocetStycniku; i++) {
      sx += s.fx[i]!;
      sy += s.fy[i]!;
      m += s.x[i]! * s.fy[i]! - s.y[i]! * s.fx[i]! + s.moment[i]!;
      meritko = Math.max(meritko, Math.abs(s.fx[i]!), Math.abs(s.fy[i]!));
    }
    expect(Math.abs(sx) / meritko).toBeLessThan(1e-12);
    expect(Math.abs(sy) / meritko).toBeLessThan(1e-12);
    expect(Math.abs(m) / meritko).toBeLessThan(1e-11);
  });

  it("lano táhne, ale netlačí", () => {
    const lano = (vzdalenost: number): Soustava => {
      const s = sestavSoustavu({
        stycniky: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
        prvky: [{ ...OCEL, druh: LANO, EI: 0, a: 0, b: 1 }],
      });
      s.x[1] = vzdalenost;
      spoctiVnitrniSily(s);
      return s;
    };
    const natazene = lano(2.001);
    expect(natazene.osovaSila[0]).toBeCloseTo((OCEL.EA / 2) * 0.001, 3);
    expect(natazene.fx[0]).toBeGreaterThan(0); // styčník a je tažen ke styčníku b
    const povolene = lano(1.9);
    expect(povolene.osovaSila[0]).toBe(0);
    expect(povolene.fx[0]).toBe(0);
    expect(deformacniEnergie(povolene)).toBe(0);
  });

  it("kloubový konec moment nepřenáší", () => {
    const s = sestavSoustavu({
      stycniky: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
      prvky: [{ ...OCEL, a: 0, b: 1, kloubA: true }],
    });
    s.y[1] = 0.01;
    s.cosN[1] = Math.cos(0.02);
    s.sinN[1] = Math.sin(0.02);
    spoctiVnitrniSily(s);
    expect(s.moment[0]).toBe(0);
    expect(s.momentA[0]).toBe(0);
    expect(Math.abs(s.momentB[0]!)).toBeGreaterThan(1000);
  });
});
