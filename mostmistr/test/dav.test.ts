// Skupiny lidí: dav, běžecký závod, průvod s kapelou, skákající dav a ztráta kroku.
import { describe, expect, it } from "vitest";
import type { PolozkaJizdnihoRadu, Uroven } from "../src/data/uroven";
import {
  nastavKrokBremen,
  podilBuzeni,
  posunBremena,
  pridejSilyBremen,
  vytvorBremena,
  ZBYTEK_BUZENI,
  ZTRATA_DO,
  ZTRATA_OD,
} from "../src/jadro/bremena";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { NOSNIK, sestavSoustavu } from "../src/jadro/soustava";
import { vytvorTrasu } from "../src/jadro/trasa";
import { JEDE, PREJEL } from "../src/zkouska/provoz";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";
import { rozeberMost } from "../src/zkouska/rozbor";
import {
  hmotnostUcastnika,
  KADENCE_DAVU,
  KADENCE_ZAVODU,
  lidiVRade,
  modelUcastnika,
  ROZPTYL_DAVU,
  ROZPTYL_ZAVODU,
  RYCHLOST_DAVU,
  RYCHLOST_PRUVODU,
  skokan,
  vedleSebe,
} from "../src/zkouska/vozidla";
import { Zkouska } from "../src/zkouska/zkouska";

const g = TIHOVE_ZRYCHLENI;

/** Úroveň s tuhou lávkou širokou tři metry: vejdou se na ni čtyři lidé vedle sebe. */
function uroven(jizdniRad: PolozkaJizdnihoRadu[], rozpeti = 12): Uroven {
  return { ...urovenRegrese({ rozpeti, sirka: 3 }), povolenePrvky: ["mostovka-drevo", "ocel-tezka"], jizdniRad };
}

function tuhyMost(rozpeti = 12) {
  const k = new Kreslic();
  for (let x = 0; x < rozpeti; x += 4) {
    k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    k.prut("ocel-tezka", [x, 0], [x + 4, 0]);
  }
  k.svarVse();
  return k.navrh();
}

function dojed(zkouska: Zkouska): void {
  let pojistka = 0;
  while (!zkouska.hotovo) {
    zkouska.pokracuj(1);
    expect(pojistka++).toBeLessThan(300);
  }
}

describe("modely skupin", () => {
  it("řady: útvar, dav a průvod přes celou šířku, běžci nejvýš po třech, ostatní po jednom", () => {
    expect(lidiVRade("utvar", 3)).toBe(4);
    expect(lidiVRade("dav", 3)).toBe(4);
    expect(lidiVRade("pruvod", 2)).toBe(2);
    expect(lidiVRade("skakajici-dav", 4)).toBe(5);
    expect(lidiVRade("bezecky-zavod", 2)).toBe(2);
    expect(lidiVRade("bezecky-zavod", 6)).toBe(3);
    expect(lidiVRade("chodec", 6)).toBe(1);
    expect(lidiVRade("auto", 6)).toBe(1);
    expect(lidiVRade("dav", 0.5)).toBe(1);
  });

  it("lidé v taktu sčítají síly, lidé jdoucí volně jen energie", () => {
    const jeden = modelUcastnika("chodec", 1.8)!;
    const vTaktu = vedleSebe(jeden, 4);
    const volne = vedleSebe(jeden, 4, false);
    expect(vTaktu.buzeni!.amplitudy[0]!).toBeCloseTo(4 * jeden.buzeni!.amplitudy[0]!, 9);
    expect(volne.buzeni!.amplitudy[0]!).toBeCloseTo(2 * jeden.buzeni!.amplitudy[0]!, 9);
    // Hmota a tuhost těla se sčítají v obou případech: lidé na mostě jsou, ať jdou jakkoli.
    expect(hmotnostUcastnika(volne)).toBeCloseTo(4 * hmotnostUcastnika(jeden), 9);
    expect(volne.napravy[0]!.kontakt.tuhost).toBeCloseTo(4 * jeden.napravy[0]!.kontakt.tuhost, 6);
  });

  it("dav jde pomaleji než osamělý chodec, průvod drží rychlost kapely, závod běží", () => {
    expect(modelUcastnika("dav")!.rychlost).toBe(RYCHLOST_DAVU);
    expect(modelUcastnika("dav")!.rychlost).toBeLessThan(modelUcastnika("chodec")!.rychlost);
    expect(modelUcastnika("pruvod")!.rychlost).toBe(RYCHLOST_PRUVODU);
    expect(modelUcastnika("bezecky-zavod")!.rychlost).toBe(3);
    expect(modelUcastnika("skakajici-dav")!.rychlost).toBe(RYCHLOST_DAVU);
  });

  it("skákání budí víc než chůze i běh: první harmonická 1,2 váhy, k tomu druhá a třetí", () => {
    const skok = skokan(2.2).buzeni!;
    const vaha = 80 * g;
    expect(skok.frekvence).toBe(2.2);
    expect(skok.amplitudy[0]!).toBeCloseTo(1.2 * vaha, 6);
    expect(skok.amplitudy[3]!).toBeCloseTo(-0.4 * vaha, 6);
    expect(skok.amplitudy[4]!).toBeCloseTo(-0.12 * vaha, 6);
    expect(skok.amplitudy[0]!).toBeGreaterThan(2 * modelUcastnika("chodec", 2.2)!.buzeni!.amplitudy[0]!);
    // V okamžiku doskoku (čtvrt periody) se všechny tři složky sčítají.
    const vrchol = skok.amplitudy[0]! - skok.amplitudy[3]! - skok.amplitudy[4]!;
    expect(vrchol).toBeCloseTo(1.72 * vaha, 6);
  });
});

describe("dav", () => {
  const polozka: PolozkaJizdnihoRadu = { cas: 0, trasa: "silnice", smer: 1, druh: "dav", pocet: 38 };
  const zkouska = new Zkouska(uroven([polozka]), tuhyMost(), 3);
  const rady = zkouska.ucastnici;

  it("jde v řadách přes šířku mostovky; poslední řada je neúplná", () => {
    expect(rady).toHaveLength(10);
    expect(rady.slice(0, 9).every((r) => r.lidi === 4)).toBe(true);
    expect(rady[9]!.lidi).toBe(2);
    expect(rady.reduce((s, r) => s + (r.lidi ?? 1), 0)).toBe(38);
    expect(rady.every((r) => r.rychlost === RYCHLOST_DAVU && !r.vTaktu)).toBe(true);
  });

  it("každá řada má svou kadenci kolem střední a svou fázi", () => {
    const kadence = rady.map((r) => r.kadence!);
    for (const k of kadence) {
      expect(k).toBeGreaterThanOrEqual(KADENCE_DAVU - 2 * ROZPTYL_DAVU - 1e-9);
      expect(k).toBeLessThanOrEqual(KADENCE_DAVU + 2 * ROZPTYL_DAVU + 1e-9);
    }
    expect(new Set(kadence.map((k) => k.toFixed(6))).size).toBe(rady.length);
    const stred = kadence.reduce((s, k) => s + k, 0) / kadence.length;
    expect(Math.abs(stred - KADENCE_DAVU)).toBeLessThan(ROZPTYL_DAVU);
    expect(new Set(rady.map((r) => r.faze!.map((f) => f.toFixed(6)).join())).size).toBe(rady.length);
    for (const r of rady) expect(Math.hypot(...r.faze!)).toBeCloseTo(1, 12);
  });

  it("stejná násada dá stejný dav, jiná jiný", () => {
    const znovu = new Zkouska(uroven([polozka]), tuhyMost(), 3).ucastnici.map((r) => r.kadence);
    const jinak = new Zkouska(uroven([polozka]), tuhyMost(), 4).ucastnici.map((r) => r.kadence);
    expect(znovu).toEqual(rady.map((r) => r.kadence));
    expect(jinak).not.toEqual(rady.map((r) => r.kadence));
  });

  it("úroveň může střední kadenci davu zadat", () => {
    const pomaly = new Zkouska(uroven([{ ...polozka, kadence: 1.4 }]), tuhyMost(), 3).ucastnici;
    for (const r of pomaly) expect(Math.abs(r.kadence! - 1.4)).toBeLessThanOrEqual(2 * ROZPTYL_DAVU + 1e-9);
  });

  it("celý přejde a rozbor počítá s hmotou lidí, kteří se na most vejdou", () => {
    dojed(zkouska);
    const vysledek = zkouska.vysledek();
    expect(vysledek).toMatchObject({ pruchod: true, prejelo: 10, spadlo: 0 });
    expect(vysledek.komfort).not.toBeNull();
    // Na dvanáct metrů se při rozestupu 1,3 m vejde deset řad po čtyřech: celý dav.
    const u = uroven([polozka]);
    const rozbor = rozeberMost(u, tuhyMost());
    expect(rozbor.stabilni).toBe(true);
    expect(rozbor.frekvenceObsazeneho[0]!).toBeLessThan(rozbor.frekvence[0]!);
  }, 60_000);
});

describe("běžecký závod", () => {
  it("běží v řadách nejvýš po třech, každý svým krokem v úzkém pásmu kadence", () => {
    const zkouska = new Zkouska(uroven([{ cas: 0, trasa: "silnice", smer: 1, druh: "bezecky-zavod", pocet: 20 }]), tuhyMost(), 5);
    const rady = zkouska.ucastnici;
    expect(rady).toHaveLength(7);
    expect(rady[0]!.lidi).toBe(3);
    expect(rady[6]!.lidi).toBe(2);
    for (const r of rady) {
      expect(r.rychlost).toBe(3);
      expect(Math.abs(r.kadence! - KADENCE_ZAVODU)).toBeLessThanOrEqual(2 * ROZPTYL_ZAVODU + 1e-9);
      expect(r.vTaktu).toBeUndefined();
    }
    // Pásmo je mnohem užší než u davu.
    expect(ROZPTYL_ZAVODU).toBeLessThan(ROZPTYL_DAVU / 2);
    dojed(zkouska);
    expect(zkouska.vysledek()).toMatchObject({ prejelo: 7, spadlo: 0 });
  }, 60_000);
});

describe("průvod s kapelou", () => {
  const zkouska = new Zkouska(uroven([{ cas: 0, trasa: "silnice", smer: 1, druh: "pruvod", pocet: 36, kadence: 2 }]), tuhyMost(), 6);
  const rady = zkouska.ucastnici;
  const kapela = rady.filter((r) => r.vTaktu);
  const dav = rady.filter((r) => !r.vTaktu);

  it("vpředu jde kapela v taktu: třetina průvodu, jedna kadence a jedna fáze", () => {
    expect(kapela.reduce((s, r) => s + (r.lidi ?? 1), 0)).toBe(12);
    expect(kapela).toHaveLength(3);
    expect(rady.slice(0, 3)).toEqual(kapela);
    expect(new Set(kapela.map((r) => r.kadence)).size).toBe(1);
    expect(kapela[0]!.kadence).toBe(2);
    expect(new Set(kapela.map((r) => r.faze!.join())).size).toBe(1);
  });

  it("za kapelou jde volně dav stejnou rychlostí, každá řada svým krokem", () => {
    expect(dav.reduce((s, r) => s + (r.lidi ?? 1), 0)).toBe(24);
    expect(rady.every((r) => r.rychlost === RYCHLOST_PRUVODU)).toBe(true);
    expect(new Set(dav.map((r) => r.kadence!.toFixed(6))).size).toBe(dav.length);
    for (const r of dav) expect(Math.abs(r.kadence! - KADENCE_DAVU)).toBeLessThanOrEqual(2 * ROZPTYL_DAVU + 1e-9);
  });

  it("mezi kapelou a davem je mezera", () => {
    const s = zkouska.simulace.soustava;
    const x = rady.map((r) => s.x[r.kola[0]!]!);
    for (let i = 1; i < x.length; i++) expect(x[i]!).toBeLessThan(x[i - 1]!);
    const rozestupKapely = x[0]! - x[1]!;
    const mezera = x[kapela.length - 1]! - x[kapela.length]!;
    expect(mezera).toBeGreaterThan(rozestupKapely + 1);
  });

  it("malý průvod je celý kapela", () => {
    const maly = new Zkouska(uroven([{ cas: 0, trasa: "silnice", smer: 1, druh: "pruvod", pocet: 4 }]), tuhyMost(), 6).ucastnici;
    expect(maly).toHaveLength(1);
    expect(maly[0]).toMatchObject({ lidi: 4, vTaktu: true });
  });
});

describe("skákající dav", () => {
  const polozka: PolozkaJizdnihoRadu = { cas: 1, trasa: "silnice", smer: 1, druh: "skakajici-dav", pocet: 24, kadence: 2.4, trvani: 6 };
  const u = uroven([polozka], 16);
  const zkouska = new Zkouska(u, tuhyMost(16), 8);
  const rady = zkouska.ucastnici;
  const skok = rady[0]!.skok!;
  const s = zkouska.simulace.soustava;
  const bremena = zkouska.provoz.bremena[0]!;

  it("všechny řady mají stejný plán: dojít, chvíli stát, skákat zadanou dobu a odejít", () => {
    expect(rady).toHaveLength(6);
    for (const r of rady) expect(r.skok).toEqual(skok);
    expect(skok.kadence).toBe(2.4);
    expect(skok.prichod).toBeGreaterThan(polozka.cas);
    expect(skok.od).toBeCloseTo(skok.prichod + 1, 9);
    expect(skok.do - skok.od).toBeCloseTo(6, 9);
    expect(skok.odchod).toBeCloseTo(skok.do + 1, 9);
    expect(zkouska.trvani).toBeGreaterThan(skok.odchod);
  });

  it("dojdou doprostřed mostu, zastaví naráz a stojí rozestavení kolem středu", () => {
    while (zkouska.simulace.cas < skok.prichod + 0.5) zkouska.pokracuj(0.25);
    const x = rady.map((r) => s.x[r.kola[0]!]!);
    const stred = (x[0]! + x[x.length - 1]!) / 2;
    expect(stred).toBeCloseTo(8, 1);
    for (let i = 1; i < x.length; i++) expect(x[i - 1]! - x[i]!).toBeCloseTo(1, 2);
    for (const r of rady) expect(s.vx[r.kola[0]!]).toBe(0);
    expect([...zkouska.provoz.stavy].every((stav) => stav === JEDE)).toBe(true);
    // Kdo stojí, mostovku nebudí: tlačí na ni jen svou vahou (tělo se po zastavení ještě dohoupává).
    for (let i = 0; i < bremena.pocet; i++) {
      const podil = bremena.sila[i]! / (rady[i]!.lidi! * 80 * g);
      expect(podil).toBeGreaterThan(0.85);
      expect(podil).toBeLessThan(1.15);
      for (let k = 0; k < 6; k++) expect(bremena.amplitudy[6 * i + k]).toBe(0);
    }
  });

  it("skáčou všichni naráz v zadaném rytmu a síla doskoku je násobkem jejich váhy", () => {
    let nejvic = 0;
    let nejmin = Infinity;
    while (zkouska.simulace.cas < skok.od + 2) {
      zkouska.pokracuj(1 / 240);
      if (zkouska.simulace.cas < skok.od + 0.05) continue;
      // Stejná fáze u všech řad.
      for (let i = 1; i < bremena.pocet; i++) {
        expect(bremena.fazeSin[i]!).toBeCloseTo(bremena.fazeSin[0]!, 9);
        expect(bremena.frekvence[i]).toBe(2.4);
      }
      const podil = bremena.sila[0]! / (rady[0]!.lidi! * 80 * g);
      nejvic = Math.max(nejvic, podil);
      nejmin = Math.min(nejmin, podil);
    }
    // Doskok kolem 2,7 váhy, v letu skoro nic.
    expect(nejvic).toBeGreaterThan(2.3);
    expect(nejvic).toBeLessThan(3.2);
    expect(nejmin).toBeLessThan(0.3);
    for (const r of rady) expect(s.vx[r.kola[0]!]).toBe(0);
  });

  it("po skákání se rozejdou, dojdou na druhý břeh a zkouška skončí", () => {
    dojed(zkouska);
    expect([...zkouska.provoz.stavy].every((stav) => stav === PREJEL)).toBe(true);
    const vysledek = zkouska.vysledek();
    expect(vysledek).toMatchObject({ prejelo: 6, spadlo: 0, poruseni: 0 });
    expect(vysledek.trvani).toBeGreaterThan(skok.odchod + 5);
    // Skákání mostovku rozhoupe víc, než kdyby dav jen prošel.
    const prochazka = new Zkouska(uroven([{ cas: 1, trasa: "silnice", smer: 1, druh: "dav", pocet: 24 }], 16), tuhyMost(16), 8);
    dojed(prochazka);
    expect(vysledek.komfort!.zrychleni).toBeGreaterThan(2 * prochazka.vysledek().komfort!.zrychleni);
  }, 120_000);
});

describe("ztráta kroku", () => {
  // Jeden chodec na vodorovné trase; mostovka je jediný tuhý prut mezi dvěma podporami.
  function chodecNaTrase() {
    const s = sestavSoustavu({
      stycniky: [
        { x: 0, y: 0, pevneX: true, pevneY: true },
        { x: 10, y: 0, pevneX: true, pevneY: true },
        // Chodec stojí o kousek níž, než kde je pružina kontaktu volná: nese jeho tíhu.
        { x: 5, y: 1 - (80 * g) / 2e5, pevneX: true, hmota: 80 },
      ],
      prvky: [{ a: 0, b: 1, druh: NOSNIK, EA: 1e9, EI: 1e8, GAs: Infinity, hmotnostNaMetr: 100, polomerSetrvacnosti: 0, prut: 0 }],
    });
    const trasa = vytvorTrasu(s, [0], { xLevy: 0, yLevy: 0, xPravy: 10, yPravy: 0 });
    const bremena = vytvorBremena(trasa, [
      { stycnik: 2, tuhost: 2e5, tlumeni: 0, vyskaNad: 1, buzeni: { frekvence: 2, amplitudy: [300, 0, 0, 0, 0, 0], faze: [0, 1] } },
    ]);
    nastavKrokBremen(bremena, 1e-3);
    return { s, bremena };
  }

  it("do hranice nepřijatelného kmitání budí naplno, pak slábne až na čtvrtinu", () => {
    const { bremena } = chodecNaTrase();
    const houpaniPro = (zrychleni: number): number => zrychleni / (Math.PI * Math.PI * 2);
    bremena.houpani[0] = 0;
    expect(podilBuzeni(bremena, 0)).toBe(1);
    bremena.houpani[0] = houpaniPro(ZTRATA_OD);
    expect(podilBuzeni(bremena, 0)).toBe(1);
    bremena.houpani[0] = houpaniPro((ZTRATA_OD + ZTRATA_DO) / 2);
    expect(podilBuzeni(bremena, 0)).toBeCloseTo((1 + ZBYTEK_BUZENI) / 2, 9);
    bremena.houpani[0] = houpaniPro(ZTRATA_DO);
    expect(podilBuzeni(bremena, 0)).toBeCloseTo(ZBYTEK_BUZENI, 9);
    bremena.houpani[0] = houpaniPro(50);
    expect(podilBuzeni(bremena, 0)).toBe(ZBYTEK_BUZENI);
    // Podíl s houpáním nikdy neroste.
    let minuly = 1;
    for (let a = 0; a < 10; a += 0.1) {
      bremena.houpani[0] = houpaniPro(a);
      const podil = podilBuzeni(bremena, 0);
      expect(podil).toBeLessThanOrEqual(minuly);
      minuly = podil;
    }
  });

  it("kroková síla na mostovku se zmenší právě o ten podíl", () => {
    const { s, bremena } = chodecNaTrase();
    // Fáze čtvrt otáčky: kroková síla je právě 300 N nad tíhou nesenou pružinou.
    pridejSilyBremen(s, bremena);
    const naplno = bremena.sila[0]!;
    bremena.houpani[0] = ZTRATA_DO / (Math.PI * Math.PI * 2);
    pridejSilyBremen(s, bremena);
    expect(naplno - bremena.sila[0]!).toBeCloseTo(300 * (1 - ZBYTEK_BUZENI), 6);
  });

  it("houpání pod člověkem sleduje rychlost mostovky a v klidu zase odezní", () => {
    const { s, bremena } = chodecNaTrase();
    pridejSilyBremen(s, bremena);
    posunBremena(bremena);
    expect(bremena.houpani[0]).toBe(0);
    // Mostovka se pod chodcem hýbe rychlostí 0,5 m/s: houpání se k ní blíží.
    for (let i = 0; i < 2000; i++) {
      for (let j = 0; j < 3; j++) s.y[j] = s.y[j]! + 0.5e-3;
      pridejSilyBremen(s, bremena);
      posunBremena(bremena);
    }
    expect(bremena.houpani[0]!).toBeGreaterThan(0.45);
    expect(bremena.houpani[0]!).toBeLessThanOrEqual(0.5 + 1e-9);
    for (let i = 0; i < 3000; i++) {
      pridejSilyBremen(s, bremena);
      posunBremena(bremena);
    }
    expect(bremena.houpani[0]!).toBeLessThan(0.01);
  });
});
