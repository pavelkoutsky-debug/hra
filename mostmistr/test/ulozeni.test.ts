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
  vylepsiZlom,
  type Ulozeni,
} from "../src/data/ulozeni";
import { Kreslic } from "../src/zkouska/regrese";

function sNavrhem(): Ulozeni {
  const k = new Kreslic();
  k.prut("mostovka-drevo", [0, 0], [4, 0]);
  const ulozeni = prazdneUlozeni();
  ulozeni.navrhy["9-99"] = k.navrh();
  ulozeni.rekordy["9-99"] = { verzeFyziky: 1, medaile: { pruchod: true, rozpocet: false, mistrovska: false }, nejlepsiCena: 10000, nejlepsiHmotnost: 950, nejlepsiZlom: 3.5 };
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

describe("starší formáty uložení", () => {
  it("verze 1 (před výzvami o efektivitu) se načte a rekordy dostanou prázdné výzvy", () => {
    const stare = {
      verze: 1,
      navrhy: {},
      rekordy: {
        "1-01": { verzeFyziky: 5, medaile: { pruchod: true, rozpocet: true, mistrovska: false }, nejlepsiCena: 31095 },
        "1-02": { verzeFyziky: 6, medaile: { pruchod: false, rozpocet: false, mistrovska: false }, nejlepsiCena: null },
      },
    };
    const nove = ulozeniZTextu(JSON.stringify(stare));
    expect(nove.verze).toBe(VERZE_ULOZENI);
    expect(nove.rekordy["1-01"]).toEqual({
      verzeFyziky: 5,
      medaile: { pruchod: true, rozpocet: true, mistrovska: false },
      nejlepsiCena: 31095,
      nejlepsiHmotnost: null,
      nejlepsiZlom: null,
    });
    expect(nove.rekordy["1-02"]!.nejlepsiZlom).toBeNull();
    // Údaj, který verze 1 neznala, převod nepřevezme: tehdy ho nikdo nezměřil.
    const spatne = { ...stare, rekordy: { "1-01": { ...stare.rekordy["1-01"], nejlepsiZlom: 3 } } };
    expect(ulozeniZTextu(JSON.stringify(spatne)).rekordy["1-01"]!.nejlepsiZlom).toBeNull();
  });
});

describe("rekord úrovně", () => {
  const pruchod = { pruchod: true, rozpocet: false, mistrovska: false };

  it("neúspěšná zkouška rekord nezaloží medailemi ani cenou", () => {
    expect(vylepsiRekord(undefined, BEZ_MEDAILI, 5000, 1, 800)).toEqual({
      verzeFyziky: 1,
      medaile: BEZ_MEDAILI,
      nejlepsiCena: null,
      nejlepsiHmotnost: null,
      nejlepsiZlom: null,
    });
  });

  it("nejlehčí most se pamatuje zvlášť: lehčí most nemusí být ten levnější", () => {
    let rekord = vylepsiRekord(undefined, pruchod, 9000, 1, 1200);
    rekord = vylepsiRekord(rekord, pruchod, 9500, 1, 1100);
    rekord = vylepsiRekord(rekord, pruchod, 8000, 1, 1500);
    // Most, který neprošel, se nepočítá, ani když je nejlehčí; volání bez hmotnosti ji nemění.
    rekord = vylepsiRekord(rekord, BEZ_MEDAILI, 100, 1, 10);
    rekord = vylepsiRekord(rekord, pruchod, 8500, 1);
    expect(rekord.nejlepsiCena).toBe(8000);
    expect(rekord.nejlepsiHmotnost).toBe(1100);
  });

  it("zkouška do zlomu: únosnost na korunu se jen zvyšuje a medaile ani cenu nemění", () => {
    // Zkoušet do zlomu jde i most, který zkouškou s provozem ještě neprošel.
    const prvni = vylepsiZlom(undefined, 2.5, 3);
    expect(prvni).toEqual({ verzeFyziky: 3, medaile: BEZ_MEDAILI, nejlepsiCena: null, nejlepsiHmotnost: null, nejlepsiZlom: 2.5 });
    let rekord = vylepsiRekord(prvni, pruchod, 9000, 3, 1200);
    rekord = vylepsiZlom(rekord, 1.9, 4);
    expect(rekord.nejlepsiZlom).toBe(2.5);
    expect(rekord.verzeFyziky).toBe(3);
    rekord = vylepsiZlom(rekord, 4.2, 4);
    expect(rekord).toEqual({ verzeFyziky: 4, medaile: pruchod, nejlepsiCena: 9000, nejlepsiHmotnost: 1200, nejlepsiZlom: 4.2 });
    // Most, který neunesl nic, rekord nezakládá.
    expect(vylepsiZlom(undefined, 0, 4).nejlepsiZlom).toBeNull();
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
