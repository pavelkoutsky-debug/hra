// Milník M11 v bezhlavém prohlížeči: osa frekvencí se všemi složkami kroku, ladění tlumiče,
// kmitání při zkoušce (hlášení, příčina, zvětšený pohyb), nápověda po krocích a čitelnost stavby.
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";
import { preview, type PreviewServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Kreslic } from "../../src/data/kreslic";
import { navrhNaText, type NavrhMostu } from "../../src/data/navrh";
import { RESENI } from "../../urovne/reseni";
import { prijimejDenik } from "./server-deniku";
import { rozbalPaletu } from "./pomoc";

const SLOZKA = process.env.MM_SNIMKY ?? new URL("./vystup/", import.meta.url).pathname;
const PLATNO = "#obrazovka-uroven canvas.vykres__platno";

let server: PreviewServer;
let prohlizec: Browser;
let stranka: Page;
let adresa: string;
const chyby: string[] = [];

const udaj = (jmeno: string): Promise<string> => stranka.locator(`[data-udaj="${jmeno}"]`).innerText();
const akce = (jmeno: string) => stranka.locator(`[data-akce="${jmeno}"]`);
const telo = (atribut: string): Promise<string | null> => stranka.locator("body").getAttribute(`data-${atribut}`);
const osa = () => stranka.locator('[data-udaj="osa-frekvenci"]');
const bezMezer = (text: string): string => text.replace(/[  ]/g, " ");

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

async function klikni(x: number, y: number): Promise<void> {
  const p = await bodSveta(x, y);
  await stranka.mouse.click(p.x, p.y);
}

async function otevri(id: string): Promise<void> {
  await stranka.goto(`${adresa}?uroven=${id}&vyvoj=1`);
  await stranka.locator(PLATNO).waitFor();
  const tlacitko = stranka.locator('#okno-zadani[open] button[value="zavrit"]');
  if ((await tlacitko.count()) > 0) await tlacitko.click();
}

async function nactiMost(navrh: NavrhMostu): Promise<void> {
  await rozbalPaletu(stranka);
  await akce("import").click();
  await stranka.locator("#okno-obsah").fill(navrhNaText(navrh));
  await akce("okno-nacist").click();
  // Rozbor běží v pomocném vlákně: osa na něj čeká.
  await expect.poll(() => udaj("frekvence-popis").catch(() => ""), { timeout: 15_000 }).not.toBe("počítá se…");
}

async function pust(): Promise<void> {
  await stranka.locator(PLATNO).focus();
  await stranka.keyboard.press("Space");
  expect(await telo("rezim")).toBe("zkouska");
}

async function dopocitej(): Promise<void> {
  await stranka.locator('body[data-zkouska="hotovo"], body[data-zkouska="chyba"]').waitFor({ timeout: 150_000 });
  expect(await telo("zkouska")).toBe("hotovo");
}

async function naKonec(): Promise<string> {
  await akce("na-konec").click();
  await stranka.locator(".vysledek").waitFor({ state: "visible" });
  return udaj("vysledek-nadpis");
}

async function rozbalVysledek(): Promise<void> {
  if ((await stranka.locator(".vysledek").getAttribute("data-sbaleno")) === "true") await akce("vysledek-sbalit").click();
}

const cas = async (): Promise<number> => Number(await stranka.locator("#cas").inputValue());
const pad = (uroven: string, cast: string): NavrhMostu => RESENI[uroven]!.pady.find((p) => p.nazev.includes(cast))!.navrh;

beforeAll(async () => {
  mkdirSync(SLOZKA, { recursive: true });
  server = await preview({ preview: { port: 4208, strictPort: false, host: "127.0.0.1" }, logLevel: "silent" });
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

describe("osa frekvencí", () => {
  it("ukazuje krok i jeho násobky a odhad kmitání: kolik, kdo ho působí a co by pomohlo", async () => {
    await otevri("2-02");
    await nactiMost(pad("2-02", "dvojnásobku"));
    // Dvoumetrovou příhradu trefí dvojnásobek kroku běžců: odhad je vysoko nad mezí.
    expect(await osa().getAttribute("data-stav")).toBe("nad-mezi");
    expect(await osa().getAttribute("data-hlavni")).toBe("utvar;2;3");
    expect(Number(await osa().getAttribute("data-odhad"))).toBeGreaterThan(1.25 * 2.5);
    expect(await osa().getAttribute("data-zkouska")).toBeNull();
    const titulek = bezMezer((await stranka.locator('[data-udaj="frekvence-popis"]').getAttribute("title")) ?? "");
    expect(titulek).toMatch(/^Most sám kmitá na 6,\d\d Hz/);
    expect(titulek).toMatch(/Běžci v taktu \(4\), krok 3,0 Hz: odhad \d,\d m\/s²/);
    expect(titulek).toContain("O mostě rozhoduje zkouška.");
    expect(titulek).toContain("Mistrovská medaile:");
    // Celá věta je v bublině; na liště je vidět aspoň její začátek (dva řádky).
    expect(bezMezer(await stranka.locator('[data-udaj="frekvence-popis"]').evaluate((uzel) => uzel.textContent ?? ""))).toMatch(
      /^Odhad kmitání \d,\d m\/s², mez je 2,5: běžci v taktu, dvojnásobek kroku 3,0 Hz\. Pomohl by (výrazně )?tužší most \([^)]+\)\.$/,
    );
    // Značky: krok, dvojnásobek a trojnásobek; běh je silný; most má trojúhelník prázdný i s lidmi.
    const znacky = osa().locator(".frekvence__znacky");
    expect(await znacky.locator('.frekvence__krok[data-nasobek="1"]').count()).toBe(2);
    expect(await znacky.locator(".frekvence__krok--dvojnasobek").count()).toBe(2);
    expect(await znacky.locator(".frekvence__krok--trojnasobek").count()).toBe(1);
    expect(await znacky.locator(".frekvence__krok--silna").count()).toBe(2);
    expect(await znacky.locator(".frekvence__most:not(.frekvence__most--obsazeny)").count()).toBeGreaterThanOrEqual(1);
    expect(await znacky.locator(".frekvence__most--obsazeny").count()).toBeGreaterThanOrEqual(1);
    // Složka, o které věta mluví, je na ose zvýrazněná.
    expect(await znacky.locator(".frekvence__krok--hlavni").count()).toBe(1);
    expect(await znacky.locator(".frekvence__krok--hlavni").getAttribute("data-slozka")).toBe("utvar;3;2");
    // Bublina značky říká, kdo tak jde a jak silně.
    expect(bezMezer((await znacky.locator(".frekvence__krok--dvojnasobek.frekvence__krok--silna").getAttribute("title")) ?? "")).toBe(
      "běžci v taktu: dvojnásobek kroku 3,0 Hz (6,0 Hz), síla 67 % váhy člověka",
    );
    // Osa sahá za nejvyšší složku kroku (6 Hz), ne dál než je třeba.
    expect(await znacky.locator(".frekvence__dilek span").last().innerText()).toBe("7");
    // Jízdní řád vedle osy nezmizel.
    const rad = (await stranka.locator(".osa__rad").boundingBox())!;
    expect(rad.width).toBeGreaterThanOrEqual(190);
    expect(await stranka.locator(".osa__polozka").first().isVisible()).toBe(true);
    await stranka.locator(".osa").screenshot({ path: `${SLOZKA}/k1-osa-nad-mezi.png` });
  });

  it("most těsně u meze dostane žlutou a upozornění, že rozhodne zkouška", async () => {
    // Most pro medaili za rozpočet je k mezi nejblíž (zkouška 2,06 m/s²).
    await nactiMost(RESENI["2-02"]!.rozpocet);
    expect(await osa().getAttribute("data-stav")).toBe("u-meze");
    const odhad = Number(await osa().getAttribute("data-odhad"));
    expect(odhad).toBeGreaterThan(0.75 * 2.5);
    expect(odhad).toBeLessThan(1.25 * 2.5);
    expect(bezMezer(await stranka.locator('[data-udaj="frekvence-popis"]').evaluate((uzel) => uzel.textContent ?? ""))).toMatch(
      /^Odhad kmitání \d,\d m\/s², u meze 2,5 \(rozhodne zkouška\): běžci v taktu, dvojnásobek kroku 3,0 Hz\./,
    );
    await stranka.locator(".osa").screenshot({ path: `${SLOZKA}/k2-osa-u-meze.png` });
  });

  it("klidný most má odhad hluboko pod mezí a žádnou radu", async () => {
    await nactiMost(RESENI["2-02"]!.mistrovska);
    expect(await osa().getAttribute("data-stav")).toBe("klid");
    expect(Number(await osa().getAttribute("data-odhad"))).toBeLessThan(1);
    expect(bezMezer(await udaj("frekvence-popis"))).toMatch(/^odhad kmitání 0,\d\d m\/s² \(mez 2,5\): nejvíc běžci v taktu, (dvojnásobek kroku|krok) 3,0 Hz$/);
    // Most pro mistrovskou má první vlastní frekvenci 4,6 Hz, na ose: šipka u okraje není.
    expect(await osa().locator(".frekvence__mimo").count()).toBe(0);

    // Vysoká příhrada s krátkými poli (tři metry nad mostovkou, pole po dvou metrech) je tak
    // tuhá, že její první vlastní frekvence leží za koncem osy: zastupuje ji šipka u pravého okraje.
    const k = new Kreslic("2-02");
    const O = "ocel-lehka" as const;
    for (let x = 0; x < 28; x += 2) k.prut("mostovka-drevo", [x, 0], [x + 2, 0]);
    const horni = Array.from({ length: 13 }, (_, i) => [2 * (i + 1), 3] as [number, number]);
    k.prut(O, [0, 0], horni[0]!);
    k.prut(O, horni.at(-1)!, [28, 0]);
    for (let i = 0; i + 1 < horni.length; i++) k.prut(O, horni[i]!, horni[i + 1]!);
    for (const [x, y] of horni) k.prut(O, [x, 0], [x, y]);
    for (let i = 0; i + 1 < horni.length; i++) {
      const kStredu = horni[i]![0] < 14;
      k.prut(O, kStredu ? horni[i]! : [horni[i]![0], 0], kStredu ? [horni[i + 1]![0], 0] : horni[i + 1]!);
    }
    await nactiMost(k.navrh());
    expect(await osa().getAttribute("data-stav")).toBe("klid");
    expect(await osa().locator(".frekvence__mimo").count()).toBe(1);
    expect(bezMezer((await osa().locator(".frekvence__mimo").getAttribute("title")) ?? "")).toMatch(/^1\. vlastní frekvence mostu je 7,\d\d Hz, za koncem osy \(7 Hz\)$/);
  });
});

describe("kmitání při zkoušce", () => {
  it("když kmitání přesáhne mez, hra to řekne hned a výsledek nečeká na konec osy", async () => {
    await nactiMost(pad("2-02", "dvojnásobku"));
    await pust();
    await dopocitej();
    await stranka.locator('[data-rychlost="4"]').click();
    await stranka.locator("body[data-kmitani-nad-mez]").waitFor({ timeout: 60_000 });
    expect(await udaj("hlaseni")).toBe("Kmitání přesáhlo 2,5 m/s²: takhle most lidem nevyhoví.");
    const prekroceno = Number(await telo("kmitani-nad-mez"));
    await stranka.locator(".vysledek").waitFor({ state: "visible", timeout: 30_000 });
    const trvani = Number(await stranka.locator("#cas").getAttribute("max"));
    const ukazano = await cas();
    expect(ukazano).toBeGreaterThanOrEqual(prekroceno + 3 - 0.05);
    expect(ukazano).toBeLessThan(trvani - 5);
    expect(await udaj("vysledek-nadpis")).toBe("MOST NEOBSTÁL");
    await stranka.screenshot({ path: `${SLOZKA}/k3-kmitani-vysledek.png` });
  });

  it("výsledek jmenuje rytmus, který most rozhoupal, a vlastní frekvenci vedle něj", async () => {
    expect(await telo("kmitani-rytmus")).toBe("utvar;2;3");
    expect(Number(await telo("kmitani-frekvence"))).toBeGreaterThan(5.8);
    expect(Number(await telo("kmitani-frekvence"))).toBeLessThan(6.2);
    expect(bezMezer((await telo("pricina")) ?? "")).toMatch(/^Kmitání \d,\d\d m\/s² \(mez 2,5\)\. Příčina: běžci v taktu, dvojnásobek kroku 3,0 Hz\.$/);
    expect(bezMezer(await stranka.locator('[data-udaj="vysledek-veta"]').evaluate((uzel) => uzel.textContent ?? ""))).toMatch(
      /^Přešli všichni \(6\)\. Kmitání \d,\d\d m\/s² \(mez 2,5\)\. Příčina: běžci v taktu, dvojnásobek kroku 3,0 Hz\.$/,
    );
    await rozbalVysledek();
    const shrnuti = bezMezer(await udaj("vysledek-shrnuti"));
    expect(shrnuti).toContain("Most rozkmital krok lidí: běžci v taktu, dvojnásobek kroku 3,0 Hz (tedy 6,0 Hz).");
    expect(shrnuti).toMatch(/Trefuje se do 1\. vlastní frekvence mostu \(6,\d\d Hz(, s lidmi 6,\d\d Hz)?\)\./);
    // Rada říká směr, který rozbor spočítal, a nic, co úroveň nenabízí (závaží, tlumič).
    expect(shrnuti).toMatch(/Pomohl by (výrazně )?tužší most \([^)]+\)\./);
    expect(shrnuti.toLowerCase()).not.toContain("závaží");
    expect(shrnuti.toLowerCase()).not.toContain("tlumič");
    expect(await udaj("vysledek-kmitani")).toContain("nejvíc na 6,0 Hz (běžci v taktu, dvojnásobek kroku 3,0 Hz)");
    await stranka.screenshot({ path: `${SLOZKA}/k4-kmitani-podrobnosti.png` });
  });

  it("pohyb celého mostu se kreslí zvětšený; popisek v legendě je vypínač a volba se pamatuje", async () => {
    const nasobek = Number(await telo("zvetseni"));
    expect(nasobek).toBeGreaterThanOrEqual(10);
    const tlacitko = akce("zvetseni");
    expect(await tlacitko.isVisible()).toBe(true);
    expect(await tlacitko.getAttribute("aria-pressed")).toBe("true");
    expect(bezMezer(await tlacitko.innerText())).toBe(`pohyb ${nasobek}×`);
    await akce("prehrat-znovu").click();
    await expect.poll(cas, { timeout: 20_000 }).toBeGreaterThan(1.5);
    await stranka.screenshot({ path: `${SLOZKA}/k5-zvetseny-pohyb.png` });
    await tlacitko.click();
    expect(await telo("zvetseni")).toBe("1");
    expect(await tlacitko.getAttribute("aria-pressed")).toBe("false");
    expect(bezMezer(await tlacitko.innerText())).toBe("pohyb 1×");
    // Volba platí i pro další zkoušku.
    await stranka.keyboard.press("Escape");
    await pust();
    await dopocitej();
    await naKonec();
    expect(await telo("zvetseni")).toBe("1");
    expect(await tlacitko.getAttribute("aria-pressed")).toBe("false");
    await tlacitko.click();
    expect(Number(await telo("zvetseni"))).toBe(nasobek);
    await akce("upravit").click();
    // Při stavbě tlačítko není.
    expect(await tlacitko.isVisible()).toBe(false);
  });

  it("po zkoušce osa u téhož mostu ukáže, co zkouška naměřila; po úpravě mostu zase odhad", async () => {
    expect(await osa().getAttribute("data-stav")).toBe("nad-mezi");
    const zmereno = Number(await osa().getAttribute("data-zkouska"));
    expect(zmereno).toBeGreaterThan(2.5);
    expect(bezMezer(await stranka.locator('[data-udaj="frekvence-popis"]').evaluate((uzel) => uzel.textContent ?? ""))).toMatch(
      /^Zkouška: kmitání \d,\d\d m\/s², mez 2,5: běžci v taktu, dvojnásobek kroku 3,0 Hz\./,
    );
    expect(bezMezer((await stranka.locator('[data-udaj="frekvence-popis"]').getAttribute("title")) ?? "")).toMatch(/Zkouška tohoto mostu naměřila \d,\d\d m\/s²; odhad byl \d,\d\./);
    await stranka.locator(".osa").screenshot({ path: `${SLOZKA}/k5b-osa-po-zkousce.png` });
    // Úprava mostu (zrcadlení souměrného mostu nic nezmění, ale je to nový návrh): platí zase odhad.
    await nactiMost(pad("2-02", "rytmu běhu"));
    expect(await osa().getAttribute("data-zkouska")).toBeNull();
    expect(await osa().getAttribute("data-hlavni")).toBe("utvar;1;3");
  });

  it("most, který se při zkoušce zřítil, změřené kmitání nemá: osa zůstává u odhadu", async () => {
    // Příhrada metr pod dřevěnou mostovkou: mostovka je v ní tlačený pás a pod běžci se zlomí.
    const k = new Kreslic("2-02");
    const O = "ocel-lehka" as const;
    for (let x = 0; x < 28; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    const dolni = [4, 8, 12, 16, 20, 24].map((x) => [x, -1] as [number, number]);
    k.prut(O, [0, 0], dolni[0]!);
    k.prut(O, dolni.at(-1)!, [28, 0]);
    for (let i = 0; i + 1 < dolni.length; i++) k.prut(O, dolni[i]!, dolni[i + 1]!);
    for (const [x, y] of dolni) k.prut(O, [x, 0], [x, y]);
    for (let i = 0; i + 1 < dolni.length; i++) {
      const kStredu = dolni[i]![0] < 14;
      k.prut(O, kStredu ? dolni[i]! : [dolni[i]![0], 0], kStredu ? [dolni[i + 1]![0], 0] : dolni[i + 1]!);
    }
    await nactiMost(k.navrh());
    expect(await osa().getAttribute("data-stav")).toBe("nad-mezi");
    await pust();
    await stranka.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 90_000 });
    await stranka.locator(".vysledek").waitFor({ state: "visible", timeout: 60_000 });
    expect(await udaj("vysledek-nadpis")).toBe("MOST NEOBSTÁL");
    await akce("upravit").click();
    expect(await telo("rezim")).toBe("stavba");
    // Dřív osa po takové zkoušce zezelenala s „zkouška: kmitání 0,00 m/s²“.
    expect(await osa().getAttribute("data-zkouska")).toBeNull();
    expect(await osa().getAttribute("data-stav")).toBe("nad-mezi");
    expect(bezMezer(await stranka.locator('[data-udaj="frekvence-popis"]').evaluate((uzel) => uzel.textContent ?? ""))).toMatch(/^Odhad kmitání \d,\d m\/s², mez je 2,5: /);
  });

  it("most, který projde, hlášení o mezi nedostane, ale frekvenci kmitání v podrobnostech má", async () => {
    await otevri("2-03");
    await nactiMost(RESENI["2-03"]!.pruchod);
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    expect(await telo("kmitani-nad-mez")).toBeNull();
    await rozbalVysledek();
    expect(await udaj("vysledek-kmitani")).toContain("nejvíc na 2,3 Hz (pochodující útvar, krok 2,3 Hz)");
    expect(Number(await telo("zvetseni"))).toBeGreaterThan(1);
    await akce("upravit").click();
  });

  it("most, který se zlomil, se nezvětšuje a největší využití se bere z doby, kdy byl celý", async () => {
    await otevri("1-03");
    await nactiMost(pad("1-03", "plochá"));
    await pust();
    await dopocitej();
    await naKonec();
    expect(await telo("zvetseni")).toBe("1");
    expect(await akce("zvetseni").isVisible()).toBe(false);
    await rozbalVysledek();
    const vyuziti = stranka.locator('[data-udaj="vysledek-vyuziti"]');
    expect(await vyuziti.getAttribute("data-do-poruseni")).toBe("true");
    expect(await vyuziti.innerText()).toContain("než most poprvé povolil");
    expect(bezMezer(await vyuziti.innerText())).toMatch(/^1\d\d % · prut \d+/);
  });

  it("kliknutí na prut při přehrávání po pádu: věta mluví o okamžiku, do kterého přehrávání skočí", async () => {
    // Na začátku děje stojí most celý, takže prut leží tam, kde je nakreslený.
    await stranka.locator("#cas").evaluate((tahlo) => {
      (tahlo as HTMLInputElement).value = "0";
      tahlo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await stranka.evaluate(() => new Promise<void>((hotovo) => requestAnimationFrame(() => requestAnimationFrame(() => hotovo()))));
    await klikni(2, 0);
    const veta = bezMezer(await udaj("hlaseni"));
    expect(veta).toMatch(/^Prut 1: největší využití \d+ % \([^)]+\) v čase \d+,\d s$/);
    const vCase = Number(veta.match(/v čase (\d+),(\d) s$/)!.slice(1).join("."));
    // Největší namáhání přišlo až při pádu; věta i skok berou totéž číslo z celé zkoušky.
    expect(Math.abs((await cas()) - vCase)).toBeLessThan(0.11);
    await stranka.keyboard.press("Escape");
    if ((await telo("rezim")) === "zkouska") await stranka.keyboard.press("Escape");
    expect(await telo("rezim")).toBe("stavba");
  });
});

describe("laděný tlumič", () => {
  it("osa ukazuje most bez tlumiče a tlumič zvlášť; odhad říká, jak moc tlumič pomáhá", async () => {
    await otevri("5-02");
    await nactiMost(RESENI["5-02"]!.pruchod);
    expect(await osa().getAttribute("data-stav")).toBe("klid");
    expect(bezMezer(await udaj("frekvence-popis"))).toMatch(/^odhad kmitání 1,\d m\/s² \(mez 2,5\): nejvíc běžecký závod, krok kolem 2,6 Hz$/);
    expect(await osa().locator(".frekvence__tlumic").count()).toBe(1);
    expect(bezMezer((await osa().locator(".frekvence__tlumic").getAttribute("title")) ?? "")).toContain("laděný tlumič: 2,50 Hz");
    const titulek = bezMezer((await stranka.locator('[data-udaj="frekvence-popis"]').getAttribute("title")) ?? "");
    expect(titulek).toMatch(/Tlumič snižuje odhad kmitání z 3,\d na 1,\d m\/s²\./);
    // Most bez tlumiče: prázdný 2,7 Hz, s běžci o dost níž (těla nejsou mrtvá váha).
    expect(titulek).toMatch(/^Most sám kmitá na 2,7\d Hz; když na něm stojí lidé, odpovídá nejvíc na 2,[12]\d Hz\./);
    await stranka.locator(".osa").screenshot({ path: `${SLOZKA}/k6-osa-tlumic.png` });
  });

  it("nastavení tlumiče říká, na jaký rytmus ladit, a tlačítkem ho nastaví", async () => {
    const tlumic = RESENI["5-02"]!.pruchod.stycniky.find((s) => s.tlumic)!;
    const odhadAutora = Number(await osa().getAttribute("data-odhad"));
    await stranka.keyboard.press("v");
    await klikni(tlumic.x, tlumic.y);
    await stranka.locator('[data-nastaveni="ladeny"]').waitFor({ state: "visible" });
    // Cíl je rytmus běžců: tlumič pomáhá nejvíc na frekvenci, na kterou je naladěný.
    expect(Number(await telo("cil-ladeni"))).toBeCloseTo(2.6, 3);
    expect(bezMezer(await udaj("ladeny-cil"))).toBe("Most nejvíc rozkmitá běžecký závod, krok kolem 2,6 Hz: 2,60 Hz. Na ten rytmus tlumič laď.");
    // Referenční most je naladěný o dva kroky vedle (2,50 Hz): tlačítko nabízí doladění.
    expect(await akce("ladeny-naladit").isDisabled()).toBe(false);
    await akce("ladeny-naladit").click();
    expect(await udaj("ladeny-frekvence")).toBe("2,60 Hz");
    expect(await akce("ladeny-naladit").isDisabled()).toBe(true);
    expect(await akce("ladeny-naladit").getAttribute("title")).toBe("Tlumič je na tu frekvenci naladěný.");
    await expect.poll(async () => Number(await osa().getAttribute("data-odhad")), { timeout: 10_000 }).toBeLessThan(odhadAutora);
    const odhadNaladeny = Number(await osa().getAttribute("data-odhad"));
    // Rozladění o 0,8 Hz: odhad vyskočí a osa řekne, kam tlumič patří a co by přeladění udělalo
    // (rozbor odhad s přeladěným tlumičem spočítal, nehádá).
    for (let i = 0; i < 16; i++) await akce("ladeny-frekvence-plus").click();
    expect(await udaj("ladeny-frekvence")).toBe("3,40 Hz");
    await expect.poll(async () => Number(await osa().getAttribute("data-odhad")), { timeout: 10_000 }).toBeGreaterThan(1.3 * odhadNaladeny);
    await expect
      .poll(async () => bezMezer((await stranka.locator('[data-udaj="frekvence-popis"]').getAttribute("title")) ?? ""), { timeout: 10_000 })
      .toMatch(/Tlumič přeladěný na 2,60 Hz: odhad asi \d,\d+ m\/s²\./);
    // Cíl ladění se rozladěním tlumiče nemění: je to most bez tlumičů a rytmus lidí.
    expect(Number(await telo("cil-ladeni"))).toBeCloseTo(2.6, 3);
    expect(await akce("ladeny-naladit").isDisabled()).toBe(false);
    await akce("ladeny-naladit").click();
    expect(await udaj("ladeny-frekvence")).toBe("2,60 Hz");
    await expect.poll(async () => Number(await osa().getAttribute("data-odhad")), { timeout: 10_000 }).toBeCloseTo(odhadNaladeny, 2);
    await stranka.screenshot({ path: `${SLOZKA}/k7-ladeni-tlumice.png` });
    await stranka.keyboard.press("Escape");
  });

  it("tlumič u opěry: osa poradí místo, kde by pomohl, a číslo k němu spočítá", async () => {
    // Tentýž most s tlumičem přeneseným čtyři metry od opěry: je naladěný a těžký, ale visí tam,
    // kde se most skoro nehýbe. Dřív hra radila „těžší závaží nebo další tlumič“.
    const navrh = RESENI["5-02"]!.pruchod;
    const tlumic = navrh.stycniky.find((s) => s.tlumic)!;
    const uOpery = navrh.stycniky.find((s) => s.y === tlumic.y && s.x === 4)!;
    const presunuty: NavrhMostu = {
      ...navrh,
      stycniky: navrh.stycniky.map((s) => {
        if (s.id === tlumic.id) {
          const { tlumic: _tlumic, ...bez } = s;
          return bez;
        }
        return s.id === uOpery.id ? { ...s, tlumic: { hmota: tlumic.tlumic!.hmota, frekvence: 2.6 } } : s;
      }),
    };
    await nactiMost(presunuty);
    expect(await osa().getAttribute("data-stav")).not.toBe("klid");
    const titulek = bezMezer((await stranka.locator('[data-udaj="frekvence-popis"]').getAttribute("title")) ?? "");
    expect(titulek).toMatch(/Tlumič by víc pomohl 1[26] m od levého konce mostovky: odhad asi \d,\d+ m\/s²\./);
    expect(titulek).not.toContain("lehký");
    await stranka.locator(".osa").screenshot({ path: `${SLOZKA}/k7b-tlumic-u-opery.png` });
    // Zpět most autora s tlumičem naladěným na rytmus, jak ho nechal předchozí test.
    await nactiMost({ ...navrh, stycniky: navrh.stycniky.map((s) => (s.tlumic ? { ...s, tlumic: { ...s.tlumic, frekvence: 2.6 } } : s)) });
  });

  it("tvary kmitání a brnknutí mluví o soustavě s tlumičem a řeknou to", async () => {
    // V páté kapitole je analytický panel otevřený hned; kdyby nebyl, otevře se.
    if ((await telo("analyza")) !== "otevrena") await stranka.keyboard.press("a");
    expect(await telo("analyza")).toBe("otevrena");
    expect(await stranka.locator('[data-udaj="tvary"] button').count()).toBe(3);
    expect(bezMezer(await udaj("tvary-poznamka"))).toMatch(/^S tlumičem jsou to tvary celé soustavy; osa ukazuje most bez tlumiče \(2,\d\d Hz\)\.$/);
    await stranka.keyboard.press("a");
    await stranka.keyboard.press("b");
    const stred = await bodSveta(16, 0);
    await stranka.mouse.move(stred.x, stred.y);
    await stranka.mouse.down();
    await stranka.mouse.move(stred.x, stred.y + 60, { steps: 4 });
    await stranka.mouse.up();
    await stranka.locator('body[data-zkouska="hotovo"]').waitFor({ timeout: 60_000 });
    await naKonec();
    // Změřená frekvence je jedna z vlastních frekvencí soustavy z rozboru, ne číslo mezi nimi.
    expect(Number(await telo("pokus-tvar"))).toBeGreaterThanOrEqual(1);
    expect(bezMezer(await udaj("vysledek-shrnuti"))).toMatch(
      /^Most kmitá na \d,\d\d Hz\. To je \d\. tvar kmitání mostu s laděným tlumičem \(\d,\d\d Hz\)\. Osa frekvencí ukazuje most bez tlumiče \(2,\d\d Hz\) a tlumič zvlášť\.$/,
    );
    await akce("upravit").click();
    await stranka.keyboard.press("b");
  });
});

describe("nápověda po krocích", () => {
  it("první krok prozradí jen princip se skicou; medaile jsou zamčené s vysvětlením", async () => {
    await otevri("1-01");
    await akce("napoveda").click();
    await stranka.locator("#okno-napoveda").waitFor({ state: "visible" });
    expect(await telo("napoveda")).toBe("princip");
    expect(await telo("napoveda-most")).toBe("pruchod");
    expect(await stranka.locator("#okno-napoveda").getAttribute("data-soustava")).toBe("trojuhelnik-nad");
    expect(await udaj("napoveda-uvod")).toBe("Jeden most, který touhle úrovní projde, nese takhle:");
    expect(await udaj("napoveda-princip")).toBe("Mostovku drží pár prutů nad ní: tvoří s ní trojúhelník a ten se neprohne.");
    // Skica je nakreslená (světlé čáry na tmavém podkladu).
    const svetlych = await stranka.locator('[data-udaj="napoveda-skica"]').evaluate((uzel) => {
      const platno = uzel as HTMLCanvasElement;
      const data = platno.getContext("2d")!.getImageData(0, 0, platno.width, platno.height).data;
      let pocet = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 100 && data[i]! > 180) pocet++;
      return pocet;
    });
    expect(svetlych).toBeGreaterThan(200);
    // Materiál ani obrys zatím vidět nejsou.
    expect(await stranka.locator('[data-udaj="napoveda-soupis"]').isVisible()).toBe(false);
    expect(await akce("napoveda-obrys").isVisible()).toBe(false);
    expect(await akce("napoveda-dalsi").innerText()).toBe("Další krok: z čeho je");
    // Nápověda k medailím je zamčená a říká proč.
    const medaile = stranka.locator('[data-udaj="napoveda-mosty"] button');
    expect(await medaile.allInnerTexts()).toEqual(["Průchod", "Medaile za rozpočet", "Mistrovská medaile"]);
    expect(await medaile.nth(2).getAttribute("aria-disabled")).toBe("true");
    expect(await udaj("napoveda-zamceno")).toBe("Nápověda k medailím se odemkne, až úrovní projdeš.");
    // Zamčené tlačítko jde zmáčknout, jen nic neudělá (není vypnuté, aby šlo přečíst proč).
    await medaile.nth(2).click({ force: true });
    expect(await telo("napoveda-most")).toBe("pruchod");
    await stranka.locator("#okno-napoveda").screenshot({ path: `${SLOZKA}/k8-napoveda-princip.png` });
  });

  it("druhý krok přidá materiál a cenu, třetí obrys na výkresu", async () => {
    await akce("napoveda-dalsi").click();
    expect(await telo("napoveda")).toBe("material");
    const soupis = (await stranka.locator('[data-udaj="napoveda-soupis"] li').allInnerTexts()).map(bezMezer);
    expect(soupis).toEqual(["Dřevěná mostovka: 2× (dohromady 8 m)", "Lehký trám: 3× (dohromady 10,9 m)"]);
    expect(bezMezer(await udaj("napoveda-cena"))).toMatch(/^Stojí [\d ]+ Kč/);
    expect(await akce("napoveda-dalsi").innerText()).toBe("Další krok: obrys");
    await akce("napoveda-dalsi").click();
    expect(await telo("napoveda")).toBe("obrys-nabidka");
    expect(await akce("napoveda-dalsi").isVisible()).toBe(false);
    expect(await akce("napoveda-obrys").innerText()).toBe("Ukázat obrys na výkresu");
    await stranka.locator("#okno-napoveda").screenshot({ path: `${SLOZKA}/k9-napoveda-kroky.png` });
    await akce("napoveda-obrys").click();
    expect(await stranka.locator("#okno-napoveda[open]").count()).toBe(0);
    expect(await telo("napoveda")).toBe("obrys");
    await stranka.screenshot({ path: `${SLOZKA}/k10-napoveda-obrys.png` });
    // Znovu otevřená nápověda si kroky pamatuje a obrys jde schovat.
    await akce("napoveda").click();
    expect(await stranka.locator('[data-udaj="napoveda-soupis"]').isVisible()).toBe(true);
    expect(await akce("napoveda-obrys").innerText()).toBe("Schovat obrys");
    await akce("napoveda-obrys").click();
    expect(await telo("napoveda")).toBe("obrys-nabidka");
    await stranka.locator('#okno-napoveda button[value="zavrit"]').click();
  });

  it("po projití úrovně se odemkne nápověda k medailím a mluví o jiném mostě", async () => {
    await nactiMostBezOsy(RESENI["1-01"]!.pruchod);
    await pust();
    await dopocitej();
    expect(await naKonec()).toBe("MOST OBSTÁL");
    await akce("upravit").click();
    await akce("napoveda").click();
    const medaile = stranka.locator('[data-udaj="napoveda-mosty"] button');
    expect(await medaile.nth(2).getAttribute("aria-disabled")).toBe("false");
    expect(await stranka.locator('[data-udaj="napoveda-zamceno"]').isVisible()).toBe(false);
    await medaile.nth(2).click();
    expect(await telo("napoveda-most")).toBe("mistrovska");
    expect(await telo("napoveda")).toBe("princip");
    expect(await udaj("napoveda-uvod")).toBe("Jeden most, který získá mistrovskou medaili, nese takhle:");
    expect(await udaj("napoveda-princip")).toBe("Mostovku podpírá pár prutů zdola: tvoří s ní trojúhelník a ten se neprohne.");
    expect(await stranka.locator("#okno-napoveda").getAttribute("data-soustava")).toBe("trojuhelnik-pod");
    await akce("napoveda-dalsi").click();
    expect(bezMezer(await udaj("napoveda-cena"))).toMatch(/^Stojí [\d ]+ Kč a splní podmínku mistrovské medaile: rozpočtová medaile a k ní žádný prut využitý nad 30 %\.$/);
    // Most pro medaili za rozpočet má vlastní kroky: začíná principem.
    await medaile.nth(1).click();
    expect(await telo("napoveda")).toBe("princip");
    await akce("napoveda-dalsi").click();
    expect(bezMezer(await udaj("napoveda-cena"))).toMatch(/^Stojí [\d ]+ Kč: do medaile za rozpočet \(do [\d ]+ Kč\) se vejde\.$/);
    await stranka.locator("#okno-napoveda").screenshot({ path: `${SLOZKA}/k11-napoveda-medaile.png` });
    await stranka.locator('#okno-napoveda button[value="zavrit"]').click();
  });
});

/** Načte most v úrovni bez osy frekvencí (není na co čekat). */
async function nactiMostBezOsy(navrh: NavrhMostu): Promise<void> {
  await rozbalPaletu(stranka);
  await akce("import").click();
  await stranka.locator("#okno-obsah").fill(navrhNaText(navrh));
  await akce("okno-nacist").click();
}

describe("čitelnost stavby", () => {
  it("řádek rad pod výkresem se mění podle nástroje a výběru; údaje o vybraném prutu jsou v paletě", async () => {
    await otevri("1-03");
    await nactiMostBezOsy(RESENI["1-03"]!.pruchod);
    const rada = stranka.locator('[data-udaj="rada-stavby"]');
    /** Řádek rad nesmí zajet pod popisové pole v rohu výkresu. */
    const vejdeSe = async (): Promise<void> => {
      const r = (await rada.boundingBox())!;
      const pole = (await stranka.locator("dl.pole").boundingBox())!;
      expect(r.x + r.width, await rada.innerText()).toBeLessThanOrEqual(pole.x);
    };
    expect(await rada.getAttribute("data-rada")).toBe("kresleni");
    expect(await rada.innerText()).toContain("tažení ze styčníku: prut");
    await vejdeSe();
    await stranka.keyboard.press("v");
    expect(await rada.getAttribute("data-rada")).toBe("vyber");
    expect(await rada.innerText()).toContain("Shift+klik: přidat");
    await vejdeSe();
    // Kliknutí doprostřed prvního dílu mostovky ho vybere.
    await klikni(2, 0);
    // Výběr nástrojem Výběr a posun: řádek říká, že ho posune tažení i šipky.
    expect(await rada.getAttribute("data-rada")).toBe("vyberPosun");
    expect(await rada.innerText()).toContain("tažení vybraného styčníku, šipky: posun o metr");
    expect(await rada.innerText()).toContain("číslice: jiný prvek");
    await vejdeSe();
    const panel = stranka.locator('[data-nastaveni="vyber"]');
    expect(await panel.isVisible()).toBe(true);
    expect(await udaj("vyber-nadpis")).toMatch(/^VYBRANÝ PRUT \d+$/i);
    expect(bezMezer(await udaj("vyber-udaje"))).toMatch(/^Dřevěná mostovka\n4,00 m · 10 000 Kč$/);
    expect(await telo("vyber-metru")).toBe("4.00");
    // Shift+klik přidá další prut: panel sčítá.
    const dalsi = await bodSveta(6, 0);
    await stranka.keyboard.down("Shift");
    await stranka.mouse.click(dalsi.x, dalsi.y);
    await stranka.keyboard.up("Shift");
    expect(await udaj("vyber-nadpis")).toMatch(/^VYBRÁNO 2 PRUTŮ$/i);
    expect(bezMezer(await udaj("vyber-udaje"))).toMatch(/^Dřevěná mostovka\n8,0 m · 20 000 Kč$/);
    await stranka.screenshot({ path: `${SLOZKA}/k12-vybrane-pruty.png` });
    await stranka.keyboard.press("Escape");
    expect(await panel.isVisible()).toBe(false);
    // Po zkoušce je u jediného prutu i jeho největší využití.
    await pust();
    await dopocitej();
    await naKonec();
    await akce("upravit").click();
    await stranka.keyboard.press("v");
    await klikni(2, 0);
    expect(bezMezer(await udaj("vyber-udaje"))).toMatch(/v poslední zkoušce nejvýš \d+ % \(.+\)$/);
    await stranka.keyboard.press("Escape");
    await stranka.keyboard.press("1");
    expect(await rada.getAttribute("data-rada")).toBe("kresleni");
  });

  it("nástroje jsou v paletě nad prvky a na výšce 900 px se vejdou i s prvky a pokusy", async () => {
    const s = await prohlizec.newPage({ locale: "cs-CZ", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    try {
      await s.goto(`${adresa}?uroven=4-04&vyvoj=1`);
      await s.locator(PLATNO).waitFor();
      await s.locator('#okno-zadani[open] button[value="zavrit"]').click();
      const dno = async (volic: string): Promise<number> => {
        const o = (await s.locator(volic).first().boundingBox())!;
        return o.y + o.height;
      };
      // Nástroje jsou hned pod Zadáním a Nápovědou, nad prvky.
      expect(await dno('[data-akce="vyber"]')).toBeLessThan((await s.locator(".paleta__prvky button").first().boundingBox())!.y);
      expect(await s.locator('[data-akce="vyber"]').innerText()).toMatch(/Výběr a posun$/);
      // Všechno, čím se staví a zkouší, je vidět bez posouvání palety.
      for (const volic of ['[data-akce="znovu"]', ".paleta__prvky button:last-child", '[data-akce="dopnout"]', '[data-akce="zlom"]']) {
        expect(await dno(volic), volic).toBeLessThanOrEqual(900);
      }
      // Výňatek ze zadání je krátký a celé zadání je na jedno kliknutí.
      const vynatek = (await s.locator('[data-udaj="zadani"]').boundingBox())!;
      expect(vynatek.height).toBeLessThan(100);
      await rozbalPaletu(s);
      await s.locator('[data-akce="zadani-cele"]').click();
      await s.locator("#okno-zadani").waitFor({ state: "visible" });
      await s.locator('#okno-zadani[open] button[value="zavrit"]').click();
      // Název úrovně v liště není oříznutý.
      const nazev = s.locator('[data-udaj="uroven"]');
      expect(await nazev.evaluate((u) => u.scrollWidth <= u.clientWidth)).toBe(true);
      expect(await nazev.getAttribute("title")).toContain("Náklad století");
      await s.screenshot({ path: `${SLOZKA}/k13-paleta-900.png` });
    } finally {
      await s.close();
    }
  });

  it("most s povolenými lany má při stavbě značku s průvěsem; dopnutý ji nemá", async () => {
    await otevri("4-04");
    const visuty = RESENI["4-04"]!.pruchod;
    await nactiMostBezOsy(visuty);
    await expect.poll(() => udaj("frekvence-popis").catch(() => "hotovo"), { timeout: 20_000 }).not.toBe("počítá se…");
    await stranka.waitForTimeout(600);
    expect(await telo("pruves")).toBeNull();
    const povoleny: NavrhMostu = { ...visuty, pruty: visuty.pruty.map(({ predpeti: _predpeti, ...p }) => p) };
    await nactiMostBezOsy(povoleny);
    await expect.poll(() => telo("pruves"), { timeout: 30_000 }).not.toBeNull();
    expect(Number(await telo("pruves"))).toBeGreaterThan(100);
    await stranka.screenshot({ path: `${SLOZKA}/k14-pruves.png` });
  });

  it("za celou dobu nenastala žádná chyba ve stránce", () => {
    expect(chyby).toEqual([]);
  });
});
