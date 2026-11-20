// Shoda výpočtu mezi Node a prohlížečem: stránka přepočítá regresní sadu v Chromiu
// a všechny otisky musí souhlasit s těmi, které jsou uložené z Node.
import { mkdirSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, expect, it } from "vitest";
import ulozene from "../../src/zkouska/regrese-otisky.json";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;

let server: PreviewServer;
let prohlizec: Browser;

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4191, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prohlizec = await chromium.launch();
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

it("všechny otisky referenčních mostů vyjdou v prohlížeči stejně jako v Node", async () => {
  const adresa = server.resolvedUrls?.local[0];
  if (!adresa) throw new Error("Náhledový server neoznámil adresu.");
  const stranka = await prohlizec.newPage({ viewport: { width: 1280, height: 900 } });
  const chyby: string[] = [];
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });

  await stranka.goto(`${adresa}otisky.html`);
  await stranka.locator('body[data-stav="hotovo"]').waitFor({ timeout: 120_000 });

  const radky = await stranka.locator("#vysledky tbody tr").evaluateAll((trs) =>
    trs.map((tr) => {
      const bunky = [...tr.querySelectorAll("td")];
      return { id: bunky[0]!.textContent!, otisk: bunky[4]!.textContent!, shoda: bunky[6]!.dataset.shoda };
    }),
  );
  const ocekavane: Record<string, string> = ulozene.otisky;
  expect(radky).toHaveLength(Object.keys(ocekavane).length);
  for (const radek of radky) {
    expect(radek.otisk, radek.id).toBe(ocekavane[radek.id]);
    expect(radek.shoda, radek.id).toBe("ano");
  }
  expect(await stranka.locator("#souhrn").getAttribute("data-shoda")).toBe("ano");
  expect(await stranka.locator("#souhrn").innerText()).toMatch(/^Všech \d+ otisků souhlasí/);
  expect(chyby).toEqual([]);
  await stranka.screenshot({ path: `${SLOZKA}/15-shoda-vypoctu.png` });
}, 180_000);

it("ze zkušebny na stránku vede odkaz", async () => {
  const adresa = server.resolvedUrls?.local[0]!;
  const stranka = await prohlizec.newPage();
  await stranka.goto(`${adresa}zkusebna.html`);
  await stranka.locator('a[href="/otisky.html"]').click();
  await stranka.waitForURL(/otisky\.html/);
  expect(await stranka.title()).toBe("Mostmistr – shoda výpočtu");
});
