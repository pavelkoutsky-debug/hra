// Průchod hrou v bezhlavém prohlížeči nad hotovým sestavením (dist/).
// Ověřuje to, co jednotkové testy nevidí: že se stránka načte, výkres se nakreslí,
// ovládání funguje a pracovní vlákno se simulací odpovídá.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SLOZKA_SNIMKU = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const verzeBaliku = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8")) as { version: string })
  .version;

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
const chybyStranky: string[] = [];

const udaj = (jmeno: string): Promise<string> => stranka.locator(`[data-udaj="${jmeno}"]`).innerText();

/** Jmenovatel měřítka z popisového pole, např. 150 pro „1 : 150“. */
async function meritko(): Promise<number> {
  const zapis = await udaj("meritko");
  const nalez = /^1 : (\d+)$/.exec(zapis);
  if (!nalez) throw new Error(`Nečekaný zápis měřítka: ${zapis}`);
  return Number(nalez[1]);
}

/** Souřadnice bodu rastru pod kurzorem, jak je ukazuje stránka. */
async function souradnice(): Promise<{ x: number; y: number }> {
  const zapis = (await udaj("souradnice")).replaceAll("−", "-");
  const nalez = /^x = (-?\d+) m · y = (-?\d+) m$/.exec(zapis);
  if (!nalez) throw new Error(`Nečekaný zápis souřadnic: ${zapis}`);
  return { x: Number(nalez[1]), y: Number(nalez[2]) };
}

/** Počká na dokreslení: plátno se překresluje nejvýš jednou za snímek. */
async function pockejNaSnimek(): Promise<void> {
  await stranka.evaluate(() => new Promise<void>((hotovo) => requestAnimationFrame(() => requestAnimationFrame(() => hotovo()))));
}

async function stredPlatna(): Promise<{ x: number; y: number }> {
  const obrys = await stranka.locator("canvas").boundingBox();
  if (!obrys) throw new Error("Plátno není na stránce.");
  return { x: obrys.x + obrys.width / 2, y: obrys.y + obrys.height / 2 };
}

beforeAll(async () => {
  mkdirSync(SLOZKA_SNIMKU, { recursive: true });
  server = await preview({ preview: { port: 4188, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  const adresa = server.resolvedUrls?.local[0];
  if (!adresa) throw new Error("Náhledový server neoznámil adresu.");

  prohlizec = await chromium.launch();
  stranka = await prohlizec.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  stranka.on("pageerror", (chyba) => chybyStranky.push(chyba.message));
  stranka.on("console", (zprava) => {
    if (zprava.type() === "error") chybyStranky.push(zprava.text());
  });
  await stranka.goto(adresa);
  await stranka.locator("canvas").waitFor();
  await pockejNaSnimek();
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("výkres", () => {
  it("načte se bez chyb a ukáže úroveň", async () => {
    expect(await stranka.title()).toBe("Mostmistr");
    expect(await udaj("nazev")).toBe("Zkušební výkres");
    expect(await udaj("list")).toBe("0-00");
    expect(await stranka.locator('[data-udaj="chyba"]').isHidden()).toBe(true);
  });

  it("popisové pole ukazuje verzi hry a otisk sestavení", async () => {
    const verze = await udaj("verze");
    expect(verze).toMatch(new RegExp(`^${verzeBaliku.replaceAll(".", "\\.")} · ([0-9a-f]{7}|lokalni)$`));
  });

  it("pracovní vlákno se simulací odpoví verzí fyziky", async () => {
    await expect.poll(() => udaj("fyzika"), { timeout: 5000 }).toMatch(/^v\d+$/);
  });

  it("plátno není prázdné: má pozadí modráku i světlé čáry", async () => {
    const barvy = await stranka.evaluate(() => {
      const platno = document.querySelector("canvas")!;
      const data = platno.getContext("2d")!.getImageData(0, 0, platno.width, platno.height).data;
      let pozadi = 0;
      let svetle = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
        if (r === 0x10 && g === 0x3f && b === 0x78) pozadi++;
        if (r > 180 && g > 200 && b > 230) svetle++;
      }
      return { pozadi, svetle, celkem: data.length / 4 };
    });
    expect(barvy.pozadi).toBeGreaterThan(barvy.celkem * 0.1);
    expect(barvy.svetle).toBeGreaterThan(500);
  });

  it("plátno má rozlišení podle velikosti okna", async () => {
    const rozmery = await stranka.evaluate(() => {
      const platno = document.querySelector("canvas")!;
      const obrys = platno.getBoundingClientRect();
      return { sirka: platno.width, vyska: platno.height, css: [Math.round(obrys.width), Math.round(obrys.height)] };
    });
    expect([rozmery.sirka, rozmery.vyska]).toEqual(rozmery.css);
    expect(rozmery.sirka).toBe(1280);
  });

  it("uloží snímek výchozího pohledu", async () => {
    await stranka.screenshot({ path: `${SLOZKA_SNIMKU}/01-cely-vykres.png` });
  });
});

describe("ovládání", () => {
  it("kurzor ukazuje souřadnice bodu rastru", async () => {
    const stred = await stredPlatna();
    await stranka.mouse.move(stred.x, stred.y);
    // Výchozí pohled je vystředěný na výřez −14..38 × −13..15, tedy na bod (12; 1).
    expect(await souradnice()).toEqual({ x: 12, y: 1 });
  });

  it("kolečko přiblíží a bod pod kurzorem zůstane na místě", async () => {
    const stred = await stredPlatna();
    const misto = { x: stred.x - 240, y: stred.y + 90 };
    await stranka.mouse.move(misto.x, misto.y);
    const predBod = await souradnice();
    const predMeritko = await meritko();

    await stranka.mouse.wheel(0, -400);
    await pockejNaSnimek();

    expect(await meritko()).toBeLessThan(predMeritko);
    expect(await souradnice()).toEqual(predBod);
    await stranka.screenshot({ path: `${SLOZKA_SNIMKU}/02-priblizeno.png` });
  });

  it("tažení pravým tlačítkem posune výkres o stejnou vzdálenost", async () => {
    const stred = await stredPlatna();
    await stranka.mouse.move(stred.x, stred.y);
    const pred = await souradnice();
    const predMeritko = await meritko();

    await stranka.mouse.down({ button: "right" });
    await stranka.mouse.move(stred.x + 200, stred.y - 100, { steps: 5 });
    await stranka.mouse.up({ button: "right" });

    // Kurzor skončil o 200 px vpravo a 100 px výš, obsah jel s ním: pod kurzorem je stejný bod.
    expect(await souradnice()).toEqual(pred);
    expect(await meritko()).toBe(predMeritko);

    // Na původním místě je teď bod o tolik metrů vlevo a níž, kolik odpovídá 200 a 100 px.
    await stranka.mouse.move(stred.x, stred.y);
    const po = await souradnice();
    expect(po.x).toBeLessThan(pred.x);
    expect(po.y).toBeLessThan(pred.y);
    expect((pred.x - po.x) / (pred.y - po.y)).toBeCloseTo(2, 0);
  });

  it("mezerník s levým tlačítkem posouvá, samotné levé tlačítko ne", async () => {
    const stred = await stredPlatna();
    await stranka.mouse.move(stred.x, stred.y);
    const pred = await souradnice();

    await stranka.mouse.down();
    await stranka.mouse.move(stred.x + 150, stred.y, { steps: 3 });
    await stranka.mouse.up();
    await stranka.mouse.move(stred.x, stred.y);
    expect(await souradnice()).toEqual(pred);

    await stranka.keyboard.down("Space");
    await stranka.mouse.down();
    await stranka.mouse.move(stred.x + 150, stred.y, { steps: 3 });
    await stranka.mouse.up();
    await stranka.keyboard.up("Space");
    await stranka.mouse.move(stred.x, stred.y);
    expect((await souradnice()).x).toBeLessThan(pred.x);
  });

  it("klávesa Home vrátí celý výkres", async () => {
    await stranka.keyboard.press("Home");
    await pockejNaSnimek();
    const stred = await stredPlatna();
    await stranka.mouse.move(stred.x + 1, stred.y);
    await stranka.mouse.move(stred.x, stred.y);
    expect(await souradnice()).toEqual({ x: 12, y: 1 });
  });

  it("tlačítka v liště přiblíží, oddálí a vrátí celý výkres", async () => {
    const vychozi = await meritko();
    await stranka.locator('[data-akce="priblizit"]').click();
    await stranka.locator('[data-akce="priblizit"]').click();
    const priblizene = await meritko();
    expect(priblizene).toBeLessThan(vychozi);
    await stranka.locator('[data-akce="oddalit"]').click();
    expect(await meritko()).toBeGreaterThan(priblizene);
    await stranka.locator('[data-akce="cely-vykres"]').click();
    expect(await meritko()).toBe(vychozi);
  });

  it("oddálit nejde dál než na celý výkres", async () => {
    const vychozi = await meritko();
    for (let i = 0; i < 8; i++) await stranka.locator('[data-akce="oddalit"]').click();
    expect(await meritko()).toBe(vychozi);
  });

  it("při změně velikosti okna se výchozí pohled přizpůsobí", async () => {
    await stranka.locator('[data-akce="cely-vykres"]').click();
    const pred = await meritko();
    await stranka.setViewportSize({ width: 800, height: 600 });
    await pockejNaSnimek();
    await pockejNaSnimek();
    expect(await meritko()).toBeGreaterThan(pred);
    const sirka = await stranka.evaluate(() => document.querySelector("canvas")!.width);
    expect(sirka).toBe(800);
    await stranka.screenshot({ path: `${SLOZKA_SNIMKU}/03-mensi-okno.png` });
    await stranka.setViewportSize({ width: 1280, height: 720 });
    await pockejNaSnimek();
  });

  it("za celý průchod stránka nenahlásila žádnou chybu", () => {
    expect(chybyStranky).toEqual([]);
  });
});
