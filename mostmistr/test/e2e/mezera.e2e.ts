// Mostovka, po které nikdo nepůjde (hlášení hráče z 1-02: „lidé padají skrze položenou
// mostovku na zemi, viz pravá část“). Hra to má říct už při stavbě, u místa, kde je problém,
// a editor nemá tah přes kraj břehu rozdělit tak, aby na kraji břehu chyběl styčník.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kreslic } from "../../src/data/kreslic";
import { navrhNaText } from "../../src/data/navrh";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);
/** Text údaje s obyčejnými mezerami: hra v číslech a před jednotkami píše nezlomitelné. */
const text = async (jmeno: string): Promise<string> =>
  ((await stranka.locator(`[data-udaj="${jmeno}"]`).textContent()) ?? "").replace(/ /g, " ");

type Prut = [string, [number, number], [number, number]];
const D = "mostovka-drevo";
const L = "drevo-lehke";

function most(pruty: Prut[]): string {
  const k = new Kreslic("1-02");
  for (const [prvek, a, b] of pruty) k.prut(prvek as Parameters<Kreslic["prut"]>[0], a, b);
  return navrhNaText(k.navrh());
}

/** Most nováčka: tah 0 → 13 m, jak ho editor před opravou dělil (4 + 3 + 3 + 3), a tři vzpěry. */
const PRES_KRAJ = most([
  [D, [0, 0], [4, 0]],
  [D, [4, 0], [7, 0]],
  [D, [7, 0], [10, 0]],
  [D, [10, 0], [13, 0]],
  [L, [2, -3], [4, 0]],
  [L, [10, -3], [7, 0]],
  [L, [10, -3], [10, 0]],
]);

async function otevri(id: string): Promise<void> {
  // Zkoušky autorů nepatří do čísel o hráčích.
  await stranka.goto(`${adresa}?uroven=${id}&zaznam=vypnout`);
  await stranka.locator(PLATNO).waitFor();
  const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

async function nactiMost(obsah: string): Promise<void> {
  await akce("import").click();
  await stranka.locator("#okno-obsah").fill(obsah);
  await akce("okno-nacist").click();
}

/** Místo na stránce, kde leží bod světa (metry, y nahoru). */
async function bodSveta(x: number, y: number): Promise<{ x: number; y: number }> {
  return stranka.evaluate(
    ([sx, sy]) => {
      const platno = document.querySelector<HTMLCanvasElement>("#obrazovka-uroven canvas.vykres__platno")!;
      const [kx, ky, m] = platno.dataset.kamera!.split(";").map(Number) as [number, number, number];
      const o = platno.getBoundingClientRect();
      return { x: o.left + o.width / 2 + (sx! - kx) * m, y: o.top + o.height / 2 - (sy! - ky) * m };
    },
    [x, y],
  );
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4211, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
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

describe("mostovka, po které nikdo nepůjde", () => {
  it("mostovka přes kraj břehu bez styčníku: značka při stavbě, věta při spuštění i ve výsledku", async () => {
    await otevri("1-02");
    await nactiMost(PRES_KRAJ);
    await expect.poll(() => telo("mezera")).toBe("presah;12;0");
    await stranka.screenshot({ path: `${SLOZKA}/mezera-presah.png` });
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("Space");
    expect(await telo("rezim")).toBe("zkouska");
    // Při zkoušce značka stavby není, hlášení řekne proč.
    expect(await telo("mezera")).toBeNull();
    expect(await text("hlaseni")).toBe(
      "Mostovka přejíždí kraj břehu v 12 m bez styčníku, a takový díl nikoho nenese: od 10 m do 12 m nemá provoz po čem jít, kdo tam dojde, spadne.",
    );
    await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    expect(await telo("zkouska")).toBe("hotovo");
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await text("vysledek-nadpis")).toBe("Most neobstál");
    expect(await text("vysledek-shrnuti")).toContain("Mostovka přejíždí kraj břehu v 12 m bez styčníku");
    await akce("upravit").click();
    expect(await telo("rezim")).toBe("stavba");
    expect(await telo("mezera")).toBe("presah;12;0");
  }, 240_000);

  it("tah mostovky přes kraj břehu skončí na kraji; mostovka dokreslená na břeh má značku a výsledek ji jmenuje", async () => {
    await otevri("1-02");
    // Nejdřív vzpěry z kotev ve svazích; mostovku pak hráč táhne myší.
    await nactiMost(
      most([
        [L, [2, -3], [4, 0]],
        [L, [10, -3], [8, 0]],
      ]),
    );
    await expect.poll(() => telo("pruty")).toBe("2");
    const a = await bodSveta(0, 0);
    const b = await bodSveta(13, 0);
    await stranka.mouse.move(a.x, a.y);
    await stranka.mouse.down();
    await stranka.mouse.move((a.x + b.x) / 2, a.y, { steps: 3 });
    await stranka.mouse.move(b.x, b.y, { steps: 3 });
    // Během tahu hra říká, že mostovka skončí na kraji břehu.
    expect(await text("hlaseni")).toBe("Mostovka končí na kraji břehu: dál vede cesta po zemi.");
    await stranka.mouse.up();
    // 4 + 4 + 4 m k posuvné kotvě a dál nic; po celé trase leží mostovka.
    expect(await telo("pruty")).toBe("5");
    expect(await telo("mezera")).toBeNull();
    expect(await telo("za-brehem")).toBeNull();
    expect(await text("hlaseni")).toBe("Mostovka končí na kraji břehu: dál vede cesta po zemi.");
    await stranka.screenshot({ path: `${SLOZKA}/mezera-zkraceno.png` });

    // Kdo metr mostovky na břeh dokreslí zvlášť (od kraje), dostane značku: zem ho nenese.
    const c = await bodSveta(12, 0);
    const d = await bodSveta(13, 0);
    await stranka.mouse.move(c.x, c.y);
    await stranka.mouse.down();
    await stranka.mouse.move(d.x, d.y, { steps: 3 });
    await stranka.mouse.up();
    expect(await telo("pruty")).toBe("6");
    await expect.poll(() => telo("za-brehem")).toBe("12.5;0");
    expect(await telo("slozeni")).toBeNull();
    await stranka.screenshot({ path: `${SLOZKA}/mezera-za-brehem.png` });
    // Zkouška: všichni přejdou, ale metr mostovky se sklopí na zem. Výsledek říká, který kus
    // za to může, ne že se „most propadl“.
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("Space");
    await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await text("vysledek-nadpis")).toBe("Most neobstál");
    expect(await text("vysledek-shrnuti")).toContain("Mostovku na břehu za koncem cesty (prut 6, označený na výkresu) nic nenese");
    expect(await text("vysledek-shrnuti")).not.toContain("propadl se");
    await stranka.screenshot({ path: `${SLOZKA}/mezera-za-brehem-vysledek.png` });
    // Bez toho metru týž most projde.
    await akce("upravit").click();
    await akce("zpet").click();
    expect(await telo("pruty")).toBe("5");
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("Space");
    await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await text("vysledek-nadpis")).toBe("Most obstál");
  }, 300_000);

  it("mostovka po svazích údolí, mimo čárkovanou trasu: značka u ní", async () => {
    await otevri("1-02");
    await nactiMost(
      most([
        [D, [0, 0], [2, -3]],
        [D, [2, -3], [6, -3]],
        [D, [6, -3], [10, -3]],
        [D, [10, -3], [12, 0]],
      ]),
    );
    await expect.poll(() => telo("mezera")).toBe("mimo-trasu;4;-3");
    await stranka.screenshot({ path: `${SLOZKA}/mezera-mimo-trasu.png` });
    // Rozestavěná mostovka (zatím jen kus od levého břehu) značku nemá: hráč teprve staví.
    await nactiMost(most([[D, [0, 0], [4, 0]]]));
    await expect.poll(() => telo("pruty")).toBe("1");
    expect(await telo("mezera")).toBeNull();
    expect(chyby).toEqual([]);
  });
});
