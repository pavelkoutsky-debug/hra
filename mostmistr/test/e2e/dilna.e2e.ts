// Milník M15 v bezhlavém prohlížeči: dílna v pískovišti. Uložené práce s náhledy, návrat
// k uložené práci po změně údolí a odkaz na scénář, který údolí i most otevře někomu jinému,
// aniž mu přepíše jeho vlastní pískoviště.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { odkazNaScenar, sandboxDoAdresy } from "../../src/data/dilna";
import { Kreslic } from "../../src/data/kreslic";
import { navrhNaText, type NavrhMostu } from "../../src/data/navrh";
import { ID_SANDBOXU, PREDLOHY_SANDBOXU, vychoziSandbox } from "../../src/data/sandbox";
import { zakodujMost } from "../../src/data/sdileni";
import { prijimejDenik } from "./server-deniku";
import { rozbalPaletu } from "./pomoc";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";

let server: PreviewServer;
let prohlizec: Browser;
let adresa: string;
const chyby: string[] = [];
const kontexty: BrowserContext[] = [];

const bezMezer = (text: string): string => text.replace(/[\u00a0\u202f]/g, " ");

async function cistaStranka(): Promise<Page> {
  const kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, permissions: ["clipboard-read", "clipboard-write"] });
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
const karty = (s: Page) => s.locator('#okno-dilna [data-udaj="dilna-prace"] li');

/** Příhrada přes výchozí údolí 24 m (silnice). */
function prihrada(): NavrhMostu {
  const k = new Kreslic(ID_SANDBOXU);
  for (let x = 0; x < 24; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
  k.prut("ocel-tezka", [0, 0], [6, 5]);
  k.prut("ocel-tezka", [6, 5], [12, 5]);
  k.prut("ocel-tezka", [12, 5], [18, 5]);
  k.prut("ocel-tezka", [18, 5], [24, 0]);
  for (const x of [6, 12, 18]) k.prut("ocel-lehka", [x, 0], [x, 5]);
  k.prut("ocel-lehka", [6, 5], [12, 0]);
  k.prut("ocel-lehka", [18, 5], [12, 0]);
  return k.navrh();
}

/** Dvoukřídlý zvedací most přes kanál z předlohy (16 m). */
function zvedaci(): NavrhMostu {
  const k = new Kreslic(ID_SANDBOXU);
  for (const [cep, smer] of [[0, 1], [16, -1]] as const) {
    k.prut("mostovka-ocel", [cep, 0], [cep + smer * 4, 0]);
    k.prut("mostovka-ocel", [cep + smer * 4, 0], [8, 0]);
    k.bod(cep + smer * 4, 0, { svar: true });
    k.prut("pist", [cep, -5], [cep + smer * 4, 0], { zdvih: 2 });
  }
  k.bod(8, 0, { zamek: true });
  return k.navrh();
}

async function otevriPiskoviste(s: Page, dotaz = "?sandbox"): Promise<void> {
  await s.goto(`${adresa}${dotaz}`);
  await s.locator(PLATNO).waitFor();
  const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await zavrit.count()) > 0) await zavrit.click();
}

async function nactiMost(s: Page, navrh: NavrhMostu): Promise<void> {
  await rozbalPaletu(s);
  await akce(s, "import").click();
  await s.locator("#okno-obsah").fill(navrhNaText(navrh));
  await akce(s, "okno-nacist").click();
}

async function otevriDilnu(s: Page): Promise<void> {
  await akce(s, "dilna").click();
  await s.locator("#okno-dilna").waitFor({ state: "visible" });
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

describe("dílna v pískovišti", () => {
  it("uloží most pod jménem, ukáže ho s náhledem a po změně údolí ho vrátí i s údolím", async () => {
    const s = await cistaStranka();
    await otevriPiskoviste(s);
    // Dílna je v paletě vedle nastavení údolí; prázdná to říká a prázdný výkres neuloží.
    expect(await akce(s, "dilna").isVisible()).toBe(true);
    await otevriDilnu(s);
    expect(await s.locator("#okno-dilna").getAttribute("data-praci")).toBe("0");
    expect(await s.locator('[data-udaj="dilna-prazdno"]').isVisible()).toBe(true);
    expect(await s.locator("#dilna-nazev").inputValue()).toBe("Most 1");
    expect(await s.locator("#dilna-odkaz").inputValue()).toBe("");
    // Tlačítko je zašedlé, ale klikací: řekne, co chybí (Playwright ho bere jako vypnuté).
    await akce(s, "dilna-ulozit").click({ force: true });
    expect(await udaj(s, "dilna-hlaseni")).toBe("Na výkresu zatím nic není: nejdřív něco postav.");
    await s.keyboard.press("Escape");

    await nactiMost(s, prihrada());
    expect(await telo(s, "pruty")).toBe("13");
    await otevriDilnu(s);
    // Odkaz na scénář nese most i údolí.
    const odkaz = await s.locator("#dilna-odkaz").inputValue();
    expect(odkaz).toBe(odkazNaScenar(adresa, vychoziSandbox(), zakodujMost(prihrada())));
    await s.locator("#dilna-nazev").fill("  Příhrada přes silnici ");
    await akce(s, "dilna-ulozit").click();
    expect(await udaj(s, "dilna-hlaseni")).toBe("Uloženo jako „Příhrada přes silnici“.");
    expect(await karty(s).count()).toBe(1);
    expect(await udaj(s, "dilna-pocet")).toBe("ULOŽENÉ PRÁCE: 1 Z 12");
    const karta = karty(s).first();
    expect(bezMezer(await karta.locator(".dilna__jmeno").innerText())).toBe("Příhrada přes silnici");
    expect(bezMezer(await karta.locator(".dilna__popis").innerText())).toMatch(/^silnice 24 m · [\d ]+ Kč · \d+\. \d+\. \d{4}$/);
    // Náhled je nakreslený (není to jednobarevná plocha).
    const barev = await karta.locator("canvas").evaluate((prvek) => {
      const platno = prvek as HTMLCanvasElement;
      const body = platno.getContext("2d")!.getImageData(0, 0, platno.width, platno.height).data;
      const ruzne = new Set<number>();
      for (let i = 0; i < body.length; i += 16) ruzne.add((body[i]! << 16) | (body[i + 1]! << 8) | body[i + 2]!);
      return ruzne.size;
    });
    expect(barev).toBeGreaterThan(8);
    // Další jméno se nabídne samo; stejné jméno práci přepíše.
    expect(await s.locator("#dilna-nazev").inputValue()).toBe("Most 1");
    await s.locator("#dilna-nazev").fill("Příhrada přes silnici");
    await akce(s, "dilna-ulozit").click();
    expect(await udaj(s, "dilna-hlaseni")).toBe("Práce „Příhrada přes silnici“ je přepsaná tímhle mostem.");
    expect(await karty(s).count()).toBe(1);
    // Odkaz jde zkopírovat do schránky.
    await akce(s, "dilna-kopirovat").click();
    await s.locator('#okno-dilna[data-zkopirovano="ano"]').waitFor();
    expect(await s.evaluate(() => navigator.clipboard.readText())).toBe(odkaz);
    await s.screenshot({ path: `${SLOZKA}/d1-dilna.png` });
    await s.keyboard.press("Escape");

    // Jiné údolí (hotový kanál) most smaže; v dílně zůstal.
    await akce(s, "sandbox").click();
    await s.locator("#okno-sandbox").waitFor({ state: "visible" });
    await s.locator('#okno-sandbox [data-predloha="kanal"]').click();
    await akce(s, "sandbox-pouzit").click();
    expect(await udaj(s, "sandbox-hlaseni")).toContain("uloží v Dílně");
    await Promise.all([s.waitForEvent("load"), akce(s, "sandbox-pouzit").click()]);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "pruty")).toBe("0");
    await nactiMost(s, zvedaci());
    expect(await telo(s, "pruty")).toBe("6");

    // Otevření uložené práce by rozestavěný most zahodilo: nejdřív varuje.
    await otevriDilnu(s);
    const otevrit = karty(s).first().locator('[data-akce="dilna-otevrit"]');
    await otevrit.click();
    expect(await udaj(s, "dilna-hlaseni")).toContain("v dílně uložený není");
    expect(await otevrit.innerText()).toBe("Otevřít a zahodit rozestavěný");
    // Raději ho uložit: pak už otevření nevaruje.
    await s.locator("#dilna-nazev").fill("Kanál");
    await akce(s, "dilna-ulozit").click();
    expect(await karty(s).count()).toBe(2);
    expect(bezMezer(await karty(s).first().locator(".dilna__jmeno").innerText())).toBe("Kanál");
    await s.screenshot({ path: `${SLOZKA}/d2-dilna-dve.png` });
    await Promise.all([s.waitForEvent("load"), karty(s).nth(1).locator('[data-akce="dilna-otevrit"]').click()]);
    await s.locator(PLATNO).waitFor();
    // Zpátky je údolí 24 m se silnicí i most; píst v paletě není.
    expect(await telo(s, "pruty")).toBe("13");
    expect(new URL(s.url()).search).toBe("?sandbox");
    const prvky = await s.locator(".paleta__prvky [data-prvek]").evaluateAll((uzly) => uzly.map((u) => u.getAttribute("data-prvek")));
    expect(prvky).not.toContain("pist");
    expect(await udaj(s, "jizdni-rad")).toContain("nákladní auto");

    // Smazání se ptá dvakrát.
    await otevriDilnu(s);
    const smazat = karty(s).first().locator('[data-akce="dilna-smazat"]');
    await smazat.click();
    expect(await udaj(s, "dilna-hlaseni")).toBe("Práce „Kanál“ se smaže a nepůjde vrátit. Klikni znovu pro potvrzení.");
    expect(await karty(s).count()).toBe(2);
    await smazat.click();
    expect(await udaj(s, "dilna-hlaseni")).toBe("Práce „Kanál“ je smazaná.");
    expect(await karty(s).count()).toBe(1);
    await s.keyboard.press("Escape");
  }, 240_000);

  it("odkaz na scénář otevře údolí i most jako návštěvu; pískoviště příjemce zůstane, dokud se nerozhodne", async () => {
    const s = await cistaStranka();
    // Příjemce má vlastní pískoviště s rozestavěným mostem.
    await otevriPiskoviste(s);
    await nactiMost(s, prihrada());
    expect(await telo(s, "pruty")).toBe("13");

    const kanal = PREDLOHY_SANDBOXU.find((p) => p.id === "kanal")!.nastaveni;
    const odkaz = odkazNaScenar(adresa, kanal, zakodujMost(zvedaci()));
    expect(odkaz).toContain(`&sandbox=${sandboxDoAdresy(kanal)}`);
    await s.goto(odkaz);
    await s.locator(PLATNO).waitFor();
    // Návštěva: pruh říká, o co jde, zadání se neotevírá a most i údolí jsou z odkazu.
    expect(await telo(s, "host")).toBe("ano");
    expect(await telo(s, "pruty")).toBe("6");
    expect(await s.locator("#okno-zadani[open]").count()).toBe(0);
    expect(await udaj(s, "host-text")).toBe("Scénář z odkazu · 570 000 Kč. Tvoje pískoviště zůstává, jak bylo.");
    expect(await akce(s, "host-prekonat").isVisible()).toBe(false);
    expect(await akce(s, "host-nechat").innerText()).toBe("Otevřít ve svém pískovišti");
    expect(await akce(s, "host-ulozit").innerText()).toBe("Uložit do dílny");
    expect(await akce(s, "host-zpet").innerText()).toBe("Zpět do mého pískoviště");
    expect(await udaj(s, "jizdni-rad")).toContain("loď");
    await s.screenshot({ path: `${SLOZKA}/d3-scenar.png` });
    // Údolí scénáře se na návštěvě nemění.
    await akce(s, "sandbox").click();
    expect(await s.locator("#okno-sandbox[open]").count()).toBe(0);
    expect(await udaj(s, "hlaseni")).toContain("až si ho otevřeš ve svém pískovišti");
    // Most projde zkouškou; do paměti příjemce se nic nezapsalo.
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    await akce(s, "na-konec").click();
    await s.locator(".vysledek").waitFor({ state: "visible" });
    expect(await udaj(s, "vysledek-nadpis")).toBe("MOST OBSTÁL");
    await akce(s, "upravit").click();
    const ulozene = await s.evaluate(() => [window.localStorage.getItem("mostmistr.sandbox"), window.localStorage.getItem("mostmistr.ulozeni")]);
    // Nastavení pískoviště příjemce nikdy neměnil: v paměti žádné není (platí výchozí údolí).
    expect(ulozene[0]).toBeNull();
    expect((JSON.parse(ulozene[1]!) as { navrhy: Record<string, { pruty: unknown[] }> }).navrhy["0-01"]!.pruty).toHaveLength(13);

    // Uložit do dílny: práce přibude, návštěva trvá.
    await akce(s, "host-ulozit").click();
    expect(await udaj(s, "hlaseni")).toBe("Uloženo do dílny jako „Z odkazu 1“.");
    expect(await telo(s, "host")).toBe("ano");
    // Zpět do svého pískoviště: údolí 24 m a vlastní most.
    await Promise.all([s.waitForEvent("load"), akce(s, "host-zpet").click()]);
    await s.locator(PLATNO).waitFor();
    expect(new URL(s.url()).search).toBe("?sandbox");
    expect(await telo(s, "host")).toBe("ne");
    expect(await telo(s, "pruty")).toBe("13");

    // Otevřít ve svém pískovišti: rozestavěný most se sám uloží do dílny a stůl je scénář.
    await s.goto(odkaz);
    await s.locator(PLATNO).waitFor();
    await Promise.all([s.waitForEvent("load"), akce(s, "host-nechat").click()]);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ne");
    expect(await telo(s, "pruty")).toBe("6");
    expect(await udaj(s, "jizdni-rad")).toContain("loď");
    await otevriDilnu(s);
    const jmena = (await karty(s).locator(".dilna__jmeno").allInnerTexts()).map(bezMezer);
    expect(jmena).toEqual(["Rozestavěný 1", "Z odkazu 1"]);
    await s.screenshot({ path: `${SLOZKA}/d4-dilna-po-scenari.png` });
    await s.keyboard.press("Escape");
    // Tentýž odkaz podruhé už návštěva není: scénář je na stole.
    await s.goto(odkaz);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ne");
    expect(await telo(s, "pruty")).toBe("6");
  }, 300_000);

  it("otevření práce z dílny během návštěvy nejdřív uloží hráčův rozestavěný most; když to nejde, nic nepřepíše", async () => {
    const s = await cistaStranka();
    // Hráč má v dílně jednu práci a na stole jiný, neuložený most (příhrada bez jedné diagonály).
    await otevriPiskoviste(s);
    await nactiMost(s, prihrada());
    await otevriDilnu(s);
    await s.locator("#dilna-nazev").fill("První");
    await akce(s, "dilna-ulozit").click();
    await s.keyboard.press("Escape");
    const cela = prihrada();
    const bezDiagonaly: NavrhMostu = { ...cela, pruty: cela.pruty.slice(0, -1) };
    await nactiMost(s, bezDiagonaly);
    expect(await telo(s, "pruty")).toBe("12");

    // Na návštěvě ve scénáři otevře práci z dílny: jeho most z pískoviště se nesmí ztratit.
    const kanal = PREDLOHY_SANDBOXU.find((p) => p.id === "kanal")!.nastaveni;
    const odkaz = odkazNaScenar(adresa, kanal, zakodujMost(zvedaci()));
    await s.goto(odkaz);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ano");
    await otevriDilnu(s);
    await Promise.all([s.waitForEvent("load"), karty(s).first().locator('[data-akce="dilna-otevrit"]').click()]);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ne");
    expect(await telo(s, "pruty")).toBe("13");
    await otevriDilnu(s);
    expect((await karty(s).locator(".dilna__jmeno").allInnerTexts()).map(bezMezer)).toEqual(["Rozestavěný 1", "První"]);
    await s.keyboard.press("Escape");

    // Plná dílna: rozestavěný most není kam uložit, takže se nic neotevře a nic nepřepíše.
    await nactiMost(s, { ...cela, pruty: cela.pruty.slice(0, -2) });
    expect(await telo(s, "pruty")).toBe("11");
    await s.evaluate(() => {
      const dilna = JSON.parse(window.localStorage.getItem("mostmistr.dilna")!) as { prace: { nazev: string }[] };
      const vzor = dilna.prace[1]!;
      for (let i = 0; dilna.prace.length < 12; i++) dilna.prace.push({ ...vzor, nazev: `Výplň ${i}` });
      window.localStorage.setItem("mostmistr.dilna", JSON.stringify(dilna));
    });
    await s.goto(odkaz);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ano");
    await otevriDilnu(s);
    expect(await karty(s).count()).toBe(12);
    await karty(s).nth(1).locator('[data-akce="dilna-otevrit"]').click();
    expect(await udaj(s, "dilna-hlaseni")).toContain("do dílny se ho uložit nepodařilo");
    expect(await s.locator("#okno-dilna[open]").count()).toBe(1);
    expect(await telo(s, "host")).toBe("ano");
    const ulozeny = await s.evaluate(() => (JSON.parse(window.localStorage.getItem("mostmistr.ulozeni")!) as { navrhy: Record<string, { pruty: unknown[] }> }).navrhy["0-01"]!.pruty.length);
    expect(ulozeny).toBe(11);
    await s.keyboard.press("Escape");
    // Totéž u „Otevřít ve svém pískovišti“.
    await akce(s, "host-nechat").click();
    expect(await udaj(s, "hlaseni")).toContain("do dílny se ho uložit nepodařilo");
    expect(await telo(s, "host")).toBe("ano");
  }, 240_000);

  it("odkaz, ze kterého vypadlo údolí nebo je poškozené, nic neotevře a řekne to", async () => {
    const s = await cistaStranka();
    const kod = zakodujMost(zvedaci());
    // Most pískoviště bez údolí: přehled s hlášením.
    await s.goto(`${adresa}?most=${kod}`);
    await s.locator('body[data-rezim="prehled"]').waitFor();
    expect(await udaj(s, "prehled-hlaseni")).toContain("poškozený nebo neúplný");
    // Poškozené údolí: pískoviště hráče a hlášení, žádná návštěva.
    await s.goto(`${adresa}?most=${kod}&sandbox=2~16~8~s~1`);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ne");
    expect(await telo(s, "pruty")).toBe("0");
    expect(await udaj(s, "hlaseni")).toContain("poškozený nebo neúplný");
    // Údolí bez mostu: cizí údolí se hráči do jeho pískoviště neotevře, zůstane jeho vlastní (24 m).
    const kanal = PREDLOHY_SANDBOXU.find((p) => p.id === "kanal")!.nastaveni;
    await s.goto(`${adresa}?sandbox=${sandboxDoAdresy(kanal)}`);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ne");
    expect(await udaj(s, "hlaseni")).toContain("poškozený nebo neúplný");
    expect(await udaj(s, "jizdni-rad")).not.toContain("loď");
  }, 120_000);

  it("během práce v dílně prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
