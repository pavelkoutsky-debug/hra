// Závěrečná kapitola v bezhlavém prohlížeči: přehled s osmou kapitolou, zadání tří úrovní,
// které spojují mechaniky dvou kapitol, nápověda k zavěšenému mostu se ztužující příhradou
// a mosty autora pro mistrovskou medaili (vlak na lanech, lávka s tlumiči, zvedací most pro trať).
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";
import { prijimejDenik } from "./server-deniku";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
const UROVNE = ["8-01", "8-02", "8-03"] as const;

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

/** Text údaje s obyčejnými mezerami: hra v číslech a před jednotkami píše nezlomitelné. */
const udaj = async (jmeno: string): Promise<string> =>
  (await stranka.locator(`[data-udaj="${jmeno}"]`).innerText()).replace(/[  ]/g, " ");
/** Text prvku, i když je ve sbalené části okna (`innerText` sbaleného obsahu je prázdný). */
const celyText = async (jmeno: string): Promise<string> =>
  ((await stranka.locator(`[data-udaj="${jmeno}"]`).textContent()) ?? "").replace(/[  ]/g, " ");
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);
const medaile = (): Promise<(string | null)[]> =>
  stranka.locator('[data-udaj="vysledek-medaile"] [data-ziskana]').evaluateAll((uzly) => uzly.map((u) => u.getAttribute("data-ziskana")));

async function otevri(id: string, zavritZadani = true): Promise<void> {
  await stranka.goto(`${adresa}?uroven=${id}`);
  await stranka.locator(PLATNO).waitFor();
  if (!zavritZadani) return;
  const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

async function nactiMost(text: string): Promise<void> {
  await akce("import").click();
  await stranka.locator("#okno-obsah").fill(text);
  await akce("okno-nacist").click();
}

async function spust(): Promise<void> {
  await stranka.locator(PLATNO).focus();
  await stranka.keyboard.press("Space");
  await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 300_000 });
  expect(await telo("zkouska")).toBe("hotovo");
}

async function nastavCas(sekundy: number): Promise<void> {
  await stranka.locator("#cas").evaluate((tahlo, cas) => {
    (tahlo as HTMLInputElement).value = String(cas);
    tahlo.dispatchEvent(new Event("input", { bubbles: true }));
  }, sekundy);
  await stranka.evaluate(() => new Promise<void>((hotovo) => requestAnimationFrame(() => requestAnimationFrame(() => hotovo()))));
}

async function naKonec(): Promise<string> {
  await akce("na-konec").click();
  await stranka.locator(".vysledek").waitFor({ state: "visible" });
  return udaj("vysledek-nadpis");
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4214, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
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
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("závěrečná kapitola", () => {
  it("přehled má osmou kapitolu se třemi úrovněmi bez zkoušky; otevře se po dvou úrovních sedmé", async () => {
    await stranka.goto(adresa);
    await stranka.locator(".karta").first().waitFor();
    const kapitoly = await stranka.locator(".prehled__kapitoly .kapitola").allInnerTexts();
    expect(kapitoly).toHaveLength(8);
    expect(kapitoly.at(-1)).toContain("Mistrovské dílo");
    expect(kapitoly.at(-1)).toContain("Všechno najednou");
    expect(await stranka.locator('.karta[data-uroven^="8-"]').count()).toBe(3);
    expect(await stranka.locator('.karta[data-uroven^="8-"][data-zkouskova="true"]').count()).toBe(0);
    expect((await stranka.locator('.karta[data-uroven="8-01"]').innerText()).replace(/ /g, " ")).toContain("nejdřív projdi 2 úrovně kapitoly 7");
    for (const nazev of ["Trať na lanech", "Lávka na lanech", "Přístavní trať"]) {
      expect(kapitoly.at(-1), nazev).toContain(nazev);
    }
    await stranka.locator('.karta[data-uroven="8-01"]').scrollIntoViewIfNeeded();
    await stranka.screenshot({ path: `${SLOZKA}/f0-kapitola-8.png` });
  });

  for (const id of UROVNE) {
    it(`${id}: zadání říká úlohu, má „Více o úloze“ a skutečný most; nápověda zůstává`, async () => {
      await otevri(id, false);
      await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
      // Závěrečná kapitola není zkouška: nadtitul je obyčejný a nápověda je k ruce.
      expect((await udaj("zadani-list")).toLowerCase()).not.toContain("zkouška");
      expect(await stranka.locator('[data-udaj="zadani-zkouska"]').isVisible()).toBe(false);
      expect((await celyText("zadani-skutecnost")).startsWith("Ve skutečnosti: ")).toBe(true);
      expect((await celyText("zadani-vice")).length).toBeGreaterThan(80);
      await stranka.screenshot({ path: `${SLOZKA}/f1-zadani-${id}.png` });
      await stranka.locator('#okno-zadani[open] button[value="zavrit"]').click();
      expect(await akce("napoveda").isVisible()).toBe(true);
      await stranka.screenshot({ path: `${SLOZKA}/f2-vykres-${id}.png` });
    });
  }

  it("8-01: nápověda říká, že zavěšený most ztužuje příhrada", async () => {
    await otevri("8-01");
    await akce("napoveda").click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    const princip = await udaj("napoveda-princip");
    expect(princip).toContain("visí na šikmých lanech");
    expect(princip).toContain("ztužuje příhrada");
    expect(princip).not.toContain("nosné lano");
    // Pylony stojí na březích: skica pod mostovkou ve třetině rozpětí nic nekreslí (dřík pylonu
    // by tam vedl do řeky, kam se stavět nesmí). Mostovka je ve dvou třetinách výšky.
    const podMostovkou = await stranka.locator('[data-udaj="napoveda-skica"]').evaluate((prvek) => {
      const platno = prvek as HTMLCanvasElement;
      const ctx = platno.getContext("2d")!;
      const od = Math.round(platno.height * 0.66) + 10;
      let kreslenych = 0;
      for (const podil of [0.3, 0.7]) {
        const body = ctx.getImageData(Math.round(platno.width * podil) - 3, od, 6, platno.height - od - 8).data;
        for (let i = 3; i < body.length; i += 4) if (body[i]! > 40) kreslenych += 1;
      }
      return kreslenych;
    });
    expect(podMostovkou).toBe(0);
    await stranka.screenshot({ path: `${SLOZKA}/f3-napoveda-8-01.png` });
    await stranka.keyboard.press("Escape");
  });

  it("8-02: skica nápovědy má stožáry na opěrách, ne pylon uprostřed lávky", async () => {
    await otevri("8-02");
    await akce("napoveda").click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    expect(await stranka.locator("#okno-napoveda").getAttribute("data-soustava")).toBe("zaveseny");
    const princip = await udaj("napoveda-princip");
    expect(princip).toContain("z pylonů");
    expect(princip).toContain("laděný tlumič");
    expect(princip).not.toContain("příhrada");
    // Uprostřed lávky je vyhlídka a pod mostovkou se stavět nesmí: skica tam nad mostovkou
    // nesmí nic kreslit (pylon uprostřed by vedl obojím). Mostovka je ve dvou třetinách výšky.
    const nadStredem = await stranka.locator('[data-udaj="napoveda-skica"]').evaluate((prvek) => {
      const platno = prvek as HTMLCanvasElement;
      const ctx = platno.getContext("2d")!;
      const vyska = Math.round(platno.height * 0.66) - 10;
      const body = ctx.getImageData(Math.round(platno.width / 2) - 2, 0, 4, vyska).data;
      let kreslenych = 0;
      for (let i = 3; i < body.length; i += 4) if (body[i]! > 40) kreslenych += 1;
      return kreslenych;
    });
    expect(nadStredem).toBe(0);
    await stranka.screenshot({ path: `${SLOZKA}/f3-napoveda-8-02.png` });
    await stranka.keyboard.press("Escape");
  });

  it("8-02: lávce bez tlumiče hra poradí laděný tlumič na rytmus útvaru, ne vyšší příhradu", async () => {
    await otevri("8-02");
    const bezTlumice = RESENI["8-02"]!.pady.find((p) => p.nazev === "zavěšená lávka bez tlumiče")!;
    await nactiMost(navrhNaText(bezTlumice.navrh));
    const osa = stranka.locator('[data-udaj="osa-frekvenci"]');
    await stranka.locator('[data-udaj="osa-frekvenci"][data-odhad]').waitFor({ timeout: 60_000 });
    // Odhad je kolem meze; rada jmenuje nástroj úrovně a jeho ladění.
    expect(["u-meze", "nad-mezi"]).toContain(await osa.getAttribute("data-stav"));
    const popis = await udaj("frekvence-popis");
    expect(popis).toContain("Pomohl by laděný tlumič na 2,00 Hz");
    expect(popis).not.toContain("vyšší příhrada");
    await stranka.screenshot({ path: `${SLOZKA}/f3b-rada-8-02.png` });
    // Most, který na kmitání neprošel, neslyší „nízký komfort“: řádek řekne mez úrovně.
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    const kmitani = await celyText("vysledek-kmitani");
    expect(kmitani).toContain("nad mezí úrovně 1,0 m/s²");
    expect(kmitani).not.toContain("komfort");
    // Medaile, které most nedostal, říkají proč; průchod odkazem na větu nahoře.
    const proc = await stranka.locator('[data-udaj="vysledek-medaile"] li').evaluateAll((uzly) => uzly.map((u) => u.getAttribute("data-proc")));
    expect(proc).toEqual(["most zkouškou neprošel (proč, říká věta nahoře)", "nejdřív musí most projít", "nejdřív rozpočtová medaile"]);
  }, 400_000);

  for (const [id, cas] of [["8-01", 24], ["8-02", 30], ["8-03", 16]] as const) {
    it(`${id}: most autora pro mistrovskou projde se všemi třemi medailemi`, async () => {
      await otevri(id);
      await nactiMost(navrhNaText(RESENI[id]!.mistrovska));
      await stranka.screenshot({ path: `${SLOZKA}/f4-most-${id}.png` });
      await spust();
      await nastavCas(cas);
      await stranka.screenshot({ path: `${SLOZKA}/f5-zkouska-${id}.png` });
      expect(await naKonec()).toBe("MOST OBSTÁL");
      expect(await medaile()).toEqual(["true", "true", "true"]);
      expect(await stranka.locator('[data-udaj="vysledek-medaile"] [data-proc]').count()).toBe(0);
      await stranka.screenshot({ path: `${SLOZKA}/f6-vysledek-${id}.png` });
    }, 400_000);
  }

  it("8-03: dva písty zvedají jedno křídlo a hra to tak popíše", async () => {
    // Výsledek z předchozího testu je na obrazovce: řádek o zvedání a měkké dosednutí.
    const pohyb = stranka.locator('[data-udaj="vysledek-pohyb"]');
    expect(await pohyb.getAttribute("data-zamceno")).toBe("true");
    expect(await pohyb.getAttribute("data-narazilo")).toBe("0");
    expect((await udaj("vysledek-dosednuti")).replace(/\s/g, " ")).toContain("medaile chce nejvýš 680 kN");
    await akce("upravit").click();
    await akce("napoveda").click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    expect(await udaj("napoveda-princip")).toContain("jedno křídlo");
    expect(await udaj("napoveda-princip")).toContain("Křídlo ztužují");
    await stranka.keyboard.press("Escape");
  });

  it("během celé kapitoly prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
