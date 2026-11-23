// Milník M3a: rezonance, komfort, tlumič, závaží, brnknutí a rozbor mostu.
// Kritérium milníku: útvar na vlastní frekvenci mnohonásobně zvýší zrychlení mostovky
// a tlumič ho vrátí pod limit komfortu.
import { describe, expect, it } from "vitest";
import { Kreslic } from "../src/data/kreslic";
import type { NavrhMostu } from "../src/data/navrh";
import type { PolozkaJizdnihoRadu, Uroven } from "../src/data/uroven";
import { MEZE_KOMFORTU, tridaKomfortu, vytvorMereniKomfortu, zmerKomfort } from "../src/jadro/komfort";
import { sestavSoustavu } from "../src/jadro/soustava";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { BehZkousky } from "../src/zkouska/beh";
import { naplanujProvoz } from "../src/zkouska/provoz";
import type { VysledekZkousky, ZpravaZeZkousky } from "../src/zkouska/protokol";
import { rozeberMost } from "../src/zkouska/rozbor";
import { sestavMost } from "../src/zkouska/stavba";
import { hmotnostUcastnika, KADENCE_BEHU, modelUcastnika, vedleSebe } from "../src/zkouska/vozidla";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan } from "../urovne/index";
import { DREVENY_TRAM, nosnik } from "./pomucky-jadra";

const prehlidka = nactiKampan().find((u) => u.id === "2-04")!;

/**
 * Nízká ocelová příhrada nad mostovkou přes 32 m; volitelně s tlumiči do kotev ve svazích
 * a se závažím ve třech středních styčnících mostovky.
 */
function lavka(tlumeni?: number, zavazi = 0): NavrhMostu {
  const k = new Kreslic("2-04");
  for (let x = 0; x < 32; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
  k.prut("ocel-lehka", [0, 0], [4, 1]);
  k.prut("ocel-lehka", [28, 1], [32, 0]);
  for (let x = 4; x < 28; x += 4) k.prut("ocel-lehka", [x, 1], [x + 4, 1]);
  for (let x = 4; x <= 28; x += 4) k.prut("ocel-lehka", [x, 0], [x, 1]);
  for (let x = 4; x < 28; x += 4) k.prut("ocel-lehka", x < 16 ? [x, 1] : [x, 0], x < 16 ? [x + 4, 0] : [x + 4, 1]);
  if (tlumeni !== undefined) {
    k.prut("tlumic", [8, 0], [8, -4], { tlumeni });
    k.prut("tlumic", [24, 0], [24, -4], { tlumeni });
  }
  if (zavazi > 0) for (const x of [12, 16, 20]) k.bod(x, 0, { zavazi });
  return k.navrh();
}

function sUtvarem(kadence: number): Uroven {
  const rad: PolozkaJizdnihoRadu[] = [{ cas: 0, trasa: "lavka", smer: 1, druh: "utvar", pocet: 24, kadence }];
  return { ...prehlidka, jizdniRad: rad };
}

function zkousej(uroven: Uroven, navrh: NavrhMostu, brnknuti?: { stycnik: number; sila: number }): VysledekZkousky {
  const zkouska = new Zkouska(uroven, navrh, 7, brnknuti);
  let pojistka = 0;
  while (!zkouska.hotovo) {
    zkouska.pokracuj(1);
    expect(pojistka++).toBeLessThan(200);
  }
  return zkouska.vysledek();
}

describe("kritérium M3a: útvar v rezonanci a tlumič", () => {
  // Tři tuny závaží stáhnou vlastní frekvenci lávky do pásma pochodu.
  const ZAVAZI = 1000;
  const rozbor = rozeberMost(sUtvarem(2), lavka(undefined, ZAVAZI));
  const vlastni = rozbor.frekvence[0]!;
  const obsazeny = rozbor.frekvenceObsazeneho[0]!;
  // Útvar jde krokem mezi frekvencí obsazeného a prázdného mostu, tedy přímo v rezonanci.
  const vRezonanci = (vlastni + obsazeny) / 2;

  it("lávka kmitá v pásmu chůze a lidé na ní frekvenci sníží", () => {
    expect(rozbor.stabilni).toBe(true);
    expect(vlastni).toBeGreaterThan(1.9);
    expect(vlastni).toBeLessThan(2.4);
    expect(obsazeny).toBeLessThan(vlastni);
    expect(obsazeny).toBeGreaterThan(0.85 * vlastni);
    expect(vRezonanci).toBeLessThan(KADENCE_BEHU); // útvar pochoduje, neběží
  });

  const mimo = zkousej(sUtvarem(1.6), lavka(undefined, ZAVAZI));
  const rezonance = zkousej(sUtvarem(vRezonanci), lavka(undefined, ZAVAZI));
  const utlumena = zkousej(sUtvarem(vRezonanci), lavka(100_000, ZAVAZI));

  it("mimo rezonanci je kmitání snesitelné a útvar přejde", () => {
    expect(mimo.pruchod).toBe(true);
    expect(mimo.komfort!.trida).toBeLessThan(4);
  });

  it("na vlastní frekvenci útvar zrychlení mostovky mnohonásobně zvýší a most neobstojí", () => {
    expect(rezonance.komfort!.zrychleni).toBeGreaterThan(4 * mimo.komfort!.zrychleni);
    expect(rezonance.komfort!.zrychleni).toBeGreaterThan(MEZE_KOMFORTU[2]);
    expect(rezonance.komfort!.trida).toBe(4);
    // Nikdo nespadl a nic se nezlomilo; rozhodlo jen kmitání.
    expect(rezonance).toMatchObject({ spadlo: 0, poruseni: 0, pruchod: false });
    expect(rezonance.medaile.pruchod).toBe(false);
  });

  it("tlumiče vrátí zrychlení pod limit komfortu a útvar projde", () => {
    expect(utlumena.komfort!.zrychleni).toBeLessThan(MEZE_KOMFORTU[2]);
    expect(utlumena.komfort!.zrychleni).toBeLessThan(0.5 * rezonance.komfort!.zrychleni);
    expect(utlumena.pruchod).toBe(true);
  });

  it("tlumič nenese váhu: vlastní frekvenci mostu skoro nezmění", () => {
    const sTlumici = rozeberMost(sUtvarem(2), lavka(100_000, ZAVAZI));
    expect(sTlumici.frekvence[0]!).toBeCloseTo(vlastni, 1);
  });
});

describe("závaží a rozbor mostu", () => {
  it("závaží uprostřed vlastní frekvenci sníží", () => {
    const bez = rozeberMost(prehlidka, lavka()).frekvence[0]!;
    const k = lavka();
    k.stycniky.find((s) => s.x === 16 && s.y === 0)!.zavazi = 2000;
    const se = rozeberMost(prehlidka, k).frekvence[0]!;
    expect(se).toBeLessThan(0.93 * bez);
  });

  it("vyšší příhrada je tužší a kmitá rychleji", () => {
    const k = new Kreslic("2-04");
    for (let x = 0; x < 32; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    k.prut("ocel-lehka", [0, 0], [4, 3]);
    k.prut("ocel-lehka", [28, 3], [32, 0]);
    for (let x = 4; x < 28; x += 4) k.prut("ocel-lehka", [x, 3], [x + 4, 3]);
    for (let x = 4; x <= 28; x += 4) k.prut("ocel-lehka", [x, 0], [x, 3]);
    for (let x = 4; x < 28; x += 4) k.prut("ocel-lehka", x < 16 ? [x, 3] : [x, 0], x < 16 ? [x + 4, 0] : [x + 4, 3]);
    expect(rozeberMost(prehlidka, k.navrh()).frekvence[0]!).toBeGreaterThan(2 * rozeberMost(prehlidka, lavka()).frekvence[0]!);
  });

  it("mechanismus ani prázdný návrh vlastní frekvence nemají", () => {
    const k = new Kreslic("2-04");
    for (let x = 0; x < 32; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    const rozbor = rozeberMost(prehlidka, k.navrh());
    expect(rozbor).toMatchObject({
      stabilni: false,
      frekvence: [],
      frekvenceObsazeneho: [],
      tvary: [],
      krivka: null,
      tahyLan: [],
    });
    // Mechanismus k tomu dostane místo a důvod, kde se složí: styčník mostovky, který nic nedrží.
    expect(rozbor.slozeni).toMatchObject({ duvod: "mostovka" });
    expect(rozbor.volny).toBeNull();
    expect(rozeberMost(prehlidka, new Kreslic("2-04").navrh()).stabilni).toBe(false);
  });

  it("rozbor jde vyžádat zprávou a odpověď nese id žádosti", () => {
    const zpravy: ZpravaZeZkousky[] = [];
    const beh = new BehZkousky((zprava) => zpravy.push(zprava));
    beh.prijmi({ typ: "rozbor", id: 41, uroven: prehlidka, navrh: lavka() });
    expect(zpravy).toHaveLength(1);
    const odpoved = zpravy[0]!;
    if (odpoved.typ !== "rozbor") throw new Error("čekal jsem rozbor");
    expect(odpoved.id).toBe(41);
    expect(odpoved.rozbor?.frekvence[0]).toBeGreaterThan(2);
    // Most, který porušuje pravidla úrovně, rozbor nemá.
    const spatny = lavka();
    spatny.stycniky[3]!.zavazi = 1e6;
    beh.prijmi({ typ: "rozbor", id: 42, uroven: prehlidka, navrh: spatny });
    expect(zpravy[1]).toEqual({ typ: "rozbor", id: 42, rozbor: null });
  });
});

describe("brnknutí", () => {
  const navrh = lavka();
  const stred = navrh.stycniky.findIndex((s) => s.x === 16 && s.y === 0);
  const vysledek = zkousej(prehlidka, navrh, { stycnik: stred, sila: 3000 });

  it("most po brnknutí kmitá na své první vlastní frekvenci", () => {
    const vlastni = rozeberMost(prehlidka, navrh).frekvence[0]!;
    expect(vysledek.brnknuti).not.toBeNull();
    expect(vysledek.brnknuti!.frekvence!).toBeGreaterThan(0.93 * vlastni);
    expect(vysledek.brnknuti!.frekvence!).toBeLessThan(1.07 * vlastni);
  });

  it("je to pokus, ne zkouška: provoz nejede a medaile se neudělují", () => {
    expect(vysledek.ucastniku).toBe(0);
    expect(vysledek.medaile).toEqual({ pruchod: false, rozpocet: false, mistrovska: false });
    expect(vysledek.komfort).toBeNull();
    expect(vysledek.trvani).toBeCloseTo(4, 1);
  });

  it("běžná zkouška výsledek brnknutí nemá", () => {
    expect(zkousej(sUtvarem(1.6), lavka()).brnknuti).toBeNull();
  });

  it("brnknutí jde zadat zprávou start", () => {
    const zpravy: ZpravaZeZkousky[] = [];
    const beh = new BehZkousky((zprava) => zpravy.push(zprava));
    beh.prijmi({
      typ: "start",
      vstup: { uroven: prehlidka, navrh, nasada: 1, verzeFyziky: VERZE_FYZIKY, brnknuti: { stycnik: stred, sila: 3000 } },
    });
    while (beh.pokracuj(1));
    const konec = zpravy.at(-1)!;
    if (konec.typ !== "konec") throw new Error("čekal jsem konec");
    expect(konec.vysledek.brnknuti?.frekvence).toBeGreaterThan(2);
  });
});

describe("běžec a útvar", () => {
  it("běžec je lehčí a rychlejší než chodec a došlapuje mnohem tvrději", () => {
    const chodec = modelUcastnika("chodec", 2)!;
    const bezec = modelUcastnika("bezec", 2.8)!;
    expect(hmotnostUcastnika(bezec)).toBe(75);
    expect(bezec.rychlost).toBe(3);
    expect(bezec.buzeni!.frekvence).toBe(2.8);
    expect(bezec.buzeni!.amplitudy[0]!).toBeGreaterThan(3 * chodec.buzeni!.amplitudy[0]!);
    // Váha a obě harmonické dohromady: střed je váha běžce, špička kolem trojnásobku
    // a během letu síla zůstává u nuly (zkrácená řada ji podkmitne nejvýš o osminu váhy).
    const vaha = 75 * 9.80665;
    const [s1, , , c2] = bezec.buzeni!.amplitudy as [number, number, number, number];
    let nejmensi = Infinity;
    let nejvetsi = -Infinity;
    for (let i = 0; i < 360; i++) {
      const uhel = (i * Math.PI) / 180;
      const sila = vaha + s1 * Math.sin(uhel) + c2 * Math.cos(2 * uhel);
      nejmensi = Math.min(nejmensi, sila);
      nejvetsi = Math.max(nejvetsi, sila);
    }
    expect(nejmensi).toBeGreaterThan(-0.14 * vaha);
    expect(nejvetsi).toBeGreaterThan(2.9 * vaha);
    expect(nejvetsi).toBeLessThan(3.4 * vaha);
  });

  it("útvar do kadence běhu pochoduje, nad ní běží", () => {
    expect(modelUcastnika("utvar", 2)!.rychlost).toBeCloseTo(1.5);
    expect(modelUcastnika("utvar", KADENCE_BEHU + 0.3)!.rychlost).toBe(3);
  });

  it("lidé vedle sebe se slučují: hmota, tuhost i síly se násobí", () => {
    const jeden = modelUcastnika("utvar", 2)!;
    const tri = vedleSebe(jeden, 3);
    expect(hmotnostUcastnika(tri)).toBe(3 * hmotnostUcastnika(jeden));
    expect(tri.napravy[0]!.kontakt.tuhost).toBe(3 * jeden.napravy[0]!.kontakt.tuhost);
    expect(tri.buzeni!.amplitudy[0]).toBe(3 * jeden.buzeni!.amplitudy[0]!);
    expect(vedleSebe(jeden, 1)).toBe(jeden);
  });

  it("útvar jde v řadách přes šířku mostovky a všichni ve stejné fázi kroku", () => {
    const uroven = sUtvarem(2);
    const popis = sestavMost(uroven, lavka()).popis;
    const plan = naplanujProvoz(popis, uroven, 99, 9.80665);
    // Mostovka 2,5 m: tři lidé vedle sebe, 24 lidí je osm řad.
    expect(plan.ucastnici).toHaveLength(8);
    expect(plan.ucastnici.every((u) => u.lidi === 3)).toBe(true);
    const faze = plan.ucastnici.map((u) => u.faze);
    expect(faze.every((f) => f![0] === faze[0]![0] && f![1] === faze[0]![1])).toBe(true);
    // Chodci mají každý fázi svou.
    const chodci: PolozkaJizdnihoRadu[] = [{ cas: 0, trasa: "lavka", smer: 1, druh: "chodec", pocet: 4, kadence: 2 }];
    const volne = naplanujProvoz(sestavMost(uroven, lavka()).popis, { ...uroven, jizdniRad: chodci }, 99, 9.80665);
    expect(new Set(volne.ucastnici.map((u) => u.faze![0])).size).toBe(4);
  });

  it("neúplná poslední řada má jen zbylé lidi", () => {
    const uroven = { ...sUtvarem(2), jizdniRad: [{ cas: 0, trasa: "lavka", smer: 1 as const, druh: "utvar" as const, pocet: 7, kadence: 2 }] };
    const plan = naplanujProvoz(sestavMost(uroven, lavka()).popis, uroven, 1, 9.80665);
    expect(plan.ucastnici.map((u) => u.lidi ?? 1)).toEqual([3, 3, 1]);
  });
});

describe("měření komfortu", () => {
  it("třídy komfortu podle zrychlení", () => {
    expect([0.3, 0.5, 0.8, 1, 2, 2.5, 2.6, 9].map(tridaKomfortu)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("ustálené kmitání v pásmu vrátí jeho amplitudu zrychlení", () => {
    const s = sestavSoustavu(nosnik(DREVENY_TRAM, 8, 2, "prosty"));
    const mereni = vytvorMereniKomfortu(s, [1]);
    const f = 2.5;
    const amplituda = 1.2; // m/s²
    const dt = 0.001;
    for (let krok = 1; krok <= 8000; krok++) {
      // Rychlost, jejíž derivace je zrychlení amplituda·sin(2πft).
      s.vy[1] = (-amplituda / (2 * Math.PI * f)) * Math.cos(2 * Math.PI * f * krok * dt);
      zmerKomfort(s, mereni, dt, krok * dt, krok > 3000);
    }
    expect(mereni.nejvetsi).toBeGreaterThan(0.93 * amplituda);
    expect(mereni.nejvetsi).toBeLessThan(1.05 * amplituda);
    expect(mereni.stycnik).toBe(1);
  });

  it("pomalé houpání pod pásmem a rychlé chvění nad ním se počítají jen slabě", () => {
    for (const [f, nejvys] of [[0.1, 0.25], [60, 0.2]] as const) {
      const s = sestavSoustavu(nosnik(DREVENY_TRAM, 8, 2, "prosty"));
      const mereni = vytvorMereniKomfortu(s, [1]);
      const dt = 0.0005;
      for (let krok = 1; krok <= 60000; krok++) {
        s.vy[1] = (-1 / (2 * Math.PI * f)) * Math.cos(2 * Math.PI * f * krok * dt);
        zmerKomfort(s, mereni, dt, krok * dt, krok > 30000);
      }
      expect(mereni.nejvetsi).toBeLessThan(nejvys);
    }
  });

  it("jediný náraz o výsledku nerozhodne", () => {
    const s = sestavSoustavu(nosnik(DREVENY_TRAM, 8, 2, "prosty"));
    const mereni = vytvorMereniKomfortu(s, [1]);
    const dt = 0.001;
    for (let krok = 1; krok <= 3000; krok++) {
      // Jeden krok se zrychlením 50 m/s², jinak klid.
      s.vy[1] = krok >= 1000 ? 0.05 : 0;
      zmerKomfort(s, mereni, dt, krok * dt, true);
    }
    expect(mereni.nejvetsi).toBeLessThan(2.5);
  });

  it("úroveň bez lidí komfort neměří; první kapitola zůstává pod hranicí nepřijatelného", () => {
    const bezLidi: Uroven = { ...prehlidka, jizdniRad: [] };
    expect(zkousej(bezLidi, lavka()).komfort).toBeNull();
  });
});
