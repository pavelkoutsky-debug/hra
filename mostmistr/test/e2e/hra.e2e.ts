// Průchod hrou v bezhlavém prohlížeči: přehled kampaně, stavba mostu myší, zkouška,
// vyhodnocení, uložení a načtení. Kritérium milníku M2: test postaví most myší a vyhraje,
// a uložení a načtení dá shodný otisk výpočtu.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;

let server: PreviewServer;
let prohlizec: Browser;
let kontext: BrowserContext;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

const udaj = (jmeno: string): Promise<string> => stranka.locator(`[data-udaj="${jmeno}"]`).innerText();
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);

/** Místo na stránce, kde leží bod světa (metry, y nahoru). */
async function bodSveta(x: number, y: number): Promise<{ x: number; y: number }> {
  return stranka.evaluate(
    ([sx, sy]) => {
      const platno = document.querySelector<HTMLCanvasElement>("#obrazovka-uroven canvas")!;
      const [kx, ky, m] = platno.dataset.kamera!.split(";").map(Number) as [number, number, number];
      const o = platno.getBoundingClientRect();
      return { x: o.left + o.width / 2 + (sx! - kx) * m, y: o.top + o.height / 2 - (sy! - ky) * m };
    },
    [x, y],
  );
}

/** Táhne myší z jednoho bodu světa do druhého, jako když hráč kreslí prut. */
async function tahni(a: [number, number], b: [number, number]): Promise<void> {
  const pa = await bodSveta(...a);
  const pb = await bodSveta(...b);
  await stranka.mouse.move(pa.x, pa.y);
  await stranka.mouse.down();
  await stranka.mouse.move((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, { steps: 3 });
  await stranka.mouse.move(pb.x, pb.y, { steps: 3 });
  await stranka.mouse.up();
}

async function klikni(a: [number, number]): Promise<void> {
  const p = await bodSveta(...a);
  await stranka.mouse.click(p.x, p.y);
}

const pocetPrutu = async (): Promise<number> => Number(await telo("pruty"));

/** Pustí zkoušku mezerníkem, počká na výpočet a přeskočí přehrávání na konec. */
async function vyzkousej(): Promise<{ nadpis: string; otisk: string }> {
  await stranka.locator("#obrazovka-uroven canvas").focus();
  await stranka.keyboard.press("Space");
  await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 60_000 });
  expect(await telo("zkouska")).toBe("hotovo");
  await akce("na-konec").click();
  await stranka.locator(".vysledek").waitFor({ state: "visible" });
  return { nadpis: await udaj("vysledek-nadpis"), otisk: (await telo("otisk")) ?? "" };
}

async function nastavCas(sekundy: number): Promise<void> {
  await stranka.locator("#cas").evaluate((tahlo, cas) => {
    (tahlo as HTMLInputElement).value = String(cas);
    tahlo.dispatchEvent(new Event("input", { bubbles: true }));
  }, sekundy);
  await stranka.evaluate(() => new Promise<void>((hotovo) => requestAnimationFrame(() => requestAnimationFrame(() => hotovo()))));
}

/** Zavře okno se zadáním, pokud je otevřené (úroveň bez mostu jím vítá). */
async function zavriZadani(): Promise<void> {
  const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

async function otevriUroven(id: string): Promise<void> {
  await stranka.goto(`${adresa}?uroven=${id}`);
  await stranka.locator("#obrazovka-uroven canvas").waitFor();
  await expect.poll(() => udaj("fyzika"), { timeout: 5000 }).toMatch(/^v\d+$/);
  await zavriZadani();
}

/** Čas děje z ukazatele vedle časové osy, v sekundách. */
async function casDeje(): Promise<number> {
  const nalez = /^(\d+,\d) s/.exec(await udaj("cas"));
  if (!nalez) throw new Error("Nečekaný zápis času.");
  return Number(nalez[1]!.replace(",", "."));
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4192, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
  kontext = await prohlizec.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await kontext.grantPermissions(["clipboard-read", "clipboard-write"]);
  stranka = await kontext.newPage();
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("přehled kampaně", () => {
  it("ukáže první kapitolu; odemčená je jen první úroveň", async () => {
    await stranka.goto(adresa);
    await stranka.locator(".karta").first().waitFor();
    expect(await stranka.title()).toBe("Mostmistr");
    expect(await stranka.locator(".kapitola h1").innerText()).toBe("Kapitola 1 · Potok");
    expect(await stranka.locator(".karta").count()).toBe(4);
    expect(await stranka.locator('.karta[data-zamceno="false"]').count()).toBe(1);
    expect(await stranka.locator('.karta[data-uroven="1-02"]').innerText()).toContain("nejdřív projdi úroveň 1-01");
    await stranka.screenshot({ path: `${SLOZKA}/20-prehled.png` });
  });

  it("neznámá úroveň v adrese skončí v přehledu s vysvětlením", async () => {
    await stranka.goto(`${adresa}?uroven=9-99`);
    expect(await udaj("prehled-hlaseni")).toBe("Úroveň 9-99 neexistuje.");
    await stranka.goto(adresa);
  });

  it("kliknutí na kartu otevře úroveň a ta přivítá oknem se zadáním", async () => {
    await stranka.locator('.karta[data-uroven="1-01"] a').click();
    await stranka.locator("#obrazovka-uroven canvas").waitFor();
    const okno = stranka.locator("#okno-zadani");
    await okno.waitFor({ state: "visible" });
    expect(await udaj("zadani-list")).toBe("ÚROVEŇ 1-01");
    expect(await udaj("zadani-nazev")).toBe("Lávka přes potok");
    expect(await udaj("zadani-text")).toContain("Přes potok mají přejít tři chodci");
    expect(await udaj("zadani-provoz")).toContain("2× chodec");
    expect(await udaj("zadani-stavba")).toContain("rozpočet 45\u202f000\u00a0Kč");
    expect(await stranka.locator('[data-udaj="zadani-medaile"] li').count()).toBe(3);
    await stranka.screenshot({ path: `${SLOZKA}/21a-zadani.png` });

    // Dokud je okno otevřené, mezerník zkoušku nepouští.
    await stranka.keyboard.press("Space");
    expect(await telo("rezim")).toBe("stavba");
    expect(await okno.isVisible()).toBe(false); // mezerník zmáčkl tlačítko „Jdu stavět“

    // Zadání zůstává vlevo a okno jde otevřít znovu.
    expect(await udaj("zadani")).toContain("Přes potok mají přejít tři chodci");
    await akce("zadani").click();
    await okno.waitFor({ state: "visible" });
    await stranka.keyboard.press("Escape");
    expect(await okno.isVisible()).toBe(false);
    expect(await udaj("nazev")).toBe("Lávka přes potok");
    expect(await stranka.locator(".paleta__prvky button").count()).toBe(2);
    expect(await udaj("rozpocet")).toBe("0 Kč / 45 000 Kč");
    expect(await udaj("jizdni-rad")).toContain("2× chodec");
    await stranka.screenshot({ path: `${SLOZKA}/21-prazdna-uroven.png` });
  });
});

describe("stavba myší", () => {
  it("tažením z kotvy vznikne mostovka a cena naskočí", async () => {
    await tahni([0, 0], [4, 0]);
    expect(await pocetPrutu()).toBe(1);
    expect(await udaj("cena")).toBe("10 000 Kč");
    await tahni([4, 0], [8, 0]);
    expect(await pocetPrutu()).toBe(2);
    expect(await udaj("rozpocet")).toBe("20 000 Kč / 45 000 Kč");
  });

  it("příliš dlouhý prut nepoloží a řekne proč", async () => {
    await tahni([0, 0], [6, 2]);
    expect(await pocetPrutu()).toBe(2);
    expect(await udaj("hlaseni")).toBe("Příliš dlouhý prut: Dřevěná mostovka měří nejvýš 4 m.");
  });

  it("z volného místa kreslit nejde: most roste jen z kotev a styčníků", async () => {
    await tahni([2, 3], [5, 3]);
    expect(await pocetPrutu()).toBe(2);
  });

  it("samotná mostovka s kloubem uprostřed zkouškou neprojde", async () => {
    const { nadpis } = await vyzkousej();
    expect(nadpis).toBe("MOST NEOBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toContain("nemá pod vlastní tíhou klidovou polohu");
    expect(await stranka.locator('[data-udaj="vysledek-medaile"] [data-ziskana="true"]').count()).toBe(0);
    await nastavCas(1.2);
    await stranka.screenshot({ path: `${SLOZKA}/22-pad-mostovky.png` });
    await akce("upravit").click();
    expect(await telo("rezim")).toBe("stavba");
  });

  it("klávesa 2 přepne na trám; krokev, sloupek a zrcadlení dostaví věšadlo", async () => {
    await stranka.keyboard.press("2");
    expect(await stranka.locator('[data-prvek="drevo-lehke"]').getAttribute("aria-pressed")).toBe("true");
    await tahni([0, 0], [4, 2]);
    await tahni([4, 0], [4, 2]);
    expect(await pocetPrutu()).toBe(4);
    await stranka.keyboard.press("m");
    expect(await pocetPrutu()).toBe(5);
    // 8 m mostovky, dvě krokve √20 m a sloupek 2 m.
    expect(await udaj("cena")).toBe("33 133 Kč");
  });

  it("zpět a znovu vrací poslední úpravu", async () => {
    await stranka.keyboard.press("Control+z");
    expect(await pocetPrutu()).toBe(4);
    await stranka.keyboard.press("Control+y");
    expect(await pocetPrutu()).toBe(5);
  });

  it("kliknutí prut vybere a Delete ho smaže; zpět ho vrátí", async () => {
    await klikni([2, 1]);
    expect(await akce("smazat").isEnabled()).toBe(true);
    await stranka.keyboard.press("Delete");
    expect(await pocetPrutu()).toBe(4);
    await akce("zpet").click();
    expect(await pocetPrutu()).toBe(5);
  });

  it("nástrojem výběru jde styčník přetáhnout jinam; pruty jdou s ním", async () => {
    await stranka.keyboard.press("v");
    expect(await akce("vyber").getAttribute("aria-pressed")).toBe("true");
    await tahni([4, 2], [4, 3]);
    expect(await pocetPrutu()).toBe(5);
    // Krokve se prodloužily na 5 m a sloupek na 3 m.
    expect(await udaj("cena")).toBe("35\u202f600\u00a0Kč");
    await stranka.keyboard.press("Control+z");
    expect(await udaj("cena")).toBe("33\u202f133\u00a0Kč");
    await stranka.keyboard.press("v");
    expect(await akce("vyber").getAttribute("aria-pressed")).toBe("false");
    await stranka.screenshot({ path: `${SLOZKA}/23-vesadlo.png` });
  });

  it("most dražší než rozpočet na zkoušku nepustí", async () => {
    // Tři zbytečné krokve navíc: cena přeleze 45 000 Kč.
    await stranka.keyboard.press("2");
    await tahni([0, 0], [2, 4]);
    await tahni([2, 4], [4, 2]);
    await tahni([4, 2], [6, 4]);
    await tahni([6, 4], [8, 0]);
    expect(await stranka.locator(".rozpocet").getAttribute("data-stav")).toBe("nad");
    await stranka.locator("#obrazovka-uroven canvas").focus();
    await stranka.keyboard.press("Space");
    expect(await telo("rezim")).toBe("stavba");
    expect(await udaj("hlaseni")).toBe("Most je dražší než rozpočet. Před zkouškou ho zlevni.");
    for (let i = 0; i < 4; i++) await stranka.keyboard.press("Control+z");
    expect(await pocetPrutu()).toBe(5);
    expect(await stranka.locator(".rozpocet").getAttribute("data-stav")).toBe("inz");
  });
});

describe("zkouška a vyhodnocení", () => {
  let otisk = "";

  it("věšadlo zkouškou projde a získá medaile", async () => {
    await stranka.locator("#obrazovka-uroven canvas").focus();
    await stranka.keyboard.press("Space");
    await stranka.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 60_000 });
    await nastavCas(4);
    await stranka.screenshot({ path: `${SLOZKA}/24-chodci-na-moste.png` });
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await udaj("vysledek-nadpis")).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toBe("Přešli a přejeli všichni (3).");
    // Průchod a rozpočet (33 133 Kč se vejde do 33 500 Kč).
    expect(await stranka.locator('[data-udaj="vysledek-medaile"] [data-ziskana="true"]').count()).toBeGreaterThanOrEqual(2);
    otisk = (await telo("otisk")) ?? "";
    expect(otisk).toMatch(/^[0-9a-f]{8,}$/);
    expect(await akce("dalsi").isVisible()).toBe(true);
    await stranka.screenshot({ path: `${SLOZKA}/25-vysledek.png` });
  });

  it("přehrávání jde zpomalit na desetinu a krokovat po setinách sekundy", async () => {
    await akce("prehrat-znovu").click();
    await stranka.locator('[data-rychlost="0.1"]').click();
    expect(await stranka.locator('[data-rychlost="0.1"]').getAttribute("aria-pressed")).toBe("true");
    expect(await stranka.locator('[data-rychlost="1"]').getAttribute("aria-pressed")).toBe("false");
    await stranka.waitForTimeout(600);
    // Šest desetin sekundy skutečného času je při desetinové rychlosti pár setin děje.
    await akce("prehrat").click();
    expect(await casDeje()).toBeLessThan(0.3);

    await nastavCas(3);
    await akce("krok-vpred").click();
    await akce("krok-vpred").click();
    await stranka.keyboard.press(".");
    await stranka.keyboard.press(".");
    await stranka.keyboard.press(".");
    expect(await casDeje()).toBeCloseTo(3.1, 5);
    await stranka.keyboard.press(",");
    await akce("krok-zpet").click();
    await akce("krok-zpet").click();
    await akce("krok-zpet").click();
    await akce("krok-zpet").click();
    expect(await casDeje()).toBeCloseTo(3.0, 5);
    await stranka.locator('[data-rychlost="1"]').click();
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
  });

  it("legenda využití je při zkoušce vidět a čísla u prutů jdou vypnout", async () => {
    expect(await stranka.locator(".uroven .legenda").isVisible()).toBe(true);
    const prepinac = akce("cisla");
    expect(await prepinac.getAttribute("aria-pressed")).toBe("true");

    /** Kolik pixelů plátna má barvu pozadí; rámečky čísel jich pár přikryjí a pár přidají. */
    const otiskPlatna = (): Promise<string> =>
      stranka.evaluate(() => {
        const platno = document.querySelector<HTMLCanvasElement>("#obrazovka-uroven canvas")!;
        return platno.toDataURL().slice(-64);
      });
    await nastavCas(5.7);
    const sCisly = await otiskPlatna();
    await stranka.screenshot({ path: `${SLOZKA}/24a-cisla-vyuziti.png` });
    await stranka.keyboard.press("c");
    expect(await prepinac.getAttribute("aria-pressed")).toBe("false");
    await stranka.evaluate(() => new Promise<void>((hotovo) => requestAnimationFrame(() => requestAnimationFrame(() => hotovo()))));
    expect(await otiskPlatna()).not.toBe(sCisly);
    await prepinac.click();
    expect(await prepinac.getAttribute("aria-pressed")).toBe("true");
  });

  it("odkaz na největší využití skočí na časové ose do toho okamžiku", async () => {
    await stranka.locator('[data-udaj="vysledek-vyuziti"] button').click();
    const zapis = await udaj("cas");
    expect(zapis).toMatch(/^\d+,\d s \/ \d+,\d s$/);
    expect(zapis.startsWith("0,0 s")).toBe(false);
  });

  it("diagnostika jde zkopírovat a obsahuje most i výsledek", async () => {
    await akce("diagnostika").click();
    const text = await stranka.locator("#okno-obsah").inputValue();
    expect(text).toContain("Úroveň: 1-01 Lávka přes potok");
    expect(text).toContain('"uroven":"1-01"');
    expect(text).toContain(`"otisk":"${otisk}"`);
    await akce("okno-kopirovat").click();
    // Zápis do schránky je asynchronní; hlášení přijde až po něm.
    await expect.poll(() => udaj("okno-hlaseni")).toBe("Zkopírováno do schránky.");
    expect(await stranka.evaluate(() => navigator.clipboard.readText())).toBe(text);
    await stranka.locator("#okno button[value=zavrit]").click();
  });

  it("po návratu ke stavbě ukazuje výkres obálku namáhání a medaile jsou v popisovém poli", async () => {
    await stranka.locator("#obrazovka-uroven canvas").focus();
    await stranka.keyboard.press("Space");
    expect(await telo("rezim")).toBe("stavba");
    expect(await udaj("medaile")).toContain("◆");
    await klikni([2, 1]);
    expect(await udaj("hlaseni")).toMatch(/^Prut \d: největší využití \d+ % \(.+\) v čase \d+,\d s$/);
    await stranka.screenshot({ path: `${SLOZKA}/26-obalka.png` });
  });

  it("po novém načtení stránky je most zpátky a zkouška dá stejný otisk", async () => {
    await stranka.reload();
    await stranka.locator("#obrazovka-uroven canvas").waitFor();
    // K rozestavěnému mostu se zadání nevnucuje.
    expect(await stranka.locator("#okno-zadani").isVisible()).toBe(false);
    expect(await pocetPrutu()).toBe(5);
    expect(await udaj("cena")).toBe("33 133 Kč");
    const znovu = await vyzkousej();
    expect(znovu.nadpis).toBe("MOST OBSTÁL");
    expect(znovu.otisk).toBe(otisk);
    await akce("upravit").click();
  });

  it("export a import mostu dá tentýž most a tentýž otisk", async () => {
    await akce("export").click();
    const text = await stranka.locator("#okno-obsah").inputValue();
    expect(text).toContain('"uroven":"1-01"');
    await stranka.locator("#okno button[value=zavrit]").click();

    await akce("smazat-vse").click();
    expect(await pocetPrutu()).toBe(0);

    await akce("import").click();
    await stranka.locator("#okno-obsah").fill("tohle není most");
    await akce("okno-nacist").click();
    expect(await udaj("okno-hlaseni")).toContain("Tenhle text most není");
    await stranka.locator("#okno-obsah").fill(text);
    await akce("okno-nacist").click();
    expect(await pocetPrutu()).toBe(5);

    const znovu = await vyzkousej();
    expect(znovu.otisk).toBe(otisk);
  });

  it("přehled ukáže medaile a odemkne další úroveň", async () => {
    await stranka.goto(adresa);
    await stranka.locator(".karta").first().waitFor();
    expect(await stranka.locator('.karta[data-uroven="1-01"] .karta__medaile').innerText()).toContain("◆");
    expect(await stranka.locator('.karta[data-uroven="1-01"]').innerText()).toContain("nejlevnější most 33 133 Kč");
    expect(await stranka.locator('.karta[data-uroven="1-02"]').getAttribute("data-zamceno")).toBe("false");
    expect(await stranka.locator('.karta[data-uroven="1-03"]').getAttribute("data-zamceno")).toBe("true");
    await stranka.screenshot({ path: `${SLOZKA}/27-prehled-s-medaili.png` });
  });
});

describe("další úrovně kapitoly", () => {
  it("auto přejede referenční most úrovně 1-03", async () => {
    await otevriUroven("1-03");
    await akce("import").click();
    await stranka.locator("#okno-obsah").fill(navrhNaText(RESENI["1-03"]!.pruchod));
    await akce("okno-nacist").click();
    expect(await pocetPrutu()).toBeGreaterThan(10);
    await stranka.locator("#obrazovka-uroven canvas").focus();
    await stranka.keyboard.press("Space");
    await stranka.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 60_000 });
    await nastavCas(1.1);
    await stranka.screenshot({ path: `${SLOZKA}/28-auto-na-moste.png` });
    await nastavCas(5.6);
    await stranka.screenshot({ path: `${SLOZKA}/29-auto-a-cyklista.png` });
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await udaj("vysledek-nadpis")).toBe("MOST OBSTÁL");
  });

  it("dvě auta za sebou přejedou referenční most přes hluboké údolí", async () => {
    await otevriUroven("1-04");
    await akce("import").click();
    await stranka.locator("#okno-obsah").fill(navrhNaText(RESENI["1-04"]!.pruchod));
    await akce("okno-nacist").click();
    await stranka.locator("#obrazovka-uroven canvas").focus();
    await stranka.keyboard.press("Space");
    await stranka.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 60_000 });
    await nastavCas(2.2);
    await stranka.screenshot({ path: `${SLOZKA}/31-hluboke-udoli.png` });
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await udaj("vysledek-nadpis")).toBe("MOST OBSTÁL");
    // Poslední úroveň kapitoly další nemá.
    expect(await akce("dalsi").isVisible()).toBe(false);
  });

  it("most, který spadnout má, spadne i s autem a výsledek vypíše porušení", async () => {
    await otevriUroven("1-03");
    const pad = RESENI["1-03"]!.pady[0]!;
    await akce("import").click();
    await stranka.locator("#okno-obsah").fill(navrhNaText(pad.navrh));
    await akce("okno-nacist").click();
    const { nadpis } = await vyzkousej();
    expect(nadpis).toBe("MOST NEOBSTÁL");
    expect(await udaj("vysledek-poruseni")).toContain("sjel z posuvné podpory");
    await stranka.screenshot({ path: `${SLOZKA}/30-zriceni.png` });
  });

  it("za celý průchod stránka nenahlásila žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
