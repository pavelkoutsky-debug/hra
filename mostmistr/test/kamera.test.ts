import { describe, expect, it } from "vitest";
import {
  MERITKO_MAX,
  MERITKO_MIN,
  celyVyrez,
  obrazNaSvet,
  omezNaVyrez,
  posunO,
  svetNaObraz,
  viditelnaOblast,
  zoomKolem,
  type Kamera,
  type Rozmer,
} from "../src/vykres/kamera";

const rozmer: Rozmer = { sirka: 800, vyska: 600 };
const kamera: Kamera = { x: 12, y: -3, meritko: 20 };

describe("převod mezi světem a obrazem", () => {
  it("střed pohledu leží uprostřed plátna", () => {
    expect(svetNaObraz(kamera, rozmer, { x: 12, y: -3 })).toEqual({ x: 400, y: 300 });
  });

  it("osa y světa míří nahoru, osa y obrazu dolů", () => {
    const vys = svetNaObraz(kamera, rozmer, { x: 12, y: 2 });
    expect(vys.y).toBe(300 - 5 * 20);
  });

  it("tam a zpět vrátí původní bod", () => {
    const bod = { x: -7.25, y: 4.5 };
    const zpet = obrazNaSvet(kamera, rozmer, svetNaObraz(kamera, rozmer, bod));
    expect(zpet.x).toBeCloseTo(bod.x, 12);
    expect(zpet.y).toBeCloseTo(bod.y, 12);
  });
});

describe("posun", () => {
  it("obsah jede s kurzorem", () => {
    const bod = { x: 5, y: 1 };
    const pred = svetNaObraz(kamera, rozmer, bod);
    const po = svetNaObraz(posunO(kamera, 40, -25), rozmer, bod);
    expect(po.x).toBeCloseTo(pred.x + 40, 9);
    expect(po.y).toBeCloseTo(pred.y - 25, 9);
  });
});

describe("zoom", () => {
  it("bod pod kotvou zůstane na místě", () => {
    const kotva = { x: 130, y: 470 };
    const pred = obrazNaSvet(kamera, rozmer, kotva);
    const po = obrazNaSvet(zoomKolem(kamera, rozmer, kotva, 1.7), rozmer, kotva);
    expect(po.x).toBeCloseTo(pred.x, 9);
    expect(po.y).toBeCloseTo(pred.y, 9);
  });

  it("měřítko se násobí faktorem", () => {
    expect(zoomKolem(kamera, rozmer, { x: 0, y: 0 }, 2).meritko).toBe(40);
  });

  it("nepřekročí meze", () => {
    expect(zoomKolem(kamera, rozmer, { x: 0, y: 0 }, 1e6).meritko).toBe(MERITKO_MAX);
    expect(zoomKolem(kamera, rozmer, { x: 0, y: 0 }, 1e-6).meritko).toBe(MERITKO_MIN);
  });

  it("dolní mez určuje volající, ať je nižší nebo vyšší než běžná", () => {
    expect(zoomKolem(kamera, rozmer, { x: 0, y: 0 }, 1e-6, 1.5).meritko).toBe(1.5);
    expect(zoomKolem(kamera, rozmer, { x: 0, y: 0 }, 1e-6, 50).meritko).toBe(50);
  });

  it("na dolní mezi se měřítko dalším oddalováním nemění", () => {
    const naMezi = zoomKolem(kamera, rozmer, { x: 100, y: 100 }, 1e-6, 15);
    expect(zoomKolem(naMezi, rozmer, { x: 300, y: 200 }, 0.5, 15).meritko).toBe(15);
  });
});

describe("celý výřez", () => {
  const vyrez = { xMin: -10, yMin: -5, xMax: 30, yMax: 15 };

  it("vejde se celý i s okrajem a je vystředěný", () => {
    const k = celyVyrez(vyrez, rozmer, 20);
    const vid = viditelnaOblast(k, rozmer);
    expect(k.x).toBe(10);
    expect(k.y).toBe(5);
    expect(vid.xMin).toBeLessThanOrEqual(vyrez.xMin);
    expect(vid.xMax).toBeGreaterThanOrEqual(vyrez.xMax);
    expect(vid.yMin).toBeLessThanOrEqual(vyrez.yMin);
    expect(vid.yMax).toBeGreaterThanOrEqual(vyrez.yMax);
  });

  it("omezuje ho těsnější rozměr", () => {
    // 40 × 20 m do 760 × 560 px: rozhoduje šířka, 19 px na metr.
    expect(celyVyrez(vyrez, rozmer, 20).meritko).toBeCloseTo(19, 9);
  });
});

describe("omezení na výřez", () => {
  // Plátno 800 × 600 px při 20 px/m ukazuje 40 × 30 m; výřez je 100 × 100 m.
  const vyrez = { xMin: 0, yMin: 0, xMax: 100, yMax: 100 };
  const k = (x: number, y: number): Kamera => ({ x, y, meritko: 20 });

  it("pohled uvnitř výřezu nechá být", () => {
    expect(omezNaVyrez(k(50, 50), vyrez, rozmer)).toEqual(k(50, 50));
  });

  it("bez vůle zastaví pohled přesně na okraji výřezu", () => {
    const omezena = omezNaVyrez(k(-500, 900), vyrez, rozmer, 0);
    const vid = viditelnaOblast(omezena, rozmer);
    expect(vid.xMin).toBeCloseTo(0, 9);
    expect(vid.yMax).toBeCloseTo(100, 9);
  });

  it("s vůlí pustí pohled za okraj o daný podíl plátna", () => {
    const omezena = omezNaVyrez(k(-500, 900), vyrez, rozmer, 0.25);
    const vid = viditelnaOblast(omezena, rozmer);
    expect(vid.xMin).toBeCloseTo(-0.25 * 40, 9);
    expect(vid.yMax).toBeCloseTo(100 + 0.25 * 30, 9);
  });

  it("výřez menší než plátno drží uprostřed", () => {
    const maly = { xMin: 10, yMin: 10, xMax: 20, yMax: 20 };
    expect(omezNaVyrez(k(-500, 900), maly, rozmer, 0)).toEqual(k(15, 15));
  });

  it("měřítko nemění", () => {
    expect(omezNaVyrez(k(-500, 900), vyrez, rozmer).meritko).toBe(20);
  });
});
