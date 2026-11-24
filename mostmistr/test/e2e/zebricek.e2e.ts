// Žebříčky v prohlížeči: hráč projde zkouškou, zapíše most pod přezdívkou, server (skutečná
// obsluha zapojená do náhledového serveru) si most přepočítá a ukáže ho v žebříčku; podvržený
// zápis ze stejného prohlížeče odmítne. Kritérium M16: „podvržený výsledek server odmítne“.
import { mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cenaNavrhu } from "../../src/data/cena";
import { navrhNaText, type NavrhMostu } from "../../src/data/navrh";
import { zakodujMost } from "../../src/data/sdileni";
import { VERZE_ZEBRICKU, znackaHrace } from "../../src/data/zebricek";
import { VERZE_FYZIKY } from "../../src/jadro/verze";
import type { ProstrediServeru } from "../../src/server/obsluha";
import { overovacKampane } from "../../src/server/overeni";
import { SkladVPameti } from "../../src/server/sklad";
import { spravujVse } from "../../src/server/sprava";
import { obsluzZebricek, type UlozenyZebricek, type ZebricekProSpravu } from "../../src/server/zebricek";
import { nactiKampan } from "../../urovne/index";
import { RESENI } from "../../urovne/reseni";
import { prijimejDenik } from "./server-deniku";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";
const HESLO = "heslo-pro-test-zebricku";

let server: PreviewServer;
let prohlizec: Browser;
let adresa: string;
const chyby: string[] = [];
const kontexty: BrowserContext[] = [];
const over = overovacKampane();
const prostredi: ProstrediServeru = {
  sklad: new SkladVPameti(),
  ted: () => new Date(),
  nahoda: () => "abcdef",
  prostredi: "test",
  hesloSpravce: HESLO,
  // Náhledový server hlavičku Netlify s adresou nepřidá; bez adresy by žebříček zápis odmítl.
  adresa: () => "203.0.113.7",
};

const bezMezer = (text: string): string => text.replace(/[  ]/g, " ");

async function cistaStranka(volby: Parameters<Browser["newContext"]>[0] = {}): Promise<Page> {
  const kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, ...volby });
  kontexty.push(kontext);
  const stranka = await kontext.newPage();
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    // Odmítnutý zápis je odpověď 4xx: prohlížeč ji hlásí do konzole, chyba hry to není.
    // Server, který test schválně odřízne, taky ne.
    if (zprava.type() === "error" && !/status of 4\d\d|net::ERR_FAILED/.test(zprava.text())) chyby.push(zprava.text());
  });
  return stranka;
}

const udaj = async (s: Page, jmeno: string): Promise<string> => bezMezer(await s.locator(`[data-udaj="${jmeno}"]`).innerText());
const telo = (s: Page, atribut: string): Promise<string | null> => s.locator("body").getAttribute(`data-${atribut}`);
const akce = (s: Page, jmeno: string) => s.locator(`[data-akce="${jmeno}"]`);
const okno = (s: Page) => s.locator("#okno-zebricek");
const radky = (s: Page, mira: string) => s.locator(`#okno-zebricek [data-mira="${mira}"] .zebricek__radky li`);

/** Přidá náhledovému serveru cestu, která žádosti předává serverové obsluze hry. */
function napoj(cesta: string, obsluha: (zadost: Request) => Promise<Response>): void {
  const vyrid = (zadost: IncomingMessage, odpoved: ServerResponse): void => {
    const casti: Buffer[] = [];
    zadost.on("data", (cast: Buffer) => casti.push(cast));
    zadost.on("end", () => {
      const metoda = zadost.method ?? "GET";
      const hlavicky = new Headers();
      for (const [jmeno, hodnota] of Object.entries(zadost.headers)) if (typeof hodnota === "string") hlavicky.set(jmeno, hodnota);
      const cela = (zadost as IncomingMessage & { originalUrl?: string }).originalUrl ?? zadost.url ?? cesta;
      const predana = new Request(new URL(cela, adresa), {
        method: metoda,
        headers: hlavicky,
        ...(metoda === "GET" || metoda === "HEAD" ? {} : { body: Buffer.concat(casti).toString("utf8") }),
      });
      void obsluha(predana).then(async (vysledek) => {
        odpoved.statusCode = vysledek.status;
        vysledek.headers.forEach((hodnota, jmeno) => odpoved.setHeader(jmeno, hodnota));
        odpoved.end(await vysledek.text());
      });
    });
  };
  server.middlewares.stack.unshift({ route: cesta, handle: vyrid });
}

async function otevriUroven(s: Page, id: string, dotaz = ""): Promise<void> {
  await s.goto(`${adresa}?uroven=${id}${dotaz}`);
  await s.locator(PLATNO).waitFor();
  const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await zavrit.count()) > 0) await zavrit.click();
}

async function nactiMost(s: Page, navrh: NavrhMostu): Promise<void> {
  await akce(s, "import").click();
  await s.locator("#okno-obsah").fill(navrhNaText(navrh));
  await akce(s, "okno-nacist").click();
}

/** Pustí zkoušku (mezerníkem běžnou, tlačítkem do zlomu), počká na výsledek a vrátí se ke stavbě. */
async function zkousej(s: Page, zlom = false): Promise<string> {
  if (zlom) await akce(s, "zlom").click();
  else {
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
  }
  await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 200_000 });
  expect(await telo(s, "zkouska")).toBe("hotovo");
  await akce(s, "na-konec").click();
  await s.locator(".vysledek").waitFor({ state: "visible" });
  const otisk = (await telo(s, "otisk")) ?? "";
  await akce(s, "upravit").click();
  return otisk;
}

async function otevriZebricek(s: Page): Promise<void> {
  await s.locator('.paleta [data-akce="zebricek"]').click();
  await okno(s).waitFor({ state: "visible" });
  await s.locator('#okno-zebricek[data-stav="nacten"], #okno-zebricek[data-stav="nedostupny"]').waitFor();
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4218, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prijimejDenik(server);
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  napoj("/api/zebricek", (zadost) => obsluzZebricek(zadost, prostredi, over));
  napoj("/api/sprava", (zadost) => spravujVse(zadost, prostredi));
  prohlizec = await chromium.launch();
});

afterAll(async () => {
  for (const kontext of kontexty) await kontext.close();
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("žebříčky", () => {
  const drazsi = cenaNavrhu(RESENI["1-01"]!.pruchod) > cenaNavrhu(RESENI["1-01"]!.mistrovska) ? RESENI["1-01"]!.pruchod : RESENI["1-01"]!.mistrovska;
  const levnejsi = drazsi === RESENI["1-01"]!.pruchod ? RESENI["1-01"]!.mistrovska : RESENI["1-01"]!.pruchod;
  let prvniOtisk = "";

  it("prázdný žebříček se dá otevřít; zapsat jde až most, který prošel zkouškou", async () => {
    const s = await cistaStranka();
    await otevriUroven(s, "1-01");
    await nactiMost(s, drazsi);
    await otevriZebricek(s);
    expect(await okno(s).getAttribute("data-stav")).toBe("nacten");
    expect(await okno(s).getAttribute("data-radku")).toBe("0");
    expect(bezMezer(await okno(s).locator("h2").innerText())).toContain("Žebříček");
    expect(await s.locator('#okno-zebricek [data-mira="cena"]').innerText()).toContain("Zatím nikdo");
    expect(await udaj(s, "zebricek-hlaseni")).toContain("Zapsat jde most, se kterým jsi od otevření úrovně prošel zkouškou");
    expect(await akce(s, "zebricek-zapsat").getAttribute("aria-disabled")).toBe("true");
    // Kliknutí na nepřipravené tlačítko jen poradí; nic se neposílá.
    await akce(s, "zebricek-zapsat").click({ force: true });
    expect(await okno(s).getAttribute("data-stav")).toBe("nacten");
    await s.keyboard.press("Escape");

    // Most, který zkouškou neprojde, hra do žebříčku nenabídne a řekne proč.
    await nactiMost(s, RESENI["1-01"]!.pady[0]!.navrh);
    await zkousej(s);
    await otevriZebricek(s);
    expect(await udaj(s, "zebricek-hlaseni")).toBe("Tenhle most zkouškou neprošel, takže zapsat nejde.");
    expect(await akce(s, "zebricek-zapsat").getAttribute("aria-disabled")).toBe("true");
    await s.keyboard.press("Escape");
    await nactiMost(s, drazsi);

    // Po zkoušce, která prošla bez porušení, je most připravený; bez přezdívky se nezapíše.
    prvniOtisk = await zkousej(s);
    expect(prvniOtisk).toMatch(/^[0-9a-f]{16}$/);
    await otevriZebricek(s);
    expect(await udaj(s, "zebricek-hlaseni")).toContain("Most na výkresu prošel zkouškou: můžeš ho zapsat mezi nejlevnější a nejlehčí.");
    expect(await akce(s, "zebricek-zapsat").getAttribute("aria-disabled")).toBe("false");
    await akce(s, "zebricek-zapsat").click();
    expect(await udaj(s, "zebricek-hlaseni")).toContain("Napiš přezdívku");
    await s.locator("#zebricek-jmeno").fill("  <b>Anna</b>  ");
    await akce(s, "zebricek-zapsat").click();
    await s.locator('#okno-zebricek[data-stav="zapsano"]').waitFor({ timeout: 60_000 });
    // Přezdívka je jen text: značky z ní zmizely a nic se nevykreslilo jako HTML.
    expect(await s.locator("#zebricek-jmeno").inputValue()).toBe("bAnnab");
    expect(await okno(s).locator("b").count()).toBe(0);
    expect(await radky(s, "cena").count()).toBe(1);
    expect(bezMezer(await radky(s, "cena").first().innerText())).toContain("bAnnab");
    expect(bezMezer(await radky(s, "cena").first().innerText())).toContain(`${cenaNavrhu(drazsi).toLocaleString("cs-CZ").replace(/[  ]/g, " ")} Kč`);
    expect(await radky(s, "cena").first().getAttribute("data-ja")).toBe("ano");
    expect(await radky(s, "hmotnost").count()).toBe(1);
    expect(await radky(s, "zlom").count()).toBe(0);
    expect(await udaj(s, "zebricek-hlaseni")).toContain("Nejlevnější: jsi 1.");
    // Co z přezdívky po vyčištění zbylo, hra hráči řekne.
    expect(await udaj(s, "zebricek-hlaseni")).toContain("Žebříček tě ukáže jako „bAnnab“");
    await s.screenshot({ path: `${SLOZKA}/z1-zebricek.png` });
    await s.keyboard.press("Escape");

    // Zkouška do zlomu přidá třetí měřítko.
    await zkousej(s, true);
    await otevriZebricek(s);
    expect(await udaj(s, "zebricek-hlaseni")).toContain("prošel zkouškou i zkouškou do zlomu");
    await akce(s, "zebricek-zapsat").click();
    await s.locator('#okno-zebricek[data-stav="zapsano"]').waitFor({ timeout: 60_000 });
    expect(await radky(s, "zlom").count()).toBe(1);
    expect(await udaj(s, "zebricek-hlaseni")).toContain("Únosnost na korunu: jsi 1.");
    // Cena a hmotnost téhož mostu podruhé: stejná hodnota není „horší most“.
    expect(await udaj(s, "zebricek-hlaseni")).toContain("Nejlevnější: stejnou hodnotu už zapsanou máš");
    // Sloupec únosnosti má jednotku v nadpisu a v řádku jen číslo.
    expect(bezMezer(await s.locator('#okno-zebricek [data-mira="zlom"] h3').innerText())).toMatch(/\[t na 100 000 Kč\]$/);
    expect(bezMezer(await radky(s, "zlom").first().locator(".zebricek__hodnota").innerText())).toMatch(/^\d+,\d$/);
    await s.keyboard.press("Escape");

    // Změněný most už připravený není: zapsat nejde, dokud znovu neprojde zkouškou.
    await nactiMost(s, levnejsi);
    await otevriZebricek(s);
    expect(await akce(s, "zebricek-zapsat").getAttribute("aria-disabled")).toBe("true");
    // Číslo hráče je v paměti prohlížeče a v odpovědi serveru není; přezdívka do deníku nejde.
    const identita = await s.evaluate(() => JSON.parse(window.localStorage.getItem("mostmistr.zebricek")!) as { hrac: string; jmeno: string });
    expect(identita.jmeno).toBe("bAnnab");
    expect(identita.hrac).toMatch(/^[0-9a-f]{32}$/);
    const verejny = await s.evaluate(async () => (await fetch("/api/zebricek?uroven=1-01")).text());
    expect(verejny).not.toContain(identita.hrac);
    expect(verejny).toContain(znackaHrace(identita.hrac, "1-01"));
  }, 400_000);

  it("podvržený zápis ze stejného prohlížeče server odmítne a žebříček se nezmění", async () => {
    const s = await cistaStranka();
    await otevriUroven(s, "1-01");
    const posli = (zmeny: Record<string, unknown>): Promise<{ stav: number; kod: string | undefined }> =>
      s.evaluate(
        async ([zaklad, zm]) => {
          const odpoved = await fetch("/api/zebricek", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(zaklad as object), ...(zm as object) }) });
          const data = (await odpoved.json()) as { kod?: string };
          return { stav: odpoved.status, kod: data.kod };
        },
        [{ uroven: "1-01", kod: zakodujMost(levnejsi), zkouska: "bezna", otisk: prvniOtisk, verze: VERZE_FYZIKY, hrac: "c".repeat(32), jmeno: "Podvodník" }, zmeny] as const,
      );
    // Otisk patří jinému mostu: zkouška levnějšího mostu na serveru dá jiný.
    expect(await posli({})).toEqual({ stav: 422, kod: "otisk" });
    // Most, který zkouškou neprojde, a most s připsanou „cenou“.
    expect(await posli({ kod: zakodujMost(RESENI["1-01"]!.pady[0]!.navrh), cena: 1 })).toMatchObject({ stav: 422 });
    expect(await posli({ verze: VERZE_FYZIKY + 1 })).toEqual({ stav: 409, kod: "verze" });
    expect(await posli({ kod: "AAAA" })).toEqual({ stav: 422, kod: "most" });
    // Zkouška do zlomu u mostu, který server nezná z běžné zkoušky, se ani nepustí.
    expect(await posli({ uroven: "1-02", kod: zakodujMost(RESENI["1-02"]!.pruchod), zkouska: "zlom" })).toEqual({ stav: 409, kod: "nejdriv" });
    await otevriZebricek(s);
    expect(await radky(s, "cena").count()).toBe(1);
    expect(bezMezer(await okno(s).innerText())).not.toContain("Podvodník");
    // Hra odmítnutí ukáže větou, ne kódem: starší verze hry v okně.
    await s.keyboard.press("Escape");
  }, 120_000);

  it("druhý hráč s levnějším mostem je první; každý vidí označený svůj řádek", async () => {
    const s = await cistaStranka();
    await otevriUroven(s, "1-01");
    await nactiMost(s, levnejsi);
    await zkousej(s);
    await otevriZebricek(s);
    // Cizí řádek není označený jako můj.
    expect(await radky(s, "cena").first().getAttribute("data-ja")).toBeNull();
    await s.locator("#zebricek-jmeno").fill("Boris");
    await s.locator("#zebricek-jmeno").press("Enter");
    await s.locator('#okno-zebricek[data-stav="zapsano"]').waitFor({ timeout: 60_000 });
    const jmena = (await radky(s, "cena").locator(".zebricek__jmeno").allInnerTexts()).map(bezMezer);
    expect(jmena).toEqual(["Boris", "bAnnab"]);
    expect(await radky(s, "cena").nth(0).getAttribute("data-ja")).toBe("ano");
    expect(await radky(s, "cena").nth(1).getAttribute("data-ja")).toBeNull();
    await s.screenshot({ path: `${SLOZKA}/z2-dva-hraci.png` });
    await s.keyboard.press("Escape");
    // Most, který už zapsal někdo jiný, druhý řádek nedostane (ani nezhorší vlastní zápis) a hra to řekne.
    await nactiMost(s, drazsi);
    await zkousej(s);
    await otevriZebricek(s);
    await akce(s, "zebricek-zapsat").click();
    await s.locator('#okno-zebricek[data-stav="zapsano"]').waitFor({ timeout: 60_000 });
    expect(await udaj(s, "zebricek-hlaseni")).toContain("Nejlevnější: úplně stejný most už zapsal někdo před tebou");
    expect((await radky(s, "cena").locator(".zebricek__jmeno").allInnerTexts()).map(bezMezer)).toEqual(["Boris", "bAnnab"]);
    expect(await radky(s, "hmotnost").count()).toBe(2);
  }, 400_000);

  it("pískoviště a případy komise žebříček nemají; anglicky a na telefonu se okno vejde", async () => {
    const s = await cistaStranka();
    await s.goto(`${adresa}?sandbox`);
    await s.locator(PLATNO).waitFor();
    expect(await s.locator('.paleta [data-akce="zebricek"]').isVisible()).toBe(false);
    await s.goto(`${adresa}?uroven=9-01`);
    await s.locator(PLATNO).waitFor();
    expect(await s.locator('.paleta [data-akce="zebricek"]').isVisible()).toBe(false);
    // Zkušební výkres do kampaně nepatří a server pro něj žebříček nevede: tlačítko tam není.
    await otevriUroven(s, "0-00");
    expect(await s.locator('.paleta [data-akce="zebricek"]').isVisible()).toBe(false);
    await otevriUroven(s, "1-02");
    expect(await s.locator('.paleta [data-akce="zebricek"]').isVisible()).toBe(true);

    const en = await cistaStranka({ locale: "en-US" });
    await otevriUroven(en, "1-01");
    await otevriZebricek(en);
    expect(bezMezer(await okno(en).locator("h2").innerText())).toContain("Leaderboard");
    expect(await en.locator('#okno-zebricek [data-mira="cena"] h3').innerText()).toMatch(/cheapest/i);
    expect(bezMezer(await okno(en).innerText())).not.toMatch(/Žebříček|Nejlevnější|Přezdívka/);

    const telefon = await cistaStranka({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await otevriUroven(telefon, "1-01");
    await telefon.evaluate(() => document.querySelector<HTMLElement>('.paleta [data-akce="zebricek"]')!.click());
    await okno(telefon).waitFor({ state: "visible" });
    await telefon.locator('#okno-zebricek[data-stav="nacten"]').waitFor();
    const meze = await telefon.evaluate(() => {
      const o = document.querySelector("#okno-zebricek")!.getBoundingClientRect();
      const tl = document.querySelector('[data-akce="zebricek-zapsat"]')!.getBoundingClientRect();
      return { vlevo: o.left, vpravo: o.right, sirka: window.innerWidth, vyska: window.innerHeight, dole: o.bottom, tlacitkoDole: tl.bottom };
    });
    expect(meze.vlevo).toBeGreaterThanOrEqual(0);
    expect(meze.vpravo).toBeLessThanOrEqual(meze.sirka);
    expect(meze.dole).toBeLessThanOrEqual(meze.vyska);
    await telefon.screenshot({ path: `${SLOZKA}/z3-telefon.png` });
  }, 200_000);

  it("plný žebříček: dvacet řádků s dlouhými přezdívkami se nerozsype a zápis zůstává vidět", async () => {
    // Žebříček úrovně 1-03 naplněný rovnou v úložišti: nejdelší přezdívky, pořadí do dvaceti.
    const uroven = nactiKampan().find((u) => u.id === "1-03")!;
    const zapisy = (zaklad: number, krok: number): UlozenyZebricek["cena"] =>
      Array.from({ length: 25 }, (_, i) => ({ hrac: i.toString(16).padStart(32, "e"), jmeno: i % 2 === 0 ? "WWWWWWWWWWWWWWWW" : `Hráč číslo ${i + 1}`, hodnota: zaklad + i * krok, cas: 1_795_000_000_000 + i, most: "0".repeat(32), tvar: `t${i}` }));
    const plny: UlozenyZebricek = { cena: zapisy(123_456, 1111), hmotnost: zapisy(12_345, 321), zlom: zapisy(0.5, 0.31).reverse() };
    await prostredi.sklad.zapis(`zebricek/v${VERZE_FYZIKY}.${VERZE_ZEBRICKU}/${over.klicUrovne(uroven)}.json`, plny);

    /** Řádky se nesmějí lámat ani přetékat: pořadí, jméno a hodnota jsou vedle sebe uvnitř sloupce. */
    const rozlozeni = (s: Page) =>
      s.evaluate(() => {
        const chyby: string[] = [];
        for (const sloupec of document.querySelectorAll<HTMLElement>("#okno-zebricek [data-mira]")) {
          const meze = sloupec.getBoundingClientRect();
          for (const [i, radek] of [...sloupec.querySelectorAll<HTMLElement>(".zebricek__radky li")].entries()) {
            const [poradi, jmeno, hodnota] = [".zebricek__poradi", ".zebricek__jmeno", ".zebricek__hodnota"].map((trida) => radek.querySelector<HTMLElement>(trida)!.getBoundingClientRect());
            const kde = `${sloupec.dataset.mira} ${i + 1}`;
            if (Math.abs(poradi!.top - hodnota!.top) > 3 || Math.abs(jmeno!.top - hodnota!.top) > 3) chyby.push(`${kde}: řádek se zalomil`);
            if (poradi!.left < meze.left - 0.5 || hodnota!.right > meze.right + 0.5) chyby.push(`${kde}: přetéká sloupec`);
            if (poradi!.right > jmeno!.left + 0.5 || jmeno!.right > hodnota!.left + 0.5) chyby.push(`${kde}: části řádku se překrývají`);
            if (radek.querySelector<HTMLElement>(".zebricek__poradi")!.scrollWidth > poradi!.width + 1) chyby.push(`${kde}: pořadí je oříznuté`);
          }
        }
        const okno = document.querySelector("#okno-zebricek")!.getBoundingClientRect();
        const vOkne = (vyber: string): boolean => {
          const p = document.querySelector(vyber)!.getBoundingClientRect();
          return p.top >= okno.top && p.bottom <= okno.bottom && p.bottom <= window.innerHeight && p.height > 0;
        };
        return { chyby, zapsat: vOkne('[data-akce="zebricek-zapsat"]'), jmeno: vOkne("#zebricek-jmeno"), hlaseni: vOkne('[data-udaj="zebricek-hlaseni"]'), zavrit: vOkne('#okno-zebricek button[value="zavrit"]') };
      });

    const s = await cistaStranka();
    await otevriUroven(s, "1-03");
    await otevriZebricek(s);
    expect(await okno(s).getAttribute("data-radku")).toBe("60");
    expect(await radky(s, "cena").count()).toBe(20);
    expect(bezMezer(await s.locator('#okno-zebricek [data-mira="cena"]').innerText())).toContain("a dalších 5");
    expect(bezMezer(await radky(s, "cena").nth(19).locator(".zebricek__poradi").innerText())).toBe("20.");
    expect(await rozlozeni(s)).toEqual({ chyby: [], zapsat: true, jmeno: true, hlaseni: true, zavrit: true });
    await s.screenshot({ path: `${SLOZKA}/z6-plny-zebricek.png` });

    for (const [jmeno, volby] of [
      ["telefon", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
      ["uzke", { viewport: { width: 1000, height: 700 } }],
      ["en", { locale: "en-US" }],
    ] as const) {
      const dalsi = await cistaStranka(volby);
      await otevriUroven(dalsi, "1-03");
      await dalsi.evaluate(() => document.querySelector<HTMLElement>('.paleta [data-akce="zebricek"]')!.click());
      await dalsi.locator('#okno-zebricek[data-stav="nacten"]').waitFor();
      expect(await rozlozeni(dalsi), jmeno).toEqual({ chyby: [], zapsat: true, jmeno: true, hlaseni: true, zavrit: true });
      await dalsi.screenshot({ path: `${SLOZKA}/z6-plny-zebricek-${jmeno}.png` });
    }
  }, 200_000);

  it("když server neodpovídá, okno to řekne a zapsat nenabízí", async () => {
    const s = await cistaStranka();
    await s.route("**/api/zebricek**", (cesta) => cesta.abort());
    await otevriUroven(s, "1-01");
    await nactiMost(s, levnejsi);
    await zkousej(s);
    await otevriZebricek(s);
    expect(await okno(s).getAttribute("data-stav")).toBe("nedostupny");
    expect(await udaj(s, "zebricek-hlaseni")).toContain("Žebříček teď není dostupný");
    expect(await akce(s, "zebricek-zapsat").getAttribute("aria-disabled")).toBe("true");
    await akce(s, "zebricek-zapsat").click({ force: true });
    expect(await okno(s).getAttribute("data-stav")).toBe("nedostupny");
  }, 200_000);

  it("správce vidí zápisy i s mostem a umí smazat nevhodnou přezdívku", async () => {
    const hlavicky = { authorization: `Bearer ${HESLO}` };
    const prehled = (await (await fetch(`${adresa}api/sprava?co=zebricky`, { headers: hlavicky })).json()) as { zebricky: ZebricekProSpravu[] };
    const radek = prehled.zebricky[0]!.radky.find((r) => r.jmeno === "bAnnab" && r.mira === "cena")!;
    expect(radek.zobrazeno).toBe(cenaNavrhu(drazsi));
    const most = (await (await fetch(`${adresa}api/sprava?co=zebricek-most&klic=${encodeURIComponent(prehled.zebricky[0]!.klic)}&most=${radek.most}`, { headers: hlavicky })).json()) as { kod: string };
    expect(most.kod).toBe(zakodujMost(drazsi));
    const smazani = await fetch(`${adresa}api/sprava?co=zebricek-smazat`, { method: "POST", headers: { ...hlavicky, "content-type": "application/json" }, body: JSON.stringify({ znacka: radek.znacka, uroven: "1-01" }) });
    expect(((await smazani.json()) as { smazano: number }).smazano).toBe(3);
    expect((await fetch(`${adresa}api/sprava?co=zebricky`)).status).toBe(401);
    const s = await cistaStranka();
    await otevriUroven(s, "1-01");
    await otevriZebricek(s);
    expect((await radky(s, "cena").locator(".zebricek__jmeno").allInnerTexts()).map(bezMezer)).toEqual(["Boris"]);
  }, 120_000);

  it("stránka správce ukáže denní rozbor jako text a žebříčky s mazáním", async () => {
    const hlavicky = { authorization: `Bearer ${HESLO}`, "content-type": "application/json" };
    const vcera = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const rozbor = {
      den: vcera,
      shrnuti: "Hráli dva lidé; oba prošli 1-01 a zapsali se do žebříčku.",
      text: "První odstavec.\n\n- odrážka <script>window.zle = 1</script>",
      navrhy: [
        { nazev: "Druhý návrh", duvod: "Důvod dvě.", popis: "Popis dvě.", narocnost: "mala", priorita: 2 },
        { nazev: "První návrh <b>tučně</b>", duvod: "Důvod jedna.", popis: "Popis jedna.", narocnost: "velka", priorita: 1 },
      ],
    };
    expect((await fetch(`${adresa}api/sprava?co=rozbor`, { method: "POST", headers: hlavicky, body: JSON.stringify(rozbor) })).status).toBe(201);
    // Podklady pro další rozbor ten včerejší připomenou (až pro den po něm).
    const podklady = (await (await fetch(`${adresa}api/sprava?co=podklady&den=${new Date().toISOString().slice(0, 10)}`, { headers: hlavicky })).json()) as {
      predchozi: { den: string }[];
      zebricky: { prijato: number; odmitnuto: Record<string, number> };
    };
    expect(podklady.predchozi.map((r) => r.den)).toEqual([vcera]);
    expect(podklady.zebricky.prijato).toBeGreaterThanOrEqual(4);
    expect(podklady.zebricky.odmitnuto.otisk).toBe(2);

    const s = await cistaStranka();
    await s.goto(`${adresa}sprava.html`);
    await s.locator("#heslo").fill(HESLO);
    await s.locator("#heslo").press("Enter");
    await s.locator('body[data-sprava="prihlaseno"]').waitFor();
    await s.locator('body[data-rozboru="1"]').waitFor();
    await s.locator('[data-zalozka="rozbory"]').click();
    expect(await s.locator("#rozbor-shrnuti").innerText()).toBe(rozbor.shrnuti);
    expect(await s.locator("#rozbor-text").innerText()).toContain("<script>window.zle = 1</script>");
    expect(await s.evaluate(() => (window as unknown as { zle?: number }).zle)).toBeUndefined();
    // Návrhy podle priority; značky v názvu jsou jen text.
    const navrhy = await s.locator("#rozbor-navrhy li strong").allInnerTexts();
    expect(navrhy).toEqual(["První návrh <b>tučně</b>", "Druhý návrh"]);
    expect(await s.locator("#rozbor-navrhy b").count()).toBe(0);
    expect(await s.locator("#rozbor-navrhy li").first().innerText()).toContain("náročnost velká");
    await s.screenshot({ path: `${SLOZKA}/z4-sprava-rozbor.png`, fullPage: true });

    await s.locator('[data-zalozka="zebricky"]').click();
    // Úroveň 1-01 (Boris: cena a hmotnost) a úroveň 1-03 naplněná testem rozložení.
    expect(await s.locator("#zebricky tbody tr", { hasText: "Boris" }).count()).toBe(2);
    expect(await s.locator("#zebricky tbody tr").first().innerText()).toContain("Boris");
    await s.screenshot({ path: `${SLOZKA}/z5-sprava-zebricky.png`, fullPage: true });
    s.once("dialog", (dialog) => void dialog.accept());
    await s.locator("#zebricky tbody tr").first().locator("button", { hasText: "Smazat hráče" }).click();
    await s.locator("#hlaseni", { hasText: "Smazáno zápisů" }).waitFor();
    expect(await s.locator("#hlaseni").innerText()).toBe("Smazáno zápisů: 2.");
    expect(await s.locator("#zebricky tbody tr", { hasText: "Boris" }).count()).toBe(0);
  }, 120_000);

  it("během práce se žebříčkem prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
