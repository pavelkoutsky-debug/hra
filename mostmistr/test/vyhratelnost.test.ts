// Každá úroveň kampaně jde vyhrát, každou medaili lze získat a triviální most neprojde.
// Medaile jdou po schodech (rozpočtová je průchod do inženýrského rozpočtu bez porušení,
// mistrovská je rozpočtová a k ní bonus úrovně) a referenční mosty to ukazují.
import { describe, expect, it } from "vitest";
import { cenaNavrhu } from "../src/data/cena";
import { KATALOG } from "../src/data/katalog";
import { zkontrolujNavrh, type NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import type { VysledekZkousky } from "../src/zkouska/protokol";
import { Kreslic } from "../src/zkouska/regrese";
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
      "1-05",
      "2-01",
      "2-02",
      "2-03",
      "2-04",
      "2-05",
      "3-01",
      "3-02",
      "3-03",
      "3-04",
      "3-05",
      "4-01",
      "4-02",
      "4-03",
      "4-04",
      "4-05",
      "5-01",
      "5-02",
      "5-03",
      "5-04",
      "5-05",
      "6-01",
      "6-02",
      "6-03",
      "6-04",
      "6-05",
      "7-01",
      "7-02",
      "7-03",
      "7-04",
      "7-05",
      "8-01",
      "8-03",
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

describe("most, na kterém se při zkoušce něco porušilo", () => {
  it("projde, ale rozpočtovou ani mistrovskou medaili nedostane, i když se do inženýrského rozpočtu vejde", () => {
    // 4-03, most pro mistrovskou, a k němu jedno lano podél mostovky přetažené napínákem na
    // čtyřnásobek pevnosti: přetrhne se v čase nula a most pod ním zůstane celý. Do M12 by
    // takový most rozpočtovou medaili dostal (recenze hry: „Most obstál, i když prut 6
    // nevydržel“). Inženýrský rozpočet je tu zvednutý, aby o medaili nerozhodla cena.
    const uroven: Uroven = { ...kampan.find((u) => u.id === "4-03")!, inzenyrskyRozpocet: 1_600_000 };
    const zaklad = RESENI["4-03"]!.mistrovska;
    const id = Math.max(...zaklad.pruty.map((p) => p.id)) + 1;
    const stycnik = (x: number): number => zaklad.stycniky.find((s) => s.x === x && s.y === 0)!.id;
    const navrh: NavrhMostu = { ...zaklad, pruty: [...zaklad.pruty, { id, a: stycnik(0), b: stycnik(36), prvek: "lano", predpeti: 4 }] };
    expect(cenaNavrhu(navrh)).toBeLessThanOrEqual(uroven.inzenyrskyRozpocet!);
    const vysledek = zkousej(uroven, navrh);
    expect(vysledek.pruchod).toBe(true);
    expect(vysledek.poruseni).toBe(1);
    expect(vysledek.medaile).toEqual({ pruchod: true, rozpocet: false, mistrovska: false });
    // Tentýž most bez přetaženého lana rozpočtovou medaili má.
    expect(zkousej(uroven, zaklad).medaile.rozpocet).toBe(true);
  }, 120_000);
});

describe("most bez vlastní opory, který se opře o terén", () => {
  it("neobstojí, i když po něm všichni přejdou (1-01: dva trámy ze dna potoka)", () => {
    // Mostovka 4 + 4 a dva lehké trámy ze dna potoka do středu mostovky a do levé opěry:
    // mechanismus, který se propadne, opře se trámem o dno a lidé přejdou. Stál míň než
    // nejlevnější poctivý most úrovně a do nálezu kontroly obtížnosti M12 bral všechny medaile.
    const uroven = kampan.find((u) => u.id === "1-01")!;
    const k = new Kreslic("1-01");
    k.prut("mostovka-drevo", [0, 0], [4, 0]);
    k.prut("mostovka-drevo", [4, 0], [8, 0]);
    k.prut("drevo-lehke", [3, -3], [4, 0]);
    k.prut("drevo-lehke", [3, -3], [0, 0]);
    const navrh = k.navrh();
    expect(cenaNavrhu(navrh)).toBeLessThan(cenaNavrhu(RESENI["1-01"]!.rozpocet));
    const vysledek = zkousej(uroven, navrh);
    expect(vysledek.bezRovnovahy).toBe(true);
    expect(vysledek.opreno).toBe(true);
    expect(vysledek.pruchod).toBe(false);
    expect(vysledek.medaile).toEqual({ pruchod: false, rozpocet: false, mistrovska: false });
  }, 60_000);

  it("referenční mosty se o terén neopírají", () => {
    for (const id of ["1-01", "1-04", "4-04", "7-02"]) {
      const uroven = kampan.find((u) => u.id === id)!;
      expect(zkousej(uroven, RESENI[id]!.pruchod).opreno, id).toBe(false);
    }
  }, 120_000);
});

describe("lekce, které nejde obejít", () => {
  it("2-04: o kotvy pro tlumiče se neopře vzpěra; tlumič do nich vést smí", () => {
    // Kontrola obtížnosti M12: se vzpěrami z těch kotev do každého styčníku mostovky měla lávka
    // bez jediného tlumiče všechny tři medaile a zlato obou výzev za 87 % inženýrského rozpočtu.
    const uroven = kampan.find((u) => u.id === "2-04")!;
    expect(uroven.kotvy.filter((k) => k.jen === "tlumic").map((k) => [k.x, k.y])).toEqual([
      [8, -4],
      [24, -4],
    ]);
    const k = new Kreslic("2-04");
    for (let x = 0; x < 32; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
    for (const x of [4, 8, 12]) k.prut("ocel-lehka", [8, -4], [x, 0]);
    for (const x of [20, 24, 28]) k.prut("ocel-lehka", [24, -4], [x, 0]);
    const problemy = zkontrolujNavrh(k.navrh(), uroven);
    expect(problemy.length).toBe(6);
    expect(new Set(problemy.map((p) => p.druh))).toEqual(new Set(["kotva-jen-tlumic"]));
    expect(zkontrolujNavrh(RESENI["2-04"]!.mistrovska, uroven)).toEqual([]);
  });

  it("4-01: drahý pilíř nejde nahradit pahýlem a ocelovým sloupem; vzpěry z dříku pilíře a lana na pylonu zůstávají", () => {
    // Kontrola obtížnosti M12: dvoumetrový pahýl pilíře, na něm lehký ocelový sloup a vzpěry
    // z hlavy pahýlu dávaly rozpočtovou medaili za 85 % inženýrského rozpočtu.
    const uroven = kampan.find((u) => u.id === "4-01")!;
    const k = new Kreslic("4-01");
    for (let x = 0; x < 54; x += 6) k.prut("mostovka-ocelobeton", [x, 0], [x + 6, 0]);
    for (const x of [18, 36]) {
      k.prut("pilir", [x, -12], [x, -10]);
      k.prut("ocel-lehka", [x, -10], [x, 0]);
      k.prut("ocel-lehka", [x, -10], [x - 6, 0]);
      k.prut("ocel-lehka", [x, -10], [x + 6, 0]);
    }
    const problemy = zkontrolujNavrh(k.navrh(), uroven).filter((p) => p.druh !== "nad-rozpocet");
    expect(problemy.length).toBe(6);
    expect(new Set(problemy.map((p) => p.druh))).toEqual(new Set(["pilir-pahyl"]));
    // Mosty autora s pilíři (vzpěry z dříku, příhrada nad hlavou pilíře, pylony s lany) pravidlu vyhovují.
    for (const id of ["4-01", "4-02", "4-03", "4-04", "6-03"]) {
      const u = kampan.find((x) => x.id === id)!;
      for (const klic of ["pruchod", "rozpocet", "mistrovska"] as const) expect(zkontrolujNavrh(RESENI[id]![klic], u), `${id} ${klic}`).toEqual([]);
    }
  });
});
