// Velká rozpětí: lana a napínák, automatické dopnutí, pilíře, svary a plastické klouby.
import { describe, expect, it } from "vitest";
import { cenaNavrhu } from "../src/data/cena";
import { CENA_SVARU, KATALOG, PREDPETI_LANA, predpetiZeZkraceni, vlastnostiPrutu, zkraceniLana } from "../src/data/katalog";
import { Kreslic } from "../src/data/kreslic";
import { zkontrolujNavrh, type NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { Editor } from "../src/editor/editor";
import { nastavPredpeti, nastavSvar, prazdnyNavrh, pridejPrut, zmenPrvek, zrcadli } from "../src/editor/upravy";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { najdiRovnovahu } from "../src/jadro/matice";
import { spoctiVnitrniSily } from "../src/jadro/sily";
import { LANO, sestavSoustavu } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import { najdiKlid } from "../src/jadro/ustaleni";
import { VERZE_FYZIKY } from "../src/jadro/verze";
import { BehZkousky } from "../src/zkouska/beh";
import { dopniLana } from "../src/zkouska/dopnuti";
import type { ZpravaZeZkousky } from "../src/zkouska/protokol";
import { urovenRegrese } from "../src/zkouska/regrese";
import { rozeberMost } from "../src/zkouska/rozbor";
import { sestavMost } from "../src/zkouska/stavba";
import { hmotnostUcastnika, jeVozidlo, modelUcastnika } from "../src/zkouska/vozidla";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const B = (x: number, y: number) => ({ x, y });
const kampan = new Map(nactiKampan().map((u) => [u.id, u]));
const zavesena = kampan.get("4-03")!;
const visuta = kampan.get("4-04")!;

/** Údolí 60 m se základem uprostřed a se vším, co čtvrtá kapitola dovoluje. */
function udoli(): Uroven {
  return {
    ...urovenRegrese({ rozpeti: 60, sirka: 7, vybaveni: 600, zaklady: [{ x: 30, y: -10 }] }),
    povolenePrvky: ["mostovka-ocelobeton", "ocel-lehka", "ocel-tezka", "lano", "lano-nosne", "pilir"],
  };
}

/** Zavěšený most: pylon uprostřed a vějíř lan s daným předpětím do styčníků mostovky. */
function zaveseny(predpeti: number, mista = [0, 6, 12, 18, 24, 36, 42, 48, 54, 60]): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < 60; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
  k.prut("pilir", [30, -10], [30, 0]);
  k.prut("pilir", [30, 0], [30, 12]);
  k.prut("pilir", [30, 12], [30, 16]);
  for (const x of mista) k.prut("lano", [30, 16], [x, 0], { predpeti });
  return k.navrh();
}

/** Svislé posuny styčníků mostovky v klidové poloze mostu, m; null, když most klid nemá. */
function pruhybyMostovky(uroven: Uroven, navrh: NavrhMostu): number[] | null {
  const stavba = sestavMost(uroven, navrh);
  const s = sestavSoustavu(stavba.popis);
  if (!najdiKlid(s, volneStupne(s), TIHOVE_ZRYCHLENI)) return null;
  return navrh.stycniky.flatMap((st, i) => (st.y === 0 ? [s.y[i]! - st.y] : []));
}

function sPredpetim(navrh: NavrhMostu, predpeti: ReadonlyMap<number, number>): NavrhMostu {
  return { ...navrh, pruty: navrh.pruty.map((p) => (predpeti.has(p.id) ? { ...p, predpeti: predpeti.get(p.id)! } : p)) };
}

describe("lano a napínák v katalogu", () => {
  it("nosné lano má čtyřnásobný průřez závěsného a obě jsou hotové", () => {
    const zavesne = vlastnostiPrutu("lano", 7)!;
    const nosne = vlastnostiPrutu("lano-nosne", 7)!;
    expect(nosne.unosnost.tah / zavesne.unosnost.tah).toBeCloseTo(4, 2);
    expect(nosne.EA / zavesne.EA).toBeCloseTo(4, 2);
    expect(KATALOG.lano.hotovo && KATALOG["lano-nosne"].hotovo && KATALOG.pilir.hotovo).toBe(true);
    for (const id of ["lano", "lano-nosne"] as const) {
      expect(KATALOG[id].druh).toBe("lano");
      expect(vlastnostiPrutu(id, 7)!.unosnost.tlak).toBe(0);
    }
  });

  it("předpětí a zkrácení lana jsou dva zápisy téhož", () => {
    // Lano s E = 150 GPa a pevností 1 400 MPa se na mezi pevnosti protáhne o 0,93 %.
    expect(zkraceniLana("lano", 30, 1)).toBeCloseTo(30 - 30 / (1 + 1400 / 150000), 9);
    expect(zkraceniLana("lano", 30, 0)).toBe(0);
    expect(zkraceniLana("lano", 30, -2)).toBeLessThan(0);
    for (const zkraceni of [0.014, 0.25, -0.3]) {
      expect(zkraceniLana("lano", 12, predpetiZeZkraceni("lano", 12, zkraceni))).toBeCloseTo(zkraceni, 9);
    }
    // Rozsah napínáku: lano smí být citelně kratší i delší než nakreslené.
    expect(zkraceniLana("lano", 6, PREDPETI_LANA.nejvetsi)).toBeGreaterThan(1.5);
    expect(zkraceniLana("lano", 6, PREDPETI_LANA.nejmensi)).toBeLessThan(-3);
  });
});

describe("úpravy návrhu s lany a svary", () => {
  it("nové lano je mírně dotažené; jiný prvek předpětí nemá a změna prvku ho zahodí", () => {
    let navrh = pridejPrut(prazdnyNavrh("9-99"), B(0, 0), B(6, 0), "mostovka-ocelobeton");
    navrh = pridejPrut(navrh, B(0, 8), B(6, 0), "lano");
    expect(navrh.pruty[0]!.predpeti).toBeUndefined();
    expect(navrh.pruty[1]!.predpeti).toBe(PREDPETI_LANA.vychozi);
    expect(zmenPrvek(navrh, [1], "ocel-lehka").pruty[1]).toEqual({ id: 1, a: 2, b: 1, prvek: "ocel-lehka" });
    expect(zmenPrvek(navrh, [0], "lano-nosne").pruty[0]!.predpeti).toBe(PREDPETI_LANA.vychozi);
  });

  it("předpětí se nastavuje jen lanům a drží se v rozsahu napínáku", () => {
    let navrh = pridejPrut(prazdnyNavrh("9-99"), B(0, 0), B(6, 0), "mostovka-ocelobeton");
    navrh = pridejPrut(navrh, B(0, 8), B(6, 0), "lano");
    const oba = new Set([0, 1]);
    const napnute = nastavPredpeti(navrh, oba, () => 0.2);
    expect(napnute.pruty.map((p) => p.predpeti)).toEqual([undefined, 0.2]);
    expect(nastavPredpeti(napnute, oba, () => 0.2)).toBe(napnute);
    expect(nastavPredpeti(navrh, oba, () => 1e6).pruty[1]!.predpeti).toBe(PREDPETI_LANA.nejvetsi);
    expect(nastavPredpeti(navrh, oba, () => -1e6).pruty[1]!.predpeti).toBe(PREDPETI_LANA.nejmensi);
  });

  it("svar se styčníku přidá a zase odebere; platí se za každý připojený prut", () => {
    const k = new Kreslic();
    k.prut("mostovka-ocelobeton", [0, 0], [6, 0]);
    k.prut("mostovka-ocelobeton", [6, 0], [12, 0]);
    k.prut("ocel-lehka", [6, 0], [6, 3]);
    const navrh = k.navrh();
    const stred = k.bod(6, 0);
    const svareny = nastavSvar(navrh, new Set([stred]), true);
    expect(svareny.stycniky[stred]).toEqual({ id: stred, x: 6, y: 0, svar: true });
    expect(nastavSvar(svareny, new Set([stred]), true)).toBe(svareny);
    // Do středního styčníku vedou tři pruty.
    expect(cenaNavrhu(svareny) - cenaNavrhu(navrh)).toBe(3 * CENA_SVARU);
    expect(nastavSvar(svareny, new Set([stred]), false).stycniky[stred]).toEqual({ id: stred, x: 6, y: 0 });
  });

  it("zrcadlení přenese předpětí lana i svar", () => {
    const k = new Kreslic();
    k.prut("mostovka-ocelobeton", [0, 0], [6, 0]);
    k.prut("lano", [12, 8], [6, 0], { predpeti: 0.17 });
    k.bod(6, 0, { svar: true });
    const cely = zrcadli(k.navrh(), 12);
    const obraz = cely.pruty.find((p) => p.prvek === "lano" && p.predpeti === 0.17 && p.id !== 1);
    expect(obraz).toBeDefined();
    expect(cely.stycniky.find((s) => s.x === 18 && s.y === 0)?.svar).toBe(true);
  });
});

describe("editor: napínák, svar a pilíř", () => {
  const editor = (): Editor => new Editor(zavesena, prazdnyNavrh(zavesena.id));
  const nakresli = (e: Editor, prvek: Parameters<Editor["zvolPrvek"]>[0], od: [number, number], k: [number, number]): boolean => {
    e.zvolPrvek(prvek);
    e.stiskni(B(od[0], od[1]));
    e.tahni(B(k[0], k[1]));
    return e.pust();
  };

  it("pilíř jde postavit jen ze základu nebo na jiný pilíř", () => {
    const e = editor();
    // Z opěry pilíř nevyroste, ze základu ano; druhý díl na něj naváže.
    expect(nakresli(e, "pilir", [0, 0], [0, 6])).toBe(false);
    expect(e.posledniDuvod).toBe("pilir-mimo-zaklad");
    expect(nakresli(e, "pilir", [30, -10], [30, 0])).toBe(true);
    expect(nakresli(e, "pilir", [30, 0], [30, 12])).toBe(true);
    expect(zkontrolujNavrh(e.navrh, zavesena)).toEqual([]);
  });

  it("nakreslené lano zůstane vybrané a napínák ho po milimetrech dotahuje a povoluje", () => {
    const e = editor();
    nakresli(e, "pilir", [30, -10], [30, 0]);
    nakresli(e, "pilir", [30, 0], [30, 12]);
    nakresli(e, "mostovka-ocelobeton", [0, 0], [6, 0]);
    expect(e.predpetiVyberu).toBeNull();
    expect(nakresli(e, "lano", [30, 12], [6, 0])).toBe(true);
    const lano = e.navrh.pruty.at(-1)!;
    expect([...e.vybranePruty]).toEqual([lano.id]);
    const delka = Math.hypot(24, 12);
    const vychozi = e.predpetiVyberu!;
    expect(vychozi.predpeti).toBe(PREDPETI_LANA.vychozi);
    expect(vychozi.zkraceni).toBeCloseTo(zkraceniLana("lano", delka, PREDPETI_LANA.vychozi), 12);
    expect(e.pocetLan).toBe(1);

    // Výchozí zkrácení je 12,5 mm; krok nahoru ho zarovná na 13 mm, dalších deset přidá centimetr.
    expect(e.zmenPredpeti(1)).toBe(true);
    expect(1000 * e.predpetiVyberu!.zkraceni).toBeCloseTo(13, 6);
    e.zmenPredpeti(10);
    expect(1000 * e.predpetiVyberu!.zkraceni).toBeCloseTo(23, 6);
    // Dolů přes nulu: lano je pak delší než nakreslené a předpětí záporné.
    e.zmenPredpeti(-30);
    expect(1000 * e.predpetiVyberu!.zkraceni).toBeCloseTo(-7, 6);
    expect(e.predpetiVyberu!.predpeti).toBeLessThan(0);
    expect(zkontrolujNavrh(e.navrh, zavesena)).toEqual([]);
    // Úpravu jde vzít zpět.
    e.zpet();
    expect(1000 * e.predpetiVyberu!.zkraceni).toBeCloseTo(23, 6);
  });

  it("společný krok zachová rozdíly mezi lany a výsledek dopnutí se zapíše jedním krokem historie", () => {
    const e = new Editor(zavesena, zaveseny(0.05));
    const lana = e.navrh.pruty.filter((p) => p.prvek === "lano");
    expect(e.nastavPredpetiLan(new Map([[lana[0]!.id, 0.1], [lana[1]!.id, 0.3]]))).toBe(true);
    e.vyberVse();
    expect(e.predpetiVyberu).toMatchObject({ predpeti: 0.3, ruzne: true });
    const pred = e.navrh.pruty.filter((p) => p.prvek === "lano").map((p) => p.predpeti!);
    e.zmenPredpeti(5);
    const po = e.navrh.pruty.filter((p) => p.prvek === "lano").map((p) => p.predpeti!);
    for (let i = 0; i < pred.length; i++) expect(po[i]!).toBeGreaterThan(pred[i]!);
    expect(po[1]! - po[0]!).toBeCloseTo(0.2, 1);
    e.zpet();
    e.zpet();
    expect(e.navrh.pruty.filter((p) => p.prvek === "lano").every((p) => p.predpeti === 0.05)).toBe(true);
  });

  it("svar vybraných styčníků se přepíná; kde svary povolené nejsou, nejde to", () => {
    const e = new Editor(zavesena, zaveseny(0.05));
    expect(e.svarVyberu).toBeNull();
    expect(e.prepniSvar()).toBe(false);
    const stred = e.navrh.stycniky.find((s) => s.x === 12 && s.y === 0)!;
    const vedle = e.navrh.stycniky.find((s) => s.x === 18 && s.y === 0)!;
    e.vyberJenStycnik(stred.id);
    expect(e.svarVyberu).toBe(false);
    expect(e.prepniSvar()).toBe(true);
    expect(e.svarVyberu).toBe(true);
    // Smíšený výběr se nejdřív celý svaří, teprve pak se svary ruší.
    e.vybraneStycniky.add(vedle.id);
    expect(e.svarVyberu).toBe(false);
    e.prepniSvar();
    expect(e.navrh.stycniky.filter((s) => s.svar).map((s) => s.x)).toEqual([12, 18]);
    e.prepniSvar();
    expect(e.navrh.stycniky.some((s) => s.svar)).toBe(false);

    const bezSvaru = new Editor({ ...zavesena, povoleneSvary: false }, zaveseny(0.05));
    bezSvaru.vyberJenStycnik(stred.id);
    expect(bezSvaru.prepniSvar()).toBe(false);
  });
});

describe("klidová poloha mostu s lany", () => {
  it("povolená lana přímý výpočet nezvládne, ustálení ano; most na nich visí níž než na dotažených", () => {
    const uroven = udoli();
    const povolena = sestavSoustavu(sestavMost(uroven, zaveseny(-0.5)).popis);
    const stupne = volneStupne(povolena);
    expect(najdiRovnovahu(povolena, stupne, new Float64Array(stupne.length), TIHOVE_ZRYCHLENI)).toBeLessThan(0);
    const visi = pruhybyMostovky(uroven, zaveseny(-0.5))!;
    const drzi = pruhybyMostovky(uroven, zaveseny(0.05))!;
    expect(visi).not.toBeNull();
    expect(Math.min(...visi)).toBeLessThan(Math.min(...drzi) - 0.05);
    // Ani s dotaženými lany mostovka nedrží tvar sama: krajní pole klesnou o centimetry.
    expect(Math.min(...drzi)).toBeLessThan(-0.03);
    expect(Math.min(...drzi)).toBeGreaterThan(-0.15);
  });

  it("most, který bez lan drží jen na kloubech, klidovou polohu nemá", () => {
    expect(pruhybyMostovky(udoli(), zaveseny(0.05, []))).toBeNull();
  });

  it("díly lana smrštěné do jednoho bodu výpočet nerozbijí", () => {
    // Svislé lano po zřícení: jeho díly dopadnou na stejné místo terénu a mají nulovou délku.
    const k = new Kreslic();
    k.prut("lano", [0, 0], [0, -6]);
    const s = sestavSoustavu(sestavMost(urovenRegrese({ rozpeti: 12 }), k.navrh()).popis);
    for (let i = 0; i < s.pocetStycniku; i++) {
      s.x[i] = 0;
      s.y[i] = 0;
    }
    spoctiVnitrniSily(s);
    for (let i = 0; i < s.pocetStycniku; i++) expect(s.fx[i]! + s.fy[i]!).toBe(0);
    for (let e = 0; e < s.pocetPrvku; e++) {
      expect(s.druh[e]).toBe(LANO);
      expect(s.osovaSila[e]).toBe(0);
    }
  });
});

describe("automatické dopnutí lan", () => {
  it("zavěšenému mostu srovná mostovku na zlomek milimetru a všechna lana nechá napnutá", () => {
    const uroven = udoli();
    const navrh = zaveseny(0.05);
    const dopnuti = dopniLana(uroven, navrh)!;
    expect(dopnuti.pred).toBeGreaterThan(0.04);
    expect(dopnuti.po).toBeLessThan(0.001);
    const dopnuty = sPredpetim(navrh, dopnuti.predpeti);
    expect(zkontrolujNavrh(dopnuty, uroven)).toEqual([]);
    // Co dopnutí hlásí, to most opravdu dělá (ve styčníku nad pylonem mostovka sedne s ním).
    const pruhyby = pruhybyMostovky(uroven, dopnuty)!;
    expect(Math.max(...pruhyby.map(Math.abs))).toBeLessThan(0.001);
    // Lana do pole nesou mostovku (10 až 20 % pevnosti), kotevní zůstala jen napnutá.
    const tahy = rozeberMost(uroven, dopnuty).tahyLan;
    const pevnost = vlastnostiPrutu("lano", 7)!.unosnost.tah;
    const podily = dopnuty.pruty.flatMap((p, i) => (p.prvek === "lano" ? [tahy[i]! / pevnost] : []));
    expect(podily).toHaveLength(10);
    for (const podil of podily) expect(podil).toBeGreaterThan(0.04);
    for (const podil of podily.slice(1, -1)) expect(podil).toBeGreaterThan(0.09);
    expect(Math.max(...podily)).toBeLessThan(0.25);
    expect(tahy.filter((t) => t === null)).toHaveLength(dopnuty.pruty.length - 10);
    // Dopnutí dopnutého mostu už nic podstatného nezmění.
    const znovu = dopniLana(uroven, dopnuty)!;
    for (const [id, predpeti] of znovu.predpeti) expect(predpeti).toBeCloseTo(dopnuti.predpeti.get(id)!, 2);
  });

  it("začne i z povolených lan a dojde ke stejnému výsledku", () => {
    const uroven = udoli();
    const zNapnutych = dopniLana(uroven, zaveseny(0.05))!;
    const zPovolenych = dopniLana(uroven, zaveseny(-0.5))!;
    expect(zPovolenych.po).toBeLessThan(0.001);
    expect(zPovolenych.pred).toBeGreaterThan(zNapnutych.pred);
    for (const [id, predpeti] of zPovolenych.predpeti) expect(predpeti).toBeCloseTo(zNapnutych.predpeti.get(id)!, 2);
  });

  it("visutému mostu přizpůsobí závěsy tvaru nosného lana; pylony zůstanou rovné", () => {
    const nedopnuty = RESENI["4-04"]!.pady.find((p) => p.nazev === "nedopnutá lana")!.navrh;
    const dopnuti = dopniLana(visuta, nedopnuty)!;
    // Nosné lano se pod tíhou přetvoří a s délkami podle výkresu mostovka klesne o desítky centimetrů.
    expect(dopnuti.pred).toBeGreaterThan(0.3);
    expect(dopnuti.po).toBeLessThan(0.002);
    const dopnuty = sPredpetim(nedopnuty, dopnuti.predpeti);
    expect(zkontrolujNavrh(dopnuty, visuta)).toEqual([]);
    // Některé závěsy se k tomu musely prodloužit (záporné předpětí), jiné zkrátit o víc než na mez pevnosti.
    const zavesy = dopnuty.pruty.filter((p) => p.prvek === "lano").map((p) => p.predpeti!);
    expect(Math.min(...zavesy)).toBeLessThan(-1);
    expect(Math.max(...zavesy)).toBeGreaterThan(1);
    // Hlavy pylonů: vodorovně na místě do pár milimetrů.
    const s = sestavSoustavu(sestavMost(visuta, dopnuty).popis);
    expect(najdiKlid(s, volneStupne(s), TIHOVE_ZRYCHLENI)).toBe(true);
    dopnuty.stycniky.forEach((st, i) => {
      if (st.y === 16 && (st.x === -4 || st.x === 76)) expect(Math.abs(s.x[i]! - st.x)).toBeLessThan(0.005);
    });
    // Skutečný tah v nosném laně odpovídá vzorci pro parabolu H = q·L²/(8·f) aspoň řádově:
    // mostovka s vybavením váží 4 240 kg/m, rozpětí lana 80 m, průvěs kolem 12 m.
    const tahy = rozeberMost(visuta, dopnuty).tahyLan;
    const nosna = dopnuty.pruty.flatMap((p, i) => (p.prvek === "lano-nosne" ? [tahy[i]!] : []));
    const vodorovny = (4240 * TIHOVE_ZRYCHLENI * 80 * 80) / (8 * 12);
    expect(Math.min(...nosna)).toBeGreaterThan(0.8 * vodorovny);
    expect(Math.max(...nosna)).toBeLessThan(1.8 * vodorovny);
  }, 60_000);

  it("referenční mosty kampaně s lany jsou dopnuté: mostovka pod vlastní tíhou drží tvar", () => {
    for (const [uroven, reseni] of [[zavesena, RESENI["4-03"]!], [visuta, RESENI["4-04"]!]] as const) {
      for (const navrh of [reseni.pruchod, reseni.rozpocet, reseni.mistrovska]) {
        const pruhyby = pruhybyMostovky(uroven, navrh)!;
        expect(Math.max(...pruhyby.map(Math.abs)), uroven.id).toBeLessThan(0.002);
      }
    }
  });

  it("bez lan, s mostem bez klidové polohy a s lany, která na nic nepůsobí, vrací null", () => {
    const uroven = udoli();
    expect(dopniLana(uroven, zaveseny(0.05, []))).toBeNull();
    // Lana jen po dvanácti metrech: mostovka mezi nimi se složí v kloubech.
    expect(dopniLana(uroven, zaveseny(0.05, [0, 12, 24, 36, 48, 60]))).toBeNull();
    const k = new Kreslic();
    k.prut("lano", [0, 0], [60, 0]);
    expect(dopniLana(uroven, k.navrh())).toBeNull();
  });

  it("jde vyžádat zprávou; most proti pravidlům úrovně dopnout nejde", () => {
    const zpravy: ZpravaZeZkousky[] = [];
    const beh = new BehZkousky((zprava) => zpravy.push(zprava));
    const navrh = RESENI["4-03"]!.pady.find((p) => p.nazev === "bez kotevních lan")!.navrh;
    beh.prijmi({ typ: "dopnuti", id: 7, uroven: zavesena, navrh });
    beh.prijmi({ typ: "dopnuti", id: 8, uroven: { ...zavesena, povolenePrvky: ["mostovka-ocelobeton"] }, navrh });
    expect(zpravy.map((z) => z.typ)).toEqual(["dopnuti", "dopnuti"]);
    const [prvni, druha] = zpravy as Extract<ZpravaZeZkousky, { typ: "dopnuti" }>[];
    expect(prvni!.id).toBe(7);
    expect(prvni!.dopnuti!.predpeti).toHaveLength(8);
    expect(prvni!.dopnuti!.po).toBeLessThan(0.001);
    expect(druha).toEqual({ typ: "dopnuti", id: 8, dopnuti: null });
    expect(beh.bezi).toBe(false);
  });
});

describe("milník: zavěšený a visutý most unesou kolonu kamionů", () => {
  const kolona: Uroven["jizdniRad"] = [{ cas: 0, trasa: "silnice", smer: 1, druh: "nakladni", pocet: 4, rozestup: 12 }];
  for (const [nazev, uroven, navrh] of [
    ["zavěšený", zavesena, RESENI["4-03"]!.pruchod],
    ["visutý", visuta, RESENI["4-04"]!.pruchod],
  ] as const) {
    it(`${nazev} most`, () => {
      const zkouska = new Zkouska({ ...uroven, jizdniRad: kolona }, navrh, nasadaUrovne(uroven));
      let pojistka = 0;
      while (!zkouska.hotovo) {
        zkouska.pokracuj(1);
        expect(pojistka++).toBeLessThan(200);
      }
      const vysledek = zkouska.vysledek();
      expect(vysledek).toMatchObject({ pruchod: true, prejelo: 4, spadlo: 0, poruseni: 0, bezRovnovahy: false, rozpad: false });
      expect(vysledek.nejvetsiVyuziti).toBeLessThan(0.7);
    }, 60_000);
  }
});

describe("plastické klouby v záznamu zkoušky", () => {
  it("přetížená svařená mostovka se v kloubu trvale ohne a záznam to nese; kloubový most klouby nemá", () => {
    const uroven = kampan.get("4-02")!;
    const zaznamenej = (navrh: NavrhMostu): { klouby: number; nejvetsi: number; poruseni: number } => {
      const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
      let klouby = 0;
      let nejvetsi = 0;
      let pojistka = 0;
      while (!zkouska.hotovo && pojistka++ < 200) {
        for (const snimek of zkouska.pokracuj(1).snimky) {
          klouby = Math.max(klouby, snimek.klouby.length / 2);
          for (let i = 1; i < snimek.klouby.length; i += 2) nejvetsi = Math.max(nejvetsi, snimek.klouby[i]!);
        }
      }
      return { klouby, nejvetsi, poruseni: zkouska.vysledek().poruseni };
    };
    // Svařená mostovka bez středního pilíře: čtyřiadvacet metrů nosník neunese a ohne se.
    const pretizeny = zaznamenej(RESENI["4-02"]!.pady.find((p) => p.nazev === "svařená mostovka bez středního pilíře")!.navrh);
    expect(pretizeny.klouby).toBeGreaterThan(0);
    expect(pretizeny.nejvetsi).toBeGreaterThan(0.2);
    expect(pretizeny.nejvetsi).toBeLessThanOrEqual(1);
    // Most, který vyhoví, se neohne nikde.
    expect(zaznamenej(RESENI["4-02"]!.mistrovska)).toEqual({ klouby: 0, nejvetsi: 0, poruseni: 0 });
  }, 60_000);
});

describe("nadměrný náklad", () => {
  it("váží 120 t, jede krokem a žádná řada kol nenese víc než 11,5 t", () => {
    const model = modelUcastnika("nadmerny")!;
    expect(hmotnostUcastnika(model)).toBeCloseTo(120_000, 6);
    expect(model.rychlost * 3.6).toBeCloseTo(10, 9);
    expect(model.napravy).toHaveLength(11);
    for (const n of model.napravy) expect(n.odpruzena + n.neodpruzena).toBeLessThanOrEqual(11500);
    expect(model.napravy.at(-1)!.odstup).toBeLessThan(model.delka);
    expect(jeVozidlo("nadmerny")).toBe(true);
  });

  it("zkouška s ním proběhne zprávami od začátku do konce", () => {
    const zpravy: ZpravaZeZkousky[] = [];
    const beh = new BehZkousky((zprava) => zpravy.push(zprava));
    beh.prijmi({
      typ: "start",
      vstup: { uroven: visuta, navrh: RESENI["4-04"]!.pruchod, nasada: nasadaUrovne(visuta), verzeFyziky: VERZE_FYZIKY },
    });
    let pojistka = 0;
    while (beh.pokracuj(1)) expect(pojistka++).toBeLessThan(200);
    const konec = zpravy.at(-1)!;
    expect(konec.typ).toBe("konec");
    if (konec.typ === "konec") expect(konec.vysledek).toMatchObject({ pruchod: true, ucastniku: 3, prejelo: 3 });
  }, 60_000);
});
