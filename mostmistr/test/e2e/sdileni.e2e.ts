// Milník M13 v bezhlavém prohlížeči: sdílení mostu odkazem. Odkaz vyrobený hrou otevře
// v čistém prohlížeči stejný most se stejným otiskem zkoušky; příjemce o svůj most nepřijde
// a může soupeřův překonat cenou.
import { mkdirSync, statSync } from "node:fs";
import { chromium, devices, type Browser, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cenaNavrhu } from "../../src/data/cena";
import { navrhNaText, type NavrhMostu } from "../../src/data/navrh";
import { odkazNaMost, rozkodujMost, zakodujMost } from "../../src/data/sdileni";
import { RESENI } from "../../urovne/reseni";
import { prijimejDenik } from "./server-deniku";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
const UROVEN = "1-03";
/** Most autora odkazu (98 985 Kč, všechny medaile) a mosty příjemce: dražší a levnější. */
const SDILENY = RESENI[UROVEN]!.mistrovska;
const DRAZSI = RESENI[UROVEN]!.pruchod;
const LEVNEJSI = RESENI[UROVEN]!.rozpocet;

let server: PreviewServer;
let prohlizec: Browser;
let adresa: string;
const chyby: string[] = [];
const kontexty: BrowserContext[] = [];

const bezMezer = (text: string): string => text.replace(/[\u202f\u00a0]/g, " ");
const koruny = (castka: number): string => `${Math.round(castka).toLocaleString("cs-CZ").replace(/[\u202f\u00a0]/g, " ")} Kč`;

/** Nová stránka v čistém prohlížeči (vlastní paměť, žádný uložený postup). */
async function cistaStranka(volby: Parameters<Browser["newContext"]>[0] = {}): Promise<Page> {
  const kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, ...volby });
  kontexty.push(kontext);
  const stranka = await kontext.newPage();
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
  return stranka;
}

const akce = (s: Page, jmeno: string) => s.locator(`[data-akce="${jmeno}"]`);
const udaj = (s: Page, jmeno: string): Promise<string> => s.locator(`[data-udaj="${jmeno}"]`).innerText();
const telo = (s: Page, atribut: string): Promise<string | null> => s.locator("body").getAttribute(`data-${atribut}`);

async function otevriUroven(s: Page, dotaz = `?uroven=${UROVEN}`): Promise<void> {
  await s.goto(`${adresa}${dotaz}`);
  await s.locator(PLATNO).waitFor();
  const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await zavrit.count()) > 0) await zavrit.click();
}

async function nactiMost(s: Page, text: string): Promise<void> {
  await akce(s, "import").click();
  await s.locator("#okno-obsah").fill(text);
  await akce(s, "okno-nacist").click();
}

/** Pustí zkoušku, přehraje ji na konec a vrátí otisk výsledku. */
async function zkousej(s: Page): Promise<string> {
  await s.locator(PLATNO).focus();
  await s.keyboard.press("Space");
  await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
  expect(await telo(s, "zkouska")).toBe("hotovo");
  await akce(s, "na-konec").click();
  await s.locator(".vysledek").waitFor({ state: "visible" });
  return (await telo(s, "otisk"))!;
}

async function rozbalVysledek(s: Page): Promise<void> {
  if ((await s.locator(".vysledek").getAttribute("data-sbaleno")) !== "ne") await akce(s, "vysledek-sbalit").click();
}

/** Uložený most úrovně v paměti prohlížeče, nebo null. */
async function ulozenyMost(s: Page): Promise<NavrhMostu | null> {
  return s.evaluate((id) => {
    const zapis = window.localStorage.getItem("mostmistr.ulozeni");
    return zapis ? ((JSON.parse(zapis).navrhy?.[id] as NavrhMostu | undefined) ?? null) : null;
  }, UROVEN);
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4213, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
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

describe("sdílení mostu odkazem", () => {
  let odkaz = "";
  let otiskAutora = "";

  it("autor: okno sdílení dá odkaz, zprávu s cenou a obrázek výkresu", async () => {
    const s = await cistaStranka({ permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: true });
    await otevriUroven(s);
    // Prázdný výkres: tlačítko je vidět a po kliknutí řekne, proč nic neotevřelo.
    const tlacitko = s.locator('.paleta [data-akce="sdilet"]');
    expect(await tlacitko.isVisible()).toBe(true);
    expect(await tlacitko.isEnabled()).toBe(true);
    await tlacitko.click();
    expect(await s.locator("#okno-sdileni").evaluate((o) => (o as HTMLDialogElement).open)).toBe(false);
    expect(await udaj(s, "hlaseni")).toBe("Není co sdílet: výkres je prázdný.");

    await nactiMost(s, navrhNaText(SDILENY));
    // Nezkoušený most: okno to říká a zpráva nic neslibuje.
    await tlacitko.click();
    expect(await udaj(s, "sdileni-popis")).toContain("od poslední úpravy nezkoušel");
    expect(bezMezer(await s.locator("#sdileni-zprava").inputValue())).toMatch(/^Podívej se na můj most v úrovni „První auto“ ve hře Mostmistr \(98 985 Kč\): http/);
    await s.locator('#okno-sdileni button[value="zavrit"]').click();

    otiskAutora = await zkousej(s);
    await rozbalVysledek(s);
    // Sdílet jde i z podrobností výsledku: to je chvíle, kdy se hráč chce pochlubit.
    await s.locator('.vysledek [data-akce="sdilet"]').click();
    expect(await udaj(s, "sdileni-popis")).toContain("zkouškou prošel");
    odkaz = await s.locator("#sdileni-odkaz").inputValue();
    // Odkaz nese jen úroveň a kód mostu a je krátký: projde zprávou i e-mailem.
    expect(odkaz).toBe(odkazNaMost(adresa, SDILENY));
    expect(new URL(odkaz).search).toMatch(/^\?uroven=1-03&most=[A-Za-z0-9_-]+$/);
    expect(odkaz.length).toBeLessThan(300);
    expect(rozkodujMost(new URL(odkaz).searchParams.get("most")!)).toEqual(SDILENY);
    const zprava = bezMezer(await s.locator("#sdileni-zprava").inputValue());
    expect(zprava).toBe(`Můj most v úrovni „První auto“ ve hře Mostmistr stojí 98 985 Kč. Postavíš levnější? ${odkaz}`);

    await akce(s, "sdileni-odkaz").click();
    await expect.poll(() => udaj(s, "sdileni-hlaseni")).toBe("Odkaz je ve schránce.");
    expect(await s.evaluate(() => navigator.clipboard.readText())).toBe(odkaz);
    await akce(s, "sdileni-zprava").click();
    await expect.poll(() => udaj(s, "sdileni-hlaseni")).toBe("Zpráva je ve schránce.");
    expect(bezMezer(await s.evaluate(() => navigator.clipboard.readText()))).toBe(zprava);

    // Obrázek výkresu: náhled v okně a soubor PNG ke stažení.
    const platno = s.locator('[data-udaj="sdileni-obrazek"]');
    expect(await platno.evaluate((c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([1200, 630]);
    // Plátno není prázdné: v obrázku jsou světlé čáry mostu i tmavý podklad.
    const barev = await platno.evaluate((c) => {
      const data = (c as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1200, 630).data;
      const ruzne = new Set<number>();
      for (let i = 0; i < data.length; i += 4 * 97) ruzne.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
      return ruzne.size;
    });
    expect(barev).toBeGreaterThan(20);
    await s.screenshot({ path: `${SLOZKA}/s1-okno-sdileni.png` });
    const [stazeni] = await Promise.all([s.waitForEvent("download"), akce(s, "sdileni-obrazek").click()]);
    expect(stazeni.suggestedFilename()).toBe("mostmistr-1-03.png");
    const soubor = `${SLOZKA}/s1-obrazek.png`;
    await stazeni.saveAs(soubor);
    expect(statSync(soubor).size).toBeGreaterThan(15_000);
    expect(await udaj(s, "sdileni-hlaseni")).toBe("Obrázek se stahuje.");
  }, 240_000);

  it("příjemce v čistém prohlížeči: stejný most, stejný otisk zkoušky, a nic se mu neuložilo", async () => {
    const s = await cistaStranka();
    await s.goto(odkaz);
    await s.locator(PLATNO).waitFor();
    // Zadání se přes cizí most neotevírá: příjemce ho vidí hned, s pruhem, co s ním může dělat.
    expect(await s.locator("#okno-zadani").evaluate((o) => (o as HTMLDialogElement).open)).toBe(false);
    expect(await telo(s, "host")).toBe("ano");
    expect(await telo(s, "pruty")).toBe(String(SDILENY.pruty.length));
    expect(bezMezer(await udaj(s, "host-text"))).toBe("Most z odkazu · 98 985 Kč. Tvůj vlastní most je uložený stranou.");
    // Kdo vlastní most nemá, nemá co ztratit, a tlačítka to říkají.
    expect(await akce(s, "host-nechat").innerText()).toBe("Nechat si ho");
    expect(await akce(s, "host-zpet").innerText()).toBe("Prázdný výkres");
    await s.screenshot({ path: `${SLOZKA}/s2-prijemce.png` });

    expect(await zkousej(s)).toBe(otiskAutora);
    expect(await udaj(s, "vysledek-nadpis")).toBe("MOST OBSTÁL");
    await akce(s, "upravit").click();
    expect(bezMezer(await udaj(s, "host-text"))).toBe("Most z odkazu · 98 985 Kč · zkouškou prošel. Tvůj vlastní most je uložený stranou.");
    // Cizí most se neukládá, ani po zkoušce.
    expect(await ulozenyMost(s)).toBeNull();

    // Nechat si ho: začne se ukládat, pruh zmizí a adresa už kód mostu nenese.
    await akce(s, "host-nechat").click();
    expect(await telo(s, "host")).toBe("ne");
    expect(await s.locator('[data-udaj="host"]').isVisible()).toBe(false);
    expect(new URL(s.url()).search).toBe("?uroven=1-03");
    expect(await ulozenyMost(s)).toEqual(SDILENY);
    await s.reload();
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ne");
    expect(await telo(s, "pruty")).toBe(String(SDILENY.pruty.length));
    // Odkaz na most, který už hráč má, je obyčejné otevření úrovně.
    await s.goto(odkaz);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ne");
  }, 240_000);

  it("příjemce s vlastním mostem o něj nepřijde a soupeřův může překonat cenou", async () => {
    const s = await cistaStranka();
    await otevriUroven(s);
    await nactiMost(s, navrhNaText(DRAZSI));
    expect(await ulozenyMost(s)).toEqual(DRAZSI);

    await s.goto(odkaz);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ano");
    expect(await telo(s, "pruty")).toBe(String(SDILENY.pruty.length));
    expect(await akce(s, "host-nechat").innerText()).toBe("Nahradit jím můj most");
    expect(await akce(s, "host-zpet").innerText()).toBe("Zpět k mému mostu");
    // Úprava cizího mostu se neukládá a pruh to řekne.
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Control+a");
    await s.keyboard.press("Delete");
    expect(await telo(s, "pruty")).toBe("0");
    expect(bezMezer(await udaj(s, "host-text"))).toBe("Upravený most z odkazu · 0 Kč. Neukládá se, dokud si ho nenecháš.");
    expect(await ulozenyMost(s)).toEqual(DRAZSI);
    await s.keyboard.press("Control+z");
    expect(await telo(s, "pruty")).toBe(String(SDILENY.pruty.length));

    // Postavit levnější: vrátí se vlastní most, cena soupeřova je výzva a adresa je čistá.
    await akce(s, "host-prekonat").click();
    expect(await telo(s, "host")).toBe("ne");
    expect(await telo(s, "pruty")).toBe(String(DRAZSI.pruty.length));
    expect(new URL(s.url()).search).toBe("?uroven=1-03");
    expect(bezMezer(await udaj(s, "hlaseni"))).toBe("Výzva přijata: postav most, který projde a stojí míň než 98 985 Kč.");
    expect(bezMezer(await udaj(s, "vyzva-odkazu-text"))).toBe("Výzva z odkazu: postav most levnější než 98 985 Kč.");
    // Zpět nevrátí cizí most do výkresu hráče: uložil by se jako jeho.
    expect(await akce(s, "zpet").isDisabled()).toBe(true);
    expect(await ulozenyMost(s)).toEqual(DRAZSI);
    await s.screenshot({ path: `${SLOZKA}/s3-vyzva.png` });

    // Dražší most výzvu nevyhraje a výsledek řekne, kolik zbývá ubrat.
    await zkousej(s);
    await rozbalVysledek(s);
    const veta = s.locator('[data-udaj="vysledek-vyzva-odkazu"]');
    expect(await veta.getAttribute("data-stav")).toBe("prohra");
    expect(bezMezer(await veta.innerText())).toBe(
      `Výzva z odkazu: tvůj most stojí ${koruny(cenaNavrhu(DRAZSI))}, soupeřův 98 985 Kč. Zbývá ubrat ${koruny(cenaNavrhu(DRAZSI) - cenaNavrhu(SDILENY))}.`,
    );
    await akce(s, "upravit").click();

    // Levnější most, který projde bez porušení, vyhrává; výzva se pamatuje i po načtení stránky.
    await nactiMost(s, navrhNaText(LEVNEJSI));
    expect(bezMezer(await udaj(s, "vyzva-odkazu-text"))).toBe(
      `Výzva z odkazu: soupeřův most stojí 98 985 Kč, tvůj je teď o ${koruny(cenaNavrhu(SDILENY) - cenaNavrhu(LEVNEJSI))} levnější. Ještě musí projít zkouškou.`,
    );
    await s.reload();
    await s.locator(PLATNO).waitFor();
    expect(await s.locator('[data-udaj="vyzva-odkazu"]').isVisible()).toBe(true);
    await zkousej(s);
    await rozbalVysledek(s);
    expect(await veta.getAttribute("data-stav")).toBe("vyhra");
    expect(bezMezer(await veta.innerText())).toContain(`jsi o ${koruny(cenaNavrhu(SDILENY) - cenaNavrhu(LEVNEJSI))} levnější`);
    await s.screenshot({ path: `${SLOZKA}/s4-vyhra.png` });
    // Odveta: zpráva ke sdílení říká, o kolik hráč soupeře překonal, a nese jeho most.
    await s.locator('.vysledek [data-akce="sdilet"]').click();
    const zprava = bezMezer(await s.locator("#sdileni-zprava").inputValue());
    expect(zprava).toMatch(/^Tvůj most v úrovni „První auto“ jsem překonal: můj stojí 94 073 Kč, o 4 912 Kč míň\. Zkusíš to znovu\? http/);
    expect(await s.locator("#sdileni-odkaz").inputValue()).toBe(odkazNaMost(adresa, LEVNEJSI));
    await s.locator('#okno-sdileni button[value="zavrit"]').click();
    await akce(s, "upravit").click();

    // Soupeřův most si jde znovu ukázat; vlastní zůstává uložený a vrátí se celý.
    await akce(s, "vyzva-ukazat").click();
    expect(await telo(s, "host")).toBe("ano");
    expect(await telo(s, "pruty")).toBe(String(SDILENY.pruty.length));
    expect(await akce(s, "zpet").isDisabled()).toBe(true);
    expect(await ulozenyMost(s)).toEqual(LEVNEJSI);
    await akce(s, "host-zpet").click();
    expect(await telo(s, "host")).toBe("ne");
    expect(await telo(s, "pruty")).toBe(String(LEVNEJSI.pruty.length));
    expect(await ulozenyMost(s)).toEqual(LEVNEJSI);
    // Výzvu jde zrušit.
    await akce(s, "vyzva-zrusit").click();
    expect(await s.locator('[data-udaj="vyzva-odkazu"]').isVisible()).toBe(false);
    await s.reload();
    await s.locator(PLATNO).waitFor();
    expect(await s.locator('[data-udaj="vyzva-odkazu"]').isVisible()).toBe(false);
  }, 300_000);

  it("poškozený odkaz hru nezastaví a řekne, co se stalo; Import přečte odkaz i kód", async () => {
    const s = await cistaStranka();
    const kod = zakodujMost(SDILENY);
    // Zkrácený odkaz (zalomení v e-mailu): úroveň se otevře a hlášení řekne proč bez mostu.
    await otevriUroven(s, `?uroven=${UROVEN}&most=${kod.slice(0, 40)}`);
    expect(await telo(s, "host")).toBe("ne");
    expect(await telo(s, "pruty")).toBe("0");
    expect(await udaj(s, "hlaseni")).toBe("Odkaz na most je poškozený nebo neúplný (nejspíš se cestou zkrátil). Popros o něj znovu.");
    // Bez úrovně v adrese není kam jít: přehled s touž větou.
    await s.goto(`${adresa}?most=${kod.slice(0, 40)}`);
    await s.locator('body[data-rezim="prehled"]').waitFor();
    expect(await udaj(s, "prehled-hlaseni")).toBe("Odkaz na most je poškozený nebo neúplný (nejspíš se cestou zkrátil). Popros o něj znovu.");
    // Kód sám úroveň nese: odkaz bez `uroven=` otevře most v jeho úrovni.
    await s.goto(`${adresa}?most=${kod}`);
    await s.locator(PLATNO).waitFor();
    expect(await telo(s, "host")).toBe("ano");
    expect(await udaj(s, "list")).toBe(UROVEN);
    await akce(s, "host-zpet").click();
    expect(await telo(s, "pruty")).toBe("0");

    // Import: celý odkaz ve zprávě, kód sám, a poškozený kód s vlastní větou.
    await nactiMost(s, `Mrkni: ${odkazNaMost("https://mostmistr.netlify.app/", SDILENY)}`);
    expect(await telo(s, "pruty")).toBe(String(SDILENY.pruty.length));
    expect(await ulozenyMost(s)).toEqual(SDILENY);
    await nactiMost(s, zakodujMost(LEVNEJSI));
    expect(await ulozenyMost(s)).toEqual(LEVNEJSI);
    await akce(s, "import").click();
    await s.locator("#okno-obsah").fill(kod.slice(0, 60));
    await akce(s, "okno-nacist").click();
    expect(await udaj(s, "okno-hlaseni")).toBe("Odkaz na most je poškozený nebo neúplný (nejspíš se cestou zkrátil). Popros o něj znovu.");
    // Odkaz na most jiné úrovně Import odmítne stejně jako zápis z Exportu.
    await s.locator("#okno-obsah").fill(zakodujMost(RESENI["1-01"]!.pruchod));
    await akce(s, "okno-nacist").click();
    expect(await udaj(s, "okno-hlaseni")).toContain("1-01");
  }, 180_000);

  it("pískoviště sdílení nenabízí; na telefonu se pruh mostu z odkazu vejde a tlačítka jsou na prst", async () => {
    const s = await cistaStranka();
    await s.goto(`${adresa}?sandbox`);
    await s.locator(PLATNO).waitFor();
    const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
    if ((await zavrit.count()) > 0) await zavrit.click();
    expect(await s.locator('.paleta [data-akce="sdilet"]').isVisible()).toBe(false);

    const telefon = await cistaStranka({ ...devices["iPhone 13"], locale: "cs-CZ", deviceScaleFactor: undefined });
    await telefon.goto(odkaz);
    await telefon.locator(PLATNO).waitFor();
    expect(await telo(telefon, "host")).toBe("ano");
    const rozmery = await telefon.evaluate(() => {
      const pruh = document.querySelector<HTMLElement>('[data-udaj="host"]')!;
      const r = pruh.getBoundingClientRect();
      const platno = document.querySelector<HTMLElement>("canvas.vykres__platno")!.getBoundingClientRect();
      return {
        sirka: window.innerWidth,
        vyska: window.innerHeight,
        stranka: document.documentElement.scrollWidth,
        vpravo: r.right,
        dole: r.bottom,
        vrchPlatna: platno.top,
        vyskaPlatna: platno.height,
        tlacitka: [...pruh.querySelectorAll<HTMLElement>("button")].map((b) => b.getBoundingClientRect().height),
      };
    });
    expect(rozmery.stranka).toBeLessThanOrEqual(rozmery.sirka);
    expect(rozmery.vpravo).toBeLessThanOrEqual(rozmery.sirka);
    for (const vyska of rozmery.tlacitka) expect(vyska).toBeGreaterThanOrEqual(44);
    // Pruh je nad výkresem, ne přes něj: cizí most je celý vidět a výkresu zbývá aspoň třetina výšky.
    expect(rozmery.dole).toBeLessThanOrEqual(rozmery.vrchPlatna + 1);
    expect(rozmery.vyskaPlatna).toBeGreaterThanOrEqual(rozmery.vyska / 3);
    await telefon.screenshot({ path: `${SLOZKA}/s5-telefon.png` });
    // Okno sdílení se na telefon vejde a tlačítka jsou dosažitelná.
    await telefon.locator('.paleta [data-akce="sdilet"]').scrollIntoViewIfNeeded();
    await telefon.locator('.paleta [data-akce="sdilet"]').click();
    const okno = await telefon.locator("#okno-sdileni").evaluate((o) => {
      const r = o.getBoundingClientRect();
      return { sirka: r.width, vlevo: r.left, vpravo: r.right, okno: window.innerWidth };
    });
    expect(okno.vlevo).toBeGreaterThanOrEqual(0);
    expect(okno.vpravo).toBeLessThanOrEqual(okno.okno);
    await telefon.screenshot({ path: `${SLOZKA}/s5-telefon-okno.png` });
  }, 120_000);

  it("anglicky: pruh, okno sdílení a výzva jsou přeložené", async () => {
    const s = await cistaStranka({ locale: "en-US" });
    await s.goto(`${odkaz}&jazyk=en`);
    await s.locator(PLATNO).waitFor();
    expect(bezMezer(await udaj(s, "host-text"))).toBe("Bridge from a link · 98,985 Kč. Your own bridge is saved aside.");
    expect(await akce(s, "host-prekonat").innerText()).toBe("Build a cheaper one");
    await s.locator('.paleta [data-akce="sdilet"]').click();
    expect(await s.locator("#okno-sdileni h2").innerText()).toBe("Share bridge");
    // V okně ani v polích nezbyla česká věta (měna a název hry česky zůstávají).
    const ceske = /[ěščřžýáíéúůťďňĚŠČŘŽÝÁÍÉÚŮŤĎŇ]/;
    const bezMeny = (text: string): string => text.replace(/Kč/g, "");
    expect(bezMeny(await s.locator("#okno-sdileni").innerText())).not.toMatch(ceske);
    expect(bezMeny(await s.locator("#sdileni-zprava").inputValue())).not.toMatch(ceske);
    expect(bezMeny(await s.locator('[data-udaj="host"]').innerText())).not.toMatch(ceske);
    expect(bezMezer(await s.locator("#sdileni-zprava").inputValue())).toMatch(/^Have a look at my bridge in the level “[^”]+” in Mostmistr \(98,985 Kč\): http/);
    await s.locator('#okno-sdileni button[value="zavrit"]').click();
    await akce(s, "host-prekonat").click();
    expect(bezMezer(await udaj(s, "vyzva-odkazu-text"))).toBe("Challenge from a link: build a bridge cheaper than 98,985 Kč.");
  }, 120_000);

  it("během sdílení prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
