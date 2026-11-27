// Začátek hry pro nového hráče a co o něm ví deník: příčina neúspěchu zkoušky bez porušení,
// kam šli hráči bez úrovně kampaně, dotyk a první pruty po úrovních, krok nahoře v přehledu.
// Bez prohlížeče.
import { describe, expect, it } from "vitest";
import { Denik, type PametDeniku } from "../src/denik/denik";
import { slucVytahy, souhrnDeniku, souhrnZVytahu, vytahDeniku } from "../src/denik/souhrn";
import { VERZE_DENIKU, type DavkaDeniku, type HlavickaDeniku, type UdalostDeniku } from "../src/denik/udalosti";
import { startPrehledu } from "../src/hra/prehled";
import { prijmiDenik, type ProstrediServeru } from "../src/server/obsluha";
import { SkladVPameti } from "../src/server/sklad";
import { spravujVse } from "../src/server/sprava";
import type { PodkladyRozboru } from "../src/server/rozbor";
import { kodPriciny, type PodkladyPriciny } from "../src/zkouska/pricinaVysledku";
import { nactiKampan } from "../urovne/index";

const WEB = "https://mostmistr.example";

function hlavicka(hrac: string, dotyk = false): HlavickaDeniku {
  return { verze: VERZE_DENIKU, hrac, sezeni: `${hrac.slice(0, 8)}bbbbbbbb`, zacatek: 1_795_000_000_000, hra: "0.24.0", sestaveni: "abc1234", jazyk: "cs/cs-CZ", okno: [390, 844], dotyk };
}

const davka = (hrac: string, udalosti: UdalostDeniku[], dotyk = false, poradi = 0): DavkaDeniku => ({ hlavicka: hlavicka(hrac, dotyk), poradi, udalosti });
const start = (akce = true): UdalostDeniku => ({ t: 0, druh: "sezeni.start", data: akce ? { navrat: false, akce: true } : { navrat: false } });
const u = (t: number, druh: string, uroven?: string, data?: UdalostDeniku["data"]): UdalostDeniku => ({ t, druh, ...(uroven ? { uroven } : {}), ...(data ? { data } : {}) });
const neproslo = (t: number, data: UdalostDeniku["data"] = {}): UdalostDeniku =>
  u(t, "zkouska.konec", "1-01", { pruchod: false, sekund: t, pokus: null, prvni: null, medaile: { pruchod: false, rozpocet: false, mistrovska: false }, ...data });

describe("kód příčiny neúspěchu zkoušky", () => {
  const zaklad: PodkladyPriciny = {
    vysledek: {
      pruchod: false,
      rozpad: false,
      mezera: false,
      spadlo: 0,
      prejelo: 3,
      ucastniku: 3,
      opreno: false,
      pruhyb: null,
      lode: { celkem: 0, proplulo: 0, narazilo: 0 },
      pohyb: null,
      bezRovnovahy: false,
      komfort: null,
    },
    pokus: false,
    slozeni: false,
    pricinyPohybu: [],
    kmitaniNadMezi: false,
    prvni: null,
  };
  const s = (zmeny: Partial<PodkladyPriciny>, vysledek: Partial<PodkladyPriciny["vysledek"]> = {}): PodkladyPriciny => ({
    ...zaklad,
    ...zmeny,
    vysledek: { ...zaklad.vysledek, ...vysledek },
  });

  it("jmenuje příčinu ve stejném pořadí jako pruh výsledku", () => {
    expect(kodPriciny(s({}, { pruchod: true }))).toBeNull();
    expect(kodPriciny(s({ pokus: true }))).toBeNull();
    // Most, který se složil, má přednost i před porušením, které pád provázelo.
    expect(kodPriciny(s({ slozeni: true, prvni: { druh: "poruseni", cas: 0.2 } }, { bezRovnovahy: true, spadlo: 3 }))).toBe("slozeni");
    expect(kodPriciny(s({}, { mezera: true }))).toBe("mezera");
    // Lidé propadli mezerou: věta o chybějící mostovce, ne pád.
    expect(kodPriciny(s({}, { mezera: true, spadlo: 2, prejelo: 1 }))).toBe("mezera");
    expect(kodPriciny(s({ pricinyPohybu: ["bez-zamku"] }))).toBe("pohyb");
    expect(kodPriciny(s({ pricinyPohybu: ["poruseno"], prvni: { druh: "poruseni", cas: 3 } }))).toBe("poruseni");
    const pruhyb = { nejvetsi: 0.2, cas: 5, x: 3, mez: 0.1, prekroceno: 4 };
    expect(kodPriciny(s({ prvni: { druh: "poruseni", cas: 6 } }, { pruhyb }))).toBe("pruhyb");
    expect(kodPriciny(s({ prvni: { druh: "poruseni", cas: 2 } }, { pruhyb }))).toBe("poruseni");
    const komfort = { zrychleni: 3, cas: 8, trida: 4 as const, stycnik: 2, prekroceno: 7 };
    expect(kodPriciny(s({ kmitaniNadMezi: true, prvni: { druh: "poruseni", cas: 2 } }, { komfort }))).toBe("kmitani");
    expect(kodPriciny(s({ kmitaniNadMezi: true }, { komfort: { ...komfort, prekroceno: null } }))).toBe("kmitani");
    expect(kodPriciny(s({ prvni: { druh: "sjeti", cas: 2 } }, { spadlo: 1, prejelo: 2 }))).toBe("sjeti");
    expect(kodPriciny(s({}, { opreno: true }))).toBe("opreno");
    // Most opřený o dno údolí potom kmitá na terénu nebo sjede z podpory: příčina je opření
    // (tak to říká i pruh výsledku), ne jeho následek.
    expect(kodPriciny(s({ kmitaniNadMezi: true }, { opreno: true, komfort }))).toBe("opreno");
    expect(kodPriciny(s({ prvni: { druh: "sjeti", cas: 4 } }, { opreno: true, spadlo: 29, prejelo: 7 }))).toBe("opreno");
    // Mezera v mostovce, kterou lidé propadli, zůstává mezerou, i když se most pak opřel.
    expect(kodPriciny(s({}, { opreno: true, mezera: true, spadlo: 2, prejelo: 1 }))).toBe("mezera");
    expect(kodPriciny(s({}, { spadlo: 1, prejelo: 2 }))).toBe("spadl");
    expect(kodPriciny(s({}, { lode: { celkem: 1, proplulo: 0, narazilo: 1 } }))).toBe("lod");
    expect(kodPriciny(s({}, { prejelo: 1 }))).toBe("neprejel");
    expect(kodPriciny(s({}, { rozpad: true }))).toBe("rozpad");
    expect(kodPriciny(s({}))).toBeNull();
  });
});

describe("souhrn: na čem mosty padaly, když se nic nezlomilo", () => {
  it("počítá příčinu z kódu, starší záznamy bez kódu dál jako „bez porušení“, kód mimo seznam se nepočítá", () => {
    const souhrn = souhrnDeniku([
      davka("a000000000000001", [
        start(),
        u(1, "uroven.otevrena", "1-01"),
        neproslo(10, { pricina: "slozeni" }),
        neproslo(20, { pricina: "slozeni" }),
        neproslo(30, { pricina: "mezera" }),
        neproslo(40, { pricina: "kmitani" }),
        // Starší hra kód neposílala.
        neproslo(50),
        // Kód, který hra neposílá (deník může plnit kdokoli).
        neproslo(60, { pricina: "<script>" }),
        neproslo(70, { pricina: 7 }),
        // Prut povolil: dál prvek a způsob, kód nic nemění.
        neproslo(80, { pricina: "poruseni", prvni: { prvek: "drevo-lehke", zpusob: "tlak", cas: 1 } }),
        // Pohyblivý most: konkrétnější staré údaje mají přednost, jinak „pohyblivý most“.
        neproslo(90, { pricina: "pohyb", preklopeno: true }),
        neproslo(100, { pricina: "pohyb" }),
      ]),
    ]);
    expect(souhrn.urovne[0]!.selhani).toEqual({
      "bez porušení": 3,
      "složil se vlastní vahou": 2,
      "drevo-lehke/tlak": 1,
      "kmitání nad mezí": 1,
      "křídlo se překlopilo": 1,
      "mostovka nedosáhla na předmostí": 1,
      "pohyblivý most": 1,
    });
  });
});

describe("souhrn: hráči bez úrovně kampaně", () => {
  const davky = [
    // Jen přehled, rozhlédl se (posouval), rozbalil celou kampaň a odešel; na telefonu.
    davka("b000000000000001", [start(), u(5, "prehled.otevren"), u(900, "stranka.akce", undefined, { jak: "dotyk", sekund: 1 }), u(950, "prehled.odkaz", undefined, { kam: "cela-kampan" })], true),
    // Jen přehled a nic neudělal: robot náhledu odkazu nebo okamžitý odchod.
    davka("b000000000000002", [start(), u(5, "prehled.otevren")]),
    // Přehled, pak pískoviště a okno Soukromí.
    davka("b000000000000003", [start(), u(5, "prehled.otevren"), u(6, "soukromi.otevreno"), u(10, "uroven.otevrena", "0-01"), u(11, "stranka.akce", undefined, { jak: "mys", sekund: 0 })]),
    // Komise, list a zkušebna (odkazem z přehledu), na dotyku.
    davka("b000000000000004", [start(), u(5, "prehled.otevren"), u(6, "prehled.odkaz", undefined, { kam: "zkusebna" }), u(8, "list.otevren"), u(9, "uroven.otevrena", "9-01")], true),
    // Starší hra: akce se nezapisovaly, takže o něm nevíme, jestli něco udělal.
    davka("b000000000000005", [start(false), u(5, "prehled.otevren")]),
    // Jen začátek sezení, nic dalšího; vymyšlený druh akce ani vymyšlený cíl odkazu se nepočítají.
    davka("b000000000000006", [start(), u(5, "stranka.akce", undefined, { jak: "telepatie", sekund: 1 }), u(6, "prehled.odkaz", undefined, { kam: "jine" })]),
    // Hráč s úrovní kampaně do „bez úrovně“ nepatří, ani když si rozbalil celou kampaň.
    davka("b000000000000007", [start(), u(5, "prehled.otevren"), u(6, "prehled.odkaz", undefined, { kam: "cela-kampan" }), u(7, "prehled.odkaz", undefined, { kam: "zacit" }), u(8, "uroven.otevrena", "1-01")]),
  ];

  it("říká, kolik jich vidělo jen přehled, kam jiní šli, kolik bylo na dotyku a kolik nic neudělalo", () => {
    const souhrn = souhrnDeniku(davky);
    expect(souhrn.hracu).toBe(7);
    expect(souhrn.bezUrovne).toEqual({
      hracu: 6,
      novych: 6,
      dotykovych: 2,
      jenPrehled: 3,
      piskoviste: 1,
      komise: 1,
      list: 1,
      zkusebna: 1,
      soukromi: 1,
      vazba: 0,
      celaKampan: 1,
      bezObrazovky: 1,
      sAkci: 2,
      bezAkce: 3,
    });
  });

  it("vyjde stejně po částech i po uložení a načtení výtahu", () => {
    const cely = souhrnDeniku(davky);
    const slouceny = souhrnZVytahu(slucVytahy([vytahDeniku(davky.slice(0, 3)), vytahDeniku(davky.slice(3))]));
    expect(slouceny.bezUrovne).toEqual(cely.bezUrovne);
    expect(souhrnZVytahu(JSON.parse(JSON.stringify(vytahDeniku(davky))) as ReturnType<typeof vytahDeniku>).bezUrovne).toEqual(cely.bezUrovne);
  });
});

describe("souhrn úrovně: dotyk a první pruty", () => {
  it("počítá hráče na dotyku, z hráčů bez zkoušky ty na dotyku a hráče, kteří nenakreslili ani prut", () => {
    const prut = (t: number, dilu?: number): UdalostDeniku => u(t, "stavba.zmena", "1-01", { co: "prut", prvek: "mostovka-drevo", ...(dilu ? { dilu } : {}) });
    const souhrn = souhrnDeniku([
      // Na telefonu: otevřel a nic nenakreslil.
      davka("c000000000000001", [start(), u(1, "uroven.otevrena", "1-01")], true),
      // Na telefonu: kreslil, nezkoušel.
      davka("c000000000000002", [start(), u(1, "uroven.otevrena", "1-01"), prut(2, 2)], true),
      // Na počítači: kreslil a zkoušel.
      davka("c000000000000003", [start(), u(1, "uroven.otevrena", "1-01"), prut(2), neproslo(3, { pricina: "slozeni" })]),
      // Na počítači: otevřel, jen „změna“, která prut nepřidala, a prvek mimo katalog.
      davka("c000000000000004", [start(), u(1, "uroven.otevrena", "1-01"), u(2, "stavba.zmena", "1-01", { co: "smazat" }), u(3, "stavba.zmena", "1-01", { co: "prut", prvek: "zlato" })]),
    ]);
    expect(souhrn.urovne[0]).toMatchObject({ hracu: 4, hracuBezZkousky: 3, hracuNaDotyku: 2, hracuBezZkouskyNaDotyku: 2, hracuBezPrutu: 2, prvky: { "mostovka-drevo": 3 } });
  });
});

describe("podklady denního rozboru", () => {
  it("nesou nová pole souhrnu a vypnutý záznam nic neposílá", async () => {
    let cislo = 0;
    const p: ProstrediServeru = {
      sklad: new SkladVPameti(),
      ted: () => new Date("2026-11-26T09:30:00.000Z"),
      nahoda: () => (++cislo).toString(16).padStart(6, "0"),
      prostredi: "test",
      hesloSpravce: "tajne-heslo-spravce-123",
      adresa: () => "203.0.113.7",
    };
    const posli = (d: DavkaDeniku): Promise<Response> =>
      prijmiDenik(new Request(`${WEB}/api/denik`, { method: "POST", headers: { "content-type": "application/json", origin: WEB }, body: JSON.stringify(d) }), p);
    expect((await posli(davka("d000000000000001", [start(), u(5, "prehled.otevren")], true))).status).toBeLessThan(300);
    expect((await posli(davka("d000000000000002", [start(), u(1, "uroven.otevrena", "1-01"), neproslo(9, { pricina: "slozeni" })], true))).status).toBeLessThan(300);
    const odpoved = await spravujVse(
      new Request(`${WEB}/api/sprava?co=podklady&den=2026-11-26`, { headers: { authorization: "Bearer tajne-heslo-spravce-123" } }),
      p,
    );
    const podklady = (await odpoved.json()) as PodkladyRozboru;
    expect(podklady.souhrnDne.bezUrovne).toMatchObject({ hracu: 1, dotykovych: 1, jenPrehled: 1, bezAkce: 1 });
    expect(podklady.souhrnDne.urovne[0]).toMatchObject({ uroven: "1-01", hracuNaDotyku: 1, hracuBezZkouskyNaDotyku: 0, hracuBezPrutu: 1, selhani: { "složil se vlastní vahou": 1 } });
    expect(podklady.souhrnTydne.bezUrovne.hracu).toBe(1);

    // Vypnutý záznam: první akce ani nic jiného neodejde.
    const odeslane: string[] = [];
    const pamet = (): PametDeniku => {
      const data = new Map<string, string>();
      return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    };
    const denik = new Denik({
      trvala: pamet(),
      sezeni: pamet(),
      ted: () => 1_000,
      nahoda: () => "0123456789abcdef",
      posli: (_adresa, telo) => {
        odeslane.push(telo);
        return Promise.resolve("prijato");
      },
      hra: "0.24.0",
      sestaveni: "abc",
      jazyk: "cs",
      okno: [390, 844],
      dotyk: true,
    });
    denik.zapnuto = false;
    odeslane.length = 0;
    denik.zapis("stranka.akce", { jak: "dotyk", sekund: 2 });
    denik.zapis("prehled.odkaz", { kam: "zacit" });
    denik.zapis("zkouska.konec", { pruchod: false, pricina: "slozeni" }, "1-01");
    await denik.odesli(true);
    expect(odeslane).toEqual([]);
  });
});

describe("krok nahoře v přehledu", () => {
  const kampan = nactiKampan();
  const stavy = (projite: string[] = [], rozestavene: string[] = []) => (id: string) => ({ projita: projite.includes(id), rozestavena: rozestavene.includes(id) });

  it("nový hráč jde do první úrovně, kdo hrál, pokračuje rozestavěnou nebo první odemčenou neprojitou", () => {
    expect(startPrehledu(kampan, stavy())).toEqual({ uroven: kampan[0], novy: true });
    // Rozestavěná první úroveň: hráč tu už byl, pokračuje v ní.
    expect(startPrehledu(kampan, stavy([], ["1-01"]))).toMatchObject({ uroven: { id: "1-01" }, novy: false });
    expect(startPrehledu(kampan, stavy(["1-01"]))).toMatchObject({ uroven: { id: "1-02" }, novy: false });
    // Rozestavěná úroveň má přednost před první odemčenou.
    expect(startPrehledu(kampan, stavy(["1-01", "1-02"], ["2-01"]))).toMatchObject({ uroven: { id: "2-01" } });
    // Projitá celá kampaň: krok nahoře není.
    expect(startPrehledu(kampan, stavy(kampan.map((u) => u.id)))).toBeNull();
  });
});
