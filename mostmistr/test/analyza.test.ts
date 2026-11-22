// Čísla pro analytický panel: síly a únosnosti prutů, reakce v podporách, čísla k porušení.
import { describe, expect, it } from "vitest";
import { hmotnostNavrhu } from "../src/data/cena";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { TIHOVE_ZRYCHLENI } from "../src/jadro/integrator";
import { ZPUSOB_OHYB, ZPUSOB_SMYK, ZPUSOB_TAH, ZPUSOB_TLAK, ZPUSOB_VZPER, ZPUSOB_ZADNY } from "../src/jadro/namahani";
import type { Udalost, VysledekZkousky } from "../src/zkouska/protokol";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

function zkousej(uroven: Uroven, navrh: NavrhMostu): { vysledek: VysledekZkousky; udalosti: Udalost[] } {
  const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
  const udalosti: Udalost[] = [];
  let pojistka = 0;
  while (!zkouska.hotovo) {
    udalosti.push(...zkouska.pokracuj(1).udalosti);
    expect(pojistka++).toBeLessThan(300);
  }
  return { vysledek: zkouska.vysledek(), udalosti };
}

const kampan = nactiKampan();
const u103 = kampan.find((u) => u.id === "1-03")!;

describe("obálka namáhání se silami", () => {
  const navrh = RESENI["1-03"]!.pruchod;
  const { vysledek } = zkousej(u103, navrh);

  it("každý namáhaný prut má sílu, moment, rozhodující veličinu a únosnost", () => {
    expect(vysledek.obalka).toHaveLength(navrh.pruty.length);
    let tazenych = 0;
    let tlacenych = 0;
    for (const o of vysledek.obalka) {
      if (o.zpusob === ZPUSOB_ZADNY) continue;
      for (const hodnota of [o.osova, o.moment, o.velicina, o.unosnost]) expect(Number.isFinite(hodnota)).toBe(true);
      expect(o.unosnost).toBeGreaterThan(0);
      expect(o.velicina).toBeGreaterThanOrEqual(0);
      expect(o.moment).toBeGreaterThanOrEqual(0);
      // Samotná rozhodující veličina využití nepřesáhne; zbytek do něj dodává souběh síly a ohybu.
      expect(o.velicina / o.unosnost).toBeLessThanOrEqual(o.vyuziti * 1.35 + 0.02);
      if (o.zpusob === ZPUSOB_TAH) {
        expect(o.osova).toBeGreaterThan(0);
        expect(o.velicina).toBeCloseTo(o.osova, 6);
        tazenych++;
      } else if (o.zpusob === ZPUSOB_TLAK || o.zpusob === ZPUSOB_VZPER) {
        expect(o.osova).toBeLessThan(0);
        expect(o.velicina).toBeCloseTo(-o.osova, 6);
        tlacenych++;
      } else if (o.zpusob === ZPUSOB_OHYB) {
        expect(o.velicina).toBeCloseTo(o.moment, 6);
      } else {
        expect(o.zpusob).toBe(ZPUSOB_SMYK);
      }
    }
    // Příhrada má pruty tažené i tlačené.
    expect(tazenych).toBeGreaterThan(0);
    expect(tlacenych).toBeGreaterThan(0);
  });

  it("síly jsou v řádu, který odpovídá autu na mostě: jednotky až desítky kilonewtonů", () => {
    const nejvetsi = Math.max(...vysledek.obalka.map((o) => Math.abs(o.osova)));
    expect(nejvetsi).toBeGreaterThan(5_000);
    expect(nejvetsi).toBeLessThan(500_000);
  });
});

describe("reakce v podporách", () => {
  it("most bez provozu tlačí na podpory právě svou tíhou", () => {
    const bezProvozu: Uroven = { ...u103, jizdniRad: [] };
    const navrh = RESENI["1-03"]!.pruchod;
    const { vysledek } = zkousej(bezProvozu, navrh);
    // Podepřené jsou styčníky v kotvách úrovně.
    expect(vysledek.reakce.length).toBeGreaterThanOrEqual(2);
    for (const r of vysledek.reakce) {
      const st = navrh.stycniky[r.stycnik]!;
      expect(u103.kotvy.some((k) => k.x === st.x && k.y === st.y)).toBe(true);
    }
    const tiha = hmotnostNavrhu(navrh, u103) * TIHOVE_ZRYCHLENI;
    const soucet = vysledek.reakce.reduce((s, r) => s + r.svisla, 0);
    expect(soucet / tiha).toBeGreaterThan(0.97);
    expect(soucet / tiha).toBeLessThan(1.06);
    // Nic most nenadzvedává.
    for (const r of vysledek.reakce) expect(r.nadzvednuti).toBeGreaterThanOrEqual(0);
  });

  it("s autem jsou reakce větší o jeho váhu; posuvná podpora vodorovnou sílu nenese", () => {
    const navrh = RESENI["1-03"]!.pruchod;
    const sAutem = zkousej(u103, navrh).vysledek.reakce;
    const bez = zkousej({ ...u103, jizdniRad: [] }, navrh).vysledek.reakce;
    const soucet = (reakce: typeof bez): number => reakce.reduce((s, r) => s + r.svisla, 0);
    // Největší reakce každé podpory nastanou v jinou chvíli, takže součet maxim přesáhne tíhu mostu s autem jen o trochu.
    expect(soucet(sAutem) - soucet(bez)).toBeGreaterThan(0.8 * 1500 * TIHOVE_ZRYCHLENI);
    expect(soucet(sAutem) - soucet(bez)).toBeLessThan(3.5 * 1500 * TIHOVE_ZRYCHLENI);
    for (const r of sAutem) {
      const st = navrh.stycniky[r.stycnik]!;
      const kotva = u103.kotvy.find((k) => k.x === st.x && k.y === st.y)!;
      if (kotva.typ === "posuvna") expect(r.vodorovna).toBe(0);
    }
  });
});

describe("čísla k porušení", () => {
  it("každé porušení říká, co prut nesl a kolik unese", () => {
    const u104 = kampan.find((u) => u.id === "1-04")!;
    const navrh = RESENI["1-04"]!.pady.find((p) => p.nazev === "lehká příhrada přes celé údolí")!.navrh;
    const { udalosti } = zkousej(u104, navrh);
    const poruseni = udalosti.filter((u) => u.druh === "poruseni");
    expect(poruseni.length).toBeGreaterThan(5);
    for (const u of poruseni) {
      if (u.druh !== "poruseni") continue;
      expect(Number.isFinite(u.velicina) && u.velicina >= 0).toBe(true);
      expect(Number.isFinite(u.unosnost) && u.unosnost > 0).toBe(true);
    }
    // První porušení způsobilo přetížení, ne trosky: prut nesl nejméně polovinu toho, co unese
    // (zbytek do meze dodal souběh síly a ohybu).
    const prvni = poruseni[0]!;
    if (prvni.druh === "poruseni") {
      expect(prvni.mira).toBeGreaterThanOrEqual(0.99);
      expect(prvni.velicina / prvni.unosnost).toBeGreaterThan(0.5);
      expect(prvni.velicina / prvni.unosnost).toBeLessThan(1.6);
    }
  });
});
