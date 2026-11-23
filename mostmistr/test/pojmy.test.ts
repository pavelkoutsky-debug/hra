// Slovníček pojmů: které slovo v textu se pozná jako pojem.
import { describe, expect, it } from "vitest";
import { najdiPojem, POJMY } from "../src/ui/pojmy";
import { TEXTY } from "../src/ui/slovnik";

const pojemV = (text: string, jazyk: "cs" | "en" = "cs"): string | null => {
  const nalez = najdiPojem(text, jazyk);
  return nalez ? `${nalez.pojem}:${text.slice(nalez.od, nalez.od + nalez.delka)}` : null;
};

describe("slovníček pojmů", () => {
  it("každý pojem má název a vysvětlení v obou jazycích", () => {
    for (const pojem of POJMY) {
      for (const jazyk of ["cs", "en"] as const) {
        const texty = TEXTY[jazyk] as Record<string, string | undefined>;
        expect(texty[`pojem.${pojem}`], `${jazyk} ${pojem}`).toBeTruthy();
        expect(texty[`pojem.${pojem}.text`], `${jazyk} ${pojem}`).toBeTruthy();
      }
    }
  });

  it("pozná pojem v českém textu i ve skloňovaném tvaru", () => {
    expect(pojemV("Horní pás nízké příhrady je silně tlačený.")).toBe("pas:Horní pás");
    expect(pojemV("Těžký profil ve vzpěru vydrží desetkrát víc.")).toBe("vzper:ve vzpěru");
    expect(pojemV("Prut 6 povolil vzpěrem.")).toBe("vzper:vzpěrem");
    expect(pojemV("tomu se říká vzpěr.")).toBe("vzper:vzpěr");
    expect(pojemV("Největší využití 85 %.")).toBe("vyuziti:využití");
    expect(pojemV("Trefuje se do 1. vlastní frekvence mostu.")).toBe("vlastni-frekvence:vlastní frekvence");
    expect(pojemV("Nalaď laděný tlumič na takt kapely.")).toBe("ladeny-tlumic:laděný tlumič");
  });

  it("nesplete si vzpěr se vzpěrou ani kloub s plastickým kloubem", () => {
    expect(pojemV("Vzpěra z kotvy je kratší.")).toBeNull();
    expect(pojemV("Opři o ně vzpěradla.")).toBeNull();
    expect(pojemV("takové místo označí prstenec, plastický kloub.")).toBe("plasticky-kloub:plastický kloub");
    expect(pojemV("Mostovka má uprostřed kloub.")).toBe("kloub:kloub");
    // Slovo, které pojmem jen začíná, pojem není.
    expect(pojemV("Svařený styčník se neohne.")).toBeNull();
    expect(pojemV("Rezonanční křivka.")).toBeNull();
  });

  it("pozná pojem v anglickém textu", () => {
    expect(pojemV("that is called buckling.", "en")).toBe("vzper:buckling");
    expect(pojemV("a ring, a plastic hinge.", "en")).toBe("plasticky-kloub:plastic hinge");
    expect(pojemV("The top chord of a low truss is in compression.", "en")).toBe("pas:top chord");
    expect(pojemV("New here is the tuned mass damper.", "en")).toBe("ladeny-tlumic:tuned mass damper");
    expect(pojemV("Too much for a single span.", "en")).toBe("rozpeti:span");
    expect(pojemV("The Spanish train.", "en")).toBeNull();
  });

  it("pojem, který už v textu označený je, se přeskočí a najde se další", () => {
    const text = "Horní pás ve vzpěru: pás vybočí.";
    expect(najdiPojem(text, "cs", new Set(["pas"]))?.pojem).toBe("vzper");
    expect(najdiPojem(text, "cs", new Set(["pas", "vzper"]))).toBeNull();
  });
});
