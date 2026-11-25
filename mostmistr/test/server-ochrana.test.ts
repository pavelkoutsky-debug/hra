// Ochrana serveru před zveřejněním (M17): adresa žádosti jen z hlavičky Netlify a po skupinách,
// otisk adresy se solí dne, stropy deníku, zpětné vazby a žebříčku na skupinu adres, výpadek
// úložiště při příjmu zprávy, heslo správce, maskování kontaktů v podkladech rozboru, filtr
// přezdívek, smazání dat hráče a úklid starých dat. Všechno bez prohlížeče a bez Netlify.
import { describe, expect, it } from "vitest";
import { VERZE_ZEBRICKU, type ZadostOZapis } from "../src/data/zebricek";
import { VERZE_DENIKU, type DavkaDeniku, type HlavickaDeniku } from "../src/denik/udalosti";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { adresaZadosti, klicPocitadla, otiskAdresy, skupinaAdresy } from "../src/server/adresa";
import {
  NEJVIC_DAVEK_NA_ADRESU,
  NEJVIC_VAZEB_DENNE,
  NEJVIC_VAZEB_NA_ADRESU,
  prijmiDenik,
  prijmiVazbu,
  type ProstrediServeru,
} from "../src/server/obsluha";
import { overovacKampane, type Overovac } from "../src/server/overeni";
import { jeNevhodnaPrezdivka } from "../src/server/prezdivky";
import { maskujKontakty, type PodkladyRozboru } from "../src/server/rozbor";
import { SkladVPameti, type SkladZaznamu } from "../src/server/sklad";
import { spravujVse } from "../src/server/sprava";
import { DNI_UCHOVANI_DENIKU, DNI_UCHOVANI_VAZEB, NEJVIC_UKLIDU, uklid } from "../src/server/uklid";
import { NEJVIC_OVERENI_DENNE, obsluzZebricek, poctyZebricku, type ZapisZebricku } from "../src/server/zebricek";

const WEB = "https://mostmistr.example";
const HESLO = "tajne-heslo-spravce-123";
const SPRAVCE = { authorization: `Bearer ${HESLO}` };
const ANALYTIK_HESLO = "heslo-jen-pro-denni-rozbor";
const DNES = "2026-11-24";

function server(volby: Partial<ProstrediServeru> = {}): ProstrediServeru {
  let cislo = 0;
  return {
    sklad: new SkladVPameti(),
    ted: () => new Date(`${DNES}T10:00:00.000Z`),
    nahoda: () => (++cislo).toString(16).padStart(6, "0"),
    prostredi: "test",
    hesloSpravce: HESLO,
    hesloRozboru: ANALYTIK_HESLO,
    ...volby,
  };
}

function zadost(cesta: string, telo?: unknown, hlavicky: Record<string, string> = {}): Request {
  return new Request(`${WEB}${cesta}`, {
    method: telo === undefined ? "GET" : "POST",
    headers: { ...(telo === undefined ? {} : { "content-type": "application/json", origin: WEB }), ...hlavicky },
    ...(telo === undefined ? {} : { body: JSON.stringify(telo) }),
  });
}

function hlavicka(hrac = "aaaaaaaaaaaaaaaa", sezeni = "bbbbbbbbbbbbbbbb"): HlavickaDeniku {
  return { verze: VERZE_DENIKU, hrac, sezeni, zacatek: 1_795_000_000_000, hra: "0.22.0", sestaveni: "abc1234", jazyk: "cs/cs-CZ", okno: [1280, 720], dotyk: false };
}

const davka = (poradi = 0, h = hlavicka()): DavkaDeniku => ({ hlavicka: h, poradi, udalosti: [{ t: 0, druh: "sezeni.start", data: { navrat: false } }] });
const vazba = (text = "Most mi spadl.", h = hlavicka()): Record<string, unknown> => ({ hlavicka: h, druh: "jine", text });

/** Úložiště nad pamětí, kterému jde podstrčit jiné chování jednotlivých operací. */
function obal(sklad: SkladVPameti, zmeny: Partial<SkladZaznamu>): SkladZaznamu {
  return {
    cti: (k) => sklad.cti(k),
    zapis: (k, h) => sklad.zapis(k, h),
    smaz: (k) => sklad.smaz(k),
    klice: (x) => sklad.klice(x),
    slozky: (x) => sklad.slozky(x),
    ctiSeZnackou: (k) => sklad.ctiSeZnackou(k),
    zapisPokud: (k, h, z) => sklad.zapisPokud(k, h, z),
    ...zmeny,
  };
}

const otiskStary = async (text: string): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, "0")).join("");

describe("adresa žádosti", () => {
  it("IPv4 je skupina sama, IPv6 jen předpona /64; nečitelná adresa je null", () => {
    expect(skupinaAdresy("203.0.113.7")).toBe("203.0.113.7");
    expect(skupinaAdresy(" 203.0.113.007 ")).toBe("203.0.113.7");
    expect(skupinaAdresy("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    // Jiná adresa téže domácí přípojky (stejná /64) je tatáž skupina, i zapsaná zkráceně.
    expect(skupinaAdresy("2001:0DB8:0001:0002::1")).toBe("2001:db8:1:2::/64");
    expect(skupinaAdresy("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(skupinaAdresy("[2001:db8:1:3::5]")).toBe("2001:db8:1:3::/64");
    expect(skupinaAdresy("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(skupinaAdresy("::ffff:192.0.2.1")).toBe("192.0.2.1");
    for (const spatna of [null, undefined, "", "neznamo", "256.1.1.1", "1.2.3", "1.2.3.4.5", "2001:db8::1::2", "1:2:3:4:5:6:7:8:9", "12345::1", "<script>"]) {
      expect(skupinaAdresy(spatna), String(spatna)).toBeNull();
    }
  });

  it("adresa se bere jen z hlavičky Netlify nebo z funkce prostředí, nikdy z x-forwarded-for", () => {
    const naNetlify = server();
    const s = (hlavicky: Record<string, string>): Request => new Request(`${WEB}/api/denik`, { headers: hlavicky });
    expect(adresaZadosti(s({ "x-nf-client-connection-ip": "198.51.100.9" }), naNetlify)).toBe("198.51.100.9");
    expect(adresaZadosti(s({ "x-forwarded-for": "198.51.100.9" }), naNetlify)).toBeNull();
    expect(adresaZadosti(s({ "x-nf-client-connection-ip": "nesmysl", "x-forwarded-for": "198.51.100.9" }), naNetlify)).toBeNull();
    // Místní server a testy dodají adresu funkcí; hlavičky pak nerozhodují.
    const mistni = server({ adresa: () => "2001:db8:aa:bb::7" });
    expect(adresaZadosti(s({ "x-nf-client-connection-ip": "198.51.100.9" }), mistni)).toBe("2001:db8:aa:bb::/64");
  });

  it("otisk adresy je HMAC se solí dne: sůl se založí jednou, jiný den je jiná a otisk nejde spočítat bez ní", async () => {
    const p = server();
    const otisk = await otiskAdresy(p, "203.0.113.7", DNES);
    expect(otisk).toMatch(/^[0-9a-f]{24}$/);
    expect(await otiskAdresy(p, "203.0.113.7", DNES)).toBe(otisk);
    expect(await otiskAdresy(p, "203.0.113.8", DNES)).not.toBe(otisk);
    // Dnešní otisk (SHA-256 z „den|IP“) by šel spočítat hrubou silou; nový bez soli ne.
    expect((await otiskStary(`${DNES}|203.0.113.7`)).slice(0, 24)).not.toBe(otisk);
    const sul = (await p.sklad.cti(`sul/${DNES}.json`)) as { sul: string };
    expect(sul.sul).toMatch(/^[0-9a-f]{64}$/);
    // Jiná instance funkce (prázdná paměť soli) nad stejným úložištěm počítá stejný otisk.
    expect(await otiskAdresy({ sklad: p.sklad, pametSoli: new Map() }, "203.0.113.7", DNES)).toBe(otisk);
    // Jiný den, jiná sůl.
    expect(await otiskAdresy(p, "203.0.113.7", "2026-11-25")).not.toBe(otisk);
    expect((await p.sklad.cti("sul/2026-11-25.json")) as { sul: string }).not.toEqual(sul);
    // Sůl se drží v paměti instance: další otisky téhož dne úložiště nečtou.
    let cteni = 0;
    const sklad = new SkladVPameti();
    const pocitajici = obal(sklad, { cti: (k) => (cteni++, sklad.cti(k)) });
    const pamet = new Map();
    await otiskAdresy({ sklad: pocitajici, pametSoli: pamet }, "203.0.113.7", DNES);
    const poPrvnim = cteni;
    for (let i = 0; i < 5; i++) await otiskAdresy({ sklad: pocitajici, pametSoli: pamet }, `203.0.113.${i}`, DNES);
    expect(cteni).toBe(poPrvnim);
  });

  it("když sůl dne ve stejnou chvíli založí jiná instance, platí ta její", async () => {
    const sklad = new SkladVPameti();
    const cizi = { sul: "ab".repeat(32) };
    // Mezi přečtením (nic tam není) a zápisem s podmínkou ji založí někdo jiný.
    const zavodici = obal(sklad, {
      zapisPokud: async (k, h, z) => {
        if (k.startsWith("sul/") && (await sklad.cti(k)) === null) await sklad.zapis(k, cizi);
        return sklad.zapisPokud(k, h, z);
      },
    });
    const otisk = await otiskAdresy({ sklad: zavodici, pametSoli: new Map() }, "203.0.113.7", DNES);
    expect(await sklad.cti(`sul/${DNES}.json`)).toEqual(cizi);
    expect(await otiskAdresy({ sklad, pametSoli: new Map() }, "203.0.113.7", DNES)).toBe(otisk);
  });
});

describe("strop deníku hraní", () => {
  it("skupina adres pošle za den nejvýš NEJVIC_DAVEK_NA_ADRESU dávek; nad stropem 429 a nic se neuloží", async () => {
    expect(NEJVIC_DAVEK_NA_ADRESU).toBe(5000);
    const p = server({ adresa: (z) => z.headers.get("x-adresa") });
    const z = (adresa: string): Request => zadost("/api/denik", davka(), { "x-adresa": adresa });
    // Počitadlo skupiny je skoro plné (tisíce žádostí by test zbytečně zdržely).
    await p.sklad.zapis(await klicPocitadla(p, "denik", "203.0.113.7", DNES), { pocet: NEJVIC_DAVEK_NA_ADRESU - 1 });
    expect((await prijmiDenik(z("203.0.113.7"), p)).status).toBe(204);
    const pres = await prijmiDenik(z("203.0.113.7"), p);
    expect(pres.status).toBe(429);
    expect((await p.sklad.klice("denik/")).length).toBe(1);
    // Jiná adresa z téže IPv6 /64 je tatáž skupina; jiná skupina počítá od nuly.
    await p.sklad.zapis(await klicPocitadla(p, "denik", "2001:db8:1:2::/64", DNES), { pocet: NEJVIC_DAVEK_NA_ADRESU });
    expect((await prijmiDenik(z("2001:db8:1:2::99"), p)).status).toBe(429);
    expect((await prijmiDenik(z("2001:db8:1:3::1"), p)).status).toBe(204);
    expect((await prijmiDenik(z("198.51.100.9"), p)).status).toBe(204);
    // Druhý den má skupina čistý štít.
    p.ted = () => new Date("2026-11-25T00:00:05.000Z");
    expect((await prijmiDenik(z("203.0.113.7"), p)).status).toBe(204);
    // Adresa se nikam neuložila.
    expect(JSON.stringify(await p.sklad.klice(""))).not.toContain("203.0.113.7");
  });

  it("žádosti bez adresy sdílejí jedno počitadlo se stejným stropem; deník funguje dál", async () => {
    const p = server();
    expect((await prijmiDenik(zadost("/api/denik", davka()), p)).status).toBe(204);
    expect(await p.sklad.cti(`adresa/denik/${DNES}/bez-adresy.json`)).toEqual({ pocet: 1 });
    await p.sklad.zapis(`adresa/denik/${DNES}/bez-adresy.json`, { pocet: NEJVIC_DAVEK_NA_ADRESU });
    expect((await prijmiDenik(zadost("/api/denik", davka(1)), p)).status).toBe(429);
    // S adresou (z hlavičky Netlify) se počítá zvlášť.
    expect((await prijmiDenik(zadost("/api/denik", davka(2), { "x-nf-client-connection-ip": "203.0.113.7" }), p)).status).toBe(204);
  });

  it("když se počitadlo pořád mění a zápis s podmínkou se nepovede, dávka se přijme", async () => {
    const sklad = new SkladVPameti();
    const p = server({ sklad: obal(sklad, { zapisPokud: (k, h, z) => (k.startsWith("adresa/") ? Promise.resolve(false) : sklad.zapisPokud(k, h, z)) }), adresa: () => "203.0.113.7" });
    expect((await prijmiDenik(zadost("/api/denik", davka()), p)).status).toBe(204);
    expect(await sklad.klice("denik/")).toHaveLength(1);
  });

  it("špatná dávka se do stropu nepočítá", async () => {
    const p = server({ adresa: () => "203.0.113.7" });
    expect((await prijmiDenik(zadost("/api/denik", { nesmysl: true }), p)).status).toBe(400);
    expect(await p.sklad.klice("adresa/")).toEqual([]);
  });
});

describe("strop zpětné vazby na adresu a výpadek úložiště", () => {
  it("jedna skupina adres pošle za den nejvýš NEJVIC_VAZEB_NA_ADRESU zpráv; ostatní to nezastaví", async () => {
    const p = server({ adresa: (z) => z.headers.get("x-adresa") });
    const posli = (adresa: string, text = "zpráva"): Promise<Response> => prijmiVazbu(zadost("/api/vazba", vazba(text), { "x-adresa": adresa }), p);
    for (let i = 0; i < NEJVIC_VAZEB_NA_ADRESU; i++) expect((await posli("203.0.113.7", `zpráva ${i}`)).status).toBe(201);
    const pres = await posli("203.0.113.7");
    expect(pres.status).toBe(429);
    expect(((await pres.json()) as { chyba: string }).chyba).toContain("připojení");
    expect(await p.sklad.klice("vazba/")).toHaveLength(NEJVIC_VAZEB_NA_ADRESU);
    // Poctivý hráč odjinud zprávu pošle.
    expect((await posli("198.51.100.9", "Poctivá zpráva.")).status).toBe(201);
  });

  it("bez poznané adresy platí jen společný strop (pojistka úložiště)", async () => {
    const p = server();
    for (let i = 0; i < NEJVIC_VAZEB_NA_ADRESU + 5; i++) expect((await prijmiVazbu(zadost("/api/vazba", vazba(`zpráva ${i}`)), p)).status).toBe(201);
    expect(await p.sklad.klice("adresa/")).toEqual([]);
    // Společný strop: zbytek dne naplněný napřímo, další zpráva neprojde.
    for (let i = NEJVIC_VAZEB_NA_ADRESU + 5; i < NEJVIC_VAZEB_DENNE; i++) await p.sklad.zapis(`vazba-seznam/20261124T100000-${String(i).padStart(6, "f")}.json`, {});
    expect((await prijmiVazbu(zadost("/api/vazba", vazba()), p)).status).toBe(429);
  });

  it("když úložiště při příjmu vypadne, nezůstane zpráva bez položky seznamu a hra dostane 503", async () => {
    for (const vypadne of ["vazba/", "vazba-seznam/"]) {
      const sklad = new SkladVPameti();
      const p = server({
        sklad: obal(sklad, { zapis: (k, h) => (k.startsWith(vypadne) ? Promise.reject(new Error("úložiště neodpovídá")) : sklad.zapis(k, h)) }),
      });
      const odpoved = await prijmiVazbu(zadost("/api/vazba", vazba()), p);
      expect(odpoved.status, vypadne).toBe(503);
      expect(((await odpoved.json()) as { chyba: string }).chyba).toMatch(/nepodařilo uložit/);
      expect(await sklad.klice("vazba/"), vypadne).toEqual([]);
      expect(await sklad.klice("vazba-seznam/"), vypadne).toEqual([]);
    }
    // Úložiště zase běží: zpráva i položka seznamu jsou obě, a seznam správy ji ukáže.
    const p = server();
    expect((await prijmiVazbu(zadost("/api/vazba", vazba()), p)).status).toBe(201);
    const seznam = (await (await spravujVse(zadost("/api/sprava?co=vazby", undefined, SPRAVCE), p)).json()) as { vazby: { id: string }[] };
    expect(seznam.vazby.map((v) => `vazba/${v.id}.json`)).toEqual(await p.sklad.klice("vazba/"));
  });
});

describe("žebříček bez adresy a s nevhodnou přezdívkou", () => {
  const over = overovacKampane();
  let zkousek = 0;
  /** Ověřovač bez fyziky, který počítá zkoušky. */
  const levny: Overovac = {
    ...over,
    priprav: (_u, kod) => ({ stav: "pripraven", kanon: kod }),
    bezna: () => (zkousek++, { plati: true, otisk: "0".repeat(16), cena: 1000, hmotnost: 500 }),
    zlom: () => ({ otisk: "1".repeat(16), naKorunu: 2 }),
  };
  const zapis = (zmeny: Partial<ZadostOZapis> = {}): ZadostOZapis => ({
    uroven: "1-01",
    kod: "kod-1",
    zkouska: "bezna",
    otisk: "0".repeat(16),
    verze: VERZE_FYZIKY,
    hrac: "a".repeat(32),
    jmeno: "Anna",
    ...zmeny,
  });

  it("bez adresy (i s podvrženou x-forwarded-for) server zápis odmítne kódem bez-adresy a zkoušku nepustí", async () => {
    expect(NEJVIC_OVERENI_DENNE).toBe(1000);
    const p = server();
    zkousek = 0;
    const pokusy: Record<string, string>[] = [{}, { "x-forwarded-for": "198.51.100.9" }, { "x-nf-client-connection-ip": "neznamo" }];
    for (const hlavicky of pokusy) {
      const odpoved = await obsluzZebricek(zadost("/api/zebricek", zapis(), hlavicky), p, levny);
      expect(odpoved.status).toBe(503);
      expect(((await odpoved.json()) as { kod: string }).kod).toBe("bez-adresy");
    }
    expect(zkousek).toBe(0);
    expect(await p.sklad.klice("overeno/")).toEqual([]);
    // Do podkladů rozboru se počítá jako ostatní důvody.
    expect((await poctyZebricku(p.sklad, DNES)).odmitnuto).toEqual({ "bez-adresy": 3 });
    // S hlavičkou Netlify zápis projde.
    expect((await obsluzZebricek(zadost("/api/zebricek", zapis(), { "x-nf-client-connection-ip": "203.0.113.7" }), p, levny)).status).toBe(200);
    expect(zkousek).toBe(1);
  });

  it("strop zkoušek platí pro celou IPv6 /64, ne pro jednotlivou adresu", async () => {
    const p = server({ adresa: (z) => z.headers.get("x-adresa") });
    for (let i = 0; i < 60; i++) {
      expect((await obsluzZebricek(zadost("/api/zebricek", zapis({ kod: `kod-${i}` }), { "x-adresa": `2001:db8:5:6::${i.toString(16)}` }), p, levny)).status).toBe(200);
    }
    const pres = await obsluzZebricek(zadost("/api/zebricek", zapis({ kod: "kod-999" }), { "x-adresa": "2001:db8:5:6:ffff::1" }), p, levny);
    expect(((await pres.json()) as { kod: string }).kod).toBe("adresa");
    expect((await obsluzZebricek(zadost("/api/zebricek", zapis({ kod: "kod-1000" }), { "x-adresa": "2001:db8:5:7::1" }), p, levny)).status).toBe(200);
  });

  it("nevhodnou přezdívku server odmítne kódem prezdivka dřív, než pustí zkoušku", async () => {
    const p = server({ adresa: () => "203.0.113.7" });
    zkousek = 0;
    for (const jmeno of ["Kokot", "k0k0t", "F.u.c.k", "Píča", "nazi 88"]) {
      const odpoved = await obsluzZebricek(zadost("/api/zebricek", zapis({ jmeno })), p, levny);
      expect(odpoved.status, jmeno).toBe(422);
      expect(((await odpoved.json()) as { kod: string }).kod).toBe("prezdivka");
    }
    expect(zkousek).toBe(0);
    expect(await p.sklad.klice("zebricek/")).toEqual([]);
    expect((await obsluzZebricek(zadost("/api/zebricek", zapis({ jmeno: "Picasso" })), p, levny)).status).toBe(200);
  });
});

describe("filtr přezdívek", () => {
  it("chytí hrubé a nenávistné výrazy i s diakritikou, číslicemi a oddělovači", () => {
    for (const jmeno of ["kokot", "KOKOT", "k.o.k.o.t", "k0k0t", "Zkurvysyn", "píčus", "čurák", "zmrd", "DEBIL", "kretén", "fuck", "FuCk3r", "5h1t", "shit", "bitch", "n1gg3r", "Cunt", "hitler", "sieg heil", "negr", "nazi", "s.l.u.t"]) {
      expect(jeNevhodnaPrezdivka(jmeno), jmeno).toBe(true);
    }
  });

  it("nechytá běžná slova a jména", () => {
    for (const jmeno of ["Anna", "Picasso", "Scunthorpe", "Yoshitaka", "svinec", "negramotný", "Retardér", "Dick", "Hancock", "Mitsushita", "Nazir", "Nováková", "Most1", "Ája_22", "Kokos", "Petr Kurka", "Debora", "Pikachu", "Shiitake", "Slutet"]) {
      expect(jeNevhodnaPrezdivka(jmeno), jmeno).toBe(false);
    }
  });
});

describe("podklady rozboru maskují kontakty v textu zpráv", () => {
  it("e-maily a telefonní čísla nahradí značkou, ceny, data a verze nechá", () => {
    expect(maskujKontakty("piš mi na jan.novak@example.cz, tel 777 123 456")).toBe("piš mi na [e-mail], tel [telefon]");
    expect(maskujKontakty("Volej +420 777 123 456 nebo +420777123456 nebo 00420 603 123 456.")).toBe("Volej [telefon] nebo [telefon] nebo [telefon].");
    expect(maskujKontakty("777123456, 777-123-456, 777.123.456")).toBe("[telefon], [telefon], [telefon]");
    expect(maskujKontakty("UK: +44 20 7946 0958, US: +1 (555) 123-4567")).toBe("UK: [telefon], US: [telefon]");
    expect(maskujKontakty("Žofie.Dvořáková+hra@příklad.cz")).toBe("[e-mail]");
    const bezKontaktu = "Most za 1 234 567 Kč spadl 22. 11. 2026 ve hře 0.22.0 na úrovni 2-03 (2026-11-22), rozpočet 125 000 Kč.";
    expect(maskujKontakty(bezKontaktu)).toBe(bezKontaktu);
    // Dlouhá řada číslic se písmenem na konci se nezasekne.
    const zacatek = performance.now();
    expect(maskujKontakty(`${"1 ".repeat(2000)}x`)).toContain("x");
    expect(performance.now() - zacatek).toBeLessThan(1000);
  });

  it("v podkladech je text zprávy bez kontaktů; zpráva uložená pro správce zůstává celá", async () => {
    const p = server({ ted: () => new Date("2026-11-23T09:00:00.000Z") });
    const text = "Most kmitá. Napište mi na jan.novak@example.cz nebo na 777 123 456.";
    expect((await prijmiVazbu(zadost("/api/vazba", vazba(text)), p)).status).toBe(201);
    p.ted = () => new Date(`${DNES}T04:00:00.000Z`);
    const podklady = (await (await spravujVse(zadost("/api/sprava?co=podklady", undefined, { authorization: `Bearer ${ANALYTIK_HESLO}` }), p)).json()) as PodkladyRozboru;
    expect(podklady.vazby.map((v) => v.text)).toEqual(["Most kmitá. Napište mi na [e-mail] nebo na [telefon]."]);
    expect(JSON.stringify(podklady)).not.toContain("777 123 456");
    const [klic] = await p.sklad.klice("vazba/");
    expect(((await p.sklad.cti(klic!)) as { text: string }).text).toBe(text);
  });
});

describe("smazání dat hráče", () => {
  const ANNA = "aaaaaaaaaaaaaaaa";
  const BORIS = "cccccccccccccccc";
  const ANNA_V_ZEBRICKU = "a".repeat(32);

  async function naplnene(davekAnny: number): Promise<ProstrediServeru> {
    let cas = Date.parse("2026-11-20T08:00:00.000Z");
    const p = server({ ted: () => new Date(cas) });
    for (let i = 0; i < davekAnny; i++) {
      // Annino hraní rozložené do tří dnů, Borisovo mezi ním.
      cas = Date.parse("2026-11-20T08:00:00.000Z") + (i % 3) * 86_400_000 + i * 1000;
      await prijmiDenik(zadost("/api/denik", davka(i, hlavicka(ANNA))), p);
      if (i % 10 === 0) await prijmiDenik(zadost("/api/denik", davka(i, hlavicka(BORIS, "dddddddddddddddd"))), p);
    }
    cas = Date.parse("2026-11-22T12:00:00.000Z");
    await prijmiVazbu(zadost("/api/vazba", vazba("Anna píše, kontakt anna@example.cz", hlavicka(ANNA))), p);
    await prijmiVazbu(zadost("/api/vazba", vazba("Boris píše", hlavicka(BORIS, "dddddddddddddddd"))), p);
    cas = Date.parse("2026-11-23T12:00:00.000Z");
    await prijmiVazbu(zadost("/api/vazba", vazba("Anna znovu", hlavicka(ANNA))), p);
    // Žebříčky dvou verzí: Annin řádek (číslo hráče žebříčku i číslo deníku) a Borisův.
    const radek = (hrac: string, hodnota: number): ZapisZebricku => ({ hrac, jmeno: "X", hodnota, cas: 1, most: "0".repeat(32), tvar: `t-${hrac}` });
    for (const verze of [`v${VERZE_FYZIKY}.${VERZE_ZEBRICKU}`, `v${VERZE_FYZIKY - 1}.${VERZE_ZEBRICKU}`]) {
      await p.sklad.zapis(`zebricek/${verze}/1-01-abcd.json`, { cena: [radek(ANNA_V_ZEBRICKU, 500), radek("b".repeat(32), 600)], hmotnost: [radek(ANNA_V_ZEBRICKU, 50)], zlom: [] });
    }
    return p;
  }

  async function smazVse(p: ProstrediServeru, hrac: string): Promise<{ smazano: number; kol: number }> {
    let od: string | null = null;
    let smazano = 0;
    for (let kol = 1; kol < 100; kol++) {
      const odpoved = await spravujVse(zadost("/api/sprava?co=smazat-hrace", { hrac, od }, SPRAVCE), p);
      expect(odpoved.status).toBe(200);
      const telo = (await odpoved.json()) as { smazano: number; dalsi: string | null };
      smazano += telo.smazano;
      od = telo.dalsi;
      if (od === null) return { smazano, kol };
    }
    throw new Error("smazání neskončilo");
  }

  it("smaže hráčův deník ze všech dnů a jeho zprávy po částech; ostatní hráči zůstanou", async () => {
    const p = await naplnene(450);
    const borisovych = (await p.sklad.klice("denik/")).filter((k) => k.includes(BORIS)).length;
    expect(borisovych).toBe(45);
    const { smazano, kol } = await smazVse(p, ANNA);
    // 450 dávek a 2 zprávy; na jednu žádost nejvýš asi 400 smazání a čtení, takže víc kol.
    expect(smazano).toBe(452);
    expect(kol).toBeGreaterThan(1);
    const zbyle = await p.sklad.klice("denik/");
    expect(zbyle).toHaveLength(borisovych);
    expect(zbyle.every((k) => k.includes(BORIS))).toBe(true);
    const vazby = (await Promise.all((await p.sklad.klice("vazba/")).map((k) => p.sklad.cti(k)))) as { text: string }[];
    expect(vazby.map((v) => v.text)).toEqual(["Boris píše"]);
    expect(await p.sklad.klice("vazba-seznam/")).toHaveLength(1);
    // Číslo deníku v žebříčku není: řádky žebříčku zůstaly.
    expect(((await p.sklad.cti(`zebricek/v${VERZE_FYZIKY}.${VERZE_ZEBRICKU}/1-01-abcd.json`)) as { cena: unknown[] }).cena).toHaveLength(2);
  });

  it("smaže řádky hráče ve všech žebříčcích všech verzí", async () => {
    const p = await naplnene(3);
    const { smazano } = await smazVse(p, ANNA_V_ZEBRICKU);
    expect(smazano).toBe(4);
    for (const klic of await p.sklad.klice("zebricek/")) {
      const z = (await p.sklad.cti(klic)) as Record<string, ZapisZebricku[]>;
      expect(z.cena!.map((r) => r.hrac)).toEqual(["b".repeat(32)]);
      expect(z.hmotnost).toEqual([]);
    }
    expect(await p.sklad.klice("denik/")).toHaveLength(4);
  });

  it("deník přes mnoho dnů projde po částech a nic nevynechá", async () => {
    const p = server();
    for (let den = 0; den < 130; den++) {
      const cas = Date.parse("2026-01-01T10:00:00.000Z") + den * 86_400_000;
      await prijmiDenik(zadost("/api/denik", davka(0, hlavicka(ANNA))), { ...p, ted: () => new Date(cas) });
      await prijmiDenik(zadost("/api/denik", davka(0, hlavicka(BORIS))), { ...p, ted: () => new Date(cas + 1) });
    }
    const { smazano, kol } = await smazVse(p, ANNA);
    expect(smazano).toBe(130);
    expect(kol).toBeGreaterThan(2);
    expect((await p.sklad.klice("denik/")).every((k) => k.includes(BORIS))).toBe(true);
    expect(await p.sklad.klice("denik/")).toHaveLength(130);
  });

  it("smí jen správce; heslo pro rozbor ne; nesmyslné číslo nebo kurzor odmítne", async () => {
    const p = await naplnene(3);
    expect((await spravujVse(zadost("/api/sprava?co=smazat-hrace", { hrac: ANNA, od: null }, { authorization: `Bearer ${ANALYTIK_HESLO}` }), p)).status).toBe(403);
    expect((await spravujVse(zadost("/api/sprava?co=smazat-hrace", { hrac: ANNA, od: null }), p)).status).toBe(401);
    expect((await spravujVse(zadost("/api/sprava?co=smazat-hrace", { hrac: "x", od: null }, SPRAVCE), p)).status).toBe(400);
    expect((await spravujVse(zadost("/api/sprava?co=smazat-hrace", { hrac: ANNA, od: "rozbor/../x" }, SPRAVCE), p)).status).toBe(400);
    expect((await spravujVse(zadost("/api/sprava?co=smazat-hrace", { hrac: ANNA, od: 5 }, SPRAVCE), p)).status).toBe(400);
    expect(await p.sklad.klice("denik/")).toHaveLength(4);
  });
});

describe("úklid starých dat", () => {
  const denPred = (dni: number): string => new Date(Date.parse(`${DNES}T00:00:00Z`) - dni * 86_400_000).toISOString().slice(0, 10);

  async function naplnene(): Promise<SkladVPameti> {
    const sklad = new SkladVPameti();
    for (const dni of [0, 1, 2, 3, 10]) {
      await sklad.zapis(`sul/${denPred(dni)}.json`, { sul: "ab".repeat(32) });
      await sklad.zapis(`adresa/denik/${denPred(dni)}/0123456789abcdef01234567.json`, { pocet: 1 });
      await sklad.zapis(`adresa/vazba/${denPred(dni)}/bez-adresy.json`, { pocet: 1 });
      await sklad.zapis(`zebricek-adresa/${denPred(dni)}/0123456789abcdef01234567.json`, { overeni: 1 });
      // Značka zkoušky, kterou server nedopočítal (funkci ukončil hosting): zůstala by navždy.
      await sklad.zapis(`overuje/${denPred(dni)}/0123abcd.json`, { od: 1 });
    }
    for (const dni of [DNI_UCHOVANI_DENIKU + 1, DNI_UCHOVANI_DENIKU - 1]) {
      const den = denPred(dni);
      const cas = Date.parse(`${den}T10:00:00Z`);
      await sklad.zapis(`denik/${den}/${cas}-aaaaaaaaaaaaaaaa-1795000000000-bbbbbbbbbbbbbbbb-00000-000001.json`, {});
      await sklad.zapis(`vytah/${den}.json`, {});
    }
    for (const dni of [DNI_UCHOVANI_VAZEB + 1, DNI_UCHOVANI_VAZEB - 1]) {
      const id = `${denPred(dni).replace(/-/g, "")}T100000-000001`;
      await sklad.zapis(`vazba/${id}.json`, {});
      await sklad.zapis(`vazba-seznam/${id}.json`, {});
    }
    await sklad.zapis("rozbor/2024-01-01.json", {});
    return sklad;
  }

  it("smaže soli a počitadla starší než dva dny, deník po roce a zprávy po dvou letech; nic jiného", async () => {
    const sklad = await naplnene();
    expect(await uklid(sklad, new Date(`${DNES}T05:00:00Z`))).toEqual({ smazano: 5 * 2 + 2 + 2, hotovo: true });
    expect(await sklad.klice("sul/")).toEqual([0, 1, 2].map((d) => `sul/${denPred(d)}.json`).reverse());
    expect(await sklad.slozky("overuje/")).toEqual([2, 1, 0].map(denPred));
    expect(await sklad.slozky("adresa/denik/")).toEqual([2, 1, 0].map(denPred));
    expect(await sklad.slozky("zebricek-adresa/")).toEqual([2, 1, 0].map(denPred));
    expect(await sklad.slozky("denik/")).toEqual([denPred(DNI_UCHOVANI_DENIKU - 1)]);
    expect(await sklad.klice("vytah/")).toEqual([`vytah/${denPred(DNI_UCHOVANI_DENIKU - 1)}.json`]);
    expect(await sklad.klice("vazba/")).toHaveLength(1);
    expect(await sklad.klice("vazba-seznam/")).toHaveLength(1);
    expect(await sklad.klice("rozbor/")).toHaveLength(1);
    // Podruhé už není co mazat.
    expect(await uklid(sklad, new Date(`${DNES}T05:00:00Z`))).toEqual({ smazano: 0, hotovo: true });
  });

  it("na jedno volání smaže nejvýš NEJVIC_UKLIDU záznamů a zbytek dodělá příště", async () => {
    const sklad = new SkladVPameti();
    const den = denPred(DNI_UCHOVANI_DENIKU + 5);
    for (let i = 0; i < NEJVIC_UKLIDU + 50; i++) {
      await sklad.zapis(`denik/${den}/${Date.parse(`${den}T10:00:00Z`) + i}-aaaaaaaaaaaaaaaa-1795000000000-bbbbbbbbbbbbbbbb-00000-000001.json`, {});
    }
    await sklad.zapis(`vytah/${den}.json`, {});
    expect(await uklid(sklad, new Date(`${DNES}T05:00:00Z`))).toEqual({ smazano: NEJVIC_UKLIDU, hotovo: false });
    expect(await sklad.klice("vytah/")).toHaveLength(1);
    expect(await uklid(sklad, new Date(`${DNES}T05:00:00Z`))).toEqual({ smazano: 51, hotovo: true });
    expect(await sklad.klice("")).toEqual([]);
  });

  it("běží při podkladech rozboru (i s heslem pro rozbor) a při výpisu dnů; jeho chyba žádost neshodí", async () => {
    const sklad = await naplnene();
    const p = server({ sklad });
    expect((await spravujVse(zadost("/api/sprava?co=podklady", undefined, { authorization: `Bearer ${ANALYTIK_HESLO}` }), p)).status).toBe(200);
    expect(await sklad.klice("sul/")).toHaveLength(3);
    const druhy = await naplnene();
    const s = server({ sklad: druhy });
    const dny = (await (await spravujVse(zadost("/api/sprava?co=dny", undefined, SPRAVCE), s)).json()) as { dny: string[] };
    expect(dny.dny).toEqual([denPred(DNI_UCHOVANI_DENIKU - 1)]);
    expect(await druhy.klice("vazba/")).toHaveLength(1);
    // Úložiště, které při úklidu selže: podklady i výpis dnů odpoví dál.
    const rozbite = await naplnene();
    const r = server({ sklad: obal(rozbite, { smaz: () => Promise.reject(new Error("úložiště neodpovídá")) }) });
    expect((await spravujVse(zadost("/api/sprava?co=podklady", undefined, SPRAVCE), r)).status).toBe(200);
    expect((await spravujVse(zadost("/api/sprava?co=dny", undefined, SPRAVCE), r)).status).toBe(200);
  });
});
