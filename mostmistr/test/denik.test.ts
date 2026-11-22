// Deník hraní a zpětná vazba: sbírání událostí ve hře, příjem a kontrola na serveru,
// správa s heslem a denní souhrn. Všechno bez prohlížeče a bez Netlify.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStore } from "@netlify/blobs";
import { BlobsServer } from "@netlify/blobs/server";
import { describe, expect, it } from "vitest";
import { ADRESA_DENIKU, Denik, NEJDELSI_CEKANI, UDALOSTI_NA_DAVKU, type PametDeniku, type ProstrediDeniku } from "../src/denik/denik";
import { souhrnDeniku } from "../src/denik/souhrn";
import {
  nactiDavku,
  nactiVazbu,
  NEJVIC_UDALOSTI_V_DAVCE,
  VERZE_DENIKU,
  type DavkaDeniku,
  type EvidovanaVazba,
  type HlavickaDeniku,
  type UdalostDeniku,
} from "../src/denik/udalosti";
import { skladNadBlobs } from "../src/server/blobs";
import {
  NEJVETSI_DAVKA,
  prijmiDenik,
  prijmiVazbu,
  spravuj,
  type PolozkaSeznamuVazeb,
  type ProstrediServeru,
  type SezeniDne,
} from "../src/server/obsluha";
import { SkladVPameti, type SkladZaznamu } from "../src/server/sklad";

const WEB = "https://mostmistr.example";

function hlavicka(hrac = "aaaaaaaaaaaaaaaa", sezeni = "bbbbbbbbbbbbbbbb", dotyk = false): HlavickaDeniku {
  return { verze: VERZE_DENIKU, hrac, sezeni, hra: "0.10.0", sestaveni: "abc1234", jazyk: "cs-CZ", okno: [1280, 720], dotyk };
}

function davka(udalosti: UdalostDeniku[], poradi = 0, h = hlavicka()): DavkaDeniku {
  return { hlavicka: h, poradi, udalosti };
}

function pamet(pocatek: Record<string, string> = {}): PametDeniku & { data: Map<string, string> } {
  const data = new Map(Object.entries(pocatek));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

/** Prostředí deníku s hodinami, které posouvá test, a se záznamem všeho odeslaného. */
function prostrediHry(volby: { prijima?: () => boolean; trvala?: PametDeniku | null; sezeni?: PametDeniku | null } = {}) {
  const stav = { cas: 1_000_000, cislo: 0, odeslane: [] as { adresa: string; davka: DavkaDeniku; naOdchodu: boolean }[] };
  const p: ProstrediDeniku = {
    trvala: volby.trvala === undefined ? pamet() : volby.trvala,
    sezeni: volby.sezeni === undefined ? pamet() : volby.sezeni,
    ted: () => stav.cas,
    nahoda: () => (++stav.cislo).toString(16).padStart(16, "0"),
    posli: (adresa, telo, naOdchodu) => {
      const prijato = volby.prijima ? volby.prijima() : true;
      if (prijato) stav.odeslane.push({ adresa, davka: JSON.parse(telo) as DavkaDeniku, naOdchodu });
      return Promise.resolve(prijato);
    },
    hra: "0.10.0",
    sestaveni: "abc1234",
    jazyk: "cs-CZ",
    okno: [1280, 720],
    dotyk: false,
  };
  return { p, stav };
}

function server(volby: Partial<ProstrediServeru> = {}): ProstrediServeru & { sklad: SkladZaznamu } {
  let cislo = 0;
  return {
    sklad: new SkladVPameti(),
    ted: () => new Date("2026-11-22T20:15:30.000Z"),
    nahoda: () => (++cislo).toString(16).padStart(6, "0"),
    prostredi: "test",
    hesloSpravce: "tajne-heslo-123",
    ...volby,
  };
}

function zadost(cesta: string, telo?: unknown, hlavicky: Record<string, string> = {}, metoda?: string): Request {
  return new Request(`${WEB}${cesta}`, {
    method: metoda ?? (telo === undefined ? "GET" : "POST"),
    headers: { ...(telo === undefined ? {} : { "content-type": "application/json" }), ...hlavicky },
    ...(telo === undefined ? {} : { body: typeof telo === "string" ? telo : JSON.stringify(telo) }),
  });
}

const SPRAVCE = { authorization: "Bearer tajne-heslo-123" };

describe("deník ve hře", () => {
  it("nové sezení dostane čísla hráče a sezení a zapíše svůj začátek; další stránka téhož sezení v nich pokračuje", async () => {
    const trvala = pamet();
    const sezeni = pamet();
    const prvni = prostrediHry({ trvala, sezeni });
    const denik = new Denik(prvni.p);
    expect(denik.navrat).toBe(false);
    expect(denik.zapnuto).toBe(true);
    expect(denik.hlavicka).toMatchObject({ verze: 1, hrac: "0000000000000001", sezeni: "0000000000000002", hra: "0.10.0" });
    prvni.stav.cas += 1500;
    denik.zapis("uroven.otevrena", { navrh: false }, "1-01");
    await denik.odesli();
    expect(prvni.stav.odeslane).toHaveLength(1);
    expect(prvni.stav.odeslane[0]).toMatchObject({ adresa: ADRESA_DENIKU, naOdchodu: false });
    expect(prvni.stav.odeslane[0]!.davka).toEqual({
      hlavicka: denik.hlavicka,
      poradi: 0,
      udalosti: [
        { t: 0, druh: "sezeni.start", data: { navrat: false } },
        { t: 1500, druh: "uroven.otevrena", uroven: "1-01", data: { navrh: false } },
      ],
    });
    // Co deník pošle, to server přijme: obě strany čtou stejný tvar.
    expect(nactiDavku(prvni.stav.odeslane[0]!.davka)).toEqual(prvni.stav.odeslane[0]!.davka);

    // Přechod na jinou stránku hry: stejné sezení, čas běží dál, dávky se číslují dál.
    const druha = prostrediHry({ trvala, sezeni });
    druha.stav.cas = prvni.stav.cas + 4000;
    const dalsi = new Denik(druha.p);
    expect(dalsi.hlavicka.sezeni).toBe(denik.hlavicka.sezeni);
    dalsi.zapis("prehled.otevren");
    await dalsi.odesli(true);
    expect(druha.stav.odeslane[0]!.davka).toMatchObject({ poradi: 1, udalosti: [{ t: 5500, druh: "prehled.otevren" }] });
    expect(druha.stav.odeslane[0]!.naOdchodu).toBe(true);

    // Nový panel prohlížeče: stejný hráč (návrat), jiné sezení.
    const treti = prostrediHry({ trvala });
    const pozdeji = new Denik(treti.p);
    expect(pozdeji.navrat).toBe(true);
    expect(pozdeji.hlavicka.hrac).toBe(denik.hlavicka.hrac);
    expect(pozdeji.hlavicka.sezeni).not.toBe(denik.hlavicka.sezeni);
    await pozdeji.odesli();
    expect(treti.stav.odeslane[0]!.davka.udalosti[0]).toMatchObject({ druh: "sezeni.start", data: { navrat: true } });
  });

  it("odesílá po dávkách: když se fronta naplní, nebo když nejstarší událost čeká dost dlouho", async () => {
    const { p, stav } = prostrediHry();
    const denik = new Denik(p);
    for (let i = 0; i < UDALOSTI_NA_DAVKU - 2; i++) denik.zapis("stavba.zmena", { co: "prut" }, "1-01");
    denik.tik();
    await Promise.resolve();
    expect(stav.odeslane).toHaveLength(0);
    denik.zapis("stavba.zmena", { co: "prut" }, "1-01");
    await new Promise((hotovo) => setTimeout(hotovo, 0));
    expect(stav.odeslane).toHaveLength(1);
    expect(stav.odeslane[0]!.davka.udalosti).toHaveLength(UDALOSTI_NA_DAVKU);
    // Jedna událost sama počká, až vyprší doba čekání.
    denik.zapis("nastroj", { ktery: "vyber" }, "1-01");
    stav.cas += NEJDELSI_CEKANI - 1;
    denik.tik();
    await new Promise((hotovo) => setTimeout(hotovo, 0));
    expect(stav.odeslane).toHaveLength(1);
    stav.cas += 1;
    denik.tik();
    await new Promise((hotovo) => setTimeout(hotovo, 0));
    expect(stav.odeslane).toHaveLength(2);
    expect(stav.odeslane[1]!.davka.poradi).toBe(1);
    expect(denik.odeslano).toBe(2);
  });

  it("s vypnutým záznamem neodešle nic, ale poslední události si pro zpětnou vazbu pamatuje", async () => {
    const trvala = pamet({ "mostmistr.denik": "0", "mostmistr.hrac": "cccccccccccccccc" });
    const { p, stav } = prostrediHry({ trvala });
    const denik = new Denik(p);
    expect(denik.zapnuto).toBe(false);
    for (let i = 0; i < 100; i++) denik.zapis("stavba.zmena", { co: "prut" }, "1-01");
    stav.cas += 10 * NEJDELSI_CEKANI;
    denik.tik();
    await denik.odesli();
    await denik.odesli(true);
    expect(stav.odeslane).toEqual([]);
    expect(denik.posledni(5)).toHaveLength(5);
    expect(denik.posledni()).toHaveLength(101);
  });

  it("vypnutí se ještě odešle, pak už nic; volba se pamatuje a jde vrátit", async () => {
    const trvala = pamet();
    const { p, stav } = prostrediHry({ trvala });
    const denik = new Denik(p);
    denik.zapis("prehled.otevren");
    denik.zapnuto = false;
    await new Promise((hotovo) => setTimeout(hotovo, 0));
    expect(stav.odeslane).toHaveLength(1);
    expect(stav.odeslane[0]!.davka.udalosti.map((u) => u.druh)).toEqual(["sezeni.start", "prehled.otevren", "denik.vypnut"]);
    denik.zapis("uroven.otevrena", {}, "1-01");
    await denik.odesli();
    expect(stav.odeslane).toHaveLength(1);
    expect(trvala.data.get("mostmistr.denik")).toBe("0");
    expect(new Denik(prostrediHry({ trvala }).p).zapnuto).toBe(false);
    denik.zapnuto = true;
    await denik.odesli();
    expect(stav.odeslane[1]!.davka.udalosti.map((u) => u.druh)).toEqual(["denik.zapnut"]);
    // Upozornění na záznam se ukazuje, dokud ho hráč nepotvrdí.
    expect(denik.upozorneno).toBe(false);
    denik.potvrdUpozorneni();
    expect(new Denik(prostrediHry({ trvala }).p).upozorneno).toBe(true);
  });

  it("když server nepřijímá, události zkusí znovu a po třech nezdarech to do konce sezení vzdá", async () => {
    let prijima = false;
    const sezeni = pamet();
    const { p, stav } = prostrediHry({ prijima: () => prijima, sezeni });
    const denik = new Denik(p);
    denik.zapis("uroven.otevrena", {}, "1-01");
    await denik.odesli();
    expect(denik.vzdano).toBe(false);
    // Server se vzpamatuje: nepřijaté události dorazí s dalším číslem dávky.
    prijima = true;
    await denik.odesli();
    expect(stav.odeslane).toHaveLength(1);
    expect(stav.odeslane[0]!.davka.poradi).toBe(1);
    expect(stav.odeslane[0]!.davka.udalosti.map((u) => u.druh)).toEqual(["sezeni.start", "uroven.otevrena"]);
    // Trvalý výpadek (hra spuštěná bez serveru): tři nezdary a dost, i na dalších stránkách sezení.
    prijima = false;
    for (let i = 0; i < 3; i++) {
      denik.zapis("stavba.zmena", {}, "1-01");
      await denik.odesli();
    }
    expect(denik.vzdano).toBe(true);
    prijima = true;
    denik.zapis("stavba.zmena", {}, "1-01");
    await denik.odesli();
    expect(stav.odeslane).toHaveLength(1);
    expect(new Denik(prostrediHry({ sezeni }).p).vzdano).toBe(true);
  });

  it("funguje i bez paměti prohlížeče a velkou frontu rozdělí na dávky, které server přijme", async () => {
    const { p, stav } = prostrediHry({ trvala: null, sezeni: null });
    const denik = new Denik(p);
    const velky = "x".repeat(30_000);
    denik.zapis("zkouska.start", { navrh: velky }, "4-04");
    denik.zapis("zkouska.start", { navrh: velky }, "4-04");
    denik.zapis("zkouska.start", { navrh: velky }, "4-04");
    await denik.odesli();
    expect(stav.odeslane.length).toBeGreaterThan(1);
    expect(stav.odeslane.map((o) => o.davka.poradi)).toEqual(stav.odeslane.map((_, i) => i));
    for (const o of stav.odeslane) expect(JSON.stringify(o.davka).length).toBeLessThan(NEJVETSI_DAVKA);
    expect(stav.odeslane.flatMap((o) => o.davka.udalosti)).toHaveLength(4);
  });

  it("zpětná vazba se posílá i s vypnutým záznamem a nese hlavičku deníku", async () => {
    const { p } = prostrediHry({ trvala: pamet({ "mostmistr.denik": "0" }) });
    const denik = new Denik(p);
    let poslano: { adresa: string; telo: string } | null = null;
    const id = await denik.posliVazbu({ druh: "napad", text: "Chtělo by to lupu.", uroven: "2-03", hodnoceni: 4 }, (adresa, telo) => {
      poslano = { adresa, telo };
      return Promise.resolve({ id: "20261122T201530-000001" });
    });
    expect(id).toBe("20261122T201530-000001");
    expect(poslano!.adresa).toBe("/api/vazba");
    expect(nactiVazbu(JSON.parse(poslano!.telo))).toMatchObject({ druh: "napad", text: "Chtělo by to lupu.", uroven: "2-03", hodnoceni: 4, hlavicka: denik.hlavicka });
    expect(denik.posledni(1)[0]).toMatchObject({ druh: "vazba.odeslana", uroven: "2-03", data: { druh: "napad", hodnoceni: 4 } });
    expect(await denik.posliVazbu({ druh: "chyba", text: "Nejde to." }, () => Promise.resolve(null))).toBeNull();
    expect(await denik.posliVazbu({ druh: "chyba", text: "Nejde to." }, () => Promise.reject(new Error("síť")))).toBeNull();
  });
});

describe("kontrola příchozích dat", () => {
  it("odmítne dávku, která není od hry: cizí klíče, špatná čísla, moc událostí, hluboké zanoření", () => {
    const dobra = davka([{ t: 5, druh: "stavba.zmena", uroven: "1-01", data: { co: "prut", a: [0, 0], b: [4, 0] } }]);
    expect(nactiDavku(JSON.parse(JSON.stringify(dobra)))).toEqual(dobra);
    const spatne: [string, unknown][] = [
      ["davka.navic", { ...dobra, navic: 1 }],
      ["davka.hlavicka.hrac", { ...dobra, hlavicka: { ...dobra.hlavicka, hrac: "Pavel" } }],
      ["davka.hlavicka.verze", { ...dobra, hlavicka: { ...dobra.hlavicka, verze: 2 } }],
      ["davka.poradi", { ...dobra, poradi: -1 }],
      ["davka.udalosti", { ...dobra, udalosti: [] }],
      ["davka.udalosti", { ...dobra, udalosti: Array.from({ length: NEJVIC_UDALOSTI_V_DAVCE + 1 }, () => dobra.udalosti[0]) }],
      ["davka.udalosti[0].druh", { ...dobra, udalosti: [{ t: 0, druh: "<script>" }] }],
      ["davka.udalosti[0].uroven", { ...dobra, udalosti: [{ t: 0, druh: "x", uroven: "../../etc" }] }],
      ["davka.udalosti[0].t", { ...dobra, udalosti: [{ t: 1.5, druh: "x" }] }],
    ];
    for (const [cesta, data] of spatne) expect(() => nactiDavku(data), cesta).toThrowError(new RegExp(`^${cesta.replace(/[[\].]/g, "\\$&")}`));
    let hluboke: unknown = 1;
    for (let i = 0; i < 10; i++) hluboke = { a: hluboke };
    expect(() => nactiDavku({ ...dobra, udalosti: [{ t: 0, druh: "x", data: { hluboke } }] })).toThrow(/zanořená/);
  });

  it("zpětná vazba potřebuje text a známý druh; prázdná volitelná pole zahodí", () => {
    const vazba = { hlavicka: hlavicka(), druh: "chyba", text: "  Most spadl, i když neměl.  ", kontakt: "  ", hodnoceni: 2 };
    expect(nactiVazbu(vazba)).toEqual({ hlavicka: hlavicka(), druh: "chyba", text: "Most spadl, i když neměl.", hodnoceni: 2 });
    expect(() => nactiVazbu({ ...vazba, text: "   " })).toThrow(/prázdná/);
    expect(() => nactiVazbu({ ...vazba, druh: "reklama" })).toThrow(/vazba\.druh/);
    expect(() => nactiVazbu({ ...vazba, hodnoceni: 9 })).toThrow(/vazba\.hodnoceni/);
    expect(() => nactiVazbu({ ...vazba, text: "x".repeat(4001) })).toThrow(/delší/);
    expect(() => nactiVazbu({ ...vazba, heslo: "x" })).toThrow(/neznámý klíč/);
  });
});

describe("server: příjem deníku a zpětné vazby", () => {
  it("dávku uloží pod den, hráče, sezení a pořadí", async () => {
    const p = server();
    const d = davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }], 3);
    const odpoved = await prijmiDenik(zadost("/api/denik", d, { origin: WEB }), p);
    expect(odpoved.status).toBe(204);
    const klic = "denik/2026-11-22/aaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbb/00003.json";
    expect(await p.sklad.klice("denik/")).toEqual([klic]);
    expect(await p.sklad.cti(klic)).toEqual({ prijato: "2026-11-22T20:15:30.000Z", prostredi: "test", ...d });
  });

  it("odmítne cizí web, jinou metodu, nesmysl, špatný tvar a příliš velkou dávku; nic z toho neuloží", async () => {
    const p = server();
    const d = davka([{ t: 0, druh: "x" }]);
    expect((await prijmiDenik(zadost("/api/denik", d, { origin: "https://cizi.example" }), p)).status).toBe(403);
    expect((await prijmiDenik(zadost("/api/denik"), p)).status).toBe(405);
    expect((await prijmiDenik(zadost("/api/denik", "{nesmysl"), p)).status).toBe(400);
    const spatna = await prijmiDenik(zadost("/api/denik", { ...d, poradi: "nula" }), p);
    expect(spatna.status).toBe(400);
    expect(await spatna.json()).toEqual({ chyba: "davka.poradi: očekáváno konečné číslo" });
    const velka = davka([{ t: 0, druh: "x", data: { vata: "y".repeat(NEJVETSI_DAVKA) } }]);
    expect((await prijmiDenik(zadost("/api/denik", velka), p)).status).toBe(413);
    expect(await p.sklad.klice("")).toEqual([]);
  });

  it("zpětnou vazbu zaeviduje jako novou s číslem podle času; robotovi s vyplněnou pastí jen přitaká", async () => {
    const p = server();
    const vazba = { hlavicka: hlavicka(), druh: "obtiznost", text: "Úroveň 2-03 je moc těžká.", uroven: "2-03", navrh: '{"verze":3}', web: "" };
    const odpoved = await prijmiVazbu(zadost("/api/vazba", vazba, { origin: WEB }), p);
    expect(odpoved.status).toBe(201);
    const { id } = (await odpoved.json()) as { id: string };
    expect(id).toBe("20261122T201530-000001");
    const ulozena = (await p.sklad.cti(`vazba/${id}.json`)) as EvidovanaVazba;
    expect(ulozena).toMatchObject({ id, stav: "nova", poznamka: "", upraveno: null, prostredi: "test", prijato: "2026-11-22T20:15:30.000Z", text: "Úroveň 2-03 je moc těžká.", navrh: '{"verze":3}' });
    expect(ulozena).not.toHaveProperty("web");
    const robot = await prijmiVazbu(zadost("/api/vazba", { ...vazba, web: "https://reklama.example" }), p);
    expect(robot.status).toBe(201);
    expect(await p.sklad.klice("vazba/")).toHaveLength(1);
    expect((await prijmiVazbu(zadost("/api/vazba", { ...vazba, text: "" }), p)).status).toBe(400);
    expect((await prijmiVazbu(zadost("/api/vazba", vazba, { origin: "https://cizi.example" }), p)).status).toBe(403);
  });
});

describe("server: správa", () => {
  async function naplneny(): Promise<ProstrediServeru> {
    const p = server();
    const casy = ["2026-11-21T08:00:00.000Z", "2026-11-22T09:30:00.000Z", "2026-11-22T10:00:00.000Z"];
    let i = 0;
    p.ted = () => new Date(casy[Math.min(i, casy.length - 1)]!);
    await prijmiVazbu(zadost("/api/vazba", { hlavicka: hlavicka(), druh: "chyba", text: "První." }), p);
    i = 1;
    await prijmiVazbu(zadost("/api/vazba", { hlavicka: hlavicka(), druh: "napad", text: "Druhá. " + "a".repeat(300), uroven: "1-02", kontakt: "hrac@example.org", navrh: "{}", hodnoceni: 5 }), p);
    await prijmiDenik(zadost("/api/denik", davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 10, druh: "uroven.otevrena", uroven: "1-01" }], 0)), p);
    i = 2;
    await prijmiDenik(zadost("/api/denik", davka([{ t: 20, druh: "zkouska.konec", uroven: "1-01", data: { pruchod: true, sekund: 90, medaile: { pruchod: true, rozpocet: false, mistrovska: false } } }], 1)), p);
    await prijmiDenik(zadost("/api/denik", davka([{ t: 0, druh: "sezeni.start", data: { navrat: true } }], 0, hlavicka("cccccccccccccccc", "dddddddddddddddd", true))), p);
    return p;
  }

  it("bez hesla nepustí nikoho; bez nastaveného hesla řekne, co chybí", async () => {
    const p = await naplneny();
    expect((await spravuj(zadost("/api/sprava?co=vazby"), p)).status).toBe(401);
    expect((await spravuj(zadost("/api/sprava?co=vazby", undefined, { authorization: "Bearer tajne-heslo-124" }), p)).status).toBe(401);
    expect((await spravuj(zadost("/api/sprava?co=vazby", undefined, { authorization: "tajne-heslo-123" }), p)).status).toBe(401);
    expect((await spravuj(zadost("/api/sprava?co=vazby", undefined, SPRAVCE), p)).status).toBe(200);
    for (const heslo of [null, "", "kratke"]) {
      const bez = await spravuj(zadost("/api/sprava?co=vazby", undefined, { authorization: `Bearer ${heslo ?? ""}` }), { ...p, hesloSpravce: heslo });
      expect(bez.status).toBe(503);
      expect(((await bez.json()) as { chyba: string }).chyba).toContain("MM_SPRAVCE_HESLO");
    }
  });

  it("seznam zpětných vazeb je od nejnovější, bez příloh a s ukázkou textu; detail je celý", async () => {
    const p = await naplneny();
    const { vazby } = (await (await spravuj(zadost("/api/sprava?co=vazby", undefined, SPRAVCE), p)).json()) as { vazby: PolozkaSeznamuVazeb[] };
    expect(vazby.map((v) => v.id)).toEqual(["20261122T093000-000002", "20261121T080000-000001"]);
    expect(vazby[0]).toMatchObject({ stav: "nova", druh: "napad", uroven: "1-02", hodnoceni: 5, maNavrh: true, maKontakt: true, hra: "0.10.0" });
    expect(vazby[0]!.ukazka).toHaveLength(241);
    expect(vazby[0]).not.toHaveProperty("kontakt");
    expect(vazby[1]).toMatchObject({ uroven: null, hodnoceni: null, maNavrh: false, maKontakt: false, ukazka: "První." });
    const detail = await spravuj(zadost(`/api/sprava?co=vazba&id=${vazby[0]!.id}`, undefined, SPRAVCE), p);
    expect(((await detail.json()) as { vazba: EvidovanaVazba }).vazba).toMatchObject({ kontakt: "hrac@example.org", navrh: "{}" });
    expect((await spravuj(zadost("/api/sprava?co=vazba&id=20261122T093000-ffffff", undefined, SPRAVCE), p)).status).toBe(404);
    expect((await spravuj(zadost("/api/sprava?co=vazba&id=../denik", undefined, SPRAVCE), p)).status).toBe(400);
  });

  it("stav řešení a poznámku jde změnit; neznámý stav odmítne", async () => {
    const p = await naplneny();
    const id = "20261121T080000-000001";
    const zmena = await spravuj(zadost("/api/sprava?co=vazba", { id, stav: "resi-se", poznamka: "Opravuji v M5." }, SPRAVCE), p);
    expect(zmena.status).toBe(200);
    expect(((await zmena.json()) as { vazba: EvidovanaVazba }).vazba).toMatchObject({ stav: "resi-se", poznamka: "Opravuji v M5.", upraveno: "2026-11-22T10:00:00.000Z" });
    expect(await p.sklad.cti(`vazba/${id}.json`)).toMatchObject({ stav: "resi-se", text: "První." });
    // Jen stav: poznámka zůstane.
    await spravuj(zadost("/api/sprava?co=vazba", { id, stav: "vyreseno" }, SPRAVCE), p);
    expect(await p.sklad.cti(`vazba/${id}.json`)).toMatchObject({ stav: "vyreseno", poznamka: "Opravuji v M5." });
    expect((await spravuj(zadost("/api/sprava?co=vazba", { id, stav: "smazat" }, SPRAVCE), p)).status).toBe(400);
    expect((await spravuj(zadost("/api/sprava?co=vazba", { id: "x", stav: "vyreseno" }, SPRAVCE), p)).status).toBe(400);
    expect((await spravuj(zadost("/api/sprava?co=vazba", { id, stav: "vyreseno" }), p)).status).toBe(401);
  });

  it("deník jde projít po dnech a sezeních, sečíst a vyvézt", async () => {
    const p = await naplneny();
    const cti = async <T>(dotaz: string): Promise<T> => (await (await spravuj(zadost(`/api/sprava?${dotaz}`, undefined, SPRAVCE), p)).json()) as T;
    expect(await cti("co=dny")).toEqual({ dny: ["2026-11-22"] });
    const den = await cti<{ sezeni: SezeniDne[] }>("co=den&den=2026-11-22");
    expect(den.sezeni).toEqual([
      { hrac: "aaaaaaaaaaaaaaaa", sezeni: "bbbbbbbbbbbbbbbb", davek: 2 },
      { hrac: "cccccccccccccccc", sezeni: "dddddddddddddddd", davek: 1 },
    ]);
    const sezeni = await cti<{ udalosti: UdalostDeniku[]; hlavicka: HlavickaDeniku }>("co=sezeni&den=2026-11-22&hrac=aaaaaaaaaaaaaaaa&sezeni=bbbbbbbbbbbbbbbb");
    expect(sezeni.udalosti.map((u) => u.druh)).toEqual(["sezeni.start", "uroven.otevrena", "zkouska.konec"]);
    expect(sezeni.hlavicka.hrac).toBe("aaaaaaaaaaaaaaaa");
    const souhrn = await cti<{ souhrn: ReturnType<typeof souhrnDeniku>; davek: number; neuplne: boolean }>("co=souhrn&den=2026-11-22");
    expect(souhrn).toMatchObject({ davek: 3, neuplne: false, souhrn: { hracu: 2, sezeni: 2, novych: 1, dotykovych: 1 } });
    expect(souhrn.souhrn.urovne).toEqual([expect.objectContaining({ uroven: "1-01", hracu: 1, zkousek: 1, pruchodu: 1, minutDoPruchodu: 1.5 })]);
    expect((await cti<{ davky: DavkaDeniku[] }>("co=export&den=2026-11-22")).davky).toHaveLength(3);
    expect((await spravuj(zadost("/api/sprava?co=den&den=vcera", undefined, SPRAVCE), p)).status).toBe(400);
    expect((await spravuj(zadost("/api/sprava?co=sezeni&den=2026-11-22&hrac=x&sezeni=y", undefined, SPRAVCE), p)).status).toBe(400);
    expect((await spravuj(zadost("/api/sprava?co=sezeni&den=2026-11-20&hrac=aaaaaaaaaaaaaaaa&sezeni=bbbbbbbbbbbbbbbb", undefined, SPRAVCE), p)).status).toBe(404);
    expect((await spravuj(zadost("/api/sprava?co=neco", undefined, SPRAVCE), p)).status).toBe(400);
    expect((await spravuj(zadost("/api/sprava", undefined, SPRAVCE), p)).status).toBe(404);
  });
});

describe("souhrn deníku", () => {
  const u = (t: number, druh: string, uroven: string | undefined, data?: UdalostDeniku["data"]): UdalostDeniku => ({ t, druh, ...(uroven ? { uroven } : {}), ...(data ? { data } : {}) });
  const konec = (t: number, pruchod: boolean, sekund: number, navic: UdalostDeniku["data"] = {}): UdalostDeniku =>
    u(t, "zkouska.konec", "2-03", { pruchod, sekund, pokus: null, medaile: { pruchod, rozpocet: false, mistrovska: false }, ...navic });

  it("spočítá hráče, zkoušky, průchody, čas a pokusy do průchodu a důvody selhání", () => {
    const anna = hlavicka("a1a1a1a1a1a1a1a1", "1111111111111111");
    const bob = hlavicka("b2b2b2b2b2b2b2b2", "2222222222222222", true);
    const cyril = hlavicka("c3c3c3c3c3c3c3c3", "3333333333333333");
    const souhrn = souhrnDeniku([
      // Dávky přicházejí na přeskáčku; souhrn si je seřadí.
      davka([konec(900, false, 200, { prvni: { prvek: "ocel-lehka", zpusob: "vzper" } }), konec(1200, true, 320, { medaile: { pruchod: true, rozpocet: true, mistrovska: false } })], 1, anna),
      davka([u(0, "sezeni.start", undefined, { navrat: false }), u(5, "uroven.otevrena", "2-03"), konec(600, false, 100, { prvni: { prvek: "ocel-lehka", zpusob: "vzper" } }), u(650, "chyba", undefined, { zprava: "TypeError: x is undefined" })], 0, anna),
      // Bob: pokus s brnknutím se nepočítá, pak neúspěch bez porušení (kmitání), odešel, vrátil se a prošel.
      davka([
        u(0, "sezeni.start", undefined, { navrat: true }),
        u(1, "uroven.otevrena", "2-03"),
        u(50, "zkouska.konec", "2-03", { pruchod: false, pokus: "brnknuti", sekund: 30 }),
        konec(100, false, 60, { prvni: null }),
        u(120, "uroven.opustena", "2-03", { sekund: 240 }),
        u(200, "uroven.otevrena", "2-03"),
        konec(300, true, 120),
        u(310, "vazba.odeslana", "2-03", { id: "x" }),
      ], 0, bob),
      // Cyril úroveň jen otevřel.
      davka([u(0, "sezeni.start", undefined, { navrat: false }), u(3, "uroven.otevrena", "2-03"), u(9, "uroven.otevrena", "1-01"), u(9, "chyba", undefined, { zprava: "TypeError: x is undefined" })], 0, cyril),
    ]);
    expect(souhrn).toMatchObject({ hracu: 3, sezeni: 3, novych: 2, dotykovych: 1, chyb: 2, vazeb: 1, chyby: [{ zprava: "TypeError: x is undefined", pocet: 2 }] });
    expect(souhrn.udalosti).toBe(18);
    expect(souhrn.urovne.map((x) => x.uroven)).toEqual(["1-01", "2-03"]);
    expect(souhrn.urovne[1]).toEqual({
      uroven: "2-03",
      hracu: 3,
      otevreni: 4,
      zkousek: 5,
      pruchodu: 2,
      hracuSPruchodem: 2,
      hracuBezZkousky: 1,
      // Anna prošla na třetí zkoušku po 320 s, Bob na druhou po 240 + 120 s.
      zkousekDoPruchodu: 2.5,
      minutDoPruchodu: 5.7,
      medaile: { pruchod: 2, rozpocet: 1, mistrovska: 0 },
      selhani: { "ocel-lehka/vzper": 2, "bez porušení": 1 },
    });
    expect(souhrn.urovne[0]).toMatchObject({ uroven: "1-01", hracu: 1, zkousek: 0, hracuBezZkousky: 1, zkousekDoPruchodu: null, minutDoPruchodu: null });
    expect(souhrnDeniku([])).toMatchObject({ hracu: 0, sezeni: 0, urovne: [], chyby: [] });
  });
});

describe("úložiště v Netlify Blobs", () => {
  it("sklad nad skutečnou knihovnou a místním serverem čte, zapisuje a vypisuje stejně jako sklad v paměti", async () => {
    const slozka = mkdtempSync(join(tmpdir(), "mostmistr-blobs-"));
    const mistni = new BlobsServer({ directory: slozka, token: "zkouska" });
    const { port } = await mistni.start();
    try {
      const uloziste = getStore({ edgeURL: `http://localhost:${port}`, name: "mostmistr", token: "zkouska", siteID: "zkouska" });
      for (const sklad of [skladNadBlobs(uloziste), skladNadBlobs(uloziste, uloziste), new SkladVPameti()]) {
        await sklad.zapis("denik/2026-11-22/aaaaaaaa/bbbbbbbb/00001.json", { a: 2 });
        await sklad.zapis("denik/2026-11-22/aaaaaaaa/bbbbbbbb/00000.json", { a: 1 });
        await sklad.zapis("denik/2026-11-23/cccccccc/dddddddd/00000.json", { a: 3 });
        await sklad.zapis("vazba/20261122T101010-abcdef.json", { id: "x", text: "ž" });
        expect(await sklad.klice("denik/2026-11-22/")).toEqual([
          "denik/2026-11-22/aaaaaaaa/bbbbbbbb/00000.json",
          "denik/2026-11-22/aaaaaaaa/bbbbbbbb/00001.json",
        ]);
        expect(await sklad.slozky("denik/")).toEqual(["2026-11-22", "2026-11-23"]);
        expect(await sklad.slozky("")).toEqual(["denik", "vazba"]);
        expect(await sklad.cti("vazba/20261122T101010-abcdef.json")).toEqual({ id: "x", text: "ž" });
        expect(await sklad.cti("vazba/neni.json")).toBeNull();
        expect(await sklad.klice("nic/")).toEqual([]);
      }
      // Celá cesta: příjem přes obsluhu do skutečného úložiště a čtení správou.
      const p = server({ sklad: skladNadBlobs(uloziste) });
      await prijmiVazbu(zadost("/api/vazba", { hlavicka: hlavicka(), druh: "pochvala", text: "Paráda." }), p);
      const { vazby } = (await (await spravuj(zadost("/api/sprava?co=vazby", undefined, SPRAVCE), p)).json()) as { vazby: PolozkaSeznamuVazeb[] };
      expect(vazby.map((v) => v.ukazka)).toEqual(["Paráda."]);
    } finally {
      await mistni.stop();
      rmSync(slozka, { recursive: true, force: true });
    }
  });
});
