// Žebříčky na serveru: server most ze zápisu sám přepočítá a podvržený výsledek odmítne
// (kritérium M16). Zkoušky jsou skutečné: stejný kód fyziky jako ve hře, tady v Node.
import { describe, expect, it } from "vitest";
import { cenaNavrhu, hmotnostNavrhu } from "../src/data/cena";
import type { NavrhMostu } from "../src/data/navrh";
import { zakodujMost } from "../src/data/sdileni";
import { unosnostNaKorunu } from "../src/data/vyzvy";
import {
  nactiOdpovedNaZapis,
  nactiZebricek,
  NEJDELSI_PREZDIVKA,
  NEJVIC_ZAPISU,
  seradZapisy,
  upravPrezdivku,
  znackaHrace,
  type OdpovedNaZapis,
  type ZadostOZapis,
  type ZebricekUrovne,
} from "../src/data/zebricek";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import type { ProstrediServeru } from "../src/server/obsluha";
import { overovacKampane, type Overovac } from "../src/server/overeni";
import { SkladVPameti, type SkladZaznamu } from "../src/server/sklad";
import {
  mostZeZebricku,
  NEJVIC_OVERENI_DENNE,
  obsluzZebricek,
  poctyZebricku,
  smazZeZebricku,
  zaradZapis,
  zebrickyProSpravu,
  type ZapisZebricku,
} from "../src/server/zebricek";
import { Zkouska } from "../src/zkouska/zkouska";
import { ZKOUSKA_DO_ZLOMU } from "../src/zkouska/zlom";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const WEB = "https://mostmistr.example";
const kampan = nactiKampan();
const uroven = kampan.find((u) => u.id === "1-01")!;
const over = overovacKampane();
const ANNA = "a".repeat(32);
const BORIS = "b".repeat(32);

function server(sklad: SkladZaznamu = new SkladVPameti(), ted = new Date("2026-11-24T10:00:00Z")): ProstrediServeru {
  return { sklad, ted: () => ted, nahoda: () => "abcdef", prostredi: "test", hesloSpravce: "tajne-heslo-spravce" };
}

/** Co by o mostě věděla hra: otisk běžné zkoušky a zkoušky do zlomu. */
function zkousej(navrh: NavrhMostu, zlom = false): string {
  const z = new Zkouska(uroven, navrh, nasadaUrovne(uroven), undefined, undefined, zlom ? ZKOUSKA_DO_ZLOMU : undefined);
  while (!z.hotovo) z.pokracuj(1);
  return z.vysledek().otisk;
}

const mistrovsky = RESENI["1-01"]!.mistrovska;
const pruchozi = RESENI["1-01"]!.pruchod;
const otisky = new Map<NavrhMostu, string>();
const otisk = (navrh: NavrhMostu): string => {
  let o = otisky.get(navrh);
  if (o === undefined) otisky.set(navrh, (o = zkousej(navrh)));
  return o;
};

function zapis(navrh: NavrhMostu, zmeny: Partial<ZadostOZapis> = {}): ZadostOZapis {
  return { uroven: "1-01", kod: zakodujMost(navrh), zkouska: "bezna", otisk: otisk(navrh), verze: VERZE_FYZIKY, hrac: ANNA, jmeno: "Anna", ...zmeny };
}

function posli(telo: unknown, hlavicky: Record<string, string> = {}): Request {
  return new Request(`${WEB}/api/zebricek`, { method: "POST", headers: { "content-type": "application/json", origin: WEB, ...hlavicky }, body: JSON.stringify(telo) });
}

async function telo(odpoved: Response): Promise<{ chyba?: string; kod?: string } & Partial<OdpovedNaZapis>> {
  return (await odpoved.json()) as { chyba?: string; kod?: string } & Partial<OdpovedNaZapis>;
}

async function zebricek(p: ProstrediServeru, id = "1-01"): Promise<ZebricekUrovne> {
  const odpoved = await obsluzZebricek(new Request(`${WEB}/api/zebricek?uroven=${id}`), p, over);
  expect(odpoved.status).toBe(200);
  return nactiZebricek(await odpoved.json())!;
}

describe("přezdívka a řazení", () => {
  it("přezdívka je jen text z písmen, číslic a pár znamének, nejvýš šestnáct znaků", () => {
    expect(upravPrezdivku("  Ája   Nováková ")).toBe("Ája Nováková");
    expect(upravPrezdivku("<b>Robot</b>\u0000\n")).toBe("bRobotb");
    expect(upravPrezdivku("http://spam.example/?x=1")).toBe("httpspam.example");
    expect(upravPrezdivku("x".repeat(40))).toBe("x".repeat(NEJDELSI_PREZDIVKA));
    expect(upravPrezdivku("Žofie_22-b.")).toBe("Žofie_22-b.");
    expect(upravPrezdivku("  \t ")).toBeNull();
    expect(upravPrezdivku("<>&\"'")).toBeNull();
    expect(upravPrezdivku(42)).toBeNull();
    // Složený znak se počítá jako jeden a přezdívka nekončí mezerou po oříznutí.
    expect(upravPrezdivku("é".repeat(20))).toBe("é".repeat(NEJDELSI_PREZDIVKA));
    expect(upravPrezdivku("abcdefghijklmno pq")).toBe("abcdefghijklmno");
  });

  it("veřejná značka hráče je stálá, liší se mezi hráči a číslo hráče v ní není", () => {
    expect(znackaHrace(ANNA)).toBe(znackaHrace(ANNA));
    expect(znackaHrace(ANNA)).toMatch(/^[0-9a-f]{16}$/);
    expect(znackaHrace(ANNA)).not.toBe(znackaHrace(BORIS));
    expect(ANNA).not.toContain(znackaHrace(ANNA));
  });

  it("cena a hmotnost řadí vzestupně, únosnost sestupně; shodu v zobrazené hodnotě rozhoduje čas", () => {
    const z = (hodnota: number, cas: number): { hodnota: number; cas: number } => ({ hodnota, cas });
    expect(seradZapisy("cena", [z(300, 1), z(100, 2), z(200, 3)]).map((x) => x.hodnota)).toEqual([100, 200, 300]);
    expect(seradZapisy("zlom", [z(0.5, 1), z(2, 2), z(1, 3)]).map((x) => x.hodnota)).toEqual([2, 1, 0.5]);
    // 100,2 Kč a 99,8 Kč jsou pro hráče obojí 100 Kč: vede ten dřívější.
    expect(seradZapisy("cena", [z(100.2, 5), z(99.8, 9)]).map((x) => x.cas)).toEqual([5, 9]);
  });

  it("hráč má v měřítku jeden zápis: lepší ho nahradí, horší ne, a žebříček má strop", () => {
    const novy = (hrac: string, hodnota: number, cas: number): ZapisZebricku => ({ hrac, jmeno: "X", hodnota, cas, most: "0".repeat(32) });
    const prvni = zaradZapis("cena", [], novy(ANNA, 500, 1));
    expect(prvni.misto).toEqual({ poradi: 1, hodnota: 500, nejlepsi: 500, zlepseni: true });
    const horsi = zaradZapis("cena", prvni.zapisy, { ...novy(ANNA, 700, 2), jmeno: "Anna II" });
    expect(horsi.zapisy).toHaveLength(1);
    expect(horsi.zapisy[0]).toMatchObject({ hodnota: 500, cas: 1, jmeno: "Anna II" });
    expect(horsi.misto).toEqual({ poradi: 1, hodnota: 700, nejlepsi: 500, zlepseni: false });
    const lepsi = zaradZapis("cena", horsi.zapisy, novy(ANNA, 400, 3));
    expect(lepsi.zapisy.map((x) => x.hodnota)).toEqual([400]);
    expect(lepsi.misto.zlepseni).toBe(true);
    // Plný žebříček: horší než poslední se nevejde a nemá pořadí.
    const plny = Array.from({ length: NEJVIC_ZAPISU }, (_, i) => novy(i.toString(16).padStart(32, "0"), 100 + i, i));
    const mimo = zaradZapis("cena", plny, novy(BORIS, 9999, 999));
    expect(mimo.zapisy).toHaveLength(NEJVIC_ZAPISU);
    expect(mimo.misto).toMatchObject({ poradi: null, zlepseni: false });
    const dovnitr = zaradZapis("cena", plny, novy(BORIS, 100.4, 999));
    expect(dovnitr.misto.poradi).toBe(2);
    expect(dovnitr.zapisy).toHaveLength(NEJVIC_ZAPISU);
  });
});

describe("zápis do žebříčku", () => {
  it("poctivý zápis server přepočítá a zapíše hodnoty, které mu vyšly", async () => {
    const p = server();
    const odpoved = await obsluzZebricek(posli(zapis(mistrovsky)), p, over);
    expect(odpoved.status).toBe(200);
    const o = nactiOdpovedNaZapis(await odpoved.json())!;
    expect(o.moje.cena).toEqual({ poradi: 1, hodnota: cenaNavrhu(mistrovsky), nejlepsi: cenaNavrhu(mistrovsky), zlepseni: true });
    expect(o.moje.hmotnost?.hodnota).toBe(hmotnostNavrhu(mistrovsky, uroven));
    expect(o.moje.zlom).toBeUndefined();
    const z = await zebricek(p);
    expect(z).toEqual(o.zebricek);
    expect(z.verze).toBe(VERZE_FYZIKY);
    expect(z.miry.cena).toEqual({ radky: [{ jmeno: "Anna", hodnota: cenaNavrhu(mistrovsky), kdy: "2026-11-24", znacka: znackaHrace(ANNA) }], hracu: 1 });
    expect(z.miry.hmotnost.radky).toHaveLength(1);
    expect(z.miry.zlom.radky).toEqual([]);
    // Číslo hráče ani kód mostu se ven nedostanou.
    const text = JSON.stringify(z);
    expect(text).not.toContain(ANNA);
    expect(text).not.toContain(zakodujMost(mistrovsky));
    expect(await poctyZebricku(p.sklad, "2026-11-24")).toEqual({ overeni: 1, prijato: 1, zlepseni: 2, odmitnuto: {} });
  });

  it("podvržený výsledek server odmítne: cizí otisk, most, který neprojde, most mimo pravidla, nečitelný kód", async () => {
    const p = server();
    const odmitnuto = async (zadost: unknown, stav: number, kod: string): Promise<void> => {
      const odpoved = await obsluzZebricek(posli(zadost), p, over);
      expect(odpoved.status, kod).toBe(stav);
      expect((await telo(odpoved)).kod).toBe(kod);
    };
    // Otisk, který hra nespočítala (nebo spočítala s jinou fyzikou).
    await odmitnuto(zapis(mistrovsky, { otisk: "0123456789abcdef" }), 422, "otisk");
    // Most, který zkouškou neprojde, i kdyby hráč poslal jeho pravý otisk.
    const pad = RESENI["1-01"]!.pady[0]!.navrh;
    await odmitnuto(zapis(pad), 422, "neprosel");
    // Most z jiné úrovně a most nad rozpočet úrovně: pravidla úrovně platí i na serveru.
    await odmitnuto(zapis(RESENI["1-02"]!.pruchod, { otisk: "0123456789abcdef" }), 422, "pravidla");
    const drahy: NavrhMostu = { ...mistrovsky, pruty: mistrovsky.pruty.map((q) => (q.prvek === "mostovka-drevo" ? q : { ...q, prvek: "ocel-tezka" as const })) };
    if (cenaNavrhu(drahy) > uroven.rozpocet!) await odmitnuto(zapis(drahy, { otisk: "0123456789abcdef" }), 422, "pravidla");
    // Kód, který není most, a kód s jedním znakem jinak (kontrolní součet).
    await odmitnuto(zapis(mistrovsky, { kod: "tohle-neni-most" }), 422, "most");
    const kod = zakodujMost(mistrovsky);
    await odmitnuto(zapis(mistrovsky, { kod: (kod[0] === "A" ? "B" : "A") + kod.slice(1) }), 422, "most");
    // Jiná verze fyziky u hráče: pomůže načíst stránku.
    await odmitnuto(zapis(mistrovsky, { verze: VERZE_FYZIKY - 1 }), 409, "verze");
    // Úroveň mimo kampaň (pískoviště, případ komise) a nesmyslný tvar.
    await odmitnuto(zapis(mistrovsky, { uroven: "9-01" }), 400, "tvar");
    await odmitnuto(zapis(mistrovsky, { uroven: "8-09" }), 404, "uroven");
    await odmitnuto(zapis(mistrovsky, { jmeno: "<>" }), 400, "tvar");
    await odmitnuto(zapis(mistrovsky, { hrac: "kdokoli" }), 400, "tvar");
    await odmitnuto({ ...zapis(mistrovsky), zkouska: "jina" }, 400, "tvar");
    await odmitnuto("ahoj", 400, "tvar");
    // Nic z toho se do žebříčku nedostalo.
    const z = await zebricek(p);
    expect(z.miry.cena.radky).toEqual([]);
    expect(z.miry.hmotnost.radky).toEqual([]);
    const pocty = await poctyZebricku(p.sklad, "2026-11-24");
    expect(pocty.prijato).toBe(0);
    expect(pocty.odmitnuto.otisk).toBe(1);
    expect(pocty.odmitnuto.neprosel).toBe(1);
    expect(pocty.odmitnuto.most).toBe(2);
  }, 60_000);

  it("hodnotu do žebříčku určuje server, ne hráč: pole navíc se nečtou", async () => {
    const p = server();
    const odpoved = await obsluzZebricek(posli({ ...zapis(pruchozi), cena: 1, hodnota: 1, hmotnost: 1 }), p, over);
    expect(odpoved.status).toBe(200);
    expect((await zebricek(p)).miry.cena.radky[0]!.hodnota).toBe(cenaNavrhu(pruchozi));
  });

  it("žádost z cizí stránky, jinou metodou nebo moc velkou server nepřijme", async () => {
    const p = server();
    expect((await obsluzZebricek(posli(zapis(mistrovsky), { origin: "https://cizi.example" }), p, over)).status).toBe(403);
    expect((await obsluzZebricek(new Request(`${WEB}/api/zebricek`, { method: "DELETE" }), p, over)).status).toBe(405);
    expect((await obsluzZebricek(posli({ ...zapis(mistrovsky), vata: "x".repeat(20_000) }), p, over)).status).toBe(413);
    expect((await obsluzZebricek(new Request(`${WEB}/api/zebricek?uroven=0-01`), p, over)).status).toBe(404);
    expect((await zebricek(p)).miry.cena.radky).toEqual([]);
  });

  it("druhý hráč se stejným mostem je za prvním; lepší most ho předběhne a horší svůj zápis nezhorší", async () => {
    const sklad = new SkladVPameti();
    const levnejsi = cenaNavrhu(mistrovsky) < cenaNavrhu(pruchozi) ? mistrovsky : pruchozi;
    const drazsi = levnejsi === mistrovsky ? pruchozi : mistrovsky;
    expect(cenaNavrhu(levnejsi)).toBeLessThan(cenaNavrhu(drazsi));
    await obsluzZebricek(posli(zapis(drazsi)), server(sklad, new Date("2026-11-24T10:00:00Z")), over);
    const druhy = await obsluzZebricek(posli(zapis(drazsi, { hrac: BORIS, jmeno: "Boris" })), server(sklad, new Date("2026-11-24T11:00:00Z")), over);
    expect(nactiOdpovedNaZapis(await druhy.json())!.moje.cena).toMatchObject({ poradi: 2, zlepseni: true });
    let z = await zebricek(server(sklad));
    expect(z.miry.cena.radky.map((r) => r.jmeno)).toEqual(["Anna", "Boris"]);
    // Boris pošle levnější most: je první.
    const lepsi = await obsluzZebricek(posli(zapis(levnejsi, { hrac: BORIS, jmeno: "Boris" })), server(sklad, new Date("2026-11-25T09:00:00Z")), over);
    expect(nactiOdpovedNaZapis(await lepsi.json())!.moje.cena).toEqual({ poradi: 1, hodnota: cenaNavrhu(levnejsi), nejlepsi: cenaNavrhu(levnejsi), zlepseni: true });
    // A pak znovu ten dražší (pod novou přezdívkou): zápis se nezhorší, přezdívka se srovná.
    const horsi = await obsluzZebricek(posli(zapis(drazsi, { hrac: BORIS, jmeno: "Bořek" })), server(sklad, new Date("2026-11-25T10:00:00Z")), over);
    expect(nactiOdpovedNaZapis(await horsi.json())!.moje.cena).toEqual({ poradi: 1, hodnota: cenaNavrhu(drazsi), nejlepsi: cenaNavrhu(levnejsi), zlepseni: false });
    z = await zebricek(server(sklad));
    expect(z.miry.cena.radky.map((r) => [r.jmeno, r.hodnota, r.kdy])).toEqual([
      ["Bořek", cenaNavrhu(levnejsi), "2026-11-25"],
      ["Anna", cenaNavrhu(drazsi), "2026-11-24"],
    ]);
    expect(z.miry.cena.hracu).toBe(2);
  }, 60_000);

  it("únosnost na korunu chce zkoušku do zlomu: server ji pustí sám a otisk musí sedět", async () => {
    const p = server();
    const zlomovy = zkousej(mistrovsky, true);
    // Podvržený otisk zlomu neprojde.
    const podvrh = await obsluzZebricek(posli(zapis(mistrovsky, { zkouska: "zlom", otisk: "fedcba9876543210" })), p, over);
    expect((await telo(podvrh)).kod).toBe("otisk");
    // Most, který běžnou zkouškou neprojde, do zlomu nesmí, i s pravým otiskem zlomu.
    const pad = RESENI["1-01"]!.pady[0]!.navrh;
    const spadly = await obsluzZebricek(posli(zapis(pad, { zkouska: "zlom", otisk: zkousej(pad, true) })), p, over);
    expect((await telo(spadly)).kod).toBe("neprosel");
    // Poctivý zápis: i bez předchozího zápisu běžné zkoušky (hráč most prošel dřív).
    const odpoved = await obsluzZebricek(posli(zapis(mistrovsky, { zkouska: "zlom", otisk: zlomovy })), p, over);
    expect(odpoved.status).toBe(200);
    const o = nactiOdpovedNaZapis(await odpoved.json())!;
    const z = new Zkouska(uroven, mistrovsky, nasadaUrovne(uroven), undefined, undefined, ZKOUSKA_DO_ZLOMU);
    while (!z.hotovo) z.pokracuj(1);
    expect(o.moje.zlom?.hodnota).toBe(unosnostNaKorunu(z.vysledek().zlom!.celkem, cenaNavrhu(mistrovsky)));
    expect(o.moje.cena).toBeUndefined();
    expect(o.zebricek.miry.zlom.radky).toHaveLength(1);
    expect(o.zebricek.miry.cena.radky).toEqual([]);
  }, 60_000);

  it("most, který server už zná, nepřepočítává; strop na den se týká jen nových mostů", async () => {
    const sklad = new SkladVPameti();
    let zkousek = 0;
    const pocitajici: Overovac = { ...over, bezna: (u, kod) => (zkousek++, over.bezna(u, kod)) };
    const p = server(sklad);
    expect((await obsluzZebricek(posli(zapis(mistrovsky)), p, pocitajici)).status).toBe(200);
    expect((await obsluzZebricek(posli(zapis(mistrovsky, { hrac: BORIS, jmeno: "Boris" })), p, pocitajici)).status).toBe(200);
    expect(zkousek).toBe(1);
    // I odmítnutý most si server pamatuje: druhý pokus s ním nic nepočítá.
    const pad = RESENI["1-01"]!.pady[0]!.navrh;
    for (let i = 0; i < 3; i++) expect((await telo(await obsluzZebricek(posli(zapis(pad)), p, pocitajici))).kod).toBe("neprosel");
    expect(zkousek).toBe(2);
    // Strop: dnes už server počítal dost. Známý most projde, nový ne.
    await sklad.zapis("zebricek-den/2026-11-24.json", { overeni: NEJVIC_OVERENI_DENNE, prijato: 0, zlepseni: 0, odmitnuto: {} });
    expect((await obsluzZebricek(posli(zapis(mistrovsky)), p, pocitajici)).status).toBe(200);
    const novy = await obsluzZebricek(posli(zapis(pruchozi)), p, pocitajici);
    expect(novy.status).toBe(429);
    expect((await telo(novy)).kod).toBe("plno");
    expect(zkousek).toBe(2);
    // Zítra je nový den.
    expect((await obsluzZebricek(posli(zapis(pruchozi)), server(sklad, new Date("2026-11-25T00:00:01Z")), pocitajici)).status).toBe(200);
  }, 60_000);

  it("dva zápisy ve stejnou chvíli se nepřepíšou", async () => {
    // Úložiště, které mezi čtením a zápisem žebříčku pustí dovnitř zápis jiného hráče.
    const sklad = new SkladVPameti();
    const p = server(sklad);
    let vlozeno = false;
    const zavodici: SkladZaznamu = {
      cti: (k) => sklad.cti(k),
      zapis: (k, h) => sklad.zapis(k, h),
      smaz: (k) => sklad.smaz(k),
      klice: (x) => sklad.klice(x),
      slozky: (x) => sklad.slozky(x),
      ctiSeZnackou: (k) => sklad.ctiSeZnackou(k),
      zapisPokud: async (k, h, znacka) => {
        if (k.startsWith("zebricek/") && !vlozeno) {
          vlozeno = true;
          expect((await obsluzZebricek(posli(zapis(pruchozi, { hrac: BORIS, jmeno: "Boris" })), p, over)).status).toBe(200);
        }
        return sklad.zapisPokud(k, h, znacka);
      },
    };
    expect((await obsluzZebricek(posli(zapis(mistrovsky)), server(zavodici), over)).status).toBe(200);
    const z = await zebricek(p);
    expect(z.miry.cena.radky.map((r) => r.jmeno).sort()).toEqual(["Anna", "Boris"]);
    expect(z.miry.hmotnost.hracu).toBe(2);
  }, 60_000);
});

describe("správa žebříčků", () => {
  it("správce vidí řádky i s mostem a umí smazat zápisy hráče", async () => {
    const p = server();
    await obsluzZebricek(posli(zapis(mistrovsky)), p, over);
    await obsluzZebricek(posli(zapis(pruchozi, { hrac: BORIS, jmeno: "Sprosťák" })), p, over);
    const prehled = await zebrickyProSpravu(p.sklad, VERZE_FYZIKY);
    expect(prehled).toHaveLength(1);
    expect(prehled[0]!.uroven).toBe("1-01");
    expect(prehled[0]!.radky.filter((r) => r.mira === "cena").map((r) => r.jmeno).sort()).toEqual(["Anna", "Sprosťák"]);
    const radek = prehled[0]!.radky.find((r) => r.jmeno === "Sprosťák")!;
    expect(radek.znacka).toBe(znackaHrace(BORIS));
    expect(await mostZeZebricku(p.sklad, prehled[0]!.klic, radek.most)).toBe(zakodujMost(pruchozi));
    expect(await mostZeZebricku(p.sklad, "zebricek/../neco.json", radek.most)).toBeNull();
    // Smazání podle veřejné značky: v jiné úrovni nic, v téhle oba zápisy (cena i hmotnost).
    expect(await smazZeZebricku(p.sklad, VERZE_FYZIKY, znackaHrace(BORIS), "1-02")).toBe(0);
    expect(await smazZeZebricku(p.sklad, VERZE_FYZIKY, znackaHrace(BORIS), null)).toBe(2);
    const z = await zebricek(p);
    expect(z.miry.cena.radky.map((r) => r.jmeno)).toEqual(["Anna"]);
    expect(z.miry.hmotnost.radky.map((r) => r.jmeno)).toEqual(["Anna"]);
  }, 60_000);
});
