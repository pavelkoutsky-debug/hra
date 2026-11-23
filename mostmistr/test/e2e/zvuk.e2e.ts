// Zvuk v bezhlavém prohlížeči. Kritérium milníku M3z: bez gesta hráče hra nevydá ani tón,
// zřícení mostu je slyšet, ztlumení se pamatuje a každý zvuk jde spočítat a není němý.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { prijimejDenik } from "./server-deniku";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText, type NavrhMostu } from "../../src/data/navrh";
import type { Udalost } from "../../src/zkouska/protokol";
import { Zaznam } from "../../src/zkouska/zaznam";
import { Zkouska } from "../../src/zkouska/zkouska";
import { DRUHY_ZVUKU, Poslech, type ZdrojDeje, type Zvuk } from "../../src/zvuk/deje";
import type { MereniDeje } from "../../src/zvuk/mereni";
import { nactiKampan, nasadaUrovne } from "../../urovne/index";
import { RESENI } from "../../urovne/reseni";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);
const zaznelo = async (druh: string): Promise<number> => Number(await telo(`zvuku-${druh}`));

interface Spion {
  __kontextu: number;
  __startu: number;
}

/** Kolik zvukových kontextů stránka vytvořila a kolik zdrojů zvuku v nich spustila. */
const spion = (): Promise<Spion> =>
  stranka.evaluate(() => {
    const w = window as unknown as Spion;
    return { __kontextu: w.__kontextu, __startu: w.__startu };
  });

async function otevriUroven(id: string): Promise<void> {
  await stranka.goto(`${adresa}?uroven=${id}`);
  await stranka.locator("#obrazovka-uroven canvas.vykres__platno").waitFor();
  await expect.poll(() => stranka.locator('[data-udaj="fyzika"]').innerText(), { timeout: 5000 }).toMatch(/^v\d+$/);
}

async function zavriZadani(): Promise<void> {
  const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

async function nactiMost(text: string): Promise<void> {
  await akce("import").click();
  await stranka.locator("#okno-obsah").fill(text);
  await akce("okno-nacist").click();
}

/** Pustí zkoušku a nechá ji čtyřnásobnou rychlostí dohrát až k výsledku. */
async function prehrajZkousku(): Promise<void> {
  await stranka.locator("#obrazovka-uroven canvas.vykres__platno").focus();
  await stranka.keyboard.press("Space");
  // Tlačítka rychlosti jsou na časové ose, která je vidět až při zkoušce.
  await stranka.locator('#obrazovka-uroven [data-rychlost="4"]').click();
  await stranka.locator(".vysledek").waitFor({ state: "visible", timeout: 90_000 });
}

/** Spočítá zkoušku v Node a vrátí vše, co při jejím přehrání zazní, jako ve hře po snímcích obrazu. */
function zvukyZkousky(idUrovne: string, navrh: NavrhMostu): { zvuky: Zvuk[]; trvani: number; xOd: number; xDo: number } {
  const uroven = nactiKampan().find((u) => u.id === idUrovne)!;
  const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
  const zaznam = new Zaznam();
  const udalosti: Udalost[] = [];
  while (!zkouska.hotovo) {
    const davka = zkouska.pokracuj(1);
    for (const stavba of davka.topologie) zaznam.pridejTopologii(stavba);
    for (const snimek of davka.snimky) zaznam.pridej(snimek);
    udalosti.push(...davka.udalosti);
  }
  const zdroj: ZdrojDeje = { zaznam, ucastnici: zkouska.ucastnici, udalosti };
  const poslech = new Poslech(uroven, navrh);
  const zvuky: Zvuk[] = [];
  for (let cas = 0; cas <= zaznam.konec + 1 / 60; cas += 1 / 60) {
    for (const zvuk of poslech.posun(zdroj, cas)) zvuky.push({ ...zvuk });
  }
  return { zvuky, trvani: zaznam.konec, xOd: uroven.vyrez.xMin, xDo: uroven.vyrez.xMax };
}

/** Nechá stránku se zvuky spočítat děj do paměti přes stejný omezovač, jaký má hra. */
function zmerDej(dej: ReturnType<typeof zvukyZkousky>): Promise<MereniDeje> {
  return stranka.evaluate(
    ({ zvuky, trvani, xOd, xDo }) =>
      (window as unknown as { mostmistrZvuky: { zmerDej: (z: Zvuk[], t: number, a: number, b: number) => Promise<MereniDeje> } }).mostmistrZvuky.zmerDej(
        zvuky,
        trvani,
        xOd,
        xDo,
      ),
    dej,
  );
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4196, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prijimejDenik(server);
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
  stranka = await prohlizec.newPage({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
  // Špion: počítá skutečné zvukové kontexty a spuštěné zdroje. Výpočty do paměti nepočítá.
  await stranka.addInitScript(() => {
    const w = window as unknown as Spion;
    w.__kontextu = 0;
    w.__startu = 0;
    const Puvodni = window.AudioContext;
    window.AudioContext = class extends Puvodni {
      constructor(volby?: AudioContextOptions) {
        super(volby);
        w.__kontextu++;
      }
    };
    for (const trida of [AudioScheduledSourceNode, AudioBufferSourceNode]) {
      const puvodni = trida.prototype.start;
      trida.prototype.start = function (this: AudioScheduledSourceNode, ...argumenty: number[]) {
        if (this.context instanceof Puvodni) w.__startu++;
        return (puvodni as (...a: number[]) => void).apply(this, argumenty);
      };
    }
  });
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("zvuk ve hře", () => {
  it("před prvním gestem hráče hra o zvuk vůbec nežádá, ani když běží ukázka v zadání", async () => {
    await otevriUroven("1-01");
    // Úroveň vítá oknem se zadáním a v něm se hýbe ukázka dvou mostů.
    await stranka.locator('#okno-zadani[open] [data-udaj="ukazka"][data-stav="hraje"]').waitFor({ timeout: 30_000 });
    await stranka.waitForTimeout(600);
    expect(await spion()).toEqual({ __kontextu: 0, __startu: 0 });
    // Zvuky jsou zatím pracovní, proto hra začíná potichu.
    expect(await telo("zvuk")).toBe("potichu");
    expect(await telo("zvuk-kontext")).toBe("zadny");
    expect(await akce("zvuk").innerText()).toBe("Zvuk: potichu");
    for (const druh of DRUHY_ZVUKU) expect(await zaznelo(druh)).toBe(0);
  });

  it("stavění mostu je potichu; zvuk vznikne až se spuštěním zkoušky", async () => {
    // Samotná mostovka přes hluboké údolí: složí se hned a obě auta, která vyjíždějí v čase 0,
    // do ní vjedou (v 1-03 jede první auto až ve 12,5 s, dlouho po výsledku).
    await otevriUroven("1-04");
    await zavriZadani();
    await nactiMost(navrhNaText(RESENI["1-04"]!.pady.find((p) => p.nazev === "jen mostovka")!.navrh));
    expect(await spion()).toEqual({ __kontextu: 0, __startu: 0 });
    await stranka.screenshot({ path: `${SLOZKA}/60-zvuk-v-liste.png` });
  });

  it("zřícení mostu je slyšet: zlomy, sjetí z ložiska, šplouchnutí a kola na spárách", async () => {
    await prehrajZkousku();
    expect(await telo("zvuk-kontext")).toBe("running");
    expect((await spion()).__kontextu).toBe(1);
    expect(await zaznelo("zlom")).toBeGreaterThanOrEqual(1);
    expect(await zaznelo("sjeti")).toBe(1);
    expect(await zaznelo("splouchnuti")).toBeGreaterThanOrEqual(2);
    expect(await zaznelo("spara")).toBeGreaterThanOrEqual(2);
    expect((await spion()).__startu).toBeGreaterThan(40);
    expect(await stranka.locator('[data-udaj="vysledek-nadpis"]').innerText()).toBe("MOST NEOBSTÁL");
  });

  it("skok po časové ose a krokování zpět jsou potichu", async () => {
    // Po výsledku přehrávání běží dál a hraje (auta dojíždějí k propadlé mostovce). Skoky se
    // zkoušejí na zastaveném záznamu, ať se do počtů nepřimíchá zvuk z běžícího děje.
    if ((await akce("prehrat").innerText()).includes("Pozastavit")) await akce("prehrat").click();
    expect(await akce("prehrat").innerText()).toContain("Přehrát");
    const pred = await spion();
    const zlomu = await zaznelo("zlom");
    await stranka.locator("#cas").evaluate((tahlo) => {
      (tahlo as HTMLInputElement).value = "0.2";
      tahlo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await akce("na-konec").click();
    await akce("krok-zpet").click();
    await stranka.waitForTimeout(300);
    expect(await zaznelo("zlom")).toBe(zlomu);
    expect((await spion()).__startu).toBe(pred.__startu);
  });

  it("klávesa Z zvuk vypne; vypnutý zvuk nic nehraje", async () => {
    await stranka.locator("#obrazovka-uroven canvas.vykres__platno").focus();
    await stranka.keyboard.press("z");
    expect(await telo("zvuk")).toBe("vypnuto");
    expect(await akce("zvuk").innerText()).toBe("Zvuk: vypnutý");
    expect(await akce("zvuk").getAttribute("aria-pressed")).toBe("false");
    await stranka.waitForTimeout(300);

    const pred = await spion();
    const pocty = await Promise.all(DRUHY_ZVUKU.map(zaznelo));
    await akce("prehrat-znovu").click();
    await stranka.locator(".vysledek").waitFor({ state: "hidden" });
    await stranka.locator(".vysledek").waitFor({ state: "visible", timeout: 90_000 });
    expect(await Promise.all(DRUHY_ZVUKU.map(zaznelo))).toEqual(pocty);
    expect((await spion()).__startu).toBe(pred.__startu);
  });

  it("ztlumení se pamatuje: po novém načtení hra mlčí a o zvuk nežádá ani při zkoušce", async () => {
    await stranka.reload();
    await stranka.locator("#obrazovka-uroven canvas.vykres__platno").waitFor();
    expect(await telo("zvuk")).toBe("vypnuto");
    expect(await akce("zvuk").innerText()).toBe("Zvuk: vypnutý");
    await prehrajZkousku();
    expect(await spion()).toEqual({ __kontextu: 0, __startu: 0 });
    expect(await zaznelo("zlom")).toBe(0);
  });

  it("tlačítko v liště zvuk zase zapne a hned ho předvede", async () => {
    await akce("zvuk").click();
    expect(await telo("zvuk")).toBe("nahlas");
    await expect.poll(() => zaznelo("vrzani")).toBe(1);
    expect((await spion()).__kontextu).toBe(1);
    expect((await spion()).__startu).toBeGreaterThan(0);
    // Přehrání téhož záznamu znovu je teď slyšet.
    await akce("prehrat-znovu").click();
    await stranka.locator(".vysledek").waitFor({ state: "hidden" });
    await stranka.locator(".vysledek").waitFor({ state: "visible", timeout: 90_000 });
    expect(await zaznelo("zlom")).toBeGreaterThanOrEqual(1);
    expect(await zaznelo("splouchnuti")).toBeGreaterThanOrEqual(2);
    // Další stisk klávesy Z ztiší; i tichou hlasitost hra předvede vrznutím.
    const vrznuti = await zaznelo("vrzani");
    await stranka.locator("#obrazovka-uroven canvas.vykres__platno").focus();
    await stranka.keyboard.press("z");
    expect(await telo("zvuk")).toBe("potichu");
    expect(await akce("zvuk").innerText()).toBe("Zvuk: potichu");
    await expect.poll(() => zaznelo("vrzani")).toBe(vrznuti + 1);
  });

  it("pevný most s chodci: jsou slyšet kroky a nic se neláme", async () => {
    await otevriUroven("1-01");
    await zavriZadani();
    await nactiMost(navrhNaText(RESENI["1-01"]!.pruchod));
    await prehrajZkousku();
    expect(await zaznelo("krok")).toBeGreaterThan(10);
    for (const druh of ["zlom", "sjeti", "splouchnuti", "dopad", "lupnuti"]) expect(await zaznelo(druh)).toBe(0);
    expect(await stranka.locator('[data-udaj="vysledek-nadpis"]').innerText()).toBe("MOST OBSTÁL");
  });
});

describe("stránka se zvuky", () => {
  it("každý zvuk jde spočítat: není němý, nepřebudí výstup a včas dozní", async () => {
    await stranka.goto(`${adresa}zvuky.html`);
    await stranka.locator("body[data-stav]").waitFor({ timeout: 60_000 });
    expect(await telo("stav")).toBe("hotovo");
    const radky = await stranka.locator("#mereni tbody tr").evaluateAll((trs) =>
      trs.map((tr) => {
        const d = (tr as HTMLElement).dataset;
        return { zvuk: d.zvuk!, spicka: Number(d.spicka), rms: Number(d.rms), delka: Number(d.delka), jas: Number(d.jas), platne: d.platne };
      }),
    );
    expect(radky.length).toBeGreaterThanOrEqual(20);
    const podle = new Map(radky.map((r) => [r.zvuk, r]));
    // Na stránce je každý druh zvuku, který hra umí.
    for (const druh of DRUHY_ZVUKU) expect(radky.some((r) => r.zvuk === druh || r.zvuk.startsWith(`${druh}-`)), druh).toBe(true);
    for (const r of radky) {
      expect(r.platne, r.zvuk).toBe("true");
      expect(r.spicka, r.zvuk).toBeGreaterThan(0.05);
      expect(r.spicka, r.zvuk).toBeLessThan(0.95);
      expect(r.rms, r.zvuk).toBeGreaterThan(0.005);
      expect(r.delka, r.zvuk).toBeGreaterThan(0.01);
      expect(r.delka, r.zvuk).toBeLessThan(2.5);
    }
    // Zvuky se od sebe liší tak, jak mají: zlom je hlasitější než vrzání a krok, lupnutí
    // kratší a ostřejší než vrzání, ocel zní déle než dřevo, auto šplouchne déle než člověk.
    const m = (id: string) => podle.get(id)!;
    expect(m("zlom-drevo").spicka).toBeGreaterThan(2 * m("vrzani-drevo").spicka);
    expect(m("zlom-drevo").spicka).toBeGreaterThan(2 * m("krok-chodec").spicka);
    expect(m("lupnuti-drevo").delka).toBeLessThan(0.3 * m("vrzani-drevo").delka);
    expect(m("lupnuti-drevo").jas).toBeGreaterThan(2 * m("vrzani-drevo").jas);
    expect(m("zlom-ocel").delka).toBeGreaterThan(2 * m("zlom-drevo").delka);
    expect(m("vrzani-ocel").jas).toBeLessThan(m("vrzani-drevo").jas);
    expect(m("splouchnuti-auto").delka).toBeGreaterThan(m("splouchnuti-clovek").delka);
    expect(m("krok-utvar").spicka).toBeGreaterThan(m("krok-bezec").spicka);
    expect(m("krok-bezec").spicka).toBeGreaterThan(m("krok-chodec").spicka);
    expect(m("spara-auto").jas).toBeLessThan(m("spara-kolo").jas);
    expect(m("dopad-trosky").jas).toBeLessThan(500);
    await stranka.screenshot({ path: `${SLOZKA}/61-stranka-se-zvuky.png`, fullPage: true });
  });

  it("měření zvuk nepouští; pustí ho až kliknutí na tlačítko", async () => {
    expect(await spion()).toEqual({ __kontextu: 0, __startu: 0 });
    await stranka.locator('[data-zvuk="zlom-drevo"]').first().click();
    expect(await telo("pusteno")).toBe("1");
    const po = await spion();
    expect(po.__kontextu).toBe(1);
    expect(po.__startu).toBeGreaterThan(4);
    await stranka.locator('[data-dej="zriceni"]').click();
    expect((await spion()).__startu).toBeGreaterThan(po.__startu + 20);
  });

  it("celé zkoušky znějí dohromady rozumně: zřícení je nejhlasitější a nic nepřebudí výstup", async () => {
    const deje = {
      chodci: zvukyZkousky("1-01", RESENI["1-01"]!.pruchod),
      auto: zvukyZkousky("1-03", RESENI["1-03"]!.pruchod),
      zriceni: zvukyZkousky("1-04", RESENI["1-04"]!.pady.find((p) => p.nazev === "lehká příhrada přes celé údolí")!.navrh),
      pochod: zvukyZkousky("2-03", RESENI["2-03"]!.pruchod),
    };
    const mereni: Record<string, MereniDeje> = {};
    for (const [jmeno, dej] of Object.entries(deje)) {
      mereni[jmeno] = await zmerDej(dej);
    }
    for (const [jmeno, m] of Object.entries(mereni)) {
      expect(m.platne, jmeno).toBe(true);
      // Omezovač drží výstup pod plným rozsahem a zaobluje jen výjimečně.
      expect(m.spicka, jmeno).toBeLessThan(0.95);
      expect(m.omezeno, jmeno).toBeLessThan(0.02);
      expect(m.rms, jmeno).toBeGreaterThan(0.01);
    }
    // Chodci jsou tiché pozadí, auto a pochod jsou znát, zřícení je přehluší.
    expect(mereni.zriceni!.nejhlasitejsiSekunda).toBeGreaterThan(2 * mereni.auto!.nejhlasitejsiSekunda);
    expect(mereni.zriceni!.nejhlasitejsiSekunda).toBeGreaterThan(2 * mereni.pochod!.nejhlasitejsiSekunda);
    expect(mereni.auto!.nejhlasitejsiSekunda).toBeGreaterThan(mereni.chodci!.nejhlasitejsiSekunda);
    expect(mereni.pochod!.rms).toBeGreaterThan(mereni.chodci!.rms);
    // Při přehrávání obvyklou rychlostí se u řídkého provozu skoro žádný zvuk nevynechá (v 1-03
    // jede dodávka těsně za autem: pár spár a drncnutí padne do stejných setin sekundy).
    expect(mereni.auto!.vynechano + mereni.pochod!.vynechano).toBeLessThan(8);
    // Šestatřicet lidí na osmi metrech lávky šlape přes sebe: kroky do dvou setin sekundy po
    // jiném kroku by splynuly a syntezátor je vynechává záměrně. Většina kroků ale zazní.
    expect(mereni.chodci!.zahrano).toBeGreaterThan(150);
    expect(mereni.chodci!.vynechano / (mereni.chodci!.zahrano + mereni.chodci!.vynechano)).toBeLessThan(0.35);
  }, 180_000);

  it("ze zkušebny na stránku vede odkaz", async () => {
    await stranka.goto(`${adresa}zkusebna.html`);
    await stranka.locator('a[href="/zvuky.html"]').click();
    await stranka.locator("#mereni").waitFor();
  });

  it("za celý průchod stránka nenahlásila žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
