// Režie zpomaleného záběru na první porušení: průběh v čase, pohled a výběr místa.
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import type { PolozkaJizdnihoRadu, Uroven } from "../src/data/uroven";
import {
  jenKloub,
  konecZaberu,
  miraObrazu,
  miraPohledu,
  miraZpomaleni,
  pohledZaberu,
  prvniPorucha,
  rychlostVZaberu,
  sledovaneMisto,
  smichejPohledy,
  tempoZaberu,
  zacatekZaberu,
  ZABER,
  zaberNaPoruchu,
  type UdalostZaberu,
} from "../src/hra/rezie";
import { NASLEDEK_KLOUB } from "../src/jadro/poruseni";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { BehZkousky } from "../src/zkouska/beh";
import type { Udalost, ZpravaZeZkousky } from "../src/zkouska/protokol";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";
import { mistoPrutu, prazdnySnimek, Zaznam } from "../src/zkouska/zaznam";
import { MERITKO_MAX } from "../src/vykres/kamera";

const PRVKY = ["mostovka-drevo", "drevo-lehke", "drevo-tezke"] as const;
const AUTO: PolozkaJizdnihoRadu = { cas: 0.5, trasa: "silnice", smer: 1, druh: "auto" };
const NAKLADNI: PolozkaJizdnihoRadu = { cas: 0.5, trasa: "silnice", smer: 1, druh: "nakladni" };

function uroven(jizdniRad: PolozkaJizdnihoRadu[]): Uroven {
  return { ...urovenRegrese({ rozpeti: 12, sirka: 3, vybaveni: 100 }), povolenePrvky: [...PRVKY], jizdniRad };
}

/** Jen mostovka: tři kloubově spojená pole bez ztužení, tedy mechanismus. */
function jenMostovka(): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < 12; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
  return k.navrh();
}

/** Nízká příhrada (výška 1 m) z lehkého dřeva: vlastní tíhu unese, nákladní auto ne. */
function slabaPrihrada(): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < 12; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
  k.prut("drevo-lehke", [0, 0], [4, 1]);
  k.prut("drevo-lehke", [4, 1], [8, 1]);
  k.prut("drevo-lehke", [8, 1], [12, 0]);
  k.prut("drevo-lehke", [4, 0], [4, 1]);
  k.prut("drevo-lehke", [8, 0], [8, 1]);
  k.prut("drevo-lehke", [4, 1], [8, 0]);
  return k.navrh();
}

interface Prubeh {
  zaznam: Zaznam;
  udalosti: Udalost[];
  bezRovnovahy: boolean;
}

function zkousej(navrh: NavrhMostu, vozidlo = AUTO): Prubeh {
  const zpravy: ZpravaZeZkousky[] = [];
  const beh = new BehZkousky((zprava) => zpravy.push(zprava));
  beh.prijmi({ typ: "start", vstup: { uroven: uroven([vozidlo]), navrh, nasada: 7, verzeFyziky: VERZE_FYZIKY } });
  const zacatek = zpravy[0]!;
  if (zacatek.typ !== "zacatek") throw new Error(`Zkouška nezačala: ${JSON.stringify(zacatek)}`);
  let pojistka = 0;
  while (beh.pokracuj(0.5)) expect(pojistka++).toBeLessThan(400);
  const zaznam = new Zaznam();
  const udalosti: Udalost[] = [];
  for (const zprava of zpravy) {
    if (zprava.typ !== "zaznam") continue;
    zprava.topologie.forEach((t) => zaznam.pridejTopologii(t));
    zprava.snimky.forEach((s) => zaznam.pridej(s));
    udalosti.push(...zprava.udalosti);
  }
  return { zaznam, udalosti, bezRovnovahy: zacatek.bezRovnovahy };
}

describe("průběh záběru v čase", () => {
  const okamzik = 3;

  it("mimo záběr je míra nulová, kolem porušení plná", () => {
    expect(miraZpomaleni(okamzik - ZABER.najezd - 0.01, okamzik)).toBe(0);
    expect(miraZpomaleni(okamzik - ZABER.pred, okamzik)).toBe(1);
    expect(miraZpomaleni(okamzik, okamzik)).toBe(1);
    expect(miraZpomaleni(okamzik + ZABER.drzeni, okamzik)).toBe(1);
    expect(miraZpomaleni(okamzik + ZABER.drzeni + ZABER.odjezd, okamzik)).toBe(0);
    expect(miraZpomaleni(100, okamzik)).toBe(0);
  });

  it("nabíhá a doznívá plynule, bez skoku", () => {
    let predchozi = 0;
    let nejvetsiSkok = 0;
    for (let cas = okamzik - 0.5; cas <= okamzik + 2; cas += 0.002) {
      const mira = miraZpomaleni(cas, okamzik);
      expect(mira).toBeGreaterThanOrEqual(0);
      expect(mira).toBeLessThanOrEqual(1);
      nejvetsiSkok = Math.max(nejvetsiSkok, Math.abs(mira - predchozi));
      predchozi = mira;
    }
    expect(nejvetsiSkok).toBeLessThan(0.03);
  });

  it("před porušením jen roste, po něm jen klesá", () => {
    for (let cas = okamzik - 0.4; cas < okamzik; cas += 0.01) {
      expect(miraZpomaleni(cas + 0.01, okamzik)).toBeGreaterThanOrEqual(miraZpomaleni(cas, okamzik));
    }
    for (let cas = okamzik; cas < okamzik + 1.5; cas += 0.01) {
      expect(miraZpomaleni(cas + 0.01, okamzik)).toBeLessThanOrEqual(miraZpomaleni(cas, okamzik));
    }
  });

  it("pohled se vrací až po zpomalení: zřícení je nejdřív vidět zblízka", () => {
    const poZpomaleni = okamzik + ZABER.drzeni + ZABER.odjezd / 2;
    expect(miraZpomaleni(poZpomaleni, okamzik)).toBeLessThan(1);
    expect(miraPohledu(poZpomaleni, okamzik)).toBe(1);
    expect(miraPohledu(konecZaberu(okamzik), okamzik)).toBe(0);
    expect(miraPohledu(konecZaberu(okamzik) - 0.05, okamzik)).toBeGreaterThan(0);
    // Dokud běží zpomalení, pohled je aspoň tak blízko, jak je čas pomalý.
    for (let cas = okamzik - 0.4; cas < konecZaberu(okamzik); cas += 0.01) {
      expect(miraPohledu(cas, okamzik)).toBeGreaterThanOrEqual(miraZpomaleni(cas, okamzik) - 1e-12);
    }
  });

  it("záběr, který začal pozdě, se do obrazu vmísí bez skoku", () => {
    // Běžně je míra obrazu míra pohledu.
    for (let cas = okamzik - 0.4; cas < konecZaberu(okamzik); cas += 0.01) {
      expect(miraObrazu(cas, okamzik, okamzik - ZABER.najezd, 0)).toBe(miraPohledu(cas, okamzik));
    }
    // Začal těsně před porušením, kdy už měl být skoro celý: začíná od nuly a dožene se.
    const od = okamzik - 0.05;
    const nabeh = miraPohledu(od, okamzik);
    expect(nabeh).toBeGreaterThan(0.9);
    expect(miraObrazu(od, okamzik, od, nabeh)).toBeCloseTo(0, 12);
    let predchozi = 0;
    for (let cas = od; cas <= od + ZABER.vmiseni; cas += 0.002) {
      const mira = miraObrazu(cas, okamzik, od, nabeh);
      expect(mira).toBeGreaterThanOrEqual(predchozi - 1e-12);
      expect(mira - predchozi).toBeLessThan(0.12);
      predchozi = mira;
    }
    expect(miraObrazu(od + ZABER.vmiseni, okamzik, od, nabeh)).toBe(miraPohledu(od + ZABER.vmiseni, okamzik));
  });

  it("celý záběr trvá ve skutečném čase pár sekund", () => {
    // Skutečný čas = součet dílků děje dělených rychlostí přehrávání.
    let skutecny = 0;
    const krok = 0.001;
    for (let cas = okamzik - ZABER.najezd; cas < konecZaberu(okamzik); cas += krok) {
      skutecny += krok / rychlostVZaberu(1, miraZpomaleni(cas, okamzik));
    }
    expect(skutecny).toBeGreaterThan(3);
    expect(skutecny).toBeLessThan(7);
  });
});

describe("tempo záběru", () => {
  const okamzik = 5;

  it("při pomalém přehrávání se časy záběru úměrně zkrátí, ať netrvá čtvrt minuty", () => {
    expect(tempoZaberu(1, false)).toBe(1);
    expect(tempoZaberu(4, false)).toBe(1);
    expect(tempoZaberu(0.25, false)).toBe(4);
    expect(tempoZaberu(0.1, false)).toBeCloseTo(10, 9);
    expect(tempoZaberu(1, true)).toBe(2);
    // Skutečná doba záběru při ⅒× (čas tam záběr nezpomaluje) je srovnatelná s dobou při 1×.
    const doba = (rychlost: number): number => {
      const tempo = tempoZaberu(rychlost, false);
      let skutecny = 0;
      const krok = 0.0005;
      for (let cas = zacatekZaberu(okamzik, tempo); cas < konecZaberu(okamzik, tempo); cas += krok) {
        skutecny += krok / rychlostVZaberu(rychlost, miraZpomaleni(cas, okamzik, tempo));
      }
      return skutecny;
    };
    expect(doba(0.1)).toBeLessThan(doba(1) * 1.5);
    expect(doba(0.25)).toBeLessThan(doba(1) * 1.5);
  });

  it("zkrácený záběr má stejný průběh, jen rychleji", () => {
    for (const tempo of [2, 4]) {
      expect(miraZpomaleni(okamzik, okamzik, tempo)).toBe(1);
      expect(miraZpomaleni(zacatekZaberu(okamzik, tempo) - 1e-6, okamzik, tempo)).toBe(0);
      expect(miraPohledu(konecZaberu(okamzik, tempo), okamzik, tempo)).toBe(0);
      expect(miraPohledu(konecZaberu(okamzik, tempo) - 0.01 / tempo, okamzik, tempo)).toBeGreaterThan(0);
      expect(konecZaberu(okamzik, tempo) - okamzik).toBeCloseTo((konecZaberu(okamzik) - okamzik) / tempo, 12);
      expect(miraZpomaleni(okamzik + 0.1 / tempo, okamzik, tempo)).toBeCloseTo(miraZpomaleni(okamzik + 0.1, okamzik), 12);
    }
  });

  it("krátký záběr zpomaluje míň", () => {
    expect(rychlostVZaberu(1, 1, ZABER.rychlostKratkeho)).toBeCloseTo(ZABER.rychlostKratkeho, 12);
    expect(rychlostVZaberu(0.2, 1, ZABER.rychlostKratkeho)).toBe(0.2);
  });
});

describe("rychlost přehrávání v záběru", () => {
  it("z běžné rychlosti zpomalí na desetinu, v půlce v poměru", () => {
    expect(rychlostVZaberu(1, 0)).toBe(1);
    expect(rychlostVZaberu(1, 1)).toBeCloseTo(ZABER.rychlost, 12);
    expect(rychlostVZaberu(1, 0.5)).toBeCloseTo(Math.sqrt(ZABER.rychlost), 12);
  });

  it("i ze čtyřnásobné rychlosti skončí na desetině", () => {
    expect(rychlostVZaberu(4, 1)).toBeCloseTo(ZABER.rychlost, 12);
    expect(rychlostVZaberu(4, 0)).toBe(4);
  });

  it("kdo už přehrává pomalu, toho záběr nezrychlí", () => {
    expect(rychlostVZaberu(0.1, 1)).toBe(0.1);
    expect(rychlostVZaberu(0.05, 1)).toBe(0.05);
  });
});

describe("pohled záběru", () => {
  const rozmer = { sirka: 1200, vyska: 700 };
  const domov = { x: 6, y: 0, meritko: 40 };

  it("míří na místo porušení a přibližuje", () => {
    const pohled = pohledZaberu(domov, { okamzik: 1, misto: { x: 9, y: 1.5 }, rozsah: 4 }, rozmer);
    expect(pohled.x).toBe(9);
    expect(pohled.y).toBe(1.5);
    expect(pohled.meritko).toBeGreaterThan(domov.meritko);
  });

  it("nikdy neoddaluje a nepřiblíží víc než čtyřikrát ani přes mez kamery", () => {
    for (const rozsah of [0.1, 1, 4, 12, 40, 200]) {
      for (const meritko of [5, 20, 60, 150, MERITKO_MAX]) {
        const pohled = pohledZaberu({ ...domov, meritko }, { okamzik: 1, misto: { x: 0, y: 0 }, rozsah }, rozmer);
        expect(pohled.meritko).toBeGreaterThanOrEqual(meritko);
        expect(pohled.meritko).toBeLessThanOrEqual(Math.max(meritko, Math.min(MERITKO_MAX, 4 * meritko)) + 1e-9);
      }
    }
  });

  it("dlouhý prut (pilíř) se nepřibližuje natěsno: kolem něj zůstane vidět mostovka", () => {
    const pilir = pohledZaberu({ ...domov, meritko: 12 }, { okamzik: 1, misto: { x: 0, y: -10 }, rozsah: 20 }, rozmer);
    // Dvacetimetrový prut zabere nejvýš polovinu výšky plátna.
    expect(20 * pilir.meritko).toBeLessThanOrEqual(0.5 * rozmer.vyska + 1e-9);
    expect(pilir.meritko).toBeGreaterThanOrEqual(12);
  });

  it("pohled jde za sledovaným místem", () => {
    const zaber = { okamzik: 1, misto: { x: 9, y: 1.5 }, rozsah: 4 };
    const jinde = pohledZaberu(domov, zaber, rozmer, { x: 9.5, y: -1 });
    expect(jinde.x).toBe(9.5);
    expect(jinde.y).toBe(-1);
    expect(jinde.meritko).toBe(pohledZaberu(domov, zaber, rozmer).meritko);
  });

  it("prut se do záběru vejde celý, dokud to jde bez oddálení", () => {
    const rozsah = 6;
    const pohled = pohledZaberu({ ...domov, meritko: 20 }, { okamzik: 1, misto: { x: 0, y: 0 }, rozsah }, rozmer);
    expect(rozsah * pohled.meritko).toBeLessThanOrEqual(0.8 * rozmer.vyska + 1e-9);
  });

  it("mezi pohledy se přechází po přímce a měřítkem v poměru", () => {
    const b = { x: 10, y: 4, meritko: 160 };
    expect(smichejPohledy(domov, b, 0)).toEqual(domov);
    expect(smichejPohledy(domov, b, 1)).toEqual(b);
    const pul = smichejPohledy(domov, b, 0.5);
    expect(pul.x).toBeCloseTo(8, 12);
    expect(pul.y).toBeCloseTo(2, 12);
    expect(pul.meritko).toBeCloseTo(80, 9);
    expect(smichejPohledy(domov, b, -3)).toEqual(domov);
    expect(smichejPohledy(domov, b, 7)).toEqual(b);
  });
});

describe("výběr první poruchy", () => {
  const poruseni = (cas: number, prut: number, nasledek = 0): Udalost =>
    ({ druh: "poruseni", cas, prut, zpusob: 0, nasledek, mira: 1.2, velicina: 10, unosnost: 8 }) as Udalost;

  it("bere nejdřívější porušení, sjetí z podpory nebo náraz lodi do prutu", () => {
    expect(prvniPorucha([])).toBeNull();
    expect(prvniPorucha([{ druh: "prujezd", cas: 1, polozka: 0, clen: 0 } as Udalost])).toBeNull();
    const udalosti: Udalost[] = [
      { druh: "prujezd", cas: 0.4, polozka: 0, clen: 0 } as Udalost,
      poruseni(2.5, 3),
      { druh: "sjeti", cas: 1.75, stycnik: 2 } as Udalost,
      poruseni(3, 1),
    ];
    expect(prvniPorucha(udalosti)).toMatchObject({ druh: "sjeti", cas: 1.75 });
    expect(prvniPorucha(udalosti.slice(0, 2))).toMatchObject({ druh: "poruseni", prut: 3 });
  });

  it("loď, která do ničeho nenarazila, porucha není", () => {
    const pluje = { druh: "lod", cas: 1, lod: 0, stav: "proplula" } as Udalost;
    const narazila = { druh: "lod", cas: 2, lod: 0, stav: "narazila", prut: 4 } as Udalost;
    expect(prvniPorucha([pluje])).toBeNull();
    expect(prvniPorucha([pluje, narazila])).toMatchObject({ druh: "lod", prut: 4 });
  });

  it("plastický kloub pozná od utržení", () => {
    expect(jenKloub(poruseni(1, 0, NASLEDEK_KLOUB) as UdalostZaberu)).toBe(true);
    expect(jenKloub(poruseni(1, 0, NASLEDEK_KLOUB + 1) as UdalostZaberu)).toBe(false);
    expect(jenKloub({ druh: "sjeti", cas: 1, stycnik: 0 } as UdalostZaberu)).toBe(false);
  });
});

describe("místo záběru ve skutečné zkoušce", () => {
  it("u mostu, který povolí pod nákladním autem, míří na prut, který povolil první", () => {
    const { zaznam, udalosti, bezRovnovahy } = zkousej(slabaPrihrada(), NAKLADNI);
    expect(bezRovnovahy).toBe(false);
    const u = prvniPorucha(udalosti);
    expect(u).not.toBeNull();
    if (!u || u.druh !== "poruseni") throw new Error("čekalo se porušení prutu");
    const zaber = zaberNaPoruchu(zaznam, u);
    expect(zaber).not.toBeNull();
    expect(zaber!.okamzik).toBe(u.cas);
    // Místo je střed prutu těsně před porušením a rozsah jeho délka.
    const snimek = prazdnySnimek();
    const stavba = zaznam.stavV(u.cas - 1e-3, snimek)!;
    const kde = mistoPrutu(stavba, snimek, u.prut)!;
    expect(zaber!.misto.x).toBeCloseTo(kde.misto.x, 6);
    expect(zaber!.misto.y).toBeCloseTo(kde.misto.y, 6);
    expect(zaber!.rozsah).toBeCloseTo(kde.rozsah, 6);
    // Leží na mostě (rozpětí 0 až 12 m) a prut má rozumnou délku.
    expect(zaber!.misto.x).toBeGreaterThan(-0.5);
    expect(zaber!.misto.x).toBeLessThan(12.5);
    expect(zaber!.rozsah).toBeGreaterThan(1);
    expect(zaber!.rozsah).toBeLessThan(8);
  });

  it("dokud záznam k okamžiku nedošel, záběr není", () => {
    const { zaznam, udalosti } = zkousej(slabaPrihrada(), NAKLADNI);
    const u = prvniPorucha(udalosti)!;
    const kratky = new Zaznam();
    zaznam.topologie.forEach((t) => kratky.pridejTopologii(t));
    zaznam.snimky.filter((s) => s.cas < u.cas - 0.2).forEach((s) => kratky.pridej(s));
    expect(zaberNaPoruchu(kratky, u)).toBeNull();
    expect(zaberNaPoruchu(new Zaznam(), u)).toBeNull();
  });

  it("záběr sleduje, co padá, ale do rokle za tím nejede", () => {
    const { zaznam, udalosti } = zkousej(slabaPrihrada(), NAKLADNI);
    const u = prvniPorucha(udalosti)!;
    const zaber = zaberNaPoruchu(zaznam, u)!;
    expect(zaber.cil).toEqual({ druh: "prut", prut: (u as { prut: number }).prut });
    // Těsně před porušením je sledované místo to původní.
    const pred = sledovaneMisto(zaznam, zaber, u.cas - 1e-3);
    expect(pred.x).toBeCloseTo(zaber.misto.x, 3);
    expect(pred.y).toBeCloseTo(zaber.misto.y, 3);
    // Později most padá: místo jde s ním dolů, nejvýš o povolenou vzdálenost.
    const pozdeji = sledovaneMisto(zaznam, zaber, Math.min(zaznam.konec, u.cas + 1.5));
    const dalka = Math.hypot(pozdeji.x - zaber.misto.x, pozdeji.y - zaber.misto.y);
    expect(pozdeji.y).toBeLessThanOrEqual(zaber.misto.y + 1e-6);
    expect(dalka).toBeLessThanOrEqual(ZABER.nejdalSledovani + 1e-9);
    // Záběr bez cíle stojí.
    expect(sledovaneMisto(zaznam, { ...zaber, cil: { druh: "bod" } }, u.cas + 1)).toEqual(zaber.misto);
    const { cil: _cil, ...bezCile } = zaber;
    expect(sledovaneMisto(zaznam, bezCile, u.cas + 1)).toEqual(zaber.misto);
  });

  it("pád z mostu bez prasklého prutu je taky první porucha a záběr míří na toho, kdo spadl", () => {
    // Jedno pole mostovky podepřené vzpěrou z kotvy pod ním: drží, ale končí ve čtvrtém metru.
    // Auto dojede na konec a spadne do mezery, aniž by cokoli prasklo.
    const k = new Kreslic();
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    k.prut("drevo-tezke", [0, -3], [4, 0]);
    const zpravy: ZpravaZeZkousky[] = [];
    const beh = new BehZkousky((zprava) => zpravy.push(zprava));
    const u: Uroven = {
      ...urovenRegrese({ rozpeti: 12, sirka: 3, vybaveni: 100, kotvy: [{ x: 0, y: -3, typ: "pevna" }] }),
      povolenePrvky: [...PRVKY],
      jizdniRad: [AUTO],
    };
    beh.prijmi({ typ: "start", vstup: { uroven: u, navrh: k.navrh(), nasada: 7, verzeFyziky: VERZE_FYZIKY } });
    const zacatek = zpravy[0]!;
    if (zacatek.typ !== "zacatek") throw new Error(`Zkouška nezačala: ${JSON.stringify(zacatek)}`);
    let pojistka = 0;
    while (beh.pokracuj(0.5)) expect(pojistka++).toBeLessThan(400);
    const zaznam = new Zaznam();
    const udalosti: Udalost[] = [];
    for (const zprava of zpravy) {
      if (zprava.typ !== "zaznam") continue;
      zprava.topologie.forEach((t) => zaznam.pridejTopologii(t));
      zprava.snimky.forEach((s) => zaznam.pridej(s));
      udalosti.push(...zprava.udalosti);
    }
    expect(zacatek.bezRovnovahy).toBe(false);
    const prvni = prvniPorucha(udalosti)!;
    expect(prvni).toMatchObject({ druh: "pad" });
    const zaber = zaberNaPoruchu(zaznam, prvni, zacatek.ucastnici)!;
    expect(zaber).not.toBeNull();
    expect(zaber.cil?.druh).toBe("stycnik");
    // Auto je v tu chvíli za koncem mostovky (pád se ohlásí, až když pod koly nic není).
    expect(zaber.misto.x).toBeGreaterThan(4);
    expect(zaber.okamzik).toBe(prvni.cas);
    // Bez seznamu účastníků se místo určit nedá.
    expect(zaberNaPoruchu(zaznam, prvni)).toBeNull();
  });
});
