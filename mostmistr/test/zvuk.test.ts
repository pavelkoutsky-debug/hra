// Co je při zkoušce slyšet: poslech záznamu vydá správné zvuky ve správný okamžik.
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { JEDE, SPADL } from "../src/zkouska/provoz";
import type { Udalost } from "../src/zkouska/protokol";
import { prazdnySnimek, Zaznam, type Topologie } from "../src/zkouska/zaznam";
import { Zkouska } from "../src/zkouska/zkouska";
import {
  DRUHY_ZVUKU,
  miraLupani,
  miraVrzani,
  otisk,
  Poslech,
  PRAH_LUPANI,
  PRAH_VRZANI,
  sanceVrzani,
  type ZdrojDeje,
  type Zvuk,
} from "../src/zvuk/deje";
import { nactiKampan, nactiUrovne, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const SNIMEK = 1 / 60;

function zaznamenej(uroven: Uroven, navrh: NavrhMostu, brnknuti?: { stycnik: number; sila: number }): ZdrojDeje {
  const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven), brnknuti);
  const zaznam = new Zaznam();
  const udalosti: Udalost[] = [];
  let pojistka = 0;
  while (!zkouska.hotovo) {
    const davka = zkouska.pokracuj(1);
    for (const stavba of davka.topologie) zaznam.pridejTopologii(stavba);
    for (const snimek of davka.snimky) zaznam.pridej(snimek);
    udalosti.push(...davka.udalosti);
    expect(pojistka++).toBeLessThan(300);
  }
  return { zaznam, ucastnici: zkouska.ucastnici, udalosti };
}

/** Přehraje celý záznam po snímcích obrazu a vrátí vše, co při tom zaznělo. */
function poslechni(poslech: Poslech, zdroj: ZdrojDeje, krok = SNIMEK): Zvuk[] {
  const zvuky: Zvuk[] = [];
  for (let cas = 0; cas <= zdroj.zaznam.konec + krok; cas += krok) {
    for (const zvuk of poslech.posun(zdroj, cas)) zvuky.push({ ...zvuk });
  }
  return zvuky;
}

function uroven(id: string): Uroven {
  return nactiKampan().find((u) => u.id === id)!;
}

describe("míry namáhání", () => {
  it("vrzání ani lupání s využitím neklesá, pod prahem mlčí a na mezi je naplno", () => {
    for (const mira of [miraVrzani, miraLupani, (u: number) => sanceVrzani(miraVrzani(u))]) {
      let minule = 0;
      for (let u = 0; u <= 1.5; u += 0.01) {
        const hodnota = mira(u);
        expect(hodnota).toBeGreaterThanOrEqual(minule);
        expect(hodnota).toBeLessThanOrEqual(1);
        minule = hodnota;
      }
    }
    expect(miraVrzani(PRAH_VRZANI)).toBe(0);
    expect(miraVrzani(1)).toBe(1);
    expect(miraVrzani(-0.8)).toBe(miraVrzani(0.8));
    expect(miraLupani(PRAH_LUPANI)).toBe(0);
    expect(miraLupani(1.1)).toBe(1);
    // Lupe až kus nad prahem vrzání: nejdřív vrže, pak lupe, pak praskne.
    expect(PRAH_LUPANI).toBeGreaterThan(PRAH_VRZANI + 0.3);
  });

  it("otisk je stálý, leží mezi nulou a jedničkou a je rozložený rovnoměrně", () => {
    let soucet = 0;
    for (let i = 0; i < 4000; i++) {
      const h = otisk(i, 12);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(otisk(i, 12)).toBe(h);
      soucet += h;
    }
    expect(soucet / 4000).toBeCloseTo(0.5, 1);
  });
});

describe("vrzání sílí s využitím", () => {
  // Jediný dřevěný trám mezi dvěma podporami, na kterém se drží stálé využití.
  const u101 = uroven("1-01");
  const navrh: NavrhMostu = {
    verze: RESENI["1-01"]!.pruchod.verze,
    uroven: "1-01",
    stycniky: [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 4, y: 0 },
    ],
    pruty: [{ id: 0, a: 0, b: 1, prvek: "drevo-lehke" }],
  };
  const stavba: Topologie = {
    stycniku: 2,
    prvekA: Int32Array.of(0),
    prvekB: Int32Array.of(1),
    prut: Int32Array.of(0),
    cara: Uint8Array.of(0),
    klouby: Uint8Array.of(0),
    podpory: Uint8Array.of(3, 3),
    znacky: Uint8Array.of(0, 0),
  };

  function trvaleVyuziti(vyuziti: (cas: number) => number, sekund = 60): ZdrojDeje {
    const zaznam = new Zaznam();
    zaznam.pridejTopologii(stavba);
    for (let i = 0; i <= sekund * 60; i++) {
      zaznam.pridej({
        ...prazdnySnimek(),
        cas: i / 60,
        polohy: Float32Array.of(0, 0, 4, 0),
        vyuziti: Float32Array.of(vyuziti(i / 60)),
      });
    }
    return { zaznam, ucastnici: [], udalosti: [] };
  }

  it("čím větší využití, tím častěji a hlasitěji prut vrže; co vrzlo při menším, vrzne i při větším", () => {
    let minule: Zvuk[] = [];
    let minulaSila = 0;
    const pocty: number[] = [];
    for (const vyuziti of [0.05, 0.3, 0.5, 0.7, 0.9, 1]) {
      const zvuky = poslechni(new Poslech(u101, navrh), trvaleVyuziti(() => vyuziti)).filter((z) => z.druh === "vrzani");
      pocty.push(zvuky.length);
      const casy = new Set(zvuky.map((z) => z.cas.toFixed(4)));
      for (const z of minule) expect(casy.has(z.cas.toFixed(4)), `vrznutí v čase ${z.cas} při využití ${vyuziti}`).toBe(true);
      const sila = zvuky.length > 0 ? zvuky.reduce((s, z) => s + z.sila, 0) / zvuky.length : 0;
      expect(sila).toBeGreaterThanOrEqual(minulaSila);
      for (const z of zvuky) {
        expect(z.puvod).toBe(0);
        expect(z.material).toBe("drevo");
        expect(z.x).toBeGreaterThanOrEqual(0);
        expect(z.x).toBeLessThanOrEqual(4);
      }
      minule = zvuky;
      minulaSila = sila;
    }
    // Pod prahem ticho, na mezi únosnosti několik vrznutí za sekundu.
    expect(pocty[0]).toBe(0);
    for (let i = 1; i < pocty.length; i++) expect(pocty[i]!).toBeGreaterThan(pocty[i - 1]!);
    expect(pocty.at(-1)! / 60).toBeGreaterThan(0.5);
    expect(pocty.at(-1)! / 60).toBeLessThan(6);
  });

  it("měnící se namáhání vrže víc než stejně velké stálé", () => {
    const stale = poslechni(new Poslech(u101, navrh), trvaleVyuziti(() => 0.6)).filter((z) => z.druh === "vrzani");
    const zive = poslechni(
      new Poslech(u101, navrh),
      trvaleVyuziti((cas) => 0.6 * Math.abs(Math.sin(2 * Math.PI * 0.5 * cas))),
    ).filter((z) => z.druh === "vrzani");
    // Živé namáhání je v průměru menší, a přesto vrže častěji.
    expect(zive.length).toBeGreaterThan(stale.length);
  });

  it("lupe až těsně před porušením", () => {
    const klidne = poslechni(new Poslech(u101, navrh), trvaleVyuziti(() => 0.75));
    expect(klidne.some((z) => z.druh === "lupnuti")).toBe(false);
    const naHrane = poslechni(new Poslech(u101, navrh), trvaleVyuziti(() => 0.97));
    const lupnuti = naHrane.filter((z) => z.druh === "lupnuti");
    expect(lupnuti.length).toBeGreaterThan(60);
    // Stálé namáhání vrže řidčeji než měnící se, ale na hraně únosnosti pořád každou chvíli.
    expect(naHrane.filter((z) => z.druh === "vrzani").length).toBeGreaterThan(30);
  });

  it("lano nevrže", () => {
    const lano: NavrhMostu = { ...navrh, pruty: [{ id: 0, a: 0, b: 1, prvek: "lano" }] };
    const zvuky = poslechni(new Poslech(u101, lano), trvaleVyuziti(() => 0.7));
    expect(zvuky).toEqual([]);
  });

  it("slabší most vrže víc než most s rezervou", () => {
    const u103 = uroven("1-03");
    const energie = (navrhMostu: NavrhMostu): number => {
      const zvuky = poslechni(new Poslech(u103, navrhMostu), zaznamenej(u103, navrhMostu));
      return zvuky.filter((z) => z.druh === "vrzani").reduce((s, z) => s + z.sila, 0);
    };
    const slabsi = energie(RESENI["1-03"]!.pruchod);
    const silnejsi = energie(RESENI["1-03"]!.mistrovska);
    expect(slabsi).toBeGreaterThan(2 * silnejsi);
    expect(slabsi).toBeGreaterThan(1);
  }, 60_000);
});

describe("porušení a pády", () => {
  // Most, který se pod auty rozláme: lámou se pruty, sjede z ložiska a auta padají do vody.
  const u104 = uroven("1-04");
  const navrh = RESENI["1-04"]!.pady.find((p) => p.nazev === "lehká příhrada přes celé údolí")!.navrh;
  const zdroj = zaznamenej(u104, navrh);
  const zvuky = poslechni(new Poslech(u104, navrh), zdroj);

  it("každé porušení prutu zazní ve svém okamžiku a v místě prutu", () => {
    const poruseni = zdroj.udalosti.filter((u) => u.druh === "poruseni");
    const zlomy = zvuky.filter((z) => z.druh === "zlom");
    expect(poruseni.length).toBeGreaterThan(5);
    expect(zlomy).toHaveLength(poruseni.length);
    const poradi = new Map(navrh.stycniky.map((st, i) => [st.id, i]));
    for (const u of poruseni) {
      const zlom = zlomy.find((z) => z.puvod === u.prut && z.cas === u.cas);
      expect(zlom, `zlom prutu ${u.prut} v čase ${u.cas}`).toBeDefined();
      expect(zlom!.material).toBe("drevo");
      expect(zlom!.sila).toBeGreaterThan(0.5);
      // Zní zhruba tam, kde prut je: do pár metrů od jeho nakreslené polohy.
      const prut = navrh.pruty[u.prut]!;
      const a = navrh.stycniky[poradi.get(prut.a)!]!;
      const b = navrh.stycniky[poradi.get(prut.b)!]!;
      expect(Math.abs(zlom!.x - (a.x + b.x) / 2)).toBeLessThan(6);
    }
  });

  it("sjetí z ložiska zazní ve svém okamžiku", () => {
    const sjeti = zdroj.udalosti.filter((u) => u.druh === "sjeti");
    expect(sjeti.length).toBeGreaterThan(0);
    for (const u of sjeti) {
      expect(zvuky.some((z) => z.druh === "sjeti" && z.cas === u.cas && z.puvod === u.stycnik)).toBe(true);
    }
  });

  it("každý, kdo spadl, je slyšet ve chvíli, kdy v záznamu dopadne do vody nebo na zem", () => {
    const pady = zdroj.udalosti.filter((u) => u.druh === "pad");
    expect(pady.length).toBeGreaterThan(3);
    const hladina = u104.hladina!;
    const pred = prazdnySnimek();
    const po = prazdnySnimek();
    for (const pad of pady) {
      const k = zdroj.ucastnici.findIndex((u) => u.polozka === pad.polozka && u.clen === pad.clen);
      const dopady = zvuky.filter((z) => (z.druh === "splouchnuti" || z.druh === "dopad") && z.puvod === k);
      expect(dopady.length, `účastník ${k} spadl v čase ${pad.cas}`).toBeGreaterThan(0);
      for (const dopad of dopady) {
        // Nejdřív spadl, pak teprve dopadl.
        expect(dopad.cas).toBeGreaterThan(pad.cas);
        expect(dopad.sila).toBeGreaterThan(0.3);
        const kola = zdroj.ucastnici[k]!.kola;
        zdroj.zaznam.stavV(dopad.cas - 2 * SNIMEK, pred);
        zdroj.zaznam.stavV(dopad.cas, po);
        expect(po.provoz[k]).toBe(SPADL);
        const nejniz = (polohy: Float32Array): number => Math.min(...kola.map((i) => polohy[2 * i + 1]!));
        // Padal dolů…
        expect(nejniz(po.polohy)).toBeLessThan(nejniz(pred.polohy));
        if (dopad.druh === "splouchnuti") {
          // …a právě teď prošel hladinou.
          expect(nejniz(pred.polohy)).toBeGreaterThan(hladina - 0.05);
          expect(nejniz(po.polohy)).toBeLessThan(hladina);
          expect(dopad.y).toBe(hladina);
        } else {
          expect(nejniz(po.polohy)).toBeGreaterThanOrEqual(hladina);
        }
      }
      // Do vody každý šplouchne nejvýš jednou.
      expect(dopady.filter((z) => z.druh === "splouchnuti").length).toBeLessThanOrEqual(1);
    }
    // Auto i dodávka jsou velké, takže šplouchnou víc než člověk nebo jízdní kolo.
    const doVody = zvuky.filter((z) => z.druh === "splouchnuti" && z.puvod >= 0);
    const vuz = (z: (typeof doVody)[number]): boolean => ["auto", "dodavka"].includes(zdroj.ucastnici[z.puvod]!.druh);
    expect(doVody.some(vuz)).toBe(true);
    for (const z of doVody) {
      if (vuz(z)) expect(z.velikost).toBeGreaterThan(0.6);
      else expect(z.velikost).toBeLessThan(0.3);
    }
  });

  it("trosky mostu šplouchají a dopadají až po prvním porušení", () => {
    const prvni = Math.min(...zdroj.udalosti.filter((u) => u.druh !== "prujezd").map((u) => u.cas));
    const trosky = zvuky.filter((z) => (z.druh === "splouchnuti" || z.druh === "dopad") && z.puvod < 0);
    expect(trosky.length).toBeGreaterThan(3);
    for (const z of trosky) expect(z.cas).toBeGreaterThan(prvni);
    expect(zvuky.filter((z) => z.druh === "zlom" || z.druh === "sjeti").every((z) => z.cas >= prvni)).toBe(true);
  });

  it("všechny zvuky mají platné údaje a stejný záznam zní pokaždé stejně", () => {
    for (const z of zvuky) {
      expect(DRUHY_ZVUKU).toContain(z.druh);
      for (const hodnota of [z.cas, z.x, z.y, z.sila, z.velikost, z.odstin]) expect(Number.isFinite(hodnota)).toBe(true);
      expect(z.sila).toBeGreaterThan(0);
      expect(z.sila).toBeLessThanOrEqual(1);
      expect(z.velikost).toBeGreaterThanOrEqual(0);
      expect(z.velikost).toBeLessThanOrEqual(1);
      expect(z.odstin).toBeGreaterThanOrEqual(0);
      expect(z.odstin).toBeLessThan(1);
      expect(z.cas).toBeLessThanOrEqual(zdroj.zaznam.konec + SNIMEK);
    }
    expect(poslechni(new Poslech(u104, navrh), zdroj)).toEqual(zvuky);
  });

  it("zvuky nezávisí na tom, jak hustě se záznam přehrává: zlomy a pády zazní i zpomaleně a zrychleně", () => {
    for (const krok of [SNIMEK / 10, 4 * SNIMEK]) {
      const jine = poslechni(new Poslech(u104, navrh), zdroj, krok);
      expect(jine.filter((z) => z.druh === "zlom").map((z) => z.cas)).toEqual(zvuky.filter((z) => z.druh === "zlom").map((z) => z.cas));
      const padajici = (seznam: Zvuk[]): number[] =>
        [...new Set(seznam.filter((z) => z.druh === "splouchnuti" && z.puvod >= 0).map((z) => z.puvod))].sort();
      expect(padajici(jine)).toEqual(padajici(zvuky));
    }
  });

  it("skok po časové ose je potichu a co už spadlo, znovu nešplouchne", () => {
    const poslech = new Poslech(u104, navrh);
    const konec = zdroj.zaznam.konec;
    // Skok na konec, kde už všechno leží ve vodě.
    expect(poslech.posun(zdroj, 0)).toEqual([]);
    expect(poslech.posun(zdroj, konec - 0.5)).toEqual([]);
    const dozvuk: Zvuk[] = [];
    for (let cas = konec - 0.5; cas <= konec; cas += SNIMEK) dozvuk.push(...poslech.posun(zdroj, cas).map((z) => ({ ...z })));
    expect(dozvuk.filter((z) => z.druh === "zlom" || z.druh === "sjeti")).toEqual([]);
    expect(dozvuk.filter((z) => z.druh === "splouchnuti" && z.puvod >= 0)).toEqual([]);
    // Skok zpět taky mlčí.
    expect(poslech.posun(zdroj, 1)).toEqual([]);
    // Po přerušení se navazuje až od dalšího úseku.
    poslech.prerus();
    expect(poslech.posun(zdroj, 1 + SNIMEK)).toEqual([]);
  });
});

describe("kroky a kola", () => {
  it("chodci dupou v rytmu svého kroku, jen když jsou na mostě", () => {
    // Tři chodci místo obou výprav z úrovně: kroky lidí, kteří došlápnou spolu, zní jako jeden.
    const u: Uroven = {
      ...uroven("1-01"),
      jizdniRad: [
        { cas: 0, trasa: "cesta", smer: 1, druh: "chodec", pocet: 2, kadence: 1.8 },
        { cas: 2, trasa: "cesta", smer: -1, druh: "chodec", pocet: 1, kadence: 2.0 },
      ],
    };
    const navrh = RESENI["1-01"]!.pruchod;
    const zdroj = zaznamenej(u, navrh);
    const zvuky = poslechni(new Poslech(u, navrh), zdroj);
    const kroky = zvuky.filter((z) => z.druh === "krok");
    const trasa = u.trasy[0]!;
    expect(kroky.length).toBeGreaterThan(10);
    const snimek = prazdnySnimek();
    for (const krok of kroky) {
      expect(krok.x).toBeGreaterThanOrEqual(trasa.zacatek.x);
      expect(krok.x).toBeLessThanOrEqual(trasa.konec.x);
      zdroj.zaznam.stavV(krok.cas, snimek);
      expect(snimek.provoz[krok.puvod]).toBe(JEDE);
    }
    // Každý chodec došlapuje jednou za periodu kroku.
    zdroj.ucastnici.forEach((ucastnik, k) => {
      const jeho = kroky.filter((z) => z.puvod === k).map((z) => z.cas);
      expect(jeho.length).toBeGreaterThan(3);
      for (let i = 1; i < jeho.length; i++) expect(jeho[i]! - jeho[i - 1]!).toBeCloseTo(1 / ucastnik.kadence!, 6);
    });
    // Nic jiného na pevném mostě s chodci neslyšíme: nic se neláme a nikdo nepadá.
    expect(zvuky.filter((z) => z.druh !== "krok" && z.druh !== "vrzani")).toEqual([]);
  }, 60_000);

  it("došlap zní ve chvíli, kdy je kroková síla největší", () => {
    const u = uroven("2-02");
    const navrh = RESENI["2-02"]!.pruchod;
    const zkouska = new Zkouska(u, navrh, nasadaUrovne(u));
    const zaznam = new Zaznam();
    while (zkouska.simulace.cas < 9) {
      const davka = zkouska.pokracuj(0.5);
      for (const stavba of davka.topologie) zaznam.pridejTopologii(stavba);
      for (const snimek of davka.snimky) zaznam.pridej(snimek);
    }
    const zdroj: ZdrojDeje = { zaznam, ucastnici: zkouska.ucastnici, udalosti: [] };
    const kroky = poslechni(new Poslech(u, navrh), zdroj).filter((z) => z.druh === "krok");
    expect(kroky.length).toBeGreaterThan(8);
    // Fáze kroku, jak ji vede simulace: sinus fáze je při došlapu jedna.
    const bremena = zkouska.provoz.bremena[0]!;
    const cas = zkouska.simulace.cas;
    zkouska.ucastnici.forEach((ucastnik, k) => {
      const f = ucastnik.kadence!;
      const faze0 = Math.atan2(ucastnik.faze![1], ucastnik.faze![0]);
      expect(bremena.fazeSin[k]!).toBeCloseTo(Math.sin(2 * Math.PI * f * cas + faze0), 2);
      const jeho = kroky.filter((z) => z.puvod === k);
      for (const krok of jeho) expect(Math.sin(2 * Math.PI * f * krok.cas + faze0)).toBeCloseTo(1, 6);
    });
    // Čtyři běžci běží ve stejném rytmu, ale každý s jinou fází; běžec dupe víc než chodec.
    expect(kroky.every((z) => z.sila >= 0.3)).toBe(true);
  }, 60_000);

  it("útvar došlapuje naráz: jeden silný krok za všechny řady na mostě", () => {
    const u = uroven("2-03");
    const navrh = RESENI["2-03"]!.pruchod;
    const zdroj = zaznamenej(u, navrh);
    const zvuky = poslechni(new Poslech(u, navrh), zdroj);
    const kroky = zvuky.filter((z) => z.druh === "krok");
    const kadence = zdroj.ucastnici[0]!.kadence!;
    expect(kroky.length).toBeGreaterThan(30);
    // Žádné dva kroky těsně po sobě: celý útvar je jeden zvuk za periodu.
    for (let i = 1; i < kroky.length; i++) expect(kroky[i]!.cas - kroky[i - 1]!.cas).toBeCloseTo(1 / kadence, 6);
    const nejsilnejsi = Math.max(...kroky.map((z) => z.sila));
    const nejvetsi = Math.max(...kroky.map((z) => z.velikost));
    expect(nejsilnejsi).toBeGreaterThan(0.6);
    expect(nejvetsi).toBeGreaterThan(0.9);
    // Když je na mostě jen první řada, je krok slabší než s celým útvarem.
    expect(kroky[0]!.sila).toBeLessThan(nejsilnejsi);
  }, 60_000);

  it("kola ťukají na každé spáře mostovky a hluk valení trvá, jen dokud je vozidlo na mostě", () => {
    const u = uroven("1-03");
    const navrh = RESENI["1-03"]!.mistrovska;
    const zdroj = zaznamenej(u, navrh);
    const poslech = new Poslech(u, navrh);
    const zvuky: Zvuk[] = [];
    let valilo = 0;
    let nevalilo = 0;
    const snimek = prazdnySnimek();
    const trasa = u.trasy[0]!;
    for (let cas = 0; cas <= zdroj.zaznam.konec; cas += SNIMEK) {
      zvuky.push(...poslech.posun(zdroj, cas).map((z) => ({ ...z })));
      zdroj.zaznam.stavV(cas, snimek);
      const naMoste = zdroj.ucastnici.some(
        (ucastnik, k) =>
          !ucastnik.kadence &&
          snimek.provoz[k] === JEDE &&
          ucastnik.kola.some((i) => snimek.polohy[2 * i]! >= trasa.zacatek.x && snimek.polohy[2 * i]! <= trasa.konec.x),
      );
      expect(poslech.valeni > 0).toBe(naMoste);
      if (naMoste) valilo++;
      else nevalilo++;
    }
    expect(valilo).toBeGreaterThan(30);
    expect(nevalilo).toBeGreaterThan(30);

    const spary = [...new Set(navrh.pruty.filter((p) => p.prvek.startsWith("mostovka")).flatMap((p) => [p.a, p.b]))].length;
    const vozidla = zdroj.ucastnici.map((ucastnik, k) => ({ ucastnik, k })).filter(({ ucastnik }) => !ucastnik.kadence);
    expect(vozidla.length).toBeGreaterThan(0);
    for (const { ucastnik, k } of vozidla) {
      const jeho = zvuky.filter((z) => z.druh === "spara" && z.puvod === k);
      // Každé kolo přejede každou spáru právě jednou.
      expect(jeho).toHaveLength(spary * ucastnik.kola.length);
    }
    // Auto ťukne hlouběji a silněji než jízdní kolo.
    const auto = vozidla.find(({ ucastnik }) => ucastnik.druh === "auto")!;
    const kolo = vozidla.find(({ ucastnik }) => ucastnik.druh === "cyklista")!;
    const sila = (k: number): number => zvuky.find((z) => z.druh === "spara" && z.puvod === k)!.sila;
    expect(sila(auto.k)).toBeGreaterThan(sila(kolo.k) + 0.2);
  }, 60_000);
});

describe("drnčení a brnknutí", () => {
  it("rozhoupaná lávka drnčí, klidná ne", () => {
    const u = uroven("2-03");
    const drnceni = (navrh: NavrhMostu): number =>
      poslechni(new Poslech(u, navrh), zaznamenej(u, navrh)).filter((z) => z.druh === "drnceni").length;
    const rozhoupana = drnceni(RESENI["2-03"]!.pady.find((p) => p.nazev === "nízká příhrada bez závaží")!.navrh);
    const klidna = drnceni(RESENI["2-03"]!.mistrovska);
    expect(rozhoupana).toBeGreaterThan(20);
    expect(klidna).toBeLessThan(rozhoupana / 5);
  }, 120_000);

  it("brnknutí zazní jednou, hned na začátku", () => {
    const u = uroven("2-01");
    const navrh = RESENI["2-01"]!.pruchod;
    const stycnik = navrh.stycniky.findIndex((st) => st.x === 12 && st.y === 0);
    expect(stycnik).toBeGreaterThanOrEqual(0);
    const zdroj = zaznamenej(u, navrh, { stycnik, sila: 4000 });
    const zvuky = poslechni(new Poslech(u, navrh, stycnik), zdroj);
    const brnky = zvuky.filter((z) => z.druh === "brnk");
    expect(brnky).toHaveLength(1);
    expect(brnky[0]!.cas).toBeLessThan(0.01);
    expect(brnky[0]!.x).toBeCloseTo(12, 0);
    // Bez brnknutí se neozve.
    expect(poslechni(new Poslech(u, navrh), zdroj).some((z) => z.druh === "brnk")).toBe(false);
  }, 60_000);

  it("na zkušebním výkresu bez provozu a bez mostu je ticho", () => {
    const zkusebni = nactiUrovne().find((x) => x.id === "0-00")!;
    const poslech = new Poslech(zkusebni, { verze: RESENI["1-01"]!.pruchod.verze, uroven: "0-00", stycniky: [], pruty: [] });
    const prazdny: ZdrojDeje = { zaznam: new Zaznam(), ucastnici: [], udalosti: [] };
    expect(poslech.posun(prazdny, 0)).toEqual([]);
    expect(poslech.posun(prazdny, 1)).toEqual([]);
    expect(poslech.valeni).toBe(0);
  });
});
