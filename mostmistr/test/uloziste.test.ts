// Uložený postup v paměti prohlížeče: čtení, zápis a odolnost proti poškozeným datům.
import { describe, expect, it } from "vitest";
import { ulozeniNaText, ulozeniZTextu } from "../src/data/ulozeni";
import { Kreslic } from "../src/zkouska/regrese";
import { ID_SANDBOXU, sandboxNaText, vychoziSandbox } from "../src/data/sandbox";
import {
  KLIC_CISEL,
  KLIC_ODEMCENI,
  KLIC_POSKOZENEHO,
  KLIC_PROSLYCH,
  KLIC_SANDBOXU,
  KLIC_ZABERU,
  KLIC_ULOZENI,
  KLIC_ZVUKU,
  Uloziste,
  type Sklad,
} from "../src/hra/uloziste";

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
    prvni.zapocitej("1-01", PRUCHOD, 31000, 2, 914);
    prvni.zapocitejZlom("1-01", 3.87, 2);

    const druhe = new Uloziste(sklad);
    expect(druhe.navrh("1-01")).toEqual(most());
    expect(druhe.rekord("1-01")).toEqual({
      verzeFyziky: 2,
      medaile: PRUCHOD,
      nejlepsiCena: 31000,
      nejlepsiHmotnost: 914,
      nejlepsiZlom: 3.87,
      verzeZlomu: 2,
    });
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

  it("čísla využití jsou zapnutá, dokud je hráč nevypne, a volba se pamatuje", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    expect(uloziste.cislaVyuziti).toBe(true);
    uloziste.cislaVyuziti = false;
    expect(sklad.getItem(KLIC_CISEL)).toBe("0");
    expect(new Uloziste(sklad).cislaVyuziti).toBe(false);
    // Volba nesmí přepsat uložený postup.
    expect(sklad.getItem(KLIC_ULOZENI)).toBeNull();
  });

  it("hlasitost je potichu, dokud ji hráč nezmění, a ztlumení se pamatuje", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    expect(uloziste.hlasitost).toBe("potichu");
    uloziste.hlasitost = "vypnuto";
    expect(sklad.getItem(KLIC_ZVUKU)).toBe("vypnuto");
    expect(new Uloziste(sklad).hlasitost).toBe("vypnuto");
    uloziste.hlasitost = "nahlas";
    expect(new Uloziste(sklad).hlasitost).toBe("nahlas");
    // Nesmysl v paměti se bere jako výchozí hlasitost; hra kvůli němu nespadne ani neoněmí.
    sklad.setItem(KLIC_ZVUKU, "nejvic");
    expect(new Uloziste(sklad).hlasitost).toBe("potichu");
    // Bez paměti prohlížeče hra hraje výchozí hlasitostí a volbu si jen nepamatuje.
    const bezPameti = new Uloziste(null);
    bezPameti.hlasitost = "vypnuto";
    expect(bezPameti.hlasitost).toBe("potichu");
    expect(sklad.getItem(KLIC_ULOZENI)).toBeNull();
  });

  it("ladicí odemčení všech úrovní se pamatuje zvlášť", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    expect(uloziste.odemcenoVse).toBe(false);
    uloziste.odemcenoVse = true;
    expect(sklad.getItem(KLIC_ODEMCENI)).toBe("1");
    expect(new Uloziste(sklad).odemcenoVse).toBe(true);
  });

  it("sandbox: nastavení se ukládá, návštěva si pamatuje a most jde smazat", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    expect(uloziste.sandbox).toEqual(vychoziSandbox());
    expect(uloziste.sandboxNavstiven).toBe(false);
    uloziste.sandboxNavstiven = true;
    const siroke = { ...vychoziSandbox(), rozpeti: 40, voda: false };
    uloziste.sandbox = siroke;
    const k = new Kreslic(ID_SANDBOXU);
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    uloziste.ulozNavrh(k.navrh());

    const druhe = new Uloziste(sklad);
    expect(druhe.sandbox).toEqual(siroke);
    expect(druhe.sandboxNavstiven).toBe(true);
    expect(druhe.navrh(ID_SANDBOXU)?.pruty).toHaveLength(1);
    druhe.smazNavrh(ID_SANDBOXU);
    expect(druhe.navrh(ID_SANDBOXU)).toBeUndefined();
    expect(new Uloziste(sklad).navrh(ID_SANDBOXU)).toBeUndefined();
    // Smazat most, který není, nic nerozbije.
    druhe.smazNavrh("9-99");
  });

  it("sandbox: nečitelné nastavení se nahradí výchozím a most z neznámého údolí se zahodí", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    const k = new Kreslic(ID_SANDBOXU);
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    uloziste.ulozNavrh(k.navrh());
    uloziste.ulozNavrh(most());
    sklad.setItem(KLIC_SANDBOXU, "{rozbite");

    const druhe = new Uloziste(sklad);
    expect(druhe.sandbox).toEqual(vychoziSandbox());
    expect(druhe.navrh(ID_SANDBOXU)).toBeUndefined();
    // Mosty úrovní kampaně s tím nemají nic společného.
    expect(druhe.navrh("1-01")).toEqual(most());
    expect(sklad.getItem(KLIC_SANDBOXU)).toBe(sandboxNaText(vychoziSandbox()));
  });
});

describe("paměť prošlých mostů a volba zpomaleného záběru", () => {
  it("most, který úrovní prošel, si pamatuje i nové úložiště nad stejným skladem", () => {
    const sklad = new SkladVPameti();
    const prvni = new Uloziste(sklad);
    expect(prvni.prosel("1-01", "8:abc:120")).toBe(false);
    prvni.zapisProsly("1-01", "8:abc:120");
    expect(prvni.prosel("1-01", "8:abc:120")).toBe(true);
    const druhe = new Uloziste(sklad);
    expect(druhe.prosel("1-01", "8:abc:120")).toBe(true);
    // Jiná úroveň ani jiný most tím neprošly.
    expect(druhe.prosel("1-02", "8:abc:120")).toBe(false);
    expect(druhe.prosel("1-01", "8:def:120")).toBe(false);
  });

  it("drží jen několik posledních mostů na úroveň a stejný most nezapíše dvakrát", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    for (let i = 0; i < 12; i++) uloziste.zapisProsly("1-01", `8:${i}:1`);
    uloziste.zapisProsly("1-01", "8:11:1");
    const data = JSON.parse(sklad.data.get(KLIC_PROSLYCH)!) as Record<string, string[]>;
    expect(data["1-01"]).toHaveLength(8);
    expect(data["1-01"]!.at(-1)).toBe("8:11:1");
    expect(uloziste.prosel("1-01", "8:0:1")).toBe(false);
    expect(uloziste.prosel("1-01", "8:5:1")).toBe(true);
  });

  it("poškozený zápis prošlých mostů nevadí", () => {
    const sklad = new SkladVPameti();
    for (const zapis of ["{", "[]", "null", '{"1-01":"x"}', '{"1-01":[1,2,"8:a:1"]}']) {
      sklad.data.set(KLIC_PROSLYCH, zapis);
      const uloziste = new Uloziste(sklad);
      expect(uloziste.prosel("1-01", "nic")).toBe(false);
      uloziste.zapisProsly("1-01", "8:b:1");
      expect(uloziste.prosel("1-01", "8:b:1")).toBe(true);
    }
    sklad.data.set(KLIC_PROSLYCH, '{"1-01":[1,2,"8:a:1"]}');
    expect(new Uloziste(sklad).prosel("1-01", "8:a:1")).toBe(true);
  });

  it("zpomalený záběr je zapnutý, dokud ho hráč nevypne, a volba se pamatuje", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    expect(uloziste.zpomaleniPadu).toBe(true);
    uloziste.zpomaleniPadu = false;
    expect(sklad.data.get(KLIC_ZABERU)).toBe("0");
    expect(new Uloziste(sklad).zpomaleniPadu).toBe(false);
    uloziste.zpomaleniPadu = true;
    expect(new Uloziste(sklad).zpomaleniPadu).toBe(true);
  });
});
