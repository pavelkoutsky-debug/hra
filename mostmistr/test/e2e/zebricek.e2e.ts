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
import { znackaHrace } from "../../src/data/zebricek";
import { VERZE_FYZIKY } from "../../src/jadro/verze";
import type { ProstrediServeru } from "../../src/server/obsluha";
import { overovacKampane } from "../../src/server/overeni";
import { SkladVPameti } from "../../src/server/sklad";
import { spravujVse } from "../../src/server/sprava";
import { obsluzZebricek, type ZebricekProSpravu } from "../../src/server/zebricek";
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
const prostredi: ProstrediServeru = {
  sklad: new SkladVPameti(),
  ted: () => new Date(),
  nahoda: () => "abcdef",
  prostredi: "test",
  hesloSpravce: HESLO,
};

const bezMezer = (text: string): string => text.replace(/[  ]/g, " ");

async function cistaStranka(volby: Parameters<Browser["newContext"]>[0] = {}): Promise<Page> {
  const kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, ...volby });
  kontexty.push(kontext);
  const stranka = await kontext.newPage();
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    // Odmítnutý zápis je odpověď 4xx: prohlížeč ji hlásí do konzole, chyba hry to není.
    if (zprava.type() === "error" && !/status of 4\d\d/.test(zprava.text())) chyby.push(zprava.text());
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
  const over = overovacKampane();
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
    expect(await udaj(s, "zebricek-hlaseni")).toContain("Zapsat jde most, se kterým jsi právě prošel zkouškou");
    expect(await akce(s, "zebricek-zapsat").getAttribute("aria-disabled")).toBe("true");
    // Kliknutí na nepřipravené tlačítko jen poradí; nic se neposílá.
    await akce(s, "zebricek-zapsat").click({ force: true });
    expect(await okno(s).getAttribute("data-stav")).toBe("nacten");
    await s.keyboard.press("Escape");

    // Po zkoušce, která prošla bez porušení, je most připravený; bez přezdívky se nezapíše.
    prvniOtisk = await zkousej(s);
    expect(prvniOtisk).toMatch(/^[0-9a-f]{16}$/);
    await otevriZebricek(s);
    expect(await udaj(s, "zebricek-hlaseni")).toBe("Most na výkresu prošel zkouškou: můžeš ho zapsat.");
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
    await s.screenshot({ path: `${SLOZKA}/z1-zebricek.png` });
    await s.keyboard.press("Escape");

    // Zkouška do zlomu přidá třetí měřítko.
    await zkousej(s, true);
    await otevriZebricek(s);
    await akce(s, "zebricek-zapsat").click();
    await s.locator('#okno-zebricek[data-stav="zapsano"]').waitFor({ timeout: 60_000 });
    expect(await radky(s, "zlom").count()).toBe(1);
    expect(await udaj(s, "zebricek-hlaseni")).toContain("Únosnost na korunu: jsi 1.");
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
    expect(verejny).toContain(znackaHrace(identita.hrac));
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
    // Dražší most téhož hráče jeho zápis nezhorší a hra to řekne.
    await nactiMost(s, drazsi);
    await zkousej(s);
    await otevriZebricek(s);
    await akce(s, "zebricek-zapsat").click();
    await s.locator('#okno-zebricek[data-stav="zapsano"]').waitFor({ timeout: 60_000 });
    expect(await udaj(s, "zebricek-hlaseni")).toContain("tvůj zapsaný most je pořád lepší");
    expect((await radky(s, "cena").locator(".zebricek__jmeno").allInnerTexts()).map(bezMezer)).toEqual(["Boris", "bAnnab"]);
  }, 400_000);

  it("pískoviště a případy komise žebříček nemají; anglicky a na telefonu se okno vejde", async () => {
    const s = await cistaStranka();
    await s.goto(`${adresa}?sandbox`);
    await s.locator(PLATNO).waitFor();
    expect(await s.locator('.paleta [data-akce="zebricek"]').isVisible()).toBe(false);
    await s.goto(`${adresa}?uroven=9-01`);
    await s.locator(PLATNO).waitFor();
    expect(await s.locator('.paleta [data-akce="zebricek"]').isVisible()).toBe(false);

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

  it("správce vidí zápisy i s mostem a umí smazat nevhodnou přezdívku", async () => {
    const hlavicky = { authorization: `Bearer ${HESLO}` };
    const prehled = (await (await fetch(`${adresa}api/sprava?co=zebricky`, { headers: hlavicky })).json()) as { zebricky: ZebricekProSpravu[] };
    const radek = prehled.zebricky[0]!.radky.find((r) => r.jmeno === "bAnnab" && r.mira === "cena")!;
    expect(radek.zobrazeno).toBe(cenaNavrhu(drazsi));
    const most = (await (await fetch(`${adresa}api/sprava?co=zebricek-most&klic=${encodeURIComponent(prehled.zebricky[0]!.klic)}&most=${radek.most}`, { headers: hlavicky })).json()) as { kod: string };
    expect(most.kod).toBe(zakodujMost(drazsi));
    const smazani = await fetch(`${adresa}api/sprava?co=zebricek-smazat`, { method: "POST", headers: { ...hlavicky, "content-type": "application/json" }, body: JSON.stringify({ znacka: radek.znacka }) });
    expect(((await smazani.json()) as { smazano: number }).smazano).toBe(3);
    expect((await fetch(`${adresa}api/sprava?co=zebricky`)).status).toBe(401);
    const s = await cistaStranka();
    await otevriUroven(s, "1-01");
    await otevriZebricek(s);
    expect((await radky(s, "cena").locator(".zebricek__jmeno").allInnerTexts()).map(bezMezer)).toEqual(["Boris"]);
  }, 120_000);

  it("během práce se žebříčkem prohlížeč nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
