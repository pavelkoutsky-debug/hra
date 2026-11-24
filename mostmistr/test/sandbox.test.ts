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
  PREDLOHY_SANDBOXU,
  PROVOZ_SANDBOXU,
  sandboxNaText,
  sandboxZTextu,
  stejneUdoli,
  urovenSandboxu,
  VERZE_SANDBOXU,
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
    expect(cesta({ verze: 3 })).toBe("sandbox.verze");
    // Zvedání a cíl: čas a výška lodi v mezích, loď jen s vodou, rozpočet v mezích, třída 1 až 3.
    expect(cesta({ zvedani: { cas: -1, lod: 0, kridla: 1 } })).toBe("sandbox.zvedani.cas");
    expect(cesta({ zvedani: { cas: 5, lod: MEZE_SANDBOXU.lod.max + 1, kridla: 1 } })).toBe("sandbox.zvedani.lod");
    expect(cesta({ zvedani: { cas: 5, lod: 6, kridla: 3 } })).toBe("sandbox.zvedani.kridla");
    expect(cesta({ zvedani: { cas: 5, lod: 6, kridla: 1, navic: 1 } })).toBe("sandbox.zvedani.navic");
    expect(cesta({ voda: false, zvedani: { cas: 5, lod: 6, kridla: 1 } })).toBe("sandbox.zvedani.lod");
    expect(nactiSandbox({ ...vychoziSandbox(), voda: false, zvedani: { cas: 5, lod: 0, kridla: 2 } }).zvedani).toEqual({ cas: 5, lod: 0, kridla: 2 });
    expect(cesta({ rozpocet: 500 })).toBe("sandbox.rozpocet");
    expect(cesta({ rozpocet: 120_000.5 })).toBe("sandbox.rozpocet");
    expect(cesta({ komfort: 4 })).toBe("sandbox.komfort");
    expect(cesta({ komfort: undefined })).toBe("sandbox.komfort");
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

  it("nastavení verze 1 (před dílnou) se čte dál: bez zvedání a bez cíle", () => {
    const stare = { verze: 1, rozpeti: 30, hloubka: 9, druh: "lavka", voda: true, zaklady: 2, provoz: [{ druh: "dav", pocet: 30, smer: 1, cas: 0 }] };
    expect(sandboxZTextu(JSON.stringify(stare))).toEqual({ ...stare, verze: VERZE_SANDBOXU, zvedani: null, rozpocet: null, komfort: 3 });
    // Verze 1 s polem, které neznala, je poškozený zápis, ne nastavení k doplnění.
    expect(() => nactiSandbox({ ...stare, rozpocet: 100_000 })).toThrow(ChybaDat);
  });

  it("hotová údolí jsou platná nastavení, každé jiné, a jedno je výchozí pískoviště", () => {
    const zapisy = new Set<string>();
    for (const predloha of PREDLOHY_SANDBOXU) {
      expect(nactiSandbox(predloha.nastaveni), predloha.id).toEqual(predloha.nastaveni);
      expect(() => urovenSandboxu(predloha.nastaveni), predloha.id).not.toThrow();
      zapisy.add(sandboxNaText(predloha.nastaveni));
    }
    expect(zapisy.size).toBe(PREDLOHY_SANDBOXU.length);
    expect(new Set(PREDLOHY_SANDBOXU.map((p) => p.id)).size).toBe(PREDLOHY_SANDBOXU.length);
    expect(zapisy.has(sandboxNaText(vychoziSandbox()))).toBe(true);
    // Mezi předlohami je každý druh trasy, zvedací most i cíl kmitání.
    expect(new Set(PREDLOHY_SANDBOXU.map((p) => p.nastaveni.druh))).toEqual(new Set(DRUHY_TRAS));
    expect(PREDLOHY_SANDBOXU.some((p) => p.nastaveni.zvedani !== null)).toBe(true);
    expect(PREDLOHY_SANDBOXU.some((p) => p.nastaveni.komfort < 3)).toBe(true);
  });

  it("pozná, jestli změna nastavení mění údolí (most pak neplatí), nebo jen provoz", () => {
    const a = vychoziSandbox();
    expect(stejneUdoli(a, { ...a, provoz: [] })).toBe(true);
    expect(stejneUdoli(a, { ...a, rozpeti: 30 })).toBe(false);
    expect(stejneUdoli(a, { ...a, zaklady: 2 })).toBe(false);
    expect(stejneUdoli(a, { ...a, druh: "lavka", provoz: [] })).toBe(false);
    // Voda opěry ani kotvy nemění: most zůstává.
    expect(stejneUdoli(a, { ...a, voda: !a.voda })).toBe(true);
    // Cíl most nemění; zvedání ano (kotvy pístů, píst a zámek v paletě), loď a čas zvedání ne.
    expect(stejneUdoli(a, { ...a, rozpocet: 200_000, komfort: 1 })).toBe(true);
    expect(stejneUdoli(a, { ...a, zvedani: { cas: 6, lod: 0, kridla: 1 } })).toBe(false);
    expect(stejneUdoli({ ...a, zvedani: { cas: 6, lod: 0, kridla: 1 } }, { ...a, zvedani: { cas: 20, lod: 9, kridla: 1 } })).toBe(true);
    expect(stejneUdoli({ ...a, zvedani: { cas: 6, lod: 0, kridla: 1 } }, { ...a, zvedani: { cas: 6, lod: 0, kridla: 2 } })).toBe(false);
  });
});

describe("úroveň sandboxu", () => {
  it("každé rozpětí, hloubka, druh trasy a počet základů dá platnou úroveň", () => {
    for (const druh of DRUHY_TRAS) {
      for (let rozpeti = MEZE_SANDBOXU.rozpeti.min; rozpeti <= MEZE_SANDBOXU.rozpeti.max; rozpeti += 1) {
        for (const hloubka of [MEZE_SANDBOXU.hloubka.min, 8, MEZE_SANDBOXU.hloubka.max]) {
          for (let zaklady = 0; zaklady <= nejvicZakladu(rozpeti); zaklady++) {
            const nastaveni: NastaveniSandboxu = { ...vychoziSandbox(), rozpeti, hloubka, druh, voda: zaklady % 2 === 0, zaklady, provoz: [] };
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
            expect(() => urovenSandboxu({ ...vychoziSandbox(), rozpeti, hloubka, druh, voda: true, zaklady: nejvicZakladu(rozpeti) + 1, provoz: [] })).toThrow();
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

  it("zvedací most: píst a zámek v paletě, kotvy pístů pod opěrami, fáze zvedání a loď", () => {
    for (const druh of DRUHY_TRAS) {
      for (let rozpeti = MEZE_SANDBOXU.rozpeti.min; rozpeti <= MEZE_SANDBOXU.rozpeti.max; rozpeti += 3) {
        for (const hloubka of [MEZE_SANDBOXU.hloubka.min, 4, 5, 8, MEZE_SANDBOXU.hloubka.max]) {
          for (const [lod, kridla] of [[0, 1], [9, 1], [9, 2]] as const) {
            const u = urovenSandboxu({ ...vychoziSandbox(), rozpeti, hloubka, druh, zaklady: 0, provoz: [], zvedani: { cas: 6, lod, kridla } });
            expect(u.povolenePrvky).toContain("pist");
            // Kotvy pro paty pístů: pod opěrou s čepem (u dvou křídel pod oběma), nad dnem, na rastru.
            const pistu = u.kotvy.filter((k) => (k.x === 0 || k.x === rozpeti) && k.y < 0);
            expect(pistu.length, `${rozpeti} × ${hloubka}`).toBeGreaterThanOrEqual(1);
            expect(pistu.some((k) => k.x === rozpeti)).toBe(kridla === 2);
            // Jedno křídlo zamyká zámek na ložisku pravé opěry; dvě křídla mají čepy v obou opěrách.
            expect(u.kotvy.find((k) => k.x === rozpeti && k.y === 0)!.typ).toBe(kridla === 2 ? "pevna" : "posuvna");
            for (const k of pistu) {
              expect(k.y).toBeGreaterThan(-hloubka);
              expect(Number.isInteger(k.y)).toBe(true);
            }
            expect(new Set(u.kotvy.map((k) => `${k.x};${k.y}`)).size).toBe(u.kotvy.length);
            expect(u.pohyb).toEqual({ zvednout: 6, sklopit: lod > 0 ? 17 : 14 });
            if (lod > 0) {
              expect(u.lode).toHaveLength(1);
              const [plavba] = u.lode;
              expect(plavba).toMatchObject({ cas: 13, trvani: 3, vyska: 9 });
              // Loď pluje mezi patami stěn a celá se vejde mezi zvednutí a sklopení.
              expect(plavba!.xMin).toBeGreaterThan(0);
              expect(plavba!.xMax).toBeLessThan(rozpeti);
              expect(plavba!.xMax).toBeGreaterThan(plavba!.xMin);
              expect(plavba!.cas + plavba!.trvani).toBeLessThanOrEqual(u.pohyb!.sklopit);
              // Jakkoli vysokou loď musí jít pustit: profil začíná až za koncem křídla zvednutého
              // na doraz (70°), u dvou křídel za koncem každého z nich.
              const dosah = (kridla === 1 ? rozpeti : rozpeti / 2) * Math.cos((70 * Math.PI) / 180);
              expect(plavba!.xMin, `${rozpeti} m, křídel ${kridla}`).toBeGreaterThanOrEqual(dosah + 0.4);
              if (kridla === 2) expect(rozpeti - plavba!.xMax).toBeGreaterThanOrEqual(dosah + 0.4);
            } else expect(u.lode).toEqual([]);
          }
        }
      }
    }
    // Bez zvedání píst ani kotvy pístů nejsou.
    const pevny = urovenSandboxu(vychoziSandbox());
    expect(pevny.povolenePrvky).not.toContain("pist");
    expect(pevny.pohyb).toBeNull();
    expect(pevny.kotvy).toHaveLength(6);
  });

  it("volitelný cíl: rozpočet a třída kmitání se propíšou do úrovně", () => {
    const u = urovenSandboxu({ ...vychoziSandbox(), druh: "lavka", provoz: vychoziProvoz("lavka"), rozpocet: 250_000, komfort: 1 });
    expect(u.rozpocet).toBe(250_000);
    expect(u.inzenyrskyRozpocet).toBeNull();
    expect(u.mistrovska).toBeNull();
    expect(u.nejhorsiKomfort).toBe(1);
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

  it("předloha s kanálem: dvoukřídlý most se zámkem uprostřed se zvedne, loď propluje a auta přejedou", () => {
    const u = urovenSandboxu(PREDLOHY_SANDBOXU.find((p) => p.id === "kanal")!.nastaveni);
    const k = new Kreslic(ID_SANDBOXU);
    for (const [cep, smer] of [[0, 1], [16, -1]] as const) {
      k.prut("mostovka-ocel", [cep, 0], [cep + smer * 4, 0]);
      k.prut("mostovka-ocel", [cep + smer * 4, 0], [8, 0]);
      k.bod(cep + smer * 4, 0, { svar: true });
      k.prut("pist", [cep, -5], [cep + smer * 4, 0], { zdvih: 2 });
    }
    k.bod(8, 0, { zamek: true });
    const navrh = k.navrh();
    expect(zkontrolujNavrh(navrh, u)).toEqual([]);
    const zkouska = new Zkouska(u, navrh, nasadaUrovne(u));
    while (!zkouska.hotovo) zkouska.pokracuj(1);
    const v = zkouska.vysledek();
    expect(v).toMatchObject({ pruchod: true, ucastniku: 3, prejelo: 3, spadlo: 0, poruseni: 0 });
    expect(v.pohyb).toMatchObject({ zvednuto: true, zamceno: true, narazenyPrut: null });
    expect(v.lode).toEqual({ celkem: 1, proplulo: 1, narazilo: 0 });
    // Tentýž most bez pístů loď nepustí.
    const bezPistu = { ...navrh, pruty: navrh.pruty.filter((p) => p.prvek !== "pist") };
    const druha = new Zkouska(u, bezPistu, nasadaUrovne(u));
    while (!druha.hotovo) druha.pokracuj(1);
    expect(druha.vysledek().pruchod).toBe(false);
  }, 60_000);

  it("jedno křídlo se zámkem na ložisku pravé opěry; cíl rozpočtu most nad rozpočet ke zkoušce nepustí", () => {
    const nastaveni: NastaveniSandboxu = {
      ...vychoziSandbox(),
      rozpeti: 12,
      zaklady: 0,
      provoz: [{ druh: "auto", pocet: 2, smer: 1, cas: 0 }],
      zvedani: { cas: 6, lod: 8, kridla: 1 },
    };
    const k = new Kreslic(ID_SANDBOXU);
    k.prut("mostovka-ocel", [0, 0], [6, 0]);
    k.prut("mostovka-ocel", [6, 0], [12, 0]);
    k.bod(6, 0, { svar: true });
    k.prut("pist", [0, -5], [6, 0], { zdvih: 2.5 });
    k.bod(12, 0, { zamek: true });
    const navrh = k.navrh();
    const u = urovenSandboxu(nastaveni);
    expect(zkontrolujNavrh(navrh, u)).toEqual([]);
    const zkouska = new Zkouska(u, navrh, nasadaUrovne(u));
    while (!zkouska.hotovo) zkouska.pokracuj(1);
    const v = zkouska.vysledek();
    expect(v).toMatchObject({ pruchod: true, prejelo: 2, poruseni: 0 });
    expect(v.lode).toEqual({ celkem: 1, proplulo: 1, narazilo: 0 });
    // S rozpočtem jako cílem pod cenou mostu ho kontrola návrhu ke zkoušce nepustí (stojí 401 500 Kč).
    expect(zkontrolujNavrh(navrh, urovenSandboxu({ ...nastaveni, rozpocet: 400_000 }))).toEqual([{ druh: "nad-rozpocet" }]);
    expect(zkontrolujNavrh(navrh, urovenSandboxu({ ...nastaveni, rozpocet: 402_000 }))).toEqual([]);
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
