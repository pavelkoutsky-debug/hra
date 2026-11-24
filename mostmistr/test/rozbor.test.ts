// Denní rozbor ve správě: podklady dne (bez kontaktů a příloh), uložení rozboru, seznam, a správa
// žebříčků přes tutéž adresu. Rozbor sám píše naplánovaná úloha zvenčí; server ho jen hlídá.
import { describe, expect, it } from "vitest";
import { zakodujMost } from "../src/data/sdileni";
import { znackaHrace, type ZadostOZapis } from "../src/data/zebricek";
import { VERZE_DENIKU, type DavkaDeniku, type HlavickaDeniku, type UdalostDeniku } from "../src/denik/udalosti";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { prijmiDenik, prijmiVazbu, type ProstrediServeru } from "../src/server/obsluha";
import { overovacKampane } from "../src/server/overeni";
import { NEJDELSI_SHRNUTI, NEJVIC_NAVRHU, nactiRozbor, type PodkladyRozboru, type RozborDne } from "../src/server/rozbor";
import { SkladVPameti } from "../src/server/sklad";
import { spravujVse } from "../src/server/sprava";
import { obsluzZebricek, type ZebricekProSpravu } from "../src/server/zebricek";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const WEB = "https://mostmistr.example";
const SPRAVCE = { authorization: "Bearer tajne-heslo-123" };

function hlavicka(hrac = "aaaaaaaaaaaaaaaa", sezeni = "bbbbbbbbbbbbbbbb"): HlavickaDeniku {
  return { verze: VERZE_DENIKU, hrac, sezeni, zacatek: 1_795_000_000_000, hra: "0.22.0", sestaveni: "abc1234", jazyk: "cs/cs-CZ", okno: [1280, 720], dotyk: false };
}

function davka(udalosti: UdalostDeniku[], poradi = 0, h = hlavicka()): DavkaDeniku {
  return { hlavicka: h, poradi, udalosti };
}

function server(cas: string): ProstrediServeru & { cas: string } {
  let cislo = 0;
  const p = {
    cas,
    sklad: new SkladVPameti(),
    ted: () => new Date(p.cas),
    nahoda: () => (++cislo).toString(16).padStart(6, "0"),
    prostredi: "test",
    hesloSpravce: "tajne-heslo-123",
  };
  return p;
}

function zadost(cesta: string, telo?: unknown, hlavicky: Record<string, string> = {}): Request {
  return new Request(`${WEB}${cesta}`, {
    method: telo === undefined ? "GET" : "POST",
    headers: { ...(telo === undefined ? {} : { "content-type": "application/json", origin: WEB }), ...hlavicky },
    ...(telo === undefined ? {} : { body: JSON.stringify(telo) }),
  });
}

const rozbor = (zmeny: Record<string, unknown> = {}): Record<string, unknown> => ({
  den: "2026-11-22",
  shrnuti: "Hrálo deset lidí, osm skončilo na úrovni 1-03.",
  text: "Na úrovni 1-03 odchází 80 % hráčů bez průchodu.\n\n- Dva napsali, že nevědí, proč most kmitá.",
  navrhy: [{ nazev: "Ukázka kmitání v 1-03", duvod: "8 z 10 hráčů tam skončilo.", popis: "Přidat krátkou ukázku s lávkou bez ztužení.", narocnost: "stredni", priorita: 1 }],
  ...zmeny,
});

describe("podklady denního rozboru", () => {
  it("dávají souhrn dne a týdne, zprávy hráčů bez kontaktů a příloh, počty žebříčků a poslední rozbory", async () => {
    const p = server("2026-11-22T09:30:00.000Z");
    await prijmiDenik(zadost("/api/denik", davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 10, druh: "uroven.otevrena", uroven: "1-01" }])), p);
    await prijmiDenik(
      zadost("/api/denik", davka([{ t: 20, druh: "zkouska.konec", uroven: "1-01", data: { pruchod: true, sekund: 90, medaile: { pruchod: true, rozpocet: false, mistrovska: false } } }], 1)),
      p,
    );
    await prijmiVazbu(
      zadost("/api/vazba", { hlavicka: hlavicka(), druh: "napad", text: "Chtělo by to žebříček.", uroven: "1-02", kontakt: "hrac@example.org", navrh: '{"verze":3}', hodnoceni: 4 }),
      p,
    );
    // Den předtím: jiný hráč a jiná zpráva (do podkladů dne nepatří, do týdne ano).
    p.cas = "2026-11-21T08:00:00.000Z";
    await prijmiDenik(zadost("/api/denik", davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }], 0, hlavicka("cccccccccccccccc", "dddddddddddddddd"))), p);
    await prijmiVazbu(zadost("/api/vazba", { hlavicka: hlavicka(), druh: "chyba", text: "Včerejší." }), p);
    // Žebříček: jeden přijatý zápis a jeden odmítnutý, oba 22. 11.
    p.cas = "2026-11-22T12:00:00.000Z";
    const over = overovacKampane();
    const uroven = nactiKampan().find((u) => u.id === "1-01")!;
    const most = RESENI["1-01"]!.pruchod;
    const z = new Zkouska(uroven, most, nasadaUrovne(uroven));
    while (!z.hotovo) z.pokracuj(1);
    const zapis: ZadostOZapis = { uroven: "1-01", kod: zakodujMost(most), zkouska: "bezna", otisk: z.vysledek().otisk, verze: VERZE_FYZIKY, hrac: "f".repeat(32), jmeno: "Hráč" };
    expect((await obsluzZebricek(zadost("/api/zebricek", zapis), p, over)).status).toBe(200);
    expect((await obsluzZebricek(zadost("/api/zebricek", { ...zapis, otisk: "0".repeat(16) }), p, over)).status).toBe(422);
    // Starší rozbor, který má nový připomenout.
    p.cas = "2026-11-22T23:00:00.000Z";
    expect((await spravujVse(zadost("/api/sprava?co=rozbor", rozbor({ den: "2026-11-20" }), SPRAVCE), p)).status).toBe(201);

    // Druhý den ráno: výchozí den podkladů je včerejšek.
    p.cas = "2026-11-23T04:00:00.000Z";
    const odpoved = await spravujVse(zadost("/api/sprava?co=podklady", undefined, SPRAVCE), p);
    expect(odpoved.status).toBe(200);
    const podklady = (await odpoved.json()) as PodkladyRozboru;
    expect(podklady.den).toBe("2026-11-22");
    expect(podklady.neuplne).toBe(false);
    expect(podklady.souhrnDne.hracu).toBe(1);
    expect(podklady.souhrnDne.urovne.find((u) => u.uroven === "1-01")).toMatchObject({ hracu: 1, hracuSPruchodem: 1, pruchodu: 1 });
    expect(podklady.souhrnTydne.hracu).toBe(2);
    expect(podklady.vazebCelkem).toBe(1);
    expect(podklady.vazby).toEqual([
      { id: "20261122T093000-000003", prijato: "2026-11-22T09:30:00.000Z", druh: "napad", uroven: "1-02", hodnoceni: 4, stav: "nova", hra: "0.22.0", jazyk: "cs/cs-CZ", dotyk: false, text: "Chtělo by to žebříček." },
    ]);
    // Kontakt ani přiložený most v podkladech nejsou, ani jinde v odpovědi.
    const text = JSON.stringify(podklady);
    expect(text).not.toContain("example.org");
    expect(text).not.toContain("verze\\\":3");
    expect(podklady.zebricky).toEqual({ overeni: 1, prijato: 1, zlepseni: 2, odmitnuto: { otisk: 1 } });
    expect(podklady.predchozi).toEqual([{ den: "2026-11-20", shrnuti: rozbor().shrnuti, navrhy: ["Ukázka kmitání v 1-03"] }]);
    // Jiný den jde vyžádat jmenovitě; nesmysl ne.
    const predevcirem = (await (await spravujVse(zadost("/api/sprava?co=podklady&den=2026-11-21", undefined, SPRAVCE), p)).json()) as PodkladyRozboru;
    expect(predevcirem.vazby.map((v) => v.text)).toEqual(["Včerejší."]);
    expect(predevcirem.zebricky.prijato).toBe(0);
    expect((await spravujVse(zadost("/api/sprava?co=podklady&den=zitra", undefined, SPRAVCE), p)).status).toBe(400);
  }, 60_000);
});

describe("ukládání rozborů", () => {
  it("rozbor se uloží, je v seznamu a jde přečíst; druhý rozbor téhož dne první přepíše", async () => {
    const p = server("2026-11-23T04:05:00.000Z");
    const prvni = await spravujVse(zadost("/api/sprava?co=rozbor", rozbor(), SPRAVCE), p);
    expect(prvni.status).toBe(201);
    expect(await prvni.json()).toEqual({ den: "2026-11-22", vytvoreno: "2026-11-23T04:05:00.000Z", navrhu: 1 });
    p.cas = "2026-11-24T04:05:00.000Z";
    await spravujVse(zadost("/api/sprava?co=rozbor", rozbor({ den: "2026-11-23", shrnuti: "Klidný den.", navrhy: [] }), SPRAVCE), p);
    await spravujVse(zadost("/api/sprava?co=rozbor", rozbor({ shrnuti: "Opravené shrnutí." }), SPRAVCE), p);
    const seznam = (await (await spravujVse(zadost("/api/sprava?co=rozbory", undefined, SPRAVCE), p)).json()) as { rozbory: { den: string; shrnuti: string; navrhu: number }[] };
    expect(seznam.rozbory.map((r) => [r.den, r.shrnuti, r.navrhu])).toEqual([
      ["2026-11-23", "Klidný den.", 0],
      ["2026-11-22", "Opravené shrnutí.", 1],
    ]);
    const jeden = (await (await spravujVse(zadost("/api/sprava?co=rozbor&den=2026-11-22", undefined, SPRAVCE), p)).json()) as { rozbor: RozborDne };
    expect(jeden.rozbor).toMatchObject({ den: "2026-11-22", shrnuti: "Opravené shrnutí.", vytvoreno: "2026-11-24T04:05:00.000Z" });
    expect(jeden.rozbor.navrhy[0]).toEqual({ nazev: "Ukázka kmitání v 1-03", duvod: "8 z 10 hráčů tam skončilo.", popis: "Přidat krátkou ukázku s lávkou bez ztužení.", narocnost: "stredni", priorita: 1 });
    expect((await spravujVse(zadost("/api/sprava?co=rozbor&den=2026-11-01", undefined, SPRAVCE), p)).status).toBe(404);
  });

  it("bez hesla nic; rozbor špatného tvaru, moc dlouhý nebo na den, který nenastal, server odmítne", async () => {
    const p = server("2026-11-23T04:05:00.000Z");
    expect((await spravujVse(zadost("/api/sprava?co=rozbor", rozbor()), p)).status).toBe(401);
    expect((await spravujVse(zadost("/api/sprava?co=podklady"), p)).status).toBe(401);
    expect((await spravujVse(zadost("/api/sprava?co=rozbory", undefined, { authorization: "Bearer jine-heslo-456" }), p)).status).toBe(401);
    const odmitne = async (zmeny: Record<string, unknown>): Promise<string> => {
      const o = await spravujVse(zadost("/api/sprava?co=rozbor", rozbor(zmeny), SPRAVCE), p);
      expect(o.status).toBe(400);
      return ((await o.json()) as { chyba: string }).chyba;
    };
    expect(await odmitne({ den: "2026-11-24" })).toContain("ještě nenastal");
    expect(await odmitne({ den: "22. 11." })).toContain("RRRR-MM-DD");
    expect(await odmitne({ shrnuti: "x".repeat(NEJDELSI_SHRNUTI + 1) })).toContain("shrnutí");
    expect(await odmitne({ text: "" })).toContain("text rozboru");
    expect(await odmitne({ navrhy: Array.from({ length: NEJVIC_NAVRHU + 1 }, () => rozbor().navrhy) })).toContain("nejvýš");
    expect(await odmitne({ navrhy: [{ nazev: "Bez důvodu", popis: "x", narocnost: "mala", priorita: 1 }] })).toContain("návrh 1");
    expect(await odmitne({ navrhy: [{ nazev: "N", duvod: "d", popis: "p", narocnost: "obrovska", priorita: 1 }] })).toContain("náročnost");
    expect(await odmitne({ navrhy: [{ nazev: "N", duvod: "d", popis: "p", narocnost: "mala", priorita: 7 }] })).toContain("priorita");
    expect(await p.sklad.klice("rozbor/")).toEqual([]);
    // Řídicí znaky z textu zmizí, nové řádky zůstanou.
    const cisty = nactiRozbor(rozbor({ text: "První\u0000 řádek\n\tdruhý\u0007" }));
    expect(typeof cisty === "string" ? cisty : cisty.text).toBe("První řádek\n\tdruhý");
  });
});

describe("správa žebříčků přes /api/sprava", () => {
  it("správce vidí žebříčky, dostane most ze zápisu a smaže zápisy hráče; ostatní adresy správy běží dál", async () => {
    const p = server("2026-11-22T12:00:00.000Z");
    const over = overovacKampane();
    const uroven = nactiKampan().find((u) => u.id === "1-01")!;
    const most = RESENI["1-01"]!.pruchod;
    const z = new Zkouska(uroven, most, nasadaUrovne(uroven));
    while (!z.hotovo) z.pokracuj(1);
    const hrac = "e".repeat(32);
    const zapis: ZadostOZapis = { uroven: "1-01", kod: zakodujMost(most), zkouska: "bezna", otisk: z.vysledek().otisk, verze: VERZE_FYZIKY, hrac, jmeno: "Nevhodné jméno" };
    expect((await obsluzZebricek(zadost("/api/zebricek", zapis), p, over)).status).toBe(200);

    expect((await spravujVse(zadost("/api/sprava?co=zebricky"), p)).status).toBe(401);
    const prehled = (await (await spravujVse(zadost("/api/sprava?co=zebricky", undefined, SPRAVCE), p)).json()) as { verze: number; zebricky: ZebricekProSpravu[] };
    expect(prehled.verze).toBe(VERZE_FYZIKY);
    expect(prehled.zebricky).toHaveLength(1);
    const radek = prehled.zebricky[0]!.radky[0]!;
    expect(radek).toMatchObject({ jmeno: "Nevhodné jméno", znacka: znackaHrace(hrac), poradi: 1 });
    expect(JSON.stringify(prehled)).not.toContain(hrac);
    const kod = (await (await spravujVse(zadost(`/api/sprava?co=zebricek-most&klic=${encodeURIComponent(prehled.zebricky[0]!.klic)}&most=${radek.most}`, undefined, SPRAVCE), p)).json()) as { kod: string };
    expect(kod.kod).toBe(zakodujMost(most));
    expect((await spravujVse(zadost("/api/sprava?co=zebricek-most&klic=x&most=y", undefined, SPRAVCE), p)).status).toBe(404);
    const pocty = (await (await spravujVse(zadost("/api/sprava?co=zebricek-pocty&den=2026-11-22", undefined, SPRAVCE), p)).json()) as { pocty: { prijato: number } };
    expect(pocty.pocty.prijato).toBe(1);
    expect((await spravujVse(zadost("/api/sprava?co=zebricek-smazat", { znacka: "nesmysl" }, SPRAVCE), p)).status).toBe(400);
    expect(await (await spravujVse(zadost("/api/sprava?co=zebricek-smazat", { znacka: radek.znacka, uroven: "1-01" }, SPRAVCE), p)).json()).toEqual({ smazano: 2 });
    expect(((await (await spravujVse(zadost("/api/sprava?co=zebricky", undefined, SPRAVCE), p)).json()) as { zebricky: unknown[] }).zebricky).toEqual([]);
    // Dosavadní adresy správy (deník, zpětná vazba) obsluhuje tatáž funkce dál.
    expect(await (await spravujVse(zadost("/api/sprava?co=overeni", undefined, SPRAVCE), p)).json()).toEqual({ ok: true, prostredi: "test" });
    expect((await spravujVse(zadost("/api/sprava?co=neco", undefined, SPRAVCE), p)).status).toBe(400);
  }, 60_000);
});
