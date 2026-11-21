// Každá úroveň kampaně jde vyhrát, každou medaili lze získat a triviální most neprojde.
import { describe, expect, it } from "vitest";
import { cenaNavrhu } from "../src/data/cena";
import { zkontrolujNavrh, type NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import type { VysledekZkousky } from "../src/zkouska/protokol";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan, nasadaUrovne } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

function zkousej(uroven: Uroven, navrh: NavrhMostu): VysledekZkousky {
  expect(zkontrolujNavrh(navrh, uroven), "návrh má porušovat jen fyziku, ne pravidla úrovně").toEqual([]);
  const zkouska = new Zkouska(uroven, navrh, nasadaUrovne(uroven));
  let pojistka = 0;
  while (!zkouska.hotovo) {
    zkouska.pokracuj(1);
    expect(pojistka++).toBeLessThan(200);
  }
  const vysledek = zkouska.vysledek();
  expect(vysledek.rozpad).toBe(false);
  return vysledek;
}

const kampan = nactiKampan();

describe("kampaň", () => {
  it("má úrovně první kapitoly v pořadí a ke každé referenční řešení", () => {
    expect(kampan.map((u) => u.id)).toEqual(["1-01", "1-02", "1-03", "1-04"]);
    expect(Object.keys(RESENI).sort()).toEqual(kampan.map((u) => u.id).sort());
  });

  it("násada náhody je pro každou úroveň jiná a stálá", () => {
    const nasady = kampan.map(nasadaUrovne);
    expect(new Set(nasady).size).toBe(kampan.length);
    expect(kampan.map(nasadaUrovne)).toEqual(nasady);
  });
});

for (const uroven of kampan) {
  describe(`úroveň ${uroven.id} ${uroven.nazev}`, () => {
    const reseni = RESENI[uroven.id]!;

    it("má rozpočty a bonus nastavené smysluplně", () => {
      expect(uroven.rozpocet).not.toBeNull();
      expect(uroven.inzenyrskyRozpocet).not.toBeNull();
      expect(uroven.inzenyrskyRozpocet!).toBeLessThan(uroven.rozpocet!);
      expect(uroven.mistrovska).not.toBeNull();
      expect(uroven.jizdniRad.length).toBeGreaterThan(0);
      // Inženýrský rozpočet je těsný: referenční řešení ho nevyužije o víc než desetinu.
      const cena = cenaNavrhu(reseni.rozpocet);
      expect(cena).toBeLessThanOrEqual(uroven.inzenyrskyRozpocet!);
      expect(cena).toBeGreaterThan(0.9 * uroven.inzenyrskyRozpocet!);
    });

    it("řešení pro průchod projde", () => {
      const vysledek = zkousej(uroven, reseni.pruchod);
      expect(vysledek).toMatchObject({ pruchod: true, spadlo: 0, poruseni: 0 });
      expect(vysledek.prejelo).toBe(vysledek.ucastniku);
    }, 60_000);

    it("řešení pro rozpočet projde pod inženýrským rozpočtem", () => {
      const vysledek = zkousej(uroven, reseni.rozpocet);
      expect(vysledek.medaile).toMatchObject({ pruchod: true, rozpocet: true });
      expect(vysledek.poruseni).toBe(0);
    }, 60_000);

    it("řešení pro mistrovskou medaili projde a splní bonus", () => {
      const vysledek = zkousej(uroven, reseni.mistrovska);
      expect(vysledek.medaile).toMatchObject({ pruchod: true, mistrovska: true });
      // Bonus není zadarmo: řešení pro průchod ho nesplní.
      expect(zkousej(uroven, reseni.pruchod).medaile.mistrovska).toBe(false);
    }, 60_000);

    for (const pad of reseni.pady) {
      it(`most „${pad.nazev}“ neprojde`, () => {
        const vysledek = zkousej(uroven, pad.navrh);
        expect(vysledek.pruchod).toBe(false);
        expect(vysledek.medaile).toEqual({ pruchod: false, rozpocet: false, mistrovska: false });
      }, 60_000);
    }

    it("nejlevnější možná stavba (jen mostovka) je mezi mosty, které neprojdou", () => {
      const jenMostovka = reseni.pady.find((p) => p.navrh.pruty.every((prut) => prut.prvek === "mostovka-drevo"));
      expect(jenMostovka).toBeDefined();
      expect(cenaNavrhu(jenMostovka!.navrh)).toBeLessThan(cenaNavrhu(reseni.rozpocet));
    });
  });
}
