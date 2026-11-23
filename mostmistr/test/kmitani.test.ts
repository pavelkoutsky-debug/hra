// Kmitání čitelně pro hráče: složky síly kroku, frekvence kmitání ze záznamu, příčina
// kmitání, shody rytmů s vlastními frekvencemi mostu a nové údaje výsledku zkoušky.
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { MEZE_KOMFORTU } from "../src/jadro/komfort";
import {
  dominantniFrekvence,
  frekvenceKmitani,
  hlavniShoda,
  mostProHrace,
  nejblizsiTvar,
  nejvyssiSlozka,
  PASMO_BLIZKO,
  PASMO_SHODY,
  pricinaKmitani,
  ROZSAH_FREKVENCI,
  shodyRytmu,
  SILNA_SLOZKA,
  slozkyKroku,
  type SlozkaKroku,
} from "../src/zkouska/kmitani";
import { KRIVKA_DO, POCET_FREKVENCI, rozeberMost } from "../src/zkouska/rozbor";
import { prazdnySnimek, Zaznam, type Topologie } from "../src/zkouska/zaznam";
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
  const beh = [slozka("utvar", 3, 1, 1.57), slozka("utvar", 3, 2, 0.67), slozka("chodec", 1.9, 3, 0.1)];

  it("přiřadí změřené frekvenci nejbližší složku kroku; daleko od všech žádnou", () => {
    expect(pricinaKmitani(6.04, beh, null).slozka).toMatchObject({ druh: "utvar", nasobek: 2 });
    expect(pricinaKmitani(5.72, beh, null).slozka).toMatchObject({ druh: "chodec", nasobek: 3 });
    expect(pricinaKmitani(3.1, beh, null).slozka).toMatchObject({ nasobek: 1 });
    expect(pricinaKmitani(4.5, beh, null).slozka).toBeNull();
    // Dav nejde jedním rytmem: jeho pásmo se počítá celé.
    const dav = [slozka("dav", 1.7, 1, 0.28, 0.15)];
    expect(pricinaKmitani(1.95, dav, null).slozka).toMatchObject({ druh: "dav" });
    expect(pricinaKmitani(2.3, dav, null).slozka).toBeNull();
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

describe("shody rytmů s vlastními frekvencemi", () => {
  const u = uroven("2-02");
  const slozky = slozkyKroku(u);

  it("silný běh kus od vlastní frekvence má přednost před slabým trojnásobkem kroku přímo u ní", () => {
    // Referenční most 2-02: 5,30 Hz (s lidmi 5,23). Trojnásobek kroku chodce 5,7 Hz je do 8 %,
    // dvojnásobek běhu 6,0 Hz o 13 %, ale je skoro sedmkrát silnější.
    const vyber = hlavniShoda(shodyRytmu(slozky, { frekvence: [5.3], frekvenceObsazeneho: [5.23] }));
    expect(vyber.hlavni).toMatchObject({ poradi: 1, slozka: { druh: "utvar", nasobek: 2 } });
    expect(vyber.uVlastni).toBe(false);
    expect(vyber.hlavni!.odstup).toBeGreaterThan(PASMO_SHODY);
    expect(vyber.hlavni!.odstup).toBeLessThan(PASMO_BLIZKO);
    expect(vyber.vsechny).toHaveLength(2);
  });

  it("složka mezi obsazeným a prázdným mostem má nulový odstup a je „u“ vlastní frekvence", () => {
    const vyber = hlavniShoda(shodyRytmu(slozky, { frekvence: [6.22], frekvenceObsazeneho: [6.13] }));
    expect(vyber.hlavni).toMatchObject({ slozka: { druh: "utvar", nasobek: 2 } });
    expect(vyber.uVlastni).toBe(true);
    const uvnitr = shodyRytmu([{ druh: "utvar", rytmus: 2, nasobek: 1, frekvence: 2, sila: 0.4, pasmo: 0 }], { frekvence: [2.17], frekvenceObsazeneho: [1.96] });
    expect(uvnitr[0]!.odstup).toBe(0);
  });

  it("most daleko od všech rytmů žádnou shodu nemá; slabá složka dál než 8 % za řeč nestojí", () => {
    expect(hlavniShoda(shodyRytmu(slozky, { frekvence: [9.2], frekvenceObsazeneho: [9.0] })).hlavni).toBeNull();
    // 2-03: krok 2,3 Hz (0,50 váhy, není „silný“) a most na 1,99 Hz: 16 % daleko.
    const pochod = slozkyKroku(uroven("2-03"));
    const vyber = hlavniShoda(shodyRytmu(pochod, { frekvence: [1.99], frekvenceObsazeneho: [1.92] }));
    expect(vyber.hlavni).toBeNull();
    expect(vyber.uVlastni).toBe(false);
  });

  it("shodu najde i u druhé vlastní frekvence", () => {
    const pochod = slozkyKroku(uroven("2-03"));
    const vyber = hlavniShoda(shodyRytmu(pochod, { frekvence: [1.99, 7.0], frekvenceObsazeneho: [1.92, 6.8] }));
    expect(vyber.hlavni).toMatchObject({ poradi: 2, slozka: { nasobek: 3 } });
    expect(vyber.uVlastni).toBe(true);
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
    const pricina = pricinaKmitani(f, slozkyKroku(u), mostProHrace(rozeberMost(u, navrh)));
    expect(pricina.slozka).toMatchObject({ druh: "utvar", nasobek: 2, rytmus: 3 });
    expect(pricina.tvar).toMatchObject({ poradi: 1 });
  });

  it("most, který kmitá na trojnásobku kroku, taky; a ten, který projde, mez nepřekročí", () => {
    const u = uroven("2-04");
    const navrh = pad("2-04", "trojnásobku");
    const { vysledek, zaznam } = zkousej(u, navrh);
    const f = frekvenceKmitani(zaznam, vysledek.komfort!.stycnik, vysledek.komfort!.cas)!;
    expect(pricinaKmitani(f, slozkyKroku(u), null).slozka).toMatchObject({ nasobek: 3 });
    const dobry = zkousej(uroven("2-03"), RESENI["2-03"]!.pruchod).vysledek;
    expect(dobry.pruchod).toBe(true);
    expect(dobry.komfort!.prekroceno).toBeNull();
    expect(dobry.komfort!.zrychleni).toBeLessThanOrEqual(MEZE_KOMFORTU[2]);
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
    // Visutý most s dopnutými lany drží tvar; s povolenými napínáky visí hluboko.
    const visuty = RESENI["4-04"]!.pruchod;
    expect(rozeberMost(uroven("4-04"), visuty).pruves!.metru).toBeLessThan(0.1);
    const povoleny: NavrhMostu = { ...visuty, pruty: visuty.pruty.map(({ predpeti: _p, ...p }) => p) };
    const rozbor = rozeberMost(uroven("4-04"), povoleny);
    if (rozbor.stabilni) {
      expect(rozbor.pruves!.metru).toBeGreaterThan(0.1);
      expect(rozbor.pruves!.stycnik).toBeLessThan(povoleny.stycniky.length);
    }
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

describe("kritérium M11: osa frekvencí a ladění tlumiče říkají totéž co zkouška", () => {
  it("každý referenční most, který propadne jen na kmitání, má na ose varování nebo upozornění", () => {
    let mostu = 0;
    for (const u of kampan) {
      const slozky = slozkyKroku(u);
      if (slozky.length === 0 || !u.osaFrekvenci) continue;
      for (const { nazev, navrh } of RESENI[u.id]!.pady) {
        const rozbor = rozeberMost(u, navrh);
        if (!rozbor.stabilni) continue;
        const { vysledek } = zkousej(u, navrh);
        const naKmitani = vysledek.komfort !== null && vysledek.komfort.prekroceno !== null && vysledek.poruseni === 0 && vysledek.spadlo === 0;
        if (!naKmitani) continue;
        mostu += 1;
        const vyber = hlavniShoda(shodyRytmu(slozky, mostProHrace(rozbor)));
        expect(vyber.hlavni, `${u.id} ${nazev}`).not.toBeNull();
      }
    }
    expect(mostu).toBeGreaterThanOrEqual(9);
  }, 180_000);

  it("mosty hráčů z recenze (2-02 na 5,09 a 7,32 Hz, osa tehdy mlčela) by teď upozornění dostaly", () => {
    const slozky = slozkyKroku(uroven("2-02"));
    for (const [prazdny, obsazeny] of [
      [5.09, 5.02],
      [7.32, 7.2],
    ] as const) {
      const vyber = hlavniShoda(shodyRytmu(slozky, { frekvence: [prazdny], frekvenceObsazeneho: [obsazeny] }));
      expect(vyber.hlavni, `${prazdny} Hz`).toMatchObject({ slozka: { druh: "utvar", nasobek: 2 } });
      expect(vyber.uVlastni).toBe(false);
    }
  });

  it("tlumič naladěný na most bez tlumičů (cíl, který hra ukazuje) tlumí líp než naladěný na číslo soustavy s tlumičem", () => {
    const u = uroven("5-02");
    const navrh = RESENI["5-02"]!.pruchod;
    const rozbor = rozeberMost(u, navrh);
    const cil = rozbor.bezTlumicu!.obsazeny[0]!;
    const naKrok = (f: number): number => Math.round(f / 0.05) * 0.05;
    const preladeny = (f: number): NavrhMostu => ({
      ...navrh,
      stycniky: navrh.stycniky.map((s) => (s.tlumic ? { ...s, tlumic: { ...s.tlumic, frekvence: naKrok(f) } } : s)),
    });
    const podleHry = zkousej(u, preladeny(cil)).vysledek;
    // Recenze: hráč ladil na frekvenci „s lidmi“ z osy, která tehdy tlumič už obsahovala.
    const podleSoustavy = zkousej(u, preladeny(rozbor.frekvenceObsazeneho[0]!)).vysledek;
    expect(podleHry.pruchod).toBe(true);
    expect(podleHry.komfort!.zrychleni).toBeLessThan(podleSoustavy.komfort!.zrychleni);
    // A bez tlumiče most neprojde vůbec.
    const bez = zkousej(u, { ...navrh, stycniky: navrh.stycniky.map(({ tlumic: _t, ...s }) => s) }).vysledek;
    expect(bez.pruchod).toBe(false);
    expect(podleHry.komfort!.zrychleni).toBeLessThan(0.6 * bez.komfort!.zrychleni);
  }, 60_000);
});
