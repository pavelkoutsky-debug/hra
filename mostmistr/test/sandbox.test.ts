// Sandbox: nastavení údolí a provozu, úroveň, která z něj vznikne, a zkouška na ní.
import { describe, expect, it } from "vitest";
import { ID_PROVOZU, KATALOG } from "../src/data/katalog";
import { ChybaDat } from "../src/data/kontrola";
import { Kreslic } from "../src/data/kreslic";
import { zkontrolujNavrh } from "../src/data/navrh";
import {
  ID_SANDBOXU,
  MEZE_SANDBOXU,
  nactiSandbox,
  nejvicVeSkupine,
  nejvicZakladu,
  PROVOZ_SANDBOXU,
  sandboxNaText,
  sandboxZTextu,
  stejneUdoli,
  urovenSandboxu,
  vychoziPocet,
  vychoziProvoz,
  vychoziSandbox,
  type NastaveniSandboxu,
} from "../src/data/sandbox";
import { DRUHY_TRAS } from "../src/data/uroven";
import { Zkouska } from "../src/zkouska/zkouska";
import { ZKOUSKA_DO_ZLOMU } from "../src/zkouska/zlom";
import { nasadaUrovne } from "../urovne/index";

describe("nastavení sandboxu", () => {
  it("výchozí nastavení je platné a projde zápisem do textu a zpět", () => {
    const vychozi = vychoziSandbox();
    expect(nactiSandbox(vychozi)).toEqual(vychozi);
    expect(sandboxZTextu(sandboxNaText(vychozi))).toEqual(vychozi);
  });

  it("odmítne hodnoty mimo meze, neznámé klíče a provoz, který po trase nejezdí", () => {
    const cesta = (zmena: Record<string, unknown>): string => {
      try {
        nactiSandbox({ ...vychoziSandbox(), ...zmena });
      } catch (chyba) {
        expect(chyba).toBeInstanceOf(ChybaDat);
        return (chyba as ChybaDat).cesta;
      }
      throw new Error("nastavení prošlo");
    };
    expect(cesta({ rozpeti: MEZE_SANDBOXU.rozpeti.max + 1 })).toBe("sandbox.rozpeti");
    expect(cesta({ rozpeti: 12.5 })).toBe("sandbox.rozpeti");
    expect(cesta({ hloubka: 1 })).toBe("sandbox.hloubka");
    expect(cesta({ zaklady: 4 })).toBe("sandbox.zaklady");
    expect(cesta({ druh: "dalnice" })).toBe("sandbox.druh");
    expect(cesta({ navic: 1 })).toBe("sandbox.navic");
    expect(cesta({ verze: 2 })).toBe("sandbox.verze");
    // Vlak po silnici nejede a auto po lávce taky ne.
    expect(cesta({ provoz: [{ druh: "vlak-osobni", pocet: 4, smer: 1, cas: 0 }] })).toBe("sandbox.provoz[0].druh");
    expect(cesta({ druh: "lavka", provoz: [{ druh: "auto", pocet: 1, smer: 1, cas: 0 }] })).toBe("sandbox.provoz[0].druh");
    expect(cesta({ provoz: [{ druh: "auto", pocet: 1, smer: 2, cas: 0 }] })).toBe("sandbox.provoz[0].smer");
    expect(cesta({ provoz: [{ druh: "nadmerny", pocet: 5, smer: 1, cas: 0 }] })).toBe("sandbox.provoz[0].pocet");
    expect(cesta({ provoz: Array.from({ length: 11 }, (_, i) => ({ druh: "auto", pocet: 1, smer: 1, cas: i })) })).toBe("sandbox.provoz");
    expect(() => sandboxZTextu("{nesmysl")).toThrow(ChybaDat);
    // Do úzkého údolí se tři základy nevejdou; hráč dostane chybu, ne potichu míň základů.
    expect(cesta({ rozpeti: 8, zaklady: 2 })).toBe("sandbox.zaklady");
    expect(nactiSandbox({ ...vychoziSandbox(), rozpeti: 8, zaklady: 1 }).zaklady).toBe(1);
  });

  it("po jedné koleji jedou vlaky jedním směrem; po silnici a lávce smějí proti sobě", () => {
    const vlaky = (smery: (1 | -1)[]): unknown => ({
      ...vychoziSandbox(),
      druh: "kolej",
      provoz: smery.map((smer, i) => ({ druh: "vlak-osobni", pocet: 2, smer, cas: 10 * i })),
    });
    expect(nactiSandbox(vlaky([1, 1, 1])).provoz).toHaveLength(3);
    expect(nactiSandbox(vlaky([-1, -1])).provoz).toHaveLength(2);
    let cesta = "";
    try {
      nactiSandbox(vlaky([1, 1, -1]));
    } catch (chyba) {
      cesta = (chyba as ChybaDat).cesta;
    }
    expect(cesta).toBe("sandbox.provoz[2].smer");
    // Výchozí silnice má auta zleva a náklaďák zprava.
    expect(new Set(vychoziSandbox().provoz.map((p) => p.smer)).size).toBe(2);
  });

  it("každý druh provozu ze hry je v nabídce sandboxu, nebo je vědomě vynechaný", () => {
    // Seznam `PROVOZ_SANDBOXU` je ruční: nový provoz ve hře tenhle test připomene.
    const nabidka = new Set<string>(Object.values(PROVOZ_SANDBOXU).flat());
    const vynechane = new Set<string>([
      // Vozy jezdí jen za lokomotivou: nabídka má hotové soupravy.
      "vuz-nakladni",
      "vuz-prazdny",
      "vuz-osobni",
      // Loď není účastník trasy a sandbox nemá pohyblivý most.
      "lod",
      // Hra je zatím neumí (zkouška je odmítne).
      "motocykl",
      "traktor",
    ]);
    for (const druh of ID_PROVOZU) expect(nabidka.has(druh) !== vynechane.has(druh), druh).toBe(true);
    expect(nabidka.has("vlak-osobni") && nabidka.has("vlak-nakladni")).toBe(true);
  });

  it("každý druh trasy má výchozí provoz, který po ní smí jet", () => {
    for (const druh of DRUHY_TRAS) {
      const provoz = vychoziProvoz(druh);
      expect(provoz.length, druh).toBeGreaterThan(0);
      expect(nactiSandbox({ ...vychoziSandbox(), druh, provoz }).provoz).toEqual(provoz);
    }
  });

  it("výchozí počty se vejdou do mezí každého druhu provozu", () => {
    for (const druh of DRUHY_TRAS) {
      for (const provoz of PROVOZ_SANDBOXU[druh]) {
        expect(vychoziPocet(provoz), provoz).toBeGreaterThanOrEqual(1);
        expect(vychoziPocet(provoz), provoz).toBeLessThanOrEqual(nejvicVeSkupine(provoz));
      }
    }
  });

  it("pozná, jestli změna nastavení mění údolí (most pak neplatí), nebo jen provoz", () => {
    const a = vychoziSandbox();
    expect(stejneUdoli(a, { ...a, provoz: [] })).toBe(true);
    expect(stejneUdoli(a, { ...a, rozpeti: 30 })).toBe(false);
    expect(stejneUdoli(a, { ...a, zaklady: 2 })).toBe(false);
    expect(stejneUdoli(a, { ...a, druh: "lavka", provoz: [] })).toBe(false);
    // Voda opěry ani kotvy nemění: most zůstává.
    expect(stejneUdoli(a, { ...a, voda: !a.voda })).toBe(true);
  });
});

describe("úroveň sandboxu", () => {
  it("každé rozpětí, hloubka, druh trasy a počet základů dá platnou úroveň", () => {
    for (const druh of DRUHY_TRAS) {
      for (let rozpeti = MEZE_SANDBOXU.rozpeti.min; rozpeti <= MEZE_SANDBOXU.rozpeti.max; rozpeti += 1) {
        for (const hloubka of [MEZE_SANDBOXU.hloubka.min, 8, MEZE_SANDBOXU.hloubka.max]) {
          for (let zaklady = 0; zaklady <= nejvicZakladu(rozpeti); zaklady++) {
            const nastaveni: NastaveniSandboxu = { verze: 1, rozpeti, hloubka, druh, voda: zaklady % 2 === 0, zaklady, provoz: [] };
            const u = urovenSandboxu(nastaveni);
            expect(u.id).toBe(ID_SANDBOXU);
            expect(u.rozpocet).toBeNull();
            expect(u.trasy[0]).toMatchObject({ druh, zacatek: { x: 0, y: 0 }, konec: { x: rozpeti, y: 0 } });
            // Základů je přesně tolik, kolik hráč chtěl, a stojí aspoň tři metry od sebe
            // a metr od kotev v patách svahů (jinak by se patky i popisky překrývaly).
            expect(u.zaklady, `${rozpeti} m, ${zaklady} základů`).toHaveLength(zaklady);
            const paty = u.kotvy.filter((k) => k.y === -hloubka).map((k) => k.x);
            u.zaklady.forEach((z, k) => {
              expect(z.y).toBe(-hloubka);
              expect(Number.isInteger(z.x)).toBe(true);
              for (const pata of paty) expect(Math.abs(z.x - pata), `${rozpeti} m`).toBeGreaterThanOrEqual(1);
              if (k > 0) expect(z.x - u.zaklady[k - 1]!.x, `${rozpeti} m`).toBeGreaterThanOrEqual(3);
            });
            expect(u.hladina === null).toBe(zaklady % 2 !== 0);
          }
          // Víc základů, než se vejde, nastavení odmítne.
          if (nejvicZakladu(rozpeti) < MEZE_SANDBOXU.zaklady.max) {
            expect(() => urovenSandboxu({ verze: 1, rozpeti, hloubka, druh, voda: true, zaklady: nejvicZakladu(rozpeti) + 1, provoz: [] })).toThrow();
          }
        }
      }
    }
  });

  it("od šestnácti metrů se vejdou tři základy; v nejužším údolí jeden", () => {
    expect(nejvicZakladu(6)).toBe(1);
    expect(nejvicZakladu(9)).toBe(2);
    expect(nejvicZakladu(16)).toBe(3);
    expect(nejvicZakladu(72)).toBe(3);
    // Široké údolí dělí základy na stejná pole.
    expect(urovenSandboxu({ ...vychoziSandbox(), rozpeti: 24, zaklady: 3 }).zaklady.map((z) => z.x)).toEqual([6, 12, 18]);
    // Základy stojí souměrně kolem středu i tam, kde dělení nevychází na celé metry.
    for (let rozpeti = MEZE_SANDBOXU.rozpeti.min; rozpeti <= MEZE_SANDBOXU.rozpeti.max; rozpeti++) {
      for (let zaklady = 2; zaklady <= nejvicZakladu(rozpeti); zaklady++) {
        const mista = urovenSandboxu({ ...vychoziSandbox(), rozpeti, zaklady }).zaklady.map((z) => z.x);
        expect(mista[0]! + mista.at(-1)!, `${rozpeti} m, ${zaklady} základů`).toBe(rozpeti);
      }
    }
  });

  it("dovoluje všechny hotové prvky kromě pístu; na koleji jen kolejiště, jinde ostatní mostovky", () => {
    const silnice = urovenSandboxu(vychoziSandbox());
    const hotove = (Object.keys(KATALOG) as (keyof typeof KATALOG)[]).filter((id) => KATALOG[id].hotovo);
    expect(silnice.povolenePrvky).toEqual(hotove.filter((id) => id !== "pist" && id !== "pruzina" && id !== "kolejiste"));
    expect(silnice.povoleneSvary).toBe(true);
    expect(silnice.budic && silnice.osaFrekvenci && silnice.rezonancniKrivka).toBe(true);
    const kolej = urovenSandboxu({ ...vychoziSandbox(), druh: "kolej", provoz: [] });
    expect(kolej.povolenePrvky.filter((id) => KATALOG[id].druh === "mostovka")).toEqual(["kolejiste"]);
    expect(kolej.povolenePrvky).toContain("lano");
  });

  it("provoz sandboxu se převede na jízdní řád; vlak dostane vozy", () => {
    const u = urovenSandboxu({
      ...vychoziSandbox(),
      druh: "kolej",
      provoz: [
        { druh: "vlak-osobni", pocet: 4, smer: 1, cas: 0 },
        { druh: "vlak-nakladni", pocet: 6, smer: 1, cas: 30 },
        { druh: "lokomotiva", pocet: 2, smer: 1, cas: 60 },
      ],
    });
    expect(u.jizdniRad).toEqual([
      { cas: 0, trasa: "trasa", smer: 1, druh: "lokomotiva", vozy: [{ druh: "vuz-osobni", pocet: 4 }] },
      { cas: 30, trasa: "trasa", smer: 1, druh: "lokomotiva", vozy: [{ druh: "vuz-nakladni", pocet: 6 }] },
      { cas: 60, trasa: "trasa", smer: 1, druh: "lokomotiva", pocet: 2 },
    ]);
    const lavka = urovenSandboxu({ ...vychoziSandbox(), druh: "lavka", provoz: [{ druh: "dav", pocet: 30, smer: 1, cas: 2 }] });
    expect(lavka.jizdniRad).toEqual([{ cas: 2, trasa: "trasa", smer: 1, druh: "dav", pocet: 30 }]);
  });
});

describe("zkouška v sandboxu", () => {
  /** Ocelobetonová mostovka s ocelovou příhradou nad ní přes výchozí údolí 24 m. */
  function prihrada(): ReturnType<Kreslic["navrh"]> {
    const k = new Kreslic(ID_SANDBOXU);
    for (let x = 0; x < 24; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
    k.prut("ocel-tezka", [0, 0], [6, 5]);
    k.prut("ocel-tezka", [6, 5], [12, 5]);
    k.prut("ocel-tezka", [12, 5], [18, 5]);
    k.prut("ocel-tezka", [18, 5], [24, 0]);
    for (const x of [6, 12, 18]) k.prut("ocel-lehka", [x, 0], [x, 5]);
    k.prut("ocel-lehka", [6, 5], [12, 0]);
    k.prut("ocel-lehka", [18, 5], [12, 0]);
    return k.navrh();
  }

  it("most přes výchozí údolí unese výchozí provoz; medaile za rozpočet a mistrovská tu nejsou", () => {
    const u = urovenSandboxu(vychoziSandbox());
    const navrh = prihrada();
    expect(zkontrolujNavrh(navrh, u)).toEqual([]);
    const zkouska = new Zkouska(u, navrh, nasadaUrovne(u));
    while (!zkouska.hotovo) zkouska.pokracuj(1);
    const v = zkouska.vysledek();
    expect(v).toMatchObject({ pruchod: true, ucastniku: 3, prejelo: 3, spadlo: 0, poruseni: 0 });
    expect(v.medaile).toEqual({ pruchod: true, rozpocet: false, mistrovska: false });
  }, 60_000);

  it("zkouška do zlomu běží i v sandboxu", () => {
    const u = urovenSandboxu(vychoziSandbox());
    const zkouska = new Zkouska(u, prihrada(), nasadaUrovne(u), undefined, undefined, ZKOUSKA_DO_ZLOMU);
    while (!zkouska.hotovo) zkouska.pokracuj(1);
    const zlom = zkouska.vysledek().zlom!;
    expect(zlom.cas).not.toBeNull();
    expect(zlom.delka).toBe(24);
    expect(zlom.celkem).toBeGreaterThan(1_000_000);
  }, 60_000);
});
