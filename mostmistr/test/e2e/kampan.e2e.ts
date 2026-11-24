// Průchod celou kampaní v bezhlavém prohlížeči: z čisté paměti prohlížeče od první úrovně
// do poslední s referenčními mosty. Kritérium milníku M7: každá úroveň se odemkne průchodem
// té předchozí (další kapitola od M12 už po dvou úrovních), referenční most ji projde a po
// poslední je kampaň dokončená.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { prijimejDenik } from "./server-deniku";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zamkyKampane } from "../../src/data/kampan";
import { navrhNaText } from "../../src/data/navrh";
import { nactiKampan } from "../../urovne/index";
import { RESENI } from "../../urovne/reseni";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
const kampan = nactiKampan();

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

const udaj = async (jmeno: string): Promise<string> =>
  (await stranka.locator(`[data-udaj="${jmeno}"]`).innerText()).replace(/[  ]/g, " ");
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);
const zamceno = (id: string): Promise<string | null> => stranka.locator(`[data-uroven="${id}"]`).getAttribute("data-zamceno");

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4204, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
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

describe("poslední úroveň bez zbytku kampaně", () => {
  it("projít poslední úroveň otevřenou adresou kampaň nedokončí", async () => {
    const posledni = kampan.at(-1)!;
    const cisty = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const s = await cisty.newPage();
    await s.goto(`${adresa}?uroven=${posledni.id}`);
    await s.locator(PLATNO).waitFor();
    const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
    if ((await zavrit.count()) > 0) await zavrit.click();
    await s.locator('[data-akce="import"]').click();
    await s.locator("#okno-obsah").fill(navrhNaText(RESENI[posledni.id]!.pruchod));
    await s.locator('[data-akce="okno-nacist"]').click();
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 180_000 });
    await s.locator('[data-akce="na-konec"]').click();
    await s.locator(".vysledek").waitFor({ state: "visible" });
    const odkaz = s.locator('[data-akce="dalsi"]');
    expect(await odkaz.getAttribute("data-posledni")).toBe("true");
    expect(await odkaz.getAttribute("data-dokoncena")).toBe("false");
    expect(await odkaz.innerText()).toBe("Zpět na přehled ▸");
    await odkaz.click();
    await s.locator('body[data-rezim="prehled"]').waitFor();
    expect(await s.locator('[data-udaj="prehled-postup"]').getAttribute("data-dokonceno")).toBe("false");
    expect(await s.locator('[data-udaj="prehled-dokonceno"]').isVisible()).toBe(false);
    await cisty.close();
  }, 300_000);
});

describe("kampaň od první úrovně do poslední", () => {
  it("na začátku je odemčená jen první úroveň a postup je nula", async () => {
    await stranka.goto(adresa);
    await stranka.locator('body[data-rezim="prehled"]').waitFor();
    expect(await stranka.locator(".karta").count()).toBe(kampan.length);
    expect(await zamceno(kampan[0]!.id)).toBe("false");
    for (const uroven of kampan.slice(1)) expect(await zamceno(uroven.id), uroven.id).toBe("true");
    // Sedm kapitol po čtyřech úrovních a zkoušce: 35 úrovní, tři medaile a devět stupňů výzev na každou.
    expect(kampan.length).toBe(35);
    expect(await udaj("prehled-postup")).toBe(`Projito 0 z ${kampan.length} úrovní · medaile 0 z ${3 * kampan.length} · stupně výzev 0 z ${9 * kampan.length}`);
    // Zkouška kapitoly má na kartě štítek; ostatní úrovně ne.
    for (const uroven of kampan) {
      expect(await stranka.locator(`[data-uroven="${uroven.id}"] .karta__stitek`).count(), uroven.id).toBe(uroven.zkouskova ? 1 : 0);
    }
    expect(await stranka.locator('[data-udaj="prehled-dokonceno"]').isVisible()).toBe(false);
  });

  it(
    "každou úroveň projde referenční most a odemkne tím další",
    async () => {
      for (const [poradi, uroven] of kampan.entries()) {
        const dalsi = kampan[poradi + 1];
        // Do úrovně se jde z přehledu kliknutím na kartu: jen tak se pozná, že je odemčená.
        await stranka.goto(adresa);
        await stranka.locator('body[data-rezim="prehled"]').waitFor();
        expect(await zamceno(uroven.id), `${uroven.id} má být odemčená`).toBe("false");
        // Uvnitř kapitoly se jde po jedné; další kapitola se otevře po dvou projitých úrovních
        // té předchozí. Zámky všech karet odpovídají pravidlu.
        const projite = new Set(kampan.slice(0, poradi).map((u) => u.id));
        const zamky = zamkyKampane(
          kampan.map((u) => u.id),
          (id) => ({ projita: projite.has(id), rozestavena: false }),
        );
        const naKartach = await stranka.locator(".karta").evaluateAll((karty) => karty.map((k) => (k as HTMLElement).dataset.zamceno));
        expect(naKartach, `zámky před úrovní ${uroven.id}`).toEqual(zamky.map((z) => String(z !== null)));
        if (dalsi && dalsi.id[0] === uroven.id[0]) expect(await zamceno(dalsi.id), `${dalsi.id} má být ještě zamčená`).toBe("true");
        if (uroven.id.endsWith("-03") && dalsi) {
          // Třetí úroveň kapitoly: první úroveň další kapitoly už je otevřená a karta to říká.
          const prvniDalsi = kampan.find((u) => u.id[0] === String(Number(uroven.id[0]) + 1));
          if (prvniDalsi) expect(await zamceno(prvniDalsi.id), `${prvniDalsi.id} má být otevřená po dvou úrovních kapitoly`).toBe("false");
        }
        await stranka.locator(`[data-uroven="${uroven.id}"] a`).click();
        await stranka.locator(PLATNO).waitFor();
        // Zkouška kapitoly: zadání to říká, ukázka ani nápověda nejsou. Ostatní úrovně nápovědu mají.
        expect(await stranka.locator('[data-udaj="zadani-zkouska"]').isVisible(), uroven.id).toBe(uroven.zkouskova);
        if (uroven.zkouskova) {
          // Nadtitul okna je verzálkami (styl), text je „Zkouška kapitoly · 1-05“.
          expect((await udaj("zadani-list")).toLowerCase(), uroven.id).toBe(`zkouška kapitoly · ${uroven.id}`);
          expect((await udaj("zadani-text")).length, uroven.id).toBeGreaterThan(40);
          await stranka.screenshot({ path: `${SLOZKA}/k0-zkouska-${uroven.id}.png` });
        }
        const zavrit = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
        if ((await zavrit.count()) > 0) await zavrit.click();
        expect(await akce("napoveda").isVisible(), `${uroven.id} nápověda`).toBe(!uroven.zkouskova);

        await akce("import").click();
        await stranka.locator("#okno-obsah").fill(navrhNaText(RESENI[uroven.id]!.pruchod));
        await akce("okno-nacist").click();
        await stranka.locator(PLATNO).focus();
        await stranka.keyboard.press("Space");
        await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 180_000 });
        expect(await telo("zkouska"), uroven.id).toBe("hotovo");
        await akce("na-konec").click();
        await stranka.locator(".vysledek").waitFor({ state: "visible" });
        expect(await udaj("vysledek-nadpis"), uroven.id).toBe("MOST OBSTÁL");
        // Výsledek nabízí další úroveň; po poslední odkaz na dokončenou kampaň.
        const odkaz = akce("dalsi");
        expect(await odkaz.isVisible(), uroven.id).toBe(true);
        if (dalsi) {
          expect(await odkaz.getAttribute("href")).toBe(`?uroven=${dalsi.id}`);
          expect(await odkaz.innerText()).toContain("Další úroveň");
        } else {
          expect(await odkaz.getAttribute("data-posledni")).toBe("true");
          expect(await odkaz.getAttribute("data-dokoncena")).toBe("true");
          expect(await odkaz.innerText()).toBe("Kampaň dokončena · závěrečný list");
          await stranka.screenshot({ path: `${SLOZKA}/k1-posledni-uroven.png` });
          // Po poslední úrovni se ukáže závěrečný list s mosty hráče: každá úroveň v něm má
          // most, kterým prošla.
          await odkaz.click();
          await stranka.locator('body[data-rezim="list"]').waitFor();
          expect(await telo("list")).toBe("dokonceno");
          expect(await telo("list-mostu")).toBe(String(kampan.length));
          expect(await stranka.locator('#obrazovka-list .karta[data-puvod="galerie"]').count()).toBe(kampan.length);
          await stranka.screenshot({ path: `${SLOZKA}/k1-zaverecny-list.png`, fullPage: true });
          await stranka.locator("#obrazovka-list .lista a.tlacitko").click();
          await stranka.locator('body[data-rezim="prehled"]').waitFor();
        }
      }
    },
    2_400_000,
  );

  it("po poslední úrovni je kampaň dokončená a všechny úrovně mají medaili za průchod", async () => {
    await stranka.locator('body[data-rezim="prehled"]').waitFor();
    for (const uroven of kampan) expect(await zamceno(uroven.id), uroven.id).toBe("false");
    const postup = stranka.locator('[data-udaj="prehled-postup"]');
    expect(await postup.getAttribute("data-projito")).toBe(String(kampan.length));
    expect(await postup.getAttribute("data-dokonceno")).toBe("true");
    // Dokončená kampaň má vlastní oznámení; věta přilepená za čísla postupu by zanikla.
    expect(await udaj("prehled-postup")).toMatch(new RegExp(`^Projito ${kampan.length} z ${kampan.length} úrovní · `));
    // Nadpis oznámení je verzálkami (styl), proto bez ohledu na velikost písmen.
    expect(await udaj("prehled-dokonceno")).toMatch(/^Kampaň dokončena\. Všechny úrovně jsou projité\./i);
    await stranka.screenshot({ path: `${SLOZKA}/k2-kampan-dokoncena.png` });
    // Každá karta ukazuje aspoň jednu získanou medaili a součet stupňů výzev.
    for (const uroven of kampan) {
      expect(await stranka.locator(`[data-uroven="${uroven.id}"] .karta__medaile`).innerText(), uroven.id).toContain("◆");
      expect(await stranka.locator(`[data-uroven="${uroven.id}"] .karta__vyzvy`).count(), uroven.id).toBe(1);
    }
    await stranka.screenshot({ path: `${SLOZKA}/k2-kampan-dokoncena.png`, fullPage: true });
  });

  it("během celé kampaně prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
