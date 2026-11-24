// Žebříčky na serveru: server most ze zápisu sám přepočítá a podvržený výsledek odmítne
// (kritérium M16). Zkoušky jsou skutečné: stejný kód fyziky jako ve hře, tady v Node.
import { describe, expect, it } from "vitest";
import { cenaNavrhu, hmotnostNavrhu } from "../src/data/cena";
import type { NavrhMostu } from "../src/data/navrh";
import { zakodujMost } from "../src/data/sdileni";
import { unosnostNaKorunu } from "../src/data/vyzvy";
import {
  kanonMostu,
  nactiOdpovedNaZapis,
  nactiZebricek,
  NEJDELSI_PREZDIVKA,
  NEJVIC_ZAPISU,
  seradZapisy,
  upravPrezdivku,
  VERZE_ZEBRICKU,
  znackaHrace,
  type OdpovedNaZapis,
  type ZadostOZapis,
  type ZebricekUrovne,
} from "../src/data/zebricek";
import { CENA_SVARU, CENA_ZAVAZI, KATALOG, LADENY_TLUMIC, MATERIALY, PIST, ZAMEK } from "../src/data/katalog";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import type { ProstrediServeru } from "../src/server/obsluha";
import { overovacKampane, type Overovac } from "../src/server/overeni";
import { SkladVPameti, type SkladZaznamu } from "../src/server/sklad";
import {
  mostZeZebricku,
  NEJVIC_OVERENI_DENNE,
  NEJVIC_OVERENI_NA_ADRESU,
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

/** Tentýž most nakreslený jinak: jiná id styčníků i prutů a opačné pořadí. Tvar je stejný. */
function prekresleny(navrh: NavrhMostu): NavrhMostu {
  const id = (stare: number): number => stare + 500;
  return {
    ...navrh,
    stycniky: navrh.stycniky.map((s) => ({ ...s, id: id(s.id) })).reverse(),
    pruty: navrh.pruty.map((q) => ({ ...q, id: id(q.id), a: id(q.b), b: id(q.a) })).reverse(),
  };
}

/** Ověřovač, který zkoušky jen počítá (a pouští ty pravé). */
function pocitajici(): { over: Overovac; beznych: () => number; zlomu: () => number } {
  let beznych = 0;
  let zlomu = 0;
  return {
    over: { ...over, bezna: (u, kod) => (beznych++, over.bezna(u, kod)), zlom: (u, kod) => (zlomu++, over.zlom(u, kod)) },
    beznych: () => beznych,
    zlomu: () => zlomu,
  };
}

/** Ověřovač bez fyziky: každý kód je platný most s cenou podle čísla v kódu. Pro stropy. */
const levny: Overovac = {
  ...over,
  priprav: (_u, kod) => ({ stav: "pripraven", kanon: kod }),
  bezna: (_u, kod) => ({ plati: true, otisk: "0".repeat(16), cena: 1000 + Number(kod.slice(4)), hmotnost: 500 }),
  zlom: () => ({ otisk: "1".repeat(16), naKorunu: 2 }),
};

describe("přezdívka a řazení", () => {
  it("přezdívka je jen text z písmen latinky, číslic a pár znamének, nejvýš šestnáct znaků", () => {
    expect(upravPrezdivku("  Ája   Nováková ")).toBe("Ája Nováková");
    expect(upravPrezdivku("<b>Robot</b>\u0000\n")).toBe("bRobotb");
    expect(upravPrezdivku("http://spam.example/?x=1")).toBe("httpspam.example");
    expect(upravPrezdivku("x".repeat(40))).toBe("x".repeat(NEJDELSI_PREZDIVKA));
    expect(upravPrezdivku("Žofie_22-b.")).toBe("Žofie_22-b.");
    expect(upravPrezdivku("  \t ")).toBeNull();
    expect(upravPrezdivku("<>&\"'")).toBeNull();
    expect(upravPrezdivku(42)).toBeNull();
    // Složený znak se počítá jako jeden (i zapsaný písmenem a čárkou zvlášť) a přezdívka nekončí mezerou.
    expect(upravPrezdivku("é".repeat(20))).toBe("é".repeat(NEJDELSI_PREZDIVKA));
    expect(upravPrezdivku("é".repeat(20))).toBe("é".repeat(NEJDELSI_PREZDIVKA));
    expect(upravPrezdivku("abcdefghijklmno pq")).toBe("abcdefghijklmno");
  });

  it("vydávat se za jiného hráče podobnými nebo neviditelnými znaky nejde", () => {
    // Azbuka a řečtina, které vypadají jako latinka, zmizí; ozdobná a široká písmena jsou obyčejná.
    expect(upravPrezdivku("Аnna")).toBe("nna");
    expect(upravPrezdivku("Αnna")).toBe("nna");
    expect(upravPrezdivku("Ａｎｎａ")).toBe("Anna");
    expect(upravPrezdivku("\u{1d400}\u{1d427}\u{1d427}\u{1d41a}")).toBe("Anna");
    // Neviditelné znaky, obrácení směru textu a výplně.
    expect(upravPrezdivku("An​na")).toBe("Anna");
    expect(upravPrezdivku("‮Anna‬")).toBe("Anna");
    expect(upravPrezdivku("An­na﻿")).toBe("Anna");
    expect(upravPrezdivku("ㅤㅤ")).toBeNull();
    expect(upravPrezdivku("Anna  B")).toBe("Anna B");
    // Hromada kombinujících znamének nad jedním písmenem nezůstane.
    expect(upravPrezdivku(`Z${"́".repeat(30)}algo`)).toBe("Źalgo");
  });

  it("veřejná značka hráče je stálá, liší se mezi hráči i mezi úrovněmi a číslo hráče v ní není", () => {
    expect(znackaHrace(ANNA, "1-01")).toBe(znackaHrace(ANNA, "1-01"));
    expect(znackaHrace(ANNA, "1-01")).toMatch(/^[0-9a-f]{16}$/);
    expect(znackaHrace(ANNA, "1-01")).not.toBe(znackaHrace(BORIS, "1-01"));
    // Podle značky nejde spojit téhož hráče napříč úrovněmi.
    expect(znackaHrace(ANNA, "1-01")).not.toBe(znackaHrace(ANNA, "1-02"));
    expect(ANNA).not.toContain(znackaHrace(ANNA, "1-01"));
  });

  it("tvar mostu nezávisí na id ani na pořadí kreslení, ale na každé změně mostu ano", () => {
    expect(zakodujMost(prekresleny(mistrovsky))).not.toBe(zakodujMost(mistrovsky));
    expect(kanonMostu(prekresleny(mistrovsky))).toBe(kanonMostu(mistrovsky));
    expect(kanonMostu(pruchozi)).not.toBe(kanonMostu(mistrovsky));
    const bezPrutu: NavrhMostu = { ...mistrovsky, pruty: mistrovsky.pruty.slice(1) };
    expect(kanonMostu(bezPrutu)).not.toBe(kanonMostu(mistrovsky));
    const jinyPrvek: NavrhMostu = { ...mistrovsky, pruty: mistrovsky.pruty.map((q, i) => (i === 0 ? { ...q, prvek: "ocel-tezka" as const } : q)) };
    expect(kanonMostu(jinyPrvek)).not.toBe(kanonMostu(mistrovsky));
    const seZavazim: NavrhMostu = { ...mistrovsky, stycniky: mistrovsky.stycniky.map((s, i) => (i === 0 ? { ...s, zavazi: 500 } : s)) };
    expect(kanonMostu(seZavazim)).not.toBe(kanonMostu(mistrovsky));
  });

  it("cena a hmotnost řadí vzestupně, únosnost sestupně; shodu v zobrazené hodnotě rozhoduje čas", () => {
    const z = (hodnota: number, cas: number): { hodnota: number; cas: number } => ({ hodnota, cas });
    expect(seradZapisy("cena", [z(300, 1), z(100, 2), z(200, 3)]).map((x) => x.hodnota)).toEqual([100, 200, 300]);
    expect(seradZapisy("zlom", [z(0.5, 1), z(2, 2), z(1, 3)]).map((x) => x.hodnota)).toEqual([2, 1, 0.5]);
    // 100,2 Kč a 99,8 Kč jsou pro hráče obojí 100 Kč: vede ten dřívější.
    expect(seradZapisy("cena", [z(100.2, 5), z(99.8, 9)]).map((x) => x.cas)).toEqual([5, 9]);
  });

  it("hráč má v měřítku jeden zápis: lepší ho nahradí, horší ne, a žebříček má strop", () => {
    const novy = (hrac: string, hodnota: number, cas: number, tvar = `tvar-${hrac}-${hodnota}`): ZapisZebricku => ({ hrac, jmeno: "X", hodnota, cas, most: "0".repeat(32), tvar });
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

  it("stejný tvar mostu má v měřítku jeden řádek: patří tomu, kdo ho zapsal první", () => {
    const novy = (hrac: string, hodnota: number, cas: number, tvar: string): ZapisZebricku => ({ hrac, jmeno: "X", hodnota, cas, most: "0".repeat(32), tvar });
    const anna = zaradZapis("cena", [], novy(ANNA, 500, 1, "A"));
    // Boris pošle tentýž tvar: řádek nedostane a o Annině řádku se nic nemění.
    const opsany = zaradZapis("cena", anna.zapisy, novy(BORIS, 500, 2, "A"));
    expect(opsany.zapisy).toEqual(anna.zapisy);
    expect(opsany.misto).toEqual({ poradi: null, hodnota: 500, nejlepsi: 500, zlepseni: false, obsazeno: true });
    // S vlastním (i horším) mostem řádek má; opsaný mu ho pak nezlepší.
    const vlastni = zaradZapis("cena", anna.zapisy, novy(BORIS, 600, 3, "B"));
    expect(vlastni.misto).toEqual({ poradi: 2, hodnota: 600, nejlepsi: 600, zlepseni: true });
    const znovuOpsany = zaradZapis("cena", vlastni.zapisy, novy(BORIS, 500, 4, "A"));
    expect(znovuOpsany.misto).toEqual({ poradi: 2, hodnota: 500, nejlepsi: 600, zlepseni: false, obsazeno: true });
    expect(znovuOpsany.zapisy.map((z) => [z.hrac, z.hodnota])).toEqual([[ANNA, 500], [BORIS, 600]]);
    // Vlastní most poslaný podruhé obsazený není.
    expect(zaradZapis("cena", vlastni.zapisy, novy(ANNA, 500, 5, "A")).misto).toEqual({ poradi: 1, hodnota: 500, nejlepsi: 500, zlepseni: false });
    // Sto čísel hráče s jedním opsaným mostem žebříček nezaplní.
    let zapisy = anna.zapisy;
    for (let i = 0; i < 100; i++) zapisy = zaradZapis("cena", zapisy, novy(i.toString(16).padStart(32, "c"), 500, 10 + i, "A")).zapisy;
    expect(zapisy).toHaveLength(1);
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
    expect(z.miry.cena).toEqual({ radky: [{ jmeno: "Anna", hodnota: cenaNavrhu(mistrovsky), kdy: "2026-11-24", znacka: znackaHrace(ANNA, "1-01") }], hracu: 1 });
    expect(z.miry.hmotnost.radky).toHaveLength(1);
    expect(z.miry.zlom.radky).toEqual([]);
    // Číslo hráče ani kód mostu se ven nedostanou.
    const text = JSON.stringify(z);
    expect(text).not.toContain(ANNA);
    expect(text).not.toContain(zakodujMost(mistrovsky));
    expect(await poctyZebricku(p.sklad, "2026-11-24")).toEqual({ overeni: 1, prijato: 1, zlepseni: 2, odmitnuto: {} });
    // Klíč žebříčku nese verzi fyziky i verzi pravidel žebříčků: po změně kterékoli začíná od nuly.
    expect(await p.sklad.klice(`zebricek/v${VERZE_FYZIKY}.${VERZE_ZEBRICKU}/1-01-`)).toHaveLength(1);
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
    const pameti = (await p.sklad.klice("overeno/")).length;
    expect(pameti).toBe(2);
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
    expect(pocty.overeni).toBe(2);
    expect(pocty.odmitnuto.otisk).toBe(1);
    expect(pocty.odmitnuto.neprosel).toBe(1);
    expect(pocty.odmitnuto.most).toBe(2);
    // Nečitelné kódy a mosty mimo pravidla nestojí zkoušku ani místo v úložišti.
    expect((await p.sklad.klice("overeno/")).length).toBe(pameti);
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

  it("opsaný most řádek nedostane; lepší vlastní most ho předběhne a horší svůj zápis nezhorší", async () => {
    const sklad = new SkladVPameti();
    const levnejsi = cenaNavrhu(mistrovsky) < cenaNavrhu(pruchozi) ? mistrovsky : pruchozi;
    const drazsi = levnejsi === mistrovsky ? pruchozi : mistrovsky;
    expect(cenaNavrhu(levnejsi)).toBeLessThan(cenaNavrhu(drazsi));
    await obsluzZebricek(posli(zapis(drazsi)), server(sklad, new Date("2026-11-24T10:00:00Z")), over);
    // Boris pošle tentýž most (stejný kód): zápis projde, ale řádek patří Anně.
    const druhy = await obsluzZebricek(posli(zapis(drazsi, { hrac: BORIS, jmeno: "Boris" })), server(sklad, new Date("2026-11-24T11:00:00Z")), over);
    expect(druhy.status).toBe(200);
    expect(nactiOdpovedNaZapis(await druhy.json())!.moje.cena).toEqual({ poradi: null, hodnota: cenaNavrhu(drazsi), nejlepsi: cenaNavrhu(drazsi), zlepseni: false, obsazeno: true });
    // Ani tentýž most nakreslený znovu (jiná id, jiné pořadí, jiný kód) druhý řádek nedostane.
    const jinak = prekresleny(drazsi);
    const treti = await obsluzZebricek(posli(zapis(jinak, { hrac: BORIS, jmeno: "Boris" })), server(sklad, new Date("2026-11-24T11:30:00Z")), over);
    expect(treti.status).toBe(200);
    expect(nactiOdpovedNaZapis(await treti.json())!.moje.hmotnost).toMatchObject({ poradi: null, obsazeno: true });
    let z = await zebricek(server(sklad));
    expect(z.miry.cena.radky.map((r) => r.jmeno)).toEqual(["Anna"]);
    expect(z.miry.hmotnost.hracu).toBe(1);
    // Boris pošle levnější most: je první.
    const lepsi = await obsluzZebricek(posli(zapis(levnejsi, { hrac: BORIS, jmeno: "Boris" })), server(sklad, new Date("2026-11-25T09:00:00Z")), over);
    expect(nactiOdpovedNaZapis(await lepsi.json())!.moje.cena).toEqual({ poradi: 1, hodnota: cenaNavrhu(levnejsi), nejlepsi: cenaNavrhu(levnejsi), zlepseni: true });
    // Anna pošle svůj dražší most znovu pod novou přezdívkou: zápis se nezmění, přezdívka ano.
    const znovu = await obsluzZebricek(posli(zapis(drazsi, { jmeno: "Anička" })), server(sklad, new Date("2026-11-25T10:00:00Z")), over);
    expect(nactiOdpovedNaZapis(await znovu.json())!.moje.cena).toEqual({ poradi: 2, hodnota: cenaNavrhu(drazsi), nejlepsi: cenaNavrhu(drazsi), zlepseni: false });
    z = await zebricek(server(sklad));
    expect(z.miry.cena.radky.map((r) => [r.jmeno, r.hodnota, r.kdy])).toEqual([
      ["Boris", cenaNavrhu(levnejsi), "2026-11-25"],
      ["Anička", cenaNavrhu(drazsi), "2026-11-24"],
    ]);
    expect(z.miry.cena.hracu).toBe(2);
    expect(z.miry.hmotnost.radky.map((r) => r.jmeno).sort()).toEqual(["Anička", "Boris"]);
  }, 60_000);

  it("únosnost na korunu: zlom až po běžné zkoušce téhož mostu, jedna žádost pustí nejvýš jednu zkoušku", async () => {
    const p = server();
    const pocitadlo = pocitajici();
    const zlomovy = zkousej(mistrovsky, true);
    // Most, který server nezná, zkoušku do zlomu nedostane (a nestojí žádnou zkoušku).
    const driv = await obsluzZebricek(posli(zapis(mistrovsky, { zkouska: "zlom", otisk: zlomovy })), p, pocitadlo.over);
    expect(driv.status).toBe(409);
    expect((await telo(driv)).kod).toBe("nejdriv");
    expect([pocitadlo.beznych(), pocitadlo.zlomu()]).toEqual([0, 0]);
    // Běžná zkouška: jedna zkouška.
    expect((await obsluzZebricek(posli(zapis(mistrovsky)), p, pocitadlo.over)).status).toBe(200);
    expect([pocitadlo.beznych(), pocitadlo.zlomu()]).toEqual([1, 0]);
    // Podvržený otisk zlomu neprojde (a zlom se spočítá jen jednou).
    const podvrh = await obsluzZebricek(posli(zapis(mistrovsky, { zkouska: "zlom", otisk: "fedcba9876543210" })), p, pocitadlo.over);
    expect((await telo(podvrh)).kod).toBe("otisk");
    expect([pocitadlo.beznych(), pocitadlo.zlomu()]).toEqual([1, 1]);
    // Poctivý zápis.
    const odpoved = await obsluzZebricek(posli(zapis(mistrovsky, { zkouska: "zlom", otisk: zlomovy })), p, pocitadlo.over);
    expect(odpoved.status).toBe(200);
    expect([pocitadlo.beznych(), pocitadlo.zlomu()]).toEqual([1, 1]);
    const o = nactiOdpovedNaZapis(await odpoved.json())!;
    const z = new Zkouska(uroven, mistrovsky, nasadaUrovne(uroven), undefined, undefined, ZKOUSKA_DO_ZLOMU);
    while (!z.hotovo) z.pokracuj(1);
    expect(o.moje.zlom?.hodnota).toBe(unosnostNaKorunu(z.vysledek().zlom!.celkem, cenaNavrhu(mistrovsky)));
    expect(o.moje.cena).toBeUndefined();
    expect(o.zebricek.miry.zlom.radky).toHaveLength(1);
    expect(o.zebricek.miry.cena.radky).toHaveLength(1);
    // Most, který běžnou zkouškou neprošel, do zlomu nesmí, i s pravým otiskem zlomu.
    const pad = RESENI["1-01"]!.pady[0]!.navrh;
    expect((await telo(await obsluzZebricek(posli(zapis(pad)), p, pocitadlo.over))).kod).toBe("neprosel");
    const spadly = await obsluzZebricek(posli(zapis(pad, { zkouska: "zlom", otisk: zkousej(pad, true) })), p, pocitadlo.over);
    expect((await telo(spadly)).kod).toBe("neprosel");
    expect([pocitadlo.beznych(), pocitadlo.zlomu()]).toEqual([2, 1]);
    expect((await poctyZebricku(p.sklad, "2026-11-24")).overeni).toBe(3);
  }, 60_000);

  it("most, který server už zná, nepřepočítává; strop na den se týká jen nových zkoušek", async () => {
    const sklad = new SkladVPameti();
    const pocitadlo = pocitajici();
    const p = server(sklad);
    expect((await obsluzZebricek(posli(zapis(mistrovsky)), p, pocitadlo.over)).status).toBe(200);
    expect((await obsluzZebricek(posli(zapis(mistrovsky, { hrac: BORIS, jmeno: "Boris" })), p, pocitadlo.over)).status).toBe(200);
    expect(pocitadlo.beznych()).toBe(1);
    // I odmítnutý most si server pamatuje: druhý pokus s ním nic nepočítá.
    const pad = RESENI["1-01"]!.pady[0]!.navrh;
    for (let i = 0; i < 3; i++) expect((await telo(await obsluzZebricek(posli(zapis(pad)), p, pocitadlo.over))).kod).toBe("neprosel");
    expect(pocitadlo.beznych()).toBe(2);
    // Strop: dnes už server počítal dost. Známý most projde, nový ne, a zlom známého mostu taky ne.
    await sklad.zapis("zebricek-den/2026-11-24.json", { overeni: NEJVIC_OVERENI_DENNE, prijato: 0, zlepseni: 0, odmitnuto: {} });
    expect((await obsluzZebricek(posli(zapis(mistrovsky)), p, pocitadlo.over)).status).toBe(200);
    const novy = await obsluzZebricek(posli(zapis(pruchozi)), p, pocitadlo.over);
    expect(novy.status).toBe(429);
    expect((await telo(novy)).kod).toBe("plno");
    const zlom = await obsluzZebricek(posli(zapis(mistrovsky, { zkouska: "zlom", otisk: "fedcba9876543210" })), p, pocitadlo.over);
    expect(zlom.status).toBe(429);
    expect((await telo(zlom)).kod).toBe("plno");
    expect([pocitadlo.beznych(), pocitadlo.zlomu()]).toEqual([2, 0]);
    // Zítra je nový den.
    expect((await obsluzZebricek(posli(zapis(pruchozi)), server(sklad, new Date("2026-11-25T00:00:01Z")), pocitadlo.over)).status).toBe(200);
  }, 60_000);

  it("jedna adresa si za den vyžádá jen omezený počet zkoušek; jiné adresy to nezastaví", async () => {
    const p = server();
    const zAdresy = (i: number, adresa: string): Promise<Response> =>
      obsluzZebricek(posli(zapis(mistrovsky, { kod: `kod-${i}`, otisk: "0".repeat(16), hrac: i.toString(16).padStart(32, "d") }), { "x-nf-client-connection-ip": adresa }), p, levny);
    for (let i = 0; i < NEJVIC_OVERENI_NA_ADRESU; i++) expect((await zAdresy(i, "203.0.113.7")).status, String(i)).toBe(200);
    const pres = await zAdresy(999, "203.0.113.7");
    expect(pres.status).toBe(429);
    expect((await telo(pres)).kod).toBe("adresa");
    // Most, který server už zná, strop adresy nestojí; jiná adresa počítá od nuly.
    expect((await zAdresy(3, "203.0.113.7")).status).toBe(200);
    expect((await zAdresy(1000, "198.51.100.9")).status).toBe(200);
    const pocty = await poctyZebricku(p.sklad, "2026-11-24");
    expect(pocty.overeni).toBe(NEJVIC_OVERENI_NA_ADRESU + 1);
    expect(pocty.odmitnuto.adresa).toBe(1);
    // Adresa se neukládá, jen její otisk; a druhý den má adresa čistý štít.
    expect(JSON.stringify([...(await p.sklad.klice("zebricek-adresa/"))])).not.toContain("203.0.113.7");
    expect((await obsluzZebricek(posli(zapis(mistrovsky, { kod: "kod-2000", otisk: "0".repeat(16) }), { "x-nf-client-connection-ip": "203.0.113.7" }), server(p.sklad, new Date("2026-11-25T08:00:00Z")), levny)).status).toBe(200);
  });

  it("zkouška se do stropu počítá dřív, než se pustí, a pád výpočtu zápis neprojde", async () => {
    const p = server();
    const padajici: Overovac = {
      ...levny,
      bezna: () => {
        throw new Error("výpočet spadl");
      },
    };
    await expect(obsluzZebricek(posli(zapis(mistrovsky, { kod: "kod-1", otisk: "0".repeat(16) })), p, padajici)).rejects.toThrow();
    expect((await poctyZebricku(p.sklad, "2026-11-24")).overeni).toBe(1);
    expect((await zebricek(p)).miry.cena.radky).toEqual([]);
    // Skutečný ověřovač výpočet, který spadne, chytí sám: most pak prostě neplatí.
    expect(over.bezna(uroven, "tohle-neni-most")).toEqual({ plati: false, otisk: "", cena: 0, hmotnost: 0 });
    expect(over.zlom(uroven, "tohle-neni-most")).toBeNull();
    expect(over.priprav(uroven, "tohle-neni-most")).toEqual({ stav: "most" });
    expect(over.priprav(uroven, zakodujMost(RESENI["1-02"]!.pruchod))).toEqual({ stav: "pravidla" });
  });

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

  it("když se zápis s podmínkou nepovede ani po opakování, server nic nepřepíše a řekne to", async () => {
    const sklad = new SkladVPameti();
    await obsluzZebricek(posli(zapis(pruchozi, { hrac: BORIS, jmeno: "Boris" })), server(sklad), over);
    let pokusu = 0;
    const zaseknuty: SkladZaznamu = {
      cti: (k) => sklad.cti(k),
      zapis: (k, h) => {
        // Žebříček se nikdy nezapisuje bez podmínky.
        expect(k.startsWith("zebricek/")).toBe(false);
        return sklad.zapis(k, h);
      },
      smaz: (k) => sklad.smaz(k),
      klice: (x) => sklad.klice(x),
      slozky: (x) => sklad.slozky(x),
      ctiSeZnackou: (k) => sklad.ctiSeZnackou(k),
      zapisPokud: (k, h, znacka) => (k.startsWith("zebricek/") ? (pokusu++, Promise.resolve(false)) : sklad.zapisPokud(k, h, znacka)),
    };
    const odpoved = await obsluzZebricek(posli(zapis(mistrovsky)), server(zaseknuty), over);
    expect(odpoved.status).toBe(503);
    expect((await telo(odpoved)).kod).toBe("soubeh");
    expect(pokusu).toBeGreaterThan(1);
    expect((await zebricek(server(sklad))).miry.cena.radky.map((r) => r.jmeno)).toEqual(["Boris"]);
  }, 60_000);
});

describe("správa žebříčků", () => {
  it("správce vidí řádky i s mostem a umí smazat zápisy hráče", async () => {
    const p = server();
    await obsluzZebricek(posli(zapis(mistrovsky)), p, over);
    await obsluzZebricek(posli(zapis(pruchozi, { hrac: BORIS, jmeno: "Sprostak" })), p, over);
    const prehled = await zebrickyProSpravu(p.sklad, VERZE_FYZIKY);
    expect(prehled).toHaveLength(1);
    expect(prehled[0]!.uroven).toBe("1-01");
    expect(prehled[0]!.radky.filter((r) => r.mira === "cena").map((r) => r.jmeno).sort()).toEqual(["Anna", "Sprostak"]);
    const radek = prehled[0]!.radky.find((r) => r.jmeno === "Sprostak")!;
    expect(radek.znacka).toBe(znackaHrace(BORIS, "1-01"));
    expect(await mostZeZebricku(p.sklad, prehled[0]!.klic, radek.most)).toBe(zakodujMost(pruchozi));
    expect(await mostZeZebricku(p.sklad, "zebricek/../neco.json", radek.most)).toBeNull();
    // Smazání podle veřejné značky: v jiné úrovni nic, v téhle oba zápisy (cena i hmotnost).
    expect(await smazZeZebricku(p.sklad, VERZE_FYZIKY, znackaHrace(BORIS, "1-01"), "1-02")).toBe(0);
    expect(await smazZeZebricku(p.sklad, VERZE_FYZIKY, znackaHrace(BORIS, "1-02"), "1-01")).toBe(0);
    expect(await smazZeZebricku(p.sklad, VERZE_FYZIKY, znackaHrace(BORIS, "1-01"), "1-01")).toBe(2);
    const z = await zebricek(p);
    expect(z.miry.cena.radky.map((r) => r.jmeno)).toEqual(["Anna"]);
    expect(z.miry.hmotnost.radky.map((r) => r.jmeno)).toEqual(["Anna"]);
  }, 60_000);
});

describe("verze pravidel žebříčků", () => {
  it("katalog se nezměnil bez zvýšení VERZE_ZEBRICKU", () => {
    // Ceny, hmotnosti a pevnosti prvků rozhodují o hodnotách v žebříčku i o tom, který most
    // projde. Verze fyziky změnu ceníku nepozná (otisk zkoušky cenu nenese): když tenhle test
    // ohlásí jiný otisk katalogu, zvyš `VERZE_ZEBRICKU` v `src/data/zebricek.ts` (žebříčky
    // začnou od nuly) a zapiš sem novou dvojici.
    let h = 0x811c9dc5;
    const text = JSON.stringify({ KATALOG, MATERIALY, PIST, ZAMEK, LADENY_TLUMIC, CENA_SVARU, CENA_ZAVAZI });
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    expect({ verze: VERZE_ZEBRICKU, katalog: (h >>> 0).toString(16).padStart(8, "0") }).toEqual({ verze: 1, katalog: "4f038ab7" });
  });
});
