// Galerie mostů hráče a souhrn pro závěrečný list (`src/data/galerie.ts`).
import { describe, expect, it } from "vitest";
import { cenaNavrhu, hmotnostNavrhu } from "../src/data/cena";
import { galerieNaText, galerieZTextu, lepsiMost, souhrnListu, type Galerie, type MostGalerie } from "../src/data/galerie";
import type { NavrhMostu } from "../src/data/navrh";
import { zakodujMost } from "../src/data/sdileni";
import type { Medaile } from "../src/data/ulozeni";
import { KLIC_GALERIE, Uloziste, type Sklad } from "../src/hra/uloziste";
import { nactiKampan } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const kampan = nactiKampan();

class SkladVPameti implements Sklad {
  readonly data = new Map<string, string>();
  getItem(klic: string): string | null {
    return this.data.get(klic) ?? null;
  }
  setItem(klic: string, hodnota: string): void {
    this.data.set(klic, hodnota);
  }
}

const most = (upravy: Partial<MostGalerie> = {}): MostGalerie => ({ kod: "AQQEMS0wMQ", cena: 30_000, medaili: 1, neporuseny: true, verzeFyziky: 8, ...upravy });

describe("galerie mostů", () => {
  it("lepší most má víc medailí, při shodě je neporušený a nakonec levnější", () => {
    expect(lepsiMost(undefined, most())).toBe(true);
    expect(lepsiMost(most({ medaili: 1 }), most({ medaili: 2, cena: 90_000 }))).toBe(true);
    expect(lepsiMost(most({ medaili: 2 }), most({ medaili: 1, cena: 10 }))).toBe(false);
    expect(lepsiMost(most({ neporuseny: false }), most({ neporuseny: true, cena: 40_000 }))).toBe(true);
    expect(lepsiMost(most({ neporuseny: true }), most({ neporuseny: false, cena: 10 }))).toBe(false);
    expect(lepsiMost(most({ cena: 30_000 }), most({ cena: 29_999 }))).toBe(true);
    expect(lepsiMost(most({ cena: 30_000 }), most({ cena: 30_000 }))).toBe(false);
    // Haléře nerozhodují: stejná cena v korunách most nevymění.
    expect(lepsiMost(most({ cena: 30_000.4 }), most({ cena: 29_999.6 }))).toBe(false);
    // Most změřený starší fyzikou ustoupí každému dnešnímu, i horšímu; obráceně ne.
    expect(lepsiMost(most({ medaili: 3, verzeFyziky: 7 }), most({ medaili: 1, verzeFyziky: 8 }))).toBe(true);
    expect(lepsiMost(most({ medaili: 1, verzeFyziky: 8 }), most({ medaili: 3, verzeFyziky: 7 }))).toBe(false);
  });

  it("zápis a čtení se shodnou; nesmysly se zahodí a nečitelný text dá prázdnou galerii", () => {
    const galerie: Galerie = { "1-01": most(), "4-03": most({ medaili: 3, cena: 1_464_802 }) };
    expect(galerieZTextu(galerieNaText(galerie))).toEqual(galerie);
    for (const zapis of [null, "", "{", "[]", "null", "7", '"x"']) expect(galerieZTextu(zapis)).toEqual({});
    const smes = {
      "1-01": most(),
      "1-02": { ...most(), medaili: 4 },
      "1-03": { ...most(), cena: -5 },
      "1-04": { ...most(), kod: "" },
      "2-01": { ...most(), kod: "A".repeat(7000) },
      "2-02": { ...most(), neporuseny: "ano" },
      "2-03": { ...most(), verzeFyziky: 0 },
      "2-04": "most",
      kampan: most(),
      "3-01": { ...most(), navic: "zahodí se" },
    };
    expect(galerieZTextu(JSON.stringify(smes))).toEqual({ "1-01": most(), "3-01": most() });
  });

  it("úložiště zapíše do galerie jen lepší most a přežije poškozený zápis", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    expect(uloziste.galerie).toEqual({});
    expect(uloziste.zapisDoGalerie("1-01", most({ cena: 33_133 }))).toBe(true);
    expect(uloziste.zapisDoGalerie("1-01", most({ cena: 34_000 }))).toBe(false);
    expect(uloziste.zapisDoGalerie("1-01", most({ cena: 31_095, medaili: 3 }))).toBe(true);
    expect(uloziste.zapisDoGalerie("1-02", most({ cena: 55_700 }))).toBe(true);
    expect(new Uloziste(sklad).galerie).toEqual({ "1-01": most({ cena: 31_095, medaili: 3 }), "1-02": most({ cena: 55_700 }) });
    sklad.data.set(KLIC_GALERIE, "{rozbité");
    expect(new Uloziste(sklad).galerie).toEqual({});
    expect(new Uloziste(sklad).zapisDoGalerie("1-01", most())).toBe(true);
    // Bez paměti prohlížeče se nic nepamatuje a nic nespadne.
    const bez = new Uloziste(null);
    expect(bez.zapisDoGalerie("1-01", most())).toBe(true);
    expect(bez.galerie).toEqual({});
  });
});

describe("souhrn pro závěrečný list", () => {
  const medaile = (pruchod: boolean, rozpocet = false, mistrovska = false): Medaile => ({ pruchod, rozpocet, mistrovska });
  const zaznam = (navrh: NavrhMostu, medaili: number): MostGalerie => ({ kod: zakodujMost(navrh), cena: cenaNavrhu(navrh), medaili, neporuseny: true, verzeFyziky: 8 });

  it("prázdný postup: žádné mosty, nic projito, kampaň nedokončená", () => {
    const s = souhrnListu(kampan, { medaile: () => undefined, galerie: {}, rozestaveny: () => undefined });
    expect(s.polozky.map((p) => p.uroven.id)).toEqual(kampan.map((u) => u.id));
    expect(s.polozky.every((p) => p.most === null && p.puvod === "zadny" && p.cena === null)).toBe(true);
    expect(s).toMatchObject({ urovni: kampan.length, projito: 0, medaili: 0, medailiCelkem: 3 * kampan.length, mostu: 0, cena: 0, hmotnost: 0, rozpeti: 0, prutu: 0, dokonceno: false });
  });

  it("počítá medaile a sčítá jen mosty z galerie; rozestavěný most ukáže, ale nepočítá", () => {
    const u101 = kampan.find((u) => u.id === "1-01")!;
    const u103 = kampan.find((u) => u.id === "1-03")!;
    const prvni = RESENI["1-01"]!.mistrovska;
    const treti = RESENI["1-03"]!.rozpocet;
    const rozestaveny = RESENI["1-02"]!.pruchod;
    const s = souhrnListu(kampan, {
      medaile: (id) => (id === "1-01" ? medaile(true, true, true) : id === "1-03" ? medaile(true, true) : id === "1-04" ? medaile(true) : undefined),
      galerie: { "1-01": zaznam(prvni, 3), "1-03": zaznam(treti, 2), "2-01": { ...zaznam(prvni, 1) }, "2-02": most({ kod: "rozbity-kod" }) },
      rozestaveny: (id) => (id === "1-02" ? rozestaveny : id === "1-04" ? { ...rozestaveny, uroven: "1-04", pruty: [] } : undefined),
    });
    expect(s.projito).toBe(3);
    expect(s.pocty).toEqual({ pruchod: 3, rozpocet: 2, mistrovska: 1 });
    expect(s.medaili).toBe(6);
    expect(s.dokonceno).toBe(false);
    // Dva mosty z galerie; kód cizí úrovně (2-01) a rozbitý kód (2-02) se přeskočí.
    expect(s.mostu).toBe(2);
    expect(s.cena).toBeCloseTo(cenaNavrhu(prvni) + cenaNavrhu(treti), 6);
    expect(s.hmotnost).toBeCloseTo(hmotnostNavrhu(prvni, u101) + hmotnostNavrhu(treti, u103), 6);
    expect(s.rozpeti).toBe(8 + 16);
    expect(s.prutu).toBe(prvni.pruty.length + treti.pruty.length);
    const podle = Object.fromEntries(s.polozky.map((p) => [p.uroven.id, p]));
    expect(podle["1-01"]).toMatchObject({ puvod: "galerie", most: prvni });
    expect(podle["1-02"]).toMatchObject({ puvod: "rozestaveny", most: rozestaveny, cena: cenaNavrhu(rozestaveny) });
    // Prázdný výkres není most.
    expect(podle["1-04"]).toMatchObject({ puvod: "zadny", most: null });
    expect(podle["2-01"]).toMatchObject({ puvod: "zadny", most: null });
    expect(podle["2-02"]).toMatchObject({ puvod: "zadny", most: null });
  });

  it("kampaň je dokončená, až když má průchod každá úroveň", () => {
    const vse = souhrnListu(kampan, { medaile: () => medaile(true), galerie: {}, rozestaveny: () => undefined });
    expect(vse).toMatchObject({ projito: kampan.length, dokonceno: true });
    const bezJedne = souhrnListu(kampan, { medaile: (id) => (id === "4-04" ? undefined : medaile(true)), galerie: {}, rozestaveny: () => undefined });
    expect(bezJedne.dokonceno).toBe(false);
  });
});
