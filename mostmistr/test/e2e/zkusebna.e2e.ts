// Zkušebna v bezhlavém prohlížeči: případy doběhnou, sedí s teorií a jdou přehrávat.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

/** Čas děje z ukazatele vedle časové osy, v sekundách. */
async function casDeje(): Promise<number> {
  const zapis = await stranka.locator('[data-udaj="cas"]').innerText();
  const nalez = /^(\d+,\d) s \/ /.exec(zapis);
  if (!nalez) throw new Error(`Nečekaný zápis času: ${zapis}`);
  return Number(nalez[1]!.replace(",", "."));
}

async function pockejNaVysledek(): Promise<void> {
  await stranka.locator('body[data-stav="hotovo"], body[data-stav="chyba"]').waitFor({ timeout: 60_000 });
  expect(await stranka.locator("body").getAttribute("data-stav")).toBe("hotovo");
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4190, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
  stranka = await prohlizec.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("zkušebna", () => {
  it("z výkresu se na ni dá dostat tlačítkem v liště", async () => {
    await stranka.goto(adresa);
    await stranka.locator('a[href="/zkusebna.html"]').click();
    await stranka.waitForURL(/zkusebna\.html/);
    expect(await stranka.title()).toBe("Mostmistr – zkušebna");
  });

  it("výchozí případ doběhne a všechna porovnání s teorií sedí", async () => {
    await pockejNaVysledek();
    const shody = await stranka.locator(".overeni td[data-shoda]").evaluateAll((bunky) =>
      bunky.map((bunka) => (bunka as HTMLElement).dataset.shoda),
    );
    expect(shody.length).toBeGreaterThan(0);
    expect(shody.every((shoda) => shoda === "ano")).toBe(true);
    expect(await stranka.locator('[data-udaj="vypocet"]').innerText()).toMatch(/rychleji než děj/);
  });

  it("konstrukce je na plátně nakreslená", async () => {
    const svetlych = await stranka.evaluate(() => {
      const platno = document.querySelector("canvas")!;
      const data = platno.getContext("2d")!.getImageData(0, 0, platno.width, platno.height).data;
      let pocet = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i]! > 240 && data[i + 1]! > 200) pocet++;
      return pocet;
    });
    expect(svetlych).toBeGreaterThan(3000);
  });

  it("přehrávání běží, jde zastavit a posunout po časové ose", async () => {
    await stranka.locator("#od-zacatku").click();
    await stranka.waitForTimeout(700);
    const pohyb = await casDeje();
    expect(pohyb).toBeGreaterThan(0.3);

    await stranka.locator("#prehrat").click();
    const zastaveno = await casDeje();
    await stranka.waitForTimeout(300);
    expect(await casDeje()).toBe(zastaveno);

    await stranka.locator("#cas").fill("5");
    expect(await casDeje()).toBe(5);
    await stranka.screenshot({ path: `${SLOZKA}/05-zkusebna-most.png` });
  });

  it("rychlost přehrávání se dá změnit", async () => {
    await stranka.locator("#od-zacatku").click();
    await stranka.locator('[data-rychlost="4"]').click();
    await stranka.waitForTimeout(600);
    const rychle = await casDeje();
    expect(rychle).toBeGreaterThan(1.5);
    expect(await stranka.locator('[data-rychlost="4"]').getAttribute("aria-pressed")).toBe("true");
    await stranka.locator('[data-rychlost="1"]').click();
  });

  for (const [pripad, snimek, cas] of [
    ["rezonance", "06-zkusebna-rezonance", "25.5"],
    ["nosnik", "07-zkusebna-nosnik", "0.1"],
    ["kyvadlo", "08-zkusebna-kyvadlo", "0.6"],
  ] as const) {
    it(`případ „${pripad}“ doběhne a sedí s teorií`, async () => {
      await stranka.locator("#pripad").selectOption(pripad);
      await pockejNaVysledek();
      const shody = await stranka.locator(".overeni td[data-shoda]").evaluateAll((bunky) =>
        bunky.map((bunka) => (bunka as HTMLElement).dataset.shoda),
      );
      expect(shody.length).toBeGreaterThan(0);
      expect(shody.every((shoda) => shoda === "ano")).toBe(true);
      expect(stranka.url()).toContain(`pripad=${pripad}`);
      await stranka.locator("#cas").fill(cas);
      await stranka.screenshot({ path: `${SLOZKA}/${snimek}.png` });
    });
  }

  it("adresa s parametrem otevře rovnou zvolený případ", async () => {
    await stranka.goto(`${adresa}zkusebna.html?pripad=kyvadlo`);
    await pockejNaVysledek();
    expect(await stranka.locator("#pripad").inputValue()).toBe("kyvadlo");
  });

  it("za celý průchod stránka nenahlásila žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
