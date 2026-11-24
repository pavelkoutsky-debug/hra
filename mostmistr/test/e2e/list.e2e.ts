// Milník M14 v bezhlavém prohlížeči: galerie mostů hráče a závěrečný list kampaně. Po
// poslední úrovni se ukáže souhrn s mosty hráče; do té doby je to průběžný přehled „Moje mosty“.
import { mkdirSync, statSync } from "node:fs";
import { chromium, devices, type Browser, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cenaNavrhu } from "../../src/data/cena";
import { navrhNaText, type NavrhMostu } from "../../src/data/navrh";
import { prazdneUlozeni, ulozeniNaText, vylepsiRekord } from "../../src/data/ulozeni";
import { VERZE_FYZIKY } from "../../src/jadro/verze";
import { nactiKampan } from "../../urovne/index";
import { RESENI } from "../../urovne/reseni";
import { prijimejDenik } from "./server-deniku";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
const kampan = nactiKampan();

let server: PreviewServer;
let prohlizec: Browser;
let adresa: string;
const chyby: string[] = [];
const kontexty: BrowserContext[] = [];

const bezMezer = (text: string): string => text.replace(/[  ]/g, " ");
const koruny = (castka: number): string => `${Math.round(castka).toLocaleString("cs-CZ").replace(/[  ]/g, " ")} Kč`;

async function cistaStranka(volby: Parameters<Browser["newContext"]>[0] = {}): Promise<Page> {
  const kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, ...volby });
  kontexty.push(kontext);
  const stranka = await kontext.newPage();
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
  return stranka;
}

const udaj = async (s: Page, jmeno: string): Promise<string> => bezMezer(await s.locator(`[data-udaj="${jmeno}"]`).innerText());
const telo = (s: Page, atribut: string): Promise<string | null> => s.locator("body").getAttribute(`data-${atribut}`);
const karta = (s: Page, id: string) => s.locator(`#obrazovka-list [data-uroven="${id}"]`);
const stavKarty = async (s: Page, id: string): Promise<string> => bezMezer(await karta(s, id).locator(".karta__stav").innerText());

/** Načte most do úrovně a (když `zkouset`) ho pustí zkouškou až do výsledku. */
async function postav(s: Page, id: string, navrh: NavrhMostu, zkouset: boolean): Promise<void> {
  await s.goto(`${adresa}?uroven=${id}`);
  await s.locator(PLATNO).waitFor();
  const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await zavrit.count()) > 0) await zavrit.click();
  await s.locator('[data-akce="import"]').click();
  await s.locator("#okno-obsah").fill(navrhNaText(navrh));
  await s.locator('[data-akce="okno-nacist"]').click();
  if (!zkouset) return;
  await s.locator(PLATNO).focus();
  await s.keyboard.press("Space");
  await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
  expect(await telo(s, "zkouska")).toBe("hotovo");
}

async function otevriList(s: Page): Promise<void> {
  await s.goto(`${adresa}?list`);
  await s.locator('body[data-rezim="list"]').waitFor();
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4214, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prijimejDenik(server);
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
});

afterAll(async () => {
  for (const kontext of kontexty) await kontext.close();
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("galerie mostů a závěrečný list", () => {
  it("galerie si pamatuje nejlepší most, který úrovní prošel, a přehled na ni vede", async () => {
    const s = await cistaStranka();
    await s.goto(adresa);
    await s.locator('body[data-rezim="prehled"]').waitFor();
    // Dokud není nic projito, odkaz na mosty v přehledu není.
    expect(await s.locator('[data-akce="otevrit-list"]').isVisible()).toBe(false);

    const pruchod = RESENI["1-01"]!.pruchod;
    const mistrovska = RESENI["1-01"]!.mistrovska;
    await postav(s, "1-01", pruchod, true);
    await otevriList(s);
    expect(await telo(s, "list")).toBe("prubezny");
    expect(await telo(s, "list-mostu")).toBe("1");
    expect(await karta(s, "1-01").getAttribute("data-puvod")).toBe("galerie");
    expect(await stavKarty(s, "1-01")).toBe(`◆ ◇ ◇ · ${koruny(cenaNavrhu(pruchod))}`);

    // Lepší most (víc medailí) ten horší v galerii nahradí; horší po něm už ne.
    await postav(s, "1-01", mistrovska, true);
    await postav(s, "1-01", pruchod, true);
    // Rozestavěný most jiné úrovně list ukáže, ale mezi postavené ho nepočítá.
    const rozestaveny = RESENI["1-02"]!.pruchod;
    await postav(s, "1-02", rozestaveny, false);

    await s.goto(adresa);
    await s.locator('body[data-rezim="prehled"]').waitFor();
    const odkaz = s.locator('[data-akce="otevrit-list"]');
    expect(await odkaz.innerText()).toBe("Moje mosty ▸");
    await odkaz.click();
    await s.locator('body[data-rezim="list"]').waitFor();
    expect(await udaj(s, "list-nadpis")).toBe("Moje mosty");
    expect(await udaj(s, "list-veta")).toBe(`Projito 1 z ${kampan.length} úrovní. Až projdeš všechny, stane se z téhle stránky závěrečný list kampaně.`);
    expect(await telo(s, "list-mostu")).toBe("1");
    expect(await stavKarty(s, "1-01")).toBe(`◆ ◆ ◆ · ${koruny(cenaNavrhu(mistrovska))}`);
    expect(await karta(s, "1-02").getAttribute("data-puvod")).toBe("rozestaveny");
    expect(await stavKarty(s, "1-02")).toBe(`rozestavěný · ${koruny(cenaNavrhu(rozestaveny))}`);
    expect(await karta(s, "1-03").getAttribute("data-puvod")).toBe("zadny");
    expect(await stavKarty(s, "1-03")).toBe("zatím bez mostu");
    // Karet je tolik, kolik má kampaň úrovní, a každá má nakreslený náhled.
    expect(await s.locator("#obrazovka-list .karta").count()).toBe(kampan.length);
    const cisla = bezMezer(await s.locator('[data-udaj="list-cisla"]').innerText());
    expect(cisla).toContain(`1 z ${kampan.length}`);
    expect(cisla).toContain(`3 z ${3 * kampan.length}`);
    expect(cisla).toContain(koruny(cenaNavrhu(mistrovska)));
    expect(cisla).toContain("8,00 m");
    // V galerii je most pro mistrovskou, i když na výkresu teď leží ten horší: karta vede do úrovně.
    await s.screenshot({ path: `${SLOZKA}/l1-moje-mosty.png` });
    await karta(s, "1-01").locator("a").click();
    await s.locator(PLATNO).waitFor();
    expect(await udaj(s, "list")).toBe("1-01");
  }, 300_000);

  it("úroveň projitá dřív, než hra galerii vedla, most nemá a list to přizná", async () => {
    const s = await cistaStranka();
    await s.goto(adresa);
    const ulozeni = prazdneUlozeni();
    ulozeni.rekordy["1-03"] = vylepsiRekord(undefined, { pruchod: true, rozpocet: false, mistrovska: false }, 100_400, VERZE_FYZIKY, 3600);
    await s.evaluate((zapis) => window.localStorage.setItem("mostmistr.ulozeni", zapis), ulozeniNaText(ulozeni));
    await otevriList(s);
    expect(await telo(s, "list-mostu")).toBe("0");
    expect(await stavKarty(s, "1-03")).toBe("zatím bez mostu");
    expect(await s.locator('[data-udaj="list-poznamka"]').isVisible()).toBe(true);
    expect(await udaj(s, "list-poznamka")).toContain("projdi je znovu a most se doplní");
    // Poškozená galerie list nezastaví.
    await s.evaluate(() => window.localStorage.setItem("mostmistr.galerie", "{rozbité"));
    await otevriList(s);
    expect(await telo(s, "list")).toBe("prubezny");
  }, 60_000);

  it("po projití celé kampaně je z toho závěrečný list; jde stáhnout jako obrázek", async () => {
    const s = await cistaStranka({ acceptDownloads: true });
    await s.goto(adresa);
    // Postup, ve kterém jsou projité všechny úrovně kromě poslední; tu projde test opravdu.
    const posledni = kampan.at(-1)!;
    const ulozeni = prazdneUlozeni();
    for (const uroven of kampan.slice(0, -1)) {
      ulozeni.rekordy[uroven.id] = vylepsiRekord(undefined, { pruchod: true, rozpocet: true, mistrovska: false }, cenaNavrhu(RESENI[uroven.id]!.rozpocet), VERZE_FYZIKY, 1000);
    }
    await s.evaluate((zapis) => window.localStorage.setItem("mostmistr.ulozeni", zapis), ulozeniNaText(ulozeni));
    await postav(s, posledni.id, RESENI[posledni.id]!.pruchod, true);
    await s.locator('[data-akce="na-konec"]').click();
    await s.locator(".vysledek").waitFor({ state: "visible" });
    // Kritérium milníku: po poslední úrovni se ukáže souhrn s mosty hráče.
    const dalsi = s.locator('[data-akce="dalsi"]');
    expect(await dalsi.getAttribute("data-dokoncena")).toBe("true");
    expect(await dalsi.innerText()).toBe("Kampaň dokončena · závěrečný list");
    await dalsi.click();
    await s.locator('body[data-rezim="list"]').waitFor();
    expect(await telo(s, "list")).toBe("dokonceno");
    expect(await udaj(s, "list-nadpis")).toBe("Závěrečný list");
    expect(await udaj(s, "list-veta")).toMatch(new RegExp(`^Kampaň dokončena: všech ${kampan.length} úrovní je projitých\\. List vystaven \\d+\\. \\d+\\. \\d{4}\\.$`));
    expect(await karta(s, posledni.id).getAttribute("data-puvod")).toBe("galerie");
    await s.screenshot({ path: `${SLOZKA}/l2-zaverecny-list.png` });

    const [stazeni] = await Promise.all([s.waitForEvent("download"), s.locator('[data-akce="list-obrazek"]').click()]);
    expect(stazeni.suggestedFilename()).toBe("mostmistr-list.png");
    const soubor = `${SLOZKA}/l2-list.png`;
    await stazeni.saveAs(soubor);
    expect(statSync(soubor).size).toBeGreaterThan(100_000);
    expect(await udaj(s, "list-hlaseni")).toBe("List se stahuje jako obrázek.");
    // Plátno listu má pevnou šířku a výšku podle počtu kapitol.
    const rozmer = await s.locator('[data-udaj="list-platno"]').evaluate((c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height]);
    expect(rozmer[0]).toBe(1600);
    expect(rozmer[1]!).toBeGreaterThan(1500);

    // Přehled teď na list odkazuje jako na závěrečný.
    await s.locator("#obrazovka-list .lista a.tlacitko").click();
    await s.locator('body[data-rezim="prehled"]').waitFor();
    expect(await s.locator('[data-akce="otevrit-list"]').innerText()).toBe("Závěrečný list ▸");
  }, 300_000);

  it("na telefonu list nepřetéká a anglicky je přeložený", async () => {
    const telefon = await cistaStranka({ ...devices["iPhone 13"], locale: "cs-CZ", deviceScaleFactor: undefined });
    await telefon.goto(adresa);
    const ulozeni = prazdneUlozeni();
    ulozeni.rekordy["1-01"] = vylepsiRekord(undefined, { pruchod: true, rozpocet: false, mistrovska: false }, 33_133, VERZE_FYZIKY, 950);
    await telefon.evaluate((zapis) => window.localStorage.setItem("mostmistr.ulozeni", zapis), ulozeniNaText(ulozeni));
    await otevriList(telefon);
    const sirky = await telefon.evaluate(() => ({ okno: window.innerWidth, stranka: document.documentElement.scrollWidth, list: document.querySelector(".list")!.scrollWidth }));
    expect(sirky.stranka).toBeLessThanOrEqual(sirky.okno);
    expect(sirky.list).toBeLessThanOrEqual(sirky.okno);
    await telefon.screenshot({ path: `${SLOZKA}/l3-telefon.png` });

    const en = await cistaStranka({ locale: "en-US" });
    await en.goto(adresa);
    await en.evaluate((zapis) => window.localStorage.setItem("mostmistr.ulozeni", zapis), ulozeniNaText(ulozeni));
    await otevriList(en);
    expect(await udaj(en, "list-nadpis")).toBe("My bridges");
    const text = (await en.locator("#obrazovka-list").innerText()).replace(/Kč/g, "");
    expect(text).not.toMatch(/[ěščřžýáíéúůťďňĚŠČŘŽÝÁÍÉÚŮŤĎŇ]/);
  }, 120_000);

  it("během prohlížení listu prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
