// Vedený první krok: který díl mostovky hra novému hráči ukáže.
import { describe, expect, it } from "vitest";
import { Kreslic } from "../src/data/kreslic";
import { dalsiDilMostovky } from "../src/data/vedeni";
import { nactiKampan } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const kampan = nactiKampan();
const prvni = kampan[0]!;

describe("vedený první krok", () => {
  it("na prázdném výkresu první úrovně ukáže první díl mostovky od levé podpory", () => {
    const krok = dalsiDilMostovky(new Kreslic(prvni.id).navrh(), prvni);
    expect(krok).toEqual({ od: { x: 0, y: 0 }, po: { x: 4, y: 0 }, prvek: "mostovka-drevo", prvni: true });
  });

  it("po prvním dílu ukáže další a s celou mostovkou skončí", () => {
    const k = new Kreslic(prvni.id);
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    expect(dalsiDilMostovky(k.navrh(), prvni)).toEqual({ od: { x: 4, y: 0 }, po: { x: 8, y: 0 }, prvek: "mostovka-drevo", prvni: false });
    k.prut("mostovka-drevo", [4, 0], [8, 0]);
    expect(dalsiDilMostovky(k.navrh(), prvni)).toBeNull();
    expect(dalsiDilMostovky(RESENI[prvni.id]!.pruchod, prvni)).toBeNull();
  });

  it("díl položený jinde než od kraje vedení nezmate: ukáže mezeru před ním", () => {
    const k = new Kreslic(prvni.id);
    k.prut("mostovka-drevo", [4, 0], [8, 0]);
    expect(dalsiDilMostovky(k.navrh(), prvni)).toMatchObject({ od: { x: 0, y: 0 }, po: { x: 4, y: 0 }, prvni: false });
    // Kratší mezera, než je nejdelší díl: duch končí na jejím konci.
    const kratsi = new Kreslic(prvni.id);
    kratsi.prut("mostovka-drevo", [0, 0], [3, 0]);
    kratsi.prut("mostovka-drevo", [5, 0], [8, 0]);
    expect(dalsiDilMostovky(kratsi.navrh(), prvni)).toMatchObject({ od: { x: 3, y: 0 }, po: { x: 5, y: 0 } });
  });

  it("na koleji vede kolejištěm a na každé úrovni kampaně dá díl, který úroveň dovoluje", () => {
    for (const uroven of kampan) {
      const krok = dalsiDilMostovky(new Kreslic(uroven.id).navrh(), uroven);
      expect(krok, uroven.id).not.toBeNull();
      expect(uroven.povolenePrvky, uroven.id).toContain(krok!.prvek);
      const trasa = uroven.trasy[0]!;
      expect(krok!.prvek === "kolejiste", uroven.id).toBe(trasa.druh === "kolej");
    }
  });
});
