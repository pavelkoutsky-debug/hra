// Kmitání čitelně pro hráče: složky síly kroku, frekvence kmitání ze záznamu, příčina
// kmitání a nové údaje výsledku zkoušky. Odhad kmitání při stavbě má vlastní test (`odhad`).
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { MEZE_KOMFORTU } from "../src/jadro/komfort";
import {
  dominantniFrekvence,
  frekvenceKmitani,
  frekvenceVolnehoKmitani,
  mostProHrace,
  nejblizsiTvar,
  nejvyssiSlozka,
  pricinaKmitani,
  ROZSAH_FREKVENCI,
  SILNA_SLOZKA,
  slozkyKroku,
  zesileniPasma,
  type SlozkaKroku,
} from "../src/zkouska/kmitani";
import { KRIVKA_DO, POCET_FREKVENCI, rozeberMost } from "../src/zkouska/rozbor";
import { nejvetsiPohybZavazi, nejvetsiVychylka, stredniPolohy, zvetsiPohyb } from "../src/vykres/zvetseni";
import { prazdnySnimek, STYCNIK_ZAVAZI, Zaznam, type Topologie } from "../src/zkouska/zaznam";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const kampan = nactiKampan();
const uroven = (id: string): Uroven => kampan.find((u) => u.id === id)!;

function zkousej(u: Uroven, navrh: NavrhMostu, brnknuti?: { stycnik: number; sila: number }) {
  const zkouska = brnknuti ? new Zkouska(u, navrh, nasadaUrovne(u), brnknuti) : new Zkouska(u, navrh, nasadaUrovne(u));
  const zaznam = new Zaznam();
  let pojistka = 0;
  while (!zkouska.hotovo) {
    const davka = zkouska.pokracuj(1);
    for (const stavba of davka.topologie) zaznam.pridejTopologii(stavba);
    for (const s of davka.snimky) zaznam.pridej(s);
    expect(pojistka++).toBeLessThan(300);
  }
  return { vysledek: zkouska.vysledek(), zaznam };
}

const pad = (id: string, nazev: string): NavrhMostu => RESENI[id]!.pady.find((p) => p.nazev.includes(nazev))!.navrh;

describe("složky síly kroku", () => {
  it("chodec budí krokem a slaběji jeho dvojnásobkem a trojnásobkem; každý rytmus jednou", () => {
    const slozky = slozkyKroku(uroven("2-03"));
    expect(slozky.map((s) => [s.nasobek, s.frekvence])).toEqual([
      [1, 2.3],
      [2, 4.6],
      [3, expect.closeTo(6.9, 9)],
    ]);
    expect(slozky.every((s) => s.druh === "utvar" && s.rytmus === 2.3 && s.pasmo === 0)).toBe(true);
    // První složka podle Kerra (0,37·(f − 0,95)), další desetina váhy.
    expect(slozky[0]!.sila).toBeCloseTo(0.37 * (2.3 - 0.95), 6);
    expect(slozky[1]!.sila).toBeCloseTo(0.1, 6);
    expect(slozky[2]!.sila).toBeCloseTo(0.1, 6);
    // 2-04: tři útvary, každý svým krokem; devět složek seřazených podle frekvence.
    const prehlidka = slozkyKroku(uroven("2-04"));
    expect(prehlidka).toHaveLength(9);
    expect(prehlidka.map((s) => s.frekvence)).toEqual([...prehlidka.map((s) => s.frekvence)].sort((a, b) => a - b));
  });

  it("běh je silný a třetí složku nemá; skákání má všechny tři", () => {
    const beh = slozkyKroku(uroven("2-02")).filter((s) => s.druh === "utvar");
    expect(beh.map((s) => s.nasobek)).toEqual([1, 2]);
    expect(beh[0]!.sila).toBeCloseTo(Math.PI / 2, 6);
    expect(beh[1]!.sila).toBeCloseTo(2 / 3, 6);
    expect(beh.every((s) => s.sila >= SILNA_SLOZKA)).toBe(true);
    const skakani = slozkyKroku(uroven("5-04"));
    expect(skakani.map((s) => [s.nasobek, s.rytmus])).toEqual([
      [1, 2.2],
      [2, 2.2],
      [3, 2.2],
    ]);
    expect(skakani.map((s) => Number(s.sila.toFixed(2)))).toEqual([1.2, 0.4, 0.12]);
  });

  it("dav a závod nejdou jedním rytmem: složky mají pásmo, které roste s násobkem", () => {
    const dav = slozkyKroku(uroven("5-01"));
    expect(dav.map((s) => Number(s.pasmo.toFixed(2)))).toEqual([0.3, 0.6, 0.9]);
    expect(nejvyssiSlozka(dav)).toBeCloseTo(3 * 1.7 + 0.9, 6);
    expect(nejvyssiSlozka(slozkyKroku(uroven("3-01")))).toBe(0);
  });

  it("osa i křivka sahají za nejvyšší složku každé úrovně kampaně", () => {
    expect(KRIVKA_DO).toBe(ROZSAH_FREKVENCI);
    for (const u of kampan) expect(nejvyssiSlozka(slozkyKroku(u)), u.id).toBeLessThan(ROZSAH_FREKVENCI);
  });
});

describe("frekvence kmitání z průběhu", () => {
  const prubeh = (f: (t: number) => number, trvani = 4, vzorku = 60) => {
    const casy: number[] = [];
    const y: number[] = [];
    for (let i = 0; i <= trvani * vzorku; i++) {
      casy.push(i / vzorku);
      y.push(f(i / vzorku));
    }
    return { casy, y };
  };

  it("najde frekvenci sinusu na setiny Hz, i když průběh pomalu ujíždí", () => {
    for (const f of [0.8, 2.3, 4.37, 6.9]) {
      const { casy, y } = prubeh((t) => 0.004 * Math.sin(2 * Math.PI * f * t + 0.7) - 0.01 * t + 5);
      expect(dominantniFrekvence(casy, y, false), `${f} Hz`).toBeCloseTo(f, 1);
      expect(Math.abs(dominantniFrekvence(casy, y, true)! - f)).toBeLessThan(0.03);
    }
  });

  it("u dvou složek rozhoduje výchylka, nebo zrychlení (to přeje rychlejší složce)", () => {
    // 2 Hz s výchylkou 10 mm a 6 Hz s výchylkou 3 mm: zrychlení 6 Hz je skoro třikrát větší.
    const { casy, y } = prubeh((t) => 0.01 * Math.sin(2 * Math.PI * 2 * t) + 0.003 * Math.sin(2 * Math.PI * 6 * t));
    expect(dominantniFrekvence(casy, y, false)).toBeCloseTo(2, 1);
    expect(dominantniFrekvence(casy, y, true)).toBeCloseTo(6, 1);
  });

  it("volné kmitání: most, který se vrátí do klidu bez překmitu, frekvenci nemá", () => {
    // Přetlumený most po brnknutí: návrat bez kmitu. Ve spektru po něm zbude jen stopa zpracování.
    const navrat = prubeh((t) => 3 - 0.002 * Math.exp(-1.2 * t), 6, 120);
    expect(frekvenceVolnehoKmitani(navrat.casy, navrat.y, 0.3, 25)).toBeNull();
    // Tlumené kmitání, i pomalé jako u visutého mostu, se pozná.
    const lavka = prubeh((t) => 3 - 0.002 * Math.exp(-0.3 * t) * Math.cos(2 * Math.PI * 2.66 * t), 4, 120);
    expect(frekvenceVolnehoKmitani(lavka.casy, lavka.y, 0.3, 25)).toBeCloseTo(2.66, 1);
    const visuty = prubeh((t) => 3 - 0.05 * Math.exp(-0.05 * t) * Math.cos(2 * Math.PI * 0.36 * t), 16, 120);
    expect(frekvenceVolnehoKmitani(visuty.casy, visuty.y, 0.3, 25)).toBeCloseTo(0.36, 1);
    // Styčník, který se nepohnul (podepřený), taky nic.
    const klid = prubeh(() => 3, 4, 120);
    expect(frekvenceVolnehoKmitani(klid.casy, klid.y, 0.3, 25)).toBeNull();
  });

  it("vrchol musí ležet uvnitř pásma: složka pod pásmem frekvenci nemá", () => {
    // Houpání pomalejší než pásmo komfortu (0,2 Hz) v něm vrchol nemá.
    const pomale = prubeh((t) => 0.05 * Math.sin(2 * Math.PI * 0.2 * t), 8);
    expect(dominantniFrekvence(pomale.casy, pomale.y, true)).toBeNull();
    // Výsledek nikdy neleží mimo pásmo, ve kterém se hledalo.
    const uOkraje = prubeh((t) => 0.004 * Math.sin(2 * Math.PI * 0.52 * t), 8);
    const f = dominantniFrekvence(uOkraje.casy, uOkraje.y, false);
    expect(f).not.toBeNull();
    expect(f!).toBeGreaterThanOrEqual(0.5);
  });

  it("zrychlení se váží pásmem komfortu: největší váhu má kolem 2 Hz, k okrajům klesá", () => {
    expect(zesileniPasma(2.2)).toBeGreaterThan(0.94);
    expect(zesileniPasma(0.5)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(zesileniPasma(10)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(zesileniPasma(6)).toBeCloseTo(0.855, 2);
  });

  it("z krátkého, prázdného nebo nehybného průběhu nic nevyčte", () => {
    expect(dominantniFrekvence([0, 0.1], [0, 1], false)).toBeNull();
    const kratky = prubeh((t) => Math.sin(20 * t), 0.5);
    expect(dominantniFrekvence(kratky.casy, kratky.y, false)).toBeNull();
    const klid = prubeh(() => 3.25);
    expect(dominantniFrekvence(klid.casy, klid.y, true)).toBeNull();
  });

  it("ze záznamu čte styčník kolem daného okamžiku a přes porušení mostu nejde", () => {
    const stavba: Topologie = {
      stycniku: 2,
      prvekA: Int32Array.of(0),
      prvekB: Int32Array.of(1),
      prut: Int32Array.of(0),
      cara: Uint8Array.of(0),
      klouby: Uint8Array.of(0),
      podpory: Uint8Array.of(0, 0),
      znacky: Uint8Array.of(0, 0),
    };
    const zaznam = new Zaznam();
    zaznam.pridejTopologii(stavba);
    zaznam.pridejTopologii(stavba);
    // Do 6 s kmitá styčník 1 na 3 Hz; pak se most „porušil“ (druhá stavba) a kmitá na 7 Hz.
    for (let i = 0; i <= 600; i++) {
      const cas = i / 60;
      const f = cas < 6 ? 3 : 7;
      zaznam.pridej({ ...prazdnySnimek(), cas, topologie: cas < 6 ? 0 : 1, polohy: Float32Array.of(0, 0, 4, 0.002 * Math.sin(2 * Math.PI * f * cas)) });
    }
    expect(frekvenceKmitani(zaznam, 1, 4)).toBeCloseTo(3, 1);
    // Okno kolem 5,5 s sahá za porušení: čte se jen z části před ním.
    expect(frekvenceKmitani(zaznam, 1, 5.5)).toBeCloseTo(3, 1);
    expect(frekvenceKmitani(zaznam, 1, 8.5)).toBeCloseTo(7, 1);
    // Styčník 0 stojí, styčník mimo záznam neexistuje.
    expect(frekvenceKmitani(zaznam, 0, 4)).toBeNull();
    expect(frekvenceKmitani(zaznam, 5, 4)).toBeNull();
    expect(frekvenceKmitani(zaznam, -1, 4)).toBeNull();
    expect(frekvenceKmitani(new Zaznam(), 1, 4)).toBeNull();
  });
});

describe("příčina kmitání", () => {
  const slozka = (druh: SlozkaKroku["druh"], rytmus: number, nasobek: 1 | 2 | 3, sila: number, rozptyl = 0): SlozkaKroku => ({
    druh,
    rytmus,
    nasobek,
    frekvence: nasobek * rytmus,
    sila,
    pasmo: 2 * nasobek * rozptyl,
  });
  const beh = [slozka("utvar", 3, 1, 1.57), slozka("utvar", 3, 2, 0.67), slozka("chodec", 1.9, 1, 0.35), slozka("chodec", 1.9, 2, 0.1), slozka("chodec", 1.9, 3, 0.1)];
  const stavba: Topologie = {
    stycniku: 2,
    prvekA: Int32Array.of(0),
    prvekB: Int32Array.of(1),
    prut: Int32Array.of(0),
    cara: Uint8Array.of(0),
    klouby: Uint8Array.of(0),
    podpory: Uint8Array.of(0, 0),
    znacky: Uint8Array.of(0, 0),
  };
  /** Záznam, ve kterém styčník 1 kmitá součtem složek [frekvence Hz, zrychlení m/s²]. */
  const kmitajici = (slozkyPohybu: (cas: number) => readonly (readonly [number, number])[], trvani = 10): Zaznam => {
    const zaznam = new Zaznam();
    zaznam.pridejTopologii(stavba);
    for (let i = 0; i <= trvani * 60; i++) {
      const cas = i / 60;
      let y = 0;
      for (const [f, a] of slozkyPohybu(cas)) y += (a / (2 * Math.PI * f) ** 2) * Math.sin(2 * Math.PI * f * cas + f);
      zaznam.pridej({ ...prazdnySnimek(), cas, topologie: 0, polohy: Float32Array.of(0, 0, 4, y) });
    }
    return zaznam;
  };

  it("jmenuje rytmus, jehož násobky nesou většinu kmitání, i když největší složka je jinde", () => {
    // Běh 3 Hz: na 3, 6 a 9 Hz. Největší jednotlivá složka je 9 Hz (za koncem toho, co osa zná),
    // ale krok s dvojnásobkem dohromady nesou víc.
    const zaznam = kmitajici(() => [[3, 1.6], [6, 1.5], [9, 1.7]]);
    const pricina = pricinaKmitani(zaznam, 1, 6, beh)!;
    expect(pricina.rytmus).toMatchObject({ druh: "utvar", rytmus: 3 });
    expect(pricina.rytmus!.podil).toBeGreaterThan(0.5);
    // Z násobků toho rytmu je po zvážení pásmem komfortu nejsilnější krok sám.
    expect(pricina.rytmus!.nasobek).toBe(1);
    expect(pricina.rytmus!.frekvence).toBe(3);
    // Změřená frekvence je ta nejsilnější, ať patří komukoli.
    expect(pricina.frekvence).toBeGreaterThan(2.5);
  });

  it("most, který kmitá po svém, rytmus nedostane; dav se pozná v celém svém pásmu", () => {
    const poSvem = pricinaKmitani(kmitajici(() => [[4.5, 2]]), 1, 6, beh)!;
    expect(poSvem.rytmus).toBeNull();
    expect(poSvem.frekvence).toBeCloseTo(4.5, 1);
    const dav = [slozka("dav", 1.7, 1, 0.28, 0.15), slozka("dav", 1.7, 2, 0.1, 0.15)];
    expect(pricinaKmitani(kmitajici(() => [[1.95, 1]]), 1, 6, dav)!.rytmus).toMatchObject({ druh: "dav", rytmus: 1.7, nasobek: 1 });
    // Pásmo dvojnásobku kroku davu sahá do 4,2 Hz; za ním už dav není.
    expect(pricinaKmitani(kmitajici(() => [[5.5, 1]]), 1, 6, dav)!.rytmus).toBeNull();
    // Styčník, který se nehýbe, a záznam, který nestačí, příčinu nemají.
    expect(pricinaKmitani(kmitajici(() => [[3, 1]]), 0, 6, beh)).toBeNull();
    expect(pricinaKmitani(new Zaznam(), 1, 6, beh)).toBeNull();
  });

  it("příčina patří k okamžiku: dva útvary po sobě se nespletou", () => {
    const prehlidka = [slozka("utvar", 2, 1, 0.39), slozka("utvar", 2, 3, 0.1), slozka("utvar", 2.3, 1, 0.5), slozka("utvar", 2.3, 3, 0.1)];
    // Do 10. sekundy jde útvar 2,0 Hz, pak útvar 2,3 Hz a most kmitá víc.
    const zaznam = kmitajici((cas) => (cas < 10 ? [[2, 2.6]] : [[2.3, 4.1]]), 20);
    expect(pricinaKmitani(zaznam, 1, 8, prehlidka)!.rytmus).toMatchObject({ rytmus: 2 });
    expect(pricinaKmitani(zaznam, 1, 16, prehlidka)!.rytmus).toMatchObject({ rytmus: 2.3 });
  });

  it("vlastní frekvenci mostu hledá v rozmezí mezi obsazeným a prázdným mostem", () => {
    const most = { frekvence: [2.66, 8.41], frekvenceObsazeneho: [2.5, 7.54] };
    expect(nejblizsiTvar(2.58, most)).toEqual({ poradi: 1, prazdny: 2.66, obsazeny: 2.5 });
    expect(nejblizsiTvar(2.37, most)).toMatchObject({ poradi: 1 });
    expect(nejblizsiTvar(7.0, most)).toMatchObject({ poradi: 2 });
    expect(nejblizsiTvar(4.5, most)).toBeNull();
    expect(nejblizsiTvar(2.6, null)).toBeNull();
    // Přísnější mez pro pokusy: 6 % od vlastní frekvence.
    expect(nejblizsiTvar(2.37, { frekvence: [2.66], frekvenceObsazeneho: [] }, 0.06)).toBeNull();
    expect(nejblizsiTvar(2.6, { frekvence: [2.66], frekvenceObsazeneho: [] }, 0.06)).toMatchObject({ poradi: 1, obsazeny: null });
  });

  it("most s laděnými tlumiči se hráči ukazuje bez nich", () => {
    const sTlumicem = { frekvence: [2.25, 3.01], frekvenceObsazeneho: [2.18, 2.84], bezTlumicu: { prazdny: [2.72, 8.59], obsazeny: [2.48, 7.38] } };
    expect(mostProHrace(sTlumicem)).toEqual({ frekvence: [2.72, 8.59], frekvenceObsazeneho: [2.48, 7.38] });
    const bez = { frekvence: [2.72], frekvenceObsazeneho: [2.48], bezTlumicu: null };
    expect(mostProHrace(bez)).toBe(bez);
  });
});

describe("zkouška: kde, kdy a na jaké frekvenci most kmital", () => {
  it("most, který kmitá na dvojnásobku běhu, se pozná ze záznamu", () => {
    const u = uroven("2-02");
    const navrh = pad("2-02", "dvojnásobku");
    const { vysledek, zaznam } = zkousej(u, navrh);
    const komfort = vysledek.komfort!;
    expect(vysledek.pruchod).toBe(false);
    expect(komfort.trida).toBe(4);
    // Mez úrovně most překročil dřív, než kmitání vyvrcholilo.
    expect(komfort.prekroceno).not.toBeNull();
    expect(komfort.prekroceno!).toBeGreaterThan(0);
    expect(komfort.prekroceno!).toBeLessThan(komfort.cas);
    expect(komfort.stycnik).toBeGreaterThanOrEqual(0);
    const f = frekvenceKmitani(zaznam, komfort.stycnik, komfort.cas)!;
    expect(f).toBeCloseTo(6, 0);
    const pricina = pricinaKmitani(zaznam, komfort.stycnik, komfort.cas, slozkyKroku(u))!;
    expect(pricina.rytmus).toMatchObject({ druh: "utvar", nasobek: 2, rytmus: 3 });
    expect(nejblizsiTvar(pricina.rytmus!.frekvence, mostProHrace(rozeberMost(u, navrh)))).toMatchObject({ poradi: 1 });
  });

  it("most, který kmitá na trojnásobku kroku, taky; a ten, který projde, mez nepřekročí", () => {
    const u = uroven("2-04");
    const navrh = pad("2-04", "trojnásobku");
    const { vysledek, zaznam } = zkousej(u, navrh);
    expect(pricinaKmitani(zaznam, vysledek.komfort!.stycnik, vysledek.komfort!.cas, slozkyKroku(u))!.rytmus).toMatchObject({ nasobek: 3 });
    const dobry = zkousej(uroven("2-03"), RESENI["2-03"]!.pruchod).vysledek;
    expect(dobry.pruchod).toBe(true);
    expect(dobry.komfort!.prekroceno).toBeNull();
    expect(dobry.komfort!.zrychleni).toBeLessThanOrEqual(MEZE_KOMFORTU[2]);
  }, 60_000);

  it("přehlídka: mez překročí útvar 2,0 Hz, nejvíc pak most kmitá pod útvarem 2,3 Hz", () => {
    // Nález kontroly výpočtů: výsledek přišel 3 s po prvním překročení meze, ale jmenoval
    // rytmus, který na most vstoupil až o deset sekund později.
    const u = uroven("2-04");
    const { vysledek, zaznam } = zkousej(u, pad("2-04", "bez tlumičů"));
    const komfort = vysledek.komfort!;
    expect(komfort.prekroceno).not.toBeNull();
    expect(komfort.cas - komfort.prekroceno!).toBeGreaterThan(10);
    const slozky = slozkyKroku(u);
    expect(pricinaKmitani(zaznam, komfort.stycnik, komfort.prekroceno! + 2, slozky)!.rytmus).toMatchObject({ rytmus: 2, nasobek: 1 });
    expect(pricinaKmitani(zaznam, komfort.stycnik, komfort.cas, slozky)!.rytmus).toMatchObject({ rytmus: 2.3, nasobek: 1 });
  }, 60_000);

  it("úroveň s přísnější mezí hlásí překročení už na ní", () => {
    // 5-01 chce výborný komfort (0,5 m/s²); most, který se s lidmi dostane do pásma kroku, ji překročí.
    const u = uroven("5-01");
    const { vysledek } = zkousej(u, pad("5-01", "dvoumetrová"));
    expect(vysledek.komfort!.zrychleni).toBeGreaterThan(MEZE_KOMFORTU[0]);
    expect(vysledek.komfort!.zrychleni).toBeLessThan(MEZE_KOMFORTU[2]);
    expect(vysledek.komfort!.prekroceno).not.toBeNull();
    expect(vysledek.pruchod).toBe(false);
  }, 60_000);
});

describe("brnknutí a rozbor mluví o týchž frekvencích", () => {
  it("most s laděným tlumičem: brnknutí najde jednu z vlastních frekvencí soustavy, ne číslo mezi nimi", () => {
    const u = uroven("5-02");
    const navrh = RESENI["5-02"]!.pruchod;
    const rozbor = rozeberMost(u, navrh);
    expect(rozbor.frekvence).toHaveLength(POCET_FREKVENCI);
    const stred = navrh.stycniky.findIndex((s) => s.x === 16 && s.y === 0);
    expect(stred).toBeGreaterThanOrEqual(0);
    const { vysledek } = zkousej(u, navrh, { stycnik: stred, sila: 3000 });
    const f = vysledek.brnknuti!.frekvence!;
    expect(nejblizsiTvar(f, { frekvence: rozbor.frekvence, frekvenceObsazeneho: [] }, 0.06)).not.toBeNull();
  });

  it("přetlumený most se po brnknutí nerozkmitá: frekvenci nemá, ne nesmyslné číslo z okraje pásma", () => {
    // Mistrovský most 2-04 má viskózní tlumiče do kotev; dřív hra hlásila „most kmitá na 0,25 Hz“.
    const u = uroven("2-04");
    const navrh = RESENI["2-04"]!.mistrovska;
    const stred = navrh.stycniky.findIndex((s) => s.x === 16 && s.y === 0);
    expect(stred).toBeGreaterThanOrEqual(0);
    const { vysledek } = zkousej(u, navrh, { stycnik: stred, sila: 3000 });
    expect(vysledek.brnknuti!.frekvence).toBeNull();
    // Visutý most kmitá pomalu: brnknutí se sleduje déle a jeho frekvenci najde.
    const visuty = RESENI["4-04"]!.pruchod;
    const uprostred = visuty.stycniky.findIndex((s) => s.x === 36 && s.y === 0);
    expect(uprostred).toBeGreaterThanOrEqual(0);
    const pomaly = zkousej(uroven("4-04"), visuty, { stycnik: uprostred, sila: 20000 }).vysledek;
    expect(pomaly.trvani).toBeGreaterThan(10);
    expect(nejblizsiTvar(pomaly.brnknuti!.frekvence!, { frekvence: rozeberMost(uroven("4-04"), visuty).frekvence, frekvenceObsazeneho: [] }, 0.06)).not.toBeNull();
  });

  it("rozbor vrací i frekvence mostu bez tlumičů: prázdný kmitá rychleji než s lidmi a tlumič frekvenci rozdělí", () => {
    const u = uroven("5-02");
    const rozbor = rozeberMost(u, RESENI["5-02"]!.pruchod);
    const holy = rozbor.bezTlumicu!;
    expect(holy.prazdny[0]!).toBeGreaterThan(holy.obsazeny[0]!);
    // Tlumič rozdělí vlastní frekvenci mostu na dvě: jedna leží pod ní, druhá nad ní.
    expect(rozbor.frekvence[0]!).toBeLessThan(holy.prazdny[0]!);
    expect(rozbor.frekvence[1]!).toBeGreaterThan(holy.prazdny[0]!);
    // Most bez tlumičů se rovná rozboru téhož mostu, ze kterého se tlumiče vyndají.
    const bez: NavrhMostu = { ...RESENI["5-02"]!.pruchod, stycniky: RESENI["5-02"]!.pruchod.stycniky.map(({ tlumic: _t, ...s }) => s) };
    const rozborBez = rozeberMost(u, bez);
    expect(rozborBez.bezTlumicu).toBeNull();
    expect(holy.prazdny[0]!).toBeCloseTo(rozborBez.frekvence[0]!, 6);
    expect(holy.obsazeny[0]!).toBeCloseTo(rozborBez.frekvenceObsazeneho[0]!, 6);
  });

  it("rozbor řekne, o kolik mostovka pod vlastní tíhou visí pod výkresem", () => {
    // Tuhá příhrada se pod vlastní tíhou prohne o milimetry.
    const tuhy = rozeberMost(uroven("3-01"), RESENI["3-01"]!.pruchod);
    expect(tuhy.pruves).not.toBeNull();
    expect(tuhy.pruves!.metru).toBeGreaterThan(0);
    expect(tuhy.pruves!.metru).toBeLessThan(0.03);
    expect(tuhy.pruves!.nad).toBe(false);
    // Visutý most s dopnutými lany drží tvar; s povolenými napínáky visí hluboko.
    const visuty = RESENI["4-04"]!.pruchod;
    expect(rozeberMost(uroven("4-04"), visuty).pruves!.metru).toBeLessThan(0.1);
    const povoleny: NavrhMostu = { ...visuty, pruty: visuty.pruty.map(({ predpeti: _p, ...p }) => p) };
    const rozbor = rozeberMost(uroven("4-04"), povoleny);
    expect(rozbor.stabilni).toBe(true);
    expect(rozbor.pruves!.metru).toBeGreaterThan(0.1);
    expect(rozbor.pruves!.nad).toBe(false);
    expect(rozbor.pruves!.stycnik).toBeLessThan(povoleny.stycniky.length);
    // Přetažená lana mostovku zvednou nad výkres: hra to má říct jinak než „visí pod“.
    const pretazeny: NavrhMostu = { ...visuty, pruty: visuty.pruty.map((p) => (p.predpeti === undefined ? p : { ...p, predpeti: p.predpeti * 1.03 })) };
    const nahoru = rozeberMost(uroven("4-04"), pretazeny);
    if (nahoru.stabilni && nahoru.pruves && nahoru.pruves.metru > 0.05) expect(nahoru.pruves.nad).toBe(true);
  });
});

describe("obálka do prvního porušení", () => {
  it("most, který se nezlomil, ji nemá; u zlomeného má první povolený prut aspoň 100 % a ostatní nejvýš tolik co na konci", () => {
    const u = uroven("1-03");
    expect(zkousej(u, RESENI["1-03"]!.pruchod).vysledek.obalkaDoPoruseni).toBeNull();
    const { vysledek } = zkousej(u, pad("1-03", "plochá"));
    expect(vysledek.pruchod).toBe(false);
    const pred = vysledek.obalkaDoPoruseni!;
    expect(pred).toHaveLength(vysledek.obalka.length);
    pred.forEach((o, i) => expect(o.vyuziti).toBeLessThanOrEqual(Math.max(1, vysledek.obalka[i]!.vyuziti) + 1e-9));
    const nejvic = Math.max(...pred.map((o) => o.vyuziti));
    expect(nejvic).toBeGreaterThanOrEqual(1);
    // Při pádu se pruty namáhají víc než před ním: celá obálka je aspoň tak velká.
    expect(vysledek.nejvetsiVyuziti).toBeGreaterThanOrEqual(nejvic - 1e-9);
  });
});

describe("obálka do prvního porušení u mostu, který povolí hned", () => {
  it("pruty přetížené už vlastní vahou mají v obálce své skutečné využití, ne zlomek", () => {
    // Využití v simulaci nabíhá od nuly; most, který povolí v prvních milisekundách, by jinak
    // ukázal jediný prut na 100 % a ostatní hluboko pod tím (nález kontroly výpočtů).
    const { vysledek } = zkousej(uroven("3-03"), pad("3-03", "metr vysoká"));
    const pred = vysledek.obalkaDoPoruseni!;
    expect(pred.filter((o) => o.vyuziti >= 1).length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...pred.map((o) => o.vyuziti))).toBeGreaterThan(1.5);
    // Každý prut s využitím má i veličinu a únosnost, ze kterých se počítá (ne nuly).
    for (const o of pred) if (o.vyuziti >= 1) expect(Math.abs(o.unosnost)).toBeGreaterThan(0);
  });

  it("zvětšený pohyb brnknutého mostu se měří od středu kmitání, ne od vychýleného začátku", () => {
    // Styčník 1 začíná 20 mm pod klidem a doznívá kolem y = 0; styčník 0 je podpora.
    const snimky = Array.from({ length: 241 }, (_, i) => {
      const cas = i / 60;
      return Float32Array.of(0, 0, 4, -0.02 * Math.exp(-0.4 * cas) * Math.cos(2 * Math.PI * 2 * cas));
    });
    const klid = stredniPolohy(snimky);
    expect(Math.abs(klid[3]!)).toBeLessThan(0.002);
    expect(klid[1]).toBe(0);
    const stavba: Topologie = {
      stycniku: 2,
      prvekA: Int32Array.of(0),
      prvekB: Int32Array.of(1),
      prut: Int32Array.of(0),
      cara: Uint8Array.of(0),
      klouby: Uint8Array.of(0),
      podpory: Uint8Array.of(1, 0),
      znacky: Uint8Array.of(0, 0),
    };
    // Po dokmitání je zvětšený most skoro tam, kde opravdu je; proti začátku by byl o 14 cm výš.
    const konec = snimky.at(-1)!;
    const zvetseny = zvetsiPohyb(stavba, klid, konec, 10, new Float32Array(4));
    expect(Math.abs(zvetseny[3]! - konec[3]!)).toBeLessThan(0.06);
    const protiZacatku = zvetsiPohyb(stavba, snimky[0]!, konec, 10, new Float32Array(4));
    expect(protiZacatku[3]! - konec[3]!).toBeGreaterThan(0.12);
    expect(nejvetsiVychylka(stavba, klid, snimky[0]!)).toBeCloseTo(0.02, 2);
  });

  it("závaží laděného tlumiče neurčuje zvětšení pohybu, jen ho omezí", () => {
    // Styčník 1 je most (hýbe se o 10 mm), styčník 2 závaží tlumiče pod ním (o 40 mm).
    const stavba: Topologie = {
      stycniku: 3,
      prvekA: Int32Array.of(0, 1),
      prvekB: Int32Array.of(1, 2),
      prut: Int32Array.of(0, -1),
      cara: Uint8Array.of(0, 0),
      klouby: Uint8Array.of(0, 0),
      podpory: Uint8Array.of(1, 0, 0),
      znacky: Uint8Array.of(0, 0, STYCNIK_ZAVAZI),
    };
    const klid = Float32Array.of(0, 0, 4, 0, 4, -1);
    const ted = Float32Array.of(0, 0, 4, -0.01, 4, -1.04);
    expect(nejvetsiVychylka(stavba, klid, ted)).toBeCloseTo(0.01, 6);
    expect(nejvetsiPohybZavazi(stavba, klid, ted)).toBeCloseTo(0.03, 6);
  });
});

describe("ladění tlumiče", () => {
  it("tlumič naladěný na rytmus běžců (cíl, který hra ukazuje) tlumí aspoň tak dobře jako ladění autora a líp než na číslo soustavy", () => {
    const u = uroven("5-02");
    const navrh = RESENI["5-02"]!.pruchod;
    const rozbor = rozeberMost(u, navrh);
    // Cíl: nejsilnější složka kroku, která most bez tlumičů rozkmitá nejvíc.
    const cil = rozbor.odhadBezTlumicu!.skupiny[0]!.slozky[0]!.frekvence;
    expect(cil).toBeCloseTo(2.6, 6);
    const naKrok = (f: number): number => Math.round(f / 0.05) * 0.05;
    const preladeny = (f: number): NavrhMostu => ({
      ...navrh,
      stycniky: navrh.stycniky.map((s) => (s.tlumic ? { ...s, tlumic: { ...s.tlumic, frekvence: naKrok(f) } } : s)),
    });
    const podleHry = zkousej(u, preladeny(cil)).vysledek;
    const podleAutora = zkousej(u, navrh).vysledek;
    // Recenze: hráč ladil na frekvenci „s lidmi“ z osy, která tehdy tlumič už obsahovala.
    const podleSoustavy = zkousej(u, preladeny(rozbor.frekvenceObsazeneho[0]!)).vysledek;
    expect(podleHry.pruchod).toBe(true);
    expect(podleHry.komfort!.zrychleni).toBeLessThanOrEqual(podleAutora.komfort!.zrychleni + 1e-9);
    expect(podleHry.komfort!.zrychleni).toBeLessThan(podleSoustavy.komfort!.zrychleni);
    // A bez tlumiče most neprojde vůbec.
    const bez = zkousej(u, { ...navrh, stycniky: navrh.stycniky.map(({ tlumic: _t, ...s }) => s) }).vysledek;
    expect(bez.pruchod).toBe(false);
    expect(podleHry.komfort!.zrychleni).toBeLessThan(0.6 * bez.komfort!.zrychleni);
  }, 60_000);
});
