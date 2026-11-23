// Zkouška do zlomu: rovnoměrné zatížení mostovky roste, dokud most nepovolí. Co unesl,
// se dá u prostého nosníku spočítat z hlavy: zlomí se, když moment uprostřed q·L²/8 dosáhne
// únosnosti průřezu.
import { describe, expect, it } from "vitest";
import { KATALOG, MATERIALY, vlastnostiPrutu } from "../src/data/katalog";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { ZPUSOB_OHYB } from "../src/jadro/namahani";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { BehZkousky } from "../src/zkouska/beh";
import type { Udalost, VysledekZkousky, ZlomZkousky, ZpravaZeZkousky } from "../src/zkouska/protokol";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";
import { Zkouska } from "../src/zkouska/zkouska";
import { DOBEH_ZLOMU, NEJDELSI_ZLOM, zatizeniZlomu, ZKOUSKA_DO_ZLOMU } from "../src/zkouska/zlom";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const SIRKA = 2;
const VYBAVENI = 40;
const ROZPETI = 4;

function lavka(uprava: Partial<Uroven> = {}): Uroven {
  return {
    ...urovenRegrese({ rozpeti: ROZPETI, sirka: SIRKA, vybaveni: VYBAVENI }),
    trasy: [{ id: "lavka", druh: "lavka", zacatek: { x: 0, y: 0 }, konec: { x: ROZPETI, y: 0 } }],
    povolenePrvky: ["mostovka-drevo", "drevo-lehke"],
    jizdniRad: [{ cas: 0, trasa: "lavka", smer: 1, druh: "chodec", pocet: 2, kadence: 1.8 }],
    ...uprava,
  };
}

/** Jedno pole dřevěné mostovky z opěry na opěru: prostý nosník. */
function prkno(): NavrhMostu {
  const k = new Kreslic();
  k.prut("mostovka-drevo", [0, 0], [ROZPETI, 0]);
  return k.navrh();
}

function zlom(
  uroven: Uroven,
  navrh: NavrhMostu,
  zkouska: ZlomZkousky = ZKOUSKA_DO_ZLOMU,
): { vysledek: VysledekZkousky; udalosti: Udalost[]; trvani: number; sipek: number } {
  const z = new Zkouska(uroven, navrh, 1, undefined, undefined, zkouska);
  const udalosti: Udalost[] = [];
  let sipek = 0;
  let pojistka = 0;
  while (!z.hotovo) {
    const davka = z.pokracuj(1);
    udalosti.push(...davka.udalosti);
    for (const s of davka.snimky) sipek = Math.max(sipek, s.sily.length / 4);
    expect(pojistka++).toBeLessThan(200);
  }
  return { vysledek: z.vysledek(), udalosti, trvani: z.simulace.cas, sipek };
}

/** Zatížení, při kterém se prkno zlomí ohybem uprostřed, N/m: 8·M/L² bez vlastní tíhy. */
function unosnostPrkna(): number {
  const prurez = KATALOG["mostovka-drevo"].prurez!;
  const drevo = MATERIALY.drevo;
  const moment = drevo.mez.ohyb * prurez.W * SIRKA;
  const vlastniTiha = (drevo.hustota * prurez.A * SIRKA + VYBAVENI) * TIHOVE_ZRYCHLENI;
  return (8 * moment) / (ROZPETI * ROZPETI) - vlastniTiha;
}

describe("zkouška do zlomu", () => {
  it("zatížení roste s třetí mocninou času a po nejdelší době už neroste", () => {
    expect(zatizeniZlomu({ narust: 20 }, 0)).toBe(0);
    expect(zatizeniZlomu({ narust: 20 }, -3)).toBe(0);
    expect(zatizeniZlomu({ narust: 20 }, 10)).toBe(20_000);
    expect(zatizeniZlomu({ narust: 20 }, 20)).toBe(160_000);
    expect(zatizeniZlomu({ narust: 20 }, NEJDELSI_ZLOM + 50)).toBe(zatizeniZlomu({ narust: 20 }, NEJDELSI_ZLOM));
  });

  it("prkno přes potok se zlomí ohybem uprostřed při zatížení 8·M/L²", () => {
    const { vysledek, udalosti, trvani, sipek } = zlom(lavka(), prkno());
    const v = vysledek.zlom!;
    const ocekavane = unosnostPrkna();
    // Zátěž za běhu pořád roste a posudek se dělá jednou za pár kroků; víc než procento to nedělá.
    expect(v.zatizeni).toBeGreaterThan(0.99 * ocekavane);
    expect(v.zatizeni).toBeLessThan(1.01 * ocekavane);
    expect(v.delka).toBe(ROZPETI);
    expect(v.celkem).toBeCloseTo(v.zatizeni * ROZPETI, 6);
    expect(v.prut).toBe(0);
    expect(v.cas).not.toBeNull();
    expect(v.zatizeni).toBeCloseTo(zatizeniZlomu(ZKOUSKA_DO_ZLOMU, v.cas!), 6);
    // První událost je zlom mostovky ohybem; děj pak ještě chvíli doběhne.
    const prvni = udalosti.find((u) => u.druh === "poruseni");
    expect(prvni).toMatchObject({ prut: 0, zpusob: ZPUSOB_OHYB });
    expect(prvni!.cas).toBeCloseTo(v.cas!, 6);
    expect(trvani).toBeGreaterThan(v.cas! + DOBEH_ZLOMU - 0.1);
    expect(trvani).toBeLessThan(v.cas! + DOBEH_ZLOMU + 0.5);
    // Nikdo nešel, medaile se neudělují a zátěž je na výkresu vidět: šipka na každý metr.
    expect(vysledek.ucastniku).toBe(0);
    expect(vysledek.medaile).toEqual({ pruchod: false, rozpocet: false, mistrovska: false });
    expect(sipek).toBe(ROZPETI);
  });

  it("výsledek nezávisí na tom, jak rychle zátěž roste", () => {
    const pomalu = zlom(lavka(), prkno(), { narust: 5 }).vysledek.zlom!;
    const rychle = zlom(lavka(), prkno(), { narust: 80 }).vysledek.zlom!;
    expect(rychle.cas!).toBeLessThan(pomalu.cas!);
    expect(Math.abs(rychle.zatizeni / pomalu.zatizeni - 1)).toBeLessThan(0.03);
  });

  it("tvárné porušení: zátěž čeká, než se plastický kloub otevře, takže výsledek je statická mez", () => {
    // Ocelobetonové pole 6 m z opěry na opěru. Kloub uprostřed vznikne při plastickém momentu
    // a zlomí se až po natočení; kdyby zátěž mezitím rostla, připsala by mostu podle rychlosti
    // o 3 až 8 % víc, než unese.
    const k = new Kreslic();
    k.prut("mostovka-ocelobeton", [0, 0], [6, 0]);
    const sirka = 7;
    const vybaveni = 600;
    const silnice: Uroven = {
      ...urovenRegrese({ rozpeti: 6, sirka, vybaveni }),
      trasy: [{ id: "silnice", druh: "silnice", zacatek: { x: 0, y: 0 }, konec: { x: 6, y: 0 } }],
      povolenePrvky: ["mostovka-ocelobeton"],
      jizdniRad: [],
    };
    const vlastnosti = vlastnostiPrutu("mostovka-ocelobeton", sirka)!;
    const staticky = (8 * vlastnosti.unosnost.moment) / 36 - (vlastnosti.hmotnostNaMetr + vybaveni) * TIHOVE_ZRYCHLENI;
    const pomalu = zlom(silnice, k.navrh(), { narust: 5 }).vysledek.zlom!;
    const rychle = zlom(silnice, k.navrh(), { narust: 80 }).vysledek.zlom!;
    expect(pomalu.cas).not.toBeNull();
    expect(Math.abs(pomalu.zatizeni / staticky - 1)).toBeLessThan(0.01);
    expect(Math.abs(rychle.zatizeni / staticky - 1)).toBeLessThan(0.01);
    // Zátěž při zlomu je menší, než kolik by dala čistá kubika času: hodiny zátěže stály.
    expect(rychle.zatizeni).toBeLessThan(zatizeniZlomu({ narust: 80 }, rychle.cas!));
  });

  it("dvakrát širší mostovka unese dvakrát víc na metr délky", () => {
    const uzka = zlom(lavka(), prkno()).vysledek.zlom!;
    const siroka = zlom(lavka({ sirkaMostovky: 2 * SIRKA, hmotnostVybaveni: 2 * VYBAVENI }), prkno()).vysledek.zlom!;
    // Vlastní tíha roste se šířkou stejně jako únosnost, takže poměr je přesně dvě.
    expect(siroka.zatizeni / uzka.zatizeni).toBeGreaterThan(1.96);
    expect(siroka.zatizeni / uzka.zatizeni).toBeLessThan(2.04);
  });

  it("most bez klidové polohy neunesl nic", () => {
    const k = new Kreslic();
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    k.prut("mostovka-drevo", [4, 0], [8, 0]);
    const uroven = lavka({
      ...urovenRegrese({ rozpeti: 8, sirka: SIRKA, vybaveni: VYBAVENI }),
      trasy: [{ id: "lavka", druh: "lavka", zacatek: { x: 0, y: 0 }, konec: { x: 8, y: 0 } }],
    });
    const { vysledek, trvani } = zlom(uroven, k.navrh());
    expect(vysledek.bezRovnovahy).toBe(true);
    expect(vysledek.zlom).toMatchObject({ zatizeni: 0, celkem: 0, cas: 0 });
    // Trosky se dál nezatěžují: zkouška skončí, jakmile dopadnou.
    expect(trvani).toBeLessThan(DOBEH_ZLOMU + 0.5);
  });

  it("nárůst zátěže, který nic nezatíží, zkouška odmítne (jinak by „prošla“ bez provozu)", () => {
    for (const narust of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new Zkouska(lavka(), prkno(), 1, undefined, undefined, { narust })).toThrow(/nárůst zátěže/);
    }
  });

  it("pohyblivý most se do zlomu staví stejně jako pro běžnou zkoušku", () => {
    // Mostovka po metru a zámek jako čep: stejný počet prvků i styčníků mostu.
    const uroven = nactiKampan().find((u) => u.id === "7-01")!;
    const navrh = RESENI["7-01"]!.pruchod;
    const bezna = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
    const doZlomu = new Zkouska(uroven, navrh, nasadaUrovne(uroven), undefined, undefined, ZKOUSKA_DO_ZLOMU);
    const pocetProvozu = bezna.simulace.soustava.pocetStycniku - doZlomu.simulace.soustava.pocetStycniku;
    // Běžná zkouška má navíc jen styčníky a pérování vozidel.
    expect(pocetProvozu).toBeGreaterThan(0);
    expect(doZlomu.trasyMostovky).toEqual(bezna.trasyMostovky);
    // Dvanáct metrů mostovky po metru, ne po šestimetrových dílech, jak je nakreslená.
    const dilu = (z: Zkouska): number => {
      const mostovka = new Set(z.trasyMostovky);
      let pocet = 0;
      const s = z.simulace.soustava;
      for (let e = 0; e < s.pocetPrvku; e++) if (mostovka.has(s.prut[e]!)) pocet += 1;
      return pocet;
    };
    expect(dilu(doZlomu)).toBe(dilu(bezna));
    expect(dilu(doZlomu)).toBeGreaterThanOrEqual(12);
  });

  it("most, který vydržel až do konce, unesl aspoň to, co na něm leželo", () => {
    // Zátěž roste tak pomalu, že za celou zkoušku nedosáhne ani setiny únosnosti.
    const pomala = { narust: 0.001 };
    const { vysledek, udalosti, trvani } = zlom(lavka(), prkno(), pomala);
    expect(udalosti.filter((u) => u.druh === "poruseni")).toHaveLength(0);
    expect(trvani).toBeGreaterThanOrEqual(NEJDELSI_ZLOM);
    expect(vysledek.zlom).toMatchObject({ cas: null, prut: -1 });
    expect(vysledek.zlom!.zatizeni).toBeCloseTo(zatizeniZlomu(pomala, NEJDELSI_ZLOM), 6);
  });

  it("pohyblivý most: píst, který pod zátěží povolí, je první porušení", () => {
    const uroven = nactiKampan().find((u) => u.id === "7-02")!;
    const navrh = RESENI["7-02"]!.pruchod;
    const { vysledek } = zlom(uroven, navrh);
    const v = vysledek.zlom!;
    expect(v.cas).not.toBeNull();
    expect(navrh.pruty[v.prut]?.prvek).toBe("pist");
    // Zvedání ani lodě se při zkoušce do zlomu nekonají.
    expect(vysledek.pohyb).toBeNull();
    expect(vysledek.lode.celkem).toBe(0);
    void nasadaUrovne;
  });

  it("přes zprávy: start se zkouškou do zlomu vrátí výsledek a rozpočet platí", () => {
    const zpravy: ZpravaZeZkousky[] = [];
    const beh = new BehZkousky((z) => zpravy.push(z));
    beh.prijmi({
      typ: "start",
      vstup: { uroven: lavka(), navrh: prkno(), nasada: 1, verzeFyziky: VERZE_FYZIKY, zlom: ZKOUSKA_DO_ZLOMU },
    });
    let pojistka = 0;
    while (beh.pokracuj(1)) expect(pojistka++).toBeLessThan(200);
    const konec = zpravy.find((z) => z.typ === "konec");
    expect(konec?.typ === "konec" && konec.vysledek.zlom !== null && konec.vysledek.zlom.zatizeni > 0).toBe(true);
    expect(zpravy.find((z) => z.typ === "zacatek")).toMatchObject({ trvani: NEJDELSI_ZLOM, ucastnici: [] });

    // Most nad rozpočet zkoušku do zlomu nedostane: je to výzva o efektivitu, ne pokus.
    const draha: ZpravaZeZkousky[] = [];
    const druhy = new BehZkousky((z) => draha.push(z));
    druhy.prijmi({
      typ: "start",
      vstup: { uroven: lavka({ rozpocet: 100 }), navrh: prkno(), nasada: 1, verzeFyziky: VERZE_FYZIKY, zlom: ZKOUSKA_DO_ZLOMU },
    });
    expect(draha).toEqual([{ typ: "chyba", kod: "neplatny-vstup", podrobnosti: "nad-rozpocet" }]);
  });

  it("přes zprávy: most, který nevede od břehu k břehu, zkoušku do zlomu nedostane", () => {
    const start = (navrh: NavrhMostu, zlomu: boolean): ZpravaZeZkousky[] => {
      const zpravy: ZpravaZeZkousky[] = [];
      const beh = new BehZkousky((z) => zpravy.push(z));
      beh.prijmi({
        typ: "start",
        vstup: { uroven: lavka(), navrh, nasada: 1, verzeFyziky: VERZE_FYZIKY, ...(zlomu ? { zlom: ZKOUSKA_DO_ZLOMU } : {}) },
      });
      return zpravy;
    };
    const odmitnuto = [{ typ: "chyba", kod: "neplatny-vstup", podrobnosti: "zlom-bez-mostovky" }];
    // Prázdný výkres.
    expect(start(new Kreslic().navrh(), true)).toEqual(odmitnuto);
    // Jen trámy bez mostovky: zátěž by neměla na čem ležet a únosnost by vyšla z délky trasy.
    const tramy = new Kreslic();
    tramy.prut("drevo-lehke", [0, 0], [2, 1]);
    tramy.prut("drevo-lehke", [2, 1], [4, 0]);
    expect(start(tramy.navrh(), true)).toEqual(odmitnuto);
    // Půlka mostovky.
    const pulka = new Kreslic();
    pulka.prut("mostovka-drevo", [0, 0], [2, 0]);
    expect(start(pulka.navrh(), true)).toEqual(odmitnuto);
    // Běžná zkouška takový most pustí (a provoz na něm spadne).
    expect(start(pulka.navrh(), false)[0]).toMatchObject({ typ: "zacatek" });
    // Celá mostovka zkoušku do zlomu dostane.
    expect(start(prkno(), true)[0]).toMatchObject({ typ: "zacatek" });
  });
});
