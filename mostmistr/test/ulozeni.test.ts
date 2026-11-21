import { describe, expect, it } from "vitest";
import { ChybaDat } from "../src/data/kontrola";
import {
  BEZ_MEDAILI,
  nactiUlozeni,
  prazdneUlozeni,
  ulozeniNaText,
  ulozeniZTextu,
  VERZE_ULOZENI,
  vylepsiRekord,
  type Ulozeni,
} from "../src/data/ulozeni";
import { Kreslic } from "../src/zkouska/regrese";

function sNavrhem(): Ulozeni {
  const k = new Kreslic();
  k.prut("mostovka-drevo", [0, 0], [4, 0]);
  const ulozeni = prazdneUlozeni();
  ulozeni.navrhy["9-99"] = k.navrh();
  ulozeni.rekordy["9-99"] = { verzeFyziky: 1, medaile: { pruchod: true, rozpocet: false, mistrovska: false }, nejlepsiCena: 10000 };
  return ulozeni;
}

describe("uložený postup", () => {
  it("projde zápisem do textu a zpět beze změny", () => {
    const ulozeni = sNavrhem();
    expect(ulozeniZTextu(ulozeniNaText(ulozeni))).toEqual(ulozeni);
  });

  it("prázdné uložení je platné", () => {
    expect(nactiUlozeni(prazdneUlozeni())).toEqual({ verze: VERZE_ULOZENI, navrhy: {}, rekordy: {} });
  });

  it("poškozená data odmítne s cestou k chybě", () => {
    const cesta = (data: unknown): string => {
      try {
        nactiUlozeni(data);
      } catch (chyba) {
        expect(chyba).toBeInstanceOf(ChybaDat);
        return (chyba as ChybaDat).cesta;
      }
      throw new Error("data prošla");
    };
    expect(() => ulozeniZTextu("{nesmysl")).toThrow(ChybaDat);
    expect(cesta({ ...sNavrhem(), verze: VERZE_ULOZENI + 1 })).toBe("ulozeni.verze");
    expect(cesta({ ...sNavrhem(), navic: 1 })).toBe("ulozeni.navic");
    const spatnyRekord = sNavrhem();
    (spatnyRekord.rekordy["9-99"]!.medaile as unknown as Record<string, unknown>).pruchod = "ano";
    expect(cesta(spatnyRekord)).toBe("ulozeni.rekordy.9-99.medaile.pruchod");
    // Návrh uložený pod id jiné úrovně.
    const prehozeny = sNavrhem();
    prehozeny.navrhy["1-01"] = prehozeny.navrhy["9-99"]!;
    expect(cesta(prehozeny)).toBe("ulozeni.navrhy.1-01");
  });
});

describe("rekord úrovně", () => {
  const pruchod = { pruchod: true, rozpocet: false, mistrovska: false };

  it("neúspěšná zkouška rekord nezaloží medailemi ani cenou", () => {
    expect(vylepsiRekord(undefined, BEZ_MEDAILI, 5000, 1)).toEqual({ verzeFyziky: 1, medaile: BEZ_MEDAILI, nejlepsiCena: null });
  });

  it("medaile se sčítají přes pokusy a nikdy se neodebírají", () => {
    let rekord = vylepsiRekord(undefined, pruchod, 9000, 1);
    rekord = vylepsiRekord(rekord, { pruchod: true, rozpocet: true, mistrovska: false }, 7000, 1);
    rekord = vylepsiRekord(rekord, { pruchod: true, rozpocet: false, mistrovska: true }, 12000, 1);
    rekord = vylepsiRekord(rekord, BEZ_MEDAILI, 100, 1);
    expect(rekord.medaile).toEqual({ pruchod: true, rozpocet: true, mistrovska: true });
    expect(rekord.nejlepsiCena).toBe(7000);
  });

  it("verze fyziky se mění jen s vylepšením", () => {
    const stary = vylepsiRekord(undefined, pruchod, 9000, 1);
    expect(vylepsiRekord(stary, pruchod, 9500, 2).verzeFyziky).toBe(1);
    expect(vylepsiRekord(stary, pruchod, 8000, 2).verzeFyziky).toBe(2);
  });
});
