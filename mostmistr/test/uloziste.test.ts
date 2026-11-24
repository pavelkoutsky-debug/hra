// Uložený postup v paměti prohlížeče: čtení, zápis a odolnost proti poškozeným datům.
import { describe, expect, it } from "vitest";
import { ulozeniNaText, ulozeniZTextu, VERZE_ULOZENI, verzeZapisuUlozeni } from "../src/data/ulozeni";
import { Kreslic } from "../src/zkouska/regrese";
import { prazdnaDilna, ulozPraci } from "../src/data/dilna";
import { ID_SANDBOXU, sandboxNaText, vychoziSandbox } from "../src/data/sandbox";
import {
  KLIC_CISEL,
  KLIC_DILNY,
  KLIC_HAVARII,
  KLIC_ODEMCENI,
  KLIC_POSKOZENEHO,
  KLIC_PROSLYCH,
  KLIC_SANDBOXU,
  KLIC_ZABERU,
  KLIC_ULOZENI,
  KLIC_VYZEV_ODKAZU,
  KLIC_ZVUKU,
  OZNAMENI_M12,
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

describe("postup s jedním mostem, který nejde přečíst", () => {
  it("zahodí jen ten most, medaile nechá a původní zápis odloží stranou", () => {
    const sklad = new SkladVPameti();
    const prvni = new Uloziste(sklad);
    prvni.ulozNavrh(most());
    prvni.zapocitej("1-01", PRUCHOD, 12_000, 1);
    prvni.zapocitej("1-02", PRUCHOD, 30_000, 1);
    // Do postupu se dostal most se dvěma pruty téhož id.
    const zapis = JSON.parse(sklad.getItem(KLIC_ULOZENI)!) as { navrhy: Record<string, { pruty: unknown[] }> };
    zapis.navrhy["1-01"]!.pruty.push(zapis.navrhy["1-01"]!.pruty[0]);
    const vadny = JSON.stringify(zapis);
    sklad.setItem(KLIC_ULOZENI, vadny);
    const po = new Uloziste(sklad);
    expect(po.poskozeno).toBe(false);
    expect(po.navrh("1-01")).toBeUndefined();
    expect(po.rekord("1-01")?.medaile.pruchod).toBe(true);
    expect(po.rekord("1-02")?.medaile.pruchod).toBe(true);
    expect(sklad.getItem(KLIC_POSKOZENEHO)).toBe(vadny);
    // Postup je zapsaný čistý: další start už nic nezahazuje.
    expect(JSON.parse(sklad.getItem(KLIC_ULOZENI)!).navrhy).toEqual({});
  });
});

describe("hra otevřená ve dvou záložkách", () => {
  it("zápis z jedné záložky nevrátí druhé starý most ani nesmaže její medaile", () => {
    const sklad = new SkladVPameti();
    const a = new Uloziste(sklad);
    a.ulozNavrh(most());
    // Záložka B se otevře (třeba odkazem na cizí most) a drží snímek s původním mostem.
    const b = new Uloziste(sklad);
    // V A hráč most přestaví a získá medaili.
    const k = new Kreslic("1-01");
    k.prut("mostovka-drevo", [0, 0], [8, 0]);
    const novy = k.navrh();
    a.ulozNavrh(novy);
    a.zapocitej("1-01", PRUCHOD, 12_000, 1);
    // B vidí, co A mezitím uložila, a její zápis (rekord jiné úrovně) to nepřepíše.
    expect(b.navrh("1-01")).toEqual(novy);
    b.zapocitej("1-02", PRUCHOD, 30_000, 1);
    const pote = new Uloziste(sklad);
    expect(pote.navrh("1-01")).toEqual(novy);
    expect(pote.rekord("1-01")?.medaile.pruchod).toBe(true);
    expect(pote.rekord("1-02")?.medaile.pruchod).toBe(true);
    // A o rekordu z B ví také.
    expect(a.rekord("1-02")?.medaile.pruchod).toBe(true);
  });

  it("nečitelný zápis cizí záložky postup téhle stránky nezahodí", () => {
    const sklad = new SkladVPameti();
    const a = new Uloziste(sklad);
    a.ulozNavrh(most());
    sklad.setItem(KLIC_ULOZENI, "{tohle není postup");
    expect(a.navrh("1-01")).toEqual(most());
    a.zapocitej("1-01", PRUCHOD, 12_000, 1);
    expect(new Uloziste(sklad).navrh("1-01")).toEqual(most());
  });
});

describe("postup uložený před M12", () => {
  const STARY = JSON.stringify({
    verze: 3,
    navrhy: {},
    rekordy: {
      "1-01": { verzeFyziky: 8, medaile: { pruchod: true, rozpocet: false, mistrovska: true }, nejlepsiCena: 23000, nejlepsiHmotnost: 700, nejlepsiZlom: 3.9, verzeZlomu: 8 },
    },
  });

  it("převede se jednou: zapíše se v novém formátu, zapomene prošlé mosty a nechá hráči oznámení", () => {
    const sklad = new SkladVPameti();
    sklad.data.set(KLIC_ULOZENI, STARY);
    sklad.data.set(KLIC_PROSLYCH, '{"1-01":["8:stary:1"]}');
    const prvni = new Uloziste(sklad);
    expect(prvni.poskozeno).toBe(false);
    // Mistrovská bez rozpočtové podle nových pravidel neexistuje; cena je z jiné úrovně.
    expect(prvni.rekord("1-01")).toMatchObject({ medaile: { pruchod: true, rozpocet: false, mistrovska: false }, nejlepsiCena: null, nejlepsiZlom: null });
    expect(prvni.prosel("1-01", "8:stary:1")).toBe(false);
    expect(prvni.oznameni).toBe(OZNAMENI_M12);
    expect(verzeZapisuUlozeni(sklad.data.get(KLIC_ULOZENI)!)).toBe(VERZE_ULOZENI);

    // Most, který projde po převodu, se pamatuje i přes další načtení: převod se neopakuje.
    prvni.zapisProsly("1-01", "8:novy:1");
    const druhe = new Uloziste(sklad);
    expect(druhe.prosel("1-01", "8:novy:1")).toBe(true);
    // Oznámení čeká, dokud ho přehled neukáže, a pak už se nevrací.
    expect(druhe.oznameni).toBe(OZNAMENI_M12);
    druhe.odlozOznameni();
    expect(druhe.oznameni).toBeNull();
    expect(new Uloziste(sklad).oznameni).toBeNull();
  });

  it("hráč bez rekordů oznámení nedostane a nový postup se nepřevádí", () => {
    const prazdny = new SkladVPameti();
    prazdny.data.set(KLIC_ULOZENI, JSON.stringify({ verze: 3, navrhy: {}, rekordy: {} }));
    expect(new Uloziste(prazdny).oznameni).toBeNull();
    const novy = new SkladVPameti();
    const uloziste = new Uloziste(novy);
    uloziste.zapocitej("1-01", PRUCHOD, 33133, 8, 950);
    uloziste.zapisProsly("1-01", "8:a:1");
    const znovu = new Uloziste(novy);
    expect(znovu.oznameni).toBeNull();
    expect(znovu.prosel("1-01", "8:a:1")).toBe(true);
    expect(znovu.rekord("1-01")!.nejlepsiCena).toBe(33133);
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

  it("výzva z odkazu se pamatuje pro každou úroveň zvlášť a poškozený zápis nevadí", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    expect(uloziste.vyzvaOdkazu("1-01")).toBeNull();
    uloziste.nastavVyzvuOdkazu("1-01", "AQQEMS0wMQ");
    uloziste.nastavVyzvuOdkazu("1-03", "AQQEMS0wMw");
    expect(new Uloziste(sklad).vyzvaOdkazu("1-01")).toBe("AQQEMS0wMQ");
    expect(new Uloziste(sklad).vyzvaOdkazu("1-03")).toBe("AQQEMS0wMw");
    uloziste.nastavVyzvuOdkazu("1-01", null);
    expect(new Uloziste(sklad).vyzvaOdkazu("1-01")).toBeNull();
    expect(new Uloziste(sklad).vyzvaOdkazu("1-03")).toBe("AQQEMS0wMw");
    // Uložený postup (mosty a rekordy) výzva neovlivní.
    expect(sklad.data.has(KLIC_ULOZENI)).toBe(false);
    for (const zapis of ["{", "[]", "null", '{"1-01":7}', `{"1-01":"${"A".repeat(7000)}"}`]) {
      sklad.data.set(KLIC_VYZEV_ODKAZU, zapis);
      expect(new Uloziste(sklad).vyzvaOdkazu("1-01")).toBeNull();
    }
    // Bez paměti prohlížeče se nic nepamatuje a nic nespadne.
    const bez = new Uloziste(null);
    bez.nastavVyzvuOdkazu("1-01", "AQQEMS0wMQ");
    expect(bez.vyzvaOdkazu("1-01")).toBeNull();
  });

  it("Havarijní komise: uzavřené případy a rozdělaná oprava se pamatují; horší výsledek lepší nepřepíše", () => {
    const sklad = new SkladVPameti();
    const uloziste = new Uloziste(sklad);
    expect(uloziste.havarie).toEqual({});
    uloziste.zapisHavarii("9-02", 3);
    uloziste.zapisHavarii("9-02", 2);
    uloziste.zapisHavarii("9-02", 3);
    uloziste.zapisHavarii("9-01", 1);
    expect(new Uloziste(sklad).havarie).toEqual({ "9-01": 1, "9-02": 2 });
    // Rozdělaná oprava se ukládá jako most úrovně případu; medaile ani rekord k ní nevzniknou.
    const k = new Kreslic("9-01");
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    uloziste.ulozNavrh(k.navrh());
    const znovu = new Uloziste(sklad);
    expect(znovu.navrh("9-01")?.pruty).toHaveLength(1);
    expect(znovu.rekord("9-01")).toBeUndefined();
    sklad.setItem(KLIC_HAVARII, "{rozbité");
    expect(znovu.havarie).toEqual({});
  });

  it("dílna: práce z pískoviště se pamatují mezi návštěvami, čtou se i po zápisu z jiné záložky a rozbitý zápis je prázdná dílna", () => {
    const sklad = new SkladVPameti();
    const prvni = new Uloziste(sklad);
    const druhe = new Uloziste(sklad);
    expect(prvni.dilna).toEqual(prazdnaDilna());
    const k = new Kreslic(ID_SANDBOXU);
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    prvni.dilna = ulozPraci(prvni.dilna, "První", vychoziSandbox(), k.navrh(), 1).dilna;
    // Druhá záložka práci vidí a přidá svou; první pak vidí obě.
    expect(druhe.dilna.prace.map((p) => p.nazev)).toEqual(["První"]);
    druhe.dilna = ulozPraci(druhe.dilna, "Druhá", vychoziSandbox(), k.navrh(), 2).dilna;
    expect(prvni.dilna.prace.map((p) => p.nazev)).toEqual(["Druhá", "První"]);
    expect(new Uloziste(sklad).dilna.prace).toHaveLength(2);
    sklad.setItem(KLIC_DILNY, "{rozbité");
    expect(prvni.dilna).toEqual(prazdnaDilna());
    // Bez paměti prohlížeče si dílna nepamatuje nic a nic nespadne.
    const bez = new Uloziste(null);
    bez.dilna = ulozPraci(bez.dilna, "Nic", vychoziSandbox(), k.navrh(), 3).dilna;
    expect(bez.dilna).toEqual(prazdnaDilna());
  });
});
