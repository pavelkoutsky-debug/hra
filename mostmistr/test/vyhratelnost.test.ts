// Každá úroveň kampaně jde vyhrát, každou medaili lze získat a triviální most neprojde.
// Medaile jdou po schodech (rozpočtová je průchod do inženýrského rozpočtu bez porušení,
// mistrovská je rozpočtová a k ní bonus úrovně) a referenční mosty to ukazují.
import { describe, expect, it } from "vitest";
import { cenaNavrhu } from "../src/data/cena";
import { KATALOG } from "../src/data/katalog";
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

/**
 * Hodnota, kterou měří bonus úrovně: největší využití prutu, kmitání mostovky nebo zrychlení
 * cestujících (m/s²), ráz dosednutí (N). Menší je lepší; bonus ji chce nejvýš `limit`.
 */
function hodnotaBonusu(uroven: Uroven, vysledek: VysledekZkousky): number {
  const druh = uroven.mistrovska!.druh;
  if (druh === "rezerva") return vysledek.nejvetsiVyuziti;
  if (druh === "komfort-chodcu") return vysledek.komfort!.zrychleni;
  if (druh === "komfort-cestujicich") return vysledek.komfortCestujicich!.zrychleni;
  if (druh === "dosednuti") return vysledek.pohyb!.razDosednuti;
  throw new Error(`bonus ${druh} test neumí změřit`);
}

/** O kolik má most pro mistrovskou splnit bonus s rezervou a most pro rozpočtovou ho minout. */
const REZERVA_BONUSU = 0.95;
const ODSTUP_OD_BONUSU = 1.15;

describe("kampaň", () => {
  it("má úrovně všech kapitol v pořadí a ke každé referenční řešení", () => {
    expect(kampan.map((u) => u.id)).toEqual([
      "1-01",
      "1-02",
      "1-03",
      "1-04",
      "2-01",
      "2-02",
      "2-03",
      "2-04",
      "3-01",
      "3-02",
      "3-03",
      "3-04",
      "4-01",
      "4-02",
      "4-03",
      "4-04",
      "5-01",
      "5-02",
      "5-03",
      "5-04",
      "6-01",
      "6-02",
      "6-03",
      "6-04",
      "7-01",
      "7-02",
      "7-03",
      "7-04",
    ]);
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
      // Mistrovská je rozpočtová a k ní bonus: i její most se do inženýrského rozpočtu vejde.
      expect(cenaNavrhu(reseni.mistrovska)).toBeLessThanOrEqual(uroven.inzenyrskyRozpocet!);
    });

    it("řešení pro průchod projde a mistrovskou medaili nedostane", () => {
      const vysledek = zkousej(uroven, reseni.pruchod);
      expect(vysledek).toMatchObject({ pruchod: true, spadlo: 0, poruseni: 0 });
      expect(vysledek.prejelo).toBe(vysledek.ucastniku);
      expect(vysledek.medaile).toMatchObject({ pruchod: true, mistrovska: false });
    }, 60_000);

    it("řešení pro rozpočet projde pod inženýrským rozpočtem bez porušení a bonus s odstupem nesplní", () => {
      const vysledek = zkousej(uroven, reseni.rozpocet);
      expect(vysledek.medaile).toEqual({ pruchod: true, rozpocet: true, mistrovska: false });
      expect(vysledek.poruseni).toBe(0);
      // Bonus není zadarmo ke každému levnému mostu: tenhle ho mine aspoň o 15 %.
      expect(hodnotaBonusu(uroven, vysledek)).toBeGreaterThanOrEqual(ODSTUP_OD_BONUSU * uroven.mistrovska!.limit);
    }, 60_000);

    it("řešení pro mistrovskou medaili má všechny tři medaile a bonus plní s rezervou", () => {
      const vysledek = zkousej(uroven, reseni.mistrovska);
      expect(vysledek.medaile).toEqual({ pruchod: true, rozpocet: true, mistrovska: true });
      expect(vysledek.poruseni).toBe(0);
      expect(hodnotaBonusu(uroven, vysledek)).toBeLessThanOrEqual(REZERVA_BONUSU * uroven.mistrovska!.limit);
    }, 60_000);

    for (const pad of reseni.pady) {
      it(`most „${pad.nazev}“ neprojde`, () => {
        const vysledek = zkousej(uroven, pad.navrh);
        expect(vysledek.pruchod).toBe(false);
        expect(vysledek.medaile).toEqual({ pruchod: false, rozpocet: false, mistrovska: false });
      }, 60_000);
    }

    it("nejlevnější možná stavba (jen mostovka) je mezi mosty, které neprojdou", () => {
      const jenMostovka = reseni.pady.find((p) => p.navrh.pruty.every((prut) => KATALOG[prut.prvek].druh === "mostovka"));
      expect(jenMostovka).toBeDefined();
      expect(cenaNavrhu(jenMostovka!.navrh)).toBeLessThan(cenaNavrhu(reseni.rozpocet));
    });
  });
}
