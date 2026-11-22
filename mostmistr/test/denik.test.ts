// Deník hraní a zpětná vazba: sbírání událostí ve hře, příjem a kontrola na serveru,
// správa s heslem a denní souhrn. Všechno bez prohlížeče a bez Netlify.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStore } from "@netlify/blobs";
import { BlobsServer } from "@netlify/blobs/server";
import { describe, expect, it } from "vitest";
import {
  ADRESA_DENIKU,
  Denik,
  NEJDELSI_CEKANI,
  PRESTAVKA_PO_NEZDARECH,
  UDALOSTI_NA_DAVKU,
  type PametDeniku,
  type ProstrediDeniku,
  type VysledekOdeslani,
} from "../src/denik/denik";
import { slucVytahy, souhrnDeniku, souhrnZVytahu, vytahDeniku } from "../src/denik/souhrn";
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
  NEJVIC_DAVEK_NAJEDNOU,
  NEJVIC_VAZEB_DENNE,
  NEJVIC_VAZEB_V_SEZNAMU,
  prijmiDenik,
  prijmiVazbu,
  spravuj,
  type OdpovedSouhrnu,
  type PolozkaSeznamuVazeb,
  type ProstrediServeru,
  type SezeniDne,
} from "../src/server/obsluha";
import { SkladVPameti, type SkladZaznamu } from "../src/server/sklad";

const WEB = "https://mostmistr.example";

/** Začátek sezení, se kterým testy počítají, když jim na něm nezáleží (ms). */
const ZACATEK = 1_795_000_000_000;

function hlavicka(hrac = "aaaaaaaaaaaaaaaa", sezeni = "bbbbbbbbbbbbbbbb", dotyk = false, zacatek = ZACATEK): HlavickaDeniku {
  return { verze: VERZE_DENIKU, hrac, sezeni, zacatek, hra: "0.10.0", sestaveni: "abc1234", jazyk: "cs-CZ", okno: [1280, 720], dotyk };
}

function davka(udalosti: UdalostDeniku[], poradi = 0, h = hlavicka()): DavkaDeniku {
  return { hlavicka: h, poradi, udalosti };
}

function pamet(pocatek: Record<string, string> = {}): PametDeniku & { data: Map<string, string> } {
  const data = new Map(Object.entries(pocatek));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

/** Prostředí deníku s hodinami, které posouvá test, a se záznamem všeho odeslaného. */
function prostrediHry(volby: { prijima?: () => boolean | VysledekOdeslani; trvala?: PametDeniku | null; sezeni?: PametDeniku | null } = {}) {
  const stav = { cas: 1_000_000, cislo: 0, odeslane: [] as { adresa: string; davka: DavkaDeniku; naOdchodu: boolean }[] };
  const p: ProstrediDeniku = {
    trvala: volby.trvala === undefined ? pamet() : volby.trvala,
    sezeni: volby.sezeni === undefined ? pamet() : volby.sezeni,
    ted: () => stav.cas,
    nahoda: () => (++stav.cislo).toString(16).padStart(16, "0"),
    posli: (adresa, telo, naOdchodu) => {
      const odpoved = volby.prijima ? volby.prijima() : true;
      const vysledek: VysledekOdeslani = odpoved === true ? "prijato" : odpoved === false ? "nedostupne" : odpoved;
      if (vysledek === "prijato") stav.odeslane.push({ adresa, davka: JSON.parse(telo) as DavkaDeniku, naOdchodu });
      return Promise.resolve(vysledek);
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

/** Žádost na server hry; s tělem je to POST ze stránky téhož webu (prohlížeč přidá Origin). */
function zadost(cesta: string, telo?: unknown, hlavicky: Record<string, string> = {}, metoda?: string): Request {
  return new Request(`${WEB}${cesta}`, {
    method: metoda ?? (telo === undefined ? "GET" : "POST"),
    headers: { ...(telo === undefined ? {} : { "content-type": "application/json", origin: WEB }), ...hlavicky },
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

  it("při vypnutí odejde jen zpráva o vypnutí, pak už nic; volba se pamatuje a jde vrátit", async () => {
    const trvala = pamet();
    const { p, stav } = prostrediHry({ trvala });
    const denik = new Denik(p);
    denik.zapis("prehled.otevren");
    denik.zapnuto = false;
    await new Promise((hotovo) => setTimeout(hotovo, 0));
    // Co čekalo ve frontě, se zahodilo: hráč, který záznam vypíná, nechce poslat ani to.
    expect(stav.odeslane).toHaveLength(1);
    expect(stav.odeslane[0]!.davka.udalosti.map((u) => u.druh)).toEqual(["denik.vypnut"]);
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

  it("vypnutí v jiném panelu platí i tady: volba se čte před každým odesláním", async () => {
    const trvala = pamet();
    const { p, stav } = prostrediHry({ trvala });
    const denik = new Denik(p);
    denik.zapis("uroven.otevrena", {}, "1-01");
    // Jiná stránka téhož prohlížeče záznam vypne.
    trvala.data.set("mostmistr.denik", "0");
    await denik.odesli(true);
    expect(stav.odeslane).toHaveLength(0);
    expect(denik.zapnuto).toBe(false);
    denik.zapis("stavba.zmena", {}, "1-01");
    denik.tik();
    await denik.odesli();
    expect(stav.odeslane).toHaveLength(0);
    // A zapnutí jinde zase platí.
    trvala.data.set("mostmistr.denik", "1");
    expect(denik.nactiVolbu()).toBe(true);
  });

  it("dvě stránky téhož sezení (návrat tlačítkem Zpět) si číslo dávky nevezmou", async () => {
    const trvala = pamet();
    const sezeni = pamet();
    const prvni = prostrediHry({ trvala, sezeni });
    const prehled = new Denik(prvni.p);
    // Druhá stránka vznikla dřív, než první cokoli odeslala: obě si pamatují pořadí nula.
    const druha = prostrediHry({ trvala, sezeni });
    const uroven = new Denik(druha.p);
    prehled.zapis("prehled.otevren");
    await prehled.odesli();
    uroven.zapis("uroven.otevrena", {}, "1-01");
    await uroven.odesli();
    prehled.zapis("prehled.otevren");
    await prehled.odesli();
    const poradi = [...prvni.stav.odeslane, ...druha.stav.odeslane].map((o) => o.davka.poradi).sort();
    expect(poradi).toEqual([0, 1, 2]);
  });

  it("když server neodpovídá, události zkusí znovu; po třech nezdarech si dá přestávku a pak pokračuje", async () => {
    let prijima: boolean | VysledekOdeslani = false;
    const { p, stav } = prostrediHry({ prijima: () => prijima });
    const denik = new Denik(p);
    denik.zapis("uroven.otevrena", {}, "1-01");
    await denik.odesli();
    expect(denik.vzdano).toBe(false);
    // Mezitím přibude další událost. Server se vzpamatuje: nedoručená dávka odejde znovu
    // tak, jak byla, pod stejným číslem (server ji mohl uložit už napoprvé a souhrn podle
    // čísla pozná, že ji má dvakrát); nová událost jde až za ní.
    denik.zapis("nastroj", { ktery: "vyber" }, "1-01");
    prijima = true;
    await denik.odesli();
    expect(stav.odeslane).toHaveLength(2);
    expect(stav.odeslane[0]!.davka.poradi).toBe(0);
    expect(stav.odeslane[0]!.davka.udalosti.map((u) => u.druh)).toEqual(["sezeni.start", "uroven.otevrena"]);
    expect(stav.odeslane[1]!.davka).toMatchObject({ poradi: 1, udalosti: [{ druh: "nastroj" }] });
    stav.odeslane.length = 0;
    // Trvalý výpadek (hra spuštěná bez serveru): tři nezdary a přestávka.
    prijima = false;
    for (let i = 0; i < 3; i++) {
      denik.zapis("stavba.zmena", { krok: i }, "1-01");
      await denik.odesli();
    }
    expect(denik.vzdano).toBe(true);
    prijima = true;
    denik.zapis("stavba.zmena", { krok: 3 }, "1-01");
    await denik.odesli();
    expect(stav.odeslane).toHaveLength(0);
    // Po přestávce odejde všechno, co se mezitím nasbíralo: nejdřív dávka, která neprošla
    // (pod svým číslem), pak zbytek.
    stav.cas += PRESTAVKA_PO_NEZDARECH + 1;
    expect(denik.vzdano).toBe(false);
    await denik.odesli();
    expect(stav.odeslane.map((o) => [o.davka.poradi, o.davka.udalosti.map((u) => u.data?.krok)])).toEqual([
      [2, [0]],
      [3, [1, 2, 3]],
    ]);
    // Žádost, kterou server odmítl natrvalo (špatný tvar), se neopakuje a za nezdar se nepočítá.
    prijima = "odmitnuto";
    for (let i = 0; i < 5; i++) {
      denik.zapis("stavba.zmena", {}, "1-01");
      await denik.odesli();
    }
    expect(denik.vzdano).toBe(false);
    prijima = true;
    await denik.odesli();
    expect(stav.odeslane).toHaveLength(2);
  });

  it("dávky jedné stránky jdou na server po jedné: druhé odeslání počká, až první doběhne", async () => {
    const { p, stav } = prostrediHry();
    const rozpracovane: { davka: DavkaDeniku; dokonci: () => void }[] = [];
    p.posli = (_adresa, telo, naOdchodu) =>
      new Promise((hotovo) => {
        const davka = JSON.parse(telo) as DavkaDeniku;
        const dokonci = (): void => {
          stav.odeslane.push({ adresa: "", davka, naOdchodu });
          hotovo("prijato");
        };
        if (naOdchodu) dokonci();
        else rozpracovane.push({ davka, dokonci });
      });
    const denik = new Denik(p);
    denik.zapis("uroven.otevrena", {}, "1-01");
    const prvni = denik.odesli();
    // První žádost je na cestě. Hráč mezitím dokončí zkoušku a hra chce deník odeslat hned.
    denik.zapis("zkouska.konec", { pruchod: false }, "1-01");
    await denik.odesli();
    expect(rozpracovane).toHaveLength(1);
    // Teprve po odpovědi na první žádost odejde druhá, s dalším číslem.
    rozpracovane[0]!.dokonci();
    await Promise.resolve();
    await Promise.resolve();
    expect(rozpracovane).toHaveLength(2);
    expect(rozpracovane[1]!.davka).toMatchObject({ poradi: 1, udalosti: [{ druh: "zkouska.konec" }] });
    // Odchod ze stránky čekat nemůže: co je ve frontě, odejde hned, i když předchozí dávka ještě letí.
    denik.zapis("uroven.opustena", { sekund: 5 }, "1-01");
    await denik.odesli(true);
    expect(stav.odeslane.map((o) => o.davka.poradi)).toEqual([0, 2]);
    rozpracovane[1]!.dokonci();
    await prvni;
    expect(stav.odeslane.map((o) => o.davka.poradi)).toEqual([0, 2, 1]);
    expect(stav.odeslane.flatMap((o) => o.davka.udalosti.map((u) => u.druh))).toEqual(["sezeni.start", "uroven.otevrena", "uroven.opustena", "zkouska.konec"]);
  });

  it("velkou frontu rozdělí na dávky; když jedna neprojde, vrátí do fronty ji i všechny další", async () => {
    let pokus = 0;
    // Druhá žádost selže, ostatní projdou.
    const { p, stav } = prostrediHry({ prijima: () => ++pokus !== 2 });
    const denik = new Denik(p);
    const velky = "x".repeat(30_000);
    for (let i = 0; i < 4; i++) denik.zapis("zkouska.start", { navrh: velky, cislo: i }, "4-04");
    await denik.odesli();
    expect(stav.odeslane).toHaveLength(1);
    await denik.odesli();
    expect(stav.odeslane.length).toBeGreaterThan(2);
    for (const o of stav.odeslane) expect(JSON.stringify(o.davka).length).toBeLessThan(NEJVETSI_DAVKA);
    // Nic se neztratilo a nic nepřišlo dvakrát.
    const cisla = stav.odeslane.flatMap((o) => o.davka.udalosti).flatMap((u) => (u.druh === "zkouska.start" ? [u.data!.cislo] : []));
    expect(cisla).toEqual([0, 1, 2, 3]);
    expect(new Set(stav.odeslane.map((o) => o.davka.poradi)).size).toBe(stav.odeslane.length);
  });

  it("bez trvalé paměti si volby pamatuje aspoň do zavření panelu; bez jakékoli paměti deník nevede", async () => {
    // Jen paměť panelu: vypnutí i potvrzení upozornění přežijí přechod na další stránku.
    const sezeni = pamet();
    const prvni = new Denik(prostrediHry({ trvala: null, sezeni }).p);
    expect(prvni.zapnuto).toBe(true);
    prvni.potvrdUpozorneni();
    prvni.zapnuto = false;
    const dalsi = new Denik(prostrediHry({ trvala: null, sezeni }).p);
    expect(dalsi.zapnuto).toBe(false);
    expect(dalsi.upozorneno).toBe(true);
    expect(dalsi.hlavicka.hrac).toBe(prvni.hlavicka.hrac);
    // Žádná paměť: hra by si nepamatovala ani vypnutí, takže se nezaznamenává nic.
    const { p, stav } = prostrediHry({ trvala: null, sezeni: null });
    const bez = new Denik(p);
    expect(bez.zapnuto).toBe(false);
    expect(bez.lzeZapnout).toBe(false);
    bez.zapnuto = true;
    expect(bez.zapnuto).toBe(false);
    bez.zapis("uroven.otevrena", {}, "1-01");
    await bez.odesli(true);
    expect(stav.odeslane).toHaveLength(0);
    // Potvrzení upozornění platí aspoň pro tuhle stránku a zpětnou vazbu poslat jde.
    bez.potvrdUpozorneni();
    expect(bez.upozorneno).toBe(true);
    expect(bez.posledni().map((u) => u.druh)).toContain("uroven.otevrena");
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
    // Jméno dávky začíná časem příjmu (nové dávky přibývají na konec pořadí klíčů) a končí
    // náhodným dovětkem, aby se dvě dávky se stejným číslem (dvě stránky téhož sezení) nepřepsaly.
    const klic = `denik/2026-11-22/${Date.parse("2026-11-22T20:15:30.000Z")}-aaaaaaaaaaaaaaaa-1795000000000-bbbbbbbbbbbbbbbb-00003-000001.json`;
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

describe("server: odolnost veřejných adres", () => {
  const udalost: UdalostDeniku = { t: 5, druh: "uroven.otevrena", uroven: "1-01" };

  it("žádost bez hlavičky Origin nebo z cizího webu odmítne; adresu webu bere i z hlaviček Netlify", async () => {
    const p = server();
    const bez = new Request(`${WEB}/api/denik`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(davka([udalost])) });
    expect((await prijmiDenik(bez, p)).status).toBe(403);
    expect((await prijmiVazbu(zadost("/api/vazba", { hlavicka: hlavicka(), druh: "jine", text: "x" }, { origin: "https://jinde.example" }), p)).status).toBe(403);
    expect(await p.sklad.klice("")).toEqual([]);
    // Funkce může vidět vnitřní adresu; veřejnou jí Netlify předá v hlavičce.
    const vnitrni = new Request("http://vnitrni.invalid/api/denik", {
      method: "POST",
      headers: { "content-type": "application/json", origin: WEB, "x-forwarded-host": "mostmistr.example" },
      body: JSON.stringify(davka([udalost])),
    });
    expect((await prijmiDenik(vnitrni, p)).status).toBe(204);
  });

  it("dvě dávky se stejným číslem se nepřepíšou (zdvojený panel prohlížeče)", async () => {
    const p = server();
    await prijmiDenik(zadost("/api/denik", davka([udalost], 1)), p);
    await prijmiDenik(zadost("/api/denik", davka([{ t: 9, druh: "uroven.opustena", uroven: "1-01", data: { sekund: 4 } }], 1)), p);
    const klice = await p.sklad.klice("denik/");
    expect(klice).toHaveLength(2);
    const sezeni = (await (await spravuj(zadost("/api/sprava?co=sezeni&den=2026-11-22&hrac=aaaaaaaaaaaaaaaa&slozka=1795000000000-bbbbbbbbbbbbbbbb", undefined, SPRAVCE), p)).json()) as { udalosti: UdalostDeniku[] };
    expect(sezeni.udalosti.map((u) => u.druh)).toEqual(["uroven.otevrena", "uroven.opustena"]);
  });

  it("hlavička smí mít prázdný jazyk; dlouhé texty a nesmyslně velká čísla v událostech neprojdou", () => {
    expect(nactiDavku(davka([udalost], 0, { ...hlavicka(), jazyk: "" })).hlavicka.jazyk).toBe("");
    expect(() => nactiDavku(davka([{ t: 1, druh: "chyba", data: { zprava: "x".repeat(301) } }]))).toThrow(/delší než 300/);
    expect(() => nactiDavku(davka([{ t: 1, druh: "zkouska.konec", uroven: "1-01", data: { cena: 1e300 } }]))).toThrow(/rozumné velikosti/);
    // Zápis mostu dlouhý být smí.
    expect(nactiDavku(davka([{ t: 1, druh: "zkouska.start", uroven: "1-01", data: { navrh: "x".repeat(40_000) } }])).udalosti).toHaveLength(1);
    expect(() => nactiDavku(davka([udalost], 0, { ...hlavicka(), zacatek: -1 }))).toThrow();
  });

  it("zpětných vazeb přijme za den jen omezený počet a seznam je po stránkách", async () => {
    const p = server();
    const posli = (text: string): Promise<Response> => prijmiVazbu(zadost("/api/vazba", { hlavicka: hlavicka(), druh: "jine", text }), p);
    for (let i = 0; i < NEJVIC_VAZEB_DENNE; i++) expect((await posli(`zpráva ${i}`)).status).toBe(201);
    expect((await posli("o jednu víc")).status).toBe(429);
    expect(await p.sklad.klice("vazba/")).toHaveLength(NEJVIC_VAZEB_DENNE);
    type Stranka = { vazby: PolozkaSeznamuVazeb[]; celkem: number; dalsi: string | null };
    const cti = async (dotaz: string): Promise<Stranka> => (await (await spravuj(zadost(`/api/sprava?${dotaz}`, undefined, SPRAVCE), p)).json()) as Stranka;
    const prvni = await cti("co=vazby");
    expect(prvni.vazby).toHaveLength(NEJVIC_VAZEB_V_SEZNAMU);
    expect(prvni.celkem).toBe(NEJVIC_VAZEB_DENNE);
    expect(prvni.vazby[0]!.ukazka).toBe(`zpráva ${NEJVIC_VAZEB_DENNE - 1}`);
    const druha = await cti(`co=vazby&pred=${prvni.dalsi}`);
    expect(druha.vazby).toHaveLength(NEJVIC_VAZEB_DENNE - NEJVIC_VAZEB_V_SEZNAMU);
    expect(druha.dalsi).toBeNull();
    expect(druha.vazby.at(-1)!.ukazka).toBe("zpráva 0");
    // Žádná zpráva není na obou stránkách.
    expect(new Set([...prvni.vazby, ...druha.vazby].map((v) => v.id)).size).toBe(NEJVIC_VAZEB_DENNE);
    // Další den se počítá znovu.
    p.ted = () => new Date("2026-11-23T08:00:00.000Z");
    expect((await posli("nový den")).status).toBe(201);
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

  it("heslo jde ověřit samostatně, bez načítání dat", async () => {
    const p = server();
    expect(await (await spravuj(zadost("/api/sprava?co=overeni", undefined, SPRAVCE), p)).json()).toEqual({ ok: true, prostredi: "test" });
    expect((await spravuj(zadost("/api/sprava?co=overeni", undefined, { authorization: "Bearer spatne-heslo" }), p)).status).toBe(401);
  });

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
    expect(vazby[0]).toMatchObject({ stav: "nova", druh: "napad", uroven: "1-02", hodnoceni: 5, maNavrh: true, maKontakt: true });
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
    const [v930, v1000] = [Date.parse("2026-11-22T09:30:00.000Z"), Date.parse("2026-11-22T10:00:00.000Z")];
    expect(den.sezeni).toEqual([
      { hrac: "aaaaaaaaaaaaaaaa", sezeni: "bbbbbbbbbbbbbbbb", slozka: "1795000000000-bbbbbbbbbbbbbbbb", zacatek: ZACATEK, davek: 2, prvni: v930, posledni: v1000 },
      { hrac: "cccccccccccccccc", sezeni: "dddddddddddddddd", slozka: "1795000000000-dddddddddddddddd", zacatek: ZACATEK, davek: 1, prvni: v1000, posledni: v1000 },
    ]);
    // Záznam, který dávce deníku nepatří (jiné jméno), se mezi sezení nepočítá.
    await p.sklad.zapis("denik/2026-11-22/poznamka.json", { cizi: true });
    expect((await cti<{ sezeni: SezeniDne[] }>("co=den&den=2026-11-22")).sezeni).toHaveLength(2);
    await p.sklad.smaz("denik/2026-11-22/poznamka.json");
    const sezeni = await cti<{ udalosti: UdalostDeniku[]; hlavicka: HlavickaDeniku }>("co=sezeni&den=2026-11-22&hrac=aaaaaaaaaaaaaaaa&slozka=1795000000000-bbbbbbbbbbbbbbbb");
    expect(sezeni.udalosti.map((u) => u.druh)).toEqual(["sezeni.start", "uroven.otevrena", "zkouska.konec"]);
    expect(sezeni.hlavicka.hrac).toBe("aaaaaaaaaaaaaaaa");
    const souhrn = await cti<OdpovedSouhrnu>("co=souhrn&den=2026-11-22");
    expect(souhrn).toMatchObject({ od: "2026-11-22", do: "2026-11-22", dny: ["2026-11-22"], davek: 3, neuplne: false, nedokonceno: [], souhrn: { hracu: 2, sezeni: 2, novych: 1, dotykovych: 1 } });
    expect(souhrn.souhrn.urovne).toEqual([expect.objectContaining({ uroven: "1-01", hracu: 1, zkousek: 1, pruchodu: 1, minutDoPruchodu: 1.5 })]);
    expect(await cti("co=export&den=2026-11-22")).toMatchObject({ davky: { length: 3 }, neuplne: false, celkem: 3, dalsi: null });
    expect(await cti("co=export&den=2026-11-22&preskocit=2")).toMatchObject({ davky: [{ hlavicka: { hrac: "cccccccccccccccc" } }], celkem: 3, dalsi: null });
    expect((await spravuj(zadost("/api/sprava?co=souhrn&od=2026-11-23&do=2026-11-22", undefined, SPRAVCE), p)).status).toBe(400);
    expect((await spravuj(zadost("/api/sprava?co=den&den=vcera", undefined, SPRAVCE), p)).status).toBe(400);
    expect((await spravuj(zadost("/api/sprava?co=sezeni&den=2026-11-22&hrac=x&slozka=y", undefined, SPRAVCE), p)).status).toBe(400);
    expect((await spravuj(zadost("/api/sprava?co=sezeni&den=2026-11-20&hrac=aaaaaaaaaaaaaaaa&slozka=1795000000000-bbbbbbbbbbbbbbbb", undefined, SPRAVCE), p)).status).toBe(404);
    expect((await spravuj(zadost("/api/sprava?co=neco", undefined, SPRAVCE), p)).status).toBe(400);
    expect((await spravuj(zadost("/api/sprava", undefined, SPRAVCE), p)).status).toBe(404);
  });

  it("zpětnou vazbu i deník dne jde smazat; smazaný den zmizí i ze souhrnu", async () => {
    const p = await naplneny();
    const smaz = (telo: unknown): Promise<Response> => spravuj(zadost("/api/sprava?co=smazat", telo, SPRAVCE), p);
    expect((await spravuj(zadost("/api/sprava?co=smazat", { vazba: "20261121T080000-000001" }), p)).status).toBe(401);
    expect(await (await smaz({ vazba: "20261121T080000-000001" })).json()).toEqual({ smazano: 1, zbyva: 0 });
    expect((await smaz({ vazba: "20261121T080000-000001" })).status).toBe(404);
    expect(await p.sklad.klice("vazba/")).toEqual(["vazba/20261122T093000-000002.json"]);
    for (const spatne of [{}, { vazba: "../denik" }, { den: "dnes" }, null]) expect((await smaz(spatne)).status).toBe(400);

    expect(await (await smaz({ den: "2026-11-22" })).json()).toEqual({ smazano: 3, zbyva: 0 });
    expect(await p.sklad.klice("denik/")).toEqual([]);
    expect(await (await spravuj(zadost("/api/sprava?co=dny", undefined, SPRAVCE), p)).json()).toEqual({ dny: [] });
    // Zpětná vazba zůstala.
    expect(await p.sklad.klice("vazba/")).toHaveLength(1);
  });

  it("souhrn za období sečte dny; uzavřený den si uloží jako výtah a jeho dávky už znovu nečte", async () => {
    const p = server();
    let ted = "2026-11-20T10:00:00.000Z";
    p.ted = () => new Date(ted);
    const anna = hlavicka("a1a1a1a1a1a1a1a1", "1111111111111111");
    const bob = hlavicka("b2b2b2b2b2b2b2b2", "2222222222222222");
    const konec = (t: number, pruchod: boolean, sekund: number, cena = 0): UdalostDeniku => ({
      t,
      druh: "zkouska.konec",
      uroven: "1-02",
      data: { pruchod, sekund, pokus: null, cena, medaile: { pruchod, rozpocet: false, mistrovska: false } },
    });
    const posli = (d: DavkaDeniku): Promise<Response> => prijmiDenik(zadost("/api/denik", d), p);
    // 20. 11.: Anna dvakrát neuspěje a odejde. 21. 11.: vrátí se a projde napoprvé; Bob projde levněji.
    await posli(davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 1, druh: "uroven.otevrena", uroven: "1-02" }, konec(100, false, 100), konec(200, false, 200), { t: 300, druh: "uroven.opustena", uroven: "1-02", data: { sekund: 300 } }], 0, anna));
    ted = "2026-11-21T10:00:00.000Z";
    await posli(davka([{ t: 0, druh: "uroven.otevrena", uroven: "1-02" }, { t: 5, druh: "stavba.zmena", uroven: "1-02", data: { co: "prut", prvek: "drevo-lehke" } }, konec(60, true, 60, 30000)], 0, { ...anna, sezeni: "9999999999999999" }));
    await posli(davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 1, druh: "uroven.otevrena", uroven: "1-02" }, konec(90, true, 90, 26000)], 0, bob));
    ted = "2026-11-22T20:00:00.000Z";
    await posli(davka([{ t: 0, druh: "sezeni.start", data: { navrat: true } }, { t: 1, druh: "uroven.otevrena", uroven: "1-03" }], 0, { ...bob, sezeni: "8888888888888888" }));

    const cteni: string[] = [];
    const puvodni = p.sklad.cti.bind(p.sklad);
    p.sklad.cti = (klic) => {
      cteni.push(klic);
      return puvodni(klic);
    };
    const souhrn = async (dotaz: string): Promise<OdpovedSouhrnu> => (await (await spravuj(zadost(`/api/sprava?co=souhrn&${dotaz}`, undefined, SPRAVCE), p)).json()) as OdpovedSouhrnu;

    const obdobi = await souhrn("od=2026-11-01&do=2026-11-30");
    expect(obdobi).toMatchObject({ dny: ["2026-11-20", "2026-11-21", "2026-11-22"], davek: 4, neuplne: false, souhrn: { hracu: 2, sezeni: 4, novych: 2 } });
    expect(obdobi.souhrn.urovne).toEqual([
      expect.objectContaining({
        uroven: "1-02",
        hracu: 2,
        otevreni: 3,
        zkousek: 4,
        pruchodu: 2,
        hracuSPruchodem: 2,
        // Anna prošla až třetí zkouškou (dvě z předchozího dne) po 300 + 60 s, Bob první po 90 s.
        zkousekDoPruchodu: 2,
        minutDoPruchodu: 3.8,
        nejlevnejsiPruchod: 26000,
        cenaPruchodu: 28000,
        prvky: { "drevo-lehke": 1 },
        selhani: { "bez porušení": 2 },
      }),
      expect.objectContaining({ uroven: "1-03", hracu: 1, zkousek: 0 }),
    ]);
    // Uzavřené dny mají uložený výtah; dnešní dávka přišla před okamžikem a ještě se neukládá.
    expect(await p.sklad.klice("vytah/")).toEqual(["vytah/2026-11-20.json", "vytah/2026-11-21.json"]);

    cteni.length = 0;
    expect(await souhrn("od=2026-11-01&do=2026-11-30")).toEqual(obdobi);
    const dnesni = `denik/2026-11-22/${Date.parse(ted)}-b2b2b2b2b2b2b2b2-1795000000000-8888888888888888-00000-000004.json`;
    expect(cteni.filter((k) => k.startsWith("denik/"))).toEqual([dnesni]);
    // O dvě minuty později je dnešní dávka usazená: uloží se do výtahu dne a příště se už nečte.
    ted = "2026-11-22T20:02:00.000Z";
    expect(await souhrn("od=2026-11-01&do=2026-11-30")).toEqual(obdobi);
    expect(await p.sklad.cti("vytah/2026-11-22.json")).toMatchObject({ zpracovano: 1, posledni: dnesni, hotovo: false, otevreny: true });
    cteni.length = 0;
    expect(await souhrn("od=2026-11-01&do=2026-11-30")).toEqual(obdobi);
    expect(cteni.filter((k) => k.startsWith("denik/"))).toEqual([]);
    // Jeden den z období a den bez deníku.
    expect((await souhrn("den=2026-11-21")).souhrn).toMatchObject({ hracu: 2, sezeni: 2, novych: 1 });
    expect(await souhrn("den=2026-11-19")).toMatchObject({ dny: [], davek: 0, neuplne: false, souhrn: { hracu: 0, urovne: [] } });

    // Těsně po půlnoci se včerejšek ještě neuzavírá (opožděná dávka), o chvíli později ano:
    // pak se spočítá ještě jednou od začátku a výtah je konečný.
    ted = "2026-11-23T00:05:00.000Z";
    await souhrn("den=2026-11-22");
    expect(await p.sklad.cti("vytah/2026-11-22.json")).toMatchObject({ hotovo: false, otevreny: true });
    ted = "2026-11-23T00:15:00.000Z";
    cteni.length = 0;
    await souhrn("den=2026-11-22");
    expect(cteni.filter((k) => k.startsWith("denik/"))).toEqual([dnesni]);
    expect(await p.sklad.cti("vytah/2026-11-22.json")).toMatchObject({ zpracovano: 1, hotovo: true, otevreny: false });
    expect(await p.sklad.klice("vytah/")).toHaveLength(3);
    // Smazání dne zahodí i jeho výtah.
    await spravuj(zadost("/api/sprava?co=smazat", { den: "2026-11-21" }, SPRAVCE), p);
    expect(await p.sklad.klice("vytah/")).toEqual(["vytah/2026-11-20.json", "vytah/2026-11-22.json"]);
    expect((await souhrn("od=2026-11-01&do=2026-11-30")).souhrn).toMatchObject({ hracu: 2, sezeni: 2 });
  });

  it("den s víc dávkami, než se stihne na jednu žádost, se dopočítá opakováním a vyjde stejně jako najednou", async () => {
    const p = server();
    let ted = "2026-11-20T10:00:00.000Z";
    p.ted = () => new Date(ted);
    const vsechny: DavkaDeniku[] = [];
    const hracu = 40;
    const davekHrace = Math.ceil((NEJVIC_DAVEK_NAJEDNOU + 100) / hracu);
    for (let h = 0; h < hracu; h++) {
      const hl = hlavicka(`${h.toString(16).padStart(4, "0")}aaaaaaaaaaaa`, `${h.toString(16).padStart(4, "0")}bbbbbbbbbbbb`);
      for (let d = 0; d < davekHrace; d++) {
        // Každý hráč projde úroveň až poslední dávkou: průchod leží za hranicí první žádosti.
        const pruchod = d === davekHrace - 1;
        const udalosti: UdalostDeniku[] = [
          ...(d === 0 ? [{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 1, druh: "uroven.otevrena", uroven: "3-01" }] : []),
          { t: 10 * d + 5, druh: "stavba.zmena", uroven: "3-01", data: { co: "prut", prvek: h % 2 ? "ocel-lehka" : "ocel-tezka" } },
          { t: 10 * d + 9, druh: "zkouska.konec", uroven: "3-01", data: { pruchod, sekund: 10 * d + 9, pokus: null, cena: 100000 + h, medaile: { pruchod, rozpocet: false, mistrovska: false } } },
        ];
        vsechny.push(davka(udalosti, d, hl));
      }
    }
    // Dávky přicházely po kolech: nejdřív první dávka každého hráče, pak druhá…
    const rano = Date.parse(ted);
    for (const [i, d] of vsechny.entries()) {
      const prijato = rano + 1000 * d.poradi + (i % hracu);
      const jmeno = `${prijato}-${d.hlavicka.hrac}-${d.hlavicka.zacatek}-${d.hlavicka.sezeni}-${String(d.poradi).padStart(5, "0")}-000000`;
      await p.sklad.zapis(`denik/2026-11-20/${jmeno}.json`, { prijato: new Date(prijato).toISOString(), prostredi: "test", ...d });
    }
    ted = "2026-11-22T20:00:00.000Z";
    await prijmiDenik(zadost("/api/denik", davka([{ t: 0, druh: "sezeni.start", data: { navrat: true } }], 0, hlavicka("ffffffffffffffff", "eeeeeeeeeeeeeeee"))), p);

    const souhrn = async (): Promise<OdpovedSouhrnu> => (await (await spravuj(zadost("/api/sprava?co=souhrn&od=2026-11-20&do=2026-11-22", undefined, SPRAVCE), p)).json()) as OdpovedSouhrnu;
    const prvni = await souhrn();
    expect(prvni).toMatchObject({ davek: NEJVIC_DAVEK_NAJEDNOU, neuplne: true, nedokonceno: ["2026-11-20", "2026-11-22"] });
    expect(prvni.souhrn.urovne[0]!.hracuSPruchodem).toBeLessThan(hracu);
    const druhy = await souhrn();
    expect(druhy).toMatchObject({ davek: vsechny.length + 1, neuplne: false, nedokonceno: [] });
    const najednou = souhrnDeniku([...vsechny, davka([{ t: 0, druh: "sezeni.start", data: { navrat: true } }], 0, hlavicka("ffffffffffffffff", "eeeeeeeeeeeeeeee"))]);
    expect(druhy.souhrn).toEqual(najednou);
    expect(najednou.urovne[0]).toMatchObject({ hracu, hracuSPruchodem: hracu, zkousekDoPruchodu: davekHrace, nejlevnejsiPruchod: 100000, prvky: { "ocel-lehka": (hracu / 2) * davekHrace, "ocel-tezka": (hracu / 2) * davekHrace } });
  });
});

describe("server: souhrn dneška", () => {
  const dnes = "2026-11-22";
  const konec = (t: number, pruchod: boolean): UdalostDeniku => ({ t, druh: "zkouska.konec", uroven: "3-01", data: { pruchod, sekund: t, pokus: null, cena: 90000, medaile: { pruchod, rozpocet: false, mistrovska: false } } });

  it("den, který ještě běží, se dopočítá celý, i když má víc dávek, než se stihne na jednu žádost; nové dávky se jen přičtou", async () => {
    const p = server();
    let ted = Date.parse(`${dnes}T08:00:00.000Z`);
    p.ted = () => new Date(ted);
    const hracu = 30;
    const kol = Math.ceil((2 * NEJVIC_DAVEK_NAJEDNOU + 50) / hracu);
    const hl = (h: number): HlavickaDeniku => hlavicka(`${h.toString(16).padStart(4, "0")}aaaaaaaaaaaa`, `${h.toString(16).padStart(4, "0")}bbbbbbbbbbbb`);
    const vsechny: DavkaDeniku[] = [];
    // Hráči posílají dávky na střídačku celé dopoledne; každý projde až poslední dávkou.
    for (let kolo = 0; kolo < kol; kolo++) {
      for (let h = 0; h < hracu; h++) {
        const d = davka([...(kolo === 0 ? [{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 1, druh: "uroven.otevrena", uroven: "3-01" }] : []), konec(10 * kolo + 9, kolo === kol - 1)], kolo, hl(h));
        vsechny.push(d);
        ted += 1000;
        expect((await prijmiDenik(zadost("/api/denik", d), p)).status).toBe(204);
      }
    }
    ted += 120_000;
    const cteni: string[] = [];
    const puvodni = p.sklad.cti.bind(p.sklad);
    p.sklad.cti = (klic) => {
      if (klic.startsWith("denik/")) cteni.push(klic);
      return puvodni(klic);
    };
    const souhrn = async (): Promise<OdpovedSouhrnu> => (await (await spravuj(zadost(`/api/sprava?co=souhrn&den=${dnes}`, undefined, SPRAVCE), p)).json()) as OdpovedSouhrnu;

    const prvni = await souhrn();
    expect(prvni).toMatchObject({ davek: NEJVIC_DAVEK_NAJEDNOU, neuplne: true, nedokonceno: [dnes] });
    expect(prvni.souhrn.urovne[0]).toMatchObject({ hracu, hracuSPruchodem: 0 });
    expect(await souhrn()).toMatchObject({ davek: 2 * NEJVIC_DAVEK_NAJEDNOU, neuplne: true });
    const treti = await souhrn();
    expect(treti).toMatchObject({ davek: vsechny.length, neuplne: false, nedokonceno: [] });
    expect(treti.souhrn).toEqual(souhrnDeniku(vsechny));
    expect(treti.souhrn.urovne[0]).toMatchObject({ hracu, zkousek: vsechny.length, hracuSPruchodem: hracu, zkousekDoPruchodu: kol });
    // Každá dávka se četla právě jednou.
    expect(cteni).toHaveLength(vsechny.length);
    expect(new Set(cteni).size).toBe(vsechny.length);

    // Přijde další hráč: čte se jen jeho dávka. Dokud je čerstvá, čte se při každé žádosti
    // znovu (do uloženého výtahu se počítají až dávky, které se stihly usadit).
    const novy = davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 1, druh: "uroven.otevrena", uroven: "3-01" }], 0, hl(999));
    await prijmiDenik(zadost("/api/denik", novy), p);
    cteni.length = 0;
    expect((await souhrn()).souhrn).toEqual(souhrnDeniku([...vsechny, novy]));
    expect((await souhrn()).souhrn.urovne[0]).toMatchObject({ hracu: hracu + 1 });
    expect(cteni).toHaveLength(2);
    expect(new Set(cteni).size).toBe(1);
    ted += 120_000;
    cteni.length = 0;
    await souhrn();
    expect((await souhrn()).davek).toBe(vsechny.length + 1);
    expect(cteni).toHaveLength(1);
  });

  it("dávka, která se uložila opožděně před už započtené, se započte nejpozději po uzávěrce dne", async () => {
    const p = server();
    let ted = Date.parse(`${dnes}T12:00:00.000Z`);
    p.ted = () => new Date(ted);
    const anna = hlavicka("a1a1a1a1a1a1a1a1", "1111111111111111");
    const bob = hlavicka("b2b2b2b2b2b2b2b2", "2222222222222222");
    await prijmiDenik(zadost("/api/denik", davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 1, druh: "uroven.otevrena", uroven: "3-01" }], 0, anna)), p);
    ted += 120_000;
    const souhrn = async (): Promise<OdpovedSouhrnu> => (await (await spravuj(zadost(`/api/sprava?co=souhrn&den=${dnes}`, undefined, SPRAVCE), p)).json()) as OdpovedSouhrnu;
    expect((await souhrn()).souhrn).toMatchObject({ hracu: 1 });
    // Bobova dávka dostala čas příjmu dřívější než Annina, ale do úložiště dorazila až teď.
    const drive = Date.parse(`${dnes}T11:59:59.000Z`);
    const opozdena = davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 1, druh: "uroven.otevrena", uroven: "3-01" }, konec(50, true)], 0, bob);
    await p.sklad.zapis(`denik/${dnes}/${drive}-${bob.hrac}-${bob.zacatek}-${bob.sezeni}-00000-00ffff.json`, { prijato: new Date(drive).toISOString(), prostredi: "test", ...opozdena });
    expect((await souhrn()).souhrn).toMatchObject({ hracu: 1 });
    ted = Date.parse("2026-11-23T00:30:00.000Z");
    const poUzaverce = await souhrn();
    expect(poUzaverce).toMatchObject({ davek: 2, neuplne: false, souhrn: { hracu: 2 } });
    expect(poUzaverce.souhrn.urovne[0]).toMatchObject({ hracu: 2, hracuSPruchodem: 1 });
  });

  it("dávky sezení, které se cestou předběhly, se čtou v pořadí hry; dávka přijatá dvakrát se počítá jednou", async () => {
    const p = server();
    let ted = Date.parse(`${dnes}T09:00:00.000Z`);
    p.ted = () => new Date(ted);
    const anna = hlavicka("a1a1a1a1a1a1a1a1", "1111111111111111");
    const prvni = davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 1, druh: "uroven.otevrena", uroven: "3-01" }, konec(100, false)], 0, anna);
    const druha = davka([konec(200, false), konec(300, true), { t: 400, druh: "uroven.opustena", uroven: "3-01", data: { sekund: 400 } }], 1, anna);
    // Druhá dávka (odchod ze stránky) dorazila dřív než první, která vázla na síti.
    await prijmiDenik(zadost("/api/denik", druha), p);
    ted += 3000;
    await prijmiDenik(zadost("/api/denik", prvni), p);
    // A první přišla ještě jednou: odpověď serveru se ke hře nedostala, tak ji poslala znovu.
    ted += 20_000;
    await prijmiDenik(zadost("/api/denik", prvni), p);
    expect(await p.sklad.klice(`denik/${dnes}/`)).toHaveLength(3);
    ted += 300_000;
    const odpoved = (await (await spravuj(zadost(`/api/sprava?co=souhrn&den=${dnes}`, undefined, SPRAVCE), p)).json()) as OdpovedSouhrnu;
    expect(odpoved.souhrn).toMatchObject({ hracu: 1, sezeni: 1, novych: 1, udalosti: 6 });
    // Průchod přišel třetí zkouškou po 300 s; opuštění úrovně je až po něm.
    expect(odpoved.souhrn.urovne[0]).toMatchObject({ otevreni: 1, zkousek: 3, pruchodu: 1, zkousekDoPruchodu: 3, minutDoPruchodu: 5 });
    // Stránka správce ukáže sezení ve stejném pořadí.
    const sezeni = (await (await spravuj(zadost(`/api/sprava?co=sezeni&den=${dnes}&hrac=${anna.hrac}&slozka=${anna.zacatek}-${anna.sezeni}`, undefined, SPRAVCE), p)).json()) as { udalosti: UdalostDeniku[] };
    expect(sezeni.udalosti.slice(0, 3).map((u) => u.druh)).toEqual(["sezeni.start", "uroven.otevrena", "zkouska.konec"]);
  });

  it("záznamy uložené starším tvarem klíče souhrn ani seznam sezení nepočítají a nezdržují; smazání dne je odstraní", async () => {
    const p = server();
    let ted = Date.parse(`${dnes}T09:00:00.000Z`);
    p.ted = () => new Date(ted);
    const anna = hlavicka("a1a1a1a1a1a1a1a1", "1111111111111111");
    const stara = davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }], 0, hlavicka("f0f0f0f0f0f0f0f0", "2222222222222222"));
    for (let i = 0; i < 5; i++) await p.sklad.zapis(`denik/${dnes}/f0f0f0f0f0f0f0f0/1795000000000-2222222222222222/0000${i}-00000${i}.json`, { prijato: new Date(ted).toISOString(), prostredi: "test", ...stara });
    await prijmiDenik(zadost("/api/denik", davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }], 0, anna)), p);
    ted += 300_000;
    const cti = async <T>(dotaz: string): Promise<T> => (await (await spravuj(zadost(`/api/sprava?${dotaz}`, undefined, SPRAVCE), p)).json()) as T;
    expect(await cti<OdpovedSouhrnu>(`co=souhrn&den=${dnes}`)).toMatchObject({ davek: 1, neuplne: false, souhrn: { hracu: 1 } });
    expect((await cti<{ sezeni: SezeniDne[] }>(`co=den&den=${dnes}`)).sezeni.map((s) => s.hrac)).toEqual([anna.hrac]);
    expect(await cti(`co=export&den=${dnes}`)).toMatchObject({ celkem: 1, davky: { length: 1 } });
    expect(await (await spravuj(zadost("/api/sprava?co=smazat", { den: dnes }, SPRAVCE), p)).json()).toEqual({ smazano: 6, zbyva: 0 });
    expect(await p.sklad.klice("denik/")).toEqual([]);
  });

  it("vypnutý záznam se počítá podle toho, co hráč udělal naposled, i přes hranici dnů", async () => {
    const p = server();
    let ted = "2026-11-20T10:00:00.000Z";
    p.ted = () => new Date(ted);
    const anna = hlavicka("a1a1a1a1a1a1a1a1", "1111111111111111");
    const bob = hlavicka("b2b2b2b2b2b2b2b2", "2222222222222222");
    const posli = (d: DavkaDeniku): Promise<Response> => prijmiDenik(zadost("/api/denik", d), p);
    await posli(davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 5, druh: "denik.vypnut" }], 0, anna));
    await posli(davka([{ t: 0, druh: "sezeni.start", data: { navrat: false } }, { t: 5, druh: "denik.vypnut" }], 0, bob));
    ted = "2026-11-21T10:00:00.000Z";
    await posli(davka([{ t: 0, druh: "denik.zapnut" }, { t: 1, druh: "uroven.otevrena", uroven: "1-01" }], 0, { ...anna, sezeni: "3333333333333333" }));
    ted = "2026-11-22T10:00:00.000Z";
    const souhrn = async (dotaz: string): Promise<OdpovedSouhrnu> => (await (await spravuj(zadost(`/api/sprava?co=souhrn&${dotaz}`, undefined, SPRAVCE), p)).json()) as OdpovedSouhrnu;
    expect((await souhrn("den=2026-11-20")).souhrn).toMatchObject({ hracu: 2, vypnuli: 2 });
    expect((await souhrn("den=2026-11-21")).souhrn).toMatchObject({ hracu: 1, vypnuli: 0 });
    expect((await souhrn("od=2026-11-20&do=2026-11-22")).souhrn).toMatchObject({ hracu: 2, vypnuli: 1 });
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
      davka([konec(900, false, 200, { prvni: { prvek: "ocel-lehka", zpusob: "vzper" } }), konec(1200, true, 320, { cena: 52000, medaile: { pruchod: true, rozpocet: true, mistrovska: false } })], 1, anna),
      davka([u(0, "sezeni.start", undefined, { navrat: false }), u(5, "uroven.otevrena", "2-03"), konec(600, false, 100, { prvni: { prvek: "ocel-lehka", zpusob: "vzper" } }), u(650, "chyba", undefined, { zprava: "TypeError: x is undefined" })], 0, anna),
      // Bob: pokus s brnknutím se nepočítá, pak neúspěch bez porušení (kmitání), odešel, vrátil se a prošel.
      davka([
        u(0, "sezeni.start", undefined, { navrat: true }),
        u(1, "uroven.otevrena", "2-03"),
        u(50, "zkouska.konec", "2-03", { pruchod: false, pokus: "brnknuti", sekund: 30 }),
        konec(100, false, 60, { prvni: null }),
        u(120, "uroven.opustena", "2-03", { sekund: 240 }),
        u(200, "uroven.otevrena", "2-03"),
        konec(300, true, 120, { cena: 61000 }),
        konec(305, true, 125, { cena: 48000 }),
        u(310, "vazba.odeslana", "2-03", { id: "x" }),
        u(320, "denik.vypnut", undefined),
      ], 0, bob),
      // Cyril úroveň jen otevřel.
      davka([u(0, "sezeni.start", undefined, { navrat: false }), u(3, "uroven.otevrena", "2-03"), u(9, "uroven.otevrena", "1-01"), u(9, "chyba", undefined, { zprava: "TypeError: x is undefined" })], 0, cyril),
    ]);
    expect(souhrn).toMatchObject({ hracu: 3, sezeni: 3, novych: 2, dotykovych: 1, chyb: 2, vazeb: 1, vypnuli: 1, chyby: [{ zprava: "TypeError: x is undefined", pocet: 2 }] });
    expect(souhrn.udalosti).toBe(20);
    expect(souhrn.urovne.map((x) => x.uroven)).toEqual(["1-01", "2-03"]);
    expect(souhrn.urovne[1]).toEqual({
      uroven: "2-03",
      hracu: 3,
      otevreni: 4,
      zkousek: 6,
      pruchodu: 3,
      hracuSPruchodem: 2,
      hracuBezZkousky: 1,
      // Anna prošla na třetí zkoušku po 320 s, Bob na druhou po 240 + 120 s.
      zkousekDoPruchodu: 2.5,
      minutDoPruchodu: 5.7,
      medaile: { pruchod: 2, rozpocet: 1, mistrovska: 0 },
      // Bobův nejlevnější průchod je 48 000, Annin 52 000.
      nejlevnejsiPruchod: 48000,
      cenaPruchodu: 50000,
      prvky: {},
      selhani: { "ocel-lehka/vzper": 2, "bez porušení": 1 },
    });
    expect(souhrn.urovne[0]).toMatchObject({ uroven: "1-01", hracu: 1, zkousek: 0, hracuBezZkousky: 1, zkousekDoPruchodu: null, minutDoPruchodu: null });
    expect(souhrnDeniku([])).toMatchObject({ hracu: 0, sezeni: 0, urovne: [], chyby: [] });
  });

  it("výtahy jdou slučovat: deník rozdělený v kterémkoli místě dá stejný souhrn jako celý", () => {
    const davky: DavkaDeniku[] = [];
    for (const [i, hrac] of ["a1a1a1a1a1a1a1a1", "b2b2b2b2b2b2b2b2", "c3c3c3c3c3c3c3c3"].entries()) {
      for (const [j, sezeni] of ["1111111111111111", "2222222222222222"].entries()) {
        for (let poradi = 0; poradi < 3; poradi++) {
          const n = i * 6 + j * 3 + poradi;
          davky.push(
            davka(
              [
                ...(poradi === 0 ? [u(0, "sezeni.start", undefined, { navrat: j > 0 }), u(1, "uroven.otevrena", "2-03")] : []),
                u(10 + n, "stavba.zmena", "2-03", { co: "prut", prvek: n % 3 ? "ocel-lehka" : "lano" }),
                u(11 + n, "stavba.zmena", "2-03", { co: "smazani" }),
                // Projde se vždy až ve druhém sezení, u každého hráče jinou dávkou.
                konec(20 + n, j === 1 && poradi >= i, 30 * (poradi + 1), { cena: 90000 - 1000 * n, ...(n % 2 ? { prvni: { prvek: "lano", zpusob: "tah" } } : {}) }),
                ...(poradi === 2 ? [u(99, "uroven.opustena", "2-03", { sekund: 100 }), u(100, "chyba", undefined, { zprava: `chyba ${i}` })] : []),
              ],
              poradi,
              hlavicka(hrac, sezeni, i === 2),
            ),
          );
        }
      }
    }
    const cely = souhrnDeniku(davky);
    expect(cely.urovne[0]).toMatchObject({ hracu: 3, hracuSPruchodem: 3, zkousek: 18, pruchodu: 6, prvky: { "ocel-lehka": 12, lano: 6 } });
    // Dávky jsou v pořadí klíčů úložiště (hráč, sezení, pořadí); dělí se mezi dvěma sousedními.
    for (let rez = 0; rez <= davky.length; rez++) {
      const slouceny = souhrnZVytahu(slucVytahy([vytahDeniku(davky.slice(0, rez)), vytahDeniku(davky.slice(rez))]));
      expect(slouceny, `řez před dávkou ${rez}`).toEqual(cely);
    }
    // Výtah přežije uložení: po cestě přes JSON dá stejný souhrn.
    expect(souhrnZVytahu(JSON.parse(JSON.stringify(vytahDeniku(davky))) as ReturnType<typeof vytahDeniku>)).toEqual(cely);
  });

  it("sezení téhož hráče řadí podle času, ne podle čísla sezení", () => {
    // Ráno pět neúspěchů v sezení, jehož číslo je v abecedě až druhé; večer průchod napoprvé.
    const rano = hlavicka("a1a1a1a1a1a1a1a1", "ffffffffffffffff", false, ZACATEK);
    const vecer = hlavicka("a1a1a1a1a1a1a1a1", "0000000000000000", false, ZACATEK + 10 * 3_600_000);
    const souhrn = souhrnDeniku([
      davka([u(1, "uroven.otevrena", "2-03"), konec(600, true, 60)], 0, vecer),
      davka([u(1, "uroven.otevrena", "2-03"), ...[1, 2, 3, 4, 5].map((i) => konec(100 * i, false, 100 * i)), u(700, "uroven.opustena", "2-03", { sekund: 600 })], 0, rano),
    ]);
    expect(souhrn.urovne[0]).toMatchObject({ zkousek: 6, pruchodu: 1, zkousekDoPruchodu: 6, minutDoPruchodu: 11 });
  });

  it("vymyšleným hodnotám nevěří: neznámý prvek, nesmyslná cena a čas se nezapočítají", () => {
    const souhrn = souhrnDeniku([
      davka([
        u(1, "uroven.otevrena", "2-03"),
        u(2, "stavba.zmena", "2-03", { co: "prut", prvek: "zlato", dilu: 5 }),
        u(3, "stavba.zmena", "2-03", { co: "prut", prvek: "ocel-lehka", dilu: 100000 }),
        u(4, "uroven.opustena", "2-03", { sekund: -1e9 }),
        konec(5, false, 10, { prvni: { prvek: "x".repeat(200), zpusob: "kouzlo" } }),
        konec(6, true, -5e10, { cena: 0.001 }),
        konec(7, true, 30, { cena: 5e11 }),
        u(8, "chyba", undefined, { zprava: "y".repeat(250) }),
      ]),
    ]);
    expect(souhrn.urovne[0]).toMatchObject({
      prvky: { "ocel-lehka": 1 },
      selhani: { "?/?": 1 },
      nejlevnejsiPruchod: null,
      cenaPruchodu: null,
      minutDoPruchodu: 0,
    });
    expect(souhrn.chyby[0]!.zprava).toHaveLength(120);
  });

  it("cizí data se nepotkají s vestavěnými vlastnostmi objektů", () => {
    const souhrn = souhrnDeniku([
      davka([u(0, "uroven.otevrena", "constructor"), u(1, "chyba", undefined, { zprava: "__proto__" }), u(2, "chyba", undefined, { zprava: "toString" })], 0),
    ]);
    expect(souhrn.urovne).toEqual([expect.objectContaining({ uroven: "constructor", hracu: 1, prvky: {}, selhani: {} })]);
    expect(souhrn.chyby).toEqual([{ zprava: "__proto__", pocet: 1 }, { zprava: "toString", pocet: 1 }]);
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
        await sklad.smaz("denik/2026-11-23/cccccccc/dddddddd/00000.json");
        await sklad.smaz("denik/2026-11-23/neni.json");
        // (Místní server Netlify po smazání nechává prázdnou složku, proto se neptáme na složky.)
        expect(await sklad.klice("denik/2026-11-23/")).toEqual([]);
        expect(await sklad.cti("denik/2026-11-23/cccccccc/dddddddd/00000.json")).toBeNull();
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
