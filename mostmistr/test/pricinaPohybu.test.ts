import { describe, expect, it } from "vitest";
import { Kreslic } from "../src/data/kreslic";
import type { NavrhMostu } from "../src/data/navrh";
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

/** Dvě dvanáctimetrová křídla úrovně 7-02 s písty z hlubokých kotev; `zdvih` na obou. */
function dveKridla(zdvih: number, volby: { pravyPist?: boolean; zamek?: boolean } = {}): NavrhMostu {
  const k = new Kreslic("7-02");
  k.prut("mostovka-ocel", [0, 0], [6, 0]);
  k.prut("mostovka-ocel", [6, 0], [12, 0]);
  k.bod(6, 0, { svar: true });
  k.prut("pist", [0, -5], [6, 0], { zdvih });
  k.prut("mostovka-ocel", [24, 0], [18, 0]);
  k.prut("mostovka-ocel", [18, 0], [12, 0]);
  k.bod(18, 0, { svar: true });
  if (volby.pravyPist !== false) k.prut("pist", [24, -5], [18, 0], { zdvih });
  if (volby.zamek !== false) k.bod(12, 0, { zamek: true });
  return k.navrh();
}

describe("proč pohyblivý most neprošel", { timeout: 120_000 }, () => {
  it("mosty autora, které projdou, žádnou příčinu nemají", () => {
    for (const id of ["7-01", "7-02", "7-03", "7-04"]) {
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

  it("pády kapitoly 7 dostanou příčinu, která sedí k jejich názvu", () => {
    const radky: string[] = [];
    for (const id of ["7-01", "7-02", "7-03", "7-04"]) {
      const u = uroven(id);
      for (const pad of RESENI[id]!.pady) {
        const { vysledek, priciny } = zkus(u, pad.navrh);
        radky.push(`${id} „${pad.nazev}“: ${priciny.map((p) => JSON.stringify(p)).join(" + ") || "—"} | zvednuto ${vysledek.pohyb!.zvednuto} při nárazu ${vysledek.pohyb!.pistyPriNarazu} přetíženo ${vysledek.pohyb!.pretizenychPistu} zamčeno ${vysledek.pohyb!.zamceno}`);
      }
    }
    expect(radky.join("\n")).toMatchSnapshot();
  });
});
