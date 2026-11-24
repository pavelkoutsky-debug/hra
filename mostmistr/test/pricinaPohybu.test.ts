import { describe, expect, it } from "vitest";
import { Kreslic } from "../src/data/kreslic";
import { KATALOG } from "../src/data/katalog";
import { otoceniKridla, zkontrolujNavrh, type NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { pricinyPohybu, type PricinaPohybu } from "../src/zkouska/pricinaPohybu";
import type { VysledekZkousky } from "../src/zkouska/protokol";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const KAMPAN = nactiKampan();

function uroven(id: string): Uroven {
  const u = KAMPAN.find((x) => x.id === id);
  if (!u) throw new Error(`úroveň ${id} není v kampani`);
  return u;
}

function zkus(u: Uroven, navrh: NavrhMostu): { vysledek: VysledekZkousky; priciny: PricinaPohybu[] } {
  const zkouska = new Zkouska(u, navrh, nasadaUrovne(u));
  let pojistka = 0;
  while (!zkouska.hotovo) {
    zkouska.pokracuj(1);
    if (pojistka++ > 400) throw new Error("zkouška neskončila");
  }
  const vysledek = zkouska.vysledek();
  if (!vysledek.pohyb) throw new Error("úroveň nemá pohyb");
  return { vysledek, priciny: pricinyPohybu(navrh, u, vysledek.pohyb, vysledek.lode.narazilo) };
}

/**
 * Dvě dvanáctimetrová křídla úrovně 7-02 s písty z hlubokých kotev; `zdvih` na obou, pokud
 * `levyZdvih` neřekne levému jinak.
 */
function dveKridla(zdvih: number, volby: { levyPist?: boolean; pravyPist?: boolean; zamek?: boolean; levyZdvih?: number } = {}): NavrhMostu {
  const k = new Kreslic("7-02");
  k.prut("mostovka-ocel", [0, 0], [6, 0]);
  k.prut("mostovka-ocel", [6, 0], [12, 0]);
  k.bod(6, 0, { svar: true });
  if (volby.levyPist !== false) k.prut("pist", [0, -5], [6, 0], { zdvih: volby.levyZdvih ?? zdvih });
  k.prut("mostovka-ocel", [24, 0], [18, 0]);
  k.prut("mostovka-ocel", [18, 0], [12, 0]);
  k.bod(18, 0, { svar: true });
  if (volby.pravyPist !== false) k.prut("pist", [24, -5], [18, 0], { zdvih });
  if (volby.zamek !== false) k.bod(12, 0, { zamek: true });
  return k.navrh();
}

/** Jediné dvacetimetrové křídlo úrovně 7-05 se zámkem na pravé opěře; píst a výztuhy přidá `stav`. */
function jedineKridlo(uzly: readonly number[], stav: (k: Kreslic) => void): NavrhMostu {
  const k = new Kreslic("7-05");
  const xs = [0, ...uzly, 20];
  for (let i = 0; i + 1 < xs.length; i++) k.prut("mostovka-ocel", [xs[i]!, 0], [xs[i + 1]!, 0]);
  for (const x of uzly) k.bod(x, 0, { svar: true });
  k.bod(20, 0, { zamek: true });
  stav(k);
  return k.navrh();
}

const KAPITOLA_7 = ["7-01", "7-02", "7-03", "7-04", "7-05"];

describe("proč pohyblivý most neprošel", { timeout: 120_000 }, () => {
  it("mosty autora, které projdou, žádnou příčinu nemají", () => {
    for (const id of KAPITOLA_7) {
      const u = uroven(id);
      const { vysledek, priciny } = zkus(u, RESENI[id]!.pruchod);
      expect(vysledek.pruchod, id).toBe(true);
      expect(priciny, id).toEqual([]);
      // Křídlo se zvedlo aspoň o 25° a nepřeklopilo se.
      expect(vysledek.pohyb!.kosinusOtoceni, id).toBeLessThan(0.91);
      expect(vysledek.pohyb!.kosinusOtoceni, id).toBeGreaterThan(0.3);
      expect(vysledek.pohyb!.pistyPriNarazu, id).toBeNull();
      expect(vysledek.pohyb!.nezamceno, id).toBeNull();
    }
  });

  it("křídlo bez pístu: po odemknutí spadne a hra řekne které", () => {
    const { vysledek, priciny } = zkus(uroven("7-02"), dveKridla(2.5, { pravyPist: false }));
    expect(vysledek.pruchod).toBe(false);
    expect(vysledek.pohyb!.preklopeno).toBe(true);
    expect(priciny).toEqual([{ kod: "kridlo-bez-pistu", strana: "prave" }]);
  });

  it("malý zdvih: písty dojely, loď se pod křídlo nevešla", () => {
    const { vysledek, priciny } = zkus(uroven("7-02"), dveKridla(1.5));
    expect(vysledek.pruchod).toBe(false);
    expect(vysledek.lode.narazilo).toBeGreaterThan(0);
    expect(vysledek.pohyb!.pistyPriNarazu).toBe("drzi");
    expect(priciny[0]?.kod).toBe("maly-zdvih");
    // Úhel, o který se křídlo zvedlo, je menší než u mostu, který projde.
    const kosinus = (priciny[0] as { kosinus: number }).kosinus;
    expect(kosinus).toBeGreaterThan(zkus(uroven("7-02"), RESENI["7-02"]!.pruchod).vysledek.pohyb!.kosinusOtoceni);
    expect(kosinus).toBeLessThan(1);
  });

  it("most bez zámku se neodemkne: příčina je zámek, ne slabý píst", () => {
    const { vysledek, priciny } = zkus(uroven("7-02"), dveKridla(2.5, { zamek: false }));
    expect(vysledek.pruchod).toBe(false);
    expect(priciny).toEqual([{ kod: "bez-zamku" }]);
  });

  it("most bez pístu: loď narazí, protože se nezvedl", () => {
    const k = new Kreslic("7-01");
    k.prut("mostovka-ocel", [0, 0], [6, 0]);
    k.prut("mostovka-ocel", [6, 0], [12, 0]);
    k.bod(6, 0, { svar: true });
    k.bod(12, 0, { zamek: true });
    const u = uroven("7-01");
    const { vysledek, priciny } = zkus(u, k.navrh());
    expect(vysledek.pruchod).toBe(false);
    if (u.lode.length > 0) expect(priciny).toEqual([{ kod: "bez-pistu" }]);
  });

  it("nestejně dlouhá křídla: po sklopení se konce zámku minou a hra řekne o kolik", () => {
    const k = new Kreslic("7-04");
    for (const [a, b] of [[0, 5], [5, 10], [10, 15], [15, 19]] as const) k.prut("mostovka-ocel", [a, 0], [b, 0]);
    for (const x of [5, 10, 15]) k.bod(x, 0, { svar: true });
    k.prut("pist", [0, -6], [5, 0], { zdvih: 2.5 });
    for (const [a, b] of [[32, 28], [28, 23], [23, 19]] as const) k.prut("mostovka-ocel", [a, 0], [b, 0]);
    for (const x of [28, 23]) k.bod(x, 0, { svar: true });
    k.prut("pist", [32, -6], [28, 0], { zdvih: 2.25 });
    k.bod(19, 0, { zamek: true });
    const { vysledek, priciny } = zkus(uroven("7-04"), k.navrh());
    expect(vysledek.pruchod).toBe(false);
    expect(vysledek.pohyb!.zamceno).toBe(false);
    expect(vysledek.pohyb!.nezamceno?.pistyVCili).toBe(true);
    const minuly = priciny.find((p) => p.kod === "minuly-se");
    expect(minuly, JSON.stringify(priciny)).toBeDefined();
    // Konce se míjejí hlavně na výšku, o desítky centimetrů (zámek zapadne do 5 cm).
    const svisle = Math.abs((minuly as { svisle: number }).svisle);
    expect(svisle).toBeGreaterThan(0.2);
    expect(svisle).toBeLessThan(1);
  });

  it("dvě křídla s nestejným zdvihem: hra jmenuje křídlo, do kterého loď narazila, a jeho úhel", () => {
    const u = uroven("7-02");
    const { vysledek, priciny } = zkus(u, dveKridla(2.5, { levyZdvih: 1.25 }));
    expect(vysledek.pruchod).toBe(false);
    expect(priciny[0]).toMatchObject({ kod: "maly-zdvih", strana: "leve" });
    // Pravé křídlo se zvedlo stejně jako u mostu, který projde; hlášený úhel je úhel levého.
    const projde = zkus(u, dveKridla(2.5));
    expect(projde.vysledek.pruchod).toBe(true);
    const kosinus = (priciny[0] as { kosinus: number }).kosinus;
    expect(vysledek.pohyb!.kosinusOtoceni).toBeCloseTo(projde.vysledek.pohyb!.kosinusOtoceni, 2);
    expect(kosinus).toBeGreaterThan(projde.vysledek.pohyb!.kosinusOtoceni + 0.1);
  });

  it("most úplně bez pístů: křídla po odemknutí spadnou, i když se nepřeklopí", () => {
    const { vysledek, priciny } = zkus(uroven("7-02"), dveKridla(2.5, { levyPist: false, pravyPist: false }));
    expect(vysledek.pruchod).toBe(false);
    expect(priciny).toEqual([{ kod: "kridlo-bez-pistu", strana: null }]);
  });

  it("prut, který při zvedání povolí: příčina je porušení, ne malý zdvih", () => {
    // Píst tlačí do konce lehkého pahýlu pod mostovkou; pahýl povolí hned po odemknutí.
    const u = uroven("7-05");
    const navrh = jedineKridlo([6, 11, 16], (k) => {
      k.prut("ocel-lehka", [6, 0], [6, -2]);
      k.prut("pist", [0, -5], [6, -2], { zdvih: 3 });
    });
    expect(zkontrolujNavrh(navrh, u)).toEqual([]);
    const { vysledek, priciny } = zkus(u, navrh);
    expect(vysledek.pruchod).toBe(false);
    expect(vysledek.poruseni).toBeGreaterThan(0);
    expect(vysledek.pohyb!.poruseno).toBe("zvedani");
    expect(priciny).toEqual([{ kod: "poruseno" }]);
  });

  it("pata pístu na prutu, který uhne: písty vyjely, křídlo se nehnulo", () => {
    const u = uroven("7-05");
    const navrh = jedineKridlo([4, 8, 14], (k) => {
      k.prut("ocel-lehka", [0, -5], [3, -5]);
      k.prut("pist", [3, -5], [8, 0], { zdvih: 3.5 });
    });
    expect(zkontrolujNavrh(navrh, u)).toEqual([]);
    const { vysledek, priciny } = zkus(u, navrh);
    expect(vysledek.pruchod).toBe(false);
    expect(vysledek.poruseni).toBe(0);
    expect(priciny[0]).toEqual({ kod: "nehnulo-se" });
  });

  it("zdvih nula je malý zdvih, záporný zdvih táhne křídlo dolů", () => {
    const u = uroven("7-05");
    const nula = zkus(u, jedineKridlo([6, 11, 16], (k) => k.prut("pist", [0, -5], [6, 0], { zdvih: 0 })));
    expect(nula.priciny[0]).toMatchObject({ kod: "maly-zdvih", strana: null });
    const zaporny = zkus(u, jedineKridlo([6, 11, 16], (k) => k.prut("pist", [0, -5], [6, 0], { zdvih: -1 })));
    expect(zaporny.vysledek.pruchod).toBe(false);
    expect(zaporny.priciny[0]).toEqual({ kod: "tahne-dolu" });
    // Totéž ví už výkres: paleta to hráči řekne dřív než zkouška.
    const smer = (zdvih: number): boolean | null | undefined => {
      const navrh = jedineKridlo([6, 11, 16], (k) => k.prut("pist", [0, -5], [6, 0], { zdvih }));
      return otoceniKridla(navrh, u, navrh.pruty.find((p) => p.prvek === "pist")!)?.zveda;
    };
    expect(smer(2.5)).toBe(true);
    expect(smer(-1)).toBe(false);
    expect(smer(0)).toBeNull();
    // Křídlo vpravo od čepu se zvedá opačným směrem otáčení; kladný zdvih ho zvedá také.
    const dve = dveKridla(2.5);
    expect(dve.pruty.filter((p) => p.prvek === "pist").map((p) => otoceniKridla(dve, uroven("7-02"), p)?.zveda)).toEqual([true, true]);
  });

  it("nesvařená mostovka se zalomí: hra neříká, že má píst velký zdvih", () => {
    for (const [id, nazev] of [["7-01", "nesvařen"], ["7-05", "nesvařen"]] as const) {
      const u = uroven(id);
      const pad = RESENI[id]!.pady.find((x) => x.nazev.includes(nazev));
      expect(pad, id).toBeDefined();
      const { vysledek, priciny } = zkus(u, pad!.navrh);
      expect(vysledek.pohyb!.preklopeno, id).toBe(true);
      expect(priciny, id).toEqual([{ kod: "zalomeno" }]);
    }
  });

  it("písty mostů autora křídlo zvedají (žádný ho netáhne dolů)", () => {
    for (const id of KAPITOLA_7) {
      const u = uroven(id);
      const r = RESENI[id]!;
      for (const navrh of [r.pruchod, r.rozpocet, r.mistrovska, ...(r.vyzvy ?? []).map((v) => v.navrh)]) {
        for (const p of navrh.pruty) {
          if (KATALOG[p.prvek].druh !== "pist") continue;
          expect(otoceniKridla(navrh, u, p)?.zveda ?? true, id).toBe(true);
        }
      }
    }
  });

  it("pády kapitoly 7 dostanou příčinu, která sedí k jejich názvu", () => {
    const radky: string[] = [];
    for (const id of KAPITOLA_7) {
      const u = uroven(id);
      for (const pad of RESENI[id]!.pady) {
        const { vysledek, priciny } = zkus(u, pad.navrh);
        radky.push(`${id} „${pad.nazev}“: ${priciny.map((p) => JSON.stringify(p)).join(" + ") || "—"} | zvednuto ${vysledek.pohyb!.zvednuto} při nárazu ${vysledek.pohyb!.pistyPriNarazu} přetíženo ${vysledek.pohyb!.pretizenychPistu} zamčeno ${vysledek.pohyb!.zamceno}`);
      }
    }
    expect(radky.join("\n")).toMatchSnapshot();
  });
});
