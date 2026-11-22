// Vlastní tíha na skutečném mostě: momenty svařené mostovky rámu 4-02 proti rámové teorii.
// Nezávislá kontrola fyziky M4b našla, že s tíhou soustředěnou jen do styčníků vycházely
// podporové momenty o 6 % menší; od verze fyziky 6 působí tíha po délce prutu.
import { describe, expect, it } from "vitest";
import { vlastnostiPrutu } from "../src/data/katalog";
import { spoctiSily, TIHOVE_ZRYCHLENI as g } from "../src/jadro/integrator";
import { sestavSoustavu } from "../src/jadro/soustava";
import { volneStupne } from "../src/jadro/stupne";
import { najdiKlid } from "../src/jadro/ustaleni";
import { momentNaKonciA, momentNaKonciB } from "../src/jadro/zatizeni";
import { sestavMost } from "../src/zkouska/stavba";
import { nactiKampan } from "../urovne/index";
import { RESENI } from "../urovne/reseni";

describe("vlastní tíha svařené mostovky", () => {
  it("rám 4-02: momenty nad pilíři odpovídají deformační metodě se spojitým zatížením", () => {
    const uroven = nactiKampan().find((u) => u.id === "4-02")!;
    const navrh = RESENI["4-02"]!.mistrovska!;
    const s = sestavSoustavu(sestavMost(uroven, navrh).popis);
    expect(najdiKlid(s, volneStupne(s), g)).toBe(true);
    spoctiSily(s, g, 0);

    // Čtyři pole po 12 m, mostovka svařená s hlavami pilířů vysokých 8 m, kraje na kloubech.
    // Ze souměrnosti se střední styčník nenatočí; neznámé je natočení nad krajním pilířem.
    const mostovka = vlastnostiPrutu("mostovka-ocelobeton", uroven.sirkaMostovky)!;
    const pilir = vlastnostiPrutu("pilir", uroven.sirkaMostovky)!;
    const q = (mostovka.hmotnostNaMetr + uroven.hmotnostVybaveni) * g;
    const L = 12;
    const h = 8;
    const fi = (12 * pilir.EI) / (pilir.GAs * h * h);
    const tuhostPilire = ((pilir.EI / h) * (4 + fi)) / (1 + fi);
    const natoceni = -((q * L * L) / 8 - (q * L * L) / 12) / ((7 * mostovka.EI) / L + tuhostPilire);
    const teorie: Record<string, number> = {
      "12-": -(((3 * mostovka.EI) / L) * natoceni + (q * L * L) / 8),
      "12+": ((4 * mostovka.EI) / L) * natoceni - (q * L * L) / 12,
      "24-": -(((2 * mostovka.EI) / L) * natoceni + (q * L * L) / 12),
    };

    // Skutečné momenty na koncích prvků mostovky u pilířů.
    const simulace: Record<string, number> = {};
    for (let e = 0; e < s.pocetPrvku; e++) {
      if (navrh.pruty[s.prut[e]!]?.prvek !== "mostovka-ocelobeton") continue;
      simulace[`${Math.round(s.x[s.prvekA[e]!]!)}+`] = momentNaKonciA(s, e);
      simulace[`${Math.round(s.x[s.prvekB[e]!]!)}-`] = momentNaKonciB(s, e);
    }
    for (const [misto, moment] of Object.entries(teorie)) {
      // Teorie zanedbává smyk mostovky a stlačení pilířů; na procento to nevadí.
      expect(simulace[misto]! / moment, `x = ${misto}`).toBeGreaterThan(0.99);
      expect(simulace[misto]! / moment, `x = ${misto}`).toBeLessThan(1.01);
      // Záporný moment: nad pilířem je mostovka tažená nahoře.
      expect(simulace[misto]!).toBeLessThan(-400_000);
    }
  });
});
