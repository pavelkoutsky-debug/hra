// Web kolem hry: bezpečnostní hlavičky (náhledový server posílá tytéž jako Netlify), náhled
// odkazu, stránka bez JavaScriptu, stránka 404 a stará záložka po novém nasazení (soubor
// pracovního vlákna už na webu není).
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HLAVICKY_WEBU, POLITIKA_OBSAHU } from "../../hlavicky";
import { navrhNaText } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";
import { prijimejDenik } from "./server-deniku";
import { rozbalPaletu } from "./pomoc";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
/** Soubory pracovních vláken v sestavení (hra, zkušebna i měření mají vlákno „pracovnik“). */
const VLAKNA = "**/assets/*pracovnik-*.js";

let server: PreviewServer;
let prohlizec: Browser;
let kontext: BrowserContext;
let adresa: string;

/** Nová stránka, která sbírá chyby z konzole a porušení politiky obsahu. */
async function novaStranka(k: BrowserContext = kontext): Promise<{ s: Page; chyby: string[] }> {
  const s = await k.newPage();
  const chyby: string[] = [];
  s.on("pageerror", (chyba) => chyby.push(chyba.message));
  s.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
  // Porušení CSP hlásí prohlížeč i událostí; init skript politika nezastaví.
  await s.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (u) => console.error(`CSP: ${u.violatedDirective} ${u.blockedURI}`));
  });
  return { s, chyby };
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4216, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prijimejDenik(server);
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
  kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("hlavičky a stránky webu", () => {
  it("náhledový server posílá bezpečnostní hlavičky a stránky pod nimi běží bez chyb", async () => {
    const { s, chyby } = await novaStranka();
    const odpoved = await s.goto(adresa);
    const hlavicky = odpoved!.headers();
    for (const [jmeno, hodnota] of Object.entries(HLAVICKY_WEBU)) expect(hlavicky[jmeno.toLowerCase()], jmeno).toBe(hodnota);
    expect(hlavicky["content-security-policy"]).toBe(POLITIKA_OBSAHU);
    await s.locator(".karta").first().waitFor();
    // Pomocné stránky v sestavení: načtou se a politika jim nic nezakáže.
    for (const stranka of ["zkusebna.html", "mereni.html", "otisky.html", "zvuky.html", "sprava.html", "404.html"]) {
      const o = await s.goto(`${adresa}${stranka}`);
      expect(o?.status(), stranka).toBe(200);
      expect(o?.headers()["content-security-policy"], stranka).toBe(POLITIKA_OBSAHU);
      await s.waitForLoadState("load");
    }
    await s.goto(`${adresa}?uroven=1-01`);
    await s.locator(PLATNO).waitFor();
    await expect.poll(() => s.locator('[data-udaj="fyzika"]').innerText(), { timeout: 10_000 }).toMatch(/^v\d+$/);
    expect(chyby).toEqual([]);
    await s.close();
  });

  it("náhled odkazu: Open Graph s obrázkem 1200 × 630, ikona pro iOS a manifest", async () => {
    const { s, chyby } = await novaStranka();
    await s.goto(adresa);
    const meta = (vlastnost: string): Promise<string | null> => s.locator(`meta[property="${vlastnost}"], meta[name="${vlastnost}"]`).getAttribute("content");
    expect(await meta("og:title")).toBe("Mostmistr");
    expect(await meta("og:type")).toBe("website");
    expect(await meta("og:description")).toMatch(/mosty.*bridges/s);
    expect(await meta("twitter:card")).toBe("summary_large_image");
    // Bez proměnné URL (mimo Netlify) zůstane adresa obrázku relativní; zástupný znak nesmí zbýt.
    const obrazek = (await meta("og:image"))!;
    expect(obrazek).toMatch(/\/nahled\.png$/);
    expect(obrazek).not.toContain("%");
    const rozmery = await s.evaluate(async (cesta) => {
      const img = new Image();
      img.src = cesta;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, "/nahled.png");
    expect(rozmery).toEqual([1200, 630]);
    const ikona = await s.request.get(`${adresa}apple-touch-icon.png`);
    expect(ikona.status()).toBe(200);
    const manifest = (await (await s.request.get(`${adresa}manifest.webmanifest`)).json()) as { name: string; icons: { src: string }[] };
    expect(manifest.name).toBe("Mostmistr");
    for (const ik of manifest.icons) expect((await s.request.get(`${adresa}${ik.src.slice(1)}`)).status(), ik.src).toBe(200);
    expect(chyby).toEqual([]);
    await s.close();
  });

  it("bez JavaScriptu stránka řekne česky i anglicky, že hra ho potřebuje", async () => {
    const bezSkriptu = await prohlizec.newContext({ locale: "cs-CZ", javaScriptEnabled: false, viewport: { width: 1280, height: 720 } });
    const s = await bezSkriptu.newPage();
    await s.goto(adresa);
    expect(await s.title()).toBe("Mostmistr");
    const veta = s.locator(".bez-skriptu");
    expect(await veta.isVisible()).toBe(true);
    expect(await veta.innerText()).toContain("bez JavaScriptu se nespustí");
    expect(await veta.locator('[lang="en"]').innerText()).toContain("needs JavaScript");
    await s.screenshot({ path: `${SLOZKA}/web-bez-skriptu.png` });
    await bezSkriptu.close();
  });

  it("stránka 404 je výkres s odkazem zpět do hry a bez skriptů", async () => {
    const { s, chyby } = await novaStranka();
    await s.goto(`${adresa}404.html`);
    expect(await s.locator("script").count()).toBe(0);
    expect(await s.locator("h1").textContent()).toBe("Tady most nevede");
    expect(await s.locator('[lang="en"]').innerText()).toContain("does not exist");
    const zpet = s.locator('a[href="/"]');
    expect(await zpet.innerText()).toContain("Back to the game");
    await s.screenshot({ path: `${SLOZKA}/web-404.png` });
    await s.setViewportSize({ width: 390, height: 844 });
    expect(await s.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await s.screenshot({ path: `${SLOZKA}/web-404-telefon.png` });
    await zpet.click();
    await s.locator(".karta").first().waitFor();
    expect(chyby).toEqual([]);
    await s.close();
  });
});

describe("stará záložka po novém nasazení", () => {
  it("když soubor pracovního vlákna na webu není, hra řekne, že se aktualizovala, a nabídne načíst znovu", async () => {
    const { s, chyby } = await novaStranka();
    await s.goto(`${adresa}?uroven=1-01`);
    await s.locator(PLATNO).waitFor();
    await expect.poll(() => s.locator('[data-udaj="fyzika"]').innerText(), { timeout: 10_000 }).toMatch(/^v\d+$/);
    const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
    if ((await zavrit.count()) > 0) await zavrit.click();
    await rozbalPaletu(s);
    await s.locator('[data-akce="import"]').click();
    await s.locator("#okno-obsah").fill(navrhNaText(RESENI["1-01"]!.pruchod));
    await s.locator('[data-akce="okno-nacist"]').click();

    // Hra se mezitím nasadila znovu: starý soubor vlákna vrací server jako 404.
    await s.route(VLAKNA, (cesta) => cesta.fulfill({ status: 404, contentType: "text/html", body: "Not found" }));
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    await s.locator('body[data-zkouska="chyba"]').waitFor({ timeout: 30_000 });
    const hlaseni = s.locator('[data-udaj="hlaseni"]');
    expect(await hlaseni.innerText()).toContain("Hra se mezitím aktualizovala na novou verzi. Stačí načíst stránku znovu.");
    expect(await hlaseni.innerText()).not.toContain("výpočet selhal");
    expect(await s.locator("body").getAttribute("data-rezim")).toBe("stavba");
    await s.screenshot({ path: `${SLOZKA}/web-stara-zalozka.png` });
    // V konzoli je jen nenačtený soubor, nic jiného.
    expect(chyby.filter((c) => !c.includes("404"))).toEqual([]);
    chyby.length = 0;

    // Odkaz stránku načte znovu (už s novými soubory) a zkouška pak projde.
    await s.unroute(VLAKNA);
    await Promise.all([s.waitForEvent("load"), hlaseni.locator("a", { hasText: "Načíst znovu" }).click()]);
    await s.locator(PLATNO).waitFor();
    await expect.poll(() => s.locator('[data-udaj="fyzika"]').innerText(), { timeout: 10_000 }).toMatch(/^v\d+$/);
    expect(await s.locator("body").getAttribute("data-pruty")).not.toBe("0");
    expect(chyby).toEqual([]);
    await s.close();
  }, 90_000);

  it("chyba ve výpočtu se dál hlásí jako chyba výpočtu, ne jako aktualizace", async () => {
    const { s } = await novaStranka();
    await s.goto(`${adresa}?uroven=1-01`);
    await s.locator(PLATNO).waitFor();
    await expect.poll(() => s.locator('[data-udaj="fyzika"]').innerText(), { timeout: 10_000 }).toMatch(/^v\d+$/);
    const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
    if ((await zavrit.count()) > 0) await zavrit.click();
    await rozbalPaletu(s);
    await s.locator('[data-akce="import"]').click();
    await s.locator("#okno-obsah").fill(navrhNaText(RESENI["1-01"]!.pruchod));
    await s.locator('[data-akce="okno-nacist"]').click();
    // Vlákno se načte, ale spadne mimo výpočet (vyhodí výjimku hned po startu).
    await s.route(VLAKNA, (cesta) => cesta.fulfill({ status: 200, contentType: "text/javascript", body: 'throw new Error("pokus");' }));
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    await s.locator('body[data-zkouska="chyba"]').waitFor({ timeout: 30_000 });
    const text = await s.locator('[data-udaj="hlaseni"]').innerText();
    expect(text).toContain("výpočet selhal");
    expect(text).not.toContain("aktualizovala");
    await s.close();
  }, 90_000);
});
