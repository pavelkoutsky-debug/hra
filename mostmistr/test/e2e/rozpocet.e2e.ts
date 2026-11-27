// Rozpočet při stavbě v bezhlavém prohlížeči (verze 0.25.0): po dokončení mostovky má hráč
// v ruce levnější prut i mimo první úroveň, překročení rozpočtu hra řekne hned při stavbě
// a pruty z mostovky mimo cestu jdou jedním klikem vyměnit za levnější prut (jeden krok Zpět).
// Komise a most, který se zvedá, výměnu nenabízejí. Telefon 390 × 844 česky i anglicky.
// Mosty se načítají jen přes Import (`nactiMostImportem`), jak to dělá hráč.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText, type NavrhMostu } from "../../src/data/navrh";
import { PRIPADY } from "../../urovne/havarie/index";
import { RESENI } from "../../urovne/reseni";
import { nactiMostImportem } from "./pomoc";
import { prijimejDenik } from "./server-deniku";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";

let server: PreviewServer;
let prohlizec: Browser;
let adresa: string;
const chyby: string[] = [];

const telo = (s: Page, atribut: string): Promise<string | null> => s.locator("body").getAttribute(`data-${atribut}`);
const bezMezer = (text: string): string => text.replace(/[  ]/g, " ");
const hlaseni = (s: Page) => s.locator('[data-udaj="hlaseni"]');
const vymenit = (s: Page) => s.locator('[data-udaj="hlaseni"] [data-akce="vymenit-mostovku"]');
const stavRozpoctu = (s: Page): Promise<string | null> => s.locator("#obrazovka-uroven .rozpocet").getAttribute("data-stav");

/**
 * Most 1-03 pro průchod (100 400 Kč, rozpočet 110 000 Kč) se svislicemi ve 4 a 8 m z mostovky
 * místo lehkého trámu (108 200 Kč: ještě se vejde). Svislice ve 12 m z mostovky ho přetáhne.
 */
function mostSeSvislicemiZMostovky(svislice: readonly number[]): NavrhMostu {
  const most = RESENI["1-03"]!.pruchod;
  const podleId = new Map(most.stycniky.map((st) => [st.id, st]));
  return {
    ...most,
    pruty: most.pruty.map((p) => {
      const a = podleId.get(p.a)!;
      const b = podleId.get(p.b)!;
      const svisla = a.x === b.x && svislice.includes(a.x) && Math.min(a.y, b.y) === 0;
      return svisla ? { ...p, prvek: "mostovka-drevo" as const } : p;
    }),
  };
}

async function novyKontext(volby: Parameters<Browser["newContext"]>[0] = {}): Promise<{ kontext: BrowserContext; s: Page }> {
  const kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, ...volby });
  const s = await kontext.newPage();
  s.on("pageerror", (chyba) => chyby.push(chyba.message));
  s.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
  return { kontext, s };
}

async function otevri(s: Page, id: string, jazyk = ""): Promise<void> {
  await s.goto(`${adresa}?uroven=${id}${jazyk ? `&jazyk=${jazyk}` : ""}`);
  await s.locator(PLATNO).waitFor();
  const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await zavrit.count()) > 0) await zavrit.click();
}

async function bodSveta(s: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return s.evaluate(
    ([sx, sy, volic]) => {
      const platno = document.querySelector<HTMLCanvasElement>(volic as string)!;
      const [kx, ky, m] = platno.dataset.kamera!.split(";").map(Number) as [number, number, number];
      const o = platno.getBoundingClientRect();
      return { x: o.left + o.width / 2 + ((sx as number) - kx) * m, y: o.top + o.height / 2 - ((sy as number) - ky) * m };
    },
    [x, y, PLATNO] as const,
  );
}

async function tahni(s: Page, od: [number, number], po: [number, number]): Promise<void> {
  const a = await bodSveta(s, ...od);
  const b = await bodSveta(s, ...po);
  await s.mouse.move(a.x, a.y);
  await s.mouse.down();
  await s.mouse.move(b.x, b.y, { steps: 4 });
  await s.mouse.up();
}

/** Nic na stránce není širší než okno. */
async function nepretika(s: Page): Promise<void> {
  expect(await s.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4231, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prijimejDenik(server);
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
  expect(chyby).toEqual([]);
});

describe("levnější prut v ruce po dokončení mostovky", () => {
  for (const [id, delka] of [["1-02", 12], ["1-03", 16]] as const) {
    it(`${id}: po dokončení mostovky má hráč v ruce Lehký trám, tlačítko blikne a krátké hlášení to řekne`, async () => {
      const { kontext, s } = await novyKontext();
      await otevri(s, id);
      const mostovka = s.locator('.paleta [data-prvek="mostovka-drevo"]');
      const lehky = s.locator('.paleta [data-prvek="drevo-lehke"]');
      expect(await mostovka.getAttribute("aria-pressed")).toBe("true");
      // Jeden tah přes celé údolí: editor ho rozdělí na čtyřmetrové díly a mostovka je hotová.
      await tahni(s, [0, 0], [delka, 0]);
      await expect.poll(() => telo(s, "prvek-prepnut")).toBe("drevo-lehke");
      expect(await lehky.getAttribute("aria-pressed")).toBe("true");
      expect(await lehky.getAttribute("data-prepnuto")).toBe("ano");
      expect(await hlaseni(s).innerText()).toBe("V ruce máš levnější „Lehký trám“.");
      await s.screenshot({ path: `${SLOZKA}/rozpocet-prepnuti-${id}.png` });
      // Zvýraznění je krátké.
      await expect.poll(() => lehky.getAttribute("data-prepnuto"), { timeout: 5_000 }).toBeNull();
      // Kdo si mostovku vezme zpátky, tomu ji hra už nebere.
      await mostovka.click();
      await tahni(s, [4, 0], [4, 2]);
      await expect.poll(() => telo(s, "pruty")).toBe(String(delka / 4 + 1));
      expect(await mostovka.getAttribute("aria-pressed")).toBe("true");
      await kontext.close();
    });
  }

  it("1-02: díl, který mostovku dokončí a zároveň přetáhne rozpočet, nechá svítit upozornění s výměnou", async () => {
    // Nález recenze M19: hlášení o přepnutí prvku upozornění na rozpočet přepsalo a po šesti
    // sekundách nezbylo nic, ani částka, ani tlačítko.
    const { kontext, s } = await novyKontext();
    await otevri(s, "1-02");
    await tahni(s, [0, 0], [8, 0]);
    await expect.poll(() => telo(s, "pruty")).toBe("2");
    // Podpěry a horní pás z mostovky (hráč ji má pořád v ruce): most je těsně pod rozpočtem.
    const tahy: [[number, number], [number, number]][] = [[[2, -3], [4, 0]], [[4, 0], [4, 3]], [[8, 0], [8, 3]], [[4, 3], [8, 3]]];
    for (const [od, po] of tahy) await tahni(s, od, po);
    await expect.poll(() => telo(s, "pruty")).toBe("6");
    expect(await stavRozpoctu(s)).not.toBe("nad");
    await tahni(s, [8, 0], [12, 0]);
    await expect.poll(() => stavRozpoctu(s)).toBe("nad");
    // Prvek se přepnul (tlačítko v paletě to ukazuje), ale slovo má rozpočet.
    expect(await telo(s, "prvek-prepnut")).toBe("drevo-lehke");
    expect(bezMezer(await hlaseni(s).innerText())).toMatch(/^O [\d ]+ Kč nad rozpočtem\. Vyměnit za „Lehký trám“$/);
    // Hlášení s tlačítkem samo nemizí.
    await s.waitForTimeout(7000);
    expect(await vymenit(s).isVisible()).toBe(true);
    expect(bezMezer(await hlaseni(s).innerText())).toMatch(/nad rozpočtem/);
    await kontext.close();
  });

  it("most, který se zvedá (7-01): po dokončení mostovky se nic nepřepíná", async () => {
    const { kontext, s } = await novyKontext();
    await otevri(s, "7-01");
    await tahni(s, [0, 0], [6, 0]);
    await tahni(s, [6, 0], [12, 0]);
    await expect.poll(() => telo(s, "pruty")).toBe("2");
    expect(await telo(s, "prvek-prepnut")).toBeNull();
    expect(await s.locator('.paleta [data-prvek="mostovka-ocel"]').getAttribute("aria-pressed")).toBe("true");
    await kontext.close();
  });
});

describe("rozpočet při stavbě a výměna mostovky jedním klikem", () => {
  it("1-03: překročení řekne hned s částkou a tlačítkem; výměna zlevní most, jde vzít zpět a zkouška se pak pustí", async () => {
    const { kontext, s } = await novyKontext();
    await otevri(s, "1-03");
    await nactiMostImportem(s, navrhNaText(mostSeSvislicemiZMostovky([4, 8])));
    await expect.poll(() => telo(s, "pruty")).toBe("13");
    expect(await stavRozpoctu(s)).not.toBe("nad");
    // Import hotové mostovky prvek v ruce nepřepíná: v ruce zůstává mostovka.
    expect(await telo(s, "prvek-prepnut")).toBeNull();
    // Svislice ve 12 m z mostovky: cena přeleze rozpočet.
    await tahni(s, [12, 0], [12, 3]);
    await expect.poll(() => stavRozpoctu(s)).toBe("nad");
    expect(bezMezer(await hlaseni(s).innerText())).toBe("O 2 100 Kč nad rozpočtem. Vyměnit za „Lehký trám“");
    expect(await hlaseni(s).getAttribute("data-druh")).toBe("varovani");
    expect(await vymenit(s).innerText()).toBe("Vyměnit za „Lehký trám“");
    expect(bezMezer((await vymenit(s).getAttribute("title")) ?? "")).toBe("Pruty z mostovky mimo cestu (prutů: 3) změní na „Lehký trám“ a ušetří až 11 700 Kč. Jde vzít zpět.");
    // Ukazatel v liště je nad rozpočtem výrazný: žlutý rámeček a tučná částka.
    const lista = s.locator("#obrazovka-uroven .rozpocet");
    expect(await lista.evaluate((e) => getComputedStyle(e).borderTopColor)).toBe("rgb(255, 209, 102)");
    expect(await lista.locator(".rozpocet__castka").evaluate((e) => getComputedStyle(e).fontWeight)).toBe("600");
    // Hlášení nezakrývá most: leží nad jeho nejvyšším styčníkem nebo vedle něj.
    const box = (await hlaseni(s).boundingBox())!;
    const levyHorni = await bodSveta(s, 0, 3);
    const pravyDolni = await bodSveta(s, 16, 0);
    expect(box.y + box.height <= levyHorni.y || box.x + box.width <= levyHorni.x || box.x >= pravyDolni.x).toBe(true);
    await s.screenshot({ path: `${SLOZKA}/rozpocet-prekroceno.png` });
    await s.locator("#obrazovka-uroven .lista").screenshot({ path: `${SLOZKA}/rozpocet-lista-nad.png` });

    // Výměna klávesnicí: tlačítko jde zaměřit a stisknout Enterem.
    await vymenit(s).focus();
    await s.keyboard.press("Enter");
    await expect.poll(() => stavRozpoctu(s)).not.toBe("nad");
    expect(bezMezer(await hlaseni(s).innerText())).toBe("Vyměněno prutů: 3. Most stojí 100 400 Kč.");
    expect(await s.locator('[data-udaj="cena"]').innerText().then(bezMezer)).toBe("100 400 Kč");
    expect(await telo(s, "pruty")).toBe("13");
    // V ruce zůstala mostovka: výměna mění most, ne nástroj.
    expect(await s.locator('.paleta [data-prvek="mostovka-drevo"]').getAttribute("aria-pressed")).toBe("true");
    await s.screenshot({ path: `${SLOZKA}/rozpocet-vymeneno.png` });

    // Jeden krok Zpět vrátí všechny tři pruty; hlášení o překročení se po kroku Zpět neopakuje.
    await s.locator('[data-akce="zpet"]').first().click();
    await expect.poll(() => stavRozpoctu(s)).toBe("nad");
    expect(bezMezer(await s.locator('[data-udaj="cena"]').innerText())).toBe("112 100 Kč");
    expect(await vymenit(s).count()).toBe(0);
    // Věta „Vyměněno… Most stojí 100 400 Kč“ po kroku Zpět už neplatí a nesvítí.
    expect(await hlaseni(s).innerText()).toBe("");

    // Zkouška se nepustí a hlášení nabídne totéž tlačítko.
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    expect(await telo(s, "rezim")).toBe("stavba");
    expect(bezMezer(await hlaseni(s).innerText())).toBe("Zkouška nejde: most je o 2 100 Kč nad rozpočtem. Mostovka mimo cestu je zbytečně drahá. Vyměnit za „Lehký trám“");
    // Hlášení s tlačítkem samo nemizí; zmizet musí, když se most do rozpočtu vrátí jinak
    // (krok Zpět ubere svislici z mostovky), jinak by svítilo nad mostem, který zkoušku pustí.
    await s.locator('[data-akce="zpet"]').first().click();
    await expect.poll(() => stavRozpoctu(s)).not.toBe("nad");
    expect(await hlaseni(s).innerText()).toBe("");
    await s.locator('[data-akce="znovu"]').first().click();
    await expect.poll(() => stavRozpoctu(s)).toBe("nad");
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    await vymenit(s).waitFor();
    await vymenit(s).click();
    await expect.poll(() => stavRozpoctu(s)).not.toBe("nad");
    // Po výměně se zkouška pustí a most autora projde.
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 120_000 });
    expect(await telo(s, "zkouska")).toBe("hotovo");
    await s.locator('[data-akce="na-konec"]').click();
    await s.locator(".vysledek").waitFor({ state: "visible" });
    expect(await s.locator('[data-udaj="vysledek-nadpis"]').innerText()).toBe("MOST OBSTÁL");
    await kontext.close();
  }, 180_000);

  it("most, který se zvedá (7-01): překročení řekne, ale výměnu nenabízí ani po stisku Zkoušky", async () => {
    const { kontext, s } = await novyKontext();
    await otevri(s, "7-01");
    await nactiMostImportem(s, navrhNaText(RESENI["7-01"]!.pruchod));
    await expect.poll(() => telo(s, "pruty")).toBe("5");
    // Svislý kus mostovky nad mostovkou: na zvedacím mostě může být mostovka mimo cestu záměr.
    await tahni(s, [6, 0], [6, 3]);
    await expect.poll(() => stavRozpoctu(s)).toBe("nad");
    expect(bezMezer(await hlaseni(s).innerText())).toBe("O 7 000 Kč nad rozpočtem.");
    expect(await vymenit(s).count()).toBe(0);
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    expect(await telo(s, "rezim")).toBe("stavba");
    expect(bezMezer(await hlaseni(s).innerText())).toBe("Zkouška nejde: most je o 7 000 Kč nad rozpočtem.");
    expect(await vymenit(s).count()).toBe(0);
    await kontext.close();
  });

  it("Havarijní komise: rozpočet ani výměnu nehlídá a prvek v ruce nepřepíná", async () => {
    const { kontext, s } = await novyKontext();
    const pripad = PRIPADY[0]!;
    await otevri(s, pripad.uroven.id);
    expect(await telo(s, "havarie")).toBe(pripad.uroven.id);
    // Svislice z mostovky přes lehkou svislici spadlého mostu (jedna změna).
    await s.locator('.paleta [data-prvek="mostovka-drevo"]').click();
    const pred = await telo(s, "pruty");
    await tahni(s, [8, 0], [8, 4]);
    await expect.poll(() => telo(s, "zmen")).toBe("1");
    expect(await telo(s, "pruty")).toBe(pred);
    expect(await stavRozpoctu(s)).toBe("ok");
    expect(await vymenit(s).count()).toBe(0);
    expect(await telo(s, "prvek-prepnut")).toBeNull();
    await kontext.close();
  });
});

describe("hlášení s tlačítkem na telefonu", () => {
  for (const jazyk of ["cs", "en"] as const) {
    it(`390 × 844 (${jazyk}): tlačítko výměny se vejde, jde stisknout prstem a hlášení nezakrývá most`, async () => {
      const { kontext, s } = await novyKontext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await otevri(s, "1-03", jazyk);
      await nactiMostImportem(s, navrhNaText(mostSeSvislicemiZMostovky([4, 8, 12])));
      await expect.poll(() => stavRozpoctu(s)).toBe("nad");
      await s.locator('#obrazovka-uroven [data-akce="zkouska"]').first().tap();
      expect(await telo(s, "rezim")).toBe("stavba");
      const tlacitko = vymenit(s);
      await tlacitko.waitFor({ state: "visible" });
      expect(await tlacitko.innerText()).toBe(jazyk === "cs" ? "Vyměnit za „Lehký trám“" : "Swap for “Light timber”");
      const t = (await tlacitko.boundingBox())!;
      const h = (await hlaseni(s).boundingBox())!;
      expect(t.height).toBeGreaterThanOrEqual(44);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x + t.width).toBeLessThanOrEqual(390);
      expect(h.x + h.width).toBeLessThanOrEqual(390);
      // Hlášení nad mostem, ne přes něj (nejvyšší styčník mostu je 3 m nad mostovkou).
      const vrsek = await bodSveta(s, 8, 3);
      expect(h.y + h.height).toBeLessThanOrEqual(vrsek.y);
      await nepretika(s);
      await s.screenshot({ path: `${SLOZKA}/rozpocet-telefon-${jazyk}.png` });
      await tlacitko.tap();
      await expect.poll(() => stavRozpoctu(s)).not.toBe("nad");
      expect(bezMezer(await hlaseni(s).innerText())).toBe(jazyk === "cs" ? "Vyměněno prutů: 3. Most stojí 100 400 Kč." : "Members swapped: 3. The bridge costs 100,400 Kč.");
      await nepretika(s);
      await kontext.close();
    }, 120_000);
  }
});
