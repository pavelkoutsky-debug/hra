// Deník hraní a zpětná vazba v bezhlavém prohlížeči. Náhledový server dostane navíc cesty
// /api/…, které žádosti hry předají skutečné serverové obsluze s úložištěm v paměti, takže
// se zkouší celá cesta: hra → síť → server → stránka správce. Chybí jen běhové prostředí
// Netlify. (Zachytávání žádostí v prohlížeči by nestačilo: dávky posílané při opouštění
// stránky přes `sendBeacon` se zachytit nedají.)
import { mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhZTextu } from "../../src/data/navrh";
import { souhrnDeniku } from "../../src/denik/souhrn";
import type { DavkaDeniku, EvidovanaVazba, UdalostDeniku } from "../../src/denik/udalosti";
import { prijmiDenik, prijmiVazbu, type ProstrediServeru } from "../../src/server/obsluha";
import { spravujVse } from "../../src/server/sprava";
import { SkladVPameti } from "../../src/server/sklad";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
const HESLO = "tajne-heslo-spravce-123";

let server: PreviewServer;
let prohlizec: Browser;
let kontext: BrowserContext;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

const sklad = new SkladVPameti();
let cislo = 0;
const prostredi: ProstrediServeru = {
  sklad,
  ted: () => new Date(),
  nahoda: () => (++cislo).toString(16).padStart(6, "0"),
  prostredi: "test",
  hesloSpravce: HESLO,
  // Náhledový server hlavičku Netlify s adresou nepřidá.
  adresa: () => "203.0.113.7",
};
/** Kolik žádostí na který koncový bod hra poslala. */
const zadosti = { denik: 0, vazba: 0, sprava: 0 };

const udaj = async (jmeno: string): Promise<string> =>
  (await stranka.locator(`[data-udaj="${jmeno}"]`).innerText()).replace(/[  ]/g, " ");
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);

/** Všechny dávky deníku, které server přijal, seřazené podle pořadí. */
async function prijateDavky(): Promise<DavkaDeniku[]> {
  const klice = await sklad.klice("denik/");
  const davky = (await Promise.all(klice.map((k) => sklad.cti(k)))) as DavkaDeniku[];
  return davky.sort((a, b) => a.hlavicka.sezeni.localeCompare(b.hlavicka.sezeni) || a.poradi - b.poradi);
}

async function prijateUdalosti(): Promise<UdalostDeniku[]> {
  return (await prijateDavky()).flatMap((d) => d.udalosti).sort((a, b) => a.t - b.t);
}

/** Počká, až server přijme událost daného druhu (deník se posílá po dávkách). */
async function pockejNaUdalost(druh: string): Promise<UdalostDeniku> {
  await expect.poll(async () => (await prijateUdalosti()).some((u) => u.druh === druh), { timeout: 30_000 }).toBe(true);
  return (await prijateUdalosti()).filter((u) => u.druh === druh).at(-1)!;
}

async function bodSveta(x: number, y: number): Promise<{ x: number; y: number }> {
  return stranka.evaluate(
    ([sx, sy, volic]) => {
      const platno = document.querySelector<HTMLCanvasElement>(volic as string)!;
      const [kx, ky, m] = platno.dataset.kamera!.split(";").map(Number) as [number, number, number];
      const o = platno.getBoundingClientRect();
      return { x: o.left + o.width / 2 + ((sx as number) - kx) * m, y: o.top + o.height / 2 - ((sy as number) - ky) * m };
    },
    [x, y, PLATNO] as const,
  );
}

async function tahni(od: [number, number], k: [number, number]): Promise<void> {
  const a = await bodSveta(...od);
  const b = await bodSveta(...k);
  await stranka.mouse.move(a.x, a.y);
  await stranka.mouse.down();
  await stranka.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
  await stranka.mouse.move(b.x, b.y, { steps: 3 });
  await stranka.mouse.up();
}

/** Přidá náhledovému serveru cestu, která žádosti předává serverové obsluze hry. */
function napoj(cesta: string, ktera: keyof typeof zadosti, obsluha: (zadost: Request, p: ProstrediServeru) => Promise<Response>): void {
  const vyrid = (zadost: IncomingMessage, odpoved: ServerResponse): void => {
    zadosti[ktera] += 1;
    const casti: Buffer[] = [];
    zadost.on("data", (cast: Buffer) => casti.push(cast));
    zadost.on("end", () => {
      const metoda = zadost.method ?? "GET";
      const hlavicky = new Headers();
      for (const [jmeno, hodnota] of Object.entries(zadost.headers)) {
        if (typeof hodnota === "string") hlavicky.set(jmeno, hodnota);
      }
      const cela = (zadost as IncomingMessage & { originalUrl?: string }).originalUrl ?? zadost.url ?? cesta;
      const predana = new Request(new URL(cela, adresa), {
        method: metoda,
        headers: hlavicky,
        ...(metoda === "GET" || metoda === "HEAD" ? {} : { body: Buffer.concat(casti).toString("utf8") }),
      });
      void obsluha(predana, prostredi).then(async (vysledek) => {
        odpoved.statusCode = vysledek.status;
        vysledek.headers.forEach((hodnota, jmeno) => odpoved.setHeader(jmeno, hodnota));
        odpoved.end(await vysledek.text());
      });
    });
  };
  // Na začátek řady, před obsluhu souborů, která by na neznámou cestu odpověděla sama.
  server.middlewares.stack.unshift({ route: cesta, handle: vyrid });
}

/** Rozbalí podrobnosti výsledku (čísla, podmínky medailí, hlášení chyby), pokud jsou sbalené. */
async function rozbalVysledek(): Promise<void> {
  const panel = stranka.locator(".vysledek");
  if ((await panel.getAttribute("data-sbaleno")) === "ano") await stranka.locator('[data-akce="vysledek-sbalit"]').click();
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4200, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  napoj("/api/denik", "denik", prijmiDenik);
  napoj("/api/vazba", "vazba", prijmiVazbu);
  napoj("/api/sprava", "sprava", spravujVse);
  prohlizec = await chromium.launch();
  kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
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

describe("upozornění na deník hraní", () => {
  it("přehled poprvé upozorní, že hra vede anonymní záznam; po potvrzení už ne", async () => {
    await stranka.goto(adresa);
    await stranka.locator(".karta").first().waitFor();
    expect(await telo("denik")).toBe("zapnuto");
    const upozorneni = stranka.locator('#obrazovka-prehled [data-udaj="zaznam-upozorneni"]');
    expect(await upozorneni.isVisible()).toBe(true);
    // Upozornění říká, že záznam odchází autorům hry, co v něm je a že jde vypnout.
    expect(await upozorneni.innerText()).toContain("odesílá autorům záznam hraní");
    expect(await upozorneni.innerText()).toContain("Záznam jde kdykoli vypnout");
    expect(await stranka.locator("#zaznam-hrani").isChecked()).toBe(true);
    await stranka.screenshot({ path: `${SLOZKA}/a0-upozorneni-na-denik.png` });
    await upozorneni.locator('[data-akce="zaznam-rozumim"]').click();
    expect(await upozorneni.isVisible()).toBe(false);
    await stranka.reload();
    await stranka.locator(".karta").first().waitFor();
    expect(await upozorneni.isVisible()).toBe(false);
    expect(await stranka.locator("#zaznam-hrani").isChecked()).toBe(true);
  });
});

describe("deník z průchodu úrovní", () => {
  it("zapíše otevření úrovně, každý nakreslený prut, zkoušku i její výsledek", async () => {
    await stranka.goto(`${adresa}?uroven=1-01`);
    await stranka.locator(PLATNO).waitFor();
    // Hráč přišel přes přehled a upozornění už potvrdil: v okně se zadáním se neopakuje.
    expect(await stranka.locator('#okno-zadani [data-udaj="zaznam-upozorneni"]').isVisible()).toBe(false);
    await stranka.locator('#okno-zadani[open] button[value="zavrit"]').click();

    // Klik do prázdného výkresu není úprava mostu: do deníku se jako změna stavby nezapíše.
    const prazdno = await bodSveta(4, 4);
    await stranka.mouse.click(prazdno.x, prazdno.y);
    expect(await telo("pruty")).toBe("0");

    // Mostovka ze dvou dílů a věšadlo nad ní, jako referenční most první úrovně.
    await tahni([0, 0], [4, 0]);
    await tahni([4, 0], [8, 0]);
    await stranka.locator('.paleta__prvky button[data-prvek="drevo-lehke"]').click();
    await tahni([0, 0], [4, 2]);
    await tahni([4, 2], [8, 0]);
    await tahni([4, 0], [4, 2]);
    expect(await telo("pruty")).toBe("5");

    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("Space");
    await stranka.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 60_000 });
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await udaj("vysledek-nadpis")).toBe("MOST OBSTÁL");

    const konec = await pockejNaUdalost("zkouska.konec");
    expect(konec).toMatchObject({ uroven: "1-01", data: { pruchod: true, pokus: null, zkouska: 1, spadlo: 0, poruseni: 0, prvni: null, rozpad: false } });
    expect(konec.data!.medaile).toMatchObject({ pruchod: true });
    expect(konec.data!.vyuziti).toBeGreaterThan(0.05);
    expect(konec.data!.vypocetMs).toBeGreaterThan(0);

    const udalosti = await prijateUdalosti();
    const druhy = udalosti.map((u) => u.druh);
    for (const druh of ["sezeni.start", "prehled.otevren", "uroven.otevrena", "zadani.zavreno", "stavba.zmena", "nastroj", "zkouska.start", "zkouska.konec"]) {
      expect(druhy, druh).toContain(druh);
    }
    // Každý prut má v deníku svůj prvek a odkud kam vede.
    const pruty = udalosti.filter((u) => u.druh === "stavba.zmena");
    expect(pruty.map((u) => u.data)).toMatchObject([
      { co: "prut", prvek: "mostovka-drevo", od: [0, 0], k: [4, 0], prutu: 1 },
      { co: "prut", prvek: "mostovka-drevo", od: [4, 0], k: [8, 0], prutu: 2 },
      { co: "prut", prvek: "drevo-lehke", od: [0, 0], k: [4, 2], prutu: 3 },
      { co: "prut", prvek: "drevo-lehke", od: [4, 2], k: [8, 0], prutu: 4 },
      { co: "prut", prvek: "drevo-lehke", od: [4, 0], k: [4, 2], prutu: 5 },
    ]);
    expect(udalosti.find((u) => u.druh === "nastroj")!.data).toEqual({ ktery: "kresleni", prvek: "drevo-lehke" });
    // Zkouška nese celý most, takže jde později postavit znovu.
    const start = udalosti.find((u) => u.druh === "zkouska.start")!;
    expect(start.data).toMatchObject({ prutu: 5, pokus: null, uprav: 5 });
    expect(navrhZTextu(start.data!.navrh as string).pruty).toHaveLength(5);
    // Události jdou za sebou v čase a všechny patří jednomu sezení jednoho hráče.
    const davky = await prijateDavky();
    expect(new Set(davky.map((d) => `${d.hlavicka.hrac}/${d.hlavicka.sezeni}`)).size).toBe(1);
    expect(davky.map((d) => d.poradi)).toEqual(davky.map((_, i) => i));
    expect(davky[0]!.hlavicka).toMatchObject({ verze: 1, okno: [1280, 720], dotyk: false });
    // Souhrn, jak ho uvidí správce.
    const souhrn = souhrnDeniku(davky);
    expect(souhrn.urovne).toEqual([expect.objectContaining({ uroven: "1-01", hracu: 1, zkousek: 1, pruchodu: 1, hracuSPruchodem: 1 })]);
  }, 120_000);
});

describe("zpětná vazba", () => {
  it("z výsledku zkoušky jde napsat zpráva; server ji zaeviduje i s mostem a posledními kroky", async () => {
    await rozbalVysledek();
    await stranka.locator('.vysledek [data-akce="vazba"]').click();
    const okno = stranka.locator("#okno-vazba");
    await okno.waitFor({ state: "visible" });
    expect(await akce("vazba-odeslat").isDisabled()).toBe(true);
    expect(await udaj("vazba-prilohy")).toContain("Přiložit můj most a poslední kroky z této úrovně");
    expect(await stranka.locator("#vazba-prilohy").isChecked()).toBe(true);
    expect(await udaj("vazba-pocet")).toBe("0 / 4000 znaků");
    await okno.locator('input[name="vazba-druh"][value="obtiznost"]').check();
    await stranka.locator("#vazba-text").fill("První úroveň je akorát, ale nevěděl jsem, že se dá táhnout z kotvy.");
    expect(await udaj("vazba-pocet")).toBe("67 / 4000 znaků");
    await okno.locator('[data-hodnoceni="4"]').click();
    await stranka.screenshot({ path: `${SLOZKA}/a1-zpetna-vazba.png` });
    // Klávesy v okně patří textu, ne hře: mezerník nepustí zkoušku.
    await stranka.locator("#vazba-text").press("Space");
    expect(await telo("rezim")).toBe("zkouska");
    await akce("vazba-odeslat").click();
    await expect.poll(() => okno.getAttribute("data-odeslano")).toBe("ano");
    expect(await udaj("vazba-hlaseni")).toBe("Díky, zpráva dorazila.");
    expect(zadosti.vazba).toBe(1);

    const klice = await sklad.klice("vazba/");
    expect(klice).toHaveLength(1);
    const vazba = (await sklad.cti(klice[0]!)) as EvidovanaVazba;
    expect(vazba).toMatchObject({ stav: "nova", druh: "obtiznost", uroven: "1-01", hodnoceni: 4, prostredi: "test" });
    expect(vazba.text).toContain("táhnout z kotvy");
    expect(navrhZTextu(vazba.navrh!).pruty).toHaveLength(5);
    expect(vazba.udalosti!.map((u) => u.druh)).toContain("zkouska.konec");
    expect(vazba).not.toHaveProperty("kontakt");
    await okno.locator('button[value="zavrit"]').click();
  });

  it("s vypnutým záznamem hra neodešle nic, zpětnou vazbu ale poslat jde", async () => {
    await akce("upravit").click();
    // „Napiš nám“ je v liště i dole v paletě; v úzkém okně zůstane jen to v paletě.
    await stranka.setViewportSize({ width: 1100, height: 720 });
    expect(await stranka.locator('#obrazovka-uroven .lista [data-akce="vazba"]').isVisible()).toBe(false);
    await stranka.screenshot({ path: `${SLOZKA}/a5-uzke-okno.png` });
    await stranka.setViewportSize({ width: 1280, height: 720 });
    expect(await stranka.locator('#obrazovka-uroven .lista [data-akce="vazba"]').isVisible()).toBe(true);
    await stranka.locator('#obrazovka-uroven .paleta [data-akce="vazba"]').click();
    const okno = stranka.locator("#okno-vazba");
    await okno.waitFor({ state: "visible" });
    expect(await udaj("vazba-zaznam")).toContain("odesílá autorům záznam hraní pod náhodným číslem");
    await akce("vazba-zaznam").click();
    expect(await udaj("vazba-zaznam")).toBe("Záznam hraní je vypnutý.");
    // Kdo záznam vypnul, tomu se kroky ze hry ke zprávě samy nepřikládají.
    expect(await stranka.locator("#vazba-prilohy").isChecked()).toBe(false);
    expect(await telo("denik")).toBe("vypnuto");
    await okno.locator('button[value="zavrit"]').click();
    // Vypnutí samo se ještě odešle; počkáme na něj a od té chvíle počítáme.
    await pockejNaUdalost("denik.vypnut");
    const predtim = zadosti.denik;

    await stranka.locator('.paleta__prvky button[data-prvek="drevo-lehke"]').click();
    await tahni([0, 0], [2, 1]);
    await stranka.locator(PLATNO).focus();
    await stranka.keyboard.press("Space");
    await stranka.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 60_000 });
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    await akce("upravit").click();
    // Přechod na přehled: s vypnutým záznamem se neodešle ani rozloučení s úrovní.
    await stranka.goto(adresa);
    await stranka.locator(".karta").first().waitFor();
    await stranka.waitForTimeout(500);
    expect(zadosti.denik).toBe(predtim);
    expect((await prijateUdalosti()).filter((u) => u.druh === "zkouska.konec")).toHaveLength(1);
    expect(await stranka.locator("#zaznam-hrani").isChecked()).toBe(false);

    // Zpětná vazba je výslovná zpráva od hráče: odejde i teď, v přehledu bez mostu.
    await stranka.locator('#obrazovka-prehled [data-akce="vazba"]').click();
    expect(await udaj("vazba-prilohy")).toContain("Přiložit poslední kroky z této stránky");
    expect(await stranka.locator("#vazba-prilohy").isChecked()).toBe(false);
    await stranka.locator("#vazba-text").fill("Chtělo by to víc úrovní.");
    await stranka.locator("#vazba-kontakt").fill("hrac@example.org");
    expect(await stranka.locator(".vazba__poznamka").innerText()).toContain("E-mail uvidíme jen u této zprávy");
    // Enter v poli s e-mailem zprávu odešle (dřív okno zavřel a zpráva se ztratila).
    await stranka.locator("#vazba-kontakt").press("Enter");
    await expect.poll(() => stranka.locator("#okno-vazba").getAttribute("data-odeslano")).toBe("ano");
    expect(await udaj("vazba-hlaseni")).toBe("Díky, zpráva dorazila. Odpovědět ti můžeme na uvedený e-mail.");
    const klice = await sklad.klice("vazba/");
    expect(klice).toHaveLength(2);
    // Bez zaškrtnutí šla jen zpráva: žádný most ani kroky ze hry.
    const bezPriloh = (await Promise.all(klice.map((k) => sklad.cti(k)))) as EvidovanaVazba[];
    expect(bezPriloh.find((v) => v.kontakt === "hrac@example.org")).not.toHaveProperty("udalosti");
    expect(zadosti.denik).toBe(predtim);
    await stranka.locator('#okno-vazba button[value="zavrit"]').click();

    // Zapnutí vypínačem v přehledu záznam obnoví; odchod z úrovně se pak zapíše.
    await stranka.locator("#zaznam-hrani").check();
    expect(await telo("denik")).toBe("zapnuto");
    await stranka.goto(`${adresa}?uroven=1-01`);
    await stranka.locator(PLATNO).waitFor();
    await stranka.goto(adresa);
    await stranka.locator(".karta").first().waitFor();
    const odchod = await pockejNaUdalost("uroven.opustena");
    expect(odchod).toMatchObject({ uroven: "1-01", data: { zkousek: 0, prutu: 6 } });
  }, 120_000);
});

describe("hráč, který přijde rovnou do úrovně", () => {
  it("vidí upozornění na záznam i po zavření zadání, v paletě; po vypnutí mu hra potvrdí, že nic dalšího neodejde", async () => {
    const novyHrac = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const okno = await novyHrac.newPage();
    try {
      await okno.goto(`${adresa}?uroven=1-02`);
      await okno.locator(PLATNO).waitFor();
      // V okně se zadáním upozornění je; hráč ho přejde a okno zavře.
      expect(await okno.locator('#okno-zadani [data-udaj="zaznam-upozorneni"]').isVisible()).toBe(true);
      await okno.locator('#okno-zadani[open] button[value="zavrit"]').click();
      const vPalete = okno.locator('.paleta [data-udaj="zaznam-upozorneni"]');
      expect(await vPalete.isVisible()).toBe(true);
      await okno.screenshot({ path: `${SLOZKA}/a4-upozorneni-v-palete.png` });
      const predtim = zadosti.denik;
      await vPalete.locator('[data-akce="zaznam-vypnout"]').click();
      expect(await okno.locator("body").getAttribute("data-denik")).toBe("vypnuto");
      // Na místě upozornění zůstane potvrzení, dokud ho hráč neodklikne.
      expect(await vPalete.innerText()).toContain("Záznam hraní je vypnutý a nic dalšího se neodesílá");
      expect(await vPalete.locator('[data-akce="zaznam-vypnout"]').isVisible()).toBe(false);
      // Odejde jediná dávka s jedinou událostí: že hráč záznam vypnul.
      await expect.poll(() => zadosti.denik).toBe(predtim + 1);
      // Když si to hráč rozmyslí a záznam v okně „Napiš nám“ zase zapne, potvrzení o vypnutí
      // nesmí zůstat viset; po dalším vypnutí odejde zase jen zpráva o vypnutí.
      await okno.locator('#obrazovka-uroven .paleta [data-akce="vazba"]').click();
      await okno.locator('[data-akce="vazba-zaznam"]').click();
      expect(await okno.locator("body").getAttribute("data-denik")).toBe("zapnuto");
      expect(await vPalete.isVisible()).toBe(false);
      await okno.locator('[data-akce="vazba-zaznam"]').click();
      expect(await okno.locator("body").getAttribute("data-denik")).toBe("vypnuto");
      await okno.locator('#okno-vazba button[value="zavrit"]').click();
      expect(await vPalete.isVisible()).toBe(false);
      await expect.poll(() => zadosti.denik).toBe(predtim + 2);
      const davky = (await prijateDavky()).filter((d) => d.udalosti.some((u) => u.druh === "denik.vypnut"));
      expect(davky.at(-1)!.udalosti.map((u) => u.druh)).toEqual(["denik.vypnut"]);
      await okno.goto(adresa);
      await okno.locator(".karta").first().waitFor();
      await okno.waitForTimeout(300);
      expect(zadosti.denik).toBe(predtim + 2);
    } finally {
      await novyHrac.close();
    }
  });
});

describe("odkaz bez záznamu", () => {
  it("adresa s ?zaznam=vypnout záznam v prohlížeči potichu vypne: neodejde nic, ani zpráva o vypnutí", async () => {
    const zadavatel = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const okno = await zadavatel.newPage();
    try {
      const predtim = zadosti.denik;
      await okno.goto(`${adresa}?uroven=1-02&zaznam=vypnout`);
      await okno.locator(PLATNO).waitFor();
      expect(await okno.locator("body").getAttribute("data-denik")).toBe("vypnuto");
      expect(await okno.locator('#okno-zadani [data-udaj="zaznam-upozorneni"]').isVisible()).toBe(false);
      // Parametr z adresy zmizí, aby se zkopírovaným odkazem nešířil dál; úroveň v ní zůstane.
      expect(new URL(okno.url()).search).toBe("?uroven=1-02");
      // Vypnutí platí dál i bez parametru v adrese.
      await okno.goto(adresa);
      await okno.locator(".karta").first().waitFor();
      expect(await okno.locator("#zaznam-hrani").isChecked()).toBe(false);
      await okno.waitForTimeout(300);
      expect(zadosti.denik).toBe(predtim);
    } finally {
      await zadavatel.close();
    }
  });
});

describe("stránka správce", () => {
  it("bez správného hesla nic neukáže; s ním vypíše zpětnou vazbu a dovolí ji vyřešit", async () => {
    await stranka.goto(`${adresa}sprava.html`);
    await stranka.locator("#heslo").fill("spatne-heslo-spravce");
    await stranka.locator('#prihlaseni button[type="submit"]').click();
    await stranka.locator('body[data-sprava="odmitnuto"]').waitFor();
    expect(await stranka.locator("#hlaseni").innerText()).toBe("Nesprávné heslo správce.");
    expect(await stranka.locator("#obsah").isVisible()).toBe(false);

    await stranka.locator("#heslo").fill(HESLO);
    await stranka.locator('#prihlaseni button[type="submit"]').click();
    await stranka.locator('body[data-sprava="prihlaseno"]').waitFor();
    const radky = stranka.locator("#vazby tbody tr");
    expect(await radky.count()).toBe(2);
    expect(await stranka.locator("#filtr-stavu").innerText()).toContain("nová (2)");
    // Nejnovější je nahoře; starší má přiložený most.
    expect(await radky.nth(0).innerText()).toContain("Chtělo by to víc úrovní. [kontakt]");
    expect(await radky.nth(1).innerText()).toContain("[most]");
    await radky.nth(1).click();
    const detail = stranka.locator("#detail-vazby");
    await detail.waitFor({ state: "visible" });
    expect(await stranka.locator("#vazba-text").innerText()).toContain("táhnout z kotvy");
    expect(await stranka.locator("#vazba-udaje").innerText()).toContain("4 z 5");
    expect(await stranka.locator("#vazba-most").isVisible()).toBe(true);
    // Hra se ze správy otevírá v novém panelu a s vypnutým záznamem.
    expect(await stranka.locator("#vazba-uroven").getAttribute("href")).toBe("/?uroven=1-01&zaznam=vypnout");
    expect(await stranka.locator("#vazba-uroven").getAttribute("target")).toBe("_blank");
    expect(await stranka.locator("#vazba-udalosti").innerText()).toContain("zkouska.konec");
    await stranka.screenshot({ path: `${SLOZKA}/a2-sprava-zpetna-vazba.png` });

    await stranka.locator('#vazba-stavy [data-stav="vyreseno"]').click();
    await stranka.locator("#vazba-poznamka").fill("Nápověda k tažení z kotvy doplněna do zadání.");
    await stranka.locator("#vazba-ulozit").click();
    await expect.poll(() => stranka.locator("#hlaseni").innerText()).toMatch(/^Uloženo: .* – stav „vyřešeno“\.$/);
    expect(await stranka.locator("#filtr-stavu").innerText()).toContain("vyřešeno (1)");
    const ulozene = (await Promise.all((await sklad.klice("vazba/")).map((k) => sklad.cti(k)))) as EvidovanaVazba[];
    expect(ulozene.find((v) => v.druh === "obtiznost")).toMatchObject({ stav: "vyreseno", poznamka: "Nápověda k tažení z kotvy doplněna do zadání." });
    // Filtr podle stavu.
    await stranka.locator('#filtr-stavu [data-filtr="nova"]').click();
    expect(await radky.count()).toBe(1);
    expect(await radky.nth(0).innerText()).toContain("víc úrovní");
    // Zpětnou vazbu jde po potvrzení smazat (spam, omyl).
    await radky.nth(0).click();
    await detail.waitFor({ state: "visible" });
    expect(await stranka.locator("#vazba-text").innerText()).toContain("víc úrovní");
    stranka.once("dialog", (dialog) => void dialog.accept());
    await stranka.locator("#vazba-smazat").click();
    await expect.poll(() => stranka.locator("#hlaseni").innerText()).toMatch(/^Smazáno: \d{8}T\d{6}-[0-9a-f]{6}\.$/);
    expect(await radky.allInnerTexts()).toEqual(["V tomto stavu žádná zpětná vazba není."]);
    await stranka.locator('#filtr-stavu [data-filtr="vse"]').click();
    expect(await radky.count()).toBe(1);
    expect(await radky.nth(0).innerText()).toContain("táhnout z kotvy");
    expect(await sklad.klice("vazba/")).toHaveLength(1);
  });

  it("deník ukáže souhrn dne po úrovních a jednotlivá sezení s mosty, které hráč zkoušel", async () => {
    await stranka.locator('[data-zalozka="denik"]').click();
    const dnes = new Date().toISOString().slice(0, 10);
    expect(await stranka.locator("#den").inputValue()).toBe(dnes);
    expect(await stranka.locator("#den-pocty").innerText()).toMatch(/^2 hráči \(z toho nových 1, na dotyku 0\) · 2 sezení/);
    // První hráč záznam vypnul a zase zapnul; vypnutý ho má jen ten, kdo přišel rovnou do úrovně.
    expect(await stranka.locator("#den-pocty").innerText()).toContain("záznam si vypnul 1 hráč");
    const souhrn = stranka.locator('#souhrn tbody tr[data-uroven="1-01"] td');
    const bunky = await souhrn.allInnerTexts();
    expect(bunky.slice(0, 5)).toEqual(["1-01 Lávka přes potok", "1", "1", "1", "1"]);
    // Na dotyku nikdo nehrál a hráč pruty kreslil.
    expect(bunky[6]).toBe("0 / 0");
    expect(bunky[7]).toBe("0");
    // Cena průchodu proti rozpočtům úrovně a z čeho hráč stavěl.
    // Nápovědu si hráč neotevřel a do zlomu nezkoušel.
    expect(bunky[11]).toBe("0 / 0");
    expect(bunky[12]).toBe("0 / 0");
    expect(bunky[13]!.replace(/[\u202f\u00a0]/g, " ")).toBe("33 133 Kč · 33 133 Kč · rozpočet 45 000 Kč, inž. 32 500 Kč");
    // (Čtvrtý trám hráč nakreslil s vypnutým záznamem, takže o něm deník neví.)
    expect(bunky[14]).toBe("drevo-lehke 3×, mostovka-drevo 2×");
    // Hráč, který záznam hned vypnul, úroveň neotevřel: souhrn ho vede mezi hráči bez úrovně.
    expect(await stranka.locator("#den-bez-urovne").innerText()).toMatch(/^Bez úrovně kampaně: 1 hráč/);
    // Souhrn za delší období: sčítá dny, ze kterých deník je.
    await stranka.locator("#obdobi").selectOption("30");
    await expect.poll(() => stranka.locator("#souhrn-nadpis").textContent()).toContain("(1 dní s deníkem)");
    expect((await stranka.locator('#souhrn tbody tr[data-uroven="1-01"] td').allInnerTexts()).slice(0, 5)).toEqual(bunky.slice(0, 5));
    await stranka.locator("#obdobi").selectOption("1");
    const sezeni = stranka.locator("#sezeni tbody tr");
    // Dvě sezení: hráč z průchodu úrovní a ten, který záznam hned vypnul (má jen dávky o vypnutí).
    expect(await sezeni.count()).toBe(2);
    const davek = await sezeni.locator("td.cislo").allInnerTexts();
    await sezeni.nth(davek.findIndex((pocet) => Number(pocet) > 1)).click();
    await stranka.locator("#detail-sezeni").waitFor({ state: "visible" });
    const udalosti = stranka.locator("#sezeni-udalosti tr");
    expect(await udalosti.count()).toBeGreaterThan(10);
    const start = stranka.locator('#sezeni-udalosti tr[data-vyber="most"]').first();
    expect(await start.innerText()).toContain("most: 5 prutů");
    await start.click();
    expect(await stranka.locator("#sezeni-most").isVisible()).toBe(true);
    await stranka.screenshot({ path: `${SLOZKA}/a3-sprava-denik.png` });

    // Od zprávy rovnou k sezení, ze kterého ji hráč poslal.
    await stranka.locator('[data-zalozka="vazby"]').click();
    await stranka.locator("#vazby tbody tr").first().click();
    await stranka.locator("#detail-vazby").waitFor({ state: "visible" });
    const hrac = /Hráč\s+([0-9a-f]{16})/.exec(await stranka.locator("#vazba-udaje").innerText())![1]!;
    await stranka.locator("#detail-sezeni").evaluate((detail) => ((detail as HTMLElement).hidden = true));
    await stranka.locator("#vazba-sezeni").click();
    await stranka.locator("#detail-sezeni").waitFor({ state: "visible" });
    expect(await stranka.locator('[data-zalozka="denik"]').getAttribute("aria-selected")).toBe("true");
    expect(await stranka.locator("#sezeni-udaje").innerText()).toContain(hrac);
    expect(await stranka.locator('#sezeni tbody tr[aria-selected="true"]').innerText()).toContain(hrac);
    // Deník dne jde po potvrzení smazat celý.
    stranka.once("dialog", (dialog) => void dialog.accept());
    await stranka.locator("#smazat-den").click();
    await expect.poll(() => stranka.locator("#hlaseni").innerText()).toMatch(/^Smazáno: deník \d{4}-\d{2}-\d{2} \(\d+ dávek\)\.$/);
    expect(await sklad.klice("denik/")).toEqual([]);
    expect(await stranka.locator("#den-pocty").innerText()).toBe("Deník je zatím prázdný.");
  });

  it("okno Soukromí a kontakt ukáže číslo hráče, přepne záznam a vede k žádosti o smazání", async () => {
    await stranka.goto(adresa);
    await stranka.locator(".karta").first().waitFor();
    const okno = stranka.locator("#okno-soukromi");
    await stranka.locator('.prehled__verze [data-akce="soukromi"]').click();
    await okno.waitFor({ state: "visible" });
    // Číslo hráče je to, pod kterým hra vede záznam (podle něj jde na serveru dohledat a smazat).
    const cislo = await stranka.evaluate(() => window.localStorage.getItem("mostmistr.hrac"));
    expect(cislo).toMatch(/^[0-9a-f-]{8,}$/i);
    expect(await udaj("soukromi-hrac")).toBe(cislo);
    const text = await okno.innerText();
    for (const cast of ["12 měsících", "24 měsících", "Netlify", "automatický rozbor", "od prvního otevření"]) expect(text, cast).toContain(cast);
    await stranka.screenshot({ path: `${SLOZKA}/a9-soukromi.png` });
    // Vypínač záznamu dělá totéž co vypínač v přehledu.
    const pred = await telo("denik");
    await akce("soukromi-zaznam").click();
    expect(await telo("denik")).toBe(pred === "zapnuto" ? "vypnuto" : "zapnuto");
    await akce("soukromi-zaznam").click();
    expect(await telo("denik")).toBe(pred);
    // Žádost o smazání jde oknem Napiš nám.
    await akce("soukromi-napis").click();
    await stranka.locator("#okno-vazba").waitFor({ state: "visible" });
    expect(await okno.isVisible()).toBe(false);
    await stranka.locator('#okno-vazba button[value="zavrit"]').click();
    // Adresa ?soukromi okno otevře rovnou (odkaz bez skriptu vede na tutéž stránku).
    await stranka.goto(`${adresa}?soukromi`);
    await okno.waitFor({ state: "visible" });
    await okno.locator('button[value="zavrit"]').click();
    // Na telefonu se okno vejde na šířku a dá se zavřít.
    await stranka.setViewportSize({ width: 390, height: 844 });
    await stranka.locator('.prehled__verze [data-akce="soukromi"]').click();
    await okno.waitFor({ state: "visible" });
    const obdelnik = await okno.boundingBox();
    expect(obdelnik!.width).toBeLessThanOrEqual(390);
    await stranka.screenshot({ path: `${SLOZKA}/a9-soukromi-telefon.png` });
    await okno.locator('button[value="zavrit"]').click();
    await stranka.setViewportSize({ width: 1280, height: 720 });
  });

  it("během celého průchodu prohlížeč nehlásil žádnou chybu", () => {
    // Odmítnuté přihlášení správce prohlížeč ohlásí jako chybu sítě; ta je záměrná.
    expect(chyby.filter((c) => !c.includes("401"))).toEqual([]);
  });
});

describe("zkouška, kterou hra nepustí", () => {
  it("most dražší než rozpočet se nezkouší a deník si zapíše proč", async () => {
    const hrac = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const puvodni = stranka;
    stranka = await hrac.newPage();
    try {
      await stranka.goto(`${adresa}?uroven=1-01`);
      await stranka.locator(PLATNO).waitFor();
      await stranka.locator('#okno-zadani[open] button[value="zavrit"]').click();
      // Mostovka a nad ní zbytečně vysoká a hustá konstrukce z trámů: přes 45 000 Kč.
      await tahni([0, 0], [4, 0]);
      await tahni([4, 0], [8, 0]);
      await stranka.locator('.paleta__prvky button[data-prvek="drevo-lehke"]').click();
      for (const [od, k] of [[[0, 0], [4, 2]], [[4, 2], [8, 0]], [[0, 0], [4, 4]], [[4, 4], [8, 0]], [[4, 0], [4, 2]], [[4, 2], [4, 4]]] as [[number, number], [number, number]][]) {
        await tahni(od, k);
      }
      expect(await telo("pruty")).toBe("8");
      await stranka.locator(PLATNO).focus();
      await stranka.keyboard.press("Space");
      expect(await telo("rezim")).toBe("stavba");
      expect(await stranka.locator(".vykres__hlaseni").innerText()).toContain("rozpoč");
      // Odchod z úrovně deník odešle.
      await stranka.goto(adresa);
      await stranka.locator(".karta").first().waitFor();
      const odmitnuta = await pockejNaUdalost("zkouska.odmitnuta");
      expect(odmitnuta).toMatchObject({ uroven: "1-01", data: { duvod: "nad-rozpocet", pokus: null } });
      expect(odmitnuta.data!.cena).toBeGreaterThan(45_000);
      expect((await prijateUdalosti()).some((u) => u.druh === "zkouska.start")).toBe(false);
    } finally {
      stranka = puvodni;
      await hrac.close();
    }
  });
});

describe("zpětná vazba z pískoviště", () => {
  it("správce vidí most z pískoviště nakreslený v odhadnutém údolí a odkaz vede do pískoviště", async () => {
    const hrac = await prohlizec.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const s = await hrac.newPage();
    try {
      await s.goto(`${adresa}?sandbox=1`);
      await s.locator(PLATNO).waitFor();
      await s.locator('#okno-zadani[open] button[value="zavrit"]').click();
      // Mostovka přes výchozí údolí 24 m se vzpěrou do paty svahu.
      const most = {
        verze: 4,
        uroven: "0-01",
        stycniky: [
          { id: 0, x: 0, y: 0 },
          { id: 1, x: 6, y: 0 },
          { id: 2, x: 12, y: 0 },
          { id: 3, x: 18, y: 0 },
          { id: 4, x: 24, y: 0 },
          { id: 5, x: 3, y: -8 },
        ],
        pruty: [
          { id: 0, a: 0, b: 1, prvek: "mostovka-ocelobeton" },
          { id: 1, a: 1, b: 2, prvek: "mostovka-ocelobeton" },
          { id: 2, a: 2, b: 3, prvek: "mostovka-ocelobeton" },
          { id: 3, a: 3, b: 4, prvek: "mostovka-ocelobeton" },
          { id: 4, a: 5, b: 1, prvek: "ocel-tezka" },
        ],
      };
      await s.locator('[data-akce="import"]').click();
      await s.locator("#okno-obsah").fill(JSON.stringify(most));
      await s.locator('[data-akce="okno-nacist"]').click();
      expect(await s.locator("body").getAttribute("data-pruty")).toBe("5");
      await s.locator('#obrazovka-uroven .lista [data-akce="vazba"]').click();
      const okno = s.locator("#okno-vazba");
      await okno.waitFor({ state: "visible" });
      await s.locator("#vazba-text").fill("Pískoviště je fajn, tady je můj most.");
      await s.locator('[data-akce="vazba-odeslat"]').click();
      await expect.poll(() => okno.getAttribute("data-odeslano")).toBe("ano");

      await s.goto(`${adresa}sprava.html`);
      await s.locator("#heslo").fill(HESLO);
      await s.locator('#prihlaseni button[type="submit"]').click();
      await s.locator('body[data-sprava="prihlaseno"]').waitFor();
      await s.locator("#vazby tbody tr", { hasText: "Pískoviště je fajn" }).click();
      await s.locator("#detail-vazby").waitFor({ state: "visible" });
      expect(await s.locator("#vazba-most").isVisible()).toBe(true);
      expect(await s.locator("#vazba-uroven").getAttribute("href")).toBe("/?sandbox&zaznam=vypnout");
      await s.screenshot({ path: `${SLOZKA}/a4-sprava-most-z-piskoviste.png` });
    } finally {
      await hrac.close();
    }
  }, 120_000);
});
