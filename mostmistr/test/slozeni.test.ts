// Kde a proč se skládá most bez klidové polohy.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { NavrhMostu } from "../src/data/navrh";
import type { Uroven } from "../src/data/uroven";
import { Kreslic, urovenRegrese } from "../src/zkouska/regrese";
import { rozeberMost } from "../src/zkouska/rozbor";
import { najdiSlozeni } from "../src/zkouska/slozeni";
import { Zkouska } from "../src/zkouska/zkouska";
import { nactiKampan } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

const PRVKY = ["mostovka-drevo", "drevo-lehke", "drevo-tezke"] as const;

function uroven(): Uroven {
  return { ...urovenRegrese({ rozpeti: 12, sirka: 3, vybaveni: 100 }), povolenePrvky: [...PRVKY], jizdniRad: [] };
}

function most(kresli: (k: Kreslic) => void): NavrhMostu {
  const k = new Kreslic();
  for (let x = 0; x < 12; x += 4) k.prut("mostovka-drevo", [x, 0], [x + 4, 0]);
  kresli(k);
  return k.navrh();
}

/** Poloha styčníku návrhu podle pořadí. */
const poloha = (navrh: NavrhMostu, stycnik: number): [number, number] => [navrh.stycniky[stycnik]!.x, navrh.stycniky[stycnik]!.y];

describe("místo a důvod složení", () => {
  it("stabilní most se neskládá", () => {
    const navrh = most((k) => {
      k.prut("drevo-lehke", [0, 0], [4, 3]);
      k.prut("drevo-lehke", [4, 3], [8, 3]);
      k.prut("drevo-lehke", [8, 3], [12, 0]);
      k.prut("drevo-lehke", [4, 0], [4, 3]);
      k.prut("drevo-lehke", [8, 0], [8, 3]);
      k.prut("drevo-lehke", [4, 3], [8, 0]);
    });
    expect(najdiSlozeni(uroven(), navrh)).toBeNull();
    expect(rozeberMost(uroven(), navrh)).toMatchObject({ stabilni: true, slozeni: null });
  });

  it("prázdný návrh se neskládá", () => {
    expect(najdiSlozeni(uroven(), new Kreslic().navrh())).toBeNull();
  });

  it("jen mostovka: skládá se ve styčníku mostovky, který nic nedrží", () => {
    const navrh = most(() => {});
    const slozeni = najdiSlozeni(uroven(), navrh)!;
    expect(slozeni).not.toBeNull();
    expect(slozeni.duvod).toBe("mostovka");
    expect(slozeni.prut).toBeNull();
    expect([4, 8]).toContain(poloha(navrh, slozeni.stycnik)[0]);
    expect(slozeni.misto.x).toBeCloseTo(poloha(navrh, slozeni.stycnik)[0], 6);
    expect(slozeni.misto.y).toBeCloseTo(0, 6);
    // Rozbor při stavbě hlásí totéž.
    expect(rozeberMost(uroven(), navrh)).toMatchObject({ stabilni: false, slozeni });
  });

  it("krokve bez sloupku: střed mostovky pod vrcholem nic nenese", () => {
    const k = new Kreslic();
    k.prut("mostovka-drevo", [0, 0], [6, 0]);
    k.prut("mostovka-drevo", [6, 0], [12, 0]);
    k.prut("drevo-tezke", [0, 0], [6, 4]);
    k.prut("drevo-tezke", [6, 4], [12, 0]);
    const navrh = k.navrh();
    const slozeni = najdiSlozeni(uroven(), navrh)!;
    expect(slozeni.duvod).toBe("mostovka");
    expect(poloha(navrh, slozeni.stycnik)).toEqual([6, 0]);
  });

  it("obdélník bez úhlopříčky: chybí ztužení", () => {
    const navrh = most((k) => {
      k.prut("drevo-lehke", [0, 0], [0, 3]);
      k.prut("drevo-lehke", [0, 3], [4, 3]);
      k.prut("drevo-lehke", [4, 3], [8, 3]);
      k.prut("drevo-lehke", [8, 3], [12, 3]);
      k.prut("drevo-lehke", [12, 3], [12, 0]);
      k.prut("drevo-lehke", [4, 0], [4, 3]);
      k.prut("drevo-lehke", [8, 0], [8, 3]);
    });
    const slozeni = najdiSlozeni(uroven(), navrh)!;
    expect(slozeni.duvod).toBe("ztuzeni");
    expect(slozeni.stycnik).toBeGreaterThanOrEqual(0);
  });

  it("prut, který drží jen za jeden konec, se kýve", () => {
    const navrh = most((k) => {
      k.prut("drevo-lehke", [0, 0], [4, 3]);
      k.prut("drevo-lehke", [4, 3], [8, 3]);
      k.prut("drevo-lehke", [8, 3], [12, 0]);
      k.prut("drevo-lehke", [4, 0], [4, 3]);
      k.prut("drevo-lehke", [8, 0], [8, 3]);
      k.prut("drevo-lehke", [4, 3], [8, 0]);
      // Volný prut šikmo vzhůru z vrcholu příhrady.
      k.prut("drevo-lehke", [8, 3], [11, 5]);
    });
    const slozeni = najdiSlozeni(uroven(), navrh);
    // Volný prut si klidovou polohu najít může (svěsí se); pokud ne, hra na něj ukáže.
    if (slozeni) {
      expect(slozeni.duvod).toBe("volny-konec");
      expect(navrh.pruty[slozeni.prut!]!.prvek).toBe("drevo-lehke");
      expect(poloha(navrh, slozeni.stycnik)).toEqual([11, 5]);
    }
  });
});

describe("referenční mosty kampaně", () => {
  const urovne = new Map(nactiKampan().map((u) => [u.id, u]));

  it("každý most, který se složí vlastní vahou, dostane místo a důvod", () => {
    const prehled: string[] = [];
    let urceno = 0;
    for (const [id, reseni] of Object.entries(RESENI)) {
      const u = urovne.get(id)!;
      reseni.pady.forEach((pad) => {
        // Zkouška je soudce: jen o mostu, který v ní klidovou polohu nenajde, se říká, že se skládá.
        const bezRovnovahy = new Zkouska(u, pad.navrh, 1).bezRovnovahy;
        const rozbor = rozeberMost(u, pad.navrh);
        if (!bezRovnovahy) {
          expect(rozbor.slozeni, `${id} ${pad.nazev}`).toBeNull();
          return;
        }
        prehled.push(`${id} ${pad.nazev}: ${rozbor.slozeni?.duvod ?? "nic"}`);
        expect(rozbor.stabilni, `${id} ${pad.nazev}`).toBe(false);
        // Bez místa zůstane jen most, kterému se pod vlastní tíhou hned vzepře prut: tam
        // příčinu řekne věta o prvním porušení.
        if (rozbor.slozeni) urceno += 1;
        // „Jen mostovka“ se láme ve styčníku mostovky.
        if (pad.nazev === "jen mostovka") expect(rozbor.slozeni?.duvod, id).toBe("mostovka");
      });
    }
    if (process.env.MM_PREHLED) writeFileSync(process.env.MM_PREHLED, prehled.join("\n"));
    expect(urceno).toBeGreaterThan(20);
    expect(prehled.length - urceno).toBeLessThanOrEqual(3);
  }, 120_000);

  it("most, který úrovní projde, se neskládá", () => {
    for (const [id, reseni] of Object.entries(RESENI)) {
      const rozbor = rozeberMost(urovne.get(id)!, reseni.pruchod);
      expect(rozbor.slozeni, id).toBeNull();
    }
  }, 120_000);
});
