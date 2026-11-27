// Dotykové ovládání výkresu v bezhlavém prohlížeči: jeden prst kreslí, dva prsty posouvají
// a zvětšují, druhý prst rozdělaný tah zruší. Dotyky posílá prohlížeči přímo ladicí protokol,
// takže hra dostává stejné události ukazatele jako na telefonu.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navrhNaText } from "../../src/data/navrh";
import { PRIPADY } from "../../urovne/havarie/index";
import { nactiKampan } from "../../urovne/index";
import { RESENI } from "../../urovne/reseni";
import { prijimejDenik } from "./server-deniku";
import { rozbalPaletu } from "./pomoc";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";

let server: PreviewServer;
let prohlizec: Browser;
let kontext: BrowserContext;
let stranka: Page;
let protokol: CDPSession;
let adresa: string;
const chyby: string[] = [];

interface Prst {
  x: number;
  y: number;
  id: number;
}

const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);
const pocetPrutu = async (): Promise<number> => Number(await telo("pruty"));

/** Pošle prohlížeči stav dotyků: kde jsou prsty, které právě leží na obrazovce. */
async function dotyk(typ: "touchStart" | "touchMove" | "touchEnd", prsty: readonly Prst[]): Promise<void> {
  await protokol.send("Input.dispatchTouchEvent", {
    type: typ,
    touchPoints: prsty.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id })),
  });
}

/** Počká na vykreslení, aby se pohled stihl promítnout do háčků pro testy. */
const snimek = (): Promise<void> =>
  stranka.evaluate(() => new Promise<void>((hotovo) => requestAnimationFrame(() => requestAnimationFrame(() => hotovo()))));

/** Střed a měřítko pohledu (metry, pixely na metr). */
async function kamera(): Promise<{ x: number; y: number; meritko: number }> {
  const zapis = await stranka.locator(PLATNO).getAttribute("data-kamera");
  const [x, y, meritko] = zapis!.split(";").map(Number) as [number, number, number];
  return { x, y, meritko };
}

/** Místo na stránce, kde leží bod světa (metry, y nahoru). */
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

/** Jedním prstem táhne z bodu světa do bodu světa, jako když hráč kreslí prut. */
async function tahniPrstem(a: [number, number], b: [number, number]): Promise<void> {
  const pa = await bodSveta(...a);
  const pb = await bodSveta(...b);
  await dotyk("touchStart", [{ ...pa, id: 1 }]);
  for (let krok = 1; krok <= 4; krok++) {
    await dotyk("touchMove", [{ x: pa.x + ((pb.x - pa.x) * krok) / 4, y: pa.y + ((pb.y - pa.y) * krok) / 4, id: 1 }]);
  }
  await dotyk("touchEnd", []);
  await snimek();
}

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4206, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
  prijimejDenik(server);
  const mistni = server.resolvedUrls?.local[0];
  if (!mistni) throw new Error("Náhledový server neoznámil adresu.");
  adresa = mistni;
  prohlizec = await chromium.launch();
  kontext = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1024, height: 700 }, deviceScaleFactor: 1, hasTouch: true });
  stranka = await kontext.newPage();
  protokol = await kontext.newCDPSession(stranka);
  stranka.on("pageerror", (chyba) => chyby.push(chyba.message));
  stranka.on("console", (zprava) => {
    if (zprava.type() === "error") chyby.push(zprava.text());
  });
});

afterAll(async () => {
  await prohlizec?.close();
  await new Promise<void>((hotovo) => server?.httpServer.close(() => hotovo()));
});

describe("dotykové ovládání výkresu", () => {
  it("tah jedním prstem z kotvy nakreslí mostovku", async () => {
    await stranka.goto(`${adresa}?uroven=1-01`);
    await stranka.locator(PLATNO).waitFor();
    await stranka.locator('#okno-zadani[open] button[value="zavrit"]').click();
    expect(await pocetPrutu()).toBe(0);
    await tahniPrstem([0, 0], [4, 0]);
    expect(await pocetPrutu()).toBe(1);
    await tahniPrstem([4, 0], [8, 0]);
    expect(await pocetPrutu()).toBe(2);
  });

  it("dva prsty od sebe výkres zvětší kolem místa mezi nimi", async () => {
    const pred = await kamera();
    const stred = await bodSveta(4, 0);
    const a = { x: stred.x - 60, y: stred.y, id: 1 };
    const b = { x: stred.x + 60, y: stred.y, id: 2 };
    await dotyk("touchStart", [a]);
    await dotyk("touchStart", [a, b]);
    for (let krok = 1; krok <= 6; krok++) {
      await dotyk("touchMove", [
        { ...a, x: a.x - 10 * krok },
        { ...b, x: b.x + 10 * krok },
      ]);
    }
    await dotyk("touchEnd", []);
    await snimek();
    const po = await kamera();
    // Rozteč 120 px → 240 px: měřítko se zdvojnásobí a bod mezi prsty zůstane na místě.
    expect(po.meritko / pred.meritko).toBeCloseTo(2, 1);
    const stredPo = await bodSveta(4, 0);
    expect(Math.abs(stredPo.x - stred.x)).toBeLessThan(3);
    expect(Math.abs(stredPo.y - stred.y)).toBeLessThan(3);
    // Gesto nic nenakreslilo ani nevybralo.
    expect(await pocetPrutu()).toBe(2);
    await stranka.screenshot({ path: `${SLOZKA}/dotyk-zvetseno.png` });
  });

  it("dva prsty stejným směrem výkres posunou a nic nenakreslí", async () => {
    const pred = await kamera();
    const stred = await bodSveta(4, 0);
    const a = { x: stred.x - 40, y: stred.y - 30, id: 1 };
    const b = { x: stred.x + 40, y: stred.y + 30, id: 2 };
    await dotyk("touchStart", [a, b]);
    for (let krok = 1; krok <= 5; krok++) {
      await dotyk("touchMove", [
        { ...a, x: a.x + 16 * krok, y: a.y + 8 * krok },
        { ...b, x: b.x + 16 * krok, y: b.y + 8 * krok },
      ]);
    }
    await dotyk("touchEnd", []);
    await snimek();
    const po = await kamera();
    expect(po.meritko).toBeCloseTo(pred.meritko, 3);
    // Výkres šel s prsty o 80 px doprava a 40 px dolů: střed pohledu se posunul opačně.
    expect((pred.x - po.x) * po.meritko).toBeCloseTo(80, 0);
    expect((po.y - pred.y) * po.meritko).toBeCloseTo(40, 0);
    expect(await pocetPrutu()).toBe(2);
  });

  it("druhý prst rozdělaný tah zruší a zbylý prst po gestu nekreslí", async () => {
    const pa = await bodSveta(0, 0);
    const pb = await bodSveta(2, 2);
    const prvni = { ...pa, id: 1 };
    await dotyk("touchStart", [prvni]);
    // Prst se rozjel: hra už kreslí prut.
    await dotyk("touchMove", [{ ...prvni, x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }]);
    await dotyk("touchMove", [{ ...prvni, x: pb.x, y: pb.y }]);
    const druhy = { x: pb.x + 120, y: pb.y, id: 2 };
    await dotyk("touchStart", [{ ...prvni, x: pb.x, y: pb.y }, druhy]);
    await dotyk("touchMove", [{ ...prvni, x: pb.x, y: pb.y }, { ...druhy, x: druhy.x + 20 }]);
    // Druhý prst pryč, první ještě drží a hýbe se: nic se kreslit nesmí.
    await dotyk("touchEnd", [{ ...prvni, x: pb.x, y: pb.y }]);
    await dotyk("touchMove", [{ ...prvni, x: pb.x + 30, y: pb.y + 30 }]);
    await dotyk("touchEnd", []);
    await snimek();
    expect(await pocetPrutu()).toBe(2);
    // Další tah jedním prstem zase kreslí.
    await stranka.locator('[data-akce="cely-vykres"]').click();
    await snimek();
    await tahniPrstem([0, 0], [2, 2]);
    expect(await pocetPrutu()).toBe(3);
  });

  it("ťuknutí na prut ho vybere a tlačítko Smazat ho smaže", async () => {
    const smazat = stranka.locator('[data-akce="smazat"]');
    expect(await smazat.isEnabled()).toBe(false);
    const misto = await bodSveta(2, 0);
    await dotyk("touchStart", [{ ...misto, id: 1 }]);
    await dotyk("touchEnd", []);
    await snimek();
    expect(await smazat.isEnabled()).toBe(true);
    await stranka.screenshot({ path: `${SLOZKA}/dotyk-vyber.png` });
    await smazat.tap();
    expect(await pocetPrutu()).toBe(2);
  });

  it("nástroj, který stiskem hned jedná (svar), počká na zvednutí prstu: druhý prst po prodlevě nic nepřepne", async () => {
    await stranka.goto(`${adresa}?uroven=4-02&zaznam=vypnout`);
    await stranka.locator(PLATNO).waitFor();
    await stranka.locator('#okno-zadani[open] button[value="zavrit"]').tap();
    const reseni = RESENI["4-02"]!.pruchod;
    await rozbalPaletu(stranka);
    await stranka.locator('#obrazovka-uroven .paleta [data-akce="import"]').tap();
    await stranka.locator("#okno-obsah").fill(navrhNaText(reseni));
    await stranka.locator('[data-akce="okno-nacist"]').tap();
    await stranka.locator('[data-akce="cely-vykres"]').tap();
    await snimek();
    await stranka.locator('#obrazovka-uroven .paleta [data-pridavek="svar"]').tap();
    const cena = (): Promise<string> => stranka.locator('[data-udaj="rozpocet"]').innerText();
    const pred = await cena();
    // Styčník, do kterého vedou aspoň dva pruty: tam jde svar přepnout.
    const pocty = new Map<number, number>();
    for (const prut of reseni.pruty) for (const id of [prut.a, prut.b]) pocty.set(id, (pocty.get(id) ?? 0) + 1);
    const stycnik = reseni.stycniky.find((st) => (pocty.get(st.id) ?? 0) >= 2)!;
    let misto = await bodSveta(stycnik.x, stycnik.y);

    // Prst na styčníku, po chvíli (déle než prodleva dotyku) druhý prst a posun: gesto, ne svar.
    const kameraPred = await kamera();
    const prvni = { ...misto, id: 1 };
    const druhy = { x: misto.x + 120, y: misto.y + 40, id: 2 };
    await dotyk("touchStart", [prvni]);
    await stranka.waitForTimeout(320);
    await dotyk("touchStart", [prvni, druhy]);
    await dotyk("touchMove", [
      { ...prvni, x: prvni.x + 30 },
      { ...druhy, x: druhy.x + 30 },
    ]);
    await dotyk("touchMove", [
      { ...prvni, x: prvni.x + 60 },
      { ...druhy, x: druhy.x + 60 },
    ]);
    await dotyk("touchEnd", []);
    await snimek();
    expect(await cena()).toBe(pred);
    expect((await kamera()).x).not.toBe(kameraPred.x);

    // Obyčejné ťuknutí svar přepne (cena mostu se změní).
    misto = await bodSveta(stycnik.x, stycnik.y);
    await dotyk("touchStart", [{ ...misto, id: 1 }]);
    await dotyk("touchEnd", []);
    await snimek();
    expect(await cena()).not.toBe(pred);
  }, 60_000);

  it("ve zkušebně jeden prst výkres posouvá", async () => {
    await stranka.goto(`${adresa}zkusebna.html`);
    const platno = stranka.locator("canvas.vykres__platno");
    await platno.waitFor();
    const obrys = (await platno.boundingBox())!;
    // Zkušebna po načtení scény pohled ještě srovná: test na ustálený pohled počká, jinak by
    // pod zátěží stroje změřil místo posunu prstem to srovnání.
    const ustalenyPohled = async (): Promise<string> => {
      let minule = "";
      for (let i = 0; i < 40; i++) {
        const ted = (await platno.getAttribute("data-kamera")) ?? "";
        if (ted !== "" && ted === minule) return ted;
        minule = ted;
        await stranka.waitForTimeout(150);
      }
      return minule;
    };
    const vychozi = await ustalenyPohled();
    // Celý výkres posunout nejde (pohled se drží ve výřezu), proto nejdřív přiblížit.
    await platno.focus();
    await stranka.keyboard.press("+");
    await stranka.keyboard.press("+");
    await stranka.keyboard.press("+");
    await snimek();
    const pred = await ustalenyPohled();
    expect(pred).not.toBe("");
    expect(pred).not.toBe(vychozi);
    const start = { x: obrys.x + obrys.width / 2, y: obrys.y + obrys.height / 2, id: 1 };
    await dotyk("touchStart", [start]);
    await dotyk("touchMove", [{ ...start, x: start.x + 40 }]);
    await dotyk("touchMove", [{ ...start, x: start.x + 80 }]);
    await dotyk("touchEnd", []);
    await snimek();
    // Výkres šel s prstem o 80 px doprava.
    const [xPred, , meritko] = pred!.split(";").map(Number) as [number, number, number];
    const [xPo] = (await platno.getAttribute("data-kamera"))!.split(";").map(Number) as [number];
    expect((xPred - xPo) * meritko).toBeCloseTo(80, 0);
  });

  it("na telefonu na výšku je výkres nahoře, paleta dole a nic nepřetéká", async () => {
    const telefon = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    const s = await telefon.newPage();
    s.on("pageerror", (chyba) => chyby.push(chyba.message));
    /** Obrys prvku a jestli leží celý v okně. */
    const vOkne = async (selektor: string): Promise<boolean> => {
      const o = await s.locator(selektor).boundingBox();
      return o !== null && o.x >= 0 && o.y >= 0 && o.x + o.width <= 390.5 && o.y + o.height <= 844.5;
    };
    const pretika = (): Promise<boolean> => s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

    await s.goto(adresa);
    await s.locator(".karta").first().waitFor();
    expect(await pretika()).toBe(false);
    expect(await vOkne('#obrazovka-prehled [data-akce="jazyk"]')).toBe(true);

    await s.goto(`${adresa}?uroven=1-01`);
    await s.locator(PLATNO).waitFor();
    await s.locator('#okno-zadani[open] button[value="zavrit"]').tap();
    expect(await pretika()).toBe(false);
    expect(await vOkne('#obrazovka-uroven [data-akce="zkouska"]')).toBe(true);
    expect(await vOkne('#obrazovka-uroven [data-akce="cely-vykres"]')).toBe(true);
    const platno = (await s.locator(PLATNO).boundingBox())!;
    const paleta = (await s.locator("#obrazovka-uroven .paleta").boundingBox())!;
    expect(platno.width).toBeGreaterThan(380);
    expect(platno.height).toBeGreaterThan(300);
    expect(paleta.y).toBeGreaterThanOrEqual(platno.y + platno.height - 1);
    expect(paleta.width).toBeGreaterThan(380);
    await s.screenshot({ path: `${SLOZKA}/telefon-stavba.png` });

    // Zkouška: paleta ustoupí, táhlo času i výsledek se vejdou do okna.
    await rozbalPaletu(s);
    await s.locator('#obrazovka-uroven .paleta [data-akce="import"]').tap();
    await s.locator("#okno-obsah").fill(navrhNaText(RESENI["1-01"]!.pruchod));
    await s.locator('[data-akce="okno-nacist"]').tap();
    await s.locator('#obrazovka-uroven [data-akce="zkouska"]').tap();
    await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    expect(await s.locator("#obrazovka-uroven .paleta").isVisible()).toBe(false);
    expect(await vOkne("#cas")).toBe(true);
    await s.locator('[data-akce="na-konec"]').tap();
    await s.locator(".vysledek").waitFor({ state: "visible" });
    expect(await vOkne(".vysledek")).toBe(true);
    expect(await pretika()).toBe(false);
    await s.screenshot({ path: `${SLOZKA}/telefon-vysledek.png` });
    await telefon.close();
  }, 200_000);

  it("tablet na výšku: cíle v patičce přehledu na prst, popisky nástrojů do sebe nenarážejí a lišta říká, kde hráč je", async () => {
    const tablet = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const s = await tablet.newPage();
    s.on("pageerror", (chyba) => chyby.push(chyba.message));
    try {
      await s.goto(adresa);
      await s.locator(".karta").first().waitFor();
      // Nový hráč vidí zúžený přehled; odkaz „Celá kampaň“ je cíl pro prst jako ostatní.
      const cela = s.locator('[data-akce="prehled-cela"]');
      expect((await cela.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await cela.tap();
      // Zaškrtávátko záznamu hraní (cílem je celý řádek s popiskem) a odkazy v patičce: aspoň 44 px.
      const volba = (await s.locator("label.prehled__volba:has(#zaznam-hrani)").boundingBox())!;
      expect(volba.height).toBeGreaterThanOrEqual(44);
      for (const odkaz of await s.locator(".prehled__verze a").all()) {
        if (!(await odkaz.isVisible())) continue;
        expect((await odkaz.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }

      await s.goto(`${adresa}?uroven=1-01`);
      await s.locator(PLATNO).waitFor();
      await s.locator('#okno-zadani[open] button[value="zavrit"]').tap();
      // Lišta říká, ve které úrovni hráč je, i když se celý název nevejde.
      const cislo = s.locator('[data-udaj="uroven-id"]');
      expect(await cislo.isVisible()).toBe(true);
      expect(await cislo.innerText()).toBe("1-01");
      // Popisky nástrojů se vejdou do tlačítek a sousední tlačítka se nepřekrývají.
      const nastroje = await s.locator("#obrazovka-uroven .paleta__nastroje .paleta__tlacitko").all();
      expect(nastroje.length).toBeGreaterThanOrEqual(4);
      for (const tlacitko of nastroje) {
        const pretece = await tlacitko.evaluate((u) => u.scrollWidth > u.clientWidth + 1);
        expect(pretece, await tlacitko.innerText()).toBe(false);
      }
      const misto = async (akce: string) => (await s.locator(`#obrazovka-uroven .paleta [data-akce="${akce}"]`).boundingBox())!;
      const zpet = await misto("zpet");
      expect(zpet.x + zpet.width).toBeLessThanOrEqual((await misto("znovu")).x);
      // Zrcadlit a Vše pryč jsou v první kapitole pod „Více“ ve vlastní dvojici.
      await rozbalPaletu(s);
      const zrcadlit = await misto("zrcadlit");
      expect(zrcadlit.x + zrcadlit.width).toBeLessThanOrEqual((await misto("smazat-vse")).x);
      // Nevysvětlené bílé pruhy (ukázka tloušťky čáry) v úzké paletě nejsou.
      expect(await s.locator("#obrazovka-uroven .paleta__ukazka").first().isVisible()).toBe(false);
      await s.screenshot({ path: `${SLOZKA}/tablet-stavba.png` });

      // Vše pryč: most zmizí a hlášení řekne, jak ho vrátit; Zpět ho vrátí.
      await rozbalPaletu(s);
      await s.locator('#obrazovka-uroven .paleta [data-akce="import"]').tap();
      await s.locator("#okno-obsah").fill(navrhNaText(RESENI["1-01"]!.pruchod));
      await s.locator('[data-akce="okno-nacist"]').tap();
      const pocet = await s.locator("body").getAttribute("data-pruty");
      expect(Number(pocet)).toBeGreaterThan(0);
      await rozbalPaletu(s);
      await s.locator('#obrazovka-uroven .paleta [data-akce="smazat-vse"]').tap();
      expect(await s.locator("body").getAttribute("data-pruty")).toBe("0");
      expect(await s.locator('[data-udaj="hlaseni"]').innerText()).toContain("Zpět");
      await s.screenshot({ path: `${SLOZKA}/tablet-vse-pryc.png` });
      await s.locator('#obrazovka-uroven .paleta [data-akce="zpet"]').tap();
      expect(await s.locator("body").getAttribute("data-pruty")).toBe(pocet);
    } finally {
      await tablet.close();
    }
  }, 120_000);

  it("na telefonu a tabletu se žádná úroveň ani pískoviště nerozlije do šířky, česky ani anglicky", async () => {
    // Úrovně kampaně, pískoviště a případy Havarijní komise (ty mají navíc pruh se změnami).
    const urovne = [...nactiKampan().map((u) => `?uroven=${u.id}`), "?sandbox", ...PRIPADY.map((p) => `?uroven=${p.uroven.id}`)];
    const preteklo: string[] = [];
    for (const okno of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
    ]) {
      const k = await prohlizec.newContext({ locale: "cs-CZ", viewport: okno, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
      const s = await k.newPage();
      s.on("pageerror", (chyba) => chyby.push(chyba.message));
      for (const jazyk of ["cs", "en"]) {
        for (const uroven of urovne) {
          await s.goto(`${adresa}${uroven}&jazyk=${jazyk}&zaznam=vypnout`);
          await s.locator(PLATNO).waitFor();
          const sirka = (): Promise<number> => s.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          // Se zadáním i bez něj; tlačítko zadání musí být v okně, jinak ho hráč nezavře.
          const zavrit = s.locator('#okno-zadani[open] button[value="zavrit"]');
          if ((await zavrit.count()) > 0) {
            const o = (await zavrit.boundingBox())!;
            if ((await sirka()) > 0 || o.x < 0 || o.x + o.width > okno.width + 0.5 || o.y + o.height > okno.height + 0.5) {
              preteklo.push(`${okno.width} ${jazyk} ${uroven} (zadání)`);
            }
            await zavrit.tap();
          }
          if ((await sirka()) > 0) preteklo.push(`${okno.width} ${jazyk} ${uroven}`);
          const platno = (await s.locator(PLATNO).boundingBox())!;
          // Na telefonu musí výkresu zbýt aspoň třetina výšky obrazovky.
          if (platno.height < okno.height / 3) preteklo.push(`${okno.width} ${jazyk} ${uroven}: výkres jen ${Math.round(platno.height)} px`);
        }
      }
      await k.close();
    }
    expect(preteklo).toEqual([]);
  }, 300_000);

  it("telefon: výsledek je pruh s podrobnostmi na rozkliknutí a Zpět i Smazat jsou v liště", async () => {
    const telefon = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const s = await telefon.newPage();
    s.on("pageerror", (chyba) => chyby.push(chyba.message));
    await s.goto(`${adresa}?uroven=1-01&zaznam=vypnout`);
    await s.locator(PLATNO).waitFor();
    // Návod k ovládání (sbalený) mluví o prstech, ne o myši a mezerníku.
    await s.locator('#okno-zadani details[data-cast="zadani-ovladani"] > summary').tap();
    expect(await s.locator('[data-udaj="zadani-ovladani"]').isVisible()).toBe(true);
    expect(await s.locator('[data-udaj="zadani-ovladani"]').innerText()).toContain("tažením prstu");
    await s.locator('#okno-zadani[open] button[value="zavrit"]').tap();
    const zpet = s.locator('#obrazovka-uroven .lista [data-akce="zpet-rychle"]');
    const smazat = s.locator('#obrazovka-uroven .lista [data-akce="smazat-rychle"]');
    expect(await zpet.isVisible()).toBe(true);
    expect(await smazat.isVisible()).toBe(true);
    expect(await zpet.isEnabled()).toBe(false);
    // Referenční most: zkouškou projde a výsledek se ukáže na konci přehrávání.
    await rozbalPaletu(s);
    await s.locator('#obrazovka-uroven .paleta [data-akce="import"]').tap();
    await s.locator("#okno-obsah").fill(navrhNaText(RESENI["1-01"]!.pruchod));
    await s.locator('[data-akce="okno-nacist"]').tap();
    expect(await zpet.isEnabled()).toBe(true);
    await s.locator('#obrazovka-uroven [data-akce="zkouska"]').tap();
    await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    await s.locator('[data-akce="na-konec"]').tap();
    const vysledek = s.locator(".vysledek");
    await vysledek.waitFor({ state: "visible" });
    // Výsledek je pruh nahoře (verdikt, věta, medaile, hlavní tlačítka): most pod ním je vidět.
    expect(await vysledek.getAttribute("data-sbaleno")).toBe("ano");
    const pruh = (await vysledek.boundingBox())!;
    const platno = (await s.locator(PLATNO).boundingBox())!;
    expect(pruh.height).toBeLessThan(platno.height / 2);
    expect(await s.locator('[data-udaj="vysledek-nadpis"]').isVisible()).toBe(true);
    expect(await s.locator('[data-akce="upravit"]').isVisible()).toBe(true);
    expect(await s.locator('[data-akce="dalsi"]').isVisible()).toBe(true);
    expect(await s.locator('[data-udaj="vysledek-shrnuti"]').isVisible()).toBe(false);
    await s.screenshot({ path: `${SLOZKA}/telefon-vysledek-sbaleny.png` });
    // Podrobnosti se rozbalí tlačítkem v pruhu a zase zavřou.
    await s.locator('[data-akce="vysledek-sbalit"]').tap();
    expect(await vysledek.getAttribute("data-sbaleno")).toBe("ne");
    expect(await s.locator('[data-udaj="vysledek-shrnuti"]').isVisible()).toBe(true);
    const cely = (await vysledek.boundingBox())!;
    expect(cely.height).toBeGreaterThan(pruh.height);
    // Krok zpět v čase podrobnosti zavře: je vidět most.
    await s.locator('[data-akce="krok-zpet"]').tap();
    expect(await vysledek.getAttribute("data-sbaleno")).toBe("ano");
    await s.locator('[data-akce="vysledek-sbalit"]').tap();
    expect(await vysledek.getAttribute("data-sbaleno")).toBe("ne");
    await s.locator('[data-akce="vysledek-sbalit"]').tap();
    expect(await vysledek.getAttribute("data-sbaleno")).toBe("ano");
    expect(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await telefon.close();
  }, 200_000);

  it("telefon: části zadání, slovníček a legenda osy jsou na prst a slovníček jde zavřít bez rolování", async () => {
    const telefon = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const s = await telefon.newPage();
    s.on("pageerror", (chyba) => chyby.push(chyba.message));
    await s.goto(`${adresa}?uroven=2-01&zaznam=vypnout`);
    await s.locator(PLATNO).waitFor();
    expect(await s.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true);
    const vyska = async (vyber: string): Promise<number> => (await s.locator(vyber).first().boundingBox())!.height;
    const naObrazovce = async (vyber: string): Promise<boolean> => {
      const o = await s.locator(vyber).first().boundingBox();
      return o !== null && o.x >= 0 && o.y >= 0 && o.x + o.width <= 390.5 && o.y + o.height <= 844.5;
    };
    // Zadání: sbalené části se rozbalují řádkem vysokým aspoň na prst.
    expect(await vyska("#okno-zadani details.okno__vice > summary")).toBeGreaterThanOrEqual(44);
    // Pojem v zadání (tady v popisku ukázky: „prutů“): ťuknutí ukáže bublinu celou na obrazovce.
    await s.locator('#okno-zadani [data-udaj="ukazka-popis"] .pojem').first().tap();
    await s.locator("#pojem-bublina:popover-open").waitFor();
    expect(await naObrazovce("#pojem-bublina")).toBe(true);
    await s.keyboard.press("Escape");
    await s.locator('#okno-zadani[open] button[value="zavrit"]').tap();
    // Odkazy pod zadáním v paletě a otazník osy frekvencí.
    for (const akce of ["zadani-cele", "pojmy"]) {
      await s.locator(`[data-akce="${akce}"]`).scrollIntoViewIfNeeded();
      expect(await vyska(`[data-akce="${akce}"]`), akce).toBeGreaterThanOrEqual(44);
    }
    const otaznik = (await s.locator('[data-akce="osa-legenda"]').boundingBox())!;
    expect(Math.min(otaznik.width, otaznik.height)).toBeGreaterThanOrEqual(44);
    await s.locator('[data-akce="osa-legenda"]').tap();
    await s.locator("#pojem-bublina:popover-open").waitFor();
    expect(await s.locator('[data-udaj="pojem-text"]').innerText()).toContain("Plná čára: rytmus kroku lidí.");
    expect(await naObrazovce("#pojem-bublina")).toBe(true);
    await s.keyboard.press("Escape");
    // Celý slovníček je delší než obrazovka: Zavřít drží dole na očích a zavře i ťuknutí vedle okna.
    await rozbalPaletu(s);
    await s.locator('[data-akce="pojmy"]').tap();
    await s.locator("#okno-pojmy[open]").waitFor();
    expect(await s.locator("#okno-pojmy dt").count()).toBe(22);
    expect(await naObrazovce('#okno-pojmy button[value="zavrit"]')).toBe(true);
    await s.screenshot({ path: `${SLOZKA}/telefon-slovnicek.png` });
    await s.locator('#okno-pojmy button[value="zavrit"]').tap();
    expect(await s.locator("#okno-pojmy[open]").count()).toBe(0);
    await rozbalPaletu(s);
    await s.locator('[data-akce="pojmy"]').tap();
    await s.locator("#okno-pojmy[open]").waitFor();
    const okno = (await s.locator("#okno-pojmy").boundingBox())!;
    // Vedle okna je ztmavené pozadí: nahoře nebo dole, kde okno není.
    await s.touchscreen.tap(195, okno.y > 20 ? okno.y / 2 : okno.y + okno.height + (844 - okno.y - okno.height) / 2);
    await expect.poll(() => s.locator("#okno-pojmy[open]").count()).toBe(0);
    expect(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await telefon.close();
  }, 120_000);

  it("v okně širokém 1000 px se do lišty vejdou všechna tlačítka a táhlo času neuteče", async () => {
    const uzke = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
    const s = await uzke.newPage();
    s.on("pageerror", (chyba) => chyby.push(chyba.message));
    const pravyOkraj = async (selektor: string): Promise<number> => {
      const o = (await s.locator(selektor).boundingBox())!;
      return o.x + o.width;
    };
    await s.goto(`${adresa}?uroven=1-01`);
    await s.locator(PLATNO).waitFor();
    await s.locator('#okno-zadani[open] button[value="zavrit"]').click();
    expect(await pravyOkraj('#obrazovka-uroven [data-akce="cely-vykres"]')).toBeLessThanOrEqual(1000);
    await rozbalPaletu(s);
    await s.locator('#obrazovka-uroven .paleta [data-akce="import"]').click();
    await s.locator("#okno-obsah").fill(navrhNaText(RESENI["1-01"]!.pruchod));
    await s.locator('[data-akce="okno-nacist"]').click();
    await s.locator(PLATNO).focus();
    await s.keyboard.press("Space");
    await s.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
    // „Zpět ke stavbě“ je delší než „Zkouška“: lišta se musí vejít i teď.
    expect(await pravyOkraj('#obrazovka-uroven [data-akce="cely-vykres"]')).toBeLessThanOrEqual(1000);
    expect(await pravyOkraj("#cas")).toBeLessThanOrEqual(1000);
    expect(await pravyOkraj('[data-udaj="cas"]')).toBeLessThanOrEqual(1000);
    expect(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await uzke.close();
  }, 200_000);

  it("v nízkém okně jsou nastavení svaru a zámku vybraného styčníku pod sebou, ne přes sebe", async () => {
    const nizke = await prohlizec.newContext({ locale: "cs-CZ", viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 });
    const s = await nizke.newPage();
    s.on("pageerror", (chyba) => chyby.push(chyba.message));
    await s.goto(`${adresa}?uroven=7-01&zaznam=vypnout`);
    await s.locator(PLATNO).waitFor();
    await s.locator('#okno-zadani[open] button[value="zavrit"]').click();
    const reseni = RESENI["7-01"]!.pruchod;
    await rozbalPaletu(s);
    await s.locator('#obrazovka-uroven .paleta [data-akce="import"]').click();
    await s.locator("#okno-obsah").fill(navrhNaText(reseni));
    await s.locator('[data-akce="okno-nacist"]').click();
    await s.locator('[data-akce="cely-vykres"]').click();
    await s.locator('#obrazovka-uroven .paleta [data-akce="vyber"]').click();
    const svar = s.locator('#obrazovka-uroven [data-nastaveni="svar"]');
    const zamek = s.locator('#obrazovka-uroven [data-nastaveni="zamek"]');
    // Svařený styčník, který smí dostat i zámek: ukáže obě nastavení najednou.
    let oba = false;
    for (const st of reseni.stycniky.filter((k) => k.svar)) {
      const misto = await s.evaluate(
        ([sx, sy]) => {
          const platno = document.querySelector<HTMLCanvasElement>("#obrazovka-uroven canvas.vykres__platno")!;
          const [kx, ky, m] = platno.dataset.kamera!.split(";").map(Number) as [number, number, number];
          const o = platno.getBoundingClientRect();
          return { x: o.left + o.width / 2 + (sx! - kx) * m, y: o.top + o.height / 2 - (sy! - ky) * m };
        },
        [st.x, st.y],
      );
      await s.mouse.click(misto.x, misto.y);
      if ((await svar.isVisible()) && (await zamek.isVisible())) {
        oba = true;
        break;
      }
    }
    expect(oba).toBe(true);
    const a = (await svar.boundingBox())!;
    const b = (await zamek.boundingBox())!;
    // Leží pod sebou a oba celé v okně: jedno nezakrývá druhé.
    expect(Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)).toBeLessThanOrEqual(0.5);
    for (const o of [a, b]) {
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.y + o.height).toBeLessThanOrEqual(700.5);
    }
    expect(await s.locator('[data-akce="svar-prepnout"]').isVisible()).toBe(true);
    expect(await s.locator('[data-akce="zamek-prepnout"]').isVisible()).toBe(true);
    await s.screenshot({ path: `${SLOZKA}/nizke-okno-svar-a-zamek.png` });
    await nizke.close();
  }, 60_000);

  it("prohlížeč při dotykovém ovládání nehlásil žádnou chybu", () => {
    expect(chyby).toEqual([]);
  });
});
