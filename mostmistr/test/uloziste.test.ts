// Uložený postup v paměti prohlížeče: čtení, zápis a odolnost proti poškozeným datům.
import { describe, expect, it } from "vitest";
import { ulozeniNaText, ulozeniZTextu } from "../src/data/ulozeni";
import { Kreslic } from "../src/zkouska/regrese";
import { KLIC_ODEMCENI, KLIC_POSKOZENEHO, KLIC_ULOZENI, Uloziste, type Sklad } from "../src/hra/uloziste";

class SkladVPameti implements Sklad {
  readonly data = new Map<string, string>();
  getItem(klic: string): string | null {
    return this.data.get(klic) ?? null;
  }
  setItem(klic: string, hodnota: string): void {
    this.data.set(klic, hodnota);
  }
}

function most() {
  const k = new Kreslic("1-01");
  k.prut("mostovka-drevo", [0, 0], [4, 0]);
  k.prut("mostovka-drevo", [4, 0], [8, 0]);
  return k.navrh();
}

const PRUCHOD = { pruchod: true, rozpocet: false, mistrovska: false };

describe("úložiště postupu", () => {
  it("prázdný sklad dá prázdný postup", () => {
    const uloziste = new Uloziste(new SkladVPameti());
    expect(uloziste.trvale).toBe(true);
    expect(uloziste.poskozeno).toBe(false);
    expect(uloziste.navrh("1-01")).toBeUndefined();
    expect(uloziste.rekord("1-01")).toBeUndefined();
  });

  it("uložený most a rekord přečte nové úložiště nad stejným skladem", () => {
    const sklad = new SkladVPameti();
    const prvni = new Uloziste(sklad);
    prvni.ulozNavrh(most());
    prvni.zapocitej("1-01", PRUCHOD, 31000, 2);

    const druhe = new Uloziste(sklad);
    expect(druhe.navrh("1-01")).toEqual(most());
    expect(druhe.rekord("1-01")).toEqual({ verzeFyziky: 2, medaile: PRUCHOD, nejlepsiCena: 31000 });
  });

  it("zapsaný text je platné uložení podle formátu dat", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    uloziste.ulozNavrh(most());
    const zapis = sklad.getItem(KLIC_ULOZENI)!;
    expect(ulozeniNaText(ulozeniZTextu(zapis))).toBe(zapis);
  });

  it("medaile se sčítají a cena jen klesá", () => {
    const uloziste = new Uloziste(new SkladVPameti());
    uloziste.zapocitej("1-01", PRUCHOD, 40000, 2);
    uloziste.zapocitej("1-01", { pruchod: true, rozpocet: true, mistrovska: false }, 30000, 2);
    const rekord = uloziste.zapocitej("1-01", { pruchod: false, rozpocet: false, mistrovska: false }, 10000, 2);
    expect(rekord.medaile).toEqual({ pruchod: true, rozpocet: true, mistrovska: false });
    expect(rekord.nejlepsiCena).toBe(30000);
  });

  it("poškozená data nezahodí: odloží je stranou a začne s prázdným postupem", () => {
    const sklad = new SkladVPameti();
    sklad.setItem(KLIC_ULOZENI, "{tohle není uložení");
    const uloziste = new Uloziste(sklad);
    expect(uloziste.poskozeno).toBe(true);
    expect(uloziste.navrh("1-01")).toBeUndefined();
    expect(sklad.getItem(KLIC_POSKOZENEHO)).toBe("{tohle není uložení");
  });

  it("bez skladu hra běží, jen si nic nepamatuje", () => {
    const uloziste = new Uloziste(null);
    expect(uloziste.trvale).toBe(false);
    uloziste.ulozNavrh(most());
    expect(uloziste.navrh("1-01")).toEqual(most());
    expect(new Uloziste(null).navrh("1-01")).toBeUndefined();
  });

  it("sklad, který odmítá zápis, hru neshodí", () => {
    const plny: Sklad = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const uloziste = new Uloziste(plny);
    expect(() => uloziste.ulozNavrh(most())).not.toThrow();
    expect(uloziste.navrh("1-01")).toEqual(most());
  });

  it("ladicí odemčení všech úrovní se pamatuje zvlášť", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    expect(uloziste.odemcenoVse).toBe(false);
    uloziste.odemcenoVse = true;
    expect(sklad.getItem(KLIC_ODEMCENI)).toBe("1");
    expect(new Uloziste(sklad).odemcenoVse).toBe(true);
  });
});
