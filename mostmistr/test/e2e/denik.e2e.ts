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
import { prijmiDenik, prijmiVazbu, spravuj, type ProstrediServeru } from "../../src/server/obsluha";
import { SkladVPameti } from "../../src/server/sklad";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
const HESLO = "tajne-heslo-123";

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

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4200, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  napoj("/api/denik", "denik", prijmiDenik);
  napoj("/api/vazba", "vazba", prijmiVazbu);
  napoj("/api/sprava", "sprava", spravuj);
  prohlizec = await chromium.launch();
  kontext = await prohlizec.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
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
    expect(await upozorneni.innerText()).toContain("anonymně zapisuje, jak se hraje");
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
    await stranka.locator('.vysledek [data-akce="vazba"]').click();
    const okno = stranka.locator("#okno-vazba");
    await okno.waitFor({ state: "visible" });
    expect(await akce("vazba-odeslat").isDisabled()).toBe(true);
    expect(await udaj("vazba-prilohy")).toContain("Přiložit můj most");
    await okno.locator('input[name="vazba-druh"][value="obtiznost"]').check();
    await stranka.locator("#vazba-text").fill("První úroveň je akorát, ale nevěděl jsem, že se dá táhnout z kotvy.");
    await okno.locator('[data-hodnoceni="4"]').click();
    await stranka.screenshot({ path: `${SLOZKA}/a1-zpetna-vazba.png` });
    // Klávesy v okně patří textu, ne hře: mezerník nepustí zkoušku.
    await stranka.locator("#vazba-text").press("Space");
    expect(await telo("rezim")).toBe("zkouska");
    await akce("vazba-odeslat").click();
    await expect.poll(() => okno.getAttribute("data-odeslano")).toBe("ano");
    expect(await udaj("vazba-hlaseni")).toMatch(/^Díky! Zpráva dorazila pod číslem \d{8}T\d{6}-[0-9a-f]{6}\.$/);
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
    await stranka.locator('#obrazovka-uroven .lista [data-akce="vazba"]').click();
    const okno = stranka.locator("#okno-vazba");
    await okno.waitFor({ state: "visible" });
    expect(await udaj("vazba-zaznam")).toContain("anonymně zapisuje");
    await akce("vazba-zaznam").click();
    expect(await udaj("vazba-zaznam")).toBe("Anonymní záznam hraní je vypnutý.");
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
    expect(await udaj("vazba-prilohy")).toContain("Přiložit posledních pár kroků");
    await stranka.locator("#vazba-text").fill("Chtělo by to víc úrovní.");
    await stranka.locator("#vazba-kontakt").fill("hrac@example.org");
    await akce("vazba-odeslat").click();
    await expect.poll(() => stranka.locator("#okno-vazba").getAttribute("data-odeslano")).toBe("ano");
    expect(await sklad.klice("vazba/")).toHaveLength(2);
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

describe("stránka správce", () => {
  it("bez správného hesla nic neukáže; s ním vypíše zpětnou vazbu a dovolí ji vyřešit", async () => {
    await stranka.goto(`${adresa}sprava.html`);
    await stranka.locator("#heslo").fill("spatne-heslo");
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
    expect(await stranka.locator("#vazba-uroven").getAttribute("href")).toBe("/?uroven=1-01");
    expect(await stranka.locator("#vazba-udalosti").innerText()).toContain("zkouska.konec");
    await stranka.screenshot({ path: `${SLOZKA}/a2-sprava-zpetna-vazba.png` });

    await stranka.locator('#vazba-stavy [data-stav="vyreseno"]').click();
    await stranka.locator("#vazba-poznamka").fill("Nápověda k tažení z kotvy doplněna do zadání.");
    await stranka.locator("#vazba-ulozit").click();
    await expect.poll(() => stranka.locator("#hlaseni").innerText()).toMatch(/^Uloženo: .* je vyřešeno\.$/);
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
    stranka.once("dialog", (dialog) => void dialog.accept());
    await stranka.locator("#vazba-smazat").click();
    await expect.poll(() => stranka.locator("#hlaseni").innerText()).toMatch(/^Smazáno: \d{8}T\d{6}-[0-9a-f]{6}\.$/);
    expect(await radky.count()).toBe(0);
    await stranka.locator('#filtr-stavu [data-filtr="vse"]').click();
    expect(await radky.count()).toBe(1);
    expect(await sklad.klice("vazba/")).toHaveLength(1);
  });

  it("deník ukáže souhrn dne po úrovních a jednotlivá sezení s mosty, které hráč zkoušel", async () => {
    await stranka.locator('[data-zalozka="denik"]').click();
    const dnes = new Date().toISOString().slice(0, 10);
    expect(await stranka.locator("#den").inputValue()).toBe(dnes);
    expect(await stranka.locator("#den-pocty").innerText()).toMatch(/^1 hráčů \(1 nových, 0 na dotyku\) · 1 sezení/);
    expect(await stranka.locator("#den-pocty").innerText()).toContain("záznam si vypnulo 1");
    const souhrn = stranka.locator('#souhrn tbody tr[data-uroven="1-01"] td');
    const bunky = await souhrn.allInnerTexts();
    expect(bunky.slice(0, 5)).toEqual(["1-01 Lávka přes potok", "1", "1", "1", "1"]);
    // Cena průchodu proti rozpočtům úrovně a z čeho hráč stavěl.
    expect(bunky[9]!.replace(/[\u202f\u00a0]/g, " ")).toBe("33 133 Kč · 33 133 Kč · rozpočet 45 000 Kč, inž. 33 500 Kč");
    expect(bunky[10]).toBe("drevo-lehke 4×, mostovka-drevo 2×");
    // Souhrn za delší období: sčítá dny, ze kterých deník je.
    await stranka.locator("#obdobi").selectOption("30");
    await expect.poll(() => stranka.locator("#souhrn-nadpis").innerText()).toContain("(1 dní s deníkem)");
    expect((await stranka.locator('#souhrn tbody tr[data-uroven="1-01"] td').allInnerTexts()).slice(0, 5)).toEqual(bunky.slice(0, 5));
    await stranka.locator("#obdobi").selectOption("1");
    const sezeni = stranka.locator("#sezeni tbody tr");
    expect(await sezeni.count()).toBe(1);
    await sezeni.first().click();
    await stranka.locator("#detail-sezeni").waitFor({ state: "visible" });
    const udalosti = stranka.locator("#sezeni-udalosti tr");
    expect(await udalosti.count()).toBeGreaterThan(10);
    const start = stranka.locator('#sezeni-udalosti tr[data-vyber="most"]').first();
    expect(await start.innerText()).toContain("most: 5 prutů");
    await start.click();
    expect(await stranka.locator("#sezeni-most").isVisible()).toBe(true);
    await stranka.screenshot({ path: `${SLOZKA}/a3-sprava-denik.png` });
    // Deník dne jde po potvrzení smazat celý.
    stranka.once("dialog", (dialog) => void dialog.accept());
    await stranka.locator("#smazat-den").click();
    await expect.poll(() => stranka.locator("#hlaseni").innerText()).toMatch(/^Smazáno: deník \d{4}-\d{2}-\d{2} \(\d+ dávek\)\.$/);
    expect(await sklad.klice("denik/")).toEqual([]);
    expect(await stranka.locator("#den-pocty").innerText()).toBe("Deník je zatím prázdný.");
  });

  it("během celého průchodu prohlížeč nehlásil žádnou chybu", () => {
    // Odmítnuté přihlášení správce prohlížeč ohlásí jako chybu sítě; ta je záměrná.
    expect(chyby.filter((c) => !c.includes("401"))).toEqual([]);
  });
});
