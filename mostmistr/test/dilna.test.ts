// Dílna: uložené práce z pískoviště a nastavení pískoviště v adrese (odkaz na scénář).
import { describe, expect, it } from "vitest";
import {
  dilnaNaText,
  dilnaZTextu,
  jeSandboxVAdrese,
  jeStejnaPrace,
  NEJDELSI_NAZEV_PRACE,
  NEJVIC_PRACI,
  odkazNaScenar,
  prazdnaDilna,
  sandboxDoAdresy,
  sandboxZAdresy,
  smazPraci,
  ulozPraci,
  upravNazevPrace,
  volnyNazevPrace,
} from "../src/data/dilna";
import { ChybaDat } from "../src/data/kontrola";
import { Kreslic } from "../src/data/kreslic";
import { navrhNaText } from "../src/data/navrh";
import { ID_SANDBOXU, PREDLOHY_SANDBOXU, sandboxNaText, vychoziSandbox, type NastaveniSandboxu } from "../src/data/sandbox";
import { rozkodujMost, zakodujMost } from "../src/data/sdileni";
import { RESENI } from "../urovne/reseni";

function most(pruty = 4): ReturnType<Kreslic["navrh"]> {
  const k = new Kreslic(ID_SANDBOXU);
  for (let i = 0; i < pruty; i++) k.prut("mostovka-ocelobeton", [i * 6, 0], [i * 6 + 6, 0]);
  return k.navrh();
}

describe("práce v dílně", () => {
  it("uloží práci, přepíše práci stejného jména a nejnovější drží nahoře", () => {
    let dilna = prazdnaDilna();
    const a = ulozPraci(dilna, "  Můj   první most ", vychoziSandbox(), most(), 1000);
    expect(a.stav).toBe("ulozeno");
    dilna = a.dilna;
    expect(dilna.prace).toHaveLength(1);
    expect(dilna.prace[0]).toMatchObject({ nazev: "Můj první most", ulozeno: 1000 });
    expect(navrhNaText(rozkodujMost(dilna.prace[0]!.kod))).toBe(navrhNaText(most()));
    dilna = ulozPraci(dilna, "Lávka", PREDLOHY_SANDBOXU[0]!.nastaveni, most(2), 2000).dilna;
    expect(dilna.prace.map((p) => p.nazev)).toEqual(["Lávka", "Můj první most"]);
    const prepis = ulozPraci(dilna, "Můj první most", vychoziSandbox(), most(3), 3000);
    expect(prepis.stav).toBe("prepsano");
    expect(prepis.dilna.prace.map((p) => p.nazev)).toEqual(["Můj první most", "Lávka"]);
    expect(rozkodujMost(prepis.dilna.prace[0]!.kod).pruty).toHaveLength(3);
    // Vstupní dílna se nemění.
    expect(dilna.prace.map((p) => p.nazev)).toEqual(["Lávka", "Můj první most"]);
    expect(smazPraci(prepis.dilna, "Lávka").prace.map((p) => p.nazev)).toEqual(["Můj první most"]);
  });

  it("jméno se čistí a krátí; prázdné jméno a plná dílna se odmítnou", () => {
    expect(upravNazevPrace("  a\tb\n c  ")).toBe("a b c");
    expect([...upravNazevPrace("x".repeat(200))]).toHaveLength(NEJDELSI_NAZEV_PRACE);
    expect(ulozPraci(prazdnaDilna(), "   ", vychoziSandbox(), most(), 1).stav).toBe("bez-jmena");
    let dilna = prazdnaDilna();
    for (let i = 0; i < NEJVIC_PRACI; i++) dilna = ulozPraci(dilna, `Most ${i + 1}`, vychoziSandbox(), most(), i).dilna;
    expect(dilna.prace).toHaveLength(NEJVIC_PRACI);
    expect(ulozPraci(dilna, "Další", vychoziSandbox(), most(), 99).stav).toBe("plno");
    // Přepsat práci, která v plné dílně už je, jde.
    expect(ulozPraci(dilna, "Most 3", vychoziSandbox(), most(2), 99).stav).toBe("prepsano");
    expect(volnyNazevPrace(dilna, "Most")).toBe(`Most ${NEJVIC_PRACI + 1}`);
    expect(volnyNazevPrace(smazPraci(dilna, "Most 2"), "Most")).toBe("Most 2");
    expect(volnyNazevPrace(prazdnaDilna(), "Most")).toBe("Most 1");
  });

  it("zápis do textu a zpět; nečitelný zápis je prázdná dílna a vadná práce se vynechá", () => {
    let dilna = prazdnaDilna();
    for (const [i, predloha] of PREDLOHY_SANDBOXU.entries()) dilna = ulozPraci(dilna, `Práce ${predloha.id}`, predloha.nastaveni, most(1 + (i % 3)), i).dilna;
    expect(dilnaZTextu(dilnaNaText(dilna))).toEqual(dilna);
    expect(dilnaZTextu(null)).toEqual(prazdnaDilna());
    expect(dilnaZTextu("{rozbité")).toEqual(prazdnaDilna());
    expect(dilnaZTextu('{"verze":7,"prace":[]}')).toEqual(prazdnaDilna());
    const zapis = JSON.parse(dilnaNaText(dilna)) as { prace: Record<string, unknown>[] };
    // Poškozený kód, nastavení mimo meze, most cizí úrovně, prázdné jméno a jméno podruhé.
    zapis.prace[0]!.kod = "nesmysl";
    zapis.prace[1]!.nastaveni = { ...(zapis.prace[1]!.nastaveni as object), rozpeti: 5000 };
    zapis.prace[2]!.kod = zakodujMost(RESENI["1-03"]!.pruchod);
    zapis.prace[3]!.nazev = "   ";
    zapis.prace[5]!.nazev = zapis.prace[4]!.nazev;
    const prectena = dilnaZTextu(JSON.stringify(zapis));
    expect(prectena.prace.map((p) => p.nazev)).toEqual([dilna.prace[4]!.nazev]);
  });

  it("pozná, že práce je totéž co údolí a most na stole", () => {
    const dilna = ulozPraci(prazdnaDilna(), "A", vychoziSandbox(), most(), 1).dilna;
    const prace = dilna.prace[0]!;
    expect(jeStejnaPrace(prace, vychoziSandbox(), zakodujMost(most()))).toBe(true);
    expect(jeStejnaPrace(prace, vychoziSandbox(), zakodujMost(most(3)))).toBe(false);
    expect(jeStejnaPrace(prace, { ...vychoziSandbox(), voda: false }, zakodujMost(most()))).toBe(false);
  });
});

describe("nastavení pískoviště v adrese", () => {
  const vzorky: NastaveniSandboxu[] = [
    ...PREDLOHY_SANDBOXU.map((p) => p.nastaveni),
    { ...vychoziSandbox(), provoz: [] },
    { ...vychoziSandbox(), provoz: [{ druh: "auto", pocet: 3, smer: -1, cas: 2.5 }], rozpocet: 250_000, komfort: 1 },
    { ...vychoziSandbox(), voda: false, zvedani: { cas: 0, lod: 0, kridla: 1 } },
    {
      ...vychoziSandbox(),
      druh: "lavka",
      provoz: [
        { druh: "bezecky-zavod", pocet: 30, smer: 1, cas: 0.1 + 0.2 },
        { druh: "skakajici-dav", pocet: 60, smer: -1, cas: 120 },
      ],
      komfort: 2,
    },
  ];

  it("zápis do adresy a zpět dá přesně stejné nastavení a nepotřebuje kódování", () => {
    for (const nastaveni of vzorky) {
      const zapis = sandboxDoAdresy(nastaveni);
      expect(jeSandboxVAdrese(zapis)).toBe(true);
      expect(encodeURIComponent(zapis).replace(/%3A/g, ":")).toBe(zapis);
      expect(/\d$/.test(zapis)).toBe(true);
      expect(sandboxZAdresy(zapis)).toEqual(nastaveni);
      // Adresou projde i přes URLSearchParams.
      const adresa = new URL(odkazNaScenar("https://hra.example/cesta/?stare=1#kotva", nastaveni, "KOD-MOSTU_"));
      expect(adresa.origin + adresa.pathname).toBe("https://hra.example/cesta/");
      expect(adresa.searchParams.get("most")).toBe("KOD-MOSTU_");
      expect(sandboxZAdresy(adresa.searchParams.get("sandbox")!)).toEqual(nastaveni);
      expect(zapis.length).toBeLessThan(encodeURIComponent(sandboxNaText(nastaveni)).length / 2);
    }
    expect(sandboxDoAdresy(vychoziSandbox())).toBe("2~24~8~s~1~1~auto:2:1:0_nakladni:1:0:4~~~3");
    expect(sandboxDoAdresy(PREDLOHY_SANDBOXU.find((p) => p.id === "kanal")!.nastaveni)).toBe("2~16~8~s~1~0~auto:2:1:0_autobus:1:0:22~2:6:9~~3");
  });

  it("prázdný parametr, číslo a JSON úsporný zápis nejsou; poškozený zápis se odmítne", () => {
    for (const text of ["", "1", "{}", '{"verze":2}']) expect(jeSandboxVAdrese(text), text).toBe(false);
    const dobre = sandboxDoAdresy(vychoziSandbox());
    const spatne = [
      dobre.replace(/^2~/, "3~"),
      dobre.replace("~s~", "~x~"),
      dobre.replace("~24~", "~2400~"),
      dobre.replace("~24~", "~24a~"),
      dobre.replace("auto:2", "tank:2"),
      dobre.replace("auto:2:1:0", "auto:2:1"),
      dobre.replace(":1:0_", ":7:0_"),
      dobre.slice(0, -2),
      `${dobre}~1`,
      dobre.replace(/~3$/, "~9"),
      dobre.replace("~~~3", "~1:5~~3"),
      // Loď bez vody.
      sandboxDoAdresy({ ...vychoziSandbox(), zvedani: { cas: 6, lod: 9, kridla: 2 } }).replace("~s~1~", "~s~0~"),
    ];
    for (const zapis of spatne) expect(() => sandboxZAdresy(zapis), zapis).toThrow(ChybaDat);
  });
});
