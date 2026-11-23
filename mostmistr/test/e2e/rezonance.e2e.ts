// Druhá kapitola v bezhlavém prohlížeči: osa frekvencí, závaží, tlumič, brnknutí
// a hodnocení kmitání mostovky.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { prijimejDenik } from "./server-deniku";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

const udaj = (jmeno: string): Promise<string> => stranka.locator(`[data-udaj="${jmeno}"]`).innerText();
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);
const osa = () => stranka.locator('[data-udaj="osa-frekvenci"]');

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

/** Vlastní frekvence mostu, jak ji ukazuje osa frekvencí; null, dokud ji most nemá. */
async function frekvenceMostu(): Promise<number | null> {
  const zapis = await osa().getAttribute("data-frekvence");
  return zapis === null ? null : Number(zapis);
}

async function otevri(id: string): Promise<void> {
  await stranka.goto(`${adresa}?uroven=${id}`);
  await stranka.locator("#obrazovka-uroven canvas.vykres__platno").waitFor();
  const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

async function nactiMost(text: string): Promise<void> {
  await akce("smazat-vse").click({ force: true }).catch(() => {});
  await akce("import").click();
  await stranka.locator("#okno-obsah").fill(text);
  await akce("okno-nacist").click();
}

async function vyzkousej(): Promise<string> {
  await stranka.locator("#obrazovka-uroven canvas.vykres__platno").focus();
  await stranka.keyboard.press("Space");
  await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 90_000 });
  expect(await telo("zkouska")).toBe("hotovo");
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

/** Rozbalí podrobnosti výsledku (čísla, podmínky medailí, hlášení chyby), pokud jsou sbalené. */
async function rozbalVysledek(): Promise<void> {
  const panel = stranka.locator(".vysledek");
  if ((await panel.getAttribute("data-sbaleno")) === "ano") await stranka.locator('[data-akce="vysledek-sbalit"]').click();
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4194, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
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

describe("přehled s druhou kapitolou", () => {
  it("ukáže všechny kapitoly; druhá je zamčená, dokud není dohraná první", async () => {
    await stranka.goto(`${adresa}?vyvoj=1`);
    await stranka.locator(".karta").first().waitFor();
    expect(await stranka.locator(".kapitola h1").allInnerTexts()).toEqual([
      "Kapitola 1 · Potok",
      "Kapitola 2 · Lávka",
      "Kapitola 3 · Okresní silnice",
      "Kapitola 4 · Údolí",
      "Kapitola 5 · Lávka ve městě",
      "Kapitola 6 · Trať",
      "Kapitola 7 · Přístav",
    ]);
    expect(await stranka.locator(".karta").count()).toBe(28);
    expect(await stranka.locator('.karta[data-uroven="2-01"]').getAttribute("data-zamceno")).toBe("true");
    await stranka.locator("#odemknout-vse").check();
    expect(await stranka.locator('.karta[data-uroven="2-04"]').getAttribute("data-zamceno")).toBe("false");
    await stranka.screenshot({ path: `${SLOZKA}/40-prehled-dve-kapitoly.png` });
  });
});

describe("osa frekvencí, závaží a tlumič", () => {
  it("zadání úrovně mluví o tlumičích a paleta je nabízí", async () => {
    await stranka.goto(`${adresa}?uroven=2-04`);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-text")).toContain("viskózní tlumiče");
    expect(await udaj("zadani-provoz")).toContain("útvar 24 lidí, krok 1,7 Hz");
    expect(await udaj("zadani-medaile")).toContain("nerozkmitá nad 2,5 m/s²");
    expect(await udaj("zadani-medaile")).toContain("kmitání mostovky nejvýš 1,2 m/s²");

    // Ukázka: stejná lávka bez tlumičů a s nimi. Vlevo se rozkmitá přes mez, vpravo ne.
    const ukazka = stranka.locator('[data-udaj="ukazka"]');
    await stranka.locator('[data-udaj="ukazka"][data-stav="hraje"]').waitFor({ timeout: 60_000 });
    const bez = ukazka.locator('[data-strana="a"]');
    const s = ukazka.locator('[data-strana="b"]');
    expect(await udaj("ukazka-a")).toBe("Bez tlumičů");
    expect(await udaj("ukazka-b")).toBe("Dva tlumiče do kotev");
    expect(await bez.getAttribute("data-pruchod")).toBe("false");
    expect(await s.getAttribute("data-pruchod")).toBe("true");
    expect(Number(await bez.getAttribute("data-kmitani"))).toBeGreaterThan(2.5);
    expect(Number(await s.getAttribute("data-kmitani"))).toBeLessThan(2.5);
    // Pohyb mostu je zvětšený a okno to říká.
    expect(Number(await ukazka.getAttribute("data-zvetseni"))).toBeGreaterThanOrEqual(10);
    expect(await ukazka.locator("[data-poznamka]").innerText()).toMatch(/^Pohyb mostu je \d+× zvětšený/);
    expect(await udaj("ukazka-popis")).toContain("píst ve válci s olejem");
    expect(await udaj("zadani-skutecnost")).toContain("Millennium Bridge");
    // Během přehrávání ukazuje každá strana okamžité kmitání.
    await expect.poll(() => bez.locator("[data-stav]").innerText(), { timeout: 15_000 }).toMatch(/kmitání \d,\d m\/s²/);
    await stranka.waitForTimeout(9000);
    await stranka.screenshot({ path: `${SLOZKA}/41-zadani-prehlidka.png` });
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    // Mostovka, ocel, tlumič a závaží: co úroveň dovoluje, je mezi stavebními prvky vidět.
    const prvky = await stranka.locator(".paleta__prvky button").allInnerTexts();
    expect(prvky).toHaveLength(4);
    expect(await stranka.locator('[data-prvek="tlumic"]').innerText()).toContain("Tlumič");
    expect(prvky[3]).toContain("Závaží");
    expect(prvky[3]).toContain("10\u00a0Kč/kg · do\u00a02000\u00a0kg");
    expect(await udaj("zadani-stavba")).toContain("Závaží do styčníku: 10\u00a0Kč za kilogram, nejvýš 2000 kg");
    // Brnknutí je vidět i bez mostu a poradí, co mu chybí.
    expect(await akce("brnknout").isDisabled()).toBe(false);
    await akce("brnknout").click();
    expect(await udaj("hlaseni")).toBe("Brnknout jde až do postaveného mostu. Nejdřív ho nakresli.");
    expect(await akce("brnknout").getAttribute("aria-pressed")).toBe("false");
  });

  it("osa ukáže vlastní frekvenci mostu a odhad kmitání pod útvarem, který ho rozkmitá", async () => {
    expect(await osa().isVisible()).toBe(true);
    // První rozbor prázdného návrhu dorazí z pracovního vlákna až za okamžik.
    await expect.poll(() => udaj("frekvence-popis"), { timeout: 10_000 }).toBe("most zatím nemá vlastní kmitání");
    await nactiMost(navrhNaText(RESENI["2-04"]!.pady[1]!.navrh));
    await expect.poll(frekvenceMostu, { timeout: 10_000 }).toBeGreaterThan(2.4);
    expect(await frekvenceMostu()).toBeLessThan(2.9);
    expect(await osa().getAttribute("data-stav")).toBe("nad-mezi");
    expect(await osa().getAttribute("data-hlavni")).toBe("utvar;1;2.3");
    expect((await stranka.locator('[data-udaj="frekvence-popis"]').evaluate((uzel) => uzel.textContent ?? "")).replace(/[  ]/g, " ")).toMatch(
      // Rada je nástroj, který úroveň učí, a číslo k němu rozbor spočítal.
      /^Odhad kmitání \d,\d m\/s², mez je 2,5: pochodující útvar, krok 2,3 Hz\. Pomohl by tlumič mezi mostem a kotvou: odhad asi \d,\d+ m\/s²\.$/,
    );
    // Tři útvary, každý svým krokem: tři značky kroku, k nim dvojnásobky a trojnásobky.
    expect(await stranka.locator('.frekvence__krok[data-nasobek="1"]').count()).toBe(3);
    expect(await stranka.locator(".frekvence__krok--dvojnasobek").count()).toBe(3);
    expect(await stranka.locator(".frekvence__krok--trojnasobek").count()).toBe(3);
    await stranka.screenshot({ path: `${SLOZKA}/42-osa-frekvenci.png` });
  });

  it("závaží ve vybraném styčníku zdraží most a sníží jeho frekvenci", async () => {
    const pred = (await frekvenceMostu())!;
    const cenaPred = await udaj("cena");
    await stranka.keyboard.press("v");
    await klikni([16, 0]);
    const nastaveni = stranka.locator('[data-nastaveni="zavazi"]');
    expect(await nastaveni.isVisible()).toBe(true);
    expect(await udaj("zavazi")).toBe("0 kg");
    for (let i = 0; i < 10; i++) await akce("zavazi-plus").click();
    expect(await udaj("zavazi")).toBe("1000 kg");
    expect(await udaj("cena")).not.toBe(cenaPred);
    await expect.poll(async () => (await frekvenceMostu()) ?? 99, { timeout: 10_000 }).toBeLessThan(pred - 0.05);
    await akce("zavazi-min").click();
    expect(await udaj("zavazi")).toBe("900 kg");
    // Podržené tlačítko krok opakuje; se Shiftem je krok pětinásobný.
    await akce("zavazi-plus").click({ modifiers: ["Shift"] });
    expect(await udaj("zavazi")).toBe("1400 kg");
    await akce("zavazi-min").click({ modifiers: ["Shift"] });
    expect(await udaj("zavazi")).toBe("900 kg");
    const plus = (await akce("zavazi-plus").boundingBox())!;
    await stranka.mouse.move(plus.x + plus.width / 2, plus.y + plus.height / 2);
    await stranka.mouse.down();
    await expect.poll(async () => Number((await udaj("zavazi")).replace(/\D/g, "")), { timeout: 5_000 }).toBeGreaterThanOrEqual(1300);
    await stranka.mouse.up();
    const poDrzeni = Number((await udaj("zavazi")).replace(/\D/g, ""));
    // Puštění tlačítka krok navíc nepřidá.
    await stranka.waitForTimeout(250);
    expect(Number((await udaj("zavazi")).replace(/\D/g, ""))).toBe(poDrzeni);
    while (Number((await udaj("zavazi")).replace(/\D/g, "")) > 900) await akce("zavazi-min").click();
    expect(await udaj("zavazi")).toBe("900 kg");
    await stranka.screenshot({ path: `${SLOZKA}/43-zavazi.png` });
    await stranka.keyboard.press("Escape");
    expect(await nastaveni.isVisible()).toBe(false);

    // Totéž jde z palety: položka Závaží a kliknutí na styčník. Nové závaží začíná na hmotnosti,
    // kterou hráč nastavil naposledy, takže stejná závaží v řadě styčníků jsou po jednom kliknutí.
    const polozka = stranka.locator('[data-pridavek="zavazi"]');
    await polozka.click();
    expect(await polozka.getAttribute("aria-pressed")).toBe("true");
    expect(await udaj("hlaseni")).toContain("Klikni na styčník, do kterého chceš závaží");
    await klikni([12, 0]);
    expect(await nastaveni.isVisible()).toBe(true);
    expect(await udaj("zavazi")).toBe("900 kg");
    // Řádek rad říká, co kliknutí udělá: přidá (neodebírá), množství se nastaví dole.
    expect(await stranka.locator('[data-udaj="rada-stavby"]').getAttribute("data-rada")).toBe("zavazi");
    expect(await udaj("rada-stavby")).toContain("klikni na styčník: přidá závaží");
    // Styčník, který závaží už má, se jen vybere.
    await klikni([16, 0]);
    expect(await udaj("zavazi")).toBe("900 kg");
    await stranka.keyboard.press("Escape");
    expect(await polozka.getAttribute("aria-pressed")).toBe("false");
    expect(await nastaveni.isVisible()).toBe(false);
  });

  it("tlumič se nakreslí z mostovky do kotvy a jeho síla se nastaví po výběru", async () => {
    const prutu = Number(await telo("pruty"));
    await stranka.keyboard.press("3");
    await tahni([8, 0], [8, -4]);
    expect(Number(await telo("pruty"))).toBe(prutu + 1);
    await stranka.keyboard.press("v");
    await klikni([8, -2]);
    expect(await stranka.locator('[data-nastaveni="tlumeni"]').isVisible()).toBe(true);
    expect(await udaj("tlumeni")).toBe("50 kN·s/m");
    await akce("tlumeni-plus").click();
    await akce("tlumeni-plus").click();
    expect(await udaj("tlumeni")).toBe("100 kN·s/m");
    await stranka.keyboard.press("m");
    expect(Number(await telo("pruty"))).toBe(prutu + 2);
    await stranka.keyboard.press("Escape");
    await stranka.keyboard.press("v");
    await stranka.screenshot({ path: `${SLOZKA}/44-tlumice.png` });
  });
});

describe("brnknutí", () => {
  it("stažený a puštěný styčník rozkmitá most na frekvenci z osy", async () => {
    await nactiMost(navrhNaText(RESENI["2-04"]!.pady[1]!.navrh));
    await expect.poll(frekvenceMostu, { timeout: 10_000 }).toBeGreaterThan(2.4);
    const vlastni = (await frekvenceMostu())!;
    await stranka.keyboard.press("b");
    expect(await akce("brnknout").getAttribute("aria-pressed")).toBe("true");
    const stred = await bodSveta(16, 0);
    await stranka.mouse.move(stred.x, stred.y);
    await stranka.mouse.down();
    await stranka.mouse.move(stred.x, stred.y + 30, { steps: 3 });
    await stranka.mouse.move(stred.x, stred.y + 60, { steps: 3 });
    expect(await udaj("hlaseni")).toMatch(/^Brnknutí silou \d,\d kN$/);
    await stranka.screenshot({ path: `${SLOZKA}/45-brnknuti-tah.png` });
    await stranka.mouse.up();
    await stranka.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 60_000 });
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await udaj("vysledek-nadpis")).toBe("BRNKNUTÍ");
    const namerena = Number(await telo("brnknuti"));
    expect(namerena).toBeGreaterThan(0.93 * vlastni);
    expect(namerena).toBeLessThan(1.07 * vlastni);
    // Brnknutí, osa i tvary kmitání mluví o téže frekvenci, a výsledek to řekne.
    expect(await udaj("vysledek-shrnuti")).toMatch(
      /^Most kmitá na \d,\d\d Hz\. To je 1\. vlastní frekvence prázdného mostu; na ose frekvencí je to plný trojúhelník u \d,\d\d Hz\.$/,
    );
    expect(await telo("pokus-tvar")).toBe("1");
    // Pokus se nepočítá: žádné medaile, žádná další úroveň.
    expect(await stranka.locator('[data-udaj="vysledek-medaile"]').isVisible()).toBe(false);
    expect(await udaj("medaile")).not.toContain("◆");
    await akce("upravit").click();
    await stranka.keyboard.press("b");
  });
});

describe("kmitání mostovky rozhoduje", () => {
  it("nízká lávka bez tlumičů se pod útvarem rozkmitá a neobstojí, i když nikdo nespadne", async () => {
    await nactiMost(navrhNaText(RESENI["2-04"]!.pady[1]!.navrh));
    expect(await vyzkousej()).toBe("MOST NEOBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toMatch(/(Přešli a přejeli|Přešli|Přejeli) všichni/);
    expect(await udaj("vysledek-shrnuti")).toContain("rozkmital víc, než se dá snést");
    // Pod číslem je i frekvence, na které most kmital, a čí je to rytmus.
    expect(await udaj("vysledek-kmitani")).toMatch(/^\d,\d\d m\/s² · nepřijatelné · v čase \d+,\d s\s*nejvíc na 2,3 Hz \(pochodující útvar, krok 2,3 Hz\)$/);
    // Mez překročil už útvar s krokem 2,0 Hz; nejvíc pak most kmital pod útvarem 2,3 Hz. Výsledek řekne obojí.
    const shrnuti = (await udaj("vysledek-shrnuti")).replace(/[  ]/g, " ");
    expect(shrnuti).toContain("Most rozkmital krok lidí: pochodující útvar, krok 2,0 Hz.");
    expect(shrnuti).toContain("Nejvíc pak kmital pod jiným rytmem: pochodující útvar, krok 2,3 Hz.");
    expect(shrnuti).toMatch(/Trefuje se do 1\. vlastní frekvence mostu \(2,\d\d Hz, s lidmi 2,\d\d Hz\)\./);
    expect(shrnuti).toMatch(/Pomohl by tlumič mezi mostem a kotvou: odhad asi \d,\d+ m\/s²\./);
    // Odkaz skočí do okamžiku největšího kmitání; legenda ukazuje okamžitou hodnotu.
    await rozbalVysledek();
    await stranka.locator('[data-udaj="vysledek-kmitani"] button').click();
    await expect.poll(() => udaj("kmitani")).toMatch(/^kmitání [3-9],\d\d m\/s²$/);
    await stranka.screenshot({ path: `${SLOZKA}/46-rezonance.png` });
    await akce("upravit").click();
  });

  it("stejná lávka s tlumiči projde a získá mistrovskou medaili", async () => {
    await nactiMost(navrhNaText(RESENI["2-04"]!.mistrovska));
    await stranka.locator("#obrazovka-uroven canvas.vykres__platno").focus();
    await stranka.keyboard.press("Space");
    await stranka.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 90_000 });
    await nastavCas(62);
    await stranka.screenshot({ path: `${SLOZKA}/47-utvar-s-tlumici.png` });
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await udaj("vysledek-nadpis")).toBe("MOST OBSTÁL");
    expect(await stranka.locator('[data-udaj="vysledek-medaile"] [data-ziskana="true"]').count()).toBe(2);
    expect(await udaj("vysledek-kmitani")).toMatch(/· (střední|nízký) komfort ·/);
    await stranka.screenshot({ path: `${SLOZKA}/48-vysledek-s-kmitanim.png` });
  });

  it("úroveň bez ukázky má aspoň souvislost se skutečností", async () => {
    await stranka.goto(`${adresa}?uroven=2-01`);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await stranka.locator('[data-udaj="ukazka"]').isVisible()).toBe(false);
    expect(await udaj("zadani-skutecnost")).toContain("vlastní frekvence počítá dřív než únosnost");
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
  });

  it("běžci v taktu: úroveň 2-02 s referenčním mostem", async () => {
    await otevri("2-02");
    await nactiMost(navrhNaText(RESENI["2-02"]!.pruchod));
    await stranka.locator("#obrazovka-uroven canvas.vykres__platno").focus();
    await stranka.keyboard.press("Space");
    await stranka.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 90_000 });
    await nastavCas(5);
    await stranka.screenshot({ path: `${SLOZKA}/49-bezci.png` });
    await akce("na-konec").click();
    await stranka.locator(".vysledek").waitFor({ state: "visible" });
    expect(await udaj("vysledek-nadpis")).toBe("MOST OBSTÁL");
  });

  it("za celý průchod stránka nenahlásila žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
