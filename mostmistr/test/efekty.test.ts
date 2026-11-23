// Efekty pádu mostu, které se hledají v záznamu zkoušky: šplouchnutí, zlomy a pády lidí.
import { describe, expect, it } from "vitest";
import { casyPadu, DOBA_SPLOUCHNUTI, najdiSplouchnuti, najdiZlomy, rozhoz, type Splouchnuti, type Zlom } from "../src/zkouska/efekty";
import { NASLEDEK_KLOUB, NASLEDEK_ROZLOMENI } from "../src/jadro/poruseni";
import type { Udalost } from "../src/zkouska/protokol";
import { prazdnySnimek, type Snimek, type Topologie, Zaznam } from "../src/zkouska/zaznam";

/** Stavba ze dvou styčníků spojených prutem 0 a jednoho volného styčníku. */
function stavba(): Topologie {
  return {
    stycniku: 3,
    prvekA: Int32Array.of(0),
    prvekB: Int32Array.of(1),
    prut: Int32Array.of(0),
    cara: Uint8Array.of(0),
    klouby: Uint8Array.of(0),
    podpory: Uint8Array.of(0, 0, 0),
    znacky: Uint8Array.of(0, 0, 0),
  };
}

function snimek(cas: number, polohy: number[], topologie = 0): Snimek {
  return { ...prazdnySnimek(), cas, topologie, polohy: Float32Array.from(polohy) };
}

/** Záznam, ve kterém styčník 2 padá z výšky 2 m rychlostí 5 m/s a prut 0 leží ve výšce 1 m. */
function zaznamPadu(): Zaznam {
  const z = new Zaznam();
  z.pridejTopologii(stavba());
  for (let i = 0; i <= 10; i++) {
    const cas = 0.1 * i;
    z.pridej(snimek(cas, [0, 1, 4, 1, 7, 2 - 5 * cas]));
  }
  return z;
}

describe("šplouchnutí", () => {
  it("najde okamžik a místo, kde styčník proletěl hladinou", () => {
    const seznam: Splouchnuti[] = [];
    const dal = najdiSplouchnuti(zaznamPadu(), 0, 0, seznam);
    expect(dal).toBe(11);
    expect(seznam).toHaveLength(1);
    // Z 2 m rychlostí 5 m/s je na hladině v čase 0,4 s; snímek, který to zachytí, je ten v 0,4 s.
    expect(seznam[0]!.cas).toBeCloseTo(0.4, 6);
    expect(seznam[0]!.x).toBeCloseTo(7, 6);
    expect(seznam[0]!.sila).toBeCloseTo(5, 3);
  });

  it("pokračuje od místa, kde skončilo, a nic nepřidá dvakrát", () => {
    const zaznam = zaznamPadu();
    const seznam: Splouchnuti[] = [];
    const dal = najdiSplouchnuti(zaznam, 0, 0, seznam);
    expect(najdiSplouchnuti(zaznam, 0, dal, seznam)).toBe(dal);
    expect(seznam).toHaveLength(1);
  });

  it("pomalé ponoření ani to, co je pod hladinou od začátku, nešplouchne", () => {
    const z = new Zaznam();
    z.pridejTopologii(stavba());
    for (let i = 0; i <= 10; i++) z.pridej(snimek(0.1 * i, [0, -1, 4, -1, 7, 0.2 - 0.05 * i]));
    const seznam: Splouchnuti[] = [];
    najdiSplouchnuti(z, 0, 0, seznam);
    expect(seznam).toHaveLength(0);
  });

  it("dopady těsně vedle sebe ve stejné chvíli splynou v jedno", () => {
    const z = new Zaznam();
    z.pridejTopologii(stavba());
    for (let i = 0; i <= 10; i++) z.pridej(snimek(0.1 * i, [3, 2 - 5 * 0.1 * i, 3.5, 2 - 5 * 0.1 * i, 12, 2 - 5 * 0.1 * i]));
    const seznam: Splouchnuti[] = [];
    najdiSplouchnuti(z, 0, 0, seznam);
    expect(seznam.map((d) => Math.round(d.x))).toEqual([3, 12]);
  });

  it("přes změnu stavby se neporovnává", () => {
    const z = new Zaznam();
    z.pridejTopologii(stavba());
    z.pridejTopologii(stavba());
    z.pridej(snimek(0, [0, 1, 4, 1, 7, 2], 0));
    z.pridej(snimek(0.1, [0, 1, 4, 1, 7, -3], 1));
    const seznam: Splouchnuti[] = [];
    najdiSplouchnuti(z, 0, 0, seznam);
    expect(seznam).toHaveLength(0);
  });

  it("šplouchnutí je vidět kolem sekundy", () => {
    expect(DOBA_SPLOUCHNUTI).toBeGreaterThan(0.6);
    expect(DOBA_SPLOUCHNUTI).toBeLessThan(2);
  });
});

describe("zlomy a pády", () => {
  const poruseni = (cas: number, nasledek: number): Udalost =>
    ({ druh: "poruseni", cas, prut: 0, zpusob: 0, nasledek, mira: 1.1, velicina: 10, unosnost: 9 }) as Udalost;

  it("zlom prutu má místo uprostřed prutu; plastický kloub zlom není", () => {
    const zaznam = zaznamPadu();
    const seznam: Zlom[] = [];
    const dal = najdiZlomy(zaznam, [poruseni(0.3, NASLEDEK_KLOUB), poruseni(0.5, NASLEDEK_ROZLOMENI)], 0, seznam);
    expect(dal).toBe(2);
    expect(seznam).toHaveLength(1);
    expect(seznam[0]).toMatchObject({ cas: 0.5 });
    expect(seznam[0]!.x).toBeCloseTo(2, 5);
    expect(seznam[0]!.y).toBeCloseTo(1, 5);
    expect(seznam[0]!.rozsah).toBeCloseTo(4, 5);
  });

  it("událost, ke které záznam ještě nedošel, počká na příště", () => {
    const zaznam = zaznamPadu();
    const seznam: Zlom[] = [];
    const udalosti = [poruseni(0.5, NASLEDEK_ROZLOMENI), poruseni(3, NASLEDEK_ROZLOMENI)];
    expect(najdiZlomy(zaznam, udalosti, 0, seznam)).toBe(1);
    expect(seznam).toHaveLength(1);
  });

  it("časy pádu se přiřadí účastníkům podle položky a člena", () => {
    const ucastnici = [
      { polozka: 0, clen: 0 },
      { polozka: 0, clen: 1 },
      { polozka: 1, clen: 0 },
    ];
    const udalosti = [
      { druh: "pad", cas: 2.5, polozka: 1, clen: 0 } as Udalost,
      { druh: "pad", cas: 1.5, polozka: 0, clen: 1 } as Udalost,
      { druh: "pad", cas: 9, polozka: 0, clen: 1 } as Udalost,
    ];
    expect(casyPadu(udalosti, ucastnici)).toEqual([undefined, 1.5, 2.5]);
  });

  it("rozhoz dává pro stejné pořadí stejné číslo mezi 0 a 1", () => {
    for (let i = 0; i < 50; i++) {
      for (let s = 0; s < 4; s++) {
        const r = rozhoz(i, s);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(1);
        expect(rozhoz(i, s)).toBe(r);
      }
    }
  });
});
