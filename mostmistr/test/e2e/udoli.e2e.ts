// Čtvrtá kapitola v bezhlavém prohlížeči: pilíře, svary a plastické klouby, lana, napínák,
// automatické dopnutí, zavěšený a visutý most a nadměrný náklad.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kreslic } from "../../src/data/kreslic";
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
  (await stranka.locator(`[data-udaj="${jmeno}"]`).innerText()).replace(/[\u202f\u00a0]/g, " ");
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const pridavek = (jmeno: string) => stranka.locator(`.paleta__prvky button[data-pridavek="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);
const hlaseni = (): Promise<string> => udaj("hlaseni");

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

async function klikni(a: [number, number]): Promise<void> {
  const p = await bodSveta(...a);
  await stranka.mouse.click(p.x, p.y);
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

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4199, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
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

describe("tři pole: pilíře", () => {
  it("zadání a paleta nabízejí pilíř; z opěry postavit nejde, ze základu ano", async () => {
    await otevri("4-01", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-nazev")).toBe("Tři pole");
    expect(await udaj("zadani-text")).toContain("Pilíř smí stát jen na základu");
    expect(await udaj("zadani-provoz")).toContain("2× tahač s návěsem zleva");
    expect(await udaj("zadani-stavba")).toContain("Pilíř: 15 000 Kč/m · do 12 m");
    expect(await udaj("zadani-skutecnost")).toContain("Millau");
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    const prvky = await stranka.locator(".paleta__prvky button").allInnerTexts();
    expect(prvky).toHaveLength(4);
    expect(prvky[3]).toContain("Pilíř");
    // Úroveň bez lan a svarů nenabízí napínák, svar ani dopnutí.
    expect(await akce("dopnout").isVisible()).toBe(false);
    expect(await stranka.locator(".paleta__prvky button[data-pridavek]").count()).toBe(0);

    await stranka.locator('.paleta__prvky button[data-prvek="pilir"]').click();
    await tahni([0, 0], [0, 6]);
    expect(await telo("pruty")).toBe("0");
    expect(await hlaseni()).toContain("Pilíř musí stát na základu");
    await tahni([18, -12], [18, 0]);
    await tahni([36, -12], [36, 0]);
    expect(await telo("pruty")).toBe("2");
    expect(await udaj("cena")).toBe("360 000 Kč");
    await stranka.screenshot({ path: `${SLOZKA}/90-pilire.png` });
  });

  it("příhrady na pilířích obstojí pod dvěma tahači s návěsem; bez pilířů se složí", async () => {
    await nactiMost(navrhNaText(RESENI["4-01"]!.mistrovska));
    await spust();
    await nastavCas(7);
    await stranka.screenshot({ path: `${SLOZKA}/91-tahace-na-trech-polich.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toBe("Přešli a přejeli všichni (5).");
    expect(await ziskaneMedaile()).toBe(2);
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["4-01"]!.pady[2]!.navrh));
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
  }, 240_000);
});

describe("bez jediné vzpěry: svar a plastický kloub", () => {
  it("svar je v paletě; kliknutím na styčník ho svaří a připočte cenu, dalším kliknutím zruší", async () => {
    await otevri("4-02", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-stavba")).toContain("Svar: 1 500 Kč za každý prut");
    expect(await udaj("zadani-skutecnost")).toContain("Maurzycích");
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    expect(await pridavek("svar").innerText()).toContain("Svar");
    expect((await pridavek("svar").innerText()).replace(/[\u202f\u00a0]/g, " ")).toContain("1 500 Kč za každý prut");
    await nactiMost(navrhNaText(RESENI["4-02"]!.pady[1]!.navrh));
    expect(await udaj("cena")).toBe("936 000 Kč");

    await pridavek("svar").click();
    expect(await pridavek("svar").getAttribute("aria-pressed")).toBe("true");
    expect(await hlaseni()).toContain("Klikni na styčník, který chceš svařit");
    // Ve styčníku v poli se stýkají dvě pole mostovky, nad pilířem navíc pilíř.
    await klikni([6, 0]);
    expect(await udaj("cena")).toBe("939 000 Kč");
    await klikni([12, 0]);
    expect(await udaj("cena")).toBe("943 500 Kč");
    expect((await mostNaVykresu()).stycniky.filter((s) => s.svar).map((s) => s.x)).toEqual([6, 12]);
    expect(await udaj("svar-prepnout")).toBe("Zrušit svar");
    await klikni([12, 0]);
    expect(await udaj("cena")).toBe("939 000 Kč");
    // Escape nástroj ukončí; s vybranými styčníky je svaří klávesa S najednou.
    await stranka.keyboard.press("Escape");
    expect(await pridavek("svar").getAttribute("aria-pressed")).toBe("false");
    await stranka.keyboard.press("Control+a");
    await stranka.keyboard.press("s");
    const svarene = (await mostNaVykresu()).stycniky.filter((s) => s.svar).length;
    expect(svarene).toBeGreaterThanOrEqual(12);
    await stranka.screenshot({ path: `${SLOZKA}/92-svary.png` });
  });

  it("bez svarů se mostovka prolomí, svařená obstojí a získá všechny medaile", async () => {
    await nactiMost(navrhNaText(RESENI["4-02"]!.pady[1]!.navrh));
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["4-02"]!.mistrovska));
    await spust();
    await nastavCas(6);
    await stranka.screenshot({ path: `${SLOZKA}/93-ramovy-most.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await ziskaneMedaile()).toBe(3);
  }, 240_000);

  it("přetížená svařená mostovka se trvale ohne: plastický kloub je na výkresu vidět", async () => {
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["4-02"]!.pady[3]!.navrh));
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    // Těsně před prvním zlomem už se ocel ohýbá.
    const zlom = Number(await telo("zaznam-poruseni"));
    await nastavCas(Number.isFinite(zlom) && zlom > 0.2 ? zlom - 0.1 : 4);
    await stranka.screenshot({ path: `${SLOZKA}/94-plasticky-kloub.png` });
  }, 240_000);
});

describe("na lanech: zavěšený most, napínák a dopnutí", () => {
  it("paleta nabízí lano, napínák, svar i dopnutí; bez lan tlačítka poradí, co chybí", async () => {
    await otevri("4-03", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-stavba")).toContain("Lano: 1 800 Kč/m · do 60 m");
    expect(await udaj("zadani-stavba")).toContain("Napínák lana: v ceně lana");
    expect(await udaj("zadani-skutecnost")).toContain("Strömsundu");
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    const prvky = await stranka.locator(".paleta__prvky button").allInnerTexts();
    expect(prvky.map((p) => p.split("\n")[1])).toEqual([
      "Ocelobetonová mostovka",
      "Lehký ocelový profil",
      "Těžký ocelový profil",
      "Lano",
      "Pilíř",
      "Napínák lana",
      "Svar",
    ]);
    expect(await akce("dopnout").isVisible()).toBe(true);
    await akce("dopnout").click();
    expect(await hlaseni()).toContain("nemá žádné lano");
    await pridavek("napinak").click();
    expect(await hlaseni()).toContain("Nejdřív nějaké natáhni");
    expect(await pridavek("napinak").getAttribute("aria-pressed")).toBe("false");
  });

  it("nakreslené lano zůstane vybrané a napínák ho po milimetrech dotahuje", async () => {
    await stranka.locator('.paleta__prvky button[data-prvek="pilir"]').click();
    await tahni([30, -10], [30, 0]);
    await tahni([30, 0], [30, 12]);
    await stranka.locator('.paleta__prvky button[data-prvek="mostovka-ocelobeton"]').click();
    await tahni([0, 0], [6, 0]);
    await stranka.locator('.paleta__prvky button[data-prvek="lano"]').click();
    await tahni([30, 12], [6, 0]);
    expect(await telo("pruty")).toBe("4");
    const nastaveni = stranka.locator('[data-nastaveni="predpeti"]');
    expect(await nastaveni.isVisible()).toBe(true);
    // Nastavení napínáku je na dohled i v okně vysokém 720 px, kde je paleta delší než obrazovka.
    const tlacitkoPlus = (await akce("predpeti-plus").boundingBox())!;
    expect(tlacitkoPlus.y + tlacitkoPlus.height).toBeLessThanOrEqual(720);
    // Lano dlouhé 26,8 m s výchozím předpětím 5 % je o 12,5 mm kratší než nakreslené.
    expect(await udaj("predpeti")).toBe("dotaženo o 13 mm");
    expect(await telo("predpeti")).toBe("0.050");
    await akce("predpeti-plus").click();
    expect(await udaj("predpeti")).toBe("dotaženo o 13 mm");
    await akce("predpeti-plus").click({ modifiers: ["Shift"] });
    expect(await udaj("predpeti")).toBe("dotaženo o 23 mm");
    for (let i = 0; i < 3; i++) await akce("predpeti-min").click({ modifiers: ["Shift"] });
    expect(await udaj("predpeti")).toBe("povoleno o 7 mm");
    expect(Number(await telo("predpeti"))).toBeLessThan(0);
    await stranka.screenshot({ path: `${SLOZKA}/95-napinak.png` });
    // Kliknutí do prázdna výběr zruší a nastavení zmizí; nástroj Napínák lano zase vybere.
    await stranka.keyboard.press("Escape");
    expect(await nastaveni.isVisible()).toBe(false);
    await pridavek("napinak").click();
    expect(await pridavek("napinak").getAttribute("aria-pressed")).toBe("true");
    await klikni([18, 6]);
    expect(await nastaveni.isVisible()).toBe(true);
    expect(await udaj("predpeti")).toBe("povoleno o 7 mm");
  });

  it("dopnutí srovná mostovku a napínák ukáže tah v laně", async () => {
    // Referenční most s lany, jak je pokládá editor (všechna stejně, mírně dotažená).
    const nedopnuty = RESENI["4-03"]!.pruchod;
    const sVychozim = { ...nedopnuty, pruty: nedopnuty.pruty.map((p) => (p.prvek === "lano" ? { ...p, predpeti: 0.05 } : p)) };
    await nactiMost(navrhNaText(sVychozim));
    await stranka.keyboard.press("n");
    await stranka.locator('body[data-dopnuti="hotovo"]').waitFor({ timeout: 60_000 });
    expect(await hlaseni()).toMatch(/^Lana jsou dopnutá\. Mostovka pod vlastní tíhou klesala nejvýš o 6\d mm, teď o 0,\d mm\.$/);
    expect(Number(await telo("dopnuti-odchylka"))).toBeLessThan(1);
    const dopnuty = await mostNaVykresu();
    const lana = dopnuty.pruty.filter((p) => p.prvek === "lano").map((p) => p.predpeti!);
    expect(lana).toHaveLength(10);
    // Lana do pole nesou mostovku, kotevní zůstala jen napnutá; výsledek sedí s referenčním mostem.
    const referencni = nedopnuty.pruty.filter((p) => p.prvek === "lano").map((p) => p.predpeti!);
    lana.forEach((predpeti, i) => expect(predpeti).toBeCloseTo(referencni[i]!, 2));
    // Dopnutí jde vzít zpět jedním krokem.
    await akce("zpet").click();
    expect((await mostNaVykresu()).pruty.filter((p) => p.prvek === "lano").every((p) => p.predpeti === 0.05)).toBe(true);
    await akce("znovu").click();

    // Krajní lano do pole: po dopnutí nese kolem 17 % pevnosti.
    await pridavek("napinak").click();
    await klikni([18, 8]);
    await expect.poll(() => udaj("predpeti-tah"), { timeout: 15_000 }).toMatch(/^Tah pod vlastní tíhou mostu: 4\d\d kN, 1\d\s%/);
    expect(await udaj("predpeti")).toMatch(/^dotaženo o 4\d mm$/);
    await stranka.screenshot({ path: `${SLOZKA}/96-zaveseny-dopnuty.png` });
    await stranka.keyboard.press("Escape");
  }, 120_000);

  it("zavěšený most unese kolonu čtyř nákladních aut; bez kotevních lan se pylon zlomí", async () => {
    await spust();
    await nastavCas(8);
    await stranka.screenshot({ path: `${SLOZKA}/97-kolona-na-zavesenem.png` });
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toBe("Přešli a přejeli všichni (6).");
    await akce("upravit").click();
    await nactiMost(navrhNaText(RESENI["4-03"]!.pady[2]!.navrh));
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    expect(await udaj("vysledek-prvni")).toMatch(/\(pilíř\)/);
  }, 240_000);
});

describe("náklad století: visutý most", () => {
  it("paleta má nosné lano; nedopnutý most se pod podvalníkem prověsí, dopnutý ho unese", async () => {
    await otevri("4-04", false);
    await stranka.locator("#okno-zadani").waitFor({ state: "visible" });
    expect(await udaj("zadani-provoz")).toContain("nadměrný náklad zleva");
    expect(await udaj("zadani-stavba")).toContain("Nosné lano: 6 000 Kč/m · do 60 m");
    expect(await udaj("zadani-skutecnost")).toContain("Çanakkale");
    // Dlouhé zadání se v okně vysokém 720 px posouvá, tlačítko ale zůstává na dohled.
    const ramTlacitka = (await stranka.locator('#okno-zadani button[value="zavrit"]').boundingBox())!;
    expect(ramTlacitka.y + ramTlacitka.height).toBeLessThanOrEqual(720);
    await stranka.screenshot({ path: `${SLOZKA}/97b-zadani-nizke-okno.png` });
    await stranka.locator('#okno-zadani button[value="zavrit"]').click();
    expect(await stranka.locator('.paleta__prvky button[data-prvek="lano-nosne"]').innerText()).toContain("Nosné lano");

    await nactiMost(navrhNaText(RESENI["4-04"]!.pady[1]!.navrh));
    await stranka.screenshot({ path: `${SLOZKA}/98-visuty-nakresleny.png` });
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    await akce("upravit").click();
    await akce("dopnout").click();
    await stranka.locator('body[data-dopnuti="hotovo"]').waitFor({ timeout: 90_000 });
    expect(await hlaseni()).toMatch(/^Lana jsou dopnutá\. Mostovka pod vlastní tíhou klesala nejvýš o \d{3} mm, teď o 0,\d mm\.$/);
    // Některé závěsy dopnutí prodloužilo: jsou delší než nakreslené.
    const zavesy = (await mostNaVykresu()).pruty.filter((p) => p.prvek === "lano").map((p) => p.predpeti!);
    expect(Math.min(...zavesy)).toBeLessThan(-1);
    await spust();
    await nastavCas(18);
    await stranka.screenshot({ path: `${SLOZKA}/99-nadmerny-naklad.png` });
    // Zblízka: podvalník s nákladem uprostřed mostu.
    await stranka.keyboard.press("c");
    for (let i = 0; i < 3; i++) await akce("priblizit").click();
    await stranka.screenshot({ path: `${SLOZKA}/99b-podvalnik-zblizka.png` });
    await akce("cely-vykres").click();
    await stranka.keyboard.press("c");
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toBe("Přešli a přejeli všichni (3).");
  }, 360_000);

  it("nové nosné lano se volbou závěsů nepřepíše a rovné lano dopnutí přizná", async () => {
    await otevri("4-04");

    // Pylony, mostovka a nosné lano natažené rovně mezi hlavami pylonů; závěsy zatím chybí.
    const k = new Kreslic("4-04");
    for (let x = 0; x < 72; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
    for (const x of [-4, 76]) k.prut("pilir", [x, 0], [x, 12]);
    const body: [number, number][] = [[-4, 12], ...Array.from({ length: 11 }, (_, i): [number, number] => [6 * (i + 1), 12]), [76, 12]];
    for (let i = 1; i + 1 < body.length; i++) k.prut("lano-nosne", body[i]!, body[i + 1]!);
    k.prut("lano-nosne", [-4, 12], [-18, 0]);
    k.prut("lano-nosne", [76, 12], [90, 0]);
    await nactiMost(navrhNaText(k.navrh()));
    const prutuPred = Number(await telo("pruty"));

    // Poslední díl nosného lana hráč dokreslí a sáhne v paletě po závěsech: díl zůstává nosným lanem.
    await stranka.locator('.paleta__prvky button[data-prvek="lano-nosne"]').click();
    await tahni([-4, 12], [6, 12]);
    expect(Number(await telo("pruty"))).toBe(prutuPred + 1);
    const cenaPred = await udaj("cena");
    await stranka.locator('.paleta__prvky button[data-prvek="lano"]').click();
    expect(await udaj("cena")).toBe(cenaPred);
    expect((await mostNaVykresu()).pruty.at(-1)!.prvek).toBe("lano-nosne");
    expect(await stranka.locator('[data-nastaveni="predpeti"]').isVisible()).toBe(false);
    for (const [x] of body.slice(1, -1)) await tahni([x, 12], [x, 0]);
    expect((await mostNaVykresu()).pruty.filter((p) => p.prvek === "lano")).toHaveLength(11);

    // Rovné lano by muselo nést mnohonásobek pevnosti: dopnutí to řekne a poradí průvěs.
    await stranka.keyboard.press("Escape");
    await akce("dopnout").click();
    await stranka.locator('body[data-dopnuti="hotovo"]').waitFor({ timeout: 90_000 });
    expect(await hlaseni()).toMatch(/^Lana mostovku do výkresu nedotáhnou: musela by nést víc, než bezpečně unesou \(už teď \d\d % své pevnosti\)\. Mostovka zůstává až \d+ mm pod výkresem\./);
    await stranka.screenshot({ path: `${SLOZKA}/99d-rovne-lano-dopnuti.png` });
    // Zkouška skončí obyčejným pádem, ne rozpadem výpočtu, a poradí dopnutí.
    await spust();
    expect(await naKonec()).toBe("MOST NEOBSTÁL");
    expect(await udaj("vysledek-shrnuti")).toContain("Lana nejsou dopnutá: mostovka už před zkouškou visela");
    await stranka.screenshot({ path: `${SLOZKA}/99e-rovne-lano-vysledek.png` });
    await akce("upravit").click();
  }, 360_000);

  it("během celé kapitoly prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
