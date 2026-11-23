// Šestá kapitola v bezhlavém prohlížeči: kolejiště, vlak v jízdním řádu, průjezd vlaku,
// pohodlí cestujících, brzdící vlak na viaduktu a most o dvou patrech.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { prijimejDenik } from "./server-deniku";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText, navrhZTextu } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

/** Text údaje s obyčejnými mezerami: hra v číslech a před jednotkami píše nezlomitelné. */
const udaj = async (jmeno: string): Promise<string> =>
  (await stranka.locator(`[data-udaj="${jmeno}"]`).innerText()).replace(/[  ]/g, " ");
/** Text prvku, i když je ve sbalené části okna (`innerText` sbaleného obsahu je prázdný). */
const celyText = async (jmeno: string): Promise<string> =>
  ((await stranka.locator(`[data-udaj="${jmeno}"]`).textContent()) ?? "").replace(/[\u202f\u00a0]/g, " ");
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);

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

async function otevri(id: string, zavritZadani = true): Promise<void> {
  await stranka.goto(`${adresa}?uroven=${id}`);
  await stranka.locator(PLATNO).waitFor();
  if (!zavritZadani) return;
  const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

async function nactiMost(text: string): Promise<void> {
  await akce("import").click();
  await stranka.locator("#okno-obsah").fill(text);
  await akce("okno-nacist").click();
}

/** Návrh, který má hra právě na výkresu. */
async function mostNaVykresu(): Promise<ReturnType<typeof navrhZTextu>> {
  await akce("export").click();
  const text = await stranka.locator("#okno-obsah").inputValue();
  await stranka.keyboard.press("Escape");
  return navrhZTextu(text);
}

async function spust(): Promise<void> {
  await stranka.locator(PLATNO).focus();
  await stranka.keyboard.press("Space");
  await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
  expect(await telo("zkouska")).toBe("hotovo");
}

async function naKonec(): Promise<string> {
  await akce("na-konec").click();
  await stranka.locator(".vysledek").waitFor({ state: "visible" });
  return udaj("vysledek-nadpis");
}

async function nastavCas(sekundy: number): Promise<void> {
  await stranka.locator("#cas").evaluate((tahlo, cas) => {
    (tahlo as HTMLInputElement).value = String(cas);
    tahlo.dispatchEvent(new Event("input", { bubbles: true }));
  }, sekundy);
  await stranka.evaluate(() => new Promise<void>((hotovo) => requestAnimationFrame(() => requestAnimationFrame(() => hotovo()))));
}

const ziskaneMedaile = (): Promise<number> => stranka.locator('[data-udaj="vysledek-medaile"] [data-ziskana="true"]').count();
/** Které medaile výsledek dal: průchod, rozpočet, mistrovská. */
const medaile = (): Promise<(string | null)[]> =>
  stranka.locator('[data-udaj="vysledek-medaile"] [data-ziskana]').evaluateAll((uzly) => uzly.map((u) => u.getAttribute("data-ziskana")));

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4201, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
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

describe("přehled kampaně", () => {
  it("má šestou kapitolu Trať se čtyřmi úrovněmi", async () => {
    await stranka.goto(`${adresa}?vyvoj=1`);
    await stranka.locator(".karta").first().waitFor();
    const kapitoly = await stranka.locator(".prehled__kapitoly .kapitola").allInnerTexts();
    expect(kapitoly.length).toBeGreaterThanOrEqual(6);
    expect(kapitoly[5]).toContain("Trať");
    expect(kapitoly[5]).toContain("Kolejiště, lokomotiva a vozy");
    await stranka.locator("#odemknout-vse").check();
    const karty = await stranka.locator(".karta").allInnerTexts();
    for (const nazev of ["První vlak", "Rychlík", "Uhelný vlak", "Dvě patra"]) {
      expect(karty.some((text) => text.includes(nazev)), nazev).toBe(true);
    }
    await stranka.locator(".prehled__kapitoly").evaluate((el) => el.lastElementChild?.scrollIntoView());
    await stranka.screenshot({ path: `${SLOZKA}/t0-kapitola-trat.png` });
  });
});

describe("první vlak: kolejiště", () => {
  it("zadání popisuje vlak, kolej a kolejiště; kolejiště se kreslí po šesti metrech", async () => {
    await otevri("6-01", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-nazev")).toBe("První vlak");
    // Zadání jsou dvě věty; co je kolejiště, vysvětluje „Více o úloze“ (sbalené, stejně jako seznam prvků).
    expect(await udaj("zadani-text")).toContain("poprvé koleje: pojede lokomotiva a tři ložené vozy");
    expect(await celyText("zadani-vice")).toContain("Kolejiště je kolej na dvou ocelových podélnících");
    expect(await udaj("zadani-provoz")).toContain("vlak (lokomotiva, 3× ložený vůz) zleva, vyráží v čase 0 s");
    expect(await udaj("zadani-provoz")).toContain("Kolej je svařená, bez styků");
    expect(await celyText("zadani-stavba")).toContain("Kolejiště: 16 000 Kč/m · do 6 m");
    expect(await celyText("zadani-skutecnost")).toContain("Negrelliho viadukt");
    await stranka.screenshot({ path: `${SLOZKA}/t1-zadani-prvni-vlak.png` });
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();

    const prvky = await stranka.locator(".paleta__prvky button").allInnerTexts();
    expect(prvky[0]).toContain("Kolejiště");
    expect(await udaj("jizdni-rad")).toContain("0 s → vlak (lokomotiva, 3× ložený vůz)");
    // Dlouhý tah se rozdělí na šestimetrová pole.
    await tahni([0, 0], [30, 0]);
    expect(await telo("pruty")).toBe("5");
    expect(await udaj("cena")).toBe("480 000 Kč");
    const most = await mostNaVykresu();
    expect(most.pruty.every((p) => p.prvek === "kolejiste")).toBe(true);
    await stranka.screenshot({ path: `${SLOZKA}/t2-kolejiste.png` });
  });

  it("samotné kolejiště se pod lokomotivou složí; pětimetrová příhrada vlak unese", async () => {
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["6-01"]!.pruchod));
    await spust();
    await nastavCas(3.2);
    await stranka.screenshot({ path: `${SLOZKA}/t3-vlak-na-moste.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toMatch(/^(Přešli a přejeli|Přešli|Přejeli) všichni \(4\)\.$/);
    // Průchod a rozpočet (826 731 Kč se vejde do 850 000 Kč a nic se neporušilo); na mistrovskou je využití 68 % moc.
    expect(await medaile()).toEqual(["true", "true", "false"]);
    await stranka.screenshot({ path: `${SLOZKA}/t4-vysledek-prvni-vlak.png` });
  }, 240_000);

  it("trojúhelníková příhrada s oblým pásem má všechny tři medaile; pod kolejí stavět nejde", async () => {
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["6-01"]!.mistrovska));
    await spust();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    // Mistrovská je rozpočtová a k ní bonus: most se do inženýrského rozpočtu vejde a má všechny tři.
    expect(await medaile()).toEqual(["true", "true", "true"]);
    await akce("upravit").click();
    const predtim = await telo("pruty");
    await stranka.locator('.paleta__prvky button[data-prvek="ocel-lehka"]').click();
    await tahni([6, 0], [6, -4]);
    expect(await telo("pruty")).toBe(predtim);
    expect(await udaj("hlaseni")).not.toBe("");
  }, 240_000);
});

describe("rychlík: pohodlí cestujících", () => {
  it("třímetrová příhrada vlak unese, ale ve voze to houpe; hlubší srazí houpání na polovinu a pod mez medaile", async () => {
    await otevri("6-02", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-provoz")).toContain("vlak (lokomotiva, 4× osobní vůz), 100 km/h zleva");
    expect(await udaj("zadani-provoz")).toContain("Kolej má po 25 metrech styky kolejnic");
    expect(await celyText("zadani-skutecnost")).toContain("velmi dobré pohodlí");
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    expect(await stranka.locator('[data-udaj="podminky"]').innerText()).toContain("rozpočtová medaile a k ní zrychlení v osobním voze nejvýš 0,50 m/s²");

    await nactiMost(navrhNaText(RESENI["6-02"]!.pruchod));
    await spust();
    await nastavCas(2);
    await stranka.screenshot({ path: `${SLOZKA}/t5-rychlik.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    const nazevRadku = (await stranka.locator('.vysledek dt[data-radek="autobus"]').innerText()).toLowerCase();
    expect(nazevRadku).toContain("pohodlí ve vlaku");
    const melka = Number(await stranka.locator('[data-udaj="vysledek-autobus"]').getAttribute("data-zrychleni"));
    expect(melka).toBeGreaterThan(0.5);
    // Průchod a rozpočet (most je levný); mistrovská za pohodlí chybí.
    expect(await medaile()).toEqual(["true", "true", "false"]);

    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["6-02"]!.mistrovska));
    await spust();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    const hluboka = Number(await stranka.locator('[data-udaj="vysledek-autobus"]').getAttribute("data-zrychleni"));
    // Mez mistrovské medaile je 0,50 m/s²: hlubší příhrada se pod ni dostane a houpe míň než z poloviny.
    expect(hluboka).toBeLessThan(0.5);
    expect(hluboka).toBeLessThan(melka / 2);
    // Mistrovská je rozpočtová a k ní bonus: příhrada se třemi dolními styčníky se do inženýrského
    // rozpočtu vejde, takže tenhle most má všechny tři medaile sám.
    expect(await medaile()).toEqual(["true", "true", "true"]);
    await stranka.screenshot({ path: `${SLOZKA}/t6-vysledek-rychlik.png` });
  }, 300_000);
});

describe("uhelný vlak: brzdění na viaduktu", () => {
  it("pilíře bez vzpěr a svarů brzdící vlak zlomí; s hlavami pilířů svařenými s kolejištěm viadukt obstojí", async () => {
    await otevri("6-03", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-provoz")).toContain("vlak (lokomotiva, 10× ložený vůz) zleva, vyráží v čase 0 s; na mostě zabrzdí, 3 s stojí a rozjede se");
    expect(await celyText("zadani-skutecnost")).toContain("Firth of Forth");
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    expect(await udaj("jizdni-rad")).toContain("na mostě zabrzdí");

    await nactiMost(navrhNaText(RESENI["6-03"]!.pady[3]!.navrh));
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    await stranka.screenshot({ path: `${SLOZKA}/t7-zlomene-pilire.png` });

    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["6-03"]!.pruchod));
    await spust();
    await nastavCas(9);
    await stranka.screenshot({ path: `${SLOZKA}/t8-vlak-brzdi-na-viaduktu.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toMatch(/^(Přešli a přejeli|Přešli|Přejeli) všichni \(11\)\.$/);
  }, 400_000);
});

describe("dvě patra: kolej a silnice nad sebou", () => {
  it("trať vede z tunelu, obě nivelety jsou na výkresu; každá mostovka patří na svou", async () => {
    await otevri("6-04", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    const provoz = await udaj("zadani-provoz");
    expect(provoz).toContain("vlak (lokomotiva, 4× ložený vůz) zleva");
    expect(provoz).toContain("2× nákladní auto zprava");
    expect(provoz).toContain("autobus zleva");
    // Nerovná silnice i kolej se styky mají v zadání každá svou větu.
    expect(provoz).toContain("Vozovka je běžná");
    expect(provoz).toContain("Kolej má po 25 metrech styky kolejnic");
    expect(await celyText("zadani-skutecnost")).toContain("Øresund");
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    await stranka.screenshot({ path: `${SLOZKA}/t9-dve-patra-prazdny-vykres.png` });

    // Jen dvě mostovky: obě se složí.
    await nactiMost(navrhNaText(RESENI["6-04"]!.pady[0]!.navrh));
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
  }, 240_000);

  it("svislice a diagonály spojí obě mostovky v jednu příhradu: vlak dole i auta nahoře přejedou", async () => {
    await akce("upravit").click();
    // Těžké svislice jen u podpor: nejlevnější most, který projde, a s ním i rozpočtová medaile.
    await nactiMost(navrhNaText(RESENI["6-04"]!.rozpocet));
    await stranka.screenshot({ path: `${SLOZKA}/t10-dve-patra-most.png` });
    await spust();
    await nastavCas(3.4);
    await stranka.screenshot({ path: `${SLOZKA}/t11-dve-patra-provoz.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toMatch(/^(Přešli a přejeli|Přešli|Přejeli) všichni \(8\)\.$/);
    expect(await ziskaneMedaile()).toBe(2);
  }, 240_000);

  it("během celého průchodu prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
