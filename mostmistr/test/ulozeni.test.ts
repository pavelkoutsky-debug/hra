import { describe, expect, it } from "vitest";
import { ChybaDat } from "../src/data/kontrola";
import {
  BEZ_MEDAILI,
  nactiUlozeni,
  prazdneUlozeni,
  ulozeniNaText,
  ulozeniZTextu,
  VERZE_ULOZENI,
  verzeZapisuUlozeni,
  vylepsiRekord,
  platnyZlom,
  vylepsiZlom,
  zastaralyZlom,
  type Ulozeni,
} from "../src/data/ulozeni";
import { Kreslic } from "../src/zkouska/regrese";

function sNavrhem(): Ulozeni {
  const k = new Kreslic();
  k.prut("mostovka-drevo", [0, 0], [4, 0]);
  const ulozeni = prazdneUlozeni();
  ulozeni.navrhy["9-99"] = k.navrh();
  ulozeni.rekordy["9-99"] = { verzeFyziky: 1, medaile: { pruchod: true, rozpocet: false, mistrovska: false }, nejlepsiCena: 10000, nejlepsiHmotnost: 950, nejlepsiZlom: 3.5, verzeZlomu: 1 };
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
    // Medaile zůstávají; cena je z doby před M12 (jiný provoz úrovně) a měří se znovu.
    expect(nove.rekordy["1-01"]).toEqual({
      verzeFyziky: 5,
      medaile: { pruchod: true, rozpocet: true, mistrovska: false },
      nejlepsiCena: null,
      nejlepsiHmotnost: null,
      nejlepsiZlom: null,
      verzeZlomu: null,
    });
    expect(nove.rekordy["1-02"]!.nejlepsiZlom).toBeNull();
    // Údaj, který verze 1 neznala, převod nepřevezme: tehdy ho nikdo nezměřil.
    const spatne = { ...stare, rekordy: { "1-01": { ...stare.rekordy["1-01"], nejlepsiZlom: 3 } } };
    expect(ulozeniZTextu(JSON.stringify(spatne)).rekordy["1-01"]!.nejlepsiZlom).toBeNull();
  });

  it("verze 2: rekord zkoušky do zlomu dostane verzi fyziky, se kterou se tehdy měřilo", () => {
    const stare = {
      verze: 2,
      navrhy: {},
      rekordy: {
        "1-01": { verzeFyziky: 7, medaile: { pruchod: true, rozpocet: false, mistrovska: false }, nejlepsiCena: 31095, nejlepsiHmotnost: 914, nejlepsiZlom: 3.87 },
        "1-02": { verzeFyziky: 7, medaile: { pruchod: true, rozpocet: false, mistrovska: false }, nejlepsiCena: 40000, nejlepsiHmotnost: 1200, nejlepsiZlom: null },
      },
    };
    const nove = ulozeniZTextu(JSON.stringify(stare));
    expect(nove.verze).toBe(VERZE_ULOZENI);
    // Formát 2 existoval jen s fyzikou 7 a před M12: rekordy výzev se měří znovu, takže ani
    // zastaralé nejsou (není co nahrazovat).
    expect(nove.rekordy["1-01"]).toMatchObject({ nejlepsiZlom: null, verzeZlomu: null, nejlepsiCena: null, nejlepsiHmotnost: null });
    expect(platnyZlom(nove.rekordy["1-01"], 7)).toBeNull();
    expect(zastaralyZlom(nove.rekordy["1-01"], 8)).toBe(false);
    expect(nove.rekordy["1-02"]!.verzeZlomu).toBeNull();
    expect(nove.rekordy["1-01"]!.medaile).toEqual({ pruchod: true, rozpocet: false, mistrovska: false });
  });

  it("verze 3 (před M12): mistrovská zůstane jen s rozpočtovou a rekordy výzev se měří znovu", () => {
    const stare = {
      verze: 3,
      navrhy: {},
      rekordy: {
        // Mistrovská koupená drahým mostem: podle nových pravidel na ni hráč nemá.
        "3-01": { verzeFyziky: 8, medaile: { pruchod: true, rozpocet: false, mistrovska: true }, nejlepsiCena: 525800, nejlepsiHmotnost: 108000, nejlepsiZlom: 4.1, verzeZlomu: 8 },
        // Všechny tři: zůstávají.
        "1-01": { verzeFyziky: 8, medaile: { pruchod: true, rozpocet: true, mistrovska: true }, nejlepsiCena: 23000, nejlepsiHmotnost: 700, nejlepsiZlom: 3.9, verzeZlomu: 8 },
        "1-02": { verzeFyziky: 8, medaile: { pruchod: false, rozpocet: false, mistrovska: false }, nejlepsiCena: null, nejlepsiHmotnost: null, nejlepsiZlom: null, verzeZlomu: null },
      },
    };
    expect(verzeZapisuUlozeni(JSON.stringify(stare))).toBe(3);
    const nove = ulozeniZTextu(JSON.stringify(stare));
    expect(nove.verze).toBe(VERZE_ULOZENI);
    expect(nove.rekordy["3-01"]!.medaile).toEqual({ pruchod: true, rozpocet: false, mistrovska: false });
    expect(nove.rekordy["1-01"]!.medaile).toEqual({ pruchod: true, rozpocet: true, mistrovska: true });
    // Cena 23 000 Kč je z úrovně se třemi chodci; dnes most pod 31 095 Kč neprojde.
    for (const id of ["3-01", "1-01", "1-02"]) {
      expect(nove.rekordy[id]).toMatchObject({ nejlepsiCena: null, nejlepsiHmotnost: null, nejlepsiZlom: null, verzeZlomu: null });
    }
    // Převod se dá zopakovat: zápis v novém formátu se čte beze změny.
    expect(ulozeniZTextu(ulozeniNaText(nove))).toEqual(nove);
    expect(verzeZapisuUlozeni(ulozeniNaText(nove))).toBe(VERZE_ULOZENI);
    expect(verzeZapisuUlozeni("{nesmysl")).toBeNull();
    expect(verzeZapisuUlozeni('{"verze":"3"}')).toBeNull();
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
      verzeZlomu: null,
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

  it("most, na kterém se při zkoušce něco porušilo, medaili za průchod dostane, ale do výzev se nepočítá", () => {
    let rekord = vylepsiRekord(undefined, pruchod, 9000, 1, 1200);
    rekord = vylepsiRekord(rekord, pruchod, 5000, 1, 600, false);
    expect(rekord.medaile.pruchod).toBe(true);
    expect(rekord.nejlepsiCena).toBe(9000);
    expect(rekord.nejlepsiHmotnost).toBe(1200);
    // První průchod s povoleným prutem: medaile ano, rekord ceny a hmotnosti zatím žádný.
    const prvni = vylepsiRekord(undefined, pruchod, 5000, 1, 600, false);
    expect(prvni.medaile.pruchod).toBe(true);
    expect(prvni.nejlepsiCena).toBeNull();
    expect(prvni.nejlepsiHmotnost).toBeNull();
  });

  it("zkouška do zlomu: únosnost na korunu se jen zvyšuje a medaile ani cenu nemění", () => {
    // Zkoušet do zlomu jde i most, který zkouškou s provozem ještě neprošel.
    const prvni = vylepsiZlom(undefined, 2.5, 3);
    expect(prvni).toEqual({ verzeFyziky: 3, medaile: BEZ_MEDAILI, nejlepsiCena: null, nejlepsiHmotnost: null, nejlepsiZlom: 2.5, verzeZlomu: 3 });
    let rekord = vylepsiRekord(prvni, pruchod, 9000, 3, 1200);
    rekord = vylepsiZlom(rekord, 1.9, 3);
    expect(rekord.nejlepsiZlom).toBe(2.5);
    rekord = vylepsiZlom(rekord, 4.2, 3);
    expect(rekord).toEqual({ verzeFyziky: 3, medaile: pruchod, nejlepsiCena: 9000, nejlepsiHmotnost: 1200, nejlepsiZlom: 4.2, verzeZlomu: 3 });
    // Most, který neunesl nic, rekord nezakládá.
    expect(vylepsiZlom(undefined, 0, 4).nejlepsiZlom).toBeNull();
  });

  it("zkouška do zlomu: rekord změřený jinou verzí fyziky neplatí a první nové měření ho nahradí", () => {
    let rekord = vylepsiRekord(undefined, pruchod, 9000, 3, 1200);
    rekord = vylepsiZlom(rekord, 4.2, 3);
    expect(platnyZlom(rekord, 3)).toBe(4.2);
    // Po změně fyziky: číslo v uložení zůstává, ale do výzvy se nepočítá.
    expect(platnyZlom(rekord, 4)).toBeNull();
    expect(zastaralyZlom(rekord, 4)).toBe(true);
    // Zkouška, která neunesla nic, starý rekord nesmaže.
    expect(vylepsiZlom(rekord, 0, 4)).toBe(rekord);
    // Nové měření je menší než starý rekord, a přesto platí: staré číslo by už nešlo zopakovat.
    const novy = vylepsiZlom(rekord, 3.1, 4);
    expect(novy).toMatchObject({ nejlepsiZlom: 3.1, verzeZlomu: 4, nejlepsiCena: 9000, medaile: pruchod });
    expect(zastaralyZlom(novy, 4)).toBe(false);
    // Medaile ani cena změnou fyziky nezastarávají; rekord zlomu běžná zkouška nemění.
    expect(vylepsiRekord(rekord, pruchod, 8000, 4, 1100)).toMatchObject({ nejlepsiZlom: 4.2, verzeZlomu: 3, nejlepsiCena: 8000 });
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
