// Milník M15 v bezhlavém prohlížeči: Havarijní komise. Přehled nabízí případy, případ začíná
// mostem, který spadl, oprava se počítá po změnách a uzavřený případ ukáže nález komise.
// Mosty se berou z případů samých (`urovne/havarie/`), takže test přežije jejich ladění.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cenaNavrhu } from "../../src/data/cena";
import { NEJVIC_ZMEN_OPRAVY, stavOpravy } from "../../src/data/havarie";
import { navrhNaText, type NavrhMostu } from "../../src/data/navrh";
import { prazdneUlozeni, ulozeniNaText, vylepsiRekord } from "../../src/data/ulozeni";
import { pridejPrut } from "../../src/editor/upravy";
import { VERZE_FYZIKY } from "../../src/jadro/verze";
import { PRIPADY } from "../../urovne/havarie/index";
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

const bezMezer = (text: string): string => text.replace(/[  ]/g, " ");

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
const akce = (s: Page, jmeno: string) => s.locator(`[data-akce="${jmeno}"]`);
const karta = (s: Page, id: string) => s.locator(`[data-udaj="prehled-komise"] .pripad[data-pripad="${id}"]`);

/** Postup, ve kterém je projitá první úroveň každé kapitoly: všechny případy jsou otevřené. */
function postupSKapitolami(): string {
  const ulozeni = prazdneUlozeni();
  for (const kapitola of new Set(kampan.map((u) => u.id.split("-")[0]!))) {
    const prvni = kampan.find((u) => u.id.startsWith(`${kapitola}-`))!;
    ulozeni.rekordy[prvni.id] = vylepsiRekord(undefined, { pruchod: true, rozpocet: false, mistrovska: false }, cenaNavrhu(RESENI[prvni.id]!.pruchod), VERZE_FYZIKY, 1000);
  }
  return ulozeniNaText(ulozeni);
}

async function nactiMost(s: Page, navrh: NavrhMostu): Promise<void> {
  await akce(s, "import").click();
  await s.locator("#okno-obsah").fill(navrhNaText(navrh));
  await akce(s, "okno-nacist").click();
}

async function zkousej(s: Page): Promise<string> {
  await s.locator(PLATNO).focus();
  await s.keyboard.press("Space");
  await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 200_000 });
  expect(await telo(s, "zkouska")).toBe("hotovo");
  await akce(s, "na-konec").click();
  await s.locator(".vysledek").waitFor({ state: "visible" });
  return udaj(s, "vysledek-nadpis");
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

describe("Havarijní komise", () => {
  const prvni = PRIPADY[0]!;
  const zmenOpravy = stavOpravy(prvni, prvni.oprava).zmeny.length;

  it("přehled má pod kampaní oddíl s případy; otevírají se s první projitou úrovní své kapitoly", async () => {
    expect(PRIPADY.length).toBeGreaterThanOrEqual(6);
    const s = await cistaStranka();
    await s.goto(adresa);
    await s.locator(".karta").first().waitFor();
    const oddil = s.locator('[data-udaj="prehled-komise"]');
    expect(await oddil.isVisible()).toBe(true);
    expect(await oddil.locator("h1").innerText()).toBe("Havarijní komise");
    expect(await oddil.locator(".pripad").count()).toBe(PRIPADY.length);
    // Nový hráč má všechny případy zamčené a karta říká, na co čekají. Karty kampaně se nezměnily.
    expect(await oddil.locator('.pripad[data-zamceno="false"]').count()).toBe(0);
    expect(bezMezer(await karta(s, prvni.uroven.id).innerText())).toContain(`otevře se, až projdeš první úroveň kapitoly ${prvni.kapitola}`);
    expect(await s.locator(".karta").count()).toBe(kampan.length);
    expect(bezMezer(await oddil.locator(".kapitola__tema").innerText())).toContain(`Uzavřeno 0 z ${PRIPADY.length} případů.`);

    await s.evaluate((zapis) => window.localStorage.setItem("mostmistr.ulozeni", zapis), postupSKapitolami());
    await s.goto(adresa);
    await s.locator(".karta").first().waitFor();
    expect(await oddil.locator('.pripad[data-zamceno="false"]').count()).toBe(PRIPADY.length);
    expect(bezMezer(await karta(s, prvni.uroven.id).innerText())).toContain("Případ 1");
    expect(bezMezer(await karta(s, prvni.uroven.id).innerText())).toContain("čeká na opravu");
    await oddil.scrollIntoViewIfNeeded();
    await s.screenshot({ path: `${SLOZKA}/k1-prehled-komise.png` });
  }, 120_000);

  it("případ začíná spisem a mostem, který spadl; oprava se počítá po změnách a uzavřený případ ukáže nález", async () => {
    const s = await cistaStranka();
    await s.goto(adresa);
    await s.evaluate((zapis) => window.localStorage.setItem("mostmistr.ulozeni", zapis), postupSKapitolami());
    await s.goto(adresa);
    await s.locator(".karta").first().waitFor();
    await karta(s, prvni.uroven.id).locator("a").click();
    await s.locator(PLATNO).waitFor();
    // Spis se otevře sám: případ, co se stalo, a pravidla opravy. Medaile případ nemá.
    await s.locator("#okno-zadani").waitFor({ state: "visible" });
    // Nadtitul okna je verzálkami (styl), text je „Případ 1“.
    expect((await udaj(s, "zadani-list")).toLowerCase()).toBe("případ 1");
    expect(await udaj(s, "zadani-text")).toContain(`oprav ho nejvýš ${NEJVIC_ZMEN_OPRAVY} změnami`);
    expect(await s.locator('[data-udaj="zadani-medaile"]').isVisible()).toBe(false);
    await s.screenshot({ path: `${SLOZKA}/k2-spis.png` });
    await s.locator('#okno-zadani[open] button[value="zavrit"]').click();

    // Na výkresu je spadlý most a pruh to říká.
    expect(await telo(s, "havarie")).toBe(prvni.uroven.id);
    expect(await telo(s, "pruty")).toBe(String(prvni.most.pruty.length));
    expect(await telo(s, "zmen")).toBe("0");
    expect(await s.locator('[data-udaj="komise"]').getAttribute("data-stav")).toBe("puvodni");
    expect(await udaj(s, "komise-text")).toContain("Takhle spadl");
    expect(await akce(s, "napoveda").isVisible()).toBe(false);
    expect(await s.locator('.paleta [data-akce="sdilet"]').isVisible()).toBe(false);
    await s.screenshot({ path: `${SLOZKA}/k3-spadly-most.png` });

    // Spadlý most jde pustit, jak je: neprojde a výsledek připomene úkol.
    expect(await zkousej(s)).toBe("MOST NEOBSTÁL");
    expect(await udaj(s, "vysledek-veta")).toContain("Takhle spadl. Teď najdi příčinu");
    expect(await akce(s, "dalsi").isVisible()).toBe(false);
    expect(await telo(s, "pripad-uzavren")).toBe("");
    await akce(s, "upravit").click();

    // Oprava komise: počet změn je v pruhu i v háčku a zkouška případ uzavře.
    await nactiMost(s, prvni.oprava);
    expect(await telo(s, "zmen")).toBe(String(zmenOpravy));
    expect(await s.locator('[data-udaj="komise"]').getAttribute("data-stav")).toBe("v-mezich");
    expect(await udaj(s, "komise-text")).toContain(`Změny: ${zmenOpravy} z ${NEJVIC_ZMEN_OPRAVY} (`);
    await s.screenshot({ path: `${SLOZKA}/k4-oprava.png` });
    // Vrátit spadlý most je krok jako každý jiný: Zpět vrátí opravu.
    await akce(s, "komise-puvodni").click();
    expect(await telo(s, "zmen")).toBe("0");
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Control+z");
    expect(await telo(s, "zmen")).toBe(String(zmenOpravy));

    expect(await zkousej(s)).toBe("MOST OBSTÁL");
    expect(await telo(s, "pripad-uzavren")).toBe(String(zmenOpravy));
    expect(await udaj(s, "vysledek-veta")).toContain(zmenOpravy === 1 ? "Případ uzavřen jedinou změnou." : `Případ uzavřen ${zmenOpravy} změnami.`);
    // Medaile se nerozdávají; nález komise je v podrobnostech a odkaz vede na další případ.
    expect(await s.locator('[data-udaj="vysledek-medaile-pruh"]').isVisible()).toBe(false);
    const dalsi = akce(s, "dalsi");
    expect(await dalsi.isVisible()).toBe(true);
    expect(await dalsi.innerText()).toBe("Další případ ▸");
    expect(await dalsi.getAttribute("href")).toBe(`?uroven=${PRIPADY[1]!.uroven.id}`);
    await akce(s, "vysledek-sbalit").click();
    expect(await udaj(s, "vysledek-nalez")).toMatch(/^Nález komise: .{40,}/);
    await s.screenshot({ path: `${SLOZKA}/k5-uzavreno.png` });

    // Do postupu kampaně se nic nezapsalo; komise má vlastní paměť.
    const pamet = await s.evaluate(() => [window.localStorage.getItem("mostmistr.havarie"), window.localStorage.getItem("mostmistr.ulozeni"), window.localStorage.getItem("mostmistr.galerie")]);
    expect(JSON.parse(pamet[0]!)).toEqual({ [prvni.uroven.id]: zmenOpravy });
    expect((JSON.parse(pamet[1]!) as { rekordy: Record<string, unknown> }).rekordy[prvni.uroven.id]).toBeUndefined();
    const galerie = pamet[2] ?? null;
    expect(galerie === null || !(prvni.uroven.id in (JSON.parse(galerie) as object))).toBe(true);

    // Přehled: karta je uzavřená a součet to ví; spis teď ukazuje i nález.
    await s.goto(adresa);
    await s.locator(".karta").first().waitFor();
    expect(bezMezer(await karta(s, prvni.uroven.id).innerText())).toContain(zmenOpravy === 1 ? "uzavřeno jedinou změnou" : `uzavřeno ${zmenOpravy} změnami`);
    expect(await s.locator('[data-udaj="prehled-komise"]').getAttribute("data-uzavreno")).toBe("1");
    await karta(s, prvni.uroven.id).locator("a").click();
    await s.locator(PLATNO).waitFor();
    // Rozdělaná (hotová) oprava zůstala na výkresu a spis se podruhé sám neotevírá.
    expect(await s.locator("#okno-zadani[open]").count()).toBe(0);
    expect(await telo(s, "zmen")).toBe(String(zmenOpravy));
    await akce(s, "komise-spis").click();
    await s.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(bezMezer((await s.locator('[data-udaj="zadani-vice"]').textContent()) ?? "")).toContain("Nález komise:");
    await s.keyboard.press("Escape");
  }, 400_000);

  it("oprava s víc změnami, než komise dovolí, ke zkoušce nesmí", async () => {
    const s = await cistaStranka();
    await s.goto(`${adresa}?uroven=${prvni.uroven.id}`);
    await s.locator(PLATNO).waitFor();
    await s.locator('#okno-zadani[open] button[value="zavrit"]').click();
    // Spadlý most a k němu čtyři krátké pruty stranou: čtyři změny.
    let mocZmen = prvni.most;
    const prvek = prvni.most.pruty.find((p) => !p.prvek.startsWith("mostovka") && p.prvek !== "kolejiste" && p.prvek !== "pist")?.prvek ?? prvni.most.pruty[0]!.prvek;
    const hrana = prvni.uroven.vyrez.yMax - 3;
    for (let i = 0; i <= NEJVIC_ZMEN_OPRAVY; i++) mocZmen = pridejPrut(mocZmen, { x: 2 * i, y: hrana }, { x: 2 * i + 1, y: hrana + 1 }, prvek);
    const zmen = stavOpravy(prvni, mocZmen).zmeny.length;
    expect(zmen).toBe(NEJVIC_ZMEN_OPRAVY + 1);
    await nactiMost(s, mocZmen);
    expect(await telo(s, "zmen")).toBe(String(zmen));
    expect(await s.locator('[data-udaj="komise"]').getAttribute("data-stav")).toBe("moc");
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    expect(await udaj(s, "hlaseni")).toContain(`Oprava má ${zmen} změn, komise jich dovolí nejvýš ${NEJVIC_ZMEN_OPRAVY}.`);
    expect(await telo(s, "rezim")).toBe("stavba");
    await s.screenshot({ path: `${SLOZKA}/k6-moc-zmen.png` });
  }, 120_000);

  it("anglicky je případ přeložený a na telefonu pruh komise nepřetéká", async () => {
    const en = await cistaStranka({ locale: "en-US" });
    await en.goto(`${adresa}?uroven=${prvni.uroven.id}&jazyk=en`);
    await en.locator(PLATNO).waitFor();
    expect((await udaj(en, "zadani-list")).toLowerCase()).toBe("case 1");
    expect(await udaj(en, "zadani-text")).toContain("repair it with at most 3 changes");
    await en.locator('#okno-zadani[open] button[value="zavrit"]').click();
    expect(await udaj(en, "komise-text")).toContain("This is how it fell");
    expect(await akce(en, "komise-puvodni").innerText()).toBe("Restore the fallen bridge");

    const telefon = await cistaStranka({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await telefon.goto(`${adresa}?uroven=${prvni.uroven.id}`);
    await telefon.locator(PLATNO).waitFor();
    await telefon.locator('#okno-zadani[open] button[value="zavrit"]').tap();
    expect(await telefon.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const platno = (await telefon.locator(PLATNO).boundingBox())!;
    expect(platno.height).toBeGreaterThan(844 / 3);
    await telefon.screenshot({ path: `${SLOZKA}/k7-telefon.png` });
  }, 120_000);

  it("během práce komise prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
